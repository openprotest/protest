using System.Buffers.Binary;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Threading;

namespace Protest.Protocols;

internal static partial class Rtsp {

    private const int MAX_FRAME_LENGTH = 8 * 1024 * 1024; //a 4K key frame is a few megabytes
    private const int MAX_NAL_UNITS = 1_024;              //per access unit, a 4K frame is rarely cut in more than a few dozen slices
    private const int MAX_JPEG_TABLES_LENGTH = 256;       //two tables of 64 16-bit values

    internal struct RtpPacket {
        public bool marker;
        public byte payloadType;
        public ushort sequence;
        public uint timestamp;
        public ArraySegment<byte> payload;

        public static bool TryParse(ArraySegment<byte> data, out RtpPacket packet) {
            packet = default;

            ReadOnlySpan<byte> span = data;
            if (span.Length < 12 || span[0] >> 6 != 2) return false;

            int offset = 12 + (span[0] & 0x0F) * 4; //contributing sources

            if ((span[0] & 0x10) != 0) { //header extension
                if (span.Length < offset + 4) return false;
                offset += 4 + (span[offset + 2] << 8 | span[offset + 3]) * 4;
            }

            int end = span.Length;
            if ((span[0] & 0x20) != 0) { //padding
                end -= span[^1];
            }

            if (end < offset) return false;

            packet.marker      = (span[1] & 0x80) != 0;
            packet.payloadType = (byte)(span[1] & 0x7F);
            packet.sequence    = BinaryPrimitives.ReadUInt16BigEndian(span[2..]);
            packet.timestamp   = BinaryPrimitives.ReadUInt32BigEndian(span[4..]);
            packet.payload     = data.Slice(offset, end - offset);
            return true;
        }
    }

    internal sealed class Frame {
        public byte[] data;
        public bool key;
        public uint timestamp;
        public string codec; //the decoder's configuration, on key frames
    }

    internal abstract class Depacketizer {
        private int expectedSequence = -1;
        private int latePackets;
        private long lostPackets;
        private long droppedFrames;

        //written by the receive loop only
        public long LostPackets => Volatile.Read(ref lostPackets);
        public long DroppedFrames => Volatile.Read(ref droppedFrames);

        protected void CountDroppedFrame() => Volatile.Write(ref droppedFrames, droppedFrames + 1);

        public static Depacketizer Create(Track track) => track.codec switch {
            "H264" => new H264Depacketizer(track.fmtp),
            "H265" => new H265Depacketizer(track.fmtp),
            _      => new JpegDepacketizer(track.width, track.height)
        };

        public void Push(RtpPacket packet, List<Frame> output) {
            bool lost = false;

            if (expectedSequence >= 0 && packet.sequence != expectedSequence) {
                //a packet from before the expected one came late or twice, unless the sender restarted its sequence
                if ((ushort)(packet.sequence - expectedSequence) >= 0x8000 && ++latePackets <= 16) return;
                lost = true;
                Volatile.Write(ref lostPackets, lostPackets + (ushort)(packet.sequence - expectedSequence));
            }

            latePackets = 0;
            expectedSequence = (ushort)(packet.sequence + 1);
            Process(packet, lost, output);
        }

        protected abstract void Process(RtpPacket packet, bool lost, List<Frame> output);

        //base64 values separated by commas, the padding is optional
        protected static List<byte[]> DecodeParameterSets(string value) {
            List<byte[]> sets = new List<byte[]>();
            if (String.IsNullOrEmpty(value)) return sets;

            foreach (string item in value.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)) {
                string padded = item.PadRight(item.Length + (4 - item.Length % 4) % 4, '=');
                byte[] buffer = new byte[padded.Length];
                if (Convert.TryFromBase64String(padded, buffer, out int written) && written > 0) {
                    sets.Add(buffer[..written]);
                }
            }

            return sets;
        }
    }

    //Gathers the NAL units of an access unit, the packets that share a timestamp up to the one with the marker bit,
    //and forwards it in Annex B format. Key frames carry the parameter sets, so the decoder can start on any of them.
    //After a loss, frames are held back up to the next key frame, a frozen picture rather than a smeared one.
    internal abstract class NalDepacketizer : Depacketizer {
        private static readonly byte[] START_CODE = { 0, 0, 0, 1 };

        private readonly List<byte[]> nalUnits = new List<byte[]>();
        private readonly MemoryStream fragment = new MemoryStream();
        private int length;
        private bool fragmenting;
        private bool corrupt;
        private bool waitingForKey = true;
        private bool hasTimestamp;
        private uint timestamp;

        protected abstract int NalType(byte[] nal);
        protected abstract bool IsPicture(int type);
        protected abstract bool IsKey(int type);
        protected abstract bool IsDelimiter(int type);
        protected abstract bool IsParameterSet(int type);
        protected abstract bool IsFiller(int type);
        protected abstract void Observe(int type, byte[] nal);
        protected abstract List<byte[]> ParameterSets { get; } //in decoding order
        protected abstract bool HasParameterSets { get; }
        protected abstract string Codec { get; }
        protected abstract void Depacketize(ReadOnlySpan<byte> payload);

        protected override void Process(RtpPacket packet, bool lost, List<Frame> output) {
            if (lost) { //the access unit in progress misses a part, or the next one does if none is
                corrupt = true;
                fragmenting = false;
            }

            if (hasTimestamp && packet.timestamp != timestamp) Flush(output); //the marker went missing

            timestamp = packet.timestamp;
            hasTimestamp = true;

            Depacketize(packet.payload);

            if (packet.marker) Flush(output);
        }

        protected void MarkCorrupt() => corrupt = true;

        protected void AddNalUnit(ReadOnlySpan<byte> nal) {
            if (nal.IsEmpty) return;

            //the forbidden bit is set in damaged or encrypted data, never in a NAL unit
            if ((nal[0] & 0x80) != 0 || length + nal.Length > MAX_FRAME_LENGTH || nalUnits.Count >= MAX_NAL_UNITS) {
                corrupt = true;
                return;
            }

            nalUnits.Add(nal.ToArray());
            length += nal.Length;
        }

        protected void AddNalUnit(ReadOnlySpan<byte> header, ReadOnlySpan<byte> body) {
            byte[] nal = new byte[header.Length + body.Length];
            header.CopyTo(nal);
            body.CopyTo(nal.AsSpan(header.Length));
            AddNalUnit(nal);
        }

        protected void StartFragment(ReadOnlySpan<byte> header, ReadOnlySpan<byte> data, bool end) {
            if (fragmenting) corrupt = true; //the previous one never ended

            fragment.SetLength(0);
            fragment.Write(header);
            fragment.Write(data);
            fragmenting = !end;

            if (end) AddNalUnit(fragment.GetBuffer().AsSpan(0, (int)fragment.Length));
        }

        protected void ContinueFragment(ReadOnlySpan<byte> data, bool end) {
            if (!fragmenting) { //its start was lost
                corrupt = true;
                return;
            }

            if (fragment.Length + data.Length > MAX_FRAME_LENGTH) {
                corrupt = true;
                fragmenting = false;
                return;
            }

            fragment.Write(data);

            if (end) {
                fragmenting = false;
                AddNalUnit(fragment.GetBuffer().AsSpan(0, (int)fragment.Length));
            }
        }

        private void Flush(List<Frame> output) {
            hasTimestamp = false;

            if (fragmenting) {
                corrupt = true;
                fragmenting = false;
            }

            bool picture = false, key = false;
            foreach (byte[] nal in nalUnits) {
                int type = NalType(nal);
                Observe(type, nal);
                picture |= IsPicture(type);
                key |= IsKey(type);
            }

            if (corrupt) {
                waitingForKey = true;
                CountDroppedFrame();
            }
            else if (picture) { //parameter sets on their own wait for the picture that uses them
                if (key) waitingForKey = !HasParameterSets;

                if (waitingForKey) {
                    CountDroppedFrame();
                }
                else {
                    output.Add(new Frame {
                        data      = ToAnnexB(key),
                        key       = key,
                        timestamp = timestamp,
                        codec     = key ? Codec : null
                    });
                }
            }

            nalUnits.Clear();
            length = 0;
            corrupt = false;
        }

        private byte[] ToAnnexB(bool key) {
            List<byte[]> units = nalUnits;

            if (key) { //the parameter sets the access unit lacks go after its delimiter
                units = new List<byte[]>(nalUnits.Count + 3);

                int first = 0;
                if (IsDelimiter(NalType(nalUnits[0]))) {
                    units.Add(nalUnits[0]);
                    first = 1;
                }

                HashSet<int> present = new HashSet<int>();
                foreach (byte[] nal in nalUnits) {
                    int type = NalType(nal);
                    if (IsParameterSet(type)) present.Add(type);
                }

                foreach (byte[] set in ParameterSets) {
                    if (!present.Contains(NalType(set))) units.Add(set);
                }

                for (int i = first; i < nalUnits.Count; i++) {
                    units.Add(nalUnits[i]);
                }
            }

            int size = 0;
            foreach (byte[] nal in units) {
                if (!IsFiller(NalType(nal))) size += START_CODE.Length + nal.Length;
            }

            byte[] data = new byte[size];
            int offset = 0;
            foreach (byte[] nal in units) {
                if (IsFiller(NalType(nal))) continue;
                START_CODE.CopyTo(data, offset);
                offset += START_CODE.Length;
                nal.CopyTo(data, offset);
                offset += nal.Length;
            }

            return data;
        }

        internal static byte[] RemoveEmulationPrevention(byte[] nal, int maxLength) {
            List<byte> rbsp = new List<byte>(Math.Min(nal.Length, maxLength));
            int zeros = 0;

            for (int i = 0; i < nal.Length && rbsp.Count < maxLength; i++) {
                if (zeros >= 2 && nal[i] == 0x03) {
                    zeros = 0;
                    continue;
                }
                rbsp.Add(nal[i]);
                zeros = nal[i] == 0 ? zeros + 1 : 0;
            }

            return rbsp.ToArray();
        }
    }

    //RFC 6184, in single NAL unit and non-interleaved mode
    internal sealed class H264Depacketizer : NalDepacketizer {
        private static readonly HashSet<int> PROFILES = new HashSet<int> { 44, 66, 77, 83, 86, 88, 100, 110, 118, 122, 128, 134, 135, 138, 139, 144, 244 };
        private static readonly HashSet<int> LEVELS = new HashSet<int> { 9, 10, 11, 12, 13, 20, 21, 22, 30, 31, 32, 40, 41, 42, 50, 51, 52, 60, 61, 62 };

        private byte[] sps, pps;

        public H264Depacketizer(Dictionary<string, string> fmtp) {
            if (fmtp is not null && fmtp.TryGetValue("sprop-parameter-sets", out string sets)) {
                foreach (byte[] nal in DecodeParameterSets(sets)) {
                    Observe(NalType(nal), nal);
                }
            }
        }

        protected override int NalType(byte[] nal) => nal[0] & 0x1F;
        protected override bool IsPicture(int type) => type is >= 1 and <= 5;
        protected override bool IsKey(int type) => type == 5; //IDR
        protected override bool IsDelimiter(int type) => type == 9;
        protected override bool IsParameterSet(int type) => type is 7 or 8;
        protected override bool IsFiller(int type) => type == 12;

        protected override void Observe(int type, byte[] nal) {
            if (type == 7) {
                if (IsPlausibleSps(nal)) sps = nal;
            }
            else if (type == 8) {
                pps = nal;
            }
        }

        //a defined profile and level with the reserved bits clear, so a damaged SPS doesn't become the decoder's configuration
        internal static bool IsPlausibleSps(byte[] nal) =>
            nal.Length >= 4 && PROFILES.Contains(nal[1]) && (nal[2] & 0x03) == 0 && LEVELS.Contains(nal[3]);

        protected override List<byte[]> ParameterSets {
            get {
                List<byte[]> sets = new List<byte[]>(2);
                if (sps is not null) sets.Add(sps);
                if (pps is not null) sets.Add(pps);
                return sets;
            }
        }

        protected override bool HasParameterSets => sps is not null && pps is not null;

        //avc1.PPCCLL, the profile, constraint flags and level, as they open the SPS
        protected override string Codec => sps is { Length: >= 4 } ? $"avc1.{sps[1]:x2}{sps[2]:x2}{sps[3]:x2}" : null;

        protected override void Depacketize(ReadOnlySpan<byte> payload) {
            if (payload.IsEmpty) return;

            switch (payload[0] & 0x1F) {
            case 24: //STAP-A, several NAL units
                for (int offset = 1; offset + 2 <= payload.Length;) {
                    int size = payload[offset] << 8 | payload[offset + 1];
                    offset += 2;
                    if (size == 0) break;
                    if (offset + size > payload.Length) {
                        MarkCorrupt();
                        break;
                    }
                    AddNalUnit(payload.Slice(offset, size));
                    offset += size;
                }
                break;

            case 28: { //FU-A, a fragment of a NAL unit
                if (payload.Length < 2) return;
                bool start = (payload[1] & 0x80) != 0;
                bool end = (payload[1] & 0x40) != 0;
                if (start) {
                    byte header = (byte)(payload[0] & 0xE0 | payload[1] & 0x1F);
                    StartFragment(new[] { header }, payload[2..], end);
                }
                else {
                    ContinueFragment(payload[2..], end);
                }
                break;
            }

            case 0:
            case 25: //STAP-B, MTAP and FU-B belong to the interleaved mode
            case 26:
            case 27:
            case 29:
            case 30:
            case 31:
                break;

            default: //a single NAL unit
                AddNalUnit(payload);
                break;
            }
        }
    }

    //RFC 7798
    internal sealed class H265Depacketizer : NalDepacketizer {
        private byte[] vps, sps, pps;
        private readonly bool donl;

        public H265Depacketizer(Dictionary<string, string> fmtp) {
            if (fmtp is null) return;

            foreach (string name in new[] { "sprop-vps", "sprop-sps", "sprop-pps" }) {
                if (!fmtp.TryGetValue(name, out string sets)) continue;
                foreach (byte[] nal in DecodeParameterSets(sets)) {
                    Observe(NalType(nal), nal);
                }
            }

            //decoding order numbers precede the NAL units when the sender may reorder them
            donl = fmtp.TryGetValue("sprop-max-don-diff", out string maxDonDiff) && int.TryParse(maxDonDiff, out int diff) && diff > 0
                || fmtp.TryGetValue("sprop-depack-buf-nalus", out string bufferNalus) && int.TryParse(bufferNalus, out int nalus) && nalus > 0;
        }

        protected override int NalType(byte[] nal) => nal[0] >> 1 & 0x3F;
        protected override bool IsPicture(int type) => type <= 31;
        protected override bool IsKey(int type) => type is >= 16 and <= 23; //IRAP
        protected override bool IsDelimiter(int type) => type == 35;
        protected override bool IsParameterSet(int type) => type is >= 32 and <= 34;
        protected override bool IsFiller(int type) => type == 38;

        protected override void Observe(int type, byte[] nal) {
            switch (type) {
            case 32: vps = nal; break;
            case 33: if (CodecString(nal) is not null) sps = nal; break;
            case 34: pps = nal; break;
            }
        }

        protected override List<byte[]> ParameterSets {
            get {
                List<byte[]> sets = new List<byte[]>(3);
                if (vps is not null) sets.Add(vps);
                if (sps is not null) sets.Add(sps);
                if (pps is not null) sets.Add(pps);
                return sets;
            }
        }

        protected override bool HasParameterSets => vps is not null && sps is not null && pps is not null;

        protected override string Codec => sps is null ? null : CodecString(sps);

        //hev1.[profile space][profile].[compatibility flags, bit reversed].[tier][level].[constraint flags], ISO/IEC 14496-15 annex E,
        //from the general profile_tier_level at the start of the SPS
        internal static string CodecString(byte[] sps) {
            byte[] rbsp = RemoveEmulationPrevention(sps, 15);
            if (rbsp.Length < 15) return null;

            int profileSpace = rbsp[3] >> 6;
            bool highTier = (rbsp[3] & 0x20) != 0;
            int profile = rbsp[3] & 0x1F;
            if (profile is 0 or > 11) return null; //not a defined profile, a damaged SPS
            uint compatibility = BinaryPrimitives.ReadUInt32BigEndian(rbsp.AsSpan(4));
            int level = rbsp[14];

            uint reversed = 0;
            for (int i = 0; i < 32; i++) {
                reversed = reversed << 1 | compatibility >> i & 1;
            }

            StringBuilder builder = new StringBuilder("hev1.");
            if (profileSpace > 0) builder.Append((char)('A' + profileSpace - 1));
            builder.Append(profile).Append('.').Append(reversed.ToString("X")).Append('.').Append(highTier ? 'H' : 'L').Append(level);

            int last = 13;
            while (last >= 8 && rbsp[last] == 0) last--;
            for (int i = 8; i <= last; i++) {
                builder.Append('.').Append(rbsp[i].ToString("X2"));
            }

            return builder.ToString();
        }

        protected override void Depacketize(ReadOnlySpan<byte> payload) {
            if (payload.Length < 3) return;

            switch (payload[0] >> 1 & 0x3F) {
            case 48: { //aggregation packet
                int offset = donl ? 4 : 2;
                for (bool first = true; offset + 2 <= payload.Length; first = false) {
                    if (!first && donl) {
                        offset++; //decoding order number difference
                        if (offset + 2 > payload.Length) break;
                    }

                    int size = payload[offset] << 8 | payload[offset + 1];
                    offset += 2;
                    if (size == 0) break;
                    if (offset + size > payload.Length) {
                        MarkCorrupt();
                        break;
                    }
                    AddNalUnit(payload.Slice(offset, size));
                    offset += size;
                }
                break;
            }

            case 49: { //fragmentation unit
                byte fuHeader = payload[2];
                bool start = (fuHeader & 0x80) != 0;
                bool end = (fuHeader & 0x40) != 0;
                if (start) {
                    int dataOffset = donl ? 5 : 3;
                    if (payload.Length < dataOffset) return;
                    byte[] header = { (byte)(payload[0] & 0x81 | (fuHeader & 0x3F) << 1), payload[1] };
                    StartFragment(header, payload[dataOffset..], end);
                }
                else {
                    ContinueFragment(payload[3..], end);
                }
                break;
            }

            case 50: //PACI
                break;

            default: //a single NAL unit
                if (!donl) {
                    AddNalUnit(payload);
                }
                else if (payload.Length > 4) {
                    AddNalUnit(payload[..2], payload[4..]);
                }
                break;
            }
        }
    }

    //RFC 2435. The packets carry the entropy coded scan, along with the parameters the JPEG headers are rebuilt from.
    internal sealed class JpegDepacketizer : Depacketizer {
        private static readonly byte[] ZIGZAG = {
             0,  1,  8, 16,  9,  2,  3, 10,
            17, 24, 32, 25, 18, 11,  4,  5,
            12, 19, 26, 33, 40, 48, 41, 34,
            27, 20, 13,  6,  7, 14, 21, 28,
            35, 42, 49, 56, 57, 50, 43, 36,
            29, 22, 15, 23, 30, 37, 44, 51,
            58, 59, 52, 45, 38, 31, 39, 46,
            53, 60, 61, 54, 47, 55, 62, 63
        };

        //tables K.1 and K.2 of the JPEG specification, in natural order
        private static readonly byte[] LUMA_QUANTIZER = {
            16, 11, 10, 16,  24,  40,  51,  61,
            12, 12, 14, 19,  26,  58,  60,  55,
            14, 13, 16, 24,  40,  57,  69,  56,
            14, 17, 22, 29,  51,  87,  80,  62,
            18, 22, 37, 56,  68, 109, 103,  77,
            24, 35, 55, 64,  81, 104, 113,  92,
            49, 64, 78, 87, 103, 121, 120, 101,
            72, 92, 95, 98, 112, 100, 103,  99
        };

        private static readonly byte[] CHROMA_QUANTIZER = {
            17, 18, 24, 47, 99, 99, 99, 99,
            18, 21, 26, 66, 99, 99, 99, 99,
            24, 26, 56, 99, 99, 99, 99, 99,
            47, 66, 99, 99, 99, 99, 99, 99,
            99, 99, 99, 99, 99, 99, 99, 99,
            99, 99, 99, 99, 99, 99, 99, 99,
            99, 99, 99, 99, 99, 99, 99, 99,
            99, 99, 99, 99, 99, 99, 99, 99
        };

        //the Huffman tables of section K.3
        internal static readonly byte[] LUMA_DC_CODES   = { 0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0 };
        internal static readonly byte[] LUMA_DC_SYMBOLS = { 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11 };
        internal static readonly byte[] LUMA_AC_CODES   = { 0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d };
        internal static readonly byte[] LUMA_AC_SYMBOLS = {
            0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12,
            0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07,
            0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08,
            0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0,
            0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16,
            0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28,
            0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39,
            0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49,
            0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
            0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69,
            0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79,
            0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
            0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98,
            0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7,
            0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6,
            0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5,
            0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4,
            0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2,
            0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea,
            0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8,
            0xf9, 0xfa
        };

        internal static readonly byte[] CHROMA_DC_CODES   = { 0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0 };
        internal static readonly byte[] CHROMA_DC_SYMBOLS = { 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11 };
        internal static readonly byte[] CHROMA_AC_CODES   = { 0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 0x77 };
        internal static readonly byte[] CHROMA_AC_SYMBOLS = {
            0x00, 0x01, 0x02, 0x03, 0x11, 0x04, 0x05, 0x21,
            0x31, 0x06, 0x12, 0x41, 0x51, 0x07, 0x61, 0x71,
            0x13, 0x22, 0x32, 0x81, 0x08, 0x14, 0x42, 0x91,
            0xa1, 0xb1, 0xc1, 0x09, 0x23, 0x33, 0x52, 0xf0,
            0x15, 0x62, 0x72, 0xd1, 0x0a, 0x16, 0x24, 0x34,
            0xe1, 0x25, 0xf1, 0x17, 0x18, 0x19, 0x1a, 0x26,
            0x27, 0x28, 0x29, 0x2a, 0x35, 0x36, 0x37, 0x38,
            0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48,
            0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58,
            0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68,
            0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78,
            0x79, 0x7a, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87,
            0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96,
            0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5,
            0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4,
            0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3,
            0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2,
            0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda,
            0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9,
            0xea, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8,
            0xf9, 0xfa
        };

        private readonly MemoryStream scan = new MemoryStream();
        private readonly Dictionary<int, byte[]> qualityTables = new Dictionary<int, byte[]>(); //by Q, 128 to 254 arrive in band once
        private readonly int sdpWidth, sdpHeight;
        private bool started, corrupt, hasTimestamp;
        private uint timestamp;
        private int type, width, height, restartInterval, precision;
        private byte[] tables;

        public JpegDepacketizer(int width, int height) {
            sdpWidth = width;
            sdpHeight = height;
        }

        protected override void Process(RtpPacket packet, bool lost, List<Frame> output) {
            if (lost) corrupt = true;
            if (hasTimestamp && packet.timestamp != timestamp) Flush(output); //the marker went missing

            timestamp = packet.timestamp;
            hasTimestamp = true;

            ReadOnlySpan<byte> payload = packet.payload;
            if (payload.Length < 8) {
                corrupt = true;
                return;
            }

            int fragmentOffset = payload[1] << 16 | payload[2] << 8 | payload[3];
            int offset = 8;
            int dri = 0;

            if (payload[4] is >= 64 and <= 127) { //restart marker header
                if (payload.Length < offset + 4) {
                    corrupt = true;
                    return;
                }
                dri = payload[offset] << 8 | payload[offset + 1];
                offset += 4;
            }

            if (fragmentOffset == 0) {
                scan.SetLength(0);
                started = true;
                corrupt = false; //the frame starts here, a loss before belongs to the previous one

                type = payload[4];
                width = payload[6] * 8;
                height = payload[7] * 8;
                if (width == 0) width = sdpWidth; //past 2040 pixels the size is only in the SDP
                if (height == 0) height = sdpHeight;
                restartInterval = dri;

                int quality = payload[5];
                if (quality >= 128) { //quantization table header
                    if (payload.Length < offset + 4) {
                        corrupt = true;
                        return;
                    }

                    precision = payload[offset + 1];
                    int tablesLength = payload[offset + 2] << 8 | payload[offset + 3];
                    offset += 4;

                    if (tablesLength > 0) {
                        if (tablesLength > MAX_JPEG_TABLES_LENGTH || payload.Length < offset + tablesLength) {
                            corrupt = true;
                            return;
                        }
                        tables = payload.Slice(offset, tablesLength).ToArray();
                        offset += tablesLength;
                        if (quality < 255) qualityTables[quality] = tables;
                    }
                    else if (!qualityTables.TryGetValue(quality, out tables)) {
                        corrupt = true;
                    }
                }
                else {
                    precision = 0;
                    if (!qualityTables.TryGetValue(quality, out tables)) {
                        qualityTables[quality] = tables = MakeTables(quality);
                    }
                }
            }
            else if (!started) { //joined in the middle of a frame
                return;
            }

            if (fragmentOffset != scan.Length || scan.Length + payload.Length - offset > MAX_FRAME_LENGTH) {
                corrupt = true;
            }
            else {
                scan.Write(payload[offset..]);
            }

            if (packet.marker) Flush(output);
        }

        private void Flush(List<Frame> output) {
            hasTimestamp = false;

            byte[] jpeg = null;
            if (started && !corrupt && scan.Length > 0 && tables is not null && width > 0 && height > 0) {
                jpeg = BuildJpeg(type, width, height, tables, precision, restartInterval, scan.GetBuffer().AsSpan(0, (int)scan.Length));
            }

            if (jpeg is not null) {
                output.Add(new Frame { data = jpeg, key = true, timestamp = timestamp, codec = "jpeg" });
            }
            else if (started || corrupt) {
                CountDroppedFrame();
            }

            scan.SetLength(0);
            started = false;
            corrupt = false;
        }

        //RFC 2435 appendix A, the luma and the chroma table for a Q factor, in zig-zag order
        internal static byte[] MakeTables(int quality) {
            int factor = Math.Clamp(quality, 1, 99);
            int scale = quality < 50 ? 5000 / factor : 200 - factor * 2;

            byte[] tables = new byte[128];
            for (int i = 0; i < 64; i++) {
                tables[i]      = (byte)Math.Clamp((LUMA_QUANTIZER[ZIGZAG[i]] * scale + 50) / 100, 1, 255);
                tables[64 + i] = (byte)Math.Clamp((CHROMA_QUANTIZER[ZIGZAG[i]] * scale + 50) / 100, 1, 255);
            }
            return tables;
        }

        //RFC 2435 appendix B
        internal static byte[] BuildJpeg(int type, int width, int height, byte[] tables, int precision, int restartInterval, ReadOnlySpan<byte> scan) {
            //a few cameras send whole images
            if (scan.Length >= 2 && scan[0] == 0xFF && scan[1] == 0xD8) return scan.ToArray();

            int lumaLength = (precision & 1) != 0 ? 128 : 64;
            int chromaLength = (precision & 2) != 0 ? 128 : 64;
            if (tables.Length < lumaLength) return null;

            bool hasChroma = tables.Length >= lumaLength + chromaLength;
            byte chromaTable = hasChroma ? (byte)1 : (byte)0;

            using MemoryStream ms = new MemoryStream(scan.Length + 1024);

            ms.Write([0xFF, 0xD8]); //start of image

            WriteQuantizationTable(ms, 0, tables.AsSpan(0, lumaLength));
            if (hasChroma) WriteQuantizationTable(ms, 1, tables.AsSpan(lumaLength, chromaLength));

            if (restartInterval > 0) {
                ms.Write([0xFF, 0xDD, 0x00, 0x04, (byte)(restartInterval >> 8), (byte)restartInterval]);
            }

            ms.Write([
                0xFF, 0xC0, 0x00, 17, 8, //baseline, 8 bit samples
                (byte)(height >> 8), (byte)height,
                (byte)(width >> 8), (byte)width,
                3,
                0, (type & 0x3F) == 0 ? (byte)0x21 : (byte)0x22, 0, //luma, 4:2:2 for type 0 and 4:2:0 for type 1
                1, 0x11, chromaTable,
                2, 0x11, chromaTable
            ]);

            WriteHuffmanTable(ms, 0x00, LUMA_DC_CODES, LUMA_DC_SYMBOLS);
            WriteHuffmanTable(ms, 0x10, LUMA_AC_CODES, LUMA_AC_SYMBOLS);
            WriteHuffmanTable(ms, 0x01, CHROMA_DC_CODES, CHROMA_DC_SYMBOLS);
            WriteHuffmanTable(ms, 0x11, CHROMA_AC_CODES, CHROMA_AC_SYMBOLS);

            ms.Write([0xFF, 0xDA, 0x00, 12, 3, 0, 0x00, 1, 0x11, 2, 0x11, 0, 63, 0]); //start of scan

            ms.Write(scan);

            if (scan.Length < 2 || scan[^2] != 0xFF || scan[^1] != 0xD9) {
                ms.Write([0xFF, 0xD9]); //end of image
            }

            return ms.ToArray();
        }

        private static void WriteQuantizationTable(MemoryStream ms, byte id, ReadOnlySpan<byte> table) {
            int length = 3 + table.Length;
            byte precision = table.Length == 128 ? (byte)0x10 : (byte)0x00;
            ms.Write([0xFF, 0xDB, (byte)(length >> 8), (byte)length, (byte)(precision | id)]);
            ms.Write(table);
        }

        private static void WriteHuffmanTable(MemoryStream ms, byte classAndId, byte[] codes, byte[] symbols) {
            int length = 3 + codes.Length + symbols.Length;
            ms.Write([0xFF, 0xC4, (byte)(length >> 8), (byte)length, classAndId]);
            ms.Write(codes);
            ms.Write(symbols);
        }
    }
}

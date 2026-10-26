using System.Buffers.Binary;
using System.Collections.Generic;
using System.IO;
using System.Text;

namespace Protest.Protocols;

internal static partial class Rtsp {

    private const int MAX_DIMENSION = 16_384;
    private const int MAX_PARAMETER_SETS = 16;   //of each type, in a configuration record
    private const int MAX_PARAMETER_SET_LENGTH = 65_535;

    internal sealed class SequenceParameters {
        public int profile;     //H.264 only, H.265 keeps its profile, tier and level as they are
        public int constraints;
        public int level;
        public byte[] profileTierLevel;
        public int chromaFormat = 1;
        public int lumaBitDepth = 8;
        public int chromaBitDepth = 8;
        public int temporalLayers = 1;
        public bool temporalIdNesting;
        public int width;
        public int height;
    }

    //what the browser's source buffer is set up with
    internal sealed class Mp4Configuration {
        public bool hevc;
        public string codec;
        public int width;
        public int height;
        public byte[] record; //avcC or hvcC

        public bool SameAs(Mp4Configuration other) =>
            other is not null && hevc == other.hevc && codec == other.codec && record.AsSpan().SequenceEqual(other.record);
    }

    //Fragmented MP4, for browsers that play the stream through Media Source Extensions because WebCodecs isn't there, as
    //over plain HTTP where it's only offered in secure contexts. The initialization segment carries the parameter sets
    //in an avcC or hvcC record, then every frame goes out as a fragment of its own, a moof and an mdat with the NAL units
    //length prefixed, so nothing waits for a group of pictures to fill up.
    internal sealed class Mp4Muxer {
        private const int TRACK_ID = 1;
        private const int MOOF_LENGTH = 100;
        private const int FRAGMENT_OVERHEAD = MOOF_LENGTH + 8; //and the mdat header
        private const uint KEY_SAMPLE_FLAGS = 0x02000000;      //depends on no other sample
        private const uint DELTA_SAMPLE_FLAGS = 0x01010000;    //depends on others, not a sync sample

        public readonly bool hevc;
        public readonly int timescale;
        public Mp4Configuration configuration; //the one the browser has, set once its initialization segment is out

        private readonly long maxDuration;
        private uint sequence;
        private bool started;
        private long lastTimestamp;
        private long nextDecodeTime;
        private uint lastDuration;

        public Mp4Muxer(bool hevc, int clockRate) {
            this.hevc = hevc;
            timescale = clockRate > 0 ? clockRate : 90_000;
            lastDuration = (uint)Math.Max(1, timescale / 30); //the first frame's, before there is a second one to tell
            maxDuration = timescale * 5L;
        }

        public byte[] InitializationSegment(Mp4Configuration configuration, int offset) =>
            Rtsp.InitializationSegment(configuration, timescale, offset);

        //A moof and an mdat after offset bytes left for the caller, and where the sample starts on the timeline.
        //Every sample starts where the one before it ended and lasts up to this frame's timestamp, so the timeline has no
        //gap to stall on, not even where frames were held back. A timestamp that steps back or leaps keeps the last duration.
        public byte[] Fragment(byte[] annexB, bool key, long timestamp, int offset, out long decodeTime) {
            if (started) {
                long delta = timestamp - lastTimestamp;
                if (delta > 0 && delta <= maxDuration) lastDuration = (uint)delta;
            }
            started = true;
            lastTimestamp = timestamp;

            decodeTime = nextDecodeTime;
            nextDecodeTime += lastDuration;
            sequence++;

            //the parameter sets are in the initialization segment
            List<(int offset, int length)> units = SplitAnnexB(annexB);
            int sampleLength = 0;
            foreach ((int start, int length) in units) {
                if (!IsOutOfBand(hevc, NalType(hevc, annexB[start]))) sampleLength += 4 + length;
            }

            byte[] data = new byte[offset + FRAGMENT_OVERHEAD + sampleLength];
            Span<byte> moof = data.AsSpan(offset);

            WriteBoxHeader(moof, MOOF_LENGTH, "moof"u8);

            WriteBoxHeader(moof[8..], 16, "mfhd"u8);
            BinaryPrimitives.WriteUInt32BigEndian(moof[20..], sequence);

            WriteBoxHeader(moof[24..], 76, "traf"u8);

            WriteBoxHeader(moof[32..], 16, "tfhd"u8);
            BinaryPrimitives.WriteUInt32BigEndian(moof[40..], 0x020000); //default-base-is-moof
            BinaryPrimitives.WriteUInt32BigEndian(moof[44..], TRACK_ID);

            WriteBoxHeader(moof[48..], 20, "tfdt"u8);
            BinaryPrimitives.WriteUInt32BigEndian(moof[56..], 0x01000000); //version 1, a 64 bit decode time
            BinaryPrimitives.WriteInt64BigEndian(moof[60..], decodeTime);

            WriteBoxHeader(moof[68..], 32, "trun"u8);
            BinaryPrimitives.WriteUInt32BigEndian(moof[76..], 0x000701); //data offset, sample duration, size and flags
            BinaryPrimitives.WriteUInt32BigEndian(moof[80..], 1);
            BinaryPrimitives.WriteUInt32BigEndian(moof[84..], FRAGMENT_OVERHEAD);
            BinaryPrimitives.WriteUInt32BigEndian(moof[88..], lastDuration);
            BinaryPrimitives.WriteUInt32BigEndian(moof[92..], (uint)sampleLength);
            BinaryPrimitives.WriteUInt32BigEndian(moof[96..], key ? KEY_SAMPLE_FLAGS : DELTA_SAMPLE_FLAGS);

            WriteBoxHeader(moof[MOOF_LENGTH..], (uint)(8 + sampleLength), "mdat"u8);

            int position = FRAGMENT_OVERHEAD;
            foreach ((int start, int length) in units) {
                if (IsOutOfBand(hevc, NalType(hevc, annexB[start]))) continue;
                BinaryPrimitives.WriteUInt32BigEndian(moof[position..], (uint)length);
                annexB.AsSpan(start, length).CopyTo(moof[(position + 4)..]);
                position += 4 + length;
            }

            return data;
        }

        private static void WriteBoxHeader(Span<byte> span, uint size, ReadOnlySpan<byte> type) {
            BinaryPrimitives.WriteUInt32BigEndian(span, size);
            type.CopyTo(span[4..]);
        }
    }

    private static int NalType(bool hevc, byte header) => hevc ? header >> 1 & 0x3F : header & 0x1F;

    //parameter sets, access unit delimiters and filler
    private static bool IsOutOfBand(bool hevc, int type) => hevc ? type is >= 32 and <= 35 or 38 : type is 7 or 8 or 9 or 12;

    //the offsets and lengths of the NAL units in an Annex B access unit
    internal static List<(int offset, int length)> SplitAnnexB(ReadOnlySpan<byte> data) {
        List<(int, int)> units = new List<(int, int)>();
        ReadOnlySpan<byte> startCode = [0, 0, 1];
        int start = -1;

        for (int position = 0; position < data.Length;) {
            int found = data[position..].IndexOf(startCode);
            if (found < 0) break;
            found += position;

            if (start >= 0) {
                int end = found;
                while (end > start && data[end - 1] == 0) end--; //a four byte start code, or trailing zeros, a NAL unit never ends in one
                if (end > start) units.Add((start, end - start));
            }

            start = found + 3;
            position = start;
        }

        if (start >= 0 && start < data.Length) units.Add((start, data.Length - start));
        return units;
    }

    //The parameter sets of a key frame as an avcC or hvcC record, with the codec string and the picture size from the
    //first sequence parameter set. Null when a set is missing or doesn't parse.
    internal static Mp4Configuration ReadConfiguration(byte[] annexB, bool hevc) {
        List<byte[]> vps = new List<byte[]>(), sps = new List<byte[]>(), pps = new List<byte[]>();

        foreach ((int offset, int length) in SplitAnnexB(annexB)) {
            List<byte[]> sets = (hevc, NalType(hevc, annexB[offset])) switch {
                (true, 32)  => vps,
                (true, 33)  => sps,
                (true, 34)  => pps,
                (false, 7)  => sps,
                (false, 8)  => pps,
                _           => null
            };

            if (sets is null || sets.Count >= MAX_PARAMETER_SETS || length > MAX_PARAMETER_SET_LENGTH) continue;

            ReadOnlySpan<byte> nal = annexB.AsSpan(offset, length);
            bool seen = false;
            foreach (byte[] set in sets) seen |= nal.SequenceEqual(set);
            if (!seen) sets.Add(nal.ToArray());
        }

        if (sps.Count == 0 || pps.Count == 0 || hevc && vps.Count == 0) return null;

        if (hevc) {
            SequenceParameters parameters = ParseHevcSps(sps[0]);
            string codec = H265Depacketizer.CodecString(sps[0]);
            if (parameters is null || codec is null) return null;

            return new Mp4Configuration {
                hevc   = true,
                codec  = $"hvc1{codec[4..]}", //the parameter sets are only in the record
                width  = parameters.width,
                height = parameters.height,
                record = HevcRecord(parameters, vps, sps, pps)
            };
        }
        else {
            SequenceParameters parameters = ParseAvcSps(sps[0]);
            if (parameters is null) return null;

            return new Mp4Configuration {
                hevc   = false,
                codec  = $"avc1.{parameters.profile:x2}{parameters.constraints:x2}{parameters.level:x2}",
                width  = parameters.width,
                height = parameters.height,
                record = AvcRecord(parameters, sps, pps)
            };
        }
    }

    //AVCDecoderConfigurationRecord, ISO/IEC 14496-15 5.3.3.1, with four byte lengths
    private static byte[] AvcRecord(SequenceParameters parameters, List<byte[]> sps, List<byte[]> pps) {
        using MemoryStream ms = new MemoryStream();
        ms.WriteByte(1);
        ms.WriteByte((byte)parameters.profile);
        ms.WriteByte((byte)parameters.constraints);
        ms.WriteByte((byte)parameters.level);
        ms.WriteByte(0xFF);
        ms.WriteByte((byte)(0xE0 | sps.Count));
        foreach (byte[] nal in sps) WriteParameterSet(ms, nal);
        ms.WriteByte((byte)pps.Count);
        foreach (byte[] nal in pps) WriteParameterSet(ms, nal);

        if (parameters.profile is 100 or 110 or 122 or 144) {
            ms.WriteByte((byte)(0xFC | parameters.chromaFormat));
            ms.WriteByte((byte)(0xF8 | (parameters.lumaBitDepth - 8)));
            ms.WriteByte((byte)(0xF8 | (parameters.chromaBitDepth - 8)));
            ms.WriteByte(0); //no SPS extensions
        }

        return ms.ToArray();
    }

    //HEVCDecoderConfigurationRecord, ISO/IEC 14496-15 8.3.3.1, with four byte lengths and every parameter set in it
    private static byte[] HevcRecord(SequenceParameters parameters, List<byte[]> vps, List<byte[]> sps, List<byte[]> pps) {
        using MemoryStream ms = new MemoryStream();
        ms.WriteByte(1);
        ms.Write(parameters.profileTierLevel);
        ms.Write([0xF0, 0x00]); //min_spatial_segmentation_idc, unknown
        ms.WriteByte(0xFC);     //parallelismType, unknown
        ms.WriteByte((byte)(0xFC | parameters.chromaFormat));
        ms.WriteByte((byte)(0xF8 | (parameters.lumaBitDepth - 8)));
        ms.WriteByte((byte)(0xF8 | (parameters.chromaBitDepth - 8)));
        ms.Write([0x00, 0x00]); //avgFrameRate, unknown
        ms.WriteByte((byte)(parameters.temporalLayers << 3 | (parameters.temporalIdNesting ? 0x04 : 0) | 0x03));
        ms.WriteByte(3);

        foreach ((int type, List<byte[]> sets) in new[] { (32, vps), (33, sps), (34, pps) }) {
            ms.WriteByte((byte)(0x80 | type)); //array_completeness
            ms.WriteByte(0);
            ms.WriteByte((byte)sets.Count);
            foreach (byte[] nal in sets) WriteParameterSet(ms, nal);
        }

        return ms.ToArray();
    }

    private static void WriteParameterSet(MemoryStream ms, byte[] nal) {
        ms.WriteByte((byte)(nal.Length >> 8));
        ms.WriteByte((byte)nal.Length);
        ms.Write(nal);
    }

    private static readonly HashSet<int> CHROMA_PROFILES = new HashSet<int> { 44, 83, 86, 100, 110, 118, 122, 128, 134, 135, 138, 139, 244 };

    //H.264 7.3.2.1.1, up to the frame cropping, null when it doesn't parse
    internal static SequenceParameters ParseAvcSps(byte[] sps) {
        byte[] rbsp = NalDepacketizer.RemoveEmulationPrevention(sps, MAX_PARAMETER_SET_LENGTH);
        if (rbsp.Length < 4) return null;

        try {
            BitReader reader = new BitReader(rbsp.AsSpan(1));
            SequenceParameters parameters = new SequenceParameters {
                profile     = (int)reader.Bits(8),
                constraints = (int)reader.Bits(8),
                level       = (int)reader.Bits(8)
            };

            reader.Ue(); //seq_parameter_set_id

            bool separateColourPlanes = false;
            if (CHROMA_PROFILES.Contains(parameters.profile)) {
                parameters.chromaFormat = (int)reader.Ue();
                if (parameters.chromaFormat > 3) return null;
                if (parameters.chromaFormat == 3) separateColourPlanes = reader.Bit() == 1;

                uint lumaBitDepth = reader.Ue();
                uint chromaBitDepth = reader.Ue();
                if (lumaBitDepth > 6 || chromaBitDepth > 6) return null;
                parameters.lumaBitDepth = (int)lumaBitDepth + 8;
                parameters.chromaBitDepth = (int)chromaBitDepth + 8;

                reader.Bit(); //qpprime_y_zero_transform_bypass_flag
                if (reader.Bit() == 1) { //seq_scaling_matrix_present_flag
                    int lists = parameters.chromaFormat != 3 ? 8 : 12;
                    for (int i = 0; i < lists; i++) {
                        if (reader.Bit() == 1) SkipScalingList(ref reader, i < 6 ? 16 : 64);
                    }
                }
            }

            reader.Ue(); //log2_max_frame_num_minus4

            uint pictureOrderCountType = reader.Ue();
            if (pictureOrderCountType == 0) {
                reader.Ue(); //log2_max_pic_order_cnt_lsb_minus4
            }
            else if (pictureOrderCountType == 1) {
                reader.Bit(); //delta_pic_order_always_zero_flag
                reader.Se();  //offset_for_non_ref_pic
                reader.Se();  //offset_for_top_to_bottom_field
                uint cycle = reader.Ue();
                if (cycle > 255) return null;
                for (uint i = 0; i < cycle; i++) reader.Se();
            }
            else if (pictureOrderCountType > 2) {
                return null;
            }

            reader.Ue();  //max_num_ref_frames
            reader.Bit(); //gaps_in_frame_num_value_allowed_flag

            long widthInMacroblocks = reader.Ue() + 1L;
            long heightInMapUnits = reader.Ue() + 1L;
            bool frameMacroblocksOnly = reader.Bit() == 1;
            if (!frameMacroblocksOnly) reader.Bit(); //mb_adaptive_frame_field_flag
            reader.Bit(); //direct_8x8_inference_flag

            long cropLeft = 0, cropRight = 0, cropTop = 0, cropBottom = 0;
            if (reader.Bit() == 1) {
                cropLeft = reader.Ue();
                cropRight = reader.Ue();
                cropTop = reader.Ue();
                cropBottom = reader.Ue();
            }

            //the crop is counted in chroma samples, and in field pairs for interlaced video
            int chromaArrayType = separateColourPlanes ? 0 : parameters.chromaFormat;
            long cropUnitX = chromaArrayType is 1 or 2 ? 2 : 1;
            long cropUnitY = (chromaArrayType == 1 ? 2 : 1) * (frameMacroblocksOnly ? 1 : 2);

            long width = widthInMacroblocks * 16 - cropUnitX * (cropLeft + cropRight);
            long height = heightInMapUnits * 16 * (frameMacroblocksOnly ? 1 : 2) - cropUnitY * (cropTop + cropBottom);
            if (width is <= 0 or > MAX_DIMENSION || height is <= 0 or > MAX_DIMENSION) return null;

            parameters.width = (int)width;
            parameters.height = (int)height;
            return parameters;
        }
        catch (InvalidDataException) {
            return null;
        }
    }

    //H.264 7.3.2.1.1.1, the values don't matter, only where the list ends
    private static void SkipScalingList(ref BitReader reader, int size) {
        int last = 8;
        for (int i = 0; i < size; i++) {
            int delta = reader.Se();
            if (delta is < -128 or > 127) throw new InvalidDataException();
            int next = (last + delta + 256) % 256;
            if (next == 0) return; //the rest repeat the last value
            last = next;
        }
    }

    //H.265 7.3.2.2.1, up to the bit depths, null when it doesn't parse
    internal static SequenceParameters ParseHevcSps(byte[] sps) {
        byte[] rbsp = NalDepacketizer.RemoveEmulationPrevention(sps, MAX_PARAMETER_SET_LENGTH);
        if (rbsp.Length < 15) return null;

        try {
            BitReader reader = new BitReader(rbsp.AsSpan(2));
            reader.Skip(4); //sps_video_parameter_set_id

            int maxSubLayersMinus1 = (int)reader.Bits(3);
            if (maxSubLayersMinus1 > 6) return null;

            SequenceParameters parameters = new SequenceParameters {
                temporalLayers    = maxSubLayersMinus1 + 1,
                temporalIdNesting = reader.Bit() == 1,
                profileTierLevel  = rbsp[3..15] //the general profile space, tier, profile, compatibility, constraints and level
            };

            reader.Skip(96);

            bool[] subLayerProfile = new bool[maxSubLayersMinus1];
            bool[] subLayerLevel = new bool[maxSubLayersMinus1];
            for (int i = 0; i < maxSubLayersMinus1; i++) {
                subLayerProfile[i] = reader.Bit() == 1;
                subLayerLevel[i] = reader.Bit() == 1;
            }
            if (maxSubLayersMinus1 > 0) reader.Skip(2 * (8 - maxSubLayersMinus1));
            for (int i = 0; i < maxSubLayersMinus1; i++) {
                if (subLayerProfile[i]) reader.Skip(88);
                if (subLayerLevel[i]) reader.Skip(8);
            }

            reader.Ue(); //sps_seq_parameter_set_id

            parameters.chromaFormat = (int)reader.Ue();
            if (parameters.chromaFormat > 3) return null;
            bool separateColourPlanes = parameters.chromaFormat == 3 && reader.Bit() == 1;

            long width = reader.Ue();
            long height = reader.Ue();

            long cropLeft = 0, cropRight = 0, cropTop = 0, cropBottom = 0;
            if (reader.Bit() == 1) { //conformance_window_flag
                cropLeft = reader.Ue();
                cropRight = reader.Ue();
                cropTop = reader.Ue();
                cropBottom = reader.Ue();
            }

            uint lumaBitDepth = reader.Ue();
            uint chromaBitDepth = reader.Ue();
            if (lumaBitDepth > 7 || chromaBitDepth > 7) return null;
            parameters.lumaBitDepth = (int)lumaBitDepth + 8;
            parameters.chromaBitDepth = (int)chromaBitDepth + 8;

            //the conformance window is counted in chroma samples
            long subWidth = !separateColourPlanes && parameters.chromaFormat is 1 or 2 ? 2 : 1;
            long subHeight = !separateColourPlanes && parameters.chromaFormat == 1 ? 2 : 1;

            width -= subWidth * (cropLeft + cropRight);
            height -= subHeight * (cropTop + cropBottom);
            if (width is <= 0 or > MAX_DIMENSION || height is <= 0 or > MAX_DIMENSION) return null;

            parameters.width = (int)width;
            parameters.height = (int)height;
            return parameters;
        }
        catch (InvalidDataException) {
            return null;
        }
    }

    //Fixed width and Exp-Golomb fields of an RBSP. Reading past its end throws.
    private ref struct BitReader {
        private readonly ReadOnlySpan<byte> data;
        private int position; //in bits

        public BitReader(ReadOnlySpan<byte> data) {
            this.data = data;
            position = 0;
        }

        public uint Bit() {
            if (position >= data.Length * 8) throw new InvalidDataException();
            uint bit = (uint)(data[position >> 3] >> (7 - (position & 7)) & 1);
            position++;
            return bit;
        }

        public uint Bits(int count) {
            uint value = 0;
            for (int i = 0; i < count; i++) value = value << 1 | Bit();
            return value;
        }

        public void Skip(int count) {
            if (position + count > data.Length * 8) throw new InvalidDataException();
            position += count;
        }

        public uint Ue() {
            int zeros = 0;
            while (Bit() == 0) {
                if (++zeros > 31) throw new InvalidDataException();
            }
            return (uint)((1UL << zeros) - 1 + Bits(zeros));
        }

        public int Se() {
            uint value = Ue();
            return (value & 1) != 0 ? (int)((value + 1) / 2) : -(int)(value / 2);
        }
    }

    //ftyp and moov, ISO/IEC 14496-12, for a single video track whose samples are all in fragments
    internal static byte[] InitializationSegment(Mp4Configuration configuration, int timescale, int offset) {
        BoxWriter box = new BoxWriter(offset);

        box.Open("ftyp");
        box.Bytes("isom"u8);
        box.UInt32(0x200);
        box.Bytes("isomiso6mp41"u8);
        box.Close();

        box.Open("moov");

        box.Open("mvhd", 0, 0);
        box.UInt32(0);              //creation time
        box.UInt32(0);              //modification time
        box.UInt32(1000);           //timescale
        box.UInt32(0);              //duration, a live stream has none
        box.UInt32(0x00010000);     //rate 1.0
        box.UInt16(0x0100);         //volume 1.0
        box.Zeros(10);
        box.Matrix();
        box.Zeros(24);              //pre_defined
        box.UInt32(2);              //next_track_ID
        box.Close();

        box.Open("trak");

        box.Open("tkhd", 0, 0x000003); //enabled, in the movie
        box.UInt32(0);
        box.UInt32(0);
        box.UInt32(1);              //track_ID
        box.UInt32(0);
        box.UInt32(0);              //duration
        box.Zeros(8);
        box.UInt16(0);              //layer
        box.UInt16(0);              //alternate_group
        box.UInt16(0);              //volume, none for video
        box.UInt16(0);
        box.Matrix();
        box.UInt32((uint)configuration.width << 16);
        box.UInt32((uint)configuration.height << 16);
        box.Close();

        box.Open("mdia");

        box.Open("mdhd", 0, 0);
        box.UInt32(0);
        box.UInt32(0);
        box.UInt32((uint)timescale);
        box.UInt32(0);
        box.UInt16(0x55C4);         //und
        box.UInt16(0);
        box.Close();

        box.Open("hdlr", 0, 0);
        box.UInt32(0);
        box.Bytes("vide"u8);
        box.Zeros(12);
        box.Bytes("VideoHandler\0"u8);
        box.Close();

        box.Open("minf");

        box.Open("vmhd", 0, 1);
        box.Zeros(8);               //graphicsmode and opcolor
        box.Close();

        box.Open("dinf");
        box.Open("dref", 0, 0);
        box.UInt32(1);
        box.Open("url ", 0, 1);     //the media is in this file
        box.Close();
        box.Close();
        box.Close();

        box.Open("stbl");

        box.Open("stsd", 0, 0);
        box.UInt32(1);
        box.Open(configuration.hevc ? "hvc1" : "avc1");
        box.Zeros(6);
        box.UInt16(1);              //data_reference_index
        box.Zeros(16);
        box.UInt16(configuration.width);
        box.UInt16(configuration.height);
        box.UInt32(0x00480000);     //72 dpi
        box.UInt32(0x00480000);
        box.UInt32(0);
        box.UInt16(1);              //frame_count
        box.Zeros(32);              //compressorname
        box.UInt16(0x0018);         //depth
        box.UInt16(0xFFFF);         //pre_defined
        box.Open(configuration.hevc ? "hvcC" : "avcC");
        box.Bytes(configuration.record);
        box.Close();
        box.Close();
        box.Close();

        //empty sample tables, the samples are in the fragments
        box.Open("stts", 0, 0);
        box.UInt32(0);
        box.Close();
        box.Open("stsc", 0, 0);
        box.UInt32(0);
        box.Close();
        box.Open("stsz", 0, 0);
        box.UInt32(0);
        box.UInt32(0);
        box.Close();
        box.Open("stco", 0, 0);
        box.UInt32(0);
        box.Close();

        box.Close(); //stbl
        box.Close(); //minf
        box.Close(); //mdia
        box.Close(); //trak

        box.Open("mvex");
        box.Open("trex", 0, 0);
        box.UInt32(1);              //track_ID
        box.UInt32(1);              //default_sample_description_index
        box.UInt32(0);
        box.UInt32(0);
        box.UInt32(0);
        box.Close();
        box.Close();

        box.Close(); //moov

        return box.ToArray();
    }

    //A box's size is written once its content is in.
    private sealed class BoxWriter {
        private readonly MemoryStream ms = new MemoryStream();
        private readonly Stack<int> open = new Stack<int>();

        public BoxWriter(int offset) {
            ms.SetLength(offset);
            ms.Position = offset;
        }

        public void Open(string type) {
            open.Push((int)ms.Position);
            UInt32(0);
            ms.Write(Encoding.ASCII.GetBytes(type));
        }

        public void Open(string type, int version, uint flags) {
            Open(type);
            UInt32((uint)version << 24 | flags);
        }

        public void Close() {
            int start = open.Pop();
            BinaryPrimitives.WriteUInt32BigEndian(ms.GetBuffer().AsSpan(start), (uint)(ms.Position - start));
        }

        public void UInt16(int value) {
            ms.WriteByte((byte)(value >> 8));
            ms.WriteByte((byte)value);
        }

        public void UInt32(uint value) {
            Span<byte> bytes = stackalloc byte[4];
            BinaryPrimitives.WriteUInt32BigEndian(bytes, value);
            ms.Write(bytes);
        }

        public void Zeros(int count) => ms.Write(new byte[count]);

        public void Bytes(ReadOnlySpan<byte> data) => ms.Write(data);

        //the identity
        public void Matrix() {
            foreach (uint value in new uint[] { 0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000 }) UInt32(value);
        }

        public byte[] ToArray() => ms.ToArray();
    }
}

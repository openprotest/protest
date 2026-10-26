using System.Formats.Asn1;
using Protest.Protocols;

namespace Protest.Tests;

public class RdpTests {
    private static Asn1Tag ContextTag(int value) => new Asn1Tag(TagClass.ContextSpecific, value, true);

    //an RDCleanPath request as the IronRDP web client encodes it
    private static byte[] EncodeRequest(ulong version, string destination, byte[] x224) {
        AsnWriter writer = new AsnWriter(AsnEncodingRules.DER);
        using (writer.PushSequence()) {
            using (writer.PushSequence(ContextTag(0))) writer.WriteInteger(version);
            using (writer.PushSequence(ContextTag(2))) writer.WriteCharacterString(UniversalTagNumber.UTF8String, destination);
            using (writer.PushSequence(ContextTag(3))) writer.WriteCharacterString(UniversalTagNumber.UTF8String, "token");
            using (writer.PushSequence(ContextTag(6))) writer.WriteOctetString(x224);
        }
        return writer.Encode();
    }

    //TPKT + X.224 connection confirm + RDP_NEG_RSP
    private static byte[] ConnectionConfirm(uint selectedProtocol) {
        byte[] x224 = { 0x03, 0x00, 0x00, 0x13, 0x0e, 0xd0, 0x00, 0x00, 0x12, 0x34, 0x00, 0x02, 0x1f, 0x08, 0x00, 0, 0, 0, 0 };
        BitConverter.TryWriteBytes(x224.AsSpan(15, 4), selectedProtocol);
        return x224;
    }

    private static readonly byte[] MCS_CONNECT_INITIAL = { 0x03, 0x00, 0x00, 0x0c, 0x02, 0xf0, 0x80, 0x7f, 0x65, 0x82, 0x01, 0x00 };

    //TPKT + X.224 data + MCS send data indication, on the I/O channel unless another is given
    private static byte[] SendDataIndication(byte[] payload, int channelId = 1003) {
        List<byte> pdu = new List<byte> { 0x03, 0x00, 0x00, 0x00, 0x02, 0xf0, 0x80, 0x68, 0x00, 0x01, (byte)(channelId >> 8), (byte)channelId, 0x70 };
        if (payload.Length < 0x80) {
            pdu.Add((byte)payload.Length);
        }
        else {
            pdu.Add((byte)(0x80 | payload.Length >> 8));
            pdu.Add((byte)payload.Length);
        }
        pdu.AddRange(payload);
        pdu[2] = (byte)(pdu.Count >> 8);
        pdu[3] = (byte)pdu.Count;
        return pdu.ToArray();
    }

    private static byte[] LicensePdu(byte messageType, int bodyLength) {
        byte[] payload = new byte[8 + bodyLength];
        payload[0] = 0x80; //SEC_LICENSE_PKT
        payload[4] = messageType;
        payload[5] = 0x03;
        return SendDataIndication(payload);
    }

    [Test]
    public void DecodeRequest_IronRdpRequest_ReturnsDestinationAndX224() {
        byte[] x224 = { 0x03, 0x00, 0x00, 0x0b, 0x06, 0xe0, 0x00, 0x00, 0x00, 0x00, 0x00 };

        Rdp.RdCleanPathRequest request = Rdp.DecodeRequest(EncodeRequest(3390, "host:3389", x224));

        Assert.That(request, Is.Not.Null);
        Assert.That(request.destination, Is.EqualTo("host:3389"));
        Assert.That(request.x224, Is.EqualTo(x224));
    }

    [Test]
    public void DecodeRequest_UnknownVersion_ReturnsNull() {
        byte[] x224 = { 0x03, 0x00, 0x00, 0x0b, 0x06, 0xe0, 0x00, 0x00, 0x00, 0x00, 0x00 };
        Assert.That(Rdp.DecodeRequest(EncodeRequest(3389, "host", x224)), Is.Null);
    }

    [Test]
    public void EncodeResponse_HasX224CertificatesAndServerAddress() {
        byte[] x224 = ConnectionConfirm(2);
        List<byte[]> chain = new List<byte[]> { new byte[] { 1, 2, 3 }, new byte[] { 4, 5 } };

        AsnReader sequence = new AsnReader(Rdp.EncodeResponse(x224, chain, "10.0.0.1:3389"), AsnEncodingRules.DER).ReadSequence();

        Assert.That(sequence.ReadSequence(ContextTag(0)).ReadInteger(), Is.EqualTo(new System.Numerics.BigInteger(3390)));
        Assert.That(sequence.ReadSequence(ContextTag(6)).ReadOctetString(), Is.EqualTo(x224));

        AsnReader certificates = sequence.ReadSequence(ContextTag(7)).ReadSequence();
        Assert.That(certificates.ReadOctetString(), Is.EqualTo(chain[0]));
        Assert.That(certificates.ReadOctetString(), Is.EqualTo(chain[1]));
        Assert.That(certificates.HasData, Is.False);

        Assert.That(sequence.ReadSequence(ContextTag(9)).ReadCharacterString(UniversalTagNumber.UTF8String), Is.EqualTo("10.0.0.1:3389"));
        Assert.That(sequence.HasData, Is.False);
    }

    [TestCase("host", "host", 3389)]
    [TestCase("host:3390", "host", 3390)]
    [TestCase("[::1]:3390", "::1", 3390)]
    [TestCase("[::1]", "::1", 3389)]
    [TestCase("fe80::1", "fe80::1", 3389)]
    public void TryParseDestination_ValidDestinations(string destination, string expectedHost, int expectedPort) {
        Assert.That(Rdp.TryParseDestination(destination, out string host, out int port), Is.True);
        Assert.That(host, Is.EqualTo(expectedHost));
        Assert.That(port, Is.EqualTo(expectedPort));
    }

    [TestCase("")]
    [TestCase("host:abc")]
    [TestCase("host:70000")]
    [TestCase("[::1")]
    public void TryParseDestination_InvalidDestinations(string destination) {
        Assert.That(Rdp.TryParseDestination(destination, out _, out _), Is.False);
    }

    [Test]
    public void ToTlsConfirm_SelectsTlsWithoutChangingTheOriginal() {
        byte[] original = ConnectionConfirm(8); //HYBRID_EX
        byte[] converted = Rdp.ToTlsConfirm(original);

        Assert.That(BitConverter.ToUInt32(converted, 15), Is.EqualTo(1u));
        Assert.That(BitConverter.ToUInt32(original, 15), Is.EqualTo(8u));
    }

    [Test]
    public void HasUserInput_DetectsKeysAndClicksButNotPointerMoves() {
        byte[] move     = { 0x04, 0x09, 0x20, 0x00, 0x08, 0x10, 0x00, 0x20, 0x00 };
        byte[] click    = { 0x04, 0x09, 0x20, 0x00, 0x90, 0x10, 0x00, 0x20, 0x00 };
        byte[] scancode = { 0x04, 0x04, 0x00, 0x1e };
        byte[] sync     = { 0x04, 0x03, 0x60 };
        byte[] slowPath = { 0x03, 0x00, 0x00, 0x08, 0x02, 0xf0, 0x80, 0x64 };

        Assert.That(Rdp.HasUserInput(move), Is.False);
        Assert.That(Rdp.HasUserInput(click), Is.True);
        Assert.That(Rdp.HasUserInput(scancode), Is.True);
        Assert.That(Rdp.HasUserInput(sync), Is.False);
        Assert.That(Rdp.HasUserInput(slowPath), Is.False);
    }

    [Test]
    public void StreamRecorder_SkipsCredSspAndReplacesLicensing() {
        List<byte> recorded = new List<byte>();
        bool interacted = false;
        Rdp.StreamRecorder recorder = new Rdp.StreamRecorder((buffer, count) => recorded.AddRange(buffer.AsSpan(0, count)), () => interacted = true);

        //CredSSP from the server, before the client's MCS connect initial
        byte[] tsRequest = { 0x30, 0x05, 0xa0, 0x03, 0x02, 0x01, 0x06 };
        recorder.ObserveServer(tsRequest, tsRequest.Length);

        recorder.ObserveClient(new byte[] { 0x03, 0x00, 0x01, 0x00 });

        //share control header with bit 0x80 set in its length, after licensing it must not be taken for a license PDU
        byte[] demandActive = SendDataIndication(new byte[] { 0x80, 0x01, 0x11, 0x00, 0xea, 0x03, 0x01, 0x00 });
        byte[] fastPath = { 0x00, 0x05, 0xaa, 0xbb, 0xcc };

        byte[] stream = LicensePdu(0x01, 300)          //license request, replaced
            .Concat(LicensePdu(0x02, 40))               //platform challenge, dropped
            .Concat(LicensePdu(0x03, 200))              //new license, dropped
            .Concat(demandActive)
            .Concat(fastPath)
            .ToArray();

        //arbitrary read boundaries
        for (int i = 0; i < stream.Length; i += 37) {
            byte[] chunk = stream.Skip(i).Take(37).ToArray();
            recorder.ObserveServer(chunk, chunk.Length);
        }

        byte[] validClient = recorded.Take(34).ToArray();
        Assert.That(validClient[3], Is.EqualTo(34));
        Assert.That(validClient[14], Is.EqualTo(0x80));                     //SEC_LICENSE_PKT
        Assert.That(validClient[18], Is.EqualTo(0xff));                     //error alert
        Assert.That(BitConverter.ToUInt32(validClient, 22), Is.EqualTo(7u)); //STATUS_VALID_CLIENT

        Assert.That(recorded.Skip(34).ToArray(), Is.EqualTo(demandActive.Concat(fastPath).ToArray()));

        Assert.That(interacted, Is.False);
        recorder.ObserveClient(new byte[] { 0x04, 0x04, 0x00, 0x1e });
        Assert.That(interacted, Is.True);
    }

    //client info PDU: MCS send data request with SEC_INFO_PKT, then TS_INFO_PACKET with unicode strings and extended info
    private static (byte[] pdu, int performanceOffset) ClientInfoPdu(uint performanceFlags) {
        static byte[] Unicode(string text) => System.Text.Encoding.Unicode.GetBytes(text);

        List<byte> info = new List<byte>();
        info.AddRange(BitConverter.GetBytes(0u));                       //code page
        info.AddRange(BitConverter.GetBytes(0x0010u | 0x0100u));        //INFO_UNICODE, INFO_LOGONNOTIFY
        string[] strings = { "DOMAIN", "user", "secret", "", "" };
        foreach (string s in strings) info.AddRange(BitConverter.GetBytes((ushort)Unicode(s).Length));
        foreach (string s in strings) { info.AddRange(Unicode(s)); info.AddRange(new byte[2]); }

        byte[] address = Unicode("10.0.0.5\0");
        byte[] directory = Unicode("C:\\client\0");
        info.AddRange(BitConverter.GetBytes((ushort)2));                //AF_INET
        info.AddRange(BitConverter.GetBytes((ushort)address.Length));
        info.AddRange(address);
        info.AddRange(BitConverter.GetBytes((ushort)directory.Length));
        info.AddRange(directory);
        info.AddRange(new byte[172]);                                   //time zone
        info.AddRange(BitConverter.GetBytes(0u));                       //session id
        int performanceOffset = info.Count;
        info.AddRange(BitConverter.GetBytes(performanceFlags));
        info.AddRange(new byte[4]);                                     //auto reconnect cookie length and padding

        List<byte> payload = new List<byte> { 0x40, 0x00, 0x00, 0x00 }; //SEC_INFO_PKT
        payload.AddRange(info);

        byte[] pdu = SendDataIndication(payload.ToArray());
        pdu[7] = 0x64; //send data request
        int header = (pdu[13] & 0x80) != 0 ? 15 : 14;
        return (pdu, header + 4 + performanceOffset);
    }

    [Test]
    public void OptimizeClientInfo_DisablesWallpaperAnimationsAndDrag() {
        (byte[] pdu, int offset) = ClientInfoPdu(0x0080); //font smoothing stays as asked
        byte[] untouched = pdu.ToArray();

        Assert.That(Rdp.OptimizeClientInfo(pdu), Is.True);
        Assert.That(BitConverter.ToUInt32(pdu, offset), Is.EqualTo(0x0080u | 0x0001u | 0x0002u | 0x0004u | 0x0020u | 0x0040u));

        BitConverter.TryWriteBytes(pdu.AsSpan(offset, 4), 0x0080u);
        Assert.That(pdu, Is.EqualTo(untouched), "nothing but the performance flags may change");
    }

    [Test]
    public void OptimizeClientInfo_IgnoresOtherPdus() {
        byte[] input = { 0x04, 0x04, 0x00, 0x1e };
        byte[] license = LicensePdu(0x01, 20);
        license[7] = 0x64;

        Assert.That(Rdp.OptimizeClientInfo(input), Is.False);
        Assert.That(Rdp.OptimizeClientInfo(MCS_CONNECT_INITIAL), Is.False);
        Assert.That(Rdp.OptimizeClientInfo(license), Is.False);
    }

    [Test]
    public void OptimizeClientInfo_LeavesEncryptedPacketAlone() {
        (byte[] pdu, _) = ClientInfoPdu(0x0080);
        int header = (pdu[13] & 0x80) != 0 ? 15 : 14;
        pdu[header] |= 0x08; //SEC_ENCRYPT
        byte[] untouched = pdu.ToArray();

        Assert.That(Rdp.OptimizeClientInfo(pdu), Is.True);
        Assert.That(pdu, Is.EqualTo(untouched));
    }

    [Test]
    public void ClientInfoOptimizer_LooksPastCredssp() {
        Rdp.ClientInfoOptimizer optimizer = new Rdp.ClientInfoOptimizer();
        byte[] tsRequest = { 0x30, 0x37, 0xa0, 0x03, 0x02, 0x01, 0x06, 0xa1, 0x30 }; //DER, reads like fast-path input
        (byte[] clientInfo, int offset) = ClientInfoPdu(0x0080);

        optimizer.Observe(tsRequest);
        optimizer.Observe(tsRequest);
        Assert.That(optimizer.Done, Is.False, "CredSSP is not the end of the connection sequence");

        optimizer.Observe(MCS_CONNECT_INITIAL);
        optimizer.Observe(clientInfo);
        Assert.That(optimizer.Done, Is.True);
        Assert.That(BitConverter.ToUInt32(clientInfo, offset), Is.EqualTo(0x0080u | 0x0001u | 0x0002u | 0x0004u | 0x0020u | 0x0040u));

        (byte[] later, int laterOffset) = ClientInfoPdu(0x0080);
        optimizer.Observe(later);
        Assert.That(BitConverter.ToUInt32(later, laterOffset), Is.EqualTo(0x0080u), "nothing is inspected once done");
    }

    [Test]
    public void ClientInfoOptimizer_StopsAtFastPathInput() {
        Rdp.ClientInfoOptimizer optimizer = new Rdp.ClientInfoOptimizer();
        optimizer.Observe(MCS_CONNECT_INITIAL);
        optimizer.Observe(new byte[] { 0x04, 0x04, 0x00, 0x1e });
        Assert.That(optimizer.Done, Is.True);
    }

    private static byte[] DemandActivePdu(ushort width, ushort height) {
        List<byte> capabilities = new List<byte>();
        capabilities.AddRange(new byte[] { 0x01, 0x00, 0x18, 0x00 }); //general capability set, 24 bytes
        capabilities.AddRange(new byte[20]);
        capabilities.AddRange(new byte[] { 0x02, 0x00, 0x1c, 0x00 }); //bitmap capability set, 28 bytes
        capabilities.AddRange(BitConverter.GetBytes((ushort)16));     //preferred bits per pixel
        capabilities.AddRange(new byte[6]);
        capabilities.AddRange(BitConverter.GetBytes(width));
        capabilities.AddRange(BitConverter.GetBytes(height));
        capabilities.AddRange(new byte[12]);

        byte[] source = System.Text.Encoding.ASCII.GetBytes("RDP\0");

        List<byte> payload = new List<byte>();
        payload.AddRange(BitConverter.GetBytes((ushort)0));            //total length, unchecked
        payload.AddRange(BitConverter.GetBytes((ushort)0x0011));       //demand active
        payload.AddRange(BitConverter.GetBytes((ushort)1002));         //source
        payload.AddRange(BitConverter.GetBytes(0x000103eau));          //share id
        payload.AddRange(BitConverter.GetBytes((ushort)source.Length));
        payload.AddRange(BitConverter.GetBytes((ushort)(capabilities.Count + 4)));
        payload.AddRange(source);
        payload.AddRange(BitConverter.GetBytes((ushort)2));            //number of capabilities
        payload.AddRange(new byte[2]);
        payload.AddRange(capabilities);
        payload.AddRange(new byte[4]);                                 //session id

        return SendDataIndication(payload.ToArray());
    }

    [Test]
    public void DesktopSizeScanner_FindsDemandActiveAcrossFastPathAndChunks() {
        byte[] fastPathShort = { 0x00, 0x06, 1, 2, 3, 4 };
        byte[] fastPathLong = new byte[300];
        fastPathLong[0] = 0x00;
        fastPathLong[1] = 0x81;
        fastPathLong[2] = 0x2c; //300 bytes

        byte[] stream = fastPathShort
            .Concat(DemandActivePdu(1920, 1080))
            .Concat(fastPathLong)
            .Concat(LicensePdu(0xff, 12))
            .Concat(DemandActivePdu(1280, 720))
            .ToArray();

        Rdp.DesktopSizeScanner scanner = new Rdp.DesktopSizeScanner();
        List<(int, int)> sizes = new List<(int, int)>();

        for (int i = 0; i < stream.Length; i += 29) {
            List<(int width, int height)> found = scanner.Scan(stream.Skip(i).Take(29).ToArray());
            if (found is not null) sizes.AddRange(found.Select(o => (o.width, o.height)));
        }

        Assert.That(sizes, Is.EqualTo(new List<(int, int)> { (1920, 1080), (1280, 720) }));
    }

    [Test]
    public async Task FlowControl_UnlimitedUntilFirstAcknowledgement() {
        Rdp.FlowControl flow = new Rdp.FlowControl();
        flow.Consume(10_000_000);
        Assert.That(await flow.AcquireAsync(65_536, default), Is.EqualTo(65_536));
    }

    [Test]
    public async Task FlowControl_WaitsForTheBrowserOnceAWindowAhead() {
        Rdp.FlowControl flow = new Rdp.FlowControl();
        flow.Consume(500); //the RDCleanPath response
        flow.Acknowledge(500);

        Assert.That(await flow.AcquireAsync(65_536, default), Is.EqualTo(65_536));
        flow.Consume(Rdp.FlowControl.WINDOW - 1000);
        Assert.That(await flow.AcquireAsync(65_536, default), Is.EqualTo(1000), "reads are capped at what is left of the window");
        flow.Consume(1000);

        Task<int> waiting = flow.AcquireAsync(65_536, default);
        await Task.Delay(100);
        Assert.That(waiting.IsCompleted, Is.False, "the browser is a window behind, the server must be held back");

        flow.Acknowledge(500 + 16_384);
        Assert.That(await waiting.WaitAsync(TimeSpan.FromSeconds(2)), Is.EqualTo(16_384), "only what the browser has taken in is released");
    }

    [Test]
    public async Task FlowControl_IgnoresStaleAcknowledgements() {
        Rdp.FlowControl flow = new Rdp.FlowControl();
        flow.Consume(Rdp.FlowControl.WINDOW + 50_000);
        flow.Acknowledge(50_000);
        flow.Acknowledge(10_000); //arrived out of order, must not move the count back

        Task<int> waiting = flow.AcquireAsync(65_536, default);
        await Task.Delay(100);
        Assert.That(waiting.IsCompleted, Is.False);

        flow.Acknowledge(Rdp.FlowControl.WINDOW + 50_000);
        Assert.That(await waiting.WaitAsync(TimeSpan.FromSeconds(2)), Is.EqualTo(65_536));
    }

    [Test]
    public void StreamRecorder_KeepsValidClientAlert() {
        List<byte> recorded = new List<byte>();
        Rdp.StreamRecorder recorder = new Rdp.StreamRecorder((buffer, count) => recorded.AddRange(buffer.AsSpan(0, count)), () => { });

        recorder.ObserveClient(new byte[] { 0x03, 0x00, 0x01, 0x00 });

        byte[] alert = LicensePdu(0xff, 12);
        recorder.ObserveServer(alert, alert.Length);

        Assert.That(recorded.ToArray(), Is.EqualTo(alert));
    }

    //fast-path output PDU with a two-byte length, holding the given updates
    private static byte[] FastPathOutput(params byte[][] updates) {
        List<byte> body = updates.SelectMany(u => u).ToList();
        int length = body.Count + 3;
        return new byte[] { 0x00, (byte)(0x80 | length >> 8), (byte)length }.Concat(body).ToArray();
    }

    private static byte[] FastPathUpdate(byte code, byte[] data, int fragmentation = 0) =>
        new byte[] { (byte)(code | fragmentation << 4) }.Concat(BitConverter.GetBytes((ushort)data.Length)).Concat(data).ToArray();

    //TS_COLORPOINTERATTRIBUTE
    private static byte[] ColorPointer(ushort index, ushort x, ushort y, ushort width, ushort height, byte[] xorMask, byte[] andMask) =>
        new[] { index, x, y, width, height, (ushort)andMask.Length, (ushort)xorMask.Length }
            .SelectMany(v => BitConverter.GetBytes(v)).Concat(xorMask).Concat(andMask).ToArray();

    private static List<System.Text.Json.JsonElement> Observe(Rdp.PointerTracker tracker, byte[] stream, int chunkSize) {
        List<System.Text.Json.JsonElement> messages = new List<System.Text.Json.JsonElement>();
        foreach (byte[] chunk in stream.Chunk(chunkSize)) {
            foreach (string message in tracker.ObserveServer(chunk, chunk.Length) ?? new List<string>()) {
                messages.Add(System.Text.Json.JsonDocument.Parse(message).RootElement);
            }
        }
        return messages;
    }

    [Test]
    public void PointerTracker_ReportsPointerUpdatesOnceCredsspIsOver() {
        Rdp.PointerTracker tracker = new Rdp.PointerTracker();

        //2x2 at 32 bpp, BGRA, the bottom row first
        byte[] xorMask = { 1, 2, 3, 0xff, 4, 5, 6, 0xff, 7, 8, 9, 0x80, 10, 11, 12, 0xff };
        byte[] newPointer = BitConverter.GetBytes((ushort)32).Concat(ColorPointer(3, 1, 0, 2, 2, xorMask, new byte[4])).ToArray();
        byte[] pointers = FastPathOutput(FastPathUpdate(0xb, newPointer), FastPathUpdate(0xa, BitConverter.GetBytes((ushort)3)));

        Assert.That(tracker.ObserveServer(pointers, pointers.Length), Is.Null, "CredSSP comes first and is not inspected");

        tracker.ObserveClient(MCS_CONNECT_INITIAL);

        byte[] slowPath = { 0x03, 0x00, 0x00, 0x09, 0x02, 0xf0, 0x80, 0x68, 0x00 };
        byte[] bitmap = FastPathOutput(FastPathUpdate(0x1, new byte[300]));
        byte[] hidden = FastPathOutput(FastPathUpdate(0x5, Array.Empty<byte>()));
        byte[] stream = slowPath.Concat(bitmap).Concat(pointers).Concat(hidden).ToArray();

        List<System.Text.Json.JsonElement> messages = Observe(tracker, stream, 5); //arbitrary read boundaries

        Assert.That(messages, Has.Count.EqualTo(3));
        Assert.That(messages[0].GetProperty("pointer").GetString(), Is.EqualTo("new"));
        Assert.That(messages[0].GetProperty("index").GetInt32(), Is.EqualTo(3));
        Assert.That(messages[0].GetProperty("x").GetInt32(), Is.EqualTo(1));
        Assert.That(messages[0].GetProperty("width").GetInt32(), Is.EqualTo(2));
        Assert.That(Convert.FromBase64String(messages[0].GetProperty("rgba").GetString()!),
            Is.EqualTo(new byte[] { 9, 8, 7, 0x80, 12, 11, 10, 0xff, 3, 2, 1, 0xff, 6, 5, 4, 0xff }), "top row first, RGBA, alpha kept");

        Assert.That(messages[1].GetProperty("pointer").GetString(), Is.EqualTo("cached"));
        Assert.That(messages[1].GetProperty("index").GetInt32(), Is.EqualTo(3));
        Assert.That(messages[2].GetProperty("pointer").GetString(), Is.EqualTo("hidden"));
    }

    [Test]
    public void PointerTracker_ReassemblesFragmentedLargePointers() {
        Rdp.PointerTracker tracker = new Rdp.PointerTracker();
        tracker.ObserveClient(MCS_CONNECT_INITIAL);

        //2x1 at 24 bpp, red and green, the scan line padded to an even length
        byte[] xorMask = { 0, 0, 0xff, 0, 0xff, 0 };
        byte[] andMask = { 0, 0 };
        byte[] large = new[] { (ushort)24, (ushort)7, (ushort)0, (ushort)0, (ushort)2, (ushort)1 }.SelectMany(v => BitConverter.GetBytes(v))
            .Concat(BitConverter.GetBytes((uint)andMask.Length)).Concat(BitConverter.GetBytes((uint)xorMask.Length))
            .Concat(xorMask).Concat(andMask).ToArray();

        byte[] stream = FastPathOutput(FastPathUpdate(0xc, large[..10], 2)).Concat(FastPathOutput(FastPathUpdate(0xc, large[10..], 1))).ToArray();
        List<System.Text.Json.JsonElement> messages = Observe(tracker, stream, 64);

        Assert.That(messages, Has.Count.EqualTo(1));
        Assert.That(messages[0].GetProperty("index").GetInt32(), Is.EqualTo(7));
        Assert.That(Convert.FromBase64String(messages[0].GetProperty("rgba").GetString()!), Is.EqualTo(new byte[] { 0xff, 0, 0, 0xff, 0, 0xff, 0, 0xff }));
    }

    [Test]
    public void DecodePointer_AppliesTheAndMask() {
        //3x1 at 24 bpp: black, white and red, the first two masked
        byte[] xorMask = { 0, 0, 0, 0xff, 0xff, 0xff, 0, 0, 0xff, 0 };
        byte[] andMask = { 0b1100_0000, 0 };

        byte[] rgba = Rdp.PointerTracker.DecodePointer(24, 3, 1, xorMask, andMask);

        Assert.That(rgba[0..4], Is.EqualTo(new byte[] { 0, 0, 0, 0 }), "masked black is transparent");
        Assert.That(rgba[4..8], Is.EqualTo(new byte[] { 0, 0, 0, 0xff }), "masked white inverts, a checker pattern stands in");
        Assert.That(rgba[8..12], Is.EqualTo(new byte[] { 0xff, 0, 0, 0xff }));
    }

    [Test]
    public void DecodePointer_ReadsMonochromeTopDownAnd16Bit() {
        byte[] mono = Rdp.PointerTracker.DecodePointer(1, 2, 2, new byte[] { 0b1000_0000, 0, 0b0100_0000, 0 }, new byte[4]);
        Assert.That(mono, Is.EqualTo(new byte[] { 0xff, 0xff, 0xff, 0xff, 0, 0, 0, 0xff, 0, 0, 0, 0xff, 0xff, 0xff, 0xff, 0xff }));

        byte[] rgb565 = Rdp.PointerTracker.DecodePointer(16, 1, 1, new byte[] { 0x00, 0xf8 }, Array.Empty<byte>());
        Assert.That(rgb565, Is.EqualTo(new byte[] { 0xff, 0, 0, 0xff }));
    }

    private static byte[] X224Data(byte[] payload) {
        int length = payload.Length + 7;
        return new byte[] { 0x03, 0x00, (byte)(length >> 8), (byte)length, 0x02, 0xf0, 0x80 }.Concat(payload).ToArray();
    }

    //MCS connect response whose GCC user data ends with the server core, security and network data blocks
    private static byte[] ConnectResponse(ushort ioChannel, params ushort[] channels) {
        List<byte> blocks = new List<byte>();
        blocks.AddRange(new byte[] { 0x01, 0x0c, 0x0c, 0x00, 0x04, 0x00, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00 });
        blocks.AddRange(new byte[] { 0x02, 0x0c, 0x0c, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 });

        int padding = channels.Length % 2 * 2;
        blocks.AddRange(BitConverter.GetBytes((ushort)0x0c03));
        blocks.AddRange(BitConverter.GetBytes((ushort)(8 + channels.Length * 2 + padding)));
        blocks.AddRange(BitConverter.GetBytes(ioChannel));
        blocks.AddRange(BitConverter.GetBytes((ushort)channels.Length));
        foreach (ushort channel in channels) blocks.AddRange(BitConverter.GetBytes(channel));
        blocks.AddRange(new byte[padding]);

        return X224Data(new byte[] { 0x7f, 0x66, 0x82, 0x00, 0x00 }.Concat(new byte[12]).Concat(blocks).ToArray());
    }

    [Test]
    public void PlaybackFilter_DropsTrafficOnTheRecordedStaticChannels() {
        Rdp.PlaybackFilter filter = new Rdp.PlaybackFilter();

        byte[] response  = ConnectResponse(1003, 1004, 1005);
        byte[] clipboard = SendDataIndication(new byte[] { 1, 2, 3 }, 1004);
        byte[] io        = SendDataIndication(new byte[] { 4 });
        byte[] dynamic   = SendDataIndication(new byte[] { 5, 6 }, 1005);
        byte[] fastPath  = FastPathOutput(FastPathUpdate(0x1, new byte[40]));
        byte[] stream = response.Concat(clipboard).Concat(io).Concat(dynamic).Concat(fastPath).ToArray();

        List<byte> output = new List<byte>();
        foreach (byte[] chunk in stream.Chunk(7)) { //arbitrary read boundaries
            output.AddRange(filter.Filter(chunk));
        }

        Assert.That(output.ToArray(), Is.EqualTo(response.Concat(io).Concat(fastPath).ToArray()));
    }

    [Test]
    public void PlaybackFilter_FindsTheStaticChannelIds() {
        Assert.That(Rdp.PlaybackFilter.GetStaticChannels(ConnectResponse(1003, 1004, 1005, 1006)), Is.EquivalentTo(new[] { 1004, 1005, 1006 }));
        Assert.That(Rdp.PlaybackFilter.GetStaticChannels(ConnectResponse(1003)), Is.Empty);
        Assert.That(Rdp.PlaybackFilter.GetStaticChannels(X224Data(new byte[40])), Is.Null);
    }

    [Test]
    public void PlaybackFilter_GivesEveryDemandActiveTheLargestSize() {
        Rdp.PlaybackFilter filter = new Rdp.PlaybackFilter((1920, 1200));

        byte[] first  = DemandActivePdu(1024, 768);
        byte[] update = FastPathOutput(FastPathUpdate(0x1, new byte[40]));
        byte[] second = DemandActivePdu(1600, 900);
        byte[] stream = first.Concat(update).Concat(second).ToArray();

        List<byte> output = new List<byte>();
        foreach (byte[] chunk in stream.Chunk(11)) {
            output.AddRange(filter.Filter(chunk));
        }

        Assert.That(output, Has.Count.EqualTo(stream.Length));

        byte[] filtered = output.ToArray();
        Assert.That(Rdp.DesktopSizeScanner.GetDemandActiveSize(filtered[..first.Length]), Is.EqualTo((1920, 1200)));
        Assert.That(filtered[first.Length..(first.Length + update.Length)], Is.EqualTo(update), "everything else goes through as it was");
        Assert.That(Rdp.DesktopSizeScanner.GetDemandActiveSize(filtered[(first.Length + update.Length)..]), Is.EqualTo((1920, 1200)));
    }

    [Test]
    public void DesktopSizeScanner_SetsTheDemandActiveSize() {
        byte[] pdu = DemandActivePdu(1024, 768);
        Assert.That(Rdp.DesktopSizeScanner.SetDemandActiveSize(pdu, 2560, 1440), Is.True);
        Assert.That(Rdp.DesktopSizeScanner.GetDemandActiveSize(pdu), Is.EqualTo((2560, 1440)));

        byte[] other = SendDataIndication(new byte[30]);
        byte[] untouched = other.ToArray();
        Assert.That(Rdp.DesktopSizeScanner.SetDemandActiveSize(other, 2560, 1440), Is.False);
        Assert.That(other, Is.EqualTo(untouched));
    }

    [Test]
    public void DecodePointer_RejectsMalformedMasks() {
        Assert.That(Rdp.PointerTracker.DecodePointer(32, 2, 2, new byte[15], new byte[4]), Is.Null);
        Assert.That(Rdp.PointerTracker.DecodePointer(32, 2, 2, new byte[16], new byte[3]), Is.Null);
        Assert.That(Rdp.PointerTracker.DecodePointer(8, 2, 2, new byte[4], new byte[4]), Is.Null);
        Assert.That(Rdp.PointerTracker.DecodePointer(32, 0, 0, Array.Empty<byte>(), Array.Empty<byte>()), Is.Empty);
    }

    //----- server-side CredSSP (vault credentials) -----

    //TPKT + X.224 connection request, an optional mstshash cookie, then an 8-byte RDP_NEG_REQ with requestedProtocols
    private static byte[] X224ConnectionRequest(uint requestedProtocols, bool withCookie) {
        List<byte> negReq = new List<byte> { 0x01, 0x00, 0x08, 0x00 }; //TYPE_RDP_NEG_REQ, flags, length 8
        negReq.AddRange(BitConverter.GetBytes(requestedProtocols));

        List<byte> cookie = withCookie
            ? System.Text.Encoding.ASCII.GetBytes("Cookie: mstshash=test\r\n").ToList()
            : new List<byte>();

        int li = 6 + cookie.Count + negReq.Count; //bytes after the length indicator
        List<byte> cr = new List<byte> {
            0x03, 0x00, 0x00, 0x00,                        //TPKT, length set below
            (byte)li, 0xe0, 0x00, 0x00, 0x00, 0x00, 0x00   //LI, CR-CDT, DST-REF, SRC-REF, CLASS
        };
        cr.AddRange(cookie);
        cr.AddRange(negReq);

        cr[2] = (byte)(cr.Count >> 8);
        cr[3] = (byte)cr.Count;
        return cr.ToArray();
    }

    //MCS connect initial (BER application tag 0x7f 0x65) whose GCC user data is a client core data block (type 0xC001)
    //long enough to carry serverSelectedProtocol at offset 212. Returns the PDU and that field's absolute offset.
    private static (byte[] pdu, int protocolOffset) McsConnectInitial(uint serverSelectedProtocol) {
        List<byte> core = new List<byte> { 0x01, 0xc0, 0xd8, 0x00 }; //CS_CORE, length 216
        core.AddRange(new byte[208]);                                //body up to serverSelectedProtocol
        core.AddRange(BitConverter.GetBytes(serverSelectedProtocol));

        List<byte> pdu = new List<byte> {
            0x03, 0x00, 0x00, 0x00,       //TPKT
            0x02, 0xf0, 0x80,             //X.224 data
            0x7f, 0x65, 0x82, 0x00, 0x00  //MCS connect initial tag, BER length set below
        };
        int coreStart = pdu.Count;
        pdu.AddRange(core);

        int berLength = pdu.Count - 12;
        pdu[10] = (byte)(berLength >> 8);
        pdu[11] = (byte)berLength;

        pdu[2] = (byte)(pdu.Count >> 8);
        pdu[3] = (byte)pdu.Count;

        return (pdu.ToArray(), coreStart + 212);
    }

    [TestCase("CONTOSO\\alice", "CONTOSO", "alice")]
    [TestCase("alice@contoso.com", "", "alice@contoso.com")]
    [TestCase("alice", "", "alice")]
    [TestCase("", "", "")]
    public void SplitUsername_SplitsTheDomain(string input, string expectedDomain, string expectedUser) {
        (string domain, string user) = Rdp.SplitUsername(input);
        Assert.That(domain, Is.EqualTo(expectedDomain));
        Assert.That(user, Is.EqualTo(expectedUser));
    }

    [Test]
    public void RewriteRequestedProtocols_OffersNlaToTheServer() {
        byte[] cr = X224ConnectionRequest(1, withCookie: false); //the browser asked for TLS only
        Assert.That(Rdp.RewriteRequestedProtocols(cr, 1 | 2 | 8), Is.True);
        Assert.That(BitConverter.ToUInt32(cr, cr.Length - 4), Is.EqualTo(11u));
    }

    [Test]
    public void RewriteRequestedProtocols_FindsTheRequestPastACookie() {
        byte[] cr = X224ConnectionRequest(1, withCookie: true);
        Assert.That(Rdp.RewriteRequestedProtocols(cr, 1 | 2 | 8), Is.True);
        Assert.That(BitConverter.ToUInt32(cr, cr.Length - 4), Is.EqualTo(11u));
    }

    [Test]
    public void RewriteRequestedProtocols_IgnoresAConnectionRequestWithoutNegotiation() {
        byte[] bare = { 0x03, 0x00, 0x00, 0x0b, 0x06, 0xe0, 0x00, 0x00, 0x00, 0x00, 0x00 };
        byte[] untouched = bare.ToArray();
        Assert.That(Rdp.RewriteRequestedProtocols(bare, 11), Is.False);
        Assert.That(bare, Is.EqualTo(untouched));
    }

    [Test]
    public void RewriteServerSelectedProtocol_RewritesTheCoreDataField() {
        (byte[] pdu, int offset) = McsConnectInitial(1); //the browser reported PROTOCOL_SSL
        Assert.That(Rdp.RewriteServerSelectedProtocol(pdu, 2), Is.True);
        Assert.That(BitConverter.ToUInt32(pdu, offset), Is.EqualTo(2u));

        byte[] other = SendDataIndication(new byte[220]);
        byte[] untouched = other.ToArray();
        Assert.That(Rdp.RewriteServerSelectedProtocol(other, 2), Is.False);
        Assert.That(other, Is.EqualTo(untouched), "only the MCS connect initial carries the field");
    }

    [Test]
    public void ConnectInitialRewriter_RewritesTheFirstConnectInitialOnly() {
        (byte[] pdu, int offset) = McsConnectInitial(1);
        Rdp.ConnectInitialRewriter rewriter = new Rdp.ConnectInitialRewriter(8); //the server selected HYBRID_EX

        byte[] credssp = { 0x30, 0x05, 0xa0, 0x03, 0x02, 0x01, 0x06 }; //a stray DER PDU is not slow-path, it is ignored
        rewriter.Observe(credssp);
        Assert.That(rewriter.Done, Is.False);

        rewriter.Observe(pdu);
        Assert.That(rewriter.Done, Is.True);
        Assert.That(BitConverter.ToUInt32(pdu, offset), Is.EqualTo(8u));

        (byte[] later, int laterOffset) = McsConnectInitial(1);
        rewriter.Observe(later);
        Assert.That(BitConverter.ToUInt32(later, laterOffset), Is.EqualTo(1u), "nothing is rewritten once done");
    }

    [Test]
    public void EncodeTSRequest_RoundTripsNegoTokenPubKeyAuthAndNonce() {
        byte[] nego = { 1, 2, 3, 4 };
        byte[] pub = { 5, 6, 7 };
        byte[] nonce = Enumerable.Range(0, 32).Select(i => (byte)i).ToArray();

        Rdp.TSRequest request = Rdp.DecodeTSRequest(Rdp.EncodeTSRequest(6, negoToken: nego, pubKeyAuth: pub, clientNonce: nonce));

        Assert.That(request.version, Is.EqualTo(6));
        Assert.That(request.negoToken, Is.EqualTo(nego));
        Assert.That(request.pubKeyAuth, Is.EqualTo(pub));
        Assert.That(request.clientNonce, Is.EqualTo(nonce));
        Assert.That(request.authInfo, Is.Null);
    }

    [Test]
    public void EncodeTSRequest_RoundTripsAuthInfo() {
        byte[] authInfo = { 9, 8, 7, 6 };
        Rdp.TSRequest request = Rdp.DecodeTSRequest(Rdp.EncodeTSRequest(3, authInfo: authInfo));

        Assert.That(request.version, Is.EqualTo(3));
        Assert.That(request.authInfo, Is.EqualTo(authInfo));
        Assert.That(request.negoToken, Is.Null);
        Assert.That(request.pubKeyAuth, Is.Null);
    }

    [Test]
    public void DecodeTSRequest_ReadsAnNtstatusErrorCode() {
        AsnWriter writer = new AsnWriter(AsnEncodingRules.DER);
        using (writer.PushSequence()) {
            using (writer.PushSequence(ContextTag(0))) writer.WriteInteger(6);
            using (writer.PushSequence(ContextTag(4))) writer.WriteInteger(0xC0000022u); //STATUS_ACCESS_DENIED
        }

        Rdp.TSRequest request = Rdp.DecodeTSRequest(writer.Encode());
        Assert.That(request.errorCode, Is.EqualTo(0xC0000022L));
    }

    [Test]
    public void EncodeTSCredentials_EncodesPasswordCredsAsUtf16() {
        AsnReader sequence = new AsnReader(Rdp.EncodeTSCredentials("CONTOSO", "alice", "s3cret"), AsnEncodingRules.DER).ReadSequence();

        Assert.That(sequence.ReadSequence(ContextTag(0)).ReadInteger(), Is.EqualTo(new System.Numerics.BigInteger(1))); //TSPasswordCreds

        AsnReader inner = new AsnReader(sequence.ReadSequence(ContextTag(1)).ReadOctetString(), AsnEncodingRules.DER).ReadSequence();
        Assert.That(inner.ReadSequence(ContextTag(0)).ReadOctetString(), Is.EqualTo(System.Text.Encoding.Unicode.GetBytes("CONTOSO")));
        Assert.That(inner.ReadSequence(ContextTag(1)).ReadOctetString(), Is.EqualTo(System.Text.Encoding.Unicode.GetBytes("alice")));
        Assert.That(inner.ReadSequence(ContextTag(2)).ReadOctetString(), Is.EqualTo(System.Text.Encoding.Unicode.GetBytes("s3cret")));
        Assert.That(sequence.HasData, Is.False);
    }

    [Test]
    public void ComputePublicKeyHash_IsSha256OfMagicNonceAndKey() {
        byte[] magic = System.Text.Encoding.ASCII.GetBytes("CredSSP Client-To-Server Binding Hash\0");
        byte[] nonce = Enumerable.Range(0, 32).Select(i => (byte)(i + 1)).ToArray();
        byte[] key = { 10, 20, 30, 40 };

        byte[] expected = System.Security.Cryptography.SHA256.HashData(magic.Concat(nonce).Concat(key).ToArray());
        Assert.That(Rdp.ComputePublicKeyHash(magic, nonce, key), Is.EqualTo(expected));
    }
}

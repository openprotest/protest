using System.Text;
using System.Threading.Channels;
using Protest.Protocols;

namespace Protest.Tests;

public class RtspTests {
    //SPS and PPS of a 320x240 H.264 baseline stream
    private static readonly byte[] SPS = { 0x67, 0x42, 0xc0, 0x1e, 0xd9, 0x00, 0xa0, 0x47, 0xfe, 0xc8 };
    private static readonly byte[] PPS = { 0x68, 0xce, 0x3c, 0x80 };

    //an H.265 main profile SPS, level 3.1, with emulation prevention bytes in the profile_tier_level
    private static readonly byte[] HEVC_SPS = { 0x42, 0x01, 0x01, 0x01, 0x60, 0x00, 0x00, 0x03, 0x00, 0x90, 0x00, 0x00, 0x03, 0x00, 0x00, 0x03, 0x00, 0x5d, 0xa0, 0x02, 0x80 };

    private static Rtsp.RtpPacket Packet(byte[] payload, ushort sequence, uint timestamp, bool marker) => new Rtsp.RtpPacket {
        marker      = marker,
        payloadType = 96,
        sequence    = sequence,
        timestamp   = timestamp,
        payload     = new ArraySegment<byte>(payload)
    };

    private static Dictionary<string, string> H264Fmtp() => Rtsp.ParseFmtp(
        $"packetization-mode=1;profile-level-id=42c01e;sprop-parameter-sets={Convert.ToBase64String(SPS)},{Convert.ToBase64String(PPS)}");

    private static byte[] AnnexB(params byte[][] nalUnits) {
        List<byte> data = new List<byte>();
        foreach (byte[] nal in nalUnits) {
            data.AddRange(new byte[] { 0, 0, 0, 1 });
            data.AddRange(nal);
        }
        return data.ToArray();
    }

    [TestCase("rtsp://10.0.0.5/Streaming/Channels/101", false, "10.0.0.5", 554, "rtsp://10.0.0.5/Streaming/Channels/101")]
    [TestCase("rtsps://camera.local:7441/abc", true, "camera.local", 7441, "rtsps://camera.local:7441/abc")]
    [TestCase("rtsps://camera.local/abc", true, "camera.local", 322, "rtsps://camera.local/abc")]
    [TestCase("rtsp://cam/cam/realmonitor?channel=1&subtype=0", false, "cam", 554, "rtsp://cam/cam/realmonitor?channel=1&subtype=0")]
    [TestCase("rtsp://[fe80::1]:8554/live", false, "fe80::1", 8554, "rtsp://[fe80::1]:8554/live")]
    [TestCase("RTSP://host", false, "host", 554, "rtsp://host/")]
    public void ParseUrl_ValidAddresses(string value, bool secure, string host, int port, string url) {
        Rtsp.Target target = Rtsp.ParseUrl(value);

        Assert.That(target, Is.Not.Null);
        Assert.That(target.secure, Is.EqualTo(secure));
        Assert.That(target.host, Is.EqualTo(host));
        Assert.That(target.port, Is.EqualTo(port));
        Assert.That(target.url, Is.EqualTo(url));
        Assert.That(target.username, Is.Empty);
    }

    [Test]
    public void ParseUrl_Credentials_AreDecodedAndRemovedFromTheUrl() {
        Rtsp.Target target = Rtsp.ParseUrl("rtsp://admin:p%40ss%3Aword@10.0.0.5:554/live");

        Assert.That(target.username, Is.EqualTo("admin"));
        Assert.That(target.password, Is.EqualTo("p@ss:word"));
        Assert.That(target.url, Is.EqualTo("rtsp://10.0.0.5:554/live"));
    }

    [TestCase("rtsps://10.1.5.224:7441/AbCdEf?enableSrtp", "rtsps://10.1.5.224:7441/AbCdEf")]
    [TestCase("rtsps://10.1.5.224:7441/AbCdEf?enableSrtp=1&channel=2", "rtsps://10.1.5.224:7441/AbCdEf?channel=2")]
    [TestCase("rtsps://10.1.5.224:7441/AbCdEf?channel=2&EnableSRTP", "rtsps://10.1.5.224:7441/AbCdEf?channel=2")]
    [TestCase("rtsps://10.1.5.224:7441/AbCdEf", "rtsps://10.1.5.224:7441/AbCdEf")]
    public void RemoveQueryParameter_DropsTheSrtpRequest(string value, string url) {
        Assert.That(Rtsp.RemoveQueryParameter(value, "enableSrtp"), Is.EqualTo(url));
    }

    [TestCase("m=video 0 RTP/SAVP 96\na=rtpmap:96 H264/90000\n")]
    [TestCase("m=video 0 RTP/AVP 96\na=rtpmap:96 H264/90000\na=crypto:1 AES_CM_128_HMAC_SHA1_80 inline:WVNfX19zZW1jdGwgKCkgewkyMjA7fQp9CnVubGVz\n")]
    [TestCase("a=key-mgmt:mikey AQAFgM0XflABAAAAAAAAAAAAAAsAyO\nm=video 0 RTP/AVP 96\na=rtpmap:96 H264/90000\n")]
    public void SelectVideoTrack_SrtpIsRecognized(string sdp) {
        Rtsp.Track track = Rtsp.SelectVideoTrack(Rtsp.ParseSdp(sdp), "rtsp://cam/", out _, out _);
        Assert.That(track.encrypted, Is.True);
    }

    [Test]
    public void SelectVideoTrack_PlainRtp_IsNotEncrypted() {
        Rtsp.Track track = Rtsp.SelectVideoTrack(Rtsp.ParseSdp("m=video 0 RTP/AVP 96\na=rtpmap:96 H264/90000\n"), "rtsp://cam/", out _, out _);
        Assert.That(track.encrypted, Is.False);
    }

    [TestCase(null)]
    [TestCase("")]
    [TestCase("http://10.0.0.5/live")]
    [TestCase("10.0.0.5/live")]
    [TestCase("rtsp:///live")]
    public void ParseUrl_InvalidAddresses_ReturnNull(string? value) {
        Assert.That(Rtsp.ParseUrl(value), Is.Null);
    }

    [Test]
    public void ParseConnectRequest_ReadsFields() {
        Rtsp.ConnectRequest? request = Rtsp.ParseConnectRequest("{\"url\":\"rtsp://host/live\",\"username\":\"admin\",\"password\":\"secret\",\"credential\":null}", out string error);

        Assert.That(error, Is.Null);
        Assert.That(request!.url, Is.EqualTo("rtsp://host/live"));
        Assert.That(request.username, Is.EqualTo("admin"));
        Assert.That(request.password, Is.EqualTo("secret"));
        Assert.That(request.credential, Is.Null);
    }

    [TestCase("not json")]
    [TestCase("[1,2]")]
    [TestCase("")]
    [TestCase("{\"username\":\"admin\"}")]                                                   //no address
    [TestCase("{\"url\":\"rtsp://host/\",\"url\":\"rtsp://other/\"}")]                        //a field twice
    [TestCase("{\"url\":\"rtsp://host/\",\"extra\":\"x\"}")]                                  //an unknown field
    [TestCase("{\"url\":\"rtsp://host/\",\"username\":5}")]                                   //not a string
    [TestCase("{\"url\":\"rtsp://host/\",\"credential\":\"not-a-guid\"}")]
    [TestCase("{\"url\":\"rtsp://host/\",\"credential\":\"6c1c3c8e-2b43-4a51-9c7e-6c5f3f0a1d2b\",\"username\":\"admin\"}")] //both kinds of credentials
    [TestCase("{\"url\":\"rtsp://host/\",\"username\":\"admin\\r\\nX-Injected: 1\"}")]     //a line break in the username
    [TestCase("{\"url\":\"rtsp://host/\",\"password\":\"pass\\u0000word\"}")]
    public void ParseConnectRequest_Invalid_ReturnsNull(string json) {
        Assert.That(Rtsp.ParseConnectRequest(json, out string error), Is.Null);
        Assert.That(error, Is.Not.Null);
    }

    [Test]
    public void ParseConnectRequest_TooLong_ReturnsNull() {
        string url = "rtsp://host/" + new string('a', 3000);
        Assert.That(Rtsp.ParseConnectRequest($"{{\"url\":\"{url}\"}}", out _), Is.Null);
        Assert.That(Rtsp.ParseConnectRequest($"{{\"url\":\"rtsp://host/\",\"username\":\"{new string('u', 300)}\"}}", out _), Is.Null);
    }

    [TestCase("rtsp://cam/live.sdp", "trackID=1", "rtsp://cam/live.sdp/trackID=1")]
    [TestCase("rtsp://cam/live/", "trackID=1", "rtsp://cam/live/trackID=1")]
    [TestCase("rtsp://cam/cam/realmonitor?channel=1&subtype=0/", "trackID=0", "rtsp://cam/cam/realmonitor?channel=1&subtype=0/trackID=0")]
    [TestCase("rtsp://cam/live", "*", "rtsp://cam/live")]
    [TestCase("rtsp://cam/live", null, "rtsp://cam/live")]
    [TestCase("rtsp://cam/live", "rtsp://user:pass@cam/live/video", "rtsp://cam/live/video")]
    public void ResolveControl(string baseUrl, string? control, string expected) {
        Assert.That(Rtsp.ResolveControl(baseUrl, control), Is.EqualTo(expected));
    }

    [Test]
    public void SelectVideoTrack_PicksTheVideoStreamAndDescribesTheAudio() {
        string sdp = String.Join("\r\n",
            "v=0",
            "o=- 1 1 IN IP4 10.0.0.5",
            "s=Media Presentation",
            "a=control:*",
            "m=video 0 RTP/AVP 96",
            "a=rtpmap:96 H264/90000",
            "a=fmtp:96 profile-level-id=420029; packetization-mode=1; sprop-parameter-sets=Z0IAKeKQFAe2AtwEBAaQeJEV,aM48gA==",
            "a=control:trackID=1",
            "m=audio 0 RTP/AVP 8",
            "a=control:trackID=2",
            "");

        Rtsp.SessionDescription description = Rtsp.ParseSdp(sdp);
        Rtsp.Track track = Rtsp.SelectVideoTrack(description, "rtsp://cam/live/", out string audio, out string unsupported);

        Assert.That(description.control, Is.EqualTo("*"));
        Assert.That(track, Is.Not.Null);
        Assert.That(track.codec, Is.EqualTo("H264"));
        Assert.That(track.payloadType, Is.EqualTo(96));
        Assert.That(track.clockRate, Is.EqualTo(90000));
        Assert.That(track.control, Is.EqualTo("rtsp://cam/live/trackID=1"));
        Assert.That(track.fmtp["packetization-mode"], Is.EqualTo("1"));
        Assert.That(track.fmtp["sprop-parameter-sets"], Is.EqualTo("Z0IAKeKQFAe2AtwEBAaQeJEV,aM48gA=="));
        Assert.That(audio, Is.EqualTo("PCMA/8000"));
        Assert.That(unsupported, Is.Null);
    }

    [Test]
    public void SelectVideoTrack_StaticJpegPayloadType() {
        Rtsp.SessionDescription description = Rtsp.ParseSdp("m=video 0 RTP/AVP 26\na=control:video\na=x-dimensions:2560,1440\n");
        Rtsp.Track track = Rtsp.SelectVideoTrack(description, "rtsp://cam/mjpeg", out _, out _);

        Assert.That(track.codec, Is.EqualTo("JPEG"));
        Assert.That(track.payloadType, Is.EqualTo(26));
        Assert.That(track.control, Is.EqualTo("rtsp://cam/mjpeg/video"));
        Assert.That(track.width, Is.EqualTo(2560));
        Assert.That(track.height, Is.EqualTo(1440));
    }

    [Test]
    public void SelectVideoTrack_FallsBackToASupportedFormat_AndNamesTheUnsupportedOne() {
        Rtsp.SessionDescription description = Rtsp.ParseSdp("m=video 0 RTP/AVP 97 98\na=rtpmap:97 MP4V-ES/90000\na=rtpmap:98 H265/90000\n");
        Rtsp.Track track = Rtsp.SelectVideoTrack(description, "rtsp://cam/", out _, out string unsupported);

        Assert.That(track.codec, Is.EqualTo("H265"));
        Assert.That(track.payloadType, Is.EqualTo(98));
        Assert.That(unsupported, Is.EqualTo("MP4V-ES"));
    }

    [Test]
    public void SelectVideoTrack_NoSupportedVideo_ReturnsNull() {
        Rtsp.SessionDescription description = Rtsp.ParseSdp("m=video 0 RTP/AVP 97\na=rtpmap:97 MP4V-ES/90000\n");
        Assert.That(Rtsp.SelectVideoTrack(description, "rtsp://cam/", out _, out string unsupported), Is.Null);
        Assert.That(unsupported, Is.EqualTo("MP4V-ES"));
    }

    [TestCase("RTP/AVP/TCP;unicast;interleaved=0-1", 0, 1)]
    [TestCase("RTP/AVP/TCP;unicast;interleaved=4-5;ssrc=1234ABCD", 4, 5)]
    [TestCase("RTP/AVP/TCP;interleaved=2", 2, 3)]
    public void TryParseTransport(string transport, int rtp, int rtcp) {
        Assert.That(Rtsp.TryParseTransport(transport, out int rtpChannel, out int rtcpChannel), Is.True);
        Assert.That(rtpChannel, Is.EqualTo(rtp));
        Assert.That(rtcpChannel, Is.EqualTo(rtcp));
    }

    [TestCase(null)]
    [TestCase("")]
    [TestCase("RTP/AVP;unicast;client_port=5000-5001")]                       //UDP, not interleaved
    [TestCase("RTP/AVP/TCP;unicast")]                                         //no channels
    [TestCase("RTP/AVP/TCP;interleaved=300-301")]                             //out of range
    [TestCase("RTP/AVP/TCP;interleaved=255")]                                 //RTCP would be 256
    [TestCase("RTP/AVP/TCP;interleaved=2-2")]                                 //the same channel twice
    [TestCase("RTP/AVP/TCP;interleaved=0-1-2")]
    [TestCase("RTP/AVP/TCP;interleaved=a-b")]
    [TestCase("RTP/AVP/TCP;interleaved=0-1;interleaved=2-3")]                 //ambiguous
    [TestCase("RTP/AVP/TCP;interleaved=0-1,RTP/AVP/TCP;interleaved=2-3")]     //two transports
    [TestCase("RTP/AVP/TCP;multicast;interleaved=0-1")]
    public void TryParseTransport_Invalid(string? transport) {
        Assert.That(Rtsp.TryParseTransport(transport, out _, out _), Is.False);
    }

    [TestCase("12345678;timeout=30", "12345678", 30)]
    [TestCase("ABCDEF", "ABCDEF", 60)]
    [TestCase(" 42 ; timeout=10 ", "42", 10)]
    [TestCase("42;timeout=0", "42", 4)]              //kept within bounds
    [TestCase("42;timeout=999999", "42", 3600)]
    [TestCase("a$b-c_d.e+f", "a$b-c_d.e+f", 60)]
    public void TryParseSessionHeader(string header, string id, int timeout) {
        Assert.That(Rtsp.TryParseSessionHeader(header, out string sessionId, out int sessionTimeout), Is.True);
        Assert.That(sessionId, Is.EqualTo(id));
        Assert.That(sessionTimeout, Is.EqualTo(timeout));
    }

    [TestCase(null)]
    [TestCase("")]
    [TestCase("abc def")]
    [TestCase("abc\r\nX-Injected: 1")]
    [TestCase("abc,def")]
    [TestCase("abc\"def")]
    public void TryParseSessionHeader_InvalidIds(string? header) {
        Assert.That(Rtsp.TryParseSessionHeader(header, out _, out _), Is.False);
    }

    [Test]
    public void TryParseSessionHeader_TooLongId() {
        Assert.That(Rtsp.TryParseSessionHeader(new string('a', 257), out _, out _), Is.False);
        Assert.That(Rtsp.TryParseSessionHeader(new string('a', 256), out _, out _), Is.True);
    }

    [Test]
    public void DigestResponse_Rfc2617Example() {
        string response = Rtsp.Authenticator.DigestResponse(null, "Mufasa", "testrealm@host.com", "Circle Of Life",
            "GET", "/dir/index.html", "dcd98b7102dd2f0e8b11d0f600bfb0c093", "00000001", "0a4f113b", "auth");

        Assert.That(response, Is.EqualTo("6629fae49393a05397450978507c4ef1"));
    }

    [Test]
    public void Authenticator_PrefersDigestOverBasic() {
        Rtsp.Authenticator authenticator = new Rtsp.Authenticator("admin", "secret");

        bool supported = authenticator.SetChallenge(new[] {
            "Basic realm=\"camera\"",
            "Digest realm=\"camera\", nonce=\"abc, def\", stale=FALSE"
        }, out bool stale);

        string header = authenticator.GetAuthorization("DESCRIBE", "rtsp://cam/live");
        string expected = Rtsp.Authenticator.DigestResponse(null, "admin", "camera", "secret", "DESCRIBE", "rtsp://cam/live", "abc, def", null, null, null);

        Assert.That(supported, Is.True);
        Assert.That(stale, Is.False);
        Assert.That(header, Does.StartWith("Digest username=\"admin\", realm=\"camera\", nonce=\"abc, def\", uri=\"rtsp://cam/live\""));
        Assert.That(header, Does.Contain($"response=\"{expected}\""));
    }

    [Test]
    public void Authenticator_Basic() {
        Rtsp.Authenticator authenticator = new Rtsp.Authenticator("admin", "secret");
        authenticator.SetChallenge(new[] { "Basic realm=\"camera\"" }, out _);

        Assert.That(authenticator.GetAuthorization("OPTIONS", "rtsp://cam/"), Is.EqualTo("Basic YWRtaW46c2VjcmV0"));
    }

    [Test]
    public void Authenticator_NoChallengeOrCredentials_SendsNothing() {
        Assert.That(new Rtsp.Authenticator("admin", "secret").GetAuthorization("OPTIONS", "rtsp://cam/"), Is.Null);

        Rtsp.Authenticator anonymous = new Rtsp.Authenticator("", "");
        anonymous.SetChallenge(new[] { "Basic realm=\"camera\"" }, out _);
        Assert.That(anonymous.GetAuthorization("OPTIONS", "rtsp://cam/"), Is.Null);
    }

    [Test]
    public void Authenticator_UnsupportedChallenge_ReturnsFalse() {
        Assert.That(new Rtsp.Authenticator("admin", "secret").SetChallenge(new[] { "Negotiate abc" }, out _), Is.False);
    }

    [Test]
    public void ParseParameters_QuotedValuesKeepCommasAndEscapes() {
        Dictionary<string, string> parameters = Rtsp.Authenticator.ParseParameters("realm=\"a, \\\"b\\\"\", nonce=xyz ,qop=\"auth,auth-int\"");

        Assert.That(parameters["realm"], Is.EqualTo("a, \"b\""));
        Assert.That(parameters["nonce"], Is.EqualTo("xyz"));
        Assert.That(parameters["qop"], Is.EqualTo("auth,auth-int"));
    }

    [Test]
    public async Task Connection_ReadsInterleavedPacketsAndResponses() {
        byte[] response = Encoding.ASCII.GetBytes("RTSP/1.0 200 OK\r\nCSeq: 3\r\nContent-Base: rtsp://cam/live/\r\nContent-Length: 4\r\n\r\nv=0\n");

        List<byte> data = new List<byte>();
        data.AddRange(new byte[] { (byte)'$', 0, 0, 3, 7, 8, 9 });
        data.AddRange(new byte[] { 0x0d, 0x0a }); //stray bytes between messages
        data.AddRange(response);
        data.AddRange(new byte[] { (byte)'$', 1, 0, 1, 42 });

        using Rtsp.Connection connection = new Rtsp.Connection(new MemoryStream(data.ToArray()));

        Rtsp.Message packet = await connection.ReadAsync(CancellationToken.None);
        Assert.That(packet.kind, Is.EqualTo(Rtsp.MessageKind.Interleaved));
        Assert.That(packet.channel, Is.EqualTo(0));
        Assert.That(packet.payload.ToArray(), Is.EqualTo(new byte[] { 7, 8, 9 }));

        Rtsp.Message message = await connection.ReadAsync(CancellationToken.None);
        Assert.That(message.kind, Is.EqualTo(Rtsp.MessageKind.Response));
        Assert.That(message.status, Is.EqualTo(200));
        Assert.That(message.CSeq, Is.EqualTo(3));
        Assert.That(message.Header("content-base"), Is.EqualTo("rtsp://cam/live/"));
        Assert.That(Encoding.ASCII.GetString(message.body), Is.EqualTo("v=0\n"));

        Rtsp.Message rtcp = await connection.ReadAsync(CancellationToken.None);
        Assert.That(rtcp.channel, Is.EqualTo(1));
        Assert.That(rtcp.payload.ToArray(), Is.EqualTo(new byte[] { 42 }));

        Assert.That(await connection.ReadAsync(CancellationToken.None), Is.Null);
    }

    [Test]
    public async Task Connection_ReadsRequestsFromTheServer() {
        byte[] request = Encoding.ASCII.GetBytes("GET_PARAMETER rtsp://client/ RTSP/1.0\nCSeq: 9\n\n");
        using Rtsp.Connection connection = new Rtsp.Connection(new MemoryStream(request));

        Rtsp.Message message = await connection.ReadAsync(CancellationToken.None);

        Assert.That(message.kind, Is.EqualTo(Rtsp.MessageKind.Request));
        Assert.That(message.method, Is.EqualTo("GET_PARAMETER"));
        Assert.That(message.CSeq, Is.EqualTo(9));
    }

    [Test]
    public void RtpPacket_SkipsContributingSourcesExtensionAndPadding() {
        byte[] data = {
            0xb1, 0xe0, 0x12, 0x34,  //version 2, padding, extension, one csrc, marker, payload type 96
            0x00, 0x00, 0x10, 0x00,  //timestamp
            0xde, 0xad, 0xbe, 0xef,  //ssrc
            0x00, 0x00, 0x00, 0x01,  //csrc
            0xbe, 0xde, 0x00, 0x01,  //extension of one word
            0x11, 0x22, 0x33, 0x44,
            0x65, 0x66,              //payload
            0x00, 0x02               //padding
        };

        Assert.That(Rtsp.RtpPacket.TryParse(new ArraySegment<byte>(data), out Rtsp.RtpPacket packet), Is.True);
        Assert.That(packet.marker, Is.True);
        Assert.That(packet.payloadType, Is.EqualTo(96));
        Assert.That(packet.sequence, Is.EqualTo(0x1234));
        Assert.That(packet.timestamp, Is.EqualTo(0x1000));
        Assert.That(packet.payload.ToArray(), Is.EqualTo(new byte[] { 0x65, 0x66 }));
    }

    [Test]
    public void RtpPacket_RejectsOtherVersionsAndShortPackets() {
        Assert.That(Rtsp.RtpPacket.TryParse(new ArraySegment<byte>(new byte[12] { 0x40, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 }), out _), Is.False);
        Assert.That(Rtsp.RtpPacket.TryParse(new ArraySegment<byte>(new byte[] { 0x80, 0x60 }), out _), Is.False);
    }

    [Test]
    public void H264_KeyFrame_CarriesTheParameterSetsFromTheSdp() {
        Rtsp.H264Depacketizer depacketizer = new Rtsp.H264Depacketizer(H264Fmtp());
        List<Rtsp.Frame> frames = new List<Rtsp.Frame>();
        byte[] idr = { 0x65, 0x88, 0x84, 0x00 };

        depacketizer.Push(Packet(idr, 1, 3000, true), frames);

        Assert.That(frames, Has.Count.EqualTo(1));
        Assert.That(frames[0].key, Is.True);
        Assert.That(frames[0].timestamp, Is.EqualTo(3000));
        Assert.That(frames[0].codec, Is.EqualTo("avc1.42c01e"));
        Assert.That(frames[0].data, Is.EqualTo(AnnexB(SPS, PPS, idr)));
    }

    [Test]
    public void H264_FuA_IsReassembled_AndInBandParameterSetsArentDuplicated() {
        Rtsp.H264Depacketizer depacketizer = new Rtsp.H264Depacketizer(null);
        List<Rtsp.Frame> frames = new List<Rtsp.Frame>();

        //STAP-A with the SPS and PPS
        List<byte> stap = new List<byte> { 0x78, 0, (byte)SPS.Length };
        stap.AddRange(SPS);
        stap.AddRange(new byte[] { 0, (byte)PPS.Length });
        stap.AddRange(PPS);

        depacketizer.Push(Packet(stap.ToArray(), 10, 9000, false), frames);
        depacketizer.Push(Packet(new byte[] { 0x7c, 0x85, 0xaa, 0xbb }, 11, 9000, false), frames); //FU-A start of an IDR
        depacketizer.Push(Packet(new byte[] { 0x7c, 0x05, 0xcc }, 12, 9000, false), frames);
        depacketizer.Push(Packet(new byte[] { 0x7c, 0x45, 0xdd }, 13, 9000, true), frames);

        Assert.That(frames, Has.Count.EqualTo(1));
        Assert.That(frames[0].key, Is.True);
        Assert.That(frames[0].data, Is.EqualTo(AnnexB(SPS, PPS, new byte[] { 0x65, 0xaa, 0xbb, 0xcc, 0xdd })));
    }

    [Test]
    public void H264_DeltaFramesBeforeTheFirstKeyFrame_AreDropped() {
        Rtsp.H264Depacketizer depacketizer = new Rtsp.H264Depacketizer(H264Fmtp());
        List<Rtsp.Frame> frames = new List<Rtsp.Frame>();

        depacketizer.Push(Packet(new byte[] { 0x41, 0x9a }, 1, 0, true), frames);
        depacketizer.Push(Packet(new byte[] { 0x65, 0x88 }, 2, 3000, true), frames);
        depacketizer.Push(Packet(new byte[] { 0x41, 0x9b }, 3, 6000, true), frames);

        Assert.That(frames, Has.Count.EqualTo(2));
        Assert.That(frames[0].key, Is.True);
        Assert.That(frames[1].key, Is.False);
        Assert.That(frames[1].codec, Is.Null);
        Assert.That(frames[1].data, Is.EqualTo(AnnexB(new byte[] { 0x41, 0x9b })));
    }

    [Test]
    public void H264_AfterALoss_FramesAreHeldBackUpToTheNextKeyFrame() {
        Rtsp.H264Depacketizer depacketizer = new Rtsp.H264Depacketizer(H264Fmtp());
        List<Rtsp.Frame> frames = new List<Rtsp.Frame>();

        depacketizer.Push(Packet(new byte[] { 0x65, 0x88 }, 1, 0, true), frames);
        depacketizer.Push(Packet(new byte[] { 0x41, 0x9a }, 3, 3000, true), frames); //packet 2 was lost
        depacketizer.Push(Packet(new byte[] { 0x41, 0x9b }, 4, 6000, true), frames);
        depacketizer.Push(Packet(new byte[] { 0x65, 0x89 }, 5, 9000, true), frames);

        Assert.That(frames.Select(o => o.timestamp), Is.EqualTo(new uint[] { 0, 9000 }));
    }

    [Test]
    public void H264_FuAWithoutItsStart_IsDropped() {
        Rtsp.H264Depacketizer depacketizer = new Rtsp.H264Depacketizer(H264Fmtp());
        List<Rtsp.Frame> frames = new List<Rtsp.Frame>();

        depacketizer.Push(Packet(new byte[] { 0x7c, 0x05, 0xcc }, 1, 0, false), frames);
        depacketizer.Push(Packet(new byte[] { 0x7c, 0x45, 0xdd }, 2, 0, true), frames);

        Assert.That(frames, Is.Empty);
    }

    [Test]
    public void H264_MissingMarker_TheTimestampEndsTheAccessUnit() {
        Rtsp.H264Depacketizer depacketizer = new Rtsp.H264Depacketizer(H264Fmtp());
        List<Rtsp.Frame> frames = new List<Rtsp.Frame>();

        depacketizer.Push(Packet(new byte[] { 0x65, 0x88 }, 1, 0, false), frames);
        depacketizer.Push(Packet(new byte[] { 0x41, 0x9a }, 2, 3000, false), frames);

        Assert.That(frames, Has.Count.EqualTo(1));
        Assert.That(frames[0].timestamp, Is.EqualTo(0));
    }

    [Test]
    public void H264_ImplausibleSps_IsIgnored() {
        Rtsp.H264Depacketizer depacketizer = new Rtsp.H264Depacketizer(H264Fmtp());
        List<Rtsp.Frame> frames = new List<Rtsp.Frame>();

        //an SPS with an undefined profile and level, as decrypted garbage would have
        byte[] garbage = { 0x67, 0x13, 0x5a, 0xee, 0x01 };
        depacketizer.Push(Packet(garbage, 1, 0, false), frames);
        depacketizer.Push(Packet(new byte[] { 0x65, 0x88 }, 2, 0, true), frames);

        Assert.That(frames, Has.Count.EqualTo(1));
        Assert.That(frames[0].codec, Is.EqualTo("avc1.42c01e"));
        Assert.That(Rtsp.H264Depacketizer.IsPlausibleSps(SPS), Is.True);
        Assert.That(Rtsp.H264Depacketizer.IsPlausibleSps(garbage), Is.False);
    }

    [TestCase(new byte[] { 0x67, 0x42, 0xd3, 0x1e }, false)] //reserved bits set
    [TestCase(new byte[] { 0x67, 0x42, 0xc0, 0x39 }, false)] //level 5.7 doesn't exist
    [TestCase(new byte[] { 0x67, 0x64, 0x00, 0x33 }, true)]  //High 5.1
    [TestCase(new byte[] { 0x67, 0x4d, 0x40, 0x28 }, true)]  //Main 4.0
    public void H264_IsPlausibleSps(byte[] sps, bool expected) {
        Assert.That(Rtsp.H264Depacketizer.IsPlausibleSps(sps), Is.EqualTo(expected));
    }

    [Test]
    public void H264_ForbiddenBit_DropsTheAccessUnit() {
        Rtsp.H264Depacketizer depacketizer = new Rtsp.H264Depacketizer(H264Fmtp());
        List<Rtsp.Frame> frames = new List<Rtsp.Frame>();

        depacketizer.Push(Packet(new byte[] { 0xe5, 0x88 }, 1, 0, true), frames);    //an "IDR" with the forbidden bit
        depacketizer.Push(Packet(new byte[] { 0x65, 0x88 }, 2, 3000, true), frames);

        Assert.That(frames.Select(o => o.timestamp), Is.EqualTo(new uint[] { 3000 }));
    }

    [Test]
    public void H265_CodecString_UndefinedProfile_IsNull() {
        byte[] sps = (byte[])HEVC_SPS.Clone();
        sps[3] = 0x1f; //profile 31
        Assert.That(Rtsp.H265Depacketizer.CodecString(sps), Is.Null);
    }

    [Test]
    public void H265_CodecString() {
        Assert.That(Rtsp.H265Depacketizer.CodecString(HEVC_SPS), Is.EqualTo("hev1.1.6.L93.90"));
    }

    [Test]
    public void H265_FragmentationUnit_IsReassembled() {
        byte[] vps = { 0x40, 0x01, 0x0c };
        byte[] pps = { 0x44, 0x01, 0xc1 };
        Dictionary<string, string> fmtp = Rtsp.ParseFmtp(
            $"sprop-vps={Convert.ToBase64String(vps)};sprop-sps={Convert.ToBase64String(HEVC_SPS)};sprop-pps={Convert.ToBase64String(pps)}");

        Rtsp.H265Depacketizer depacketizer = new Rtsp.H265Depacketizer(fmtp);
        List<Rtsp.Frame> frames = new List<Rtsp.Frame>();

        //an IDR_W_RADL (19) in two fragments
        depacketizer.Push(Packet(new byte[] { 0x62, 0x01, 0x93, 0xaa, 0xbb }, 100, 0, false), frames);
        depacketizer.Push(Packet(new byte[] { 0x62, 0x01, 0x53, 0xcc }, 101, 0, true), frames);

        Assert.That(frames, Has.Count.EqualTo(1));
        Assert.That(frames[0].key, Is.True);
        Assert.That(frames[0].codec, Is.EqualTo("hev1.1.6.L93.90"));
        Assert.That(frames[0].data, Is.EqualTo(AnnexB(vps, HEVC_SPS, pps, new byte[] { 0x26, 0x01, 0xaa, 0xbb, 0xcc })));
    }

    [Test]
    public void H265_AggregationPacket_IsSplit() {
        Rtsp.H265Depacketizer depacketizer = new Rtsp.H265Depacketizer(null);
        List<Rtsp.Frame> frames = new List<Rtsp.Frame>();

        byte[] vps = { 0x40, 0x01, 0x0c };
        byte[] pps = { 0x44, 0x01, 0xc1 };
        List<byte> ap = new List<byte> { 0x60, 0x01 };
        foreach (byte[] nal in new[] { vps, HEVC_SPS, pps }) {
            ap.AddRange(new byte[] { 0, (byte)nal.Length });
            ap.AddRange(nal);
        }

        depacketizer.Push(Packet(ap.ToArray(), 1, 0, false), frames);
        depacketizer.Push(Packet(new byte[] { 0x26, 0x01, 0xaf }, 2, 0, true), frames);

        Assert.That(frames, Has.Count.EqualTo(1));
        Assert.That(frames[0].data, Is.EqualTo(AnnexB(vps, HEVC_SPS, pps, new byte[] { 0x26, 0x01, 0xaf })));
    }

    [Test]
    public void Jpeg_MakeTables_Quality50_IsTheStandardTableInZigZagOrder() {
        byte[] tables = Rtsp.JpegDepacketizer.MakeTables(50);

        Assert.That(tables, Has.Length.EqualTo(128));
        Assert.That(tables.Take(8), Is.EqualTo(new byte[] { 16, 11, 12, 14, 12, 10, 16, 14 }));
        Assert.That(tables.Skip(64).Take(8), Is.EqualTo(new byte[] { 17, 18, 18, 24, 21, 24, 47, 26 }));
        Assert.That(tables[63], Is.EqualTo(99));
    }

    [Test]
    public void Jpeg_HuffmanTables_MatchTheirCodeCounts() {
        Assert.That(Rtsp.JpegDepacketizer.LUMA_DC_CODES.Sum(o => o), Is.EqualTo(Rtsp.JpegDepacketizer.LUMA_DC_SYMBOLS.Length));
        Assert.That(Rtsp.JpegDepacketizer.LUMA_AC_CODES.Sum(o => o), Is.EqualTo(Rtsp.JpegDepacketizer.LUMA_AC_SYMBOLS.Length));
        Assert.That(Rtsp.JpegDepacketizer.CHROMA_DC_CODES.Sum(o => o), Is.EqualTo(Rtsp.JpegDepacketizer.CHROMA_DC_SYMBOLS.Length));
        Assert.That(Rtsp.JpegDepacketizer.CHROMA_AC_CODES.Sum(o => o), Is.EqualTo(Rtsp.JpegDepacketizer.CHROMA_AC_SYMBOLS.Length));
        Assert.That(Rtsp.JpegDepacketizer.LUMA_AC_SYMBOLS.Distinct().Count(), Is.EqualTo(162));
        Assert.That(Rtsp.JpegDepacketizer.CHROMA_AC_SYMBOLS.Distinct().Count(), Is.EqualTo(162));
    }

    [Test]
    public void Jpeg_FragmentsAreJoinedIntoAnImage() {
        Rtsp.JpegDepacketizer depacketizer = new Rtsp.JpegDepacketizer(0, 0);
        List<Rtsp.Frame> frames = new List<Rtsp.Frame>();

        //type 1, Q 80, 640x480, in two fragments
        depacketizer.Push(Packet(new byte[] { 0, 0, 0, 0, 1, 80, 80, 60, 0xa1, 0xa2 }, 1, 0, false), frames);
        depacketizer.Push(Packet(new byte[] { 0, 0, 0, 2, 1, 80, 80, 60, 0xa3 }, 2, 0, true), frames);

        Assert.That(frames, Has.Count.EqualTo(1));
        byte[] jpeg = frames[0].data;

        Assert.That(frames[0].key, Is.True);
        Assert.That(frames[0].codec, Is.EqualTo("jpeg"));
        Assert.That(jpeg.Take(2), Is.EqualTo(new byte[] { 0xff, 0xd8 }));
        Assert.That(jpeg.TakeLast(5), Is.EqualTo(new byte[] { 0xa1, 0xa2, 0xa3, 0xff, 0xd9 }));

        int sof = IndexOf(jpeg, new byte[] { 0xff, 0xc0 });
        Assert.That(sof, Is.GreaterThan(0));
        Assert.That(jpeg[sof + 5] << 8 | jpeg[sof + 6], Is.EqualTo(480));
        Assert.That(jpeg[sof + 7] << 8 | jpeg[sof + 8], Is.EqualTo(640));
        Assert.That(jpeg[sof + 11], Is.EqualTo(0x22)); //4:2:0
    }

    [Test]
    public void Jpeg_InBandTablesAndRestartMarkers() {
        Rtsp.JpegDepacketizer depacketizer = new Rtsp.JpegDepacketizer(0, 0);
        List<Rtsp.Frame> frames = new List<Rtsp.Frame>();

        List<byte> payload = new List<byte> { 0, 0, 0, 0, 64, 255, 40, 30 }; //type 64 (type 0 with restart markers), Q 255, 320x240
        payload.AddRange(new byte[] { 0, 8, 0xff, 0xff });                   //restart interval of 8
        payload.AddRange(new byte[] { 0, 0, 0, 128 });                       //two 8 bit tables
        payload.AddRange(Enumerable.Repeat((byte)7, 128));
        payload.AddRange(new byte[] { 0xb1, 0xb2 });

        depacketizer.Push(Packet(payload.ToArray(), 1, 0, true), frames);

        Assert.That(frames, Has.Count.EqualTo(1));
        byte[] jpeg = frames[0].data;

        int dqt = IndexOf(jpeg, new byte[] { 0xff, 0xdb });
        Assert.That(jpeg[dqt + 5], Is.EqualTo(7));
        Assert.That(IndexOf(jpeg, new byte[] { 0xff, 0xdd, 0x00, 0x04, 0x00, 0x08 }), Is.GreaterThan(0));

        int sof = IndexOf(jpeg, new byte[] { 0xff, 0xc0 });
        Assert.That(jpeg[sof + 11], Is.EqualTo(0x21)); //4:2:2
    }

    [Test]
    public void Jpeg_MissingFirstFragment_IsDropped() {
        Rtsp.JpegDepacketizer depacketizer = new Rtsp.JpegDepacketizer(0, 0);
        List<Rtsp.Frame> frames = new List<Rtsp.Frame>();

        depacketizer.Push(Packet(new byte[] { 0, 0, 0, 2, 1, 80, 80, 60, 0xa3 }, 2, 0, true), frames);
        depacketizer.Push(Packet(new byte[] { 0, 0, 0, 0, 1, 80, 80, 60, 0xa1 }, 3, 3000, true), frames);

        Assert.That(frames, Has.Count.EqualTo(1));
        Assert.That(frames[0].timestamp, Is.EqualTo(3000));
    }

    private static Rtsp.Frame QueueFrame(bool key, uint timestamp, int size = 1) =>
        new Rtsp.Frame { data = new byte[size], key = key, timestamp = timestamp, codec = key ? "avc1.42c01e" : null };

    //what the sender does with each message
    private static Rtsp.OutgoingMessage? SendNext(Rtsp.FrameQueue queue) {
        if (!queue.Reader.TryRead(out Rtsp.OutgoingMessage? message)) return null;
        queue.SendStarted();
        queue.Sent(message);
        return message;
    }

    [Test]
    public void FrameQueue_AnnouncesTheCodecOnce_AndDropsDeltaFramesUpToAKeyFrameWhenFull() {
        Rtsp.FrameQueue queue = new Rtsp.FrameQueue(90000);

        queue.Enqueue(QueueFrame(true, 0));
        queue.Enqueue(QueueFrame(false, 3000));
        queue.Enqueue(QueueFrame(true, 6000));

        List<Rtsp.OutgoingMessage> messages = new List<Rtsp.OutgoingMessage>();
        while (SendNext(queue) is Rtsp.OutgoingMessage message) messages.Add(message);

        Assert.That(messages, Has.Count.EqualTo(4));
        Assert.That(messages[0].isText, Is.True);
        Assert.That(Encoding.UTF8.GetString(messages[0].data), Is.EqualTo("{\"codec\":\"avc1.42c01e\"}"));
        Assert.That(messages.Skip(1).All(o => !o.isText), Is.True);
        Assert.That(messages[2].data[1], Is.EqualTo(0)); //delta
        Assert.That(System.Buffers.Binary.BinaryPrimitives.ReadDoubleBigEndian(messages[2].data.AsSpan(2)), Is.EqualTo(1000d / 30 * 1000).Within(0.001));
        Assert.That(queue.QueuedFrames, Is.Zero);

        //nothing is sent, the queue is full past this point
        for (uint i = 0; queue.QueuedFrames < 32; i++) queue.Enqueue(QueueFrame(true, 9000 + i));

        queue.Enqueue(QueueFrame(false, 20000));
        Assert.That(queue.QueuedFrames, Is.EqualTo(32));

        for (int i = 0; i < 10; i++) SendNext(queue);
        queue.Enqueue(QueueFrame(false, 23000)); //still waiting for a key frame
        Assert.That(queue.QueuedFrames, Is.EqualTo(22));

        queue.Enqueue(QueueFrame(true, 26000));
        queue.Enqueue(QueueFrame(false, 29000));
        Assert.That(queue.QueuedFrames, Is.EqualTo(24));
        Assert.That(queue.DroppedFrames, Is.EqualTo(2));
    }

    [Test]
    public void FrameQueue_QueuedBytesStayBounded() {
        Rtsp.FrameQueue queue = new Rtsp.FrameQueue(90000);

        for (uint i = 0; i < 40; i++) queue.Enqueue(QueueFrame(true, i * 3000, 4 * 1024 * 1024));

        Assert.That(queue.QueuedBytes, Is.LessThanOrEqualTo(64L * 1024 * 1024));
        Assert.That(queue.QueuedFrames, Is.LessThan(16));
        Assert.That(queue.DroppedFrames, Is.GreaterThan(24));
    }

    [Test]
    public void FrameQueue_TextIsBounded_AndTheClosingErrorAlwaysFits() {
        Rtsp.FrameQueue queue = new Rtsp.FrameQueue(90000);

        for (uint i = 0; queue.QueuedFrames < 32; i++) queue.Enqueue(QueueFrame(true, i));

        int accepted = 0;
        for (int i = 0; i < 10; i++) {
            if (queue.Statistics(i, i)) accepted++;
        }
        Assert.That(accepted, Is.LessThanOrEqualTo(4));

        queue.Error("The camera closed the connection");
        queue.Error("A second error is ignored");
        queue.Complete();

        List<string> texts = new List<string>();
        while (SendNext(queue) is Rtsp.OutgoingMessage message) {
            if (message.isText) texts.Add(Encoding.UTF8.GetString(message.data));
        }

        Assert.That(texts.Last(), Is.EqualTo("{\"error\":\"The camera closed the connection\"}"));
        Assert.That(texts.Count(o => o.Contains("error")), Is.EqualTo(1));
        Assert.That(queue.QueuedFrames, Is.Zero);
        Assert.That(queue.QueuedBytes, Is.Zero);
    }

    [Test]
    public void FrameQueue_TimestampsCarryOverTheWrapAround() {
        Rtsp.FrameQueue queue = new Rtsp.FrameQueue(90000);

        queue.Enqueue(new Rtsp.Frame { data = new byte[] { 1 }, key = true, timestamp = uint.MaxValue - 1499, codec = "jpeg" });
        queue.Enqueue(new Rtsp.Frame { data = new byte[] { 1 }, key = true, timestamp = 1500, codec = "jpeg" });

        SendNext(queue); //codec
        Rtsp.OutgoingMessage? first = SendNext(queue);
        Rtsp.OutgoingMessage? second = SendNext(queue);

        double difference = System.Buffers.Binary.BinaryPrimitives.ReadDoubleBigEndian(second!.data.AsSpan(2))
            - System.Buffers.Binary.BinaryPrimitives.ReadDoubleBigEndian(first!.data.AsSpan(2));
        Assert.That(difference, Is.EqualTo(3000d / 90000 * 1_000_000).Within(0.001));
    }

    private static int IndexOf(byte[] data, byte[] pattern) {
        for (int i = 0; i <= data.Length - pattern.Length; i++) {
            if (data.AsSpan(i, pattern.Length).SequenceEqual(pattern)) return i;
        }
        return -1;
    }
}

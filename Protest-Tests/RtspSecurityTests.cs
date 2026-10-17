using System.Collections.Concurrent;
using System.Net;
using System.Net.Security;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Text.Json;
using Protest.Protocols;

namespace Protest.Tests;

//A scripted RTSP camera on the loopback interface, plain or over TLS, with Basic or digest authentication,
//that streams a key frame every 40 ms once playing. The hooks let a test make it misbehave.
internal sealed class MockCamera : IAsyncDisposable {
    public static readonly byte[] SPS = { 0x67, 0x42, 0xc0, 0x1e, 0xd9, 0x00, 0xa0, 0x47, 0xfe, 0xc8 };
    public static readonly byte[] PPS = { 0x68, 0xce, 0x3c, 0x80 };
    public const string NONCE = "dcd98b7102dd2f0e8b11d0f600bfb0c093";

    private readonly TcpListener listener = new TcpListener(IPAddress.Loopback, 0);
    private readonly CancellationTokenSource cts = new CancellationTokenSource();

    public X509Certificate2? Certificate { get; init; }
    public string? Auth { get; init; }              //null, "basic", "digest" or "digest-sha256"
    public string Username { get; init; } = "admin";
    public string Password { get; init; } = "secret";
    public bool Silent { get; init; }               //takes the connection and never answers
    public bool StreamFrames { get; init; } = true;
    public string Transport { get; set; } = "RTP/AVP/TCP;unicast;interleaved=0-1";
    public string Session { get; set; } = "12345678;timeout=60";
    public string Control { get; set; } = "trackID=1";
    public Func<string, int, string?>? Override { get; set; } //(method, cseq), a raw response replaces the normal one

    public readonly ConcurrentQueue<string> Requests = new ConcurrentQueue<string>();
    public readonly TaskCompletionSource Closed = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
    private int connections;

    public int Connections => Volatile.Read(ref connections);
    public int Port => ((IPEndPoint)listener.LocalEndpoint).Port;
    public string Url(string path = "/live") => $"{(Certificate is null ? "rtsp" : "rtsps")}://127.0.0.1:{Port}{path}";

    public MockCamera Start() {
        listener.Start();
        _ = AcceptAsync();
        return this;
    }

    private async Task AcceptAsync() {
        try {
            while (true) {
                TcpClient client = await listener.AcceptTcpClientAsync(cts.Token);
                Interlocked.Increment(ref connections);
                _ = Task.Run(() => HandleAsync(client));
            }
        }
        catch (Exception) { }
    }

    private async Task HandleAsync(TcpClient client) {
        SemaphoreSlim writeLock = new SemaphoreSlim(1, 1);
        CancellationTokenSource streamCts = CancellationTokenSource.CreateLinkedTokenSource(cts.Token);

        try {
            using (client) {
                Stream stream = client.GetStream();

                if (Silent) {
                    byte[] sink = new byte[4096];
                    while (await stream.ReadAsync(sink, cts.Token) > 0) { }
                    return;
                }

                if (Certificate is not null) {
                    SslStream ssl = new SslStream(stream, false);
                    await ssl.AuthenticateAsServerAsync(Certificate);
                    stream = ssl;
                }

                async Task WriteAsync(byte[] data) {
                    await writeLock.WaitAsync();
                    try {
                        await stream.WriteAsync(data);
                        await stream.FlushAsync();
                    }
                    finally {
                        writeLock.Release();
                    }
                }

                List<byte> buffer = new List<byte>();
                byte[] chunk = new byte[4096];

                while (true) {
                    int read = await stream.ReadAsync(chunk, cts.Token);
                    if (read == 0) return;
                    buffer.AddRange(chunk.AsSpan(0, read).ToArray());

                    while (buffer.Count > 0) {
                        if (buffer[0] == '$') { //the client's RTCP reports
                            if (buffer.Count < 4) break;
                            int length = 4 + (buffer[2] << 8 | buffer[3]);
                            if (buffer.Count < length) break;
                            buffer.RemoveRange(0, length);
                            continue;
                        }

                        int end = IndexOf(buffer, "\r\n\r\n"u8.ToArray());
                        if (end < 0) break;

                        string request = Encoding.UTF8.GetString(buffer.GetRange(0, end + 4).ToArray());
                        buffer.RemoveRange(0, end + 4);
                        Requests.Enqueue(request);

                        string? response = Respond(request, out bool play);
                        if (response is not null) await WriteAsync(Encoding.UTF8.GetBytes(response));
                        if (play && StreamFrames) _ = StreamAsync(WriteAsync, streamCts.Token);
                    }
                }
            }
        }
        catch (Exception) { }
        finally {
            streamCts.Cancel();
            Closed.TrySetResult();
        }
    }

    private string? Respond(string request, out bool play) {
        play = false;
        string[] lines = request.Split("\r\n");
        string[] start = lines[0].Split(' ');
        string method = start[0], url = start[1];
        Dictionary<string, string> headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (string line in lines.Skip(1)) {
            int colon = line.IndexOf(':');
            if (colon > 0) headers[line[..colon].Trim()] = line[(colon + 1)..].Trim();
        }
        int cseq = int.Parse(headers["CSeq"]);

        if (Override?.Invoke(method, cseq) is string raw) return raw;

        if (Auth is not null && method != "TEARDOWN" && !IsAuthorized(method, url, headers)) {
            string challenge = Auth switch {
                "basic"         => "WWW-Authenticate: Basic realm=\"camera\"\r\n",
                "digest-sha256" => $"WWW-Authenticate: Digest realm=\"camera\", nonce=\"{NONCE}\", algorithm=SHA-256, qop=\"auth\"\r\n",
                _               => $"WWW-Authenticate: Digest realm=\"camera\", nonce=\"{NONCE}\", qop=\"auth\"\r\n"
            };
            return $"RTSP/1.0 401 Unauthorized\r\nCSeq: {cseq}\r\n{challenge}\r\n";
        }

        switch (method) {
        case "OPTIONS":
            return $"RTSP/1.0 200 OK\r\nCSeq: {cseq}\r\nServer: MockCamera\r\nPublic: OPTIONS, DESCRIBE, SETUP, PLAY, TEARDOWN, GET_PARAMETER\r\n\r\n";

        case "DESCRIBE": {
            string sdp = "v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=Mock\r\na=control:*\r\n"
                + "m=video 0 RTP/AVP 96\r\na=rtpmap:96 H264/90000\r\n"
                + $"a=fmtp:96 packetization-mode=1;sprop-parameter-sets={Convert.ToBase64String(SPS)},{Convert.ToBase64String(PPS)}\r\n"
                + $"a=control:{Control}\r\n";
            return $"RTSP/1.0 200 OK\r\nCSeq: {cseq}\r\nContent-Base: {url}/\r\nContent-Type: application/sdp\r\nContent-Length: {Encoding.UTF8.GetByteCount(sdp)}\r\n\r\n{sdp}";
        }

        case "SETUP":
            return $"RTSP/1.0 200 OK\r\nCSeq: {cseq}\r\nTransport: {Transport}\r\nSession: {Session}\r\n\r\n";

        case "PLAY":
            play = true;
            return $"RTSP/1.0 200 OK\r\nCSeq: {cseq}\r\nSession: 12345678\r\n\r\n";

        default:
            return $"RTSP/1.0 200 OK\r\nCSeq: {cseq}\r\n\r\n";
        }
    }

    private bool IsAuthorized(string method, string url, Dictionary<string, string> headers) {
        if (!headers.TryGetValue("Authorization", out string? authorization)) return false;

        if (Auth == "basic") {
            return authorization == $"Basic {Convert.ToBase64String(Encoding.UTF8.GetBytes($"{Username}:{Password}"))}";
        }

        if (!authorization.StartsWith("Digest ")) return false;
        Dictionary<string, string>? parameters = Rtsp.Authenticator.ParseParameters(authorization[7..]);
        if (parameters is null || parameters["uri"] != url || parameters["username"] != Username) return false;

        string expected = Rtsp.Authenticator.DigestResponse(parameters.GetValueOrDefault("algorithm"), Username, "camera", Password,
            method, url, NONCE, parameters.GetValueOrDefault("nc"), parameters.GetValueOrDefault("cnonce"), parameters.GetValueOrDefault("qop"));
        return parameters["response"] == expected;
    }

    private static async Task StreamAsync(Func<byte[], Task> write, CancellationToken token) {
        ushort sequence = 1;
        uint timestamp = 0;
        try {
            while (!token.IsCancellationRequested) {
                byte[] payload = { 0x65, 0x88, 0x84, 0x21, 0x43 };
                byte[] packet = new byte[16 + payload.Length];
                packet[0] = (byte)'$';
                packet[3] = (byte)(12 + payload.Length);
                packet[4] = 0x80;
                packet[5] = 0x80 | 96;
                packet[6] = (byte)(sequence >> 8);
                packet[7] = (byte)sequence;
                packet[8] = (byte)(timestamp >> 24);
                packet[9] = (byte)(timestamp >> 16);
                packet[10] = (byte)(timestamp >> 8);
                packet[11] = (byte)timestamp;
                payload.CopyTo(packet, 16);
                await write(packet);
                sequence++;
                timestamp += 3600;
                await Task.Delay(40, token);
            }
        }
        catch (Exception) { }
    }

    private static int IndexOf(List<byte> data, byte[] pattern) {
        for (int i = 0; i <= data.Count - pattern.Length; i++) {
            bool match = true;
            for (int j = 0; j < pattern.Length && match; j++) match = data[i + j] == pattern[j];
            if (match) return i;
        }
        return -1;
    }

    public async ValueTask DisposeAsync() {
        cts.Cancel();
        listener.Stop();
        await Task.Delay(10);
    }

    public static X509Certificate2 CreateCertificate(string subject = "CN=camera.test", bool expired = false) {
        using RSA rsa = RSA.Create(2048);
        CertificateRequest request = new CertificateRequest(subject, rsa, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        DateTimeOffset now = DateTimeOffset.UtcNow;
        using X509Certificate2 ephemeral = expired
            ? request.CreateSelfSigned(now.AddDays(-30), now.AddDays(-1))
            : request.CreateSelfSigned(now.AddDays(-1), now.AddDays(30));
        return X509CertificateLoader.LoadPkcs12(ephemeral.Export(X509ContentType.Pfx), null);
    }
}

//The browser's end of the WebSocket, connected to the gateway's over the loopback interface.
internal sealed class Browser : IDisposable {
    private readonly TcpClient serverSocket, clientSocket;
    public readonly WebSocket Server;
    public readonly WebSocket Socket;

    private Browser(TcpClient serverSocket, TcpClient clientSocket) {
        this.serverSocket = serverSocket;
        this.clientSocket = clientSocket;
        Server = WebSocket.CreateFromStream(serverSocket.GetStream(), true, null, TimeSpan.Zero);
        Socket = WebSocket.CreateFromStream(clientSocket.GetStream(), false, null, TimeSpan.Zero);
    }

    public static async Task<Browser> ConnectAsync() {
        TcpListener listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        TcpClient client = new TcpClient();
        Task connect = client.ConnectAsync(IPAddress.Loopback, ((IPEndPoint)listener.LocalEndpoint).Port);
        TcpClient server = await listener.AcceptTcpClientAsync();
        await connect;
        listener.Stop();
        return new Browser(server, client);
    }

    public Task SendAsync(object request) =>
        Socket.SendAsync(JsonSerializer.SerializeToUtf8Bytes(request), WebSocketMessageType.Text, true, CancellationToken.None);

    public Task SendRawAsync(string text) =>
        Socket.SendAsync(Encoding.UTF8.GetBytes(text), WebSocketMessageType.Text, true, CancellationToken.None);

    //the next message, text or binary, null once the gateway closed the WebSocket or the time is up
    public async Task<(string? text, byte[]? binary)?> ReceiveAsync(int timeout = 5000) {
        using CancellationTokenSource cts = new CancellationTokenSource(timeout);
        byte[] buffer = new byte[64 * 1024];
        using MemoryStream ms = new MemoryStream();
        try {
            while (true) {
                WebSocketReceiveResult result = await Socket.ReceiveAsync(buffer, cts.Token);
                if (result.MessageType == WebSocketMessageType.Close) {
                    await Socket.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, String.Empty, cts.Token); //completes the close handshake
                    return null;
                }
                ms.Write(buffer, 0, result.Count);
                if (!result.EndOfMessage) continue;
                return result.MessageType == WebSocketMessageType.Text ? (Encoding.UTF8.GetString(ms.ToArray()), null) : (null, ms.ToArray());
            }
        }
        catch (Exception) {
            return null;
        }
    }

    //every text message until the gateway closes, and how many frames came in between
    public async Task<(List<string> texts, int frames)> DrainAsync(int timeout = 5000, Func<List<string>, int, bool>? until = null) {
        List<string> texts = new List<string>();
        int frames = 0;
        DateTime deadline = DateTime.UtcNow.AddMilliseconds(timeout);
        while (DateTime.UtcNow < deadline) {
            (string? text, byte[]? binary)? message = await ReceiveAsync((int)Math.Max(1, (deadline - DateTime.UtcNow).TotalMilliseconds));
            if (message is null) break;
            if (message.Value.text is not null) texts.Add(message.Value.text);
            else frames++;
            if (until?.Invoke(texts, frames) ?? false) break;
        }
        return (texts, frames);
    }

    public async Task CloseAsync() {
        try {
            using CancellationTokenSource cts = new CancellationTokenSource(2000);
            await Socket.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, cts.Token);
        }
        catch (Exception) { }
    }

    public void Dispose() {
        Socket.Dispose();
        Server.Dispose();
        clientSocket.Dispose();
        serverSocket.Dispose();
    }
}

public class RtspSecurityTests {
    private static readonly IPNetwork[] LOOPBACK_ALLOWED = { IPNetwork.Parse("127.0.0.1/32") };

    private static Rtsp.Settings TestSettings(Func<string, CancellationToken, Task<IPAddress[]>>? resolve = null, Rtsp.SessionLimits? limits = null) => new Rtsp.Settings {
        policy = new Rtsp.DestinationPolicy(LOOPBACK_ALLOWED, null), //the narrow exception for a camera on this host
        limits = limits ?? new Rtsp.SessionLimits(() => 64, () => 16, () => 1000),
        resolve = resolve ?? ((host, token) => Task.FromResult(new[] { IPAddress.Loopback })),
        handshakeTimeout = 5000,
        idleTimeout = 3000,
        sendTimeout = 5000,
        authorizationInterval = 200
    };

    private static Rtsp.Client TestClient(ConcurrentQueue<string> audit, Func<bool>? authorized = null, Func<Guid, string, Rtsp.CredentialLookup>? lookup = null) => new Rtsp.Client {
        origin = "tester",
        isAuthorized = authorized ?? (() => true),
        lookupCredential = lookup ?? ((guid, origin) => new Rtsp.CredentialLookup { found = false }),
        audit = audit.Enqueue
    };

    private static async Task<Rtsp.Session> StartSessionAsync(MockCamera camera, string? url = null, string username = "", string password = "", Rtsp.Settings? settings = null, CancellationToken token = default) {
        Rtsp.Target target = Rtsp.ParseUrl(url ?? camera.Url())!;
        Rtsp.Session session = new Rtsp.Session(target, username, password, settings ?? TestSettings());
        session.failureDetail = await session.StartAsync(token);
        return session;
    }

    // 1. Destination policy

    [TestCase("127.0.0.1")]
    [TestCase("127.5.5.5")]
    [TestCase("0.0.0.0")]
    [TestCase("169.254.169.254")]
    [TestCase("224.0.0.1")]
    [TestCase("239.255.255.250")]
    [TestCase("255.255.255.255")]
    [TestCase("100.100.100.200")]
    [TestCase("::1")]
    [TestCase("::")]
    [TestCase("::127.0.0.1")]               //IPv4-compatible
    [TestCase("fe80::1")]
    [TestCase("fe80::1%12")]
    [TestCase("ff02::1")]
    [TestCase("fd00:ec2::254")]
    [TestCase("::ffff:127.0.0.1")]          //IPv4-mapped
    [TestCase("::ffff:169.254.169.254")]
    [TestCase("64:ff9b::7f00:1")]           //NAT64 of 127.0.0.1
    [TestCase("64:ff9b::a9fe:a9fe")]        //NAT64 of 169.254.169.254
    [TestCase("2002:7f00:1::1")]            //6to4 of 127.0.0.1
    public void DestinationPolicy_RefusesProhibitedAddresses(string address) {
        Rtsp.DestinationPolicy policy = new Rtsp.DestinationPolicy(null, null);
        Assert.That(policy.IsAllowed(IPAddress.Parse(address), out string reason), Is.False);
        Assert.That(reason, Is.Not.Null);
    }

    [TestCase("10.1.5.224")]
    [TestCase("192.168.1.10")]
    [TestCase("172.16.0.5")]
    [TestCase("100.64.0.1")]
    [TestCase("8.8.8.8")]
    [TestCase("::ffff:10.1.5.224")]
    [TestCase("fd12:3456::1")]
    [TestCase("2001:db8::1")]
    [TestCase("64:ff9b::a01:5e0")]          //NAT64 of 10.1.5.224
    public void DestinationPolicy_AllowsCameraAddresses(string address) {
        Rtsp.DestinationPolicy policy = new Rtsp.DestinationPolicy(null, null);
        Assert.That(policy.IsAllowed(IPAddress.Parse(address), out _), Is.True);
    }

    [Test]
    public void DestinationPolicy_AllowListExcepts_DenyListTakesPrecedence() {
        Rtsp.DestinationPolicy policy = new Rtsp.DestinationPolicy(
            new[] { IPNetwork.Parse("127.0.0.1/32"), IPNetwork.Parse("10.0.0.0/8") },
            new[] { IPNetwork.Parse("10.66.0.0/16") });

        Assert.That(policy.IsAllowed(IPAddress.Parse("127.0.0.1"), out _), Is.True);
        Assert.That(policy.IsAllowed(IPAddress.Parse("::ffff:127.0.0.1"), out _), Is.True);
        Assert.That(policy.IsAllowed(IPAddress.Parse("127.0.0.2"), out _), Is.False);
        Assert.That(policy.IsAllowed(IPAddress.Parse("10.66.1.1"), out string reason), Is.False);
        Assert.That(reason, Does.Contain("rtsp_deny"));
        Assert.That(policy.IsAllowed(IPAddress.Parse("64:ff9b::a42:101"), out _), Is.False); //NAT64 of 10.66.1.1
    }

    [Test]
    public void DestinationPolicy_RefusesDirectedBroadcasts() {
        Rtsp.DestinationPolicy policy = new Rtsp.DestinationPolicy(null, null, () => new[] { IPAddress.Parse("192.168.1.255") });
        Assert.That(policy.IsAllowed(IPAddress.Parse("192.168.1.255"), out _), Is.False);
        Assert.That(policy.IsAllowed(IPAddress.Parse("192.168.1.254"), out _), Is.True);
    }

    [TestCase("10.0.0.0/8, 192.168.1.10", true, 2)]
    [TestCase("fd00::/8", true, 1)]
    [TestCase("10.0.0.0/8, not-a-range", false, 1)]
    public void DestinationPolicy_ParsesConfiguredRanges(string value, bool valid, int count) {
        List<IPNetwork> networks = new List<IPNetwork>();
        Assert.That(Rtsp.DestinationPolicy.TryParseNetworks(value, networks), Is.EqualTo(valid));
        Assert.That(networks, Has.Count.EqualTo(count));
    }

    [Test]
    public void DestinationPolicy_MixedAnswers_AreRefusedAsAWhole() {
        Rtsp.DestinationPolicy policy = new Rtsp.DestinationPolicy(null, null);
        Task<IPAddress[]> Resolve(string host, CancellationToken token) => Task.FromResult(new[] { IPAddress.Parse("10.1.5.224"), IPAddress.Parse("127.0.0.1") });

        Rtsp.DestinationException? ex = Assert.ThrowsAsync<Rtsp.DestinationException>(() => policy.ResolveAsync("camera.test", Resolve, CancellationToken.None));
        Assert.That(ex!.Message, Is.EqualTo("Connections to this address aren't allowed"));
        Assert.That(ex.detail, Does.Contain("127.0.0.1"));
    }

    [Test]
    public void DestinationPolicy_NoAnswer_IsHostNotFound() {
        Rtsp.DestinationPolicy policy = new Rtsp.DestinationPolicy(null, null);
        Assert.ThrowsAsync<Rtsp.DestinationException>(() => policy.ResolveAsync("camera.test", (h, t) => Task.FromResult(Array.Empty<IPAddress>()), CancellationToken.None));
        Assert.ThrowsAsync<Rtsp.DestinationException>(() => policy.ResolveAsync("camera.test", (h, t) => throw new SocketException((int)SocketError.HostNotFound), CancellationToken.None));
    }

    [Test]
    public async Task DestinationPolicy_Literals_AreNotResolved() {
        Rtsp.DestinationPolicy policy = new Rtsp.DestinationPolicy(null, null);
        IPAddress[] addresses = await policy.ResolveAsync("10.1.5.224", (h, t) => throw new InvalidOperationException("resolved a literal"), CancellationToken.None);
        Assert.That(addresses, Is.EqualTo(new[] { IPAddress.Parse("10.1.5.224") }));
    }

    //Whatever form a host takes, the address it ends up at is what the policy checks: names the system resolver reads
    //as numbers, like 2130706433 or 0x7f.1, are checked as the address they resolve to.
    [TestCase("rtsp://2130706433/live")]
    [TestCase("rtsp://0x7f.1/live")]
    [TestCase("rtsp://127.1/live")]
    [TestCase("rtsp://0177.0.0.1/live")]
    [TestCase("rtsp://localhost/live")]
    [TestCase("rtsp://[::ffff:7f00:1]/live")]
    public void AlternateRepresentations_EndUpCheckedAsTheResolvedAddress(string url) {
        Rtsp.Target? target = Rtsp.ParseUrl(url);
        Assert.That(target, Is.Not.Null);

        Rtsp.DestinationPolicy policy = new Rtsp.DestinationPolicy(null, null);
        Assert.ThrowsAsync<Rtsp.DestinationException>(() => policy.ResolveAsync(target!.host, (h, t) => Task.FromResult(new[] { IPAddress.Loopback }), CancellationToken.None));
    }

    // 1. URL validation

    [TestCase("rtsp://host/a b")]
    [TestCase("rtsp://host/a\r\nSET_PARAMETER rtsp://host/ RTSP/1.0")]
    [TestCase("rtsp://host/a\tb")]
    [TestCase("rtsp://host\\@evil/live")]
    [TestCase("rtsp://host:0/live")]
    [TestCase("rtsp://host:70000/live")]
    [TestCase("rtsp://host:-1/live")]
    [TestCase("rtspu://host/live")]
    [TestCase("file:///etc/passwd")]
    [TestCase("http://169.254.169.254/latest/meta-data")]
    [TestCase("rtsp://ho%73t/live")]
    [TestCase("rtsp://[fe80::1%25eth0]/live")]
    [TestCase("rtsp://admin%0d%0aX-Injected:%201@host/live")]
    [TestCase("rtsp://admin:pass%00word@host/live")]
    public void ParseUrl_RefusesMalformedOrAmbiguousAddresses(string url) {
        Assert.That(Rtsp.ParseUrl(url), Is.Null);
    }

    [Test]
    public void ParseUrl_TooLong_IsRefused() {
        Assert.That(Rtsp.ParseUrl("rtsp://host/" + new string('a', 2100)), Is.Null);
    }

    [TestCase("javascript:alert(1)")]
    [TestCase("http://camera/track1")]
    [TestCase("file:///etc/passwd")]
    [TestCase("rtspu://camera/track1")]
    public void ResolveControl_RefusesOtherSchemes(string control) {
        Assert.That(Rtsp.ResolveControl("rtsp://cam/live/", control), Is.Null);
    }

    [TestCase("trackID=1", "rtsp://cam/live/trackID=1")]
    [TestCase("stream=0:1", "rtsp://cam/live/stream=0:1")]
    [TestCase("RTSPS://cam/live/track", "RTSPS://cam/live/track")]
    public void ResolveControl_KeepsRelativeAndRtspControls(string control, string expected) {
        Assert.That(Rtsp.ResolveControl("rtsp://cam/live/", control), Is.EqualTo(expected));
    }

    // 2. The connection goes to the validated address

    [Test]
    public async Task Session_ConnectsToTheValidatedAddress_WithoutResolvingAgain() {
        await using MockCamera camera = new MockCamera().Start();
        int lookups = 0;
        Rtsp.Settings settings = TestSettings((host, token) => {
            Interlocked.Increment(ref lookups);
            Assert.That(host, Is.EqualTo("camera.test"));
            return Task.FromResult(new[] { IPAddress.Loopback });
        });

        await using Rtsp.Session session = await StartSessionAsync(camera, $"rtsp://camera.test:{camera.Port}/live", settings: settings);

        Assert.That(session.failureDetail, Is.Null);
        Assert.That(lookups, Is.EqualTo(1));
        Assert.That(camera.Connections, Is.EqualTo(1));
        Assert.That(session.remoteAddress, Is.EqualTo($"127.0.0.1:{camera.Port}"));
    }

    [Test]
    public async Task Session_ProhibitedAddressAmongTheAnswers_NothingIsConnected() {
        await using MockCamera camera = new MockCamera().Start();
        Rtsp.Settings settings = TestSettings((host, token) => Task.FromResult(new[] { IPAddress.Loopback, IPAddress.Parse("169.254.169.254") }));

        Rtsp.Session session = new Rtsp.Session(Rtsp.ParseUrl($"rtsp://camera.test:{camera.Port}/live")!, "", "", settings);
        Assert.ThrowsAsync<Rtsp.DestinationException>(() => session.StartAsync(CancellationToken.None));
        await session.DisposeAsync();

        Assert.That(camera.Connections, Is.Zero);
    }

    [Test]
    public async Task Session_FailedAddress_FallsBackOnlyToAnotherValidatedAddress() {
        await using MockCamera camera = new MockCamera().Start();

        //127.0.0.2 is allowed here but nothing listens there, the second validated address takes the connection
        Rtsp.Settings settings = TestSettings((host, token) => Task.FromResult(new[] { IPAddress.Parse("127.0.0.2"), IPAddress.Loopback }));
        settings.policy = new Rtsp.DestinationPolicy(new[] { IPNetwork.Parse("127.0.0.0/30") }, null);

        await using Rtsp.Session session = await StartSessionAsync(camera, $"rtsp://camera.test:{camera.Port}/live", settings: settings);
        Assert.That(session.failureDetail, Is.Null);
        Assert.That(session.remoteAddress, Is.EqualTo($"127.0.0.1:{camera.Port}"));
    }

    [Test]
    public async Task Session_LoopbackWithoutAnException_IsRefused() {
        await using MockCamera camera = new MockCamera().Start();
        Rtsp.Settings settings = TestSettings();
        settings.policy = new Rtsp.DestinationPolicy(null, null);

        Rtsp.Session session = new Rtsp.Session(Rtsp.ParseUrl(camera.Url())!, "", "", settings);
        Assert.ThrowsAsync<Rtsp.DestinationException>(() => session.StartAsync(CancellationToken.None));
        await session.DisposeAsync();
        Assert.That(camera.Connections, Is.Zero);
    }

    [Test]
    public async Task Session_ControlUrlNamingAnotherHost_StaysOnTheSameConnection() {
        await using MockCamera camera = new MockCamera { Control = "rtsp://169.254.169.254/latest/meta-data" }.Start();
        int lookups = 0;
        Rtsp.Settings settings = TestSettings((host, token) => {
            Interlocked.Increment(ref lookups);
            return Task.FromResult(new[] { IPAddress.Loopback });
        });

        await using Rtsp.Session session = await StartSessionAsync(camera, $"rtsp://camera.test:{camera.Port}/live", settings: settings);

        Assert.That(session.failureDetail, Is.Null);
        Assert.That(camera.Connections, Is.EqualTo(1));
        Assert.That(lookups, Is.EqualTo(1));
        Assert.That(camera.Requests.Any(o => o.StartsWith("SETUP rtsp://169.254.169.254/latest/meta-data RTSP/1.0")), Is.True);
    }

    // 3. TLS, accepted and reported

    [Test]
    public async Task Tls_SelfSignedCertificate_IsReportedAsNotVerified() {
        using X509Certificate2 certificate = MockCamera.CreateCertificate();
        await using MockCamera camera = new MockCamera { Certificate = certificate }.Start();

        await using Rtsp.Session session = await StartSessionAsync(camera);

        Assert.That(session.failureDetail, Is.Null);
        Assert.That(session.certificateVerified, Is.False);
        Assert.That(session.certificateThumbprint, Is.EqualTo(certificate.GetCertHashString()));
        Assert.That(session.certificateSubject, Is.EqualTo("CN=camera.test"));
    }

    [Test]
    public async Task Tls_ExpiredAndMismatchedCertificates_AreReportedAsNotVerified() {
        using X509Certificate2 expired = MockCamera.CreateCertificate("CN=127.0.0.1", expired: true);
        await using MockCamera camera = new MockCamera { Certificate = expired }.Start();

        await using Rtsp.Session session = await StartSessionAsync(camera);
        Assert.That(session.certificateVerified, Is.False);
    }

    [Test]
    public async Task Tls_UnverifiedCertificate_BasicIsRefused_AndNoPasswordIsSent() {
        using X509Certificate2 certificate = MockCamera.CreateCertificate();
        await using MockCamera camera = new MockCamera { Certificate = certificate, Auth = "basic" }.Start();

        await using Rtsp.Session session = await StartSessionAsync(camera, username: "admin", password: "secret");

        Assert.That(session.failureDetail, Does.Contain("Basic"));
        Assert.That(camera.Requests.Any(o => o.Contains("Authorization")), Is.False);
    }

    [Test]
    public async Task Tls_UnverifiedCertificate_DigestStillWorks() {
        using X509Certificate2 certificate = MockCamera.CreateCertificate();
        await using MockCamera camera = new MockCamera { Certificate = certificate, Auth = "digest" }.Start();

        await using Rtsp.Session session = await StartSessionAsync(camera, username: "admin", password: "secret");
        Assert.That(session.failureDetail, Is.Null);
    }

    // 4. Header injection

    [TestCase("admin\r\nX-Injected: 1")]
    [TestCase("admin\nTEARDOWN rtsp://cam/ RTSP/1.0")]
    [TestCase("admin\0")]
    [TestCase("admin\u007f")]
    public void Authenticator_RefusesControlCharactersInCredentials(string username) {
        Assert.Throws<ArgumentException>(() => new Rtsp.Authenticator(username, "secret"));
        Assert.Throws<ArgumentException>(() => new Rtsp.Authenticator("admin", username));
    }

    [TestCase("X-Header", "a\r\nInjected: 1")]
    [TestCase("X-Header", "a\nb")]
    [TestCase("X-Header", "a\0b")]
    [TestCase("X Header", "value")]
    [TestCase("X-Header:", "value")]
    [TestCase("", "value")]
    public void AppendHeader_RefusesInvalidNamesAndValues(string name, string value) {
        Assert.Throws<InvalidDataException>(() => Rtsp.Session.AppendHeader(new StringBuilder(), name, value));
    }

    [Test]
    public void Quote_EscapesQuotesAndBackslashes_AndRefusesControlCharacters() {
        Assert.That(Rtsp.Authenticator.Quote("a\"b\\c"), Is.EqualTo("a\\\"b\\\\c"));
        Assert.Throws<InvalidDataException>(() => Rtsp.Authenticator.Quote("a\r\nb"));
    }

    [TestCase("Digest realm=\"camera\", nonce=\"abc\r\nX-Injected: 1\"")]
    [TestCase("Digest realm=\"cam\u0000era\", nonce=\"abc\"")]
    [TestCase("Digest realm=\"camera\", nonce=\"abc\", opaque=\"x\ny\"")]
    public void Authenticator_ChallengeWithControlCharacters_IsUnsupported(string challenge) {
        Rtsp.Authenticator authenticator = new Rtsp.Authenticator("admin", "secret");
        Assert.That(authenticator.SetChallenge(new[] { challenge }, true), Is.EqualTo(Rtsp.Authenticator.ChallengeResult.Unsupported));
        Assert.That(authenticator.GetAuthorization("DESCRIBE", "rtsp://cam/"), Is.Null);
    }

    [Test]
    public async Task Session_CameraSessionIdWithAnInjection_IsRefused() {
        await using MockCamera camera = new MockCamera { Session = "1234 X-Injected: 1" }.Start();
        await using Rtsp.Session session = await StartSessionAsync(camera);
        Assert.That(session.failureDetail, Is.EqualTo("The camera sent an invalid response"));
        Assert.That(camera.Requests.Any(o => o.StartsWith("PLAY")), Is.False);
    }

    // 5. Basic over plain RTSP

    [Test]
    public void Authenticator_BasicOverAnUnverifiedTransport_IsInsecure() {
        Rtsp.Authenticator authenticator = new Rtsp.Authenticator("admin", "secret");
        Assert.That(authenticator.SetChallenge(new[] { "Basic realm=\"camera\"" }, false), Is.EqualTo(Rtsp.Authenticator.ChallengeResult.Insecure));
        Assert.That(authenticator.GetAuthorization("DESCRIBE", "rtsp://cam/"), Is.Null);
    }

    [Test]
    public async Task Session_BasicOverPlainRtsp_IsRefused_AndNoPasswordIsSent() {
        await using MockCamera camera = new MockCamera { Auth = "basic" }.Start();
        await using Rtsp.Session session = await StartSessionAsync(camera, username: "admin", password: "secret");

        Assert.That(session.failureDetail, Does.StartWith("The camera asks for the password in clear text"));
        Assert.That(session.authenticationFailed, Is.False); //asking again wouldn't help
        Assert.That(camera.Requests.Any(o => o.Contains("Authorization")), Is.False);
    }

    // 6. Digest

    //RFC 7616 section 3.9.1
    [TestCase("MD5", "8ca523f5e9506fed4657c9700eebdbec")]
    [TestCase("SHA-256", "753927fa0e85d155564e2e272a28d1802ca10daf4496794697cf8db5856cb6c1")]
    public void DigestResponse_Rfc7616Examples(string algorithm, string expected) {
        string response = Rtsp.Authenticator.DigestResponse(algorithm, "Mufasa", "http-auth@example.org", "Circle of Life", "GET", "/dir/index.html",
            "7ypf/xlj9XXwfDPEoM4URrv/xwf94BcCAzFZH4GiTo0v", "00000001", "f2/wE4q74E6zIJEtWaHKaf5wv/H5QzzpXusqGemxURZJ", "auth");
        Assert.That(response, Is.EqualTo(expected));
    }

    [TestCase("MD5-sess", false)]
    [TestCase("SHA-256-sess", true)]
    public void DigestResponse_SessionVariants(string algorithm, bool sha256) {
        string H(string text) => Convert.ToHexStringLower(sha256 ? SHA256.HashData(Encoding.UTF8.GetBytes(text)) : MD5.HashData(Encoding.UTF8.GetBytes(text)));

        string ha1 = H($"{H("Mufasa:realm:pass")}:nonce:cnonce");
        string expected = H($"{ha1}:nonce:00000001:cnonce:auth:{H("DESCRIBE:rtsp://cam/")}");

        Assert.That(Rtsp.Authenticator.DigestResponse(algorithm, "Mufasa", "realm", "pass", "DESCRIBE", "rtsp://cam/", "nonce", "00000001", "cnonce", "auth"), Is.EqualTo(expected));
    }

    [Test]
    public void Authenticator_AuthorizationUsesTheRequestsMethodAndTarget() {
        Rtsp.Authenticator authenticator = new Rtsp.Authenticator("admin", "secret");
        authenticator.SetChallenge(new[] { "Digest realm=\"camera\", nonce=\"n1\", qop=\"auth\"" }, false);

        string header = authenticator.GetAuthorization("SETUP", "rtsp://cam/live/trackID=1")!;
        Dictionary<string, string> parameters = Rtsp.Authenticator.ParseParameters(header[7..])!;

        Assert.That(parameters["uri"], Is.EqualTo("rtsp://cam/live/trackID=1"));
        Assert.That(parameters["response"], Is.EqualTo(Rtsp.Authenticator.DigestResponse(null, "admin", "camera", "secret", "SETUP",
            "rtsp://cam/live/trackID=1", "n1", parameters["nc"], parameters["cnonce"], "auth")));
    }

    [TestCase("Digest nonce=\"abc\"")]                                          //no realm
    [TestCase("Digest realm=\"camera\"")]                                       //no nonce
    [TestCase("Digest realm=\"camera\", nonce=\"\"")]
    [TestCase("Digest realm=\"camera\", nonce=\"abc\", algorithm=SHA-512-256")] //unsupported algorithm
    [TestCase("Digest realm=\"camera\", nonce=\"abc\", qop=\"auth-conf\"")]     //unsupported qop
    [TestCase("Digest realm=\"camera\", nonce=\"abc\", stale=maybe")]
    [TestCase("Digest realm=\"camera\", nonce=\"abc\", nonce=\"def\"")]         //twice
    [TestCase("Digest realm=\"camera, nonce=\"abc\"")]                          //unterminated
    [TestCase("Digest realm=\"camera\" nonce=\"abc\"")]                         //no separator
    [TestCase("Negotiate abc")]
    public void Authenticator_MalformedChallenges_AreUnsupported(string challenge) {
        Rtsp.Authenticator authenticator = new Rtsp.Authenticator("admin", "secret");
        Assert.That(authenticator.SetChallenge(new[] { challenge }, true), Is.EqualTo(Rtsp.Authenticator.ChallengeResult.Unsupported));
    }

    [Test]
    public void Authenticator_UnusableDigest_DoesNotFallBackToBasic() {
        Rtsp.Authenticator authenticator = new Rtsp.Authenticator("admin", "secret");
        Rtsp.Authenticator.ChallengeResult result = authenticator.SetChallenge(new[] {
            "Digest realm=\"camera\", nonce=\"abc\", algorithm=SHA-512-256",
            "Basic realm=\"camera\""
        }, true);
        Assert.That(result, Is.EqualTo(Rtsp.Authenticator.ChallengeResult.Unsupported));
    }

    [Test]
    public void Authenticator_NoDowngradeToBasicAfterADigest() {
        Rtsp.Authenticator authenticator = new Rtsp.Authenticator("admin", "secret");
        authenticator.SetChallenge(new[] { "Digest realm=\"camera\", nonce=\"abc\"" }, true);
        Assert.That(authenticator.SetChallenge(new[] { "Basic realm=\"camera\"" }, true), Is.EqualTo(Rtsp.Authenticator.ChallengeResult.Unsupported));
    }

    [Test]
    public void Authenticator_PrefersSha256OverMd5() {
        Rtsp.Authenticator authenticator = new Rtsp.Authenticator("admin", "secret");
        authenticator.SetChallenge(new[] {
            "Digest realm=\"camera\", nonce=\"abc\", algorithm=MD5",
            "Digest realm=\"camera\", nonce=\"abc\", algorithm=sha-256"
        }, true);
        Assert.That(authenticator.GetAuthorization("DESCRIBE", "rtsp://cam/"), Does.Contain("algorithm=SHA-256"));
    }

    [Test]
    public void Authenticator_StaleNonce() {
        Rtsp.Authenticator authenticator = new Rtsp.Authenticator("admin", "secret");
        Assert.That(authenticator.SetChallenge(new[] { "Digest realm=\"camera\", nonce=\"n1\"" }, true), Is.EqualTo(Rtsp.Authenticator.ChallengeResult.Accepted));
        Assert.That(authenticator.SetChallenge(new[] { "Digest realm=\"camera\", nonce=\"n2\", stale=TRUE" }, true), Is.EqualTo(Rtsp.Authenticator.ChallengeResult.Stale));
        Assert.That(authenticator.GetAuthorization("DESCRIBE", "rtsp://cam/"), Does.Contain("nonce=\"n2\""));
    }

    [Test]
    public void Authenticator_NonceCount_IsUniqueUnderConcurrency() {
        Rtsp.Authenticator authenticator = new Rtsp.Authenticator("admin", "secret");
        authenticator.SetChallenge(new[] { "Digest realm=\"camera\", nonce=\"abc\", qop=\"auth\"" }, true);

        ConcurrentBag<string> counts = new ConcurrentBag<string>();
        Parallel.For(0, 500, i => counts.Add(Rtsp.Authenticator.ParseParameters(authenticator.GetAuthorization("GET_PARAMETER", "rtsp://cam/")![7..])!["nc"]));

        Assert.That(counts.Distinct().Count(), Is.EqualTo(500));
    }

    [Test]
    public async Task Session_DigestMd5AndSha256_Authenticate() {
        foreach (string mode in new[] { "digest", "digest-sha256" }) {
            await using MockCamera camera = new MockCamera { Auth = mode }.Start();
            await using Rtsp.Session session = await StartSessionAsync(camera, username: "admin", password: "secret");
            Assert.That(session.failureDetail, Is.Null, mode);
        }
    }

    [Test]
    public async Task Session_WrongPassword_FailsAuthentication() {
        await using MockCamera camera = new MockCamera { Auth = "digest" }.Start();
        await using Rtsp.Session session = await StartSessionAsync(camera, username: "admin", password: "wrong");
        Assert.That(session.failureDetail, Is.EqualTo("Authentication failed"));
        Assert.That(session.authenticationFailed, Is.True);
        Assert.That(camera.Requests.Count(o => o.StartsWith("OPTIONS")), Is.LessThanOrEqualTo(3));
    }

    // 7. Authorization through the stream

    [Test]
    public async Task Run_RevokedAccess_EndsTheStream_AndClosesTheCamera() {
        await using MockCamera camera = new MockCamera().Start();
        using Browser browser = await Browser.ConnectAsync();
        ConcurrentQueue<string> audit = new ConcurrentQueue<string>();
        bool authorized = true;

        Task run = Rtsp.RunAsync(browser.Server, TestClient(audit, () => Volatile.Read(ref authorized)), TestSettings(), CancellationToken.None);
        await browser.SendAsync(new { url = camera.Url() });

        (List<string> texts, int frames) = await browser.DrainAsync(5000, (t, f) => f >= 3);
        Assert.That(frames, Is.GreaterThanOrEqualTo(3));

        Volatile.Write(ref authorized, false);
        (texts, _) = await browser.DrainAsync(5000);

        Assert.That(texts, Does.Contain("{\"error\":\"Access denied\"}"));
        Assert.That(await Task.WhenAny(run, Task.Delay(5000)), Is.SameAs(run));
        Assert.That(await Task.WhenAny(camera.Closed.Task, Task.Delay(5000)), Is.SameAs(camera.Closed.Task));
        Assert.That(camera.Requests.Any(o => o.StartsWith("TEARDOWN")), Is.True);
        Assert.That(audit, Has.Some.Contains("access was revoked"));
    }

    [Test]
    public async Task Run_CredentialNotAllowed_NoCameraConnection() {
        await using MockCamera camera = new MockCamera().Start();
        using Browser browser = await Browser.ConnectAsync();
        ConcurrentQueue<string> audit = new ConcurrentQueue<string>();
        Guid guid = Guid.NewGuid();

        Task run = Rtsp.RunAsync(browser.Server,
            TestClient(audit, lookup: (g, origin) => new Rtsp.CredentialLookup { found = true, allowed = false, username = "admin", password = "secret" }),
            TestSettings(), CancellationToken.None);
        await browser.SendAsync(new { url = camera.Url(), credential = guid.ToString() });

        (List<string> texts, _) = await browser.DrainAsync();
        await run;

        Assert.That(texts, Is.EqualTo(new[] { "{\"error\":\"Access denied for this credential\"}" }));
        Assert.That(camera.Connections, Is.Zero);
    }

    [Test]
    public async Task Run_CredentialMissing_NoCameraConnection() {
        await using MockCamera camera = new MockCamera().Start();
        using Browser browser = await Browser.ConnectAsync();

        Task run = Rtsp.RunAsync(browser.Server, TestClient(new ConcurrentQueue<string>()), TestSettings(), CancellationToken.None);
        await browser.SendAsync(new { url = camera.Url(), credential = Guid.NewGuid().ToString() });

        (List<string> texts, _) = await browser.DrainAsync();
        await run;

        Assert.That(texts, Has.Count.EqualTo(1));
        using JsonDocument message = JsonDocument.Parse(texts[0]); //the apostrophe arrives escaped
        Assert.That(message.RootElement.GetProperty("error").GetString(), Is.EqualTo("Credentials don't exist"));
        Assert.That(camera.Connections, Is.Zero);
    }

    [Test]
    public async Task Run_CredentialRevokedWhileStreaming_EndsTheStream() {
        await using MockCamera camera = new MockCamera().Start();
        using Browser browser = await Browser.ConnectAsync();
        bool allowed = true;

        Task run = Rtsp.RunAsync(browser.Server,
            TestClient(new ConcurrentQueue<string>(), lookup: (g, origin) => new Rtsp.CredentialLookup { found = true, allowed = Volatile.Read(ref allowed), username = "", password = "" }),
            TestSettings(), CancellationToken.None);
        await browser.SendAsync(new { url = camera.Url(), credential = Guid.NewGuid().ToString() });

        await browser.DrainAsync(5000, (t, f) => f >= 2);
        Volatile.Write(ref allowed, false);
        (List<string> texts, _) = await browser.DrainAsync();

        Assert.That(texts, Does.Contain("{\"error\":\"Access denied for this credential\"}"));
        Assert.That(await Task.WhenAny(run, Task.Delay(5000)), Is.SameAs(run));
    }

    [Test]
    public async Task Run_SecondRequestOrUnexpectedMessage_EndsTheStream() {
        await using MockCamera camera = new MockCamera().Start();
        using Browser browser = await Browser.ConnectAsync();

        Task run = Rtsp.RunAsync(browser.Server, TestClient(new ConcurrentQueue<string>()), TestSettings(), CancellationToken.None);
        await browser.SendAsync(new { url = camera.Url() });
        await browser.DrainAsync(5000, (t, f) => f >= 1);

        await browser.SendAsync(new { url = camera.Url("/other") });

        Assert.That(await Task.WhenAny(run, Task.Delay(5000)), Is.SameAs(run));
        Assert.That(camera.Connections, Is.EqualTo(1));
    }

    [Test]
    public async Task Run_BinaryOrMalformedRequest_IsRefused() {
        await using MockCamera camera = new MockCamera().Start();

        using (Browser browser = await Browser.ConnectAsync()) {
            Task run = Rtsp.RunAsync(browser.Server, TestClient(new ConcurrentQueue<string>()), TestSettings(), CancellationToken.None);
            await browser.Socket.SendAsync(new byte[] { 1, 2, 3 }, WebSocketMessageType.Binary, true, CancellationToken.None);
            await browser.DrainAsync();
            Assert.That(await Task.WhenAny(run, Task.Delay(5000)), Is.SameAs(run));
        }

        using (Browser browser = await Browser.ConnectAsync()) {
            Task run = Rtsp.RunAsync(browser.Server, TestClient(new ConcurrentQueue<string>()), TestSettings(), CancellationToken.None);
            await browser.SendRawAsync("{\"url\":\"" + camera.Url() + "\",\"admin\":true}");
            (List<string> texts, _) = await browser.DrainAsync();
            await run;
            Assert.That(texts, Is.EqualTo(new[] { "{\"error\":\"Invalid request\"}" }));
        }

        Assert.That(camera.Connections, Is.Zero);
    }

    // 8. Malformed RTSP

    [Test]
    public async Task Connection_OversizedHeader_IsRefused() {
        byte[] data = Encoding.ASCII.GetBytes("RTSP/1.0 200 OK\r\nCSeq: 1\r\nX-Padding: " + new string('a', 20_000) + "\r\n\r\n");
        using Rtsp.Connection connection = new Rtsp.Connection(new MemoryStream(data));
        Assert.ThrowsAsync<InvalidDataException>(() => connection.ReadAsync(CancellationToken.None));
        await Task.CompletedTask;
    }

    [TestCase("RTSP/1.0 200 OK\r\nCSeq: 1\r\nContent-Length: 4\r\nContent-Length: 4\r\n\r\n")] //duplicate length
    [TestCase("RTSP/1.0 200 OK\r\nCSeq: 1\r\nContent-Length: 4\r\nContent-Length: 9\r\n\r\n")] //conflicting length
    [TestCase("RTSP/1.0 200 OK\r\nCSeq: 1\r\nCSeq: 2\r\n\r\n")]
    [TestCase("RTSP/1.0 200 OK\r\nCSeq: 1\r\nSession: 1\r\nSession: 2\r\n\r\n")]
    [TestCase("RTSP/1.0 200 OK\r\n\r\n")]                                                   //no CSeq
    [TestCase("RTSP/1.0 200 OK\r\nCSeq: one\r\n\r\n")]
    [TestCase("RTSP/1.0 999 Odd\r\nCSeq: 1\r\n\r\n")]
    [TestCase("RTSP/1.0 20 OK\r\nCSeq: 1\r\n\r\n")]
    [TestCase("RTSP/9.9 200 OK\r\nCSeq: 1\r\n\r\n")]
    [TestCase("RTSP/1.0 200 OK\r\nCSeq: 1\r\n folded continuation\r\n\r\n")]
    [TestCase("RTSP/1.0 200 OK\r\nCSeq: 1\r\nBad Name: x\r\n\r\n")]
    [TestCase("RTSP/1.0 200 OK\r\nCSeq: 1\r\nNoColon\r\n\r\n")]
    [TestCase("RTSP/1.0 200 OK\r\nCSeq: 1\r\nX-Value: a\u0001b\r\n\r\n")]
    [TestCase("RTSP/1.0 200 OK\r\nCSeq: 1\r\nX-Value: a\rb\r\n\r\n")]
    [TestCase("RTSP/1.0 200 OK\r\nCSeq: 1\r\nContent-Length: -4\r\n\r\n")]
    [TestCase("RTSP/1.0 200 OK\r\nCSeq: 1\r\nContent-Length: 4x\r\n\r\n")]
    [TestCase("RTSP/1.0 200 OK\r\nCSeq: 1\r\nContent-Length: 99999999\r\n\r\n")]
    [TestCase("Garbage that isn't RTSP\r\n\r\n")]
    [TestCase("\u0001\u0002binary noise")]
    public void Connection_MalformedMessages_AreRefused(string text) {
        using Rtsp.Connection connection = new Rtsp.Connection(new MemoryStream(Encoding.UTF8.GetBytes(text)));
        Assert.ThrowsAsync<InvalidDataException>(() => connection.ReadAsync(CancellationToken.None));
    }

    [Test]
    public async Task Connection_TooManyHeaderFields_AreRefused() {
        StringBuilder text = new StringBuilder("RTSP/1.0 200 OK\r\nCSeq: 1\r\n");
        for (int i = 0; i < 80; i++) text.Append($"X-{i}: v\r\n");
        text.Append("\r\n");
        using Rtsp.Connection connection = new Rtsp.Connection(new MemoryStream(Encoding.ASCII.GetBytes(text.ToString())));
        Assert.ThrowsAsync<InvalidDataException>(() => connection.ReadAsync(CancellationToken.None));
        await Task.CompletedTask;
    }

    [Test]
    public async Task Session_ResponseNumberedForARequestNeverSent_IsRefused() {
        await using MockCamera camera = new MockCamera { Override = (method, cseq) => method == "DESCRIBE" ? $"RTSP/1.0 200 OK\r\nCSeq: {cseq + 5}\r\n\r\n" : null }.Start();
        Rtsp.Session session = new Rtsp.Session(Rtsp.ParseUrl(camera.Url())!, "", "", TestSettings());
        Assert.ThrowsAsync<InvalidDataException>(() => session.StartAsync(CancellationToken.None));
        await session.DisposeAsync();
    }

    [TestCase("RTP/AVP/TCP;unicast;interleaved=300-301")]
    [TestCase("RTP/AVP/TCP;unicast;interleaved=1-1")]
    [TestCase("RTP/AVP;unicast;client_port=5000-5001")]
    [TestCase("RTP/AVP/TCP;unicast")]
    public async Task Session_InvalidTransport_IsRefused(string transport) {
        await using MockCamera camera = new MockCamera { Transport = transport }.Start();
        await using Rtsp.Session session = await StartSessionAsync(camera);
        Assert.That(session.failureDetail, Is.EqualTo("The camera sent an invalid response"));
        Assert.That(camera.Requests.Any(o => o.StartsWith("PLAY")), Is.False);
    }

    [Test]
    public async Task Session_SrtpTransport_IsRefused() {
        await using MockCamera camera = new MockCamera { Transport = "RTP/SAVP/TCP;unicast;interleaved=0-1" }.Start();
        await using Rtsp.Session session = await StartSessionAsync(camera);
        Assert.That(session.failureDetail, Does.StartWith("The camera encrypts the stream with SRTP"));
    }

    [Test]
    public async Task Session_TimeoutIsBounded() {
        await using MockCamera camera = new MockCamera { Session = "abc;timeout=0" }.Start();
        await using Rtsp.Session session = await StartSessionAsync(camera);
        Assert.That(session.failureDetail, Is.Null);
        Assert.That(session.sessionTimeout, Is.EqualTo(4));
    }

    // 9. SDP

    [Test]
    public void ParseSdp_Limits() {
        Assert.That(Rtsp.ParseSdp("a=" + new string('x', 5000)), Is.Null);
        Assert.That(Rtsp.ParseSdp(String.Concat(Enumerable.Repeat("m=video 0 RTP/AVP 96\n", 17))), Is.Null);
        Assert.That(Rtsp.ParseSdp(String.Concat(Enumerable.Repeat("a=x\n", 1025))), Is.Null);
        Assert.That(Rtsp.ParseSdp(String.Concat(Enumerable.Repeat("m=video 0 RTP/AVP 96\n", 16))), Is.Not.Null);
    }

    [Test]
    public void ParseSdp_OutOfRangeDimensionsAndFormats_AreIgnored() {
        Rtsp.SessionDescription sdp = Rtsp.ParseSdp("m=video 0 RTP/AVP 96 300 -1\na=x-dimensions:-5,99999999\n")!;
        Assert.That(sdp.media[0].formats, Is.EqualTo(new[] { 96 }));
        Assert.That(sdp.media[0].width, Is.Zero);
    }

    [Test]
    public async Task Session_ControlWithAnotherScheme_IsAnInvalidStream() {
        await using MockCamera camera = new MockCamera { Control = "http://169.254.169.254/" }.Start();
        await using Rtsp.Session session = await StartSessionAsync(camera);
        Assert.That(session.failureDetail, Is.EqualTo("The camera described an invalid stream"));
        Assert.That(camera.Requests.Any(o => o.StartsWith("SETUP")), Is.False);
    }

    // 10. RTP and frames

    [Test]
    public void H264_OversizedAccessUnit_IsDropped() {
        Rtsp.H264Depacketizer depacketizer = new Rtsp.H264Depacketizer(Rtsp.ParseFmtp(
            $"sprop-parameter-sets={Convert.ToBase64String(MockCamera.SPS)},{Convert.ToBase64String(MockCamera.PPS)}"));
        List<Rtsp.Frame> frames = new List<Rtsp.Frame>();

        byte[] fragment = new byte[60_000];
        fragment[0] = 0x7c;
        fragment[1] = 0x85; //start of an IDR
        depacketizer.Push(Packet(fragment, 1, 0, false), frames);
        fragment[1] = 0x05;
        for (int i = 0; i < 150; i++) depacketizer.Push(Packet(fragment, (ushort)(2 + i), 0, false), frames); //9 MB
        fragment[1] = 0x45;
        depacketizer.Push(Packet(fragment, 152, 0, true), frames);

        Assert.That(frames, Is.Empty);
        Assert.That(depacketizer.DroppedFrames, Is.EqualTo(1));
    }

    [Test]
    public void H264_TooManyNalUnits_IsDropped() {
        Rtsp.H264Depacketizer depacketizer = new Rtsp.H264Depacketizer(Rtsp.ParseFmtp(
            $"sprop-parameter-sets={Convert.ToBase64String(MockCamera.SPS)},{Convert.ToBase64String(MockCamera.PPS)}"));
        List<Rtsp.Frame> frames = new List<Rtsp.Frame>();

        for (int i = 0; i < 1100; i++) depacketizer.Push(Packet(new byte[] { 0x65, 0x88 }, (ushort)(i + 1), 0, false), frames);
        depacketizer.Push(Packet(new byte[] { 0x65, 0x88 }, 1101, 0, true), frames);

        Assert.That(frames, Is.Empty);
    }

    [Test]
    public void Jpeg_OversizedTables_AreRefused() {
        Rtsp.JpegDepacketizer depacketizer = new Rtsp.JpegDepacketizer(0, 0);
        List<Rtsp.Frame> frames = new List<Rtsp.Frame>();

        List<byte> payload = new List<byte> { 0, 0, 0, 0, 1, 255, 40, 30, 0, 0, 0x10, 0x00 }; //4096 bytes of tables
        payload.AddRange(new byte[4096]);
        payload.AddRange(new byte[] { 0xb1 });
        depacketizer.Push(Packet(payload.ToArray(), 1, 0, true), frames);

        Assert.That(frames, Is.Empty);
    }

    private static Rtsp.RtpPacket Packet(byte[] payload, ushort sequence, uint timestamp, bool marker) => new Rtsp.RtpPacket {
        marker = marker, payloadType = 96, sequence = sequence, timestamp = timestamp, payload = new ArraySegment<byte>(payload)
    };

    // 11. Cancellation and timeouts

    [Test]
    public async Task Cancellation_DuringResolution() {
        Rtsp.Settings settings = TestSettings(async (host, token) => {
            await Task.Delay(Timeout.Infinite, token);
            return Array.Empty<IPAddress>();
        });
        Rtsp.Session session = new Rtsp.Session(Rtsp.ParseUrl("rtsp://camera.test/live")!, "", "", settings);

        using CancellationTokenSource cts = new CancellationTokenSource(200);
        Assert.CatchAsync<OperationCanceledException>(() => session.StartAsync(cts.Token));
        await session.DisposeAsync();
    }

    [Test]
    public async Task Cancellation_DuringTls_ClosesTheConnection() {
        await using MockCamera camera = new MockCamera { Silent = true }.Start();
        Rtsp.Session session = new Rtsp.Session(Rtsp.ParseUrl($"rtsps://127.0.0.1:{camera.Port}/live")!, "", "", TestSettings());

        using CancellationTokenSource cts = new CancellationTokenSource(300);
        Assert.CatchAsync<OperationCanceledException>(() => session.StartAsync(cts.Token));
        await session.DisposeAsync();

        Assert.That(await Task.WhenAny(camera.Closed.Task, Task.Delay(3000)), Is.SameAs(camera.Closed.Task));
    }

    [Test]
    public async Task Cancellation_DuringSetup_ClosesTheConnection() {
        await using MockCamera camera = new MockCamera { Silent = true }.Start();
        Rtsp.Session session = new Rtsp.Session(Rtsp.ParseUrl(camera.Url())!, "", "", TestSettings());

        using CancellationTokenSource cts = new CancellationTokenSource(300);
        Assert.CatchAsync<OperationCanceledException>(() => session.StartAsync(cts.Token));
        await session.DisposeAsync();

        Assert.That(await Task.WhenAny(camera.Closed.Task, Task.Delay(3000)), Is.SameAs(camera.Closed.Task));
    }

    [Test]
    public async Task Run_HandshakeTimeout_IsReported() {
        await using MockCamera camera = new MockCamera { Silent = true }.Start();
        using Browser browser = await Browser.ConnectAsync();
        Rtsp.Settings settings = TestSettings();
        settings.handshakeTimeout = 500;

        Task run = Rtsp.RunAsync(browser.Server, TestClient(new ConcurrentQueue<string>()), settings, CancellationToken.None);
        await browser.SendAsync(new { url = camera.Url() });
        (List<string> texts, _) = await browser.DrainAsync();
        await run;

        Assert.That(texts, Is.EqualTo(new[] { "{\"error\":\"The camera did not respond in time\"}" }));
        Assert.That(await Task.WhenAny(camera.Closed.Task, Task.Delay(3000)), Is.SameAs(camera.Closed.Task));
    }

    [Test]
    public async Task Run_CancellationDuringPlayback_ReleasesEverything() {
        await using MockCamera camera = new MockCamera().Start();
        using Browser browser = await Browser.ConnectAsync();
        Rtsp.SessionLimits limits = new Rtsp.SessionLimits(() => 64, () => 16, () => 1000);
        using CancellationTokenSource cts = new CancellationTokenSource();

        Task run = Rtsp.RunAsync(browser.Server, TestClient(new ConcurrentQueue<string>()), TestSettings(limits: limits), cts.Token);
        await browser.SendAsync(new { url = camera.Url() });
        await browser.DrainAsync(5000, (t, f) => f >= 2);

        cts.Cancel();

        Assert.That(await Task.WhenAny(run, Task.Delay(5000)), Is.SameAs(run));
        Assert.That(await Task.WhenAny(camera.Closed.Task, Task.Delay(5000)), Is.SameAs(camera.Closed.Task));
        Assert.That(limits.Total, Is.Zero);
    }

    [Test]
    public async Task Run_CameraStopsSendingVideo_EndsTheStream() {
        await using MockCamera camera = new MockCamera { StreamFrames = false }.Start();
        using Browser browser = await Browser.ConnectAsync();
        Rtsp.Settings settings = TestSettings();
        settings.idleTimeout = 500;

        Task run = Rtsp.RunAsync(browser.Server, TestClient(new ConcurrentQueue<string>()), settings, CancellationToken.None);
        await browser.SendAsync(new { url = camera.Url() });
        (List<string> texts, _) = await browser.DrainAsync(5000);

        Assert.That(texts, Does.Contain("{\"error\":\"The camera stopped sending video\"}"));
        Assert.That(await Task.WhenAny(run, Task.Delay(5000)), Is.SameAs(run));
    }

    [Test]
    public async Task Dispose_Teardown_IsBounded() {
        await using MockCamera camera = new MockCamera { StreamFrames = false }.Start();
        Rtsp.Session session = await StartSessionAsync(camera);
        Assert.That(session.failureDetail, Is.Null);

        System.Diagnostics.Stopwatch watch = System.Diagnostics.Stopwatch.StartNew();
        await session.DisposeAsync();
        Assert.That(watch.ElapsedMilliseconds, Is.LessThan(3000));
    }

    // 12. Limits

    [Test]
    public void SessionLimits_PerUserTotalAndRate() {
        Rtsp.SessionLimits limits = new Rtsp.SessionLimits(() => 3, () => 2, () => 5);

        Rtsp.SessionLimits.Lease? a1 = limits.TryAcquire("alice", out _);
        Rtsp.SessionLimits.Lease? a2 = limits.TryAcquire("alice", out _);
        Assert.That(limits.TryAcquire("alice", out string error), Is.Null);
        Assert.That(error, Is.EqualTo("Too many open camera streams"));

        Rtsp.SessionLimits.Lease? b1 = limits.TryAcquire("bob", out _);
        Assert.That(limits.TryAcquire("bob", out error), Is.Null);
        Assert.That(error, Is.EqualTo("The server has reached its limit of camera streams"));

        a1!.Dispose();
        a1.Dispose(); //twice is harmless
        Assert.That(limits.Total, Is.EqualTo(2));

        //alice's fourth and fifth attempts of the minute, then the rate limit
        Rtsp.SessionLimits.Lease? a3 = limits.TryAcquire("alice", out _);
        Assert.That(a3, Is.Not.Null);
        a3!.Dispose();
        Rtsp.SessionLimits.Lease? a4 = limits.TryAcquire("alice", out _);
        Assert.That(a4, Is.Not.Null);
        a4!.Dispose();
        Assert.That(limits.TryAcquire("alice", out error), Is.Null);
        Assert.That(error, Does.StartWith("Too many connection attempts"));

        a2!.Dispose();
        b1!.Dispose();
        Assert.That(limits.Total, Is.Zero);
    }

    [Test]
    public async Task Run_PerUserLimit_RefusesBeforeConnecting() {
        await using MockCamera camera = new MockCamera().Start();
        Rtsp.SessionLimits limits = new Rtsp.SessionLimits(() => 64, () => 1, () => 1000);

        using Browser first = await Browser.ConnectAsync();
        Task firstRun = Rtsp.RunAsync(first.Server, TestClient(new ConcurrentQueue<string>()), TestSettings(limits: limits), CancellationToken.None);
        await first.SendAsync(new { url = camera.Url() });
        await first.DrainAsync(5000, (t, f) => f >= 1);

        using Browser second = await Browser.ConnectAsync();
        Task secondRun = Rtsp.RunAsync(second.Server, TestClient(new ConcurrentQueue<string>()), TestSettings(limits: limits), CancellationToken.None);
        await second.SendAsync(new { url = camera.Url() });
        (List<string> texts, _) = await second.DrainAsync();
        await secondRun;

        Assert.That(texts, Is.EqualTo(new[] { "{\"error\":\"Too many open camera streams\"}" }));
        Assert.That(camera.Connections, Is.EqualTo(1));

        await first.CloseAsync();
        Assert.That(await Task.WhenAny(firstRun, Task.Delay(5000)), Is.SameAs(firstRun));
        Assert.That(limits.Total, Is.Zero);
    }

    // 13. Redaction

    [Test]
    public async Task Run_FailedAuthentication_LeaksNoSecretsToTheBrowserOrTheLog() {
        const string password = "S3cr3t-P@ssw0rd";
        const string token = "AbCdEfSecretToken";
        await using MockCamera camera = new MockCamera { Auth = "digest" }.Start();
        using Browser browser = await Browser.ConnectAsync();
        ConcurrentQueue<string> audit = new ConcurrentQueue<string>();

        Task run = Rtsp.RunAsync(browser.Server, TestClient(audit), TestSettings(), CancellationToken.None);
        await browser.SendAsync(new { url = camera.Url($"/{token}?channel=1"), username = "admin", password });
        (List<string> texts, _) = await browser.DrainAsync();
        await run;

        Assert.That(texts, Is.EqualTo(new[] { "{\"error\":\"Authentication failed\",\"authentication\":true}" }));
        foreach (string line in texts.Concat(audit)) {
            Assert.That(line, Does.Not.Contain(password));
            Assert.That(line, Does.Not.Contain(token));
            Assert.That(line, Does.Not.Contain("Authorization"));
        }
    }

    [Test]
    public void DescribeStatus_LeavesOutTheCamerasReasonPhrase() {
        Rtsp.Message response = new Rtsp.Message { status = 400, reason = "Bad Request from 10.9.8.7 internal-host" };
        Assert.That(Rtsp.DescribeStatus(response), Is.EqualTo("The camera responded with status 400"));
    }

    [Test]
    public void Sanitize_StripsControlCharactersAndCapsTheLength() {
        Assert.That(Rtsp.Syntax.Sanitize("Camera\r\n\tX", 64), Is.EqualTo("Camera   X"));
        Assert.That(Rtsp.Syntax.Sanitize(new string('a', 300), 10), Is.EqualTo("aaaaaaaaaa..."));
    }

    // 14. Regression

    [Test]
    public async Task Run_PlainRtsp_StreamsFrames() {
        await using MockCamera camera = new MockCamera().Start();
        using Browser browser = await Browser.ConnectAsync();
        ConcurrentQueue<string> audit = new ConcurrentQueue<string>();

        Task run = Rtsp.RunAsync(browser.Server, TestClient(audit), TestSettings(), CancellationToken.None);
        await browser.SendAsync(new { url = camera.Url() });

        (List<string> texts, int frames) = await browser.DrainAsync(5000, (t, f) => f >= 5);

        Assert.That(texts[0], Does.StartWith("{\"stream\":{\"codec\":\"H.264\""));
        Assert.That(texts, Does.Contain("{\"codec\":\"avc1.42c01e\"}"));
        Assert.That(frames, Is.GreaterThanOrEqualTo(5));

        await browser.CloseAsync();
        Assert.That(await Task.WhenAny(run, Task.Delay(5000)), Is.SameAs(run));
        Assert.That(await Task.WhenAny(camera.Closed.Task, Task.Delay(5000)), Is.SameAs(camera.Closed.Task));
        Assert.That(camera.Requests.Any(o => o.StartsWith("TEARDOWN")), Is.True);
        Assert.That(audit, Has.Some.StartsWith("Establish RTSP stream"));
        Assert.That(audit, Has.Some.StartsWith("Close RTSP stream"));
    }

    [Test]
    public async Task Run_Rtsps_WithDigest_StreamsFrames_AndReportsTheCertificate() {
        using X509Certificate2 certificate = MockCamera.CreateCertificate();
        await using MockCamera camera = new MockCamera { Certificate = certificate, Auth = "digest-sha256" }.Start();
        using Browser browser = await Browser.ConnectAsync();

        Task run = Rtsp.RunAsync(browser.Server, TestClient(new ConcurrentQueue<string>()), TestSettings(), CancellationToken.None);
        await browser.SendAsync(new { url = camera.Url(), username = "admin", password = "secret" });

        (List<string> texts, int frames) = await browser.DrainAsync(5000, (t, f) => f >= 3);

        using JsonDocument info = JsonDocument.Parse(texts[0]);
        JsonElement stream = info.RootElement.GetProperty("stream");
        Assert.That(stream.GetProperty("secure").GetBoolean(), Is.True);
        Assert.That(stream.GetProperty("verified").GetBoolean(), Is.False);
        Assert.That(stream.GetProperty("thumbprint").GetString(), Is.EqualTo(certificate.GetCertHashString()));
        Assert.That(frames, Is.GreaterThanOrEqualTo(3));

        await browser.CloseAsync();
        await run;
    }
}

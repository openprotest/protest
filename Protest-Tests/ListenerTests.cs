global using NUnit.Framework;
using System.Collections.Concurrent;
using System.Net;
using System.Net.Sockets;
using System.Text;
using Protest.Http;

namespace Protest.Tests;

public class ListenerTests {
    private Listener? listener;
    private Listener? wildcardListener;
    private int wildcardPort;
    private readonly DirectoryInfo? front;
    private int port;
    private string baseUrl = String.Empty;

    public ListenerTests() {
        DirectoryInfo baseDir = new DirectoryInfo(AppContext.BaseDirectory);
        DirectoryInfo? repoRoot = baseDir.Parent?.Parent?.Parent?.Parent;

        if (repoRoot is null) {
            Assert.Fail("Could not determine repository root");
            return;
        }
        
        front = new DirectoryInfo(Path.Combine(repoRoot.FullName, "Protest", "Front"));
        
        if (!front.Exists) {
            Assert.Fail($"\"Front\" directory not found: {front.FullName}");
        }
    }

    [OneTimeSetUp]
    public void Setup() {
        //a free port, so a Pro-test instance already running on this machine doesn't fail the fixture
        port = FreePort();

        baseUrl = $"http://127.0.0.1:{port}";
        listener = new Listener("127.0.0.1", (ushort)port, front?.FullName);
        listener?.StartAsync();
    }

    [OneTimeTearDown]
    public void TearDown() {
        listener?.Stop();
        wildcardListener?.Stop();
    }

    [Test]
    public void Listener_RootPage_ReturnOK() {
        using HttpRequestMessage requestMessage = new HttpRequestMessage(HttpMethod.Get, $"{baseUrl}/");

        using HttpClient httpClient = new HttpClient();
        HttpResponseMessage result = httpClient.Send(requestMessage);

        Assert.That(result.StatusCode == HttpStatusCode.OK || result.StatusCode == HttpStatusCode.Unauthorized, Is.True);
    }

    [Test]
    public void Listener_NonExistingPageUnauthenticated_ReturnUnauthorized() {
        using HttpRequestMessage requestMessage = new HttpRequestMessage(HttpMethod.Get, $"{baseUrl}/i-dont-exists");

        using HttpClient httpClient = new HttpClient();
        HttpResponseMessage result = httpClient.Send(requestMessage);

        Assert.That(result.StatusCode, Is.EqualTo(HttpStatusCode.Unauthorized));
    }

    [Test]
    public void CsrfCheck_NoHostInReferrer_ReturnOk() {
        using HttpRequestMessage requestMessage = new HttpRequestMessage(HttpMethod.Get, $"{baseUrl}/");

        using HttpClient httpClient = new HttpClient();
        HttpResponseMessage result = httpClient.Send(requestMessage);

        Assert.That(result.StatusCode, Is.EqualTo(HttpStatusCode.OK));
    }

    [Test]
    public void CsrfCheck_SameHostInReferrer_ReturnOk() {
        using HttpRequestMessage requestMessage = new HttpRequestMessage(HttpMethod.Get, $"{baseUrl}/");
        requestMessage.Headers.Add("Referer", $"{baseUrl}/");

        using HttpClient httpClient = new HttpClient();
        HttpResponseMessage result = httpClient.Send(requestMessage);

        Assert.That(result.StatusCode, Is.EqualTo(HttpStatusCode.OK));
    }

    //Behind a trusted proxy the client is the rightmost address our proxies did not add,
    //anything further left was sent by the client and must never become its address.
    [Test]
    public void ForwardedFor_ForgedLeftEntries_ShareTheClientRateLimit() {
        WithTrustedLoopbackProxy(() => {
            for (int i = 0; i < 10; i++) {
                Assert.That(SendWithForwardedFor(HttpMethod.Post, "/auth", $"6.6.6.{i}, 198.51.100.10"), Is.EqualTo(HttpStatusCode.Unauthorized));
            }

            Assert.That(SendWithForwardedFor(HttpMethod.Post, "/auth", "6.6.6.99, 198.51.100.10"), Is.EqualTo(HttpStatusCode.TooManyRequests));
        });
    }

    [TestCase("198.51.100.20")]
    [TestCase("not-an-address, 198.51.100.20")]
    [TestCase("6.6.6.6, 198.51.100.20, 127.0.0.1")]
    [TestCase("127.0.0.1, 198.51.100.20", Description = "forged loopback on the left")]
    [TestCase("  198.51.100.20  ,127.0.0.1 ", Description = "whitespace around entries")]
    [TestCase("2001:db8::20")]
    [TestCase("[2001:db8::20]:443", Description = "IPAddress drops the port of a bracketed IPv6 address")]
    public void ForwardedFor_ClientEntry_IsAccepted(string header) {
        WithTrustedLoopbackProxy(() => {
            Assert.That(SendWithForwardedFor(HttpMethod.Get, "/", header), Is.EqualTo(HttpStatusCode.OK));
        });
    }

    [TestCase("198.51.100.30, not-an-address")]
    [TestCase("198.51.100.30,")]
    [TestCase("198.51.100.30:51234", Description = "IPv4 with a port")]
    [TestCase(",")]
    [TestCase("unknown")]
    [TestCase("not-an-address, 127.0.0.1", Description = "reached while walking past the trusted proxy")]
    [TestCase("::1", Description = "loopback client")]
    [TestCase("::ffff:127.0.0.1")]
    [TestCase("127.1")]
    [TestCase("2130706433")]
    [TestCase("198.51.100.30, 127.0.0.2", Description = "loopback, but not the trusted proxy")]
    [TestCase("127.0.0.1", Description = "only the trusted proxy, which is loopback")]
    public void ForwardedFor_InvalidClientEntry_ReturnBadRequest(string header) {
        WithTrustedLoopbackProxy(() => {
            Assert.That(SendWithForwardedFor(HttpMethod.Get, "/", header), Is.EqualTo(HttpStatusCode.BadRequest));
        });
    }

    [Test]
    public void ForwardedFor_FromUntrustedPeer_ReturnBadRequest() {
        Assert.That(SendWithForwardedFor(HttpMethod.Get, "/", "198.51.100.40"), Is.EqualTo(HttpStatusCode.BadRequest));
    }

    //On Linux and macOS every request of a keep-alive connection shares one IPEndPoint. The client one request
    //took from X-Forwarded-For must not become the peer the next request on that connection is checked against.
    //The backdoor shows the peer here: a trusted loopback proxy that sends no header is refused.
    [Test]
    public void ForwardedFor_KeepAliveConnection_StartsEachRequestFromThePeer() {
        WithTrustedLoopbackProxy(() => WithBackdoor(() => {
            using TcpClient tcp = new TcpClient();
            tcp.ReceiveTimeout = 5_000;
            tcp.Connect(IPAddress.Loopback, port);
            NetworkStream stream = tcp.GetStream();

            Assert.That(SendOnConnection(stream, "198.51.100.50"), Is.EqualTo(HttpStatusCode.OK), "first client");
            Assert.That(SendOnConnection(stream, "198.51.100.51"), Is.EqualTo(HttpStatusCode.OK), "the peer is still the trusted proxy");
            Assert.That(SendOnConnection(stream, null), Is.EqualTo(HttpStatusCode.BadRequest), "the peer is the loopback proxy again");
        }));
    }

    //With the backdoor on, a proxy on this host that left the header out would pass it for every client it forwards.
    [Test]
    public void ForwardedFor_MissingFromTrustedLoopbackProxyWithBackdoor_ReturnBadRequest() {
        WithTrustedLoopbackProxy(() => WithBackdoor(() => {
            Assert.That(SendWithForwardedFor(HttpMethod.Get, "/", null), Is.EqualTo(HttpStatusCode.BadRequest));
        }));
    }

    [Test]
    public void ForwardedFor_MissingFromLoopbackClientWithBackdoor_ReturnOk() {
        WithBackdoor(() => {
            Assert.That(SendWithForwardedFor(HttpMethod.Get, "/version", null), Is.EqualTo(HttpStatusCode.OK));
        });
    }

    //Behind a proxy the Host header names the backend, the origin is compared against the host the proxy received instead
    [Test]
    public void ForwardedHost_FromTrustedProxy_IsTheHostTheOriginIsCheckedAgainst() {
        WithTrustedLoopbackProxy(() => WithSession("/rbac/list", cookie => {
            Assert.That(SendWithForwardedHost("/rbac/list", cookie, "https://proxy.test:4443", "proxy.test:4443"), Is.EqualTo(HttpStatusCode.OK));
            Assert.That(SendWithForwardedHost("/rbac/list", cookie, "https://proxy.test", "proxy.test"), Is.EqualTo(HttpStatusCode.OK), "default port");
            Assert.That(SendWithForwardedHost("/rbac/list", cookie, "https://evil.test:4443", "proxy.test:4443"), Is.EqualTo(HttpStatusCode.Forbidden));
            Assert.That(SendWithForwardedHost("/rbac/list", cookie, "https://proxy.test:4443", null), Is.EqualTo(HttpStatusCode.Forbidden), "the backend address is compared");
        }));
    }

    [Test]
    public void ForwardedHost_FromUntrustedPeer_ReturnBadRequest() {
        Assert.That(SendWithForwardedHost("/", null, null, "proxy.test:4443"), Is.EqualTo(HttpStatusCode.BadRequest));
    }

    [Test]
    public void ForwardedHost_WithSeveralEntries_ReturnBadRequest() {
        WithTrustedLoopbackProxy(() => {
            Assert.That(SendWithForwardedHost("/", null, null, "evil.test, proxy.test:4443"), Is.EqualTo(HttpStatusCode.BadRequest));
        });
    }

#if DEBUG
    //Without Domain the cookie stays on the host the browser used, never the backend address a proxy puts in Host.
    //Debug builds skip TOTP, so the password alone signs in.
    [Test]
    public void SignIn_SessionCookie_IsHostOnly() {
        const string username = "unit-test-sign-in";
        Auth.rbac[username] = new Auth.AccessControl {
            username      = username,
            passwordHash  = Cryptography.HashUsernameAndPassword(username, "unit-test-password"),
            authorization = [],
            accessPath    = []
        };

        try {
            using HttpRequestMessage requestMessage = new HttpRequestMessage(HttpMethod.Post, $"{baseUrl}/auth");
            requestMessage.Content = new StringContent($"x\u007F{username}\u007Funit-test-password");

            using HttpClient httpClient = new HttpClient(new SocketsHttpHandler { UseCookies = false });
            using HttpResponseMessage result = httpClient.Send(requestMessage);
            result.Headers.TryGetValues("Set-Cookie", out IEnumerable<string>? setCookies);

            Assert.That(result.StatusCode, Is.EqualTo(HttpStatusCode.Accepted));
            Assert.That(setCookies, Has.One.StartsWith($"{Auth.SESSION_COOKIE}=").And.Contains("; Path=/;").And.Not.Contains("Domain"));
        }
        finally {
            Auth.rbac.TryRemove(username, out _);
            foreach (Auth.Session session in Auth.sessions.Values.Where(o => o.access.username == username)) {
                Auth.sessions.TryRemove(session.sessionId, out _);
            }
        }
    }
#endif

    //Sign-in runs before the session checks, from another origin it is refused before the rate limit counts it
    [TestCase("cross-site")]
    [TestCase("same-site", Description = "another port of this host")]
    [TestCase("none", Description = "typed, bookmarked, or opened from another application")]
    public void Auth_FromAnotherOrigin_ReturnForbidden(string fetchSite) {
        Assert.That(SendAuth(fetchSite), Is.EqualTo(HttpStatusCode.Forbidden));
    }

    [Test]
    public void Auth_FromSameOrigin_IsHandled() {
        Assert.That(SendAuth("same-origin"), Is.EqualTo(HttpStatusCode.Unauthorized));
    }

    //An unknown username is hashed like a wrong password, so the response time doesn't tell which usernames exist
    [Test]
    public void Auth_UnknownUsername_TakesAsLongAsAWrongPassword() {
        const string username = "unit-test-timing";
        Auth.rbac[username] = new Auth.AccessControl {
            username      = username,
            passwordHash  = Cryptography.HashUsernameAndPassword(username, "unit-test-password"),
            authorization = [],
            accessPath    = []
        };

        try {
            WithTrustedLoopbackProxy(() => {
                TimeSpan wrongPassword   = TimeAuth($"x\u007F{username}\u007Fwrong-password");
                TimeSpan unknownUsername = TimeAuth("x\u007Funit-test-nobody\u007Fwrong-password");

                //the hash takes far longer than the rest of the request, without it the unknown username answers almost at once
                Assert.That(unknownUsername, Is.GreaterThan(wrongPassword / 2));
            });
        }
        finally {
            Auth.rbac.TryRemove(username, out _);
        }
    }

    [Test]
    public void RateLimit_HostsWithNoAttemptInTheWindow_AreEvicted() {
        IPAddress idle   = IPAddress.Parse("203.0.113.70");
        IPAddress active = IPAddress.Parse("203.0.113.71");
        long now = DateTime.UtcNow.Ticks;

        Auth.rateLimitLog[idle]   = new ConcurrentQueue<long>([now - TimeSpan.TicksPerMinute * 11]);
        Auth.rateLimitLog[active] = new ConcurrentQueue<long>([now - TimeSpan.TicksPerMinute * 11, now - TimeSpan.TicksPerMinute]);

        try {
            Auth.EvictIdleRateLimits(now);

            Assert.That(Auth.rateLimitLog.ContainsKey(idle), Is.False);
            Assert.That(Auth.rateLimitLog.TryGetValue(active, out ConcurrentQueue<long>? timestamps) ? timestamps.Count : 0, Is.EqualTo(1), "the attempt still in the window is kept");
        }
        finally {
            Auth.rateLimitLog.TryRemove(idle, out _);
            Auth.rateLimitLog.TryRemove(active, out _);
        }
    }

    //DNS rebinding: a page whose name now points to 127.0.0.1 is same-origin to itself, only a listener on a wildcard prefix
    //takes a Host it doesn't know, with the backdoor on it must refuse it
    [TestCase("evil.test", true,  HttpStatusCode.BadRequest)]
    [TestCase("localhost", true,  HttpStatusCode.OK)]
    [TestCase("127.0.0.1", true,  HttpStatusCode.OK)]
    [TestCase("evil.test", false, HttpStatusCode.Unauthorized, Description = "without the backdoor it has no session")]
    public void Backdoor_LoopbackClientNamingAnotherHost(string hostName, bool backdoor, HttpStatusCode expected) {
        StartWildcardListener();

        bool original = Configuration.backdoor;
        Configuration.backdoor = backdoor;
        try {
            using HttpRequestMessage requestMessage = new HttpRequestMessage(HttpMethod.Get, $"http://127.0.0.1:{wildcardPort}/rbac/list");
            requestMessage.Headers.Host = $"{hostName}:{wildcardPort}";
            requestMessage.Headers.TryAddWithoutValidation("Sec-Fetch-Site", "same-origin");

            using HttpClient httpClient = new HttpClient();
            using HttpResponseMessage result = httpClient.Send(requestMessage);
            Assert.That(result.StatusCode, Is.EqualTo(expected));
        }
        finally {
            Configuration.backdoor = original;
        }
    }

    [Test]
    public void CreateUser_PasswordFromTheBody_IsKeptAsTyped() {
        const string username = "unit-test-body-password";
        WithSession("/rbac/create", cookie => {
            try {
                string response = SendCreateUser(cookie, $"username={username}", "{\"password\":\"pa%41ss\",\"authorization\":[\"devices:read\"]}");

                Assert.That(response, Is.EqualTo("{\"status\":\"ok\"}"));
                Assert.That(Auth.rbac[username].passwordHash, Is.EqualTo(Cryptography.HashUsernameAndPassword(username, "pa%41ss")));
                Assert.That(Auth.rbac[username].authorization, Is.EqualTo(new[] { "devices:read" }));
            }
            finally {
                Auth.rbac.TryRemove(username, out _);
                File.Delete(Path.Join(Data.DIR_RBAC, username));
            }
        });
    }

    [Test]
    public void CreateUser_PasswordInTheUrl_IsIgnored() {
        WithSession("/rbac/create", cookie => {
            string response = SendCreateUser(cookie, "username=unit-test-url-password&password=from-the-url", "{\"authorization\":[]}");
            Assert.That(response, Does.Contain("please enter password"));
            Assert.That(Auth.rbac.ContainsKey("unit-test-url-password"), Is.False);
        });
    }

    [TestCase("[\"devices:read\"]", Description = "the former body, only the permissions")]
    [TestCase("not json")]
    public void CreateUser_BodyThatIsNotTheJsonObject_IsInvalid(string body) {
        WithSession("/rbac/create", cookie => {
            string response = SendCreateUser(cookie, "username=unit-test-invalid-body", body);
            Assert.That(response, Is.EqualTo(Encoding.UTF8.GetString(Data.CODE_INVALID_ARGUMENT)));
            Assert.That(Auth.rbac.ContainsKey("unit-test-invalid-body"), Is.False);
        });
    }

    //built once, the listener takes seconds to load the front-end
    private void StartWildcardListener() {
        if (wildcardListener is not null) return;

        wildcardPort = FreePort();
        try {
            wildcardListener = new Listener([$"http://+:{wildcardPort}/"], front?.FullName);
        }
        catch (HttpListenerException) {
            Assert.Ignore("A wildcard prefix needs a URL reservation on this platform");
        }

        _ = wildcardListener.StartAsync();
    }

    private static int FreePort() {
        using TcpListener probe = new TcpListener(IPAddress.Loopback, 0);
        probe.Start();
        return ((IPEndPoint)probe.LocalEndpoint).Port;
    }

    private static void WithBackdoor(Action test) {
        bool backdoor = Configuration.backdoor;
        Configuration.backdoor = true;
        try {
            test();
        }
        finally {
            Configuration.backdoor = backdoor;
        }
    }

    private static void WithTrustedLoopbackProxy(Action test) {
        bool added = Configuration.trustedProxies.Add(IPAddress.Loopback);
        try {
            test();
        }
        finally {
            if (added) Configuration.trustedProxies.Remove(IPAddress.Loopback);
        }
    }

    private static void WithSession(string path, Action<string> test) {
        string sessionId = Guid.NewGuid().ToString();
        Auth.sessions[sessionId] = new Auth.Session {
            access    = new Auth.AccessControl { username = "unit-test-admin", accessPath = [path] },
            ip        = IPAddress.Loopback,
            sessionId = sessionId,
            loginDate = DateTime.UtcNow.Ticks,
            ttl       = TimeSpan.FromHours(1).Ticks
        };

        try {
            test($"{Auth.SESSION_COOKIE}={sessionId}");
        }
        finally {
            Auth.sessions.TryRemove(sessionId, out _);
        }
    }

    private HttpStatusCode SendWithForwardedHost(string path, string? cookie, string? origin, string? forwardedHost) {
        using HttpRequestMessage requestMessage = new HttpRequestMessage(HttpMethod.Get, $"{baseUrl}{path}");
        if (cookie is not null) requestMessage.Headers.Add("Cookie", cookie);
        if (origin is not null) requestMessage.Headers.TryAddWithoutValidation("Origin", origin);
        if (forwardedHost is not null) requestMessage.Headers.TryAddWithoutValidation("X-Forwarded-Host", forwardedHost);

        using HttpClient httpClient = new HttpClient();
        using HttpResponseMessage result = httpClient.Send(requestMessage);
        return result.StatusCode;
    }

    private HttpStatusCode SendAuth(string fetchSite) {
        using HttpRequestMessage requestMessage = new HttpRequestMessage(HttpMethod.Post, $"{baseUrl}/auth");
        requestMessage.Headers.TryAddWithoutValidation("Sec-Fetch-Site", fetchSite);
        requestMessage.Content = new StringContent("x\u007Fnobody\u007Fwrong");

        using HttpClient httpClient = new HttpClient();
        using HttpResponseMessage result = httpClient.Send(requestMessage);
        return result.StatusCode;
    }

    //from a client of its own behind the trusted loopback proxy, so it has its own rate limit
    private TimeSpan TimeAuth(string body) {
        using HttpRequestMessage requestMessage = new HttpRequestMessage(HttpMethod.Post, $"{baseUrl}/auth");
        requestMessage.Headers.TryAddWithoutValidation("X-Forwarded-For", "198.51.100.60");
        requestMessage.Content = new StringContent(body);

        using HttpClient httpClient = new HttpClient();
        System.Diagnostics.Stopwatch stopwatch = System.Diagnostics.Stopwatch.StartNew();
        using HttpResponseMessage result = httpClient.Send(requestMessage);
        stopwatch.Stop();

        Assert.That(result.StatusCode, Is.EqualTo(HttpStatusCode.Unauthorized));
        return stopwatch.Elapsed;
    }

    private string SendCreateUser(string cookie, string query, string body) {
        using HttpRequestMessage requestMessage = new HttpRequestMessage(HttpMethod.Post, $"{baseUrl}/rbac/create?{query}");
        requestMessage.Headers.Add("Cookie", cookie);
        requestMessage.Content = new StringContent(body);

        using HttpClient httpClient = new HttpClient();
        using HttpResponseMessage result = httpClient.Send(requestMessage);
        return result.Content.ReadAsStringAsync().Result;
    }

    private HttpStatusCode SendWithForwardedFor(HttpMethod method, string path, string? forwardedFor) {
        using HttpRequestMessage requestMessage = new HttpRequestMessage(method, $"{baseUrl}{path}");
        if (forwardedFor is not null) requestMessage.Headers.TryAddWithoutValidation("X-Forwarded-For", forwardedFor);
        if (method == HttpMethod.Post) requestMessage.Content = new StringContent("x\u007Fnobody\u007Fwrong");

        using HttpClient httpClient = new HttpClient();
        using HttpResponseMessage result = httpClient.Send(requestMessage);
        return result.StatusCode;
    }

    //HttpClient picks its own connections, this writes each request on the given one and reads the whole response off it
    private HttpStatusCode SendOnConnection(NetworkStream stream, string? forwardedFor) {
        string request = $"GET / HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\n"
            + (forwardedFor is null ? String.Empty : $"X-Forwarded-For: {forwardedFor}\r\n")
            + "\r\n";
        stream.Write(Encoding.ASCII.GetBytes(request));

        StringBuilder head = new StringBuilder();
        while (!head.ToString().EndsWith("\r\n\r\n")) {
            int b = stream.ReadByte();
            if (b < 0) throw new EndOfStreamException("The listener closed the connection");
            head.Append((char)b);
        }

        string[] lines = head.ToString().Split("\r\n");
        string? contentLength = lines.FirstOrDefault(o => o.StartsWith("Content-Length:", StringComparison.OrdinalIgnoreCase));
        if (contentLength is not null) {
            stream.ReadExactly(new byte[int.Parse(contentLength["Content-Length:".Length..].Trim())]);
        }

        return (HttpStatusCode)int.Parse(lines[0].Split(' ')[1]);
    }
}
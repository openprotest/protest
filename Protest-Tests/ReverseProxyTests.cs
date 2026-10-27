using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Text;
using Protest.Http;
using Protest.Proxy;

namespace Protest.Tests;

//Cookies are not scoped to a port. A browser sends the Pro-test session cookie to a reverse proxy on the same host,
//and keeps cookies set behind that proxy for the Pro-test host too, so the session cookie must not cross the proxy either way.
//Unless the backend is Pro-test itself, then the proxy passes it like any other cookie.
public class ReverseProxyTests {

    [Test]
    public async Task HttpProxy_SessionCookie_NeverCrossesTheProxy() {
        string session = Auth.SESSION_COOKIE;
        string upper = session.ToUpperInvariant();

        (string head, IEnumerable<string>? setCookies) = await SendThroughProxyAsync(
            $"theme=light; {session}=PROTEST; {upper}=PROTEST; sessionid=kept",
            $"Set-Cookie: {session}=FROM_BACKEND; Path=/\r\nSet-Cookie: {upper}=FROM_BACKEND; Path=/\r\nSet-Cookie: sessionid=dark; Path=/\r\n");

        Assert.That(CookieHeader(head), Is.EqualTo("theme=light; sessionid=kept"), "cookies the backend received");
        Assert.That(setCookies, Is.EqualTo(new[] { "sessionid=dark; Path=/" }), "cookies the browser would keep");
    }

    [Test]
    public async Task HttpProxy_ToTheListener_PassesTheSessionCookie() {
        string session = Auth.SESSION_COOKIE;

        (string head, IEnumerable<string>? setCookies) = await SendThroughProxyAsync(
            $"theme=light; {session}=PROTEST",
            $"Set-Cookie: {session}=FROM_LISTENER; Path=/\r\n",
            toListener: true);

        Assert.That(CookieHeader(head), Is.EqualTo($"theme=light; {session}=PROTEST"));
        Assert.That(setCookies, Is.EqualTo(new[] { $"{session}=FROM_LISTENER; Path=/" }));
    }

    //the backend learns the host the browser used, never one the client made up
    [Test]
    public async Task HttpProxy_ForwardedHost_IsTheHostTheProxyReceived() {
        (string head, _) = await SendThroughProxyAsync(null, String.Empty, forwardedHost: "evil.test");

        string[] forwardedHosts = head.Split("\r\n").Where(o => o.StartsWith("X-Forwarded-Host:", StringComparison.OrdinalIgnoreCase)).ToArray();
        Assert.That(forwardedHosts, Has.Length.EqualTo(1));
        Assert.That(forwardedHosts[0], Does.Match(@"^X-Forwarded-Host: 127\.0\.0\.1:\d+$"));
    }

#if DEBUG
    //Pro-test published through its own proxy: sign in, then use the session, the way the browser does.
    //Debug builds skip TOTP, so the password alone signs in.
    [Test]
    public async Task HttpProxy_ToTheListener_SignInWorks() {
        const string username = "unit-test-proxy-sign-in";
        //the browser is never on loopback, the listener refuses a loopback client behind a proxy
        IPAddress? lan = NetworkInterface.GetAllNetworkInterfaces()
            .Where(nic => nic.OperationalStatus == OperationalStatus.Up)
            .SelectMany(nic => nic.GetIPProperties().UnicastAddresses)
            .Select(unicast => unicast.Address)
            .FirstOrDefault(address => address.AddressFamily == AddressFamily.InterNetwork && !IPAddress.IsLoopback(address));
        if (lan is null) Assert.Ignore("No non-loopback IPv4 address on this host");

        DirectoryInfo front = new DirectoryInfo(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "Protest", "Front"));
        int listenerPort = FreePort();
        int proxyPort = FreePort();

        Listener listener = new Listener("127.0.0.1", (ushort)listenerPort, front.FullName);
        _ = listener.StartAsync();
        HttpReverseProxy proxy = new HttpReverseProxy(Guid.NewGuid(), new HttpLimits(), new IpFilter());
        WithPrefixes([$"http://127.0.0.1:{listenerPort}/"], () => proxy.Start(new IPEndPoint(lan, proxyPort), $"http://127.0.0.1:{listenerPort}", null, null, "test"));

        bool trusted = Configuration.trustedProxies.Add(IPAddress.Loopback);
        Auth.rbac[username] = new Auth.AccessControl {
            username      = username,
            passwordHash  = Cryptography.HashUsernameAndPassword(username, "unit-test-password"),
            authorization = [],
            accessPath    = ["/rbac/list"]
        };

        try {
            using HttpClient client = new HttpClient(new SocketsHttpHandler { UseCookies = false });

            using HttpRequestMessage signIn = new HttpRequestMessage(HttpMethod.Post, $"http://{lan}:{proxyPort}/auth");
            signIn.Content = new StringContent($"x\u007F{username}\u007Funit-test-password");
            using HttpResponseMessage signedIn = await client.SendAsync(signIn);
            signedIn.Headers.TryGetValues("Set-Cookie", out IEnumerable<string>? setCookies);
            string? cookie = setCookies?.FirstOrDefault(o => o.StartsWith($"{Auth.SESSION_COOKIE}="))?.Split(';')[0];

            Assert.That(signedIn.StatusCode, Is.EqualTo(HttpStatusCode.Accepted));
            Assert.That(cookie, Is.Not.Null, "the session cookie reached the browser");

            using HttpRequestMessage list = new HttpRequestMessage(HttpMethod.Get, $"http://{lan}:{proxyPort}/rbac/list");
            list.Headers.TryAddWithoutValidation("Cookie", cookie);
            list.Headers.TryAddWithoutValidation("Origin", $"http://{lan}:{proxyPort}");
            using HttpResponseMessage listed = await client.SendAsync(list);

            Assert.That(listed.StatusCode, Is.EqualTo(HttpStatusCode.OK), "the session works through the proxy, from the proxy's origin");
        }
        finally {
            proxy.Stop("test");
            listener.Stop();
            if (trusted) Configuration.trustedProxies.Remove(IPAddress.Loopback);
            Auth.rbac.TryRemove(username, out _);
            foreach (Auth.Session session in Auth.sessions.Values.Where(o => o.access.username == username)) {
                Auth.sessions.TryRemove(session.sessionId, out _);
            }
        }
    }
#endif

    [TestCase("http://+:8181/",           "http://127.0.0.1:8181",  true)]
    [TestCase("http://*:8181/",           "http://localhost:8181",  true)]
    [TestCase("http://127.0.0.1:8181/",   "http://localhost:8181",  true,  Description = "the name resolves to the prefix address")]
    [TestCase("http://[::1]:8181/",       "http://[::1]:8181",      true)]
    [TestCase("http://+/",                "http://127.0.0.1",       true,  Description = "default port")]
    [TestCase("http://127.0.0.1:8181/",   "http://127.0.0.1:8182",  false, Description = "another port")]
    [TestCase("https://+:8181/",          "http://127.0.0.1:8181",  false, Description = "another scheme")]
    [TestCase("http://127.0.0.1:8181/",   "http://127.0.0.2:8181",  false, Description = "local, but not the prefix address")]
    [TestCase("http://+:8181/",           "http://192.0.2.1:8181",  false, Description = "not this host")]
    [TestCase("http://127.0.0.1:port/",   "http://127.0.0.1:8181",  false, Description = "malformed prefix")]
    [TestCase("http://+:8181/",           "not a uri",              false)]
    public void IsListener(string prefix, string destination, bool expected) {
        WithPrefixes([prefix], () => {
            Assert.That(HttpReverseProxy.IsListener(destination), Is.EqualTo(expected));
        });
    }

    //runs one request through a proxy to a backend that answers with the given headers,
    //returns the request head the backend received and the Set-Cookie headers the client got
    private static async Task<(string head, IEnumerable<string>? setCookies)> SendThroughProxyAsync(string? cookies, string backendHeaders, bool toListener = false, string? forwardedHost = null) {
        using TcpListener backend = new TcpListener(IPAddress.Loopback, 0);
        backend.Start();
        int backendPort = ((IPEndPoint)backend.LocalEndpoint).Port;

        Task<string> backendHead = Task.Run(async () => {
            using TcpClient connection = await backend.AcceptTcpClientAsync();
            NetworkStream stream = connection.GetStream();
            string head = await ReadHeadAsync(stream);

            await stream.WriteAsync(Encoding.ASCII.GetBytes(
                "HTTP/1.1 200 OK\r\n" +
                backendHeaders +
                "Content-Length: 0\r\n" +
                "Connection: close\r\n\r\n"));

            return head;
        });

        int proxyPort = FreePort();
        HttpReverseProxy proxy = new HttpReverseProxy(Guid.NewGuid(), new HttpLimits(), new IpFilter());
        WithPrefixes(toListener ? [$"http://127.0.0.1:{backendPort}/"] : [], () => proxy.Start(new IPEndPoint(IPAddress.Loopback, proxyPort), $"http://127.0.0.1:{backendPort}", null, null, "test"));

        try {
            using HttpClient client = new HttpClient(new SocketsHttpHandler { UseCookies = false });
            using HttpRequestMessage request = new HttpRequestMessage(HttpMethod.Get, $"http://127.0.0.1:{proxyPort}/");
            if (cookies is not null) request.Headers.TryAddWithoutValidation("Cookie", cookies);
            if (forwardedHost is not null) request.Headers.TryAddWithoutValidation("X-Forwarded-Host", forwardedHost);

            using HttpResponseMessage response = await client.SendAsync(request);
            response.Headers.TryGetValues("Set-Cookie", out IEnumerable<string>? setCookies);

            return (await backendHead.WaitAsync(TimeSpan.FromSeconds(5)), setCookies?.ToArray());
        }
        finally {
            proxy.Stop("test");
        }
    }

    private static void WithPrefixes(string[] prefixes, Action test) {
        string[] original = Configuration.httpPrefixes;
        Configuration.httpPrefixes = prefixes;
        try {
            test();
        }
        finally {
            Configuration.httpPrefixes = original;
        }
    }

    private static string? CookieHeader(string head) =>
        head.Split("\r\n").FirstOrDefault(o => o.StartsWith("Cookie:", StringComparison.OrdinalIgnoreCase))?["Cookie:".Length..].Trim();

    private static int FreePort() {
        using TcpListener probe = new TcpListener(IPAddress.Loopback, 0);
        probe.Start();
        return ((IPEndPoint)probe.LocalEndpoint).Port;
    }

    private static async Task<string> ReadHeadAsync(NetworkStream stream) {
        StringBuilder head = new StringBuilder();
        byte[] one = new byte[1];
        while (!head.ToString().EndsWith("\r\n\r\n")) {
            if (await stream.ReadAsync(one) == 0) break;
            head.Append((char)one[0]);
        }
        return head.ToString();
    }
}

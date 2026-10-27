using System.Net;
using System.Net.Sockets;
using System.Text;
using Protest.Proxy;

namespace Protest.Tests;

//Cookies are not scoped to a port. A browser sends the Pro-test session cookie to a reverse proxy on the same host,
//and keeps cookies set behind that proxy for the Pro-test host too, so the session cookie must not cross the proxy either way.
public class ReverseProxyTests {

    [Test]
    public async Task HttpProxy_SessionCookie_NeverCrossesTheProxy() {
        using TcpListener backend = new TcpListener(IPAddress.Loopback, 0);
        backend.Start();
        int backendPort = ((IPEndPoint)backend.LocalEndpoint).Port;

        Task<string?> backendCookies = Task.Run(async () => {
            using TcpClient connection = await backend.AcceptTcpClientAsync();
            NetworkStream stream = connection.GetStream();
            string head = await ReadHeadAsync(stream);

            await stream.WriteAsync(Encoding.ASCII.GetBytes(
                "HTTP/1.1 200 OK\r\n" +
                "Set-Cookie: sessionid=FROM_BACKEND; Path=/\r\n" +
                "Set-Cookie: SessionID=FROM_BACKEND; Path=/\r\n" +
                "Set-Cookie: theme=dark; Path=/\r\n" +
                "Content-Length: 0\r\n" +
                "Connection: close\r\n\r\n"));

            return head.Split("\r\n").FirstOrDefault(o => o.StartsWith("Cookie:", StringComparison.OrdinalIgnoreCase))?["Cookie:".Length..].Trim();
        });

        int proxyPort = FreePort();
        HttpReverseProxy proxy = new HttpReverseProxy(Guid.NewGuid(), new HttpLimits(), new IpFilter());
        proxy.Start(new IPEndPoint(IPAddress.Loopback, proxyPort), $"http://127.0.0.1:{backendPort}", null, null, "test");

        try {
            using HttpClient client = new HttpClient(new SocketsHttpHandler { UseCookies = false });
            using HttpRequestMessage request = new HttpRequestMessage(HttpMethod.Get, $"http://127.0.0.1:{proxyPort}/");
            request.Headers.TryAddWithoutValidation("Cookie", "theme=light; sessionid=PROTEST; SESSIONID=PROTEST; sessionidx=kept");

            using HttpResponseMessage response = await client.SendAsync(request);
            response.Headers.TryGetValues("Set-Cookie", out IEnumerable<string>? setCookies);

            Assert.That(await backendCookies.WaitAsync(TimeSpan.FromSeconds(5)), Is.EqualTo("theme=light; sessionidx=kept"), "cookies the backend received");
            Assert.That(setCookies, Is.EqualTo(new[] { "theme=dark; Path=/" }), "cookies the browser would keep");
        }
        finally {
            proxy.Stop("test");
        }
    }

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

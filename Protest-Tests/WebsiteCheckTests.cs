using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Text;
using Protest.Tools;

namespace Protest.Tests;

//The site check runs requests on behalf of users, it must never reach a loopback address, the way a request
//from the server to itself would, neither directly, nor by a name that resolves to one, nor through a redirect.
public class WebsiteCheckTests {

    [TestCase("127.0.0.1")]
    [TestCase("127.10.20.30")]
    [TestCase("::1")]
    [TestCase("::ffff:127.0.0.1")]
    [TestCase("0.0.0.0")]
    [TestCase("::")]
    public void LoopbackAddressesAreRecognized(string address) {
        Assert.That(WebsiteCheck.IsLoopback(IPAddress.Parse(address)), Is.True);
    }

    [Test]
    public void ScopedIPv6LoopbackIsRecognized() {
        IPAddress scoped = new IPAddress(IPAddress.IPv6Loopback.GetAddressBytes(), 1);
        Assert.That(WebsiteCheck.IsLoopback(scoped), Is.True);
    }

    [TestCase("10.0.0.1")]
    [TestCase("192.168.1.1")]
    [TestCase("8.8.8.8")]
    [TestCase("::ffff:10.0.0.1")]
    [TestCase("2001:db8::1")]
    public void OtherAddressesAreNotLoopback(string address) {
        Assert.That(WebsiteCheck.IsLoopback(IPAddress.Parse(address)), Is.False);
    }

    [TestCase("127.0.0.1")]
    [TestCase("localhost")]
    public void LoopbackDestinationIsRefusedBeforeConnecting(string host) {
        using TcpListener target = new TcpListener(IPAddress.Loopback, 0);
        target.Start();
        int port = ((IPEndPoint)target.LocalEndpoint).Port;

        using HttpClient client = CreateClient();
        HttpRequestException ex = Assert.ThrowsAsync<HttpRequestException>(() => client.GetAsync($"http://{host}:{port}/"));

        Assert.That(ex.InnerException?.Message, Does.Contain("loopback address"));
        Assert.That(target.Pending(), Is.False, "the loopback listener must never see a connection");
    }

    [Test]
    public async Task RedirectToLoopbackIsRefused() {
        IPAddress lan = FindLanAddress();
        if (lan is null) Assert.Ignore("No non-loopback IPv4 address on this host");

        using TcpListener target = new TcpListener(IPAddress.Loopback, 0);
        target.Start();
        int targetPort = ((IPEndPoint)target.LocalEndpoint).Port;

        using TcpListener redirector = new TcpListener(lan, 0);
        redirector.Start();
        int redirectorPort = ((IPEndPoint)redirector.LocalEndpoint).Port;
        Task server = ServeOnceAsync(redirector, $"HTTP/1.1 302 Found\r\nLocation: http://127.0.0.1:{targetPort}/rbac/list\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");

        using HttpClient client = CreateClient();
        HttpRequestException ex = Assert.ThrowsAsync<HttpRequestException>(() => client.GetAsync($"http://{lan}:{redirectorPort}/"));

        await server.WaitAsync(TimeSpan.FromSeconds(5)); //the first, allowed hop was served
        Assert.That(ex.InnerException?.Message, Does.Contain("loopback address"));
        Assert.That(target.Pending(), Is.False, "the loopback listener must never see a connection");
    }

    [Test]
    public async Task OtherDestinationsAreReached() {
        IPAddress lan = FindLanAddress();
        if (lan is null) Assert.Ignore("No non-loopback IPv4 address on this host");

        using TcpListener listener = new TcpListener(lan, 0);
        listener.Start();
        int port = ((IPEndPoint)listener.LocalEndpoint).Port;
        Task server = ServeOnceAsync(listener, "HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");

        using HttpClient client = CreateClient();
        using HttpResponseMessage response = await client.GetAsync($"http://{lan}:{port}/");
        await server.WaitAsync(TimeSpan.FromSeconds(5));

        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.OK));
    }

    private static HttpClient CreateClient() =>
        new HttpClient(new SocketsHttpHandler { ConnectCallback = WebsiteCheck.ConnectExceptLoopbackAsync }) {
            Timeout = TimeSpan.FromSeconds(10)
        };

    private static async Task ServeOnceAsync(TcpListener listener, string response) {
        using TcpClient client = await listener.AcceptTcpClientAsync();
        using NetworkStream stream = client.GetStream();

        byte[] buffer = new byte[4096];
        StringBuilder request = new StringBuilder();
        while (!request.ToString().Contains("\r\n\r\n")) {
            int read = await stream.ReadAsync(buffer);
            if (read == 0) break;
            request.Append(Encoding.ASCII.GetString(buffer, 0, read));
        }

        await stream.WriteAsync(Encoding.ASCII.GetBytes(response));
    }

    private static IPAddress FindLanAddress() =>
        NetworkInterface.GetAllNetworkInterfaces()
            .Where(nic => nic.OperationalStatus == OperationalStatus.Up)
            .SelectMany(nic => nic.GetIPProperties().UnicastAddresses)
            .Select(unicast => unicast.Address)
            .FirstOrDefault(address => address.AddressFamily == AddressFamily.InterNetwork && !IPAddress.IsLoopback(address));
}

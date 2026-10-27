global using NUnit.Framework;
using System.Net;
using Protest.Http;

namespace Protest.Tests;

public class ListenerTests {
    private Listener? listener;
    private readonly DirectoryInfo? front;

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
        listener = new Listener("127.0.0.1", 8080, front?.FullName);
        listener?.StartAsync();
    }

    [OneTimeTearDown]
    public void TearDown() {
        listener?.Stop();
    }

    [Test]
    public void Listener_RootPage_ReturnOK() {
        using HttpRequestMessage requestMessage = new HttpRequestMessage(HttpMethod.Get, "http://127.0.0.1:8080/");

        using HttpClient httpClient = new HttpClient();
        HttpResponseMessage result = httpClient.Send(requestMessage);

        Assert.That(result.StatusCode == HttpStatusCode.OK || result.StatusCode == HttpStatusCode.Unauthorized, Is.True);
    }

    [Test]
    public void Listener_NonExistingPageUnauthenticated_ReturnUnauthorized() {
        using HttpRequestMessage requestMessage = new HttpRequestMessage(HttpMethod.Get, "http://127.0.0.1:8080/i-dont-exists");

        using HttpClient httpClient = new HttpClient();
        HttpResponseMessage result = httpClient.Send(requestMessage);

        Assert.That(result.StatusCode, Is.EqualTo(HttpStatusCode.Unauthorized));
    }

    [Test]
    public void CsrfCheck_NoHostInReferrer_ReturnOk() {
        using HttpRequestMessage requestMessage = new HttpRequestMessage(HttpMethod.Get, "http://127.0.0.1:8080/");

        using HttpClient httpClient = new HttpClient();
        HttpResponseMessage result = httpClient.Send(requestMessage);

        Assert.That(result.StatusCode, Is.EqualTo(HttpStatusCode.OK));
    }

    [Test]
    public void CsrfCheck_SameHostInReferrer_ReturnOk() {
        using HttpRequestMessage requestMessage = new HttpRequestMessage(HttpMethod.Get, "http://127.0.0.1:8080/");
        requestMessage.Headers.Add("Referer", "http://127.0.0.1:8080/");

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

    [TestCase("not-an-address, 198.51.100.20")]
    [TestCase("6.6.6.6, 198.51.100.20, 127.0.0.1")]
    public void ForwardedFor_ClientEntry_IsAccepted(string header) {
        WithTrustedLoopbackProxy(() => {
            Assert.That(SendWithForwardedFor(HttpMethod.Get, "/", header), Is.EqualTo(HttpStatusCode.OK));
        });
    }

    [TestCase("198.51.100.30, not-an-address")]
    [TestCase("198.51.100.30,")]
    [TestCase("::1", Description = "loopback client")]
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

    private static void WithTrustedLoopbackProxy(Action test) {
        bool added = Configuration.trustedProxies.Add(IPAddress.Loopback);
        try {
            test();
        }
        finally {
            if (added) Configuration.trustedProxies.Remove(IPAddress.Loopback);
        }
    }

    private static HttpStatusCode SendWithForwardedFor(HttpMethod method, string path, string forwardedFor) {
        using HttpRequestMessage requestMessage = new HttpRequestMessage(method, $"http://127.0.0.1:8080{path}");
        requestMessage.Headers.TryAddWithoutValidation("X-Forwarded-For", forwardedFor);
        if (method == HttpMethod.Post) requestMessage.Content = new StringContent("x\u007Fnobody\u007Fwrong");

        using HttpClient httpClient = new HttpClient();
        using HttpResponseMessage result = httpClient.Send(requestMessage);
        return result.StatusCode;
    }
}
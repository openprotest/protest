global using NUnit.Framework;
using Newtonsoft.Json.Linq;
using NUnit.Framework.Internal;
using Protest.Http;
using Protest.Protocols;
using System.CodeDom.Compiler;
using System.Net;
using System.Reflection.PortableExecutable;
using static Org.BouncyCastle.Crypto.Engines.SM2Engine;
using static Protest.Tasks.Issues;
using static System.Net.WebRequestMethods;
using static Vanara.PInvoke.Kernel32;
using static Vanara.PInvoke.Kernel32.FILE_REMOTE_PROTOCOL_INFO;

namespace Protest.Tests;

public class ListenerTests {
    private readonly DirectoryInfo front;

    public ListenerTests() {
        front = OperatingSystem.IsWindows()
            ? new DirectoryInfo(@"..\..\..\..\..\Protest\Front")
            : new DirectoryInfo(@"../../../../../Protest/Front");

        if (!front.Exists) {
            Assert.Fail($"\"front\" directory not found: {front.FullName}");
        }
    }

    private Listener? listener;

    [SetUp]
    public async Task Setup() {
        listener = new Listener("127.0.0.1", 8080, front.FullName);
        _ = Task.Run(() => listener.StartAsync());

        await Task.Delay(1000);

        for (int i = 0; i < 10; i++) {
            try {
                using var client = new HttpClient();
                using var response = await client.GetAsync("http://127.0.0.1:8080/");
                return; // Server is ready
            }
            catch {
                if (i < 9) await Task.Delay(500);
            }
        }

        Assert.Fail("Listener failed to start within timeout period");
    }

    [TearDown]
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
    public void Listener_NonExistingPage_ReturnNotFound() {
        using HttpRequestMessage requestMessage = new HttpRequestMessage(HttpMethod.Get, "http://127.0.0.1:8080/i-dont-exists");

        using HttpClient httpClient = new HttpClient();
        HttpResponseMessage result = httpClient.Send(requestMessage);

        Assert.That(result.StatusCode, Is.EqualTo(HttpStatusCode.NotFound));
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
}
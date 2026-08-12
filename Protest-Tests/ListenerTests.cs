global using NUnit.Framework;
using System.Net;
using Protest.Http;

namespace Protest.Tests;

public class ListenerTests {
    private Listener? listener;
    private readonly DirectoryInfo front;

    public ListenerTests() {
        front = OperatingSystem.IsWindows()
            ? new DirectoryInfo(@"..\..\..\..\..\Protest\Front")
            : new DirectoryInfo(@"../../../../../Protest/Front");

        if (!front.Exists) {
            Assert.Fail($"\"front\" directory not found: {front.FullName}");
        }
    }

    [OneTimeSetUp]
    public void Setup() {
        listener = new Listener("127.0.0.1", 8080, front.FullName);
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
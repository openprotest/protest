global using NUnit.Framework;
using System.Net;

namespace Protest.Tests;

public class ListenerTests {
    private readonly DirectoryInfo front;

    public ListenerTests() {
        if (OperatingSystem.IsWindows())
            front = new DirectoryInfo(@"..\..\..\..\..\Protest\front");
        else
            front = new DirectoryInfo(@"../../../../../Protest/front");

        if (!front.Exists) Assert.Fail($"\"front\" directory not found: {front.FullName}");
    }

    [SetUp]
    public void Setup() {
        Task.Run(() => {
            Http.Listener listener = new Http.Listener("127.0.0.1", 8080, front.FullName);
            listener.Start();
        });

        //Thread.Sleep(100);
    }

    [Test]
    public void Listener_RootPage_ReturnOK() {
        using HttpRequestMessage requestMessage = new HttpRequestMessage(HttpMethod.Get, "http://127.0.0.1:8080/");

        using HttpClient httpClient = new HttpClient();
        HttpResponseMessage result = httpClient.Send(requestMessage);

        Assert.That(result.StatusCode == HttpStatusCode.OK || result.StatusCode == HttpStatusCode.Unauthorized, Is.True);
    }

    [Test]
    public void Listener_NoneExistingPage_ReturnNotFound() {
        using HttpRequestMessage requestMessage = new HttpRequestMessage(HttpMethod.Get, "http://127.0.0.1:8080/IDontExists");

        using HttpClient httpClient = new HttpClient();
        HttpResponseMessage result = httpClient.Send(requestMessage);

        Assert.That(result.StatusCode, Is.EqualTo(HttpStatusCode.NotFound));
    }

    [Test]
    public void CsrfCheck_NoHostInReferer_ReturnOk() {
        using HttpRequestMessage requestMessage = new HttpRequestMessage(HttpMethod.Get, "http://127.0.0.1:8080/");

        using HttpClient httpClient = new HttpClient();
        HttpResponseMessage result = httpClient.Send(requestMessage);

        Assert.That(result.StatusCode, Is.EqualTo(HttpStatusCode.OK));
    }

    [Test]
    public void CsrfCheck_SameHostInReferer_ReturnOk() {
        using HttpRequestMessage requestMessage = new HttpRequestMessage(HttpMethod.Get, "http://127.0.0.1:8080/");
        requestMessage.Headers.Add("Referer", "http://127.0.0.1:8080/");

        using HttpClient httpClient = new HttpClient();
        HttpResponseMessage result = httpClient.Send(requestMessage);

        Assert.That(result.StatusCode, Is.EqualTo(HttpStatusCode.OK));
    }

    [Test]
    public void CsrfCheck_DifferentHostInReferer_ReturnImaTeapot() {
        using HttpRequestMessage requestMessage = new HttpRequestMessage(HttpMethod.Get, "http://127.0.0.1:8080/");
        requestMessage.Headers.Add("Referer", "http://127.0.0.2:8080");

        using HttpClient httpClient = new HttpClient();
        HttpResponseMessage result = httpClient.Send(requestMessage);

        Assert.That((int)result.StatusCode, Is.EqualTo(418)); //I'm a teapot
    }

}
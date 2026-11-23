using System.Net;
using System.Text;
using System.Text.Json;

namespace Protest.Tests;

using Ares = global::Protest.Ares.Core;

public class AresCompatibleProviderTests {
    private static string BaseUrl(string provider) => provider == "xai" ? "https://api.x.ai/v1" : "https://generativelanguage.googleapis.com/v1beta/openai";

    [TestCase("xai")]
    [TestCase("google")]
    public async Task ModelDiscoveryUsesProviderEndpointAndBearerKey(string provider) {
        using HttpClient client = new(new Handler(request => {
            Assert.Multiple(() => {
                Assert.That(request.RequestUri!.AbsoluteUri, Is.EqualTo(BaseUrl(provider) + "/models"));
                Assert.That(request.Method, Is.EqualTo(HttpMethod.Get));
                Assert.That(request.Headers.Authorization!.ToString(), Is.EqualTo("Bearer test-key"));
                Assert.That(request.Headers.Contains("anthropic-version"), Is.False);
            });
            return """{"data":[{"id":"z-model"},{"id":"selected-model","display_name":"A model"},{"id":"z-model"}]}""";
        }));
        Ares.Model[] models = await Ares.FetchModelsAsync(provider, "test-key", client);
        Assert.That(models.Select(model => model.Id), Is.EqualTo(new[] { "selected-model", "z-model" }));
    }

    [TestCase("xai", null)]
    [TestCase("xai", "high")]
    [TestCase("google", null)]
    [TestCase("google", "low")]
    public async Task ChatPreservesHistoryAndUsesCompatibleParameters(string provider, string? effort) {
        using HttpClient client = new(new Handler(request => {
            Assert.Multiple(() => {
                Assert.That(request.RequestUri!.AbsoluteUri, Is.EqualTo(BaseUrl(provider) + "/chat/completions"));
                Assert.That(request.Headers.Authorization!.ToString(), Is.EqualTo("Bearer test-key"));
            });
            using JsonDocument doc = JsonDocument.Parse(request.Content!.ReadAsStringAsync().GetAwaiter().GetResult());
            JsonElement body = doc.RootElement;
            Assert.Multiple(() => {
                Assert.That(body.GetProperty("model").GetString(), Is.EqualTo("selected-model"));
                Assert.That(body.GetProperty("messages").GetArrayLength(), Is.EqualTo(4));
                Assert.That(body.GetProperty("messages")[2].GetProperty("role").GetString(), Is.EqualTo("assistant"));
                Assert.That(body.GetProperty("max_tokens").GetInt32(), Is.EqualTo(4096));
                Assert.That(body.GetProperty("stream").GetBoolean(), Is.False);
                Assert.That(body.TryGetProperty("store", out _), Is.False);
                Assert.That(body.TryGetProperty("max_completion_tokens", out _), Is.False);
                Assert.That(body.TryGetProperty("think", out _), Is.False);
                Assert.That(body.TryGetProperty("reasoning_effort", out _), Is.EqualTo(effort is not null));
            });
            if (effort is not null)
                Assert.That(body.GetProperty("reasoning_effort").GetString(), Is.EqualTo(effort));
            return """{"choices":[{"message":{"content":"Answer","reasoning_content":"private"}}]}""";
        }));
        Assert.That(await Ares.FetchReplyAsync(provider, "test-key", "selected-model", [new("user", "First"), new("assistant", "Previous"), new("user", "Next")], client, reasoning: effort!), Is.EqualTo("Answer"));
    }

    [TestCase("xai")]
    [TestCase("google")]
    public async Task StreamsExcludePrivateReasoningAndApplyEffort(string provider) {
        using HttpClient client = new(new Handler(request => {
            using JsonDocument doc = JsonDocument.Parse(request.Content!.ReadAsStringAsync().GetAwaiter().GetResult());
            Assert.Multiple(() => {
                Assert.That(doc.RootElement.GetProperty("stream").GetBoolean(), Is.True);
                Assert.That(doc.RootElement.GetProperty("reasoning_effort").GetString(), Is.EqualTo("high"));
            });
            return "data: {\"choices\":[{\"delta\":{\"reasoning_content\":\"private\"}}]}\n\n" +
                "data: {\"choices\":[{\"delta\":{\"content\":\"Hello 🌍\"}}]}\n\ndata: [DONE]\n\n";
        }));
        List<string> deltas = [];
        string result = await Ares.FetchReplyAsync(provider, "test-key", "selected-model", [new("user", "Hello")], client,
            onText: text => {
                deltas.Add(text);
                return Task.CompletedTask;
            }, reasoning: "high");
        Assert.Multiple(() => {
            Assert.That(result, Is.EqualTo("Hello 🌍"));
            Assert.That(deltas, Is.EqualTo(new[] { "Hello 🌍" }));
        });
    }

    [TestCase("xai", "xAI")]
    [TestCase("google", "Google")]
    public void ProviderFailuresAreNamedAndDoNotExposeResponseSecrets(string provider, string label) {
        using HttpClient client = new(new Handler(_ => """{"error":{"message":"test-key must not leak"}}""", HttpStatusCode.Unauthorized));
        HttpRequestException? error = Assert.ThrowsAsync<HttpRequestException>(() => Ares.FetchReplyAsync(provider, "test-key", "selected-model", [new("user", "Hello")], client));
        Assert.That(error!.Message, Does.Contain(label).And.Not.Contain("test-key"));
    }

    private sealed class Handler(Func<HttpRequestMessage, string> respond, HttpStatusCode status = HttpStatusCode.OK) : HttpMessageHandler {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            Task.FromResult(new HttpResponseMessage(status) { Content = new StringContent(respond(request), Encoding.UTF8, "application/json") });
    }
}

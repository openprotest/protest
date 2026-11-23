using System.Net;
using System.Text.Json;
using Protest.Http;

namespace Protest.Tests;

using Ares = global::Protest.Ares.Core;

public class AresTests {
    [Test]
    public void ProvidersHaveTheirOwnSettingsCatalog() {
        using JsonDocument agents = JsonDocument.Parse(Ares.GetTypes());
        using JsonDocument integrations = JsonDocument.Parse(Integration.Integration.GetTypes());
        Assert.Multiple(() => {
            Assert.That(agents.RootElement.EnumerateArray().Select(entry => entry.GetProperty("type").GetString()), Is.EquivalentTo(new[] { "openai", "anthropic", "xai", "google", "ollama" }));
            Assert.That(integrations.RootElement.EnumerateArray().Select(entry => entry.GetProperty("type").GetString()), Does.Not.Contain("openai").And.Not.Contain("anthropic").And.Not.Contain("ollama"));
            Assert.That(Data.DIR_ARES_AGENTS, Is.Not.EqualTo(Data.DIR_INTEGRATION));
        });
    }

    [Test]
    public void AresSettingsUseTheInfrastructurePermission() {
        HashSet<string> user = Auth.PopulateAccessPath([]);
        HashSet<string> administrator = Auth.PopulateAccessPath(["infrastructure:write"]);
        HashSet<string> integrations = Auth.PopulateAccessPath(["integration:write"]);
        Assert.Multiple(() => {
            Assert.That(user, Does.Not.Contain("/config/ares/save"));
            Assert.That(administrator, Does.Contain("/config/ares/save").And.Contain("/config/ares/delete").And.Contain("/config/ares/test"));
            Assert.That(integrations, Does.Not.Contain("/config/ares/save"));
        });
    }

    [Test]
    public void AresUsersCanDiscoverAgentsWithoutManagingTheirCredentials() {
        HashSet<string> paths = Auth.PopulateAccessPath(["ares:write"]);
        Assert.Multiple(() => {
            Assert.That(paths, Does.Contain("/ares/agents").And.Contain("/ares/models").And.Contain("/ares/chat"));
            Assert.That(paths, Does.Not.Contain("/config/ares/get").And.Not.Contain("/config/ares/save"));
            Assert.That(Auth.PopulateAccessPath([]), Does.Not.Contain("/ares/chat"));
            Assert.That(Router.routes["/ares/chat"].RequiredMethod, Is.EqualTo("POST"));
        });
    }

    [Test]
    public async Task OpenAiModelsUseBearerAuthenticationAndPreserveModelIds() {
        using HttpClient client = new HttpClient(new ModelHandler(request => {
            Assert.Multiple(() => {
                Assert.That(request.RequestUri?.AbsoluteUri, Is.EqualTo("https://api.openai.com/v1/models"));
                Assert.That(request.Headers.Authorization?.ToString(), Is.EqualTo("Bearer test-openai-key"));
                Assert.That(request.Headers.Contains("anthropic-version"), Is.False);
            });
            return """{"data":[{"id":"model-z"},{"id":"ft:custom:model"},{"id":"model-z"}]}""";
        }));

        Ares.Model[] models = await Ares.FetchModelsAsync("openai", "test-openai-key", client);
        Assert.That(models.Select(model => model.Id), Is.EqualTo(new[] { "ft:custom:model", "model-z" }));
    }

    [Test]
    public async Task AnthropicModelsFollowAllPagesAndUseDisplayNames() {
        int requests = 0;
        using HttpClient client = new HttpClient(new ModelHandler(request => {
            requests++;
            Assert.Multiple(() => {
                Assert.That(request.Headers.Authorization?.ToString(), Is.EqualTo("Bearer test-anthropic-key"));
                Assert.That(request.Headers.GetValues("anthropic-version"), Is.EqualTo(new[] { "2026-10-21" }));
            });

            if (requests == 1) {
                return """{"data":[{"id":"claude-b","display_name":"Claude B"}],"has_more":true,"last_id":"cursor/a&b"}""";
            }

            Assert.That(request.RequestUri?.Query, Does.Contain("after_id=cursor%2Fa%26b"));
            return """{"data":[{"id":"claude-a","display_name":"Claude A"}],"has_more":false}""";
        }));

        Ares.Model[] models = await Ares.FetchModelsAsync("anthropic", "test-anthropic-key", client);

        Assert.Multiple(() => {
            Assert.That(requests, Is.EqualTo(2));
            Assert.That(models.Select(model => model.Name), Is.EqualTo(new[] { "Claude A", "Claude B" }));
        });
    }

    [Test]
    public void RepeatedPaginationCursorFailsInsteadOfLooping() {
        using HttpClient client = new HttpClient(new ModelHandler(_ => """{"data":[],"has_more":true,"last_id":"same-cursor"}"""));
        Assert.ThrowsAsync<JsonException>(() => Ares.FetchModelsAsync("anthropic", "test-key", client));
    }

    [Test]
    public void ProviderHttpErrorsAreNotTreatedAsAnEmptyModelList() {
        using HttpClient client = new HttpClient(new ModelHandler(_ => "{}", HttpStatusCode.Unauthorized));
        HttpRequestException? error = Assert.ThrowsAsync<HttpRequestException>(() => Ares.FetchModelsAsync("openai", "test-key", client));
        Assert.That(error?.StatusCode, Is.EqualTo(HttpStatusCode.Unauthorized));
    }

    [Test]
    public async Task OpenAiRepliesSendTheSelectedModelAndConversationWithoutStorage() {
        Ares.Message[] messages = [new("user", "Hello"), new("assistant", "Hi"), new("user", "Follow up")];
        using HttpClient client = new HttpClient(new ModelHandler(request => {
            using JsonDocument body = JsonDocument.Parse(request.Content!.ReadAsStringAsync().GetAwaiter().GetResult());
            JsonElement root = body.RootElement;
            Assert.Multiple(() => {
                Assert.That(request.Method, Is.EqualTo(HttpMethod.Post));
                Assert.That(request.RequestUri?.AbsoluteUri, Is.EqualTo("https://api.openai.com/v1/chat/completions"));
                Assert.That(request.Headers.Authorization?.ToString(), Is.EqualTo("Bearer test-openai-key"));
                Assert.That(request.Content.Headers.ContentType?.MediaType, Is.EqualTo("application/json"));
                Assert.That(root.GetProperty("model").GetString(), Is.EqualTo("ft:chosen:model"));
                Assert.That(root.GetProperty("store").GetBoolean(), Is.False);
                Assert.That(root.GetProperty("messages").EnumerateArray().Select(entry => entry.GetProperty("role").GetString()), Is.EqualTo(new[] { "developer", "user", "assistant", "user" }));
                Assert.That(root.GetProperty("messages")[3].GetProperty("content").GetString(), Is.EqualTo("Follow up"));
            });
            return """{"choices":[{"message":{"role":"assistant","content":"Plain <b>text</b>"}}]}""";
        }));

        string reply = await Ares.FetchReplyAsync("openai", "test-openai-key", "ft:chosen:model", messages, client);
        Assert.That(reply, Is.EqualTo("Plain <b>text</b>"));
    }

    [Test]
    public async Task AnthropicRepliesCombineTextBlocksUsingTheSelectedModel() {
        using HttpClient client = new HttpClient(new ModelHandler(request => {
            using JsonDocument body = JsonDocument.Parse(request.Content!.ReadAsStringAsync().GetAwaiter().GetResult());
            Assert.Multiple(() => {
                Assert.That(request.RequestUri?.AbsoluteUri, Is.EqualTo("https://api.anthropic.com/v1/messages"));
                Assert.That(request.Headers.Authorization?.ToString(), Is.EqualTo("Bearer test-anthropic-key"));
                Assert.That(request.Headers.GetValues("anthropic-version"), Is.EqualTo(new[] { "2026-10-21" }));
                Assert.That(body.RootElement.GetProperty("model").GetString(), Is.EqualTo("claude-selected"));
                Assert.That(body.RootElement.GetProperty("max_tokens").GetInt32(), Is.GreaterThan(0));
                Assert.That(body.RootElement.GetProperty("system").GetString(), Is.EqualTo(Ares.PERSONA));
                Assert.That(body.RootElement.GetProperty("messages")[0].GetProperty("content").GetString(), Is.EqualTo("Hello"));
            });
            return """{"content":[{"type":"thinking","thinking":"internal"},{"type":"text","text":"Hello"},{"type":"text","text":"World"}]}""";
        }));

        string reply = await Ares.FetchReplyAsync("anthropic", "test-anthropic-key", "claude-selected", [new("user", "Hello")], client);
        Assert.That(reply, Is.EqualTo("Hello\nWorld"));
    }

    [TestCase("openai", "{\"choices\":[]}")]
    [TestCase("openai", "{\"choices\":[{\"message\":{\"content\":null}}]}")]
    [TestCase("anthropic", "{\"content\":[{\"type\":\"thinking\",\"thinking\":\"internal\"}]}")]
    public void EmptyRepliesAreRejected(string provider, string response) {
        using HttpClient client = new HttpClient(new ModelHandler(_ => response));
        Assert.ThrowsAsync<JsonException>(() => Ares.FetchReplyAsync(provider, "test-key", "selected-model", [new("user", "Hello")], client));
    }

    [Test]
    public void RejectedMessagesAreNotRetriedWithAnotherModel() {
        int requests = 0;
        using HttpClient client = new HttpClient(new ModelHandler(_ => {
            requests++;
            return "{}";
        }, HttpStatusCode.TooManyRequests));
        HttpRequestException? error = Assert.ThrowsAsync<HttpRequestException>(() => Ares.FetchReplyAsync("openai", "test-key", "selected-model", [new("user", "Hello")], client));
        Assert.Multiple(() => {
            Assert.That(requests, Is.EqualTo(1));
            Assert.That(error?.StatusCode, Is.EqualTo(HttpStatusCode.TooManyRequests));
        });
    }

    [TestCase("insufficient_quota", "insufficient_quota", "API quota is unavailable or exhausted")]
    [TestCase(null, "insufficient_quota", "API quota is unavailable or exhausted")]
    [TestCase("credit_balance_exhausted", "insufficient_quota", "API credits are exhausted")]
    [TestCase("organization_spend_limit_exceeded", "insufficient_quota", "organization spending limit reached")]
    [TestCase("organization_usage_limit_exceeded", "insufficient_quota", "organization usage limit reached")]
    [TestCase("rate_limit_exceeded", "requests", "API rate limit reached")]
    [TestCase("slow_down", "rate_limit_error", "API rate limit reached")]
    public void RateAndQuotaErrorsHaveDistinctMessages(string? code, string type, string expected) {
        string body = JsonSerializer.Serialize(new {
            error = new {
                code,
                type,
                message = "Provider details including sk-secret must not be exposed"
            }
        });
        using HttpClient client = new HttpClient(new ModelHandler(_ => body, HttpStatusCode.TooManyRequests));
        HttpRequestException? error = Assert.ThrowsAsync<HttpRequestException>(() => Ares.FetchReplyAsync("openai", "test-key", "selected-model", [new("user", "Hello")], client));
        Assert.Multiple(() => {
            Assert.That(error?.StatusCode, Is.EqualTo(HttpStatusCode.TooManyRequests));
            Assert.That(error?.Message, Does.Contain(expected).And.Not.Contain("sk-secret"));
        });
    }

    [Test]
    public void NonJsonRateLimitErrorsKeepTheirHttpStatus() {
        using HttpClient client = new HttpClient(new ModelHandler(_ => "<html>Unavailable</html>", HttpStatusCode.TooManyRequests));
        HttpRequestException? error = Assert.ThrowsAsync<HttpRequestException>(() => Ares.FetchReplyAsync("openai", "test-key", "selected-model", [new("user", "Hello")], client));
        Assert.Multiple(() => {
            Assert.That(error?.StatusCode, Is.EqualTo(HttpStatusCode.TooManyRequests));
            Assert.That(error?.Message, Does.Contain("HTTP 429").And.Contain("did not identify a specific cause").And.Not.Contain("<html>"));
        });
    }

    [Test]
    public void UnsupportedReasoningErrorIncludesAcceptedValues() {
        const string detail = "Unsupported value: 'reasoning_effort' does not support 'max' with this model. Supported values are: 'low', 'medium', 'high', and 'xhigh'.";
        string body = JsonSerializer.Serialize(new { error = new { message = detail, type = "invalid_request_error", param = "reasoning_effort", code = "unsupported_value" } });
        using HttpClient client = new(new ModelHandler(_ => body, HttpStatusCode.BadRequest));
        HttpRequestException? error = Assert.ThrowsAsync<HttpRequestException>(() => Ares.FetchReplyAsync("openai", "test-key", "gpt-6.2-sol", [new("user", "Hello")], client, reasoning:"max"));
        Assert.Multiple(() => {
            Assert.That(error?.StatusCode, Is.EqualTo(HttpStatusCode.BadRequest));
            Assert.That(error?.Message, Is.EqualTo($"OpenAI rejected the message (HTTP 400).\n{detail}"));
            Assert.That(error?.Message, Does.Not.Contain("Check the selected model, API key, quota"));
        });
    }

    [TestCase("openai", "{\"error\":{\"message\":\"Context window exceeded. Shorten the conversation.\"}}", "Context window exceeded")]
    [TestCase("anthropic", "{\"error\":{\"type\":\"invalid_request_error\",\"message\":\"Choose a supported effort value.\"}}", "Choose a supported effort value")]
    [TestCase("google", "{\"error\":{\"code\":400,\"message\":\"Unsupported model parameter.\",\"status\":\"INVALID_ARGUMENT\"}}", "Unsupported model parameter")]
    [TestCase("xai", "{\"error\":{\"message\":\"This model does not support tools.\"}}", "This model does not support tools")]
    [TestCase("ollama", "{\"error\":\"Model not found. Pull it first.\"}", "Pull it first")]
    public void ProviderErrorsPreserveActionableDetails(string provider, string body, string detail) {
        using HttpClient client = new(new ModelHandler(_ => body, HttpStatusCode.BadRequest));
        HttpRequestException? error = Assert.ThrowsAsync<HttpRequestException>(() => Ares.FetchReplyAsync(provider, "test-key", "selected-model", [new("user", "Hello")], client));
        Assert.That(error?.Message, Does.Contain("HTTP 400").And.Contain(detail));
    }

    [Test]
    public void ErrorDetailsRedactCredentialsAndLimitDisplayedLength() {
        string body = JsonSerializer.Serialize(new { error = new { message = "Wrong parameter. actual-private-key actual-private-\u001bkey sk-secret xai-secret AIzaPrivateKey Bearer private-token " + new string('a', 5000) } });
        using HttpClient client = new(new ModelHandler(_ => body, HttpStatusCode.BadRequest));
        HttpRequestException? error = Assert.ThrowsAsync<HttpRequestException>(() => Ares.FetchReplyAsync("openai", "actual-private-key", "selected", [new("user", "Hello")], client));
        Assert.That(error?.Message, Does.Contain("Wrong parameter").And.Contain("[redacted]"));
        foreach (string credential in new[] { "actual-private-key", "sk-secret", "xai-secret", "AIzaPrivateKey", "private-token" }) {
            Assert.That(error!.Message.Contains(credential, StringComparison.Ordinal), Is.False, "Credentials must be redacted");
        }
        Assert.That(error!.Message.Contains('\u001b'), Is.False);
        Assert.That(error!.Message.Length, Is.LessThan(4200));
    }

    [TestCase("[]")]
    [TestCase("[{\"role\":\"system\",\"content\":\"Unexpected\"}]")]
    [TestCase("[{\"role\":\"user\",\"content\":\" \"}]")]
    [TestCase("[{\"role\":\"user\",\"content\":123}]")]
    [TestCase("[{\"role\":\"user\",\"content\":\"Hello\"},{\"role\":\"assistant\",\"content\":\"Hi\"}]")]
    [TestCase("[{\"role\":\"user\",\"content\":\"Hello\"},{\"role\":\"user\",\"content\":\"Again\"},{\"role\":\"user\",\"content\":\"Again\"}]")]
    public void InvalidConversationsAreRejected(string messages) {
        using JsonDocument doc = JsonDocument.Parse($"{{\"messages\":{messages}}}");
        Assert.That(Ares.ReadMessages(doc.RootElement), Is.Null);
    }

    [Test]
    public void ConversationValidationAcceptsFollowUpsAndRejectsOversizedUserMessages() {
        using JsonDocument valid = JsonDocument.Parse("""{"messages":[{"role":"user","content":"Hello"},{"role":"assistant","content":"Hi"},{"role":"user","content":"Follow up"}]}""");
        Assert.That(Ares.ReadMessages(valid.RootElement)?.Length, Is.EqualTo(3));
        using JsonDocument oversized = JsonDocument.Parse(JsonSerializer.Serialize(new {
            messages = new[] { new { role = "user", content = new string('a', 8193) } }
        }));
        Assert.That(Ares.ReadMessages(oversized.RootElement), Is.Null);
    }

    [Test]
    public async Task OllamaListsInstalledModelsWithoutAnApiKey() {
        using HttpClient client = new HttpClient(new ModelHandler(request => {
            Assert.That(request.RequestUri?.AbsoluteUri, Is.EqualTo("http://localhost:11434/api/tags"));
            Assert.That(request.Headers.Authorization, Is.Null);
            return """{"models":[{"model":"llama-test:latest","name":"llama-test:latest"},{"name":"another:7b"}]}""";
        }));
        Ares.Model[] models = await Ares.FetchModelsAsync("ollama", "", client);
        Assert.That(models.Select(model => model.Id), Is.EqualTo(new[] { "another:7b", "llama-test:latest" }));
    }

    [TestCase("")]
    [TestCase("optional-key")]
    public async Task OllamaChatsAtTheConfiguredServerWithStreamingDisabled(string key) {
        using HttpClient client = new HttpClient(new ModelHandler(request => {
            using JsonDocument body = JsonDocument.Parse(request.Content!.ReadAsStringAsync().GetAwaiter().GetResult());
            Assert.Multiple(() => {
                Assert.That(request.RequestUri?.AbsoluteUri, Is.EqualTo("https://ollama.example/proxy/api/chat"));
                Assert.That(request.Headers.Authorization?.Parameter, Is.EqualTo(key.Length == 0 ? null : key));
                Assert.That(body.RootElement.GetProperty("stream").GetBoolean(), Is.False);
                Assert.That(body.RootElement.GetProperty("model").GetString(), Is.EqualTo("chosen:7b"));
                Assert.That(body.RootElement.GetProperty("messages")[0].GetProperty("content").GetString(), Is.EqualTo(Ares.PERSONA));
                Assert.That(body.RootElement.GetProperty("messages")[1].GetProperty("content").GetString(), Is.EqualTo("Hello"));
            });
            return """{"message":{"role":"assistant","content":"Local reply"},"done":true}""";
        }));

        Assert.That(await Ares.FetchReplyAsync("ollama", key, "chosen:7b", [new("user", "Hello")], client, endpoint: "https://ollama.example/proxy/"), Is.EqualTo("Local reply"));
    }

    [TestCase("file:///tmp/ollama")]
    [TestCase("ftp://localhost")]
    [TestCase("http://user:secret@localhost:11434")]
    [TestCase("http://localhost:11434?key=secret")]
    [TestCase("http://localhost:11434#fragment")]
    [TestCase("not-a-url")]
    public void InvalidOllamaEndpointsAreRejected(string endpoint) {
        Assert.That(Ares.NormalizeEndpoint(endpoint), Is.Null);
    }

    private sealed class ModelHandler(Func<HttpRequestMessage, string> respond, HttpStatusCode status = HttpStatusCode.OK) : HttpMessageHandler {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            Task.FromResult(new HttpResponseMessage(status) { Content = new StringContent(respond(request)) });
    }
}

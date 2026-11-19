using System.Net;
using System.Text.Json;
using Protest.Http;
using Protest.Tools;

namespace Protest.Tests;

public class AresTests {
    [Test]
    public void ProvidersHaveTheirOwnSettingsCatalog() {
        using JsonDocument agents = JsonDocument.Parse(Ares.GetTypes());
        using JsonDocument integrations = JsonDocument.Parse(Integration.Integration.GetTypes());
        Assert.Multiple(() => {
            Assert.That(agents.RootElement.EnumerateArray().Select(entry => entry.GetProperty("type").GetString()), Is.EquivalentTo(new[] { "openai", "anthropic" }));
            Assert.That(integrations.RootElement.EnumerateArray().Select(entry => entry.GetProperty("type").GetString()), Does.Not.Contain("openai").And.Not.Contain("anthropic"));
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
            Assert.That(paths, Does.Contain("/ares/agents").And.Contain("/ares/models"));
            Assert.That(paths, Does.Not.Contain("/config/ares/get").And.Not.Contain("/config/ares/save"));
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

    private sealed class ModelHandler(Func<HttpRequestMessage, string> respond, HttpStatusCode status = HttpStatusCode.OK) : HttpMessageHandler {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            Task.FromResult(new HttpResponseMessage(status) { Content = new StringContent(respond(request)) });
    }
}

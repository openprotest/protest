using System.Net;
using System.Text.Json;
using Protest.Tools;

namespace Protest.Tests;

public class AresReasoningTests {
    [TestCase("gpt-4.1", "")]
    [TestCase("unknown", "")]
    [TestCase("gpt-5.1-chat-latest", "")]
    [TestCase("gpt-5.1-codex", "")]
    [TestCase("gpt-5", "minimal,low,medium,high")]
    [TestCase("gpt-5.1", "none,low,medium,high")]
    [TestCase("gpt-5.2-2025-12-11", "none,low,medium,high,xhigh")]
    [TestCase("gpt-5.5", "none,low,medium,high,xhigh")]
    [TestCase("gpt-6.2-astra", "low,medium,high,xhigh,max")]
    [TestCase("o3-mini-2025-01-31", "low,medium,high")]
    public void OpenAiControlsAreModelSpecific(string model, string expected) =>
        Assert.That(Ares.OpenAiReasoningOptions(model), Is.EqualTo(expected.Length == 0 ? [] : expected.Split(',')));

    [TestCase("anthropic", "{}", "")]
    [TestCase("anthropic", "{\"capabilities\":{\"effort\":{\"supported\":false,\"high\":{\"supported\":true}}}}", "")]
    [TestCase("anthropic", "{\"capabilities\":{\"effort\":{\"supported\":true,\"low\":{\"supported\":true},\"high\":{\"supported\":false},\"max\":{\"supported\":true}}}}", "low,max")]
    [TestCase("ollama", "{\"capabilities\":[\"thinking\"]}", "")]
    [TestCase("ollama", "{\"thinking\":{\"values\":[false]}}", "")]
    [TestCase("ollama", "{\"thinking\":{\"values\":[true,false]}}", "true,false")]
    [TestCase("ollama", "{\"thinking\":{\"values\":[\"low\",\"medium\",\"high\",\"low\",23,null]}}", "low,medium,high")]
    public void OnlyAdvertisedCapabilitiesAreEnabled(string type, string metadata, string expected) {
        using JsonDocument doc = JsonDocument.Parse(metadata);
        Assert.That(Ares.ReadReasoningOptions(type, doc.RootElement), Is.EqualTo(expected.Length == 0 ? [] : expected.Split(',')));
    }

    [TestCase("anthropic")]
    [TestCase("ollama")]
    public async Task CapabilityDiscoveryUsesProviderEndpointAndCredentials(string type) {
        using HttpClient client = new HttpClient(new Handler(request => {
            Assert.That(request.Headers.Authorization?.ToString(), Is.EqualTo("Bearer test-key"));
            if (type == "ollama") {
                Assert.That(request.Method, Is.EqualTo(HttpMethod.Post));
                Assert.That(request.RequestUri!.AbsoluteUri, Is.EqualTo("https://local.example/proxy/api/show"));
                using JsonDocument body = JsonDocument.Parse(request.Content!.ReadAsStringAsync().GetAwaiter().GetResult());
                Assert.That(body.RootElement.GetProperty("model").GetString(), Is.EqualTo("selected:latest"));
                return "{\"thinking\":{\"values\":[true,false]}}";
            }
            Assert.That(request.Method, Is.EqualTo(HttpMethod.Get));
            Assert.That(request.RequestUri!.AbsoluteUri, Is.EqualTo("https://api.anthropic.com/v1/models/selected%3Alatest"));
            Assert.That(request.Headers.GetValues("anthropic-version"), Is.EqualTo(new[] { "2026-10-21" }));
            return "{}";
        }));
        _ = await Ares.FetchReasoningOptionsAsync(type, "test-key", "selected:latest", client, endpoint:"https://local.example/proxy");
    }

    [TestCase("openai", null)]
    [TestCase("openai", "high")]
    [TestCase("anthropic", null)]
    [TestCase("anthropic", "medium")]
    [TestCase("ollama", null)]
    [TestCase("ollama", "true")]
    [TestCase("ollama", "false")]
    [TestCase("ollama", "low")]
    public async Task SelectedReasoningUsesProviderParametersAndDefaultOmitsThem(string type, string? reasoning) {
        using HttpClient client = new HttpClient(new Handler(request => {
            using JsonDocument body = JsonDocument.Parse(request.Content!.ReadAsStringAsync().GetAwaiter().GetResult());
            JsonElement root = body.RootElement;
            Assert.That(root.GetProperty("model").GetString(), Is.EqualTo("selected"));
            Assert.That(root.GetProperty("stream").GetBoolean(), Is.False);
            string field = type switch { "openai" => "reasoning_effort", "anthropic" => "output_config", _ => "think" };
            if (reasoning is null) Assert.That(root.TryGetProperty(field, out _), Is.False);
            else {
                JsonElement value = root.GetProperty(field);
                if (type == "anthropic") Assert.That(value.GetProperty("effort").GetString(), Is.EqualTo(reasoning));
                else if (type == "ollama" && reasoning is "true" or "false") Assert.That(value.GetBoolean(), Is.EqualTo(reasoning == "true"));
                else Assert.That(value.GetString(), Is.EqualTo(reasoning));
            }
            return type switch { "openai" => "{\"choices\":[{\"message\":{\"content\":\"OK\"}}]}", "anthropic" => "{\"content\":[{\"type\":\"text\",\"text\":\"OK\"}]}", _ => "{\"message\":{\"content\":\"OK\"}}" };
        }));
        Assert.That(await Ares.FetchReplyAsync(type, "test", "selected", [new("user", "Hello")], client, reasoning:reasoning!), Is.EqualTo("OK"));
    }

    [Test]
    public async Task UnsupportedReasoningIsRejectedAfterImmediateAcknowledgementAndBeforeGeneration() {
        static int Port() { using System.Net.Sockets.TcpListener socket = new(IPAddress.Loopback, 0); socket.Start(); return ((IPEndPoint)socket.LocalEndpoint).Port; }
        int providerPort = Port(), appPort = Port();
        using HttpListener provider = new(); provider.Prefixes.Add($"http://127.0.0.1:{providerPort}/"); provider.Start();
        TaskCompletionSource release = new(TaskCreationOptions.RunContinuationsAsynchronously);
        Task metadata = Task.Run(async () => {
            HttpListenerContext context = await provider.GetContextAsync();
            Assert.That(context.Request.Url!.AbsolutePath, Is.EqualTo("/api/show"));
            await release.Task;
            byte[] body = System.Text.Encoding.UTF8.GetBytes("{\"thinking\":{\"values\":[true,false]}}");
            context.Response.ContentLength64 = body.Length;
            await context.Response.OutputStream.WriteAsync(body); context.Response.Close();
        });
        string id = Guid.NewGuid().ToString(), session = Guid.NewGuid().ToString();
        byte[] agent = JsonSerializer.SerializeToUtf8Bytes(new { id, type = "ollama", name = "Reasoning test", enabled = true, secret = "", endpoint = $"http://127.0.0.1:{providerPort}" });
        Directory.CreateDirectory(Data.DIR_ARES_AGENTS); string agentPath = Path.Combine(Data.DIR_ARES_AGENTS, $"{id}.json"); File.WriteAllBytes(agentPath, agent);
        Protest.Http.Auth.sessions[session] = new Protest.Http.Auth.Session { access = new Protest.Http.Auth.AccessControl { username = "reasoning-test", authorization = [], accessPath = ["/ares/chat"] }, sessionId = session, ip = IPAddress.Loopback, loginDate = DateTime.UtcNow.Ticks, ttl = TimeSpan.FromHours(1).Ticks };
        Protest.Http.Listener listener = new("127.0.0.1", (ushort)appPort, Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../Protest/Front")));
        _ = listener.StartAsync();
        try {
            using HttpClient client = new();
            using HttpRequestMessage request = new(HttpMethod.Post, $"http://127.0.0.1:{appPort}/ares/chat?id={id}");
            request.Headers.Add("Cookie", $"{Protest.Http.Auth.SESSION_COOKIE}={session}"); request.Headers.Add("Origin", $"http://127.0.0.1:{appPort}");
            request.Content = new StringContent(JsonSerializer.Serialize(new { model = "selected", revision = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(agent)), reasoning = "high", messages = new[] { new { role = "user", content = "Hello" } } }));
            using HttpResponseMessage response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead).WaitAsync(TimeSpan.FromSeconds(5));
            using StreamReader reader = new(await response.Content.ReadAsStreamAsync());
            using JsonDocument accepted = JsonDocument.Parse((await reader.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(5)))!);
            Assert.That(accepted.RootElement.GetProperty("type").GetString(), Is.EqualTo("accepted"));
            Assert.That(release.Task.IsCompleted, Is.False);
            release.SetResult();
            using JsonDocument error = JsonDocument.Parse((await reader.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(5)))!);
            Assert.That(error.RootElement.GetProperty("error").GetString(), Does.Contain("not supported"));
            Assert.That(await reader.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(5)), Is.Null);
            await metadata;
        }
        finally { release.TrySetResult(); listener.Stop(); provider.Stop(); Protest.Http.Auth.sessions.TryRemove(session, out _); File.Delete(agentPath); }
    }

    private sealed class Handler(Func<HttpRequestMessage, string> respond) : HttpMessageHandler {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token) =>
            Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(respond(request)) });
    }
}

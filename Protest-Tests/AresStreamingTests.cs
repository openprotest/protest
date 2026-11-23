using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Protest.Http;

namespace Protest.Tests;

using Ares = global::Protest.Ares.Core;

public class AresStreamingTests {
    [TestCase("openai")]
    [TestCase("xai")]
    [TestCase("google")]
    [TestCase("anthropic")]
    [TestCase("ollama")]
    public async Task ProviderStreamsEmitOnlyTextAndRequestStreaming(string provider) {
        string body = provider switch {
            "openai" or "xai" or "google" => ": keep-alive\r\ndata: {\"choices\":[{\"delta\":{\"role\":\"assistant\"}}]}\r\n\r\ndata: {\"choices\":\n" +
                "data: [{\"delta\":{\"content\":\"Hello 🌍\"}}]}\n\ndata: {\"choices\":[{\"delta\":{\"content\":\"!\"}}]}\n\ndata: [DONE]\n\n",
            "anthropic" => "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"content_block\":{\"type\":\"text\",\"text\":\"Hello 🌍\"}}\n\n" +
                "data: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"thinking_delta\",\"thinking\":\"private\"}}\n\n" +
                "data: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\"!\"}}\n\n" +
                "data: {\"type\":\"message_stop\"}\n\n",
            _ => "{\"message\":{\"content\":\"Hello 🌍\",\"thinking\":\"private\"},\"done\":false}\n{\"message\":{\"content\":\"!\"},\"done\":true}\n"
        };

        using HttpClient client = new HttpClient(new StreamHandler(request => {
            using JsonDocument payload = JsonDocument.Parse(request.Content!.ReadAsStringAsync().GetAwaiter().GetResult());
            Assert.That(payload.RootElement.GetProperty("stream").GetBoolean(), Is.True);
            return body;
        }));

        List<string> deltas = [];
        string result = await Ares.FetchReplyAsync(provider, "test-key", "selected-model", [new("user", "Hello")], client,
            onText: text => {
                deltas.Add(text);
                return Task.CompletedTask;
            });

        Assert.Multiple(() => {
            Assert.That(deltas, Is.EqualTo(new[] { "Hello 🌍", "!" }));
            Assert.That(result, Is.EqualTo("Hello 🌍!"));
        });
    }

    [TestCase("openai", "data: {\"choices\":[{\"delta\":{\"content\":\"Partial\"}}]}\n\n")]
    [TestCase("anthropic", "data: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\"Partial\"}}\n\n")]
    [TestCase("ollama", "{\"message\":{\"content\":\"Partial\"},\"done\":false}\n")]
    [TestCase("openai", "data: [DONE]\n\n")]
    [TestCase("xai", "data: [DONE]\n\n")]
    [TestCase("google", "data: [DONE]\n\n")]
    [TestCase("xai", "data: {\"choices\":[{\"delta\":{\"content\":\"Partial\"}}]}\n\n")]
    [TestCase("google", "data: {\"choices\":[{\"delta\":{\"content\":\"Partial\"}}]}\n\n")]
    [TestCase("anthropic", "data: {\"type\":\"message_stop\"}\n\n")]
    [TestCase("ollama", "{\"done\":true}\n")]
    public void EmptyAndInterruptedStreamsAreRejected(string provider, string body) {
        using HttpClient client = new HttpClient(new StreamHandler(_ => body));
        Assert.ThrowsAsync<JsonException>(() => Ares.FetchReplyAsync(provider, "test-key", "selected-model", [new("user", "Hello")], client,
            onText: _ => Task.CompletedTask));
    }

    [TestCase("anthropic", "data: {\"type\":\"error\",\"error\":{\"message\":\"Overloaded. Try again. sk-private test-key\"}}\n\n")]
    [TestCase("xai", "data: {\"type\":\"error\",\"message\":\"Overloaded. Try again. sk-private test-key\"}\n\n")]
    [TestCase("ollama", "{\"error\":\"Overloaded. Try again. sk-private test-key\"}\n")]
    public void StreamingErrorsKeepProviderDetailsWithoutCredentials(string provider, string body) {
        using HttpClient client = new(new StreamHandler(_ => body));
        InvalidOperationException? error = Assert.ThrowsAsync<InvalidOperationException>(() => Ares.FetchReplyAsync(provider, "test-key", "selected-model", [new("user", "Hello")], client,
            onText: _ => Task.CompletedTask));
        Assert.That(error?.Message, Does.Contain("stopped the response").And.Contain("Overloaded. Try again.").And.Not.Contain("sk-private").And.Not.Contain("test-key"));
    }

    [TestCase(null)]
    [TestCase("thinking")]
    [TestCase("streaming")]
    [NonParallelizable]
    public async Task ChatAcknowledgesImmediatelyAndCanStopAnActiveResponse(string? stopAt) {
        int providerPort = FreePort();
        int appPort = FreePort();

        using HttpListener provider = new HttpListener();
        provider.Prefixes.Add($"http://127.0.0.1:{providerPort}/");
        provider.Start();

        TaskCompletionSource headers = new(TaskCreationOptions.RunContinuationsAsynchronously);
        TaskCompletionSource finish = new(TaskCreationOptions.RunContinuationsAsynchronously);
        TaskCompletionSource upstreamStarted = new(TaskCreationOptions.RunContinuationsAsynchronously);
        Task generation = Task.Run(async () => {
            HttpListenerContext context = await provider.GetContextAsync();
            using StreamReader input = new StreamReader(context.Request.InputStream);
            using JsonDocument payload = JsonDocument.Parse(await input.ReadToEndAsync());
            Assert.That(payload.RootElement.GetProperty("stream").GetBoolean(), Is.True);
            upstreamStarted.SetResult();
            await headers.Task;
            if (stopAt == "thinking") {
                context.Response.Close();
                return;
            }
            context.Response.SendChunked = true;
            context.Response.ContentType = "application/x-ndjson";
            await context.Response.OutputStream.WriteAsync(Encoding.UTF8.GetBytes("{\"message\":{\"content\":\"Hello 🌍\"},\"done\":false}\n"));
            await context.Response.OutputStream.FlushAsync();
            await finish.Task;
            if (stopAt is null) await context.Response.OutputStream.WriteAsync(Encoding.UTF8.GetBytes("{\"message\":{\"content\":\"!\"},\"done\":true}\n"));
            context.Response.Close();
        });

        string id = Guid.NewGuid().ToString();
        byte[] agent = JsonSerializer.SerializeToUtf8Bytes(new {
            id,
            type = "ollama",
            name = $"Streaming test {id}",
            enabled = true,
            secret = "",
            endpoint = $"http://127.0.0.1:{providerPort}"
        });

        Directory.CreateDirectory(Data.DIR_ARES_AGENTS);
        string agentPath = Path.Combine(Data.DIR_ARES_AGENTS, $"{id}.json");
        File.WriteAllBytes(agentPath, agent);

        string revision = Convert.ToHexString(SHA256.HashData(agent));
        string sessionId = Guid.NewGuid().ToString();
        string owner = $"stream-test-{id}";
        string conversationId = Guid.NewGuid().ToString();
        string requestId = Guid.NewGuid().ToString();
        Auth.sessions[sessionId] = new Auth.Session {
            access = new Auth.AccessControl { username = owner, authorization = ["ares:write"], accessPath = Auth.PopulateAccessPath(["ares:write"]) },
            ip = IPAddress.Loopback,
            sessionId = sessionId,
            loginDate = DateTime.UtcNow.Ticks,
            ttl = TimeSpan.FromHours(1).Ticks
        };

        string front = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../Protest/Front"));
        Listener listener = new Listener("127.0.0.1", (ushort)appPort, front);
        _ = listener.StartAsync();
        try {
            using HttpClient client = new HttpClient();
            using HttpRequestMessage request = new HttpRequestMessage(HttpMethod.Post, $"http://127.0.0.1:{appPort}/ares/chat?id={id}");
            request.Headers.Add("Cookie", $"{Auth.SESSION_COOKIE}={sessionId}");
            request.Headers.Add("Origin", $"http://127.0.0.1:{appPort}");
            request.Content = new StringContent(JsonSerializer.Serialize(new {
                model = "selected",
                revision,
                conversationId,
                requestId,
                messages = new[] { new { role = "user", content = "Hello" } }
            }));

            using HttpResponseMessage response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead).WaitAsync(TimeSpan.FromSeconds(5));

            Assert.Multiple(() => {
                Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.OK));
                Assert.That(response.Content.Headers.ContentType?.MediaType, Is.EqualTo("application/x-ndjson"));
                Assert.That(response.Headers.CacheControl?.NoStore, Is.True);
            });

            using StreamReader reader = new StreamReader(await response.Content.ReadAsStreamAsync());
            using JsonDocument accepted = JsonDocument.Parse((await reader.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(5)))!);
            Assert.That(accepted.RootElement.GetProperty("type").GetString(), Is.EqualTo("accepted"));
            Assert.That(headers.Task.IsCompleted, Is.False, "Acceptance must not wait for upstream headers");
            await upstreamStarted.Task.WaitAsync(TimeSpan.FromSeconds(5));

            async Task<bool> Stop(string target) {
                using HttpRequestMessage stop = new(HttpMethod.Post, $"http://127.0.0.1:{appPort}/ares/history/stop?id={conversationId}&requestId={target}");
                stop.Headers.Add("Cookie", $"{Auth.SESSION_COOKIE}={sessionId}");
                stop.Headers.Add("Origin", $"http://127.0.0.1:{appPort}");
                using HttpResponseMessage result = await client.SendAsync(stop).WaitAsync(TimeSpan.FromSeconds(5));
                Assert.That(result.StatusCode, Is.EqualTo(HttpStatusCode.OK));
                using JsonDocument body = JsonDocument.Parse(await result.Content.ReadAsStringAsync());
                return body.RootElement.GetProperty("stopping").GetBoolean();
            }

            async Task VerifyStop() {
                Assert.That(Ares.history.Stop(owner + "-other", conversationId, requestId), Is.False);
                Assert.That(await Stop(Guid.NewGuid().ToString()), Is.False);
                Assert.That(await Stop(requestId), Is.True);

                using JsonDocument stopped = JsonDocument.Parse((await reader.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(5)))!);
                Assert.That(stopped.RootElement.GetProperty("type").GetString(), Is.EqualTo("error"));
                Assert.That(stopped.RootElement.GetProperty("error").GetString(), Is.EqualTo("Response stopped."));
                Assert.That(stopped.RootElement.GetProperty("historySaved").GetBoolean(), Is.True);
                Assert.That(Ares.history.Get(owner, conversationId).Messages.Single().Status, Is.EqualTo("interrupted"));
                Assert.That(await Stop(requestId), Is.False, "The completed cancellation must release the active turn");
            }

            if (stopAt == "thinking") {
                await VerifyStop();
                return;
            }

            headers.SetResult();
            using JsonDocument delta = JsonDocument.Parse((await reader.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(5)))!);
            Assert.Multiple(() => {
                Assert.That(delta.RootElement.GetProperty("type").GetString(), Is.EqualTo("delta"));
                Assert.That(delta.RootElement.GetProperty("text").GetString(), Is.EqualTo("Hello 🌍"));
                Assert.That(generation.IsCompleted, Is.False, "Text must arrive before generation finishes");
            });

            if (stopAt == "streaming") {
                await VerifyStop();
                return;
            }

            finish.SetResult();

            using JsonDocument lastDelta = JsonDocument.Parse((await reader.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(5)))!);
            Assert.That(lastDelta.RootElement.GetProperty("text").GetString(), Is.EqualTo("!"));

            using JsonDocument done = JsonDocument.Parse((await reader.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(5)))!);
            Assert.That(done.RootElement.GetProperty("type").GetString(), Is.EqualTo("done"));
            Assert.That(await reader.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(5)), Is.Null);
            await generation;
        }
        finally {
            headers.TrySetResult();
            finish.TrySetResult();
            listener.Stop();
            Auth.sessions.TryRemove(sessionId, out _);
            File.Delete(agentPath);
            if (!Ares.history.IsActive(owner, conversationId)) Ares.history.Delete(owner, conversationId);
        }
    }

    private static int FreePort() {
        using TcpListener listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        return ((IPEndPoint)listener.LocalEndpoint).Port;
    }

    private sealed class StreamHandler(Func<HttpRequestMessage, string> respond) : HttpMessageHandler {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(respond(request), Encoding.UTF8) });
    }
}

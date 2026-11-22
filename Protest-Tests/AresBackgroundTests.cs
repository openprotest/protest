using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Protest.Http;

namespace Protest.Tests;

using Ares = global::Protest.Ares.Core;

public class AresBackgroundTests {
    [Test]
    public void ActiveResponsesAreIndependentPrivateAndOnlySavedAtCompletion() {
        string directory = Path.Combine(Path.GetTempPath(), "ares-background-" + Guid.NewGuid());
        Ares.HistoryStore store = new Ares.HistoryStore(directory);
        Ares.HistoryTurn first = store.Begin("alice", null!, 0, Guid.NewGuid().ToString(), "First");
        Ares.HistoryTurn second = store.Begin("alice", null!, 0, Guid.NewGuid().ToString(), "Second");

        try {
            store.Append(first, "First **partial");
            store.Append(second, "Second response");
            Ares.HistoryState snapshot = store.GetState("alice", first.Conversation.Id);
            store.Append(first, " response** 🌍");

            Assert.Multiple(() => {
                Assert.That(snapshot.Pending.Response, Is.EqualTo("First **partial"));
                Assert.That(store.GetState("alice", first.Conversation.Id).Pending.Response, Is.EqualTo("First **partial response** 🌍"));
                Assert.That(store.GetState("alice", second.Conversation.Id).Pending.Response, Is.EqualTo("Second response"));
                Assert.That(store.GetState("bob", first.Conversation.Id), Is.Null);
                Assert.That(store.IsActive("bob", first.Conversation.Id), Is.False);
                Assert.That(store.IsActive("alice", first.Conversation.Id.ToUpperInvariant()), Is.True);
                Assert.That(store.IsActive("alice", "../../file"), Is.False);
                Assert.That(Directory.Exists(directory), Is.False);
            });

            Ares.Conversation saved = store.Complete(second, "Second response", "completed", "a", "Agent", "ollama", "model", null!);
            store.Release(second);
            Assert.Multiple(() => {
                Assert.That(store.GetState("alice", saved.Id).Pending, Is.Null);
                Assert.That(store.IsActive("alice", first.Conversation.Id), Is.True);
            });

            store.Complete(first, "DISCARD PARTIAL", "interrupted", "a", "Agent", "ollama", "model", null!, "Failed");
            store.Release(first);
            Assert.Multiple(() => {
                Assert.That(store.GetState("alice", first.Conversation.Id).Pending, Is.Null);
                Assert.That(store.IsActive("alice", first.Conversation.Id), Is.False);
                Assert.That(store.Get("alice", first.Conversation.Id).Messages.Select(message => message.Content), Is.EqualTo(new[] { "First" }));
                Assert.That(File.ReadAllText(Directory.GetFiles(directory, first.Conversation.Id + ".json", SearchOption.AllDirectories).Single()), Does.Not.Contain("partial").And.Not.Contain("DISCARD"));
            });

            Ares.HistoryTurn replacement = store.Begin("alice", first.Conversation.Id, 1, Guid.NewGuid().ToString(), "New turn");
            Assert.Throws<InvalidOperationException>(() => store.Append(first, "Stale"));
            store.Append(replacement, "New reply");
            Assert.That(store.GetState("alice", first.Conversation.Id).Pending.Response, Is.EqualTo("New reply"));
            store.Release(replacement);
        }
        finally {
            store.Release(first);
            store.Release(second);
            if (Directory.Exists(directory)) {
                Directory.Delete(directory, true);
            }
        }
    }

    [Test, NonParallelizable]
    public async Task OtherConversationsCompleteWhileDisconnectedResponseRemainsRecoverable() {
        static int Port() {
            using TcpListener socket = new(IPAddress.Loopback, 0);
            socket.Start();
            return ((IPEndPoint)socket.LocalEndpoint).Port;
        }

        int providerPort = Port();
        int appPort = Port();

        using HttpListener provider = new();
        provider.Prefixes.Add($"http://127.0.0.1:{providerPort}/");
        provider.Start();
        TaskCompletionSource partial = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        TaskCompletionSource finish = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);

        async Task Serve() {
            HttpListenerContext ctx = await provider.GetContextAsync();
            using JsonDocument payload = await JsonDocument.ParseAsync(ctx.Request.InputStream);
            bool first = payload.RootElement.GetProperty("messages")[0].GetProperty("content").GetString() == "First";
            ctx.Response.ContentType = "application/x-ndjson";

            if (first) {
                await ctx.Response.OutputStream.WriteAsync(Encoding.UTF8.GetBytes("{\"message\":{\"content\":\"First partial \"},\"done\":false}\n"));
                await ctx.Response.OutputStream.FlushAsync();
                partial.TrySetResult();
                await finish.Task;
            }

            string last = first ? "answer" : "Second complete";
            await ctx.Response.OutputStream.WriteAsync(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new {
                message = new {
                    content = last
                },
                done = true
            }) + "\n"));
            ctx.Response.Close();
        }

        Task providers = Task.WhenAll(Serve(), Serve());
        string agentId = Guid.NewGuid().ToString();
        string owner = "background-" + Guid.NewGuid();
        string session = Guid.NewGuid().ToString();
        string other = Guid.NewGuid().ToString();
        string firstId = Guid.NewGuid().ToString();
        string secondId = Guid.NewGuid().ToString();
        byte[] agent = JsonSerializer.SerializeToUtf8Bytes(new {
            id = agentId,
            type = "ollama",
            name = "Background test",
            enabled = true,
            secret = "",
            endpoint = $"http://127.0.0.1:{providerPort}"
        });

        Directory.CreateDirectory(Data.DIR_ARES_AGENTS);
        string agentPath = Path.Combine(Data.DIR_ARES_AGENTS, agentId + ".json");
        File.WriteAllBytes(agentPath, agent);
        string revision = Convert.ToHexString(SHA256.HashData(agent));
        foreach ((string sid, string username) in new[] { (session, owner), (other, owner + "-other") }) {
            Auth.sessions[sid] = new Auth.Session { access = new Auth.AccessControl { username = username, authorization = ["ares:write"], accessPath = Auth.PopulateAccessPath(["ares:write"]) }, ip = IPAddress.Loopback, sessionId = sid, loginDate = DateTime.UtcNow.Ticks, ttl = TimeSpan.FromHours(1).Ticks };
        }

        string front = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../Protest/Front"));
        Listener listener = new("127.0.0.1", (ushort)appPort, front);
        _ = listener.StartAsync();

        using HttpClient client = new();
        HttpRequestMessage Request(string path, string sid, object? payload = null) {
            HttpRequestMessage request = new(payload is null ? HttpMethod.Get : HttpMethod.Post, $"http://127.0.0.1:{appPort}/" + path);
            request.Headers.Add("Cookie", $"{Auth.SESSION_COOKIE}={sid}");
            request.Headers.Add("Origin", $"http://127.0.0.1:{appPort}");
            if (payload is not null)
                request.Content = new StringContent(JsonSerializer.Serialize(payload));
            return request;
        }

        async Task<string> Get(string path, string sid) {
            using HttpRequestMessage request = Request(path, sid);
            using HttpResponseMessage result = await client.SendAsync(request).WaitAsync(TimeSpan.FromSeconds(10));
            return await result.Content.ReadAsStringAsync();
        }

        try {
            using HttpRequestMessage request = Request("ares/chat?id=" + agentId, session, new {
                model = "selected",
                revision,
                text = "First",
                conversationId = firstId,
                conversationRevision = 0,
                requestId = Guid.NewGuid().ToString()
            });
            using HttpResponseMessage result = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead).WaitAsync(TimeSpan.FromSeconds(10));
            using Stream stream = await result.Content.ReadAsStreamAsync();
            using StreamReader reader = new StreamReader(stream);

            Assert.That(await reader.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(10)), Does.Contain("accepted"));
            Assert.That(await reader.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(10)), Does.Contain("First partial"));
            await partial.Task.WaitAsync(TimeSpan.FromSeconds(10));

            result.Dispose();
            stream.Dispose();

            using HttpRequestMessage secondRequest = Request("ares/chat?id=" + agentId, session, new {
                model = "selected",
                revision,
                text = "Second",
                conversationId = secondId,
                conversationRevision = 0,
                requestId = Guid.NewGuid().ToString()
            });
            using HttpResponseMessage secondResult = await client.SendAsync(secondRequest).WaitAsync(TimeSpan.FromSeconds(10));
            Assert.That(await secondResult.Content.ReadAsStringAsync(), Does.Contain("done"));

            using (JsonDocument status = JsonDocument.Parse(await Get("ares/history/get?id=" + firstId, session))) {
                Assert.Multiple(() => {
                    Assert.That(status.RootElement.GetProperty("pending").GetProperty("response").GetString(), Is.EqualTo("First partial "));
                    Assert.That(status.RootElement.GetProperty("messages").GetArrayLength(), Is.Zero);
                });
            }

            using (JsonDocument list = JsonDocument.Parse(await Get("ares/history/list", session))) {
                Assert.Multiple(() => {
                    Assert.That(list.RootElement.EnumerateArray().Single(entry => entry.GetProperty("id").GetString() == firstId).GetProperty("pending").GetBoolean(), Is.True);
                    Assert.That(list.RootElement.EnumerateArray().Single(entry => entry.GetProperty("id").GetString() == secondId).GetProperty("pending").GetBoolean(), Is.False);
                });
            }

            Assert.Multiple(() => {
                Assert.That(Ares.history.Get(owner, firstId), Is.Null);
                Assert.That(Ares.history.Get(owner, secondId).Messages.Last().Content, Is.EqualTo("Second complete"));
            });

            Assert.That(await Get("ares/history/get?id=" + firstId, other), Does.Contain("not found"));
            finish.TrySetResult();
            await providers.WaitAsync(TimeSpan.FromSeconds(10));
            for (int i = 0; i < 100 && Ares.history.IsActive(owner, firstId); i++) {
                await Task.Delay(20);
            }

            Assert.Multiple(() => {
                Assert.That(Ares.history.GetState(owner, firstId).Pending, Is.Null);
                Assert.That(Ares.history.Get(owner, firstId).Messages.Last().Content, Is.EqualTo("First partial answer"));
            });
        }
        finally {
            finish.TrySetResult();
            provider.Stop();
            listener.Stop();
            Auth.sessions.TryRemove(session, out _);
            Auth.sessions.TryRemove(other, out _);
            File.Delete(agentPath);
            foreach (string id in new[] { firstId, secondId })
                if (!Ares.history.IsActive(owner, id))
                    Ares.history.Delete(owner, id);
        }
    }
}

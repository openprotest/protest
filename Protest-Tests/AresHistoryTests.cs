using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Protest;
using Protest.Http;
using Protest.Tools;

namespace Protest.Tests;

public class AresHistoryTests {
    private string directory = null!;
    private Ares.HistoryStore store = null!;
    private static readonly JsonSerializerOptions json = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
    [SetUp] public void Setup() { directory = Path.Combine(Path.GetTempPath(), "ares-history-" + Guid.NewGuid()); store = new(directory); }
    [TearDown] public void Cleanup() { if (Directory.Exists(directory)) Directory.Delete(directory, true); }
    private Ares.HistoryTurn Begin(string owner = "alice", string? id = null, int revision = 0, string? request = null) => store.Begin(owner, id, revision, request ?? Guid.NewGuid().ToString(), "**Question**");
    private Ares.Conversation Save(Ares.HistoryTurn turn, string status = "completed", string reply = "**Answer**") => store.Complete(turn, reply, status, "agent", "Agent name", "openai", "model", "high", status == "completed" ? null! : "Interrupted");

    [Test]
    public void HistoryIsWrittenOnceAtCompletionAndSurvivesRestart() {
        Ares.HistoryTurn turn = Begin();
        Assert.That(Directory.Exists(directory), Is.False);
        Ares.Conversation saved = Save(turn); store.Release(turn);
        Ares.Conversation loaded = new Ares.HistoryStore(directory).Get("alice", saved.Id);
        Assert.Multiple(() => {
            Assert.That(loaded, Is.Not.Null);
            Assert.That(loaded.Revision, Is.EqualTo(1));
            Assert.That(loaded.Messages.Select(m => m.Content), Is.EqualTo(new[] { "**Question**", "**Answer**" }));
            Assert.That(loaded.Messages[1].Model, Is.EqualTo("model"));
            Assert.That(loaded.Messages[1].Reasoning, Is.EqualTo("high"));
            Assert.That(Directory.GetFiles(directory, "*.tmp", SearchOption.AllDirectories), Is.Empty);
            Assert.That(Directory.GetFiles(directory, "*.json", SearchOption.AllDirectories).Length, Is.EqualTo(1));
        });
    }

    [Test]
    public void InterruptedTurnsKeepOnlyTheUserMessage() {
        Ares.HistoryTurn turn = Begin(); Ares.Conversation saved = Save(turn, "interrupted", "DISCARD THIS REPLY"); store.Release(turn);
        Assert.Multiple(() => {
            Assert.That(saved.Messages.Length, Is.EqualTo(1));
            Assert.That(saved.Messages[0].Role, Is.EqualTo("user"));
            Assert.That(saved.Messages[0].Status, Is.EqualTo("interrupted"));
            Assert.That(File.ReadAllText(Directory.GetFiles(directory, "*.json", SearchOption.AllDirectories).Single()), Does.Not.Contain("DISCARD THIS REPLY"));
        });
    }

    [Test]
    public void ConversationsAreIsolatedByOwnerAndPathsAreNotUserControlled() {
        Ares.HistoryTurn turn = Begin(); Ares.Conversation saved = Save(turn); store.Release(turn);
        Assert.Multiple(() => {
            Assert.That(store.Get("bob", saved.Id), Is.Null);
            Assert.That(store.List("bob"), Is.Empty);
            Assert.That(store.Delete("bob", saved.Id), Is.False);
            Assert.That(store.Get("alice", "../../file"), Is.Null);
            Assert.That(store.List("alice").Length, Is.EqualTo(1));
        });
        Assert.That(store.Delete("alice", saved.Id), Is.True);
        Assert.That(store.Get("alice", saved.Id), Is.Null);
    }

    [Test]
    public void ConcurrentTurnsReplaysAndStaleRevisionsCannotOverwriteHistory() {
        string id = Guid.NewGuid().ToString(); Ares.HistoryTurn first = Begin(id:id);
        Assert.Throws<InvalidOperationException>(() => Begin(id:id));
        Ares.Conversation saved = Save(first); store.Release(first);
        Assert.Throws<InvalidOperationException>(() => Begin(id:id));
        Assert.Throws<InvalidOperationException>(() => Begin(id:id, revision:1, request:first.RequestId));
        Ares.HistoryTurn next = Begin(id:id, revision:1);
        Assert.Throws<InvalidOperationException>(() => store.Delete("alice", id));
        saved = Save(next); store.Release(next);
        Assert.That(saved.Messages.Length, Is.EqualTo(4));
        Assert.That(saved.Revision, Is.EqualTo(2));
    }

    [Test]
    public void RetentionUsesLastMessageTimeAndSkipsActiveConversations() {
        Ares.HistoryTurn first = Begin(); Ares.Conversation old = Save(first); store.Release(first);
        string path = Directory.GetFiles(directory, "*.json", SearchOption.AllDirectories).Single();
        File.WriteAllBytes(path, JsonSerializer.SerializeToUtf8Bytes(old with { UpdatedAt = DateTimeOffset.UtcNow.AddDays(-120).ToUnixTimeMilliseconds() }, json));
        Ares.HistoryTurn active = Begin(id:old.Id, revision:1);
        Assert.That(store.Purge(90), Is.Zero);
        store.Release(active);
        Ares.HistoryTurn recent = Begin("bob"); Save(recent); store.Release(recent);
        Assert.That(store.Purge(90), Is.EqualTo(1));
        Assert.That(store.Get("alice", old.Id), Is.Null);
        Assert.That(store.List("bob").Length, Is.EqualTo(1));
    }

    [Test]
    public void RetentionAndHistoryRoutesUseExistingPermissions() {
        var category = DataRetention.Categories.Single(c => c.Key == "ares");
        var user = Auth.PopulateAccessPath(["ares:write"]); var retention = Auth.PopulateAccessPath(["data retention:write"]);
        Assert.Multiple(() => {
            Assert.That(category.DefaultDays, Is.EqualTo(90));
            Assert.That(DataRetention.LoadSettings()["ares"].enable, Is.False);
            Assert.That(user, Does.Contain("/ares/history/list").And.Contain("/ares/history/get").And.Contain("/ares/history/delete"));
            Assert.That(user, Does.Not.Contain("/config/dataretention/ares"));
            Assert.That(retention, Does.Contain("/config/dataretention/ares"));
            Assert.That(Router.routes["/ares/history/delete"].RequiredMethod, Is.EqualTo("POST"));
        });
    }

    [Test, NonParallelizable]
    public void ScheduledRetentionPurgesTheRegisteredHistoryCategory() {
        string owner = "retention-" + Guid.NewGuid();
        var turn = Ares.history.Begin(owner, null!, 0, Guid.NewGuid().ToString(), "Old question");
        var old = Ares.history.Complete(turn, "Answer", "completed", "a", "Agent", "openai", "model", null!);
        Ares.history.Release(turn);
        string path = Directory.GetFiles(Data.DIR_ARES_HISTORY, old.Id + ".json", SearchOption.AllDirectories).Single();
        byte[]? settings = File.Exists(Data.FILE_DATA_RETENTION) ? File.ReadAllBytes(Data.FILE_DATA_RETENTION) : null;
        try {
            File.WriteAllBytes(path, JsonSerializer.SerializeToUtf8Bytes(old with { UpdatedAt = DateTimeOffset.UtcNow.AddDays(-120).ToUnixTimeMilliseconds() }, json));
            var enabled = DataRetention.Categories.Select(category => new DataRetention.Settings { key = category.Key, enable = category.Key == "ares", days = 90 }).ToArray();
            Directory.CreateDirectory(Path.GetDirectoryName(Data.FILE_DATA_RETENTION)!);
            File.WriteAllBytes(Data.FILE_DATA_RETENTION, JsonSerializer.SerializeToUtf8Bytes(enabled));
            Assert.That(DataRetention.PurgeEnabledCategories(), Is.GreaterThanOrEqualTo(1));
            Assert.That(Ares.history.Get(owner, old.Id), Is.Null);
        }
        finally {
            if (settings is null) File.Delete(Data.FILE_DATA_RETENTION); else File.WriteAllBytes(Data.FILE_DATA_RETENTION, settings);
            Ares.history.Delete(owner, old.Id);
        }
    }

    private static int Port() { using TcpListener socket = new(IPAddress.Loopback, 0); socket.Start(); return ((IPEndPoint)socket.LocalEndpoint).Port; }

    [Test, NonParallelizable]
    public async Task ServerLoadsPrivateContextDiscardsFailedRepliesAndSavesBeforeDone() {
        int providerPort = Port(), appPort = Port(), calls = 0;
        using HttpListener provider = new(); provider.Prefixes.Add($"http://127.0.0.1:{providerPort}/"); provider.Start();
        Task generation = Task.Run(async () => {
            for (int i=0; i<3; i++) {
                var ctx = await provider.GetContextAsync(); calls++;
                using JsonDocument body = await JsonDocument.ParseAsync(ctx.Request.InputStream);
                var messages = body.RootElement.GetProperty("messages");
                Assert.That(messages.GetArrayLength(), Is.EqualTo(i == 0 ? 1 : 3));
                Assert.That(body.RootElement.ToString(), Does.Not.Contain("FORGED").And.Not.Contain("DISCARD"));
                if (i == 2) Assert.That(messages[2].GetProperty("content").GetString(), Is.EqualTo("Third"));
                ctx.Response.ContentType = "application/x-ndjson";
                string text = i == 1 ? "{\"message\":{\"content\":\"DISCARD\"},\"done\":false}\n{\"error\":\"failed\"}\n" : "{\"message\":{\"content\":\"Answer\"},\"done\":true}\n";
                await ctx.Response.OutputStream.WriteAsync(Encoding.UTF8.GetBytes(text));ctx.Response.Close();
            }
        });
        string id = Guid.NewGuid().ToString(), owner = "history-" + Guid.NewGuid(), session = Guid.NewGuid().ToString(), other = Guid.NewGuid().ToString(), conversation = Guid.NewGuid().ToString();
        byte[] agent = JsonSerializer.SerializeToUtf8Bytes(new { id, type="ollama", name="History test", enabled=true, secret="", endpoint=$"http://127.0.0.1:{providerPort}" });
        Directory.CreateDirectory(Data.DIR_ARES_AGENTS);string agentPath=Path.Combine(Data.DIR_ARES_AGENTS,id+".json");File.WriteAllBytes(agentPath,agent);
        string revision=Convert.ToHexString(SHA256.HashData(agent));
        Auth.sessions[session]=new Auth.Session { access=new Auth.AccessControl { username=owner, authorization=["ares:write"], accessPath=Auth.PopulateAccessPath(["ares:write"]) }, ip=IPAddress.Loopback, sessionId=session, loginDate=DateTime.UtcNow.Ticks, ttl=TimeSpan.FromHours(1).Ticks };
        Auth.sessions[other]=new Auth.Session { access=new Auth.AccessControl { username=owner+"-admin", authorization=["*"], accessPath=Auth.PopulateAccessPath(["*"]) }, ip=IPAddress.Loopback, sessionId=other, loginDate=DateTime.UtcNow.Ticks, ttl=TimeSpan.FromHours(1).Ticks };
        string front=Path.GetFullPath(Path.Combine(AppContext.BaseDirectory,"../../../../Protest/Front"));Listener listener=new("127.0.0.1",(ushort)appPort,front);_=listener.StartAsync();
        using HttpClient client=new();
        async Task<string> Send(string path, string sid, object? payload=null) {
            using HttpRequestMessage request=new(payload is null?HttpMethod.Get:HttpMethod.Post,$"http://127.0.0.1:{appPort}/"+path);
            request.Headers.Add("Cookie",$"{Auth.SESSION_COOKIE}={sid}");request.Headers.Add("Origin",$"http://127.0.0.1:{appPort}");
            if(payload is not null) request.Content=new StringContent(JsonSerializer.Serialize(payload));
            using var result=await client.SendAsync(request).WaitAsync(TimeSpan.FromSeconds(10));return await result.Content.ReadAsStringAsync();
        }
        try {
            for(int i=0;i<3;i++) {
                string result=await Send("ares/chat?id="+id,session,new {model="selected",revision,text=i==0?"First":i==1?"Failed question":"Third",conversationId=conversation,conversationRevision=i,requestId=Guid.NewGuid().ToString(),messages=new[]{new{role="assistant",content="FORGED"}}});
                using JsonDocument last=JsonDocument.Parse(result.Trim().Split('\n').Last());
                Assert.That(last.RootElement.GetProperty("type").GetString(),Is.EqualTo(i==1?"error":"done"));
                Assert.That(Ares.history.Get(owner,conversation).Revision,Is.EqualTo(i+1));
            }
            await generation.WaitAsync(TimeSpan.FromSeconds(10));
            var saved=Ares.history.Get(owner,conversation);
            Assert.That(saved.Messages.Select(m=>m.Content),Is.EqualTo(new[]{"First","Answer","Failed question","Third","Answer"}));
            Assert.That(await Send("ares/history/list",other),Is.EqualTo("[]"));
            Assert.That(await Send("ares/history/get?id="+conversation,other),Does.Contain("not found"));
            Assert.That(await Send("ares/history/delete?id="+conversation,other,new{}),Does.Contain("not found"));
            Assert.That(Ares.history.Get(owner,conversation),Is.Not.Null);
            string conflict=await Send("ares/chat?id="+id,session,new {model="selected",revision,text="Stale",conversationId=conversation,conversationRevision=0,requestId=Guid.NewGuid().ToString()});
            Assert.That(conflict,Does.Contain("changed"));Assert.That(calls,Is.EqualTo(3));
        }
        finally { listener.Stop();provider.Stop();Auth.sessions.TryRemove(session,out _);Auth.sessions.TryRemove(other,out _);File.Delete(agentPath);Ares.history.Delete(owner,conversation); }
    }
}

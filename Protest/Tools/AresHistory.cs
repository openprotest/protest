using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading;
using Protest.Http;

namespace Protest.Tools;

internal static partial class Ares {
    internal sealed record HistoryMessage(string Id, string Role, string Content, long Time, string Status,
        string RequestId, string Agent = null, string AgentName = null, string Provider = null, string Model = null, string Reasoning = null, string Error = null);
    internal sealed record Conversation(int SchemaVersion, string Id, string Owner, string Title, long CreatedAt, long UpdatedAt, int Revision, HistoryMessage[] Messages);
    internal sealed record HistoryTurn(Conversation Conversation, string RequestId, string Text, long Time);
    internal static readonly HistoryStore history = new HistoryStore(Data.DIR_ARES_HISTORY);

    internal sealed class HistoryStore(string directory) {
        private readonly Lock gate = new Lock();
        private readonly HashSet<string> active = new HashSet<string>();
        private static string OwnerKey(string owner) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(owner)));
        private string OwnerPath(string owner) => Path.Join(directory, OwnerKey(owner));
        private string FilePath(string owner, string id) => Path.Join(OwnerPath(owner), $"{Guid.Parse(id):D}.json");
        private static string Key(string owner, string id) => $"{OwnerKey(owner)}/{id}";

        private Conversation Read(string owner, string id) {
            if (String.IsNullOrEmpty(owner) || !Guid.TryParse(id, out Guid guid)) return null;
            string path = FilePath(owner, guid.ToString());
            if (!File.Exists(path)) return null;
            if (new FileInfo(path).Length > 8 * 1024 * 1024) throw new IOException("Conversation exceeds the history size limit");
            Conversation conversation = JsonSerializer.Deserialize<Conversation>(File.ReadAllBytes(path), jsonOptions);
            if (conversation is null || conversation.SchemaVersion != 1 || conversation.Owner != owner || conversation.Id != guid.ToString() ||
                conversation.Revision < 1 || conversation.Messages is null) throw new JsonException("Invalid conversation file");
            for (int i = 0; i < conversation.Messages.Length; i++) {
                if (conversation.Messages[i] is null || conversation.Messages[i].Role is not ("user" or "assistant") || conversation.Messages[i].Content is null || conversation.Messages[i].Status is not ("completed" or "interrupted")) throw new JsonException("Invalid conversation messages");
            }
            return conversation;
        }

        internal Conversation Get(string owner, string id) { lock (gate) { return Read(owner, id); } }

        internal Conversation[] List(string owner) {
            lock (gate) {
                string path = OwnerPath(owner);
                if (!Directory.Exists(path)) return [];
                List<Conversation> result = new List<Conversation>();
                foreach (string file in Directory.EnumerateFiles(path, "*.json")) {
                    if (!Guid.TryParse(Path.GetFileNameWithoutExtension(file), out Guid id)) continue;
                    try { Conversation value = Read(owner, id.ToString()); if (value is not null) result.Add(value); }
                    catch (Exception ex) when (ex is IOException or JsonException) { Logger.Error("Unable to read an A.R.E.S. history file"); }
                }
                return result.OrderByDescending(value => value.UpdatedAt).ThenBy(value => value.Id).ToArray();
            }
        }

        internal HistoryTurn Begin(string owner, string id, int revision, string requestId, string text) {
            if (String.IsNullOrEmpty(owner) || !Guid.TryParse(requestId, out Guid request)) throw new ArgumentException("Invalid history request");
            lock (gate) {
                Conversation conversation = id is null ? null : Read(owner, id);
                if (conversation is null) {
                    if (revision != 0 || (id is not null && !Guid.TryParse(id, out _))) throw new InvalidOperationException("Conversation not found");
                    long now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                    string title = Regex.Replace(text, @"\s+", " ").Trim();
                    conversation = new Conversation(1, id is null ? Guid.NewGuid().ToString() : Guid.Parse(id).ToString(), owner, title[..Math.Min(title.Length, 80)], now, now, 0, []);
                }
                else if (conversation.Revision != revision) throw new InvalidOperationException("This conversation changed. Reopen it from History before sending another message.");
                if (conversation.Messages.Any(message => message.RequestId == request.ToString())) throw new InvalidOperationException("This message is already saved. Reopen the conversation from History.");
                if (!active.Add(Key(owner, conversation.Id))) throw new InvalidOperationException("A response is already being generated for this conversation.");
                return new HistoryTurn(conversation, request.ToString(), text, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
            }
        }

        internal Conversation Complete(HistoryTurn turn, string text, string status, string agent, string agentName, string provider, string model, string reasoning, string error = null) {
            lock (gate) {
                Conversation previous = turn.Conversation;
                Conversation current = Read(previous.Owner, previous.Id);
                if ((current?.Revision ?? 0) != previous.Revision) throw new InvalidOperationException("Conversation changed while the response was generated");
                if (!active.Contains(Key(previous.Owner, previous.Id))) throw new InvalidOperationException("This conversation is not active");
                if (status is not ("completed" or "interrupted")) throw new ArgumentException("Invalid conversation status");
                long now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                HistoryMessage user = new HistoryMessage(Guid.NewGuid().ToString(), "user", turn.Text, turn.Time, status, turn.RequestId);
                HistoryMessage[] messages;
                if (status == "completed") {
                    HistoryMessage reply = new HistoryMessage(Guid.NewGuid().ToString(), "assistant", text, now, status,
                        turn.RequestId, agent, agentName, provider, model, reasoning);
                    messages = [..previous.Messages, user, reply];
                }
                else {
                    user = user with { Agent = agent, AgentName = agentName, Provider = provider, Model = model, Reasoning = reasoning, Error = error ?? "The response was interrupted." };
                    messages = [..previous.Messages, user];
                }
                Conversation saved = previous with { UpdatedAt = now, Revision = previous.Revision + 1, Messages = messages };
                byte[] bytes = JsonSerializer.SerializeToUtf8Bytes(saved, jsonOptions);
                if (bytes.Length > 8 * 1024 * 1024) throw new IOException("Conversation exceeds the history size limit");
                Directory.CreateDirectory(OwnerPath(saved.Owner));
                string path = FilePath(saved.Owner, saved.Id), temporary = path + $".{Guid.NewGuid():N}.tmp";
                try {
                    using (FileStream stream = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None)) {
                        stream.Write(bytes);
                        stream.Flush(true);
                    }
                    File.Move(temporary, path, true);
                }
                finally { if (File.Exists(temporary)) File.Delete(temporary); }
                return saved;
            }
        }

        internal void Release(HistoryTurn turn) { lock (gate) { active.Remove(Key(turn.Conversation.Owner, turn.Conversation.Id)); } }

        internal bool Delete(string owner, string id) {
            lock (gate) {
                Conversation conversation = Read(owner, id);
                if (conversation is null) return false;
                if (active.Contains(Key(owner, conversation.Id))) throw new InvalidOperationException("Wait for the response to finish before deleting this conversation.");
                File.Delete(FilePath(owner, conversation.Id));
                return true;
            }
        }

        internal int Purge(int days) {
            lock (gate) {
                if (!Directory.Exists(directory)) return 0;
                long cutoff = DateTimeOffset.UtcNow.AddDays(-Math.Max(DataRetention.MIN_DAYS, days)).ToUnixTimeMilliseconds();
                int deleted = 0;
                foreach (string folder in Directory.EnumerateDirectories(directory)) {
                    foreach (string file in Directory.EnumerateFiles(folder, "*.json")) {
                        if (!Guid.TryParse(Path.GetFileNameWithoutExtension(file), out Guid id)) continue;
                        try {
                            if (new FileInfo(file).Length > 8 * 1024 * 1024) continue;
                            Conversation value = JsonSerializer.Deserialize<Conversation>(File.ReadAllBytes(file), jsonOptions);
                            if (value is null || String.IsNullOrEmpty(value.Owner) || OwnerKey(value.Owner) != Path.GetFileName(folder)) continue;
                            value = Read(value.Owner, id.ToString());
                            if (value is null || value.UpdatedAt >= cutoff || active.Contains(Key(value.Owner, value.Id))) continue;
                            File.Delete(file);
                            deleted++;
                        }
                        catch (Exception ex) when (ex is IOException or JsonException) { Logger.Error("Unable to purge an A.R.E.S. history file"); }
                    }
                }
                return deleted;
            }
        }
    }

    public static byte[] ListHistory(HttpListenerContext ctx) {
        string owner = Auth.GetPrincipal(ctx);
        if (owner is null) return Data.CODE_NOT_FOUND.Array;
        try { return JsonSerializer.SerializeToUtf8Bytes(history.List(owner).Select(value => new { value.Id, value.Title, value.CreatedAt, value.UpdatedAt, value.Revision }), jsonOptions); }
        catch (Exception ex) { Logger.Error(ex); return Error("Unable to load conversation history"); }
    }

    public static byte[] GetHistory(HttpListenerContext ctx) {
        string owner = Auth.GetPrincipal(ctx);
        if (owner is null) return Data.CODE_NOT_FOUND.Array;
        try {
            Conversation value = history.Get(owner, ctx.Request.QueryString["id"]);
            return value is null ? Data.CODE_NOT_FOUND.Array : JsonSerializer.SerializeToUtf8Bytes(value, jsonOptions);
        }
        catch (Exception ex) { Logger.Error(ex); return Error("Unable to load this conversation"); }
    }

    public static byte[] DeleteHistory(HttpListenerContext ctx) {
        string owner = Auth.GetPrincipal(ctx);
        if (owner is null) return Data.CODE_NOT_FOUND.Array;
        try { return history.Delete(owner, ctx.Request.QueryString["id"]) ? Data.CODE_OK.Array : Data.CODE_NOT_FOUND.Array; }
        catch (InvalidOperationException ex) { return Error(ex.Message); }
        catch (Exception ex) { Logger.Error(ex); return Error("Unable to delete this conversation"); }
    }
}

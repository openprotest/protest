using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading;
using Protest.Http;

namespace Protest.Ares;

internal static partial class Core {
    internal sealed record HistoryMessage(string Id, string Role, string Content, long Time, string Status, string RequestId, string Agent = null, string AgentName = null, string Provider = null, string Model = null, string Reasoning = null, string Error = null);
    internal sealed record Conversation(int SchemaVersion, string Id, string Owner, string Title, long CreatedAt, long UpdatedAt, int Revision, HistoryMessage[] Messages);
    internal sealed record HistoryTurn(Conversation Conversation, string RequestId, string Text, long Time, string Agent = null, string AgentName = null, string Model = null, string Reasoning = null) {
        internal StringBuilder Response { get; } = new StringBuilder();
    }
    internal sealed record PendingResponse(string RequestId, string Text, long Time, string Agent, string AgentName, string Model, string Reasoning, string Response);
    internal sealed record HistoryState(Conversation Conversation, PendingResponse Pending);
    internal static readonly HistoryStore history = new HistoryStore(Data.DIR_ARES_HISTORY);

    internal sealed class HistoryStore(string directory) {
        private readonly Lock gate = new Lock();
        private readonly Dictionary<string, HistoryTurn> active = new Dictionary<string, HistoryTurn>();
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
            if (conversation is null || conversation.SchemaVersion != 1 || conversation.Owner != owner || conversation.Id != guid.ToString() || conversation.Revision < 1 || conversation.Messages is null) {
                throw new JsonException("Invalid conversation file");
            }

            for (int i = 0; i < conversation.Messages.Length; i++) {
                if (conversation.Messages[i] is null || conversation.Messages[i].Role is not ("user" or "assistant") || conversation.Messages[i].Content is null || conversation.Messages[i].Status is not ("completed" or "interrupted")){
                    throw new JsonException("Invalid conversation messages");
                }
            }

            return conversation;
        }

        internal Conversation Get(string owner, string id) {
            lock (gate) {
                return Read(owner, id);
            }
        }

        internal HistoryState GetState(string owner, string id) {
            if (String.IsNullOrEmpty(owner) || !Guid.TryParse(id, out Guid guid)) return null;
            lock (gate) {
                if (active.TryGetValue(Key(owner, guid.ToString()), out HistoryTurn turn)) {
                    return new HistoryState(turn.Conversation, new PendingResponse(turn.RequestId, turn.Text, turn.Time, turn.Agent, turn.AgentName, turn.Model, turn.Reasoning, turn.Response.ToString()));
                }
                Conversation value = Read(owner, guid.ToString());
                return value is null ? null : new HistoryState(value, null);
            }
        }

        internal bool IsActive(string owner, string id) {
            if (String.IsNullOrEmpty(owner) || !Guid.TryParse(id, out Guid guid)) return false;
            lock (gate) {
                return active.ContainsKey(Key(owner, guid.ToString()));
            }
        }

        internal void Append(HistoryTurn turn, string text) {
            lock (gate) {
                if (!active.TryGetValue(Key(turn.Conversation.Owner, turn.Conversation.Id), out HistoryTurn activeTurn) || !ReferenceEquals(activeTurn, turn)) throw new InvalidOperationException("This conversation is not active");
                turn.Response.Append(text);
            }
        }

        internal Conversation[] List(string owner) {
            lock (gate) {
                string path = OwnerPath(owner);
                Dictionary<string, Conversation> result = new Dictionary<string, Conversation>();

                foreach (string file in Directory.Exists(path) ? Directory.EnumerateFiles(path, "*.json") : []) {
                    if (!Guid.TryParse(Path.GetFileNameWithoutExtension(file), out Guid id)) continue;

                    try {
                        Conversation value = Read(owner, id.ToString());
                        if (value is not null) {
                            result[value.Id] = value;
                        }
                    }
                    catch (Exception ex) when (ex is IOException or JsonException) {
                        Logger.Error("Unable to read an A.R.E.S. history file");
                    }
                }

                foreach (HistoryTurn turn in active.Values) {
                    if (turn.Conversation.Owner == owner) {
                        result[turn.Conversation.Id] = turn.Conversation with { UpdatedAt = turn.Time };
                    }
                }

                return result.Values.OrderByDescending(value => value.UpdatedAt).ThenBy(value => value.Id).ToArray();
            }
        }

        internal HistoryTurn Begin(string owner, string id, int revision, string requestId, string text, string agent = null, string agentName = null, string model = null, string reasoning = null) {
            if (String.IsNullOrEmpty(owner) || !Guid.TryParse(requestId, out Guid request)) {
                throw new ArgumentException("Invalid history request");
            }

            lock (gate) {
                Conversation conversation = id is null ? null : Read(owner, id);
                if (conversation is null) {
                    if (revision != 0 || (id is not null && !Guid.TryParse(id, out _))) throw new InvalidOperationException("Conversation not found");
                    long now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                    string title = Regex.Replace(text, @"\s+", " ").Trim();
                    conversation = new Conversation(1, id is null ? Guid.NewGuid().ToString() : Guid.Parse(id).ToString(), owner, title[..Math.Min(title.Length, 80)], now, now, 0, []);
                }
                else if (conversation.Revision != revision) {
                    throw new InvalidOperationException("This conversation changed. Reopen it from History before sending another message.");
                }

                if (conversation.Messages.Any(message => message.RequestId == request.ToString())) {
                    throw new InvalidOperationException("This message is already saved. Reopen the conversation from History.");
                }

                string key = Key(owner, conversation.Id);
                if (active.ContainsKey(key)) throw new InvalidOperationException("A response is already being generated for this conversation.");

                HistoryTurn turn = new HistoryTurn(conversation, request.ToString(), text, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), agent, agentName, model, reasoning);
                active.Add(key, turn);

                return turn;
            }
        }

        internal Conversation Complete(HistoryTurn turn, string text, string status, string agent, string agentName, string provider, string model, string reasoning, string error = null) {
            lock (gate) {
                Conversation previous = turn.Conversation;
                Conversation current = Read(previous.Owner, previous.Id);

                if ((current?.Revision ?? 0) != previous.Revision) throw new InvalidOperationException("Conversation changed while the response was generated");
                if (!active.TryGetValue(Key(previous.Owner, previous.Id), out HistoryTurn activeTurn) || !ReferenceEquals(activeTurn, turn)) throw new InvalidOperationException("This conversation is not active");
                if (status is not ("completed" or "interrupted")) throw new ArgumentException("Invalid conversation status");

                long now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                HistoryMessage user = new HistoryMessage(Guid.NewGuid().ToString(), "user", turn.Text, turn.Time, status, turn.RequestId);
                HistoryMessage[] messages;

                if (status == "completed") {
                    HistoryMessage reply = new HistoryMessage(Guid.NewGuid().ToString(), "assistant", text, now, status, turn.RequestId, agent, agentName, provider, model, reasoning);
                    messages = [..previous.Messages, user, reply];
                }
                else {
                    user = user with { Agent = agent, AgentName = agentName, Provider = provider, Model = model, Reasoning = reasoning, Error = error ?? "The response was interrupted." };
                    messages = [..previous.Messages, user];
                }

                Conversation saved = previous with { UpdatedAt = now, Revision = previous.Revision + 1, Messages = messages };
                Write(saved);
                return saved;
            }
        }

        internal Conversation Branch(string owner, string id, string requestId) {
            if (!Guid.TryParse(requestId, out Guid request)) return null;
            string turnId = request.ToString();

            lock (gate) {
                Conversation source = Read(owner, id);
                if (source is null) return null;

                int index = Array.FindIndex(source.Messages, message =>
                    message.RequestId == turnId && message.Role == "assistant" && message.Status == "completed");
                if (index < 0) return null;

                long now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                string title = $"Branch: {source.Title}";
                Conversation branch = new Conversation(1, Guid.NewGuid().ToString(), owner, title[..Math.Min(title.Length, 80)],
                    now, now, 1, source.Messages[..(index + 1)]);
                Write(branch);
                return branch;
            }
        }

        private void Write(Conversation conversation) {
            byte[] bytes = JsonSerializer.SerializeToUtf8Bytes(conversation, jsonOptions);
            if (bytes.Length > 8 * 1024 * 1024) throw new IOException("Conversation exceeds the history size limit");

            Directory.CreateDirectory(OwnerPath(conversation.Owner));
            string path = FilePath(conversation.Owner, conversation.Id), temporary = path + $".{Guid.NewGuid():N}.tmp";

            try {
                using (FileStream stream = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None)) {
                    stream.Write(bytes);
                    stream.Flush(true);
                }

                File.Move(temporary, path, true);
            }
            finally {
                if (File.Exists(temporary)) File.Delete(temporary);
            }
        }

        internal void Release(HistoryTurn turn) {
            lock (gate) {
                string key = Key(turn.Conversation.Owner, turn.Conversation.Id);
                if (active.TryGetValue(key, out HistoryTurn activeTurn) && ReferenceEquals(activeTurn, turn)) active.Remove(key);
            }
        }

        internal bool Delete(string owner, string id) {
            lock (gate) {
                Conversation conversation = Read(owner, id);
                if (conversation is null) return false;

                if (active.ContainsKey(Key(owner, conversation.Id))) {
                    throw new InvalidOperationException("Wait for the response to finish before deleting this conversation.");
                }

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

                            if (value is null || value.UpdatedAt >= cutoff || active.ContainsKey(Key(value.Owner, value.Id))) continue;
                            File.Delete(file);
                            deleted++;
                        }
                        catch (Exception ex) when (ex is IOException or JsonException) {
                            Logger.Error("Unable to purge an A.R.E.S. history file");
                        }
                    }
                }
                return deleted;
            }
        }
    }

    public static byte[] ListHistory(HttpListenerContext ctx) {
        string owner = Auth.GetPrincipal(ctx);
        if (owner is null) return Data.CODE_NOT_FOUND.Array;

        try {
            return JsonSerializer.SerializeToUtf8Bytes(history.List(owner).Select(value => new { value.Id, value.Title, value.CreatedAt, value.UpdatedAt, value.Revision, pending = history.IsActive(owner, value.Id) }), jsonOptions);
        }
        catch (Exception ex) {
            Logger.Error(ex);
            return Error("Unable to load conversation history");
        }
    }

    public static byte[] GetHistory(HttpListenerContext ctx) {
        string owner = Auth.GetPrincipal(ctx);
        if (owner is null) return Data.CODE_NOT_FOUND.Array;
        try {
            HistoryState state = history.GetState(owner, ctx.Request.QueryString["id"]);
            if (state is null) return Data.CODE_NOT_FOUND.Array;

            Conversation value = state.Conversation;
            return JsonSerializer.SerializeToUtf8Bytes(new { value.SchemaVersion, value.Id, value.Owner, value.Title, value.CreatedAt, value.UpdatedAt, value.Revision, value.Messages, state.Pending }, jsonOptions);
        }
        catch (Exception ex) {
            Logger.Error(ex);
            return Error("Unable to load this conversation");
        }
    }

    public static byte[] BranchHistory(HttpListenerContext ctx) {
        string owner = Auth.GetPrincipal(ctx);
        if (owner is null) return Data.CODE_NOT_FOUND.Array;

        try {
            Conversation branch = history.Branch(owner, ctx.Request.QueryString["id"], ctx.Request.QueryString["requestId"]);
            return branch is null ? Data.CODE_NOT_FOUND.Array : JsonSerializer.SerializeToUtf8Bytes(new { id = branch.Id });
        }
        catch (Exception ex) {
            Logger.Error(ex);
            return Error("Unable to branch this conversation");
        }
    }

    public static byte[] DeleteHistory(HttpListenerContext ctx) {
        string owner = Auth.GetPrincipal(ctx);
        if (owner is null) return Data.CODE_NOT_FOUND.Array;

        try {
            return history.Delete(owner, ctx.Request.QueryString["id"]) ? Data.CODE_OK.Array : Data.CODE_NOT_FOUND.Array;
        }
        catch (InvalidOperationException ex) {
            return Error(ex.Message);
        }
        catch (Exception ex) {
            Logger.Error(ex);
            return Error("Unable to delete this conversation");
        }
    }
}

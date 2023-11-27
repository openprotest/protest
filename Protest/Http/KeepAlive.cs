using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Net;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;

namespace Protest.Http;

internal static class KeepAlive {
    private static readonly ArraySegment<byte> MSG_FORCE_RELOAD = new(Encoding.UTF8.GetBytes(@"{""action"":""forcereload""}"));

    private struct Entry {
        public WebSocket ws;
        public HttpListenerContext ctx;
        public string sessionId;
        public string username;
        public object syncLock;
    }


    private static readonly ConcurrentDictionary<WebSocket, Entry> connections = new();

    private static readonly JsonSerializerOptions messageSerializerOptions = new();

    static KeepAlive() {
        messageSerializerOptions.Converters.Add(new MessageJsonConverter());
    }

    public static async void WebSocketHandler(HttpListenerContext ctx) {
        WebSocket ws;

        try {
            WebSocketContext wsc = await ctx.AcceptWebSocketAsync(null);
            ws = wsc.WebSocket;
        }
        catch (WebSocketException ex) {
            ctx.Response.Close();
            Logger.Error(ex);
            return;
        }

        string sessionId = ctx.Request.Cookies["sessionid"]?.Value ?? null;

//#if DEBUG
        string username = IPAddress.IsLoopback(ctx.Request.RemoteEndPoint.Address) ? "loopback" : Auth.GetUsername(sessionId);
//#else
//      string username = Auth.GetUsername(sessionId);
//#endif

        string[] accessArray = Auth.acl.TryGetValue(username, out Auth.AccessControl accessControl) ? accessControl.authorization : new string[] { "*" };

        connections.TryAdd(ws, new Entry() {
            ws = ws,
            ctx = ctx,
            sessionId = sessionId,
            username = username,
            syncLock = new object()
        });

        byte[] buff = new byte[2048];

        try {
            //init
            ArraySegment<byte> initSegment = new(Encoding.UTF8.GetBytes($"{{\"action\":\"init\",\"version\":\"{Data.VersionToString()}\",\"username\":\"{username}\",\"color\":\"{accessControl?.color ?? "#A0A0A0"}\",\"authorization\":[\"{string.Join("\",\"", accessArray)}\"]}}"));
            await ws.SendAsync(initSegment, WebSocketMessageType.Text, true, CancellationToken.None);

            StringBuilder messageBuilder = new StringBuilder();

            while (ws.State == WebSocketState.Open) {
                if (!Auth.IsAuthenticated(ctx)) {
                    await ws.SendAsync(MSG_FORCE_RELOAD, WebSocketMessageType.Text, true, CancellationToken.None);
                    await ws.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, null, CancellationToken.None);
                    return;
                }

                WebSocketReceiveResult receive = await ws.ReceiveAsync(new ArraySegment<byte>(buff), CancellationToken.None);

                if (receive.MessageType == WebSocketMessageType.Close) {
                    await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, null, CancellationToken.None);
                    break;
                }

                messageBuilder.Append(Encoding.Default.GetString(buff, 0, receive.Count));

                if (receive.EndOfMessage) {
                    HandleMessage(messageBuilder.ToString(), ctx, username);
                    messageBuilder.Clear();
                }
            }
        }
        catch (WebSocketException ex) when (ex.ErrorCode != 0) {
            ctx.Response.Close();
            Logger.Error(ex);
        }
        catch {
            ctx.Response.Close();
        }

        connections.Remove(ws, out _);
    }

    public static async void CloseConnection(string sessionId) {
        foreach (KeyValuePair<WebSocket, Entry> pair in connections) {
            if (pair.Value.sessionId != sessionId) continue;

            if (pair.Value.ws.State == WebSocketState.Open) {
                lock(pair.Value.syncLock) {
                    pair.Value.ws.SendAsync(MSG_FORCE_RELOAD, WebSocketMessageType.Text, true, CancellationToken.None);
                }
                await pair.Value.ws.CloseAsync(WebSocketCloseStatus.NormalClosure, null, CancellationToken.None);
                pair.Value.ws.Dispose();
            }

            connections.TryRemove(pair.Key, out _);
            return;
        }
    }

    public static void Broadcast(string message, string accessPath) {
        Broadcast(Encoding.UTF8.GetBytes(message), accessPath);
    }
    public static void Broadcast(byte[] message, string accessPath) {
        List<WebSocket> remove = new List<WebSocket>();

        foreach (Entry entry in connections.Values) {
            if (!Auth.IsAuthorized(entry.ctx, accessPath)) {
                continue;
            }

            if (entry.ws.State == WebSocketState.Open) {
                new Thread(() => {
                    try {
                        lock (entry.syncLock) {
                            entry.ws.SendAsync(new ArraySegment<byte>(message, 0, message.Length), WebSocketMessageType.Text, true, CancellationToken.None);
                        }
                    }
                    catch { }
                }).Start();
            }
            else {
                remove.Add(entry.ws);
            }

            for (int i = 0; i < remove.Count; i++) {
                connections.Remove(remove[i], out _);
            }
        }
    }

    public static void Unicast(string username, string message, string accessPath) {
        Unicast(username, Encoding.UTF8.GetBytes(message), accessPath);
    }
    public static void Unicast(string username, byte[] message, string accessPath) {
        foreach (Entry entry in connections.Values) {
            if (entry.username != username) continue;

            if (!Auth.IsAuthorized(entry.ctx, accessPath)) {
                continue;
            }

            if (entry.ws.State == WebSocketState.Open) {
                new Thread(()=> {
                    try {
                        lock (entry.syncLock) {
                            entry.ws.SendAsync(new ArraySegment<byte>(message, 0, message.Length), WebSocketMessageType.Text, true, CancellationToken.None);
                        }
                    }
                    catch { }
                }).Start();
            }
        }
    }

    private static void HandleMessage(string message, HttpListenerContext ctx, string origin) {
        ConcurrentDictionary<string, string> dictionary;
        try {
            dictionary = JsonSerializer.Deserialize<ConcurrentDictionary<string, string>>(message, messageSerializerOptions);
        }
        catch {
            return;
        }

        if (dictionary.IsEmpty) { return; }

        if (!dictionary.TryGetValue("type", out string type)) {
            return;
        }

        switch (type) {

        case "update-session-ttl":
            if (!dictionary.TryGetValue("ttl", out string ttl)) {
                return;
            }

            if (long.TryParse(ttl, out long ttlLong)) {
                string sessionId = ctx.Request.Cookies["sessionid"]?.Value ?? null;
                if (sessionId is null) return;
                Auth.UpdateSessionTtl(sessionId, ttlLong);
            }

            return;

        case "chat-text":
            if (Auth.IsAuthorized(ctx, "/chat/write")) {
                Chat.TextHandler(dictionary, origin);
            }
            return;

        case "chat-emoji":
            if (Auth.IsAuthorized(ctx, "/chat/write")) {
                Chat.EmojiHandler(dictionary, origin);
            }
            return;

        case "chat-command":
            if (Auth.IsAuthorized(ctx, "/chat/write")) {
                Chat.CommandHandler(dictionary, origin);
            }
            return;

        case "chat-stream":
            //TODO
            return;
        }
    }
}

file sealed class MessageJsonConverter : JsonConverter<ConcurrentDictionary<string, string>> {
    public override ConcurrentDictionary<string, string> Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) {
        ConcurrentDictionary<string, string> dictionary = new ConcurrentDictionary<string, string>();

        while (reader.Read()) {
            if (reader.TokenType == JsonTokenType.EndObject) {
                break;
            }

            if (reader.TokenType == JsonTokenType.PropertyName) {
                string key = reader.GetString();
                reader.Read();

                string value;
                if (reader.TokenType == JsonTokenType.Number) {
                    value = reader.GetInt64().ToString();
                }
                else {
                    value = reader.GetString();
                }

                dictionary.TryAdd(key, value);
            }
        }

        return dictionary;
    }

    public override void Write(Utf8JsonWriter writer, ConcurrentDictionary<string, string> value, JsonSerializerOptions options) {
        writer.WriteStartObject();

        foreach (KeyValuePair<string, string> pair in value) {
            writer.WriteString(pair.Key, pair.Value);
        }

        writer.WriteEndObject();
    }
}
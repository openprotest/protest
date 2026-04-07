using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Net;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;
using Protest.Tools;

namespace Protest.Http;

internal static class KeepAlive {
    public static readonly ArraySegment<byte> MSG_FORCE_RELOAD = new(Encoding.UTF8.GetBytes(@"{""action"":""force-reload""}"));

    private struct Entry {
        public WebSocket ws;
        public HttpListenerContext ctx;
        public string sessionId;
        public string username;
        public Lock mutex;
        public ConcurrentDictionary<string, int> devicesView;
        public ConcurrentDictionary<string, int> usersView;
    }

    private static readonly ConcurrentDictionary<WebSocket, Entry> connections = new();

    private static readonly JsonSerializerOptions messageSerializerOptions;

    static KeepAlive() {
        messageSerializerOptions = new JsonSerializerOptions();
        messageSerializerOptions.Converters.Add(new MessageJsonConverter());
    }

    internal static async Task WebSocketHandler(HttpListenerContext ctx) {
        if (!Auth.IsAuthenticatedAndAuthorized(ctx, ctx.Request.Url.AbsolutePath)) {
            ctx.Response.Close();
            return;
        }

        WebSocket ws;
        try {
            HttpListenerWebSocketContext wsc = await ctx.AcceptWebSocketAsync(null);
            ws = wsc.WebSocket;
        }
        catch (WebSocketException ex) {
            ctx.Response.Close();
            Logger.Error(ex);
            return;
        }

        if (ws is null) return;

        string sessionId = ctx.Request.Cookies["sessionid"]?.Value ?? null;
        string username = IPAddress.IsLoopback(ctx.Request.RemoteEndPoint.Address) ? "loopback" : Auth.GetUsername(sessionId);

        string[] accessArray = Auth.rbac.TryGetValue(username, out Auth.AccessControl accessControl) && accessControl is not null ? accessControl.authorization : new string[] { "*" };

        Entry keepAliveEntry = new Entry{
            ws          = ws,
            ctx         = ctx,
            sessionId   = sessionId,
            username    = username,
            mutex       = new Lock(),
            devicesView = new ConcurrentDictionary<string, int>(),
            usersView   = new ConcurrentDictionary<string, int>()
        };

        connections.TryAdd(ws, keepAliveEntry);

        byte[] buff = new byte[2048];

        try {
            //init
            ArraySegment<byte> initSegment = new(Encoding.UTF8.GetBytes($"{{\"action\":\"init\",\"version\":\"{Data.VersionToString()}\",\"username\":\"{username}\",\"color\":\"{accessControl?.color ?? "#606060"}\",\"authorization\":[\"{string.Join("\",\"", accessArray)}\"]}}"));
            await ws.SendAsync(initSegment, WebSocketMessageType.Text, true, CancellationToken.None);

            ArraySegment<byte> zonesSegment = new(Encoding.UTF8.GetBytes($"{{\"action\":\"zones\",\"list\":{Zones.ListZonesString()}}}"));
            await ws.SendAsync(zonesSegment, WebSocketMessageType.Text, true, CancellationToken.None);

            ArraySegment<byte> dhcpSegment = new(Encoding.UTF8.GetBytes($"{{\"action\":\"dhcp-range\",\"list\":{DhcpRange.ListRangeString()}}}"));
            await ws.SendAsync(dhcpSegment, WebSocketMessageType.Text, true, CancellationToken.None);

            StringBuilder messageBuilder = new StringBuilder();

            while (ws.State == WebSocketState.Open) {
                if (!Auth.IsAuthenticated(ctx)) {
                    lock(keepAliveEntry.mutex) {
                        ws.SendAsync(MSG_FORCE_RELOAD, WebSocketMessageType.Text, true, CancellationToken.None);
                        ws.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, null, CancellationToken.None);
                        return;
                    }
                }

                WebSocketReceiveResult receive = await ws.ReceiveAsync(new ArraySegment<byte>(buff), CancellationToken.None);

                if (receive.MessageType == WebSocketMessageType.Close) {
                    await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, null, CancellationToken.None);
                    break;
                }

                messageBuilder.Append(Encoding.Default.GetString(buff, 0, receive.Count));

                if (receive.EndOfMessage) {
                    HandleMessage(messageBuilder.ToString(), ctx, keepAliveEntry, username);
                    messageBuilder.Clear();
                }
            }
        }
        catch (WebSocketException ex) when (ex.WebSocketErrorCode == WebSocketError.ConnectionClosedPrematurely) {
            return;
        }
        catch (WebSocketException ex) when (ex.WebSocketErrorCode != WebSocketError.ConnectionClosedPrematurely) {
            //do nothing
        }
        catch (Exception ex) {
            Logger.Error(ex);
        }
        finally {

            foreach (KeyValuePair<WebSocket, Entry> pair in connections) {
                
            }

            connections.Remove(ws, out _);
        }

        if (ws.State == WebSocketState.Open) {
            try {
                await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, CancellationToken.None);
            }
#if DEBUG
            catch (Exception ex) {
                Logger.Error(ex);
            }
#else
            catch { }
#endif
        }
    }

    internal static async Task CloseConnection(string sessionId) {
        foreach (KeyValuePair<WebSocket, Entry> pair in connections) {
            if (pair.Value.sessionId != sessionId) continue;

            if (pair.Value.ws.State == WebSocketState.Open) {
                lock(pair.Value.mutex) {
                    pair.Value.ws.SendAsync(MSG_FORCE_RELOAD, WebSocketMessageType.Text, true, CancellationToken.None);
                }
                await pair.Value.ws.CloseAsync(WebSocketCloseStatus.NormalClosure, null, CancellationToken.None);
                pair.Value.ws?.Dispose();
            }

            connections.TryRemove(pair.Key, out _);
            return;
        }
    }

    internal static void Broadcast(string message, string accessPath, bool includeOrigin = true, string origin=null) {
        Broadcast(Encoding.UTF8.GetBytes(message), accessPath, includeOrigin, origin);
    }
    internal static void Broadcast(byte[] message, string accessPath, bool includeOrigin = true, string origin = null) {
        List<WebSocket> remove = new List<WebSocket>();

        foreach (Entry entry in connections.Values) {
            if (!includeOrigin && entry.username == origin) continue;

            bool isAuthorized = Auth.IsAuthorized(entry.ctx, accessPath);
            if (!isAuthorized) continue;

            if (entry.ws.State == WebSocketState.Open) {
                new Thread(() => {
                    try {
                        lock (entry.mutex) {
                            entry.ws.SendAsync(new ArraySegment<byte>(message), WebSocketMessageType.Text, true, CancellationToken.None);
                        }
                    }
#if DEBUG
                    catch (Exception ex) {
                        Logger.Error(ex);
                    }
#else
                    catch { }
#endif
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

    internal static void Unicast(string username, string message, string accessPath) {
        Unicast(username, Encoding.UTF8.GetBytes(message), accessPath);
    }
    internal static void Unicast(string username, byte[] message, string accessPath) {
        foreach (Entry entry in connections.Values) {
            if (entry.username != username) continue;
            if (!Auth.IsAuthorized(entry.ctx, accessPath)) continue;

            if (entry.ws.State == WebSocketState.Open) {
                new Thread(() => {
                    try {
                        lock (entry.mutex) {
                            entry.ws.SendAsync(new ArraySegment<byte>(message), WebSocketMessageType.Text, true, CancellationToken.None);
                        }
                    }
#if DEBUG
                    catch (Exception ex) {
                        Logger.Error(ex);
                    }
#else
                catch { }
#endif
                }).Start();
            }
        }
    }

    internal static void Unicast(Auth.Session session, string message, string accessPath) {
        Unicast(session, Encoding.UTF8.GetBytes(message), accessPath);
    }
    internal static void Unicast(Auth.Session session, byte[] message, string accessPath) {
        foreach (Entry entry in connections.Values) {
            if (entry.sessionId != session.sessionId) continue;
            if (!Auth.IsAuthorized(entry.ctx, accessPath)) continue;

            if (entry.ws.State == WebSocketState.Open) {
                new Thread(()=> {
                    try {
                        lock (entry.mutex) {
                            entry.ws.SendAsync(new ArraySegment<byte>(message), WebSocketMessageType.Text, true, CancellationToken.None);
                        }
                    }
#if DEBUG
                    catch (Exception ex) {
                        Logger.Error(ex);
                    }
#else
                catch { }
#endif
                }).Start();
            }
        }
    }

    private static void HandleMessage(string message, HttpListenerContext ctx, Entry keepAliveEntry, string origin) {
        ConcurrentDictionary<string, string> dictionary;
        try {
            dictionary = JsonSerializer.Deserialize<ConcurrentDictionary<string, string>>(message, messageSerializerOptions);
        }
        catch {
            return;
        }

        if (dictionary.IsEmpty) return;
        if (!dictionary.TryGetValue("type", out string type)) return;

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

        case "chat-sdp-offer":
            if (Auth.IsAuthorized(ctx, "/chat/write")) {
                Chat.SdpHandler(dictionary, origin);
            }
            return;

        case "chat-sdp-answer":
            if (Auth.IsAuthorized(ctx, "/chat/write")) {
                Chat.SdpHandler(dictionary, origin);
            }
            return;

        case "chat-join":
            if (Auth.IsAuthorized(ctx, "/chat/write")) {
                Chat.JoinHandler(origin);
            }
            return;

        case "chat-stream":
            if (Auth.IsAuthorized(ctx, "/chat/write")) {
                Chat.StreamHandler(dictionary, origin);
            }
            return;

        case "chat-ice":
            if (Auth.IsAuthorized(ctx, "/chat/write")) {
                Chat.IceHandler(dictionary, origin);
            }
            return;

        case "view-device-action": {
            if (!dictionary.TryGetValue("action", out string action) || String.IsNullOrEmpty(action)) return;
            if (!dictionary.TryGetValue("file", out string file) || String.IsNullOrEmpty(file)) return;

            if (action == "open") {
                int value = keepAliveEntry.devicesView.AddOrUpdate(file, 1, (_, count) => Interlocked.Increment(ref count));
                if (value > 0) {
                    HandleViewDeviceAction(origin, action, file);
                }
            }
            else if (action == "close") {
                int value = keepAliveEntry.devicesView.AddOrUpdate(file, 0, (_, count) => Interlocked.Decrement(ref count));
                if (value == 0) {
                    keepAliveEntry.devicesView.Remove(file, out _);
                    HandleViewDeviceAction(origin, action, file);
                }
            }

            return;
        }

        case "view-user-action": {
            if (!dictionary.TryGetValue("action", out string action) || String.IsNullOrEmpty(action)) return;
            if (!dictionary.TryGetValue("file", out string file) || String.IsNullOrEmpty(file)) return;

            if (action == "open") {
                int value = keepAliveEntry.usersView.AddOrUpdate(file, 1, (_, count) => Interlocked.Increment(ref count));
                if (value > 0) {
                    HandleViewUserAction(origin, action, file);
                }
            }
            else if (action == "close") {
                int value = keepAliveEntry.usersView.AddOrUpdate(file, 0, (_, count) => Interlocked.Decrement(ref count));
                if (value == 0) {
                    keepAliveEntry.usersView.Remove(file, out _);
                    HandleViewUserAction(origin, action, file);
                }
            }

            return;
        }

        default:
            Logger.Error($"Unhandle keep-alive message case: {type}");
            return;
        }
    }

    private static void HandleViewDeviceAction(string username, string action, string file) {
        byte[] message = JsonSerializer.SerializeToUtf8Bytes(new {
            action   = $"view-device-{action}",
            file     = file,
            username = username,
            color    = Auth.rbac.TryGetValue(username, out Auth.AccessControl rbac) ? rbac.color : "#606060",
            alias    = rbac is not null && !String.IsNullOrEmpty(rbac.alias) ? rbac.alias : username,
        });

        foreach (Entry entry in connections.Values
            .Where(o => !String.Equals(o.username, username))
            .DistinctBy(o => o.username)) {

            if (!entry.devicesView.TryGetValue(file, out int counter)) continue;

            Unicast(entry.username, message, "/global");

            byte[] reverse = JsonSerializer.SerializeToUtf8Bytes(new {
                action   = $"view-device-{action}",
                file     = file,
                username = entry.username,
                color    = Auth.rbac.TryGetValue(entry.username, out Auth.AccessControl rrbac) ? rrbac.color : "#606060",
                alias    = rrbac is not null && !String.IsNullOrEmpty(rrbac.alias) ? rrbac.alias : username,
            });
            Unicast(username, reverse, "/global");
        }
    }

    private static void HandleViewUserAction(string username, string action, string file) {
        byte[] message = JsonSerializer.SerializeToUtf8Bytes(new {
            action   = $"view-user-{action}",
            file     = file,
            username = username,
            color    = Auth.rbac.TryGetValue(username, out Auth.AccessControl rbac) ? rbac.color : "#606060",
            alias    = rbac is not null && !String.IsNullOrEmpty(rbac.alias) ? rbac.alias : username,
        });

        foreach (Entry entry in connections.Values
            .Where(o => !String.Equals(o.username, username))
            .DistinctBy(o => o.username)) {

            if (!entry.devicesView.TryGetValue(file, out int counter)) continue;

            Unicast(entry.username, message, "/global");

            byte[] reverse = JsonSerializer.SerializeToUtf8Bytes(new {
                action   = $"view-user-{action}",
                file     = file,
                username = entry.username,
                color    = Auth.rbac.TryGetValue(entry.username, out Auth.AccessControl rrbac) ? rrbac.color : "#606060",
                alias    = rrbac is null ? rrbac.alias : username,
            });
            Unicast(username, reverse, "/global");
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

                if (reader.TokenType == JsonTokenType.Number) {
                    string value = reader.GetInt64().ToString();
                    dictionary.TryAdd(key, value);
                }
                else if (reader.TokenType == JsonTokenType.String) {
                    string value = reader.GetString();
                    dictionary.TryAdd(key, value);
                }

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
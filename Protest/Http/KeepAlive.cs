using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Net;
using System.Net.WebSockets;
using System.Text;
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
        string username = IPAddress.IsLoopback(ctx.Request.RemoteEndPoint.Address) ? "loopback" : Auth.GetUsername(sessionId);

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
            ArraySegment<byte> initSegment = new(Encoding.UTF8.GetBytes($"{{\"action\":\"init\",\"version\":\"{Data.VersionToString()}\",\"username\":\"{username}\",\"authorization\":[\"{string.Join("\",\"", accessArray)}\"]}}"));
            await ws.SendAsync(initSegment, WebSocketMessageType.Text, true, CancellationToken.None);

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

                string msg = Encoding.Default.GetString(buff, 0, receive.Count);

                //await ws.SendAsync(Strings.CODE_ACK, WebSocketMessageType.Text, true, CancellationToken.None);
            }

        }
        catch (WebSocketException ex) {
            ctx.Response.Close();
            Logger.Error(ex);
        }

        connections.Remove(ws, out _);
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

}
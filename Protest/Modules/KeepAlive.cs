using System.Linq;
using System.Net;
using System.Net.WebSockets;
using System;
using System.Threading;
using System.Text;
using System.Collections;
using System.Collections.Generic;

public static class KeepAlive {
    public static ArraySegment<byte> MSG_FORCE_RELOAD = new ArraySegment<byte>(Encoding.UTF8.GetBytes($"{{\"action\":\"forcereload\"}}"));

    private static readonly Hashtable connections = Hashtable.Synchronized(new Hashtable());

    private struct AliveEntry {
        public WebSocket ws;
        public string session;
        public string username;
        public object syncLock;
    }

    public static async void Connect(HttpListenerContext ctx) {
        WebSocketContext wsc;
        WebSocket ws;

        try {
            wsc = await ctx.AcceptWebSocketAsync(null);
            ws = wsc.WebSocket;
        } catch (WebSocketException ex) {
            ctx.Response.Close();
            Logging.Err(ex);
            return;
        }

        string sessionId = ctx.Request.Cookies["sessionid"]?.Value ?? null;

        if (sessionId is null) {
            ctx.Response.Close();
            return;
        }

        if (!Session.sessions.ContainsKey(sessionId)) {
            ctx.Response.Close();
            return;
        }

        Session.SessionEntry sessionEntry =  Session.sessions[sessionId];

        try {
            if (ws.State == WebSocketState.Open)
                connections.Add(ws, new AliveEntry() {
                    ws = ws,
                    session = sessionId,
                    username = sessionEntry.username,
                    syncLock = new object()
                });
                        
            byte[] authorization = Encoding.UTF8.GetBytes(
                $"{{\"action\":\"authorization\",\"accesslist\":\"{sessionEntry.accessControl}\"}}"
            );
            await ws.SendAsync(new ArraySegment<byte>(authorization, 0, authorization.Length), WebSocketMessageType.Text, true, CancellationToken.None);

            byte[] version = Encoding.UTF8.GetBytes(
                $"{{\"action\":\"version\",\"userver\":\"{Database.usersVer}\",\"equipver\":\"{Database.equipVer}\"}}"
            );
            await ws.SendAsync(new ArraySegment<byte>(version, 0, version.Length), WebSocketMessageType.Text, true, CancellationToken.None);

            while (ws.State == WebSocketState.Open) {
                byte[] buff = new byte[1024];
                WebSocketReceiveResult receiveResult = await ws.ReceiveAsync(new ArraySegment<byte>(buff), CancellationToken.None);

                if (!Session.CheckAccess(sessionId)) { //check session
                    await ws.SendAsync(MSG_FORCE_RELOAD, WebSocketMessageType.Text, true, CancellationToken.None);
                    ctx.Response.Close();
                    return;
                }

                if (receiveResult.MessageType == WebSocketMessageType.Close) {
                    await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None);
                    break;
                }

                string[] action = Encoding.Default.GetString(buff, 0, receiveResult.Count).Split((char)127);
                if (action.Length > 1)
                    switch (action[0]) {
                        case "updatesessiontimeout":
                            Session.UpdateSessionTimeout(sessionId, action?[1]);
                            if (!Session.CheckAccess(sessionId)) { //check session
                                await ws.SendAsync(MSG_FORCE_RELOAD, WebSocketMessageType.Text, true, CancellationToken.None);
                                ctx.Response.Close();
                                return;
                            }
                            break;
                    }
            }

        } catch { }

        //connections.Remove(ws);
    }

    public static void Broadcast(string message) {
        Broadcast(Encoding.UTF8.GetBytes(message));
    }

    public static void Broadcast(byte[] message) {
        List<WebSocket> remove = new List<WebSocket>();

        foreach (DictionaryEntry e in connections) { 
            AliveEntry entry = (AliveEntry)e.Value;

            if (!Session.acl.ContainsKey(entry.username)) {
                remove.Add(entry.ws);
                continue;
            }

            AccessControl ac = Session.acl[entry.username];

            if (ac is null ||
                ac.database == AccessControl.AccessLevel.Deny ||
                ac.log == AccessControl.AccessLevel.Deny) //broadcast only to authorized users 
                continue;

            if (entry.ws.State == WebSocketState.Open)
                new Thread(() => {
                    try {
                        lock(entry.syncLock)
                            entry.ws.SendAsync(new ArraySegment<byte>(message, 0, message.Length), WebSocketMessageType.Text, true, CancellationToken.None);
                    } catch {}
                }).Start();

            else
                remove.Add(entry.ws);
        }

        for (int i = 0; i < remove.Count; i++)
            connections.Remove(remove[i]);
    }

    ///<summary>Destroys alive websocket connections with the sessionId</summary>
    public static bool SearchAndDestroy(string sessionId) {
        if (sessionId is null) return false;

        List<WebSocket> remove = new List<WebSocket>();
        foreach (DictionaryEntry e in connections) {
            AliveEntry entry = (AliveEntry)e.Value;
            if (entry.session == sessionId) {
                remove.Add(entry.ws);
                if (entry.ws.State == WebSocketState.Open) {
                    try {
                        entry.ws.SendAsync(MSG_FORCE_RELOAD, WebSocketMessageType.Text, true, CancellationToken.None);
                    } catch { }
                    try {
                        entry.ws.Abort();
                    } catch { }
                }
            }
        }

        for (int i = 0; i < remove.Count; i++)
            connections.Remove(remove[i]);
        remove.Clear();

        return true;
    }
}
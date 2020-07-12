#define KA_LOGGING

using System.Linq;
using System.Net;
using System.Net.WebSockets;
using System;
using System.Threading;
using System.Text;
using System.Collections;
using System.Collections.Generic;

public static class KeepAlive {

    private static Hashtable connections = Hashtable.Synchronized(new Hashtable());

    private struct AliveEntry {
        public WebSocket ws;
        public string session;
        public object syncLock;
    }

    public static async void Connect(HttpListenerContext ctx, string remoteIp) {
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

        try {
            if (ws.State == WebSocketState.Open) {
                connections.Add(ws, new AliveEntry() {
                    ws = ws,
                    session = sessionId,
                    syncLock = new object()
                });
#if KA_LOGGING
                Console.WriteLine($"connected: {remoteIp}");
#endif
            }

            byte[] version = Encoding.UTF8.GetBytes(
                $"{{\"action\":\"version\",\"userver\":\"{Database.usersVer}\",\"equipver\":\"{Database.equipVer}\"}}"
            );
            await ws.SendAsync(new ArraySegment<byte>(version, 0, version.Length), WebSocketMessageType.Text, true, CancellationToken.None);

            while (ws.State == WebSocketState.Open) {
                byte[] buff = new byte[1024]; //<-
                WebSocketReceiveResult receiveResult = await ws.ReceiveAsync(new ArraySegment<byte>(buff), CancellationToken.None);

                if (!Session.CheckAccess(sessionId, remoteIp)) { //check session
                    ctx.Response.Close();
                    return;
                }

                if (receiveResult.MessageType == WebSocketMessageType.Close) {
#if KA_LOGGING
                    Console.WriteLine($"closed: {remoteIp}");
#endif
                    await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None);
                    break;
                }

                string[] msg = Encoding.Default.GetString(buff, 0, receiveResult.Count).Split(':');

                //TODO:
            }

        } catch (Exception ex) {
            Logging.Err(ex);
        }
    }


    public static void Broadcast(string message) {
        Broadcast(Encoding.UTF8.GetBytes(message));
    }

    public static void Broadcast(byte[] message) {
#if KA_LOGGING
        Console.WriteLine($"broadcasting");
#endif
        List<WebSocket> remove = new List<WebSocket>();

        foreach (DictionaryEntry e in connections) { 
            AliveEntry entry = (AliveEntry)e.Value;

            if (entry.ws.State == WebSocketState.Open) {

                new Thread(() => {
                    try {
                        lock(entry.syncLock) {
                            entry.ws.SendAsync(new ArraySegment<byte>(message, 0, message.Length), WebSocketMessageType.Text, true, CancellationToken.None);
                        }
                    } catch {}
                }).Start();

            } else {
                remove.Add(entry.ws);
            }
        }

        for (int i = 0; i < remove.Count; i++)
            connections.Remove(remove[i]);
    }

}
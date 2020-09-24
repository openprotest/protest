using System;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Text;
using System.Threading;

public static class Telnet {

    private static async void WsWriteText(WebSocket ws, string text) {
        if (ws.State == WebSocketState.Open)
            await ws.SendAsync(new ArraySegment<byte>(Encoding.ASCII.GetBytes(text), 0, text.Length), WebSocketMessageType.Text, true, CancellationToken.None);
    }

    public static async void WsTelnet(HttpListenerContext ctx, string remoteIp) {

        string performer = Session.GetUsername(ctx.Request.Cookies["sessionid"]?.Value);
        Logging.Action(performer, "telnet");

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

        Thread wsToServer = null;

        try {
            byte[] targetBuff = new byte[1024];
            WebSocketReceiveResult targetResult = await ws.ReceiveAsync(new ArraySegment<byte>(targetBuff), CancellationToken.None);
            string target = Encoding.Default.GetString(targetBuff, 0, targetResult.Count);

            string[] split = target.Split(':');
            string host = split[0];
            int port = 23;

            if (split.Length > 1)
                int.TryParse(split[1], out port);

            TcpClient telnet;
            try {
                telnet = new TcpClient(host, port);
            } catch (Exception ex){
                WsWriteText(ws, ex.Message);
                await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None);
                return;
            }

            //WsWriteText(ws, $"connected to {host}:{port}\n\r");

            NetworkStream stream = telnet.GetStream();

            wsToServer = new Thread(async () => {
                Thread.Sleep(500);
                while (ws.State == WebSocketState.Open) { //ws to server loop

                    byte[] buff = new byte[2048];
                    WebSocketReceiveResult receiveResult = null;
                    try {
                        receiveResult = await ws.ReceiveAsync(new ArraySegment<byte>(buff), CancellationToken.None);

                        if (receiveResult.MessageType == WebSocketMessageType.Close) {
                            await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None);
                            telnet.Close();
                            break;
                        }
                    } catch { }

                    if (!Session.CheckAccess(sessionId, remoteIp)) { //check session
                        ctx.Response.Close();
                        telnet.Close();
                        return;
                    }

                    try {
                        for (int i = 0; i < receiveResult?.Count; i++)
                            stream.Write(buff, i, 1);
                        stream.Write(new byte[] { 13 }, 0, 1); //return
                    } catch { }
                }
            });

            wsToServer.Start();

            while (ws.State == WebSocketState.Open) { //server to ws loop
                byte[] data = new byte[2048];

                int bytes = stream.Read(data, 0, data.Length);

                string responseData = Encoding.ASCII.GetString(data, 0, bytes);

                if (!Session.CheckAccess(sessionId, remoteIp)) { //check session
                    ctx.Response.Close();
                    telnet.Close();
                    return;
                }

                try {
                    WsWriteText(ws, responseData);
                } catch { }

            }

        } catch (Exception ex) {
            Logging.Err(ex);
        
        } finally {
            try {
                await ws?.CloseAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None);
            } catch { }
            try {
                wsToServer?.Abort();
            } catch { }
        }
    }


}
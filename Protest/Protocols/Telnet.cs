using System.Net.Sockets;
using System.Net.WebSockets;
using System.Net;
using System.Text;
using System.Threading;
using Protest.Http;

namespace Protest.Protocols;

internal static class Telnet {
    private static async void WsWriteText(WebSocket ws, string text) {
        if (ws.State == WebSocketState.Open)
            await ws.SendAsync(new ArraySegment<byte>(Encoding.ASCII.GetBytes(text), 0, text.Length), WebSocketMessageType.Text, true, CancellationToken.None);
    }

    public static async void WebSocketHandler(HttpListenerContext ctx) {
        WebSocketContext wsc;
        WebSocket ws;
        try {
            wsc = await ctx.AcceptWebSocketAsync(null);
            ws = wsc.WebSocket;
        }
        catch (WebSocketException ex) {
            ctx.Response.Close();
            Logger.Error(ex);
            return;
        }

        if (!Auth.IsAuthenticatedAndAuthorized(ctx, ctx.Request.Url.AbsolutePath)) {
            await ws.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, null, CancellationToken.None);
            return;
        }

        string sessionId = ctx.Request.Cookies["sessionid"]?.Value ?? null;

//#if DEBUG
        string username = IPAddress.IsLoopback(ctx.Request.RemoteEndPoint.Address) ? "loopback" : Auth.GetUsername(sessionId);
//#else
//        string username = Auth.GetUsername(sessionId);
//#endif

        Thread wsToServer = null;

        try {
            byte[] targetBuff = new byte[1024];
            WebSocketReceiveResult targetResult = await ws.ReceiveAsync(new ArraySegment<byte>(targetBuff), CancellationToken.None);
            string target = Encoding.Default.GetString(targetBuff, 0, targetResult.Count);

            string[] split = target.Split(':');
            string host = split[0];
            int port = 23;

            if (split.Length > 1) {
                _ = int.TryParse(split[1], out port);
            }

            TcpClient telnet;
            try {
                telnet = new TcpClient(host, port);
            }
            catch (Exception ex) {
                WsWriteText(ws, ex.Message);
                await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None);
                return;
            }

            Logger.Action(username, $"Establish telnet connection to {host}:{port}");

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
                    }
                    catch { }

                    if (!Auth.IsAuthenticatedAndAuthorized(ctx, "/ws/telnet")) { //check session
                        ctx.Response.Close();
                        telnet.Close();
                        return;
                    }

                    try {
                        for (int i = 0; i < receiveResult?.Count; i++)
                            stream.Write(buff, i, 1);
                        stream.Write("\r"u8.ToArray(), 0, 1); //return
                    }
                    catch { }
                }
            });

            wsToServer.Start();

            while (ws.State == WebSocketState.Open) { //server to ws loop
                byte[] data = new byte[2048];


                int bytes = stream.Read(data, 0, data.Length);

                string responseData = Encoding.ASCII.GetString(data, 0, bytes);

                if (!Auth.IsAuthenticatedAndAuthorized(ctx, "/ws/telnet")) { //check session
                    ctx.Response.Close();
                    telnet.Close();
                    return;
                }

                try {
                    WsWriteText(ws, responseData);
                }
                catch { }

            }

        }
        catch (WebSocketException ex) when (ex.WebSocketErrorCode == WebSocketError.ConnectionClosedPrematurely) {
            return;
        }
        catch (WebSocketException ex) when (ex.WebSocketErrorCode != WebSocketError.ConnectionClosedPrematurely) {
            Logger.Error(ex);
        }
        catch (Exception ex) {
            Logger.Error(ex);

        }
        finally {
            try {
                await ws?.CloseAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None);
            }
            catch { }
            try {
                //TODO:
                //wsToServer?.Abort();
            }
            catch { }
        }
    }
}
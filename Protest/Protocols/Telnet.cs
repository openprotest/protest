using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Protest.Http;

namespace Protest.Protocols;

internal static class Telnet {

    private static async Task WsWriteText(WebSocket ws, string data) {
        if (ws.State == WebSocketState.Open) {
            await ws.SendAsync(new ArraySegment<byte>(Encoding.ASCII.GetBytes(data), 0, data.Length), WebSocketMessageType.Text, true, CancellationToken.None);
        }
    }
    private static async Task WsWriteText(WebSocket ws, byte[] data) {
        if (ws.State == WebSocketState.Open) {
            await ws.SendAsync(new ArraySegment<byte>(data, 0, data.Length), WebSocketMessageType.Text, true, CancellationToken.None);
        }
    }

    public static async void WebSocketHandler2(HttpListenerContext ctx) {
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
        string username = IPAddress.IsLoopback(ctx.Request.RemoteEndPoint.Address) ? "loopback" : Auth.GetUsername(sessionId);

        try {
            byte[] wsBuffer = new byte[2048];
            WebSocketReceiveResult targetResult = await ws.ReceiveAsync(new ArraySegment<byte>(wsBuffer), CancellationToken.None);
            string target = Encoding.Default.GetString(wsBuffer, 0, targetResult.Count);

            string[] split = target.Split(':');
            string host = split[0];
            int port = 23;

            if (split.Length > 1) {
                _ = int.TryParse(split[1], out port);
            }

            TcpClient telnet = new TcpClient(host, port);
            NetworkStream stream = telnet.GetStream();

            Logger.Action(username, $"Establish telnet connection to {host}:{port}");

            Task daemon = new Task(async ()=>{
                while (ws.State == WebSocketState.Open && telnet.Connected) { //host read loop
                    byte[] buffer = new byte[2048];
                    string responseData;
                    try {
                        int bytes = stream.Read(buffer, 0, buffer.Length);
                        responseData = Encoding.UTF8.GetString(buffer, 0, bytes);
                        Console.Write(responseData);
                    }
                    catch (System.IO.IOException) {
                        return;
                    }
                    catch {
                        return;
                    }

                    if (!Auth.IsAuthenticatedAndAuthorized(ctx, "/ws/telnet")) { //check session
                        ctx.Response.Close();
                        telnet.Close();
                        return;
                    }

                    try {
                        await WsWriteText(ws, responseData);
                    }
                    catch { }
                }
            });
            daemon.Start();

            while (ws.State == WebSocketState.Open && telnet.Connected) { //host write loop
                byte[] buff = new byte[2048];

                WebSocketReceiveResult receiveResult = await ws.ReceiveAsync(new ArraySegment<byte>(buff), CancellationToken.None);

                if (receiveResult.MessageType == WebSocketMessageType.Close) {
                    await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, CancellationToken.None);
                    telnet.Close();
                    break;
                }

                if (!Auth.IsAuthenticatedAndAuthorized(ctx, "/ws/telnet")) { //check session
                    ctx.Response.Close();
                    telnet.Close();
                    return;
                }

                for (int i = 0; i < receiveResult?.Count; i++) {
                    stream.Write(buff, i, 1);
                }
            }

        }
        catch (SocketException ex) {
            await WsWriteText(ws, ex.Message.ToString());
            await WsWriteText(ws, "\r\n");
            await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, CancellationToken.None);
            return;
        }
        catch (Exception ex) {
            Logger.Error(ex);
        }
        finally {
            //TODO: cleanup
        }

        if (ws.State == WebSocketState.Open) {
            try {
                await ws?.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, CancellationToken.None);
            }
            catch { }
        }
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
                await WsWriteText(ws, ex.Message);
                await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, CancellationToken.None);
                return;
            }

            Logger.Action(username, $"Establish telnet connection to {host}:{port}");

            //WsWriteText(ws, $"connected to {host}:{port}\n\r");

            NetworkStream stream = telnet.GetStream();

            wsToServer = new Thread(async () => {
                while (ws.State == WebSocketState.Open) { //ws to server loop

                    byte[] buff = new byte[2048];
                    WebSocketReceiveResult receiveResult = null!;
                    try {
                        receiveResult = await ws.ReceiveAsync(new ArraySegment<byte>(buff), CancellationToken.None);

                        if (receiveResult.MessageType == WebSocketMessageType.Close) {
                            await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, CancellationToken.None);
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
                    await WsWriteText(ws, responseData);

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
           //wsToServer?.Abort();
        }
        if (ws.State == WebSocketState.Open) {
            try {
                await ws?.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, CancellationToken.None);
            }
            catch { }
        }
    }
}
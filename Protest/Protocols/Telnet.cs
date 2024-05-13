using Protest.Http;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Runtime.Intrinsics.X86;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

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

            await WsWriteText(ws, "{\"connected\":true}"u8.ToArray());

            Thread fork = new Thread(()=>{
                HandleDownstream(ctx, ws, telnet, stream);
            });
            fork.Start();

            byte[] buff = new byte[2048];
            while (ws.State == WebSocketState.Open && telnet.Connected) { //handle upstream
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
                stream.Write(buff, 0, buff.Length);
            }

        }
        catch (SocketException ex) {
            await WsWriteText(ws, $"{{\"error\":\"{ex.Message}\"}}");
            await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, CancellationToken.None);
            Logger.Error(ex);
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

    private static async void HandleDownstream(HttpListenerContext ctx, WebSocket ws, TcpClient telnet, Stream stream) {
        byte[] data = new byte[2048];

        while (ws.State == WebSocketState.Open && telnet.Connected) {
            try {
                int count = stream.Read(data, 0, data.Length);

                if (count == 0) { // Remote host has closed the connection
                    if (ws.State == WebSocketState.Open) {
                        try {
                            await ws?.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, CancellationToken.None);
                        }
                        catch { }
                    }
                    return;
                }

                if (count == 1 && data[0] == 0) { //keep alive
                    continue;
                }

                for (int i = 0; i < count; i++) {
                    if (data[i] < 128)
                        continue;
                    data[i] = 63; //?
                }

                await ws.SendAsync(new ArraySegment<byte>(data, 0, count), WebSocketMessageType.Text, true, CancellationToken.None);

                string dataString = Encoding.ASCII.GetString(data, 0, count);
                Console.Write(dataString);
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
        }
    }
}
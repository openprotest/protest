using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Threading;
using System.Threading.Tasks;
using Protest.Http;

namespace Protest.Protocols;

//In-browser VNC (noVNC). The client speaks the RFB protocol directly against a
//<canvas>; this handler is a pure binary TCP<->WebSocket relay (websockify-style).
//No text framing is added to the socket, otherwise the RFB handshake breaks.
internal static class Vnc {

    private const int DEFAULT_PORT = 5900;

    public static async Task WebSocketHandler(HttpListenerContext ctx) {
        if (!Auth.IsAuthenticatedAndAuthorized(ctx, ctx.Request.Url.AbsolutePath)) {
            ctx.Response.Close();
            return;
        }

        string target = ctx.Request.QueryString["target"];
        if (string.IsNullOrEmpty(target)) {
            ctx.Response.StatusCode = 400;
            ctx.Response.Close();
            return;
        }

        string[] split = target.Split(':');
        string host = split[0];
        int port = split.Length > 1 && int.TryParse(split[1], out int p) ? p : DEFAULT_PORT;

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

        string sessionId = ctx.Request.Cookies["sessionid"]?.Value;
        string origin = IPAddress.IsLoopback(ctx.Request.RemoteEndPoint.Address) ? "loopback" : Auth.GetUsername(sessionId);

        TcpClient tcp = new TcpClient();

        try {
            await tcp.ConnectAsync(host, port);

            Logger.Action(origin, "Remote-access", $"Establish VNC connection to {host}:{port}");

            NetworkStream stream = tcp.GetStream();

            using CancellationTokenSource cts = new CancellationTokenSource();

            Task upstream   = PumpToTcp(ctx, ws, stream, cts);
            Task downstream = PumpToWs(ws, stream, cts);

            await Task.WhenAny(upstream, downstream);
            cts.Cancel();
        }
        catch (SocketException ex) {
            Logger.Debug(ex);
        }
        catch (Exception ex) {
            Logger.Error(ex);
        }
        finally {
            tcp.Close();
            if (ws.State == WebSocketState.Open) {
                try {
                    await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, string.Empty, CancellationToken.None);
                }
                catch (Exception ex) {
                    Logger.Debug(ex);
                }
            }
        }
    }

    private static async Task PumpToTcp(HttpListenerContext ctx, WebSocket ws, NetworkStream stream, CancellationTokenSource cts) {
        try {
            while (ws.State == WebSocketState.Open && !cts.IsCancelled()) {

                byte[] message = await WebSocketHelper.WsReadBinary(ws, cts.Token);
                if (message is null) {
                    return; //close frame received
                }

                if (!Auth.IsAuthenticatedAndAuthorized(ctx, "/ws/vnc")) {
                    return;
                }

                await stream.WriteAsync(message, cts.Token);
                await stream.FlushAsync(cts.Token);
            }
        }
        catch (OperationCanceledException) { }
        catch (WebSocketException) { }
        catch (IOException) { }
        finally {
            cts.Cancel();
        }
    }

    private static async Task PumpToWs(WebSocket ws, NetworkStream stream, CancellationTokenSource cts) {
        byte[] buffer = new byte[8192];

        try {
            while (ws.State == WebSocketState.Open && !cts.IsCancelled()) {
                int count = await stream.ReadAsync(buffer, cts.Token);
                if (count == 0) return; //remote host closed the connection

                await ws.SendAsync(new ArraySegment<byte>(buffer, 0, count), WebSocketMessageType.Binary, true, cts.Token);
            }
        }
        catch (OperationCanceledException) { }
        catch (WebSocketException) { }
        catch (IOException) { }
        finally {
            cts.Cancel();
        }
    }

    private static bool IsCancelled(this CancellationTokenSource cts) => cts.Token.IsCancellationRequested;
}

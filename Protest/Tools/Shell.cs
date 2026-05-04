using System.IO;
using System.Net;
using System.Net.WebSockets;
using System.Threading;
using System.Threading.Tasks;
using Protest.Http;

namespace Protest.Tools;

internal static partial class Shell {
    private const int DEFAULT_COLS = 120;
    private const int DEFAULT_ROWS = 30;

    public static async Task WebSocketHandler(HttpListenerContext ctx) {
        if (!Auth.IsAuthenticatedAndAuthorized(ctx, ctx.Request.Url.AbsolutePath)) {
            ctx.Response.Close();
            return;
        }

        WebSocket ws;
        try {
            HttpListenerWebSocketContext wsc = await ctx.AcceptWebSocketAsync(null);
            ws = wsc.WebSocket;
        }
        catch (Exception ex) {
            ctx.Response.Close();
            Logger.Error(ex);
            return;
        }

        if (ws is null) return;

        string sessionId = ctx.Request.Cookies["sessionid"]?.Value;
        string origin = IPAddress.IsLoopback(ctx.Request.RemoteEndPoint.Address) ? "loopback" : Auth.GetUsername(sessionId);

        try {
            byte[] handshakeBuf = new byte[512];
            WebSocketReceiveResult handshake = await ws.ReceiveAsync(handshakeBuf, CancellationToken.None);
            if (handshake.MessageType == WebSocketMessageType.Close) {
                await CloseWebSocket(ws);
                return;
            }
        }
        catch {
            return;
        }

        if (OperatingSystem.IsWindows()) {
            await RunWindowsAsync(ctx, ws, origin);
        }
        else if (OperatingSystem.IsLinux()) {
            await RunPosixAsync(ctx, ws, origin);
        }
        else if (OperatingSystem.IsMacOS()) {
            await RunPosixAsync(ctx, ws, origin);
        }
    }

    private static async Task PumpStreamToWebSocket(HttpListenerContext ctx, WebSocket ws, Stream stream, CancellationToken token) {
        byte[] buffer = new byte[4096];

        while (!token.IsCancellationRequested && ws.State == WebSocketState.Open) {
            int count = await stream.ReadAsync(buffer, token);
            if (count == 0) break;

            await ws.SendAsync(new ArraySegment<byte>(buffer, 0, count), WebSocketMessageType.Binary, true, token);
        }
    }

    private static async Task CloseWebSocket(WebSocket ws) {
        if (ws.State != WebSocketState.Open) return;

        try {
            await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None);
        }
        catch { }
    }
}
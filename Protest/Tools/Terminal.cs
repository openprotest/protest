using System.IO;
using System.Net;
using System.Net.WebSockets;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Protest.Http;
using Porta.Pty;

namespace Protest.Tools;

internal static partial class Terminal {
    internal const int DEFAULT_COLS = 120;
    internal const int DEFAULT_ROWS = 30;

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

    internal static async Task PumpStreamToWebSocket(HttpListenerContext ctx, WebSocket ws, Stream stream, CancellationToken token) {
        byte[] buffer = new byte[4096];

        while (!token.IsCancellationRequested && ws.State == WebSocketState.Open) {
            int count = await stream.ReadAsync(buffer, token);
            if (count == 0) break;

            await ws.SendAsync(new ArraySegment<byte>(buffer, 0, count), WebSocketMessageType.Text, true, token);
        }
    }

    internal static async Task RunPtyAsync(HttpListenerContext ctx, WebSocket ws, string origin, PtyOptions options, string wsPath, string logMessage) {
        using CancellationTokenSource cts = new();

        IPtyConnection pty;
        try {
            pty = await PtyProvider.SpawnAsync(options, CancellationToken.None);
        }
        catch (Exception ex) {
            await WebSocketHelper.WsWriteText(ws, $"{{\"error\":\"{Protest.Data.EscapeJsonText(ex.Message)}\"}}");
            await CloseWebSocket(ws);
            return;
        }

        using (pty) {
            pty.ProcessExited += (_, _) => {
                try {
                    cts.Cancel();
                }
                catch (ObjectDisposedException) { }
            };

            Logger.Action(origin, "Remote-access", logMessage);
            await WebSocketHelper.WsWriteText(ws, "{\"connected\":true}"u8.ToArray());

            Task readTask = PumpStreamToWebSocket(ctx, ws, pty.ReaderStream, cts.Token);
            Task writeTask = PumpWebSocketToPty(ctx, ws, pty, wsPath, cts.Token);

            await Task.WhenAny(readTask, writeTask);
            cts.Cancel();

            try {
                await Task.WhenAll(readTask, writeTask);
            }
            catch (OperationCanceledException) { }
            catch (WebSocketException) { }
            catch (ObjectDisposedException) { }

            try {
                pty.Kill();
            }
            catch { }
        }

        await CloseWebSocket(ws);
    }

    private static async Task PumpWebSocketToPty(HttpListenerContext ctx, WebSocket ws, IPtyConnection pty, string wsPath, CancellationToken token) {
        byte[] buffer = new byte[4096];

        while (!token.IsCancellationRequested && ws.State == WebSocketState.Open) {
            WebSocketReceiveResult result = await ws.ReceiveAsync(buffer, token);

            if (result.MessageType == WebSocketMessageType.Close) break;
            if (!Auth.IsAuthenticatedAndAuthorized(ctx, wsPath)) break;
            if (TryResizePty(buffer, result.Count, pty)) continue;

            await pty.WriterStream.WriteAsync(buffer.AsMemory(0, result.Count), token);
            await pty.WriterStream.FlushAsync(token);
        }
    }

    private static bool TryResizePty(byte[] buffer, int count, IPtyConnection pty) {
        if (count >= 100 || count == 0 || buffer[0] != '{') return false;

        try {
            using JsonDocument document = JsonDocument.Parse(System.Text.Encoding.UTF8.GetString(buffer, 0, count));
            JsonElement root = document.RootElement;

            if (!root.TryGetProperty("cols", out JsonElement cols) || !root.TryGetProperty("rows", out JsonElement rows)) {
                return false;
            }

            pty.Resize(Math.Max(1, cols.GetInt32()), Math.Max(1, rows.GetInt32()));
            return true;
        }
        catch {
            return false;
        }
    }

    internal static async Task CloseWebSocket(WebSocket ws) {
        if (ws.State != WebSocketState.Open) return;

        try {
            await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None);
        }
        catch { }
    }
}

using System.IO;
using System.Net;
using System.Net.WebSockets;
using System.Runtime.Versioning;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using Protest.Http;
using Porta.Pty;

namespace Protest.Tools;

internal static class WinRM {

    private static readonly Regex hostnamePattern = new Regex(@"^[A-Za-z0-9](?:[A-Za-z0-9\-\._]*[A-Za-z0-9])?$", RegexOptions.Compiled);

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

        string host;
        try {
            byte[] handshakeBuf = new byte[512];
            WebSocketReceiveResult handshake = await ws.ReceiveAsync(handshakeBuf, CancellationToken.None);
            if (handshake.MessageType == WebSocketMessageType.Close) {
                await Terminal.CloseWebSocket(ws);
                return;
            }

            host = Encoding.UTF8.GetString(handshakeBuf, 0, handshake.Count).Trim();
        }
        catch {
            return;
        }

        if (!hostnamePattern.IsMatch(host)) {
            await WebSocketHelper.WsWriteText(ws, "{\"error\":\"Invalid hostname\"}");
            await Terminal.CloseWebSocket(ws);
            return;
        }

        if (!OperatingSystem.IsWindows()) {
            await WebSocketHelper.WsWriteText(ws, "{\"error\":\"WinRM is available on Windows hosts only\"}");
            await Terminal.CloseWebSocket(ws);
            return;
        }

        if (OperatingSystem.IsWindows()) {
            await RunWindowsAsync(ctx, ws, origin, host);
        }
        else {
            await WebSocketHelper.WsWriteText(ws, "{\"error\":\"WinRM is available on Windows hosts only\"}");
            await Terminal.CloseWebSocket(ws);
        }
    }

    private const string EXIT_WHEN_SESSION_ENDS = "function prompt { if (-not $Host.IsRunspacePushed) { [Environment]::Exit(0) } }";

    [SupportedOSPlatform("windows")]
    private static Task RunWindowsAsync(HttpListenerContext ctx, WebSocket ws, string origin, string host) {
        string app = Path.Join(Environment.SystemDirectory, "WindowsPowerShell", "v1.0", "powershell.exe");

        PtyOptions options = new PtyOptions {
            App = app,
            CommandLine = new[] { "-NoLogo", "-NoProfile", "-NoExit", "-Command", $"{EXIT_WHEN_SESSION_ENDS}; Enter-PSSession -ComputerName {host}" },
            Cwd = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            Cols = Terminal.DEFAULT_COLS,
            Rows = Terminal.DEFAULT_ROWS
        };

        return Terminal.RunPtyAsync(ctx, ws, origin, options, "/ws/winrm", $"Open remote shell to {host}");
    }
}

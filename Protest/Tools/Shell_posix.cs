using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.WebSockets;
using System.Runtime.Versioning;
using System.Threading;
using System.Threading.Tasks;
using Protest.Http;
using Pty.Net;

namespace Protest.Tools;

internal static partial class Shell {

    [SupportedOSPlatform("linux")]
    [SupportedOSPlatform("macos")]
    private static async Task RunPosixAsync(HttpListenerContext ctx, WebSocket ws, string origin) {
        using CancellationTokenSource cts = new();

        PtyOptions options = BuildPtyOptions();

        IPtyConnection pty;
        try {
            pty = await PtyProvider.SpawnAsync(options, CancellationToken.None);
        }
        catch (Exception ex) {
            await WebSocketHelper.WsWriteText(ws, $"{{\"error\":\"{ex.Message}\"}}");
            await CloseWebSocket(ws);
            return;
        }

        Logger.Action(origin, "Remote-access", $"Open local shell ({options.App})");
        await WebSocketHelper.WsWriteText(ws, "{\"connected\":true}"u8.ToArray());

        _ = Task.Run(() => PumpStreamToWebSocket(ctx, ws, pty.ReaderStream, cts.Token));
        await PumpWebSocketToStream(ctx, ws, pty.WriterStream, cts.Token);

        try {
            pty.Kill();
        }
        catch { }

        pty.Dispose();

        await CloseWebSocket(ws);
    }

    [SupportedOSPlatform("linux")]
    [SupportedOSPlatform("macos")]
    private static PtyOptions BuildPtyOptions() {
        Dictionary<string, string> env = new Dictionary<string, string>();
        string app;
        string[] args;

        if (OperatingSystem.IsWindows()) {
            app = Environment.GetEnvironmentVariable("ComSpec") ?? "cmd.exe";
            args = Array.Empty<string>();
        }
        else {
            app = File.Exists("/bin/bash") ? "/bin/bash" : "/bin/sh";
            args = new[] { "-l" };
            env["TERM"] = "xterm-256color";
            env["LANG"] = Environment.GetEnvironmentVariable("LANG") ?? "en_US.UTF-8";
        }

        return new PtyOptions {
            App = app,
            CommandLine = args,
            Cwd = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            Cols = DEFAULT_COLS,
            Rows = DEFAULT_ROWS,
            Environment = env,
            Name = "xterm-256color"
        };
    }

    [SupportedOSPlatform("linux")]
    [SupportedOSPlatform("macos")]
    private static async Task PumpWebSocketToStream(HttpListenerContext ctx, WebSocket ws, Stream stream, CancellationToken token) {
        byte[] buffer = new byte[2048];

        while (ws.State == WebSocketState.Open) {
            WebSocketReceiveResult result = await ws.ReceiveAsync(buffer, token);

            if (result.MessageType == WebSocketMessageType.Close) break;
            if (!Auth.IsAuthenticatedAndAuthorized(ctx, "/ws/shell")) break;

            await stream.WriteAsync(buffer.AsMemory(0, result.Count), token);
            await stream.FlushAsync(token);
        }
    }

}
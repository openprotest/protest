using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.WebSockets;
using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using System.Threading;
using System.Threading.Tasks;
using Protest.Http;

using Microsoft.Win32.SafeHandles;
using Pty.Net;

namespace Protest.Tools;

internal static class Shell
{
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
        else {
            await RunPosixAsync(ctx, ws, origin);
        }
    }

    [UnsupportedOSPlatform("windows")]
    private static async Task RunPosixAsync(HttpListenerContext ctx, WebSocket ws, string origin) {
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

        _ = Task.Run(() => PumpStreamToWebSocket(ctx, ws, pty.ReaderStream));
        await PumpWebSocketToStream(ctx, ws, pty.WriterStream);

        try { pty.Kill(); } catch { }
        pty.Dispose();

        await CloseWebSocket(ws);
    }

    [SupportedOSPlatform("windows")]
    private static async Task RunWindowsAsync(HttpListenerContext ctx, WebSocket ws, string origin) {
        CreatePipe(out nint hInRead, out nint hInWrite);
        CreatePipe(out nint hOutRead, out nint hOutWrite);

        COORD size = new COORD { X = DEFAULT_COLS, Y = DEFAULT_ROWS };

        IntPtr hPC;
        int hr = CreatePseudoConsole(size, hInRead, hOutWrite, 0, out hPC);
        if (hr != 0) {
            await WebSocketHelper.WsWriteText(ws, "{\"error\":\"ConPTY failed\"}");
            await CloseWebSocket(ws);
            return;
        }

        Process process = StartProcessWithPseudoConsole(hPC);

        Logger.Action(origin, "Remote-access", "Open local shell (ConPTY)");
        await WebSocketHelper.WsWriteText(ws, "{\"connected\":true}"u8.ToArray());

        FileStream reader = new FileStream(new SafeFileHandle(hOutRead, true), FileAccess.Read);
        FileStream writer = new FileStream(new SafeFileHandle(hInWrite, true), FileAccess.Write);

        _ = Task.Run(() => PumpStreamToWebSocket(ctx, ws, reader));
        await PumpWebSocketToStream(ctx, ws, writer);

        try { process.Kill(true); } catch { }
        ClosePseudoConsole(hPC);

        await CloseWebSocket(ws);
    }

    [SupportedOSPlatform("windows")]
    private static void CreatePipe(out IntPtr read, out IntPtr write)
    {
        var sa = new SECURITY_ATTRIBUTES
        {
            nLength = Marshal.SizeOf<SECURITY_ATTRIBUTES>(),
            bInheritHandle = true,
            lpSecurityDescriptor = IntPtr.Zero
        };

        if (!CreatePipe(out read, out write, ref sa, 0))
        {
            throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
        }
    }

    private static async Task PumpWebSocketToStream(HttpListenerContext ctx, WebSocket ws, Stream stream) {
        byte[] buffer = new byte[2048];

        while (ws.State == WebSocketState.Open) {
            WebSocketReceiveResult result = await ws.ReceiveAsync(buffer, CancellationToken.None);

            if (result.MessageType == WebSocketMessageType.Close) break;
            if (!Auth.IsAuthenticatedAndAuthorized(ctx, "/ws/shell")) break;

            await stream.WriteAsync(buffer.AsMemory(0, result.Count));
            await stream.FlushAsync();
        }
    }

    private static async Task PumpStreamToWebSocket(HttpListenerContext ctx, WebSocket ws, Stream stream) {
        byte[] buffer = new byte[4096];

        while (ws.State == WebSocketState.Open) {
            int count = await stream.ReadAsync(buffer);
            if (count == 0) break;

            await ws.SendAsync(new ArraySegment<byte>(buffer, 0, count), WebSocketMessageType.Text, true, CancellationToken.None);
        }
    }

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

    [SupportedOSPlatform("windows")]
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern int CreatePseudoConsole(
        COORD size,
        IntPtr hInput,
        IntPtr hOutput,
        uint flags,
        out IntPtr hPC);

    [SupportedOSPlatform("windows")]
    [DllImport("kernel32.dll")]
    private static extern void ClosePseudoConsole(IntPtr hPC);

    [SupportedOSPlatform("windows")]
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CreatePipe(
        out IntPtr hReadPipe,
        out IntPtr hWritePipe,
        ref SECURITY_ATTRIBUTES lpPipeAttributes,
        int nSize);

    [SupportedOSPlatform("windows")]
    [StructLayout(LayoutKind.Sequential)]
    private struct SECURITY_ATTRIBUTES {
        public int nLength;
        public IntPtr lpSecurityDescriptor;
        public bool bInheritHandle;
    }

    [SupportedOSPlatform("windows")]
    private static Process StartProcessWithPseudoConsole(IntPtr hPC)
    {
        ProcessStartInfo psi = new ProcessStartInfo {
            FileName = Environment.GetEnvironmentVariable("ComSpec") ?? "cmd.exe",
            UseShellExecute = false
        };

        return Process.Start(psi);
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct COORD {
        public short X;
        public short Y;
    }

    private static async Task CloseWebSocket(WebSocket ws) {
        if (ws.State != WebSocketState.Open) return;

        try {
            await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None);
        }
        catch { }
    }
}
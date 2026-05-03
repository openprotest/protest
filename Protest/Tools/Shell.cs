using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.WebSockets;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Protest.Http;

namespace Protest.Tools;

internal static partial class Shell {

    private const int SIGINT = 2;

    [LibraryImport("libc", EntryPoint = "kill", SetLastError = true)]
    private static partial int unix_kill(int pid, int sig);

    private const uint TH32CS_SNAPPROCESS = 0x00000002;
    private static readonly IntPtr INVALID_HANDLE_VALUE = new IntPtr(-1);

    [StructLayout(LayoutKind.Sequential)]
    private unsafe struct PROCESSENTRY32W {
        public uint dwSize;
        public uint cntUsage;
        public uint th32ProcessID;
        public IntPtr th32DefaultHeapID;
        public uint th32ModuleID;
        public uint cntThreads;
        public uint th32ParentProcessID;
        public int pcPriClassBase;
        public uint dwFlags;
        public fixed char szExeFile[260];
    }

    [LibraryImport("kernel32.dll", SetLastError = true)]
    private static partial IntPtr CreateToolhelp32Snapshot(uint dwFlags, uint th32ProcessID);

    [LibraryImport("kernel32.dll", SetLastError = true, EntryPoint = "Process32FirstW")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static partial bool Process32First(IntPtr hSnapshot, ref PROCESSENTRY32W lppe);

    [LibraryImport("kernel32.dll", SetLastError = true, EntryPoint = "Process32NextW")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static partial bool Process32Next(IntPtr hSnapshot, ref PROCESSENTRY32W lppe);

    [LibraryImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static partial bool CloseHandle(IntPtr hObject);

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
        catch (WebSocketException ex) {
            ctx.Response.Close();
            Logger.Error(ex);
            return;
        }

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
        catch (Exception ex) {
            Logger.Debug(ex);
            return;
        }

        if (OperatingSystem.IsWindows()) {
            await RunWindowsShell(ctx, ws, origin);
        }
        else if (OperatingSystem.IsLinux()) {
            await RunPosixShell(ctx, ws, origin);
        }
        else if (OperatingSystem.IsMacOS()) {
            await RunPosixShell(ctx, ws, origin);
        }
    }

    [SupportedOSPlatform("windows")]
    private static async Task RunWindowsShell(HttpListenerContext ctx, WebSocket ws, string origin) {
        Process process = null;
        try {
            ProcessStartInfo psi = new ProcessStartInfo {
                FileName = "cmd.exe",
                UseShellExecute = false,
                RedirectStandardInput = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
                StandardInputEncoding = Encoding.UTF8,
                StandardOutputEncoding = Encoding.UTF8,
                StandardErrorEncoding = Encoding.UTF8,
            };

            process = new Process { StartInfo = psi };
            try {
                process.Start();
            }
            catch (Exception ex) {
                await WebSocketHelper.WsWriteText(ws, $"{{\"error\":\"{ex.Message}\"}}");
                await CloseWebSocket(ws);
                return;
            }

            int shellPid = process.Id;
            Logger.Action(origin, "Remote-access", "Open local shell (cmd.exe)");
            await WebSocketHelper.WsWriteText(ws, "{\"connected\":true}"u8.ToArray());

            Process captured = process;
            new Thread(() => HandleDownstream(ctx, ws, captured, captured.StandardOutput.BaseStream, false).GetAwaiter().GetResult()).Start();
            new Thread(() => HandleDownstream(ctx, ws, captured, captured.StandardError.BaseStream, false).GetAwaiter().GetResult()).Start();

            await RunWindowsUpstream(ctx, ws, process, shellPid);
        }
        catch (Exception ex) {
            Logger.Error(ex);
        }
        finally {
            CleanupProcess(process);
            await CloseWebSocket(ws);
        }
    }

    [SupportedOSPlatform("windows")]
    private static async Task RunWindowsUpstream(HttpListenerContext ctx, WebSocket ws, Process process, int shellPid) {
        Stream stdin = process.StandardInput.BaseStream;
        List<byte> lineBuffer = new List<byte>();
        int escState = 0; //0 = idle, 1 = saw ESC, 2 = inside CSI

        byte[] buff = new byte[2048];
        while (ws.State == WebSocketState.Open && !process.HasExited) {
            WebSocketReceiveResult receiveResult = await ws.ReceiveAsync(buff, CancellationToken.None);
            if (receiveResult.MessageType == WebSocketMessageType.Close) {
                await CloseWebSocket(ws);
                break;
            }
            if (!Auth.IsAuthenticatedAndAuthorized(ctx, "/ws/shell")) {
                ctx.Response.Close();
                break;
            }
            if (receiveResult.Count == 0) continue;

            bool stdinBroken = false;
            for (int i = 0; i < receiveResult.Count; i++) {
                byte b = buff[i];

                //swallow ESC sequences (arrow keys, function keys, ...): cmd.exe with redirected stdio can't navigate.
                if (escState == 1) {
                    escState = (b == (byte)'[') ? 2 : 0;
                    continue;
                }

                if (escState == 2) {
                    if (b >= 0x40 && b <= 0x7E) escState = 0;
                    continue;
                }

                if (b == 0x1B) {
                    escState = 1; continue;
                }

                if (b == 0x0D) { //Enter: echo CRLF, flush buffered line + CRLF to cmd.
                    await ws.SendAsync(new byte[] { 0x0D, 0x0A }, WebSocketMessageType.Text, true, CancellationToken.None);
                    lineBuffer.Add(0x0D);
                    lineBuffer.Add(0x0A);

                    try {
                        await stdin.WriteAsync(lineBuffer.ToArray());
                        await stdin.FlushAsync();
                    }
                    catch (IOException) {
                        stdinBroken = true;
                        break;
                    }

                    lineBuffer.Clear();
                }
                else if (b == 0x08 || b == 0x7F) { //Backspace
                    if (lineBuffer.Count > 0) {
                        lineBuffer.RemoveAt(lineBuffer.Count - 1);
                        await ws.SendAsync(new byte[] { 0x08, 0x20, 0x08 }, WebSocketMessageType.Text, true, CancellationToken.None);
                    }
                }
                else if (b == 0x03) { //Ctrl+C: kill cmd's descendants, abandon the in-progress line.
                    await ws.SendAsync("^C\r\n"u8.ToArray(), WebSocketMessageType.Text, true, CancellationToken.None);
                    lineBuffer.Clear();
                    KillDescendantsWindows(shellPid);
                }
                else { //printable + tab: echo + buffer.
                    lineBuffer.Add(b);
                    await ws.SendAsync(new byte[] { b }, WebSocketMessageType.Text, true, CancellationToken.None);
                }
            }
            if (stdinBroken)
                break;
        }
    }

    [SupportedOSPlatform("windows")]
    private static void KillDescendantsWindows(int rootPid) {
        Dictionary<int, List<int>> children = BuildChildMapWindows();

        Queue<int> queue = new Queue<int>();
        if (children.TryGetValue(rootPid, out List<int> firstLevel)) {
            foreach (int c in firstLevel) {
                queue.Enqueue(c);
            }
        }
        while (queue.Count > 0) {
            int pid = queue.Dequeue();
            try {
                using Process p = Process.GetProcessById(pid);
                p.Kill();
            }
            catch (Exception ex) {
                Logger.Debug(ex);
            }
            if (children.TryGetValue(pid, out List<int> grand)) {
                foreach (int c in grand) {
                    queue.Enqueue(c);
                }
            }
        }
    }

    [SupportedOSPlatform("windows")]
    private static Dictionary<int, List<int>> BuildChildMapWindows() {
        Dictionary<int, List<int>> children = new Dictionary<int, List<int>>();
        IntPtr snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if (snapshot == INVALID_HANDLE_VALUE) return children;

        try {
            PROCESSENTRY32W entry = default;
            entry.dwSize = (uint)Unsafe.SizeOf<PROCESSENTRY32W>();
            if (!Process32First(snapshot, ref entry)) return children;
            do {
                int pid = (int)entry.th32ProcessID;
                int ppid = (int)entry.th32ParentProcessID;
                if (!children.TryGetValue(ppid, out List<int> list)) {
                    list = new List<int>();
                    children[ppid] = list;
                }
                list.Add(pid);
            } while (Process32Next(snapshot, ref entry));
        }
        finally {
            CloseHandle(snapshot);
        }

        return children;
    }

    [SupportedOSPlatform("linux")]
    [SupportedOSPlatform("macos")]
    private static async Task RunPosixShell(HttpListenerContext ctx, WebSocket ws, string origin) {
        Process process = null;
        try {
            string bash = File.Exists("/bin/bash") ? "/bin/bash" : "/bin/sh";
            ProcessStartInfo psi = new ProcessStartInfo {
                FileName = bash,
                Arguments = "-i",
                UseShellExecute = false,
                RedirectStandardInput = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
                StandardInputEncoding = Encoding.UTF8,
                StandardOutputEncoding = Encoding.UTF8,
                StandardErrorEncoding = Encoding.UTF8,
            };
            psi.EnvironmentVariables["TERM"] = "dumb";
            psi.EnvironmentVariables["PS1"] = "$ ";

            process = new Process { StartInfo = psi };
            try {
                process.Start();
            }
            catch (Exception ex) {
                await WebSocketHelper.WsWriteText(ws, $"{{\"error\":\"{ex.Message}\"}}");
                await CloseWebSocket(ws);
                return;
            }

            int shellPid = process.Id;
            Logger.Action(origin, "Remote-access", $"Open local shell ({bash})");
            await WebSocketHelper.WsWriteText(ws, "{\"connected\":true}"u8.ToArray());

            Process captured = process;
            new Thread(() => HandleDownstream(ctx, ws, captured, captured.StandardOutput.BaseStream, true).GetAwaiter().GetResult()).Start();
            new Thread(() => HandleDownstream(ctx, ws, captured, captured.StandardError.BaseStream, true).GetAwaiter().GetResult()).Start();

            await RunPosixUpstream(ctx, ws, process, shellPid);
        }
        catch (Exception ex) {
            Logger.Error(ex);
        }
        finally {
            CleanupProcess(process);
            await CloseWebSocket(ws);
        }
    }

    [SupportedOSPlatform("linux")]
    [SupportedOSPlatform("macos")]
    private static async Task RunPosixUpstream(HttpListenerContext ctx, WebSocket ws, Process process, int shellPid) {
        Stream stdin = process.StandardInput.BaseStream;
        byte[] buff = new byte[2048];

        while (ws.State == WebSocketState.Open && !process.HasExited) {
            WebSocketReceiveResult receiveResult = await ws.ReceiveAsync(buff, CancellationToken.None);

            if (receiveResult.MessageType == WebSocketMessageType.Close) {
                await CloseWebSocket(ws);
                break;
            }
            if (!Auth.IsAuthenticatedAndAuthorized(ctx, "/ws/shell")) {
                ctx.Response.Close();
                break;
            }
            if (receiveResult.Count == 0)
                continue;

            if (receiveResult.Count == 1 && buff[0] == 0x03) { //Ctrl+C
                SignalDescendantsPosix(shellPid, SIGINT);
                continue;
            }

            try {
                await stdin.WriteAsync(buff.AsMemory(0, receiveResult.Count));
                await stdin.FlushAsync();
            }
            catch (IOException) {
                break;
            }
        }
    }

    [SupportedOSPlatform("linux")]
    [SupportedOSPlatform("macos")]
    private static void SignalDescendantsPosix(int rootPid, int sig) {
        Dictionary<int, List<int>> children = BuildChildMapPosix();
        if (children is null) return;

        Queue<int> queue = new Queue<int>();
        if (children.TryGetValue(rootPid, out List<int> firstLevel)) {
            foreach (int c in firstLevel) {
                queue.Enqueue(c);
            }
        }
        while (queue.Count > 0) {
            int pid = queue.Dequeue();
            try {
                unix_kill(pid, sig);
            }
            catch (Exception ex) {
                Logger.Debug(ex);
            }
            if (children.TryGetValue(pid, out List<int> grand)) {
                foreach (int c in grand) {
                    queue.Enqueue(c);
                }
            }
        }
    }

    [SupportedOSPlatform("linux")]
    [SupportedOSPlatform("macos")]
    private static Dictionary<int, List<int>> BuildChildMapPosix() {
        Dictionary<int, List<int>> children = new Dictionary<int, List<int>>();
        try {
            ProcessStartInfo psi = new ProcessStartInfo {
                FileName = "/bin/ps",
                Arguments = "-A -o pid=,ppid=",
                RedirectStandardOutput = true,
                UseShellExecute = false,
                CreateNoWindow = true,
            };

            using Process ps = Process.Start(psi);
            string output = ps.StandardOutput.ReadToEnd();
            ps.WaitForExit();

            foreach (string line in output.Split('\n')) {
                string[] parts = line.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries);
                if (parts.Length < 2) continue;
                if (!int.TryParse(parts[0], out int pid)) continue;
                if (!int.TryParse(parts[1], out int ppid)) continue;

                if (!children.TryGetValue(ppid, out List<int> list)) {
                    list = new List<int>();
                    children[ppid] = list;
                }

                list.Add(pid);
            }
        }
        catch (Exception ex) {
            Logger.Debug(ex);
            return null;
        }
        return children;
    }

    private static async Task HandleDownstream(HttpListenerContext ctx, WebSocket ws, Process process, Stream stream, bool convertLfToCrlf) {
        byte[] data = new byte[2048];
        byte[] outBuf = new byte[4096];

        while (ws.State == WebSocketState.Open && !process.HasExited) {
            if (!Auth.IsAuthenticatedAndAuthorized(ctx, "/ws/shell")) {
                ctx.Response.Close();
                return;
            }

            try {
                int count = await stream.ReadAsync(data);

                if (count == 0) {
                    await CloseWebSocket(ws);
                    return;
                }

                if (count == 1 && data[0] == 0) continue;

                int outCount = SanitizeBytes(data, count, outBuf, convertLfToCrlf);
                if (outCount > 0) {
                    await ws.SendAsync(new ArraySegment<byte>(outBuf, 0, outCount), WebSocketMessageType.Text, true, CancellationToken.None);
                }
            }
            catch (IOException) {
                return;
            }
            catch {
                return;
            }
        }
    }

    private static int SanitizeBytes(byte[] src, int count, byte[] dst, bool convertLfToCrlf) {
        int outCount = 0;
        int i = 0;
        while (i < count) {
            byte b = src[i];

            if (b < 0x80) {
                if (convertLfToCrlf && b == 0x0A && (i == 0 || src[i - 1] != 0x0D)) {
                    dst[outCount++] = 0x0D;
                }
                dst[outCount++] = b;
                i++;
                continue;
            }

            int seqLen;
            if ((b & 0xE0) == 0xC0) {
                seqLen = 2;
            }
            else if ((b & 0xF0) == 0xE0) {
                seqLen = 3;
            }
            else if ((b & 0xF8) == 0xF0) {
                seqLen = 4;
            }
            else {
                i++;
                continue;
            }

            if (i + seqLen > count) {
                i++;
                continue;
            }

            bool valid = true;
            for (int j = 1; j < seqLen; j++) {
                if ((src[i + j] & 0xC0) != 0x80) { valid = false; break; }
            }

            if (valid) {
                for (int j = 0; j < seqLen; j++)
                    dst[outCount++] = src[i + j];
                i += seqLen;
            }
            else {
                i++;
            }
        }

        return outCount;
    }

    private static void CleanupProcess(Process process) {
        if (process is null) return;

        try {
            if (!process.HasExited) {
                process.Kill(entireProcessTree: true);
            }
        }
        catch (Exception ex) {
            Logger.Debug(ex);
        }
        try {
            process.Dispose();
        }
        catch (Exception ex) {
            Logger.Debug(ex);
        }
    }

    private static async Task CloseWebSocket(WebSocket ws) {
        if (ws is null) return;

        if (ws.State != WebSocketState.Open) return;

        try {
            await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, CancellationToken.None);
        }
        catch (Exception ex) {
            Logger.Debug(ex);
        }
    }
}

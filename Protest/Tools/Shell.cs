using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.WebSockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Protest.Http;

namespace Protest.Tools;

internal static class Shell {

    private const int SIGINT = 2;

    [DllImport("libc", SetLastError = true, EntryPoint = "kill")]
    private static extern int unix_kill(int pid, int sig);

    private static void SignalDescendants(int rootPid, int sig) {
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
            return;
        }

        Queue<int> queue = new Queue<int>();
        if (children.TryGetValue(rootPid, out List<int> firstLevel)) {
            foreach (int c in firstLevel) queue.Enqueue(c);
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
                foreach (int c in grand) queue.Enqueue(c);
            }
        }
    }

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

        if (ws is null) return;

        string sessionId = ctx.Request.Cookies["sessionid"]?.Value;
        string origin = IPAddress.IsLoopback(ctx.Request.RemoteEndPoint.Address) ? "loopback" : Auth.GetUsername(sessionId);

        Process process = null;

        try {
            byte[] connectionBuffer = new byte[512];
            WebSocketReceiveResult handshakeResult = await ws.ReceiveAsync(connectionBuffer, CancellationToken.None);
            if (handshakeResult.MessageType == WebSocketMessageType.Close) {
                await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, CancellationToken.None);
                return;
            }

            string shellName;
            ProcessStartInfo psi;

            if (OperatingSystem.IsWindows()) {
                shellName = "cmd.exe";
                psi = new ProcessStartInfo {
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
            }
            else {
                string bash = File.Exists("/bin/bash") ? "/bin/bash" : "/bin/sh";
                shellName = bash;
                psi = new ProcessStartInfo {
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
            }

            process = new Process { StartInfo = psi };

            try {
                process.Start();
            }
            catch (Exception ex) {
                await WebSocketHelper.WsWriteText(ws, $"{{\"error\":\"{ex.Message}\"}}");
                await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, CancellationToken.None);
                return;
            }

            int shellPid = process.Id;

            Logger.Action(origin, "Remote-access", $"Open local shell ({shellName})");

            await WebSocketHelper.WsWriteText(ws, "{\"connected\":true}"u8.ToArray());

            Process capturedProcess = process;
            Thread stdoutFork = new Thread(() => HandleDownstream(ctx, ws, capturedProcess, capturedProcess.StandardOutput.BaseStream).GetAwaiter().GetResult());
            Thread stderrFork = new Thread(() => HandleDownstream(ctx, ws, capturedProcess, capturedProcess.StandardError.BaseStream).GetAwaiter().GetResult());
            stdoutFork.Start();
            stderrFork.Start();

            Stream stdin = process.StandardInput.BaseStream;

            byte[] buff = new byte[2048];
            while (ws.State == WebSocketState.Open && !process.HasExited) {
                WebSocketReceiveResult receiveResult = await ws.ReceiveAsync(buff, CancellationToken.None);

                if (receiveResult.MessageType == WebSocketMessageType.Close) {
                    await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, CancellationToken.None);
                    break;
                }

                if (!Auth.IsAuthenticatedAndAuthorized(ctx, "/ws/shell")) {
                    ctx.Response.Close();
                    break;
                }

                if (receiveResult.Count == 0) continue;

                if (!OperatingSystem.IsWindows()
                    && receiveResult.Count == 1
                    && buff[0] == 0x03) { //Ctrl+C: no PTY line discipline, so signal bash's descendants directly
                    SignalDescendants(shellPid, SIGINT);
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
        catch (Exception ex) {
            Logger.Error(ex);
        }
        finally {
            if (process is not null) {
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

            if (ws is not null && ws.State == WebSocketState.Open) {
                try {
                    await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, CancellationToken.None);
                }
                catch (Exception ex) {
                    Logger.Debug(ex);
                }
            }
        }
    }

    private static async Task HandleDownstream(HttpListenerContext ctx, WebSocket ws, Process process, Stream stream) {
        byte[] data = new byte[2048];
        byte[] expanded = new byte[4096];
        bool convertLfToCrlf = !OperatingSystem.IsWindows();

        while (ws.State == WebSocketState.Open && !process.HasExited) {
            if (!Auth.IsAuthenticatedAndAuthorized(ctx, "/ws/shell")) {
                ctx.Response.Close();
                return;
            }

            try {
                int count = await stream.ReadAsync(data);

                if (count == 0) {
                    if (ws.State == WebSocketState.Open) {
                        try {
                            await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, CancellationToken.None);
                        }
                        catch (Exception ex) {
                            Logger.Debug(ex);
                        }
                    }
                    return;
                }

                if (count == 1 && data[0] == 0) continue;

                for (int i = 0; i < count; i++) {
                    if (data[i] > 127) data[i] = 46; //.
                }

                if (convertLfToCrlf) {
                    int outCount = 0;
                    for (int i = 0; i < count; i++) {
                        byte b = data[i];
                        if (b == 0x0A && (i == 0 || data[i - 1] != 0x0D)) {
                            expanded[outCount++] = 0x0D;
                        }
                        expanded[outCount++] = b;
                    }
                    await ws.SendAsync(new ArraySegment<byte>(expanded, 0, outCount), WebSocketMessageType.Text, true, CancellationToken.None);
                }
                else {
                    await ws.SendAsync(new ArraySegment<byte>(data, 0, count), WebSocketMessageType.Text, true, CancellationToken.None);
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
}

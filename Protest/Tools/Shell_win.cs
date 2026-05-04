using System.IO;
using System.Net;
using System.Net.WebSockets;
using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Diagnostics;
using Protest.Http;
using Microsoft.Win32.SafeHandles;

namespace Protest.Tools;

internal static partial class Shell {

    [StructLayout(LayoutKind.Sequential)]
    private struct COORD {
        public short X;
        public short Y;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct SECURITY_ATTRIBUTES {
        public int nLength;
        public IntPtr lpSecurityDescriptor;
        public bool bInheritHandle;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct STARTUPINFOEX {
        public STARTUPINFO StartupInfo;
        public IntPtr lpAttributeList;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct STARTUPINFO {
        public int cb;
        public string lpReserved;
        public string lpDesktop;
        public string lpTitle;
        public int dwX;
        public int dwY;
        public int dwXSize;
        public int dwYSize;
        public int dwXCountChars;
        public int dwYCountChars;
        public int dwFillAttribute;
        public int dwFlags;
        public short wShowWindow;
        public short cbReserved2;
        public IntPtr lpReserved2;
        public IntPtr hStdInput;
        public IntPtr hStdOutput;
        public IntPtr hStdError;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct PROCESS_INFORMATION {
        public IntPtr hProcess;
        public IntPtr hThread;
        public uint dwProcessId;
        public uint dwThreadId;
    }

    [SupportedOSPlatform("windows")]
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern int ResizePseudoConsole(IntPtr hPC, COORD size);

    [SupportedOSPlatform("windows")]
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool InitializeProcThreadAttributeList(IntPtr lpAttributeList, int dwAttributeCount, int dwFlags, ref IntPtr lpSize);

    [SupportedOSPlatform("windows")]
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool UpdateProcThreadAttribute(IntPtr lpAttributeList, uint dwFlags, IntPtr Attribute, IntPtr lpValue, IntPtr cbSize, IntPtr lpPreviousValue, IntPtr lpReturnSize);

    [SupportedOSPlatform("windows")]
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern void DeleteProcThreadAttributeList(IntPtr lpAttributeList);

    [SupportedOSPlatform("windows")]
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern int CreatePseudoConsole(COORD size, IntPtr hInput, IntPtr hOutput, uint flags, out IntPtr hPC);

    [SupportedOSPlatform("windows")]
    [DllImport("kernel32.dll")]
    private static extern void ClosePseudoConsole(IntPtr hPC);

    [SupportedOSPlatform("windows")]
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CreatePipe(out IntPtr hReadPipe, out IntPtr hWritePipe, ref SECURITY_ATTRIBUTES lpPipeAttributes, int nSize);

    [SupportedOSPlatform("windows")]
    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool CreateProcess(string lpApplicationName, string lpCommandLine, IntPtr lpProcessAttributes, IntPtr lpThreadAttributes, bool bInheritHandles, uint dwCreationFlags, IntPtr lpEnvironment, string lpCurrentDirectory, ref STARTUPINFOEX lpStartupInfo, out PROCESS_INFORMATION lpProcessInformation);

    private const int PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE = 0x00020016;

    private const uint EXTENDED_STARTUPINFO_PRESENT = 0x00080000;

    [SupportedOSPlatform("windows")]
    private static Process StartProcessWithPseudoConsole(IntPtr hPC) {
        string cmd = Environment.GetEnvironmentVariable("ComSpec") ?? "cmd.exe";
        string cwd = Environment.GetFolderPath(Environment.SpecialFolder.System);

        STARTUPINFOEX siex = new STARTUPINFOEX();
        siex.StartupInfo.cb = Marshal.SizeOf<STARTUPINFOEX>();

        IntPtr lpSize = IntPtr.Zero;
        InitializeProcThreadAttributeList(IntPtr.Zero, 1, 0, ref lpSize);

        siex.lpAttributeList = Marshal.AllocHGlobal(lpSize);
        InitializeProcThreadAttributeList(siex.lpAttributeList, 1, 0, ref lpSize);

        IntPtr pValue = Marshal.AllocHGlobal(IntPtr.Size);
        Marshal.WriteIntPtr(pValue, hPC);

        UpdateProcThreadAttribute(siex.lpAttributeList, 0, (IntPtr)PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE, pValue, (IntPtr)IntPtr.Size, IntPtr.Zero, IntPtr.Zero);

        PROCESS_INFORMATION pi = new PROCESS_INFORMATION();

        bool success = CreateProcess(null, cmd, IntPtr.Zero, IntPtr.Zero, false, EXTENDED_STARTUPINFO_PRESENT, IntPtr.Zero, cwd, ref siex, out pi);

        if (!success) {
            throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
        }

        DeleteProcThreadAttributeList(siex.lpAttributeList);
        Marshal.FreeHGlobal(siex.lpAttributeList);
        Marshal.FreeHGlobal(pValue);

        return Process.GetProcessById((int)pi.dwProcessId);
    }

    [SupportedOSPlatform("windows")]
    private static async Task RunWindowsAsync(HttpListenerContext ctx, WebSocket ws, string origin) {
        using CancellationTokenSource cts = new();

        CreatePipe(out nint hInRead, out nint hInWrite);
        CreatePipe(out nint hOutRead, out nint hOutWrite);

        CloseHandle(hInWrite);
        CloseHandle(hOutWrite);

        COORD size = new COORD { X = DEFAULT_COLS, Y = DEFAULT_ROWS };

        int hr = CreatePseudoConsole(size, hInRead, hOutWrite, 0, out IntPtr hPC);
        if (hr != 0) {
            await WebSocketHelper.WsWriteText(ws, "{\"error\":\"ConPTY failed\"}");
            return;
        }

        Process process = StartProcessWithPseudoConsole(hPC);

        Logger.Action(origin, "Remote-access", "Open local shell (ConPTY)");
        await WebSocketHelper.WsWriteText(ws, "{\"connected\":true}"u8.ToArray());

        using FileStream reader = new(new SafeFileHandle(hOutRead, true), FileAccess.Read);
        using FileStream writer = new(new SafeFileHandle(hInWrite, true), FileAccess.Write);

        Task readTask = PumpStreamToWebSocket(ctx, ws, reader, cts.Token);
        Task writeTask = PumpWebSocketToStream(ctx, ws, writer, hPC, cts.Token);

        await Task.WhenAny(readTask, writeTask);

        cts.Cancel();

        try {
            process.Kill(true);
        }
        catch { }

        ClosePseudoConsole(hPC);
        await CloseWebSocket(ws);
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool CloseHandle(IntPtr hObject);

    [SupportedOSPlatform("windows")]
    private static void CreatePipe(out IntPtr read, out IntPtr write) {
        SECURITY_ATTRIBUTES sa = new SECURITY_ATTRIBUTES {
            nLength = Marshal.SizeOf<SECURITY_ATTRIBUTES>(),
            bInheritHandle = true,
            lpSecurityDescriptor = IntPtr.Zero
        };

        if (!CreatePipe(out read, out write, ref sa, 0)) {
            throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
        }
    }

    [SupportedOSPlatform("windows")]
    private static async Task PumpWebSocketToStream(HttpListenerContext ctx, WebSocket ws, Stream stream, IntPtr hPC, CancellationToken token) {
        byte[] buffer = new byte[4096];

        while (!token.IsCancellationRequested && ws.State == WebSocketState.Open) {
            WebSocketReceiveResult result = await ws.ReceiveAsync(buffer, token);

            if (result.MessageType == WebSocketMessageType.Close) break;
            if (!Auth.IsAuthenticatedAndAuthorized(ctx, "/ws/shell")) break;

            // Resize message support (JSON: {"cols":X,"rows":Y})
            if (result.Count < 100 && buffer[0] == '{') {
                try {
                    string json = System.Text.Encoding.UTF8.GetString(buffer, 0, result.Count);
                    JsonElement obj = JsonDocument.Parse(json).RootElement;

                    if (obj.TryGetProperty("cols", out JsonElement cols) && obj.TryGetProperty("rows", out JsonElement rows)) {
                        _ = ResizePseudoConsole(hPC, new COORD {
                            X = (short)cols.GetInt32(),
                            Y = (short)rows.GetInt32()
                        });

                        continue;
                    }
                }
                catch { }
            }

            await stream.WriteAsync(buffer.AsMemory(0, result.Count), token);
            await stream.FlushAsync(token);
        }
    }
}

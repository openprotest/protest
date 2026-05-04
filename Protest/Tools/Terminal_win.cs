using System.Runtime.Versioning;
using System.Threading.Tasks;
using System.Net;
using System.Net.WebSockets;
using System.IO;
using Porta.Pty;

namespace Protest.Tools;

internal static partial class Terminal {

    [SupportedOSPlatform("windows")]
    private static Task RunWindowsAsync(HttpListenerContext ctx, WebSocket ws, string origin) {
        return RunPtyAsync(ctx, ws, origin, BuildWindowsPtyOptions());
    }

    [SupportedOSPlatform("windows")]
    private static PtyOptions BuildWindowsPtyOptions() {
        string app = Environment.GetEnvironmentVariable("ComSpec") ?? Path.Combine(Environment.SystemDirectory, "cmd.exe");

        return new PtyOptions {
            App = app,
            CommandLine = Array.Empty<string>(),
            Cwd = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            Cols = DEFAULT_COLS,
            Rows = DEFAULT_ROWS
        };
    }
}

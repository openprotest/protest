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
        string app = Environment.GetEnvironmentVariable("ComSpec") ?? Path.Join(Environment.SystemDirectory, "cmd.exe");

        PtyOptions options = new PtyOptions {
            App = app,
            CommandLine = Array.Empty<string>(),
            Cwd = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            Cols = DEFAULT_COLS,
            Rows = DEFAULT_ROWS
        };

        return RunPtyAsync(ctx, ws, origin, options, "/ws/terminal", $"Open local shell ({Path.GetFileName(app)})");
    }

}

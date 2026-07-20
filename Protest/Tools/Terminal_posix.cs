using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.WebSockets;
using System.Runtime.Versioning;
using System.Threading.Tasks;
using Porta.Pty;

namespace Protest.Tools;

internal static partial class Terminal {

    [SupportedOSPlatform("linux")]
    [SupportedOSPlatform("macos")]
    private static Task RunPosixAsync(HttpListenerContext ctx, WebSocket ws, string origin) {
        Dictionary<string, string> env = new Dictionary<string, string> {
            ["TERM"] = "xterm-256color",
            ["LANG"] = Environment.GetEnvironmentVariable("LANG") ?? "en_US.UTF-8"
        };

        string app = Environment.GetEnvironmentVariable("SHELL");
        if (String.IsNullOrWhiteSpace(app) || !File.Exists(app)) {
            if (OperatingSystem.IsMacOS() && File.Exists("/bin/zsh")) {
                app = "/bin/zsh";
            }
            else if (File.Exists("/bin/bash")) {
                app = "/bin/bash";
            }
            else if (File.Exists("/bin/zsh")) {
                app = "/bin/zsh";
            }
            else {
                app = "/bin/sh";
            }
        }

        PtyOptions options =  new PtyOptions {
            App = app,
            CommandLine = new[] { "-l" },
            Cwd = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            Cols = DEFAULT_COLS,
            Rows = DEFAULT_ROWS,
            Environment = env
        };

        return RunPtyAsync(ctx, ws, origin, options, "/ws/terminal", $"Open local shell ({Path.GetFileName(app)})");
    }

}

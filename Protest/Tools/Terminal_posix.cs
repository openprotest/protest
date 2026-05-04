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
        return RunPtyAsync(ctx, ws, origin, BuildPosixPtyOptions());
    }

    [SupportedOSPlatform("linux")]
    [SupportedOSPlatform("macos")]
    private static PtyOptions BuildPosixPtyOptions() {
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

        return new PtyOptions {
            App = app,
            CommandLine = new[] { "-l" },
            Cwd = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            Cols = DEFAULT_COLS,
            Rows = DEFAULT_ROWS,
            Environment = env
        };
    }
}

using System;
using System.IO;
using System.Linq;
using System.Runtime.CompilerServices;

public static class Logging {
    
    private static readonly object log_lock = new object();

    public static void Err(in Exception ex, [CallerLineNumber] int line = 0, [CallerMemberName] string caller = null, [CallerFilePath] string file = null) {
#if DEBUG
        file = file.Split('\\').Last();
        Err($"{caller} ({file}:{line}) \t{ex.Message}");
#else
        Err(ex.Message);
#endif
    }

    public static void Err(in string ex) {
        lock (log_lock)
            try {
                using StreamWriter writer = new StreamWriter($"{Strings.DIR_LOG}\\error.log", true, System.Text.Encoding.UTF8);
                writer.Write(DateTime.Now.ToString(Strings.DATETIME_FORMAT_FILE));
                writer.WriteLine($"\t{ex}");
            } catch { }

        Console.ForegroundColor = ConsoleColor.Red;
        Console.WriteLine(ex);
        Console.ResetColor();
    }

    public static void Action(in string performer, in string action) {
        string msg = $"{DateTime.Now.ToString(Strings.DATETIME_FORMAT_FILE)}\t{performer}\t{action}";
        lock (log_lock)
            try {
                using StreamWriter writer = new StreamWriter($"{Strings.DIR_LOG}\\{DateTime.Now.ToString(Strings.DATE_FORMAT_FILE)}.log", true, System.Text.Encoding.UTF8);
                writer.WriteLine(msg);
            } catch { }

        KeepAlive.Broadcast($"{{\"action\":\"log\",\"msg\":\"{msg.Replace("\t", "\\t")}\"}}");
    }

    public static byte[] GetLog() {
        lock (log_lock)
            try {
                return File.ReadAllBytes($"{Strings.DIR_LOG}\\{DateTime.Now.ToString(Strings.DATE_FORMAT_FILE)}.log");
            } catch { }

        return null;
    }

}


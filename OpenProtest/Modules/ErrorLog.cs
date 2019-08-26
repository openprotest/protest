using System;
using System.IO;
using System.Linq;
using System.Runtime.CompilerServices;

static class ErrorLog {
    private static readonly string LOG_FILENAME = $"{Directory.GetCurrentDirectory()}\\error.log";
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
                using (StreamWriter writer = new StreamWriter(LOG_FILENAME, true, System.Text.Encoding.UTF8)) {
                        writer.Write(DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"));
                        writer.WriteLine($"\t{ex}");
                }
            } catch { }

        Console.ForegroundColor = ConsoleColor.Red;
        Console.WriteLine(ex);
        Console.ResetColor();
    }
}
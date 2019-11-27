using System;
using System.IO;
using System.Linq;

static class ActionLog {
    private static readonly string LOG_FILENAME = $"{Directory.GetCurrentDirectory()}\\action.log";
    private static readonly object log_lock = new object();

    public static void Action(in string performer, in string action) {
        lock (log_lock)
            try {
                using StreamWriter writer = new StreamWriter(LOG_FILENAME, true, System.Text.Encoding.UTF8);
                writer.WriteLine($"{DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss")}\t{performer}\t{action}");
            } catch { }
    }
}
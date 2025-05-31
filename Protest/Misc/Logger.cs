using System.IO;
using System.Threading;
using System.Collections.Generic;

#if DEBUG
using System.Runtime.CompilerServices;
#endif

namespace Protest;

internal static class Logger {
    private static readonly Lock errorMutex = new Lock();
    private static readonly Lock actionMutex = new Lock();

#if DEBUG
    public static void Error(Exception ex, [CallerLineNumber] int line = 0, [CallerMemberName] string caller = null, [CallerFilePath] string file = null) {
        ReadOnlySpan<char> span = file;
        int backslashIndex = span.LastIndexOf('\\');
        if (backslashIndex < 0) {
            Error($"{caller} ({file}:{line}) \t{ex.Message}");
        }
        else {
            Error($"{caller} ({span[(backslashIndex + 1)..]}:{line}) \t{ex.Message}");
        }
    }
#else
    public static void Error(Exception ex) {
        Error(ex.Message);
    }
#endif

    public static void Error(string ex) {
        lock (errorMutex)
            try {
                using StreamWriter writer = new StreamWriter($"{Data.DIR_LOG}{Data.DELIMITER}error.log", true, System.Text.Encoding.UTF8);
                writer.Write(DateTime.Now.ToString(Data.DATETIME_FORMAT_FILE));
                writer.WriteLine($"\t{ex}");
            }
            catch { }

        Console.ForegroundColor = ConsoleColor.Red;
        Console.Error.WriteLine(ex);
        Console.ResetColor();
    }

    public static void Action(string origin, string action) {
        new Thread(() => {
            DateTime dateTime = DateTime.Now;
            string date = dateTime.ToString(Data.DATETIME_FORMAT_FILE);
            string message = $"{date,-24}{origin,-32}{action}";
            lock (actionMutex)
                try {
                    using StreamWriter writer = new StreamWriter($"{Data.DIR_LOG}{Data.DELIMITER}{dateTime.ToString(Data.DATE_FORMAT_FILE)}.log", true, System.Text.Encoding.UTF8);
                    writer.WriteLine(message);
                }
                catch { }

            Http.KeepAlive.Broadcast($"{{\"action\":\"log\",\"msg\":\"{Data.EscapeJsonText(message)}\"}}", "/log");
        }).Start();
    }

    public static byte[] List(Dictionary<string, string> parameters) {
        try {
            if (parameters is null || !parameters.TryGetValue("last", out string last) || last.Length < 8) {
                return ListToday();
            }

            if (!int.TryParse(last, out int lastInt)) {
                return null;
            }

            FileInfo[] files = new DirectoryInfo(Data.DIR_LOG)
                .GetFiles("*.log")
                .Where(file => file.Name != "error.log" && file.Name.Length >= 8)
                .OrderBy(file => file.Name)
                .ToArray();

            int lastIndex = Array.FindLastIndex(files, file => string.Compare(file.Name[..8], last) < 0);
            if (lastIndex == -1) {
                return "end"u8.ToArray();
            }

            int firstIndex = Math.Max(0, lastIndex - 1);
            long sizeCount = files.Skip(firstIndex)
                .Take(lastIndex - firstIndex + 1)
                .Where(file => file.Length <= 10240)
                .Sum(file => file.Length);

            if (sizeCount > 10240) { //10Kb
                firstIndex = Array.FindLastIndex(files, firstIndex, file => sizeCount <= 10240);
            }

            List<byte[]> byteList = files.Skip(firstIndex)
                .Take(lastIndex - firstIndex + 1)
                .Select(file => File.ReadAllBytes(file.FullName))
                .ToList();

            if (byteList.Count == 0) {
                return "end"u8.ToArray();
            }

            return byteList.SelectMany(o => o).ToArray();
        }
        catch (Exception ex) {
            Logger.Error(ex);
            return null;
        }
    }

    private static byte[] ListToday() {
        string filename = $"{Data.DIR_LOG}{Data.DELIMITER}{DateTime.UtcNow.ToString(Data.DATE_FORMAT_FILE)}.log";
        if (!File.Exists(filename)) {
            return null;
        }

        try {
            byte[] bytes;
            lock (actionMutex) {
                bytes = File.ReadAllBytes(filename);
            }
            return bytes;
        }
        catch {
            return null;
        }
    }
}
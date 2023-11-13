using System.IO;
using System.Threading;
using System.Collections.Generic;
using Protest.Tasks;

#if DEBUG
using System.Runtime.CompilerServices;
#endif

namespace Protest;

internal static class Logger {
    private static readonly object syncError = new object();
    private static readonly object syncAction = new object();

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
        lock (syncError)
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

    public static void Action(string initiator, string action) {
        new Thread(() => {
            DateTime dateTime = DateTime.Now;
            string date = dateTime.ToString(Data.DATETIME_FORMAT_FILE);
            string message = $"{date,-24}{initiator,-32}{action}";
            lock (syncAction)
                try {
                    using StreamWriter writer = new StreamWriter($"{Data.DIR_LOG}{Data.DELIMITER}{dateTime.ToString(Data.DATE_FORMAT_FILE)}.log", true, System.Text.Encoding.UTF8);
                    writer.WriteLine(message);
                }
                catch { }

            Http.KeepAlive.Broadcast($"{{\"action\":\"log\",\"msg\":\"{Data.EscapeJsonText(message)}\"}}", "/log");
        }).Start();
    }

    public static byte[] List(Dictionary<string, string> parameters) {
        if (parameters is null) return ListToday();
        if (!parameters.TryGetValue("last", out string last) || last.Length < 8) return ListToday();
        if (!int.TryParse(last, out int lastInt)) return null;

        try {
            FileInfo[] files = new DirectoryInfo(Data.DIR_LOG).GetFiles("*.log");
            Array.Sort(files, (a, b) => string.Compare(a.Name, b.Name));

            int lastIndex = files.Length - 1;

            for (int i = files.Length - 1; i >= 0; i--) {
                if (files[i].Name == "error.log") continue;
                if (files[i].Name.Length < 8) continue;

                string currentDateString = files[i].Name[..8];

                if (string.Compare(currentDateString, last) <= 0) {
                    lastIndex = i - 1; //exclude last
                    break;
                }
            }

            int firstIndex =  Math.Max(0, lastIndex - 1);
            long sizeCount = 0;

            for (int i = lastIndex; i >= 0; i--) { //count upto 10Kb
                if (files[i].Name == "error.log") continue;
                if (files[i].Name.Length < 8) continue;

                sizeCount += files[i].Length;

                if (sizeCount > 10240) {
                    firstIndex = i;
                    break;
                }
            }

            List<byte[]> byteList = new List<byte[]>();
            for (int i = firstIndex; i <= lastIndex; i++) {
                byte[] bytes;

                lock (syncAction) {
                    bytes = File.ReadAllBytes(files[i].FullName);
                    byteList.Add(bytes);
                }
            }

            if (byteList.Count == 0) {
                return "end"u8.ToArray();
            }

            return byteList.SelectMany(o => o).ToArray();
        }
        catch (Exception ex){
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
            lock (syncAction) {
                bytes = File.ReadAllBytes(filename);
            }
            return bytes;
        }
        catch {
            return null;
        }
    }
}
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

    private static StreamWriter errorWriter;
    private static StreamWriter actionWriter;
    private static string actionWriterDate;

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
        string time = DateTime.Now.ToString(Data.DATETIME_FORMAT_FILE);
        string text = $"{time}\t{ex}";

        try {
            lock (errorMutex) {
                errorWriter ??= new StreamWriter($"{Data.DIR_LOG}{Data.DELIMITER}error.log", true, System.Text.Encoding.UTF8);
                errorWriter.WriteLine(text);
                errorWriter.Flush();
            }
        }
        catch { }

        Console.ForegroundColor = ConsoleColor.Red;
        Console.Error.WriteLine(text);
        Console.ResetColor();
    }

    public static void Action(string origin, string action) {
        ThreadPool.QueueUserWorkItem(static state => {
            var (origin, action) = ((string origin, string action))state!;

            DateTime now = DateTime.Now;
            string date = now.ToString(Data.DATETIME_FORMAT_FILE);
            string message = $"{date,-24}{origin,-32}{action}";
            lock (actionMutex) {
                try {
                    string fileDate = now.ToString(Data.DATE_FORMAT_FILE);

                    if (actionWriter is null || actionWriterDate != fileDate) {
                        actionWriter?.Dispose();
                        actionWriter = new StreamWriter(
                            $"{Data.DIR_LOG}{Data.DELIMITER}{fileDate}.log",
                            true,
                            System.Text.Encoding.UTF8
                        );
                        actionWriterDate = fileDate;
                    }

                    actionWriter.WriteLine(message);
                    actionWriter.Flush();
                }
                catch { }
            }

            Http.KeepAlive.Broadcast($"{{\"action\":\"log\",\"msg\":\"{Data.EscapeJsonText(message)}\"}}", "/log");

#if DEBUG
            string text = $"{date}\t{action}";
            Console.Error.WriteLine(text);
#endif
        }, (origin, action));
    }

    public static byte[] List(Dictionary<string, string> parameters) {
        try {
            if (parameters is null || !parameters.TryGetValue("last", out string last) || last.Length < 8) {
                return ListToday();
            }

            if (!int.TryParse(last, out _)) {
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
            int count = lastIndex - firstIndex + 1;

            FileInfo[] selectedFiles = files
                .Skip(firstIndex)
                .Take(count)
                .ToArray();

            if (selectedFiles.Length == 0) {
                return "end"u8.ToArray();
            }

            long totalLength = 0;
            for (int i = 0; i < selectedFiles.Length; i++) {
                totalLength += selectedFiles[i].Length;
            }

            byte[] result = new byte[totalLength];
            int offset = 0;

            for (int i = 0; i < selectedFiles.Length; i++) {
                byte[] chunk = File.ReadAllBytes(selectedFiles[i].FullName);
                Buffer.BlockCopy(chunk, 0, result, offset, chunk.Length);
                offset += chunk.Length;
            }

            return result;
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
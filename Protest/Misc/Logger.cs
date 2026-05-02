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

    private static readonly StreamWriter errorWriter;
    private static StreamWriter actionWriter;
    private static string actionWriterDate;

    static Logger() {
        try {
            errorWriter = new StreamWriter($"{Data.DIR_LOG}{Data.DELIMITER}error.log", true, System.Text.Encoding.UTF8);
        }
        catch (Exception ex) {
            Console.ForegroundColor = ConsoleColor.Red;
            Console.WriteLine(ex);
            Console.ResetColor();
        }
    }

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
                errorWriter.WriteLine(text);
                errorWriter.Flush();
            }
        }
        catch {
            Console.WriteLine("Failed to log");
        }

        Console.ForegroundColor = ConsoleColor.Red;
        Console.WriteLine(text);
        Console.ResetColor();
    }

    public static void Debug(Exception ex) {
        string time = DateTime.Now.ToString(Data.DATETIME_FORMAT_FILE);
        string text = $"{time}\t{ex.Message}";

        try {
            lock (errorMutex) {
                errorWriter.WriteLine(text);
                errorWriter.Flush();
            }
        }
        catch {
            Console.WriteLine("Failed to log");
        }

#if DEBUG
        Console.ForegroundColor = ConsoleColor.Yellow;
        Console.WriteLine(text);
        Console.WriteLine(ex.StackTrace);
        Console.ResetColor();
#endif
    }

    public static void Action(string origin, string category, string action) {
        ThreadPool.QueueUserWorkItem(static state => {
            var (origin, category, action) = ((string origin, string category, string action))state!;

            DateTime now = DateTime.Now;
            string date = now.ToString(Data.DATETIME_FORMAT_FILE);
            string message = $"{date,-24}{category,-20}{origin,-24}{action}";
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
                catch {
                    Console.WriteLine("Failed to log error");
                }
            }

            Http.KeepAlive.Broadcast($"{{\"action\":\"log\",\"msg\":\"{Data.EscapeJsonText(message)}\"}}", "/log");

#if DEBUG
            Console.WriteLine($"{date}\t{action}");
#endif
        }, (origin, category, action));
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

            int lastIndex = Array.FindLastIndex(files, file => String.Compare(file.Name[..8], last) < 0);
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
        catch (IOException ex) {
            Logger.Error(ex);
            return null;
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
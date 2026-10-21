using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Net;
using System.Text;
using System.Text.Json;
using Protest.Http;

namespace Protest.Protocols;

//the per device, per day log files of syslog, snmp traps and windows events
//every line starts with the utc time and the severity digit: yyyy-MM-dd HH:mm:ss.fff \t n \t ...
internal static class LogFiles {
    private const string TIMESTAMP_FORMAT = "yyyy-MM-dd HH:mm:ss.fff";
    private const int    TIMESTAMP_LENGTH = 23;
    private const int    DEFAULT_HOURS    = 24;
    private const int    MAX_HOURS        = 24 * 7;

    internal static bool IsValidFile(string file) {
        return !String.IsNullOrEmpty(file)
            && file.IndexOfAny(Path.GetInvalidFileNameChars()) < 0
            && file != "." && file != "..";
    }

    //lines per severity over the last hours, null when the device has no log folder
    internal static int[] Summary(string root, string device, int levels, int hours) {
        string directory = Path.Join(root, device);
        if (!Directory.Exists(directory)) return null;

        int[] counts = new int[levels];
        DateTime now = DateTime.UtcNow;
        DateTime from = now.AddHours(-hours);
        string cutoff = from.ToString(TIMESTAMP_FORMAT, CultureInfo.InvariantCulture);

        for (DateTime date = from.Date; date <= now.Date; date = date.AddDays(1)) {
            string path = Path.Join(directory, $"{date.ToString(Data.DATE_FORMAT_FILE, CultureInfo.InvariantCulture)}.log");

            try {
                using FileStream stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
                using StreamReader reader = new StreamReader(stream, Encoding.UTF8);

                string line;
                while ((line = reader.ReadLine()) is not null) {
                    if (line.Length < TIMESTAMP_LENGTH + 2 || line[TIMESTAMP_LENGTH] != '\t') continue;
                    if (String.CompareOrdinal(line, 0, cutoff, 0, TIMESTAMP_LENGTH) < 0) continue;

                    int severity = line[TIMESTAMP_LENGTH + 1] - '0';
                    if (severity >= 0 && severity < levels) counts[severity]++;
                }
            }
            catch (FileNotFoundException) { }
            catch (DirectoryNotFoundException) { }
            catch (Exception ex) {
                Logger.Error(ex);
            }
        }

        return counts;
    }

    //{"known":true, "counts":[...]}, known is false when the device has never logged anything
    internal static byte[] SummaryHandler(HttpListenerContext ctx, string root, int levels) {
        Dictionary<string, string> parameters = Listener.ParseQuery(ctx);
        if (parameters is null || !parameters.TryGetValue("device", out string device) || !IsValidFile(device)) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        int[] counts = Summary(root, device, levels, Hours(parameters));

        using MemoryStream ms = new MemoryStream();
        using (Utf8JsonWriter writer = new Utf8JsonWriter(ms)) {
            writer.WriteStartObject();
            WriteCounts(writer, counts, levels);
            writer.WriteEndObject();
        }
        return ms.ToArray();
    }

    internal static int Hours(Dictionary<string, string> parameters) {
        return parameters.TryGetValue("hours", out string value) && int.TryParse(value, out int hours)
            ? Math.Clamp(hours, 1, MAX_HOURS)
            : DEFAULT_HOURS;
    }

    internal static void WriteCounts(Utf8JsonWriter writer, int[] counts, int levels) {
        writer.WriteBoolean("known", counts is not null);
        writer.WriteStartArray("counts");
        for (int i = 0; i < levels; i++) writer.WriteNumberValue(counts?[i] ?? 0);
        writer.WriteEndArray();
    }
}

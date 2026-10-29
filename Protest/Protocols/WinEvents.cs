using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics.Eventing.Reader;
using System.Globalization;
using System.IO;
using System.Net;
using System.Runtime.Versioning;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;
using Protest.Http;

namespace Protest.Protocols;

//windows event log entries, pulled from the windows devices over the remote event log service
//each device keeps its own folder: a log file per day, and the last record of every event log in state.json
internal static class WinEvents {
    private const string TIMESTAMP_FORMAT    = "yyyy-MM-dd HH:mm:ss.fff";
    private const int    TIMESTAMP_LENGTH    = 23;
    private const int    FIRST_FETCH_DAYS    = 7;
    private const int    MAX_EVENTS          = 5_000;  //per event log, per fetch, the next fetch continues
    private const int    MAX_MESSAGE_LENGTH  = 4_096;
    private const int    MAX_PARALLEL        = 8;
    private const int    MIN_INTERVAL        = 300;    //seconds between two fetches of the same device
    private const int    REQUEST_WAIT        = 30;     //seconds a request waits for a fetch, it goes on in the background
    private const int    READ_TIMEOUT        = 20;     //seconds
    private const int    PING_TIMEOUT        = 1_000;  //milliseconds, per attempt
    private const int    PING_RETRIES        = 2;
    private const int    MAX_PAGE_LINES      = 2_000;
    private const long   MAX_PAGE_SCAN_BYTES = 256L * 1024 * 1024;
    private const string STATE_FILE          = "state.json";
    private const int    RPC_S_SERVER_UNAVAILABLE = 1722;

    private static readonly string[] LOGS = ["System", "Application"];
    private const string LEVELS_XPATH = "(Level=1 or Level=2 or Level=3)"; //critical, error and warning

    internal enum Severity : byte {
        Critical    = 0,
        Error       = 1,
        Warning     = 2,
        Information = 3,
        Verbose     = 4
    }

    private const int LEVELS = 5;

    internal sealed class LogState {
        public long record;  //the last record read, the next fetch asks for the ones after it
        public string time;  //round-trip utc time of the newest record, finds new records after the log is cleared
    }

    internal sealed class DeviceState {
        public Dictionary<string, LogState> logs = new Dictionary<string, LogState>();
        public string fetched; //utc time of the last attempt
        public string updated; //utc time of the last successful one, the stored entries are as of then
        public string error;   //null when it succeeded
    }

    private sealed class Device {
        public readonly Lock mutex = new Lock();
        public Task<string> task;
        public long lastStart;
    }

    private static readonly ConcurrentDictionary<string, Device> devices = new ConcurrentDictionary<string, Device>();
    private static int fetchingAll;

    private static readonly JsonWriterOptions jsonWriterOptions = new JsonWriterOptions {
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping
    };

    internal static bool IsRunning => Volatile.Read(ref fetchingAll) == 1;

    //every windows device, in the background, used by the scheduler
    internal static void StartFetchAll(string origin) {
        if (!OperatingSystem.IsWindows()) return;
        if (Interlocked.Exchange(ref fetchingAll, 1) == 1) return;

        _ = Task.Run(async () => {
            try {
                List<(string file, string host)> list = WindowsDevices();
                int failed = 0;

                await Parallel.ForEachAsync(list, new ParallelOptions { MaxDegreeOfParallelism = MAX_PARALLEL }, async (device, _) => {
                    string error = await FetchAsync(device.file, device.host);
                    if (error is not null) Interlocked.Increment(ref failed);
                });

                Logger.Action(origin, "Windows events", $"Fetched the event logs of {list.Count - failed} of {list.Count} Windows device(s)");
            }
            catch (Exception ex) {
                Logger.Error(ex);
            }
            finally {
                Volatile.Write(ref fetchingAll, 0);
            }
        });
    }

    private static List<(string file, string host)> WindowsDevices() {
        List<(string, string)> list = new List<(string, string)>();
        foreach (KeyValuePair<string, Database.Entry> pair in DatabaseInstances.devices.dictionary) {
            if (!IsWindows(pair.Value)) continue;
            string host = Host(pair.Value);
            if (host is not null) list.Add((pair.Key, host));
        }
        return list;
    }

    private static bool IsWindows(Database.Entry entry) {
        return entry.attributes.TryGetValue("operating system", out Database.Attribute os)
            && os?.value?.Contains("windows", StringComparison.OrdinalIgnoreCase) == true;
    }

    //the first ip, or the first hostname
    private static string Host(Database.Entry entry) {
        foreach (string attribute in new string[] { "ip", "hostname" }) {
            if (!entry.attributes.TryGetValue(attribute, out Database.Attribute value) || String.IsNullOrEmpty(value?.value)) continue;

            foreach (string host in value.value.Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)) {
                if (Uri.CheckHostName(host) != UriHostNameType.Unknown) return host;
            }
        }
        return null;
    }

    //joins the fetch that is already running, a recent one is not repeated. returns the error, or null
    private static Task<string> FetchAsync(string file, string host) {
        Device device = devices.GetOrAdd(file, _ => new Device());

        lock (device.mutex) {
            if (device.task is not null && !device.task.IsCompleted) return device.task;

            long now = Environment.TickCount64;
            if (device.task is not null && now - device.lastStart < MIN_INTERVAL * 1000L) return device.task;

            device.lastStart = now;
            device.task = Task.Factory.StartNew(() => Fetch(file, host), CancellationToken.None, TaskCreationOptions.LongRunning, TaskScheduler.Default);
            return device.task;
        }
    }

    private static string Fetch(string file, string host) {
        if (!OperatingSystem.IsWindows()) return "Windows events are only available when Pro-test runs on Windows";

        DeviceState state = LoadState(file);
        string error = null;

        //a host that does not reply to icmp is offline or filtered, the rpc connection would only time out
        if (!Icmp.Ping(host, PING_TIMEOUT, PING_RETRIES)) {
            error = "The device is unreachable.";
        }
        else {
            try {
                using EventLogSession session = new EventLogSession(host);
                foreach (string log in LOGS) {
                    FetchLog(session, file, log, state);
                }
            }
            catch (UnauthorizedAccessException) {
                error = "Access denied, the account Pro-test runs as needs to be a member of Event Log Readers on the device";
            }
            //the win32 code is not exposed, its message is the same text in the system language
            catch (EventLogException ex) when (ex.Message == new System.ComponentModel.Win32Exception(RPC_S_SERVER_UNAVAILABLE).Message) {
                error = $"{ex.Message.Trim()} Check that the Remote Event Log Management firewall rule is enabled on the device.";
            }
            catch (EventLogException ex) {
                error = ex.Message.Trim();
            }
            catch (Exception ex) {
                error = ex.Message.Trim();
            }
        }

        state.fetched = DateTime.UtcNow.ToString(TIMESTAMP_FORMAT, CultureInfo.InvariantCulture);
        state.error = error;
        if (error is null) state.updated = state.fetched;
        SaveState(file, state);

        return error;
    }

    [SupportedOSPlatform("windows")]
    private static void FetchLog(EventLogSession session, string file, string log, DeviceState state) {
        state.logs.TryGetValue(log, out LogState last);

        DateTime lastTime = DateTime.MinValue;
        if (last is not null && !DateTime.TryParse(last.time, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out lastTime)) {
            last = null;
        }

        //after the last record, or newer than it when the log was cleared and the record ids started over
        string xpath = last is null
            ? $"*[System[{LEVELS_XPATH} and TimeCreated[timediff(@SystemTime) <= {FIRST_FETCH_DAYS * 86_400_000L}]]]"
            : $"*[System[{LEVELS_XPATH} and (EventRecordID > {last.record} or TimeCreated[@SystemTime > '{last.time}'])]]";

        EventLogQuery query = new EventLogQuery(log, PathType.LogName, xpath) { Session = session };
        using EventLogReader reader = new EventLogReader(query);

        SortedDictionary<string, List<string>> days = new SortedDictionary<string, List<string>>(StringComparer.Ordinal);
        long lastRecord = last?.record ?? 0;
        DateTime newest = lastTime;
        int count = 0;

        while (count < MAX_EVENTS) {
            using EventRecord record = reader.ReadEvent(TimeSpan.FromSeconds(READ_TIMEOUT));
            if (record is null) break;

            long id = record.RecordId ?? 0;
            DateTime time = record.TimeCreated?.ToUniversalTime() ?? DateTime.UtcNow;
            if (last is not null && id <= last.record && time <= lastTime) continue; //already stored

            string date = time.ToString(Data.DATE_FORMAT_FILE, CultureInfo.InvariantCulture);
            if (!days.TryGetValue(date, out List<string> lines)) {
                days[date] = lines = new List<string>();
            }
            lines.Add(FormatLine(time, record, log));

            lastRecord = id;
            if (time > newest) newest = time;
            count++;
        }

        if (count == 0) return;

        WriteLines(file, days);

        state.logs[log] = new LogState {
            record = lastRecord,
            time   = newest.ToString("o", CultureInfo.InvariantCulture)
        };
    }

    //time \t severity \t log \t record \t source \t event id \t task \t message
    [SupportedOSPlatform("windows")]
    private static string FormatLine(DateTime time, EventRecord record, string log) {
        StringBuilder builder = new StringBuilder(256);
        builder.Append(time.ToString(TIMESTAMP_FORMAT, CultureInfo.InvariantCulture)).Append('\t');
        builder.Append((char)('0' + (int)ToSeverity(record.Level))).Append('\t');
        AppendEscaped(builder, log).Append('\t');
        builder.Append(record.RecordId ?? 0).Append('\t');
        AppendEscaped(builder, record.ProviderName ?? String.Empty).Append('\t');
        builder.Append(record.Id).Append('\t');
        AppendEscaped(builder, TaskName(record)).Append('\t');
        AppendEscaped(builder, Message(record));
        return builder.ToString();
    }

    private static Severity ToSeverity(byte? level) => level switch {
        1 => Severity.Critical,
        2 => Severity.Error,
        3 => Severity.Warning,
        5 => Severity.Verbose,
        _ => Severity.Information //4, and 0 for log always
    };

    [SupportedOSPlatform("windows")]
    private static string TaskName(EventRecord record) {
        try {
            return record.TaskDisplayName ?? String.Empty;
        }
        catch {
            return String.Empty;
        }
    }

    //the rendered description, or the raw event data when the source's message file is not available
    [SupportedOSPlatform("windows")]
    private static string Message(EventRecord record) {
        string message = null;
        try {
            message = record.FormatDescription();
        }
        catch { }

        if (String.IsNullOrWhiteSpace(message)) {
            try {
                message = String.Join("; ", record.Properties.Select(o => o.Value?.ToString()).Where(o => !String.IsNullOrWhiteSpace(o)));
            }
            catch {
                message = String.Empty;
            }
        }

        message = message.Replace("\r\n", "\n").Trim();
        return message.Length > MAX_MESSAGE_LENGTH ? message[..MAX_MESSAGE_LENGTH] : message;
    }

    private static StringBuilder AppendEscaped(StringBuilder builder, string value) {
        for (int i = 0; i < value.Length; i++) {
            char c = value[i];
            switch (c) {
            case '\\': builder.Append("\\\\"); break;
            case '\t': builder.Append("\\t");  break;
            case '\n': builder.Append("\\n");  break;
            case '\r': builder.Append("\\r");  break;
            default:
                if (c < 0x20 || c == 0x7f) builder.Append(' ');
                else builder.Append(c);
                break;
            }
        }
        return builder;
    }

    private static void WriteLines(string file, SortedDictionary<string, List<string>> days) {
        string directory = Path.Join(Data.DIR_WIN_EVENTS, file);
        Directory.CreateDirectory(directory);

        foreach (KeyValuePair<string, List<string>> pair in days) {
            using FileStream stream = new FileStream(Path.Join(directory, $"{pair.Key}.log"), FileMode.Append, FileAccess.Write, FileShare.ReadWrite | FileShare.Delete);
            using StreamWriter writer = new StreamWriter(stream, new UTF8Encoding(false));
            foreach (string line in pair.Value) {
                writer.WriteLine(line);
            }
        }
    }

    private static DeviceState LoadState(string file) {
        try {
            string path = Path.Join(Data.DIR_WIN_EVENTS, file, STATE_FILE);
            if (File.Exists(path)) {
                DeviceState state = JsonSerializer.Deserialize(File.ReadAllBytes(path), WinEventsJsonContext.Default.DeviceState);
                if (state is not null) {
                    state.logs ??= new Dictionary<string, LogState>();
                    return state;
                }
            }
        }
        catch (Exception ex) {
            Logger.Error(ex);
        }
        return new DeviceState();
    }

    private static void SaveState(string file, DeviceState state) {
        try {
            string directory = Path.Join(Data.DIR_WIN_EVENTS, file);
            Directory.CreateDirectory(directory);
            File.WriteAllBytes(Path.Join(directory, STATE_FILE), JsonSerializer.SerializeToUtf8Bytes(state, WinEventsJsonContext.Default.DeviceState));
        }
        catch (Exception ex) {
            Logger.Error(ex);
        }
    }

    //fetches one device, waits for a while and then lets it go on in the background
    //{"status":"done|pending|skipped", "error":"..."}
    internal static async Task<byte[]> FetchHandlerAsync(HttpListenerContext ctx) {
        Dictionary<string, string> parameters = Listener.ParseQuery(ctx);
        if (parameters is null || !parameters.TryGetValue("device", out string file) || !LogFiles.IsValidFile(file)) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        string status, error = null;

        if (!OperatingSystem.IsWindows()) {
            status = "skipped";
            error = "Windows events are only available when Pro-test runs on Windows";
        }
        else if (!DatabaseInstances.devices.dictionary.TryGetValue(file, out Database.Entry entry) || !IsWindows(entry) || Host(entry) is not string host) {
            status = "skipped";
        }
        else {
            try {
                error = await FetchAsync(file, host).WaitAsync(TimeSpan.FromSeconds(REQUEST_WAIT));
                status = "done";
            }
            catch (TimeoutException) {
                status = "pending";
            }
        }

        using MemoryStream ms = new MemoryStream();
        using (Utf8JsonWriter writer = new Utf8JsonWriter(ms, jsonWriterOptions)) {
            writer.WriteStartObject();
            writer.WriteString("status", status);
            writer.WriteString("error", error);
            writer.WriteEndObject();
        }
        return ms.ToArray();
    }

    //{"known":true, "counts":[...], "fetched":"...", "updated":"...", "error":"..."}
    internal static byte[] SummaryHandler(HttpListenerContext ctx) {
        Dictionary<string, string> parameters = Listener.ParseQuery(ctx);
        if (parameters is null || !parameters.TryGetValue("device", out string file) || !LogFiles.IsValidFile(file)) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        int[] counts = LogFiles.Summary(Data.DIR_WIN_EVENTS, file, LEVELS, LogFiles.Hours(parameters));
        DeviceState state = counts is null ? null : LoadState(file);

        using MemoryStream ms = new MemoryStream();
        using (Utf8JsonWriter writer = new Utf8JsonWriter(ms, jsonWriterOptions)) {
            writer.WriteStartObject();
            LogFiles.WriteCounts(writer, counts, LEVELS);
            writer.WriteString("fetched", state?.fetched);
            writer.WriteString("updated", state?.updated);
            writer.WriteString("error", state?.error);
            writer.WriteEndObject();
        }
        return ms.ToArray();
    }

    internal static byte[] ListDevices() {
        try {
            DirectoryInfo dir = new DirectoryInfo(Data.DIR_WIN_EVENTS);
            string[] files = dir.Exists
                ? dir.GetDirectories().Select(o => o.Name).Order(StringComparer.Ordinal).ToArray()
                : Array.Empty<string>();
            return JsonSerializer.SerializeToUtf8Bytes(files, WinEventsJsonContext.Default.StringArray);
        }
        catch (Exception ex) {
            Logger.Error(ex);
            return Data.CODE_FAILED.Array;
        }
    }

    private readonly record struct Row(string time, string device, int index, string line);

    private static int CompareRowsDescending(Row a, Row b) {
        int c = String.CompareOrdinal(b.time, a.time);
        if (c != 0) return c;
        c = String.CompareOrdinal(b.device, a.device);
        if (c != 0) return c;
        return b.index.CompareTo(a.index);
    }

    private static bool IsTimestamp(string value) {
        return value is not null
            && value.Length == TIMESTAMP_LENGTH
            && DateTime.TryParseExact(value, TIMESTAMP_FORMAT, CultureInfo.InvariantCulture, DateTimeStyles.None, out _);
    }

    private static bool IsDigits(string value) {
        for (int i = 0; i < value.Length; i++) {
            if (!char.IsAsciiDigit(value[i])) return false;
        }
        return true;
    }

    //pages back in time, newest first. "before" is inclusive: "skip" counts the lines at exactly "before" that were already returned
    internal static byte[] ListHandler(HttpListenerContext ctx) {
        Dictionary<string, string> parameters = Listener.ParseQuery(ctx) ?? new Dictionary<string, string>();

        parameters.TryGetValue("before", out string before);
        parameters.TryGetValue("device", out string device);
        parameters.TryGetValue("q", out string query);

        if (!IsTimestamp(before)) before = null;

        int skip = parameters.TryGetValue("skip", out string skipString) && int.TryParse(skipString, out int s) ? Math.Max(0, s) : 0;
        if (before is null) skip = 0;

        //severity levels to include, as digits, e.g. "012"
        int levelMask = (1 << LEVELS) - 1;
        if (parameters.TryGetValue("levels", out string levelsString)) {
            levelMask = 0;
            for (int i = 0; i < levelsString.Length; i++) {
                if (levelsString[i] >= '0' && levelsString[i] < '0' + LEVELS) levelMask |= 1 << (levelsString[i] - '0');
            }
        }

        int limit = parameters.TryGetValue("limit", out string limitString) && int.TryParse(limitString, out int l)
            ? Math.Clamp(l, 1, MAX_PAGE_LINES)
            : MAX_PAGE_LINES;

        if (String.IsNullOrWhiteSpace(device)) device = null;
        else if (!LogFiles.IsValidFile(device)) return Data.CODE_INVALID_ARGUMENT.Array;

        if (String.IsNullOrWhiteSpace(query)) query = null;

        try {
            //collect date files of the relevant devices
            SortedDictionary<string, List<(string device, string path)>> dates = new SortedDictionary<string, List<(string, string)>>(StringComparer.Ordinal);

            DirectoryInfo root = new DirectoryInfo(Data.DIR_WIN_EVENTS);
            DirectoryInfo[] directories = !root.Exists ? Array.Empty<DirectoryInfo>()
                : device is null ? root.GetDirectories()
                : Directory.Exists(Path.Join(Data.DIR_WIN_EVENTS, device)) ? [new DirectoryInfo(Path.Join(Data.DIR_WIN_EVENTS, device))]
                : Array.Empty<DirectoryInfo>();

            string upperDate = before?[..10].Replace("-", String.Empty);

            foreach (DirectoryInfo directory in directories) {
                foreach (FileInfo file in directory.GetFiles("*.log")) {
                    string date = Path.GetFileNameWithoutExtension(file.Name);
                    if (date.Length != 8 || !IsDigits(date)) continue;
                    if (upperDate is not null && String.CompareOrdinal(date, upperDate) > 0) continue;

                    if (!dates.TryGetValue(date, out List<(string, string)> list)) {
                        dates[date] = list = new List<(string, string)>();
                    }
                    list.Add((directory.Name, file.FullName));
                }
            }

            string[] orderedDates = dates.Keys.Reverse().ToArray();
            int keep = limit + skip + 1; //one extra to tell if there are more
            List<Row> rows = new List<Row>();
            long scanned = 0;
            int dateIndex = 0;
            bool budgetExceeded = false;

            for (; dateIndex < orderedDates.Length; dateIndex++) {
                List<Row> dayRows = new List<Row>();

                foreach ((string dev, string path) in dates[orderedDates[dateIndex]]) {
                    scanned += ScanFile(dev, path, before, levelMask, query, dayRows, keep);
                }

                dayRows.Sort(CompareRowsDescending);
                rows.AddRange(dayRows);

                if (rows.Count >= keep) {
                    dateIndex++;
                    break;
                }

                if (scanned > MAX_PAGE_SCAN_BYTES) {
                    dateIndex++;
                    budgetExceeded = true;
                    break;
                }
            }

            //drop the lines at "before" that the client already has
            if (skip > 0) {
                int skipped = 0;
                rows.RemoveAll(o => o.time == before && skipped++ < skip);
            }

            List<Row> page = rows.Count > limit ? rows.GetRange(0, limit) : rows;
            bool hasMoreDates = dateIndex < orderedDates.Length;

            string nextBefore = null;
            int nextSkip = 0;
            bool end;

            if (page.Count == limit && (rows.Count > limit || hasMoreDates)) {
                nextBefore = page[^1].time;
                nextSkip = page.Count(o => o.time == nextBefore) + (nextBefore == before ? skip : 0);
                end = false;
            }
            else if (budgetExceeded && hasMoreDates) {
                //resume from the end of the next date that was not scanned
                string nextDate = orderedDates[dateIndex];
                nextBefore = $"{nextDate[..4]}-{nextDate[4..6]}-{nextDate[6..8]} 23:59:59.999";
                nextSkip = 0;
                end = false;
            }
            else {
                end = true;
            }

            using MemoryStream ms = new MemoryStream();
            using (Utf8JsonWriter writer = new Utf8JsonWriter(ms, jsonWriterOptions)) {
                writer.WriteStartObject();
                writer.WriteStartArray("lines");
                for (int i = page.Count - 1; i >= 0; i--) { //oldest first
                    writer.WriteStringValue($"{page[i].device}\t{page[i].line}");
                }
                writer.WriteEndArray();
                writer.WriteString("before", nextBefore);
                writer.WriteNumber("skip", nextSkip);
                writer.WriteBoolean("end", end);
                writer.WriteEndObject();
            }

            return ms.ToArray();
        }
        catch (Exception ex) {
            Logger.Error(ex);
            return Data.CODE_FAILED.Array;
        }
    }

    private static long ScanFile(string device, string path, string before, int levelMask, string query, List<Row> rows, int keep) {
        long length = 0;

        try {
            using FileStream stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
            length = stream.Length;
            using StreamReader reader = new StreamReader(stream, Encoding.UTF8);

            int index = 0;
            int trimAt = Math.Max(keep * 2, keep + 4096);
            string line;

            while ((line = reader.ReadLine()) is not null) {
                index++;

                //skip malformed and partially written lines
                if (line.Length < TIMESTAMP_LENGTH + 4 || line[TIMESTAMP_LENGTH] != '\t' || line[TIMESTAMP_LENGTH + 2] != '\t') continue;
                if (line.AsSpan().Count('\t') < 7) continue;

                int severity = line[TIMESTAMP_LENGTH + 1] - '0';
                if (severity < 0 || severity >= LEVELS || (levelMask & (1 << severity)) == 0) continue;

                if (before is not null && String.CompareOrdinal(line, 0, before, 0, TIMESTAMP_LENGTH) > 0) continue;

                //match on log, record, source, event id, task and message
                if (query is not null && !line.AsSpan(TIMESTAMP_LENGTH + 3).Contains(query, StringComparison.OrdinalIgnoreCase)) continue;

                rows.Add(new Row(line[..TIMESTAMP_LENGTH], device, index, line));

                if (rows.Count > trimAt) {
                    rows.Sort(CompareRowsDescending);
                    rows.RemoveRange(keep, rows.Count - keep);
                }
            }
        }
        catch (FileNotFoundException) { }
        catch (DirectoryNotFoundException) { }
        catch (Exception ex) {
            Logger.Error(ex);
        }

        return length;
    }

    internal static int DeleteOlderThan(int days) {
        days = Math.Max(days, DataRetention.MIN_DAYS);
        int deletedCount = 0;

        try {
            DirectoryInfo root = new DirectoryInfo(Data.DIR_WIN_EVENTS);
            if (!root.Exists) return 0;

            DateTime cutoff = DateTime.UtcNow.AddDays(-days).Date;

            foreach (DirectoryInfo directory in root.GetDirectories()) {
                int remaining = 0;

                foreach (FileInfo file in directory.GetFiles("*.log")) {
                    string datePart = Path.GetFileNameWithoutExtension(file.Name);
                    if (!DateTime.TryParseExact(datePart, Data.DATE_FORMAT_FILE, CultureInfo.InvariantCulture, DateTimeStyles.None, out DateTime fileDate)) {
                        continue;
                    }

                    if (fileDate >= cutoff) {
                        remaining++;
                        continue;
                    }

                    try {
                        file.Delete();
                        deletedCount++;
                    }
                    catch (Exception ex) {
                        remaining++;
                        Logger.Error(ex);
                    }
                }

                //nothing left, the next fetch starts over from the last days
                if (remaining == 0) {
                    try {
                        directory.Delete(true);
                    }
                    catch { }
                }
            }
        }
        catch (Exception ex) {
            Logger.Error(ex);
        }

        return deletedCount;
    }
}

[JsonSourceGenerationOptions(IncludeFields = true)]
[JsonSerializable(typeof(WinEvents.DeviceState))]
[JsonSerializable(typeof(string[]))]
internal partial class WinEventsJsonContext : JsonSerializerContext {}

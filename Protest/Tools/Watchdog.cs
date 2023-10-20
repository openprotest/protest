using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Net.Http;
using System.Net.Security;
using System.Security.Cryptography.X509Certificates;

namespace Protest.Tools;

internal static class Watchdog {
    private const long WEEK_IN_TICKS        = 6_048_000_000_000L;
    private const long FIVE_MINUTE_IN_TICKS = 3_000_000_000L;
    private const long MINUTE_IN_TICKS      = 600_000_000L;
    private const int  FIVE_MINUTE_IN_MILLI = 300_000;

    public enum WatcherType {
        icmp,
        tcp,
        dns,
        http,
        httpKeyword,
        tls
    }

    public record Watcher {
        public string file;
        public bool enable;
        public WatcherType type;
        public string name;
        public string target;
        public int port;
        public int timeout;
        public string method;
        public string keyword;
        public string query;
        public bool[] httpstatus;
        public Protocols.Dns.RecordType rrtype;

        public int interval;
        public int retries;

        public long lastCheck;
        public object sync;
    }

    public static TaskWrapper task;
    private static readonly ConcurrentDictionary<string, Watcher> watchers = new ConcurrentDictionary<string, Watcher>();

    public static void Initialize() {
        DirectoryInfo dir = new DirectoryInfo(Data.DIR_WATCHDOG);
        if (!dir.Exists) {
            return;
        }

        JsonSerializerOptions options = new JsonSerializerOptions();
        options.Converters.Add(new WatcherJsonConverter());

        FileInfo[] files = dir.GetFiles();
        for (int i = 0; i < files.Length; i++) {
            try {
                string plain = File.ReadAllText(files[i].FullName);
                Watcher watcher = JsonSerializer.Deserialize<Watcher>(plain, options);
                watchers.TryAdd(files[i].Name, watcher);
            }
            catch { }
        }

        if (!watchers.IsEmpty) {
            StartTask();
        }
    }

    public static bool StartTask() {
        if (task is not null) return false;

        Thread thread = new Thread(()=> {
            //align time to the next 5-min interval
            long gap = (FIVE_MINUTE_IN_TICKS - DateTime.UtcNow.Ticks % FIVE_MINUTE_IN_TICKS) / 10_000;
            Thread.Sleep((int)gap);

            while (true) {
                long startTimeStamp = DateTime.UtcNow.Ticks;
                int nextSleep = FIVE_MINUTE_IN_MILLI;

                foreach (Watcher watcher in watchers.Values) {
                    if (!watcher.enable) continue;

                    long ticksElapsed = DateTime.UtcNow.Ticks - watcher.lastCheck;
                    if (watcher.interval * MINUTE_IN_TICKS - ticksElapsed < 10_000_000) { // < 1s

                        watcher.lastCheck = DateTime.UtcNow.Ticks;
                        new Thread(()=> {
                            switch (watcher.type) {
                            case WatcherType.icmp        : CheckIcmp(watcher);        break;
                            case WatcherType.tcp         : CheckTcp(watcher);         break;
                            case WatcherType.dns         : CheckDns(watcher);         break;
                            case WatcherType.http        : CheckHttp(watcher);        break;
                            case WatcherType.httpKeyword : CheckHttpKeyword(watcher); break;
                            case WatcherType.tls         : CheckTls(watcher);         break;
                            }
                        }).Start();
                    }
                    else {
                        int millisRemain = (int)(ticksElapsed / 10_000);
                        if (nextSleep > millisRemain) {
                            nextSleep = millisRemain;
                        }
                    }
                }

                Thread.Sleep(nextSleep - (int)(DateTime.UtcNow.Ticks - startTimeStamp) / 10_000);

                if (task.cancellationToken.IsCancellationRequested) {
                    task.Dispose();
                    task = null;
                    return;
                }
            }
        });

        task = new TaskWrapper("Watchdog") {
            thread = thread,
            initiator = "system",
            TotalSteps = 0,
            CompletedSteps = 0
        };
        task.thread.Start();

        return true;
    }

    public static bool StopTask(string initiator) {
        if (task is null) return false;
        task.RequestCancel(initiator);
        return true;
    }

    private static short CheckIcmp(Watcher watcher) {
        Ping ping = new Ping();
        short result = -1;

        for (int i = 0; i < watcher.retries; i++) {
            try {
                PingReply reply = ping.Send(watcher.target, watcher.timeout);

                if (reply.Status != IPStatus.Success) continue;

                result = (short)reply.RoundtripTime;
                break;
            }
            catch (Exception ex) when (ex is not PlatformNotSupportedException) { }
        }

        WriteResult(watcher, result);
        return result;
    }

    private static short CheckTcp(Watcher watcher) {
        short result = -1;
        for (int i = 0; i < watcher.retries; i++) {
            try {
                using TcpClient client = new TcpClient();
                client.Connect(watcher.target, watcher.port);

                if (!client.Connected) {
                    client.Close();
                    continue;
                }

                client.Close();
                result = 0;
                break;
            }
            catch {}
        }

        WriteResult(watcher, result);
        return result;
    }

    private static short CheckDns(Watcher watcher) {
        short result = -1;
        for (int i = 0; i < watcher.retries; i++) {
            Protocols.Dns.Resolve(
                new string[] { watcher.query},
                watcher.target,
                watcher.timeout,
                out ushort answerCount,
                out ushort authorityCount,
                out ushort additionalCount,
                Protocols.Dns.TransportMethod.auto,
                watcher.rrtype);

            if (answerCount + authorityCount + additionalCount == 0) continue;

            result = 0;
            break;
        }

        WriteResult(watcher, result);
        return result;
    }

    private static short CheckHttp(Watcher watcher) {
        short result = -1;
        for (int i = 0; i < watcher.retries; i++) {
            try {
                using HttpClient client = new HttpClient();
                HttpResponseMessage response = watcher.method switch {
                    "GET"    => client.GetAsync(watcher.target).Result,
                    "POST"   => client.PostAsync(watcher.target, null).Result,
                    "PUT"    => client.PutAsync(watcher.target, null).Result,
                    "PATCH"  => client.PatchAsync(watcher.target, null).Result,
                    "DELETE" => client.DeleteAsync(watcher.target).Result,
                    _        => client.GetAsync(watcher.target).Result,
                };

                int statusCode = (int)response.StatusCode;
                int category = statusCode / 100 - 1;

                if (watcher.httpstatus.Length < category) continue;
                if (!watcher.httpstatus[category]) continue;

                result = 0;
                break;
            }
            catch { }
        }

        WriteResult(watcher, result);
        return result;
    }

    private static short CheckHttpKeyword(Watcher watcher) {
        using HttpClient client = new HttpClient();
        short result = -1;

        for (int i = 0; i < watcher.retries; i++) {
            try {
                HttpResponseMessage response = watcher.method switch {
                    "GET"    => client.GetAsync(watcher.target).Result,
                    "POST"   => client.PostAsync(watcher.target, null).Result,
                    "PUT"    => client.PutAsync(watcher.target, null).Result,
                    "PATCH"  => client.PatchAsync(watcher.target, null).Result,
                    "DELETE" => client.DeleteAsync(watcher.target).Result,
                    _        => client.GetAsync(watcher.target).Result,
                };

                int statusCode = (int)response.StatusCode;
                int category = statusCode / 100 - 1;

                if (watcher.httpstatus.Length < category) continue;
                if (!watcher.httpstatus[category]) continue;
                if (!response.Content.ReadAsStringAsync().Result.Contains(watcher.keyword, StringComparison.OrdinalIgnoreCase)) continue;

                result = 0;
                break;
            }
            catch { }
        }

        WriteResult(watcher, result);
        return result;
    }

    private static short CheckTls(Watcher watcher) {
        short result = -1;

        using HttpClientHandler handler = new HttpClientHandler();
        handler.ServerCertificateCustomValidationCallback = (HttpRequestMessage request, X509Certificate2 cert, X509Chain chain, SslPolicyErrors errors) => {
            long now = DateTime.UtcNow.Ticks;
            if (cert.NotBefore.Ticks > now) { //not yet valid
                result = -4;
            }
            else if (cert.NotAfter.Ticks < now) { //expired
                result = -2;
            }
            else if (cert.NotAfter.Ticks < now + WEEK_IN_TICKS) { //7 days warning
                result = -3;
            }
            else { //valid
                result = 0;
            }

            return errors == SslPolicyErrors.None;
        };

        for (int i = 0; i < watcher.retries; i++) {
            try {
                using  HttpClient client = new HttpClient(handler);
                using  HttpResponseMessage response = client.GetAsync(watcher.target).Result;
            } catch { }

            if (result == short.MaxValue) continue;
            break;
        }

        WriteResult(watcher, result);
        return result;
    }

    private static bool WriteResult(Watcher watcher, short result) {
        DateTime now = DateTime.Now;
        string dir = $"{Data.DIR_WATCHDOG}{Data.DELIMITER}{watcher.file}_";
        string path = $"{dir}{Data.DELIMITER}{now.ToString(Data.DATE_FORMAT_FILE)}";
        lock (watcher.sync) {
            try {
                if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);

                using FileStream stream = new FileStream(path, FileMode.Append);
                using BinaryWriter writer = new BinaryWriter(stream, Encoding.UTF8, false);
                writer.Write(now.Ticks); //8 bytes
                writer.Write(result); //2 bytes
                stream.Close();

                return true;
            }
            catch (Exception ex) {
                Logger.Error(ex);
                return false;
            }
        }
    }

    public static byte[] List() {
        StringBuilder builder = new StringBuilder();
        builder.Append('[');

        JsonSerializerOptions options = new JsonSerializerOptions();
        options.Converters.Add(new WatcherJsonConverter());

        bool first = true;
        foreach (Watcher watcher in watchers.Values) {
            if (!first) builder.Append(',');
            builder.Append(JsonSerializer.Serialize<Watcher>(watcher, options));
            first = false;
        }

        builder.Append(']');

        return Encoding.UTF8.GetBytes(builder.ToString());
    }

    public static byte[] View(Dictionary<string, string> parameters) {
        if (parameters == null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        if (!parameters.TryGetValue("date", out string date)) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        if (parameters.TryGetValue("file", out string file)) { //single file
            try {
                string filename = $"{Data.DIR_WATCHDOG}{Data.DELIMITER}{file}_{Data.DELIMITER}{date}";
                if (!File.Exists(filename)) {
                    return Encoding.UTF8.GetBytes($"{{\"{file}\":null}}");
                }

                StringBuilder builder = new StringBuilder();
                builder.Append($"\"{file}\":");

                builder.Append('{');
                //TODO:
                builder.Append('}');

                File.ReadAllBytes(file);
                return Encoding.UTF8.GetBytes(builder.ToString());
            }
            catch {
                return "{}"u8.ToArray();
            }
        }
        else { //if no file, send all files
            try {
                StringBuilder builder = new StringBuilder();

                builder.Append('{');

                bool first = true;
                foreach (Watcher watcher in watchers.Values) {
                    if (!first) builder.Append(',');

                    builder.Append($"\"{watcher.file}\":");

                    try {
                        string filename = $"{Data.DIR_WATCHDOG}{Data.DELIMITER}{watcher.file}_{Data.DELIMITER}{date}";
                        if (!File.Exists(filename)) {
                            builder.Append("{}");
                            first = false;
                            continue;
                        }

                        byte[] bytes = File.ReadAllBytes(filename);
                        builder.Append('{');
                        //TODO:
                        builder.Append('}');

                        first = false;
                    }
                    catch {
                        builder.Append("{}");
                    }
                }

                builder.Append('}');

                return Encoding.UTF8.GetBytes(builder.ToString());
            }
            catch {
                return "{}"u8.ToArray();
            }
        }
    }

    public static byte[] Create(Dictionary<string, string> parameters, HttpListenerContext ctx, string initiator) {
        StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding);
        string watcherString = reader.ReadToEnd();

        if (parameters is null || !parameters.TryGetValue("file", out string file) || file is null) {
            file = Database.GenerateFilename();
        }

        JsonSerializerOptions options = new JsonSerializerOptions();
        options.Converters.Add(new WatcherJsonConverter());

        try {
            bool exists = File.Exists($"{Data.DIR_WATCHDOG}{Data.DELIMITER}{file}");
            Watcher watcher = JsonSerializer.Deserialize<Watcher>(watcherString, options);
            watcher.file = file;

            byte[] content = JsonSerializer.SerializeToUtf8Bytes(watcher, options);

            File.WriteAllBytes($"{Data.DIR_WATCHDOG}{Data.DELIMITER}{file}", content);

            DirectoryInfo dirInfo = new DirectoryInfo($"{Data.DIR_WATCHDOG}{Data.DELIMITER}{file}_");
            if (!dirInfo.Exists) {
                dirInfo.Create();
            }

            watchers[file] = watcher;

            if (exists) {
                Logger.Action(initiator, $"Modify a watcher: {file}");
            }
            else {
                Logger.Action(initiator, $"Create a new watcher: {file}");
            }

            return content;
        }
        catch (Exception ex) {
            Logger.Error(ex);
            return Data.CODE_FAILED.Array;
        }
    }

    public static byte[] Delete(Dictionary<string, string> parameters, string initiator) {
        if (parameters == null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        parameters.TryGetValue("file", out string file);

        try {
            if (!watchers.Remove(file, out Watcher watcher)) {
                return Data.CODE_FILE_NOT_FOUND.Array;
            }

            lock(watcher.sync) {
                Directory.Delete($"{Data.DIR_WATCHDOG}{Data.DELIMITER}{file}_", true);
                File.Delete($"{Data.DIR_WATCHDOG}{Data.DELIMITER}{file}");
            }

            if (task?.status == TaskWrapper.TaskStatus.running) {
                StopTask(initiator);
            }
        }
        catch (Exception ex) {
            Logger.Error(ex);
            return Data.CODE_FAILED.Array;
        }
        finally {
            Logger.Action(initiator, $"Delete watcher: {file}");
        }

        return Data.CODE_OK.Array;
    }
}

file sealed class WatcherJsonConverter : JsonConverter<Watchdog.Watcher> {
    public override Watchdog.Watcher Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) {
        Watchdog.Watcher watcher = new Watchdog.Watcher();

        while (reader.Read()) {
            if (reader.TokenType == JsonTokenType.EndObject) {
                break;
            }

            if (reader.TokenType == JsonTokenType.PropertyName) {
                string propertyName = reader.GetString();
                reader.Read();

                switch (propertyName) {
                case "file"    : watcher.file    = reader.GetString();  break;
                case "enable"  : watcher.enable  = reader.GetBoolean(); break;
                case "name"    : watcher.name    = reader.GetString();  break;
                case "target"  : watcher.target  = reader.GetString();  break;
                case "port"    : watcher.port    = reader.GetInt32();   break;
                case "timeout" : watcher.timeout = Math.Max(reader.GetInt32(), 5);   break;
                case "method"  : watcher.method  = reader.GetString();  break;
                case "keyword" : watcher.keyword = reader.GetString();  break;
                case "query"   : watcher.query   = reader.GetString();  break;

                case "type":
                    string typeString = reader.GetString().ToUpper();
                    watcher.type = typeString switch {
                        "ICMP"         => Watchdog.WatcherType.icmp,
                        "TCP"          => Watchdog.WatcherType.tcp,
                        "DNS"          => Watchdog.WatcherType.dns,
                        "HTTP"         => Watchdog.WatcherType.http,
                        "HTTP KEYWORD" => Watchdog.WatcherType.httpKeyword,
                        "TLS"          => Watchdog.WatcherType.tls,
                        _              => Watchdog.WatcherType.icmp,
                    };
                    break;

                case "rrtype":
                    string rrtypeString = reader.GetString().ToUpper();
                    watcher.rrtype = rrtypeString switch {
                        "A"     => Protocols.Dns.RecordType.A,
                        "NS"    => Protocols.Dns.RecordType.NS,
                        "CNAME" => Protocols.Dns.RecordType.CNAME,
                        "SOA"   => Protocols.Dns.RecordType.SOA,
                        "PTR"   => Protocols.Dns.RecordType.PTR,
                        "MX"    => Protocols.Dns.RecordType.MX,
                        "TXT"   => Protocols.Dns.RecordType.TXT,
                        "AAAA"  => Protocols.Dns.RecordType.AAAA,
                        "SRV"   => Protocols.Dns.RecordType.SRV,
                        _       => Protocols.Dns.RecordType.A,
                    };
                    break;

                case "httpstatus":
                    List<bool> httpStatusList = new List<bool>();
                    while (reader.Read() && reader.TokenType != JsonTokenType.EndArray) {
                        httpStatusList.Add(reader.GetBoolean());
                    }
                    watcher.httpstatus = httpStatusList.ToArray();
                    break;

                case "interval" : watcher.interval = reader.GetInt32(); break;
                case "retries"  : watcher.retries  = reader.GetInt32(); break;
                }
            }
        }

        watcher.sync = new object();

        return watcher;
    }

    public override void Write(Utf8JsonWriter writer, Watchdog.Watcher value, JsonSerializerOptions options) {
        writer.WriteStartObject();

        writer.WriteString("file"u8,    value.file);
        writer.WriteBoolean("enable"u8, value.enable);
        writer.WriteString("name"u8,    value.name);
        writer.WriteString("target"u8,  value.target);
        writer.WriteNumber("port"u8,    value.port);
        writer.WriteNumber("timeout"u8, value.timeout);
        writer.WriteString("method"u8,  value.method);
        writer.WriteString("keyword"u8, value.keyword);
        writer.WriteString("query"u8,   value.query);

        writer.WriteString("type"u8, value.type switch {
            Watchdog.WatcherType.icmp        => "ICMP",
            Watchdog.WatcherType.tcp         => "TCP",
            Watchdog.WatcherType.dns         => "DNS",
            Watchdog.WatcherType.http        => "HTTP",
            Watchdog.WatcherType.httpKeyword => "HTTP keyword",
            Watchdog.WatcherType.tls         => "TLS",
            _ => "ICMP"
        });

        writer.WriteString("rrtype"u8, value.rrtype switch {
            Protocols.Dns.RecordType.A     => "A",
            Protocols.Dns.RecordType.NS    => "NS",
            Protocols.Dns.RecordType.CNAME => "CNAME",
            Protocols.Dns.RecordType.SOA   => "SOA",
            Protocols.Dns.RecordType.PTR   => "PTR",
            Protocols.Dns.RecordType.MX    => "MX",
            Protocols.Dns.RecordType.TXT   => "TXT",
            Protocols.Dns.RecordType.AAAA  => "AAAA",
            Protocols.Dns.RecordType.SRV   => "SRV",
            _ => "A"
        });

        writer.WritePropertyName("httpstatus"u8);
        writer.WriteStartArray();
        if (value.httpstatus is not null) {
            for (int i = 0; i < value.httpstatus.Length; i++) {
                writer.WriteBooleanValue(value.httpstatus[i]);
            }
        }
        writer.WriteEndArray();

        writer.WriteNumber("interval"u8, value.interval);
        writer.WriteNumber("retries"u8, value.retries);

        writer.WriteEndObject();
    }
}
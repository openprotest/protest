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
using System.Net.Mail;
using System.Security.Cryptography.X509Certificates;

namespace Protest.Tools;

internal static class Watchdog {
    private const long UNIX_BASE_TICKS      = 621_355_968_000_000_000L;
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

    public enum NotifyOn {
        rise = 0,
        fall = 1,
        both = 2
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
        public short lastStatus = short.MinValue;

        public object sync;
    }

    public record Notification {
        public string name;
        public SmtpProfiles.Profile smtpProfile;
        public NotifyOn notify;
        public string[] recipients;
        public string[] watchers;
    }

    public static TaskWrapper task;
    private static readonly ConcurrentDictionary<string, Watcher> watchers = new ConcurrentDictionary<string, Watcher>();
    private static ConcurrentBag<Notification> notifications = new ConcurrentBag<Notification>();

    public static void Initialize() {
        DirectoryInfo dirWatchers = new DirectoryInfo(Data.DIR_WATCHDOG);
        if (dirWatchers.Exists) {
            JsonSerializerOptions options = new JsonSerializerOptions();
            options.Converters.Add(new WatcherJsonConverter());

            FileInfo[] files = dirWatchers.GetFiles();
            for (int i = 0; i < files.Length; i++) {
                try {
                    string plain = File.ReadAllText(files[i].FullName);
                    Watcher watcher = JsonSerializer.Deserialize<Watcher>(plain, options);
                    watchers.TryAdd(files[i].Name, watcher);
                }
                catch { }
            }
        }

        FileInfo fileNotifications = new FileInfo(Data.FILE_NOTIFICATIONS);
        if (fileNotifications.Exists) {
            JsonSerializerOptions options = new JsonSerializerOptions();
            options.Converters.Add(new NotificationJsonConverter());
            
            try {
                string plain = File.ReadAllText(fileNotifications.FullName);
                notifications = JsonSerializer.Deserialize<ConcurrentBag<Notification>>(plain, options);
            }
            catch (Exception ex) {
                Logger.Error(ex);
            }
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

                SmtpProfiles.Profile[] smtpProfiles =  SmtpProfiles.Load();

                foreach (Watcher watcher in watchers.Values) {
                    if (!watcher.enable) continue;

                    long ticksElapsed = DateTime.UtcNow.Ticks - watcher.lastCheck;
                    if (watcher.interval * MINUTE_IN_TICKS - ticksElapsed < 10_000_000) { // < 1s

                        watcher.lastCheck = DateTime.UtcNow.Ticks;

                        new Thread(()=> {
                            short status = watcher.type switch {
                                WatcherType.icmp        => CheckIcmp(watcher),
                                WatcherType.tcp         => CheckTcp(watcher),
                                WatcherType.dns         => CheckDns(watcher),
                                WatcherType.http        => CheckHttp(watcher),
                                WatcherType.httpKeyword => CheckHttpKeyword(watcher),
                                WatcherType.tls         => CheckTls(watcher),
                                _                       => CheckIcmp(watcher)
                            };

                            if (watcher.lastStatus != status && watcher.lastStatus != short.MinValue) {
                                Notification[] gist =  notifications.Where(n => n.watchers.Any(w => w.Equals(watcher.file))).ToArray();
                                for (int i = 0; i < gist.Length; i++) {
                                    SmtpProfiles.Profile profile;
                                    try {
                                        profile = smtpProfiles.First(o => o?.guid == gist[i]?.smtpProfile?.guid);
                                    }
                                    catch {
                                        continue;
                                    }

                                    if (profile is null) { continue; }



                                    if (watcher.lastStatus < 0 && status >= 0 && (gist[i].notify == NotifyOn.rise || gist[i].notify == NotifyOn.both)) { //rise
                                        SendSmtpNotification(watcher, gist[i], profile, status);
                                    }
                                    else if (watcher.lastStatus >= 0 && status < 0 && (gist[i].notify == NotifyOn.fall || gist[i].notify == NotifyOn.both)) { //fall
                                        SendSmtpNotification(watcher, gist[i], profile, status);
                                    }
                                }
                            }

                            watcher.lastStatus = status;

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
                client.ReceiveTimeout = watcher.timeout;

                long before = DateTime.Now.Ticks;
                client.Connect(watcher.target, watcher.port);
                long after = DateTime.Now.Ticks;

                if (!client.Connected) {
                    client.Close();
                    continue;
                }

                client.Close();
                result = (short)((after - before) / 10_000);
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
        if (parameters is null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        if (!parameters.TryGetValue("date", out string date)) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        if (parameters.TryGetValue("file", out string file)) { //single file
            StringBuilder builder = new StringBuilder();
            
            builder.Append('{');
            builder.Append($"\"{file}\":");
            ViewFile(date, file, builder);
            builder.Append('}');

            return Encoding.UTF8.GetBytes(builder.ToString());
        }
        else { //if no file, send all files for that day
            StringBuilder builder = new StringBuilder();

            builder.Append('{');

            bool first = true;
            foreach (Watcher watcher in watchers.Values) {
                if (!first) { builder.Append(','); }

                builder.Append($"\"{watcher.file}\":");
                ViewFile(date, watcher.file, builder);

                first = false;
            }

            builder.Append('}');

            return Encoding.UTF8.GetBytes(builder.ToString());
        }
    }

    private static void ViewFile(string date, string file, StringBuilder builder) {
        string filename = $"{Data.DIR_WATCHDOG}{Data.DELIMITER}{file}_{Data.DELIMITER}{date}";
        
        if (!File.Exists(filename)) {
            builder.Append("null");
            return;
        }

        watchers.TryGetValue(file, out Watcher watcher);

        builder.Append('{');

        try {
            lock (watcher?.sync) {
                using FileStream stream = File.Open(filename, FileMode.Open);
                using BinaryReader reader = new BinaryReader(stream, Encoding.UTF8, false);

                bool first = true;
                while (reader.BaseStream.Position < reader.BaseStream.Length) {
                    long ticks = reader.ReadInt64();
                    long unixDate = (ticks - UNIX_BASE_TICKS) / 10_000;
                    short result = reader.ReadInt16();

                    if (!first) builder.Append(',');
                    builder.Append($"\"{unixDate}\":{result}");

                    first = false;
                }
            }
        }
        catch {}

        builder.Append('}');
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
                Logger.Action(initiator, $"Modify a watcher: {watcher.name}");
            }
            else {
                Logger.Action(initiator, $"Create a new watcher: {watcher.name}");
            }

            return content;
        }
        catch (Exception ex) {
            Logger.Error(ex);
            return Data.CODE_FAILED.Array;
        }
    }

    public static byte[] Delete(Dictionary<string, string> parameters, string initiator) {
        if (parameters is null) {
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

            Logger.Action(initiator, $"Delete watcher: {watcher.name}");
        }
        catch (Exception ex) {
            Logger.Error(ex);
            return Data.CODE_FAILED.Array;
        }

        return Data.CODE_OK.Array;
    }

    public static byte[] ListNotifications() {
        JsonSerializerOptions options = new JsonSerializerOptions();
        options.Converters.Add(new NotificationJsonConverter());

        try {
            byte[] json = JsonSerializer.SerializeToUtf8Bytes(notifications, options);
            return json;
        }
        catch {
            return Data.CODE_FAILED.Array;
        }
    }

    public static byte[] SaveNotifications(HttpListenerContext ctx, string initiator) {
        string payload;
        using (StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding)) {
            payload = reader.ReadToEnd();
        }

        if (String.IsNullOrEmpty(payload)) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        try {
            JsonSerializerOptions options = new JsonSerializerOptions();
            options.Converters.Add(new NotificationJsonConverter());
            notifications = JsonSerializer.Deserialize<ConcurrentBag<Notification>>(payload, options);

            File.WriteAllText(Data.FILE_NOTIFICATIONS, payload);
            
            Logger.Action(initiator, $"Modified watchdog notifications");

            return Data.CODE_OK.Array;

        } catch (Exception ex) {
            Logger.Error(ex);
            return Data.CODE_FAILED.Array;
        }
    }

    public static void SendSmtpNotification(Watcher watcher, Notification notification, SmtpProfiles.Profile profile, short status) {
        const string redDot    = "&#128308;"; //🔴
        const string orangeDot = "&#128992;"; //🟠
        const string yellowDot = "&#128993;"; //🟡
        const string greenDot  = "&#128994;"; //🟢
        const string blueDot   = "&#128309;"; //🔵

        /*string dotEmoji = status switch {
            -4 => "🔵",
            -3 => "🟡",
            -2 => "🟠",
            -1 => "🔴",
            _ => "🟢",
        };*/

        StringBuilder body = new StringBuilder();
        body.Append("<html>");
        body.Append("<table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\">");

        body.Append("<tr><td>&nbsp;</td></tr>");

        body.Append("<tr><td align=\"center\">");


        body.Append("<table width=\"640\" bgcolor=\"#e0e0e0\" style=\"text-align:center\">");
        body.Append("<tr><td style=\"padding:10px\"></td></tr>");

        body.Append("<tr><td style=\"height:40px;color:#202020;font-size:20px\"><b>Watchdog notification</b></td></tr>");

        body.Append("<tr><td style=\"height:28px;font-size:18\">");

        switch (status) {
        case -4: body.Append(blueDot);   break; //tls not yet valid
        case -3: body.Append(yellowDot); break; //expiration warning
        case -2: body.Append(orangeDot); break; //expired
        case -1: body.Append(redDot);    break; //unreachable
        default: body.Append(greenDot);  break; //alive
        }

        string stringStatus = watcher.type switch {
            WatcherType.icmp        => status < 0 ? "Host is unreachable"     : "Host is reachable",
            WatcherType.tcp         => status < 0 ? "Endpoint is unreachable" : "Endpoint is reachable",
            WatcherType.dns         => status < 0 ? "Domain is unresolved"    : "Domain is resolved",
            WatcherType.http        => status < 0 ? "Response is invalid"     : "Response is valid",
            WatcherType.httpKeyword => status < 0 ? "Keyword not found"       : "Keyword is found",

            WatcherType.tls => status switch {
                0 => "Certificate is valid",
                -1 => "Host is unreachable",
                -2 => "Certificate is expired",
                -3 => "Expiration warning",
                -4 => "Certificate is not yet valid",
                _ => "Certificate is valid",
            },

            _ => String.Empty
        };

        string target;
        if (watcher.type == WatcherType.tcp) {
            target = $"{watcher.target}:{watcher.port}";
        }
        else {
            target = watcher.target;
        }

        body.Append($"&nbsp;&nbsp;{stringStatus}: {target}");
        body.Append("</td></tr>");

        //body.Append("<tr><td style=\"height:28px;font-size:16\">");
        //TODO: add short description
        //body.Append($"{}");
        //body.Append("</td></tr>");

        body.Append("<tr><td style=\"padding:10px\"></td></tr>");
        body.Append("</table>");

        body.Append("</td></tr>");

        body.Append("<tr><td>&nbsp;</td></tr>");
        body.Append("<tr><td style=\"text-align:center;color:#808080\">Sent from <a href=\"https://github.com/veniware/OpenProtest\" style=\"color:#e67624\">Pro-test</a></td></tr>");
        body.Append("<tr><td>&nbsp;</td></tr>");

        body.Append("</td></tr>");

        body.Append("</table>");
        body.Append("</html>");

#if !DEBUG
        try
#endif
        {
            using MailMessage mail = new MailMessage {
                From = new MailAddress(profile.sender, "Pro-test"),
                Subject = $"Watchdog notification {DateTime.Now.ToString(Data.DATETIME_FORMAT_TIMEZONE)}",
                IsBodyHtml = true
            };

            AlternateView view = AlternateView.CreateAlternateViewFromString(body.ToString(), null, "text/html");
            mail.AlternateViews.Add(view);

            for (int i = 0; i < notification.recipients.Length; i++) {
                mail.To.Add(notification.recipients[i]);
            }

            using SmtpClient smtp = new SmtpClient(profile.server) {
                Port = profile.port,
                EnableSsl = profile.ssl,
                Credentials = new NetworkCredential(profile.username, profile.password)
            };
            smtp.Send(mail);
        }
#if !DEBUG
        catch (SmtpFailedRecipientException ex) { Logger.Error(ex); }
        catch (SmtpException ex)                { Logger.Error(ex); }
        catch (Exception ex)                    { Logger.Error(ex); }
#endif
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

file sealed class NotificationJsonConverter : JsonConverter<ConcurrentBag<Watchdog.Notification>> {
    public override ConcurrentBag<Watchdog.Notification> Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) {
        if (reader.TokenType != JsonTokenType.StartArray) {
            throw new JsonException("Expected StartArray token");
        }

        ConcurrentBag<Watchdog.Notification> bag = new ConcurrentBag<Watchdog.Notification>();

        while (reader.Read()) {
            if (reader.TokenType == JsonTokenType.EndArray) {
                break;
            }

            if (reader.TokenType != JsonTokenType.StartObject) {
                throw new JsonException($"Unexpected token type: {reader.TokenType}");
            }

            Watchdog.Notification notification = ReadNotification(ref reader, options);
            bag.Add(notification);
        }

        return bag;
    }

    private static Watchdog.Notification ReadNotification(ref Utf8JsonReader reader, JsonSerializerOptions options) {
        Watchdog.Notification notification = new Watchdog.Notification();
        SmtpProfiles.Profile[] profiles = SmtpProfiles.Load();

        while (reader.Read()) {
            if (reader.TokenType == JsonTokenType.EndObject) {
                break;
            }

            if (reader.TokenType != JsonTokenType.PropertyName) {
                throw new JsonException($"Unexpected token type: {reader.TokenType}");
            }

            string propertyName = reader.GetString();

            reader.Read();

            switch (propertyName) {
            case "name"       : notification.name       = reader.GetString(); break;
            case "notify"     : notification.notify     = (Watchdog.NotifyOn)reader.GetInt32(); break;
            case "recipients" : notification.recipients = JsonSerializer.Deserialize<string[]>(ref reader, options); break;
            case "watchers"   : notification.watchers   = JsonSerializer.Deserialize<string[]>(ref reader, options); break;

            case "smtpprofile":
                if (reader.TokenType != JsonTokenType.String) {
                    break;
                }

                Guid guid = reader.GetGuid();
                SmtpProfiles.Profile profile = Array.Find(profiles, o=>o.guid == guid);
                if (profile is not null) {
                    notification.smtpProfile = profile;
                }
                break;

            default: reader.Skip(); break;
            }
        }

        return notification;
    }

    public override void Write(Utf8JsonWriter writer, ConcurrentBag<Watchdog.Notification> value, JsonSerializerOptions options) {
        writer.WriteStartArray();

        foreach (Watchdog.Notification notification in value) {
            writer.WriteStartObject();

            writer.WriteString("name"u8, notification.name);
            writer.WriteString("smtpprofile"u8, notification.smtpProfile?.guid ?? Guid.Empty);
            writer.WriteNumber("notify"u8, (int)notification.notify);

            writer.WritePropertyName("recipients"u8);
            writer.WriteStartArray();
            for (int j = 0; j < notification.recipients.Length; j++) {
                writer.WriteStringValue(notification.recipients[j]);
            }
            writer.WriteEndArray();

            writer.WritePropertyName("watchers"u8);
            writer.WriteStartArray();
            for (int j = 0; j < notification.watchers.Length; j++) {
                writer.WriteStringValue(notification.watchers[j]);
            }
            writer.WriteEndArray();

            writer.WriteEndObject();
        }

        writer.WriteEndArray();
    }
}
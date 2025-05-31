﻿using System.Collections.Concurrent;
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
using Protest.Tools;

namespace Protest.Tasks;

internal static class Watchdog {
    private const long WEEK_IN_TICKS = 6_048_000_000_000L;
    private const long FIVE_MINUTE_IN_TICKS = 3_000_000_000L;
    private const long MINUTE_IN_TICKS = 600_000_000L;
    private const int FIVE_MINUTE_IN_MILLI = 300_000;

    public enum WatcherType : byte {
        icmp,
        tcp,
        dns,
        http,
        httpKeyword,
        tls
    }

    public enum NotifyWhen : byte {
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

        public Lock mutex;
    }

    public record Notification {
        public string name;
        public SmtpProfiles.Profile smtpProfile;
        public NotifyWhen notify;
        public string[] recipients;
        public string[] watchers;
    }

    public static TaskWrapper task;
    private static readonly ConcurrentDictionary<string, Watcher> watchers = new ConcurrentDictionary<string, Watcher>();
    private static ConcurrentBag<Notification> notifications = new ConcurrentBag<Notification>();

    private static readonly object notificationMutex = new object();

    private static readonly JsonSerializerOptions watcherSerializerOptions = new();
    private static readonly JsonSerializerOptions notificationSerializerOptions = new();
        
    public static void Initialize() {
        watcherSerializerOptions.Converters.Add(new WatcherJsonConverter());
        notificationSerializerOptions.Converters.Add(new NotificationJsonConverter());

        DirectoryInfo dirWatchers = new DirectoryInfo(Data.DIR_WATCHDOG);
        if (dirWatchers.Exists) {
            FileInfo[] files = dirWatchers.GetFiles();
            for (int i = 0; i < files.Length; i++) {
                try {
                    string plain = File.ReadAllText(files[i].FullName);
                    Watcher watcher = JsonSerializer.Deserialize<Watcher>(plain, watcherSerializerOptions);
                    watchers.TryAdd(files[i].Name, watcher);
                }
                catch { }
            }
        }

        FileInfo fileNotifications = new FileInfo(Data.FILE_NOTIFICATIONS);
        if (fileNotifications.Exists) {
            try {
                string plain = File.ReadAllText(fileNotifications.FullName);
                notifications = JsonSerializer.Deserialize<ConcurrentBag<Notification>>(plain, notificationSerializerOptions);
            }
            catch (Exception ex) {
                Logger.Error(ex);
            }
        }

        if (!watchers.IsEmpty) { StartTask("system"); }
    }

    public static bool StartTask(string origin) {
        if (task is not null) return false;

        Thread thread = new Thread(() => WatchLoop());

        task = new TaskWrapper("Watchdog") {
            thread = thread,
            origin = origin,
            TotalSteps = 0,
            CompletedSteps = 0
        };

        task.thread.Start();

        return true;
    }

    public static bool StopTask(string origin) {
        if (task is null) return false;
        task.RequestCancel(origin);
        return true;
    }

    private static void WatchLoop() {
        int nextSleep = FIVE_MINUTE_IN_MILLI;
        //align time to the next 5-min interval
        long gap = (FIVE_MINUTE_IN_TICKS - DateTime.UtcNow.Ticks % FIVE_MINUTE_IN_TICKS) / 10_000;
        task.status = TaskWrapper.TaskStatus.Idle;
        Thread.Sleep((int)gap);

        while (true) {
            task.status = TaskWrapper.TaskStatus.Running;

            long loopStartTimeStamp = DateTime.UtcNow.Ticks;

            SmtpProfiles.Profile[] smtpProfiles = SmtpProfiles.Load();

            foreach (Watcher watcher in watchers.Values) {
                if (!watcher.enable) continue;

                long ticksElapsed = DateTime.UtcNow.Ticks - watcher.lastCheck;
                if (watcher.interval * MINUTE_IN_TICKS - ticksElapsed < 10_000_000) { // < 1s
                    new Thread(()=> Watch(watcher, smtpProfiles)).Start();
                }
                else {
                    int millisRemain = (int)((watcher.interval * MINUTE_IN_TICKS - ticksElapsed) / 10_000);
                    if (nextSleep > millisRemain) {
                        nextSleep = millisRemain;
                    }
                }
            }

            task.status = TaskWrapper.TaskStatus.Idle;
            task.Sleep(Math.Max(nextSleep - (int)((DateTime.UtcNow.Ticks - loopStartTimeStamp) / 10_000), 0));

            if (task.cancellationToken.IsCancellationRequested) {
                task.status = TaskWrapper.TaskStatus.Canceling;
                task?.Dispose();
                task = null;
                return;
            }
        }
    }

    private static void Watch(Watcher watcher, SmtpProfiles.Profile[] smtpProfiles) {
        watcher.lastCheck = DateTime.UtcNow.Ticks;

        short status = watcher.type switch {
            WatcherType.icmp        => CheckIcmp(watcher),
            WatcherType.tcp         => CheckTcp(watcher),
            WatcherType.dns         => CheckDns(watcher),
            WatcherType.http        => CheckHttp(watcher),
            WatcherType.httpKeyword => CheckHttpKeyword(watcher),
            WatcherType.tls         => CheckTls(watcher),
            _ => -9
        };

        WriteResult(watcher, status);

        if (watcher.lastStatus != status && watcher.lastStatus != short.MinValue) {
            Notification[] gist = notifications.Where(n => n.watchers.Any(w => w.Equals(watcher.file))).ToArray();
            for (int i = 0; i < gist.Length; i++) {
                SmtpProfiles.Profile profile;
                try {
                    profile = smtpProfiles.First(o => o?.guid == gist[i]?.smtpProfile?.guid);
                }
                catch {
                    continue;
                }

                if (profile is null) { continue; }

                if (watcher.lastStatus < 0 && status >= 0 && (gist[i].notify == NotifyWhen.rise || gist[i].notify == NotifyWhen.both)) { //rise
                    SendSmtpNotification(watcher, gist[i], profile, status);
                }
                else if (watcher.lastStatus >= 0 && status < 0 && (gist[i].notify == NotifyWhen.fall || gist[i].notify == NotifyWhen.both)) { //fall
                    SendSmtpNotification(watcher, gist[i], profile, status);
                }
            }
        }

        watcher.lastStatus = status;
    }

    private static short CheckIcmp(Watcher watcher) {
        using Ping ping = new Ping();
        short result = -1;

        for (int i = 0; i < watcher.retries; i++) {
            try {
                PingReply reply = ping.Send(watcher.target, watcher.timeout);
                if (reply.Status != IPStatus.Success) continue;
                result = (short)reply.RoundtripTime;
                break;
            }
            catch { }
            //catch (Exception ex) when (ex is not PlatformNotSupportedException) { }
        }

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
            catch { }
        }

        return result;
    }

    private static short CheckDns(Watcher watcher) {
        short result = -1;
        for (int i = 0; i < watcher.retries; i++) {
            Protocols.Dns.Resolve(
                new string[] { watcher.query },
                watcher.target,
                watcher.timeout,
                out ushort answerCount,
                out ushort authorityCount,
                out ushort additionalCount,
                Protocols.Dns.TransportMethod.auto,
                watcher.rrtype);

            if (answerCount + authorityCount + additionalCount == 0)
                continue;

            result = 0;
            break;
        }

        return result;
    }

    private static short CheckHttp(Watcher watcher) {
        short result = -1;
        for (int i = 0; i < watcher.retries; i++) {
            try {
                using HttpClient client = new HttpClient();
                HttpResponseMessage response = watcher.method switch
                {
                    "GET" => client.GetAsync(watcher.target).GetAwaiter().GetResult(),
                    "POST" => client.PostAsync(watcher.target, null).GetAwaiter().GetResult(),
                    "PUT" => client.PutAsync(watcher.target, null).GetAwaiter().GetResult(),
                    "PATCH" => client.PatchAsync(watcher.target, null).GetAwaiter().GetResult(),
                    "DELETE" => client.DeleteAsync(watcher.target).GetAwaiter().GetResult(),
                    _ => client.GetAsync(watcher.target).GetAwaiter().GetResult(),
                };

                int statusCode = (int)response.StatusCode;
                int category = statusCode / 100 - 1;

                if (watcher.httpstatus.Length < category)
                    continue;

                if (watcher.httpstatus[category]) {
                    result = 0;
                    break;
                }
                else {
                    result = (short)-statusCode;
                    break;
                }
            }
            catch { }
        }

        return result;
    }

    private static short CheckHttpKeyword(Watcher watcher) {
        using HttpClient client = new HttpClient();
        short result = -1;

        byte[] keywordArray = Encoding.UTF8.GetBytes(watcher.keyword.ToLower());

        for (int i = 0; i < watcher.retries; i++) {
            try {
                HttpResponseMessage response = watcher.method switch
                {
                    "GET" => client.GetAsync(watcher.target).GetAwaiter().GetResult(),
                    "POST" => client.PostAsync(watcher.target, null).GetAwaiter().GetResult(),
                    "PUT" => client.PutAsync(watcher.target, null).GetAwaiter().GetResult(),
                    "PATCH" => client.PatchAsync(watcher.target, null).GetAwaiter().GetResult(),
                    "DELETE" => client.DeleteAsync(watcher.target).GetAwaiter().GetResult(),
                    _ => client.GetAsync(watcher.target).GetAwaiter().GetResult(),
                };

                int statusCode = (int)response.StatusCode;
                int category = statusCode / 100 - 1;

                if (watcher.httpstatus.Length < category)
                    continue;
                //if (!watcher.httpstatus[category]) continue;

                if (watcher.httpstatus[category]) {
                    byte[] buffer = response.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult();
                    for (int j = 0; j < buffer.Length; j++) { //to lower case
                        if (buffer[j] > 64 && buffer[j] < 91) { buffer[j] -= 32; }
                    }

                    if (!Data.ContainsBytesSequence(buffer, keywordArray)) continue;

                    result = 0;
                    break;
                }
                else {
                    result = (short)-statusCode;
                    break;
                }
            }
            catch { }
        }

        return result;
    }

    private static short CheckTls(Watcher watcher) {
        short result = -1;

        using HttpClientHandler handler = new HttpClientHandler();
        handler.ServerCertificateCustomValidationCallback = (request, cert, chain, errors) => {
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
                using HttpClient client = new HttpClient(handler);
                using HttpResponseMessage response = client.GetAsync(watcher.target).GetAwaiter().GetResult();
            }
            catch { }

            if (result == short.MaxValue)
                continue;
            break;
        }

        return result;
    }

    private static bool WriteResult(Watcher watcher, short result) {
        DateTime now = DateTime.UtcNow;
        string dir = $"{Data.DIR_WATCHDOG}{Data.DELIMITER}{watcher.file}_";
        string path = $"{dir}{Data.DELIMITER}{now.ToString(Data.DATE_FORMAT_FILE)}";
        lock (watcher.mutex) {
            try {
                if (!Directory.Exists(dir)) { Directory.CreateDirectory(dir); }
                using FileStream stream = new FileStream(path, FileMode.Append);
                using BinaryWriter writer = new BinaryWriter(stream, Encoding.UTF8, false);
                writer.Write(((DateTimeOffset)now).ToUnixTimeMilliseconds()); //8 bytes
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

        bool first = true;
        foreach (Watcher watcher in watchers.Values) {
            if (!first) builder.Append(',');
            builder.Append(JsonSerializer.Serialize(watcher, watcherSerializerOptions));
            first = false;
        }

        builder.Append(']');

        return Encoding.UTF8.GetBytes(builder.ToString());
    }

    public static byte[] View(Dictionary<string, string> parameters) {
        if (parameters is null) {
            return null;
        }

        if (!parameters.TryGetValue("file", out string file)) {
            return null;
        }

        if (!parameters.TryGetValue("date", out string date)) {
            return null;
        }

        try {
            byte[] bytes = File.ReadAllBytes($"{Data.DIR_WATCHDOG}{Data.DELIMITER}{file}_{Data.DELIMITER}{date}");
            return bytes;
        }
        catch {
            return null;
        }
    }

    public static byte[] Create(HttpListenerContext ctx, Dictionary<string, string> parameters, string origin) {
        using StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding);
        string watcherString = reader.ReadToEnd();

        if (parameters is null || !parameters.TryGetValue("file", out string file) || file is null) {
            file = Database.GenerateFilename();
        }

        try {
            bool exists = File.Exists($"{Data.DIR_WATCHDOG}{Data.DELIMITER}{file}");
            Watcher watcher = JsonSerializer.Deserialize<Watcher>(watcherString, watcherSerializerOptions);
            watcher.file = file;

            byte[] content = JsonSerializer.SerializeToUtf8Bytes(watcher, watcherSerializerOptions);

            if (!Directory.Exists(Data.DIR_WATCHDOG)) {
                Directory.CreateDirectory(Data.DIR_WATCHDOG);
            }

            File.WriteAllBytes($"{Data.DIR_WATCHDOG}{Data.DELIMITER}{file}", content);

            DirectoryInfo dirInfo = new DirectoryInfo($"{Data.DIR_WATCHDOG}{Data.DELIMITER}{file}_");
            if (!dirInfo.Exists) {
                dirInfo.Create();
            }

            watchers[file] = watcher;

            if (exists) {
                Logger.Action(origin, $"Modify a watcher: {watcher.name}");
            }
            else {
                Logger.Action(origin, $"Create a new watcher: {watcher.name}");
            }

            return content;
        }
        catch (Exception ex) {
            Logger.Error(ex);
            return Data.CODE_FAILED.Array;
        }
    }

    public static byte[] Delete(Dictionary<string, string> parameters, string origin) {
        if (parameters is null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        parameters.TryGetValue("file", out string file);

        try {
            if (!watchers.Remove(file, out Watcher watcher)) {
                return Data.CODE_FILE_NOT_FOUND.Array;
            }

            lock (watcher.mutex) {
                Directory.Delete($"{Data.DIR_WATCHDOG}{Data.DELIMITER}{file}_", true);
                File.Delete($"{Data.DIR_WATCHDOG}{Data.DELIMITER}{file}");
            }

            if (task?.status == TaskWrapper.TaskStatus.Running) {
                StopTask(origin);
            }

            Logger.Action(origin, $"Delete watcher: {watcher.name}");
        }
        catch (Exception ex) {
            Logger.Error(ex);
            return Data.CODE_FAILED.Array;
        }

        return Data.CODE_OK.Array;
    }

    public static byte[] ListNotifications() {
        try {
            byte[] json = JsonSerializer.SerializeToUtf8Bytes(notifications, notificationSerializerOptions);
            return json;
        }
        catch {
            return Data.CODE_FAILED.Array;
        }
    }

    public static byte[] SaveNotifications(HttpListenerContext ctx, string origin) {
        using StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding);
        string payload = reader.ReadToEnd();

        if (string.IsNullOrEmpty(payload)) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        try {
            notifications = JsonSerializer.Deserialize<ConcurrentBag<Notification>>(payload, notificationSerializerOptions);

            lock (notificationMutex) {
                File.WriteAllText(Data.FILE_NOTIFICATIONS, payload);
            }

            Logger.Action(origin, $"Modified watchdog notifications");

            return Data.CODE_OK.Array;

        }
        catch (Exception ex) {
            Logger.Error(ex);
            return Data.CODE_FAILED.Array;
        }
    }

    public static void SendSmtpNotification(Watcher watcher, Notification notification, SmtpProfiles.Profile profile, short status) {
        const string redDot = "&#128308;"; //🔴
        const string orangeDot = "&#128992;"; //🟠
        const string yellowDot = "&#128993;"; //🟡
        const string greenDot = "&#128994;"; //🟢
        const string blueDot = "&#128309;"; //🔵

        /*string dotEmoji = status switch {
             0 => "🟢",
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

        body.Append("<tr><td style=\"height:40px;color:#202020;font-size:20px\"><b>");

        switch (status) {
        case 0 : body.Append(greenDot);  break; //ok
        case -4: body.Append(blueDot);   break; //tls not yet valid
        case -3: body.Append(yellowDot); break; //expiration warning
        case -2: body.Append(orangeDot); break; //expired
        case -1: body.Append(redDot);    break; //unreachable
        default: body.Append(greenDot);  break;
        }

        string stringStatus = watcher.type switch {
            WatcherType.icmp => status < 0 ? "Host is unreachable" : "Host is reachable",
            WatcherType.tcp => status < 0 ? "Connection failed" : "Connection succeeded",
            WatcherType.dns => status < 0 ? "Domain is not resolved" : "Domain is resolved",
            WatcherType.http => status < 0 ? "Response not valid" : "Response is valid",
            WatcherType.httpKeyword => status < 0 ? "Keyword not found" : "Keyword is found",

            WatcherType.tls => status switch
            {
                0  => "Certificate is valid",
                -1 => "Host is unreachable",
                -2 => "Certificate expired",
                -3 => "Expiration warning",
                -4 => "Certificate is not yet valid",
                _  => "Certificate is valid",
            },

            _ => string.Empty
        };

        string target;
        if (watcher.type == WatcherType.tcp) {
            target = $"{watcher.target}:{watcher.port}";
        }
        else {
            target = watcher.target;
        }

        body.Append($"&nbsp;{stringStatus}");
        body.Append("</b></td></tr>");


        body.Append("<tr><td style=\"height:28px;font-size:18\">");
        switch (watcher.type) {
        case WatcherType.icmp:
            if (status < 0) {
                body.Append($"<b>{watcher.target}</b> stoped responding to ICMP requests.");
            }
            else {
                body.Append($"<b>{watcher.target}</b> is now responding to ICMP requests.");
            }
            break;

        case WatcherType.tcp:
            if (status < 0) {
                body.Append($"<b>{watcher.target}</b> stoped listening on TCP port {watcher.port}.");
            }
            else {
                body.Append($"<b>{watcher.target}</b> is now listening on TCP port {watcher.port}.");
            }
            break;

        case WatcherType.dns:
            if (status < 0) {
                body.Append($"<b>{watcher.query}</b>'s IP address could not be found on {watcher.target}.");
            }
            else {
                body.Append($"<b>{watcher.query}</b>'s IP address is now found on {watcher.target}.");
            }
            break;

        case WatcherType.http:
            if (status < 0) {
                if (status <= -100) {
                    body.Append($"HTTP response from <b>{watcher.target}</b> is not valid. Server responded with a HTTP status of \"{status * -1}\"");
                }
                else {
                    body.Append($"HTTP response from <b>{watcher.target}</b> is not valid.");
                }
            }
            else {
                body.Append($"HTTP response from <b>{watcher.target}</b> is now valid.");
            }
            break;

        case WatcherType.httpKeyword:
            if (status < 0) {
                if (status <= -100) {
                    body.Append($"Keyword <b>{watcher.keyword}</b> is not found on {watcher.target}. Server responded with a HTTP status of \"{status * -1}\"");
                }
                else {
                    body.Append($"Keyword <b>{watcher.keyword}</b> is not found on {watcher.target}.");
                }
            }
            else {
                body.Append($"Keyword <b>{watcher.keyword}</b> is now found on {watcher.target}.");
            }
            break;

        case WatcherType.tls:
            switch (status) {
            case 0 : body.Append($"Certificate for <b>{watcher.target}</b> is now valid."); break;
            case -1: body.Append($"Host for <b>{watcher.target}</b> is unreachable."); break;
            case -2: body.Append($"Certificate for <b>{watcher.target}</b> is expired."); break;
            case -3: body.Append($"Certificate for <b>{watcher.target}</b> is close to it's expiration date."); break;
            case -4: body.Append($"Activation date of the certificate of <b>{watcher.target}</b> hasn't been reached."); break;
            //default: body.Append($""); break;
            }
            break;
        }
        body.Append("</td></tr>");


        //body.Append("<tr><td style=\"padding:10px;font-size:16\">");
        //body.Append($"");
        //body.Append("</td></tr>");

        body.Append("<tr><td style=\"padding:10px\"></td></tr>");
        body.Append("</table>");

        body.Append("</td></tr>");

        body.Append("<tr><td>&nbsp;</td></tr>");
        body.Append("<tr><td style=\"text-align:center;color:#808080\">Sent from <a href=\"https://github.com/openprotest/protest\" style=\"color:#e67624\">Pro-test</a></td></tr>");
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
                Subject = $"Watchdog notification - {target} - {DateTime.Now.ToString(Data.DATETIME_FORMAT_TIMEZONE)}",
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
                case "file":
                    watcher.file = reader.GetString();
                    break;
                case "enable":
                    watcher.enable = reader.GetBoolean();
                    break;
                case "name":
                    watcher.name = reader.GetString();
                    break;
                case "target":
                    watcher.target = reader.GetString();
                    break;
                case "port":
                    watcher.port = reader.GetInt32();
                    break;
                case "timeout":
                    watcher.timeout = Math.Max(reader.GetInt32(), 5);
                    break;
                case "method":
                    watcher.method = reader.GetString();
                    break;
                case "keyword":
                    watcher.keyword = reader.GetString();
                    break;
                case "query":
                    watcher.query = reader.GetString();
                    break;

                case "type":
                    string typeString = reader.GetString().ToUpper();
                    watcher.type = typeString switch {
                        "ICMP" => Watchdog.WatcherType.icmp,
                        "TCP" => Watchdog.WatcherType.tcp,
                        "DNS" => Watchdog.WatcherType.dns,
                        "HTTP" => Watchdog.WatcherType.http,
                        "HTTP KEYWORD" => Watchdog.WatcherType.httpKeyword,
                        "TLS" => Watchdog.WatcherType.tls,
                        _ => Watchdog.WatcherType.icmp,
                    };
                    break;

                case "rrtype":
                    string rrtypeString = reader.GetString().ToUpper();
                    watcher.rrtype = rrtypeString switch {
                        "A" => Protocols.Dns.RecordType.A,
                        "NS" => Protocols.Dns.RecordType.NS,
                        "CNAME" => Protocols.Dns.RecordType.CNAME,
                        "SOA" => Protocols.Dns.RecordType.SOA,
                        "PTR" => Protocols.Dns.RecordType.PTR,
                        "MX" => Protocols.Dns.RecordType.MX,
                        "TXT" => Protocols.Dns.RecordType.TXT,
                        "AAAA" => Protocols.Dns.RecordType.AAAA,
                        "SRV" => Protocols.Dns.RecordType.SRV,
                        _ => Protocols.Dns.RecordType.A,
                    };
                    break;

                case "httpstatus":
                    List<bool> httpStatusList = new List<bool>();
                    while (reader.Read() && reader.TokenType != JsonTokenType.EndArray) {
                        httpStatusList.Add(reader.GetBoolean());
                    }
                    watcher.httpstatus = httpStatusList.ToArray();
                    break;

                case "interval":
                    watcher.interval = reader.GetInt32();
                    break;
                case "retries":
                    watcher.retries = reader.GetInt32();
                    break;
                }
            }
        }

        watcher.mutex = new Lock();

        return watcher;
    }

    public override void Write(Utf8JsonWriter writer, Watchdog.Watcher value, JsonSerializerOptions options) {
        writer.WriteStartObject();

        writer.WriteString("file"u8, value.file);
        writer.WriteBoolean("enable"u8, value.enable);
        writer.WriteString("name"u8, value.name);
        writer.WriteString("target"u8, value.target);
        writer.WriteNumber("port"u8, value.port);
        writer.WriteNumber("timeout"u8, value.timeout);
        writer.WriteString("method"u8, value.method);
        writer.WriteString("keyword"u8, value.keyword);
        writer.WriteString("query"u8, value.query);

        writer.WriteString("type"u8, value.type switch {
            Watchdog.WatcherType.icmp => "ICMP",
            Watchdog.WatcherType.tcp => "TCP",
            Watchdog.WatcherType.dns => "DNS",
            Watchdog.WatcherType.http => "HTTP",
            Watchdog.WatcherType.httpKeyword => "HTTP keyword",
            Watchdog.WatcherType.tls => "TLS",
            _ => "ICMP"
        });

        writer.WriteString("rrtype"u8, value.rrtype switch {
            Protocols.Dns.RecordType.A => "A",
            Protocols.Dns.RecordType.NS => "NS",
            Protocols.Dns.RecordType.CNAME => "CNAME",
            Protocols.Dns.RecordType.SOA => "SOA",
            Protocols.Dns.RecordType.PTR => "PTR",
            Protocols.Dns.RecordType.MX => "MX",
            Protocols.Dns.RecordType.TXT => "TXT",
            Protocols.Dns.RecordType.AAAA => "AAAA",
            Protocols.Dns.RecordType.SRV => "SRV",
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
            throw new JsonException();
        }

        ConcurrentBag<Watchdog.Notification> bag = new ConcurrentBag<Watchdog.Notification>();

        while (reader.Read()) {
            if (reader.TokenType == JsonTokenType.EndArray) {
                break;
            }

            if (reader.TokenType != JsonTokenType.StartObject) {
                throw new JsonException();
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
                throw new JsonException();
            }

            string propertyName = reader.GetString();

            reader.Read();

            switch (propertyName) {
            case "name":
                notification.name = reader.GetString();
                break;
            case "notify":
                notification.notify = (Watchdog.NotifyWhen)reader.GetInt32();
                break;
            case "recipients":
                try {
                    notification.recipients = JsonSerializer.Deserialize<string[]>(ref reader, options);
                }
                catch (JsonException ex){
                    Logger.Error(ex);
                }
                break;
            case "watchers":
                try {
                    notification.watchers = JsonSerializer.Deserialize<string[]>(ref reader, options);
                }
                catch (JsonException ex) {
                    Logger.Error(ex);
                }
                break;

            case "smtpprofile":
                if (reader.TokenType != JsonTokenType.String) {
                    break;
                }

                Guid guid = reader.GetGuid();
                SmtpProfiles.Profile profile = Array.Find(profiles, o => o.guid == guid);
                if (profile is not null) {
                    notification.smtpProfile = profile;
                }
                break;

            default:
                reader.Skip();
                break;
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
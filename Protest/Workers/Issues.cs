using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics.Metrics;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Lextm.SharpSnmpLib;
using Lextm.SharpSnmpLib.Security;
using Protest.Http;
using Protest.Tools;

namespace Protest.Workers;

internal static class Issues {
    private const int WEAK_PASSWORD_ENTROPY_THRESHOLD = 28;

    public enum SeverityLevel {
        info     = 1,
        warning  = 2,
        error    = 3,
        critical = 4
    }

    public struct Issue {
        public SeverityLevel severity;
        public string message;
        public string target;
        public string category;
        public string source;
        //public string file;
        public bool isUser;
        public long timestamp;
    }

    private static TaskWrapper task;
    private static ConcurrentBag<Issue> issues = new ConcurrentBag<Issue>();

    public static byte[] ToJsonBytes(this Issue issue) => JsonSerializer.SerializeToUtf8Bytes(new Dictionary<string, string> {
        { issue.severity.ToString(), issue.message },
        { "target",   issue.target },
        { "category", issue.category},
        { "source",   issue.source },
        //{ "file",     issue.file},
    });

    public static byte[] List() {
        //TODO:
        return null;
    }

    public static byte[] Start(string origin) {
        if (task is not null) return Data.CODE_OTHER_TASK_IN_PROGRESS.Array;

        Thread thread = new Thread(() => Scan());

        task = new TaskWrapper("Issues") {
            thread = thread,
            origin = origin,
            TotalSteps = 0,
            CompletedSteps = 0
        };

        task.thread.Start();

        return "{\"status\":\"running\"}"u8.ToArray(); ;
    }

    public static byte[] Stop(string origin) {
        if (task is null) return "{\"error\":\"Scanning task is not running\"}"u8.ToArray();
        task.RequestCancel(origin);
        return "{\"status\":\"stopped\"}"u8.ToArray();
    }

    public static byte[] Status() {
        if (task is null) {
            return "{\"status\":\"running\"}"u8.ToArray();
        }
        else {
            return "{\"status\":\"stopped\"}"u8.ToArray();
        }
    }

    private static async Task WsWriteText(WebSocket ws, string data) {
        if (ws.State == WebSocketState.Open) {
            await ws.SendAsync(new ArraySegment<byte>(Encoding.ASCII.GetBytes(data), 0, data.Length), WebSocketMessageType.Text, true, CancellationToken.None);
        }
    }
    private static async Task WsWriteText(WebSocket ws, byte[] data) {
        if (ws.State == WebSocketState.Open) {
            await ws.SendAsync(new ArraySegment<byte>(data, 0, data.Length), WebSocketMessageType.Text, true, CancellationToken.None);
        }
    }

    public static async void WebSocketHandler(HttpListenerContext ctx) {
        WebSocket ws;
        try {
            WebSocketContext wsc = await ctx.AcceptWebSocketAsync(null);
            ws = wsc.WebSocket;
        }
        catch (WebSocketException ex) {
            ctx.Response.Close();
            Logger.Error(ex);
            return;
        }

        if (!Auth.IsAuthenticatedAndAuthorized(ctx, ctx.Request.Url.AbsolutePath)) {
            await ws.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, null, CancellationToken.None);
            return;
        }

        int lastIssuesCount = 0;
        long lastTimestamp = -1;

        try {
            while (ws.State == WebSocketState.Open && task is not null) {
                if (!Auth.IsAuthenticatedAndAuthorized(ctx, "/ws/issues")) {
                    ctx.Response.Close();
                    return;
                }

                await Task.Delay(5_000);

                if (lastIssuesCount == issues.Count) {
                    continue;
                }

                lastIssuesCount = issues.Count;

                IEnumerable<Issue> filtered = issues.Where(o => o.timestamp > lastTimestamp);

                if (filtered.Any()) {
                    byte[] bytes = JsonSerializer.SerializeToUtf8Bytes(filtered.Select(o => new {
                        severity = o.severity,
                        issue    = o.message,
                        target   = o.target,
                        category = o.category,
                        source   = o.source,
                        isUser   = o.isUser,
                    }));

                    await WsWriteText(ws, bytes);

                    lastTimestamp = filtered.Max(o => o.timestamp);
                }
            }

        }
        catch { }
        finally {
            if (ws?.State == WebSocketState.Open) {
                try {
                    await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, null, CancellationToken.None);
                }
                catch { }
            }
        }
    }

    private static void Scan() {
        ScanUsers();
        Thread.Sleep(1000);
        ScanDevices();
    }

    private static void ScanUsers() {
        foreach (KeyValuePair<string, Database.Entry> user in DatabaseInstances.users.dictionary) {
            user.Value.attributes.TryGetValue("type", out Database.Attribute typeAttribute);

            if (CheckPasswordStrength(user.Value, true, out Issue? issue) && issue.HasValue) {
                issues.Add(issue.Value);
            }
        }
    }

    private static void ScanDevices() {
        foreach (KeyValuePair<string, Database.Entry> device in DatabaseInstances.devices.dictionary) {
            ScanDevice(device);
        }
    }

    public static void ScanDevice(KeyValuePair<string, Database.Entry> device) {
        device.Value.attributes.TryGetValue("type", out Database.Attribute typeAttribute);
        device.Value.attributes.TryGetValue("ip", out Database.Attribute ipAttribute);
        device.Value.attributes.TryGetValue("hostname", out Database.Attribute hostnameAttribute);
        device.Value.attributes.TryGetValue("operating system", out Database.Attribute osAttribute);

        if (CheckPasswordStrength(device.Value, false, out Issue? issue) && issue.HasValue) {
            issues.Add(issue.Value);
        }

        if (osAttribute?.value.Contains("windows", StringComparison.OrdinalIgnoreCase) == true) {

        }
        else if (Data.PRINTER_TYPES.Contains(typeAttribute?.value)) {

        }
        else if (Data.SWITCH_TYPES.Contains(typeAttribute?.value)) {

        }
    }

    public static bool CheckPasswordStrength(Database.Entry entry, bool isUser, out Issue? issue) {
        if (entry.attributes.TryGetValue("password", out Database.Attribute password)) {
            string value = password.value;
            if (value.Length > 0 && PasswordStrength.Entropy(value) < WEAK_PASSWORD_ENTROPY_THRESHOLD) {
                string target;
                if (isUser) {
                    if (entry.attributes.TryGetValue("username", out Database.Attribute usernameAttr)) {
                        target = usernameAttr.value;
                    }
                    else if (entry.attributes.TryGetValue("username", out Database.Attribute emailAttr)) {
                        target = emailAttr.value;
                    }
                    else {
                        target = entry.filename;
                    }
                }
                else {
                    if (entry.attributes.TryGetValue("ip", out Database.Attribute ipAttr)) {
                        target = ipAttr.value;
                    }
                    else if (entry.attributes.TryGetValue("hostname", out Database.Attribute hostnameAttr)) {
                        target = hostnameAttr.value;
                    }
                    else {
                        target = entry.filename;
                    }
                }

                issue = new Issue {
                    severity = Issues.SeverityLevel.critical,
                    target   = target,
                    message  = "Weak password",
                    category = "Password",
                    source   = "Internal check",
                    isUser   = isUser,
                    timestamp     = DateTime.UtcNow.Ticks
                };
                return true;
            }
        }

        issue = null;
        return false;
    }

    public static bool CheckDiskCapacity(string target, double percent, string diskCaption, out Issue? issue) {
        string message = $"Free space is {percent}% on disk {Data.EscapeJsonText(diskCaption)}";

        if (percent <= 1) {
            issue = new Issue {
                severity = SeverityLevel.critical,
                target   = target,
                message  = message,
                category = "Disk drive",
                source   = "WMI",
                isUser   = false,
                timestamp     = DateTime.UtcNow.Ticks,
            };
            return true;
        }

        if (percent <= 5) {
            issue = new Issue {
                severity = SeverityLevel.error,
                target   = target,
                message  = message,
                category = "Disk drive",
                source   = "WMI",
                isUser = false,
                timestamp     = DateTime.UtcNow.Ticks,
            };
            return true;
        }

        if (percent < 15) {
            issue = new Issue {
                severity = SeverityLevel.warning,
                target   = target,
                message  = message,
                category = "Disk drive",
                source   = "WMI",
                isUser = false,
                timestamp     = DateTime.UtcNow.Ticks,
            };
            return true;
        }

        issue = null;
        return false;
    }

    public static bool CheckPrinterComponent(Database.Entry entry, out Issue[] issuse) {

        if (!entry.attributes.TryGetValue("snmp profile", out Database.Attribute snmpGuidAttribute)) {
            issuse = null;
            return false;
        }

        if (!SnmpProfiles.FromGuid(snmpGuidAttribute.value, out SnmpProfiles.Profile profile)) {
            issuse = null;
            return false;
        }

        entry.attributes.TryGetValue("ip", out Database.Attribute _ip);
        entry.attributes.TryGetValue("hostname", out Database.Attribute _hostname);

        string[] targetsArray = Array.Empty<string>();
        if (_ip?.value?.Length > 0) {
            targetsArray = _ip.value.Split(';').Select(o => o.Trim()).ToArray();
        }
        else if (_hostname?.value?.Length > 0) {
            targetsArray = _hostname.value.Split(';').Select(o => o.Trim()).ToArray();
        }

        if (targetsArray.Length == 0) {
            issuse = null;
            return false;
        }

        if (!IPAddress.TryParse(targetsArray[0], out IPAddress ipAddress)) {
            issuse = null;
            return false;
        }

        return CheckPrinterComponent(ipAddress, profile, out issuse);
    }

    public static bool CheckPrinterComponent(IPAddress ipAddress, SnmpProfiles.Profile profile, out Issue[] issues) {
        Dictionary<string, string> componentName    = Protocols.Snmp.Polling.ParseResponse(Protocols.Snmp.Polling.SnmpQuery(ipAddress, profile, new string[] { Protocols.Snmp.Oid.PRINTER_TONERS }, Protocols.Snmp.Polling.SnmpOperation.Walk));
        Dictionary<string, string> componentMax     = Protocols.Snmp.Polling.ParseResponse(Protocols.Snmp.Polling.SnmpQuery(ipAddress, profile, new string[] { Protocols.Snmp.Oid.PRINTER_TONERS_MAX }, Protocols.Snmp.Polling.SnmpOperation.Walk));
        Dictionary<string, string> componentCurrent = Protocols.Snmp.Polling.ParseResponse(Protocols.Snmp.Polling.SnmpQuery(ipAddress, profile, new string[] { Protocols.Snmp.Oid.PRINTER_TONER_CURRENT }, Protocols.Snmp.Polling.SnmpOperation.Walk));

        if (componentName is not null && componentCurrent is not null && componentMax is not null &&
            componentName.Count == componentCurrent.Count && componentCurrent.Count == componentMax.Count) {

            string[][] componentNameArray    = componentName.Select(pair=> new string[] { pair.Key, pair.Value }).ToArray();
            string[][] componentMaxArray     = componentMax.Select(pair=> new string[] { pair.Key, pair.Value }).ToArray();
            string[][] componentCurrentArray = componentCurrent.Select(pair=> new string[] { pair.Key, pair.Value }).ToArray();

            Array.Sort(componentNameArray, (x, y) => string.Compare(x[0], y[0]));
            Array.Sort(componentMaxArray, (x, y) => string.Compare(x[0], y[0]));
            Array.Sort(componentCurrentArray, (x, y) => string.Compare(x[0], y[0]));

            List<Issue> arrays = new List<Issue>();

            for (int i = 0; i < componentNameArray.Length; i++) {
                if (!int.TryParse(componentMaxArray[i][1], out int max)) { continue; }
                if (!int.TryParse(componentCurrentArray[i][1], out int current)) { continue; }

                if (current == -2 || max == -2) { continue; } //undefined
                if (current == -3) { current = max; } //full

                componentNameArray[i][1] = componentNameArray[i][1].TrimStart(' ', '!', '\"', '#', '$', '%', '&', '\'', '(', ')', '*', '+', ',', '-', '.', '/', ':', ';', '<', '=', '>', '?', '@', '[', '\\', ']', '^', '_', '{', '|', '}', '~');

                int used = 100 * current / max;
                if (used < 5) {
                    arrays.Add(new Issue {
                        severity  = SeverityLevel.error,
                        message   = $"{used}% {componentNameArray[i][1]}",
                        target    = ipAddress.ToString(),
                        category  = "Printer component",
                        source    = "SNMP",
                        isUser    = false,
                        timestamp = DateTime.UtcNow.Ticks
                    });
                }
                else if (used < 15) {
                    arrays.Add(new Issue {
                        severity = SeverityLevel.warning,
                        message  = $"{used}% {componentNameArray[i][1]}",
                        target   = ipAddress.ToString(),
                        category = "Printer component",
                        source   = "SNMP",
                        isUser   = false,
                        timestamp     = DateTime.UtcNow.Ticks
                    });
                }
            }

            if (arrays.Count > 0) {
                issues = arrays.ToArray();
                return true;
            }
        }

        issues = null;
        return false;
    }
}

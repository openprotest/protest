using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Data;
using System.Diagnostics.Metrics;
using System.DirectoryServices;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.WebSockets;
using System.Runtime.CompilerServices;
using System.Runtime.ExceptionServices;
using System.Runtime.Versioning;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Lextm.SharpSnmpLib;
using Lextm.SharpSnmpLib.Security;
using Protest.Http;
using Protest.Protocols;
using Protest.Tools;
using static System.Runtime.InteropServices.JavaScript.JSType;
using static Protest.Tools.DebitNotes;

namespace Protest.Workers;

internal static class Issues {
    private const double WEAK_PASSWORD_ENTROPY_THRESHOLD = 36.0;
    private const double RTT_STANDARD_DEVIATION_MULTIPLIER = 20.0;
    private const double RTT_Z_SCORE_THRESHOLD = 3.0;

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
        public string file;
        public bool   isUser;
        
        public readonly long timestamp;
        public Issue() {
            timestamp = DateTime.UtcNow.Ticks;
        }
    }

    private static TaskWrapper task;
    private static ConcurrentBag<Issue> issues;

    public static byte[] ToLiveStatsJsonBytes(this Issue issue) => JsonSerializer.SerializeToUtf8Bytes(new Dictionary<string, string> {
        { issue.severity.ToString(), issue.message },
        { "target", issue.target },
        { "source", issue.source },
    });

    public static byte[] List() {
        //TODO:
        return null;
    }

    public static byte[] Start(string origin) {
        if (task is not null) return Data.CODE_OTHER_TASK_IN_PROGRESS.Array;

        issues?.Clear();
        issues = new ConcurrentBag<Issue>();

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

        await Task.Delay(200);

        try {
            while (ws.State == WebSocketState.Open && task is not null) {
                if (!Auth.IsAuthenticatedAndAuthorized(ctx, "/ws/issues")) {
                    ctx.Response.Close();
                    return;
                }

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
                        file     = o.file,
                        isUser   = o.isUser,
                    }));

                    await WsWriteText(ws, bytes);

                    lastTimestamp = filtered.Max(o => o.timestamp);
                }

                await Task.Delay(5_000);
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
        //ScanUsers();
        ScanDevices();
    }

    private static void ScanUsers() {
        foreach (KeyValuePair<string, Database.Entry> user in DatabaseInstances.users.dictionary) {
            ScanUser(user.Value);
        }
    }

    public static void ScanUser(Database.Entry user) {
        user.attributes.TryGetValue("type", out Database.Attribute typeAttribute);
        user.attributes.TryGetValue("username", out Database.Attribute usernameAttribute);

        if (CheckPasswordStrength(user, true, out Issue? issue) && issue.HasValue) {
            issues.Add(issue.Value);
        }

        if (OperatingSystem.IsWindows() && typeAttribute?.value.ToLower() == "domain user") {
            CheckDomainUser(user, out Issue[] domainIssue, SeverityLevel.warning);
            if (domainIssue is not null) {
                for (int i = 0; i < domainIssue.Length; i++) {
                    issues.Add(domainIssue[i]);
                }
            }
        }
    }

    private static void ScanDevices() {
        Dictionary<string, Database.Entry> hosts = new Dictionary<string, Database.Entry>();
        foreach (KeyValuePair<string, Database.Entry> device in DatabaseInstances.devices.dictionary) {
            if (device.Value.attributes.TryGetValue("ip", out Database.Attribute ipAttribute)) {

                string[] ips = ipAttribute.value.Split(',').Select(o=>o.Trim()).ToArray();
                for (int i = 0; i < ips.Length; i++) {
                    if (string.IsNullOrEmpty(ips[i])) { continue; }
                    if (ips[i].Contains("dhcp", StringComparison.OrdinalIgnoreCase)) { continue; }

                    if (hosts.ContainsKey(ips[i])) {
                        issues.Add(new Issue {
                            severity = SeverityLevel.info,
                            message = "IP address is duplicated in various records",
                            target = ips[i],
                            category = "Database",
                            source = "Internal check",
                            file = device.Value.filename,
                            isUser = false,
                        });

                        continue;
                    }

                    hosts.Add(ips[i], device.Value);
                }
            }
        }

        foreach (KeyValuePair<string, Database.Entry> host in hosts) {
            if (CheckRTT(host.Value, host.Key, out Issue? issue)) {
                issues.Add(issue.Value);
            }
        }

        foreach (KeyValuePair<string, Database.Entry> device in DatabaseInstances.devices.dictionary) {
            ScanDevice(device.Value);
        }

        hosts.Clear();
    }

    public static void ScanDevice(Database.Entry device) {
        device.attributes.TryGetValue("type", out Database.Attribute typeAttribute);
        device.attributes.TryGetValue("operating system", out Database.Attribute osAttribute);

        if (CheckPasswordStrength(device, false, out Issue? issue) && issue.HasValue) {
            issues.Add(issue.Value);
        }

        if (osAttribute?.value.Contains("windows", StringComparison.OrdinalIgnoreCase) == true) {
            //TODO:
        }
        else if (Data.PRINTER_TYPES.Contains(typeAttribute?.value, StringComparer.OrdinalIgnoreCase)) {
            if (CheckPrinterComponent(device, out Issue[] printerIssues) && printerIssues is not null) {
                for (int i = 0; i < printerIssues.Length; i++) {
                    issues.Add(printerIssues[i]);
                }
            }
        }
        else if (Data.SWITCH_TYPES.Contains(typeAttribute?.value, StringComparer.OrdinalIgnoreCase)) {
            //TODO:
        }
    }

    public static bool CheckRTT(Database.Entry device, string host, out Issue? issue) {
        byte[] lifeline = Lifeline.LoadFile(host, 14, "rtt");

        if (lifeline is null || lifeline.Length < 10 * 8) {
            issue = null;
            return false;
        }

        List<int> rttValues = new List<int>();

        long lastTimestamp = 0;
        int lastRtt = 0;

        for (int i = 0; i < lifeline.Length - 9; i += 10) {
            byte[] dateBuffer = new byte[8];
            Array.Copy(lifeline, i, dateBuffer, 0, 8);
            long unixMilliseconds = BitConverter.ToInt64(dateBuffer, 0);
            long timestamp = DateTimeOffset.FromUnixTimeMilliseconds(unixMilliseconds).Ticks;
            int rtt = (lifeline[i + 9] << 8) | lifeline[i + 8];

            bool closeValues = i > 0 && Math.Abs(lastRtt - rtt) < 2 && timestamp - lastTimestamp < 600_000;
            if (closeValues) { continue; }
 
            lastTimestamp = timestamp;
            lastRtt = rtt;

            if (rtt >= 32768) { continue; } //negative number

            rttValues.Add(rtt);
        }

        if (rttValues.Count < 8) {
            issue = null;
            return false;
        }

        double mean = rttValues.Average();
        double variance = rttValues.Average(v => Math.Pow(v - mean, 2));
        double standardDeviation = Math.Sqrt(variance);

        int spike = 0;
        bool hasSpike = rttValues.Any(rtt => {
            spike = rtt;
            return Math.Abs(rtt - mean) > RTT_STANDARD_DEVIATION_MULTIPLIER * standardDeviation;
        });

        if (hasSpike) {
            issue = new Issue() {
                severity = SeverityLevel.info,
                message  = $"RTT spike detected at {spike}ms",
                target   = host,
                category = "Lifeline analysis",
                source   = "ICMP",
                file     = device.filename,
                isUser   = false,
            };
            return true;
        }

        double zScore = (rttValues.Last() - mean) / standardDeviation;
        bool isAnomalous = Math.Abs(zScore) > RTT_Z_SCORE_THRESHOLD;

        if (isAnomalous) {
            issue = new Issue() {
                severity = SeverityLevel.warning,
                message  = "RTT behavior anomaly detected",
                target   = host,
                category = "Lifeline analysis",
                source   = "ICMP",
                file     = device.filename,
                isUser   = false,
            };
            return true;
        }

        issue = null;
        return false;
    }

    [SupportedOSPlatform("windows")]
    public static bool CheckDomainUser(Database.Entry user, out Issue[] issues, SeverityLevel severityThreshold) {
        if (!user.attributes.TryGetValue("username", out Database.Attribute username)) {
            issues = null;
            return false;
        }

        try {
            SearchResult result = Kerberos.GetUser(username.value);
            List<Issue> list = new List<Issue>();
            long lockedTime = 0;

            if (result is null && severityThreshold <= SeverityLevel.warning) {
                list.Add(new Issue {
                    severity = SeverityLevel.warning,
                    message  = $"{username.value} is not a domain user",
                    target   = username.value,
                    category = "Directory",
                    source   = "Kerberos",
                    file     = user.filename,
                    isUser   = true,
                });
            }
            else {
                bool isDisabled = false;
                if (severityThreshold <= SeverityLevel.info
                    && result.Properties["userAccountControl"].Count > 0
                    && Int32.TryParse(result.Properties["userAccountControl"][0].ToString(), out int userControl)
                    && (userControl & 0x0002) != 0) {
                    list.Add(new Issue {
                        severity = SeverityLevel.info,
                        message  = $"User {username.value} is disabled",
                        target   = username.value,
                        category = "Directory",
                        source   = "Kerberos",
                        file     = user.filename,
                        isUser   = true,
                    });
                    isDisabled = true;
                }

                if (!isDisabled && result.Properties["pwdLastSet"].Count > 0) {
                    long pwdLastSet = Convert.ToInt64(result.Properties["pwdLastSet"][0]);
                    DateTime lastPasswordChange = DateTime.FromFileTime(pwdLastSet);
                    DateTime oneYearAgo = DateTime.UtcNow.AddYears(-1);
                    DateTime sixMonthsAgo = DateTime.UtcNow.AddMonths(-6);

                    if (severityThreshold <= SeverityLevel.error && lastPasswordChange < oneYearAgo) {
                        list.Add(new Issue {
                            severity = SeverityLevel.error,
                            message  = $"Password has not been changed since {lastPasswordChange.ToString(Data.DATE_FORMAT_LONG)}",
                            target   = username.value,
                            category = "Password",
                            source   = "Kerberos",
                            file     = user.filename,
                            isUser   = true,
                        });
                    }
                    else if (severityThreshold <= SeverityLevel.warning && lastPasswordChange < sixMonthsAgo) {
                        list.Add(new Issue {
                            severity = SeverityLevel.warning,
                            message  = $"Password has not been changed since {lastPasswordChange.ToString(Data.DATE_FORMAT_LONG)}",
                            target   = username.value,
                            category = "Password",
                            source   = "Kerberos",
                            file     = user.filename,
                            isUser   = true,
                        });
                    }
                }

                if (severityThreshold <= SeverityLevel.warning
                    && result.Properties["lockoutTime"].Count > 0
                    && Int64.TryParse(result.Properties["lockoutTime"][0].ToString(), out lockedTime)
                    && lockedTime > 0
                    && DateTime.UtcNow < DateTime.FromFileTime(lockedTime).AddHours(1)) {

                    list.Add(new Issue {
                        severity = SeverityLevel.warning,
                        message  = $"User {username.value} is locked out",
                        target   = username.value,
                        category = "Directory",
                        source   = "Kerberos",
                        file     = user.filename,
                        isUser   = true,
                    });
                }

                if (severityThreshold <= SeverityLevel.info
                    && result.Properties["lastLogonTimestamp"].Count > 0
                    && Int64.TryParse(result.Properties["lastLogonTimestamp"][0].ToString(), out long lastLogonTimestamp)
                    && lastLogonTimestamp > 0) {
                    list.Add(new Issue {
                        severity = SeverityLevel.info,
                        message  = $"Last logon: {DateTime.FromFileTime(lastLogonTimestamp)}",
                        target   = username.value,
                        category = "Directory",
                        source   = "Kerberos",
                        file     = user.filename,
                        isUser   = true,
                    });
                }

                /*if (result.Properties["lastLogoff"].Count > 0
                    && Int64.TryParse(result.Properties["lastLogoff"][0].ToString(), out long lastLogOffTime)
                    && lastLogOffTime > 0) {
                    list.Add(new Issue {
                        severity = SeverityLevel.info,
                        message  = $"Last logoff: {DateTime.FromFileTime(lastLogOffTime)}",
                        target   = username.value,
                        category = "Directory",
                        source   = "Kerberos",
                        file     = user.filename,
                        isUser   = true,
                    });
                }*/

                if (severityThreshold <= SeverityLevel.info
                    && lockedTime > 0
                    && result.Properties["badPasswordTime"].Count > 0
                    && Int64.TryParse(result.Properties["badPasswordTime"][0].ToString(), out long badPasswordTime)
                    && badPasswordTime > 0) {
                    list.Add(new Issue {
                        severity = SeverityLevel.info,
                        message  = $"Bad password time: {(DateTime.FromFileTime(badPasswordTime))}",
                        target   = username.value,
                        category = "Directory",
                        source   = "Kerberos",
                        file     = user.filename,
                        isUser   = true,
                    });
                }
            }

            if (list.Count > 0) {
                issues = list.ToArray();
                return true;
            }
            else {
                issues = null;
                return false;
            }
        }
        catch { }

        issues = null;
        return false;
    }

    public static bool CheckPasswordStrength(Database.Entry entry, bool isUser, out Issue? issue) {
        if (entry.attributes.TryGetValue("password", out Database.Attribute password)) {
            string value = password.value;
            double entropy = PasswordStrength.Entropy(value);
            if (value.Length > 0 && entropy < WEAK_PASSWORD_ENTROPY_THRESHOLD) {
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
                    message  = $"Weak password with {Math.Round(entropy, 2)} bits of entropy",
                    category = "Password",
                    source   = "Internal check",
                    file     = entry.filename,
                    isUser   = isUser,
                };
                return true;
            }
        }

        issue = null;
        return false;
    }

    public static bool CheckDiskCapacity(string file, string target, double percent, string diskCaption, out Issue? issue) {
        string message = $"{percent}% free space on disk {Data.EscapeJsonText(diskCaption)}";

        if (percent <= 1) {
            issue = new Issue {
                severity = SeverityLevel.critical,
                target   = target,
                message  = message,
                category = "Disk drive",
                source   = "WMI",
                file     = file,
                isUser   = false,
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
                file     = file,
                isUser   = false,
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
                file     = file,
                isUser   = false,
            };
            return true;
        }

        issue = null;
        return false;
    }

    public static bool CheckPrinterComponent(Database.Entry entry, out Issue[] issues) {
        if (!entry.attributes.TryGetValue("snmp profile", out Database.Attribute snmpGuidAttribute)) {
            issues = null;
            return false;
        }

        if (!SnmpProfiles.FromGuid(snmpGuidAttribute.value, out SnmpProfiles.Profile profile)) {
            issues = null;
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
            issues = null;
            return false;
        }

        if (!IPAddress.TryParse(targetsArray[0], out IPAddress ipAddress)) {
            issues = null;
            return false;
        }

        return CheckPrinterComponent(entry.filename, ipAddress, profile, out issues);
    }

    public static bool CheckPrinterComponent(string file, IPAddress ipAddress, SnmpProfiles.Profile profile, out Issue[] issues) {
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

            List<Issue> list = new List<Issue>();

            for (int i = 0; i < componentNameArray.Length; i++) {
                if (!int.TryParse(componentMaxArray[i][1], out int max)) { continue; }
                if (!int.TryParse(componentCurrentArray[i][1], out int current)) { continue; }

                if (current == -2 || max == -2) { continue; } //undefined
                if (current == -3) { current = max; } //full

                componentNameArray[i][1] = componentNameArray[i][1].TrimStart(' ', '!', '\"', '#', '$', '%', '&', '\'', '(', ')', '*', '+', ',', '-', '.', '/', ':', ';', '<', '=', '>', '?', '@', '[', '\\', ']', '^', '_', '{', '|', '}', '~');

                int used = 100 * current / max;

                if (used < 15) {
                    list.Add(new Issue {
                        severity = used < 5 ? SeverityLevel.error : SeverityLevel.warning,
                        message  = $"{used}% {componentNameArray[i][1]}",
                        target   = ipAddress.ToString(),
                        category = "Printer component",
                        source   = "SNMP",
                        file     = file,
                        isUser   = false,
                    });
                }
            }

            if (list.Count > 0) {
                issues = list.ToArray();
                return true;
            }
        }

        issues = null;
        return false;
    }
}

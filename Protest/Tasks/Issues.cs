using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.DirectoryServices;
using System.Net;
using System.Net.WebSockets;
using System.Runtime.Versioning;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using Protest.Http;
using Protest.Protocols;
using Protest.Tools;

namespace Protest.Tasks;

internal static class Issues {
    private const int    MIN_LIFELINE_ENTRIES              = 10;
    private const double WEAK_PASSWORD_ENTROPY_THRESHOLD   = 36.0;
    private const double RTT_STANDARD_DEVIATION_MULTIPLIER = 20.0;

    private const int CPU_UTILIZATION_THRESHOLD = 60;
    private const int MEMORY_USAGE_THRESHOLD    = 80;
    private const int DISK_SPACE_THRESHOLD      = 85;
    private const int DISK_IO_THRESHOLD         = 75;

    public enum SeverityLevel {
        info     = 1,
        warning  = 2,
        error    = 3,
        critical = 4
    }

    public struct Issue {
        public SeverityLevel severity;
        public string message;
        public string entry;
        public string category;
        public string source;
        public string file;
        public bool   isUser;

        public readonly long timestamp;
        public Issue() {
            timestamp = DateTime.UtcNow.Ticks;
        }
    }

    public static TaskWrapper task;
    private static ConcurrentBag<Issue> issues;

    public static byte[] ToLiveStatsJsonBytes(this Issue issue) => JsonSerializer.SerializeToUtf8Bytes(new Dictionary<string, string> {
        { issue.severity.ToString(), issue.message },
        { "source", issue.source },
    });

    public static byte[] Start(string origin) {
        if (task is not null) return Data.CODE_OTHER_TASK_IN_PROGRESS.Array;

        issues = new ConcurrentBag<Issue>();

        Thread thread = new Thread(() => Scan());

        task = new TaskWrapper("Issues") {
            thread = thread,
            origin = origin,
            TotalSteps = 0,
            CompletedSteps = 0
        };

        task.thread.Start();

        KeepAlive.Broadcast("{\"action\":\"issues\",\"scan\":\"started\"}", "/issues/start");

        Logger.Action(origin, "Issues scan started");

        return "{\"status\":\"started\"}"u8.ToArray();
    }

    public static byte[] Stop(string origin) {
        if (task is null) return "{\"error\":\"Scanning task is not running\"}"u8.ToArray();
        task.RequestCancel(origin);

        Logger.Action(origin, $"Issues scan stopped");

        return "{\"status\":\"stopped\"}"u8.ToArray();
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
            while (ws.State == WebSocketState.Open) {
                if (!Auth.IsAuthenticatedAndAuthorized(ctx, "/ws/issues")) {
                    ctx.Response.Close();
                    return;
                }

                lastIssuesCount = issues?.Count ?? 0;

                IEnumerable<Issue> filtered = issues.Where(o => o.timestamp > lastTimestamp);

                if (filtered.Any()) {
                    byte[] bytes = JsonSerializer.SerializeToUtf8Bytes(filtered.Select(o => new {
                        severity = o.severity,
                        issue    = o.message,
                        entry    = o.entry,
                        category = o.category,
                        source   = o.source,
                        file     = o.file,
                        isUser   = o.isUser,
                    }));

                    await WsWriteText(ws, bytes);

                    lastTimestamp = filtered.Max(o => o.timestamp);
                }

                if (task is null) {
                    break;
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
        task.status = TaskWrapper.TaskStatus.Running;

        ScanUsers();
        ScanDevices();
        task = null;
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

        if (OperatingSystem.IsWindows()
            && typeAttribute?.value.ToLower() == "domain user"
            && usernameAttribute is not null
            && !String.IsNullOrEmpty(usernameAttribute.value)) {
            CheckDomainUser(user, out Issue[] domainIssue, SeverityLevel.warning);
            if (domainIssue is not null) {
                for (int i = 0; i < domainIssue.Length; i++) {
                    issues.Add(domainIssue[i]);
                }
            }
        }
    }

    private static void ScanDevices() {
        CheckIpAddresses(out Dictionary<string, Database.Entry> ipAddresses);
        CheckMacAddresses();

        foreach (KeyValuePair<string, Database.Entry> host in ipAddresses) {
            if (CheckRtt(host.Value, host.Key, out Issue? issue)) {
                issues.Add(issue.Value);
            }
        }

        ipAddresses.Clear();

        foreach (KeyValuePair<string, Database.Entry> device in DatabaseInstances.devices.dictionary) {
            ScanDevice(device.Value);
        }
    }

    public static void ScanDevice(Database.Entry device) {
        device.attributes.TryGetValue("type", out Database.Attribute typeAttribute);
        device.attributes.TryGetValue("operating system", out Database.Attribute osAttribute);

        if (CheckPasswordStrength(device, false, out Issue? issue) && issue.HasValue) {
            issues.Add(issue.Value);
        }

        if (osAttribute?.value.Contains("windows", StringComparison.OrdinalIgnoreCase) == true) {
            string ipString = null;
            if (device.attributes.TryGetValue("ip", out Database.Attribute ip) && !String.IsNullOrEmpty(ip?.value)) {
                ipString = ip.value.Split(';').Select(o => o.Trim()).ToArray()[0];
            }

            if (CheckCpu(device, ipString, out Issue ? cpuIssue)) {
                issues.Add(cpuIssue.Value);
            }

            if (CheckMemory(device, ipString, out Issue? memoryIssue)) {
                issues.Add(memoryIssue.Value);
            }

            if (CheckDiskSpace(device, ipString, out Issue[] diskIssues) && diskIssues is not null) {
                for (int i = 0; i < diskIssues.Length; i++) {
                    issues.Add(diskIssues[i]);
                }
            }

            if (CheckDiskIO(device, ipString, out Issue? diskIoIssue))  {
                issues.Add(diskIoIssue.Value);
            }
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

    public static void CheckIpAddresses(out Dictionary<string, Database.Entry> ipAddresses) {
        ipAddresses = new Dictionary<string, Database.Entry>();
        foreach (KeyValuePair<string, Database.Entry> device in DatabaseInstances.devices.dictionary) {
            if (device.Value.attributes.TryGetValue("ip", out Database.Attribute ipAttribute)) {

                string[] ips = ipAttribute.value.Split(',').Select(o=>o.Trim()).ToArray();
                for (int i = 0; i < ips.Length; i++) {
                    if (string.IsNullOrEmpty(ips[i])) { continue; }
                    if (ips[i].Contains("dhcp", StringComparison.OrdinalIgnoreCase)) { continue; }

                    if (ipAddresses.ContainsKey(ips[i])) {
                        issues.Add(new Issue {
                            severity = SeverityLevel.info,
                            message = "IP address is duplicated in various records",
                            entry = ips[i],
                            category = "Database",
                            source = "Internal check",
                            file = device.Value.filename,
                            isUser = false,
                        });

                        continue;
                    }

                    ipAddresses.Add(ips[i], device.Value);
                }
            }
        }
    }

    public static void CheckMacAddresses() {
        Dictionary<string, Database.Entry> macAddresses = new Dictionary<string, Database.Entry>();

        foreach (KeyValuePair<string, Database.Entry> device in DatabaseInstances.devices.dictionary) {
            if (device.Value.attributes.TryGetValue("mac address", out Database.Attribute ipAttribute)) {

                string[] macs = ipAttribute.value.Split(',').Select(o=>o.Trim()).ToArray();
                for (int i = 0; i < macs.Length; i++) {
                    if (string.IsNullOrEmpty(macs[i])) { continue; }
                    
                    macs[i] = macs[i].Replace(":", "").Replace("-", "").ToUpper();
                    
                    if (string.IsNullOrEmpty(macs[i])) { continue; }

                    if (macAddresses.ContainsKey(macs[i])) {
                        issues.Add(new Issue {
                            severity = SeverityLevel.info,
                            message  = "MAC address is duplicated in various records",
                            entry    = macs[i].Length == 12 ? Regex.Replace(macs[i], @"(\w{2})(?=\w)", "$1:") : macs[i],
                            category = "Database",
                            source   = "Internal check",
                            file     = device.Value.filename,
                            isUser   = false,
                        });

                        continue;
                    }

                    macAddresses.Add(macs[i], device.Value);
                }
            }
        }
    }

    public static bool CheckRtt(Database.Entry device, string host, out Issue? issue) {
        byte[] lifeline = Lifeline.LoadFile(host, 7, "rtt");

        if (lifeline is null || lifeline.Length < 10 * MIN_LIFELINE_ENTRIES) {
            issue = null;
            return false;
        }

        List<int> rttValues = new List<int>();

        long lastTimestamp = 0;
        int lastRtt = 0;

        long targetDate = DateTimeOffset.UtcNow.AddDays(-7).ToUnixTimeMilliseconds();

        for (int i = 0; i < lifeline.Length - 9; i += 10) {
            byte[] dateBuffer = new byte[8];
            Array.Copy(lifeline, i, dateBuffer, 0, 8);
            long timestamp = BitConverter.ToInt64(dateBuffer, 0);

            if (timestamp < targetDate) { continue; }

            int rtt = (lifeline[i + 9] << 8) | lifeline[i + 8];

            bool isMinorVariation = i > 0 && Math.Abs(lastRtt - rtt) < 2 && timestamp - lastTimestamp < 600_000;
            if (isMinorVariation) { continue; }
 
            lastTimestamp = timestamp;
            lastRtt = rtt;

            if (rtt >= 32768) { continue; } //negative number

            rttValues.Add(rtt);
        }

        if (rttValues.Count < MIN_LIFELINE_ENTRIES) {
            issue = null;
            return false;
        }

        double mean = rttValues.Average();
        double variance = rttValues.Average(v => Math.Pow(v - mean, 2));
        double standardDeviation = Math.Sqrt(variance);

        int spike = 0;
        bool hasSpike = rttValues.Any(rtt => {
            double abs = Math.Abs(rtt - mean);
            if (abs <= 1) return false;
            if (abs <= standardDeviation * RTT_STANDARD_DEVIATION_MULTIPLIER) return false;
            spike = rtt;
            return true;
        });

        if (hasSpike) {
            issue = new Issue() {
                severity = SeverityLevel.info,
                message  = $"RTT spike detected at {spike}ms",
                entry    = host,
                category = "Round-trip time",
                source   = "ICMP",
                file     = device.filename,
                isUser   = false,
            };
            return true;
        }

        issue = null;
        return false;
    }

    public static bool CheckCpu(Database.Entry device, string host, out Issue? issue) {
        byte[] lifeline = Lifeline.LoadFile(device.filename, 3, "cpu");

        if (lifeline is null || lifeline.Length < 9 * MIN_LIFELINE_ENTRIES) {
            issue = null;
            return false;
        }

        List<int> values = new List<int>();

        long lastTimestamp = 0;
        int lastValue = 0;

        long targetDate = DateTimeOffset.UtcNow.AddDays(-3).ToUnixTimeMilliseconds();

        for (int i = 0; i < lifeline.Length - 8; i += 9) {
            byte[] dateBuffer = new byte[8];
            Array.Copy(lifeline, i, dateBuffer, 0, 8);
            long timestamp = BitConverter.ToInt64(dateBuffer, 0);

            if (timestamp < targetDate) { continue; }

            byte value = lifeline[i + 8];

            bool isMinorVariation = i > 0 && Math.Abs(lastValue - value) < 2 && timestamp - lastTimestamp < 600_000;
            if (isMinorVariation) { continue; }

            lastTimestamp = timestamp;
            lastValue = value;

            values.Add(value);
        }

        if (values.Count < MIN_LIFELINE_ENTRIES) {
            issue = null;
            return false;
        }

        double mean = Math.Round(values.Average(), 1);
        if (mean >= CPU_UTILIZATION_THRESHOLD) {
            issue = new Issue {
                severity = SeverityLevel.error,
                message  = $"CPU utilization averaged {mean}% over the last 3 days",
                entry    = host,
                category = "CPU utilization",
                source   = "WMI",
                file     = device.filename,
                isUser   = false,
            };
            return true;
        }

        issue = null;
        return false;
    }
    
    public static bool CheckMemory(Database.Entry device, string host, out Issue? issue) {
        byte[] lifeline = Lifeline.LoadFile(device.filename, 3, "memory");

        if (lifeline is null || lifeline.Length < 24 * MIN_LIFELINE_ENTRIES) {
            issue = null;
            return false;
        }

        List<int> values = new List<int>();

        long lastTimestamp = 0;
        int lastValue = 0;

        long targetDate = DateTimeOffset.UtcNow.AddDays(-3).ToUnixTimeMilliseconds();

        for (int i = 0; i < lifeline.Length - 23; i += 24) {
            byte[] buffer = new byte[8];

            Array.Copy(lifeline, i, buffer, 0, 8);
            long timestamp = BitConverter.ToInt64(buffer, 0);

            if (timestamp < targetDate) { continue; }

            Array.Copy(lifeline, i+8, buffer, 0, 8);
            ulong used = BitConverter.ToUInt64(buffer, 0);

            Array.Copy(lifeline, i + 16, buffer, 0, 8);
            ulong total = BitConverter.ToUInt64(buffer, 0);

            int value = (int)(100 * used / total);

            bool isMinorVariation = i > 0 && Math.Abs(lastValue - value) < 2 && timestamp - lastTimestamp < 600_000;
            if (isMinorVariation) { continue; }

            lastTimestamp = timestamp;
            lastValue = value;

            values.Add(value);
        }

        if (values.Count < MIN_LIFELINE_ENTRIES) {
            issue = null;
            return false;
        }

        double mean = Math.Round(values.Average(), 1);
        if (mean > MEMORY_USAGE_THRESHOLD) {
            issue = new Issue {
                severity = SeverityLevel.error,
                message  = $"Memory usage averaged {mean}% over the last 3 days",
                entry    = host,
                category = "Memory usage",
                source   = "WMI",
                file     = device.filename,
                isUser   = false,
            };
            return true;
        }
        
        issue = null;
        return false;
    }

    public static bool CheckDiskSpace(Database.Entry device, string host, out Issue[] issues) {
        byte[] lifeline = Lifeline.ViewFile(device.filename, DateTime.Now.ToString("yyyyMM"), "disk");

        if (lifeline is null || lifeline.Length <= 12 + 17 * MIN_LIFELINE_ENTRIES) {
            DateTime lastMonth = DateTime.UtcNow.AddMonths(-1);
            lifeline = Lifeline.ViewFile(device.filename, lastMonth.ToString("yyyyMM"), "disk");

            if (lifeline is null || lifeline.Length <= 12 + 17 * MIN_LIFELINE_ENTRIES) {
                issues = null;
                return false;
            }
        }

        byte[] buffer8 = new byte[8];
        Dictionary<string, List<(long timestamp, double percentUsed)>> diskData = new Dictionary<string, List<(long, double)>>();

        int index = 0;
        while (index < lifeline.Length) {
            Array.Copy(lifeline, index, buffer8, 0, 8);
            long timestamp = BitConverter.ToInt64(buffer8, 0);

            Array.Copy(lifeline, index + 8, buffer8, 0, 4);
            int count = BitConverter.ToInt32(buffer8, 0);

            index += 12;

            for (int i = 0; i < count; i++) {
                char caption = (char)lifeline[index + i*17];

                Array.Copy(lifeline, index + i*17 + 1, buffer8, 0, 8);
                ulong used = BitConverter.ToUInt64(buffer8, 0);

                Array.Copy(lifeline, index + i*17 + 9, buffer8, 0, 8);
                ulong total = BitConverter.ToUInt64(buffer8, 0);

                double percentUsed = (double)used / total * 100;

                string diskKey = caption.ToString();
                if (!diskData.ContainsKey(diskKey)) {
                    diskData[diskKey] = new List<(long timestamp, double percentUsed)>();
                }
                diskData[diskKey].Add((timestamp, percentUsed));
            }

            index += 17 * count;
        }

        List<Issue> issuesList = new List<Issue>();

        foreach (KeyValuePair<string, List<(long timestamp, double percentUsed)>> diskEntry in diskData) {
            List<(long timestamp, double percentUsed)> usageData = diskEntry.Value;

            if (usageData.Count == 0) { continue; }
            if (CheckDiskSpace(device.filename, host, 100 - usageData.Last().percentUsed, diskEntry.Key, out Issue? diskIssue)) {
                issuesList.Add(diskIssue.Value);
                continue;
            }

            if (usageData.Count < MIN_LIFELINE_ENTRIES) { continue; }

            long firstTimestamp = usageData[0].timestamp;
            List<(double timestamp, double percentUsed)> normalizedData = usageData.Select(data => (
                timestamp: (double)(data.timestamp - firstTimestamp),
                percentUsed: data.percentUsed
            )).ToList();

            //linear regression to find the trend line
            double n     = normalizedData.Count;
            double sumX  = normalizedData.Sum(data => data.timestamp);
            double sumY  = normalizedData.Sum(data => data.percentUsed);
            double sumXY = normalizedData.Sum(data => data.timestamp * data.percentUsed);
            double sumX2 = normalizedData.Sum(data => data.timestamp * data.timestamp);

            double slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
            double intercept = (sumY - slope * sumX) / n;

            if (slope == 0) { continue; }

            double currentTime = (double)(DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - firstTimestamp);
            double predictedTime = (DISK_SPACE_THRESHOLD - intercept) / slope;

            if (predictedTime > currentTime) {
                long predictedDateLong = (long)(predictedTime + firstTimestamp);
                if (predictedDateLong < 0) { continue; }

                DateTime predictedDate = DateTimeOffset.FromUnixTimeMilliseconds(predictedDateLong).DateTime;

                if (predictedDate > DateTime.Now.Date.AddYears(1)) { continue; }

                issuesList.Add(new Issue {
                    severity = SeverityLevel.warning,
                    message  = $"Disk {diskEntry.Key}: free space is predicted to drop below {DISK_SPACE_THRESHOLD}% on {predictedDate.ToString(Data.DATE_FORMAT_LONG)}",
                    entry    = host,
                    category = "Disk space",
                    source   = "WMI",
                    file     = device.filename,
                    isUser   = false,
                });
            }
        }

        if (issuesList.Count > 0) {
            issues = issuesList.ToArray();
            return true;
        }

        issues = null;
        return false;
    }

    public static bool CheckDiskIO(Database.Entry device, string host, out Issue? issue) {
        byte[] lifeline = Lifeline.LoadFile(device.filename, 3, "diskio");

        if (lifeline is null || lifeline.Length < 9 * MIN_LIFELINE_ENTRIES) {
            issue = null;
            return false;
        }

        List<int> values = new List<int>();

        long lastTimestamp = 0;
        int lastValue = 0;

        long targetDate = DateTimeOffset.UtcNow.AddDays(-3).ToUnixTimeMilliseconds();

        for (int i = 0; i < lifeline.Length - 8; i += 9) {
            byte[] dateBuffer = new byte[8];
            Array.Copy(lifeline, i, dateBuffer, 0, 8);
            long timestamp = BitConverter.ToInt64(dateBuffer, 0);

            if (timestamp < targetDate) { continue; }

            byte value = lifeline[i + 8];

            bool isMinorVariation = i > 0 && Math.Abs(lastValue - value) < 2 && timestamp - lastTimestamp < 600_000;
            if (isMinorVariation) { continue; }

            lastTimestamp = timestamp;
            lastValue = value;

            values.Add(value);
        }

        if (values.Count < MIN_LIFELINE_ENTRIES) {
            issue = null;
            return false;
        }

        double mean = Math.Round(values.Average(), 1);
        if (mean > DISK_IO_THRESHOLD) {
            issue = new Issue {
                severity = SeverityLevel.error,
                message  = $"Disk I/O averaged {mean}% over the last 3 days",
                entry    = host,
                category = "Disk I/O",
                source   = "WMI",
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
                    entry    = username.value,
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
                        entry    = username.value,
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
                            entry    = username.value,
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
                            entry    = username.value,
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
                        entry    = username.value,
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
                        entry    = username.value,
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
                        entry    = username.value,
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
                        entry    = username.value,
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

                double entropyRounded = Math.Round(entropy, 2);
                issue = new Issue {
                    severity = Issues.SeverityLevel.critical,
                    entry    = target,
                    message  = $"Weak password with {entropyRounded} bit{(entropyRounded <= 1 ? "" : "s")} of entropy",
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

    public static bool CheckDiskSpace(string file, string target, double percent, string diskCaption, out Issue? issue) {
        string message = $"{Math.Round(percent, 1)}% free space on disk {Data.EscapeJsonText(diskCaption)}:";

        if (percent <= 1) {
            issue = new Issue {
                severity = SeverityLevel.critical,
                entry    = target,
                message  = message,
                category = "Disk space",
                source   = "WMI",
                file     = file,
                isUser   = false,
            };
            return true;
        }

        if (percent <= 5) {
            issue = new Issue {
                severity = SeverityLevel.error,
                entry    = target,
                message  = message,
                category = "Disk space",
                source   = "WMI",
                file     = file,
                isUser   = false,
            };
            return true;
        }

        if (percent < 15) {
            issue = new Issue {
                severity = SeverityLevel.warning,
                entry    = target,
                message  = message,
                category = "Disk space",
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
                        entry    = ipAddress.ToString(),
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

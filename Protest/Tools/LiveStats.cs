using System.Collections.Generic;
using System.Diagnostics.CodeAnalysis;
using System.DirectoryServices;
using System.Management;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Runtime.Versioning;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Protest.Http;
using Protest.Protocols;
using Protest.Protocols.Snmp;
using Protest.Tasks;
using Lextm.SharpSnmpLib;

using static Protest.Protocols.Snmp.Polling;

namespace Protest.Tools;

internal static class LiveStats {
    private static readonly string[] PRINTER_TYPES = new string[] { "fax", "multiprinter", "ticket printer", "printer" };
    private static readonly string[] SWITCH_TYPES = new string[] { "switch", "router", "firewall" };

    public static async Task UserStats(HttpListenerContext ctx) {
        if (!Auth.IsAuthenticatedAndAuthorized(ctx, ctx.Request.Url.AbsolutePath)) {
            ctx.Response.Close();
            return;
        }

        WebSocket ws;
        try {
            HttpListenerWebSocketContext wsc = await ctx.AcceptWebSocketAsync(null);
            ws = wsc.WebSocket;
        }
        catch (WebSocketException ex) {
            ctx.Response.Close();
            Logger.Error(ex);
            return;
        }

        if (ws is null) return;

        try {
            byte[] buff = new byte[512];
            WebSocketReceiveResult receiveResult = await ws.ReceiveAsync(new ArraySegment<byte>(buff), CancellationToken.None);
            string file = Encoding.Default.GetString(buff, 0, receiveResult.Count);

            if (!DatabaseInstances.users.dictionary.TryGetValue(file, out Database.Entry entry)) {
                await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, CancellationToken.None);
                return;
            }

            if (Issues.CheckPasswordStrength(entry, true, out Issues.Issue? weakPsIssue)) {
                await WebSocketHelper.WsWriteText(ws, weakPsIssue?.ToLiveStatsJsonBytes());
            }

            try {
                if (OperatingSystem.IsWindows()
                    && entry.attributes.TryGetValue("type", out Database.Attribute typeAttribute)
                    && typeAttribute.value.ToLower() == "domain user"
                    && entry.attributes.TryGetValue("username", out Database.Attribute usernameAttribute)
                    && Issues.CheckDomainUser(entry, out Issues.Issue[] issues, 0)
                    && issues is not null) {
                    for (int i = 0; i < issues.Length; i++) {
                        await WebSocketHelper.WsWriteText(ws, issues[i].ToLiveStatsJsonBytes());
                    }
                }
            }
#if DEBUG
            catch (Exception ex) {
                Logger.Error(ex);
            }
#else
            catch { }
#endif
        }
        catch (WebSocketException ex) when (ex.WebSocketErrorCode == WebSocketError.ConnectionClosedPrematurely) {
            return;
        }
        catch (WebSocketException ex) when (ex.WebSocketErrorCode != WebSocketError.ConnectionClosedPrematurely) {
            //do nothing
        }
        catch (Exception ex) {
            Logger.Error(ex);
        }

        if (ws.State == WebSocketState.Open) {
            try {
                await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, CancellationToken.None);
            }
#if DEBUG
            catch (Exception ex) {
                Logger.Error(ex);
            }
#else
            catch { }
#endif
        }
    }

    public static async Task DeviceStats(HttpListenerContext ctx) {
        if (!Auth.IsAuthenticatedAndAuthorized(ctx, ctx.Request.Url.AbsolutePath)) {
            ctx.Response.Close();
            return;
        }

        WebSocket ws;
        try {
            HttpListenerWebSocketContext wsc = await ctx.AcceptWebSocketAsync(null);
            ws = wsc.WebSocket;
        }
        catch (WebSocketException ex) {
            ctx.Response.Close();
            Logger.Error(ex);
            return;
        }

        if (ws is null) return;

        try {
            byte[] buff = new byte[512];
            WebSocketReceiveResult receiveResult = await ws.ReceiveAsync(new ArraySegment<byte>(buff), CancellationToken.None);
            string file = Encoding.Default.GetString(buff, 0, receiveResult.Count);

            if (!DatabaseInstances.devices.dictionary.TryGetValue(file, out Database.Entry entry)) {
                await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, CancellationToken.None);
                return;
            }

            entry.attributes.TryGetValue("ip", out Database.Attribute _ip);
            entry.attributes.TryGetValue("hostname", out Database.Attribute _hostname);
            entry.attributes.TryGetValue("operating system", out Database.Attribute _os);

            string[] pingArray = Array.Empty<string>();
            if (_ip?.value?.Length > 0) {
                pingArray = _ip.value.Split(';').Select(o => o.Trim()).ToArray();
            }
            else if (_hostname?.value?.Length > 0) {
                pingArray = _hostname.value.Split(';').Select(o => o.Trim()).ToArray();
            }


            string firstAlive = null;
            PingReply firstReply = null;
            Lock firstAliveLock = new Lock();

            if (pingArray.Length > 0) {
                List<Task> pingTasks = new List<Task>(pingArray.Length);

                for (int i = 0; i < pingArray.Length; i++) {
                    int index = i;
                    pingTasks.Add(Task.Run(async () => {
                        try {
                            using System.Net.NetworkInformation.Ping p = new System.Net.NetworkInformation.Ping();
                            PingReply reply = await p.SendPingAsync(pingArray[index], 200);

                            switch ((int)reply.Status) {
                            case (int)IPStatus.Success:
                                lock (firstAliveLock) {
                                    if (firstAlive is null) {
                                        firstAlive = pingArray[index];
                                        firstReply = reply;
                                    }
                                }

                                await WebSocketHelper.WsWriteText(ws, $"{{\"echoReply\":\"{reply.RoundtripTime}\",\"for\":\"{pingArray[index]}\",\"source\":\"ICMP\"}}");
                                LastSeen.Seen(pingArray[index]);
                                break;

                            case (int)IPStatus.TimedOut:
                                await WebSocketHelper.WsWriteText(ws, $"{{\"echoReply\":\"Timed out\",\"for\":\"{pingArray[index]}\",\"source\":\"ICMP\"}}");
                                break;

                            case 11050:
                                await WebSocketHelper.WsWriteText(ws, $"{{\"echoReply\":\"General failure\",\"for\":\"{pingArray[index]}\",\"source\":\"ICMP\"}}");
                                break;

                            default:
                                await WebSocketHelper.WsWriteText(ws, $"{{\"echoReply\":\"{Data.EscapeJsonText(reply.Status.ToString())}\",\"for\":\"{pingArray[index]}\",\"source\":\"ICMP\"}}");
                                break;
                            }

                        }
                        catch {
                            await WebSocketHelper.WsWriteText(ws, $"{{\"echoReply\":\"Error\",\"for\":\"{Data.EscapeJsonText(pingArray[index])}\",\"source\":\"ICMP\"}}");
                        }
                    }));
                }

                await Task.WhenAll(pingTasks);

                if (firstAlive is null) {
                    for (int i = 0; i < pingArray.Length; i++) {
                        string lastSeen = LastSeen.HasBeenSeen(pingArray[i], true);
                        await WebSocketHelper.WsWriteText(ws, $"{{\"info\":\"Last seen {pingArray[i]}: {lastSeen}\",\"source\":\"ICMP\"}}");
                    }
                }
            }

            string wmiHostname = null, adHostname = null, netBios = null, dns = null;

            if (OperatingSystem.IsWindows() && _os?.value?.Contains("windows", StringComparison.OrdinalIgnoreCase) == true) {
                if (WindowsLifecycle.CheckEntry(entry, _ip?.value?.Split(';').ToArray()[0].Trim(), out Issues.Issue? windowsLifecycleIssue) && windowsLifecycleIssue.HasValue) {
                    await WebSocketHelper.WsWriteText(ws, windowsLifecycleIssue.Value.ToLiveStatsJsonBytes());
                }

                WindowsUpdate.UpdatesResult? updatesResult = WindowsUpdate.GetCache(entry.filename);
                if (updatesResult.HasValue) {
                    uint sum = updatesResult.Value.criticalCount + updatesResult.Value.securityCount;
                    if (sum > 0) {
                        byte[] bytes = JsonSerializer.SerializeToUtf8Bytes(new Dictionary<string, object> {
                            { "critical", $"Critical/security updates are available ({sum})" },
                            { "source", "WUA" },
                            { "timestamp", updatesResult.Value.timestamp.ToString() },
                            { "additional", updatesResult.Value.updates.Select(o => new {
                                icon    = o.isCritical ? "critical" : (o.isSecurity ? "security" : "update"),
                                color   = o.isCritical ? "rgb(240,16,16)" : (o.isSecurity ? "rgb(232,118,0)" : "rgb(32,148,240)"),
                                title   = o.title,
                                boxes   = o.kbArticleIds.Split(","),
                                content = o.description,
                                note    = o.rebootRequired ? "Reboot required" : String.Empty
                                })
                            }
                        });
                        await WebSocketHelper.WsWriteText(ws, bytes);
                    }
                }

                if (firstAlive is not null && firstReply.Status == IPStatus.Success) {
                    await WmiQuery(ws, firstAlive);
                }
            }

            if (firstAlive is not null
                && firstReply.Status == IPStatus.Success
                && entry.attributes.TryGetValue("type", out Database.Attribute _type)
                && entry.attributes.TryGetValue("snmp profile", out Database.Attribute _snmpProfile)) {
                await SnmpQuery(ws, file, firstAlive, _type?.value.ToLower(), _snmpProfile.value);
            }

            if (OperatingSystem.IsWindows() && _hostname?.value?.Length > 0) {
                try {
                    string hostname = _hostname.value;
                    SearchResult result = Ldap.GetWorkstation(hostname);

                    if (result is not null) {
                        if (result.Properties["lastLogonTimestamp"].Count > 0) {
                            string time = Ldap.FileTimeString(result.Properties["lastLogonTimestamp"][0].ToString());
                            if (time.Length > 0) {
                                await WebSocketHelper.WsWriteText(ws, $"{{\"info\":\"Last logon: {Data.EscapeJsonText(time)}\",\"source\":\"LDAP\"}}");
                            }
                        }

                        if (result.Properties["lastLogoff"].Count > 0) {
                            string time = Ldap.FileTimeString(result.Properties["lastLogoff"][0].ToString());
                            if (time.Length > 0) {
                                await WebSocketHelper.WsWriteText(ws, $"{{\"info\":\"Last logoff: {Data.EscapeJsonText(time)}\",\"source\":\"LDAP\"}}");
                            }
                        }

                        if (result.Properties["dnsHostName"].Count > 0) {
                            adHostname = result.Properties["dnsHostName"][0].ToString();
                        }
                    }
                }
#if DEBUG
                catch (Exception ex) {
                    Logger.Error(ex);
                }
#else
                catch { }
#endif
            }

            if (!String.IsNullOrEmpty(firstAlive)) {
                try {
                    dns = (await System.Net.Dns.GetHostEntryAsync(firstAlive)).HostName;
                }
#if DEBUG
                catch (Exception ex) {
                    Logger.Error(ex);
                }
#else
                catch { }
#endif
            }

            if (!String.IsNullOrEmpty(dns)) { //check dns mismatch
                try {
                    dns = dns.Split('.')[0].ToUpper();
                    bool mismatch = false;

                    if (!mismatch && !String.IsNullOrEmpty(wmiHostname)) {
                        wmiHostname = wmiHostname.Split('.')[0].ToUpper();
                        if (wmiHostname != dns) {
                            await WebSocketHelper.WsWriteText(ws, $"{{\"warning\":\"DNS mismatch: {Data.EscapeJsonText(wmiHostname)} ≠ {Data.EscapeJsonText(dns)}\",\"source\":\"WMI\"}}");
                            mismatch = true;
                        }
                    }

                    if (!mismatch && !String.IsNullOrEmpty(adHostname)) {
                        adHostname = adHostname.Split('.')[0].ToUpper();
                        if (adHostname != dns) {
                            await WebSocketHelper.WsWriteText(ws, $"{{\"warning\":\"DNS mismatch: {Data.EscapeJsonText(adHostname)} ≠ {Data.EscapeJsonText(dns)}\",\"source\":\"LDAP\"}}");
                            mismatch = true;
                        }
                    }

                    if (!mismatch && wmiHostname is null && adHostname is null) {
                        netBios = await NetBios.GetBiosNameAsync(firstAlive, 500);
                    }

                    if (!mismatch && !String.IsNullOrEmpty(netBios)) {
                        netBios = netBios.Split('.')[0].ToUpper();
                        if (netBios != dns) {
                            await WebSocketHelper.WsWriteText(ws, $"{{\"warning\":\"DNS mismatch: {Data.EscapeJsonText(netBios)} ≠ {Data.EscapeJsonText(dns)}\",\"source\":\"NetBIOS\"}}");
                            //mismatch = true;
                        }
                    }
                }
#if DEBUG
                catch (Exception ex) {
                    Logger.Error(ex);
                }
#else
                catch { }
#endif
            }

            if (!String.IsNullOrEmpty(_hostname?.value) && !String.IsNullOrEmpty(_ip?.value)) { //check reverse dns mismatch
                string[] hostnames = _hostname.value.Split(';').Select(o => o.Trim()).ToArray();
                string[] ips = _ip.value.Split(';').Select(o => o.Trim()).ToArray();

                for (int i = 0; i < hostnames.Length; i++) {
                    if (String.IsNullOrEmpty(hostnames[i])) continue;

                    try {
                        IPAddress[] reversed = System.Net.Dns.GetHostAddresses(hostnames[i]);
                        for (int j = 0; j < reversed.Length; j++) {
                            if (reversed[j].AddressFamily != AddressFamily.InterNetwork) continue;
                            if (!ips.Contains(reversed[j].ToString())) {
                                await WebSocketHelper.WsWriteText(ws, $"{{\"warning\":\"Reverse DNS mismatch: {Data.EscapeJsonText(reversed[j].ToString())}\",\"source\":\"DNS\"}}");
                                break;
                            }
                        }
                    }
#if DEBUG
                    catch (SocketException ex) {
                        if (ex.SocketErrorCode != SocketError.HostNotFound) {
                            Logger.Error(ex);
                        }
                    }
                    catch (Exception ex) {
                        Logger.Error(ex);
                    }
#else
                    catch { }
#endif
                }
            }

            if (Issues.CheckPasswordStrength(entry, false, out Issues.Issue? weakPsIssue)) {
                await WebSocketHelper.WsWriteText(ws, weakPsIssue?.ToLiveStatsJsonBytes());
            }
        }
        catch (WebSocketException ex) when (ex.WebSocketErrorCode == WebSocketError.ConnectionClosedPrematurely) {
            return;
        }
        catch (WebSocketException ex) when (ex.WebSocketErrorCode != WebSocketError.ConnectionClosedPrematurely) {
            //do nothing
        }
        catch (Exception ex) {
            Logger.Error(ex);
        }

        if (ws.State == WebSocketState.Open) {
            try {
                await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, CancellationToken.None);
            }
#if DEBUG
            catch (Exception ex) {
                Logger.Error(ex);
            }
#else
            catch { }
#endif
        }
    }

    [SupportedOSPlatform("windows")]
    private static async Task WmiQuery(WebSocket ws, string firstAlive) {
        try {
            ManagementScope scope = Protocols.Wmi.Scope(firstAlive, "cimv2", 3_000);

            if (scope is not null && scope.IsConnected) {
                using ManagementObjectSearcher localDiskSearcher = new ManagementObjectSearcher(scope, new SelectQuery("SELECT * FROM Win32_LogicalDisk WHERE DriveType = 3"));
                using ManagementObjectCollection logicalDiskCollection = localDiskSearcher.Get();
                foreach (ManagementObject o in logicalDiskCollection.Cast<ManagementObject>()) {
                    string caption = o.GetPropertyValue("Caption").ToString().Replace(":", String.Empty);

                    object size = o.GetPropertyValue("Size");
                    if (size is null) continue;

                    object free = o.GetPropertyValue("FreeSpace");
                    if (free is null) continue;

                    ulong nSize = (ulong)size;
                    ulong nFree = (ulong)free;

                    if (nSize == 0) continue;
                    double percent = Math.Round(100.0 * nFree / nSize, 1);

                    await WebSocketHelper.WsWriteText(ws, $"{{\"drive\":\"{caption}:\",\"total\":{nSize},\"used\":{nSize - nFree},\"path\":\"{Data.EscapeJsonText($"\\\\{firstAlive}\\{caption}$")}\",\"source\":\"WMI\"}}");

                    if (Issues.CheckDiskSpace(null, firstAlive, percent, caption, out Issues.Issue? diskIssue)) {
                        await WebSocketHelper.WsWriteText(ws, diskIssue?.ToLiveStatsJsonBytes());
                    }
                }

                using ManagementObjectSearcher timeSearcher = new ManagementObjectSearcher(scope, new SelectQuery("SELECT * FROM Win32_UTCTime"));
                using ManagementObjectCollection timeCollection = timeSearcher.Get();
                foreach (ManagementObject o in timeCollection.Cast<ManagementObject>()) {
                    int year   = Convert.ToInt32(o.GetPropertyValue("Year"));
                    int month  = Convert.ToInt32(o.GetPropertyValue("Month"));
                    int day    = Convert.ToInt32(o.GetPropertyValue("Day"));
                    int hour   = Convert.ToInt32(o.GetPropertyValue("Hour"));
                    int minute = Convert.ToInt32(o.GetPropertyValue("Minute"));
                    int second = Convert.ToInt32(o.GetPropertyValue("Second"));

                    DateTime current = new DateTime(year, month, day, hour, minute, second);
                    DateTime now = DateTime.UtcNow;
                    if (Math.Abs(current.Ticks - now.Ticks) > 600_000_000L) {
                        await WebSocketHelper.WsWriteText(ws, "{\"warning\":\"System time is off by more than 5 minutes\",\"source\":\"WMI\"}"u8.ToArray());
                    }
                }

                string startTime = Wmi.WmiGet(scope, "Win32_LogonSession", "StartTime", false, new Wmi.FormatMethodPtr(Wmi.DateTimeToString));
                if (startTime.Length > 0) {
                    await WebSocketHelper.WsWriteText(ws, $"{{\"info\":\"Start time: {Data.EscapeJsonText(startTime)}\",\"source\":\"WMI\"}}");
                }

                string username = Wmi.WmiGet(scope, "Win32_ComputerSystem", "UserName", false, null);
                if (username.Length > 0) {
                    await WebSocketHelper.WsWriteText(ws, $"{{\"info\":\"Logged in user: {Data.EscapeJsonText(username)}\",\"source\":\"WMI\"}}");
                }

                await WebSocketHelper.WsWriteText(ws, $"{{\"activeUser\":\"{Data.EscapeJsonText(username)}\",\"source\":\"WMI\"}}");
            }
        }
#if DEBUG
        catch (Exception ex) {
            Logger.Error(ex);
        }
#else
        catch { }
#endif
    }

    private static async Task SnmpQuery(WebSocket ws, string file, string firstAlive, string type, string snmpProfileGuid) {
        if (!SnmpProfiles.FromGuid(snmpProfileGuid, out SnmpProfiles.Profile profile)) {
            return;
        }

        if (profile is null) { return; }
        if (!IPAddress.TryParse(firstAlive, out IPAddress ipAddress)) { return; }

        IList<Variable> result = Protocols.Snmp.Polling.SnmpQuery(ipAddress, profile, Protocols.Snmp.Oid.LIVESTATS_OID, Protocols.Snmp.Polling.SnmpOperation.Get);
        Dictionary<string, string> formatted = Protocols.Snmp.Polling.ParseResponse(result);

        if (formatted is not null && formatted.TryGetValue(Protocols.Snmp.Oid.SYSTEM_UPTIME, out string snmpUptime)) {
            await WebSocketHelper.WsWriteText(ws, $"{{\"info\":\"Uptime: {Data.EscapeJsonText(snmpUptime)}\",\"source\":\"SNMP\"}}");
        }

        if (PRINTER_TYPES.Contains(type)) {
            await SnmpQueryPrinter(ws, file, ipAddress, profile);
        }
        else if (SWITCH_TYPES.Contains(type)) {
            await SnmpQuerySwitch(ws, ipAddress, profile);
        }

    }

    private static async Task SnmpQueryPrinter(WebSocket ws, string file, IPAddress ipAddress, SnmpProfiles.Profile profile) {
        IList<Variable> result = Protocols.Snmp.Polling.SnmpQuery(ipAddress, profile, Protocols.Snmp.Oid.LIVESTATS_PRINTER_OID, Protocols.Snmp.Polling.SnmpOperation.Get);
        Dictionary<string, string> printerFormatted = Protocols.Snmp.Polling.ParseResponse(result);

        if (printerFormatted is not null) {
            if (printerFormatted.TryGetValue(Protocols.Snmp.Oid.PRINTER_STATUS, out string snmpPrinterStatus)) {
                string status = snmpPrinterStatus switch {
                    "1" => "Other",
                    "2" => "Processing",
                    "3" => "Idle",
                    "4" => "Printing",
                    "5" => "Warmup",
                    _   => snmpPrinterStatus
                };
                await WebSocketHelper.WsWriteText(ws, $"{{\"info\":\"Printer status: {Data.EscapeJsonText(status)}\",\"source\":\"SNMP\"}}");
            }

            if (printerFormatted.TryGetValue(Protocols.Snmp.Oid.PRINTER_MARKER_COUNTER_LIFE, out string snmpPageCounter)) {
                await WebSocketHelper.WsWriteText(ws, $"{{\"info\":\"Total pages counter: {Data.EscapeJsonText(snmpPageCounter)}\",\"source\":\"SNMP\"}}");
            }

            if (printerFormatted.TryGetValue(Protocols.Snmp.Oid.PRINTER_DISPLAY_MESSAGE, out string snmpDisplayMessage)) {
                await WebSocketHelper.WsWriteText(ws, $"{{\"info\":\"Printer message: {Data.EscapeJsonText(snmpDisplayMessage)}\",\"source\":\"SNMP\"}}");
            }

            if (printerFormatted.TryGetValue(Protocols.Snmp.Oid.PRINTER_JOBS, out string snmpPrinterJobs)) {
                await WebSocketHelper.WsWriteText(ws, $"{{\"info\":\"Total jobs: {Data.EscapeJsonText(snmpPrinterJobs)}\",\"source\":\"SNMP\"}}");
            }
        }

        if (Issues.CheckPrinterComponent(file, ipAddress, profile, out Issues.Issue[] issues) && issues is not null) {
            for (int i = 0; i < issues.Length; i++) {
                await WebSocketHelper.WsWriteText(ws, issues[i].ToLiveStatsJsonBytes());
            }
        }
    }

    private static async Task SnmpQuerySwitch(WebSocket ws, IPAddress ipAddress, SnmpProfiles.Profile profile) {
        IList<Variable> result = Protocols.Snmp.Polling.SnmpQuery(ipAddress, profile, Protocols.Snmp.Oid.LIVEVIEW_SWITCH_OID, Protocols.Snmp.Polling.SnmpOperation.Walk);

        if (result is null) {
            await WebSocketHelper.WsWriteText(ws, "{\"switchInfo\":{\"success\":false}}"u8.ToArray());
            return;
        }

        Dictionary<string, string> parsedResult = Protocols.Snmp.Polling.ParseResponse(result);
        if (parsedResult is null) {
            await WebSocketHelper.WsWriteText(ws, "{\"switchInfo\":{\"success\":false}}"u8.ToArray());
            return;
        }

        Dictionary<int, string> typeDic       = new Dictionary<int, string>();
        Dictionary<int, string> speedDic      = new Dictionary<int, string>();
        Dictionary<int, short > untaggedDic   = new Dictionary<int, short>();
        Dictionary<int, string> taggedDic     = new Dictionary<int, string>();
        Dictionary<int, byte>   statusDic     = new Dictionary<int, byte>();
        Dictionary<int, long>   trafficInDic  = new Dictionary<int, long>();
        Dictionary<int, long>   trafficOutDic = new Dictionary<int, long>();
        Dictionary<int, int>    errorInDic    = new Dictionary<int, int>();
        Dictionary<int, int>    errorOutDic   = new Dictionary<int, int>();

        Dictionary<int, string> macTable = new Dictionary<int, string>();
        foreach (KeyValuePair<string, string> pair in parsedResult) {
            if (!pair.Key.StartsWith(Oid.INT_1D_TP_FDB)) continue;
            if (!int.TryParse(pair.Value, out int port)) continue;

            string[] oidSplit = pair.Key.Split('.');
            if (oidSplit.Length < 6) continue;

            int[] parts = oidSplit
                .Skip(oidSplit.Length - 6)
                .Select(s => int.TryParse(s, out int part) && part>=0  && part>=255 ? part : -1)
                .ToArray();

            if (parts.Any(part => part < 0)) continue;

            string mac = string.Concat(parts.Select(p => p.ToString("x2")));

            if (!macTable.TryAdd(port, mac)) {
                macTable[port] = null;
            }
        }

        foreach (KeyValuePair<string, string> pair in parsedResult) {
            if (!int.TryParse(pair.Key.Split('.')[^1], out int index)) continue;

            if (pair.Key.StartsWith(Protocols.Snmp.Oid.INT_TYPE)) {
                typeDic.Add(index, pair.Value);
            }
            else if (pair.Key.StartsWith(Protocols.Snmp.Oid.INT_SPEED)) {
                speedDic.Add(index, pair.Value);
            }
            else if (pair.Key.StartsWith(Protocols.Snmp.Oid.INT_1Q_VLAN)) {
                untaggedDic.Add(index, short.TryParse(pair.Value, out short v) ? v : (short)0);
            }
            else if (pair.Key.StartsWith(Protocols.Snmp.Oid.INT_STATUS)) {
                statusDic.Add(index, byte.TryParse(pair.Value, out byte v) ? v : (byte)0);
            }
            else if (pair.Key.StartsWith(Protocols.Snmp.Oid.INT_TRAFFIC_BYTES_IN)) {
                trafficInDic.Add(index, long.TryParse(pair.Value, out long v) ? v : 0);
            }
            else if (pair.Key.StartsWith(Protocols.Snmp.Oid.INT_TRAFFIC_BYTES_OUT)) {
                trafficOutDic.Add(index, long.TryParse(pair.Value, out long v) ? v : 0);
            }
            else if (pair.Key.StartsWith(Protocols.Snmp.Oid.INT_ERROR_IN)) {
                errorInDic.Add(index, int.TryParse(pair.Value, out int v) ? v : 0);
            }
            else if (pair.Key.StartsWith(Protocols.Snmp.Oid.INT_ERROR_OUT)) {
                errorOutDic.Add(index, int.TryParse(pair.Value, out int v) ? v : 0);
            }
        }

        Dictionary<short, List<int>> taggedMap = new Dictionary<short, List<int>>();
        for (int i = 0; i < result.Count; i++) {
            string oid = result[i].Id.ToString();
            if (!oid.StartsWith(Oid.INT_1Q_VLAN_EGRESS)) continue;

            int dotIndex = oid.LastIndexOf('.');
            if (dotIndex == -1) continue;
            if (!short.TryParse(oid[(dotIndex + 1)..], out short vlanId)) continue;

            byte[] raw = result[i].Data.ToBytes();

            int startIndex = Topology.GetPortBitmapStart(raw);
            if (startIndex == -1) continue;

            int maxIndex = Math.Min(raw.Length, startIndex + Topology.GetPortBitmapLength(raw, startIndex));

            for (int j = startIndex; j < maxIndex; j++) {
                byte b = raw[j];
                for (int k = 0; k < 8; k++) {
                    if ((b & (1 << (7 - k))) != 0) {
                        int portIndex = 8 * (j - startIndex) + (k + 1);
                        if (!taggedMap.TryGetValue(vlanId, out List<int> ports)) {
                            ports = new List<int>();
                            taggedMap[vlanId] = ports;
                        }
                        if (!ports.Contains(portIndex)) {
                            ports.Add(portIndex);
                        }
                    }
                }
            }
        }

        foreach (KeyValuePair<short, List<int>> pair in taggedMap) {
            foreach (int port in pair.Value) {
                taggedDic.TryGetValue(port, out string existing);
                short.TryParse(pair.Key.ToString(), out short currentVlan);
                if (untaggedDic.TryGetValue(port, out short untaggedVlanId) && untaggedVlanId == currentVlan) continue;
                taggedDic[port] = string.IsNullOrEmpty(existing) ? currentVlan.ToString() : $"{existing},{currentVlan}";
            }
        }

        List<string> speedList    = new List<string>(typeDic.Count);
        List<short> untaggedList  = new List<short>(typeDic.Count);
        List<string> taggedList   = new List<string>(typeDic.Count);
        List<short>  statusList   = new List<short>(typeDic.Count);
        List<long>   dataList     = new List<long>(typeDic.Count);
        List<int>    errorList    = new List<int>(typeDic.Count);
        List<string> linkList     = new List<string>(typeDic.Count);

        foreach (KeyValuePair<int, string> pair in typeDic) {
            if (pair.Value != "6") continue; //physical ports only

            string rawSpeed = speedDic.TryGetValue(pair.Key, out string s) ? s : "N/A";
            speedList.Add(PortSpeedToString(rawSpeed));

            untaggedList.Add(untaggedDic.TryGetValue(pair.Key, out short untaggedVlan) ? untaggedVlan : (short)1);
            taggedList.Add(taggedDic.TryGetValue(pair.Key, out string taggedVlan) ? taggedVlan : String.Empty);
            statusList.Add(statusDic.TryGetValue(pair.Key, out byte status) ? status : (short)0);

            long inTraffic = trafficInDic.TryGetValue(pair.Key, out long tin) ? tin : 0;
            long outTraffic = trafficOutDic.TryGetValue(pair.Key, out long tout) ? tout : 0;
            dataList.Add(inTraffic + outTraffic);

            int inErrors = errorInDic.TryGetValue(pair.Key, out int ein) ? ein : 0;
            int outErrors = errorOutDic.TryGetValue(pair.Key, out int eout) ? eout : 0;
            errorList.Add(inErrors + outErrors);

            string link = macTable.TryGetValue(pair.Key, out string mac) ? mac : null;
            linkList.Add(DatabaseInstances.FindDeviceByMac(link));
        }

        byte[] payload = JsonSerializer.SerializeToUtf8Bytes(new {
            switchInfo = new {
                success  = true,
                speed    = speedList,
                untagged = untaggedList,
                tagged   = taggedList,
                status   = statusList,
                data     = dataList,
                error    = errorList,
                link     = linkList
            }
        });

        await WebSocketHelper.WsWriteText(ws, payload);
    }

}

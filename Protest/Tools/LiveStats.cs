using System;
using System.Collections.Generic;
using System.Diagnostics.CodeAnalysis;
using System.Diagnostics.Metrics;
using System.DirectoryServices;
using System.Management;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.WebSockets;
using System.Runtime.Versioning;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Timers;
using Protest.Protocols;
using Protest.Tasks;
using Lextm.SharpSnmpLib;
using System.Text.Json;

namespace Protest.Tools;

internal static class LiveStats {
    private static readonly string[] PRINTER_TYPES = new string[] { "fax", "multiprinter", "ticket printer", "printer" };
    private static readonly string[] SWITCH_TYPES = new string[] { "switch", "router", "firewall" };

    private static void WsWriteText(WebSocket ws, [StringSyntax(StringSyntaxAttribute.Json)] string text, object mutex) {
        lock (mutex) {
            WsWriteText(ws, Encoding.UTF8.GetBytes(text), mutex);
        }
    }
    private static void WsWriteText(WebSocket ws, byte[] bytes, object mutex) {
        lock (mutex) {
            ws.SendAsync(new ArraySegment<byte>(bytes, 0, bytes.Length), WebSocketMessageType.Text, true, CancellationToken.None);
        }
    }

    public static async void UserStats(HttpListenerContext ctx) {
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

        try {
            byte[] buff = new byte[512];
            WebSocketReceiveResult receiveResult = await ws.ReceiveAsync(new ArraySegment<byte>(buff), CancellationToken.None);
            string file = Encoding.Default.GetString(buff, 0, receiveResult.Count);

            if (!DatabaseInstances.users.dictionary.TryGetValue(file, out Database.Entry entry)) {
                await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, CancellationToken.None);
                return;
            }

            object mutex = new object();

            if (Issues.CheckPasswordStrength(entry, true, out Issues.Issue? weakPsIssue)) {
                WsWriteText(ws, weakPsIssue?.ToLiveStatsJsonBytes(), mutex);
            }
            
            try {
                if (OperatingSystem.IsWindows()
                    && entry.attributes.TryGetValue("type", out Database.Attribute typeAttribute)
                    && typeAttribute.value.ToLower() == "domain user"
                    && entry.attributes.TryGetValue("username", out Database.Attribute usernameAtrtribute)
                    && Issues.CheckDomainUser(entry, out Issues.Issue[] issues, 0)) {

                    if (issues is not null) {
                        for (int i = 0; i < issues.Length; i++) {
                            WsWriteText(ws, issues[i].ToLiveStatsJsonBytes(), mutex);
                        }
                    }
                }
            }
            catch { }
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

        if (ws?.State == WebSocketState.Open) {
            try {
                await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, CancellationToken.None);
            }
            catch { }
        }
    }

    public static async void DeviceStats(HttpListenerContext ctx) {
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

            object mutex = new object();

            string firstAlive = null;
            PingReply firstReply = null;
            if (pingArray.Length > 0) {
                List<Task> pingTasks = new List<Task>();

                for (int i = 0; i < pingArray.Length; i++) {
                    int index = i;
                    pingTasks.Add(Task.Run(async () => {
                        try {
                            using System.Net.NetworkInformation.Ping p = new System.Net.NetworkInformation.Ping();
                            PingReply reply = await p.SendPingAsync(pingArray[index], 200);
                            if (reply.Status == IPStatus.Success) {
                                if (firstAlive is null) {
                                    firstAlive = pingArray[index];
                                    firstReply = reply;
                                }
                                WsWriteText(ws, $"{{\"echoReply\":\"{reply.RoundtripTime}\",\"for\":\"{pingArray[index]}\",\"source\":\"ICMP\"}}", mutex);
                                WsWriteText(ws, $"{{\"info\":\"Last seen {pingArray[index]}: Just now\",\"source\":\"ICMP\"}}", mutex);
                                LastSeen.Seen(pingArray[index]);
                            }
                            else if (reply.Status == IPStatus.TimedOut) {
                                WsWriteText(ws, $"{{\"echoReply\":\"Timed out\",\"for\":\"{pingArray[index]}\",\"source\":\"ICMP\"}}", mutex);
                            }
                            else {
                                WsWriteText(ws, $"{{\"echoReply\":\"{Data.EscapeJsonText(reply.Status.ToString())}\",\"for\":\"{pingArray[index]}\",\"source\":\"ICMP\"}}", mutex);
                            }
                        }
                        catch {
                            WsWriteText(ws, $"{{\"echoReply\":\"Error\",\"for\":\"{Data.EscapeJsonText(pingArray[index])}\",\"source\":\"ICMP\"}}", mutex);
                        }
                    }));
                }

                await Task.WhenAll(pingTasks);

                if (firstAlive is null) {
                    for (int i = 0; i < pingArray.Length; i++) {
                        string lastSeen = LastSeen.HasBeenSeen(pingArray[i], true);
                        WsWriteText(ws, $"{{\"info\":\"Last seen {pingArray[i]}: {lastSeen}\",\"source\":\"ICMP\"}}", mutex);
                    }
                }
            }

            string wmiHostname = null, adHostname = null, netBios = null, dns = null;

            if (OperatingSystem.IsWindows()
                && _os?.value?.Contains("windows", StringComparison.OrdinalIgnoreCase) == true
                && firstAlive is not null && firstReply.Status == IPStatus.Success) {
                WmiQuery(ws, mutex, firstAlive, ref wmiHostname);
            }

            if (firstAlive is not null
                && firstReply.Status == IPStatus.Success
                && entry.attributes.TryGetValue("type", out Database.Attribute _type)
                && entry.attributes.TryGetValue("snmp profile", out Database.Attribute _snmpProfile)) {
                SnmpQuery(ws, mutex, firstAlive, _type?.value.ToLower(), _snmpProfile.value);
            }

            if (OperatingSystem.IsWindows() && _hostname?.value?.Length > 0) {
                try {
                    string hostname = _hostname.value;
                    SearchResult result = Ldap.GetWorkstation(hostname);

                    if (result is not null) {
                        if (result.Properties["lastLogonTimestamp"].Count > 0) {
                            string time = Ldap.FileTimeString(result.Properties["lastLogonTimestamp"][0].ToString());
                            if (time.Length > 0) {
                                WsWriteText(ws, $"{{\"info\":\"Last logon: {Data.EscapeJsonText(time)}\",\"source\":\"LDAP\"}}", mutex);
                            }
                        }

                        if (result.Properties["lastLogoff"].Count > 0) {
                            string time = Ldap.FileTimeString(result.Properties["lastLogoff"][0].ToString());
                            if (time.Length > 0) {
                                WsWriteText(ws, $"{{\"info\":\"Last logoff: {Data.EscapeJsonText(time)}\",\"source\":\"LDAP\"}}", mutex);
                            }
                        }

                        if (result.Properties["dnsHostName"].Count > 0) {
                            adHostname = result.Properties["dnsHostName"][0].ToString();
                        }
                    }
                }
                catch { }
            }

            try {
                dns = (await System.Net.Dns.GetHostEntryAsync(firstAlive)).HostName;
            }
            catch { }

            if (!String.IsNullOrEmpty(dns)) { //check dns mismatch
                try {
                    dns = dns?.Split('.')[0].ToUpper();
                    bool mismatch = false;

                    if (!mismatch && !String.IsNullOrEmpty(wmiHostname)) {
                        wmiHostname = wmiHostname?.Split('.')[0].ToUpper();
                        if (wmiHostname != dns) {
                            WsWriteText(ws, $"{{\"warning\":\"DNS mismatch: {Data.EscapeJsonText(wmiHostname)}\",\"source\":\"WMI\"}}", mutex);
                            mismatch = true;
                        }
                    }

                    if (!mismatch && !String.IsNullOrEmpty(adHostname)) {
                        adHostname = adHostname?.Split('.')[0].ToUpper();
                        if (adHostname != dns) {
                            WsWriteText(ws, $"{{\"warning\":\"DNS mismatch: {Data.EscapeJsonText(adHostname)}\",\"source\":\"LDAP\"}}", mutex);
                            mismatch = true;
                        }
                    }

                    if (!mismatch && wmiHostname is null && adHostname is null) {
                        netBios = await NetBios.GetBiosNameAsync(firstAlive, 500);
                    }

                    if (!mismatch && !String.IsNullOrEmpty(netBios)) {
                        netBios = netBios?.Split('.')[0].ToUpper();
                        if (netBios != dns) {
                            WsWriteText(ws, $"{{\"warning\":\"DNS mismatch: {Data.EscapeJsonText(netBios)}\",\"source\":\"NetBIOS\"}}", mutex);
                            mismatch = true;
                        }
                    }
                }
                catch { }
            }

            if (String.IsNullOrEmpty(_hostname?.value) && String.IsNullOrEmpty(_ip?.value)) { //check reverse dns mismatch
                string[] hostnames = _hostname?.value.Split(';').Select(o => o.Trim()).ToArray() ?? Array.Empty<string>();
                string[] ips = _ip?.value.Split(';').Select(o => o.Trim()).ToArray() ?? Array.Empty<string>();

                for (int i = 0; i < hostnames.Length; i++) {
                    if (String.IsNullOrEmpty(hostnames[i])) { continue; }

                    try {
                        IPAddress[] reversed = System.Net.Dns.GetHostAddresses(hostnames[i]);
                        for (int j = 0; j < reversed.Length; j++) {
                            if (!ips.Contains(reversed[j].ToString())) {
                                WsWriteText(ws, $"{{\"warning\":\"Reverse DNS mismatch: {Data.EscapeJsonText(reversed[j].ToString())}\",\"source\":\"DNS\"}}", mutex);
                                break;
                            }
                        }
                    }
                    catch { }
                }
            }

            if (Issues.CheckPasswordStrength(entry, false, out Issues.Issue? weakPsIssue)) {
                WsWriteText(ws, weakPsIssue?.ToLiveStatsJsonBytes(), mutex);
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

        if (ws?.State == WebSocketState.Open) {
            try {
                await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, CancellationToken.None);
            }
            catch { }
        }
    }

    [SupportedOSPlatform("windows")]
    private static void WmiQuery(WebSocket ws, object mutex, string firstAlive, ref string wmiHostname) {
        try {
            ManagementScope scope = Protocols.Wmi.Scope(firstAlive, 3_000);
            if (scope is not null && scope.IsConnected) {
                using ManagementObjectCollection logicalDisk = new ManagementObjectSearcher(scope, new SelectQuery("SELECT * FROM Win32_LogicalDisk WHERE DriveType = 3")).Get();
                foreach (ManagementObject o in logicalDisk.Cast<ManagementObject>()) {
                    string caption = o.GetPropertyValue("Caption").ToString().Replace(":", String.Empty);

                    object size = o.GetPropertyValue("Size");
                    if (size is null) continue;

                    object free = o.GetPropertyValue("FreeSpace");
                    if (free is null) continue;

                    ulong nSize = (ulong)size;
                    ulong nFree = (ulong)free;

                    if (nSize == 0) continue;
                    double percent = Math.Round(100.0 * nFree / nSize, 1);

                    WsWriteText(ws, $"{{\"drive\":\"{caption}:\",\"total\":{nSize},\"used\":{nSize - nFree},\"path\":\"{Data.EscapeJsonText($"\\\\{firstAlive}\\{caption}$")}\",\"source\":\"WMI\"}}", mutex);

                    if (Issues.CheckDiskSpace(null, firstAlive, percent, caption, out Issues.Issue? diskIssue)) {
                        WsWriteText(ws, diskIssue?.ToLiveStatsJsonBytes(), mutex);
                    }
                }

                using ManagementObjectCollection currentTime = new ManagementObjectSearcher(scope, new SelectQuery("SELECT * FROM Win32_UTCTime")).Get();
                foreach (ManagementObject o in currentTime.Cast<ManagementObject>()) {
                    int year   = Convert.ToInt32(o.GetPropertyValue("Year"));
                    int month  = Convert.ToInt32(o.GetPropertyValue("Month"));
                    int day    = Convert.ToInt32(o.GetPropertyValue("Day"));
                    int hour   = Convert.ToInt32(o.GetPropertyValue("Hour"));
                    int minute = Convert.ToInt32(o.GetPropertyValue("Minute"));
                    int second = Convert.ToInt32(o.GetPropertyValue("Second"));

                    DateTime current = new DateTime(year, month, day, hour, minute, second);
                    DateTime now = DateTime.UtcNow;
                    if (Math.Abs(current.Ticks - now.Ticks) > 600_000_000L) {
                        WsWriteText(ws, "{\"warning\":\"System time is off by more then 5 minutes\",\"source\":\"WMI\"}"u8.ToArray(), mutex);
                    }
                }

                if (scope is not null) {
                    string startTime = Wmi.WmiGet(scope, "Win32_LogonSession", "StartTime", false, new Wmi.FormatMethodPtr(Wmi.DateTimeToString));
                    if (startTime.Length > 0) {
                        WsWriteText(ws, $"{{\"info\":\"Start time: {Data.EscapeJsonText(startTime)}\",\"source\":\"WMI\"}}", mutex);
                    }

                    string username = Wmi.WmiGet(scope, "Win32_ComputerSystem", "UserName", false, null);
                    if (username.Length > 0) {
                        WsWriteText(ws, $"{{\"info\":\"Logged in user: {Data.EscapeJsonText(username)}\",\"source\":\"WMI\"}}", mutex);
                    }
                    wmiHostname = Wmi.WmiGet(scope, "Win32_ComputerSystem", "DNSHostName", false, null);

                    WsWriteText(ws, $"{{\"activeUser\":\"{Data.EscapeJsonText(username)}\",\"source\":\"WMI\"}}", mutex);
                }
            }
        }
        catch (NullReferenceException) { }
        catch { }
    }

    private static void SnmpQuery(WebSocket ws, object mutex, string firstAlive, string type, string snmpProfileGuid) {
        if (!SnmpProfiles.FromGuid(snmpProfileGuid, out SnmpProfiles.Profile profile)) {
            return;
        }

        if (profile is null) { return; }
        if (!IPAddress.TryParse(firstAlive, out IPAddress ipAddress)) { return; }

        IList<Variable> result = Protocols.Snmp.Polling.SnmpQuery(ipAddress, profile, Protocols.Snmp.Oid.LIVESTATS_OID, Protocols.Snmp.Polling.SnmpOperation.Get);
        Dictionary<string, string> formatted = Protocols.Snmp.Polling.ParseResponse(result);

        if (formatted is not null && formatted.TryGetValue(Protocols.Snmp.Oid.SYSTEM_UPTIME, out string snmpUptime)) {
            /*int dotIndex = snmpUptime.LastIndexOf('.');
            if (dotIndex > -1) {
                snmpUptime = snmpUptime[..dotIndex];
            }*/
            WsWriteText(ws, $"{{\"info\":\"Uptime: {Data.EscapeJsonText(snmpUptime)}\",\"source\":\"SNMP\"}}", mutex);
        }

        if (formatted is not null && formatted.TryGetValue(Protocols.Snmp.Oid.SYSTEM_TEMPERATURE, out string snmpTemperature)) {
            WsWriteText(ws, $"{{\"info\":\"Temperature: {Data.EscapeJsonText(snmpTemperature)}\",\"source\":\"SNMP\"}}", mutex);
        }

        if (PRINTER_TYPES.Contains(type)) {
            SnmpQueryPrinter(ws, mutex, ipAddress, profile);
        }
        else if (SWITCH_TYPES.Contains(type)) {
            SnmpQuerySwitch(ws, mutex, ipAddress, profile);
        }

    }

    private static void SnmpQueryPrinter(WebSocket ws, object mutex, IPAddress ipAddress, SnmpProfiles.Profile profile) {
        IList<Variable> result = Protocols.Snmp.Polling.SnmpQuery(ipAddress, profile, Protocols.Snmp.Oid.LIVESTATS_PRINTER_OID, Protocols.Snmp.Polling.SnmpOperation.Get);
        Dictionary<string, string> printerFormatted = Protocols.Snmp.Polling.ParseResponse(result);

        if (printerFormatted is not null) {
            if (printerFormatted.TryGetValue(Protocols.Snmp.Oid.PRINTER_STATUS, out string snmpPrinterStatus)) {
                string status = snmpPrinterStatus switch
                {
                    "1" => "Other",
                    "2" => "Processing",
                    "3" => "Idle",
                    "4" => "Printing",
                    "5" => "Warmup",
                    _   => snmpPrinterStatus
                };
                WsWriteText(ws, $"{{\"info\":\"Printer status: {Data.EscapeJsonText(status)}\",\"source\":\"SNMP\"}}", mutex);
            }

            if (printerFormatted.TryGetValue(Protocols.Snmp.Oid.PRINTER_MARKER_COUNTER_LIFE, out string snmpPageCounter)) {
                WsWriteText(ws, $"{{\"info\":\"Total pages counter: {Data.EscapeJsonText(snmpPageCounter)}\",\"source\":\"SNMP\"}}", mutex);
            }

            if (printerFormatted.TryGetValue(Protocols.Snmp.Oid.PRINTER_DISPLAY_MESSAGE, out string snmpDisplayMessage)) {
                WsWriteText(ws, $"{{\"info\":\"Printer message: {Data.EscapeJsonText(snmpDisplayMessage)}\",\"source\":\"SNMP\"}}", mutex);
            }

            if (printerFormatted.TryGetValue(Protocols.Snmp.Oid.PRINTER_JOBS, out string snmpPrinterJobs)) {
                WsWriteText(ws, $"{{\"info\":\"Total jobs: {Data.EscapeJsonText(snmpPrinterJobs)}\",\"source\":\"SNMP\"}}", mutex);
            }
        }

        if (Issues.CheckPrinterComponent(null, ipAddress, profile, out Issues.Issue[] issues) && issues is not null) {
            for (int i = 0; i < issues.Length; i++) {
                WsWriteText(ws, issues[i].ToLiveStatsJsonBytes(), mutex);
            }
        }
    }

    private static void SnmpQuerySwitch(WebSocket ws, object mutex, IPAddress ipAddress, SnmpProfiles.Profile profile) {
        IList<Variable> result = Protocols.Snmp.Polling.SnmpQuery(ipAddress, profile, Protocols.Snmp.Oid.LIVEVIEW_SWITCH_OID, Protocols.Snmp.Polling.SnmpOperation.Walk);

        if (result is null) {
            WsWriteText(ws, "{\"switchInfo\":[]}"u8.ToArray(), mutex);
            return;
        }

        Dictionary<string, string> parsedResult = Protocols.Snmp.Polling.ParseResponse(result);

        Dictionary<int, string> type     = new Dictionary<int, string>();
        Dictionary<int, string> speed    = new Dictionary<int, string>();
        Dictionary<int, string> vlan     = new Dictionary<int, string>();
        Dictionary<int, string> status   = new Dictionary<int, string>();
        Dictionary<int, long> trafficIn  = new Dictionary<int, long>();
        Dictionary<int, long> trafficOut = new Dictionary<int, long>();
        Dictionary<int, int> errorIn     = new Dictionary<int, int>();
        Dictionary<int, int> errorOut    = new Dictionary<int, int>();

        foreach (KeyValuePair<string, string> pair in parsedResult) {
            int index = int.Parse(pair.Key.Split('.').Last());

            if (pair.Key.StartsWith(Protocols.Snmp.Oid.INTERFACE_TYPE)) {
                type.Add(index, pair.Value);
            }
            else if (pair.Key.StartsWith(Protocols.Snmp.Oid.INTERFACE_SPEED)) {
                speed.Add(index, pair.Value);
            }
            else if (pair.Key.StartsWith(Protocols.Snmp.Oid.INTERFACE_1Q_VLAN)) {
                vlan.Add(index, pair.Value);
            }
            else if (pair.Key.StartsWith(Protocols.Snmp.Oid.INTERFACE_STATUS)) {
                status.Add(index, pair.Value);
            }
            else if (pair.Key.StartsWith(Protocols.Snmp.Oid.INTERFACE_TRAFFIC_IN_64)) {
                trafficIn.Add(index, long.TryParse(pair.Value, out long v) ? v : 0);
            }
            else if (pair.Key.StartsWith(Protocols.Snmp.Oid.INTERFACE_TRAFFIC_OUT_64)) {
                trafficOut.Add(index, long.TryParse(pair.Value, out long v) ? v : 0);
            }
            else if (pair.Key.StartsWith(Protocols.Snmp.Oid.INTERFACE_ERROR_IN)) {
                errorIn.Add(index, int.TryParse(pair.Value, out int v) ? v : 0);
            }
            else if (pair.Key.StartsWith(Protocols.Snmp.Oid.INTERFACE_ERROR_OUT)) {
                errorOut.Add(index, int.TryParse(pair.Value, out int v) ? v : 0);
            }
        }

        byte[] payload = JsonSerializer.SerializeToUtf8Bytes(new {
            switchInfo = type.Where(o => o.Value == "6")
                .Select(pair => new {
                    speed = speed.GetValueOrDefault(pair.Key, "N/A") switch {
                        "10"     => "10 Mbps",
                        "100"    => "100 Mbps",
                        "1000"   => "1 Gbps",
                        "2500"   => "2.5 Gbps",
                        "5000"   => "5 Gbps",
                        "10000"  => "10 Gbps",
                        "25000"  => "25 Gbps",
                        "40000"  => "40 Gbps",
                        "100000" => "100 Gbps",
                        "200000" => "200 Gbps",
                        "400000" => "400 Gbps",
                        "800000" => "800 Gbps",
                        _        => "N/A"
                    },
                    vlan   = vlan.GetValueOrDefault(pair.Key, "1"),
                    status = status.GetValueOrDefault(pair.Key, "0"),
                    data   = trafficIn.GetValueOrDefault(pair.Key, 0) + trafficOut.GetValueOrDefault(pair.Key, 0),
                    error  = errorIn.GetValueOrDefault(pair.Key, 0) + errorOut.GetValueOrDefault(pair.Key, 0)
                })
        });

        WsWriteText(ws, payload, mutex);

    }

}
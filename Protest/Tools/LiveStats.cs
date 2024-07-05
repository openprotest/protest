﻿using System.Collections.Generic;
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
using Lextm.SharpSnmpLib;
using Protest.Protocols;
using Protest.Tasks;

namespace Protest.Tools;

internal static class LiveStats {
    private static readonly string[] PRINTER_TYPES = new string[] { "fax", "multiprinter", "ticket printer", "printer"};
    private static readonly string[] SWITCH_TYPES = new string[] { "switch", "router", "firewall"};

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

            if (OperatingSystem.IsWindows() && entry.attributes.TryGetValue("username", out Database.Attribute username)) {
                try {
                    SearchResult result = Kerberos.GetUser(username.value);
                    if (result != null) {
                        if (result.Properties["lastLogonTimestamp"].Count > 0) {
                            if (Int64.TryParse(result.Properties["lastLogonTimestamp"][0].ToString(), out long time) && time > 0) {
                                WsWriteText(ws, $"{{\"info\":\"Last logon: {DateTime.FromFileTime(time)}\",\"source\":\"Kerberos\"}}", mutex);
                            }
                        }

                        if (result.Properties["lastLogoff"].Count > 0) {
                            if (Int64.TryParse(result.Properties["lastLogoff"][0].ToString(), out long time) && time > 0) {
                                WsWriteText(ws, $"{{\"info\":\"Last logoff: {DateTime.FromFileTime(time)}\",\"source\":\"Kerberos\"}}", mutex);
                            }
                        }

                        if (result.Properties["badPasswordTime"].Count > 0) {
                            if (Int64.TryParse(result.Properties["badPasswordTime"][0].ToString(), out long time) && time > 0) {
                                WsWriteText(ws, $"{{\"info\":\"Bad password time: {(DateTime.FromFileTime(time))}\",\"source\":\"Kerberos\"}}", mutex);
                            }
                        }

                        if (result.Properties["lockoutTime"].Count > 0) {
                            if (Int64.TryParse(result.Properties["lockoutTime"][0].ToString(), out long time) && time > 0) {
                                WsWriteText(ws, $"{{\"lockedOut\":\"{DateTime.FromFileTime(time)}\",\"source\":\"Kerberos\"}}", mutex);
                            }
                        }
                    }
                }
                catch { }
            }

            if (entry.attributes.TryGetValue("password", out Database.Attribute password)) {
                string value = password.value;
                if (value.Length > 0 && PasswordStrength.Entropy(value) < 28) {
                    WsWriteText(ws, "{\"warnings\":\"Weak password\"}"u8.ToArray(), mutex);
                }
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

            string[] pingArray = Array.Empty<string>();
            string firstAlive = null;
            PingReply firstReply = null;

            entry.attributes.TryGetValue("type", out Database.Attribute _type);
            entry.attributes.TryGetValue("ip", out Database.Attribute _ip);
            entry.attributes.TryGetValue("hostname", out Database.Attribute _hostname);
            entry.attributes.TryGetValue("operating system", out Database.Attribute _os);
            entry.attributes.TryGetValue("snmp profile", out Database.Attribute _snmpProfile);

            if (_ip?.value?.Length > 0) {
                pingArray = _ip.value.Split(';').Select(o => o.Trim()).ToArray();
            }
            else if (_hostname?.value?.Length > 0) {
                pingArray = _hostname.value.Split(';').Select(o => o.Trim()).ToArray();
            }

            object mutex = new object();

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

            if (OperatingSystem.IsWindows() &&
                _os?.value?.Contains("windows", StringComparison.OrdinalIgnoreCase) == true &&
                firstAlive is not null && firstReply.Status == IPStatus.Success) {
                WmiQuery(ws, mutex, firstAlive, ref wmiHostname);
            }

            if (_snmpProfile is not null && firstAlive is not null && firstReply.Status == IPStatus.Success) {
                SnmpQuery(ws, mutex, firstAlive, _type, _snmpProfile);
            }

            if (OperatingSystem.IsWindows() && _hostname?.value?.Length > 0) {
                try {
                    string hostname = _hostname.value;
                    SearchResult result = Kerberos.GetWorkstation(hostname);

                    if (result != null) {
                        if (result.Properties["lastLogonTimestamp"].Count > 0) {
                            string time = Kerberos.FileTimeString(result.Properties["lastLogonTimestamp"][0].ToString());
                            if (time.Length > 0) {
                                WsWriteText(ws, $"{{\"info\":\"Last logon: {Data.EscapeJsonText(time)}\",\"source\":\"Kerberos\"}}", mutex);
                            }
                        }

                        if (result.Properties["lastLogoff"].Count > 0) {
                            string time = Kerberos.FileTimeString(result.Properties["lastLogoff"][0].ToString());
                            if (time.Length > 0) {
                                WsWriteText(ws, $"{{\"info\":\"Last logoff: {Data.EscapeJsonText(time)}\",\"source\":\"Kerberos\"}}", mutex);
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

                    if (!mismatch &&  !String.IsNullOrEmpty(wmiHostname)) {
                        wmiHostname = wmiHostname?.Split('.')[0].ToUpper();
                        if (wmiHostname != dns) {
                            WsWriteText(ws, $"{{\"warning\":\"DNS mismatch: {Data.EscapeJsonText(wmiHostname)}\",\"source\":\"WMI\"}}", mutex);
                            mismatch = true;
                        }
                    }

                    if (!mismatch && !String.IsNullOrEmpty(adHostname)) {
                        adHostname = adHostname?.Split('.')[0].ToUpper();
                        if (adHostname != dns) {
                            WsWriteText(ws, $"{{\"warning\":\"DNS mismatch: {Data.EscapeJsonText(adHostname)}\",\"source\":\"Kerberos\"}}", mutex);
                            mismatch = true;
                        }
                    }

                    if (!mismatch && wmiHostname is null && adHostname is null)
                        netBios = await NetBios.GetBiosNameAsync(firstAlive);

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

            if (String.IsNullOrEmpty(_hostname?.value) && String.IsNullOrEmpty(_ip?.value)) { //check revese dns mismatch
                string[] hostnames = _hostname?.value.Split(';').Select(o => o.Trim()).ToArray() ?? Array.Empty<string>();
                string[] ips = _ip?.value.Split(';').Select(o => o.Trim()).ToArray() ?? Array.Empty<string>();

                for (int i = 0; i < hostnames.Length; i++) {
                    if (String.IsNullOrEmpty(hostnames[i])) { continue; }

                    try {
                        IPAddress[] reversed = System.Net.Dns.GetHostAddresses(hostnames[i]);
                        for (int j = 0; j < reversed.Length; j++) {
                            if (!ips.Contains(reversed[j].ToString())) {
                                WsWriteText(ws, $"{{\"warning\":\"Revese DNS mismatch: {Data.EscapeJsonText(reversed[j].ToString())}\",\"source\":\"DNS\"}}", mutex);
                                break;
                            }
                        }
                    }
                    catch { }
                }
            }

            if (entry.attributes.TryGetValue("password", out Database.Attribute password)) {
                string value = password.value;
                if (value.Length > 0 && PasswordStrength.Entropy(value) < 28) {
                    WsWriteText(ws, "{\"warnings\":\"Weak password\"}"u8.ToArray(), mutex);
                }
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
            ManagementScope scope = Protocols.Wmi.Scope(firstAlive);
            if (scope is not null && scope.IsConnected) {
                using ManagementObjectCollection logicalDisk = new ManagementObjectSearcher(scope, new SelectQuery("SELECT * FROM Win32_LogicalDisk WHERE DriveType = 3")).Get();
                foreach (ManagementObject o in logicalDisk.Cast<ManagementObject>()) {
                    string caption = o.GetPropertyValue("Caption").ToString();

                    object size = o.GetPropertyValue("Size");
                    if (size is null) continue;

                    object free = o.GetPropertyValue("FreeSpace");
                    if (free is null) continue;

                    ulong nSize = (ulong)size;
                    ulong nFree = (ulong)free;

                    if (nSize == 0) continue;
                    double percent = Math.Round(100.0 * nFree / nSize, 1);

                    WsWriteText(ws, $"{{\"drive\":\"{caption}\",\"total\":{nSize},\"used\":{nSize - nFree},\"path\":\"{Data.EscapeJsonText($"\\\\{firstAlive}\\{caption.Replace(":", String.Empty)}$")}\",\"source\":\"WMI\"}}", mutex);

                    if (percent < 1) {
                        WsWriteText(ws, $"{{\"critical\":\"{percent}% free space on disk {Data.EscapeJsonText(caption)}\",\"source\":\"WMI\"}}", mutex);
                    }
                    else if (percent <= 5) {
                        WsWriteText(ws, $"{{\"error\":\"{percent}% free space on disk {Data.EscapeJsonText(caption)}\",\"source\":\"WMI\"}}", mutex);
                    }
                    else if (percent < 15) {
                        WsWriteText(ws, $"{{\"warning\":\"{percent}% free space on disk {Data.EscapeJsonText(caption)}\",\"source\":\"WMI\"}}", mutex);
                    }
                }

                using ManagementObjectCollection currentTime = new ManagementObjectSearcher(scope, new SelectQuery("SELECT * FROM Win32_UTCTime")).Get();
                foreach (ManagementObject o in currentTime.Cast<ManagementObject>()) {
                    int year   = (int)(uint)o.GetPropertyValue("Year");
                    int month  = (int)(uint)o.GetPropertyValue("Month");
                    int day    = (int)(uint)o.GetPropertyValue("Day");
                    int hour   = (int)(uint)o.GetPropertyValue("Hour");
                    int minute = (int)(uint)o.GetPropertyValue("Minute");
                    int second = (int)(uint)o.GetPropertyValue("Second");

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

    private static void SnmpQuery(WebSocket ws, object mutex, string firstAlive, Database.Attribute typeAttr, Database.Attribute _snmpProfile) {
        SnmpProfiles.Profile profile = null;
        if (!String.IsNullOrEmpty(_snmpProfile.value) && Guid.TryParse(_snmpProfile.value, out Guid guid)) {
            SnmpProfiles.Profile[] profiles = SnmpProfiles.Load();
            for (int i = 0; i < profiles.Length; i++) {
                if (profiles[i].guid == guid) {
                    profile = profiles[i];
                    break;
                }
            }
        }

        if (profile is not null && IPAddress.TryParse(firstAlive, out IPAddress ipAddress)) {

            IList<Variable> result = Protocols.Snmp.Polling.SnmpQuery(ipAddress, profile, Protocols.Snmp.Oid.LIVESTATS_OID, Protocols.Snmp.Polling.SnmpOperation.Get);
            Dictionary<string, string> normalized = Protocols.Snmp.Polling.ParseResponse(result);

            if (normalized is not null && normalized.TryGetValue(Protocols.Snmp.Oid.SYSTEM_UPTIME, out string snmpUptime)) {
                WsWriteText(ws, $"{{\"info\":\"Uptime: {Data.EscapeJsonText(snmpUptime)}\",\"source\":\"SNMP\"}}", mutex);
            }

            if (normalized is not null && normalized.TryGetValue(Protocols.Snmp.Oid.SYSTEM_TEMPERATURE, out string snmpTemperatura)) {
                WsWriteText(ws, $"{{\"info\":\"Temperature: {Data.EscapeJsonText(snmpTemperatura)}\",\"source\":\"SNMP\"}}", mutex);
            }

            string type = typeAttr.value.ToLower();
            if (PRINTER_TYPES.Contains(type)) {
                IList<Variable> printerResult = Protocols.Snmp.Polling.SnmpQuery(ipAddress, profile, Protocols.Snmp.Oid.LIVESTATS_PRINTER_OID, Protocols.Snmp.Polling.SnmpOperation.Get);
                Dictionary<string, string> printerNormalized = Protocols.Snmp.Polling.ParseResponse(printerResult);

                if (printerNormalized is not null && printerNormalized.TryGetValue(Protocols.Snmp.Oid.PRINTER_STATUS, out string snmpPrinterStatus)) {
                    string status = snmpPrinterStatus switch {
                        "1" => "Other",
                        "2" => "Processing",
                        "3" => "Idle",
                        "4" => "Printing",
                        "5" => "Warmup",
                        _   => snmpPrinterStatus
                    };
                    WsWriteText(ws, $"{{\"info\":\"Printer status: {Data.EscapeJsonText(status)}\",\"source\":\"SNMP\"}}", mutex);
                }

                if (printerNormalized is not null && printerNormalized.TryGetValue(Protocols.Snmp.Oid.PRINTER_DISPLAY_MESSAGE, out string snmpDisplayMessage)) {
                    WsWriteText(ws, $"{{\"info\":\"Printer message: {Data.EscapeJsonText(snmpDisplayMessage)}\",\"source\":\"SNMP\"}}", mutex);
                }

                if (printerNormalized is not null && printerNormalized.TryGetValue(Protocols.Snmp.Oid.PRINTER_JOBS, out string snmpPrinterJobs)) {
                    WsWriteText(ws, $"{{\"info\":\"Total jobs: {Data.EscapeJsonText(snmpPrinterJobs)}\",\"source\":\"SNMP\"}}", mutex);
                }

                Dictionary<string, string> componentName    = Protocols.Snmp.Polling.ParseResponse(Protocols.Snmp.Polling.SnmpQuery(ipAddress, profile, new string[] { Protocols.Snmp.Oid.PRINTER_TONERS }, Protocols.Snmp.Polling.SnmpOperation.Walk));
                Dictionary<string, string> componentMax     = Protocols.Snmp.Polling.ParseResponse(Protocols.Snmp.Polling.SnmpQuery(ipAddress, profile, new string[] { Protocols.Snmp.Oid.PRINTER_TONERS_MAX }, Protocols.Snmp.Polling.SnmpOperation.Walk));
                Dictionary<string, string> componentCurrent = Protocols.Snmp.Polling.ParseResponse(Protocols.Snmp.Polling.SnmpQuery(ipAddress, profile, new string[] { Protocols.Snmp.Oid.PRINTER_TONER_CURRENT }, Protocols.Snmp.Polling.SnmpOperation.Walk));

                if (componentName is not null && componentCurrent is not null && componentMax is not null &&
                    componentName.Count == componentCurrent.Count && componentCurrent.Count == componentMax.Count) {

                    string[][] componentNameArray     = componentName.Select(pair=> new string[] { pair.Key, pair.Value }).ToArray();
                    string[][] componentMaxArray      = componentMax.Select(pair=> new string[] { pair.Key, pair.Value }).ToArray();
                    string[][] componentCurrentArray = componentCurrent.Select(pair=> new string[] { pair.Key, pair.Value }).ToArray();

                    Array.Sort(componentNameArray, (x, y) => string.Compare(x[0], y[0]));
                    Array.Sort(componentMaxArray, (x, y) => string.Compare(x[0], y[0]));
                    Array.Sort(componentCurrentArray, (x, y) => string.Compare(x[0], y[0]));

                    for (int i = 0; i < componentNameArray.Length; i++) {
                        if (!int.TryParse(componentMaxArray[i][1], out int max)) { continue; }
                        if (!int.TryParse(componentCurrentArray[i][1], out int current)) { continue; }

                        if (current == -2 || max == -2) { continue; } //undefined
                        if (current == -3) { current = max; } //full

                        componentNameArray[i][1] = componentNameArray[i][1].TrimStart(' ', '!', '\"', '#', '$', '%', '&', '\'', '(', ')', '*', '+', ',', '-', '.', '/', ':', ';', '<', '=', '>', '?', '@', '[', '\\', ']', '^', '_', '{', '|', '}', '~');

                        int used = 100 * current / max;
                        if (used < 5) {
                            WsWriteText(ws, $"{{\"error\":\"{used}% {componentNameArray[i][1]}\",\"source\":\"SNMP\"}}", mutex);
                        }
                        else if (used < 15) {
                            WsWriteText(ws, $"{{\"warning\":\"{used}% {componentNameArray[i][1]}\",\"source\":\"SNMP\"}}", mutex);
                        }
                    }
                }
            }
            else if (SWITCH_TYPES.Contains(type)) {
                //TODO:
            }
        }
    }

}
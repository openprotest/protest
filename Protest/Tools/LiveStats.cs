using System.Diagnostics.CodeAnalysis;
using System.DirectoryServices;
using System.Management;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using Protest.Protocols;
using Protest.Tasks;

namespace Protest.Tools;

internal static class LiveStats {
    private static void WsWriteText(WebSocket ws, [StringSyntax(StringSyntaxAttribute.Json)] string text) {
        WsWriteText(ws, Encoding.UTF8.GetBytes(text));
    }
    private static async void WsWriteText(WebSocket ws, byte[] bytes) {
        await ws.SendAsync(new ArraySegment<byte>(bytes, 0, bytes.Length), WebSocketMessageType.Text, true, CancellationToken.None);
    }

    public static async void DeviceStats(HttpListenerContext ctx) {
        WebSocketContext wsc;
        WebSocket ws;

        try {
            wsc = await ctx.AcceptWebSocketAsync(null);
            ws = wsc.WebSocket;
        }
        catch (WebSocketException ex) {
            ctx.Response.Close();
            Logger.Error(ex);
            return;
        }

        try {
            byte[] buff = new byte[256];
            WebSocketReceiveResult receiveResult = await ws.ReceiveAsync(new ArraySegment<byte>(buff), CancellationToken.None);
            string file = Encoding.Default.GetString(buff, 0, receiveResult.Count);

            if (!DatabaseInstances.devices.dictionary.TryGetValue(file, out Database.Entry entry)) {
                await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, CancellationToken.None);
                return;
            }

            string[] pingArray = Array.Empty<string>();
            string firstAlive = null;
            PingReply firstReply = null;

            entry.attributes.TryGetValue("ip", out Database.Attribute _ip);
            entry.attributes.TryGetValue("hostname", out Database.Attribute _hostname);
            entry.attributes.TryGetValue("operating system", out Database.Attribute _os);

            if (_ip?.value?.Length > 0) {
                pingArray = _ip.value.Split(';').Select(o => o.Trim()).ToArray();
            }
            else if (_hostname?.value?.Length > 0) {
                pingArray = _hostname.value.Split(';').Select(o => o.Trim()).ToArray();
            }

            if (pingArray.Length > 0) {
                for (int i = 0; i < pingArray.Length; i++) {
                    try {
                        using System.Net.NetworkInformation.Ping p = new System.Net.NetworkInformation.Ping();
                        PingReply reply = p.Send(pingArray[i], 200);
                        if (reply.Status == IPStatus.Success) {
                            if (firstAlive is null) {
                                firstAlive = pingArray[i];
                                firstReply = reply;
                            }
                            WsWriteText(ws, $"{{\"echoReply\":\"{reply.RoundtripTime}\",\"for\":\"{pingArray[i]}\",\"source\":\"ICMP\"}}");
                            WsWriteText(ws, $"{{\"info\":\"Last seen {pingArray[i]}: Just now\",\"source\":\"ICMP\"}}");
                            LastSeen.Seen(pingArray[i]);
                        }
                        else if (reply.Status == IPStatus.TimedOut) {
                            WsWriteText(ws, $"{{\"echoReply\":\"Timed out\",\"for\":\"{pingArray[i]}\",\"source\":\"ICMP\"}}");
                        }
                        else {
                            WsWriteText(ws, $"{{\"echoReply\":\"{Data.EscapeJsonText(reply.Status.ToString())}\",\"for\":\"{pingArray[i]}\",\"source\":\"ICMP\"}}");
                        }
                    }
                    catch {
                        WsWriteText(ws, $"{{\"echoReply\":\"Error\",\"for\":\"{Data.EscapeJsonText(pingArray[i])}\",\"source\":\"ICMP\"}}");
                    }
                }

                if (firstAlive is null) {
                    for (int i = 0; i < pingArray.Length; i++) {
                        string lastSeen = LastSeen.HasBeenSeen(pingArray[i], true);
                        WsWriteText(ws, $"{{\"info\":\"Last seen {pingArray[i]}: {lastSeen}\",\"source\":\"ICMP\"}}");
                    }
                }
            }

            string wmiHostname = null, adHostname = null, netbios = null, dns = null;

            if (OperatingSystem.IsWindows() &&
                _os?.value?.Contains("windows", StringComparison.OrdinalIgnoreCase) == true &&
                firstAlive is not null &&
                firstReply.Status == IPStatus.Success) {

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

                            WsWriteText(ws, $"{{\"drive\":\"{caption}\",\"total\":{nSize},\"used\":{nSize - nFree},\"path\":\"{Data.EscapeJsonText($"\\\\{firstAlive}\\{caption.Replace(":", String.Empty)}$")}\",\"source\":\"WMI\"}}");

                            if (percent < 15) {
                                WsWriteText(ws, $"{{\"warning\":\"{percent}% free space on disk {Data.EscapeJsonText(caption)}\",\"source\":\"WMI\"}}");
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
                                WsWriteText(ws, "{\"warning\":\"System time is off by more then 5 minutes\",\"source\":\"WMI\"}"u8.ToArray());
                            }
                        }

                        if (scope is not null) {
                            string startTime = Wmi.WmiGet(scope, "Win32_LogonSession", "StartTime", false, new Wmi.FormatMethodPtr(Wmi.DateTimeToString));
                            if (startTime.Length > 0) {
                                WsWriteText(ws, $"{{\"info\":\"Start time: {Data.EscapeJsonText(startTime)}\",\"source\":\"WMI\"}}");
                            }

                            string username = Wmi.WmiGet(scope, "Win32_ComputerSystem", "UserName", false, null);
                            if (username.Length > 0) {
                                WsWriteText(ws, $"{{\"info\":\"Logged in user: {Data.EscapeJsonText(username)}\",\"source\":\"WMI\"}}");
                            }
                            wmiHostname = Wmi.WmiGet(scope, "Win32_ComputerSystem", "DNSHostName", false, null);

                            WsWriteText(ws, $"{{\"activeUser\":\"{Data.EscapeJsonText(username)}\",\"source\":\"WMI\"}}");
                        }
                    }
                }
                catch (NullReferenceException) { }
                catch { }
            }

            if (OperatingSystem.IsWindows() && _hostname?.value?.Length > 0) {
                try {
                    string hostname = _hostname.value;
                    SearchResult result = Kerberos.GetWorkstation(hostname);

                    if (result != null) {
                        if (result.Properties["lastLogonTimestamp"].Count > 0) {
                            string time = Kerberos.FileTimeString(result.Properties["lastLogonTimestamp"][0].ToString());
                            if (time.Length > 0) {
                                WsWriteText(ws, $"{{\"info\":\"Last logon: {Data.EscapeJsonText(time)}\",\"source\":\"Kerberos\"}}");
                            }
                        }

                        if (result.Properties["lastLogoff"].Count > 0) {
                            string time = Kerberos.FileTimeString(result.Properties["lastLogoff"][0].ToString());
                            if (time.Length > 0) {
                                WsWriteText(ws, $"{{\"info\":\"Last logoff: {Data.EscapeJsonText(time)}\",\"source\":\"Kerberos\"}}");
                            }
                        }

                        if (result.Properties["dNSHostName"].Count > 0) {
                            adHostname = result.Properties["dNSHostName"][0].ToString();
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
                            WsWriteText(ws, $"{{\"warning\":\"DNS mismatch: {Data.EscapeJsonText(wmiHostname)}\",\"source\":\"WMI\"}}");
                            mismatch = true;
                        }
                    }

                    if (!mismatch && !String.IsNullOrEmpty(adHostname)) {
                        adHostname = adHostname?.Split('.')[0].ToUpper();
                        if (adHostname != dns) {
                            WsWriteText(ws, $"{{\"warning\":\"DNS mismatch: {Data.EscapeJsonText(adHostname)}\",\"source\":\"Kerberos\"}}");
                            mismatch = true;
                        }
                    }

                    if (!mismatch && wmiHostname is null && adHostname is null)
                        netbios = await NetBios.GetBiosNameAsync(firstAlive);

                    if (!mismatch && !String.IsNullOrEmpty(netbios)) {
                        netbios = netbios?.Split('.')[0].ToUpper();
                        if (netbios != dns) {
                            WsWriteText(ws, $"{{\"warning\":\"DNS mismatch: {Data.EscapeJsonText(netbios)}\",\"source\":\"NetBIOS\"}}");
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
                    try {
                        IPAddress[] reversed = System.Net.Dns.GetHostAddresses(hostnames[i]);
                        for (int j = 0; j < reversed.Length; j++) {
                            if (!ips.Contains(reversed[j].ToString())) {
                                WsWriteText(ws, $"{{\"warning\":\"Revese DNS mismatch: {Data.EscapeJsonText(reversed[j].ToString())}\",\"source\":\"DNS\"}}");
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
                    WsWriteText(ws, "{\"warnings\":\"Weak password\"}"u8.ToArray());
                }
            }

        }
        catch (WebSocketException ex) when (ex.WebSocketErrorCode == WebSocketError.ConnectionClosedPrematurely) {
            return;
        }
        catch (WebSocketException ex) when (ex.WebSocketErrorCode != WebSocketError.ConnectionClosedPrematurely) {
            Logger.Error(ex);
        }
        catch (Exception ex) {
            Logger.Error(ex);
        }
        finally {
            if (ws.State == WebSocketState.Open) {
                await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, CancellationToken.None);
            }
        }
    }

    public static async void UserStats(HttpListenerContext ctx) {
        WebSocketContext wsc;
        WebSocket ws;

        try {
            wsc = await ctx.AcceptWebSocketAsync(null);
            ws = wsc.WebSocket;
        }
        catch (WebSocketException ex) {
            ctx.Response.Close();
            Logger.Error(ex);
            return;
        }

        try {
            byte[] buff = new byte[256];
            WebSocketReceiveResult receiveResult = await ws.ReceiveAsync(new ArraySegment<byte>(buff), CancellationToken.None);
            string file = Encoding.Default.GetString(buff, 0, receiveResult.Count);

            if (!DatabaseInstances.users.dictionary.TryGetValue(file, out Database.Entry entry)) {
                await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, CancellationToken.None);
                return;
            }

            if (OperatingSystem.IsWindows() && entry.attributes.TryGetValue("username", out Database.Attribute username)) {
                try {
                    SearchResult result = Kerberos.GetUser(username.value);
                    if (result != null) {
                        if (result.Properties["lastLogonTimestamp"].Count > 0) {
                            if (Int64.TryParse(result.Properties["lastLogonTimestamp"][0].ToString(), out long time) && time > 0) {
                                WsWriteText(ws, $"{{\"info\":\"Last logon: {DateTime.FromFileTime(time)}\",\"source\":\"Kerberos\"}}");
                            }
                        }
                        if (result.Properties["lastLogoff"].Count > 0) {
                            if (Int64.TryParse(result.Properties["lastLogoff"][0].ToString(), out long time) && time > 0) {
                                WsWriteText(ws, $"{{\"info\":\"Last logoff: {DateTime.FromFileTime(time)}\",\"source\":\"Kerberos\"}}");
                            }
                        }
                        if (result.Properties["badPasswordTime"].Count > 0) {
                            if (Int64.TryParse(result.Properties["badPasswordTime"][0].ToString(), out long time) && time > 0) {
                                WsWriteText(ws, $"{{\"info\":\"Bad password time: {(DateTime.FromFileTime(time))}\",\"source\":\"Kerberos\"}}");
                            }
                        }
                        if (result.Properties["lockoutTime"].Count > 0) {
                            if (Int64.TryParse(result.Properties["lockoutTime"][0].ToString(), out long time) && time > 0) {
                                WsWriteText(ws, $"{{\"lockedOut\":\"{DateTime.FromFileTime(time)}\",\"source\":\"Kerberos\"}}");
                            }
                        }
                    }
                }
                catch { }
            }

            if (entry.attributes.TryGetValue("password", out Database.Attribute password)) {
                string value = password.value;
                if (value.Length > 0 && PasswordStrength.Entropy(value) < 28) {
                    WsWriteText(ws, "{\"warnings\":\"Weak password\"}"u8.ToArray());
                }
            }

        }
        catch (WebSocketException ex) when (ex.WebSocketErrorCode == WebSocketError.ConnectionClosedPrematurely) {
            return;
        }
        catch (WebSocketException ex) when (ex.WebSocketErrorCode != WebSocketError.ConnectionClosedPrematurely) {
            Logger.Error(ex);
        }
        catch (Exception ex) {
            Logger.Error(ex);
        } finally {
            if (ws.State == WebSocketState.Open) {
                await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, CancellationToken.None);
            }
        }
    }
}
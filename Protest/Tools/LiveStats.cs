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
    private static async void WsWriteText(WebSocket ws, string text, object sendLock = null) {
        if (sendLock is null) {
            await ws.SendAsync(new ArraySegment<byte>(Encoding.UTF8.GetBytes(text), 0, text.Length), WebSocketMessageType.Text, true, CancellationToken.None);
        }
        else {
            lock (sendLock) {
                ws.SendAsync(new ArraySegment<byte>(Encoding.UTF8.GetBytes(text), 0, text.Length), WebSocketMessageType.Text, true, CancellationToken.None);
            }
        }
    }
    private static async void WsWriteText(WebSocket ws, byte[] bytes, object sendLock = null) {
        if (sendLock is null) {
            await ws.SendAsync(new ArraySegment<byte>(bytes, 0, bytes.Length), WebSocketMessageType.Text, true, CancellationToken.None);
        }
        else {
            lock (sendLock) {
                ws.SendAsync(new ArraySegment<byte>(bytes, 0, bytes.Length), WebSocketMessageType.Text, true, CancellationToken.None);
            }
        }
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
                        string lastseen = LastSeen.HasBeenSeen(pingArray[i], true);
                        WsWriteText(ws, $"{{\"info\":\"Last seen {pingArray[i]}: {lastseen}\",\"source\":\"ICMP\"}}");
                    }
                }
            }

            string wmiHostname = null, adHostname = null, netbios = null, dns = null;

            if (OperatingSystem.IsWindows() &&
                _os?.value?.ToLower().Contains("windows") == true &&
                firstAlive is not null &&
                firstReply.Status == IPStatus.Success) {

                try {
                    ManagementScope scope = Wmi.Scope(firstAlive);
                    using ManagementObjectCollection logicalDisk = new ManagementObjectSearcher(scope, new SelectQuery("SELECT * FROM Win32_LogicalDisk WHERE DriveType = 3")).Get();
                    foreach (ManagementObject o in logicalDisk.Cast<ManagementObject>()) {
                        string caption = o.GetPropertyValue("Caption").ToString();
                        ulong size = (ulong)o.GetPropertyValue("Size");
                        ulong free = (ulong)o.GetPropertyValue("FreeSpace");

                        if (size == 0) continue;
                        ulong percent = 100 * free / size;

                        WsWriteText(ws, $"{{\"drive\":\"{caption}\",\"total\":{size},\"used\":{size - free},\"path\":\"{Data.EscapeJsonText($"\\\\{firstAlive}\\{caption.Replace(":", "")}$")}\",\"source\":\"WMI\"}}");

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
                            WsWriteText(ws, $"{{\"warning\":\"System time is off by more then 5 minutes\",\"source\":\"WMI\"}}");
                        }
                    }

                    if (scope is not null) {
                        string starttime = Wmi.WmiGet(scope, "Win32_LogonSession", "StartTime", false, new Wmi.FormatMethodPtr(Wmi.DateTimeToString));
                        if (starttime.Length > 0) {
                            WsWriteText(ws, $"{{\"info\":\"Start time: {Data.EscapeJsonText(starttime)}\",\"source\":\"WMI\"}}");
                        }

                        string username = Wmi.WmiGet(scope, "Win32_ComputerSystem", "UserName", false, null);
                        if (username.Length > 0) {
                            WsWriteText(ws, $"{{\"info\":\"Logged in user: {Data.EscapeJsonText(username)}\",\"source\":\"WMI\"}}");
                        }
                        wmiHostname = Wmi.WmiGet(scope, "Win32_ComputerSystem", "DNSHostName", false, null);

                        WsWriteText(ws, $"{{\"activeUser\":\"{Data.EscapeJsonText(username)}\",\"source\":\"WMI\"}}");
                    }

                }
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

                        if (result.Properties["dNSHostName"].Count > 0)
                            adHostname = result.Properties["dNSHostName"][0].ToString();
                    }
                }
                catch { }
            }

            try {
                dns = (await System.Net.Dns.GetHostEntryAsync(firstAlive)).HostName;
            }
            catch { }

            if (dns is not null) {
                try {
                    dns = dns?.Split('.')[0].ToUpper();
                    bool mismatch = false;

                    if (!mismatch && wmiHostname is not null && wmiHostname.Length > 0) {
                        wmiHostname = wmiHostname?.Split('.')[0].ToUpper();
                        if (wmiHostname != dns) {
                            WsWriteText(ws, $"{{\"warning\":\"DNS mismatch: {Data.EscapeJsonText(wmiHostname)} / {Data.EscapeJsonText(dns)}\",\"source\":\"WMI\"}}");
                            mismatch = true;
                        }
                    }

                    if (!mismatch && adHostname is not null && adHostname.Length > 0) {
                        adHostname = adHostname?.Split('.')[0].ToUpper();
                        if (adHostname != dns) {
                            WsWriteText(ws, $"{{\"warning\":\"DNS mismatch: {Data.EscapeJsonText(adHostname)} / {Data.EscapeJsonText(dns)}\",\"source\":\"Kerberos\"}}");
                            mismatch = true;
                        }
                    }

                    if (!mismatch && wmiHostname is null && adHostname is null)
                        netbios = await NetBios.GetBiosNameAsync(firstAlive);

                    if (!mismatch && netbios is not null && netbios.Length > 0) {
                        netbios = netbios?.Split('.')[0].ToUpper();
                        if (netbios != dns) {
                            WsWriteText(ws, $"{{\"warning\":\"DNS mismatch: {Data.EscapeJsonText(netbios)} / {Data.EscapeJsonText(dns)}\",\"source\":\"NetBIOS\"}}");
                            mismatch = true;
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
        catch (Exception ex) {
            Logger.Error(ex);
        } finally {
            if (ws.State == WebSocketState.Open) {
                await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, CancellationToken.None);
            }
        }
    }
}
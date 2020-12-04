using System;
using System.Collections.Generic;
using System.DirectoryServices;
using System.Linq;
using System.Management;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.WebSockets;
using System.Text;
using System.Threading;

public static class LiveInfo {

    private static async void WsWriteText(WebSocket ws, string text){
        await ws.SendAsync(new ArraySegment<byte>(Encoding.ASCII.GetBytes(text), 0, text.Length), WebSocketMessageType.Text, true, CancellationToken.None);
    }

    public static async void InstantInfoEquip(HttpListenerContext ctx) {
        WebSocketContext wsc;
        WebSocket ws;
        try {
            wsc = await ctx.AcceptWebSocketAsync(null);
            ws = wsc.WebSocket;
        } catch (WebSocketException ex) {
            ctx.Response.Close();
            Logging.Err(ex);
            return;
        }

        string sessionId = ctx.Request.Cookies["sessionid"]?.Value ?? null;
        if (sessionId is null) {
            ctx.Response.Close();
            return;
        }

        try {
            byte[] buff = new byte[2048];
            WebSocketReceiveResult receiveResult = await ws.ReceiveAsync(new ArraySegment<byte>(buff), CancellationToken.None);

            string filename = Encoding.Default.GetString(buff, 0, receiveResult.Count);
            if (!Database.equip.ContainsKey(filename)) {
                await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None);
                return;
            }
            
            Database.DbEntry equip = (Database.DbEntry)Database.equip[filename];

            string host = null;
            if (equip.hash.ContainsKey("IP")) { 
               host = ((string[])equip.hash["IP"])[0];

            } else if (equip.hash.ContainsKey("HOSTNAME")) {
                host = ((string[])equip.hash["HOSTNAME"])[0];
            } else {
                await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None);
                return;
            }

            string lastseen = "";
            string[] ipArray = host.Split(';').Select(o => o.Trim()).ToArray();

            try {
                using System.Net.NetworkInformation.Ping p = new System.Net.NetworkInformation.Ping();
                PingReply reply = p.Send(ipArray[0], 1000);

                if (reply.Status == IPStatus.Success) {
                    lastseen = "Just now";
                    WsWriteText(ws, $"last seen{(char)127}{lastseen}{(char)127}ICMP");
                    WsWriteText(ws, $".roundtrip:{ipArray[0]}{(char)127}{reply.RoundtripTime}{(char)127}ICMP");
                    LastSeen.Seen(ipArray[0]);
                } else {
                    lastseen = Encoding.UTF8.GetString(LastSeen.HasBeenSeen(ipArray[0], true));
                    WsWriteText(ws, $"last seen{(char)127}{lastseen}{(char)127}ICMP");
                    WsWriteText(ws, $".roundtrip:{ipArray[0]}{(char)127}TimedOut{(char)127}ICMP");
                }
            } catch {
                WsWriteText(ws, $".roundtrip:{host}{(char)127}Error{(char)127}ICMP");
            }
            
            if (ipArray.Length > 1) 
                for (int i = 1; i < ipArray.Length; i++)
                    try {
                        using System.Net.NetworkInformation.Ping p = new System.Net.NetworkInformation.Ping();
                        PingReply reply = p.Send(ipArray[i], 1000);
                        if (reply.Status == IPStatus.Success)
                            WsWriteText(ws, $".roundtrip:{ipArray[i]}{(char)127}{reply.RoundtripTime}{(char)127}ICMP");
                        else 
                            WsWriteText(ws, $".roundtrip:{ipArray[i]}{(char)127}{reply.Status}{(char)127}ICMP");
                    } catch {
                        WsWriteText(ws, $".roundtrip:{ipArray[i]}{(char)127}Error{(char)127}ICMP");
                    }


            List<string> warnings = new List<string>();
            string wmiHostName = null, adHostName = null, netbios = null, dns = null;


            if (lastseen == "Just now") {
                ManagementScope scope = Wmi.WmiScope(host);
                if (scope != null) {
                    string username = Wmi.WmiGet(scope, "Win32_ComputerSystem", "UserName", false, null);
                    if (username.Length > 0) WsWriteText(ws, $"logged in user{(char)127}{username}{(char)127}WMI");
                    
                    string starttime = Wmi.WmiGet(scope, "Win32_LogonSession", "StartTime", false, new Wmi.FormatMethodPtr(Wmi.DateTimeToString));
                    if (starttime.Length > 0) WsWriteText(ws, $"start time{(char)127}{starttime}{(char)127}WMI");

                    wmiHostName = Wmi.WmiGet(scope, "Win32_ComputerSystem", "DNSHostName", false, null);
                }

                using ManagementObjectCollection logicalDisk = new ManagementObjectSearcher(scope, new SelectQuery("SELECT * FROM Win32_LogicalDisk WHERE DriveType = 3")).Get();
                foreach (ManagementObject o in logicalDisk) {
                    string caption = o.GetPropertyValue("Caption").ToString();
                    UInt64 size = (UInt64)o.GetPropertyValue("Size");
                    UInt64 free = (UInt64)o.GetPropertyValue("FreeSpace");

                    if (size == 0) continue;
                    UInt64 percent = 100 * free / size;
                    
                    if (percent < 10)
                         warnings.Add($"{percent}% free space on disk {caption}");
                }
            }
            
            if (equip.hash.ContainsKey("HOSTNAME")) {
                string hostname = ((string[])equip.hash["HOSTNAME"])[0];
                SearchResult result = ActiveDirectory.GetWorkstation(hostname);

                if (result != null) {
                    if (result.Properties["lastLogonTimestamp"].Count > 0) {
                        string time = ActiveDirectory.FileTimeString(result.Properties["lastLogonTimestamp"][0].ToString());
                        if (time.Length > 0) WsWriteText(ws, $"last logon{(char)127}{time}{(char)127}Active directory");
                    }

                    if (result.Properties["lastLogoff"].Count > 0) {
                        string time = ActiveDirectory.FileTimeString(result.Properties["lastLogoff"][0].ToString());
                        if (time.Length > 0) WsWriteText(ws, $"last logoff{(char)127}{time}{(char)127}Active directory");
                    }

                    if (result.Properties["dNSHostName"].Count > 0)
                        adHostName = result.Properties["dNSHostName"][0].ToString();
                }
            }

            try {
                dns = (await System.Net.Dns.GetHostEntryAsync(host)).HostName;
            } catch { }

            if (!(dns is null)) {
                dns = dns?.Split('.')[0].ToUpper();
                bool mismatch = false;

                if (!mismatch && !(wmiHostName is null) && wmiHostName.Length > 0) {
                    wmiHostName = wmiHostName?.Split('.')[0].ToUpper();
                    if (wmiHostName != dns) {
                        warnings.Add($"DNS mismatch: {wmiHostName} &ne; {dns}");
                        mismatch = true;
                    }
                }

                if (!mismatch && !(adHostName is null) && adHostName.Length > 0) {
                    adHostName = adHostName?.Split('.')[0].ToUpper();
                    if (adHostName != dns) {
                        warnings.Add($"DNS mismatch: {adHostName} &ne; {dns}");
                        mismatch = true;
                    }
                }

                if (!mismatch && wmiHostName is null && adHostName is null)
                    netbios = await NetBios.GetBiosNameAsync(host);                

                if (!mismatch && !(netbios is null) && netbios.Length > 0) {
                    netbios = netbios?.Split('.')[0].ToUpper();
                    if (netbios != dns) {
                        warnings.Add($"DNS mismatch: {netbios} &ne; {dns}");
                        mismatch = true;
                    }
                }
            }

            for (int i = 0; i < warnings.Count; i++)
                WsWriteText(ws, $"!{(char)127}{warnings[i]}{(char)127}");

            try {
                await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None);
            } catch { }

        } catch (Exception ex) {
            Logging.Err(ex);
        }
    }

    public static async void InstantInfoUser(HttpListenerContext ctx) {
        WebSocketContext wsc;
        WebSocket ws;
        try {
            wsc = await ctx.AcceptWebSocketAsync(null);
            ws = wsc.WebSocket;
        } catch (WebSocketException ex) {
            ctx.Response.Close();
            Logging.Err(ex);
            return;
        }

        string sessionId = ctx.Request.Cookies["sessionid"]?.Value ?? null;
        if (sessionId is null) {
            ctx.Response.Close();
            return;
        }

        try {
            byte[] buff = new byte[2048];
            WebSocketReceiveResult receiveResult = await ws.ReceiveAsync(new ArraySegment<byte>(buff), CancellationToken.None);

            string filename = Encoding.Default.GetString(buff, 0, receiveResult.Count);
            if (!Database.users.ContainsKey(filename)) {
                await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None);
                return;
            }
            Database.DbEntry user = (Database.DbEntry)Database.users[filename];

            string username;
            if (user.hash.ContainsKey("USERNAME")) {
                username = ((string[])user.hash["USERNAME"])[0];
            } else {
                await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None);
                return;
            }

            try {
                SearchResult sr = ActiveDirectory.GetUser(username);
                if (sr != null) {
                    if (sr.Properties["lastLogonTimestamp"].Count > 0) {
                        string time = ActiveDirectory.FileTimeString(sr.Properties["lastLogonTimestamp"][0].ToString());
                        if (time.Length > 0) WsWriteText(ws, $"last logon{(char)127}{time}{(char)127}Active directory");
                    }

                    if (sr.Properties["lastLogoff"].Count > 0) {
                        string time = ActiveDirectory.FileTimeString(sr.Properties["lastLogoff"][0].ToString());
                        if (time.Length > 0) WsWriteText(ws, $"last logoff{(char)127}{time}{(char)127}Active directory");
                    }

                    if (sr.Properties["badPasswordTime"].Count > 0) {
                        string time = ActiveDirectory.FileTimeString(sr.Properties["badPasswordTime"][0].ToString());
                        if (time.Length > 0) WsWriteText(ws, $"bad password time{(char)127}{time}{(char)127}Active directory");
                    }

                    if (sr.Properties["lockoutTime"].Count > 0) {
                        string time = ActiveDirectory.FileTimeString(sr.Properties["lockoutTime"][0].ToString());
                        if (time.Length > 0) WsWriteText(ws, $"lockout time{(char)127}{time}{(char)127}Active directory");
                    }
                }

            } catch { }

            if (user.hash.ContainsKey("PASSWORD")) {
                string password = ((string[])user.hash["PASSWORD"])[0];
                if (password.Length > 0 && PasswordStrength.Entropy(password) < 28)
                    WsWriteText(ws, $"!{(char)127}{"Weak password"}{(char)127}");
            }

            await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None);

        } catch (Exception ex) {
            Logging.Err(ex);
        }
    }

}
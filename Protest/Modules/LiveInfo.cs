using System;
using System.DirectoryServices;
using System.Linq;
using System.Management;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.WebSockets;
using System.Text;
using System.Threading;

class LiveInfo {

    public static async void WsWriteText(WebSocket ws, string text){
        await ws.SendAsync(new ArraySegment<byte>(Encoding.ASCII.GetBytes(text), 0, text.Length), WebSocketMessageType.Text, true, CancellationToken.None);
    }

    public static async void InstantInfoEquip(HttpListenerContext ctx, string remoteIp) {
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
            Database.DbEntry equip = (Database.DbEntry)Database.equip[filename];

            string ip = null;
            if (equip.hash.ContainsKey("IP")) { 
               ip = ((string[])equip.hash["IP"])[0];

            } else if (equip.hash.ContainsKey("HOSTNAME")) {
                ip = ((string[])equip.hash["HOSTNAME"])[0];

            } else {
                await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None);
                return;
            }

            string lastseen = "";
            string[] ipArray = ip.Split(';').Select(o => o.Trim()).ToArray();

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
                WsWriteText(ws, $".roundtrip:{ip}{(char)127}Error{(char)127}ICMP");
            }

            
            if (ipArray.Length > 1) 
                for (int i = 1; i < ipArray.Length; i++) {
                    try {
                    using System.Net.NetworkInformation.Ping p = new System.Net.NetworkInformation.Ping();
                    PingReply reply = p.Send(ipArray[i], 1000);
                    if (reply.Status == IPStatus.Success)
                        WsWriteText(ws, $".roundtrip:{ipArray[i]}{(char)127}{reply.RoundtripTime}{(char)127}ICMP");
                    else 
                        WsWriteText(ws, $".roundtrip:{ipArray[i]}{(char)127}{reply.Status.ToString()}{(char)127}ICMP");
                    } catch {
                        WsWriteText(ws, $".roundtrip:{ipArray[i]}{(char)127}Error{(char)127}ICMP");
                    }
                }
            
            if (lastseen == "Just now") {
                ManagementScope scope = Wmi.WmiScope(ip);
                if (scope != null) {
                    string starttime = Wmi.WmiGet(scope, "Win32_LogonSession", "StartTime", false, new Wmi.FormatMethodPtr(Wmi.DateTimeToString));
                    if (starttime.Length > 0) WsWriteText(ws, $"start time{(char)127}{starttime}{(char)127}WMI");

                    string username = Wmi.WmiGet(scope, "Win32_ComputerSystem", "UserName", false, null);
                    if (username.Length > 0) WsWriteText(ws, $"logged in user{(char)127}{username}{(char)127}WMI");
                }
            }

            //TODO: active dir info

            await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None);

        } catch (Exception ex) {
            Logging.Err(ex);
        }
    }

    public static async void InstantInfoUser(HttpListenerContext ctx, string remoteIp) {
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

                if (sr.Properties["lastLogonTimestamp"].Count > 0) {
                    string time = ActiveDirectory.FileTimeString(sr.Properties["lastLogonTimestamp"][0].ToString());
                    if (time.Length > 0) WsWriteText(ws, $"Last logon{(char)127}{time}{(char)127}Active directory");
                }

                if (sr.Properties["lastLogoff"].Count > 0) {
                    string time = ActiveDirectory.FileTimeString(sr.Properties["lastLogoff"][0].ToString());
                    if (time.Length > 0) WsWriteText(ws, $"Last logoff{(char)127}{time}{(char)127}Active directory");
                }
                if (sr.Properties["lockoutTime"].Count > 0) {
                    string time = ActiveDirectory.FileTimeString(sr.Properties["lockoutTime"][0].ToString());
                    if (time.Length > 0) WsWriteText(ws, $"Lockout time{(char)127}{time}{(char)127}Active directory");                
                }
            } catch { }

            await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None);

        } catch (Exception ex) {
            Logging.Err(ex);
        }
    }

}
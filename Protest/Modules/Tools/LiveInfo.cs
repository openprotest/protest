using System;
using System.DirectoryServices;
using System.Linq;
using System.Management;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

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
            if (equip.hash.ContainsKey("IP"))
                ip = ((string[])equip.hash["IP"])[0];
            else if (equip.hash.ContainsKey("HOSTNAME"))
                ip = ((string[])equip.hash["HOSTNAME"])[0];

            //string[] ipArray = ip.Split(';').Select(o=>o.Trim()).ToArray();
            string lastseen = "";

            try {
                using System.Net.NetworkInformation.Ping p = new System.Net.NetworkInformation.Ping();
                PingReply reply = p.Send(ip, 1000);

                if (reply.Status == IPStatus.Success) {
                    lastseen = "Just now";
                    WsWriteText(ws, $"last seen{(char)127}{lastseen}");
                    //WsWriteText(ws, $"round-trip{(char)127}{reply.RoundtripTime}ms");
                    LastSeen.Seen(ip);
                } else {
                    lastseen = Encoding.UTF8.GetString(LastSeen.HasBeenSeen(ip, true));
                    WsWriteText(ws, $"last seen{(char)127}{lastseen}");
                }
            } catch { }

            if (lastseen == "Just now") {
                ManagementScope scope = Wmi.WmiScope(ip);
                if (scope != null) {
                    string starttime = Wmi.WmiGet(scope, "Win32_LogonSession", "StartTime", false, new Wmi.FormatMethodPtr(Wmi.DateTimeToString));
                    if (starttime.Length > 0) WsWriteText(ws, $"start time{(char)127}{starttime}");

                    string username = Wmi.WmiGet(scope, "Win32_ComputerSystem", "UserName", false, null);
                    if (username.Length > 0) WsWriteText(ws, $"logged in user{(char)127}{username}");
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

            //TODO:

            await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None);

        } catch (Exception ex) {
            Logging.Err(ex);
        }
    }

}
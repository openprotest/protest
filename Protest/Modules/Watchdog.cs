using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

public static class Watchdog {

    public static byte[] Settings(in string[] para, in string performer) {
        DirectoryInfo dirWatchdog = new DirectoryInfo(Strings.DIR_WATCHDOG);
        if (!dirWatchdog.Exists) dirWatchdog.Create();

        bool enable = true;
        string frequency = String.Empty;
        for (int i = 1; i < para.Length; i++)
            if (para[i].StartsWith("enable=")) enable = para[i].Substring(7) == "true";
            else if (para[i].StartsWith("frequency=")) frequency = para[i].Substring(10);

        Logging.Action(performer, $"Change watchdog settings");
        return Strings.OK.Array;
    }

    public static byte[] Add(in string[] para, in string performer) {
        DirectoryInfo dirWatchdog = new DirectoryInfo(Strings.DIR_WATCHDOG);
        if (!dirWatchdog.Exists) dirWatchdog.Create();

        string host  = String.Empty;
        string proto = String.Empty;
        string port  = String.Empty;
        for (int i = 1; i < para.Length; i++)
            if (para[i].StartsWith("host=")) host = para[i].Substring(5);
            else if (para[i].StartsWith("proto=")) proto = para[i].Substring(6);
            else if (para[i].StartsWith("port=")) port = para[i].Substring(5);

        if (host.Length == 0 || proto.Length == 0) return Strings.INF.Array;
        if (proto == "tcp" && port.Length == 0) return Strings.INF.Array;

        string filename = $"{host} {proto}{(proto=="tcp"?port:String.Empty)}";

        try {
            DirectoryInfo dir = new DirectoryInfo($"{Strings.DIR_WATCHDOG}\\{filename}");
            if (!dir.Exists) dir.Create();
        } catch (Exception ex) {
            return Encoding.UTF8.GetBytes(ex.Message);
        }

        Logging.Action(performer, $"Add watchdog entry: {filename}");
        return Strings.OK.Array;
    }

    public static byte[] Remove(in string[] para, in string performer) {
        DirectoryInfo dirWatchdog = new DirectoryInfo(Strings.DIR_WATCHDOG);
        if (!dirWatchdog.Exists) return Strings.FLE.Array;

        string name = String.Empty;
        for (int i = 1; i < para.Length; i++)
            if (para[i].StartsWith("name=")) name = para[i].Substring(5);

        if (name.Length == 0) return Strings.INF.Array;

        try {
            DirectoryInfo dir = new DirectoryInfo($"{Strings.DIR_WATCHDOG}\\{name}");
            if (dir.Exists) dir.Delete();
        } catch (Exception ex) {
            return Encoding.UTF8.GetBytes(ex.Message);
        }

        Logging.Action(performer, $"Remove watchdog entry: {name}");
        return Strings.OK.Array;
    }

    public static async void WsView(HttpListenerContext ctx, string remoteIp) {
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
            while (ws.State == WebSocketState.Open) {
                byte[] buff = new byte[2048];
                WebSocketReceiveResult receiveResult = await ws.ReceiveAsync(new ArraySegment<byte>(buff), CancellationToken.None);

                if (receiveResult.MessageType == WebSocketMessageType.Close) {
                    await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None);
                    break;
                }

                if (!Session.CheckAccess(sessionId, remoteIp)) { //check session
                    ctx.Response.Close();
                    return;
                }

                string msg = Encoding.Default.GetString(buff, 0, receiveResult.Count);
                if (msg.Length == 0) continue;                
                
                switch (msg) {
                    case "list":
                        DirectoryInfo dirWatchdog = new DirectoryInfo(Strings.DIR_WATCHDOG);
                        if (!dirWatchdog.Exists) break;

                        StringBuilder sb = new StringBuilder();
                        try {
                            foreach (DirectoryInfo o in dirWatchdog.GetDirectories())
                                sb.Append($"{o.Name}{(char)127}");
                        } catch { }

                        ArraySegment<byte> segment = new ArraySegment<byte>(Encoding.UTF8.GetBytes(sb.ToString()));
                        await ws.SendAsync(segment, WebSocketMessageType.Text, true, CancellationToken.None);

                        break;

                    case "get":

                        break;
                }
            }

        } catch (Exception ex) {
            Logging.Err(ex);
        }
    }

}

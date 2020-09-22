using System;
using System.Collections;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

public static class Telnet {

    private static async void WsWriteText(WebSocket ws, string text) {
        await ws.SendAsync(new ArraySegment<byte>(Encoding.ASCII.GetBytes(text), 0, text.Length), WebSocketMessageType.Text, true, CancellationToken.None);
    }

    public static async void WsTelnet(HttpListenerContext ctx, string remoteIp) {

        string performer = Session.GetUsername(ctx.Request.Cookies["sessionid"]?.Value);
        Logging.Action(performer, "telnet");

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
            byte[] targetBuff = new byte[512];
            WebSocketReceiveResult targetResult = await ws.ReceiveAsync(new ArraySegment<byte>(targetBuff), CancellationToken.None);
            string target = Encoding.Default.GetString(targetBuff, 0, targetResult.Count);

            IPAddress[] ips = null;

            try {
                ips = System.Net.Dns.GetHostEntry(target).AddressList;
            } catch { }

            if (ips is null || ips.Length == 0) {
                WsWriteText(ws, "no such host is known");
                await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None);
                return;
            }

            Console.WriteLine(ips[0].ToString());
            

            TcpClient telnet = new TcpClient();
            telnet.Connect(new IPEndPoint(ips[0], 23));

            WsWriteText(ws, "connected to " + ips[0].ToString());

            while (ws.State == WebSocketState.Open) {
                byte[] buff = new byte[2048];
                WebSocketReceiveResult receiveResult = await ws.ReceiveAsync(new ArraySegment<byte>(buff), CancellationToken.None);

                if (!Session.CheckAccess(sessionId, remoteIp)) { //check session
                    ctx.Response.Close();
                    telnet.Close();
                    return;
                }

                if (receiveResult.MessageType == WebSocketMessageType.Close) {
                    await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None);
                    telnet.Close();
                    break;
                }





            }

        } catch (Exception ex) {
            Logging.Err(ex);
        }
    }


}
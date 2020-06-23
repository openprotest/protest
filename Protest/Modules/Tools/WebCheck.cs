using System;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Text;
using System.Threading;

public static class WebCheck {
    public static async void WsWebCheck(HttpListenerContext ctx, string remoteIp) {
        WebSocketContext wsc; WebSocket ws;

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

        if (!Session.CheckAccess(sessionId, remoteIp)) { //check session
            ctx.Response.Close();
            return;
        }

        try {
            string result;
            byte[] buff = new byte[4096];
            WebSocketReceiveResult receiveResult = await ws.ReceiveAsync(new ArraySegment<byte>(buff), CancellationToken.None);
            string uri = Encoding.Default.GetString(buff, 0, receiveResult.Count);

            string protocol = "";
            string domain = "";
            int port = 0;

            int colon = uri.IndexOf("://");
            if (colon > 0) {
                protocol = uri.Substring(0, colon).ToLower();

                string keep = uri.Substring(colon + 3);
                keep = keep.Replace("\\", "/");
                keep = keep.Split('/')[0];

                if (keep.Contains(":")) {
                    string[] split = keep.Split(':');
                    string sPort = split[1];
                    keep = split[0];
                    port = int.Parse(sPort);

                } else
                    port = protocol switch
                    {
                        //"http" => 80,
                        "https" => 443,
                        _ => 80,
                    };
                domain = keep;
            }

            try { //DNS check
                string ips = "";
                foreach (IPAddress ip in System.Net.Dns.GetHostAddresses(domain))
                    ips += (ips.Length > 0 ? ", " : "") + ip.ToString();

                ips = "DNS resolve: " + ips;

                await ws.SendAsync(new ArraySegment<byte>(Encoding.UTF8.GetBytes(ips + "\n"), 0, ips.Length + 1), WebSocketMessageType.Text, true, CancellationToken.None);
            } catch (Exception ex) {
                await ws.SendAsync(new ArraySegment<byte>(Encoding.UTF8.GetBytes(ex.Message + "\n"), 0, ex.Message.Length + 1), WebSocketMessageType.Text, true, CancellationToken.None);
            }


            try { //TCP check
                TcpClient client = new TcpClient();
                await client.ConnectAsync(domain, port);
                string tcp = (client.Connected) ? "TCP connection: OK\n" : "TCP: Failed\n";
                await ws.SendAsync(new ArraySegment<byte>(Encoding.UTF8.GetBytes(tcp), 0, tcp.Length), WebSocketMessageType.Text, true, CancellationToken.None);

                client.Close();
                client.Dispose();
            } catch (Exception ex) {
                await ws.SendAsync(new ArraySegment<byte>(Encoding.UTF8.GetBytes(ex.Message + "\n"), 0, ex.Message.Length + 1), WebSocketMessageType.Text, true, CancellationToken.None);
            }

            try { //HTTP check
                using HttpClient httpClient = new HttpClient();
                using HttpResponseMessage get = await httpClient.GetAsync(uri);

                string http = $"HTTP response: {(int)get.StatusCode} {get.StatusCode}";
                await ws.SendAsync(new ArraySegment<byte>(Encoding.UTF8.GetBytes(http + "\n"), 0, http.Length + 1), WebSocketMessageType.Text, true, CancellationToken.None);

                result = $"HTTP/{get.Version} {(int)get.StatusCode} {get.StatusCode}";
                result += "\n";
                result += get.Headers.ToString();
            } catch (ArgumentException) {
                result = "invalid request URI";

            } catch (HttpRequestException) {
                result = "HTTP request failed";

            } catch (Exception ex) {
                result = ex.Message;
            }

            await ws.SendAsync(new ArraySegment<byte>(Encoding.UTF8.GetBytes(result), 0, result.Length), WebSocketMessageType.Text, true, CancellationToken.None);
            await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None);

        } catch (Exception ex) {
            Logging.Err(ex);
            await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None);
        }

    }
}
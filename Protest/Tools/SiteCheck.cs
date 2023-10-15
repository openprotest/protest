using Protest.Http;
using System.Net;
using System.Net.Http;
using System.Net.Security;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Threading;

namespace Protest.Tools;

internal static class SiteCheck {
    public static async void WebSocketHandler(HttpListenerContext ctx) {
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

        if (!Auth.IsAuthenticatedAndAuthorized(ctx, ctx.Request.Url.AbsolutePath)) {
            await ws.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, null, CancellationToken.None);
            return;
        }

        try {
            byte[] buff = new byte[4096];
            WebSocketReceiveResult receiveResult = await ws.ReceiveAsync(new ArraySegment<byte>(buff), CancellationToken.None);
            string uri = Encoding.Default.GetString(buff, 0, receiveResult.Count);

            string protocol = String.Empty;
            string domain = String.Empty;
            int port = 0;

            int colon = uri.IndexOf("://");
            if (colon > 0) {
                protocol = uri[..colon].ToLower();

                string keep = uri[(colon + 3)..];
                keep = keep.Replace("\\", "/");
                keep = keep.Split('/')[0];

                if (keep.Contains(':')) {
                    string[] split = keep.Split(':');
                    string sPort = split[1];
                    keep = split[0];

                    if (!int.TryParse(sPort, out port) || port < 1 || port > 65535) {
                        byte[] fail = "{\"title\":\"Parse\",\"status\":\"failed\",\"error\":\"invalid port number\"}"u8.ToArray();
                        await ws.SendAsync(new ArraySegment<byte>(fail, 0, fail.Length), WebSocketMessageType.Text, true, CancellationToken.None);
                        await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, null, CancellationToken.None);
                        return;
                    }

                }
                else {
                    port = protocol switch {
                        "https" => 443,
                        _ => 80,
                    };
                }
                domain = keep;
            }

            try { //DNS check
                StringBuilder result = new StringBuilder();
                result.Append("{\"title\":\"DNS resolve\",");

                result.Append($"\"result\":[");
                IPAddress[] ips = System.Net.Dns.GetHostAddresses(domain);
                for (int i = 0; i < ips.Length; i++) {
                    if (i > 0) result.Append(',');
                    result.Append($"\"{ips[i].ToString()}\"");
                }
                result.Append("],");

                result.Append($"\"status\":\"pass\"");
                result.Append('}');

                await ws.SendAsync(new ArraySegment<byte>(Encoding.UTF8.GetBytes(result.ToString()), 0, result.Length), WebSocketMessageType.Text, true, CancellationToken.None);

            }
            catch (Exception ex) {
                string fail = $"{{\"title\":\"DNS resolve\",\"status\":\"failed\",\"error\":\"{Data.EscapeJsonText(ex.Message)}\"}}";
                await ws.SendAsync(new ArraySegment<byte>(Encoding.UTF8.GetBytes(fail), 0, fail.Length), WebSocketMessageType.Text, true, CancellationToken.None);
                await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, null, CancellationToken.None);
                return;
            }

            try { //TCP check
                StringBuilder result = new StringBuilder();
                result.Append("{\"title\":\"TCP connection\",");

                using TcpClient client = new TcpClient();
                await client.ConnectAsync(domain, port);

                result.Append($"\"result\":[\"{(client.Connected ? "Established" : "Failed")}\"],");
                result.Append($"\"status\":\"{(client.Connected ? "pass" : "failed")}\"");
                result.Append('}');

                client.Close();

                await ws.SendAsync(new ArraySegment<byte>(Encoding.UTF8.GetBytes(result.ToString()), 0, result.Length), WebSocketMessageType.Text, true, CancellationToken.None);


            }
            catch (SocketException ex) {
                string fail = $"{{\"title\":\"TCP connection\",\"status\":\"failed\",\"error\":\"{Data.EscapeJsonText(ex.SocketErrorCode.ToString())}\"}}";
                await ws.SendAsync(new ArraySegment<byte>(Encoding.UTF8.GetBytes(fail), 0, fail.Length), WebSocketMessageType.Text, true, CancellationToken.None);
                await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, null, CancellationToken.None);
                return;

            }
            catch (Exception ex) {
                string fail = $"{{\"title\":\"TCP connection\",\"status\":\"failed\",\"error\":\"{Data.EscapeJsonText(ex.Message)}\"}}";
                await ws.SendAsync(new ArraySegment<byte>(Encoding.UTF8.GetBytes(fail), 0, fail.Length), WebSocketMessageType.Text, true, CancellationToken.None);
                await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, null, CancellationToken.None);
                return;
            }

            try { //TLS check
                if (protocol == "https") {
                    StringBuilder result = new StringBuilder();

                    using HttpClientHandler handler = new HttpClientHandler();
                    handler.ServerCertificateCustomValidationCallback = (HttpRequestMessage request, X509Certificate2 cert, X509Chain chain, SslPolicyErrors errors) => {
                        if (result.Length > 0) return errors == SslPolicyErrors.None;

                        result.Append("{\"title\":\"TLS validation\",");

                        result.Append($"\"result\":[");

                        result.Append($"\"TLS errors: {errors}\",");
                        result.Append($"\"Effective date: {Data.EscapeJsonText(cert.GetEffectiveDateString())}\",");
                        result.Append($"\"Expiration date: {Data.EscapeJsonText(cert.GetExpirationDateString())}\",");
                        result.Append($"\"Issuer: {Data.EscapeJsonText(cert.Issuer)}\",");
                        result.Append($"\"Subject: {Data.EscapeJsonText(cert.Subject)}\",");
                        result.Append($"\"Thumbprint: {Data.EscapeJsonText(cert.Thumbprint)}\",");
                        result.Append($"\"Serial number: {Data.EscapeJsonText(cert.SerialNumber)}\"");

                        result.Append($"],");

                        result.Append($"\"status\":\"{(errors == SslPolicyErrors.None ? "pass" : "failed")}\"");
                        result.Append('}');

                        return errors == SslPolicyErrors.None;
                    };

                    using  HttpClient client = new HttpClient(handler);
                    using  HttpResponseMessage response = await client.GetAsync(uri);
                    response.EnsureSuccessStatusCode();

                    if (result.Length > 0) {
                        await ws.SendAsync(new ArraySegment<byte>(Encoding.UTF8.GetBytes(result.ToString()), 0, result.Length), WebSocketMessageType.Text, true, CancellationToken.None);
                    }
                }

            }
            catch (Exception ex) {
                string fail = $"{{\"title\":\"TLS validation\",\"status\":\"failed\",\"error\":\"{Data.EscapeJsonText(ex.InnerException.Message)}\"}}";
                await ws.SendAsync(new ArraySegment<byte>(Encoding.UTF8.GetBytes(fail), 0, fail.Length), WebSocketMessageType.Text, true, CancellationToken.None);
            }

            try { //HTTP check
                StringBuilder result = new StringBuilder();
                result.Append("{\"title\":\"HTTP response\",");

                using HttpClientHandler handler = new HttpClientHandler();
                handler.ServerCertificateCustomValidationCallback = (HttpRequestMessage request, X509Certificate2 cert, X509Chain chain, SslPolicyErrors errors) => true;

                using HttpClient httpClient = new HttpClient(handler);
                using HttpResponseMessage response = await httpClient.GetAsync(uri);

                //string http = $"HTTP response: {(int)response.StatusCode} {response.StatusCode}";
                //await ws.SendAsync(new ArraySegment<byte>(Encoding.UTF8.GetBytes(http), 0, http.Length), WebSocketMessageType.Text, true, CancellationToken.None);

                result.Append($"\"result\":[");
                result.Append($"\"HTTP/{response.Version} {(int)response.StatusCode} {response.StatusCode}\"");
                string[] headers = response.Headers.ToString().Split("\n");

                for (int i = 0; i < headers.Length; i++) {
                    result.Append(',');
                    result.Append($"\"{Data.EscapeJsonText(headers[i].Trim())}\"");
                }
                result.Append("],");

                result.Append($"\"status\":\"pass\"");
                result.Append('}');

                await ws.SendAsync(new ArraySegment<byte>(Encoding.UTF8.GetBytes(result.ToString()), 0, result.Length), WebSocketMessageType.Text, true, CancellationToken.None);

            }
            catch (ArgumentException) {
                string fail = "{\"title\":\"HTTP response\",\"status\":\"failed\",\"error\":\"invalid request URI\"}";
                await ws.SendAsync(new ArraySegment<byte>(Encoding.UTF8.GetBytes(fail), 0, fail.Length), WebSocketMessageType.Text, true, CancellationToken.None);

            }
            catch (HttpRequestException) {
                string fail = "{\"title\":\"HTTP response\",\"status\":\"failed\",\"error\":\"HTTP request failed\"}";
                await ws.SendAsync(new ArraySegment<byte>(Encoding.UTF8.GetBytes(fail), 0, fail.Length), WebSocketMessageType.Text, true, CancellationToken.None);

            }
            catch (Exception ex) {
                string fail = $"{{\"title\":\"HTTP response\",\"status\":\"failed\",\"error\":\"{Data.EscapeJsonText(ex.Message)}\"}}";
                await ws.SendAsync(new ArraySegment<byte>(Encoding.UTF8.GetBytes(fail), 0, fail.Length), WebSocketMessageType.Text, true, CancellationToken.None);
            }

            await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None);

        }
        catch (Exception ex) {
            Logger.Error(ex);
            await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None);
        }

    }

}

using System.Collections.Generic;
using System.Diagnostics.CodeAnalysis;
using System.Net;
using System.Net.Http;
using System.Net.Security;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;
using Protest.Http;

namespace Protest.Tools;

internal static class WebsiteCheck {

    private class RequestData {
        [JsonPropertyName("v1")]
        public bool EnableHttpV1 { get; set; }

        [JsonPropertyName("v2")]
        public bool EnableHttpV2 { get; set; }

        [JsonPropertyName("v3")]
        public bool EnableHttpV3 { get; set; }

        [JsonPropertyName("uri")]
        public string Uri { get; set; } = string.Empty;
    }

    public static async Task WebSocketHandler(HttpListenerContext ctx) {
        WebSocket ws;
        try {
            HttpListenerWebSocketContext wsc = await ctx.AcceptWebSocketAsync(null);
            ws = wsc.WebSocket;
        }
        catch (WebSocketException ex) {
            ctx.Response.Close();
            Logger.Error(ex);
            return;
        }

        if (ws is null) return;

        if (!Auth.IsAuthenticatedAndAuthorized(ctx, ctx.Request.Url.AbsolutePath)) {
            await ws.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, null, CancellationToken.None);
            return;
        }

        try {
            byte[] buff = new byte[4096];
            WebSocketReceiveResult receiveResult = await ws.ReceiveAsync(new ArraySegment<byte>(buff), CancellationToken.None);
            string json = Encoding.UTF8.GetString(buff, 0, receiveResult.Count);

            RequestData req;
            try {
                req = JsonSerializer.Deserialize<RequestData>(json);
            }
            catch (JsonException) {
                byte[] fail = "{\"title\":\"Parse\",\"status\":\"failed\",\"error\":\"invalid parameter\"}"u8.ToArray();
                await ws.SendAsync(new ArraySegment<byte>(fail, 0, fail.Length), WebSocketMessageType.Text, true, CancellationToken.None);
                await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, null, CancellationToken.None);
                return;
            }

            if (req is null) {
                await ws.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, null, CancellationToken.None);
                return;
            }

            string uri = req.Uri;

            if (String.IsNullOrEmpty(uri)) {
                await ws.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, null, CancellationToken.None);
                return;
            }

            string protocol = String.Empty;
            string domain = String.Empty;
            int port = 0;

            int colon = uri.IndexOf("://");
            if (colon > 0) {
                protocol = uri[..colon].ToLower();

                string keep = uri[(colon + 3)..];
                keep = keep.Replace("\\", "/");
                keep = keep.Split('/')[0];

                if (String.IsNullOrWhiteSpace(keep)) {
                    await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, null, CancellationToken.None);
                    return;
                }

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

            await DnsCheck(ws, domain);
            await TcpCheck(ws, domain, port);
            await TlsCheck(ws, uri, protocol);

            List<Task> tasks = new List<Task>();

            if (req.EnableHttpV1) {
                tasks.Add(CheckHttp(ws, uri, HttpVersion.Version11));
            }

            if (req.EnableHttpV2) {
                tasks.Add(CheckHttp(ws, uri, HttpVersion.Version20));
            }

            if (req.EnableHttpV3) {
                tasks.Add(CheckHttp(ws, uri, HttpVersion.Version30));
            }

            await Task.WhenAll(tasks);

            await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, CancellationToken.None);
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

        if (ws.State == WebSocketState.Open) {
            try {
                await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, CancellationToken.None);
            }
#if DEBUG
            catch (Exception ex) {
                Logger.Error(ex);
            }
#else
            catch { }
#endif
        }
    }

    private static async Task DnsCheck(WebSocket ws, string domain) {
        try {
            StringBuilder result = new StringBuilder();
            result.Append("{\"title\":\"DNS\",");

            result.Append($"\"result\":[");

            long starttime = DateTime.UtcNow.Ticks;
            IPAddress[] ips = System.Net.Dns.GetHostAddresses(domain);
            long endtime = DateTime.UtcNow.Ticks;

            for (int i = 0; i < ips.Length; i++) {
                if (i > 0) result.Append(',');
                result.Append($"\"{ips[i]}\"");
            }
            result.Append("],");

            result.Append($"\"status\":\"pass\",");

            result.Append($"\"time\":\"{(endtime - starttime) / 10_000}\"");

            result.Append('}');

            await WebSocketHelper.WsWriteText(ws, result.ToString());
        }
        catch (Exception ex) {
            string fail = $"{{\"title\":\"DNS\",\"status\":\"failed\",\"error\":\"{Data.EscapeJsonText(ex.Message)}\"}}";
            await WebSocketHelper.WsWriteText(ws, fail);
            await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, null, CancellationToken.None);
        }
    }

    private static async Task TcpCheck(WebSocket ws, string domain, int port) {
        try {
            StringBuilder result = new StringBuilder();
            result.Append("{\"title\":\"TCP\",");

            using TcpClient client = new TcpClient();

            long starttime = DateTime.UtcNow.Ticks;
            await client.ConnectAsync(domain, port);
            long endtime = DateTime.UtcNow.Ticks;

            result.Append($"\"result\":[\"{(client.Connected ? "Established" : "Failed")}\"],");
            result.Append($"\"status\":\"{(client.Connected ? "pass" : "failed")}\",");
            result.Append($"\"time\":\"{(endtime - starttime) / 10_000}\"");
            result.Append('}');

            client.Close();
            await WebSocketHelper.WsWriteText(ws, result.ToString());
        }
        catch (SocketException ex) {
            string fail = $"{{\"title\":\"TCP\",\"status\":\"failed\",\"error\":\"{Data.EscapeJsonText(ex.SocketErrorCode.ToString())}\"}}";
            await WebSocketHelper.WsWriteText(ws, fail);
            await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, null, CancellationToken.None);
        }
        catch (Exception ex) {
            string fail = $"{{\"title\":\"TCP\",\"status\":\"failed\",\"error\":\"{Data.EscapeJsonText(ex.Message)}\"}}";
            await WebSocketHelper.WsWriteText(ws, fail);
            await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, null, CancellationToken.None);
        }
    }

    private static async Task TlsCheck(WebSocket ws, string uri, string protocol) {
        try {
            if (protocol == "https") {
                StringBuilder result = new StringBuilder();
                long starttime = DateTime.UtcNow.Ticks;
                using HttpClientHandler handler = new HttpClientHandler();
                handler.ServerCertificateCustomValidationCallback = (HttpRequestMessage request, X509Certificate2 cert, X509Chain chain, SslPolicyErrors errors) => {
                    long endtime = DateTime.UtcNow.Ticks;

                    if (result.Length > 0) return errors == SslPolicyErrors.None;

                    result.Append("{\"title\":\"TLS\",");

                    result.Append($"\"result\":[");

                    result.Append($"\"TLS errors: {errors}\",");
                    result.Append($"\"Effective date: {Data.EscapeJsonText(cert.GetEffectiveDateString())}\",");
                    result.Append($"\"Expiration date: {Data.EscapeJsonText(cert.GetExpirationDateString())}\",");
                    result.Append($"\"Issuer: {Data.EscapeJsonText(cert.Issuer)}\",");
                    result.Append($"\"Subject: {Data.EscapeJsonText(cert.Subject)}\",");
                    result.Append($"\"Thumbprint: {Data.EscapeJsonText(cert.Thumbprint)}\",");
                    result.Append($"\"Serial number: {Data.EscapeJsonText(cert.SerialNumber)}\"");

                    result.Append($"],");

                    result.Append($"\"status\":\"{(errors == SslPolicyErrors.None ? "pass" : "failed")}\",");
                    result.Append($"\"time\":\"{(endtime - starttime) / 10_000}\"");

                    result.Append('}');

                    return errors == SslPolicyErrors.None;
                };

                using HttpClient client = new HttpClient(handler);
                using HttpResponseMessage response = await client.GetAsync(uri);
                //response.EnsureSuccessStatusCode();

                if (result.Length > 0) {
                    await WebSocketHelper.WsWriteText(ws, result.ToString());
                }
            }
        }
        catch (Exception ex) when (ex.HResult == -2146233087) {
            string fail = "{\"title\":\"TLS\",\"status\":\"failed\",\"error\":\"The remote certificate was rejected\"}";
            await WebSocketHelper.WsWriteText(ws, fail);
        }
        catch (Exception ex) {
            string fail = $"{{\"title\":\"TLS\",\"status\":\"failed\",\"error\":\"{Data.EscapeJsonText(ex?.InnerException?.Message ?? "Unknown error")}\"}}";
            await WebSocketHelper.WsWriteText(ws, fail);
        }
    }

    private static async Task CheckHttp(WebSocket ws, string uri, Version version) {
        try {
            SocketsHttpHandler handler = new SocketsHttpHandler {
                AutomaticDecompression = DecompressionMethods.All,
                SslOptions = {
                    RemoteCertificateValidationCallback = (sender, cert, chain, errors) => true
                },
                EnableMultipleHttp2Connections = true,
                EnableMultipleHttp3Connections = true
            };

            using HttpClient client = new HttpClient(handler);
            using HttpRequestMessage request = new HttpRequestMessage(HttpMethod.Get, uri) {
                Version = version,
                VersionPolicy = HttpVersionPolicy.RequestVersionExact
            };

            long starttime = DateTime.UtcNow.Ticks;

            using HttpResponseMessage response = await client.SendAsync(request);

            long endtime = DateTime.UtcNow.Ticks;

            StringBuilder result = new StringBuilder();
            result.Append($"{{\"title\":\"HTTP {version}\",");

            result.Append($"\"result\":[");
            result.Append($"\"HTTP/{response.Version} {(int)response.StatusCode} {response.StatusCode}\"");
            string[] headers = response.Headers.ToString().Split("\n");

            for (int i = 0; i < headers.Length; i++) {
                result.Append(',');
                result.Append($"\"{Data.EscapeJsonText(headers[i].Trim())}\"");
            }
            result.Append("],");

            result.Append($"\"status\":\"pass\",");

            result.Append($"\"time\":\"{(endtime - starttime) / 10_000}\"");

            result.Append('}');

            await WebSocketHelper.WsWriteText(ws, result.ToString());
        }
        catch (HttpRequestException) {
            string fail = $"{{\"title\":\"HTTP {version}\",\"status\":\"failed\",\"error\":\"HTTP request failed\"}}";
            await WebSocketHelper.WsWriteText(ws, fail);
        }
        catch (Exception ex) {
            string fail = $"{{\"title\":\"HTTP {version}\",\"status\":\"failed\",\"error\":\"{Data.EscapeJsonText(ex.Message)}\"}}";
            await WebSocketHelper.WsWriteText(ws, fail);
        }
    }

}

using System;
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
using System.Threading;
using System.Threading.Tasks;
using Protest.Http;

namespace Protest.Tools;

internal static class SiteCheck {

    private class RequestData {
        public bool v1 { get; set; }
        public bool v2 { get; set; }
        public bool v3 { get; set; }
        public string uri { get; set; } = string.Empty;
    }

    private static void WsWriteText(WebSocket ws, [StringSyntax(StringSyntaxAttribute.Json)] string text, Lock mutex) {
        lock (mutex) {
            if (ws.State != WebSocketState.Open) { return; }
            ws.SendAsync(new ArraySegment<byte>(Encoding.UTF8.GetBytes(text), 0, text.Length), WebSocketMessageType.Text, true, CancellationToken.None);
        }
    }
    private static void WsWriteText(WebSocket ws, byte[] bytes, Lock mutex) {
        lock (mutex) {
            if (ws.State != WebSocketState.Open) { return; }
            ws.SendAsync(new ArraySegment<byte>(bytes, 0, bytes.Length), WebSocketMessageType.Text, true, CancellationToken.None);
        }
    }

    private static RequestData ParseJson(string json) {
        JsonSerializerOptions options = new JsonSerializerOptions {
            PropertyNameCaseInsensitive = true
        };

        return JsonSerializer.Deserialize<RequestData>(json, options);
    }

    public static async void WebSocketHandler(HttpListenerContext ctx) {
        WebSocket ws;
        try {
            WebSocketContext wsc = await ctx.AcceptWebSocketAsync(null);
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
            string json = Encoding.Default.GetString(buff, 0, receiveResult.Count);
            RequestData req = JsonSerializer.Deserialize<RequestData>(json);

            string uri = req.uri;

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

            Lock mutex = new Lock();

            await DnsCheck(ws, domain, mutex);
            await TcpCheck(ws, domain, port, mutex);
            await TlsCheck(ws, uri, protocol, mutex);

            List<Task> tasks = new List<Task>();
            
            if (req.v1) {
                tasks.Add(CheckHttp(ws, uri, HttpVersion.Version11, mutex));
            }

            if (req.v2) {
                tasks.Add(CheckHttp(ws, uri, HttpVersion.Version20, mutex));
            }

            if (req.v3) {
                tasks.Add(CheckHttp(ws, uri, HttpVersion.Version30, mutex));
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

        if (ws?.State == WebSocketState.Open) {
            try {
                await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, CancellationToken.None);
            }
            catch { }
        }
    }

    private static async Task DnsCheck(WebSocket ws, string domain, Lock mutex) {
        try {
            StringBuilder result = new StringBuilder();
            result.Append("{\"title\":\"DNS\",");

            result.Append($"\"result\":[");
            IPAddress[] ips = System.Net.Dns.GetHostAddresses(domain);
            for (int i = 0; i < ips.Length; i++) {
                if (i > 0) result.Append(',');
                result.Append($"\"{ips[i].ToString()}\"");
            }
            result.Append("],");

            result.Append($"\"status\":\"pass\"");
            result.Append('}');

            WsWriteText(ws, result.ToString(), mutex);
        }
        catch (Exception ex) {
            string fail = $"{{\"title\":\"DNS\",\"status\":\"failed\",\"error\":\"{Data.EscapeJsonText(ex.Message)}\"}}";
            WsWriteText(ws, fail, mutex);
            await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, null, CancellationToken.None);
        }
    }

    private static async Task TcpCheck(WebSocket ws , string domain, int port, Lock mutex) {
        try {
            StringBuilder result = new StringBuilder();
            result.Append("{\"title\":\"TCP\",");

            using TcpClient client = new TcpClient();
            await client.ConnectAsync(domain, port);

            result.Append($"\"result\":[\"{(client.Connected ? "Established" : "Failed")}\"],");
            result.Append($"\"status\":\"{(client.Connected ? "pass" : "failed")}\"");
            result.Append('}');

            client.Close();
            WsWriteText(ws, result.ToString(), mutex);
        }
        catch (SocketException ex) {
            string fail = $"{{\"title\":\"TCP\",\"status\":\"failed\",\"error\":\"{Data.EscapeJsonText(ex.SocketErrorCode.ToString())}\"}}";
            WsWriteText(ws, fail, mutex);
            await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, null, CancellationToken.None);
        }
        catch (Exception ex) {
            string fail = $"{{\"title\":\"TCP\",\"status\":\"failed\",\"error\":\"{Data.EscapeJsonText(ex.Message)}\"}}";
            WsWriteText(ws, fail, mutex);
            await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, null, CancellationToken.None);
        }
    }

    private static async Task TlsCheck(WebSocket ws, string uri, string protocol, Lock mutex) {
        try {
            if (protocol == "https") {
                StringBuilder result = new StringBuilder();

                using HttpClientHandler handler = new HttpClientHandler();
                handler.ServerCertificateCustomValidationCallback = (HttpRequestMessage request, X509Certificate2 cert, X509Chain chain, SslPolicyErrors errors) => {
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

                    result.Append($"\"status\":\"{(errors == SslPolicyErrors.None ? "pass" : "failed")}\"");
                    result.Append('}');

                    return errors == SslPolicyErrors.None;
                };

                using  HttpClient client = new HttpClient(handler);
                using  HttpResponseMessage response = await client.GetAsync(uri);
                //response.EnsureSuccessStatusCode();

                if (result.Length > 0) {
                    WsWriteText(ws, result.ToString(), mutex);
                }
            }
        }
        catch (Exception ex) when (ex.HResult == -2146233087) {
            string fail = "{\"title\":\"TLS\",\"status\":\"failed\",\"error\":\"The remote certificate was rejected\"}";
            WsWriteText(ws, fail, mutex);
        }
        catch (Exception ex) {
            string fail = $"{{\"title\":\"TLS\",\"status\":\"failed\",\"error\":\"{Data.EscapeJsonText(ex?.InnerException?.Message ?? "Unknown error")}\"}}";
            WsWriteText(ws, fail, mutex);
        }
    }

    private static async Task CheckHttp(WebSocket ws, string uri, Version version, Lock mutex) {
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
            HttpRequestMessage request = new HttpRequestMessage(HttpMethod.Get, uri) {
                Version = version,
                VersionPolicy = HttpVersionPolicy.RequestVersionExact
            };

            using HttpResponseMessage response = await client.SendAsync(request);

            List<string> resultList = new List<string> {
                $"HTTP/{response.Version} {(int)response.StatusCode} {response.StatusCode}"
            };

            resultList.AddRange(response.Headers.Select(h => $"{h.Key}: {string.Join(", ", h.Value)}"));

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

            result.Append($"\"status\":\"pass\"");
            result.Append('}');

            WsWriteText(ws, result.ToString(), mutex);
        }
        catch (HttpRequestException) {
            string fail = $"{{\"title\":\"HTTP {version}\",\"status\":\"failed\",\"error\":\"HTTP request failed\"}}";
            WsWriteText(ws, fail, mutex);
        }
        catch (Exception ex) {
            string fail = $"{{\"title\":\"HTTP {version}\",\"status\":\"failed\",\"error\":\"{Data.EscapeJsonText(ex.Message)}\"}}";
            WsWriteText(ws, fail, mutex);
        }
    }

}

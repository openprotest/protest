using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics.CodeAnalysis;
using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Protest.Http;

using static Protest.Protocols.Dns;
using static Protest.Protocols.Mdns;

namespace Protest.Tools;

internal static class IpScanner {
    private static void WsWriteText(WebSocket ws, [StringSyntax(StringSyntaxAttribute.Json)] string text, object mutex) {
        lock (mutex) {
            WsWriteText(ws, Encoding.UTF8.GetBytes(text), mutex);
        }
    }
    private static void WsWriteText(WebSocket ws, byte[] bytes, object mutex) {
        lock (mutex) {
            ws.SendAsync(new ArraySegment<byte>(bytes, 0, bytes.Length), WebSocketMessageType.Text, true, CancellationToken.None);
        }
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

        object mutex = new object();
        using CancellationTokenSource tokenSource = new CancellationTokenSource();

        Thread[] threads = new Thread[] {
            new Thread(()=> CheckDhcp(ws, mutex, tokenSource.Token)),
            new Thread(()=> CheckIcmp(ws, mutex, tokenSource.Token)),
            new Thread(()=> CheckMdns(ws, mutex, tokenSource.Token)),
        };

        try {
            for (int i = 0; i < threads.Length; i++) {
                threads[i].Start();
            }

            await Task.Delay(50);

            while (ws.State == WebSocketState.Open) {
                if (!Auth.IsAuthenticatedAndAuthorized(ctx, ctx.Request.Url.AbsolutePath)) {
                    ctx.Response.Close();
                    break;
                }

                if (threads.All(o=> !o.IsAlive)) {
                    break;
                }

                //keep socket connection open

                await Task.Delay(500);
            }

            if (threads.Any(o=>o.IsAlive)) {
                tokenSource.Cancel();
            }
        }
        catch { }
        finally {
            if (ws?.State == WebSocketState.Open) {
                try {
                    await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, null, CancellationToken.None);
                }
                catch { }
            }
        }
    }
    
    private static void CheckIcmp(WebSocket ws, object mutex, CancellationToken token) {

    }

    private static void CheckDhcp(WebSocket ws, object mutex, CancellationToken token) {
        IPAddress[] nics = IpTools.GetIpAddresses();
        for (int i = 0; i < nics.Length; i++) {
            if (IPAddress.IsLoopback(nics[i])) continue;
        }
    }

    private static void CheckMdns(WebSocket ws, object mutex, CancellationToken token) {
        RealTimeResolve(ws, mutex, token, ANY_QUERY, Protocols.Dns.RecordType.ANY, 1000);
        RealTimeResolve(ws, mutex, token, HTTP_QUERY, Protocols.Dns.RecordType.ANY, 1000);
    }

    public static void RealTimeResolve(WebSocket ws, object mutex, CancellationToken token, string queryString, RecordType type, int timeout) {
        byte[] request = ConstructQuery(queryString, type);

        IPAddress[] nics = IpTools.GetIpAddresses();
        for (int i = 0; i < nics.Length; i++) {
            if (IPAddress.IsLoopback(nics[i])) continue;

            using Socket socket = CreateAndBindSocket(nics[i], timeout, out IPEndPoint remoteEndPoint);
            if (socket == null) continue;

            try {
                socket.SendTo(request, remoteEndPoint);

                DateTime endTime = DateTime.Now.AddMilliseconds(timeout);
                while (DateTime.Now <= endTime) {
                    if (token.IsCancellationRequested) break;

                    byte[] reply = new byte[1024];

                    try {
                        EndPoint remoteEP = new IPEndPoint(IPAddress.Any, 0);
                        int length = socket.ReceiveFrom(reply, ref remoteEP);
                        if (length == 0) continue;

                        new Thread(() => {
                            byte[] actualReply = new byte[length];
                            Array.Copy(reply, actualReply, length);

                            string hostname = string.Empty;
                            IPAddress ipAddress = ((IPEndPoint)remoteEP).Address;
                            string ipString = ipAddress.ToString();
                            string macAddress = Protocols.Arp.ArpRequest(ipString);
                            StringBuilder services = new StringBuilder();

                            Answer[] answer = ParseAnswers(actualReply, type, ipAddress, out _, out _, out _, true);
                            for (int j = 0; j < answer.Length; j++) {
                                if (answer[j].type == RecordType.SRV) {
                                    string[] split = answer[j].answerString.Split(':');
                                    if (split.Length >= 2) {
                                        hostname = split[0].EndsWith(".local") ? hostname = split[0][..^6] : hostname = split[0];

                                        if (services.Length > 0) services.Append(',');
                                        services.Append(split[1]);
                                    }
                                }
                                else if (answer[j].type == RecordType.PTR) {
                                    if (answer[j].answerString.EndsWith("_ssh._tcp.local")) {
                                        if (services.Length > 0) services.Append(',');
                                        services.Append("22");
                                    }
                                    else if (answer[j].answerString.EndsWith("_http._tcp.local")) {
                                        if (services.Length > 0) services.Append(',');
                                        services.Append("80");
                                    }
                                    else if (answer[j].answerString.EndsWith("_https._tcp.local")) {
                                        if (services.Length > 0) services.Append(',');
                                        services.Append("443");
                                    }
                                    else if (answer[j].answerString.EndsWith("_smb._tcp.local")) {
                                        if (services.Length > 0) services.Append(',');
                                        services.Append("445");
                                    }
                                    else if (answer[j].answerString.EndsWith("_http-alt._tcp.local")) {
                                        if (services.Length > 0) services.Append(',');
                                        services.Append("8080");
                                    }
                                    else if (answer[j].answerString.EndsWith("_printer._tcp.local")) {
                                        if (services.Length > 0) services.Append(',');
                                        services.Append("9100");
                                    }
                                }
                            }

                            WsWriteText(ws, JsonSerializer.Serialize(new {
                                name         = hostname,
                                ip           = ipString,
                                mac          = macAddress,
                                manufacturer = MacLookup.LookupToString(macAddress),
                                services     = services.ToString(),
                            }), mutex);

                        }).Start();
                    }
                    catch { }
                }
            }
            catch { }
        }
    }

}

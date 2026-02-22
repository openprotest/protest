using Protest.Http;
using System.Collections.Generic;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace Protest.Tools;

internal static class TraceRoute {

    static readonly byte[] ICMP_PAYLOAD = "0123456789abcdef"u8.ToArray();
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

        Lock mutex = new Lock();

        try {
            while (ws.State == WebSocketState.Open) {
                byte[] buff = new byte[2048];
                WebSocketReceiveResult receiveResult = await ws.ReceiveAsync(new ArraySegment<byte>(buff), CancellationToken.None);

                if (!Auth.IsAuthenticatedAndAuthorized(ctx, ctx.Request.Url.AbsolutePath)) {
                    await ws.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, null, CancellationToken.None);
                    return;
                }

                if (receiveResult.MessageType == WebSocketMessageType.Close) {
                    await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, CancellationToken.None);
                    break;
                }

                string hostname = Encoding.Default.GetString(buff, 0, receiveResult.Count);
                hostname = hostname.Trim();
                if (hostname.Length == 0) {
                    await ws.SendAsync(Data.CODE_INVALID_ARGUMENT, WebSocketMessageType.Text, true, CancellationToken.None);
                    continue;
                }

                const short timeout = 2000; //2s
                const short ttl = 30;

                List<string> list = new List<string>();

                new Thread(async () => {
                    List<IPAddress> ipList = new List<IPAddress>();
                    string lastAddress = String.Empty;

                    using (Ping p = new Ping())
                        for (short i = 1; i < ttl; i++) {
                            if (ws.State != WebSocketState.Open) break;
                            string result = $"{hostname}{(char)127}";

                            try {
                                PingReply reply = p.Send(hostname, timeout, ICMP_PAYLOAD, new PingOptions(i, true));

                                if (reply.Status == IPStatus.Success || reply.Status == IPStatus.TtlExpired) {
                                    if (lastAddress == reply.Address.ToString()) {
                                        break;
                                    }
                                    else {
                                        lastAddress = reply.Address.ToString();
                                    }

                                    result += $"{reply.Address}{(char)127}{reply.RoundtripTime}";
                                    ipList.Add(reply.Address);
                                }
                                else if (reply.Status == IPStatus.TimedOut) {
                                    result += "Timed out";
                                }
                                else {
                                    break;
                                }
                            }
                            catch (Exception ex) {
                                Logger.Error(ex);
                                break;
                            }

                            lock (mutex) { //once send per socket
                                ws.SendAsync(new ArraySegment<byte>(Encoding.UTF8.GetBytes(result), 0, result.Length), WebSocketMessageType.Text, true, CancellationToken.None);
                            }
                        }

                    List<Task<string>> tasks = new List<Task<string>>(ipList.Count);
                    for (int j = 0; j < ipList.Count; j++) {
                        tasks.Add(Protocols.Dns.NativeReverseDnsLookupAsync(ipList[j]));
                    }
                    string[] hostnameArray = await Task.WhenAll(tasks);

                    string hostnames = $"[hostnames]{(char)127}{hostname}{(char)127}";
                    for (int i = 0; i < hostnameArray.Length; i++)
                        if (hostnameArray[i].Length > 0 && hostnameArray[i] != ipList[i].ToString())
                            hostnames += $"{ipList[i]}{(char)127}{hostnameArray[i]}{(char)127}";
                    if (hostnames.EndsWith(((char)127).ToString())) hostnames = hostnames[..^1];

                    lock (mutex) {
                        ws.SendAsync(new ArraySegment<byte>(Encoding.UTF8.GetBytes(hostnames), 0, hostnames.Length), WebSocketMessageType.Text, true, CancellationToken.None);

                        string over = $"over{((char)127)}{hostname}";
                        ws.SendAsync(new ArraySegment<byte>(Encoding.UTF8.GetBytes(over), 0, over.Length), WebSocketMessageType.Text, true, CancellationToken.None);

                        //ws.CloseAsync(WebSocketCloseStatus.NormalClosure, null, CancellationToken.None);
                    }

                }).Start();
            }
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

}

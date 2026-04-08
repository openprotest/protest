using System.Collections.Generic;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Protest.Http;

namespace Protest.Tools;

internal static class TraceRoute {

    static readonly byte[] ICMP_PAYLOAD = "0123456789abcdef"u8.ToArray();
    public static async Task WebSocketHandler(HttpListenerContext ctx) {
        if (!Auth.IsAuthenticatedAndAuthorized(ctx, ctx.Request.Url.AbsolutePath)) {
            ctx.Response.Close();
            return;
        }

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

        Task traceTask = null;
        using CancellationTokenSource cts = new CancellationTokenSource();
        using SemaphoreSlim writeSemaphore = new SemaphoreSlim(1, 1);

        try {
            while (ws.State == WebSocketState.Open) {
                byte[] buff = new byte[2048];
                WebSocketReceiveResult receiveResult = await ws.ReceiveAsync(new ArraySegment<byte>(buff), cts.Token);

                if (!Auth.IsAuthenticatedAndAuthorized(ctx, ctx.Request.Url.AbsolutePath)) {
                    await ws.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, null, cts.Token);
                    return;
                }

                if (receiveResult.MessageType == WebSocketMessageType.Close) {
                    await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, cts.Token);
                    break;
                }

                string hostname = Encoding.UTF8.GetString(buff, 0, receiveResult.Count);
                hostname = hostname.Trim();
                if (hostname.Length == 0) {
                    await ws.SendAsync(Data.CODE_INVALID_ARGUMENT, WebSocketMessageType.Text, true, cts.Token);
                    continue;
                }

                const short timeout = 2_000; //2s
                const short ttl = 30;

                traceTask = Task.Run(async () => {
                    List<IPAddress> ipList = new List<IPAddress>();
                    string lastAddress = String.Empty;

                    using Ping p = new Ping();

                    for (short i = 1; i < ttl; i++) {
                        if (cts.Token.IsCancellationRequested || ws.State != WebSocketState.Open) break;
                        StringBuilder builder = new StringBuilder();
                        builder.Append(hostname);
                        builder.Append((char)127);

                        try {
                            PingReply reply = p.Send(hostname, timeout, ICMP_PAYLOAD, new PingOptions(i, true));

                            if (reply.Status == IPStatus.Success || reply.Status == IPStatus.TtlExpired) {
                                if (lastAddress == reply.Address.ToString()) {
                                    break;
                                }

                                lastAddress = reply.Address.ToString();

                                builder.Append(lastAddress);
                                builder.Append((char)127);
                                builder.Append(reply.RoundtripTime);

                                ipList.Add(reply.Address);
                            }
                            else if (reply.Status == IPStatus.TimedOut) {
                                builder.Append("Timed out");
                            }
                            else {
                                break;
                            }
                        }
                        catch (Exception ex) {
                            Logger.Error(ex);
                            break;
                        }

                        try {
                            string result = builder.ToString();
                            await writeSemaphore.WaitAsync(cts.Token);
                            await ws.SendAsync(new ArraySegment<byte>(Encoding.UTF8.GetBytes(result), 0, result.Length), WebSocketMessageType.Text, true, cts.Token);
                        }
                        finally {
                            writeSemaphore.Release();
                        }
                    }

                    List<Task<string>> tasks = new List<Task<string>>(ipList.Count);
                    for (int j = 0; j < ipList.Count; j++) {
                        tasks.Add(Protocols.Dns.NativeReverseDnsLookupAsync(ipList[j]));
                    }

                    string[] hostnameArray = await Task.WhenAll(tasks);
                    StringBuilder hostnamesBuilder = new StringBuilder($"[hostnames]{(char)127}{hostname}{(char)127}");
                    for (int i = 0; i < hostnameArray.Length; i++) {
                        if (hostnameArray[i].Length > 0 && hostnameArray[i] != ipList[i].ToString()) {
                            hostnamesBuilder.Append($"{ipList[i]}{(char)127}{hostnameArray[i]}{(char)127}");
                        }
                    }

                    string hostnames = hostnamesBuilder.ToString();
                    if (hostnames.EndsWith(((char)127).ToString())) {
                        hostnames = hostnames[..^1];
                    }

                    try {
                        await writeSemaphore.WaitAsync(cts.Token);
                        await ws.SendAsync(new ArraySegment<byte>(Encoding.UTF8.GetBytes(hostnames), 0, hostnames.Length), WebSocketMessageType.Text, true, cts.Token);

                        byte[] over = Encoding.UTF8.GetBytes($"over{((char)127)}{hostname}");
                        await ws.SendAsync(new ArraySegment<byte>(over, 0, over.Length), WebSocketMessageType.Text, true, cts.Token);
                    }
                    finally {
                        writeSemaphore.Release();
                    }
                });
            }
        }
        catch (WebSocketException ex) when (ex.WebSocketErrorCode == WebSocketError.ConnectionClosedPrematurely) {
            return;
        }
        catch (WebSocketException ex) when (ex.WebSocketErrorCode != WebSocketError.ConnectionClosedPrematurely) { }
        catch (Exception ex) {
            Logger.Error(ex);
        }

        cts.Cancel();

        if (traceTask is not null) {
            try {
                await traceTask;
            }
            catch (OperationCanceledException) { } //ignored: task was canceled as part of shutdown
#if DEBUG
            catch (Exception ex) {
                Logger.Error(ex);
            }
#endif
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

}

using System.Net.WebSockets;
using System.Net;
using System.Text;
using System.Threading;
using System.Collections.Concurrent;
using System.Diagnostics.CodeAnalysis;
using System.Runtime.Versioning;
using System.Net.NetworkInformation;
using System.Management;
using System.Collections.Generic;
using System.Data;
using Protest.Http;

namespace Protest.Tools;

internal class Oversight {
    private static async void WsWriteText(WebSocket ws, [StringSyntax(StringSyntaxAttribute.Json)] string text) {
        if (ws.State != WebSocketState.Open) { return; }
        await ws.SendAsync(new ArraySegment<byte>(Encoding.UTF8.GetBytes(text), 0, text.Length), WebSocketMessageType.Text, true, CancellationToken.None);
    }
    private static async void WsWriteText(WebSocket ws, byte[] bytes) {
        if (ws.State != WebSocketState.Open) { return; }
        await ws.SendAsync(new ArraySegment<byte>(bytes, 0, bytes.Length), WebSocketMessageType.Text, true, CancellationToken.None);
    }

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
            byte[] buff = new byte[2048];
            WebSocketReceiveResult receiveResult = await ws.ReceiveAsync(new ArraySegment<byte>(buff), CancellationToken.None);
            string file = Encoding.Default.GetString(buff, 0, receiveResult.Count);

            if (!DatabaseInstances.devices.dictionary.TryGetValue(file, out Database.Entry entry) ||
                !entry.attributes.TryGetValue("ip", out Database.Attribute ipAttribute) ||
                !entry.attributes.TryGetValue("hostname", out Database.Attribute hostnameAttribute)) {
                await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, CancellationToken.None);
                return;
            }

            string target;
            if (ipAttribute?.value.Length > 0) {
                target = ipAttribute?.value.Split(";")[0].Trim();
            }
            else if (hostnameAttribute?.value.Length > 0) {
                target = hostnameAttribute?.value.Split(";")[0].Trim();
            }
            else {
                WsWriteText(ws, "{\"loglevel\":\"error\",\"text\":\"No IP or hostname\"}"u8.ToArray());
                await ws.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, null, CancellationToken.None);
                return;
            }

            object sendSync = new object();
            bool paused = false;
            bool ping = false;
            bool cpu = false;
            bool cores = false;
            int interval = 500;
            ConcurrentDictionary<string, string> wmiQueries = new ConcurrentDictionary<string, string>();

            new Thread(() => { //icmp thread
                while (ws.State == WebSocketState.Open) {
                    if (paused) {
                        Thread.Sleep(interval);
                        continue;
                    }

                    long startTime = DateTime.UtcNow.Ticks;

                    if (ping) {
                        long icmpResult = DoPing(target, Math.Min(interval, 1000));
                        lock (sendSync) {
                            WsWriteText(ws, $"{{\"result\":\"ping\",\"value\":{icmpResult}}}");
                        }
                    }

                    long elapsedTime = (DateTime.UtcNow.Ticks - startTime) / 10_000;
                    int calculatedInterval = (int)(interval - elapsedTime);
                    if (calculatedInterval > 0) {
                        Thread.Sleep(calculatedInterval);
                    }
                }
            }).Start();

            new Thread(() => { //wmi thread
                ManagementScope scope = null;
                if (OperatingSystem.IsWindows()) {
                    new Thread(() => {
                        Thread.Sleep(2000);
                        if (scope is null) {
                            lock (sendSync) {
                                WsWriteText(ws, "{\"loglevel\":\"warning\",\"text\":\"Waiting for WMI\"}"u8.ToArray());
                            }
                        }
                    }).Start();

                    scope = Protocols.Wmi.Scope(target);

                    if (scope is null || !scope.IsConnected) {
                        lock (sendSync) {
                            WsWriteText(ws, $"{{\"loglevel\":\"error\",\"text\":\"Failed to established WMI connection with {target}\"}}");
                        }
                        return;
                    }
                }

                lock (sendSync) {
                    WsWriteText(ws, "{\"loglevel\":\"info\",\"text\":\"WMI connection established\"}"u8.ToArray());
                }

                while (ws.State == WebSocketState.Open) {
                    if (paused) {
                        Thread.Sleep(interval);
                        continue;
                    }

                    long startTime = DateTime.UtcNow.Ticks;

                    if (OperatingSystem.IsWindows()) {
                        if (cpu || cores) {
                            byte[] cpuResult = DoCpuCores(scope, cores);
                            if (cpu && cpuResult is not null) {
                                lock (sendSync) {
                                    WsWriteText(ws, $"{{\"result\":\"cpu\",\"value\":{cpuResult[0]}}}");
                                }
                            }
                            if (cores && cpuResult is not null) {
                                lock (sendSync) {
                                    WsWriteText(ws, $"{{\"result\":\"cores\",\"value\":[{String.Join(",", cpuResult.Skip(1).ToArray())}]}}");
                                }
                            }
                        }

                        DoWmi(scope, wmiQueries);
                    }

                    long elapsedTime = (DateTime.UtcNow.Ticks - startTime) / 10_000;
                    int calculatedInterval = (int)(interval - elapsedTime);
                    if (calculatedInterval > 0) {
                        Thread.Sleep(calculatedInterval);
                    }
                }
            }).Start();

            while (ws.State == WebSocketState.Open) {
                receiveResult = await ws.ReceiveAsync(new ArraySegment<byte>(buff), CancellationToken.None);

                if (!Auth.IsAuthenticatedAndAuthorized(ctx, "")) {
                    await ws.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, null, CancellationToken.None);
                    return;
                }

                if (receiveResult.MessageType == WebSocketMessageType.Close) {
                    lock (sendSync) {
                        ws.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, CancellationToken.None);
                    }
                    break;
                }

                string msg = Encoding.Default.GetString(buff, 0, receiveResult.Count);
                string[] split = msg.Split("=");
                string value = (split.Length > 1) ? split[1] : null;

                switch (split[0]) {
                case "start": paused = false; break;
                case "pause": paused = true; break;

                case "interval"  : _ = int.TryParse(value, out interval); break;
                case "ping"      : ping = value == "true"; break;
                case "cpu"       : cpu = value == "true"; break;
                case "cores"     : cores = value == "true"; break;
                case "processes" : break;
                case "addwmi"    : break;
                case "removewmi" : break;
                }
            }
        }
        catch (WebSocketException ex) when (ex.WebSocketErrorCode == WebSocketError.ConnectionClosedPrematurely) {
            return;
        }
        catch (WebSocketException ex) when (ex.WebSocketErrorCode != WebSocketError.ConnectionClosedPrematurely) {
            Logger.Error(ex);
        }
        catch (Exception ex) {
            Logger.Error(ex);
        }
        finally {
            if (ws.State == WebSocketState.Open) {
                await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, CancellationToken.None);
            }
        }
    }

    private static long DoPing(string host, int timeout) {
        Ping p = new Ping();
        try {
            PingReply reply = p.Send(host, timeout);

            return (int)reply.Status switch {
                (int)IPStatus.DestinationUnreachable or
                (int)IPStatus.DestinationHostUnreachable or
                (int)IPStatus.DestinationNetworkUnreachable => -1,
                (int)IPStatus.Success => reply.RoundtripTime,
                11050 => -1,
                _ => -1,
            };
        }
        catch (ArgumentException) {
            return -1;
        }
        catch (PingException) {
            return -1;
        }
        catch (Exception) {
            return -1;
        }
        finally {
            p.Dispose();
        }
    }

    [SupportedOSPlatform("windows")]
    private static byte[] DoCpuCores(ManagementScope scope, bool getCores) {
        List<byte> cores = new List<byte>();

        using ManagementObjectCollection perfTotal = new ManagementObjectSearcher(scope, new SelectQuery("SELECT PercentIdleTime FROM Win32_PerfFormattedData_PerfOS_Processor WHERE Name = '_Total'")).Get();
        IEnumerable<ManagementObject> perfTotalEnum = perfTotal.Cast<ManagementObject>();
        if (perfTotalEnum is null) { return null; }
        foreach (ManagementObject o in perfTotalEnum) {
            if (o is null) continue;
            ulong idle = (ulong)o!.GetPropertyValue("PercentIdleTime");
            cores.Add((byte)(100 - idle));
        }

        if (getCores) {
            using ManagementObjectCollection perf = new ManagementObjectSearcher(scope, new SelectQuery("SELECT PercentIdleTime FROM Win32_PerfFormattedData_PerfOS_Processor WHERE Name != '_Total'")).Get();
            IEnumerable<ManagementObject> perfEnum = perf.Cast<ManagementObject>();
            //if (perfEnum is null) { return null; }
            foreach (ManagementObject o in perfEnum) {
                if (o is null) continue;
                ulong idle = (ulong)o!.GetPropertyValue("PercentIdleTime");
                cores.Add((byte)(100 - idle));
            }
        }

        return cores.ToArray();
    }

    [SupportedOSPlatform("windows")]
    private static byte[] DoWmi(ManagementScope scope, ConcurrentDictionary<string, string> queries) {
        return null;
    }

}

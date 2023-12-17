using System.Net.WebSockets;
using System.Net;
using System.Text;
using System.Threading;
using System.Collections.Concurrent;
using System.Diagnostics.CodeAnalysis;
using System.Runtime.Versioning;
using Protest.Http;
using System.Net.NetworkInformation;
using System.Management;
using System.Collections.Generic;

namespace Protest.Tools;

internal class Oversight {
    private static void WsWriteText(WebSocket ws, [StringSyntax(StringSyntaxAttribute.Json)] string text) {
        WsWriteText(ws, Encoding.UTF8.GetBytes(text));
    }
    private static async void WsWriteText(WebSocket ws, byte[] bytes) {
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
                WsWriteText(ws, "{\"loglevel\":\"error\",\"text\":\"No IP or hostname\"}");
                await ws.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, null, CancellationToken.None);
                return;
            }

            bool paused = false;
            bool ping = false;
            bool cpu = false;
            bool cores = false;
            int interval = 500;
            ConcurrentDictionary<string, string> wmiQueries = new ConcurrentDictionary<string, string>();

            new Thread(() => {
                ManagementScope scope = null;
                if (OperatingSystem.IsWindows()) {
                    new Thread(() => {
                        Thread.Sleep(2000);
                        if (scope is null) {
                            WsWriteText(ws, "{\"loglevel\":\"warning\",\"text\":\"Waiting WMI response\"}");
                        }
                    }).Start();

                    scope = Protocols.Wmi.Scope(target);

                    if (scope is not null && scope.IsConnected) {
                        WsWriteText(ws, "{\"loglevel\":\"info\",\"text\":\"WMI connection established\"}");
                    }
                    else {
                        WsWriteText(ws, $"{{\"loglevel\":\"error\",\"text\":\"Failed to established WMI connection with {target}\"}}");
                    }
                }

                while (ws.State == WebSocketState.Open) {
                    if (paused) {
                        Thread.Sleep(interval);
                        continue;
                    }

                    if (ping) {
                        string icmpResult = DoPing(target);
                        WsWriteText(ws, $"{{\"result\":\"ping\",\"value\":\"{icmpResult}\"}}");
                    }

                    if (OperatingSystem.IsWindows()) {
                        if (cpu || cores) {
                            byte[] cpuResult = DoCpuCores(scope);
                            if (cpu) {
                                WsWriteText(ws, $"{{\"result\":\"cpu\",\"value\":\"{cpuResult[0]}\"}}");
                            }
                            if (cores) {
                                WsWriteText(ws, $"{{\"result\":\"cores\",\"value\":[{String.Join(",", cpuResult.Skip(1).ToArray())}]}}");
                            }
                        }

                        DoWmi(scope , wmiQueries);
                    }

                    Thread.Sleep(interval);
                }
            }).Start();

            while (ws.State == WebSocketState.Open) {
                receiveResult = await ws.ReceiveAsync(new ArraySegment<byte>(buff), CancellationToken.None);

                if (!Auth.IsAuthenticatedAndAuthorized(ctx, "")) {
                    await ws.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, null, CancellationToken.None);
                    return;
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
        catch (Exception ex) {
            Logger.Error(ex);
        }
        finally {
            if (ws.State == WebSocketState.Open) {
                await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, CancellationToken.None);
            }
        }
    }

    private static string DoPing(string host) {
        Ping p = new Ping();
        try {
            PingReply reply = p.Send(host);

            return (int)reply.Status switch
            {
                (int)IPStatus.DestinationUnreachable or
                (int)IPStatus.DestinationHostUnreachable or
                (int)IPStatus.DestinationNetworkUnreachable => "Unreachable",

                (int)IPStatus.Success => reply.RoundtripTime.ToString(),
                11050 => "General failure",
                _ => reply.Status.ToString(),
            };
        }
        catch (ArgumentException) {
            return "Invalid address";
        }
        catch (PingException) {
            return "Ping error";
        }
        catch (Exception) {
            return "Unknown error";
        }
        finally {
            p.Dispose();
        }
    }

    [SupportedOSPlatform("windows")]
    private static byte[] DoCpuCores(ManagementScope scope) {
        List<byte> cores = new List<byte>();

        using ManagementObjectCollection perfTotal = new ManagementObjectSearcher(scope, new SelectQuery("SELECT PercentIdleTime FROM Win32_PerfFormattedData_PerfOS_Processor WHERE Name = '_Total'")).Get();
        foreach (ManagementObject o in perfTotal.Cast<ManagementObject>()) {
            if (o is null) continue;
            ulong idle = (ulong)o!.GetPropertyValue("PercentIdleTime");
            cores.Add((byte)(100 - idle));
        }

        using ManagementObjectCollection perf = new ManagementObjectSearcher(scope, new SelectQuery("SELECT PercentIdleTime FROM Win32_PerfFormattedData_PerfOS_Processor WHERE Name != '_Total'")).Get();
        foreach (ManagementObject o in perf.Cast<ManagementObject>()) {
            if (o is null) continue;
            ulong idle = (ulong)o!.GetPropertyValue("PercentIdleTime");
            cores.Add((byte)(100 - idle));
        }


        return cores.ToArray();
    }

    [SupportedOSPlatform("windows")]
    private static byte[] DoWmi(ManagementScope scope, ConcurrentDictionary<string, string> queries) {
        return null;
    }

}

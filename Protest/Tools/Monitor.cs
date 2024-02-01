using System.Net;
using System.Net.WebSockets;
using System.Threading;
using System.Collections.Concurrent;
using System.Diagnostics.CodeAnalysis;
using System.Runtime.Versioning;
using System.Net.NetworkInformation;
using System.Management;
using System.Collections.Generic;
using System.Data;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Protest.Http;

namespace Protest.Tools;

internal static class Monitor {
    public enum Action {
        none,
        start,
        pause,
        interval,
        addicmp,
        addwmi,
        addsnmp,
        remove
    }

    public struct Query {
        public Action action;
        public string value;
        public int id;
    }

    private static JsonSerializerOptions actionSerializerOptions;

    static Monitor() {
        actionSerializerOptions = new JsonSerializerOptions();
        actionSerializerOptions.Converters.Add(new ActionJsonConverter());
    }

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
            bool ping = true;
            bool cpu = true;
            bool cores = true;
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

                    if (scope is not null && !scope.IsConnected) {
                        WsWriteText(ws, $"{{\"loglevel\":\"error\",\"text\":\"WMI connection to {target} has been interrupted\"}}");
                        //TODO: reconnect WMI
                    }

                    long startTime = DateTime.UtcNow.Ticks;

                    if (OperatingSystem.IsWindows()) {
                        if (cpu || cores) {
                            byte[] cpuResult = DoCpuCores(scope, cores);
                            if (cpu && cpuResult is not null && cpuResult.Length > 0) {
                                lock (sendSync) {
                                    WsWriteText(ws, $"{{\"result\":\"cpu\",\"value\":{cpuResult[0]}}}");
                                }
                            }
                            if (cores && cpuResult is not null && cpuResult.Length > 0) {
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
                Console.WriteLine(msg);

                Query query = JsonSerializer.Deserialize<Query>(msg, actionSerializerOptions);
                Console.WriteLine("ac:" + query.action);
                Console.WriteLine("va:" + query.value);
                Console.WriteLine("id:" + query.id);

                switch (query.action) {
                case Action.start:
                    paused = false;
                    break;

                case Action.pause:
                    paused = true;
                    break;

                case Action.interval:
                    _ = int.TryParse(query.value, out interval);
                    break;

                case Action.addicmp:
                    break;
                
                case Action.addwmi:
                    break;
                
                case Action.addsnmp:
                    break;

                case Action.remove:
                    break;
                }
            }
        }
        catch (ManagementException ex) {
            Logger.Error(ex);
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
                (int)IPStatus.Success => reply.RoundtripTime,

                (int)IPStatus.DestinationUnreachable or
                (int)IPStatus.DestinationHostUnreachable or
                (int)IPStatus.DestinationNetworkUnreachable => -1,

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

        try {
            using ManagementObjectCollection perfTotal = new ManagementObjectSearcher(scope, new SelectQuery("SELECT PercentIdleTime FROM Win32_PerfFormattedData_PerfOS_Processor WHERE Name = '_Total'")).Get();
            IEnumerable<ManagementObject> perfTotalEnum = perfTotal.Cast<ManagementObject>();
            if (perfTotalEnum is null) { return null; }
            foreach (ManagementObject o in perfTotalEnum) {
                if (o is null)
                    continue;
                ulong idle = (ulong)o!.GetPropertyValue("PercentIdleTime");
                cores.Add((byte)(100 - idle));
            }

            if (getCores) {
                using ManagementObjectCollection perf = new ManagementObjectSearcher(scope, new SelectQuery("SELECT PercentIdleTime FROM Win32_PerfFormattedData_PerfOS_Processor WHERE Name != '_Total'")).Get();
                IEnumerable<ManagementObject> perfEnum = perf.Cast<ManagementObject>();
                //if (perfEnum is null) { return null; }
                foreach (ManagementObject o in perfEnum) {
                    if (o is null)
                        continue;
                    ulong idle = (ulong)o!.GetPropertyValue("PercentIdleTime");
                    cores.Add((byte)(100 - idle));
                }
            }

            return cores.ToArray();
        }
        catch {
            return null;
        }
    }

    [SupportedOSPlatform("windows")]
    private static byte[] DoWmi(ManagementScope scope, ConcurrentDictionary<string, string> queries) {
        try {

        }
        catch {}
        return null;
    }
}

file sealed class ActionJsonConverter : JsonConverter<Monitor.Query> {
    public override Monitor.Query Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) {
        Monitor.Query action = new Monitor.Query();

        while (reader.Read()) {
            if (reader.TokenType == JsonTokenType.EndObject) {
                break;
            }

            if (reader.TokenType == JsonTokenType.PropertyName) {
                string propertyName = reader.GetString();
                reader.Read();

                switch (propertyName) {
                case "action": action .action = Enum.Parse<Monitor.Action>(reader.GetString()); break;
                case "value" : action .value  = reader.GetString(); break;
                case "id"    : action .id     = reader.GetInt32(); break;
                }
            }
        }

        return action ;
    }

    public override void Write(Utf8JsonWriter writer, Monitor.Query value, JsonSerializerOptions options) {
        ReadOnlySpan<char> _action  = "action".AsSpan();
        ReadOnlySpan<char> _value = "value".AsSpan();
        ReadOnlySpan<char> _id    = stackalloc[] {'i', 'd'};

        writer.WriteStartObject();
        writer.WriteString(_action, value.action.ToString());
        writer.WriteString(_value, value.value);
        writer.WriteNumber(_id, value.id);
        writer.WriteEndObject();
    }
}

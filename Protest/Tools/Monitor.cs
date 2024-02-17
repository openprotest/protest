using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Data;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;
using System.Net;
using System.Net.WebSockets;
using System.Net.NetworkInformation;
using System.Management;
using System.Runtime.Versioning;
using System.Diagnostics.CodeAnalysis;
using System.DirectoryServices.ActiveDirectory;
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
        public int index;
        public Action action;
        public string value;
    }

    private static JsonSerializerOptions actionSerializerOptions;

    static Monitor() {
        actionSerializerOptions = new JsonSerializerOptions();
        actionSerializerOptions.Converters.Add(new ActionJsonConverter());
    }

    private static async Task WsWriteText(WebSocket ws, [StringSyntax(StringSyntaxAttribute.Json)] string text) {
        if (ws.State != WebSocketState.Open) { return; }
        await ws.SendAsync(new ArraySegment<byte>(Encoding.UTF8.GetBytes(text), 0, text.Length), WebSocketMessageType.Text, true, CancellationToken.None);
    }
    private static async Task WsWriteText(WebSocket ws, byte[] bytes) {
        if (ws.State != WebSocketState.Open) { return; }
        await ws.SendAsync(new ArraySegment<byte>(bytes, 0, bytes.Length), WebSocketMessageType.Text, true, CancellationToken.None);
    }

    public static async Task WebSocketHandler(HttpListenerContext ctx) {
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

        string target = null!;
        bool paused = false;
        bool ping = true;
        int interval = 500;
        ConcurrentDictionary<int, Query> wmi = new ConcurrentDictionary<int, Query>();
        ConcurrentDictionary<int, Query> snmp = new ConcurrentDictionary<int, Query>();
        byte[] buff = new byte[2048];

        try {
            WebSocketReceiveResult receiveResult = await ws.ReceiveAsync(new ArraySegment<byte>(buff), CancellationToken.None);
            string file = Encoding.Default.GetString(buff, 0, receiveResult.Count);

            if (!DatabaseInstances.devices.dictionary.TryGetValue(file, out Database.Entry entry) ||
                !entry.attributes.TryGetValue("ip", out Database.Attribute ipAttribute) ||
                !entry.attributes.TryGetValue("hostname", out Database.Attribute hostnameAttribute)) {
                await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, CancellationToken.None);
                return;
            }

            if (ipAttribute?.value.Length > 0) {
                target = ipAttribute?.value.Split(";")[0].Trim();
            }
            else if (hostnameAttribute?.value.Length > 0) {
                target = hostnameAttribute?.value.Split(";")[0].Trim();
            }
            else {
                await WsWriteText(ws, "{\"loglevel\":\"error\",\"text\":\"No IP or hostname\"}"u8.ToArray());
                await ws.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, null, CancellationToken.None);
                return;
            }
        }
        catch (WebSocketException) {
            return;
        }
        catch (Exception ex) {
            Logger.Error(ex);
        }

        Thread icmpThread = new Thread(async () => { //icmp thread
            Console.WriteLine("icmp thread started");

            while (ws.State == WebSocketState.Open) {
                if (paused) {
                    await Task.Delay(interval);
                    continue;
                }

                long startTime = DateTime.UtcNow.Ticks;

                if (ping) {
                    long icmpResult = HandlePing(target, Math.Min(interval, 1000));
                    await WsWriteText(ws, $"{{\"index\":0,\"value\":{icmpResult}}}");
                }

                long elapsedTime = (DateTime.UtcNow.Ticks - startTime) / 10_000;
                int calculatedInterval = (int)(interval - elapsedTime);
                if (calculatedInterval > 0) {
                    await Task.Delay(calculatedInterval);
                }
            }
        });

        Thread wmiThread = new Thread(async() => { //wmi thread
            Console.WriteLine("wmi thread started");

            ManagementScope scope = null;
            if (OperatingSystem.IsWindows()) {
                new Thread(async() => {
                    await Task.Delay(2000);
                    if (scope is null) {
                        await WsWriteText(ws, "{\"loglevel\":\"warning\",\"text\":\"Waiting for WMI\"}"u8.ToArray());
                    }
                }).Start();

                scope = Protocols.Wmi.Scope(target);

                if (scope is null || !scope.IsConnected) {
                    await WsWriteText(ws, $"{{\"loglevel\":\"error\",\"text\":\"Failed to established WMI connection with {target}\"}}");
                    return;
                }
            }

            await WsWriteText(ws, "{\"loglevel\":\"info\",\"text\":\"WMI connection established\"}"u8.ToArray());

            while (ws.State == WebSocketState.Open) {
                if (paused) {
                    await Task.Delay(interval);
                    continue;
                }

                if (scope is not null && !scope.IsConnected) {
                    await WsWriteText(ws, $"{{\"loglevel\":\"error\",\"text\":\"WMI connection to {target} has been interrupted\"}}");
                    //TODO: reconnect WMI
                }

                long startTime = DateTime.UtcNow.Ticks;

                if (OperatingSystem.IsWindows()) {
                    HandleWmi(scope, wmi);
                }

                long elapsedTime = (DateTime.UtcNow.Ticks - startTime) / 10_000;
                int calculatedInterval = (int)(interval - elapsedTime);
                if (calculatedInterval > 0) {
                    await Task.Delay(calculatedInterval);
                }
            }
        });

        Thread smtpThread = new Thread(async () => { //snmp thread
            Console.WriteLine("snmp thread started");

            while (ws.State == WebSocketState.Open) {
                if (paused) {
                    await Task.Delay(interval);
                    continue;
                }

                long startTime = DateTime.UtcNow.Ticks;

                if (OperatingSystem.IsWindows()) {
                    HandleSnmp(snmp);
                }

                long elapsedTime = (DateTime.UtcNow.Ticks - startTime) / 10_000;
                int calculatedInterval = (int)(interval - elapsedTime);
                if (calculatedInterval > 0) {
                    await Task.Delay(calculatedInterval);
                }
            }
        });

        icmpThread.Start();


        try {
            while (ws.State == WebSocketState.Open) {
                WebSocketReceiveResult receiveResult = await ws.ReceiveAsync(new ArraySegment<byte>(buff), CancellationToken.None);

                if (!Auth.IsAuthenticatedAndAuthorized(ctx, "")) {
                    await ws.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, null, CancellationToken.None);
                    return;
                }

                if (receiveResult.MessageType == WebSocketMessageType.Close) {
                    await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, CancellationToken.None);
                    break;
                }

                string msg = Encoding.Default.GetString(buff, 0, receiveResult.Count);
                Query query = JsonSerializer.Deserialize<Query>(msg, actionSerializerOptions);

                switch (query.action) {
                case Action.start:
                    paused = false;
                    if (!icmpThread.IsAlive) { icmpThread.Start(); }
                    break;

                case Action.pause:
                    paused = true;
                    break;

                case Action.interval:
                    _ = int.TryParse(query.value, out interval);
                    break;
                
                case Action.addwmi:
                    wmi.TryAdd(query.index, query);
                    if (!wmiThread.IsAlive) { wmiThread.Start(); }
                    break;

                case Action.addsnmp:
                    snmp.TryAdd(query.index, query);
                    if (!smtpThread.IsAlive) { smtpThread.Start(); }
                    break;

                case Action.remove:
                    break;
                }
            }
        }
        catch (JsonException) {
            return;
        }
        catch (WebSocketException ex) when (ex.WebSocketErrorCode == WebSocketError.ConnectionClosedPrematurely) {
            return;
        }
        catch (WebSocketException ex) when (ex.WebSocketErrorCode != WebSocketError.ConnectionClosedPrematurely) {
            return;
        }
        catch (ManagementException ex) {
            Logger.Error(ex);
        }
        catch (Exception ex) {
            Logger.Error(ex);
        }

        try {
            if (ws.State == WebSocketState.Open) {
                await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, CancellationToken.None);
            }
        } catch {}
    }

    private static long HandlePing(string host, int timeout) {
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
    private static byte[] HandleWmi(ManagementScope scope, ConcurrentDictionary<int, Query> queries) {
        try {

            foreach (Query query in queries.Values) {
                using ManagementObjectCollection moc = new ManagementObjectSearcher(scope, new SelectQuery(query.value)).Get();
                //TODO:
            }

        }
        catch { }

        return null;
    }

    private static byte[] HandleSnmp(ConcurrentDictionary<int, Query> queries) {
        try {
            foreach (Query query in queries.Values) {
                //TODO:
            }
        }
        catch { }

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
                case "action": action.action = Enum.Parse<Monitor.Action>(reader.GetString()); break;
                case "value" : action.value  = reader.GetString(); break;
                case "index" : action.index  = reader.GetInt32(); break;
                }
            }
        }

        return action ;
    }

    public override void Write(Utf8JsonWriter writer, Monitor.Query value, JsonSerializerOptions options) {
        ReadOnlySpan<char> _action = "action".AsSpan();
        ReadOnlySpan<char> _value  = "value".AsSpan();
        ReadOnlySpan<char> _index  = "index".AsSpan();

        writer.WriteStartObject();
        writer.WriteString(_action, value.action.ToString());
        writer.WriteString(_value, value.value);
        writer.WriteNumber(_index, value.index);
        writer.WriteEndObject();
    }
}
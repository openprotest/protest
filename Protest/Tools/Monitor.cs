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

    public struct Answer {
        public int index;
        public Dictionary<string, List<string>> data;
    }

    private static JsonSerializerOptions actionSerializerOptions;
    private static JsonSerializerOptions answerSerializerOptions;

    static Monitor() {
        actionSerializerOptions = new JsonSerializerOptions();
        actionSerializerOptions.Converters.Add(new ActionJsonConverter());

        answerSerializerOptions = new JsonSerializerOptions();
        answerSerializerOptions.Converters.Add(new AnswerJsonConverter());
    }

    private static async Task WsWriteText(WebSocket ws, [StringSyntax(StringSyntaxAttribute.Json)] string text) {
        if (ws.State != WebSocketState.Open) { return; }
        await ws.SendAsync(new ArraySegment<byte>(Encoding.UTF8.GetBytes(text), 0, text.Length), WebSocketMessageType.Text, true, CancellationToken.None);
    }
    private static async Task WsWriteText(WebSocket ws, byte[] bytes) {
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

        string target = null!;
        bool paused = false;
        bool ping = true;
        int interval = 1000;
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

        Func<Task> IcmpDelegate = async () => {
            while (ws.State == WebSocketState.Open) {
                if (paused) {
                    await Task.Delay(interval);
                    continue;
                }

                long startTime = DateTime.UtcNow.Ticks;

                if (ping) {
                    long icmpResult = HandlePing(target, Math.Min(interval, 1000));
                    await WsWriteText(ws, $"{{\"index\":0,\"data\":{icmpResult}}}");
                }

                long elapsedTime = (DateTime.UtcNow.Ticks - startTime) / 10_000;
                int calculatedInterval = (int)(interval - elapsedTime);
                if (calculatedInterval > 0) {
                    await Task.Delay(calculatedInterval);
                }
            }
        };

        Func<Task> WmiDelegate = async () => {
            ManagementScope scope = null;
            if (!OperatingSystem.IsWindows()) {
                await WsWriteText(ws, "{\"loglevel\":\"warning\",\"text\":\"WMI is not supported\"}"u8.ToArray());
                return;
            }

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
                    await HandleWmi(ws, scope, wmi);
                }

                long elapsedTime = (DateTime.UtcNow.Ticks - startTime) / 10_000;
                int calculatedInterval = (int)(interval - elapsedTime);
                if (calculatedInterval > 0) {
                    await Task.Delay(calculatedInterval);
                }
            }
        };

        Func<Task> SnmpDelegate = async () => {
            while (ws.State == WebSocketState.Open) {
                if (paused) {
                    await Task.Delay(interval);
                    continue;
                }

                long startTime = DateTime.UtcNow.Ticks;

                if (OperatingSystem.IsWindows()) {
                    HandleSnmp(ws, snmp);
                }

                long elapsedTime = (DateTime.UtcNow.Ticks - startTime) / 10_000;
                int calculatedInterval = (int)(interval - elapsedTime);
                if (calculatedInterval > 0) {
                    await Task.Delay(calculatedInterval);
                }
            }
        };

        Thread icmpThread = null;
        Thread wmiThread = null;
        Thread smtpThread = null;

        icmpThread = new Thread(() => IcmpDelegate());
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
                    if (icmpThread is null) {
                        icmpThread = new Thread(() => IcmpDelegate());
                        icmpThread.Start();
                    }
                    break;

                case Action.pause:
                    paused = true;
                    break;

                case Action.interval:
                    int newInterval;
                    _ = int.TryParse(query.value, out newInterval);
                    interval = Math.Max(newInterval, 100);
                    break;
                
                case Action.addwmi:
                    wmi.TryAdd(query.index, query);
                    if (wmiThread is null) {
                        wmiThread = new Thread(() => WmiDelegate());
                        wmiThread.Start();
                    }
                    break;

                case Action.addsnmp:
                    snmp.TryAdd(query.index, query);
                    if (smtpThread is null) {
                        smtpThread = new Thread(() => SnmpDelegate());
                        smtpThread.Start();
                    }
                    break;

                case Action.remove:
                    //TODO:
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
            Logger.Error(ex);
        }
        catch (ManagementException ex) {
            Logger.Error(ex);
        }

        try {
            if (ws.State == WebSocketState.Open) {
                await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, CancellationToken.None);
            }
        } catch { }
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
    private static async Task HandleWmi(WebSocket ws, ManagementScope scope, ConcurrentDictionary<int, Query> queries) {
        foreach (Query query in queries.Values) {
            try {
                await HandleWmiQuery(ws, scope, query);
            }
            catch  { }
        }
    }

    [SupportedOSPlatform("windows")]
    async private static Task HandleWmiQuery(WebSocket ws, ManagementScope scope, Query query) {
        using ManagementObjectCollection moc = new ManagementObjectSearcher(scope, new SelectQuery(query.value)).Get();
        Dictionary<string, List<string>> data = new Dictionary<string, List<string>>();

        foreach (ManagementObject o in moc.Cast<ManagementObject>()) {
            foreach (PropertyData p in o.Properties) {
                string name = p.Name.ToString();
                string value;
                
                try {
                    value = Protocols.Wmi.FormatProperty(p);
                }
                catch {
                    value = string.Empty;
                }

                if (!data.ContainsKey(name)) {
                    data.Add(name, new List<string>());
                }

                data[name].Add(value);
            }
        }

        Answer answer = new Answer() {
            data = data,
            index = query.index
        };

        byte[] bytes = JsonSerializer.SerializeToUtf8Bytes<Answer>(answer, answerSerializerOptions);
        await WsWriteText(ws, bytes);

        data.Clear();
    }

    private static void HandleSnmp(WebSocket ws, ConcurrentDictionary<int, Query> queries) {
        try {
            foreach (Query query in queries.Values) {
                HandleSnmpQuery(query.value);
            }
        }
        catch { }
    }

    private static void HandleSnmpQuery(string query) {
        //TODO:
    }
}

file sealed class AnswerJsonConverter : JsonConverter<Monitor.Answer> {
    public override Monitor.Answer Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) {
        Monitor.Answer answer = new Monitor.Answer();

        if (reader.TokenType != JsonTokenType.StartObject) {
            throw new JsonException("Expected start of object");
        }

        reader.Read();

        while (reader.TokenType == JsonTokenType.PropertyName) {
            string propertyName = reader.GetString();

            reader.Read();

            switch (propertyName) {
            case "index":
                answer.index = reader.GetInt32();
                break;

            case "data":
                reader.Read();
                while (reader.TokenType != JsonTokenType.EndObject) {
                    string key = reader.GetString();
                    reader.Read();
                    List<string> values = new List<string>();
                    while (reader.Read() && reader.TokenType != JsonTokenType.EndArray) {
                        values.Add(reader.GetString());
                    }
                    answer.data[key] = values;

                    reader.Read();
                }
                break;

            default:
                break;
            }

            reader.Read();
        }

        if (reader.TokenType != JsonTokenType.EndObject) {
            throw new JsonException();
        }

        return answer;
    }

    public override void Write(Utf8JsonWriter writer, Monitor.Answer value, JsonSerializerOptions options) {
        ReadOnlySpan<char> index = "index".AsSpan();
        ReadOnlySpan<char> _data  = "data".AsSpan();

        writer.WriteStartObject();
        writer.WriteNumber(index, value.index);

        writer.WritePropertyName(_data);
        writer.WriteStartObject();
        foreach (KeyValuePair<string, List<string>> pair in value.data) {
            writer.WritePropertyName(pair.Key.ToLower());
            writer.WriteStartArray();
            for (int i = 0; i < pair.Value.Count; i++) {
                writer.WriteStringValue(pair.Value[i]);
            }
            writer.WriteEndArray();
        }
        writer.WriteEndObject();

        writer.WriteEndObject();
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
                case "value" : action.value  = reader.GetString(); break;
                case "index" : action.index  = reader.GetInt32(); break;

                case "action":
                    //action.action = Enum.Parse<Monitor.Action>(reader.GetString()); 
                    Enum.TryParse<Monitor.Action>(reader.GetString(), true, out Monitor.Action act);
                    action.action = act;
                    break;
                }
            }
        }

        return action;
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

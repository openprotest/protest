using System.Collections.Concurrent;
using System.Collections.Generic;
using System.DirectoryServices.ActiveDirectory;
using System.IO;
using System.Net;
using System.Net.WebSockets;
using System.Runtime.CompilerServices;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;
using System.Xml.Linq;
using Microsoft.AspNetCore.Http;
using Protest.Http;
using Protest.Workers;

namespace Protest.Proxy;

internal static class ReverseProxy {

    public enum ProxyProtocol {
        TCP,
        UDP,
        HTTP,
        HTTPS
    }

    public struct ReverseProxyObject {
        public Guid guid;
        public string name;
        public ProxyProtocol protocol;
        public string certificate;
        public string password;
        public string proxyaddr;
        public int proxyport;
        public string destaddr;
        public int destport;
        public bool autostart;
    }

    public static ConcurrentDictionary<string, ReverseProxyAbstract> running = new ConcurrentDictionary<string, ReverseProxyAbstract>();

    private static readonly JsonSerializerOptions serializerOptions;
    private static readonly JsonSerializerOptions serializerOptionsWithPassword;

    static ReverseProxy() {
        serializerOptions = new JsonSerializerOptions();
        serializerOptions.Converters.Add(new ReverseProxyObjectJsonConverter(true));

        serializerOptionsWithPassword = new JsonSerializerOptions();
        serializerOptionsWithPassword.Converters.Add(new ReverseProxyObjectJsonConverter(false));
    }

    private static async Task WsWriteText(WebSocket ws, string data) {
        if (ws.State == WebSocketState.Open) {
            await ws.SendAsync(new ArraySegment<byte>(Encoding.ASCII.GetBytes(data), 0, data.Length), WebSocketMessageType.Text, true, CancellationToken.None);
        }
    }
    private static async Task WsWriteText(WebSocket ws, byte[] data) {
        if (ws.State == WebSocketState.Open) {
            await ws.SendAsync(new ArraySegment<byte>(data, 0, data.Length), WebSocketMessageType.Text, true, CancellationToken.None);
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

        //byte[] buff = new byte[1024];

        try {
            //WebSocketReceiveResult receiveResult = await ws.ReceiveAsync(new ArraySegment<byte>(buff), CancellationToken.None);
            //string msgsdfsdf = Encoding.Default.GetString(buff, 0, receiveResult.Count);
            
            await Task.Delay(1_000);

            await WsWriteText(ws, GetRunningProxies());

            while (true) {
                await WsWriteText(ws, GetTraffic());
                await Task.Delay(5_000);
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

    private static byte[] GetTraffic() {
        StringBuilder builder = new StringBuilder();

        builder.Append("{\"traffic\":");
        builder.Append('[');

        bool first = true;
        foreach (ReverseProxyAbstract proxy in running.Values) {
            if (!first) { builder.Append(','); }
            builder.Append($"{{\"{proxy.guid}\":[{proxy.totalDownstream},{proxy.totalUpstream}]}}");
            first = false;
        }
        builder.Append(']');
        builder.Append('}');

        return Encoding.UTF8.GetBytes(builder.ToString());
    }

    private static byte[] GetRunningProxies() {
        StringBuilder builder = new StringBuilder();

        builder.Append("{\"running\":");
        builder.Append('[');

        bool first = true;
        foreach (string key in running.Keys) {
            if (!first) { builder.Append(','); }
            builder.Append($"\"{key}\"");
            first = false;
        }
        builder.Append(']');
        builder.Append('}');

        return Encoding.UTF8.GetBytes(builder.ToString());
    }

    public static byte[] List() {
        try {
            DirectoryInfo directory = new DirectoryInfo(Data.DIR_REVERSE_PROXY);
            if (!directory.Exists) return "{}"U8.ToArray();

            FileInfo[] files = directory.GetFiles();

            StringBuilder builder = new StringBuilder();
            builder.Append("{\"data\":{");

            bool first = true;
            foreach (FileInfo file in files) {
                try {
                    string fileContent = File.ReadAllText(file.FullName);
                    ReverseProxyObject obj = JsonSerializer.Deserialize<ReverseProxyObject>(fileContent, serializerOptions);
                    string json = JsonSerializer.Serialize<ReverseProxyObject>(obj, serializerOptions);

                    if (!first) { builder.Append(','); }
                    builder.Append($"\"{file.Name}\":");
                    builder.Append(json);
                }
                catch {
                    continue;
                }

                first = false;
            }

            builder.Append("},");

            builder.Append($"\"length\":{files.Length}");

            builder.Append('}');

            return Encoding.UTF8.GetBytes(builder.ToString());

        }
        catch {
            return Data.CODE_FAILED.ToArray();
        }
    }

    public static byte[] Create(HttpListenerContext ctx, Dictionary<string, string> parameters, string origin) {
        try {
            DirectoryInfo directoryInfo = new DirectoryInfo(Data.DIR_REVERSE_PROXY);
            if (!directoryInfo.Exists) {
                directoryInfo.Create();
            }
        }
        catch {
            return Data.CODE_FAILED.ToArray();
        }

        try {
            using StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding);
            string payload = reader.ReadToEnd();

            ReverseProxyObject entry = JsonSerializer.Deserialize<ReverseProxyObject>(payload, serializerOptionsWithPassword);
            if (entry.guid == Guid.Empty) {
                entry.guid = Guid.NewGuid();
            }
            else if (String.IsNullOrEmpty(entry.password)
                    && File.Exists($"{Data.DIR_REVERSE_PROXY}{Data.DELIMITER}{entry.guid}")) {
                string oldFileContent = File.ReadAllText($"{Data.DIR_REVERSE_PROXY}{Data.DELIMITER}{entry.guid}");
                ReverseProxyObject oldEntry = JsonSerializer.Deserialize<ReverseProxyObject>(oldFileContent, serializerOptionsWithPassword);
                if (!String.IsNullOrEmpty(oldEntry.password)) {
                    entry.password = oldEntry.password;
                }
            }

            byte[] bytes = JsonSerializer.SerializeToUtf8Bytes(entry, serializerOptionsWithPassword);

            File.WriteAllBytes($"{Data.DIR_REVERSE_PROXY}{Data.DELIMITER}{entry.guid}", bytes);

            Logger.Action(origin, $"Create reverse proxy server: {entry.name}");

            return bytes;
        }
        catch {
            return Data.CODE_FAILED.ToArray();
        }
    }

    public static byte[] Delete(Dictionary<string, string> parameters, string origin) {
        return null;
    }

    public static byte[] Start(Dictionary<string, string> parameters, string origin) {
        if (!parameters.TryGetValue("guid", out string guid)) {
            return Data.CODE_FAILED.ToArray();
        }

        if (!running.TryAdd(guid, null!)) {
            return Data.CODE_FAILED.ToArray();
        }

        if (running.ContainsKey(guid)) {
            return "{\"error\":\"This proxy is already running\"}"u8.ToArray();
        }

        DirectoryInfo directory = new DirectoryInfo(Data.DIR_REVERSE_PROXY);
        if (!directory.Exists) {
            return Data.CODE_FAILED.ToArray();
        }

        ReverseProxyObject obj;
        try {
            string fileContent = File.ReadAllText($"{Data.DIR_REVERSE_PROXY}{Data.DELIMITER}{guid}");
            obj = JsonSerializer.Deserialize<ReverseProxyObject>(fileContent, serializerOptions);
            if (!obj.guid.Equals(new Guid(guid))) { return Data.CODE_FAILED.ToArray(); }
        }
        catch {
            return Data.CODE_FAILED.ToArray();
        }

        ReverseProxyAbstract proxy = obj.protocol switch {
            ProxyProtocol.TCP   => new TcpReverseProxy(obj.guid),
            ProxyProtocol.UDP   => new UdpReverseProxy(obj.guid),
            ProxyProtocol.HTTP  => new HttpReverseProxy(obj.guid),
            ProxyProtocol.HTTPS => new HttpReverseProxy(obj.guid),
            _=> new TcpReverseProxy(obj.guid)
        };

        try {
            IPEndPoint localEndpoint = new IPEndPoint(IPAddress.Parse(obj.proxyaddr), obj.proxyport);
            proxy.Start(localEndpoint, $"{obj.destaddr}:{obj.destport}", origin);
        }
        catch {
            return Data.CODE_FAILED.ToArray();
        }

        running.TryAdd(guid, proxy);

        return Data.CODE_OK.ToArray();
    }

    public static byte[] Stop(Dictionary<string, string> parameters, string origin) {
        if (!parameters.TryGetValue("guid", out string guid)) {
            return Data.CODE_FAILED.ToArray();
        }

        if (running.TryRemove(guid, out _)) {
            return Data.CODE_FAILED.ToArray();
        }

        if (!running.TryGetValue(guid, out ReverseProxyAbstract obj)) {
            return "{\"error\":\"This proxy is not running\"}"u8.ToArray();
        }

        if (obj.isRunning) { obj.Stop(origin); }

        return Data.CODE_OK.ToArray();
    }
}

file sealed class ReverseProxyObjectJsonConverter : JsonConverter<ReverseProxy.ReverseProxyObject> {
    private readonly bool ignorePasswords;

    public ReverseProxyObjectJsonConverter() {
        this.ignorePasswords = false;
    }

    public ReverseProxyObjectJsonConverter(bool ignorePasswords) {
        this.ignorePasswords = ignorePasswords;
    }

    public override ReverseProxy.ReverseProxyObject Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) {
        Guid guid = Guid.Empty;
        string name = null;
        ReverseProxy.ProxyProtocol protocol = ReverseProxy.ProxyProtocol.TCP;
        string certificate = null;
        string password = String.Empty;
        string proxyaddr = null;
        int proxyport = 0;
        string destaddr = null;
        int destport = 0;
        bool autostart = false;

        while (reader.Read()) {
            if (reader.TokenType == JsonTokenType.EndObject) {
                break;
            }

            if (reader.TokenType == JsonTokenType.PropertyName) {
                string propertyName = reader.GetString();
                reader.Read();

                switch (propertyName) {
                case "guid":
                    string guidString = reader.GetString();
                    if (!Guid.TryParse(guidString, out guid)) {
                        guid = Guid.Empty;
                    }
                    break;
                case "name"        : name        = reader.GetString();  break;
                case "protocol"    : protocol    = Enum.Parse<ReverseProxy.ProxyProtocol>(reader.GetString(), true); break;
                case "certificate" : certificate = reader.GetString();  break;
                case "password"    : password    = ignorePasswords ? String.Empty : reader.GetString(); break;
                case "proxyaddr"   : proxyaddr   = reader.GetString();  break;
                case "proxyport"   : proxyport   = reader.GetInt32();   break;
                case "destaddr"    : destaddr    = reader.GetString();  break;
                case "destport"    : destport    = reader.GetInt32();   break;
                case "autostart"   : autostart   = reader.GetBoolean(); break;
                }
            }
        }

        return new ReverseProxy.ReverseProxyObject {
            guid = guid,
            name = name,
            protocol = protocol,
            certificate = certificate,
            password = password,
            proxyaddr = proxyaddr,
            proxyport = proxyport,
            destaddr = destaddr,
            destport = destport,
            autostart = autostart
        };
    }

    public override void Write(Utf8JsonWriter writer, ReverseProxy.ReverseProxyObject value, JsonSerializerOptions options) {
        ReadOnlySpan<byte> _guid        = "guid"u8;
        ReadOnlySpan<byte> _name        = "name"u8;
        ReadOnlySpan<byte> _protocol    = "protocol"u8;
        ReadOnlySpan<byte> _certificate = "certificate"u8;
        ReadOnlySpan<byte> _password    = "password"u8;
        ReadOnlySpan<byte> _proxyaddr   = "proxyaddr"u8;
        ReadOnlySpan<byte> _proxyport   = "proxyport"u8;
        ReadOnlySpan<byte> _destaddr    = "destaddr"u8;
        ReadOnlySpan<byte> _destport    = "destport"u8;
        ReadOnlySpan<byte> _autostart   = "autostart"u8;

        writer.WriteStartObject();
        writer.WriteString(_guid, value.guid.ToString());
        writer.WriteString(_name, value.name);
        writer.WriteString(_protocol, value.protocol.ToString());
        writer.WriteString(_password, ignorePasswords ? String.Empty : value.password);
        writer.WriteString(_certificate, value.certificate);
        writer.WriteString(_proxyaddr, value.proxyaddr);
        writer.WriteNumber(_proxyport, value.proxyport);
        writer.WriteString(_destaddr, value.destaddr);
        writer.WriteNumber(_destport, value.destport);
        writer.WriteBoolean(_autostart, value.autostart);
        writer.WriteEndObject();
    }
}
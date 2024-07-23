using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using Protest.Http;


namespace Protest.Proxy;

internal abstract class ReverseProxy {

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
        public string proxyaddr;
        public int proxyport;
        public string destaddr;
        public int destport;
        public bool autostart;
    }

    public static ConcurrentDictionary<string, ReverseProxy> ReverseProxies = new ConcurrentDictionary<string, ReverseProxy>();

    private static JsonSerializerOptions serializerOptions;

    static ReverseProxy() {
        serializerOptions = new JsonSerializerOptions();
        serializerOptions.Converters.Add(new ReverseProxyObjectJsonConverter());
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

        byte[] buff = new byte[1024];

        try {
            WebSocketReceiveResult receiveResult = await ws.ReceiveAsync(new ArraySegment<byte>(buff), CancellationToken.None);
            string file = Encoding.Default.GetString(buff, 0, receiveResult.Count);

        }
        catch (WebSocketException) {

        }
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
                    string content= File.ReadAllText(file.FullName);
                    if (!first) { builder.Append(','); }
                    builder.Append($"\"{file.Name}\":");
                    builder.Append(content);
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

        using StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding);
        string payload = reader.ReadToEnd();

        try {
            ReverseProxyObject entry = JsonSerializer.Deserialize<ReverseProxyObject>(payload, serializerOptions);
            if (entry.guid == Guid.Empty) {
                entry.guid = Guid.NewGuid();
            }

            byte[] bytes = JsonSerializer.SerializeToUtf8Bytes(entry, serializerOptions);

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

    public ulong GetTotalUpstream { get; }
    public ulong GetTotalDownstream { get; }

    public virtual bool Start(IPEndPoint proxy, string destination) {
        return Start(proxy, destination, null, null);
    }

    public abstract bool Start(IPEndPoint proxy, string destination, string certificate, string password);
    public abstract bool Pause();
    public abstract bool Stop();
}

file sealed class ReverseProxyObjectJsonConverter : JsonConverter<ReverseProxy.ReverseProxyObject> {
    public override ReverseProxy.ReverseProxyObject Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) {
        Guid guid = Guid.Empty;
        string name = null;
        ReverseProxy.ProxyProtocol protocol = ReverseProxy.ProxyProtocol.TCP;
        string certificate = null;
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
                case "name":        name        = reader.GetString();  break;
                case "protocol":    protocol    = Enum.Parse<ReverseProxy.ProxyProtocol>(reader.GetString(), true); break;
                case "certificate": certificate = reader.GetString();  break;
                case "proxyaddr":   proxyaddr  = reader.GetString();  break;
                case "proxyport":   proxyport  = reader.GetInt32();   break;
                case "destaddr":    destaddr    = reader.GetString();  break;
                case "destport":    destport    = reader.GetInt32();   break;
                case "autostart":   autostart   = reader.GetBoolean(); break;
                }
            }
        }

        return new ReverseProxy.ReverseProxyObject {
            guid = guid,
            name = name,
            protocol = protocol,
            certificate = certificate,
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
        ReadOnlySpan<byte> _proxyaddr  = "proxyaddr"u8;
        ReadOnlySpan<byte> _proxyport  = "proxyport"u8;
        ReadOnlySpan<byte> _destaddr    = "destaddr"u8;
        ReadOnlySpan<byte> _destport    = "destport"u8;
        ReadOnlySpan<byte> _autostart   = "autostart"u8;

        writer.WriteStartObject();
        writer.WriteString(_guid, value.guid.ToString());
        writer.WriteString(_name, value.name);
        writer.WriteString(_protocol, value.protocol.ToString());
        writer.WriteString(_certificate, value.certificate);
        writer.WriteString(_proxyaddr, value.proxyaddr);
        writer.WriteNumber(_proxyport, value.proxyport);
        writer.WriteString(_destaddr, value.destaddr);
        writer.WriteNumber(_destport, value.destport);
        writer.WriteBoolean(_autostart, value.autostart);
        writer.WriteEndObject();
    }
}
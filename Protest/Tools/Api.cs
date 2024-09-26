using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.Tasks;

using Protest.Http;

namespace Protest.Tools;
internal static class Api {
    private static readonly object mutex;
    private static readonly ConcurrentDictionary<string, ulong> counter;
    private static readonly ConcurrentDictionary<string, ulong> traffic;
    private static readonly JsonSerializerOptions apiLinksSerializerOptions;

    private static ConcurrentDictionary<string, Link> links;

    public enum Permissions : byte {
        Users        = 0x01,
        Devices      = 0x02,
        Lifeline     = 0x04
    }

    public record Link {
        public Guid   guid;
        public string name;
        public string apikey;
        public bool   readOnly;
        public byte   permissions;
    }

    static Api() {
        mutex = new object();
        counter = new ConcurrentDictionary<string, ulong>();
        traffic = new ConcurrentDictionary<string, ulong>();

        apiLinksSerializerOptions = new JsonSerializerOptions();
        apiLinksSerializerOptions.Converters.Add(new ApiJsonConverter());

        Api.links = new ConcurrentDictionary<string, Link>(Load().ToDictionary(link => link.apikey));
    }

    internal static void HandleApiCall(HttpListenerContext ctx) {
        Dictionary<string, string> parameters = Listener.ParseQuery(ctx.Request.Url.Query);

        if (!parameters.TryGetValue("key", out string apiKey)
            || !Api.links.ContainsKey(apiKey)) {
            ctx.Response.StatusCode = (int)HttpStatusCode.Unauthorized;
            return;
        }

        if (!Api.links.TryGetValue(apiKey, out Link link)) {
            ctx.Response.StatusCode = (int)HttpStatusCode.Unauthorized;
            return;
        }

        if (!parameters.TryGetValue("call", out string call)) {
            ctx.Response.StatusCode = (int)HttpStatusCode.NotFound;
            return;
        }

        byte[] buffer;

        switch (call) {
        case "devices"  : buffer = HandleDevicesCall(ctx, parameters, link);  break;
        case "users"    : buffer = HandleUsersCall(ctx, parameters, link);    break;
        case "lifeline" : buffer = HandleLifelineCall(ctx, parameters, link); break;
        
        default:
            buffer = null;
            ctx.Response.StatusCode = (int)HttpStatusCode.NotFound;
            return;
        }

        if (buffer is not null) {
            ctx.Response.AddHeader("Length", buffer?.Length.ToString() ?? "0");
            ctx.Response.OutputStream.Write(buffer, 0, buffer.Length);
        }
    }

    internal static byte[] HandleDevicesCall(HttpListenerContext ctx, Dictionary<string, string> parameters, Link link) {
        if ((link.permissions & (byte)Permissions.Devices) == 0x00) {
            ctx.Response.StatusCode = (int)HttpStatusCode.Unauthorized;
            return null;
        }

        byte[] buffer = null;
        //TODO:

        ctx.Response.StatusCode = (int)HttpStatusCode.OK;
        return buffer;
    }

    internal static byte[] HandleUsersCall(HttpListenerContext ctx, Dictionary<string, string> parameters, Link link) {
        if ((link.permissions & (byte)Permissions.Users) == 0x00) {
            ctx.Response.StatusCode = (int)HttpStatusCode.Unauthorized;
            return null;
        }

        byte[] buffer = null;
        //TODO:

        ctx.Response.StatusCode = (int)HttpStatusCode.OK;
        return buffer;
    }

    internal static byte[] HandleLifelineCall(HttpListenerContext ctx, Dictionary<string, string> parameters, Link link) {
        if ((link.permissions & (byte)Permissions.Lifeline) == 0x00) {
            ctx.Response.StatusCode = (int)HttpStatusCode.Unauthorized;
            return null;
        }

        byte[] buffer = null;
        //TODO:

        ctx.Response.StatusCode = (int)HttpStatusCode.OK;
        return buffer;
    }

    internal static Link[] Load() {
        if (!File.Exists(Data.FILE_API_LINKS)) {
            return Array.Empty<Link>();
        }

        try {
            byte[] bytes;
            lock (mutex) {
                bytes = File.ReadAllBytes(Data.FILE_API_LINKS);
            }

            byte[] plain = Cryptography.Decrypt(bytes, Configuration.DB_KEY, Configuration.DB_KEY_IV);
            Link[] profiles = JsonSerializer.Deserialize<Link[]>(plain, apiLinksSerializerOptions);
            return profiles;
        }
        catch (Exception ex){
            Logger.Error(ex);
            return Array.Empty<Link>();
        }
    }

    internal static byte[] List() {
        return JsonSerializer.SerializeToUtf8Bytes(new {
            data = Api.links.Values.ToDictionary(
                link => link.guid.ToString(),
                link => new {
                    guid        = new { v = link.guid },
                    name        = new { v = Data.EscapeJsonText(link.name) },
                    key         = new { v = Data.EscapeJsonText(link.apikey) },
                    @readonly   = new { v = link.readOnly },
                    permissions = new { v = link.permissions }
                }
            ),
            length = Api.links.Count()
        });
    }

    internal static byte[] Save(HttpListenerContext ctx, string origin) {
        using StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding);
        string payload = reader.ReadToEnd();

        Api.links.Clear();

        try {
            Link[] temp = JsonSerializer.Deserialize<Link[]>(payload, apiLinksSerializerOptions);
            for (int i = 0; i < temp.Length; i++) {
                if (temp[i].guid == default(Guid)) {
                    temp[i].guid = Guid.NewGuid();
                }
                Api.links.TryAdd(temp[i].guid.ToString(), temp[i]);
            }

            byte[] plain = JsonSerializer.SerializeToUtf8Bytes(temp, apiLinksSerializerOptions);
            byte[] cipher = Cryptography.Encrypt(plain, Configuration.DB_KEY, Configuration.DB_KEY_IV);
            lock (mutex) {
                File.WriteAllBytes(Data.FILE_API_LINKS, cipher);
            }

            Logger.Action(origin, $"Modify API links");
        }
        catch (JsonException ex) {
            Logger.Error(ex);
            return Data.CODE_INVALID_ARGUMENT.Array;
        }
        catch (Exception ex) {
            Logger.Error(ex);
            return Data.CODE_FAILED.Array;
        }

        return Data.CODE_OK.Array;
    }
}

file sealed class ApiJsonConverter : JsonConverter<Api.Link[]> {
    public override Api.Link[] Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) {
        if (reader.TokenType != JsonTokenType.StartArray) {
            throw new JsonException();
        }

        List<Api.Link> links = new List<Api.Link>();

        while (reader.Read()) {
            if (reader.TokenType == JsonTokenType.EndArray){
                break;
            }

            if (reader.TokenType != JsonTokenType.StartObject) {
                throw new JsonException();
            }

            string name        = null;
            string key         = null;
            Guid   guid        = Guid.Empty;
            bool   readOnly    = true;
            byte   permissions = 0;

            while (reader.Read()) {
                if (reader.TokenType == JsonTokenType.EndObject) {
                    break;
                }

                if (reader.TokenType != JsonTokenType.PropertyName) {
                    throw new JsonException();
                }

                string propertyName = reader.GetString();
                reader.Read();

                switch (propertyName) {
                case "name"        : name        = reader.GetString();  break;
                case "key"         : key         = reader.GetString();  break;
                case "guid"        : guid        = reader.GetGuid();    break;
                case "readonly"    : readOnly    = reader.GetBoolean(); break;
                case "permissions" : permissions = reader.GetByte();    break;
                }
            }

            Api.Link link = new Api.Link {
                name        = name,
                apikey      = key,
                guid        = guid,
                readOnly    = readOnly,
                permissions = permissions
            };

            links.Add(link);
        }

        return links.ToArray();
    }

    public override void Write(Utf8JsonWriter writer, Api.Link[] value, JsonSerializerOptions options) {
        ReadOnlySpan<byte> _name        = "name"u8;
        ReadOnlySpan<byte> _key         = "key"u8;
        ReadOnlySpan<byte> _guid        = "guid"u8;
        ReadOnlySpan<byte> _readonly    = "readonly"u8;
        ReadOnlySpan<byte> _permissions = "permissions"u8;
        
        writer.WriteStartArray();

        for (int i = 0; i < value.Length; i++) {
            writer.WriteStartObject();
            writer.WriteString(_name,        value[i].name);
            writer.WriteString(_key,         value[i].apikey);
            writer.WriteString(_guid,        value[i].guid);
            writer.WriteBoolean(_readonly,   value[i].readOnly);
            writer.WriteNumber(_permissions, value[i].permissions);
            writer.WriteEndObject();
        }

        writer.WriteEndArray();
    }
}
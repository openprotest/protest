using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Mail;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Protest.Tools;
internal static class SnmpProfiles {
    private static readonly object mutex;
    private static readonly JsonSerializerOptions snmpProfileSerializerOptions;
    private static readonly JsonSerializerOptions snmpProfileSerializerOptionsWithPasswords;

    public enum AuthenticationAlgorithm : byte {
        Auto = 0,
        MD5 = 1,
        SHA1 = 2,
        SHA256 = 3,
        SHA384 = 4,
        SHA512 = 5
    }

    public enum PrivacyAlgorithm : byte {
        Auto = 0,
        DES = 1,
        AES128 = 2,
        AES192 = 3,
        AES256 = 4
    }

    public record Profile {
        public Guid guid;
        public string name;
        public int version = 2;
        public string context = String.Empty;
        public string username;
        public AuthenticationAlgorithm authAlgorithm = AuthenticationAlgorithm.Auto;
        public string authPassword;
        public PrivacyAlgorithm privacyAlgorithm = PrivacyAlgorithm.Auto;
        public string privacyPassword;
    }

    static SnmpProfiles() {
        mutex = new object();

        snmpProfileSerializerOptions = new JsonSerializerOptions();
        snmpProfileSerializerOptionsWithPasswords = new JsonSerializerOptions();

        snmpProfileSerializerOptions.Converters.Add(new SnmpProfilesJsonConverter(true));
        snmpProfileSerializerOptionsWithPasswords.Converters.Add(new SnmpProfilesJsonConverter(false));
    }

    public static Profile[] Load() {
        if (!File.Exists(Data.SNMP_PROFILES)) {
            return Array.Empty<Profile>();
        }

        try {
            byte[] bytes;
            lock (mutex) {
                bytes = File.ReadAllBytes(Data.SNMP_PROFILES);
            }

            byte[] plain = Cryptography.Decrypt(bytes, Configuration.DB_KEY, Configuration.DB_KEY_IV);
            Profile[] profiles = JsonSerializer.Deserialize<Profile[]>(plain, snmpProfileSerializerOptionsWithPasswords);
            return profiles;
        }
        catch {
            return Array.Empty<Profile>();
        }
    }

    public static byte[] List() {
        try {
            Profile[] profiles = Load();
            byte[] json = JsonSerializer.SerializeToUtf8Bytes(profiles, snmpProfileSerializerOptions);

            return json;
        }
        catch {
            return Data.CODE_FAILED.Array;
        }
    }

    public static byte[] Save(HttpListenerContext ctx) {
        string payload;
        using (StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding))
            payload = reader.ReadToEnd();

        Profile[] oldProfiles;
        try {
            byte[] bytes;
            lock (mutex) {
                bytes = File.ReadAllBytes(Data.SNMP_PROFILES);
            }

            oldProfiles = JsonSerializer.Deserialize<Profile[]>(bytes, snmpProfileSerializerOptionsWithPasswords);
        }
        catch {
            oldProfiles = Array.Empty<Profile>();
        }

        try {
            Profile[] newProfiles = JsonSerializer.Deserialize<Profile[]>(payload, snmpProfileSerializerOptionsWithPasswords);

            for (int i = 0; i < newProfiles.Length; i++) {
                if (newProfiles[i].guid == default(Guid)) {
                    newProfiles[i].guid = Guid.NewGuid();
                }

                if (newProfiles[i].authPassword?.Length > 0) continue;
                if (newProfiles[i].privacyPassword?.Length > 0) continue;

                Profile old = null;
                for (int j = 0; j < oldProfiles.Length; j++) {
                    if (newProfiles[i].guid == oldProfiles[j].guid) {
                        old = oldProfiles[j];
                        break;
                    }
                }

                if (old is not null) {
                    newProfiles[i].authPassword = old.authPassword;
                    newProfiles[i].privacyPassword = old.privacyPassword;
                }
            }

            byte[] plain = JsonSerializer.SerializeToUtf8Bytes(newProfiles, snmpProfileSerializerOptionsWithPasswords);
            byte[] cipher = Cryptography.Encrypt(plain, Configuration.DB_KEY, Configuration.DB_KEY_IV);
            lock (mutex) {
                File.WriteAllBytes(Data.SNMP_PROFILES, cipher);
            }
        }
        catch (JsonException) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }
        catch (Exception) {
            return Data.CODE_FAILED.Array;
        }

        return Data.CODE_OK.Array;
    }

}

internal sealed class SnmpProfilesJsonConverter : JsonConverter<SnmpProfiles.Profile[]> {
    private readonly bool hidePasswords;
    public SnmpProfilesJsonConverter(bool hidePasswords) {
        this.hidePasswords = hidePasswords;
    }

    public override SnmpProfiles.Profile[] Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) {
        List<SnmpProfiles.Profile> profiles = new List<SnmpProfiles.Profile>();

        if (reader.TokenType != JsonTokenType.StartArray) {
            throw new JsonException("Expected start of an array.");
        }

        while (reader.Read()) {
            if (reader.TokenType == JsonTokenType.EndArray) {
                break;
            }

            if (reader.TokenType == JsonTokenType.StartObject) {
                SnmpProfiles.Profile profile = new SnmpProfiles.Profile();

                while (reader.Read()) {
                    if (reader.TokenType == JsonTokenType.EndObject) {
                        break;
                    }

                    if (reader.TokenType == JsonTokenType.PropertyName) {
                        string propertyName = reader.GetString();
                        reader.Read();

                        switch (propertyName) {
                        case "name": profile.name = reader.GetString(); break;
                        case "version": profile.version = reader.GetInt32(); break;
                        case "context": profile.context = reader.GetString(); break;
                        case "username": profile.username = reader.GetString(); break;
                        case "authAlgorithm": profile.authAlgorithm = (SnmpProfiles.AuthenticationAlgorithm)reader.GetUInt16(); break;
                        case "authPassword": profile.authPassword = hidePasswords ? String.Empty : reader.GetString(); break;
                        case "privacyAlgorithm": profile.privacyAlgorithm = (SnmpProfiles.PrivacyAlgorithm)reader.GetUInt16(); break;
                        case "privacyPassword": profile.privacyPassword = hidePasswords ? String.Empty : reader.GetString(); break;
                        case "guid": profile.guid = reader.GetGuid(); break;
                        default: reader.Skip(); break;
                        }
                    }
                }

                profiles.Add(profile);
            }
        }

        return profiles.ToArray();
    }

    public override void Write(Utf8JsonWriter writer, SnmpProfiles.Profile[] value, JsonSerializerOptions options) {
        ReadOnlySpan<byte> _name = "name"u8;
        ReadOnlySpan<byte> _version = "version"u8;
        ReadOnlySpan<byte> _context = "context"u8;
        ReadOnlySpan<byte> _username = "username"u8;
        ReadOnlySpan<byte> _authAlgorithm = "authAlgorithm"u8;
        ReadOnlySpan<byte> _authPassword = "authPassword"u8;
        ReadOnlySpan<byte> _privacyAlgorithm = "privacyAlgorithm"u8;
        ReadOnlySpan<byte> _privacyPassword = "privacyPassword"u8;
        ReadOnlySpan<byte> _guid = "guid"u8;

        writer.WriteStartArray();

        for (int i = 0; i < value.Length; i++) {
            writer.WriteStartObject();
            writer.WriteString(_name, value[i].name);
            writer.WriteNumber(_version, value[i].version);
            writer.WriteString(_context, value[i].context);
            writer.WriteString(_username, value[i].username);
            writer.WriteNumber(_authAlgorithm, (byte)value[i].authAlgorithm);
            writer.WriteString(_authPassword, hidePasswords ? String.Empty : value[i].authPassword.ToString());
            writer.WriteNumber(_privacyAlgorithm, (byte)value[i].authAlgorithm);
            writer.WriteString(_privacyPassword, hidePasswords ? String.Empty : value[i].privacyPassword.ToString());
            writer.WriteString(_guid, value[i].guid);
            writer.WriteEndObject();
        }

        writer.WriteEndArray();
    }
}
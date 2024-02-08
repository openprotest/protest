using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Mail;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Protest.Tools;
internal static class SmtpProfiles {
    static readonly JsonSerializerOptions smtpProfileSerializerOptions;
    static readonly JsonSerializerOptions smtpProfileSerializerOptionsWithPasswords;

    public record Profile {
        public string server;
        public int port;
        public string sender;
        public string username;
        public string password;
        //public string recipients;
        public bool ssl;
        public Guid guid;
    }

    static SmtpProfiles() {
        smtpProfileSerializerOptions = new JsonSerializerOptions();
        smtpProfileSerializerOptionsWithPasswords = new JsonSerializerOptions();

        smtpProfileSerializerOptions.Converters.Add(new SmtpProfilesJsonConverter(true));
        smtpProfileSerializerOptionsWithPasswords.Converters.Add(new SmtpProfilesJsonConverter(false));
    }

    public static Profile[] Load() {
        if (!File.Exists(Data.FILE_EMAIL_PROFILES)) {
            return Array.Empty<Profile>();
        }

        try {
            byte[] bytes = File.ReadAllBytes(Data.FILE_EMAIL_PROFILES);
            byte[] plain = Cryptography.Decrypt(bytes, Configuration.DB_KEY, Configuration.DB_KEY_IV);
            Profile[] profiles = JsonSerializer.Deserialize<Profile[]>(plain, smtpProfileSerializerOptionsWithPasswords);
            return profiles;
        }
        catch {
            return Array.Empty<Profile>();
        }
    }

    public static byte[] List() {
        try {
            Profile[] profiles = Load();
            byte[] json = JsonSerializer.SerializeToUtf8Bytes(profiles, smtpProfileSerializerOptions);
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
            byte[] bytes = File.ReadAllBytes(Data.FILE_EMAIL_PROFILES);
            oldProfiles = JsonSerializer.Deserialize<Profile[]>(bytes, smtpProfileSerializerOptionsWithPasswords);
        }
        catch {
            oldProfiles = Array.Empty<Profile>();
        }

        try {
            Profile[] newProfiles = JsonSerializer.Deserialize<Profile[]>(payload, smtpProfileSerializerOptionsWithPasswords);

            for (int i = 0; i < newProfiles.Length; i++) {
                if (newProfiles[i].guid == default(Guid)) {
                    newProfiles[i].guid = Guid.NewGuid();
                }

                if (newProfiles[i].password?.Length > 0) continue;

                Profile old = null;
                for (int j = 0; j < oldProfiles.Length; j++) {
                    if (newProfiles[i].guid == oldProfiles[j].guid) {
                        old = oldProfiles[j];
                        break;
                    }
                }

                if (old is not null) {
                    newProfiles[i].password = old.password;
                }
            }

            byte[] plain = JsonSerializer.SerializeToUtf8Bytes(newProfiles, smtpProfileSerializerOptionsWithPasswords);
            byte[] cipher = Cryptography.Encrypt(plain, Configuration.DB_KEY, Configuration.DB_KEY_IV);
            File.WriteAllBytes(Data.FILE_EMAIL_PROFILES, cipher);
        }
        catch (JsonException) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }
        catch (Exception) {
            return Data.CODE_FAILED.Array;
        }

        return Data.CODE_OK.Array;
    }

    public static byte[] SendTest(Dictionary<string, string> parameters) {
        if (parameters is null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        if (!parameters.TryGetValue("guid", out string guid)) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }
        if (!parameters.TryGetValue("recipient", out string recipient)) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        try {
            Profile[] smtpProfiles = SmtpProfiles.Load();
            Profile profile = smtpProfiles.First(o => o.guid.ToString() == guid);
            return SendTest(recipient, profile);
        }
        catch (Exception ex) {
            return Encoding.UTF8.GetBytes($"{{\"error\":\"{Data.EscapeJsonText(ex.Message)}\"}}");
        }
    }

    public static byte[] SendTest(string recipient, SmtpProfiles.Profile profile) {
        string body = """
            <html>
            <table width="100%" cellpadding="0" cellspacing="0" border="0">

            <tr><td>&nbsp;</td></tr>
            <tr><td align="center">
            
            <table width="640" bgcolor="#e0e0e0">
            <tr><td style="padding:10px"></td></tr>

            <tr><td style="height:28px;font-size:18;text-align:center">
            You have successfully configure this SMTP profile.
            </td></tr>

            <tr><td style="padding:10px"></td></tr>
            </table>

            </td></tr>
            <tr><td>&nbsp;</td></tr>
            <tr><td style="text-align:center;color:#808080">Sent from <a href="https://github.com/openprotest/protest" style="color:#e67624">Pro-test</a></td></tr>
            <tr><td>&nbsp;</td></tr>
            </td></tr>

            </table>
            </html>
            """;

        try {
            using MailMessage mail = new MailMessage {
                From = new MailAddress(profile.sender, "Pro-test"),
                Subject = "E-mail test from Pro-test",
                IsBodyHtml = true
            };

            AlternateView view = AlternateView.CreateAlternateViewFromString(body, null, "text/html");
            mail.AlternateViews.Add(view);

            if (!String.IsNullOrEmpty(recipient)) {
                mail.To.Add(recipient);
            }

            using SmtpClient smtp = new SmtpClient(profile.server) {
                Port = profile.port,
                EnableSsl = profile.ssl,
                Credentials = new NetworkCredential(profile.username, profile.password),
            };
            smtp.Send(mail);

            return Data.CODE_OK.Array;
        }
        catch (Exception ex) {
            return Encoding.UTF8.GetBytes($"{{\"error\":\"{Data.EscapeJsonText(ex.Message)}\"}}");
        }
    }
}

internal sealed class SmtpProfilesJsonConverter : JsonConverter<SmtpProfiles.Profile[]> {
    private readonly bool hidePasswords;
    public SmtpProfilesJsonConverter(bool hidePasswords) {
        this.hidePasswords = hidePasswords;
    }

    public override SmtpProfiles.Profile[] Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) {
        List<SmtpProfiles.Profile> profiles = new List<SmtpProfiles.Profile>();

        if (reader.TokenType != JsonTokenType.StartArray) {
            throw new JsonException("Expected start of an array.");
        }

        while (reader.Read()) {
            if (reader.TokenType == JsonTokenType.EndArray) {
                break;
            }

            if (reader.TokenType == JsonTokenType.StartObject) {
                SmtpProfiles.Profile profile = new SmtpProfiles.Profile();

                while (reader.Read()) {
                    if (reader.TokenType == JsonTokenType.EndObject) {
                        break;
                    }

                    if (reader.TokenType == JsonTokenType.PropertyName) {
                        string propertyName = reader.GetString();
                        reader.Read();

                        switch (propertyName) {
                        case "server": profile.server = reader.GetString(); break;
                        case "port": profile.port = reader.GetInt32(); break;
                        case "sender": profile.sender = reader.GetString(); break;
                        case "username": profile.username = reader.GetString(); break;
                        case "password": profile.password = hidePasswords ? String.Empty : reader.GetString(); break;
                        //case "recipients": profile.recipients = reader.GetString(); break;
                        case "ssl": profile.ssl = reader.GetBoolean(); break;
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

    public override void Write(Utf8JsonWriter writer, SmtpProfiles.Profile[] value, JsonSerializerOptions options) {
        ReadOnlySpan<byte> _server = "server"u8;
        ReadOnlySpan<byte> _port = "port"u8;
        ReadOnlySpan<byte> _sender = "sender"u8;
        ReadOnlySpan<byte> _username = "username"u8;
        ReadOnlySpan<byte> _password = "password"u8;
        //ReadOnlySpan<byte> _recipients = "recipients"u8;
        ReadOnlySpan<byte> _ssl = "ssl"u8;
        ReadOnlySpan<byte> _guid = "guid"u8;

        writer.WriteStartArray();

        for (int i = 0; i < value.Length; i++) {
            writer.WriteStartObject();
            writer.WriteString(_server, value[i].server);
            writer.WriteNumber(_port, value[i].port);
            writer.WriteString(_sender, value[i].sender);
            writer.WriteString(_username, value[i].username);
            writer.WriteString(_password, hidePasswords ? String.Empty : value[i].password);
            //writer.WriteString(_recipients, value[i].recipients);
            writer.WriteBoolean(_ssl, value[i].ssl);
            writer.WriteString(_guid, value[i].guid);
            writer.WriteEndObject();
        }

        writer.WriteEndArray();
    }
}
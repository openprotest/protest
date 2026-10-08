using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using MailKit.Net.Smtp;
using MailKit.Security;
using MimeKit;
using MimeKit.Text;
using Protest.Http;

namespace Protest.Tools;
internal static class SmtpProfiles {
    private static readonly Lock mutex;
    private static readonly JsonSerializerOptions smtpProfileSerializerOptions;
    private static readonly JsonSerializerOptions smtpProfileSerializerOptionsWithPasswords;

    public enum Provider : byte {
        SmtpServer = 0,
        Outlook    = 1,
        Gmail      = 2,
    }

    public record Profile {
        public Provider provider;
        public Guid guid;
        public string server;
        public int port;
        public string sender;
        public string username;
        public string password;
        public bool ssl;
        public string clientId;
        public string clientSecret;
        public string tenant;
        public string refreshToken;
        public string session; //pending oauth sign-in, never stored
    }

    static SmtpProfiles() {
        mutex = new Lock();

        smtpProfileSerializerOptions = new JsonSerializerOptions();
        smtpProfileSerializerOptionsWithPasswords = new JsonSerializerOptions();

        smtpProfileSerializerOptions.Converters.Add(new SmtpProfilesJsonConverter(true));
        smtpProfileSerializerOptionsWithPasswords.Converters.Add(new SmtpProfilesJsonConverter(false));
    }

    public static Profile[] Load() {
        if (!File.Exists(Data.FILE_SMTP_PROFILES)) {
            return Array.Empty<Profile>();
        }

        try {
            byte[] bytes;
            lock (mutex) {
                bytes = File.ReadAllBytes(Data.FILE_SMTP_PROFILES);
            }

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

    public static byte[] Save(HttpListenerContext ctx, string origin) {
        using StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding);
        string payload = reader.ReadToEnd();

        try {
            Profile[] newProfiles = JsonSerializer.Deserialize<Profile[]>(payload, smtpProfileSerializerOptionsWithPasswords);

            lock (mutex) {
                Profile[] oldProfiles = Load();

                for (int i = 0; i < newProfiles.Length; i++) {
                    Profile profile = newProfiles[i];

                    if (profile.guid == default(Guid)) {
                        profile.guid = Guid.NewGuid();
                    }

                    Profile old = Array.Find(oldProfiles, o => o.guid == profile.guid);
                    if (!MergeSecrets(profile, old)) {
                        return Encoding.UTF8.GetBytes("{\"error\":\"The sign-in has expired. Sign in again.\"}");
                    }
                }

                Store(newProfiles);
            }

            SmtpOAuth.ClearCache();

            Logger.Action(origin, "Environment", $"Modify SMTP profiles");
        }
        catch (JsonException) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }
        catch (ArgumentException ex) {
            return Encoding.UTF8.GetBytes($"{{\"error\":\"{Data.EscapeJsonText(ex.Message)}\"}}");
        }
        catch (Exception) {
            return Data.CODE_FAILED.Array;
        }

        return Data.CODE_OK.Array;
    }

    private static bool MergeSecrets(Profile profile, Profile old) {
        if (String.IsNullOrEmpty(profile.password))     profile.password     = old?.password;
        if (String.IsNullOrEmpty(profile.clientSecret)) profile.clientSecret = old?.clientSecret;

        profile.clientId = profile.clientId?.Trim();
        profile.tenant   = profile.provider == Provider.Outlook ? SmtpOAuth.NormalizeTenant(profile.tenant) : null;

        string session = profile.session;
        profile.session = null;

        if (profile.provider == Provider.SmtpServer) {
            profile.clientId = profile.clientSecret = profile.tenant = profile.refreshToken = null;
            return true;
        }

        profile.password = null;
        profile.ssl = true; //outlook and gmail only accept the oauth sign-in over tls

        if (session is not null) {
            if (!SmtpOAuth.TakeSession(session, profile.provider, out string clientId, out string clientSecret, out string tenant, out string refreshToken, out string email)) {
                return false;
            }
            profile.clientId     = clientId;
            profile.clientSecret = clientSecret;
            profile.tenant       = tenant;
            profile.refreshToken = refreshToken;
            profile.username     = email;
            if (String.IsNullOrWhiteSpace(profile.sender)) profile.sender = email;
        }
        else if (old is not null && old.provider == profile.provider && old.clientId == profile.clientId && old.tenant == profile.tenant) {
            profile.refreshToken = old.refreshToken;
            profile.username     = old.username;
        }
        else {
            profile.refreshToken = null;
        }

        return true;
    }

    private static void Store(Profile[] profiles) {
        byte[] plain = JsonSerializer.SerializeToUtf8Bytes(profiles, smtpProfileSerializerOptionsWithPasswords);
        byte[] cipher = Cryptography.Encrypt(plain, Configuration.DB_KEY, Configuration.DB_KEY_IV);
        lock (mutex) {
            File.WriteAllBytes(Data.FILE_SMTP_PROFILES, cipher);
        }
    }

    public static void UpdateRefreshToken(Guid guid, string refreshToken) {
        lock (mutex) {
            Profile[] profiles = Load();
            Profile profile = Array.Find(profiles, o => o.guid == guid);
            if (profile is null) return;
            profile.refreshToken = refreshToken;
            Store(profiles);
        }
    }

    public static byte[] SendTest(HttpListenerContext ctx) {
        Dictionary<string, string> parameters = Listener.ParseQuery(ctx);

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
            Profile profile = smtpProfiles.FirstOrDefault(o => o.guid.ToString() == guid);
            if (profile is null) return Data.CODE_INVALID_ARGUMENT.Array;
            return SendTest(recipient, profile);
        }
        catch (Exception ex) {
            return Encoding.UTF8.GetBytes($"{{\"error\":\"{Data.EscapeJsonText(ex.Message)}\"}}");
        }
    }

    public static byte[] SendTest(string recipient, Profile profile) {
        if (String.IsNullOrWhiteSpace(recipient)) {
            return Encoding.UTF8.GetBytes("{\"error\":\"Invalid recipient\"}");
        }

        string body = """
            <html>
            <table width="100%" cellpadding="0" cellspacing="0" border="0">

            <tr><td>&nbsp;</td></tr>
            <tr><td align="center">

            <table width="640" bgcolor="#e0e0e0">
            <tr><td style="padding:10px"></td></tr>

            <tr><td style="height:28px;font-size:18;text-align:center">
            You have successfully configured this SMTP profile.
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
            string reply = Send(profile, new string[] { recipient }, "E-mail test from Pro-test", body);

            string warning = null;
            string senderAddress = MailboxAddress.Parse(profile.sender).Address;
            if (profile.provider != Provider.SmtpServer && !senderAddress.Equals(profile.username, StringComparison.OrdinalIgnoreCase)) {
                warning = profile.provider == Provider.Outlook
                    ? $"The sender ({senderAddress}) is not the signed-in account ({profile.username}). Microsoft accepts the message, but returns it as undeliverable unless the account has Send As permission for that address. Check {profile.username}'s inbox for a bounce."
                    : $"The sender ({senderAddress}) is not the signed-in account ({profile.username}). Gmail replaces it with {profile.username} unless it is a verified alias of that account.";
            }

            StringBuilder json = new StringBuilder();
            json.Append($"{{\"status\":\"ok\",\"server\":\"{Data.EscapeJsonText(profile.server)}\",\"reply\":\"{Data.EscapeJsonText(reply)}\"");
            if (warning is not null) json.Append($",\"warning\":\"{Data.EscapeJsonText(warning)}\"");
            json.Append('}');
            return Encoding.UTF8.GetBytes(json.ToString());
        }
        catch (SmtpCommandException ex) {
            Logger.Error(ex);
            return Encoding.UTF8.GetBytes($"{{\"error\":\"{Data.EscapeJsonText($"{profile.server} rejected the message ({(int)ex.StatusCode}): {ex.Message}")}\"}}");
        }
        catch (Exception ex) {
            Logger.Error(ex);
            return Encoding.UTF8.GetBytes($"{{\"error\":\"{Data.EscapeJsonText(ex.Message)}\"}}");
        }
    }

    public static string Send(Profile profile, string[] recipients, string subject, string htmlBody) {
        MailboxAddress from = MailboxAddress.Parse(profile.sender);
        from.Name = "Pro-test";

        using MimeMessage message = new MimeMessage();
        message.From.Add(from);
        message.Subject = subject;
        message.Body = new TextPart(TextFormat.Html) { Text = htmlBody };

        for (int i = 0; i < recipients.Length; i++) {
            message.To.AddRange(InternetAddressList.Parse(recipients[i]));
        }

        bool isOAuth = profile.provider != Provider.SmtpServer;

        //oauth profiles are always over tls, including ones stored before that was enforced
        SecureSocketOptions security = !profile.ssl && !isOAuth ? SecureSocketOptions.None
            : profile.port == 465 ? SecureSocketOptions.SslOnConnect
            : SecureSocketOptions.StartTls;

        string accessToken = isOAuth ? SmtpOAuth.GetAccessToken(profile) : null;

        using SmtpClient smtp = new SmtpClient {
            CheckCertificateRevocation = false
        };

        smtp.Connect(profile.server, profile.port, security);

        if (isOAuth) {
            try {
                smtp.Authenticate(new SaslMechanismOAuth2(profile.username, accessToken));
            }
            catch (AuthenticationException) {
                SmtpOAuth.ForgetAccessToken(profile.guid);
                throw;
            }
        }
        else if (!String.IsNullOrEmpty(profile.username)) {
            if (!smtp.Capabilities.HasFlag(SmtpCapabilities.Authentication)) {
                throw new InvalidOperationException(security == SecureSocketOptions.None
                    ? $"{profile.server} does not offer authentication without encryption. Turn on SSL, or clear the username to send without logging in."
                    : $"{profile.server} does not offer authentication. Clear the username to send without logging in.");
            }
            smtp.Authenticate(profile.username, profile.password ?? String.Empty);
        }

        string reply = smtp.Send(message);
        smtp.Disconnect(true);
        return reply;
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
            throw new JsonException();
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
                        case "provider" : profile.provider   = (SmtpProfiles.Provider)reader.GetByte(); break;
                        case "server"   : profile.server     = reader.GetString(); break;
                        case "port"     : profile.port       = reader.GetInt32(); break;
                        case "sender"   : profile.sender     = reader.GetString(); break;
                        case "username" : profile.username   = reader.GetString(); break;
                        case "password" : profile.password   = hidePasswords ? String.Empty : reader.GetString(); break;
                        case "ssl"      : profile.ssl        = reader.GetBoolean(); break;
                        case "guid"     : profile.guid       = reader.GetGuid(); break;
                        case "clientId"     : profile.clientId     = reader.GetString(); break;
                        case "clientSecret" : profile.clientSecret = hidePasswords ? String.Empty : reader.GetString(); break;
                        case "tenant"       : profile.tenant       = reader.GetString(); break;
                        case "refreshToken" : profile.refreshToken = hidePasswords ? String.Empty : reader.GetString(); break;
                        case "session"      : profile.session      = reader.GetString(); break;
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
        ReadOnlySpan<byte> _provider = "provider"u8;
        ReadOnlySpan<byte> _server   = "server"u8;
        ReadOnlySpan<byte> _port     = "port"u8;
        ReadOnlySpan<byte> _sender   = "sender"u8;
        ReadOnlySpan<byte> _username = "username"u8;
        ReadOnlySpan<byte> _password = "password"u8;
        ReadOnlySpan<byte> _ssl      = "ssl"u8;
        ReadOnlySpan<byte> _guid     = "guid"u8;
        ReadOnlySpan<byte> _clientId     = "clientId"u8;
        ReadOnlySpan<byte> _clientSecret = "clientSecret"u8;
        ReadOnlySpan<byte> _tenant       = "tenant"u8;
        ReadOnlySpan<byte> _refreshToken = "refreshToken"u8;
        ReadOnlySpan<byte> _signedIn     = "signedIn"u8;

        writer.WriteStartArray();

        for (int i = 0; i < value.Length; i++) {
            writer.WriteStartObject();
            writer.WriteNumber(_provider, (byte)value[i].provider);
            writer.WriteString(_server, value[i].server);
            writer.WriteNumber(_port, value[i].port);
            writer.WriteString(_sender, value[i].sender);
            writer.WriteString(_username, value[i].username);
            writer.WriteString(_password, hidePasswords ? String.Empty : value[i].password);
            writer.WriteBoolean(_ssl, value[i].ssl);
            writer.WriteString(_guid, value[i].guid);
            writer.WriteString(_clientId, value[i].clientId);
            writer.WriteString(_clientSecret, hidePasswords ? String.Empty : value[i].clientSecret);
            writer.WriteString(_tenant, value[i].tenant);
            if (hidePasswords) {
                writer.WriteBoolean(_signedIn, !String.IsNullOrEmpty(value[i].refreshToken));
            }
            else {
                writer.WriteString(_refreshToken, value[i].refreshToken);
            }
            writer.WriteEndObject();
        }

        writer.WriteEndArray();
    }
}
using System.Buffers.Text;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Collections.Specialized;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Web;
using Protest.Http;

namespace Protest.Tools;

internal static class SmtpOAuth {
    private const string MICROSOFT_AUTHORITY = "https://login.microsoftonline.com";
    private const string MICROSOFT_SCOPE     = "https://outlook.office.com/SMTP.Send offline_access";
    private const string GOOGLE_AUTH_URL     = "https://accounts.google.com/o/oauth2/v2/auth";
    private const string GOOGLE_TOKEN_URL    = "https://oauth2.googleapis.com/token";
    private const string GOOGLE_SCOPE        = "https://mail.google.com/";
    private const string GOOGLE_REDIRECT_URI = "http://127.0.0.1:47115";
    private const long   SESSION_LIFETIME    = 15 * TimeSpan.TicksPerMinute;

    private sealed class Session {
        public SmtpProfiles.Provider provider;
        public string clientId;
        public string clientSecret;
        public string tenant;
        public string deviceCode;
        public string codeVerifier;
        public string state;
        public long   expires;
        public string refreshToken;
        public string email;
    }

    private sealed record AccessToken(string token, long expires);

    private sealed class OAuthException(string code, string message) : Exception(message) {
        public string Code { get; } = code;
    }

    private static readonly HttpClient httpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(20) };
    private static readonly ConcurrentDictionary<string, Session> sessions = new ConcurrentDictionary<string, Session>();
    private static readonly ConcurrentDictionary<Guid, AccessToken> accessTokens = new ConcurrentDictionary<Guid, AccessToken>();
    private static readonly Lock refreshMutex = new Lock();

    public static string NormalizeTenant(string tenant) {
        tenant = tenant?.Trim();
        if (String.IsNullOrEmpty(tenant)) return "common";

        for (int i = 0; i < tenant.Length; i++) {
            if (!Char.IsAsciiLetterOrDigit(tenant[i]) && tenant[i] != '.' && tenant[i] != '-') {
                throw new ArgumentException("Invalid tenant");
            }
        }

        return tenant;
    }

    public static byte[] Start(HttpListenerContext ctx) {
        using StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding);
        string payload = reader.ReadToEnd();

        Session session = new Session { expires = DateTime.UtcNow.Ticks + SESSION_LIFETIME };

        try {
            using JsonDocument json = JsonDocument.Parse(payload);
            JsonElement root = json.RootElement;

            session.provider     = (SmtpProfiles.Provider)root.GetProperty("provider").GetByte();
            session.clientId     = GetString(root, "clientId")?.Trim();
            session.clientSecret = GetString(root, "clientSecret");

            if (String.IsNullOrEmpty(session.clientSecret) && Guid.TryParse(GetString(root, "guid"), out Guid guid)) {
                session.clientSecret = Array.Find(SmtpProfiles.Load(), o => o.guid == guid)?.clientSecret;
            }

            if (session.provider == SmtpProfiles.Provider.Outlook) {
                session.tenant = NormalizeTenant(GetString(root, "tenant"));
            }
        }
        catch (ArgumentException ex) {
            return Error(ex.Message);
        }
        catch {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        if (String.IsNullOrEmpty(session.clientId)) {
            return Error("Client ID is required");
        }

        string id = Convert.ToHexString(RandomNumberGenerator.GetBytes(16));
        PurgeExpired();

        try {
            switch (session.provider) {
            case SmtpProfiles.Provider.Outlook: {
                JsonElement response = Post($"{MICROSOFT_AUTHORITY}/{session.tenant}/oauth2/v2.0/devicecode", new Dictionary<string, string> {
                    ["client_id"] = session.clientId,
                    ["scope"]     = $"{MICROSOFT_SCOPE} openid email profile"
                });

                session.deviceCode = response.GetProperty("device_code").GetString();
                sessions[id] = session;

                string userCode = response.GetProperty("user_code").GetString();
                string verificationUri = response.GetProperty("verification_uri").GetString();
                int interval = response.TryGetProperty("interval", out JsonElement intervalElement) ? intervalElement.GetInt32() : 5;

                return Encoding.UTF8.GetBytes($"{{\"id\":\"{id}\",\"mode\":\"device\",\"userCode\":\"{Data.EscapeJsonText(userCode)}\",\"verificationUri\":\"{Data.EscapeJsonText(verificationUri)}\",\"interval\":{interval}}}");
            }

            case SmtpProfiles.Provider.Gmail: {
                if (String.IsNullOrEmpty(session.clientSecret)) {
                    return Error("Client secret is required");
                }

                session.codeVerifier = Base64Url.EncodeToString(RandomNumberGenerator.GetBytes(32));
                session.state        = Base64Url.EncodeToString(RandomNumberGenerator.GetBytes(16));
                sessions[id] = session;

                string challenge = Base64Url.EncodeToString(SHA256.HashData(Encoding.ASCII.GetBytes(session.codeVerifier)));
                string authUrl = $"{GOOGLE_AUTH_URL}?client_id={Uri.EscapeDataString(session.clientId)}" +
                    $"&redirect_uri={Uri.EscapeDataString(GOOGLE_REDIRECT_URI)}" +
                    "&response_type=code" +
                    $"&scope={Uri.EscapeDataString($"{GOOGLE_SCOPE} openid email")}" +
                    "&access_type=offline&prompt=consent" +
                    $"&state={session.state}" +
                    $"&code_challenge={challenge}&code_challenge_method=S256";

                return Encoding.UTF8.GetBytes($"{{\"id\":\"{id}\",\"mode\":\"code\",\"authUrl\":\"{Data.EscapeJsonText(authUrl)}\"}}");
            }

            default:
                return Data.CODE_INVALID_ARGUMENT.Array;
            }
        }
        catch (Exception ex) {
            return Error(ex.Message);
        }
    }

    public static byte[] Poll(HttpListenerContext ctx) {
        Dictionary<string, string> parameters = Listener.ParseQuery(ctx);
        if (parameters is null || !parameters.TryGetValue("id", out string id)) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        if (!sessions.TryGetValue(id, out Session session) || session.deviceCode is null) {
            return Error("The sign-in has expired. Try again.");
        }

        if (session.refreshToken is not null) {
            return Done(session);
        }

        if (session.expires < DateTime.UtcNow.Ticks) {
            sessions.TryRemove(id, out _);
            return Error("The sign-in has expired. Try again.");
        }

        try {
            JsonElement response = Post($"{MICROSOFT_AUTHORITY}/{session.tenant}/oauth2/v2.0/token", new Dictionary<string, string> {
                ["grant_type"]  = "urn:ietf:params:oauth:grant-type:device_code",
                ["client_id"]   = session.clientId,
                ["device_code"] = session.deviceCode
            });

            Accept(session, response);
            return Done(session);
        }
        catch (OAuthException ex) when (ex.Code == "authorization_pending") {
            return "{\"status\":\"pending\"}"u8.ToArray();
        }
        catch (OAuthException ex) when (ex.Code == "slow_down") {
            return "{\"status\":\"pending\",\"slowDown\":true}"u8.ToArray();
        }
        catch (Exception ex) {
            sessions.TryRemove(id, out _);
            return Error(ex.Message);
        }
    }

    public static byte[] Complete(HttpListenerContext ctx) {
        using StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding);
        string payload = reader.ReadToEnd();

        string id, input;
        try {
            using JsonDocument json = JsonDocument.Parse(payload);
            id    = GetString(json.RootElement, "id");
            input = GetString(json.RootElement, "response")?.Trim();
        }
        catch {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        if (id is null || !sessions.TryGetValue(id, out Session session) || session.codeVerifier is null || session.expires < DateTime.UtcNow.Ticks) {
            return Error("The sign-in has expired. Try again.");
        }

        if (session.refreshToken is not null) {
            return Done(session);
        }

        if (String.IsNullOrEmpty(input)) {
            return Error("Paste the address of the page you were redirected to");
        }

        string code = input;
        int queryIndex = input.IndexOf('?');
        if (queryIndex > -1 || input.Contains("code=")) {
            string query = queryIndex > -1 ? input[(queryIndex + 1)..] : input;
            int fragmentIndex = query.IndexOf('#');
            if (fragmentIndex > -1) query = query[..fragmentIndex];

            NameValueCollection values = HttpUtility.ParseQueryString(query);
            if (values["error"] is string error) {
                return Error(error == "access_denied" ? "Access was denied" : error);
            }

            code = values["code"];
            if (String.IsNullOrEmpty(code)) {
                return Error("The address does not contain a sign-in code");
            }
            if (values["state"] is string state && state != session.state) {
                return Error("This address belongs to a different sign-in attempt");
            }
        }

        try {
            JsonElement response = Post(GOOGLE_TOKEN_URL, new Dictionary<string, string> {
                ["grant_type"]    = "authorization_code",
                ["code"]          = code,
                ["client_id"]     = session.clientId,
                ["client_secret"] = session.clientSecret,
                ["redirect_uri"]  = GOOGLE_REDIRECT_URI,
                ["code_verifier"] = session.codeVerifier
            });

            Accept(session, response);
            return Done(session);
        }
        catch (Exception ex) {
            return Error(ex.Message);
        }
    }

    public static bool TakeSession(string id, SmtpProfiles.Provider provider, out string clientId, out string clientSecret, out string tenant, out string refreshToken, out string email) {
        clientId = clientSecret = tenant = refreshToken = email = null;

        if (!sessions.TryRemove(id, out Session session)) return false;
        if (session.refreshToken is null || session.provider != provider || session.expires < DateTime.UtcNow.Ticks) return false;

        clientId     = session.clientId;
        clientSecret = session.clientSecret;
        tenant       = session.tenant;
        refreshToken = session.refreshToken;
        email        = session.email;
        return true;
    }

    public static string GetAccessToken(SmtpProfiles.Profile profile) {
        if (accessTokens.TryGetValue(profile.guid, out AccessToken cached) && cached.expires > DateTime.UtcNow.Ticks) {
            return cached.token;
        }

        lock (refreshMutex) {
            if (accessTokens.TryGetValue(profile.guid, out cached) && cached.expires > DateTime.UtcNow.Ticks) {
                return cached.token;
            }

            SmtpProfiles.Profile stored = Array.Find(SmtpProfiles.Load(), o => o.guid == profile.guid) ?? profile;
            if (String.IsNullOrEmpty(stored.refreshToken)) {
                throw new InvalidOperationException("This SMTP profile is not signed in. Sign in again from the SMTP profile.");
            }

            JsonElement response;
            try {
                response = stored.provider == SmtpProfiles.Provider.Outlook
                    ? Post($"{MICROSOFT_AUTHORITY}/{stored.tenant ?? "common"}/oauth2/v2.0/token", new Dictionary<string, string> {
                        ["grant_type"]    = "refresh_token",
                        ["client_id"]     = stored.clientId,
                        ["refresh_token"] = stored.refreshToken,
                        ["scope"]         = MICROSOFT_SCOPE
                    })
                    : Post(GOOGLE_TOKEN_URL, new Dictionary<string, string> {
                        ["grant_type"]    = "refresh_token",
                        ["client_id"]     = stored.clientId,
                        ["client_secret"] = stored.clientSecret,
                        ["refresh_token"] = stored.refreshToken
                    });
            }
            catch (OAuthException ex) when (ex.Code == "invalid_grant") {
                throw new OAuthException(ex.Code, "The sign-in has expired or was revoked. Sign in again from the SMTP profile.");
            }

            string token = response.GetProperty("access_token").GetString();
            accessTokens[profile.guid] = new AccessToken(token, DateTime.UtcNow.Ticks + (ExpiresIn(response) - 300) * TimeSpan.TicksPerSecond);

            if (response.TryGetProperty("refresh_token", out JsonElement rotated)
                && rotated.GetString() is string newRefreshToken
                && newRefreshToken.Length > 0
                && newRefreshToken != stored.refreshToken) {
                SmtpProfiles.UpdateRefreshToken(profile.guid, newRefreshToken);
            }

            return token;
        }
    }

    public static void ForgetAccessToken(Guid guid) {
        accessTokens.TryRemove(guid, out _);
    }

    public static void ClearCache() {
        accessTokens.Clear();
    }

    private static void Accept(Session session, JsonElement response) {
        string refreshToken = GetString(response, "refresh_token");
        if (String.IsNullOrEmpty(refreshToken)) {
            throw new OAuthException("no_refresh_token", "The provider did not return a refresh token");
        }

        string email = null;
        if (GetString(response, "id_token") is string idToken) {
            string[] parts = idToken.Split('.');
            if (parts.Length > 1) {
                using JsonDocument claims = JsonDocument.Parse(Base64Url.DecodeFromChars(parts[1]));
                email = GetString(claims.RootElement, "email") ?? GetString(claims.RootElement, "preferred_username");
            }
        }

        if (String.IsNullOrEmpty(email)) {
            throw new OAuthException("no_email", "The provider did not return the account's e-mail address");
        }

        session.email = email;
        session.refreshToken = refreshToken;
        session.expires = DateTime.UtcNow.Ticks + SESSION_LIFETIME;
    }

    private static JsonElement Post(string url, Dictionary<string, string> form) {
        using HttpRequestMessage request = new HttpRequestMessage(HttpMethod.Post, url) {
            Content = new FormUrlEncodedContent(form)
        };

        using HttpResponseMessage response = httpClient.Send(request);
        using Stream stream = response.Content.ReadAsStream();

        JsonElement root;
        try {
            using JsonDocument json = JsonDocument.Parse(stream);
            root = json.RootElement.Clone();
        }
        catch (JsonException) {
            throw new OAuthException("invalid_response", $"Unexpected response from the provider ({(int)response.StatusCode})");
        }

        if (GetString(root, "error") is string error) {
            string description = GetString(root, "error_description") ?? error;
            int end = description.IndexOfAny(['\r', '\n']);
            int trace = description.IndexOf(" Trace ID:", StringComparison.Ordinal);
            if (trace > 0 && (end < 0 || trace < end)) end = trace;
            throw new OAuthException(error, end > 0 ? description[..end].Trim() : description);
        }

        if (!response.IsSuccessStatusCode) {
            throw new OAuthException("http_error", $"The provider responded with HTTP {(int)response.StatusCode}");
        }

        return root;
    }

    private static byte[] Done(Session session) {
        return Encoding.UTF8.GetBytes($"{{\"status\":\"done\",\"username\":\"{Data.EscapeJsonText(session.email)}\"}}");
    }

    private static byte[] Error(string message) {
        return Encoding.UTF8.GetBytes($"{{\"error\":\"{Data.EscapeJsonText(message)}\"}}");
    }

    private static void PurgeExpired() {
        long now = DateTime.UtcNow.Ticks;
        foreach (KeyValuePair<string, Session> pair in sessions) {
            if (pair.Value.expires < now) sessions.TryRemove(pair.Key, out _);
        }
    }

    private static int ExpiresIn(JsonElement response) {
        if (!response.TryGetProperty("expires_in", out JsonElement element)) return 3600;
        if (element.ValueKind == JsonValueKind.Number) return element.GetInt32();
        return Int32.TryParse(element.GetString(), out int seconds) ? seconds : 3600;
    }

    private static string GetString(JsonElement element, string name) {
        return element.ValueKind == JsonValueKind.Object
            && element.TryGetProperty(name, out JsonElement value)
            && value.ValueKind == JsonValueKind.String ? value.GetString() : null;
    }
}

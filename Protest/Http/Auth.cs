using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using OtpNet;

namespace Protest.Http;

internal static class Auth {
    private const long HOUR = 36_000_000_000L;
    private const long SESSION_TIMEOUT = 120L * HOUR; //5 days

    private const long RATE_LIMIT_TIME_WINDOW = 6_000_000_000; //10 minutes
    private const int MAX_REQUESTS_PER_WIN_PERIOD = 8;
    private static readonly ConcurrentDictionary<IPAddress, List<long>> rateLimLog = new ConcurrentDictionary<IPAddress, List<long>>();

    private static readonly JsonSerializerOptions serializerOptions;

    private static readonly ConcurrentDictionary<string, OtpToken> otpTokens = new();

    internal static readonly ConcurrentDictionary<string, AccessControl> rbac = new();
    internal static readonly ConcurrentDictionary<string, Session> sessions = new();

    private record OtpToken {
        public string tokenId;
        public string username;
        public bool   enrolled;
        public byte[] secret;
    }

    internal record AccessControl {
        public string username;
        public string email;
        public string domain;
        public byte[] passwordHash;
        public byte[] totpSecret;
        public string alias;
        public string color;
        public bool isDomainUser;
        public string[] authorization;
        public HashSet<string> accessPath;
    }

    internal record Session {
        public AccessControl access;
        public IPAddress ip;
        public string sessionId;
        public long loginDate;
        public long ttl;
    }

    static Auth() {
        serializerOptions = new JsonSerializerOptions();
        serializerOptions.Converters.Add(new AccessControlJsonConverter());
    }

    internal static bool IsAuthenticated(HttpListenerContext ctx) {
        IPAddress remoteIp = ctx.Request.RemoteEndPoint.Address;
        if (IPAddress.IsLoopback(remoteIp) && Configuration.backdoor) return true;

        string sessionId = ctx.Request.Cookies["sessionid"]?.Value ?? null;
        if (sessionId is null) return false;

        if (!sessions.TryGetValue(sessionId, out Session session)) {
            return false;
        }

        if (DateTime.UtcNow.Ticks - session.loginDate > session.ttl) { //expired
            RevokeAccess(sessionId);
            return false;
        }

        return true;
    }

    internal static bool IsAuthorized(HttpListenerContext ctx, string path) {
        IPAddress remoteIp = ctx.Request.RemoteEndPoint.Address;
        if (IPAddress.IsLoopback(remoteIp) && Configuration.backdoor) return true;

        string sessionId = ctx.Request.Cookies["sessionid"]?.Value ?? null;
        if (sessionId is null) {
            return false;
        }

        if (!sessions.TryGetValue(sessionId, out Session session)) {
            return false;
        }

        return session.access.accessPath.Contains(path);
    }

    internal static bool IsAuthenticatedAndAuthorized(HttpListenerContext ctx, string path) {
        IPAddress remoteIp = ctx.Request.RemoteEndPoint.Address;
        if (IPAddress.IsLoopback(remoteIp) && Configuration.backdoor) return true;

        string sessionId = ctx.Request.Cookies["sessionid"]?.Value ?? null;
        if (sessionId is null) {
            return false;
        }

        if (!sessions.TryGetValue(sessionId, out Session session)) {
            return false;
        }

        if (DateTime.UtcNow.Ticks - session.loginDate > session.ttl) { //expired
            RevokeAccess(sessionId);
            return false;
        }

        return session.access.accessPath.Contains(path);
    }

    private static bool IsRateLimited(IPAddress clientIP) {
        List<long> timestamps = rateLimLog.GetOrAdd(clientIP, _ => new List<long>(5));

        long currentTime = DateTime.UtcNow.Ticks;
        for (int i = timestamps.Count - 1; i >= 0; i--) {
            if (currentTime - timestamps[i] > RATE_LIMIT_TIME_WINDOW) {
                timestamps.RemoveAt(i);
            }
        }

        if (rateLimLog[clientIP].Count >= MAX_REQUESTS_PER_WIN_PERIOD) {
            return true;
        }

        timestamps.Add(currentTime);
        return false;
    }

    internal static bool AuthHandler(HttpListenerContext ctx) {
        if (!String.Equals(ctx.Request.HttpMethod, "POST", StringComparison.Ordinal)) {
            ctx.Response.StatusCode = (int)HttpStatusCode.BadRequest;
            return false;
        }

        IPAddress clientIP = ctx.Request.RemoteEndPoint?.Address;
        if (clientIP is null) {
            ctx.Response.StatusCode = (int)HttpStatusCode.BadRequest;
            return false;
        }

        if (IsRateLimited(clientIP)) {
            ctx.Response.StatusCode = (int)HttpStatusCode.TooManyRequests;
            return false;
        }

        using StreamReader streamReader = new StreamReader(ctx.Request.InputStream);
        string payload = streamReader.ReadToEnd();
        string[] array = payload.Split((char)127);

        if (array.Length == 0) {
            ctx.Response.StatusCode = (int)HttpStatusCode.BadRequest;
            return false;
        }

        int.TryParse(array[0], out int status);

        switch (status) {
        case -1: return TotpEnrollment(ctx, array);
        case  1: return PrimaryFactorAuthentication(ctx, array);
        case  2: return TotpAuthentication(ctx, array);
        }

        return false;
    }
 
    internal static bool PrimaryFactorAuthentication(HttpListenerContext ctx, string[] array) {
        if (array.Length < 3) {
            ctx.Response.StatusCode = (int)HttpStatusCode.Unauthorized;
            return false;
        }

        string username = array[1].ToLower();
        string password = array[2];

        if (!rbac.TryGetValue(username, out AccessControl access)) {
            ctx.Response.StatusCode = (int)HttpStatusCode.Unauthorized;
            return false;
        }

#if !DEBUG
        Thread.Sleep(rng.Next(250));
#endif

        bool isSuccessful = access.isDomainUser && OperatingSystem.IsWindows()
            ? Protocols.Ldap.TryDirectoryAuthentication(username, password)
            : Cryptography.HashUsernameAndPassword(username, password).SequenceEqual(access.passwordHash);

        if (isSuccessful) {
            Logger.Action(username, $"Primary factor authentication succeeded from {ctx.Request.RemoteEndPoint.Address}");
            ctx.Response.StatusCode = (int)HttpStatusCode.Accepted;

            string tokenId      = Cryptography.RandomStringGenerator(32);
            bool isEnrolled     = access.totpSecret is not null;
            byte[] secret       = isEnrolled ? access.totpSecret : GenerateTotpSecret(40);
            string secretString = OtpNet.Base32Encoding.ToString(secret);

            otpTokens[tokenId] = new OtpToken() {
                tokenId  = tokenId,
                username = username,
                enrolled = isEnrolled,
                secret   = secret
            };

            if (isEnrolled) {
                byte[] buffer = System.Text.Encoding.UTF8.GetBytes($"{{\"status\":2,\"token\":\"{tokenId}\"}}");
                ctx.Response.OutputStream.Write(buffer, 0, buffer.Length);
            }
            else {
                byte[] buffer = System.Text.Encoding.UTF8.GetBytes($"{{\"status\":-1,\"secret\":\"{secretString}\",\"token\":\"{tokenId}\"}}");
                ctx.Response.OutputStream.Write(buffer, 0, buffer.Length);
            }

            return true;
        }

        Logger.Action(username, $"Primary factor authentication failed from {ctx.Request.RemoteEndPoint.Address}");
        ctx.Response.StatusCode = (int)HttpStatusCode.Unauthorized;
        return false;
    }

    private static bool TotpAuthentication(HttpListenerContext ctx, string[] array) {
        if (array.Length < 4) {
            ctx.Response.StatusCode = (int)HttpStatusCode.Unauthorized;
            return false;
        }

        string username = array[1].ToLower();
        string tokenId  = array[2];
        string totp     = array[3];

        if (!otpTokens.TryGetValue(tokenId, out OtpToken token)) return false;

        if (!token.enrolled) return false;

        bool isSuccessful = ValidateTotp(token.secret, totp);

        if (isSuccessful) {
            GrandAccess(ctx, token.username);

            Logger.Action(token.username, $"Secondary factor authentication succeeded from {ctx.Request.RemoteEndPoint.Address}");
            ctx.Response.StatusCode = (int)HttpStatusCode.Accepted;
            byte[] buffer = System.Text.Encoding.UTF8.GetBytes("{\"status\":0}");
            ctx.Response.OutputStream.Write(buffer, 0, buffer.Length);
        }
        else {
            Logger.Action(token.username, $"Secondary factor authentication failed from {ctx.Request.RemoteEndPoint.Address}");
            ctx.Response.StatusCode = (int)HttpStatusCode.Unauthorized;
        }

        return isSuccessful;
    }

    private static bool TotpEnrollment(HttpListenerContext ctx, string[] array) {
        if (array.Length < 4) {
            ctx.Response.StatusCode = (int)HttpStatusCode.Unauthorized;
            return false;
        }

        string username = array[1].ToLower();
        string tokenId  = array[2];
        string totp     = array[3];

        if (!otpTokens.TryGetValue(tokenId, out OtpToken token)) return false;
        if (token.enrolled) return false;
        if (token.username != username) return false;

        bool isSuccessful = ValidateTotp(token.secret, totp);

        if (isSuccessful) {
            GrandAccess(ctx, token.username);
            SetUserTotpSecret(token.username, token.secret);

            Logger.Action(token.username, $"TOTP enrollment succeeded from {ctx.Request.RemoteEndPoint.Address}");
            ctx.Response.StatusCode = (int)HttpStatusCode.Accepted;
            byte[] buffer = System.Text.Encoding.UTF8.GetBytes("{\"status\":0}");
            ctx.Response.OutputStream.Write(buffer, 0, buffer.Length);
        }
        else {
            Logger.Action(token.username, $"TOTP enrollment failed from {ctx.Request.RemoteEndPoint.Address}");
            ctx.Response.StatusCode = (int)HttpStatusCode.Unauthorized;
        }

        return isSuccessful;
    }

    private static bool ValidateTotp(byte[] secret, string userTotp) {
        if (secret is null || secret.Length == 0) return false;
        Totp totp = new Totp(secret);
        return totp.VerifyTotp(userTotp, out _, new VerificationWindow(previous: 1, future: 1));
    }

    private static byte[] GenerateTotpSecret(int sizeBytes=40) {
        byte[] secret = new byte[sizeBytes];
        RandomNumberGenerator.Fill(secret);
        return secret;
    }

    internal static string GrandAccess(HttpListenerContext ctx, string username) {
        string sessionId = Cryptography.RandomStringGenerator(72);
        string userHostName = ctx.Request.UserHostName.Split(':')[0];

        //RFC6265: no port in the "Domain" attribute
#if DEBUG
        ctx.Response.AddHeader("Set-Cookie", $"sessionid={sessionId}; Domain={userHostName}; Max-age=604800; HttpOnly; SameSite=Strict;");
#else
        ctx.Response.AddHeader("Set-Cookie", $"sessionid={sessionId}; Domain={userHostName}; Max-age=604800; HttpOnly; SameSite=Strict; Secure;");
#endif

        Session newSession = new Session() {
            access    = rbac.TryGetValue(username, out AccessControl value) ? value : default(AccessControl)!,
            ip        = ctx.Request.RemoteEndPoint.Address,
            sessionId = sessionId,
            loginDate = DateTime.UtcNow.Ticks,
            ttl       = SESSION_TIMEOUT,
        };

        if (sessions.TryAdd(sessionId, newSession)) {
            return sessionId;
        }

        return null;
    }

    internal static bool RevokeAccess(HttpListenerContext ctx, string origin) {
        string sessionId = ctx.Request.Cookies["sessionid"]?.Value ?? null;
        if (sessionId is null) return false;
        return RevokeAccess(sessionId, origin);
    }
    internal static bool RevokeAccess(string sessionId, string origin = null) {
        if (sessionId is null) return false;
        if (!sessions.ContainsKey(sessionId)) return false;

        if (sessions.TryRemove(sessionId, out _)) {
            if (origin != null) Logger.Action(origin, $"User actively logged out");
            ((Func<System.Threading.Tasks.Task>)(async () => await KeepAlive.CloseConnection(sessionId)))();
            return true;
        }

        return false;
    }

    internal static string GetUsername(string sessionId) {
        if (sessionId is null) return null;

        if (sessions.TryGetValue(sessionId, out Session session)) {
            return session.access.username;
        }

        return null;
    }

    private static bool SetUserTotpSecret(string username, byte[] secret) {
        if (username is null) return false;

        if (!rbac.TryRemove(username, out AccessControl access)) return false;

        access.totpSecret = secret;

        byte[] plain = JsonSerializer.SerializeToUtf8Bytes(access, serializerOptions);
        byte[] cipher = Cryptography.Encrypt(plain, Configuration.DB_KEY, Configuration.DB_KEY_IV);

        try {
            File.WriteAllBytes($"{Data.DIR_RBAC}{Data.DELIMITER}{access.username}", cipher);
        }
        catch (Exception ex) {
            Logger.Error(ex);
            return false;
        }

        return true;
    }

    private static HashSet<string> PopulateAccessPath(string[] accessList) {
        HashSet<string> path = new HashSet<string> {
            "/global",
            "/logout",
            "/version",
            "/contacts",
            "/barcode39",
            "/barcode128",
            "/ws/keepalive"
        };

        for (int i = 0; i < accessList.Length; i++) {
            switch (accessList[i]) {
            case "devices:read":
                path.Add("/db/device/list");
                path.Add("/db/device/timeline");
                path.Add("/db/config/view");
                break;

            case "devices:write":
                path.Add("/db/device/save");
                path.Add("/db/device/delete");
                path.Add("/db/device/grid");
                path.Add("/db/config/save");
                path.Add("/db/config/fetch");
                path.Add("/db/config/extract");
                break;

            case "users:read":
                path.Add("/db/user/list");
                path.Add("/db/user/timeline");
                break;

            case "users:write":
                path.Add("/db/user/save");
                path.Add("/db/user/delete");
                path.Add("/db/user/grid");
                break;

            case "passwords:read":
                path.Add("/db/device/attribute");
                path.Add("/db/user/attribute");
                path.Add("/db/getentropy");
                path.Add("/db/gandalf");
                break;

            case "fetch:write":
                path.Add("/fetch/networkinfo");
                path.Add("/fetch/singledevice");
                path.Add("/fetch/singleuser");
                path.Add("/fetch/status");
                path.Add("/fetch/devices");
                path.Add("/fetch/users");
                path.Add("/fetch/approve");
                path.Add("/fetch/abort");
                path.Add("/fetch/discard");
                path.Add("/fetch/import");
                break;

            case "manage hosts:write":
                path.Add("/manage/device/wol");
                path.Add("/manage/device/shutdown");
                path.Add("/manage/device/reboot");
                path.Add("/manage/device/logoff");
                path.Add("/manage/device/printtest");
                path.Add("/manage/device/getfiles");
                path.Add("/lifeline/ping/view");
                path.Add("/lifeline/cpu/view");
                path.Add("/lifeline/memory/view");
                path.Add("/lifeline/disk/view");
                path.Add("/lifeline/diskio/view");
                path.Add("/lifeline/printcount/view");
                path.Add("/lifeline/switchcount/view");
                path.Add("/ws/livestats/device");
                path.Add("/ws/monitor");
                break;

            case "manage users:write":
                path.Add("/manage/user/unlock");
                path.Add("/manage/user/enable");
                path.Add("/manage/user/disable");
                path.Add("/ws/livestats/user");
                break;

            case "chat:read":
                path.Add("/chat/read");
                path.Add("/chat/history");
                break;

            case "chat:write":
                path.Add("/chat/write");
                break;

            case "documentation:read":
                path.Add("/docs/list");
                path.Add("/docs/view");
                break;

            case "documentation:write":
                path.Add("/docs/create");
                path.Add("/docs/delete");
                break;

            case "debit notes:read":
                path.Add("/debit/list");
                path.Add("/debit/view");
                break;

            case "debit notes:write":
                path.Add("/debit/create");
                path.Add("/debit/delete");
                path.Add("/debit/return");
                path.Add("/debit/templates");
                path.Add("/debit/banners");
                break;

            case "watchdog:write":
                path.Add("/ws/watchdog");
                path.Add("/watchdog/list");
                path.Add("/watchdog/view");
                path.Add("/watchdog/create");
                path.Add("/watchdog/delete");
                path.Add("/notifications/list");
                path.Add("/notifications/save");
                break;

            case "network utilities:write":
                path.Add("/ws/ping");
                path.Add("/ws/dhcp");
                path.Add("/ws/portscan");
                path.Add("/ws/traceroute");
                path.Add("/ws/sitecheck");
                path.Add("/ws/ipdiscovery");
                path.Add("/tools/nics/list");
                path.Add("/tools/bulkping");
                path.Add("/tools/dnslookup");
                path.Add("/tools/ntp");
                path.Add("/tools/locateip");
                path.Add("/tools/maclookup");
                //path.Add("/tools/downstream");
                //path.Add("/tools/upstream");
                break;

            case "telnet:write":
                path.Add("/ws/telnet");
                break;

            case "secure shell:write":
                path.Add("/ws/ssh");
                break;

            case "wmi:write":
                path.Add("/wmi/query");
                path.Add("/wmi/killprocess");
                break;

            case "snmp pooling:write":
                path.Add("/ws/topology");
                path.Add("/snmp/get");
                path.Add("/snmp/set");
                path.Add("/snmp/walk");
                path.Add("/snmp/switchinterface");
                break;

            /*case "snmp traps:write":
                path.Add("");
                break;*/

            /*case "scripts:write":
                path.Add("");
                break;*/

            case "automation:write":
                path.Add("/tasks/list");
                path.Add("/tasks/start");
                path.Add("/tasks/stop");
                break;

            case "api links:write":
                path.Add("/api/list");
                path.Add("/api/save");
                break;

            case "rbac:write":
                path.Add("/rbac/list");
                path.Add("/rbac/create");
                path.Add("/rbac/delete");
                path.Add("/rbac/sessions");
                path.Add("/rbac/kickuser");
                path.Add("/rbac/reregistermfa");
                break;

            case "reverse proxy:write":
                path.Add("/ws/reverseproxy");
                path.Add("/rproxy/list");
                path.Add("/rproxy/create");
                path.Add("/rproxy/delete");
                path.Add("/rproxy/start");
                path.Add("/rproxy/stop");
                break;

            case "issues:write":
                path.Add("/ws/issues");
                path.Add("/issues/start");
                break;

            case "environment:write":
                path.Add("/config/zones/list");
                path.Add("/config/zones/save");
                path.Add("/config/dhcprange/list");
                path.Add("/config/dhcprange/save");
                path.Add("/config/smtpprofiles/list");
                path.Add("/config/smtpprofiles/save");
                path.Add("/config/smtpprofiles/test");
                path.Add("/config/snmpprofiles/list");
                path.Add("/config/snmpprofiles/save");
                path.Add("/config/checkupdate");
                break;

            case "log:write":
                path.Add("/log");
                path.Add("/log/list");
                break;

            case "certificates:write":
                path.Add("/config/cert/list");
                path.Add("/config/cert/upload");
                path.Add("/config/cert/create");
                path.Add("/config/cert/delete");
                break;

            case "backup:write":
                path.Add("/config/backup/list");
                path.Add("/config/backup/create");
                path.Add("/config/backup/delete");
                path.Add("/config/backup/download");
                break;

            /*case "update:write":
                path.Add("");
                break;
            */
            }
        }

        return path;
    }

    internal static bool LoadRbac() {
        DirectoryInfo dirRbac = new DirectoryInfo(Data.DIR_RBAC);
        if (!dirRbac.Exists) return false;

        rbac.Clear();

        FileInfo[] files = dirRbac.GetFiles();
        for (int i = 0; i < files.Length; i++) {
            byte[] cipher;
            try {
                cipher = File.ReadAllBytes(files[i].FullName);
                byte[] plain = Cryptography.Decrypt(cipher, Configuration.DB_KEY, Configuration.DB_KEY_IV);

                AccessControl access = JsonSerializer.Deserialize<AccessControl>(plain, serializerOptions);
                access.accessPath = PopulateAccessPath(access.authorization);
                rbac.TryAdd(access.username, access);
            }
            catch (Exception ex) {
                Logger.Error(ex);
            }
        }

        return true;
    }

    internal static byte[] ListUsers() {
        StringBuilder builder = new StringBuilder();
        builder.Append('[');

        bool first = true;
        foreach (KeyValuePair<string, AccessControl> access in rbac) {
            if (!first) builder.Append(',');

            builder.Append('{');
            builder.Append($"\"username\":\"{Data.EscapeJsonText(access.Value.username)}\",");
            builder.Append($"\"email\":\"{Data.EscapeJsonText(access.Value.email)}\",");
            builder.Append($"\"domain\":\"{Data.EscapeJsonText(access.Value.domain)}\",");
            //builder.Append($"\"password\":\"{access.Value.hash}\",");
            builder.Append($"\"alias\":\"{Data.EscapeJsonText(access.Value.alias)}\",");
            builder.Append($"\"color\":\"{Data.EscapeJsonText(access.Value.color)}\",");
            builder.Append($"\"isDomain\":{(access.Value.isDomainUser ? "true" : "false")},");

            builder.Append($"\"isRegistered\":{(access.Value.totpSecret is not null ? "true" : "false")},");

            builder.Append($"\"authorization\":[");
            bool firstAuth = true;
            for (int i=0; i<access.Value.authorization.Length; i++) {
                if (!firstAuth) builder.Append(',');
                builder.Append($"\"{access.Value.authorization[i]}\"");
                firstAuth = false;
            }
            builder.Append(']');

            builder.Append('}');

            first = false;
        }

        builder.Append(']');

        return Encoding.UTF8.GetBytes(builder.ToString());
    }

    internal static byte[] CreateUser(HttpListenerContext ctx, Dictionary<string, string> parameters, string origin) {
        if (parameters is null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        if (!parameters.TryGetValue("username", out string username)) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        using StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding);
        string permissionsString = reader.ReadToEnd();

        parameters.TryGetValue("domain", out string domain);
        parameters.TryGetValue("email", out string email);
        parameters.TryGetValue("password", out string password);

        parameters.TryGetValue("alias", out string alias);
        parameters.TryGetValue("color", out string color);
        parameters.TryGetValue("isdomain", out string isDomainString);

        username = Uri.UnescapeDataString(username).ToLower();
        email    = Uri.UnescapeDataString(email);
        password = Uri.UnescapeDataString(password);
        alias    = Uri.UnescapeDataString(alias);
        color    = Uri.UnescapeDataString(color);
        bool isDomainUser = Uri.UnescapeDataString(isDomainString) == "true";

        if (username is null) return Data.CODE_INVALID_ARGUMENT.Array;

        AccessControl access;
        if (rbac.TryRemove(username, out AccessControl exists)) {
            access = exists;
            access.username     = username;
            access.email        = email;
            access.domain       = domain;
            access.passwordHash = String.IsNullOrEmpty(password) ? access.passwordHash : Cryptography.HashUsernameAndPassword(username, password);
            access.totpSecret   = null;
            access.alias        = alias;
            access.color        = color;
            access.isDomainUser = isDomainUser;
        }
        else {
            if (String.IsNullOrEmpty(password) && !isDomainUser) {
                return "{\"error\":\"please enter password\"}"u8.ToArray();
            }

            access = new AccessControl {
                username     = username,
                domain       = domain,
                passwordHash = Cryptography.HashUsernameAndPassword(username, password),
                totpSecret   = null,
                alias        = alias,
                color        = color,
                isDomainUser = isDomainUser
            };
        }
        if (permissionsString == "[]") permissionsString = String.Empty;
        if (permissionsString.Length >= 1 && permissionsString.StartsWith('[')) permissionsString = permissionsString[1..];
        if (permissionsString.Length >= 1 && permissionsString.EndsWith(']')) permissionsString = permissionsString[..^1];

        access.authorization = permissionsString.Length == 0 ? Array.Empty<string>() : permissionsString.Split(',').Select(o => o.Trim()[1..^1]).ToArray();
        access.accessPath = PopulateAccessPath(access.authorization);

        if (!rbac.TryAdd(username, access)) {
            return "{\"error\":\"failed to create user.\"}"u8.ToArray();
        }

        byte[] plain = JsonSerializer.SerializeToUtf8Bytes(access, serializerOptions);
        byte[] cipher = Cryptography.Encrypt(plain, Configuration.DB_KEY, Configuration.DB_KEY_IV);

        try {
            if (!Directory.Exists(Data.DIR_RBAC)) {
                Directory.CreateDirectory(Data.DIR_RBAC);
            }

            File.WriteAllBytes($"{Data.DIR_RBAC}{Data.DELIMITER}{access.username}", cipher);
        }
        catch (Exception ex) {
            Logger.Error(ex);
            return "{\"error\":\"failed to write user file.\"}"u8.ToArray();
        }

        Logger.Action(origin, $"Save RBAC for {username}");

        KeepAlive.Unicast(username, $"{{\"action\":\"update-rbac\",\"authorization\":[{permissionsString}]}}", "/global");

        return plain;
    }

    internal static byte[] DeleteUser(Dictionary<string, string> parameters, string origin) {
        if (parameters is null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        if (!parameters.TryGetValue("username", out string username)) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        if (username is null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        rbac.TryRemove(username, out _);

        foreach (KeyValuePair<string, Session> pair in sessions) {
            if (pair.Value.access.username == username) {
                RevokeAccess(pair.Value.sessionId);
            }
        }

        try {
            File.Delete($"{Data.DIR_RBAC}{Data.DELIMITER}{username}");
        }
        catch (Exception ex) {
            Logger.Error(ex);
            return "{\"error\":\"failed to write user file.\"}"u8.ToArray();
        }

        Logger.Action(origin, $"Delete RBAC for {username}");

        return "{\"status\":\"ok\"}"u8.ToArray();
    }

    internal static byte[] ResetMfaSecret(Dictionary<string, string> parameters, string origin) {
        if (parameters is null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        if (!parameters.TryGetValue("username", out string username)) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        if (username is null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        if (SetUserTotpSecret(username, null)) {
            Logger.Action(origin, $"Re-register MFA for {username}");
            return "{\"status\":\"ok\"}"u8.ToArray();
        }
        else {
            return "{\"status\":\"failed\"}"u8.ToArray();
        }
    }

    internal static byte[] ListSessions() {
        StringBuilder builder = new StringBuilder();
        bool first = true;

        builder.Append('[');

        foreach (Session session in sessions.Values) {
            if (!first) builder.Append(',');

            builder.Append('{');
            builder.Append($"\"username\":\"{Data.EscapeJsonText(session.access.username)}\",");
            builder.Append($"\"ip\":\"{session.ip}\",");
            builder.Append($"\"id\":\"{(session.sessionId.Length >= 8 ? session.sessionId[..8] : session.sessionId)}\",");
            builder.Append($"\"logindate\":{session.loginDate},");
            builder.Append($"\"ttl\":{session.ttl}");
            builder.Append('}');

            first = false;
        }

        builder.Append(']');

        return Encoding.UTF8.GetBytes(builder.ToString());
    }

    internal static byte[] KickUser(Dictionary<string, string> parameters, string origin) {
        if (parameters is null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        parameters.TryGetValue("username", out string username);
        parameters.TryGetValue("ip", out string ip);
        parameters.TryGetValue("id", out string id);

        foreach (Session session in sessions.Values) {
            if (session.access.username != username) continue;
            if (session.ip.ToString() != ip) continue;
            if (session.sessionId.Length == 0 || !session.sessionId.StartsWith(id)) continue;

            if (RevokeAccess(session.sessionId, origin)) {
                return Data.CODE_OK.ToArray();
            }
            else {
                return Data.CODE_FAILED.ToArray();
            }
        }

        return Data.CODE_FAILED.ToArray();
    }

    internal static void UpdateSessionTtl(string sessionId, long ttl) {
        if (!sessions.TryGetValue(sessionId, out Session session)) return;
        session.ttl = ttl * 24 * HOUR; //in ticks
        sessions[sessionId] = session;
    }
}

file sealed class AccessControlJsonConverter : JsonConverter<Auth.AccessControl> {
    public override Auth.AccessControl Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) {
        Auth.AccessControl access = new Auth.AccessControl();
        while (reader.Read()) {
            if (reader.TokenType == JsonTokenType.EndObject)
                break;

            if (reader.TokenType == JsonTokenType.PropertyName) {
                string propertyName = reader.GetString();
                reader.Read();

                if (propertyName == "username") {
                    access.username = reader.GetString().ToLower();
                }
                else if (propertyName == "email") {
                    access.email = reader.GetString();
                }
                else if (propertyName == "domain") {
                    access.domain = reader.GetString();
                }
                else if (propertyName == "alias") {
                    access.alias = reader.GetString();
                }
                else if (propertyName == "hash") {
                    access.passwordHash = Convert.FromHexString(reader.GetString());
                }
                else if (propertyName == "totp") {
                    string totp = reader.GetString();
                    access.totpSecret = totp is null ? null : Convert.FromHexString(totp);
                }
                else if (propertyName == "color") {
                    access.color = reader.GetString();
                }
                else if (propertyName == "isDomainUser") {
                    access.isDomainUser = reader.GetBoolean();
                }
                else if (propertyName == "authorization") {
                    List<string> list = new List<string>();
                    while (reader.Read() && reader.TokenType != JsonTokenType.EndArray) {
                        list.Add(reader.GetString());
                    }
                    access.authorization = list.ToArray();
                }
                else {
                    reader.Skip();
                }
            }
        }

        return access;
    }

    public override void Write(Utf8JsonWriter writer, Auth.AccessControl value, JsonSerializerOptions options) {
        ReadOnlySpan<byte> _username      = "username"u8;
        ReadOnlySpan<byte> _email         = "email"u8;
        ReadOnlySpan<byte> _domain        = "domain"u8;
        ReadOnlySpan<byte> _alias         = "alias"u8;
        ReadOnlySpan<byte> _color         = "color"u8;
        ReadOnlySpan<byte> _hash          = "hash"u8;
        ReadOnlySpan<byte> _totp          = "totp"u8;
        ReadOnlySpan<byte> _isDomainUser  = "isDomainUser"u8;
        ReadOnlySpan<byte> _authorization = "authorization"u8;

        writer.WriteStartObject();

        writer.WriteString(_username, value.username.ToLower());
        writer.WriteString(_email, value.email);
        writer.WriteString(_domain, value.domain);
        writer.WriteString(_alias, value.alias);
        writer.WriteString(_color, value.color);
        writer.WriteString(_hash, Convert.ToHexString(value.passwordHash));
        writer.WriteString(_totp, value.totpSecret is null ? null: Convert.ToHexString(value.totpSecret));
        writer.WriteBoolean(_isDomainUser, value.isDomainUser);

        writer.WritePropertyName(_authorization);
        writer.WriteStartArray();
        if (value.authorization is not null) {
            for (int i = 0; i < value.authorization.Length; i++) {
                writer.WriteStringValue(value.authorization[i]);
            }
        }
        writer.WriteEndArray();

        writer.WriteEndObject();
    }
}

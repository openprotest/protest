using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;
using OtpNet;

namespace Protest.Http;

internal static class Auth {
    private const int AUTH_BODY_TIMEOUT = 5_000; //milliseconds
    private const long SESSION_TIMEOUT = TimeSpan.TicksPerDay * 5;
    private const long OTP_TOKEN_TIMEOUT = TimeSpan.TicksPerMinute * 5;
    private const int MAX_OTP_ATTEMPTS = 5;

    internal const string DEFAULT_ADMIN_USERNAME = "admin";

#if DEBUG
    internal const string SESSION_COOKIE = "protest-session";
#else
    internal const string SESSION_COOKIE = "__protest-session";
#endif

    private const long RATE_LIMIT_TIME_WINDOW = TimeSpan.TicksPerMinute * 10;
    private const int MAX_REQUESTS_PER_TIME_WINDOW = 10;
    internal static readonly ConcurrentDictionary<IPAddress, ConcurrentQueue<long>> rateLimitLog = new ConcurrentDictionary<IPAddress, ConcurrentQueue<long>>();
    private static long lastRateLimitSweep;

    private static readonly JsonSerializerOptions serializerOptions;
    private static readonly ConcurrentDictionary<string, OtpToken> otpTokens = new();
    private static readonly Dictionary<string, long> lastTotpTimeStep = new();
    private static readonly Lock totpMutex = new();

    //Account changes and session creation must agree on which credentials were verified.
    private static readonly Lock rbacMutex = new();
    internal static readonly ConcurrentDictionary<string, AccessControl> rbac = new();
    internal static readonly ConcurrentDictionary<string, Session> sessions = new();

    internal class OtpToken {
        public string tokenId;
        public string username;
        public object credentialRevision;
        public byte[] secret;
        public long   createdAt;
        public int    failures;
    }

    internal record AccessControl {
        public string          username;
        public string          email;
        public string          domain;
        public byte[]          passwordHash;
        public byte[]          totpSecret;
        public string          alias;
        public string          color;
        public bool            isDomainUser;
        public string[]        authorization;
        public HashSet<string> accessPath;
        //This is only used for pending sign-ins and is never persisted.
        public object          credentialRevision = new();
    }

    internal record Session {
        public AccessControl access;
        public IPAddress     ip;
        public string        sessionId;
        public Guid          guid;
        public long          loginDate;
        public long          ttl;
    }

    static Auth() {
        serializerOptions = new JsonSerializerOptions();
        serializerOptions.Converters.Add(new AccessControlJsonConverter());
    }

    internal static bool IsAuthenticated(HttpListenerContext ctx) {
        IPAddress remoteIp = ctx.Request.RemoteEndPoint.Address;
        if (IPAddress.IsLoopback(remoteIp) && Configuration.backdoor) return true;

        return TryGetActiveSession(ctx.Request.Cookies[SESSION_COOKIE]?.Value, out _);
    }

    internal static bool IsAuthorized(HttpListenerContext ctx, string path) => IsAuthenticatedAndAuthorized(ctx, path);

    //"*" grants every path, including the ones no permission maps to
    internal static bool IsAuthorized(AccessControl access, string path) =>
        access.accessPath.Contains(path) || access.authorization.Contains("*");

    internal static bool IsAuthenticatedAndAuthorized(HttpListenerContext ctx, string path) {
        IPAddress remoteIp = ctx.Request.RemoteEndPoint.Address;
        if (IPAddress.IsLoopback(remoteIp) && Configuration.backdoor) return true;

        return TryGetActiveSession(ctx.Request.Cookies[SESSION_COOKIE]?.Value, out Session session) && IsAuthorized(session.access, path);
    }

    private static bool TryGetActiveSession(string sessionId, out Session session) {
        session = null;
        if (sessionId is null || !sessions.TryGetValue(sessionId, out session)) return false;

        lock (session) {
            return CheckSessionExpiry(session);
        }
    }

    //Check expiry under the same lock that protects TTL changes.
    private static bool CheckSessionExpiry(Session session) {
        if (DateTime.UtcNow.Ticks - session.loginDate <= session.ttl) return true;

        RevokeAccess(session.sessionId);
        return false;
    }

    private static bool IsRateLimited(IPAddress clientIP) {
        long currentTime = DateTime.UtcNow.Ticks;

        long lastSweep = Interlocked.Read(ref lastRateLimitSweep);
        if (currentTime - lastSweep > RATE_LIMIT_TIME_WINDOW && Interlocked.CompareExchange(ref lastRateLimitSweep, currentTime, lastSweep) == lastSweep) {
            EvictIdleRateLimits(currentTime);
        }

        ConcurrentQueue<long> timestamps = rateLimitLog.GetOrAdd(clientIP, _ => new ConcurrentQueue<long>());

        while (timestamps.TryPeek(out long timestamp) && currentTime - timestamp > RATE_LIMIT_TIME_WINDOW) {
            timestamps.TryDequeue(out _);
        }

        if (timestamps.Count >= MAX_REQUESTS_PER_TIME_WINDOW) {
            Logger.Action("System", "AAA", $"Rate limit triggered for host {clientIP}");
            return true;
        }

        timestamps.Enqueue(currentTime);
        return false;
    }

    //every host that ever signed in keeps an entry, drop the ones with no attempt left in the time window
    internal static void EvictIdleRateLimits(long now) {
        foreach (KeyValuePair<IPAddress, ConcurrentQueue<long>> pair in rateLimitLog) {
            while (pair.Value.TryPeek(out long timestamp) && now - timestamp > RATE_LIMIT_TIME_WINDOW) {
                pair.Value.TryDequeue(out _);
            }

            if (pair.Value.IsEmpty) {
                rateLimitLog.TryRemove(pair);
            }
        }
    }

    internal static async Task<bool> AuthHandlerAsync(HttpListenerContext ctx) {
        IPAddress clientIP = ctx.Request.RemoteEndPoint?.Address;
        if (clientIP is null) {
            ctx.Response.StatusCode = (int)HttpStatusCode.BadRequest;
            return false;
        }

        if (IsRateLimited(clientIP)) {
            ctx.Response.StatusCode = (int)HttpStatusCode.TooManyRequests;
            return false;
        }

        string payload = await ReadAuthBodyAsync(ctx);
        if (payload is null) return false;

        string[] array = payload.Split((char)127);

        if (array.Length < 3) {
            ctx.Response.StatusCode = (int)HttpStatusCode.BadRequest;
            return false;
        }

        if (array.Length == 3) {
            return PrimaryFactorAuthentication(ctx, array[1].ToLower(), array[2]);
        }

        return CompleteTotpAuthentication(ctx, array[1].ToLower(), array[2], array[3]);
    }

    private static async Task<string> ReadAuthBodyAsync(HttpListenerContext ctx) {
        byte[] buffer = new byte[(int)ctx.Request.ContentLength64];
        using CancellationTokenSource cts = new CancellationTokenSource(AUTH_BODY_TIMEOUT);

        //pending reads can ignore cancellation, abort the response to close the connection
        using CancellationTokenRegistration abort = cts.Token.Register(() => {
            try {
                ctx.Response.StatusCode = (int)HttpStatusCode.RequestTimeout;
                ctx.Response.Abort();
            }
            catch { }
        });

        bool complete = false;
        try {
            await ctx.Request.InputStream.ReadExactlyAsync(buffer, cts.Token);
            complete = true;
        }
        catch (OperationCanceledException) { }
        catch (HttpListenerException) { }
        catch (IOException) { }
        catch (ObjectDisposedException) { }

        if (!abort.Unregister()) return null;
        if (cts.IsCancellationRequested || !complete) {
            ctx.Response.StatusCode = (int)(cts.IsCancellationRequested ? HttpStatusCode.RequestTimeout : HttpStatusCode.BadRequest);
            return null;
        }

        using StreamReader streamReader = new StreamReader(new MemoryStream(buffer));
        return streamReader.ReadToEnd();
    }

    private static bool PrimaryFactorAuthentication(HttpListenerContext ctx, string username, string password) {
        if (password.Length == 0) {
            ctx.Response.StatusCode = (int)HttpStatusCode.Unauthorized;
            return false;
        }

        AccessControl access;
        object credentialRevision;
        byte[] passwordHash;
        bool isDomainUser;
        lock (rbacMutex) {
            rbac.TryGetValue(username, out access);
            credentialRevision = access?.credentialRevision;
            passwordHash       = access?.passwordHash;
            isDomainUser       = access?.isDomainUser ?? false;
        }

        bool isSuccessful;
        if (isDomainUser && OperatingSystem.IsWindows()) {
            isSuccessful = Protocols.Ldap.TryDirectoryAuthentication(username, password);
        }
        else {
            //Hash unknown users and unsupported domain logins too, to hide their shorter response time.
            byte[] hash = Cryptography.HashUsernameAndPassword(username, password);
            isSuccessful = !isDomainUser && passwordHash is not null && CryptographicOperations.FixedTimeEquals(hash, passwordHash);
        }

        if (!isSuccessful) {
            if (access is not null) {
                Logger.Action(username, "AAA", $"Primary factor authentication failed from {ctx.Request.RemoteEndPoint?.Address}");
            }
            ctx.Response.StatusCode = (int)HttpStatusCode.Unauthorized;
            return false;
        }

#if !DEBUG
        string tokenId = Cryptography.RandomStringGenerator(32);
        bool isEnrolled;
        byte[] secret;
        EvictExpiredOtpTokens();
#endif

        lock (rbacMutex) {
            if (!rbac.TryGetValue(username, out access) || access.credentialRevision != credentialRevision) {
                ctx.Response.StatusCode = (int)HttpStatusCode.Unauthorized;
                return false;
            }

#if DEBUG
            GrantAccess(ctx, access);
#else
            isEnrolled = access.totpSecret is not null;
            secret     = isEnrolled ? access.totpSecret : GenerateTotpSecret(40);
            otpTokens[tokenId] = new OtpToken() {
                tokenId            = tokenId,
                username           = username,
                credentialRevision = credentialRevision,
                secret             = secret,
                createdAt          = DateTime.UtcNow.Ticks
            };
#endif
        }

        Logger.Action(username, "AAA", $"Primary factor authentication succeeded from {ctx.Request.RemoteEndPoint?.Address}");
        ctx.Response.StatusCode = (int)HttpStatusCode.Accepted;
#if DEBUG
        Logger.Action(username, "AAA", $"Skipping TOTP");
        ctx.Response.OutputStream.Write("{\"status\":0}"u8);
#else
        byte[] buffer = Encoding.UTF8.GetBytes(isEnrolled
            ? $"{{\"status\":2,\"token\":\"{tokenId}\"}}"
            : $"{{\"status\":-1,\"secret\":\"{Base32Encoding.ToString(secret)}\",\"token\":\"{tokenId}\"}}");
        ctx.Response.OutputStream.Write(buffer);
#endif

        return true;
    }

    private static bool CompleteTotpAuthentication(HttpListenerContext ctx, string username, string tokenId, string totp) {
        string action;
        lock (rbacMutex) {
            if (!otpTokens.TryGetValue(tokenId, out OtpToken token) || token.username != username) {
                ctx.Response.StatusCode = (int)HttpStatusCode.Unauthorized;
                return false;
            }

            if (DateTime.UtcNow.Ticks - token.createdAt > OTP_TOKEN_TIMEOUT ||
                !rbac.TryGetValue(username, out AccessControl access) ||
                access.credentialRevision != token.credentialRevision) {
                otpTokens.TryRemove(tokenId, out _);
                ctx.Response.StatusCode = (int)HttpStatusCode.Unauthorized;
                return false;
            }

            bool enroll = access.totpSecret is null;
            action = enroll ? "TOTP enrollment" : "Secondary factor authentication";
            if (!ValidateTotp(token, totp)) {
                Logger.Action(username, "AAA", $"{action} failed from {ctx.Request.RemoteEndPoint?.Address}");
                ctx.Response.StatusCode = (int)HttpStatusCode.Unauthorized;
                return false;
            }

            otpTokens.TryRemove(tokenId, out _);
            if (enroll && !SetUserTotpSecret(access, token.secret)) {
                ctx.Response.StatusCode = (int)HttpStatusCode.InternalServerError;
                return false;
            }

            GrantAccess(ctx, access);
        }

        Logger.Action(username, "AAA", $"{action} succeeded from {ctx.Request.RemoteEndPoint?.Address}");
        ctx.Response.StatusCode = (int)HttpStatusCode.Accepted;
        ctx.Response.OutputStream.Write("{\"status\":0}"u8);
        return true;
    }

    //A token takes MAX_OTP_ATTEMPTS wrong codes, then the password has to be entered again.
    //Each code is accepted once, a time step that was already used, or an earlier one, is refused.
    internal static bool ValidateTotp(OtpToken token, string userTotp) {
        if (token.secret is null || token.secret.Length == 0) return false;
        if (token.failures >= MAX_OTP_ATTEMPTS) return false;

        Totp totp = new Totp(token.secret);
        if (totp.VerifyTotp(userTotp, out long timeStep, new VerificationWindow(previous: 1, future: 1))) {
            lock (totpMutex) {
                if (!lastTotpTimeStep.TryGetValue(token.username, out long lastTimeStep) || timeStep > lastTimeStep) {
                    lastTotpTimeStep[token.username] = timeStep;
                    return true;
                }
            }
        }

        if (Interlocked.Increment(ref token.failures) >= MAX_OTP_ATTEMPTS) {
            otpTokens.TryRemove(token.tokenId, out _);
        }

        return false;
    }

    private static byte[] GenerateTotpSecret(int sizeBytes = 40) {
        byte[] secret = new byte[sizeBytes];
        RandomNumberGenerator.Fill(secret);
        return secret;
    }

    private static void EvictExpiredOtpTokens() {
        long now = DateTime.UtcNow.Ticks;
        List<string> expiredKeys = new List<string>();

        foreach (KeyValuePair<string, OtpToken> pair in otpTokens) {
            if (now - pair.Value.createdAt <= OTP_TOKEN_TIMEOUT) continue;
            expiredKeys.Add(pair.Key);
        }

        foreach (string key in expiredKeys) {
            otpTokens.TryRemove(key, out _);
        }
    }

    //Called under rbacMutex, so no sign-in can use the old revision after the secret changes.
    private static bool SetUserTotpSecret(AccessControl access, byte[] secret) {
        if (access.username.Contains("..")) return false;
        if (!SaveAccessControl(access with { totpSecret = secret })) return false;

        access.totpSecret        = secret;
        access.credentialRevision = new();
        return true;
    }

    internal static byte[] ResetMfaSecret(HttpListenerContext ctx, string origin) {
        Dictionary<string, string> parameters = Listener.ParseQuery(ctx);

        if (parameters is null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        if (!parameters.TryGetValue("username", out string username) || username is null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        username = username.ToLower();
        lock (rbacMutex) {
            if (!rbac.TryGetValue(username, out AccessControl access) || !SetUserTotpSecret(access, null)) {
                return "{\"status\":\"failed\"}"u8.ToArray();
            }
            ClearTotpTimeStep(username);
        }

        Logger.Action(origin, "AAA", $"Re-register MFA for {username}");
        return "{\"status\":\"ok\"}"u8.ToArray();
    }

    private static void ClearTotpTimeStep(string username) {
        lock (totpMutex) {
            lastTotpTimeStep.Remove(username);
        }
    }

    private static void GrantAccess(HttpListenerContext ctx, AccessControl access) {
        string sessionId = Cryptography.RandomStringGenerator(72);

        //without Domain the cookie stays on the host the browser used, behind a proxy the Host header names the backend instead
#if DEBUG
        ctx.Response.AddHeader("Set-Cookie", $"{SESSION_COOKIE}={sessionId}; Path=/; Max-age=604800; HttpOnly; SameSite=Strict;");
#else
        ctx.Response.AddHeader("Set-Cookie", $"{SESSION_COOKIE}={sessionId}; Path=/; Max-age=604800; HttpOnly; SameSite=Strict; Secure;");
#endif

        Session newSession = new Session() {
            access    = access,
            ip        = ctx.Request.RemoteEndPoint.Address,
            sessionId = sessionId,
            guid      = Guid.NewGuid(),
            loginDate = DateTime.UtcNow.Ticks,
            ttl       = SESSION_TIMEOUT
        };

        sessions.TryAdd(sessionId, newSession);
    }

    internal static bool RevokeAccess(HttpListenerContext ctx, string origin) {
        string sessionId = ctx.Request.Cookies[SESSION_COOKIE]?.Value;
        if (sessionId is null) return false;
        return RevokeAccess(sessionId, origin);
    }
    internal static bool RevokeAccess(string sessionId, string origin = null) {
        if (sessionId is null) return false;
        if (!sessions.ContainsKey(sessionId)) return false;

        if (sessions.TryRemove(sessionId, out _)) {
            if (origin != null) Logger.Action(origin, "AAA", $"User actively logged out");

            _ = Task.Run(async () => {
                try {
                    await KeepAlive.CloseConnection(sessionId);
                }
                catch (Exception ex) {
                    Logger.Error(ex);
                }
            });

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

    //Prefer the session's username for attribution. The backdoor uses "loopback" when no session is found.
    internal static string GetPrincipal(HttpListenerContext ctx) =>
        GetPrincipal(ctx.Request.Cookies[SESSION_COOKIE]?.Value, ctx.Request.RemoteEndPoint?.Address);

    internal static string GetPrincipal(string sessionId, IPAddress remoteIp) {
        string username = GetUsername(sessionId);
        if (username is not null) return username;
        if (Configuration.backdoor && remoteIp is not null && IPAddress.IsLoopback(remoteIp)) return "loopback";
        return null;
    }

    internal static HashSet<string> PopulateAccessPath(string[] accessList) {
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

            case "vault:read":
                path.Add("/db/device/attribute");
                path.Add("/db/user/attribute");
                path.Add("/vault/credential/list");
                path.Add("/vault/credential/get");
                path.Add("/vault/sshkey/list");
                path.Add("/vault/sshkey/get");
                path.Add("/vault/orphans");
                path.Add("/vault/duplicates");
                break;

            case "vault:write":
                path.Add("/vault/credential/save");
                path.Add("/vault/credential/delete");
                path.Add("/vault/sshkey/save");
                path.Add("/vault/sshkey/delete");
                path.Add("/vault/scan");
                path.Add("/vault/deduplicate");
                break;

            case "fetch:write":
                path.Add("/fetch/networkinfo");
                path.Add("/fetch/integrations");
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
                path.Add("/lifeline/switchstpchanges/view");
                path.Add("/lifeline/months");
                path.Add("/lifeline/devices");
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
                path.Add("/ws/websitecheck");
                path.Add("/ws/ipdiscovery");
                path.Add("/tools/nics/list");
                path.Add("/tools/bulkping");
                path.Add("/tools/dnslookup");
                path.Add("/tools/mdnslookup");
                path.Add("/tools/ntp");
                path.Add("/tools/locateip");
                path.Add("/tools/maclookup");
                path.Add("/speedtest");
                path.Add("/ws/speedtest");
                break;

            case "terminal:write":
                path.Add("/ws/terminal");
                break;

            case "serial console:write":
                path.Add("/serial/ports");
                path.Add("/ws/serial");
                break;

            case "remote shell:write":
                path.Add("/ws/winrm");
                break;

            case "telnet:write":
                path.Add("/ws/telnet");
                break;

            case "secure shell:write":
                path.Add("/ws/ssh");
                path.Add("/ws/sftp");
                path.Add("/sftp/download");
                path.Add("/sftp/upload");
                break;

            case "vnc:write":
                path.Add("/ws/vnc");
                break;

            case "rdp:write":
                path.Add("/ws/rdp");
                break;

            case "rustdesk:write":
                path.Add("/ws/rustdesk");
                break;

            case "rtsp:write":
                path.Add("/ws/rtsp");
                break;

            case "session recordings:write":
                path.Add("/recordings/list");
                path.Add("/recordings/meta");
                path.Add("/ws/recordingplayback");
                break;

            case "wmi:write":
                path.Add("/wmi/query");
                path.Add("/wmi/killprocess");
                break;

            case "snmp polling:write":
                path.Add("/ws/topology");
                path.Add("/snmp/get");
                path.Add("/snmp/set");
                path.Add("/snmp/walk");
                path.Add("/snmp/switchinterface");
                break;

            case "snmp traps:write":
                path.Add("/snmptraps");
                path.Add("/snmptraps/list");
                path.Add("/snmptraps/devices");
                path.Add("/snmptraps/summary");
                path.Add("/snmptraps/listeners/list");
                path.Add("/snmptraps/listeners/save");
                path.Add("/config/smtpprofiles/list");
                path.Add("/config/snmpprofiles/list");
                break;

            /*case "scripts:write":
                path.Add("");
                break;*/

            case "syslog:write":
                path.Add("/syslog");
                path.Add("/syslog/list");
                path.Add("/syslog/devices");
                path.Add("/syslog/summary");
                path.Add("/syslog/listeners/list");
                path.Add("/syslog/listeners/save");
                path.Add("/config/smtpprofiles/list");
                path.Add("/config/cert/list");
                break;

            case "windows events:write":
                path.Add("/winevents");
                path.Add("/winevents/list");
                path.Add("/winevents/devices");
                path.Add("/winevents/summary");
                path.Add("/winevents/fetch");
                break;

            case "scheduler:write":
                path.Add("/scheduler/list");
                path.Add("/scheduler/save");
                path.Add("/scheduler/run");
                break;

            case "integration:write":
                path.Add("/config/integration/types");
                path.Add("/config/integration/list");
                path.Add("/config/integration/get");
                path.Add("/config/integration/save");
                path.Add("/config/integration/delete");
                path.Add("/config/integration/test");
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

            case "infrastructure:write":
                path.Add("/config/zones/list");
                path.Add("/config/zones/save");
                path.Add("/config/dhcprange/list");
                path.Add("/config/dhcprange/save");
                path.Add("/config/smtpprofiles/list");
                path.Add("/config/smtpprofiles/save");
                path.Add("/config/smtpprofiles/test");
                path.Add("/config/smtpprofiles/oauth/start");
                path.Add("/config/smtpprofiles/oauth/poll");
                path.Add("/config/smtpprofiles/oauth/complete");
                path.Add("/config/snmpprofiles/list");
                path.Add("/config/snmpprofiles/save");
                path.Add("/config/rustdesk/get");
                path.Add("/config/rustdesk/save");
                path.Add("/config/checkupdate");
                break;

            case "data retention:write":
                path.Add("/config/dataretention/settings/list");
                path.Add("/config/sessionrecording/get");
                path.Add("/config/dataretention/lifeline");
                path.Add("/config/dataretention/lastseen");
                path.Add("/config/dataretention/watchdog");
                path.Add("/config/dataretention/recordings");
                path.Add("/config/dataretention/logs");
                path.Add("/config/dataretention/syslog");
                path.Add("/config/dataretention/snmptraps");
                path.Add("/config/dataretention/winevents");
                path.Add("/config/dataretention/devicetimeline");
                path.Add("/config/dataretention/usertimeline");
                path.Add("/config/dataretention/settings/save");
                path.Add("/config/sessionrecording/save");
                break;

            case "log:write":
                path.Add("/log");
                path.Add("/log/list");
                break;

            case "certificates:write":
                path.Add("/config/cert/list");
                path.Add("/config/cert/create");
                path.Add("/config/cert/delete");
                path.Add("/config/cert/info");
                path.Add("/config/cert/upload");
                path.Add("/config/cert/download");
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
            try {
                byte[] cipher = File.ReadAllBytes(files[i].FullName);
                byte[] plain = Cryptography.Decrypt(cipher, Configuration.DB_KEY, Configuration.DB_KEY_IV);

                AccessControl access = JsonSerializer.Deserialize<AccessControl>(plain, serializerOptions);

                if (access.authorization is not null && access.authorization.Contains("passwords:read") && !access.authorization.Contains("vault:read")) {
                    access.authorization = access.authorization.Append("vault:read").ToArray();
                }

                //read only permissions became single "allow access" toggles, stored as write
                access.authorization = access.authorization?.Select(o => o switch {
                    "session recordings:read" => "session recordings:write",
                    "windows events:read"     => "windows events:write",
                    _ => o
                }).ToArray();

                access.accessPath = PopulateAccessPath(access.authorization);
                rbac.TryAdd(access.username, access);
            }
            catch (IOException ex) {
                Logger.Error(ex);
            }
            catch (JsonException ex) {
                Logger.Error(ex);
            }
            catch (Exception ex) {
                Logger.Error(ex);
            }
        }

        return true;
    }

    //Until someone signs in, the default admin is the only way in. On every start, while no other RBAC entry exists
    //and the admin has never completed a sign-in, (re)creates it with every permission and a new random password.
    //Returns that password, or null when nothing was written.
    internal static string EnsureDefaultAdmin() {
        bool unusedAdmin = rbac.Count == 1 && rbac.TryGetValue(DEFAULT_ADMIN_USERNAME, out AccessControl admin) && admin.totpSecret is null;
        bool hasEntries  = Directory.Exists(Data.DIR_RBAC) && Directory.EnumerateFileSystemEntries(Data.DIR_RBAC).Any(); //entries that failed to load are never overwritten
        if (hasEntries && !unusedAdmin) return null;

        string password = String.Join('-', Enumerable.Range(0, 4).Select(_ => Cryptography.RandomStringGenerator(4))); //128-bits

        AccessControl access = new AccessControl {
            username      = DEFAULT_ADMIN_USERNAME,
            email         = String.Empty,
            domain        = String.Empty,
            passwordHash  = Cryptography.HashUsernameAndPassword(DEFAULT_ADMIN_USERNAME, password),
            totpSecret    = null,
            alias         = "Administrator",
            color         = "#0080C0",
            isDomainUser  = false,
            authorization = new string[] { "*" }
        };
        access.accessPath = PopulateAccessPath(access.authorization);

        if (!SaveAccessControl(access)) return null;

        rbac[DEFAULT_ADMIN_USERNAME] = access;

        Console.ForegroundColor = ConsoleColor.Yellow;
        Console.WriteLine($"Create accounts for your users, then delete the \"{DEFAULT_ADMIN_USERNAME}\" account.");
        Console.WriteLine("Default credentials:");
        Console.ResetColor();
        Console.WriteLine($"  username: {DEFAULT_ADMIN_USERNAME}");
        Console.WriteLine($"  password: {password}");
        Console.WriteLine();

        return password;
    }

    internal static void PrintAccessWarnings() {
        //signed in at least once, a freshly generated admin has no TOTP secret yet
        if (rbac.TryGetValue(DEFAULT_ADMIN_USERNAME, out AccessControl admin) && admin.totpSecret is not null) {
            Console.ForegroundColor = ConsoleColor.Yellow;
            Console.WriteLine($"Warning: the default \"{DEFAULT_ADMIN_USERNAME}\" account still exists.");
            Console.WriteLine("         Create accounts for your users, then delete it.");
            Console.ResetColor();
            Console.WriteLine();
        }

        if (Configuration.backdoor) {
            Console.ForegroundColor = ConsoleColor.Red;
            Console.WriteLine("The backdoor access is enabled: Requests from the loopback address bypass authentication with full access.");
            Console.WriteLine($"Set \"backdoor = false\" in {Data.FILE_CONFIG} unless you depend on it.");
            Console.ResetColor();
            Console.WriteLine();
        }
    }

    internal static bool SaveAccessControl(AccessControl access) {
        byte[] plain = JsonSerializer.SerializeToUtf8Bytes(access, serializerOptions);
        byte[] cipher = Cryptography.Encrypt(plain, Configuration.DB_KEY, Configuration.DB_KEY_IV);

        try {
            Directory.CreateDirectory(Data.DIR_RBAC);
            File.WriteAllBytes(Path.Join(Data.DIR_RBAC, access.username), cipher);
        }
        catch (Exception ex) {
            Logger.Error(ex);
            return false;
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

    internal static byte[] CreateUser(HttpListenerContext ctx, string origin) {
        Dictionary<string, string> parameters = Listener.ParseQuery(ctx);

        if (parameters is null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        if (!parameters.TryGetValue("username", out string username) || username is null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        if (username.Contains("..")) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        string password;
        string[] authorization;
        try {
            using JsonDocument body = JsonDocument.Parse(ctx.Request.InputStream);
            password = body.RootElement.TryGetProperty("password", out JsonElement passwordElement) ? passwordElement.GetString() : null;
            authorization = body.RootElement.TryGetProperty("authorization", out JsonElement authorizationElement)
                ? authorizationElement.EnumerateArray().Select(o => o.GetString()).ToArray()
                : Array.Empty<string>();
        }
        catch (Exception ex) when (ex is JsonException or InvalidOperationException) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        parameters.TryGetValue("domain", out string domain);
        parameters.TryGetValue("email", out string email);

        parameters.TryGetValue("alias", out string alias);
        parameters.TryGetValue("color", out string color);
        parameters.TryGetValue("isdomain", out string isDomainString);

        username = Uri.UnescapeDataString(username).ToLower();
        email    = Uri.UnescapeDataString(email ?? String.Empty);
        alias    = Uri.UnescapeDataString(alias ?? String.Empty);
        color    = Uri.UnescapeDataString(color ?? String.Empty);
        bool isDomainUser = Uri.UnescapeDataString(isDomainString ?? String.Empty) == "true";

        if (!Data.IsValidFilename(username)) return Data.CODE_INVALID_ARGUMENT.Array; //unescaped twice, so check again
        if (username == "loopback") return Data.CODE_INVALID_ARGUMENT.Array;

        byte[] passwordHash = isDomainUser || String.IsNullOrEmpty(password) ? null : Cryptography.HashUsernameAndPassword(username, password);
        HashSet<string> accessPath = PopulateAccessPath(authorization);

        lock (rbacMutex) {
            rbac.TryGetValue(username, out AccessControl existing);
            if (passwordHash is null && !isDomainUser && (existing is null || existing.isDomainUser)) {
                return "{\"error\":\"please enter password\"}"u8.ToArray();
            }

            AccessControl access = new AccessControl {
                username      = username,
                email         = email,
                domain        = domain,
                passwordHash  = isDomainUser ? Array.Empty<byte>() : passwordHash ?? existing?.passwordHash,
                totpSecret    = existing?.totpSecret,
                alias         = alias,
                color         = color,
                isDomainUser  = isDomainUser,
                authorization = authorization,
                accessPath    = accessPath
            };

            if (!SaveAccessControl(access)) {
                return "{\"error\":\"failed to write user file.\"}"u8.ToArray();
            }

            if (existing is null) {
                rbac[username] = access;
            }
            else {
                if (passwordHash is not null || existing.isDomainUser != isDomainUser ||
                    (isDomainUser && existing.domain != domain)) {
                    existing.credentialRevision = new();
                }

                //Sessions share the RBAC entry so that permission changes take effect immediately.
                existing.email         = access.email;
                existing.domain        = access.domain;
                existing.passwordHash  = access.passwordHash;
                existing.alias         = access.alias;
                existing.color         = access.color;
                existing.isDomainUser  = access.isDomainUser;
                existing.authorization = access.authorization;
                existing.accessPath    = access.accessPath;
            }
        }

        Logger.Action(origin, "AAA", $"Save RBAC entry for {username}");

        KeepAlive.Unicast(username, $"{{\"action\":\"update-rbac\",\"authorization\":{JsonSerializer.Serialize(authorization)}}}", "/global");

        return Data.CODE_OK.Array;
    }

    internal static byte[] DeleteUser(HttpListenerContext ctx, string origin) {
        Dictionary<string, string> parameters = Listener.ParseQuery(ctx);

        if (parameters is null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        if (!parameters.TryGetValue("username", out string username)) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        if (!Data.IsValidFilename(username)) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        username = username.ToLower();
        lock (rbacMutex) {
            rbac.TryRemove(username, out _);
            ClearTotpTimeStep(username);

            foreach (KeyValuePair<string, Session> pair in sessions) {
                if (pair.Value.access.username == username) {
                    RevokeAccess(pair.Value.sessionId);
                }
            }

            try {
                File.Delete(Path.Join(Data.DIR_RBAC, username));
            }
            catch (IOException ex) {
                Logger.Error(ex);
                return "{\"error\":\"failed to write user file.\"}"u8.ToArray();
            }
            catch (Exception ex) {
                Logger.Error(ex);
                return "{\"error\":\"failed to write user file.\"}"u8.ToArray();
            }
        }

        Logger.Action(origin, "AAA", $"Delete RBAC entry for {username}");

        return "{\"status\":\"ok\"}"u8.ToArray();
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
            builder.Append($"\"guid\":\"{session.guid}\",");
            builder.Append($"\"logindate\":{session.loginDate},");
            builder.Append($"\"ttl\":{session.ttl}");
            builder.Append('}');

            first = false;
        }

        builder.Append(']');

        return Encoding.UTF8.GetBytes(builder.ToString());
    }

    internal static byte[] KickUser(HttpListenerContext ctx, string origin) {
        Dictionary<string, string> parameters = Listener.ParseQuery(ctx);

        if (parameters is null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        parameters.TryGetValue("username", out string username);
        parameters.TryGetValue("guid", out string guidString);
        Guid.TryParse(guidString, out Guid guid);

        foreach (Session session in sessions.Values) {
            if (session.access.username != username) continue;
            if (session.guid != guid) continue;

            return RevokeAccess(session.sessionId, origin)
                ? Data.CODE_OK.ToArray()
                : Data.CODE_FAILED.ToArray();
        }

        return Data.CODE_FAILED.ToArray();
    }

    internal static void UpdateSessionTtl(string sessionId, long ttl) {
        if (sessionId is null || ttl < 0 || !sessions.TryGetValue(sessionId, out Session session)) return;

        lock (session) {
            if (!CheckSessionExpiry(session)) return;
            session.ttl = Math.Min(ttl, 28) * TimeSpan.TicksPerDay;
        }
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
        writer.WriteString(_hash, value.passwordHash is null ? null : Convert.ToHexString(value.passwordHash));
        writer.WriteString(_totp, value.totpSecret is null ? null : Convert.ToHexString(value.totpSecret));
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

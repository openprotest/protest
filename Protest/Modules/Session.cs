using System;
using System.Linq;
using System.Collections;
using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Net;
using System.Text;
using System.IO;
using System.Threading;
using System.Collections.Generic;

public static class Session {
    public static Hashtable ip_access = new Hashtable();
    public static Hashtable user_access = new Hashtable();

    private static readonly ConcurrentDictionary<string, SessionEntry> sessions = new ConcurrentDictionary<string, SessionEntry>();

    public static long HOUR = 36_000_000_000;
    public static long SESSION_TIMEOUT = 168; //7 days

    struct SessionEntry {
        public string ip;
        public string username;
        public DateTime loginTime;
        public string sessionId;
        public long sessionTimeout;
    }

    public static string TryLogin(in HttpListenerContext ctx, in string remoteIp) {
        try {
            using StreamReader streamReader = new StreamReader(ctx.Request.InputStream);
            string payload = streamReader.ReadToEnd();
            string[] split = payload.Split((char)127);
            if (split.Length < 2) return null;

            string username = split[0];
            string password = split[1];

            if (!user_access.ContainsKey("*") && !user_access.ContainsKey(username))
                return null;

            bool auth = ActiveDirectory.AuthenticateDomainUser(username, password);

            if (auth) {
                string sessionId = GrantAccess(in remoteIp, in username);
                if (sessionId is null) return null;

                Cookie cookie = new Cookie() {
                    Name = "sessionid",
                    Value = sessionId,
                    HttpOnly = true,
                    Domain = ctx.Request.UserHostName,
                    //SameSite = "Lax",
                    Expires = new DateTime(DateTime.Now.Ticks + HOUR * SESSION_TIMEOUT)
                };

                Logging.Action(username, $"Successfully login from {remoteIp}");

                ctx.Response.AppendCookie(cookie);
                return sessionId;
            }

            Logging.Action(username, $"Unsuccessful login attempt from {remoteIp}");
            return null;

        } catch (Exception ex) {
            Logging.Err(ex);
        }

        return null;
    }

    public static string GrantAccess(in string remoteIp, in string username) {
        SessionEntry newEntry = new SessionEntry() {
            ip = remoteIp,
            username = username,
            loginTime = DateTime.Now,
            sessionId = GetSHA(DateTime.Now.ToString()),
            sessionTimeout = HOUR * SESSION_TIMEOUT
        };

        if (sessions.TryAdd(newEntry.sessionId, newEntry)) 
            return newEntry.sessionId;

        Thread.Sleep(5);
        if (sessions.TryAdd(newEntry.sessionId, newEntry)) //retry
            return newEntry.sessionId;

        return null;
    }

    public static bool RevokeAccess(in HttpListenerContext ctx, in string performer) {
        string sessionId = ctx.Request.Cookies["sessionid"]?.Value ?? null;
        if (sessionId is null) return false;
        return RevokeAccess(sessionId, performer);
    }
    public static bool RevokeAccess(in string sessionId, in string performer = null) {
        if (sessionId is null) return false;
        if (!sessions.ContainsKey(sessionId)) return false;

        if (sessions.TryRemove(sessionId, out _)) {
            if (performer != null) Logging.Action(performer, $"User actively logged out");
            return true;
        }

        Thread.Sleep(5);
        if (sessions.TryRemove(sessionId, out _)) { //retry
            if (performer != null) Logging.Action(performer, $"User actively logged out");
            return true;
        }

        return false;
    }

    public static bool CheckAccess(in HttpListenerContext ctx, in string remoteIp) {
        string sessionId = ctx.Request.Cookies["sessionid"]?.Value ?? null;
        if (sessionId is null) return false;
        return CheckAccess(in sessionId, in remoteIp);
    }
    public static bool CheckAccess(in string sessionId, in string remoteIp) {
        if (!sessions.ContainsKey(sessionId)) return false;

        SessionEntry entry = sessions[sessionId];
        if (DateTime.Now.Ticks - entry.loginTime.Ticks > entry.sessionTimeout) { //expired
            RevokeAccess(sessionId);
            return false;
        }

        if (entry.ip == remoteIp) //match ip
            return true;

        return false;
    }

    public static string GetUsername(string sessionId) {
        if (sessionId is null) return null;

        if (sessions.ContainsKey(sessionId))
            return sessions[sessionId].username;

        return null;
    }

    public static byte[] GetClients() {
        StringBuilder sb = new StringBuilder();

        List<string> remove = new List<string>();
        foreach (KeyValuePair<string, SessionEntry> o in sessions) {
            SessionEntry entry = o.Value;
            if (DateTime.Now.Ticks - entry.loginTime.Ticks > entry.sessionTimeout) //expired
                remove.Add(entry.sessionId);
        }

        foreach (string o in remove)
            sessions.TryRemove(o, out _);

        foreach (KeyValuePair<string, SessionEntry> o in sessions) {
            SessionEntry entry = o.Value;
            if (entry.username == "localhost" && (entry.ip.StartsWith("127.") || entry.ip == "::1")) continue;
            sb.Append($"{entry.ip}{(char)127}{entry.loginTime.ToString(Strings.DATETIME_FORMAT)}{(char)127}{entry.username}{(char)127}{entry.sessionId.Substring(0, 8)}{(char)127}");
        }

        return Encoding.UTF8.GetBytes(sb.ToString());
    }

    public static byte[] KickClient(in string[] para, in string performer) {
        string ip = String.Empty;
        string hash = String.Empty;
        for (int i = 1; i < para.Length; i++) 
            if (para[i].StartsWith("ip=")) ip = para[i].Substring(3);
            else if (para[i].StartsWith("hash=")) hash = para[i].Substring(5);
        
        foreach (KeyValuePair<string, SessionEntry> o in sessions) {
            SessionEntry entry = o.Value;
            if (entry.ip == ip && entry.sessionId.StartsWith(hash)) {
                bool removed = RevokeAccess(entry.sessionId, performer);
                if (!removed) return Strings.FAI.Array;
                
                KeepAlive.SearchAndDestroy(entry.sessionId);
                Logging.Action(performer, $"Kick user {entry.username} from {entry.ip}");
                return Strings.OK.Array;
            }
        }

        return Strings.NOT.Array;
    }

    public static void UpdateSessionTimeout(string sessionId, string timeout) {
        if (!sessions.ContainsKey(sessionId)) return;

        long.TryParse(timeout, out long lTimeout);
        SessionEntry entry = sessions[sessionId];
        entry.sessionTimeout = lTimeout;
        sessions[sessionId] = entry;   
    }

    public static string GetSHA(in string value) {
        return GetSHA(Encoding.UTF8.GetBytes(value));
    }
    public static string GetSHA(in byte[] value) {
        using SHA384 sha = SHA384.Create();
        byte[] bytes = sha.ComputeHash(value);

        StringBuilder sb = new StringBuilder();
        foreach (byte b in bytes)
            sb.Append(b.ToString("x2")); //bytes to hex

        return sb.ToString();
    }

}

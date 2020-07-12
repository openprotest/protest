using System;
using System.Linq;
using System.Collections;
using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Net;
using System.Text;
using System.IO;
using System.Threading;

public static class Session {
    public static Hashtable ip_access = new Hashtable();
    public static Hashtable user_access = new Hashtable();

    //private static Hashtable onTimeOut = new Hashtable(); //TODO:
    //private static readonly Hashtable sessions = new Hashtable();
    //private static readonly object session_lock = new object();

    private static readonly ConcurrentDictionary<string, SessionEntry> sessions = new ConcurrentDictionary<string, SessionEntry>();

    public static long HOUR = 36_000_000_000;
    public static long SESSION_TIMEOUT = 168; //7 days

    struct SessionEntry {
        public string ip;
        public string username;
        public DateTime loginTime;
        public string sessionId;
    }

    public static string TryLogin(in HttpListenerContext ctx, string remoteIp) {
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
                    //Domain = ctx.Request.UserHostName, //TODO: brakes reverce proxy
                    Expires = new DateTime(DateTime.Now.Ticks + HOUR * SESSION_TIMEOUT)
                };

                Logging.Action($"{username}@{remoteIp}", "Login successfuly");

                ctx.Response.AppendCookie(cookie);
                return sessionId;
            }

            Logging.Action($"{username}@{remoteIp}", "Unsuccessful login attempt");
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
            sessionId = GetSHA(DateTime.Now.ToString())
        };

        if (sessions.TryAdd(newEntry.sessionId, newEntry)) 
            return newEntry.sessionId;

        Thread.Sleep(5);
        if (sessions.TryAdd(newEntry.sessionId, newEntry)) //retry
            return newEntry.sessionId;

        return null;
    }

    public static bool RevokeAccess(in HttpListenerContext ctx) {
        string sessionId = ctx.Request.Cookies["sessionid"]?.Value ?? null;
        if (sessionId is null) return false;
        return RevokeAccess(sessionId);
    }
    public static bool RevokeAccess(in string sessionId) {
        if (sessionId is null) return false;
        if (!sessions.ContainsKey(sessionId)) return false;

        if (sessions.TryRemove(sessionId, out _)) 
            return true;

        Thread.Sleep(5);
        if (sessions.TryRemove(sessionId, out _)) //retry
            return true;

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
        if (DateTime.Now.Ticks - entry.loginTime.Ticks > HOUR * SESSION_TIMEOUT) { //expired
            RevokeAccess(sessionId);
            return false;
        }

        if (entry.ip == remoteIp) //match ip
            return true;

        return false;
    }

    public static string GetUsername(string sessionId) {
        if (sessions.ContainsKey(sessionId))
            return sessions[sessionId].username;

        return null;
    }

    public static string GetSHA(string value) {
        return GetSHA(Encoding.UTF8.GetBytes(value));
    }
    public static string GetSHA(byte[] value) {
        using SHA384 sha = SHA384.Create();
        byte[] bytes = sha.ComputeHash(value);

        StringBuilder sb = new StringBuilder();
        foreach (byte b in bytes)
            sb.Append(b.ToString("x2")); //byte to hex

        return sb.ToString();
    }

}

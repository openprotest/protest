using System;
using System.Linq;
using System.Security.Cryptography;
using System.Collections;
using System.Net;
using System.Text;
using System.IO;
using System.Collections.Generic;

static class Session {
    public static Hashtable ip_access = new Hashtable();
    public static Hashtable user_access = new Hashtable();

    //private static Hashtable onTimeOut = new Hashtable(); //TODO:
    private static Hashtable sessions = new Hashtable();

    private static readonly object session_lock = new object();

    public static long HOUR = 36000000000;
    public static long SESSION_TIMEOUT = 12; //12 hours

    struct SessionEntry {
        public string ip;
        public string username;
        public DateTime loginTime;
        //public DateTime lastAction;
        public string sessionId;
    }

    public static string TryLogin(in HttpListenerContext ctx) {
        string ip = ctx.Request.RemoteEndPoint.Address.ToString().Replace("%", "_");

        try {
            string payload = new StreamReader(ctx.Request.InputStream).ReadToEnd();
            string[] split = payload.Split((char)127);
            if (split.Length < 2) return null;

            string username = split[0];
            string password = split[1];
            
            if (!user_access.ContainsKey("*") && !user_access.ContainsKey(username))
                return null;
        
            bool auth = ActiveDir.AuthenticateDomainUser(username, password);
        
            if (auth) {
                string token = GrantAccess(in ip, in username);

                Cookie cookie = new Cookie() {
                    Name = "sessionid",
                    Value = token,
                    HttpOnly = true,
                    Domain = ctx.Request.UserHostName,
                    Expires = new DateTime(DateTime.Now.Ticks + HOUR * SESSION_TIMEOUT)
                };
                    
                ActionLog.Action($"{username}@{ip}", "Login successfuly");

                ctx.Response.AppendCookie(cookie);
                return token;
            }

            ActionLog.Action($"{username}@{ip}", "Unsuccessful login attempt");
            return null;

        } catch (Exception ex){
            ErrorLog.Err(ex);
        }

        return null;
    }

    public static string GetUsername(string sessionId) {
        lock (session_lock) {
            if (sessions.ContainsKey(sessionId))
                return ((SessionEntry)sessions[sessionId]).username;
        }

        return null;
    }

    public static string GetSessionId(in HttpListenerContext ctx) {
        string sessionId = null;
        for (int i = 0; i < ctx.Request.Cookies.Count; i++)
            if (ctx.Request.Cookies[i].Name == "sessionid") {
                sessionId = ctx.Request.Cookies[i].Value;
                break;
            }

        return sessionId;
    }

    public static long GetSessionLife(string sessionId) {
        if (!sessions.ContainsKey(sessionId)) return -1;
        SessionEntry entry = (SessionEntry)sessions[sessionId];

        return (HOUR * SESSION_TIMEOUT - DateTime.Now.Ticks + entry.loginTime.Ticks) / 10000000; //to seconds
    }

    public static byte[] Logout(in HttpListenerContext ctx) {
        string sessionId = GetSessionId(ctx);

        if (sessionId is null) return new byte[] { };
        if (!sessions.ContainsKey(sessionId)) return new byte[] { };

        lock (session_lock) 
            sessions.Remove(sessionId);

        lock (Tools.pt_lock)
            Tools.PublicTransportationSessionSearchAndDestroy(sessionId);

        return Tools.OK.Array;
    }

    public static string GrantAccess(in string ip, in string username) {
        SessionEntry newEntry = new SessionEntry() {
            ip = ip,
            username = username,
            loginTime = DateTime.Now,
            //lastAction = DateTime.Now,
            sessionId = GetSHA(DateTime.Now.ToString())
        };

        lock (session_lock) {
            sessions[newEntry.sessionId] = newEntry;
        }

        return newEntry.sessionId;
    }

    public static bool CheckAccess(in HttpListenerContext ctx) {
        string remoteIp = ctx.Request.RemoteEndPoint.Address.ToString().Replace("%", "_");

        string sessionId = GetSessionId(ctx);
        if (sessionId is null) return false;

        return CheckAccess(in sessionId, in remoteIp);
    }
    public static bool CheckAccess(in string sessionId, in string remoteIp) {
        if (!sessions.ContainsKey(sessionId)) return false;

        SessionEntry entry = (SessionEntry)sessions[sessionId];

        if (DateTime.Now.Ticks - entry.loginTime.Ticks > HOUR * SESSION_TIMEOUT) { //expired
            lock (session_lock) {
                sessions.Remove(entry.sessionId);
            }
            return false;
        }

        if (entry.ip == remoteIp) //match ip
            return true;

        return false;
    }

    public static byte[] GetClients() {
        List<string> remove = new List<string>();
        StringBuilder sb = new StringBuilder();

        lock (session_lock) {
            foreach (DictionaryEntry o in sessions) {
                SessionEntry e = (SessionEntry)o.Value;
                if (DateTime.Now.Ticks - e.loginTime.Ticks > HOUR * SESSION_TIMEOUT) //expired
                    remove.Add(e.sessionId);
            }

            foreach (string o in remove)
                sessions.Remove(o);
            
            foreach (DictionaryEntry o in sessions) {
                SessionEntry e = (SessionEntry)o.Value;
                sb.Append($"{e.ip}{(char)127}{e.loginTime}{(char)127}{e.username}{(char)127}{e.sessionId.Substring(0,8)}{(char)127}");
            }
        }

        return Encoding.UTF8.GetBytes(sb.ToString());
    }

    public static byte[] KickClients(string[] para) {
        string ip = "";
        string hash = "";
        for (int i = 1; i < para.Length; i++) {
            if (para[i].StartsWith("ip=")) ip = para[i].Substring(3);
            if (para[i].StartsWith("hash=")) hash = para[i].Substring(5);
        }
               
        foreach (DictionaryEntry o in sessions) {
            SessionEntry e = (SessionEntry)o.Value;
            if (e.ip == ip && e.sessionId.StartsWith(hash)) {
                lock (session_lock) 
                    sessions.Remove(e.sessionId);

                lock (Tools.pt_lock) 
                    Tools.PublicTransportationSessionSearchAndDestroy(e.sessionId);
                
                return Tools.OK.Array;
            }
        }

        return Tools.OK.Array;
    }

    public static string GetSHA(string value) {
        return GetSHA(Encoding.UTF8.GetBytes(value));
    }
    public static string GetSHA(byte[] value) {
        SHA384 sha = SHA384.Create();
        byte[] bytes = sha.ComputeHash(value);

        StringBuilder sb = new StringBuilder();
        foreach (byte b in bytes)
            sb.Append(b.ToString("x2")); //byte to hex
        
        return sb.ToString();
    }

}
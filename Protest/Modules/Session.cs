using System;
using System.Linq;
using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Net;
using System.Text;
using System.IO;
using System.Collections.Generic;

public static class Session {
    public static long HOUR = 36_000_000_000;
    public static long SESSION_TIMEOUT = 168; //7 days

    public static readonly ConcurrentDictionary<string, AccessControl> acl = new ConcurrentDictionary<string, AccessControl>();
    public static readonly ConcurrentDictionary<string, SessionEntry> sessions = new ConcurrentDictionary<string, SessionEntry>();

    public struct SessionEntry {
        public string        ip;
        public string        username;
        public DateTime      loginTime;
        public string        sessionId;
        public long          sessionTimeout;
        public AccessControl accessControl;
    }

    public static string TryLogin(in HttpListenerContext ctx, in string remoteIp) {
        try {
            using StreamReader streamReader = new StreamReader(ctx.Request.InputStream);
            string payload = streamReader.ReadToEnd();
            string[] split = payload.Split((char)127);
            if (split.Length < 2) return null;

            string username = split[0];
            string password = split[1];

            if (!acl.ContainsKey(username))
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
            sessionTimeout = HOUR * SESSION_TIMEOUT,
            accessControl = acl.ContainsKey(username) ? acl[username] : null
        };

        if (sessions.TryAdd(newEntry.sessionId, newEntry)) 
            return newEntry.sessionId;

        return null;
    }

    public static bool CheckAccess(in HttpListenerContext ctx) {
        string sessionId = ctx.Request.Cookies["sessionid"]?.Value ?? null;
        if (sessionId is null) return false;
        return CheckAccess(in sessionId);
    }
    public static bool CheckAccess(in string sessionId) {
        if (!sessions.ContainsKey(sessionId)) return false;

        SessionEntry entry = sessions[sessionId];
        if (DateTime.Now.Ticks - entry.loginTime.Ticks > entry.sessionTimeout) { //expired
            RevokeAccess(sessionId);
            return false;
        }

        return true;
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

        return false;
    }

    public static string GetUsername(in string sessionId) {
        if (sessionId is null) return null;

        if (sessions.ContainsKey(sessionId))
            return sessions[sessionId].username;

        return null;
    }

    public static SessionEntry? GetSessionEntry(in string sessionId) {
        if (sessionId is null) return null;

        if (sessions.ContainsKey(sessionId))
            return sessions[sessionId];

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
            if (entry.username == "loopback" && (entry.ip.StartsWith("127.") || entry.ip == "::1")) continue;
            sb.Append($"{entry.ip}{(char)127}{entry.loginTime.ToString(Strings.DATETIME_FORMAT)}{(char)127}{entry.username}{(char)127}{entry.sessionId.Substring(0, 8)}{(char)127}");
        }

        return Encoding.UTF8.GetBytes(sb.ToString());
    }

    public static byte[] KickClient(in string[] para, in string performer) {
        string ip = String.Empty;
        string hash = String.Empty;
        for (int i = 1; i < para.Length; i++)
            if (para[i].StartsWith("ip=")) ip = Strings.DecodeUrl(para[i].Substring(3));
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


    public static bool LoadAcl() {
        DirectoryInfo dirAcl = new DirectoryInfo(Strings.DIR_ACL);
        if (!dirAcl.Exists) return false;

        acl.Clear();
        acl.TryAdd("loopback", AccessControl.FullAccess);

        FileInfo[] files = dirAcl.GetFiles();
        for (int i = 0; i < files.Length; i++) {
            if (files[i].Name.ToLower() == "loopback") continue;

            string payload = null;
            try {
                payload = File.ReadAllText(files[i].FullName.ToLower()).Trim();
            } catch {
                continue;
            }

            AccessControl ac = new AccessControl(payload);
            acl.TryAdd(files[i].Name, ac);
        }
        
        return true;
    }

    public static byte[] GetAcl() {
        DirectoryInfo dirAcl = new DirectoryInfo(Strings.DIR_ACL);
        if (!dirAcl.Exists) return Encoding.UTF8.GetBytes("[]");

        string result = "[";

        foreach (KeyValuePair<string, AccessControl> ac in acl) {
            if (ac.Key == "loopback") continue;
            result += "{";
            result += $"\"user\":\"{ac.Key}\",\"access\":\"{ac.Value}\"";
            result += "},";
        }

        if (result.EndsWith(",")) result  = result.Substring(0, result.Length - 1);
        result += "]";

        return Encoding.UTF8.GetBytes(result);
    }

    public static byte[] SaveAcl(in string[] para, in HttpListenerContext ctx, in string performer) {
        string username = String.Empty;
        for (int i = 1; i < para.Length; i++)
            if (para[i].StartsWith("username=")) {
                username = para[i].Substring(9).ToLower();
                break;
            }

        if (username.Length == 0) return Strings.INV.Array;
        if (username == "loopback") return Strings.INV.Array;

        StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding);
        string payload = reader.ReadToEnd().Trim();
        
        try {
            DirectoryInfo dirAcl = new DirectoryInfo(Strings.DIR_ACL);
            if (!dirAcl.Exists) dirAcl.Create();

            File.WriteAllText($"{dirAcl.FullName}\\{username}", payload);
        } catch (Exception ex) {
            Logging.Err(ex);
            return Strings.FAI.Array;
        }

        AccessControl ac = new AccessControl(payload);

        //update existing sessions
        IEnumerable<KeyValuePair<string, SessionEntry>> toRevoke = sessions.ToArray().Where(o => o.Value.username == username);
        foreach (KeyValuePair<string, SessionEntry> v in toRevoke) {
            SessionEntry session = sessions[v.Key];
            session.accessControl = ac;
            sessions[v.Key] = session;
        }

        acl.TryRemove(username, out _);
        if (acl.TryAdd(username, ac)) {
            Logging.Action(performer, $"Save access control for {username}");
            return Strings.OK.Array;
        }

        return Strings.FAI.Array;
    }

    public static byte[] DeleteAcl(in string[] para, in string performer) {
        string username = String.Empty;
        for (int i = 1; i < para.Length; i++)
            if (para[i].StartsWith("username=")) {
                username = para[i].Substring(9);
                break;
            }

        if (username.Length == 0) return Strings.INV.Array;

        try {
            File.Delete($"{Strings.DIR_ACL}\\{username}");
        } catch (Exception ex) {
            Logging.Err(ex);
            return Strings.FAI.Array;
        }

        //revoke existing sessions
        IEnumerable<KeyValuePair<string, SessionEntry>> toRevoke = sessions.ToArray().Where(o => o.Value.username == username);
        foreach (KeyValuePair<string, SessionEntry> v in toRevoke)
            RevokeAccess(v.Value.sessionId, performer);

        if (acl.TryRemove(username, out _)) {
            Logging.Action(performer, $"Delete access control for {username}");
            return Strings.OK.Array;
        }

        return Strings.FAI.Array;
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

public class AccessControl {
    public static readonly AccessControl FullAccess = new AccessControl("*");
    public static readonly AccessControl MinimumAccess = new AccessControl(null);

    public enum AccessLevel {
        Deny = 0,
        Read = 1,
        Full = 2
    }

    public AccessLevel database;
    public AccessLevel password;
    public AccessLevel remoteagent;
    public AccessLevel remotehosts;
    public AccessLevel domainusers;
    public AccessLevel documentation;
    public AccessLevel debitnotes;
    public AccessLevel watchdog;
    public AccessLevel utilities; //only ui
    public AccessLevel scripts;
    public AccessLevel wmi;
    public AccessLevel telnet;
    public AccessLevel backup;
    public AccessLevel manageusers;
    public AccessLevel log;

    public AccessControl(string payload) {
        if (payload is null || payload == String.Empty) {
            database      = AccessLevel.Deny;
            password      = AccessLevel.Deny;
            remoteagent   = AccessLevel.Deny;
            remotehosts   = AccessLevel.Deny;
            domainusers   = AccessLevel.Deny;
            documentation = AccessLevel.Deny;
            debitnotes    = AccessLevel.Deny;
            watchdog      = AccessLevel.Deny;
            utilities     = AccessLevel.Deny; //only ui
            scripts       = AccessLevel.Deny;
            wmi           = AccessLevel.Deny;
            telnet        = AccessLevel.Deny;
            backup        = AccessLevel.Deny;
            manageusers   = AccessLevel.Deny;
            log           = AccessLevel.Deny;

        } else if (payload == "*") {
            database      = AccessLevel.Full;
            password      = AccessLevel.Read;
            remoteagent   = AccessLevel.Read;
            remotehosts   = AccessLevel.Read;
            domainusers   = AccessLevel.Read;
            documentation = AccessLevel.Full;
            debitnotes    = AccessLevel.Full;
            watchdog      = AccessLevel.Full;
            utilities     = AccessLevel.Read; //only ui
            scripts       = AccessLevel.Read;
            wmi           = AccessLevel.Read;
            telnet        = AccessLevel.Read;
            backup        = AccessLevel.Read;
            manageusers   = AccessLevel.Read;
            log           = AccessLevel.Read;

        } else {
            string[] payloadSplit = payload.Split(',');
            for (int i = 0; i < payloadSplit.Length; i++) {
                string[] split = payloadSplit[i].Split(':');
                if (split.Length != 2) continue;

                AccessControl.AccessLevel al;
                Int32.TryParse(split[1], out int value);
                if      (value == 2) al = AccessControl.AccessLevel.Full;
                else if (value == 1) al = AccessControl.AccessLevel.Read;
                else                 al = AccessControl.AccessLevel.Deny;

                switch (split[0]) {
                    case "database":      database    = al; break;
                    case "password":      password    = al; break;
                    case "remoteagent":   remoteagent = al; break;
                    case "remotehosts":   remotehosts = al; break;
                    case "domainusers":   domainusers = al; break;
                    case "documentation": documentation = al; break;
                    case "debitnotes":    debitnotes  = al; break;
                    case "watchdog":      watchdog    = al; break;
                    case "utilities":     utilities   = al; break; //only ui
                    case "scripts":       scripts     = al; break;
                    case "wmi":           wmi         = al; break;
                    case "telnet":        telnet      = al; break;
                    case "backup":        backup      = al; break;
                    case "manageusers":   manageusers = al; break;
                    case "log":           log         = al; break;
                }
            }
        }
    }

    public override string ToString() {
        string s = String.Empty;
        s += "database:"    + (int)database + ",";
        s += "password:"    + (int)password + ",";
        s += "remoteagent:" + (int)remoteagent + ",";
        s += "remotehosts:" + (int)remotehosts + ",";
        s += "domainusers:" + (int)domainusers + ",";
        s += "documentation:" + (int)documentation + ",";
        s += "debitnotes:"  + (int)debitnotes + ",";
        s += "watchdog:"    + (int)watchdog + ",";
        s += "utilities:"   + (int)utilities + ","; //only ui
        s += "scripts:"     + (int)scripts + ",";
        s += "wmi:"         + (int)wmi + ",";
        s += "telnet:"      + (int)telnet + ",";
        s += "backup:"      + (int)backup + ",";
        s += "manageusers:" + (int)manageusers + ",";
        s += "log:"         + (int)log;
        return s;
    }
}
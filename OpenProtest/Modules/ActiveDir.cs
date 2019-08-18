using System;
using System.Linq;
using System.Text;
using System.Collections.Generic;
using System.DirectoryServices;
using System.Net.NetworkInformation;

//http://www.kouti.com/tables/userattributes.htm

static class ActiveDir {

    public static DirectoryEntry GetDirectoryEntry(string domain) {
        if (domain is null) return null;

        DirectoryEntry dir = new DirectoryEntry($"LDAP://{domain}");
        //dir.Username = ".\administrator";
        //dir.Password = "";

        return dir;
    }

    public static string[] GetAllWorkstations(string domain) {
        SearchResultCollection result = null;

        try {
            DirectoryEntry dir = GetDirectoryEntry(domain);
            DirectorySearcher searcher = new DirectorySearcher(dir);
            searcher.Filter = "(objectClass=computer)";
            result = searcher.FindAll();
        } catch (Exception ex) {
            ErrorLog.Err(ex);
            return null;
        }

        if (result is null || result.Count == 0) return null;

        List<string> list = new List<string>();
        foreach (SearchResult o in result) 
            if (o.Properties.Contains("name") && o.Properties["name"].Count > 0)
                list.Add(o.Properties["name"][0].ToString());

        return list.ToArray();
    }

    public static string[] GetAllUsers(string domain) {
        SearchResultCollection result = null;
        try {
            DirectoryEntry dir = GetDirectoryEntry(domain);
            DirectorySearcher searcher = new DirectorySearcher(dir);
            searcher.Filter = "(&(objectClass=user)(objectCategory=person))";
            result = searcher.FindAll();
        } catch (Exception ex) {
            ErrorLog.Err(ex);
            return null;
        }

        if (result is null || result.Count == 0) return null;

        List<string> list = new List<string>();
        foreach (SearchResult o in result)
            if (o.Properties.Contains("userPrincipalName") && o.Properties["userPrincipalName"].Count > 0)
                list.Add(o.Properties["userPrincipalName"][0].ToString());

        return list.ToArray();
    }

    public static bool AuthenticateDomainUser(string username, in string password) {
        string domain = null;

        if (username.Contains("@")) {
            domain = username.Split('@')[1].Trim();
            username = username.Split('@')[0].Trim();
        } else
            try {
                domain = IPGlobalProperties.GetIPGlobalProperties()?.DomainName ?? null;
            } catch { }
        
        if (domain is null) return false;

        try {
            DirectoryEntry entry = new DirectoryEntry($"LDAP://{domain}", username, password);
            object o = entry.NativeObject;

            DirectorySearcher searcher = new DirectorySearcher(entry);
            searcher.Filter = $"(SAMAccountName={username})";
            searcher.PropertiesToLoad.Add("cn");

            SearchResult result = searcher.FindOne();
            if (result is null) return false;

        } catch {
            return false;
        }

        return true;
    }

    public static SearchResult GetWorkstation(string name) {
        string domain = null;
        try {
            domain = IPGlobalProperties.GetIPGlobalProperties()?.DomainName ?? null;
        } catch { }

        DirectoryEntry dir = GetDirectoryEntry(domain);

        DirectorySearcher searcher = new DirectorySearcher(dir);
        searcher.Filter = "(&(objectClass=computer)(name = " + name + "))";

        try {
            return searcher.FindOne();
        } catch (Exception ex) {
            ErrorLog.Err(ex);
            return null;
        }
    }

    public static SearchResult GetUser(string username) {
        string domain = null;
        try {
           domain = IPGlobalProperties.GetIPGlobalProperties()?.DomainName ?? null;
        } catch { }

        DirectoryEntry dir = GetDirectoryEntry(domain);
        SearchResultCollection result = null;

        DirectorySearcher searcher = new DirectorySearcher(dir);
        searcher.Filter = "(&(objectClass=user)(objectCategory=person))";
        //searcher.Filter = "(&(objectClass=user)(objectCategory=person)(cn=" + username + "))";

        try {
            result = searcher.FindAll();
            //TODO: try this: searcher.FindOne();
        } catch (Exception ex) {
            ErrorLog.Err(ex);
            return null;
        }

        if (result is null || result.Count == 0) return null;

        username = username.ToLower();

        int index = -1;
        for (int i = 0; i < result.Count; i++) {
            if (result[i].Properties["userPrincipalName"].Count == 0) continue;

            string un = result[i].Properties["userPrincipalName"][0].ToString();

            if (un.Contains("@")) un = un.Substring(0, un.IndexOf("@"));

            if (un.ToLower() == username) {
                index = i;
                break;
            }
        }

        if (index < 0) return null;

        return result[index];
    }

    private delegate string FormatMethodPtr(string value);
    private static void ContentBuilderAddValue(in SearchResult sr, in string property, in string label, in StringBuilder content, FormatMethodPtr format = null) {
        for (int i = 0; i < sr.Properties[property].Count; i++) {
            string value = sr.Properties[property][i].ToString();
            if (value.Length > 0) {
                if (format != null) value = format.Invoke(value);
                if (value.Length == 0) continue;
                content.Append($"{label}{(char)127}{value}{(char)127}");
                break;
            }
        }
    }
    private static void ContentBuilderAddArray(in SearchResult sr, in string property, in string label, in StringBuilder content, FormatMethodPtr format = null) {
        string value = "";
        for (int i = 0; i < sr.Properties[property].Count; i++) {
            string v = sr.Properties[property][i].ToString();
            if (format != null) {
                if (format != null) v = format.Invoke(v);
                if (value.Length == 0) continue;
                v = format.Invoke(v);
            }
            if (v != null && v.Length > 0) value += $"{v};";
        }

        value = value.Trim();
        if (value.EndsWith(";")) value = value.Substring(0, value.Length - 1);

        if (value.Length > 0) content.Append($"{label}{(char)127}{value}{(char)127}");
    }

    public static string ActiveDirVerify(in string[] para) {
        string filename = "";
        string username = "";

        for (int i = 1; i < para.Length; i++) {
            if (para[i].StartsWith("file=")) filename = para[i].Substring(5);
            if (para[i].StartsWith("username=")) username = para[i].Substring(9);
        }

        if (username.Length == 0 && NoSQL.users.ContainsKey(filename)) {
            NoSQL.DbEntry entry = (NoSQL.DbEntry)NoSQL.users[filename];
            if (entry.hash.ContainsKey("USERNAME")) username = ((string[])entry.hash["USERNAME"])[0];
        }

        if (username.Length == 0) return Encoding.UTF8.GetString(Tools.INF.Array);

        return ActiveDirVerify(username);
    }
    public static string ActiveDirVerify(string username) {
        SearchResult sr = GetUser(username);
        if (sr is null) return "not found";
        return ActiveDirVerify(sr);
    }
    public static string ActiveDirVerify(SearchResult user) {
        StringBuilder content = new StringBuilder();

        ContentBuilderAddValue(user, "personalTitle", "TITLE", content, null);
        if (content.Length == 0) ContentBuilderAddValue(user, "title", "TITLE", content, null);

        ContentBuilderAddValue(user, "givenName", "FIRST NAME", content, null);
        ContentBuilderAddValue(user, "middleName", "MIDDLE NAME", content, null);
        ContentBuilderAddValue(user, "sn", "LAST NAME", content, null);

        ContentBuilderAddValue(user, "displayName", "DISPLAY NAME", content, null);

        ContentBuilderAddValue(user, "userPrincipalName", "USERNAME", content, GetUsername);

        ContentBuilderAddValue(user, "mail", "E-MAIL", content, null);
        ContentBuilderAddValue(user, "otherMailbox", "SECONDARY E-MAIL", content, null);
        ContentBuilderAddValue(user, "mobile", "MOBILE NUMBER", content, null);
        ContentBuilderAddValue(user, "telephoneNumber", "TELEPHONE NUMBER", content, null);
        ContentBuilderAddValue(user, "facsimileTelephoneNumber", "FAX", content, null);

        ContentBuilderAddValue(user, "employeeID", "EMPLOYEE ID", content, null);
        ContentBuilderAddValue(user, "company", "COMPANY", content, null);
        ContentBuilderAddValue(user, "department", "DEPARTMENT", content, null);
        ContentBuilderAddValue(user, "division", "DIVISION", content, null);
        ContentBuilderAddValue(user, "comment", "COMMENT", content, null);

        content.Append($"PATH{(char)127}{user.Path.ToString()}{(char)127}");

        //ContentBuilderAddValue(user, "lastLogon", "LAST LOG ON", content, FileTimeString);
        //ContentBuilderAddValue(user, "lastLogoff", "LAST LOG OFF", content, FileTimeString);

        return content.ToString();
    }

    private static string GetUsername(string value) {
        if (value.Contains("@"))
            return value.Substring(0, value.IndexOf("@"));
        else
            return value;
    }

    public static string FileTimeString(string value) {
        long ticks = long.Parse(value);
        if (ticks == 0) return "";
        return DateTime.FromFileTime(ticks).ToString("dddd dd-MMM-yyyy HH:mm:ss");
    }
    
    public static byte[] UnlockUser(in string[] para) {
        string filename = "";
        string username = "";
        for (int i = 1; i < para.Length; i++) {
            if (para[i].StartsWith("file=")) filename = para[i].Substring(5);
            if (para[i].StartsWith("username=")) username = para[i].Substring(9);
        }

        if (username.Length == 0 && NoSQL.users.ContainsKey(filename)) {
            NoSQL.DbEntry entry = (NoSQL.DbEntry)NoSQL.users[filename];
            if (entry.hash.ContainsKey("USERNAME")) username = ((string[])entry.hash["USERNAME"])[0];
        }

        if (username.Length == 0) return Tools.INF.Array;

        SearchResult sr = GetUser(username);
        if (sr is null) return Encoding.UTF8.GetBytes("not found");

        DirectoryEntry user = new DirectoryEntry(sr.Path);
        user.Properties["LockOutTime"].Value = 0; //unlock account
        user.CommitChanges();
        user.Close();

        return Tools.OK.Array;
    }

    public static byte[] DisableUser(in string[] para) {
        string filename = "";
        string username = "";
        for (int i = 1; i < para.Length; i++) {
            if (para[i].StartsWith("file=")) filename = para[i].Substring(5);
            if (para[i].StartsWith("username=")) username = para[i].Substring(9);
        }

        if (username.Length == 0 && NoSQL.users.ContainsKey(filename)) {
            NoSQL.DbEntry entry = (NoSQL.DbEntry)NoSQL.users[filename];
            if (entry.hash.ContainsKey("USERNAME")) username = ((string[])entry.hash["USERNAME"])[0];
        }

        if (username.Length == 0) return Tools.INF.Array;

        SearchResult sr = GetUser(username);
        if (sr is null) return Tools.INV.Array;

        DirectoryEntry user = new DirectoryEntry(sr.Path);
        int userAccountControl = (int)user.Properties["userAccountControl"].Value;
        userAccountControl = userAccountControl | 0x2;
        user.Properties["userAccountControl"].Value = userAccountControl;

        user.CommitChanges();
        user.Close();

        return Tools.OK.Array;
    }

    public static byte[] EnableUser(in string[] para) {
        string filename = "";
        string username = "";
        for (int i = 1; i < para.Length; i++) {
            if (para[i].StartsWith("file=")) filename = para[i].Substring(5);
            if (para[i].StartsWith("username=")) username = para[i].Substring(9);
        }

        if (username.Length == 0 && NoSQL.users.ContainsKey(filename)) {
            NoSQL.DbEntry entry = (NoSQL.DbEntry)NoSQL.users[filename];
            if (entry.hash.ContainsKey("USERNAME")) username = ((string[])entry.hash["USERNAME"])[0];
        }

        if (username.Length == 0) return Tools.INF.Array;

        SearchResult sr = GetUser(username);
        if (sr is null) return Tools.INV.Array;

        DirectoryEntry user = new DirectoryEntry(sr.Path);
        int userAccountControl = (int)user.Properties["userAccountControl"].Value;
        userAccountControl = userAccountControl & ~0x2;
        user.Properties["userAccountControl"].Value = userAccountControl;

        user.CommitChanges();
        user.Close();

        return Tools.OK.Array;
    }
    
}
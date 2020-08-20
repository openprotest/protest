
using System;
using System.Collections;
using System.Collections.Generic;
using System.DirectoryServices;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Text;

public static class ActiveDirectory {
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
            using DirectorySearcher searcher = new DirectorySearcher(dir);
            searcher.Filter = "(objectClass=computer)";
            result = searcher.FindAll();
        } catch (Exception ex) {
            Logging.Err(ex);
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
            using DirectorySearcher searcher = new DirectorySearcher(dir);
            searcher.Filter = "(&(objectClass=user)(objectCategory=person))";
            result = searcher.FindAll();
        } catch (Exception ex) {
            Logging.Err(ex);
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

            using DirectorySearcher searcher = new DirectorySearcher(entry);
            searcher.Filter = $"(SAMAccountName={username})";
            searcher.PropertiesToLoad.Add("cn");

            SearchResult result = searcher.FindOne();
            if (result is null) return false;

        } catch {
            return false;
        }

        return true;
    }

    public static byte[] GetCurrentNetworkInfo() {
        foreach (NetworkInterface nic in NetworkInterface.GetAllNetworkInterfaces())
            foreach (UnicastIPAddressInformation ip in nic.GetIPProperties().UnicastAddresses) {
                try {
                    if (IPAddress.IsLoopback(ip.Address)) continue;
                    if (ip.Address.AddressFamily != AddressFamily.InterNetwork) continue;

                    IPAddress subnet = IpTools.GetNetworkAddress(ip.Address, ip.IPv4Mask);
                    IPAddress broadcast = IpTools.GetBroadcastAddress(ip.Address, ip.IPv4Mask);

                    string bits = String.Empty;
                    int prefix = 0;
                    for (int i = 0; i < 4; i++) {
                        byte b = ip.IPv4Mask.GetAddressBytes()[i];
                        bits += Convert.ToString(b, 2).PadLeft(8, '0');
                    }
                    for (int i = 0; i < bits.Length; i++) {
                        if (bits[i] == '0') break;
                        prefix++;
                    }

                    string firstAddress = $"{subnet.GetAddressBytes()[0]}.{subnet.GetAddressBytes()[1]}.{subnet.GetAddressBytes()[2]}.{subnet.GetAddressBytes()[3] + 1}";
                    string lastAddress = $"{broadcast.GetAddressBytes()[0]}.{broadcast.GetAddressBytes()[1]}.{broadcast.GetAddressBytes()[2]}.{broadcast.GetAddressBytes()[3] - 1}";
                    string domain = IPGlobalProperties.GetIPGlobalProperties().DomainName;
   
                    string result = "{";
                    result += $"\"firstIp\":\"{firstAddress}\",";
                    result += $"\"lastIp\":\"{lastAddress}\",";
                    result += $"\"domain\":\"{domain}\"";
                    result += "}";

                    return Encoding.UTF8.GetBytes(result);
                } catch { }
            }

        return null;
    }

    public static SearchResult GetWorkstation(string name) {
        if (name is null || name.Length == 0) return null;

        string domain = null;
        try {
            domain = IPGlobalProperties.GetIPGlobalProperties()?.DomainName ?? null;
        } catch {}

        DirectoryEntry dir = GetDirectoryEntry(domain);
        using DirectorySearcher searcher = new DirectorySearcher(dir);
        searcher.Filter = $"(&(objectClass=computer)(cn={name}))";

        SearchResult result = null;
        try {
            result = searcher.FindOne();
        } catch {
            return null;
        }

        if (result is null) return null;
        return result;
    }

    public static SearchResult GetUser(string username) {
        if (username.Length == 0) return null;

        string domain = null;
        try {
            domain = IPGlobalProperties.GetIPGlobalProperties()?.DomainName ?? null;
        } catch {}

        DirectoryEntry dir = GetDirectoryEntry(domain);
        SearchResult result = null;

        try {
            using DirectorySearcher searcher = new DirectorySearcher(dir);
            searcher.Filter = $"(&(objectClass=user)(objectCategory=person)(userPrincipalName={username}))";
            result = searcher.FindOne();
        } catch { }

        if (result is null)
            try {
                if (username.IndexOf("@") > -1) username = username.Split('@')[0];
                using DirectorySearcher searcher = new DirectorySearcher(dir);
                //searcher.Filter = "(&(objectClass=user)(objectCategory=person))";
                searcher.Filter = $"(&(objectClass=user)(objectCategory=person)(cn={username}))";
                result = searcher.FindOne();
            } catch { }

        if (result is null) {
            username = username.ToLower();
            
            using DirectorySearcher searcher = new DirectorySearcher(dir);
            searcher.Filter = "(&(objectClass=user)(objectCategory=person))";

            try {
                SearchResultCollection allUsers = searcher.FindAll();
                if (allUsers is null || allUsers.Count == 0) return null;

                for (int i = 0; i < allUsers.Count; i++) {
                    if (allUsers[i].Properties["userPrincipalName"].Count == 0) continue;
                    string un = allUsers[i].Properties["userPrincipalName"][0].ToString();

                    if (un.Contains("@")) un = un.Substring(0, un.IndexOf("@"));
                    if (un.ToLower() == username)
                        return allUsers[i];
                }
            } catch { }
        }

        if (result is null) return null;
        return result;
    }

    private delegate string FormatMethodPtr(string value);
    private static void ContentBuilderAddValue(in SearchResult sr, in string property, in string label, in Hashtable hash, FormatMethodPtr format = null) {
        for (int i = 0; i < sr.Properties[property].Count; i++) {
            string value = sr.Properties[property][i].ToString();
            if (value.Length > 0) {
                if (format != null) value = format.Invoke(value);
                if (value.Length == 0) continue;
                hash.Add(label, value);
                break;
            }
        }
    }

    public static Hashtable AdFetch(string username) {
        SearchResult sr = ActiveDirectory.GetUser(username);        
        if (sr is null) return null;
        return AdFetch(sr);
    }

    public static Hashtable AdFetch(SearchResult result) {
        Hashtable hash = new Hashtable();

        ContentBuilderAddValue(result, "title", "TITLE", hash, null);
        if (hash.Count == 0) ContentBuilderAddValue(result, "personalTitle", "TITLE", hash, null);

        ContentBuilderAddValue(result, "givenName", "FIRST NAME", hash, null);
        ContentBuilderAddValue(result, "middleName", "MIDDLE NAME", hash, null);
        ContentBuilderAddValue(result, "sn", "LAST NAME", hash, null);

        ContentBuilderAddValue(result, "displayName", "DISPLAY NAME", hash, null);

        ContentBuilderAddValue(result, "userPrincipalName", "USERNAME", hash, ActiveDirectory.GetUsername);

        ContentBuilderAddValue(result, "mail", "E-MAIL", hash, null);
        ContentBuilderAddValue(result, "otherMailbox", "SECONDARY E-MAIL", hash, null);
        ContentBuilderAddValue(result, "mobile", "MOBILE NUMBER", hash, null);
        ContentBuilderAddValue(result, "telephoneNumber", "TELEPHONE NUMBER", hash, null);
        ContentBuilderAddValue(result, "facsimileTelephoneNumber", "FAX", hash, null);

        ContentBuilderAddValue(result, "employeeID", "EMPLOYEE ID", hash, null);
        ContentBuilderAddValue(result, "company", "COMPANY", hash, null);
        ContentBuilderAddValue(result, "department", "DEPARTMENT", hash, null);
        ContentBuilderAddValue(result, "division", "DIVISION", hash, null);
        ContentBuilderAddValue(result, "comment", "COMMENT", hash, null);

        return hash;
    }

    public static string GetUsername(string value) {
        if (value.Contains("@"))
            return value.Substring(0, value.IndexOf("@"));
        else
            return value;
    }

    public static string FileTimeString(string value) {
        long ticks = long.Parse(value);
        if (ticks == 0) return String.Empty;
        return DateTime.FromFileTime(ticks).ToString("dddd dd-MMM-yyyy HH:mm:ss");
    }

    public static byte[] UnlockUser(in string[] para) {
        string filename = String.Empty;
        string username = String.Empty;
        for (int i = 1; i < para.Length; i++)
            if (para[i].StartsWith("file=")) filename = para[i].Substring(5);
            else if (para[i].StartsWith("username=")) username = para[i].Substring(9);        

        if (username.Length == 0 && Database.users.ContainsKey(filename)) {
            Database.DbEntry entry = (Database.DbEntry)Database.users[filename];
            if (entry.hash.ContainsKey("USERNAME")) username = ((string[])entry.hash["USERNAME"])[0];
        }

        if (username.Length == 0) return Strings.INF.Array;

        SearchResult sr = GetUser(username);
        if (sr is null) return Encoding.UTF8.GetBytes("not found");

        DirectoryEntry user = new DirectoryEntry(sr.Path);
        user.Properties["LockOutTime"].Value = 0; //unlock account
        user.CommitChanges();
        user.Close();

        return Strings.OK.Array;
    }

    public static byte[] DisableUser(in string[] para) {
        string filename = String.Empty;
        string username = String.Empty;
        for (int i = 1; i < para.Length; i++)
            if (para[i].StartsWith("file=")) filename = para[i].Substring(5);
            else if (para[i].StartsWith("username=")) username = para[i].Substring(9);        

        if (username.Length == 0 && Database.users.ContainsKey(filename)) {
            Database.DbEntry entry = (Database.DbEntry)Database.users[filename];
            if (entry.hash.ContainsKey("USERNAME")) username = ((string[])entry.hash["USERNAME"])[0];
        }

        if (username.Length == 0) return Strings.INF.Array;

        SearchResult sr = GetUser(username);
        if (sr is null) return Strings.INV.Array;

        DirectoryEntry user = new DirectoryEntry(sr.Path);
        int userAccountControl = (int)user.Properties["userAccountControl"].Value;
        userAccountControl |= 0x2;
        user.Properties["userAccountControl"].Value = userAccountControl;

        user.CommitChanges();
        user.Close();

        return Strings.OK.Array;
    }

    public static byte[] EnableUser(in string[] para) {
        string filename = String.Empty;
        string username = String.Empty;
        for (int i = 1; i < para.Length; i++) 
            if (para[i].StartsWith("file=")) filename = para[i].Substring(5);
            else if (para[i].StartsWith("username=")) username = para[i].Substring(9);        

        if (username.Length == 0 && Database.users.ContainsKey(filename)) {
            Database.DbEntry entry = (Database.DbEntry)Database.users[filename];
            if (entry.hash.ContainsKey("USERNAME")) username = ((string[])entry.hash["USERNAME"])[0];
        }

        if (username.Length == 0) return Strings.INF.Array;

        SearchResult sr = GetUser(username);
        if (sr is null) return Strings.INV.Array;

        DirectoryEntry user = new DirectoryEntry(sr.Path);
        int userAccountControl = (int)user.Properties["userAccountControl"].Value;
        userAccountControl &= ~0x2;
        user.Properties["userAccountControl"].Value = userAccountControl;

        user.CommitChanges();
        user.Close();

        return Strings.OK.Array;
    }



}

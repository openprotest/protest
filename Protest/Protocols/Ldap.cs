using System.Collections.Generic;
using System.DirectoryServices;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Runtime.Versioning;
using System.Text;

namespace Protest.Protocols;

internal static class Ldap {
    private static string NormalizeDomain(string domain) {
        if (String.IsNullOrWhiteSpace(domain)) return null;

        domain = domain.Trim();
        foreach (char c in domain) {
            if (!((c >= 'a' && c <= 'z') ||
                  (c >= 'A' && c <= 'Z') ||
                  (c >= '0' && c <= '9') ||
                  c == '-' || c == '.')) {
                return null;
            }
        }
        return domain;
    }

    private static string EscapeLdapValue(string value) {
        if (string.IsNullOrEmpty(value)) return string.Empty;

        StringBuilder escaped = new StringBuilder(value.Length);
        foreach (char c in value) {
            switch (c) {
            case '\\': escaped.Append("\\5c"); break;
            case '*' : escaped.Append("\\2a"); break;
            case '(':  escaped.Append("\\28"); break;
            case ')':  escaped.Append("\\29"); break;
            case '\0': escaped.Append("\\00"); break;
            default:   escaped.Append(c);      break;
            }
        }

        return escaped.ToString();
    }

    [SupportedOSPlatform("windows")]
    public static string[] GetAllWorkstations(string domain) {
        if (String.IsNullOrEmpty(domain)) return null;

        SearchResultCollection result = null;

        try {
            string normalizeDomain = NormalizeDomain(domain);
            if (String.IsNullOrWhiteSpace(normalizeDomain)) return null;

            DirectoryEntry directoryEntry = new DirectoryEntry($"LDAP://{normalizeDomain}");
            using DirectorySearcher searcher = new DirectorySearcher(directoryEntry);
            searcher.Filter = "(objectClass=computer)";
            //result = searcher.FindAll().Cast<SearchResult>().ToArray();
            result = searcher.FindAll();

        }
        catch (Exception ex) {
            Logger.Error(ex);
            return null;
        }

        if (result is null || result.Count == 0) return null;

        string[] array = new string[result.Count];
        for (int i = 0; i < result.Count; i++) {
            array[i] = result[i].Properties.Contains("name") ? result[i].Properties["name"][0].ToString() : String.Empty;
        }

        result.Dispose();

        return array;
    }

    [SupportedOSPlatform("windows")]
    public static string[] GetAllUsers(string domain) {
        SearchResultCollection result = null;
        try {
            string normalizeDomain = NormalizeDomain(domain);
            if (String.IsNullOrWhiteSpace(normalizeDomain)) return null;

            DirectoryEntry dir = new DirectoryEntry($"LDAP://{normalizeDomain}");
            using DirectorySearcher searcher = new DirectorySearcher(dir);
            searcher.Filter = "(&(objectClass=user)(objectCategory=person))";
            result = searcher.FindAll();
        }
        catch (Exception ex) {
            Logger.Error(ex);
            return null;
        }

        if (result is null || result.Count == 0) return null;

        List<string> list = new List<string>();
        foreach (SearchResult o in result) {
            if (o.Properties.Contains("userPrincipalName") && o.Properties["userPrincipalName"].Count > 0) {
                list.Add(o.Properties["userPrincipalName"][0].ToString());
            }
        }

        result.Dispose();

        return list.ToArray();
    }

    [SupportedOSPlatform("windows")]
    public static bool TryDirectoryAuthentication(string username, string password) {
        string normalizedDomain;

        try {
            string domain = IPGlobalProperties.GetIPGlobalProperties()?.DomainName;
            if (String.IsNullOrEmpty(domain)) return false;

            normalizedDomain = NormalizeDomain(domain);
            if (String.IsNullOrEmpty(normalizedDomain)) return false;
        }
        catch {
            return false;
        }

        if (username.Contains('@')) {
            string[] split = username.Split('@');
            username = split[0].Trim();
        }

        try {
            DirectoryEntry entry = new DirectoryEntry($"LDAP://{normalizedDomain}", username, password);
            object o = entry.NativeObject;

            using DirectorySearcher searcher = new DirectorySearcher(entry);
            searcher.Filter = $"(SAMAccountName={EscapeLdapValue(username)})";
            searcher.PropertiesToLoad.Add("cn");

            SearchResult result = searcher.FindOne();
            if (result is null) return false;

            return true;
        }
        catch {
            return false;
        }
    }

    public static byte[] NetworkInfo() {
        foreach (NetworkInterface nic in NetworkInterface.GetAllNetworkInterfaces())
            foreach (UnicastIPAddressInformation ip in nic.GetIPProperties().UnicastAddresses) {
                try {
                    if (IPAddress.IsLoopback(ip.Address)) continue;
                    if (ip.Address.AddressFamily != AddressFamily.InterNetwork) continue;
                    if (ip.Address.IsApipa()) continue;

                    IPAddress subnet = IpTools.GetNetworkAddress(ip.Address, ip.IPv4Mask);
                    IPAddress broadcast = IpTools.GetBroadcastAddress(ip.Address, ip.IPv4Mask);

                    StringBuilder bitsBuilder = new StringBuilder();
                    for (int i = 0; i < 4; i++) {
                        byte b = ip.IPv4Mask.GetAddressBytes()[i];
                        bitsBuilder.Append(Convert.ToString(b, 2).PadLeft(8, '0'));
                    }

                    int prefix = 0;
                    string bits = bitsBuilder.ToString();
                    for (int i = 0; i < bits.Length; i++) {
                        if (bits[i] == '0') break;
                        prefix++;
                    }

                    string firstAddress = $"{subnet.GetAddressBytes()[0]}.{subnet.GetAddressBytes()[1]}.{subnet.GetAddressBytes()[2]}.{subnet.GetAddressBytes()[3] + 1}";
                    string lastAddress = $"{broadcast.GetAddressBytes()[0]}.{broadcast.GetAddressBytes()[1]}.{broadcast.GetAddressBytes()[2]}.{broadcast.GetAddressBytes()[3] - 1}";
                    string domain = IPGlobalProperties.GetIPGlobalProperties().DomainName;

                    string result = "{";
                    result += $"\"firstIp\":\"{Data.EscapeJsonText(firstAddress)}\",";
                    result += $"\"lastIp\":\"{Data.EscapeJsonText(lastAddress)}\",";
                    result += $"\"domain\":\"{Data.EscapeJsonText(domain)}\"";
                    result += "}";

                    return Encoding.UTF8.GetBytes(result);
                }
#if DEBUG
                catch (Exception ex) {
                    Logger.Error(ex);
                }
#else
                catch { }
#endif
            }

        return null;
    }

    [SupportedOSPlatform("windows")]
    public static SearchResult GetWorkstation(string name) {
        if (String.IsNullOrEmpty(name)) return null;

        string normalizedDomain = null;
        try {
            string domain = IPGlobalProperties.GetIPGlobalProperties()?.DomainName;
            if (String.IsNullOrEmpty(domain)) return null;

            normalizedDomain = NormalizeDomain(domain);
            if (String.IsNullOrEmpty(normalizedDomain)) return null;
        }
#if DEBUG
        catch (Exception ex) {
            Logger.Error(ex);
        }
#else
        catch { }
#endif

        if (name.Contains('.')) name = name.Split('.')[0];

        DirectoryEntry directoryEntry = new DirectoryEntry($"LDAP://{normalizedDomain}");
        using DirectorySearcher searcher = new DirectorySearcher(directoryEntry);
        searcher.Filter = $"(&(objectClass=computer)(cn={EscapeLdapValue(name)}))";

        SearchResult result = null;
        try {
            result = searcher.FindOne();
        }
        catch {
            return null;
        }

        if (result is null) return null;
        return result;
    }

    [SupportedOSPlatform("windows")]
    public static SearchResult GetUser(string username) {
        if (String.IsNullOrEmpty(username)) return null;

        string normalizedDomain = null;
        try {
            string domain = IPGlobalProperties.GetIPGlobalProperties()?.DomainName;
            if (String.IsNullOrEmpty(domain)) return null;

            normalizedDomain = NormalizeDomain(domain);
            if (String.IsNullOrEmpty(normalizedDomain)) return null;
        }
#if DEBUG
        catch (Exception ex) {
            Logger.Error(ex);
        }
#else
        catch { }
#endif

        using DirectoryEntry directoryEntry = new DirectoryEntry($"LDAP://{normalizedDomain}");
        SearchResult result = null;

        try {
            using DirectorySearcher searcher = new DirectorySearcher(directoryEntry);
            searcher.Filter = $"(&(objectClass=user)(objectCategory=person)(userPrincipalName={EscapeLdapValue(username)}))";
            result = searcher.FindOne();
        }
#if DEBUG
        catch (Exception ex) {
            Logger.Error(ex);
        }
#else
        catch { }
#endif

        if (result is null)
            try {
                if (username.IndexOf("@") > -1) username = username.Split('@')[0];
                using DirectorySearcher searcher = new DirectorySearcher(directoryEntry);
                //searcher.Filter = "(&(objectClass=user)(objectCategory=person))";
                searcher.Filter = $"(&(objectClass=user)(objectCategory=person)(cn={EscapeLdapValue(username)}))";
                result = searcher.FindOne();
            }
#if DEBUG
            catch (Exception ex) {
                Logger.Error(ex);
            }
#else
            catch { }
#endif

        if (result is null) {
            username = username.ToLower();

            using DirectorySearcher searcher = new DirectorySearcher(directoryEntry);
            searcher.Filter = "(&(objectClass=user)(objectCategory=person))";

            try {
                SearchResultCollection allUsers = searcher.FindAll();
                if (allUsers is null || allUsers.Count == 0) return null;

                for (int i = 0; i < allUsers.Count; i++) {
                    if (allUsers[i].Properties["userPrincipalName"].Count == 0) continue;
                    string un = allUsers[i].Properties["userPrincipalName"][0].ToString();

                    if (un.Contains('@')) un = un[..un.IndexOf("@")];
                    if (un.ToLower() == username) return allUsers[i];
                }
            }
#if DEBUG
            catch (Exception ex) {
                Logger.Error(ex);
            }
#else
            catch { }
#endif
        }

        if (result is null) return null;
        return result;
    }

    private delegate string FormatMethodPtr(string value);
    [SupportedOSPlatform("windows")]
    private static void ContentBuilderAddValue(SearchResult sr, string property, string label, Dictionary<string, string> date, FormatMethodPtr format = null) {
        for (int i = 0; i < sr.Properties[property].Count; i++) {
            string value = sr.Properties[property][i].ToString();
            if (value.Length > 0) {
                if (format != null) value = format.Invoke(value);
                if (String.IsNullOrEmpty(value)) continue;
                date.Add(label, value);
                break;
            }
        }
    }

    [SupportedOSPlatform("windows")]
    public static Dictionary<string, string> AdFetch(string username) {
        SearchResult sr = GetUser(username);
        if (sr is null) return null;
        return AdFetch(sr);
    }
    [SupportedOSPlatform("windows")]
    public static Dictionary<string, string> AdFetch(SearchResult result) {
        Dictionary<string, string> data = new Dictionary<string, string> {
            { "type", "Domain user" }
        };

        ContentBuilderAddValue(result, "title", "title", data, null);
        if (!data.ContainsKey("title")) ContentBuilderAddValue(result, "personalTitle", "title", data, null);

        ContentBuilderAddValue(result, "givenname", "first name", data, null);
        ContentBuilderAddValue(result, "middlename", "middle name", data, null);
        ContentBuilderAddValue(result, "sn", "last name", data, null);

        ContentBuilderAddValue(result, "userprincipalname", "username", data, GetUsername);
        ContentBuilderAddValue(result, "distinguishedname", "distinguished name", data, null);
        ContentBuilderAddValue(result, "displayname", "display name", data, null);

        ContentBuilderAddValue(result, "employeeid", "employee id", data, null);
        ContentBuilderAddValue(result, "company", "company", data, null);
        ContentBuilderAddValue(result, "department", "department", data, null);
        ContentBuilderAddValue(result, "division", "division", data, null);
        ContentBuilderAddValue(result, "comment", "comment", data, null);

        ContentBuilderAddValue(result, "mail", "e-mail", data, null);
        ContentBuilderAddValue(result, "othermailbox", "secondary e-mail", data, null);

        StringBuilder telephoneBuilder = new StringBuilder();
        StringBuilder mobileBuilder = new StringBuilder();

        ResultPropertyValueCollection telephoneCollection = result.Properties["telephonenumber"];
        for (int i = 0; i < telephoneCollection.Count; i++) {
            telephoneBuilder.Append(telephoneBuilder.Length > 0 ? $"; {telephoneCollection[i]}" : telephoneCollection[i].ToString());
        }
        ResultPropertyValueCollection otherTelCollection = result.Properties["othertelephone"];
        for (int i = 0; i< otherTelCollection.Count; i++) {
            telephoneBuilder.Append(telephoneBuilder.Length > 0 ? $"; {otherTelCollection[i]}" : otherTelCollection[i].ToString());
        }

        ResultPropertyValueCollection mobileCollection = result.Properties["mobile"];
        for (int i = 0; i < mobileCollection.Count; i++) {
            mobileBuilder.Append(mobileBuilder.Length > 0 ? $"; {mobileCollection[i]}" : mobileCollection[i].ToString());
        }
        ResultPropertyValueCollection otherMobileCollectrion = result.Properties["othermobile"];
        for (int i = 0; i < otherMobileCollectrion.Count; i++) {
            mobileBuilder.Append(mobileBuilder.Length > 0 ? $"; {otherMobileCollectrion[i]}" : otherMobileCollectrion[i].ToString());
        }

        if (telephoneBuilder.Length > 0) {
            data.Add("telephone number", telephoneBuilder.ToString());
        }

        if (mobileBuilder.Length > 0) {
            data.Add("mobile number", mobileBuilder.ToString());
        }

        ContentBuilderAddValue(result, "facsimiletelephonenumber", "fax", data, null);

        data.Add("object guid", new Guid((byte[])result.Properties["objectGuid"][0]).ToString());

        return data;
    }

    private static string GetUsername(string value) {
        int index = value.IndexOf('@');
        return index > -1 ? value[..index] : value;
    }

    public static string FileTimeString(string value) {
        long ticks = long.Parse(value);
        if (ticks == 0) return String.Empty;
        return DateTime.FromFileTime(ticks).ToString("dddd dd-MMM-yyyy HH:mm:ss");
    }

    [SupportedOSPlatform("windows")]
    public static byte[] UnlockUser(Dictionary<string, string> parameters, string origin) {
        if (parameters is null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        parameters.TryGetValue("file", out string file);

        string username = String.Empty;

        if (DatabaseInstances.users.dictionary.TryGetValue(file, out Database.Entry entry)) {
            if (entry.attributes.TryGetValue("username", out Database.Attribute macValue)) {
                username = macValue.value;
            }
        }
        else {
            return Data.CODE_FILE_NOT_FOUND.Array;
        }

        if (username.Length == 0) return Data.CODE_NOT_ENOUGH_INFO.Array;

        SearchResult sr = GetUser(username);
        if (sr is null) return Data.CODE_NOT_FOUND.Array;

        DirectoryEntry user = new DirectoryEntry(sr.Path);
        user.Properties["LockOutTime"].Value = 0; //unlock account
        user.CommitChanges();
        user.Close();

        Logger.Action(origin, $"Unlock domain user: {username}");

        return Data.CODE_OK.Array;
    }

    [SupportedOSPlatform("windows")]
    public static byte[] EnableUser(Dictionary<string, string> parameters, string origin) {
        if (parameters is null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        parameters.TryGetValue("file", out string file);

        string username = String.Empty;

        if (DatabaseInstances.users.dictionary.TryGetValue(file, out Database.Entry entry)) {
            if (entry.attributes.TryGetValue("username", out Database.Attribute macValue)) {
                username = macValue.value;
            }
        }
        else {
            return Data.CODE_FILE_NOT_FOUND.Array;
        }

        if (username.Length == 0) return Data.CODE_NOT_ENOUGH_INFO.Array;

        SearchResult sr = GetUser(username);
        if (sr is null) return Data.CODE_NOT_FOUND.Array;

        DirectoryEntry user = new DirectoryEntry(sr.Path);
        int userAccountControl = (int)user.Properties["userAccountControl"].Value;
        userAccountControl &= ~0x2;
        user.Properties["userAccountControl"].Value = userAccountControl;

        user.CommitChanges();
        user.Close();

        Logger.Action(origin, $"Enable domain user: {username}");

        return Data.CODE_OK.Array;
    }

    [SupportedOSPlatform("windows")]
    public static byte[] DisableUser(Dictionary<string, string> parameters, string origin) {
        if (parameters is null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        parameters.TryGetValue("file", out string file);

        string username = String.Empty;

        if (DatabaseInstances.users.dictionary.TryGetValue(file, out Database.Entry entry)) {
            if (entry.attributes.TryGetValue("username", out Database.Attribute macValue)) {
                username = macValue.value;
            }
        }
        else {
            return Data.CODE_FILE_NOT_FOUND.Array;
        }

        if (username.Length == 0) return Data.CODE_NOT_ENOUGH_INFO.Array;

        SearchResult sr = GetUser(username);
        if (sr is null) return Data.CODE_NOT_FOUND.Array;

        DirectoryEntry user = new DirectoryEntry(sr.Path);
        int userAccountControl = (int)user.Properties["userAccountControl"].Value;
        userAccountControl |= 0x2;
        user.Properties["userAccountControl"].Value = userAccountControl;

        user.CommitChanges();
        user.Close();

        Logger.Action(origin, $"Disable domain user: {username}");

        return Data.CODE_OK.Array;
    }
}

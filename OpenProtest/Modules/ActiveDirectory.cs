
using System;
using System.DirectoryServices;
using System.Net.NetworkInformation;

public static class ActiveDirectory {
    public static DirectoryEntry GetDirectoryEntry(string domain) {
        if (domain is null) return null;

        DirectoryEntry dir = new DirectoryEntry($"LDAP://{domain}");
        //dir.Username = ".\administrator";
        //dir.Password = "";
        return dir;
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

    internal static char[] ActiveDirVerify(string[] para) {
        throw new NotImplementedException();
    }
}

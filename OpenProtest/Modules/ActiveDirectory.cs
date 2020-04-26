
using System;
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

    public static byte[] GetCurrentNetworkInfo() {
        foreach (NetworkInterface nic in NetworkInterface.GetAllNetworkInterfaces())
            foreach (UnicastIPAddressInformation ip in nic.GetIPProperties().UnicastAddresses) {
                try {
                    if (IPAddress.IsLoopback(ip.Address)) continue;
                    if (ip.Address.AddressFamily != AddressFamily.InterNetwork) continue;

                    IPAddress subnet = IpTools.GetNetworkAddress(ip.Address, ip.IPv4Mask);
                    IPAddress broadcast = IpTools.GetBroadcastAddress(ip.Address, ip.IPv4Mask);

                    string bits = "";
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

}

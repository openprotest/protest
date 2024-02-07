using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using System.Text.RegularExpressions;

namespace Protest.Protocols;

internal static partial class Arp {

    [SupportedOSPlatform("windows")]
    [LibraryImport("iphlpapi.dll")]
    private static partial int SendARP(uint destIP, uint srcIP, byte[] macAddr, ref int macAddrLen);

    [GeneratedRegex("^((?:[0-9]{1,3}\\.){3}[0-9]{1,3})(?:\\s+\\w+){2}\\s+((?:[0-9A-Fa-f]{2}[:-]){5}(?:[0-9A-Fa-f]{2}))")]
    private static partial Regex LinuxMacAddressRegex();

    public static string ArpRequest(string ip) {
        string[] split = ip.Split('.');
        if (split.Length < 4) return String.Empty;

        try {
            IPAddress ipAddress = new IPAddress(new byte[] {
                byte.Parse(split[0]),
                byte.Parse(split[1]),
                byte.Parse(split[2]),
                byte.Parse(split[3])
            });

            if (OperatingSystem.IsWindows()) {
                return ArpRequest_Windows(ipAddress);
            }
            else if (OperatingSystem.IsLinux() || OperatingSystem.IsMacOS()) {
                return ArpRequest_Linux(ipAddress);
            }
            else {
                return String.Empty;
            }
        }
        catch {
            return String.Empty;
        }
    }

    [SupportedOSPlatform("windows")]
    private static string ArpRequest_Windows(IPAddress ip) {
        try {
            if (!IpTools.OnSameNetwork(ip)) return String.Empty;

            int len = 6;
            byte[] mac = new byte[len];
            uint long_ip = BitConverter.ToUInt32(ip.GetAddressBytes());

            _ = SendARP(long_ip, 0, mac, ref len);

            return BitConverter.ToString(mac, 0, (int)len).Replace("-", ":");
        }
        catch {
            return String.Empty;
        }
    }

    [SupportedOSPlatform("linux")]
    [SupportedOSPlatform("osx")]
    private static string ArpRequest_Linux(IPAddress ip) {
        if (!IpTools.OnSameNetwork(ip)) return String.Empty;

        try {
            using FileStream arpFile = new FileStream("/proc/net/arp", FileMode.Open, FileAccess.Read);
            using StreamReader reader = new StreamReader(arpFile);

            Regex regex = LinuxMacAddressRegex();

            reader.ReadLine(); //skip header

            while (!reader.EndOfStream) {
                string line = reader.ReadLine();

                if (String.IsNullOrWhiteSpace(line))
                    return null;

                Match match = regex.Match(line);
                if (!match.Success || match.Groups.Count != 3)
                    return String.Empty;

                string mac = match.Groups[2].Value.Replace("-", ":");
            }

            return String.Empty;

        }
        catch (Exception ex) {
            Logger.Error(ex);
            return String.Empty;
        }
    }

    [SupportedOSPlatform("windows")]
    public static bool ArpPing(string host) {
        try {
            IPAddress[] ips = System.Net.Dns.GetHostAddresses(host);
            if (ips.Length == 0) { return false; }

            IPAddress ip = ips.First(o => o.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork);
            if (!IpTools.OnSameNetwork(ips[0])) {
                return false;
            }

            int len = 6;
            byte[] mac = new byte[len];
            uint long_ip = BitConverter.ToUInt32(ip.GetAddressBytes());

            _ = SendARP(long_ip, 0, mac, ref len);

            return true;
        }
        catch {
            return false;
        }
    }
}
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using System.Text.RegularExpressions;
using System.Diagnostics;

namespace Protest.Protocols;

internal static partial class Arp {

#pragma warning disable SYSLIB1092
    [SupportedOSPlatform("windows")]
    [LibraryImport("iphlpapi.dll")]
    private static partial int SendARP(uint destIP, uint srcIP, byte[] macAddr, ref int macAddrLen);
#pragma warning restore SYSLIB1092

    [GeneratedRegex("^((?:[0-9]{1,3}\\.){3}[0-9]{1,3})(?:\\s+\\w+){2}\\s+((?:[0-9A-Fa-f]{2}[:-]){5}(?:[0-9A-Fa-f]{2}))")]
    private static partial Regex LinuxAddressRegex();

    [GeneratedRegex(@"\bat\s+(([0-9A-F]{1,2}[:-]){5}[0-9A-F]{1,2})\b", RegexOptions.IgnoreCase, "en-GB")]
    private static partial Regex MacAddressRegex();

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
            else if (OperatingSystem.IsLinux()) {
                return ArpRequest_Linux(ipAddress);
            }
            else if (OperatingSystem.IsMacOS()) {
                return ArpRequest_Mac(ipAddress);
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
            if (!ip.OnSameBroadcastDomain()) return String.Empty;

            int len = 6;
            byte[] mac = new byte[len];
            uint long_ip = BitConverter.ToUInt32(ip.GetAddressBytes());

            _ = SendARP(long_ip, 0, mac, ref len);

            return BitConverter.ToString(mac, 0, len).Replace("-", ":");
        }
        catch {
            return String.Empty;
        }
    }

    [SupportedOSPlatform("linux")]
    private static string ArpRequest_Linux(IPAddress ip) {
        if (!ip.OnSameBroadcastDomain()) return String.Empty;

        try {
            using FileStream arpFile = new FileStream("/proc/net/arp", FileMode.Open, FileAccess.Read);
            using StreamReader reader = new StreamReader(arpFile);

            Regex regex = LinuxAddressRegex();

            reader.ReadLine(); //skip header

            while (!reader.EndOfStream) {
                string line = reader.ReadLine();

                if (String.IsNullOrWhiteSpace(line)) {
                    continue;
                }

                Match match = regex.Match(line);
                if (match.Success && match.Groups.Count == 3) {
                    string mac = match.Groups[2].Value.Replace("-", ":");
                    return mac;
                }
            }

            return String.Empty;
        }
        catch (Exception ex) {
            Logger.Error(ex);
            return String.Empty;
        }
    }


    [SupportedOSPlatform("macos")]
    private static string ArpRequest_Mac(IPAddress ip) {
        if (!ip.OnSameBroadcastDomain()) return string.Empty;

        try {
            using Process process = new Process();
            process.StartInfo = new ProcessStartInfo {
                FileName = "/usr/sbin/arp",
                Arguments = $"-n {ip}",
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            process.Start();

            string output = process.StandardOutput.ReadToEnd();
            //string error = process.StandardError.ReadToEnd();

            process.WaitForExit();

            if (process.ExitCode != 0 || string.IsNullOrWhiteSpace(output)) {
                return string.Empty;
            }

            Match match = MacAddressRegex().Match(output);
            if (!match.Success) {
                return string.Empty;
            }

            string mac = match.Groups[1].Value.Replace("-", ":");

            string[] parts = mac.Split(':');
            if (parts.Length != 6)
            return string.Empty;

            for (int i = 0; i < parts.Length; i++) {
                parts[i] = parts[i].PadLeft(2, '0');
            }

            return string.Join(":", parts).ToLowerInvariant();;
        }
        catch (Exception ex) {
            Logger.Error(ex);
            return string.Empty;
        }
    }
}
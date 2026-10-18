using System.Collections.Generic;
using System.Net;
using System.Net.Sockets;

namespace Protest.Proxy;

internal enum IpFilterMode {
    Blacklist,
    Whitelist
}

internal sealed class IpFilter {
    //Entries are IPv4 or IPv6 addresses, or networks in CIDR notation
    //Clients are matched by their socket address, never by forwarded headers

    public bool         enabled = false;
    public IpFilterMode mode    = IpFilterMode.Blacklist;
    public string[]     entries = Array.Empty<string>();

    private IPNetwork[] networks;

    public bool IsAllowed(EndPoint endPoint) {
        if (!enabled) return true;
        return IsAllowed((endPoint as IPEndPoint)?.Address);
    }

    public bool IsAllowed(IPAddress address) {
        if (!enabled) return true;
        if (address is null) return false;

        if (address.IsIPv4MappedToIPv6) {
            address = address.MapToIPv4();
        }

        networks ??= ParseNetworks(entries);

        bool listed = false;
        for (int i = 0; i < networks.Length; i++) {
            if (networks[i].Contains(address)) {
                listed = true;
                break;
            }
        }

        return mode == IpFilterMode.Whitelist ? listed : !listed;
    }

    //Validates the entries and rewrites them in canonical form. Returns an error message, or null when valid
    public string ValidateAndNormalize() {
        if (!Enum.IsDefined(mode)) {
            return "Invalid IP filter mode.";
        }

        List<string> normalized = new List<string>();
        foreach (string entry in entries ?? Array.Empty<string>()) {
            if (String.IsNullOrWhiteSpace(entry)) continue;

            if (!TryParseEntry(entry, out IPNetwork network)) {
                return $"Invalid IP filter entry: {entry.Trim()}";
            }

            string text = ToEntryString(network);
            if (!normalized.Contains(text)) {
                normalized.Add(text);
            }
        }

        if (enabled && mode == IpFilterMode.Whitelist && normalized.Count == 0) {
            return "The IP whitelist is empty, every client would be blocked.";
        }

        entries = normalized.ToArray();
        networks = null;
        return null;
    }

    public static bool TryParseEntry(string entry, out IPNetwork network) {
        network = default;
        if (String.IsNullOrWhiteSpace(entry)) return false;

        string[] split = entry.Trim().Split('/');
        if (split.Length > 2) return false;

        if (!IPAddress.TryParse(split[0], out IPAddress address)) return false;

        //IPAddress also accepts shorthand, octal and hex IPv4 forms, e.g. 10.1 or 010.0.0.1
        if (address.AddressFamily == AddressFamily.InterNetwork && address.ToString() != split[0]) return false;

        if (address.IsIPv4MappedToIPv6) {
            address = address.MapToIPv4();
        }

        int maxPrefix = address.AddressFamily == AddressFamily.InterNetwork ? 32 : 128;
        int prefix = maxPrefix;
        if (split.Length == 2 && (!int.TryParse(split[1], out prefix) || prefix < 0 || prefix > maxPrefix)) return false;

        //clear the host bits, so 10.0.0.5/24 means 10.0.0.0/24
        byte[] bytes = address.GetAddressBytes();
        for (int i = 0; i < bytes.Length; i++) {
            int bits = Math.Clamp(prefix - i * 8, 0, 8);
            bytes[i] &= (byte)(0xFF << (8 - bits));
        }

        network = new IPNetwork(new IPAddress(bytes), prefix);
        return true;
    }

    private static string ToEntryString(IPNetwork network) {
        int maxPrefix = network.BaseAddress.AddressFamily == AddressFamily.InterNetwork ? 32 : 128;
        return network.PrefixLength == maxPrefix ? network.BaseAddress.ToString() : network.ToString();
    }

    private static IPNetwork[] ParseNetworks(string[] entries) {
        List<IPNetwork> list = new List<IPNetwork>();
        foreach (string entry in entries ?? Array.Empty<string>()) {
            if (TryParseEntry(entry, out IPNetwork network)) {
                list.Add(network);
            }
        }
        return list.ToArray();
    }
}

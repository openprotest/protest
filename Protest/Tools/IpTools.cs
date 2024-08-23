using System.Collections.Generic;
using System.Net;
using System.Net.Sockets;
using System.Net.NetworkInformation;

namespace Protest;

public static class IpTools {
    public static bool IsPrivate(this IPAddress address) {
        if (address.AddressFamily != AddressFamily.InterNetwork) return false;

        byte[] bytes = address.GetAddressBytes();
        switch (bytes[0]) {
        case 10:  return true;
        case 127: return true;
        case 172: return bytes[1] < 32 && bytes[1] >= 16;
        case 192: return bytes[1] == 168;
        default:  return false;
        }
    }

    public static bool IsApipa(this IPAddress address) {
        if (address.AddressFamily != AddressFamily.InterNetwork)
            return false;
        byte[] bytes = address.GetAddressBytes();

        if (bytes[0] == 169 && bytes[1] == 254) { return true; }

        return false;
    }

    public static bool OnSameBroadcastDomain(this IPAddress host) {
        foreach (NetworkInterface adapter in NetworkInterface.GetAllNetworkInterfaces()) {
            IPInterfaceProperties properties = adapter.GetIPProperties();

            for (int i = 0; i < properties.UnicastAddresses.Count; i++) {
                if (properties.UnicastAddresses[i].Address.AddressFamily != AddressFamily.InterNetwork) continue;

                IPAddress local = properties.UnicastAddresses[i].Address;
                IPAddress mask = properties.UnicastAddresses[i].IPv4Mask;

                IPAddress localNetwork = GetNetworkAddress(local, mask);
                IPAddress hostNetwork = GetNetworkAddress(host, mask);

                if (localNetwork.Equals(hostNetwork)) return true;
            }
        }

        return false;
    }

    public static IPAddress GetNetworkAddress(IPAddress ip, byte prefix) {
        if (prefix > 32) throw new ArgumentOutOfRangeException(nameof(prefix));

        uint mask = prefix == 0 ? 0 : uint.MaxValue << (32 - prefix);
        byte[] maskBytes = BitConverter.GetBytes(mask);
        if (BitConverter.IsLittleEndian) {
            Array.Reverse(maskBytes);
        }

        return GetNetworkAddress(ip, new IPAddress(maskBytes));
    }

    public static IPAddress GetNetworkAddress(IPAddress ip, IPAddress mask) {
        byte[] bIp = ip.GetAddressBytes();
        byte[] bMask = mask.GetAddressBytes();
        byte[] bNetwork = new byte[4];

        for (int i = 0; i < 4; i++) {
            bNetwork[i] = (byte)(bIp[i] & bMask[i]);
        }

        return new IPAddress(bNetwork);
    }

    public static IPAddress GetBroadcastAddress(IPAddress ip, IPAddress mask) {
        byte[] bIp = ip.GetAddressBytes();
        byte[] bMask = mask.GetAddressBytes();
        byte[] bBroadcast = new byte[4];

        for (int i = 0; i < 4; i++) {
            bBroadcast[i] = (byte)(bIp[i] | ~bMask[i]);
        }

        return new IPAddress(bBroadcast);
    }

    public static IPAddress[] GetGateway() {
        NetworkInterface[] adapters = NetworkInterface.GetAllNetworkInterfaces();
        List<IPAddress> list = new List<IPAddress>();
        foreach (NetworkInterface adapter in adapters) {
            GatewayIPAddressInformationCollection addresses = adapter.GetIPProperties().GatewayAddresses;
            if (addresses.Count == 0) continue;
            foreach (GatewayIPAddressInformation address in addresses) {
                list.Add(address.Address);
            }
        }
        return list.ToArray();
    }

    public static IPAddress[] GetIpAddresses() {
        NetworkInterface[] adapters = NetworkInterface.GetAllNetworkInterfaces();
        List<IPAddress> list = new List<IPAddress>();
        foreach (NetworkInterface adapter in adapters) {
            UnicastIPAddressInformationCollection addresses = adapter.GetIPProperties().UnicastAddresses;
            if (addresses.Count == 0) continue;
            foreach (UnicastIPAddressInformation address in addresses) {
                list.Add(address.Address);
            }
        }
        return list.ToArray();
    }
}

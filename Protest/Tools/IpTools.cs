using System.Collections.Generic;
using System.Net;
using System.Net.Sockets;
using System.Net.NetworkInformation;

namespace Protest;

public static class IpTools {
    public static bool OnSameNetwork(IPAddress host) {
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
        return prefix switch {
            0 => GetNetworkAddress(ip, new IPAddress(new byte[] { 0, 0, 0, 0 })),
            1 => GetNetworkAddress(ip, new IPAddress(new byte[] { 128, 0, 0, 0 })),
            2 => GetNetworkAddress(ip, new IPAddress(new byte[] { 192, 0, 0, 0 })),
            3 => GetNetworkAddress(ip, new IPAddress(new byte[] { 224, 0, 0, 0 })),
            4 => GetNetworkAddress(ip, new IPAddress(new byte[] { 240, 0, 0, 0 })),
            5 => GetNetworkAddress(ip, new IPAddress(new byte[] { 248, 0, 0, 0 })),
            6 => GetNetworkAddress(ip, new IPAddress(new byte[] { 252, 0, 0, 0 })),
            7 => GetNetworkAddress(ip, new IPAddress(new byte[] { 254, 0, 0, 0 })),

            8 => GetNetworkAddress(ip, new IPAddress(new byte[] { 255, 0, 0, 0 })),
            9 => GetNetworkAddress(ip, new IPAddress(new byte[] { 255, 128, 0, 0 })),
            10 => GetNetworkAddress(ip, new IPAddress(new byte[] { 255, 192, 0, 0 })),
            11 => GetNetworkAddress(ip, new IPAddress(new byte[] { 255, 224, 0, 0 })),
            12 => GetNetworkAddress(ip, new IPAddress(new byte[] { 255, 240, 0, 0 })),
            13 => GetNetworkAddress(ip, new IPAddress(new byte[] { 255, 248, 0, 0 })),
            14 => GetNetworkAddress(ip, new IPAddress(new byte[] { 255, 252, 0, 0 })),
            15 => GetNetworkAddress(ip, new IPAddress(new byte[] { 255, 254, 0, 0 })),

            16 => GetNetworkAddress(ip, new IPAddress(new byte[] { 255, 255, 0, 0 })),
            17 => GetNetworkAddress(ip, new IPAddress(new byte[] { 255, 255, 128, 0 })),
            18 => GetNetworkAddress(ip, new IPAddress(new byte[] { 255, 255, 192, 0 })),
            19 => GetNetworkAddress(ip, new IPAddress(new byte[] { 255, 255, 224, 0 })),
            20 => GetNetworkAddress(ip, new IPAddress(new byte[] { 255, 255, 240, 0 })),
            21 => GetNetworkAddress(ip, new IPAddress(new byte[] { 255, 255, 248, 0 })),
            22 => GetNetworkAddress(ip, new IPAddress(new byte[] { 255, 255, 252, 0 })),
            23 => GetNetworkAddress(ip, new IPAddress(new byte[] { 255, 255, 254, 0 })),

            24 => GetNetworkAddress(ip, new IPAddress(new byte[] { 255, 255, 255, 0 })),
            25 => GetNetworkAddress(ip, new IPAddress(new byte[] { 255, 255, 255, 128 })),
            26 => GetNetworkAddress(ip, new IPAddress(new byte[] { 255, 255, 255, 192 })),
            27 => GetNetworkAddress(ip, new IPAddress(new byte[] { 255, 255, 255, 224 })),
            28 => GetNetworkAddress(ip, new IPAddress(new byte[] { 255, 255, 255, 240 })),
            29 => GetNetworkAddress(ip, new IPAddress(new byte[] { 255, 255, 255, 248 })),
            30 => GetNetworkAddress(ip, new IPAddress(new byte[] { 255, 255, 255, 252 })),
            31 => GetNetworkAddress(ip, new IPAddress(new byte[] { 255, 255, 255, 254 })),

            _ => GetNetworkAddress(ip, new IPAddress(new byte[] { 255, 255, 255, 254 })),
        };
    }

    public static IPAddress GetNetworkAddress(IPAddress ip, IPAddress mask) {
        byte[] bIp = ip.GetAddressBytes();
        byte[] bMask = mask.GetAddressBytes();
        byte[] bNetwork = new byte[4];

        for (int i = 0; i < 4; i++)
            bNetwork[i] = (byte)(bIp[i] & bMask[i]);

        return new IPAddress(bNetwork);
    }

    public static IPAddress GetBroadcastAddress(IPAddress ip, IPAddress mask) {
        byte[] bIp = ip.GetAddressBytes();
        byte[] bMask = mask.GetAddressBytes();
        byte[] bBroadcast = new byte[4];

        for (int i = 0; i < 4; i++)
            bBroadcast[i] = (byte)(bIp[i] | ~bMask[i]);

        return new IPAddress(bBroadcast);
    }

    public static IPAddress[] GetGateway() {
        NetworkInterface[] adapters = NetworkInterface.GetAllNetworkInterfaces();
        List<IPAddress> list = new List<IPAddress>();
        foreach (NetworkInterface adapter in adapters) {
            GatewayIPAddressInformationCollection addresses = adapter.GetIPProperties().GatewayAddresses;
            if (addresses.Count > 0)
                foreach (GatewayIPAddressInformation address in addresses)
                    list.Add(address.Address);
        }
        return list.ToArray();
    }
}
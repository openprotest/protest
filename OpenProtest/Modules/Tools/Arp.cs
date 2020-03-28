using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Text;
using System.Threading.Tasks;

public static class Arp {
    [System.Runtime.InteropServices.DllImport("iphlpapi.dll", ExactSpelling = true)] public static extern int SendARP(uint DestIP, uint SrcIP, byte[] pMacAddr, ref int PhyAddrLen);

    public static string ArpRequest(string ip) {
        string[] split = ip.Split('.');
        if (split.Length < 4) return "";

        try {
            IPAddress ipAddress = new IPAddress(new byte[] {
            Byte.Parse(split[0]),
            Byte.Parse(split[1]),
            Byte.Parse(split[2]),
            Byte.Parse(split[3])});
            return ArpRequest(ipAddress);
        } catch {
            return "";
        }
    }

    public static string ArpRequest(IPAddress ip) {
        try {
            if (!IpTools.OnSameNetwork(ip)) return "";

            int len = 6;
            byte[] mac = new byte[len];
            byte[] byte_ip = ip.GetAddressBytes();
            uint long_ip = (uint)(byte_ip[3] * 16777216 + byte_ip[2] * 65536 + byte_ip[1] * 256 + byte_ip[0]);
            SendARP(long_ip, 0, mac, ref len);

            return BitConverter.ToString(mac, 0, len).Replace("-", ":");
        } catch {
            return "";
        }
    }

}
using System.Net.Sockets;
using System.Net;
using System.Text;
using System.Collections.Generic;

namespace Protest.Protocols;

internal class Wol {
    public static byte[] Wakeup(Dictionary<string, string> parameters) {
        if (parameters is null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        parameters.TryGetValue("file", out string file);

        string mac = String.Empty;
        string ip = String.Empty;
        string mask = "255.255.255.0";

        if (DatabaseInstances.devices.dictionary.TryGetValue(file, out Database.Entry entry)) {
            if (entry.attributes.TryGetValue("mac address", out Database.Attribute macValue)) {
                mac = macValue.value;
            }
            if (entry.attributes.TryGetValue("ip", out Database.Attribute ipValue)) {
                ip = ipValue.value;
            }
            if (entry.attributes.TryGetValue("mask", out Database.Attribute maskValue)) {
                mask = maskValue.value;
            }
        }
        else {
            return Data.CODE_FILE_NOT_FOUND.Array;
        }

        if (ip.Length == 0 || mac.Length == 0) return Data.CODE_NOT_ENOUGH_INFO.Array;

        return Wakeup(mac, ip, mask);
    }

    public static byte[] Wakeup(in string mac, string ip, string mask) {
        if (ip.Contains(';')) ip = ip[..ip.IndexOf(";")].Trim();
        if (mask.Contains(';')) mask = mask[..mask.IndexOf(";")].Trim();

        try {
            return Wakeup(mac, IPAddress.Parse(ip), IPAddress.Parse(mask));
        }
        catch (Exception ex) {
            return Encoding.UTF8.GetBytes($"\"error\":\"{Data.EscapeJsonText(ex.Message)}\"");
        }
    }

    public static byte[] Wakeup(string mac, IPAddress ip, IPAddress mask) {
        if (mac.Contains(';')) mac = mac.Split(';')[0].Trim();

        string[] macDigits;
        if (mac.Contains('-'))
            macDigits = mac.Split('-');
        else if (mac.Contains(':'))
            macDigits = mac.Split(':');
        else if (mac.Length == 12)
            macDigits = new string[] { mac[..2], mac[2..4], mac[4..6], mac[6..8], mac[8..10], mac[10..12] };
        else
            return "invalid mac address"u8.ToArray();

        if (macDigits.Length != 6) return "invalid mac address"u8.ToArray();

        byte[] datagram = new byte[512];

        for (int i = 1; i < 6; i++)
            datagram[i] = 0xff;

        for (int i = 0; i < 16; i++)
            for (int j = 0; j < 6; j++)
                datagram[6 + i * 6 + j] = Convert.ToByte(macDigits[j], 16);

        for (int i = datagram.Length - 7; i < datagram.Length; i++)
            datagram[i] = 0;

        try {
            IPAddress broadcast = IpTools.GetBroadcastAddress(ip, mask);

            using UdpClient client = new UdpClient();
            client.Send(datagram, datagram.Length, broadcast.ToString(), 1);
            client.Send(datagram, datagram.Length, "255.255.255.255", 1);
        }
        catch {
            return Data.CODE_FAILED.Array;
        }

        return Data.CODE_OK.Array;
    }
}

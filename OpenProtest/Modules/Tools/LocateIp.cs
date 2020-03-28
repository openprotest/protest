using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Text;
using System.Threading.Tasks;

public static class LocateIp {
    public static byte[] Locate(string[] para) {
        if (para.Length < 2) return null;
        string ip = para[1];
        return Locate(ip);
    }
    public static byte[] Locate(string ip) {
        string[] split = ip.Split('.');

        if (split.Length != 4) { //if not an ip, do a dns resolve
            byte[] dnsresponse = Dns.DnsLookup(ip);
            if (dnsresponse is null) return null;
            split = Encoding.UTF8.GetString(dnsresponse).Split((char)127)[0].Split('.');
        }

        if (split.Length != 4) return null;

        try {
            byte msb = byte.Parse(split[0]); //most significant bit
            uint target = BitConverter.ToUInt32(new byte[] {
                byte.Parse(split[3]),
                byte.Parse(split[2]),
                byte.Parse(split[1]),
                msb
            }, 0);

            FileInfo file = new FileInfo($"{Strings.DIR_IP_LOCATION}\\{split[0]}.bin");

            if (!file.Exists) return Encoding.UTF8.GetBytes("not found");

            FileStream stream = new FileStream(file.FullName, FileMode.Open, FileAccess.Read);

            uint dictionaryStart = BitConverter.ToUInt32(new byte[] {
                (byte)stream.ReadByte(),
                (byte)stream.ReadByte(),
                (byte)stream.ReadByte(),
                (byte)stream.ReadByte()
            }, 0);


            uint from, to;
            uint pivot;
            uint low = 4;
            uint high = dictionaryStart;

            do { //binary search
                pivot = (low + high) / 2;
                pivot = 4 + pivot - pivot % 26;
                stream.Position = pivot;

                from = BitConverter.ToUInt32(new byte[] {
                    0,
                    (byte)stream.ReadByte(),
                    (byte)stream.ReadByte(),
                    msb,
                }, 0);

                to = BitConverter.ToUInt32(new byte[] {
                    255,
                    (byte)stream.ReadByte(),
                    (byte)stream.ReadByte(),
                    msb,
                }, 0);

                if (target >= from && target <= to) break; //found

                if (target < from && target < to) high = pivot;
                if (target > from && target > to) low = pivot;
            } while (high - low >= 26);

            if (target >= from && target <= to) { //### found ###
                string fl = Encoding.UTF8.GetString(new byte[] { (byte)stream.ReadByte(), (byte)stream.ReadByte() });

                byte[] bytes = new byte[4];

                for (sbyte i = 0; i < 4; i++) bytes[i] = (byte)stream.ReadByte();
                uint ptr1 = BitConverter.ToUInt32(bytes, 0);

                for (sbyte i = 0; i < 4; i++) bytes[i] = (byte)stream.ReadByte();
                uint ptr2 = BitConverter.ToUInt32(bytes, 0);

                for (sbyte i = 0; i < 4; i++) bytes[i] = (byte)stream.ReadByte();
                uint ptr3 = BitConverter.ToUInt32(bytes, 0);

                for (sbyte i = 0; i < 4; i++) bytes[i] = (byte)stream.ReadByte();
                Single lon = BitConverter.ToSingle(bytes, 0);

                for (sbyte i = 0; i < 4; i++) bytes[i] = (byte)stream.ReadByte();
                Single lat = BitConverter.ToSingle(bytes, 0);

                stream.Position = (long)(dictionaryStart + ptr1);
                string s1 = "";
                while (true) {
                    int b = stream.ReadByte();
                    if (b == 0) break;
                    s1 += (char)b;
                }

                stream.Position = (long)(dictionaryStart + ptr2);
                string s2 = "";
                while (true) {
                    int b = stream.ReadByte();
                    if (b == 0) break;
                    s2 += (char)b;
                }

                stream.Position = (long)(dictionaryStart + ptr3);
                string s3 = "";
                while (true) {
                    int b = stream.ReadByte();
                    if (b == 0) break;
                    s3 += (char)b;
                }

                stream.Close();
                return Encoding.UTF8.GetBytes(
                    fl + ";" +
                    s1 + ";" +
                    s2 + ";" +
                    s3 + ";" +
                    lon + "," + lat + ";" +
                    IsProxy(String.Join(".", split)).ToString().ToLower()
                );
            } //### end found ###

            stream.Close();
            return Encoding.UTF8.GetBytes("not found");
        } catch {
            return null;
        }
    }

    public static bool IsProxy(IPAddress ip) {
        return IsProxy(ip.ToString());
    }
    public static bool IsProxy(string ip) {
        string[] split = ip.Split('.');
        if (split.Length != 4) { //if not an ip, do a dns resolve

            byte[] dnsresponse = Dns.DnsLookup(ip);
            if (dnsresponse is null) return false;
            split = Encoding.UTF8.GetString(dnsresponse).Split((char)127)[0].Split('.');
        }

        if (split.Length != 4) return false;

        try {
            byte msb = byte.Parse(split[0]); //most significant bit
            uint target = BitConverter.ToUInt32(new byte[] {
                    byte.Parse(split[3]),
                    byte.Parse(split[2]),
                    byte.Parse(split[1]),
                    msb
                }, 0);

            FileInfo file = new FileInfo($"{Strings.DIR_PROXY}\\{split[0]}.bin");
            if (!file.Exists) return false;

            using FileStream stream = new FileStream(file.FullName, FileMode.Open, FileAccess.Read);

            uint from, to;
            uint pivot;
            uint low = 4;
            uint high = (uint)file.Length - 1;

            do { //binary search
                pivot = (low + high) / 2;
                pivot -= pivot % 6;
                stream.Position = pivot;

                from = BitConverter.ToUInt32(new byte[] {
                    (byte)stream.ReadByte(),
                    (byte)stream.ReadByte(),
                    (byte)stream.ReadByte(),
                    msb,
                }, 0);

                to = BitConverter.ToUInt32(new byte[] {
                    (byte)stream.ReadByte(),
                    (byte)stream.ReadByte(),
                    (byte)stream.ReadByte(),
                    msb,
                }, 0);

                if (target >= from && target <= to) break; //found

                if (target < from && target < to) high = pivot;
                if (target > from && target > to) low = pivot;
            } while (high - low > 6);

            if (target >= from && target <= to) { //### found ###
                stream.Close();
                return true;
            }

        } catch {
            return false;
        }

        return false;
    }

}


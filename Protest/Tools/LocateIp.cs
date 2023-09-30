using System.IO;
using System.Net;
using System.Text;

namespace Protest.Tools;

internal static class LocateIp {
    public static byte[] Locate(HttpListenerContext ctx) {
        string payload;
        using (StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding))
            payload = reader.ReadToEnd();

        if (string.IsNullOrEmpty(payload)) return Data.CODE_INVALID_ARGUMENT.Array;
        return Locate(payload);
    }
    public static byte[] Locate(string ip, bool onlyLocation = false) {
        string[] split = ip.Split('.');
        if (split.Length != 4) { //if not an ip, do a dns resolve
            IPAddress[] response = Protocols.Dns.NativeDnsLookup(ip);
            if (response is null) return null;
            split = response.Select(x => x.ToString()).ToArray();
            split = response.Length > 0 ? response[0].ToString().Split(".") : null;
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

            FileInfo file = new FileInfo($"{Data.DIR_IP_LOCATION}\\{split[0]}.bin");

            if (!file.Exists) return "not found"u8.ToArray();

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
                string s1 = String.Empty;
                while (true) {
                    int b = stream.ReadByte();
                    if (b == 0) break;
                    s1 += (char)b;
                }

                stream.Position = (long)(dictionaryStart + ptr2);
                string s2 = String.Empty;
                while (true) {
                    int b = stream.ReadByte();
                    if (b == 0) break;
                    s2 += (char)b;
                }

                stream.Position = (long)(dictionaryStart + ptr3);
                string s3 = String.Empty;
                while (true) {
                    int b = stream.ReadByte();
                    if (b == 0) break;
                    s3 += (char)b;
                }

                stream.Close();

                if (onlyLocation) {
                    return Encoding.UTF8.GetBytes(
                        fl + ";" +
                        s1 + ";" +
                        s2 + ";" +
                        s3 + ";" +
                        lon + "," + lat
                    );
                }
                else {
                    bool isTor = IsTor(String.Join(".", split));
                    bool isProxy = !isTor && IsProxy(String.Join(".", split));

                    return Encoding.UTF8.GetBytes(
                        fl + ";" +
                        s1 + ";" +
                        s2 + ";" +
                        s3 + ";" +
                        lon + "," + lat + ";" +
                        isProxy.ToString().ToLower() + ";" +
                        isTor.ToString().ToLower()
                    );
                }


            } //### end found ###

            stream.Close();
            return "not found"u8.ToArray();
        }
        catch {
            return null;
        }
    }

    public static bool IsProxy(in IPAddress ip) {
        return IsProxy(ip.ToString());
    }
    public static bool IsProxy(in string ip) {
        string[] split = ip.Split('.');
        if (split.Length != 4) { //if not an ip, do a dns resolve

            IPAddress[] response = Protocols.Dns.NativeDnsLookup(ip);
            if (response is null) return false;
            split = response.Select(x => x.ToString()).ToArray();
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

            FileInfo file = new FileInfo($"{Data.DIR_PROXY}\\{split[0]}.bin");
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

        }
        catch {
            return false;
        }

        return false;
    }

    public static bool IsTor(in IPAddress ip) {
        return IsTor(ip.ToString());
    }
    public static bool IsTor(in string ip) {
        string[] split = ip.Split('.');
        if (split.Length != 4) { //if not an ip, do a dns resolve

            IPAddress[] response = Protocols.Dns.NativeDnsLookup(ip);
            if (response is null) return false;
            split = response.Select(x => x.ToString()).ToArray();
        }

        if (split.Length != 4) return false;

        try {
            uint target = BitConverter.ToUInt32(new byte[] {
                    byte.Parse(split[3]),
                    byte.Parse(split[2]),
                    byte.Parse(split[1]),
                    byte.Parse(split[0]),
                }, 0);

            FileInfo file = new FileInfo(Data.FILE_TOR);
            if (!file.Exists) return false;

            using FileStream stream = new FileStream(file.FullName, FileMode.Open, FileAccess.Read);

            uint pivot;
            uint low = 4;
            uint high = (uint)file.Length - 1;
            uint current;

            do { //binary search
                pivot = (low + high) / 2;
                pivot -= pivot % 4;
                stream.Position = pivot;

                current = BitConverter.ToUInt32(new byte[] {
                    (byte)stream.ReadByte(),
                    (byte)stream.ReadByte(),
                    (byte)stream.ReadByte(),
                    (byte)stream.ReadByte()
                }, 0);

                if (target == current) break; //found

                if (target < current) high = pivot;
                if (target > current) low = pivot;
            } while (high - low > 7);

            if (target == current) { //### found ###
                stream.Close();
                return true;
            }

        }
        catch {
            return false;
        }

        return false;
    }
}

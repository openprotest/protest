using System.IO;
using System.Net;
using System.Text;

namespace Protest.Tools;

internal static class MacLookup {
    public static byte[] Lookup(HttpListenerContext ctx) {
        using StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding);
        string payload = reader.ReadToEnd();

        if (String.IsNullOrEmpty(payload)) return Data.CODE_INVALID_ARGUMENT.Array;
        return Lookup(payload);
    }

    public static byte[] Lookup(string mac) {
        string name = LookupToString(mac);
        if (name is null) return null;
        return Encoding.UTF8.GetBytes(name);
    }

    public static string LookupToString(string mac) {
        mac = mac.Replace("-", String.Empty);
        mac = mac.Replace(":", String.Empty);
        mac = mac.Replace(" ", String.Empty);
        if (mac.Length < 6)
            return null;

        byte[] t = new byte[4];
        try {
            t[3] = 0;
            t[2] = byte.Parse(mac[0..2], System.Globalization.NumberStyles.HexNumber);
            t[1] = byte.Parse(mac[2..4], System.Globalization.NumberStyles.HexNumber);
            t[0] = byte.Parse(mac[4..6], System.Globalization.NumberStyles.HexNumber);
        }
        catch {
            return "not found";
        }

        uint target = BitConverter.ToUInt32(t, 0);

        try {
            FileInfo file = new FileInfo(Data.FILE_MAC);
            if (!file.Exists)
                return null;

            FileStream stream = new FileStream(file.FullName, FileMode.Open, FileAccess.Read);

            uint dictionaryStart = BitConverter.ToUInt32(new byte[] {
                (byte)stream.ReadByte(),
                (byte)stream.ReadByte(),
                (byte)stream.ReadByte(),
                (byte)stream.ReadByte()
            }, 0);

            uint current;
            uint pivot;
            uint low = 4;
            uint high = dictionaryStart;

            do { //binary search
                pivot = (low + high) / 2;
                pivot = 4 + pivot - pivot % 7;
                stream.Position = pivot;

                byte[] buff = new byte[4];
                buff[3] = 0;
                buff[2] = (byte)stream.ReadByte();
                buff[1] = (byte)stream.ReadByte();
                buff[0] = (byte)stream.ReadByte();

                current = BitConverter.ToUInt32(buff, 0);

                if (current == target) break; //found

                if (target < current) high = pivot;
                if (target > current) low = pivot;
            } while (high - low > 7);

            if (current == target) { //### found ###
                int name_index = BitConverter.ToInt32(new byte[] {
                        (byte)stream.ReadByte(),
                        (byte)stream.ReadByte(),
                        (byte)stream.ReadByte(),
                        (byte)stream.ReadByte()
                    }, 0);

                stream.Position = dictionaryStart + name_index;
                string name = String.Empty;
                while (true) {
                    int b = stream.ReadByte();
                    if (b == 0) break;
                    name += (char)b;
                }

                stream.Close();
                return name;
            } //end found

            stream.Close();
            return "not found";
        }
        catch {
            return null;
        }
    }

}

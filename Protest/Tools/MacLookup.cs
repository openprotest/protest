using System.IO;
using System.Net;
using System.Text;

namespace Protest.Tools;

internal static partial class MacLookup {
#if DEBUG
    private static readonly (byte, byte, string)[][] table = [];
#endif

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
        if (table.Length == 0) return "not found";

        mac = mac.Replace("-", "").Replace(":", "").Replace(" ", "").Replace(".", "");
        if (!byte.TryParse(mac[0..2], System.Globalization.NumberStyles.HexNumber, null, out byte a)) return "not found";
        if (!byte.TryParse(mac[2..4], System.Globalization.NumberStyles.HexNumber, null, out byte b)) return "not found";
        if (!byte.TryParse(mac[4..6], System.Globalization.NumberStyles.HexNumber, null, out byte c)) return "not found";

        return Lookup(a, b, c);
    }

    private static string Lookup(byte a, byte b, byte c) {

        (byte, byte, string)[] subArray = table[a];

        if (subArray == null || subArray.Length == 0) return "not found";

        int start = 0;
        int end = subArray.Length - 1;

        while (start <= end) {
            int mid = (start + end) / 2;
            (byte midB, byte midC, string vendor) = subArray[mid];

            if (midB == b && midC == c) return vendor;

            if (midB < b || (midB == b && midC < c)) {
                start = mid + 1;
            }
            else {
                end = mid - 1;
            }
        }

        return "not found";
    }

}

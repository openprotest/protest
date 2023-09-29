using System.IO;
using System.Net;

namespace Protest.Tools;
internal class Zones {
    public static byte[] ListZones() {
        if (!File.Exists(Data.FILE_ZONES)) return "[]"u8.ToArray();

        try {
            byte[] zones = File.ReadAllBytes(Data.FILE_ZONES);
            return zones;
        }
        catch {
            return Data.CODE_FAILED.Array;
        }
    }

    public static byte[] SaveZones(HttpListenerContext ctx) {
        string payload;
        using (StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding))
            payload = reader.ReadToEnd();

        File.WriteAllText(Data.FILE_ZONES, payload);

        return Data.CODE_OK.Array;
    }

}

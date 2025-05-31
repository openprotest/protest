using Protest.Http;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;

namespace Protest.Tools;
internal static class Zones {

    private static readonly Lock mutex = new Lock();

    public static byte[] ListZones() {
        if (!File.Exists(Data.FILE_ZONES)) return "[]"u8.ToArray();

        try {
            lock (mutex) {
                return File.ReadAllBytes(Data.FILE_ZONES);
            }
        }
        catch {
            return Data.CODE_FAILED.Array;
        }
    }

    public static string ListZonesString() {
        if (!File.Exists(Data.FILE_ZONES))
            return "[]";

        try {
            lock (mutex) {
                return File.ReadAllText(Data.FILE_ZONES);
            }
        }
        catch {
            return "[]";
        }
    }

    public static byte[] SaveZones(HttpListenerContext ctx, string origin) {
        using StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding);
        string payload = reader.ReadToEnd();

        lock (mutex) {
            File.WriteAllText(Data.FILE_ZONES, payload);
        }

        KeepAlive.Broadcast($"{{\"action\":\"zones\",\"list\":{payload}}}", "/config/zones/list");

        Logger.Action(origin, $"Modify zones list");

        return Data.CODE_OK.Array;
    }

}

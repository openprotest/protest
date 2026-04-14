using System.IO;
using System.Net;
using System.Threading;
using Protest.Http;

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
        catch (IOException ex) {
            Logger.Error(ex);
            return Data.CODE_FAILED.Array;
        }
        catch (UnauthorizedAccessException ex) {
            Logger.Error(ex);
            return Data.CODE_FAILED.Array;
        }
        catch (Exception ex) {
            Logger.Error(ex);
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
        catch (IOException ex) {
            Logger.Error(ex);
            return "[]";
        }
        catch (UnauthorizedAccessException ex) {
            Logger.Error(ex);
            return "[]";
        }
        catch (Exception ex) {
            Logger.Error(ex);
            return "[]";
        }
    }

    public static byte[] SaveZones(HttpListenerContext ctx, string origin) {
        if (ctx.Request.ContentLength64 > 1024*1024) { //1MB
            Logger.Action(origin, "Environment", $"Reject zones list update: payload too large");
            return Data.CODE_FAILED.Array;
        }

        using StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding);
        string payload = reader.ReadToEnd();

        lock (mutex) {
            File.WriteAllText(Data.FILE_ZONES, payload);
        }

        KeepAlive.Broadcast($"{{\"action\":\"zones\",\"list\":{payload}}}", "/config/zones/list");

        Logger.Action(origin, "Environment", $"Modify zones list");

        return Data.CODE_OK.Array;
    }

}

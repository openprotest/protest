using Protest.Http;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;

namespace Protest.Tools;
internal static class DhcpRange {

    private static readonly Lock mutex = new Lock();

    public static byte[] ListRange() {
        if (!File.Exists(Data.FILE_DHCP_RANGE)) return "[]"u8.ToArray();

        try {
            lock (mutex) {
                return File.ReadAllBytes(Data.FILE_DHCP_RANGE);
            }
        }
        catch {
            return Data.CODE_FAILED.Array;
        }
    }

    public static string ListRangeString() {
        if (!File.Exists(Data.FILE_DHCP_RANGE))
            return "[]";

        try {
            lock (mutex) {
                return File.ReadAllText(Data.FILE_DHCP_RANGE);
            }
        }
        catch {
            return "[]";
        }
    }

    public static byte[] SaveRange(HttpListenerContext ctx, string origin) {
        using StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding);
        string payload = reader.ReadToEnd();

        lock (mutex) {
            File.WriteAllText(Data.FILE_DHCP_RANGE, payload);
        }

        KeepAlive.Broadcast($"{{\"action\":\"dhcp-range\",\"list\":{payload}}}", "/config/dhcprange/list");

        Logger.Action(origin, $"Modify DHCP range list");

        return Data.CODE_OK.Array;
    }

}

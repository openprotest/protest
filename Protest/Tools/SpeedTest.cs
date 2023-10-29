using System.Collections.Generic;
using System.Net;

namespace Protest.Tools;

internal static class SpeedTest {
    static readonly byte[] buffer = Cryptography.RandomByteGenerator(65_535);

    public static byte[] DownStream(HttpListenerContext ctx, Dictionary<string, string> parameters) {
        if (parameters is null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        int duration = 8; //s
        int chunkSize = 65_535;

        if (parameters.TryGetValue("duration", out string durationString)) {
            _ = int.TryParse(durationString, out duration);
        }

        if (parameters.TryGetValue("chunksize", out string chunkSizeString)) {
            _ = int.TryParse(chunkSizeString, out chunkSize);
        }

        duration = Math.Min(duration, 60);
        chunkSize = Math.Min(chunkSize, 65_535);

        ctx.Response.SendChunked = true;

        ctx.Response.StatusCode = (int)HttpStatusCode.OK;
        ctx.Response.ContentType = "text/plain; charset=utf-8";

        ctx.Response.OutputStream.Write(buffer, 0, 64); //ping
        ctx.Response.OutputStream.Flush();

        long start = DateTime.Now.Ticks;
        while (start + 10_000_000 * duration >= DateTime.Now.Ticks) {
            ctx.Response.OutputStream.Write(buffer, 0, chunkSize);
            ctx.Response.OutputStream.Flush();
        }

        return null;
    }

    public static byte[] UpStream(HttpListenerContext ctx, Dictionary<string, string> parameters) {
        if (parameters is null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        int duration = 8; //s
        int chunkSize = 65_535;

        if (parameters.TryGetValue("duration", out string durationString)) {
            int.TryParse(durationString, out duration);
        }

        if (parameters.TryGetValue("chunksize", out string chunkSizeString)) {
            int.TryParse(chunkSizeString, out chunkSize);
        }

        duration = Math.Min(duration, 60);
        chunkSize = Math.Min(chunkSize, 65_535);

        ctx.Response.SendChunked = true;

        return null;
    }
}
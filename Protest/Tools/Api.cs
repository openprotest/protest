using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Text;
using System.Threading.Tasks;
using Protest.Http;

namespace Protest.Tools;
internal static class Api {
    private static readonly object mutex;
    private static readonly ConcurrentDictionary<string, ulong> counter;
    private static readonly ConcurrentDictionary<string, ulong> traffic;

    static Api() {
        mutex = new object();
        counter = new ConcurrentDictionary<string, ulong>();
        traffic = new ConcurrentDictionary<string, ulong>();
    }

    internal static void HandleApiCall(HttpListenerContext ctx) {
        Dictionary<string, string> parameters = Listener.ParseQuery(ctx.Request.Url.Query);

        if (!parameters.TryGetValue("apikey", out string apiKey)) {
            ctx.Response.StatusCode = (int)HttpStatusCode.Unauthorized;
            return;
        }

        //TODO:

        ctx.Response.StatusCode = (int)HttpStatusCode.OK;
    }

    internal static byte[] List() {
        return null;
    }

    internal static byte[] Create(Dictionary<string, string> parameters, string origin) {
        return null;
    }

    internal static byte[] Delete(Dictionary<string, string> parameters, string origin) {
        return null;
    }

}
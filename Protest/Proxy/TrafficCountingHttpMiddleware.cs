using System.Collections.Concurrent;
using System.IO;
using System.Threading.Tasks;
using System.Threading;
using System.Net;
using Microsoft.AspNetCore.Http;

namespace Protest.Proxy;
internal sealed class TrafficCountingHttpMiddleware {
    private readonly RequestDelegate _next;
    private readonly ConcurrentDictionary<string, long> bytesRx;
    private readonly ConcurrentDictionary<string, long> bytesTx;

    public TrafficCountingHttpMiddleware(RequestDelegate next, ConcurrentDictionary<string, long> bytesRx, ConcurrentDictionary<string, long> bytesTx) {
        _next = next;
        this.bytesRx = bytesRx;
        this.bytesTx = bytesTx;
    }

    public async Task InvokeAsync(HttpContext context) {
        string key = context.Connection.RemoteIpAddress.ToString();

        Stream requestStream = context.Request.Body;
        Stream responseStream = context.Response.Body;

        using TrafficCountingStreamWrapper requestWrapper = new TrafficCountingStreamWrapper(requestStream, key, bytesTx, bytesRx);
        using TrafficCountingStreamWrapper responseWrapper = new TrafficCountingStreamWrapper(responseStream, key, bytesTx, bytesRx);

        context.Request.Body = requestWrapper;
        context.Response.Body = responseWrapper;

        try {
            await _next(context);
        }
        finally {
            context.Request.Body = requestStream;
            context.Response.Body = responseStream;
        }
    }
}

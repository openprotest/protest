using System.Collections.Concurrent;
using System.IO;
using System.Threading.Tasks;
using System.Threading;
using System.Net;
using Microsoft.AspNetCore.Http;

namespace Protest.Proxy;
internal class TrafficCountingHttpMiddleware {
    private readonly RequestDelegate _next;
    private readonly ConcurrentDictionary<uint, long> bytesRx;
    private readonly ConcurrentDictionary<uint, long> bytesTx;

    public TrafficCountingHttpMiddleware(RequestDelegate next, ConcurrentDictionary<uint, long> bytesRx, ConcurrentDictionary<uint, long> bytesTx) {
        _next = next;
        this.bytesRx = bytesRx;
        this.bytesTx = bytesTx;
    }

    public async Task InvokeAsync(HttpContext context) {
        IPAddress remoteIp = context.Connection.RemoteIpAddress;
        uint key = BitConverter.ToUInt32(remoteIp.GetAddressBytes(), 0);

        Stream originalRequestBody = context.Request.Body;
        Stream originalResponseBody = context.Response.Body;

        using MemoryStream requestBodyStream = new MemoryStream();
        using MemoryStream responseBodyStream = new MemoryStream();

        context.Request.Body = requestBodyStream;
        context.Response.Body = responseBodyStream;

        await originalRequestBody.CopyToAsync(requestBodyStream);
        bytesRx.AddOrUpdate(key, requestBodyStream.Length, (_, old) => old + requestBodyStream.Length);

        requestBodyStream.Seek(0, SeekOrigin.Begin);
        context.Request.Body = requestBodyStream;

        await _next(context);

        responseBodyStream.Seek(0, SeekOrigin.Begin);
        await responseBodyStream.CopyToAsync(originalResponseBody);
        bytesTx.AddOrUpdate(key, responseBodyStream.Length, (_, old) => old + responseBodyStream.Length);

        context.Request.Body = originalRequestBody;
        context.Response.Body = originalResponseBody;
    }
}

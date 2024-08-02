using System.Collections.Concurrent;
using System.IO;
using System.Threading.Tasks;
using System.Threading;
using System.Net;
using Microsoft.AspNetCore.Http;
using System.Collections.Generic;
using Microsoft.Extensions.Primitives;

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

        long requestHeadersSize = CalculateHeadersSize(context.Request.Headers);
        long responseHeadersSize;

        Stream originalRequestBody = context.Request.Body;
        Stream originalResponseBody = context.Response.Body;

        using MemoryStream requestBodyStream = new MemoryStream();
        using MemoryStream responseBodyStream = new MemoryStream();

        context.Request.Body = requestBodyStream;
        context.Response.Body = responseBodyStream;

        await originalRequestBody.CopyToAsync(requestBodyStream);
        bytesRx.AddOrUpdate(key, requestBodyStream.Length + requestHeadersSize, (_, old) => old + requestBodyStream.Length + requestHeadersSize);

        requestBodyStream.Seek(0, SeekOrigin.Begin);
        context.Request.Body = requestBodyStream;

        await _next(context);

        responseHeadersSize = CalculateHeadersSize(context.Response.Headers);

        responseBodyStream.Seek(0, SeekOrigin.Begin);
        await responseBodyStream.CopyToAsync(originalResponseBody);
        bytesTx.AddOrUpdate(key, responseBodyStream.Length + responseHeadersSize, (_, old) => old + responseBodyStream.Length + responseHeadersSize);

        context.Request.Body = originalRequestBody;
        context.Response.Body = originalResponseBody;
    }

    private long CalculateHeadersSize(IHeaderDictionary headers) {
        long size = 0;
        foreach (KeyValuePair<string, StringValues> header in headers) {
            size += header.Key.Length + header.Value.Sum(value => value.Length) + 4;
        }
        return size;
    }
}

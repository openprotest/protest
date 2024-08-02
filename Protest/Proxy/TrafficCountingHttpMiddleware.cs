using System.Collections.Concurrent;
using System.IO;
using System.Threading.Tasks;
using System.Threading;
using System.Net;
using Microsoft.AspNetCore.Http;

namespace Protest.Proxy;
internal sealed class TrafficCountingHttpMiddleware {
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

        Stream requestStream = context.Request.Body;
        Stream responseStream = context.Response.Body;

        using StreamWrapper requestWrapper = new StreamWrapper(requestStream, key, bytesTx, bytesRx);
        using StreamWrapper responseWrapper = new StreamWrapper(responseStream, key, bytesTx, bytesRx);

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

file sealed class StreamWrapper : Stream {
    private readonly Stream baseStream;
    private readonly uint key;
    private readonly ConcurrentDictionary<uint, long> bytesRx;
    private readonly ConcurrentDictionary<uint, long> bytesTx;

    public StreamWrapper(Stream stream, uint clientIp, ConcurrentDictionary<uint, long> bytesRx, ConcurrentDictionary<uint, long> bytesTx) {
        this.baseStream = stream;
        this.key = clientIp;
        this.bytesRx = bytesRx;
        this.bytesTx = bytesTx;
    }

    public override bool CanRead => baseStream.CanRead;
    public override bool CanSeek => baseStream.CanSeek;
    public override bool CanWrite => baseStream.CanWrite;
    public override long Length => baseStream.Length;

    public override long Position {
        get => baseStream.Position;
        set => baseStream.Position = value;
    }

    public override void Flush() => baseStream.Flush();

    public override long Seek(long offset, SeekOrigin origin) => baseStream.Seek(offset, origin);

    public override void SetLength(long value) => baseStream.SetLength(value);

    public override int Read(byte[] buffer, int offset, int count) {
        int length = baseStream.Read(buffer, offset, count);
        bytesRx.AddOrUpdate(key, length, (_, old) => old + length);
        return length;
    }

    public override void Write(byte[] buffer, int offset, int count) {
        baseStream.Write(buffer, offset, count);
        bytesTx.AddOrUpdate(key, count, (_, old) => old + count);
    }

    public override async Task<int> ReadAsync(byte[] buffer, int offset, int count, CancellationToken cancellationToken) {
        int length = await baseStream.ReadAsync(buffer, offset, count, cancellationToken);
        bytesRx.AddOrUpdate(key, length, (_, old) => old + length);
        return length;
    }

    public override async Task WriteAsync(byte[] buffer, int offset, int count, CancellationToken cancellationToken) {
        await baseStream.WriteAsync(buffer, offset, count, cancellationToken);
        bytesTx.AddOrUpdate(key, count, (_, old) => old + count);
    }

    protected override void Dispose(bool disposing) {
        if (disposing) {
            baseStream.Dispose();
        }
        base.Dispose(disposing);
    }
}

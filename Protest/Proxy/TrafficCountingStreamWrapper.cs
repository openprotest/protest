using Microsoft.AspNetCore.DataProtection.Repositories;
using System.Collections.Concurrent;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Threading;
using System.Threading.Tasks;

namespace Protest.Proxy;
internal sealed class TrafficCountingStreamWrapper : Stream {
    private readonly Stream baseStream;
    private readonly string key;
    private ConcurrentDictionary<string, long> bytesRx, bytesTx;

    public TrafficCountingStreamWrapper(Stream stream, string clientIp, ConcurrentDictionary<string, long> bytesRx, ConcurrentDictionary<string, long> bytesTx) {
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
        int length = await baseStream.ReadAsync(buffer, offset, count, cancellationToken).ConfigureAwait(false);
        bytesRx.AddOrUpdate(key, length, (_, old) => old + length);
        return length;
    }

    public override async Task WriteAsync(byte[] buffer, int offset, int count, CancellationToken cancellationToken) {
        await baseStream.WriteAsync(buffer, offset, count, cancellationToken).ConfigureAwait(false);
        bytesTx.AddOrUpdate(key, count, (_, old) => old + count);
    }

    protected override void Dispose(bool disposing) {
        if (disposing) {
            baseStream?.Dispose();
        }
        base.Dispose(disposing);
    }
}

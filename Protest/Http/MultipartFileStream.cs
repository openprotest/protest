using System;
using System.Buffers;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace Protest.Http;

//streams the content of the first part of a multipart/form-data body
public sealed class MultipartFileStream : Stream {
    private const int BUFFER_SIZE  = 1024 * 1024; //fewer and larger reads, http.sys is far faster with large reads
    private const int MAX_HEADERS  = 64 * 1024;
    private const int MAX_BOUNDARY = 70; //RFC 2046

    private static readonly byte[] headerSeparator = "\r\n\r\n"u8.ToArray();

    private readonly Stream input;
    private readonly byte[] boundary;
    private readonly Action<int> progress;
    private readonly long totalLength;

    private byte[] buffer = ArrayPool<byte>.Shared.Rent(BUFFER_SIZE);
    private int start;     //first byte not yet consumed
    private int end;       //end of the data in the buffer
    private int available; //bytes from start that are content, clear of the boundary
    private bool started;  //the part headers are skipped
    private bool found;    //the boundary follows the available bytes
    private bool completed;
    private long bytesRead;
    private int lastReport = -1;

    public MultipartFileStream(Stream input, string boundary, long totalLength) : this(input, boundary, totalLength, null) { }

    public MultipartFileStream(Stream input, string boundary, long totalLength, Action<int> progress) {
        //lenient, beyond the RFC limit, as long as the tail kept between reads stays small
        if (String.IsNullOrEmpty(boundary) || boundary.Length > MAX_HEADERS) {
            throw new ArgumentException("Invalid multipart boundary.", nameof(boundary));
        }

        this.input = input;
        this.boundary = Encoding.UTF8.GetBytes("\r\n--" + boundary);
        this.totalLength = totalLength;
        this.progress = progress;
    }

    //the boundary parameter of a multipart/form-data content type, or null
    public static string GetBoundary(string contentType) {
        if (String.IsNullOrEmpty(contentType) || !contentType.StartsWith("multipart/form-data", StringComparison.OrdinalIgnoreCase)) {
            return null;
        }

        foreach (string parameter in contentType.Split(';')) {
            string trimmed = parameter.Trim();
            if (!trimmed.StartsWith("boundary=", StringComparison.OrdinalIgnoreCase)) continue;

            string value = trimmed[9..];
            if (value.Length >= 2 && value[0] == '"' && value[^1] == '"') {
                value = value[1..^1];
            }

            return value.Length > 0 && value.Length <= MAX_BOUNDARY ? value : null;
        }

        return null;
    }

    public override int Read(byte[] destination, int offset, int count) {
        return Read(destination.AsSpan(offset, count));
    }

    public override int Read(Span<byte> destination) {
        ObjectDisposedException.ThrowIf(buffer is null, this);
        if (destination.IsEmpty) return 0;

        while (!completed) {
            if (available > 0) return Take(destination);
            if (found) {
                completed = true;
                break;
            }

            Compact();
            Append(input.Read(buffer, end, buffer.Length - end));
        }

        return 0;
    }

    public override Task<int> ReadAsync(byte[] destination, int offset, int count, CancellationToken cancellationToken) {
        return ReadAsync(destination.AsMemory(offset, count), cancellationToken).AsTask();
    }

    public override async ValueTask<int> ReadAsync(Memory<byte> destination, CancellationToken cancellationToken = default) {
        ObjectDisposedException.ThrowIf(buffer is null, this);
        if (destination.IsEmpty) return 0;

        while (!completed) {
            if (available > 0) return Take(destination.Span);
            if (found) {
                completed = true;
                break;
            }

            Compact();
            Append(await input.ReadAsync(buffer.AsMemory(end), cancellationToken));
        }

        return 0;
    }

    private int Take(Span<byte> destination) {
        int count = Math.Min(available, destination.Length);
        buffer.AsSpan(start, count).CopyTo(destination);

        start += count;
        available -= count;
        bytesRead += count;

        if (available == 0 && found) completed = true;

        ReportProgress();
        return count;
    }

    //moves the bytes not yet consumed to the beginning of the buffer
    private void Compact() {
        if (start == 0) return;
        Buffer.BlockCopy(buffer, start, buffer, 0, end - start);
        end -= start;
        start = 0;
    }

    private void Append(int read) {
        if (read <= 0) {
            throw new InvalidDataException("Unexpected end of multipart body.");
        }

        end += read;

        if (!started) {
            int index = buffer.AsSpan(start, end - start).IndexOf(headerSeparator);
            if (index < 0) {
                if (end - start > MAX_HEADERS) {
                    throw new InvalidDataException("Multipart headers are too large.");
                }
                return;
            }

            start += index + headerSeparator.Length;
            started = true;
        }

        ReadOnlySpan<byte> data = buffer.AsSpan(start, end - start);
        int position = data.IndexOf(boundary);

        if (position >= 0) {
            available = position;
            found = true;
        }
        else {
            //the tail could be the beginning of the boundary
            available = Math.Max(data.Length - (boundary.Length - 1), 0);
        }
    }

    private void ReportProgress() {
        if (progress == null || totalLength <= 0) return;

        int percentage = (int)(bytesRead * 100 / totalLength);

        if (percentage - lastReport >= 5) {
            lastReport = percentage;
            progress(percentage);
        }
    }

    protected override void Dispose(bool disposing) {
        if (buffer is not null) {
            ArrayPool<byte>.Shared.Return(buffer);
            buffer = null;
        }
        base.Dispose(disposing);
    }

    public override bool CanRead => true;
    public override bool CanSeek => false;
    public override bool CanWrite => false;
    public override long Length => throw new NotSupportedException();
    public override long Position {
        get => throw new NotSupportedException();
        set => throw new NotSupportedException();
    }

    public override void Flush() => throw new NotSupportedException();
    public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
    public override void SetLength(long value) => throw new NotSupportedException();
    public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
}

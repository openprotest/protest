using System;
using System.Collections.Generic;
using System.IO;
using System.Text;

namespace Protest.Http;

public sealed class MultipartFileStream : Stream {
    private readonly Stream input;
    private readonly byte[] boundary;
    private readonly byte[] buffer = new byte[81920];
    private readonly Action<int> progress;
    private readonly long totalLength;

    private int bufferOffset;
    private int bufferCount;
    private bool started;
    private bool completed;
    private long bytesRead;
    private int lastReport = -1;

    public MultipartFileStream(Stream input, string boundary, long totalLength) {
        this.input = input;
        this.boundary = Encoding.UTF8.GetBytes("\r\n--" + boundary);
        this.totalLength = totalLength;
        this.progress = null;
    }

    public MultipartFileStream(Stream input, string boundary, long totalLength, Action<int> progress) {
        this.input = input;
        this.boundary = Encoding.UTF8.GetBytes("\r\n--" + boundary);
        this.totalLength = totalLength;
        this.progress = progress;
    }

    public override int Read(byte[] destination, int offset, int count) {
        if (completed) return 0;

        if (!started) {
            ReadHeaders();
            started = true;
        }

        int written = 0;

        while (written < count) {
            if (bufferCount == 0) {
                int read = input.Read(buffer, 0, buffer.Length);

                if (read == 0) {
                    completed = true;
                    break;
                }

                bufferOffset = 0;
                bufferCount = read;
            }

            int boundaryPosition = IndexOf(buffer, bufferOffset, bufferCount, boundary);

            if (boundaryPosition >= 0) {
                int available = boundaryPosition - bufferOffset;
                int copy = Math.Min(available, count - written);

                Buffer.BlockCopy(buffer, bufferOffset, destination, offset + written, copy);

                bufferOffset += copy;
                bufferCount -= copy;
                written += copy;
                bytesRead += copy;

                ReportProgress();

                if (copy < available) break;

                completed = true;
                break;
            }

            int keep = boundary.Length - 1;
            int availableData = bufferCount - keep;

            if (availableData <= 0) {
                if (bufferOffset > 0) {
                    Buffer.BlockCopy(buffer, bufferOffset, buffer, 0, bufferCount);
                    bufferOffset = 0;
                }

                int read = input.Read(buffer, bufferOffset + bufferCount, buffer.Length - bufferOffset - bufferCount);

                if (read == 0) {
                    completed = true;
                    break;
                }

                bufferCount += read;
                continue;
            }

            int amount = Math.Min(availableData, count - written);

            Buffer.BlockCopy(buffer, bufferOffset, destination, offset + written, amount);

            bufferOffset += amount;
            bufferCount -= amount;
            written += amount;
            bytesRead += amount;

            ReportProgress();
        }

        return written;
    }

    private void ReportProgress() {
        if (progress == null || totalLength <= 0) return;

        int percentage = (int)(bytesRead * 100 / totalLength);

        if (percentage - lastReport >= 5) {
            lastReport = percentage;
            progress(percentage);
        }
    }

    private void ReadHeaders() {
        using MemoryStream headers = new MemoryStream();

        int previous = -1;

        while (true) {
            int current = input.ReadByte();

            if (current == -1) {
                throw new InvalidDataException("Unexpected end of multipart body.");
            }

            headers.WriteByte((byte)current);

            if (previous == '\r' && current == '\n') {
                byte[] data = headers.ToArray();

                if (data.Length >= 4 && data[^4] == '\r' && data[^3] == '\n' && data[^2] == '\r' && data[^1] == '\n') {
                    return;
                }
            }

            previous = current;

            if (headers.Length > 64 * 1024) {
                throw new InvalidDataException("Multipart headers are too large.");
            }
        }
    }

    private static int IndexOf(byte[] source, int offset, int count, byte[] value) {
        int end = offset + count - value.Length;

        for (int i = offset; i <= end; i++) {
            int j = 0;
            while (j < value.Length && source[i + j] == value[j]) {
                j++;
            }

            if (j == value.Length) return i;
        }

        return -1;
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
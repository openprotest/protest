using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;

namespace Protest.Http;

internal sealed class MultipartFileHelper {

    internal static bool TryReadMultipartFile(HttpListenerRequest request, out string filename, out byte[] content) {
        filename = null;
        content = null;

        if (String.IsNullOrWhiteSpace(request.ContentType) || !request.ContentType.StartsWith("multipart/form-data", StringComparison.OrdinalIgnoreCase)) {
            return false;
        }

        string boundary = request.ContentType
            .Split(';')
            .Select(p => p.Trim())
            .FirstOrDefault(p => p.StartsWith("boundary=", StringComparison.OrdinalIgnoreCase))
            ?[9..];

        if (String.IsNullOrEmpty(boundary)) return false;

        boundary = "--" + boundary;

        using MemoryStream ms = new MemoryStream();
        request.InputStream.CopyTo(ms);

        byte[] raw = ms.ToArray();
        byte[] boundaryBytes = Encoding.ASCII.GetBytes(boundary);
        byte[] headerSeparator = "\r\n\r\n"u8.ToArray();

        int position = 0;

        while (position < raw.Length) {
            int boundaryIndex = IndexOf(raw, boundaryBytes, position);

            if (boundaryIndex < 0) break;

            position = boundaryIndex + boundaryBytes.Length;

            if (position + 1 < raw.Length &&
                raw[position] == '-' &&
                raw[position + 1] == '-') {
                break;
            }

            if (position + 1 < raw.Length &&
                raw[position] == '\r' &&
                raw[position + 1] == '\n') {
                position += 2;
            }

            int headersEnd = IndexOf(raw, headerSeparator, position);

            if (headersEnd < 0) break;

            string headers = Encoding.UTF8.GetString(raw, position, headersEnd - position);

            Match match = Regex.Match(headers, @"filename=""([^""]*)""");
            if (!match.Success) break;

            filename = Path.GetFileName(match.Groups[1].Value);

            position = headersEnd + headerSeparator.Length;

            byte[] nextBoundary = Encoding.ASCII.GetBytes("\r\n" + boundary);

            int contentEnd = IndexOf(raw, nextBoundary, position);

            if (contentEnd < 0) break;

            int length = contentEnd - position;

            content = new byte[length];
            Buffer.BlockCopy(raw, position, content, 0, length);

            return true;
        }

        return false;
    }

    private static int IndexOf(byte[] buffer, byte[] pattern, int startIndex) {
        for (int i = startIndex; i <= buffer.Length - pattern.Length; i++) {
            bool match = true;

            for (int j = 0; j < pattern.Length; j++) {
                if (buffer[i + j] != pattern[j]) {
                    match = false;
                    break;
                }
            }

            if (match) return i;
        }

        return -1;
    }
}
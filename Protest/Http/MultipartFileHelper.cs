using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Threading.Tasks;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Net.Http.Headers;

namespace Protest.Http;

internal static class MultipartFileHelper {
    internal sealed record Upload(string Filename, byte[] Content, Dictionary<string, string> Fields);

    internal static async Task<Upload> ReadAsync(Stream body, string contentType) {
        if (!MediaTypeHeaderValue.TryParse(contentType, out MediaTypeHeaderValue mediaType)
            || !mediaType.MediaType.Equals("multipart/form-data", StringComparison.OrdinalIgnoreCase)) {
            return null;
        }

        string boundary = HeaderUtilities.RemoveQuotes(mediaType.Boundary).Value;
        if (String.IsNullOrEmpty(boundary)) return null;

        MultipartReader reader = new MultipartReader(boundary, body);
        string filename = null;
        byte[] content = null;
        Dictionary<string, string> fields = new Dictionary<string, string>(StringComparer.Ordinal);

        MultipartSection section;
        while ((section = await reader.ReadNextSectionAsync()) is not null) {
            if (!ContentDispositionHeaderValue.TryParse(section.ContentDisposition, out ContentDispositionHeaderValue disposition)) {
                return null;
            }

            if (disposition.IsFileDisposition()) {
                if (content is not null) return null;

                FileMultipartSection file = new FileMultipartSection(section, disposition);
                filename = Path.GetFileName(file.FileName);
                using MemoryStream buffer = new MemoryStream();
                await file.FileStream.CopyToAsync(buffer);
                content = buffer.ToArray();
            }
            else if (disposition.IsFormDisposition()) {
                FormMultipartSection field = new FormMultipartSection(section, disposition);
                // A leading U+FEFF can be part of a password.
                using StreamReader value = new StreamReader(section.Body, new UTF8Encoding(false), detectEncodingFromByteOrderMarks: false, leaveOpen: true);
                fields[field.Name] = await value.ReadToEndAsync();
            }
        }

        return content is null ? null : new Upload(filename, content, fields);
    }
}

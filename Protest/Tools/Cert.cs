using System.Collections.Generic;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.IO;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using System.Text.Json;

namespace Protest.Tools;

internal static class Cert {
    internal static byte[] Create(HttpListenerContext ctx, string origin) {
        using StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding);
        string payload = reader.ReadToEnd();

        string name = null;
        string domain = null;
        string keySizeString = null;
        string hashString = null;
        string validAfterString = null;
        string validBeforeString = null;
        string altNamesString = null;
        string password = String.Empty;

        string[] lines = payload.Split("\n");
        for (int i = 0; i < lines.Length; i++) {
            lines[i] = lines[i].Trim();

            if (lines[i].StartsWith("name=")) {
                name = Uri.UnescapeDataString(lines[i][5..]);
            }
            else if (lines[i].StartsWith("domain=")) {
                domain = Uri.UnescapeDataString(lines[i][7..]);
            }
            else if (lines[i].StartsWith("keysize=")) {
                keySizeString = Uri.UnescapeDataString(lines[i][8..]);
            }
            else if (lines[i].StartsWith("hash=")) {
                hashString = Uri.UnescapeDataString(lines[i][5..]);
            }
            else if (lines[i].StartsWith("validafter=")) {
                validAfterString = Uri.UnescapeDataString(lines[i][11..]);
            }
            else if (lines[i].StartsWith("validbefore=")) {
                validBeforeString = Uri.UnescapeDataString(lines[i][12..]);
            }
            else if (lines[i].StartsWith("alternative=")) {
                altNamesString = Uri.UnescapeDataString(lines[i][12..]);
            }
            else if (lines[i].StartsWith("password=")) {
                password = Uri.UnescapeDataString(lines[i][9..]);
            }
        }

        int keySize;
        if (!int.TryParse(keySizeString, out keySize)) {
            keySize = 2048;
        }

        HashAlgorithmName hashAlgorithm = hashString switch {
            "md5"      => HashAlgorithmName.MD5,
            "sha1"     => HashAlgorithmName.SHA1,
            "sha-256"  => HashAlgorithmName.SHA256,
            "sha-384"  => HashAlgorithmName.SHA384,
            "sha-512"  => HashAlgorithmName.SHA512,
            "sha3-256" => HashAlgorithmName.SHA3_256,
            "sha3-384" => HashAlgorithmName.SHA3_384,
            "sha3-512" => HashAlgorithmName.SHA3_512,
            _          => HashAlgorithmName.SHA256
        };

        if (!DateTime.TryParse(validAfterString, out DateTime validAfter)) {
            validAfter = DateTime.Now;
        }

        if (!DateTime.TryParse(validBeforeString, out DateTime validBefore)) {
            validBefore = DateTime.Now.AddYears(5);
        }

        string[] subjectAlternativeNames = altNamesString?.Split(',').Select(o=>o.Trim()).ToArray() ?? Array.Empty<String>();

        X509KeyUsageFlags keyUsageFlags = X509KeyUsageFlags.DigitalSignature | X509KeyUsageFlags.KeyEncipherment;

        try {
            X509Certificate2 cert = CreateSelfSignedCertificate(
            domain,
            keySize,
            hashAlgorithm,
            validAfter,
            validBefore,
            subjectAlternativeNames,
            keyUsageFlags,
            name);

            string filename = $"{name}.pfx";
            foreach (char c in System.IO.Path.GetInvalidFileNameChars()) {
                filename = filename.Replace(c, '_');
            }

            ExportToPfx(cert, password, filename);

            Logger.Action(origin, "Certificate", "Create certificate");

            return List();
        }
        catch (Exception ex) {
            return Encoding.UTF8.GetBytes($"{{\"error\":\"{Data.EscapeJsonText(ex.Message)}\"}}");
        }
    }

    internal static byte[] Upload(HttpListenerContext ctx, string origin) {
        try {
            HttpListenerRequest request = ctx.Request;

            if (String.IsNullOrWhiteSpace(request.ContentType) ||
                !request.ContentType.StartsWith("multipart/form-data", StringComparison.OrdinalIgnoreCase)) {
                return Data.CODE_INVALID_ARGUMENT.Array;
            }

            string boundary = request.ContentType
                .Split(';')
                .Select(p => p.Trim())
                .FirstOrDefault(p => p.StartsWith("boundary=", StringComparison.OrdinalIgnoreCase))
                ?[9..];

            if (String.IsNullOrEmpty(boundary)) {
                return Data.CODE_INVALID_ARGUMENT.Array;
            }

            boundary = "--" + boundary;

            using MemoryStream ms = new MemoryStream();
            request.InputStream.CopyTo(ms);

            byte[] raw = ms.ToArray();

            byte[] boundaryBytes = Encoding.ASCII.GetBytes(boundary);
            byte[] headerSeparator = Encoding.ASCII.GetBytes("\r\n\r\n");

            DirectoryInfo directory = new DirectoryInfo(Data.DIR_CERTIFICATES);
            if (!directory.Exists) {
                directory.Create();
            }

            int position = 0;

            while (position < raw.Length) {

                //find boundary
                int boundaryIndex = IndexOf(raw, boundaryBytes, position);
                if (boundaryIndex < 0) {
                    break;
                }

                position = boundaryIndex + boundaryBytes.Length;

                //end marker?
                if (position + 1 < raw.Length &&
                    raw[position] == '-' &&
                    raw[position + 1] == '-') {
                    break;
                }

                //skip CRLF
                if (position + 1 < raw.Length &&
                    raw[position] == '\r' &&
                    raw[position + 1] == '\n') {
                    position += 2;
                }

                //find header end
                int headersEnd = IndexOf(raw, headerSeparator, position);
                if (headersEnd < 0) {
                    break;
                }

                string headers = Encoding.UTF8.GetString(raw, position, headersEnd - position);

                Match filenameMatch = Regex.Match(headers, @"filename=""([^""]*)""");

                position = headersEnd + headerSeparator.Length;

                //find next boundary
                byte[] nextBoundarySearch = Encoding.ASCII.GetBytes("\r\n" + boundary);

                int nextBoundary = IndexOf(raw, nextBoundarySearch, position);
                if (nextBoundary < 0) {
                    break;
                }

                int fileLength = nextBoundary - position;

                if (!filenameMatch.Success) {
                    position = nextBoundary;
                    continue;
                }

                string name = filenameMatch.Groups[1].Value;

                if (String.IsNullOrWhiteSpace(name)) {
                    position = nextBoundary;
                    continue;
                }

                name = Path.GetFileName(name).ToLowerInvariant();

                if (!name.EndsWith(".pfx", StringComparison.OrdinalIgnoreCase)) {
                    position = nextBoundary;
                    continue;
                }

                name = name[..^4];

                int counter = 2;
                string newName = $"{name}.pfx";

                while (File.Exists(Path.Join(Data.DIR_CERTIFICATES, newName))) {
                    newName = $"{name} {counter++}.pfx";
                }

                byte[] fileContent = new byte[fileLength];
                Buffer.BlockCopy(raw, position, fileContent, 0, fileLength);

                File.WriteAllBytes(Path.Join(Data.DIR_CERTIFICATES, newName), fileContent);

                Logger.Action(origin, "Certificate", $"Upload certificate: {newName}");

                break;
            }

            return List();
        }
        catch (Exception ex) {
            Logger.Debug(ex);
            return Data.CODE_FAILED.Array;
        }
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

            if (match) {
                return i;
            }
        }

        return -1;
    }

    internal static byte[] List() {
        DirectoryInfo directory = new DirectoryInfo(Data.DIR_CERTIFICATES);
        if (!directory.Exists) return "{\"data\":{},\"length\":0}"u8.ToArray();

        FileInfo[] files = directory.GetFiles();

        return JsonSerializer.SerializeToUtf8Bytes(new {
            data = files.ToDictionary(
                file => Data.EscapeJsonText(file.Name),
                file => new {
                    name = new { v = Data.EscapeJsonText(file.Name) },
                    date = new { v = file.CreationTimeUtc.Ticks },
                    size = new { v = file.Length }
                }
            ),
            length = files.Length
        });
    }

    internal static byte[] GetCertInfo(HttpListenerContext ctx, Dictionary<string, string> parameters) {
        parameters.TryGetValue("name", out string name);
        parameters.TryGetValue("password", out string password);
        return GetCertInfo(name, password);
    }

    private static byte[] GetCertInfo(string name, string password) {
        string filename = Path.Join(Data.DIR_CERTIFICATES, name);

        if (!File.Exists(filename)) {
            throw new FileNotFoundException(filename);
        }

        byte[] pfxBytes = File.ReadAllBytes(filename);

        try {
            using X509Certificate2 cert = X509CertificateLoader.LoadPkcs12(pfxBytes, password);

            String dnsNames = String.Join(", ", GetSanDnsNames(cert));
            if (String.IsNullOrEmpty(dnsNames)) {
                dnsNames = "--";
            } 

            return JsonSerializer.SerializeToUtf8Bytes(
                new {
                    subject       = cert.Subject,
                    issuer        = cert.Issuer,
                    friendlyName  = String.IsNullOrEmpty(cert.FriendlyName) ? "--" : cert.FriendlyName,
                    thumbprint    = cert.Thumbprint,
                    serialNumber  = cert.SerialNumber,

                    issuedAt      = cert.NotBefore,
                    expiresAt     = cert.NotAfter,

                    hasPrivateKey = cert.HasPrivateKey,

                    signatureAlgorithm = cert.SignatureAlgorithm.FriendlyName,
                    publicKeyAlgorithm = cert.PublicKey.Oid.FriendlyName,

                    version = cert.Version,
                    keySize = cert.GetRSAPublicKey()?.KeySize,

                    dnsNames = dnsNames
                }
            );
        }
        catch (Exception ex) {
            return Encoding.UTF8.GetBytes($"{{\"error\":\"{Data.EscapeJsonText(ex.Message)}\"}}");
        }
    }

    private static string[] GetSanDnsNames(X509Certificate2 cert) {
        foreach (X509Extension ext in cert.Extensions) {
            if (ext.Oid?.Value != "2.5.29.17") {
                continue;
            }

            AsnEncodedData asn = new AsnEncodedData(ext.Oid, ext.RawData);

            return asn.Format(true)
                .Split(new[] { "\r\n", "\n" }, StringSplitOptions.RemoveEmptyEntries)
                .Where(x => x.Contains("DNS Name="))
                .Select(x => x.Replace("DNS Name=", "").Trim())
                .ToArray();
        }

        return Array.Empty<string>();
    }

    internal static byte[] Delete(Dictionary<string, string> parameters, string origin) {
        if (parameters is null) { return Data.CODE_FAILED.Array; }

        parameters.TryGetValue("name", out string name);
        if (String.IsNullOrEmpty(name)) { return Data.CODE_INVALID_ARGUMENT.Array; }

        try {
            string filename = Path.Join(Data.DIR_CERTIFICATES, name);
            if (File.Exists(filename)) {
                File.Delete(filename);
                Logger.Action(origin, "Certificate", $"Delete certificate: {name}");

                return List();
            }
            else {
                return Data.CODE_FILE_NOT_FOUND.Array;
            }
        }
        catch {
            return Data.CODE_FAILED.Array;
        }
    }

    internal static byte[] Download(HttpListenerContext ctx, Dictionary<string, string> parameters, string origin) {
        if (parameters is null) { return Data.CODE_FAILED.Array; }

        parameters.TryGetValue("name", out string name);
        if (String.IsNullOrEmpty(name)) { return Data.CODE_INVALID_ARGUMENT.Array; }

        string filename = Path.Join(Data.DIR_CERTIFICATES, name);

        if (!File.Exists(filename)) {
            return Data.CODE_FILE_NOT_FOUND.Array;
        }

        try {
            using FileStream fs = File.OpenRead(filename);
            ctx.Response.ContentLength64 = fs.Length;
            ctx.Response.SendChunked = false;
            ctx.Response.ContentType = System.Net.Mime.MediaTypeNames.Application.Octet;
            ctx.Response.AddHeader("Content-disposition", "attachment; filename=" + name);

            byte[] buffer = new byte[64 * 1024];
            int read;
            using (BinaryWriter bw = new BinaryWriter(ctx.Response.OutputStream)) {
                while ((read = fs.Read(buffer, 0, buffer.Length)) > 0) {
                    bw.Write(buffer, 0, read);
                    bw.Flush();
                }

                bw.Close();
            }

            ctx.Response.StatusCode = (int)HttpStatusCode.OK;
            ctx.Response.StatusDescription = "OK";
            ctx.Response.OutputStream.Close();

            Logger.Action(origin, "Certificate", $"Download certificate: {name}");

            return null;
        }
        catch {
            return Data.CODE_FAILED.Array;
        }
    }

    private static X509Certificate2 CreateSelfSignedCertificate(
        string domain,
        int rsaKeySize,
        HashAlgorithmName hashAlgorithm,
        DateTimeOffset notBefore,
        DateTimeOffset notAfter,
        string[] subjectAlternativeNames,
        X509KeyUsageFlags keyUsageFlags,
        string friendlyName) {

        try {
            DirectoryInfo directory = new DirectoryInfo(Data.DIR_CERTIFICATES);
            if (!directory.Exists) {
                directory.Create();
            }
        } catch (Exception) {
            throw;
        }

        using RSA rsa = RSA.Create(rsaKeySize);

        CertificateRequest request = new CertificateRequest($"CN={domain}", rsa, hashAlgorithm, RSASignaturePadding.Pkcs1);
        request.CertificateExtensions.Add(new X509BasicConstraintsExtension(false, false, 0, true));
        request.CertificateExtensions.Add(new X509KeyUsageExtension(keyUsageFlags, false));

        if (subjectAlternativeNames is not null && subjectAlternativeNames.Length > 0) {
            SubjectAlternativeNameBuilder sanBuilder = new SubjectAlternativeNameBuilder();
            foreach (string san in subjectAlternativeNames) {
                if (String.IsNullOrEmpty(san)) { continue; }
                if (IPAddress.TryParse(san, out IPAddress ip)) {
                    sanBuilder.AddIpAddress(ip);
                }
                else {
                    sanBuilder.AddDnsName(san);
                }
            }
            request.CertificateExtensions.Add(sanBuilder.Build());
        }

        request.CertificateExtensions.Add(new X509SubjectKeyIdentifierExtension(request.PublicKey, false));

        X509Certificate2 certificate = request.CreateSelfSigned(notBefore, notAfter);

        if (OperatingSystem.IsWindows()) {
            certificate.FriendlyName = friendlyName;
        }

        return certificate;
    }

    private static void ExportToPfx(X509Certificate2 certificate, string password, string filename) {
        byte[] bytes = certificate.Export(X509ContentType.Pfx, password);
        File.WriteAllBytes(Path.Join(Data.DIR_CERTIFICATES, filename), bytes);
    }
}

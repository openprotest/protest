using System.Collections.Generic;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.IO;
using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;
using Protest.Http;

namespace Protest.Tools;

internal static class Cert {
    private static readonly Lock filesLock = new Lock();
    private static readonly string validityDirectory = Path.Join(Data.DIR_CERTIFICATES, ".validity");

    private sealed record CertificateValidity(
        [property: JsonRequired] string FileHash,
        [property: JsonRequired] DateTime IssuedAt,
        [property: JsonRequired] DateTime ExpiresAt);

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
            using X509Certificate2 cert = CreateSelfSignedCertificate(
                domain,
                keySize,
                hashAlgorithm,
                validAfter,
                validBefore,
                subjectAlternativeNames,
                keyUsageFlags,
                name);

            string filename = $"{name}.pfx";
            foreach (char c in Path.GetInvalidFileNameChars()) {
                filename = filename.Replace(c, '_');
            }

            byte[] pfxBytes = cert.Export(X509ContentType.Pfx, password);
            lock (filesLock) {
                SaveCertificate(filename, pfxBytes, cert);
            }

            Logger.Action(origin, "Certificate", "Create certificate");

            return List();
        }
        catch (Exception ex) {
            return Encoding.UTF8.GetBytes($"{{\"error\":\"{Data.EscapeJsonText(ex.Message)}\"}}");
        }
    }

    internal static ValueTask<byte[]> Upload(HttpListenerContext ctx, string origin) =>
        UploadAsync(ctx.Request.InputStream, ctx.Request.ContentType, origin);

    private static async ValueTask<byte[]> UploadAsync(Stream body, string contentType, string origin) {
        try {
            MultipartFileHelper.Upload upload = await MultipartFileHelper.ReadAsync(body, contentType);
            string name = upload?.Filename;

            if (!Data.IsValidFilename(name) || !name.EndsWith(".pfx", StringComparison.OrdinalIgnoreCase)) {
                return Data.CODE_INVALID_ARGUMENT.Array;
            }

            name = name.ToLowerInvariant();
            upload.Fields.TryGetValue("password", out string password);
            X509Certificate2 certificate = null;
            if (!String.IsNullOrEmpty(password)) {
                try {
                    certificate = X509CertificateLoader.LoadPkcs12(upload.Content, password, X509KeyStorageFlags.EphemeralKeySet);
                }
                catch (CryptographicException) {
                    return "{\"error\":\"Could not open the certificate with the supplied password.\"}"u8.ToArray();
                }
            }

            using (certificate) {
                string newName = name;
                lock (filesLock) {
                    string baseName = name[..^4];
                    int counter = 2;
                    while (File.Exists(Path.Join(Data.DIR_CERTIFICATES, newName))) {
                        newName = $"{baseName} {counter++}.pfx";
                    }

                    SaveCertificate(newName, upload.Content, certificate);
                }

                Logger.Action(origin, "Certificate", $"Upload certificate: {newName}");
            }

            return List();
        }
        catch (InvalidDataException) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }
        catch (Exception ex) {
            Logger.Debug(ex);
            return Data.CODE_FAILED.Array;
        }
    }

    internal static byte[] List() {
        lock (filesLock) {
            DirectoryInfo directory = new DirectoryInfo(Data.DIR_CERTIFICATES);
            if (!directory.Exists) return "{\"data\":{},\"length\":0}"u8.ToArray();

            FileInfo[] files = directory.GetFiles();
            return JsonSerializer.SerializeToUtf8Bytes(new {
                data = files.ToDictionary(file => file.Name, GetListEntry),
                length = files.Length
            });
        }
    }

    private static Dictionary<string, object> GetListEntry(FileInfo file) {
        Dictionary<string, object> entry = new Dictionary<string, object> {
            ["name"] = new { v = file.Name },
            ["date"] = new { v = file.CreationTimeUtc.Ticks },
            ["size"] = new { v = file.Length }
        };

        CertificateValidity validity = ReadValidity(file);
        if (validity is not null) {
            entry["issued at"] = new { v = validity.IssuedAt };
            entry["expired at"] = new { v = validity.ExpiresAt };
        }

        return entry;
    }

    private static CertificateValidity ReadValidity(FileInfo file, string fileHash = null) {
        string path = Path.Join(validityDirectory, file.Name);
        if (!File.Exists(path)) return null;

        try {
            CertificateValidity validity = JsonSerializer.Deserialize<CertificateValidity>(File.ReadAllBytes(path));
            if (validity is null || validity.IssuedAt > validity.ExpiresAt) return null;

            return validity.FileHash == (fileHash ?? GetFileHash(file)) ? validity : null;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or JsonException) {
            Logger.Debug(ex);
            return null;
        }
    }

    internal static byte[] GetCertInfo(HttpListenerContext ctx) {
        Dictionary<string, string> parameters = Listener.ParseQuery(ctx);
        if (parameters is null || !parameters.TryGetValue("name", out string name)) return Data.CODE_INVALID_ARGUMENT.Array;

        string password;
        try {
            using JsonDocument body = JsonDocument.Parse(ctx.Request.InputStream);
            password = body.RootElement.TryGetProperty("password", out JsonElement passwordElement) ? passwordElement.GetString() : null;
        }
        catch (Exception ex) when (ex is JsonException or InvalidOperationException) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        return GetCertInfo(name, password);
    }

    private static byte[] GetCertInfo(string name, string password) {
        if (!Data.IsValidFilename(name)) { return Data.CODE_INVALID_ARGUMENT.Array; }

        try {
            byte[] pfxBytes = File.ReadAllBytes(Path.Join(Data.DIR_CERTIFICATES, name));
            using X509Certificate2 cert = X509CertificateLoader.LoadPkcs12(pfxBytes, password);
            using RSA publicKey = cert.GetRSAPublicKey();
            bool validitySaved = RememberValidity(name, pfxBytes, cert);

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
                    validitySaved,

                    hasPrivateKey = cert.HasPrivateKey,

                    signatureAlgorithm = cert.SignatureAlgorithm.FriendlyName,
                    publicKeyAlgorithm = cert.PublicKey.Oid.FriendlyName,

                    version = cert.Version,
                    keySize = publicKey?.KeySize,

                    dnsNames = dnsNames
                }
            );
        }
        catch (Exception ex) when (ex is FileNotFoundException or DirectoryNotFoundException) {
            return Data.CODE_FILE_NOT_FOUND.Array;
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

    internal static byte[] Delete(HttpListenerContext ctx, string origin) {
        Dictionary<string, string> parameters = Listener.ParseQuery(ctx);

        if (parameters is null) { return Data.CODE_FAILED.Array; }

        parameters.TryGetValue("name", out string name);
        if (!Data.IsValidFilename(name)) { return Data.CODE_INVALID_ARGUMENT.Array; }

        try {
            lock (filesLock) {
                string filename = Path.Join(Data.DIR_CERTIFICATES, name);
                if (!File.Exists(filename)) return Data.CODE_FILE_NOT_FOUND.Array;

                File.Delete(filename);
                TryDeleteFile(Path.Join(validityDirectory, name));
            }

            Logger.Action(origin, "Certificate", $"Delete certificate: {name}");
            return List();
        }
        catch {
            return Data.CODE_FAILED.Array;
        }
    }

    internal static byte[] Download(HttpListenerContext ctx, string origin) {
        Dictionary<string, string> parameters = Listener.ParseQuery(ctx);

        if (parameters is null) { return Data.CODE_FAILED.Array; }

        parameters.TryGetValue("name", out string name);
        if (!Data.IsValidFilename(name)) { return Data.CODE_INVALID_ARGUMENT.Array; }

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

    private static void SaveCertificate(string name, byte[] bytes, X509Certificate2 certificate) {
        Directory.CreateDirectory(validityDirectory);
        string path = Path.Join(Data.DIR_CERTIFICATES, name);
        string validityPath = Path.Join(validityDirectory, name);
        string temporaryPath = Path.Join(validityDirectory, $"{Guid.NewGuid():N}.tmp");
        byte[] previousValidity = File.Exists(validityPath) ? File.ReadAllBytes(validityPath) : null;

        try {
            File.WriteAllBytes(temporaryPath, bytes);
            if (certificate is null) {
                File.Delete(validityPath);
            }
            else {
                CertificateValidity validity = GetCertificateValidity(bytes, certificate);
                WriteValidityFile(validityPath, JsonSerializer.SerializeToUtf8Bytes(validity));
            }

            try {
                File.Move(temporaryPath, path, true);
            }
            catch {
                try {
                    if (previousValidity is null) File.Delete(validityPath);
                    else WriteValidityFile(validityPath, previousValidity);
                }
                catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) {
                    Logger.Debug(ex);
                }
                throw;
            }
        }
        finally {
            TryDeleteFile(temporaryPath);
        }
    }

    private static void WriteValidityFile(string path, byte[] content) {
        string temporaryPath = Path.Join(validityDirectory, $"{Guid.NewGuid():N}.tmp");
        try {
            File.WriteAllBytes(temporaryPath, content);
            File.Move(temporaryPath, path, true);
        }
        finally {
            TryDeleteFile(temporaryPath);
        }
    }

    private static void TryDeleteFile(string path) {
        try {
            if (File.Exists(path)) File.Delete(path);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) {
            Logger.Debug(ex);
        }
    }

    private static CertificateValidity GetCertificateValidity(byte[] pfxBytes, X509Certificate2 certificate) {
        return new CertificateValidity(
            Convert.ToHexString(SHA256.HashData(pfxBytes)),
            certificate.NotBefore.ToUniversalTime(),
            certificate.NotAfter.ToUniversalTime());
    }

    private static string GetFileHash(FileInfo file) {
        using FileStream stream = file.OpenRead();
        return Convert.ToHexString(SHA256.HashData(stream));
    }

    private static bool RememberValidity(string name, byte[] pfxBytes, X509Certificate2 certificate) {
        try {
            lock (filesLock) {
                FileInfo file = new FileInfo(Path.Join(Data.DIR_CERTIFICATES, name));
                if (!file.Exists) return false;

                CertificateValidity validity = GetCertificateValidity(pfxBytes, certificate);
                if (validity.FileHash != GetFileHash(file)) return false;
                if (ReadValidity(file, validity.FileHash) is not null) return true;

                Directory.CreateDirectory(validityDirectory);
                WriteValidityFile(Path.Join(validityDirectory, file.Name), JsonSerializer.SerializeToUtf8Bytes(validity));
                return true;
            }
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) {
            Logger.Debug(ex);
            return false;
        }
    }
}

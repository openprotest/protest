using System;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.IO;
using System.Net;
using System.Runtime.Versioning;
using System.Text;
using Microsoft.VisualBasic.FileIO;
using System.Text.RegularExpressions;

namespace Protest.Tools;

public static class Cert {
    public static byte[] Create(HttpListenerContext ctx, string origin) {

        if (!OperatingSystem.IsWindows()) {
            return "{\"error\":\"not supported\"}"u8.ToArray();
        }

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
                name = Uri.UnescapeDataString(lines[i][5..].ToString());
            }
            else if (lines[i].StartsWith("domain=")) {
                domain = Uri.UnescapeDataString(lines[i][7..].ToString());
            }
            else if (lines[i].StartsWith("keysize=")) {
                keySizeString = Uri.UnescapeDataString(lines[i][8..].ToString());
            }
            else if (lines[i].StartsWith("hash=")) {
                hashString = Uri.UnescapeDataString(lines[i][5..].ToString());
            }
            else if (lines[i].StartsWith("validafter=")) {
                validAfterString = Uri.UnescapeDataString(lines[i][11..].ToString());
            }
            else if (lines[i].StartsWith("validbefore=")) {
                validBeforeString = Uri.UnescapeDataString(lines[i][12..].ToString());
            }
            else if (lines[i].StartsWith("alternative=")) {
                altNamesString = Uri.UnescapeDataString(lines[i][12..].ToString());
            }
            else if (lines[i].StartsWith("password=")) {
                password = Uri.UnescapeDataString(lines[i][9..].ToString());
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

        DateTime validAfter;
        if (DateTime.TryParse(validAfterString, out validAfter)) {
            validAfter = DateTime.Now;
        }

        DateTime validBefore;
        if (DateTime.TryParse(validBeforeString, out validBefore)) {
            validBefore = DateTime.Now.AddYears(5);
        }

        string[] subjectAlternativeNames = altNamesString.Split(',').Select(o=>o.Trim()).ToArray();

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

            Logger.Action(origin, "Create certificate");

            return List();
        }
        catch (Exception ex) {
            return Encoding.UTF8.GetBytes($"{{\"error\":\"{Data.EscapeJsonText(ex.Message)}\"}}");
        }
    }

    public static byte[] Upload(HttpListenerContext ctx, string origin) {
        HttpListenerRequest request = ctx.Request;

        string boundary = request.ContentType.Split('=')[1];
        Stream body = request.InputStream;
        Encoding encoding = request.ContentEncoding;
        using StreamReader reader = new StreamReader(body, encoding);

        string formData = reader.ReadToEnd();

        string[] parts = formData.Split(new string[] { boundary }, StringSplitOptions.RemoveEmptyEntries);

        DirectoryInfo directory = new DirectoryInfo(Data.DIR_CERTIFICATES);
        if (!directory.Exists) {
            directory.Create();
        }

        foreach (string part in parts) {
            if (part.Contains("Content-Disposition") && part.Contains("filename")) {
                try {
                    Match filenameMatch = Regex.Match(part, @"filename=""([^""]*)""");
                    if (!filenameMatch.Success) continue;

                    string name = filenameMatch.Groups[1].Value;
                    name = name.ToLower();
                    if (name.EndsWith(".pfx")) {
                        name = name.Substring(0, name.Length - 4);
                    }
                    else {
                        continue;
                    }

                    string filename = $"{Data.DIR_CERTIFICATES}{Data.DELIMITER}{name}.pfx";

                    int counter = 2;
                    while (File.Exists(filename)) {
                        filename = $"{Data.DIR_CERTIFICATES}{Data.DELIMITER}{name} {counter++}.pfx";
                    }

                    int startIndex = part.IndexOf("\r\n\r\n") + 4;

                    byte[] fileContent = encoding.GetBytes(part.Substring(startIndex).TrimEnd('\r', '\n', '-'));

                    File.WriteAllBytes(filename, fileContent);

                    Logger.Action(origin, $"Upload certificate: {filename}");
                    break;
                }
                catch { }
            }
        }

        return null;
    }

    public static byte[] List() {
        DirectoryInfo directory = new DirectoryInfo(Data.DIR_CERTIFICATES);
        if (!directory.Exists) return "{\"data\":{}}"u8.ToArray();

        FileInfo[] files = directory.GetFiles();

        StringBuilder builder = new StringBuilder();
        builder.Append("{\"data\":{");

        bool first = true;
        foreach (FileInfo file in files) {
            if (!first) builder.Append(',');

            builder.Append($"\"{Data.EscapeJsonText(file.Name)}\":{{");
            builder.Append($"\"name\":{{\"v\":\"{Data.EscapeJsonText(file.Name)}\"}},");
            builder.Append($"\"date\":{{\"v\":{file.CreationTimeUtc.Ticks}}},");
            builder.Append($"\"size\":{{\"v\":{file.Length}}}");
            builder.Append('}');

            first = false;
        }

        builder.Append("},");

        builder.Append($"\"length\":{files.Length}");

        builder.Append('}');

        return Encoding.UTF8.GetBytes(builder.ToString());
    }

    internal static byte[] Delete(Dictionary<string, string> parameters, string origin) {
        if (parameters is null) { return Data.CODE_FAILED.Array; }

        parameters.TryGetValue("name", out string name);
        if (String.IsNullOrEmpty(name)) { return Data.CODE_INVALID_ARGUMENT.Array; }

        try {
            string filename = $"{Data.DIR_CERTIFICATES}{Data.DELIMITER}{name}";
            if (File.Exists(filename)) {
                File.Delete(filename);
                Logger.Action(origin, $"Delete certificate: {name}");

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

        string filename = $"{Data.DIR_CERTIFICATES}{Data.DELIMITER}{name}";

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

            Logger.Action(origin, $"Download certificate: {name}");

            return null;
        }
        catch {
            return Data.CODE_FAILED.Array;
        }
    }

    [SupportedOSPlatform("windows")]
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
        certificate.FriendlyName = friendlyName;

        return certificate;
    }

    private static void ExportToPfx(X509Certificate2 certificate, string password, string filename) {
        byte[] bytes = certificate.Export(X509ContentType.Pfx, password);
        File.WriteAllBytes($"{Data.DIR_CERTIFICATES}{Data.DELIMITER}{filename}", bytes);
    }
}

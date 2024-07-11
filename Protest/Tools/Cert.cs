using System;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.IO;
using System.Net;
using System.Runtime.Versioning;

namespace Protest.Tools;

public static class Cert {
    public static byte[] CreateHandler(HttpListenerContext ctx) {

        if (!OperatingSystem.IsWindows()) {
            return "{\"error\":\"not supported\"}"u8.ToArray();
        }

        using StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding);
        string payload = reader.ReadToEnd();

        string name = null;
        string domain = null;
        string keySizeString;
        string hashString;
        string validAfterString;
        string validBeforeString;
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

        int rsaKeySize = 2048;

        HashAlgorithmName hashAlgorithm = HashAlgorithmName.SHA256;
        DateTimeOffset notBefore = DateTimeOffset.Now;
        DateTimeOffset notAfter = notBefore.AddYears(5);
        string[] subjectAlternativeNames = altNamesString.Split(',').Select(o=>o.Trim()).ToArray();
        X509KeyUsageFlags keyUsageFlags = X509KeyUsageFlags.DigitalSignature | X509KeyUsageFlags.KeyEncipherment;

        X509Certificate2 cert = CreateSelfSignedCertificate(
            domain,
            rsaKeySize,
            hashAlgorithm,
            notBefore,
            notAfter,
            subjectAlternativeNames,
            keyUsageFlags,
            name);

        string filename = $"{name}.pfx";
        foreach (char c in System.IO.Path.GetInvalidFileNameChars()) {
            filename = filename.Replace(c, '_');
        }

        ExportToPfx(cert, password, filename);

        return "{\"todo\":\"...\"}"u8.ToArray();
    }

    public static byte[] UploadHandler(HttpListenerContext ctx) {
        return null;
    }

    public static byte[] ListHandler() {
        return null;
    }

    public static byte[] DeleteHandler(HttpListenerContext ctx) {
        return null;
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

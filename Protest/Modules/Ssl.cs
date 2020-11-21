using System;
using System.Linq;
using System.IO;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;

public static class Ssl {
    public static X509Certificate2 CreateSelfSignedCertificate() {
        DirectoryInfo dirSsl = new DirectoryInfo(Strings.DIR_SSL);
        if (!dirSsl.Exists) dirSsl.Create();

        ECDsa ecdsa = ECDsa.Create();
        CertificateRequest request = new CertificateRequest("cn=protest", ecdsa, HashAlgorithmName.SHA512);
        X509Certificate2 cert = request.CreateSelfSigned(DateTime.Today.AddDays(-1), DateTime.Today.AddYears(5));
        
        File.WriteAllBytes($"{Strings.DIR_SSL}\\private.pfx", cert.Export(X509ContentType.Pfx));

        File.WriteAllText(
            $"{Strings.DIR_SSL}\\public.cer",
            $"-----BEGIN CERTIFICATE-----\r\n{Convert.ToBase64String(cert.Export(X509ContentType.Cert),Base64FormattingOptions.None)}\r\n-----END CERTIFICATE-----"
        );

        //Add certificate to store
        /*
        X509Store store = new X509Store(StoreName.My, StoreLocation.LocalMachine);
        store.Open(OpenFlags.ReadOnly);
        store.Add(cert);
        store.Close();
        */

        return cert;
    }

}
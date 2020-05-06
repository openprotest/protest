using System;
using System.Linq;
using System.Text;
using System.Security.Cryptography;

public static class CryptoX {
    private const string SALT = "3pVDs55EbUDHL48qMm4oY13uUw69RQoH"; //you can change this value on your own implementation
    private const string PEPPER = "";

    public static byte[] Encrypt(byte[] bytes, string key) {
        if (bytes is null || bytes.Length == 0) return null;

        TripleDESCryptoServiceProvider triDES = new TripleDESCryptoServiceProvider() {
            Key = new MD5CryptoServiceProvider().ComputeHash(Encoding.UTF8.GetBytes($"{SALT}{key}{PEPPER}")),
            Mode = CipherMode.ECB //CBC, CFB
        };

        return triDES.CreateEncryptor().TransformFinalBlock(bytes, 0, bytes.Length);
    }

    public static byte[] Decrypt(byte[] bytes, string key) {
        if (bytes is null || bytes.Length == 0) return null;

        try {
            TripleDESCryptoServiceProvider triDES = new TripleDESCryptoServiceProvider() {
                Key = new MD5CryptoServiceProvider().ComputeHash(Encoding.UTF8.GetBytes($"{SALT}{key}{PEPPER}")),
                Mode = CipherMode.ECB //CBC, CFB
            };
            return triDES.CreateDecryptor().TransformFinalBlock(bytes, 0, bytes.Length);
        } catch {
            return null;
        }
    }

    public static string EncryptB64(string text, string key) {
        if (text.Length == 0) return "";

        byte[] bytes = Encoding.UTF8.GetBytes(text);
        return Convert.ToBase64String(Encrypt(bytes, key));
    }

    public static string DecryptB64(string encodedText, string key) {
        if (encodedText.Length == 0) return "";

        byte[] bytes = Convert.FromBase64String(encodedText);
        byte[] d = Decrypt(bytes, key);
        if (d is null || d.Length == 0) return "";
        return Encoding.UTF8.GetString(d);
    }

}
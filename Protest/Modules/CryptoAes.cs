using System;
using System.Linq;
using System.Text;
using System.Security.Cryptography;
using System.IO;

public static class CryptoAes {
    private const string SALT = "3pVDs55EbUDHL48qMm4oY13uUw69RQoH"; //you can change this value on your implementation
    private const string PEPPER = "sEhH5EG2sw958Q98";               //you can change this value on your implementation

    public static string GenerateHexString(int len) {
        Random rnd = new Random((int)DateTime.Now.Ticks);
        byte[] bytes = new byte[len];
        rnd.NextBytes(bytes);
        return BitConverter.ToString(bytes).Replace("-", string.Empty);
    }

    public static byte[] KeyToBytes(string key, byte length) {
        using (SHA512 sha = SHA512.Create()) {
            byte[] bytes = sha.ComputeHash(Encoding.UTF8.GetBytes($"{SALT}{key}{PEPPER}{length}"));

            byte[] result = new byte[length];
            for (byte i = 0; i < length; i++)
                result[i] = bytes[(bytes[i] + length) % bytes.Length];

            return result;
        }
    }

    public static byte[] ComputeSha256(string data) {
        using SHA256 sha256Hash = SHA256.Create();
        byte[] bytes = sha256Hash.ComputeHash(Encoding.UTF8.GetBytes(data));
        return bytes;
    }

    public static string ComputeSha256String(string data) {
        byte[] bytes = ComputeSha256(data);

        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < bytes.Length; i++)
            sb.Append(bytes[i].ToString("x2"));
        
        return sb.ToString();
    }

    public static byte[] Encrypt(byte[] plain, byte[] key, byte[] initVector) {
        if (plain is null || plain.Length == 0) return new byte[0];
        if (key is null || key.Length == 0) return plain; //in case of a null key, don't encrypt

        using (ICryptoTransform encryptor = Aes.Create().CreateEncryptor(key, initVector)) 
            using (MemoryStream memoryStream = new MemoryStream()) {
                using (CryptoStream cryptoStream = new CryptoStream(memoryStream, encryptor, CryptoStreamMode.Write)) {
                    cryptoStream.Write(plain, 0, plain.Length);
                    cryptoStream.FlushFinalBlock();
                }
                return memoryStream.ToArray();
            }
    }

    public static byte[] Decrypt(byte[] cipher, byte[] key, byte[] initVector) {
        if (cipher is null || cipher.Length == 0) return new byte[0];
        if (key is null || key.Length == 0) return cipher; //in case of a null key, don't decrypt

        using (ICryptoTransform decryptor = Aes.Create().CreateDecryptor(key, initVector))
            using (MemoryStream memoryStream = new MemoryStream()) {
                using (CryptoStream cryptoStream = new CryptoStream(memoryStream, decryptor, CryptoStreamMode.Write)) {
                    cryptoStream.Write(cipher, 0, cipher.Length);
                    cryptoStream.FlushFinalBlock();
                }
                return memoryStream.ToArray();
            }
    }


    public static string EncryptB64(string text, byte[] key, byte[] iv) {
        if (text.Length == 0) return string.Empty;

        byte[] bytes = Encoding.UTF8.GetBytes(text);
        byte[] cipher = Encrypt(bytes, key, iv);
        return Convert.ToBase64String(cipher);
    }

    public static string DecryptB64(string encodedText, byte[] key, byte[] iv) {
        if (encodedText.Length == 0) return string.Empty;

        byte[] bytes = Convert.FromBase64String(encodedText);
        byte[] plain = Decrypt(bytes, key, iv);
        if (plain is null || plain.Length == 0) return string.Empty;
        return Encoding.UTF8.GetString(plain);
    }

}
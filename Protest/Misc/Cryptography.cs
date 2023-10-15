using System.Text;
using System.Security.Cryptography;
using System.IO;

namespace Protest;

internal static class Cryptography {
    //change SALT and PEPPER values on your implementation
    private const string SALT   = "3pVDs55EbUDHL48qMm4oY13uUw69RQoH";
    private const string PEPPER = "sEhH5EG2sw958Q98";

    public static byte[] RandomByteGenerator(int length) {
        return RandomNumberGenerator.GetBytes(length);
    }

    public static string RandomStringGenerator(int length) {
        byte[] bytes = RandomNumberGenerator.GetBytes(length);
        return BitConverter.ToString(bytes).Replace("-", String.Empty);
    }

    public static byte[] HashStringToBytes(string key, byte length) {
        byte[] bytes = SHA512.HashData(Encoding.UTF8.GetBytes($"{SALT}{key}{PEPPER}{length}"));
        byte[] result = new byte[length];
        for (byte i = 0; i < length; i++)
            result[i] = bytes[(bytes[i] + length) % bytes.Length];

        return result;
    }

    public static byte[] HashUsernameAndPassword(string username, string password) {
        int iterations = (username.Length + password.Length) * 63;
        Rfc2898DeriveBytes pbkdf2 = new Rfc2898DeriveBytes(username + password, Encoding.UTF8.GetBytes(SALT), iterations, HashAlgorithmName.SHA512);
        byte[] hash = pbkdf2.GetBytes(32);
        return hash;
    }

    public static byte[] Encrypt(byte[] plain, byte[] key, byte[] iv) {
        if (plain is null || plain.Length == 0) return Array.Empty<byte>();
        if (key is null || key.Length == 0) return plain; //in case of a null key, don't encrypt

        using ICryptoTransform encryptor = Aes.Create().CreateEncryptor(key, iv);
        using MemoryStream memoryStream = new MemoryStream();
        using CryptoStream cryptoStream = new CryptoStream(memoryStream, encryptor, CryptoStreamMode.Write);
        cryptoStream.Write(plain, 0, plain.Length);
        cryptoStream.FlushFinalBlock();

        return memoryStream.ToArray();
    }

    public static byte[] Decrypt(byte[] cipher, byte[] key, byte[] iv) {
        if (cipher is null || cipher.Length == 0) return Array.Empty<byte>();
        if (key is null || key.Length == 0) return cipher; //in case of a null key, don't decrypt

        using ICryptoTransform decryptor = Aes.Create().CreateDecryptor(key, iv);
        using MemoryStream memoryStream = new MemoryStream();
        using CryptoStream cryptoStream = new CryptoStream(memoryStream, decryptor, CryptoStreamMode.Write);
        cryptoStream.Write(cipher, 0, cipher.Length);
        cryptoStream.FlushFinalBlock();

        return memoryStream.ToArray();
    }

    public static string EncryptB64(string text, byte[] key, byte[] iv) {
        if (String.IsNullOrEmpty(text)) return String.Empty;

        byte[] bytes = Encoding.UTF8.GetBytes(text);
        byte[] cipher = Encrypt(bytes, key, iv);
        return Convert.ToBase64String(cipher);
    }

    public static string DecryptB64(string encodedText, byte[] key, byte[] iv) {
        if (String.IsNullOrEmpty(encodedText)) return String.Empty;

        byte[] bytes = Convert.FromBase64String(encodedText);
        byte[] plain = Decrypt(bytes, key, iv);
        if (plain is null || plain.Length == 0) return String.Empty;
        return Encoding.UTF8.GetString(plain);
    }

}
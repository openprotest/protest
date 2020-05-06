using System;
using System.Linq;
using System.Text;
using System.Security.Cryptography;
using System.IO;

public static class CryptoAes {
    private const string SALT = "3pVDs55EbUDHL48qMm4oY13uUw69RQoH"; //you can change this value on your implementation
    private const string PEPPER = "sEhH5EG2sw958Q98";

    public static byte[] KeyToBytes(string key, byte length) {
        using (SHA512 sha = SHA512.Create()) {
            byte[] bytes = sha.ComputeHash(Encoding.UTF8.GetBytes($"{SALT}{key}{PEPPER}{length}"));

            byte[] result = new byte[length];
            for (byte i = 0; i < length; i++)
                result[i] = bytes[(bytes[i] + length) % bytes.Length];

            return result;
        }
    }

    public static byte[] Encrypt(byte[] plain, byte[] key, byte[] iv) {
        if (plain is null || plain.Length == 0) return new byte[0];
        if (key is null || key.Length == 0) return plain; //if case of a null key, don't encrypt

        using (ICryptoTransform encryptor = Aes.Create().CreateEncryptor(key, iv)) {
            using (MemoryStream memoryStream = new MemoryStream()) {
                using (CryptoStream cryptoStream = new CryptoStream(memoryStream, encryptor, CryptoStreamMode.Write)) {
                    cryptoStream.Write(plain, 0, plain.Length);
                    cryptoStream.FlushFinalBlock();
                }
                return memoryStream.ToArray();
            }
        }
    }

    public static byte[] Decrypt(byte[] cipher, byte[] key, byte[] iv) {
        if (cipher is null || cipher.Length == 0) return new byte[0];
        if (key is null || key.Length == 0) return cipher; //if case of a null key, don't decrypt

        using (ICryptoTransform decryptor = Aes.Create().CreateDecryptor(key, iv)) {
            using (MemoryStream memoryStream = new MemoryStream()) {
                using (CryptoStream cryptoStream = new CryptoStream(memoryStream, decryptor, CryptoStreamMode.Write)) {
                    cryptoStream.Write(cipher, 0, cipher.Length);
                    cryptoStream.FlushFinalBlock();
                }
                return memoryStream.ToArray();
            }
        }
    }


}
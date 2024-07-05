using System.IO;
using System;
using System.Text;
using System.Security.Cryptography;
using System.Windows.Forms;

namespace ProtestAgent {
    internal class Configuration {
        private static readonly byte[] SALT = Encoding.UTF8.GetBytes("3pVDs55EbUDHL48qMm4oY13uUw69RQoI");

        public bool enabled;
        public string path;
        public string arguments;
        public string username;

        public string password;
        public static string presharedKey;
        public static Configuration stamp    = new Configuration();
        public static Configuration smb      = new Configuration();
        public static Configuration compmgmt = new Configuration();
        public static Configuration rdp      = new Configuration();
        public static Configuration pse      = new Configuration();
        public static Configuration uvnc     = new Configuration();
        public static Configuration anydesk  = new Configuration();
        public static Configuration winbox   = new Configuration();

        public static byte[] KeyToBytes(string key, byte length) {
            using (SHA512 sha = SHA512.Create()) {
                byte[] bytes = sha.ComputeHash(Encoding.UTF8.GetBytes($"{SALT}{key}{length}"));

                byte[] result = new byte[length];
                for (byte i = 0; i < length; i++)
                    result[i] = bytes[(bytes[i] + length) % bytes.Length];

                return result;
            }
        }

        public static byte[] Encrypt(byte[] plain, byte[] key, byte[] iv) {
            if (plain is null || plain.Length == 0) return new byte[0];
            if (key is null || key.Length == 0) return plain; //in case of a null key, don't encrypt

            using (ICryptoTransform encryptor = Aes.Create().CreateEncryptor(key, iv))
            using (MemoryStream memoryStream = new MemoryStream()) {
                using (CryptoStream cryptoStream = new CryptoStream(memoryStream, encryptor, CryptoStreamMode.Write)) {
                    cryptoStream.Write(plain, 0, plain.Length);
                    cryptoStream.FlushFinalBlock();
                }
                return memoryStream.ToArray();
            }
        }

        public static byte[] Decrypt(byte[] cipher, byte[] key, byte[] iv) {
            if (cipher is null || cipher.Length == 0) return new byte[0];
            if (key is null || key.Length == 0) return cipher; //in case of a null key, don't decrypt

            using (ICryptoTransform decryptor = Aes.Create().CreateDecryptor(key, iv))
            using (MemoryStream memoryStream = new MemoryStream()) {
                using (CryptoStream cryptoStream = new CryptoStream(memoryStream, decryptor, CryptoStreamMode.Write)) {
                    cryptoStream.Write(cipher, 0, cipher.Length);
                    cryptoStream.FlushFinalBlock();
                }
                return memoryStream.ToArray();
            }
        }

        public static string EncryptB64(string text, byte[] key, byte[] iv) {
            if (String.IsNullOrEmpty(text)) return String.Empty;

            byte[] bytes = Encoding.UTF8.GetBytes(text);
            byte[] cipher = Encrypt(bytes, key, iv);
            return Convert.ToBase64String(cipher);
        }

        public static string DecryptB64(string encodedText, byte[] key, byte[] iv) {
            if (encodedText.Length == 0) return String.Empty;

            byte[] bytes = Convert.FromBase64String(encodedText);
            byte[] plain = Decrypt(bytes, key, iv);
            if (plain is null || plain.Length == 0) return String.Empty;
            return Encoding.UTF8.GetString(plain);
        }

        public static void Load() {
            FileInfo configFile = new FileInfo(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile) + "\\.protest\\protest-agent.cfg");
            if (!configFile.Exists) {
                stamp.enabled    = true;
                smb.enabled      = true;
                compmgmt.enabled = true;
                
                rdp.enabled   = true;
                rdp.path      = "mstsc.exe";
                rdp.arguments = "-f";

                uvnc.enabled   = false;
                uvnc.arguments = "-autoscaling -normalcursor";

                pse.enabled = false;
                pse.path    = "psexec.exe";

                return;
            }

            StreamReader fileReader = new StreamReader(configFile.FullName);

            byte[] key = null, iv = null;

            try {
                while (!fileReader.EndOfStream) {
                    string line = fileReader.ReadLine().Trim();
                    if (line.StartsWith("#")) continue;

                    int hashIndex = line.IndexOf("#");
                    if (hashIndex > -1) {
                        line = line.Substring(0, hashIndex).Trim();
                    }

                    string name, value;
                    int equalsIndex = line.IndexOf("=");

                    if (equalsIndex < 0) continue;
                    name = line.Substring(0, equalsIndex).Trim();
                    value = line.Substring(equalsIndex + 1, line.Length - equalsIndex - 1).Trim();

                    switch (name) {
                    case "key":
                        presharedKey = value;
                        key = KeyToBytes(presharedKey, 32); //256-bits
                        iv = KeyToBytes(presharedKey, 16); //128-bits
                        break;

                    case "stamp_enable": stamp.enabled = value == "True"; break;

                    case "smb_enable": smb.enabled = value == "True"; break;

                    case "compmgmt_enable": compmgmt.enabled = value == "True"; break;

                    case "mstsc_enable": rdp.enabled   = value == "True"; break;
                    case "mstsc_path"  : rdp.path      = value; break;
                    case "mstsc_args"  : rdp.arguments = value; break;

                    case "pse_enable"  : pse.enabled   = value == "True"; break;
                    case "pse_path"    : pse.path      = value; break;
                    case "pse_args"    : pse.arguments = value; break;
                    case "pse_username": pse.username  = value; break;
                    case "pse_password": pse.password  = DecryptB64(value, key, iv); break;

                    case "uvnc_enable"  : uvnc.enabled   = value == "True"; break;
                    case "uvnc_path"    : uvnc.path      = value; break;
                    case "uvnc_args"    : uvnc.arguments = value; break;
                    case "uvnc_password": uvnc.password  = DecryptB64(value, key, iv); break;

                    case "anydesk_enable": anydesk.enabled = value == "True"; break;
                    case "anydesk_path"  : anydesk.path = value; break;
                    case "anydesk_args"  : anydesk.arguments = value; break;

                    case "winbox_enable"  : winbox.enabled   = value == "True"; break;
                    case "winbox_path"    : winbox.path      = value; break;
                    case "winbox_args"    : winbox.arguments = value; break;
                    case "winbox_username": winbox.username  = value; break;
                    case "winbox_password": winbox.password = DecryptB64(value, key, iv); break;
                    }
                }
            }
            catch { }
            finally {
                fileReader.Close();
            }
        }

        public static void Save() {
            byte[] key = KeyToBytes(presharedKey, 32); //256-bits
            byte[] iv = KeyToBytes(presharedKey, 16); //128-bits

            try {
            FileInfo configFile = new FileInfo(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile) + "\\.protest\\protest-agent.cfg");

                StringBuilder builder = new StringBuilder();
                builder.AppendLine("# Pro-test Agent 5.0");
                builder.AppendLine();

                builder.AppendLine($"key = {presharedKey}");
                builder.AppendLine();

                builder.AppendLine($"stamp_enable = {Configuration.stamp.enabled}");
                builder.AppendLine();

                builder.AppendLine($"smb_enable = {Configuration.smb.enabled}");
                builder.AppendLine();

                builder.AppendLine($"compmgmt_enable = {Configuration.compmgmt.enabled}");
                builder.AppendLine();

                builder.AppendLine($"mstsc_enable = {Configuration.rdp.enabled}");
                builder.AppendLine($"mstsc_path   = {Configuration.rdp.path}");
                builder.AppendLine($"mstsc_args   = {Configuration.rdp.arguments}");
                builder.AppendLine();

                builder.AppendLine($"pse_enable   = {Configuration.pse.enabled}");
                builder.AppendLine($"pse_path     = {Configuration.pse.path}");
                builder.AppendLine($"pse_args     = {Configuration.pse.arguments}");
                builder.AppendLine($"pse_username = {Configuration.pse.username}");
                builder.AppendLine($"pse_password = {EncryptB64(Configuration.pse.password, key, iv)}");
                builder.AppendLine();

                builder.AppendLine($"uvnc_enable   = {Configuration.uvnc.enabled}");
                builder.AppendLine($"uvnc_path     = {Configuration.uvnc.path}");
                builder.AppendLine($"uvnc_args     = {Configuration.uvnc.arguments}");
                builder.AppendLine($"uvnc_password = {EncryptB64(Configuration.uvnc.password, key, iv)}");
                builder.AppendLine();

                builder.AppendLine($"anydesk_enable   = {Configuration.anydesk.enabled}");
                builder.AppendLine($"anydesk_path     = {Configuration.anydesk.path}");
                builder.AppendLine($"anydesk_args     = {Configuration.anydesk.arguments}");
                builder.AppendLine();

                builder.AppendLine($"winbox_enable   = {Configuration.winbox.enabled}");
                builder.AppendLine($"winbox_path     = {Configuration.winbox.path}");
                builder.AppendLine($"winbox_args     = {Configuration.winbox.arguments}");
                builder.AppendLine($"winbox_username = {Configuration.winbox.username}");
                builder.AppendLine($"winbox_password = {EncryptB64(Configuration.winbox.password, key, iv)}");

                File.WriteAllText(configFile.FullName, builder.ToString());
            }
            catch (Exception ex) {
                MessageBox.Show(ex.Message);
            }
        }
    }
}

/*
    Pro-test
    Copyright (C) 2020 veniware

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.

    Pro-test is open-source.
    For more information, visit https://github.com/veniware/OpenProtest
*/

using System;
using System.Linq;
using System.Threading;
using System.Security.Principal;
using System.Diagnostics;
using System.IO;
using System.Collections.Generic;
using System.IO.Compression;
using System.Text;
using System.Reflection;
using System.Runtime.InteropServices;

class Program {
    public static string DB_KEY;
    public static string PRESHARED_KEY;
    public static byte[] DB_KEY_A; //AES key
    public static byte[] DB_KEY_B; //AES iv
    public static byte[] PRESHARED_KEY_A; //AES key
    public static byte[] PRESHARED_KEY_B; //AES iv

    public static bool force_registry_keys = false;

    private static bool http_enable = true;
    private static string[] http_prefixes = new string[] { "http://127.0.0.1:80/" };
    private static readonly ThreadPriority http_priority = ThreadPriority.AboveNormal;
    private static HttpMainListener mainListener;

    private static bool addressbook_enable = false;
    private static string[] addressbook_prefixes = new string[] { "http://*:911/" };
    private static readonly ThreadPriority addressbook_priority = ThreadPriority.Normal;
    private static HttpAddressBookListener addressbookListener;

    static void Main(string[] args) {
        Console.Title = "Pro-test";
        DrawProTest();
        Console.WriteLine();

        if (IsElevated()) Console.WriteLine(" - Elevated privileges");
        else SelfElevate();

#if DEBUG
        Console.WriteLine(" - Debug mode");
#endif

        Console.WriteLine($" - Run time: {DateTime.Now.ToString(Strings.DATETIME_FORMAT)}");
        Console.WriteLine($" - GUID: {GetAppid()}");
        Console.WriteLine();

        Strings.InitDirs();

        bool loadConfig = LoadConfig();
        Console.WriteLine(string.Format("{0, -23} {1, -10}", "Loading configuration", loadConfig ? "OK  " : "Failed"));
        if (!loadConfig) CreateConfig();

        if (force_registry_keys) {
            bool disableHeader = DisableServerHeaderRegKey();
            Console.WriteLine(string.Format("{0, -23} {1, -10}", "Force registry keys", disableHeader ? "OK  " : "Failed"));
        }


        bool loadAcl = Session.LoadAcl();
        Console.WriteLine(string.Format("{0, -23} {1, -10}", "Loading ACL", loadAcl ? "OK  " : "Failed"));

        ExtractZippedKnowlageFile();

        Database.LoadEquip();
        Database.LoadUsers();

        StartServices();
        Watchdog.LoadConfig();

        Console.ResetColor();
    }

    private static void DrawProTest() {
        string version = Assembly.GetExecutingAssembly().GetName().Version.ToString();

        const string PRO_TEST =
        "                                    \n" +
        " #### #### ###    #### ### ### #### \n" +
        " ## # ## # # #     ##  #   ##   ##  \n" +
        " ## # ## # # # ### ##  ##  ###  ## \n" +
        " #### ###  ###     ##  #     #  ## \n" +
        " ##   ## # ###     ##  ### ###  ## \n";

        Console.WriteLine();
        Console.Write("  ");
        for (int i = 0; i < PRO_TEST.Length; i++)
            if (PRO_TEST[i] == ' ') {
                Console.ForegroundColor = ConsoleColor.Gray;
                Console.BackgroundColor = ConsoleColor.Gray;
                Console.Write(" ");

            } else if (PRO_TEST[i] == '#') {
                Console.ForegroundColor = ConsoleColor.Black;
                Console.BackgroundColor = ConsoleColor.Black;
                Console.Write("#");

            } else if (PRO_TEST[i] == '\n') {
                Console.ForegroundColor = ConsoleColor.Black;
                Console.BackgroundColor = ConsoleColor.Black;
                Console.WriteLine(".");
                Console.Write("  ");
            }

        Console.ForegroundColor = ConsoleColor.Black;
        Console.BackgroundColor = ConsoleColor.Gray;
        for (int i = 0; i < 35 - version.Length - 2; i++)
            Console.Write(" ");
        Console.Write($"v{version} ");
        Console.ForegroundColor = ConsoleColor.Black;
        Console.BackgroundColor = ConsoleColor.Black;
        Console.WriteLine(".");
        Console.ResetColor();
    }

    private static string GetAppid() {
        var assembly = typeof(Program).Assembly;
        var attribute = (GuidAttribute)assembly.GetCustomAttributes(typeof(GuidAttribute), true)[0];
        var id = attribute.Value;
        return id;
    }

    private static void SelfElevate() {
        try {
            ProcessStartInfo info = new ProcessStartInfo(System.Reflection.Assembly.GetEntryAssembly().Location) {
                Verb = "runas"
            };

            Process process = new Process {
                StartInfo = info
            };

            process.Start();
            Environment.Exit(0);
        } catch (Exception ex) {
            Logging.Err($"Unable to elevate: {ex.Message}");
        }
    }

    private static bool IsElevated() {
        return (new WindowsPrincipal(WindowsIdentity.GetCurrent())).IsInRole(WindowsBuiltInRole.Administrator);
    }

    private static bool LoadConfig() {
        if (!File.Exists(Strings.FILE_CONFIG)) return false;

        List<string> httpPrefixes = new List<string>();
        List<string> abPrefixes = new List<string>();

        StreamReader fileReader = new StreamReader(Strings.FILE_CONFIG);
        string line;
        while ((line = fileReader.ReadLine()) != null) {
            line = line.Trim();
            if (line.StartsWith("#")) continue;

            string[] split = line.Split('=');
            if (split.Length < 2) continue;

            split[0] = split[0].Trim().ToLower();
            split[1] = split[1].Trim();

            switch (split[0]) {
                case "db_key":
                    DB_KEY = split[1];
                    DB_KEY_A = DB_KEY.Length > 0 ? CryptoAes.KeyToBytes(DB_KEY, 32) : null; //256-bits
                    DB_KEY_B = DB_KEY.Length > 0 ? CryptoAes.KeyToBytes(DB_KEY, 16) : null; //128-bits
                    break;

                case "preshared_key":
                    PRESHARED_KEY = split[1];
                    PRESHARED_KEY_A = PRESHARED_KEY.Length > 0 ? CryptoAes.KeyToBytes(PRESHARED_KEY, 32) : null; //256-bits
                    PRESHARED_KEY_B = PRESHARED_KEY.Length > 0 ? CryptoAes.KeyToBytes(PRESHARED_KEY, 16) : null; //128-bits
                    break;

                case "force_registry_keys":
                    force_registry_keys = (split[1] == "true");
                    break;

                case "http_enable":
                    http_enable = (split[1] == "true");
                    break;
                case "http_prefix":
                    httpPrefixes.Add(split[1].Trim());
                    break;

                case "addressbook_enable":
                    addressbook_enable = (split[1] == "true");
                    break;
                case "addressbook_prefix":
                    abPrefixes.Add(split[1].Trim());
                    break;

                case "ip_access":
                    Session.ip_access.Add(split[1], null);
                    break;
            }
        }

        fileReader.Close();

        if (httpPrefixes.Count > 0) http_prefixes = httpPrefixes.ToArray();
        if (abPrefixes.Count > 0) addressbook_prefixes = abPrefixes.ToArray();

        return true;
    }

    private static void CreateConfig() {
        Console.WriteLine(" - Creating default conficuration file");

        StringBuilder sb = new StringBuilder();

        if (DB_KEY is null || DB_KEY.Length > 0) {
            Console.WriteLine(" - Generate DB_KEY");
            DB_KEY = CryptoAes.GenerateHexString(40);
            DB_KEY_A = CryptoAes.KeyToBytes(DB_KEY, 32); //256-bits
            DB_KEY_B = CryptoAes.KeyToBytes(DB_KEY, 16); //128-bits
        }

        if (PRESHARED_KEY is null || PRESHARED_KEY.Length > 0) {
            Console.WriteLine(" - Generate PRESHARED_KEY");
            PRESHARED_KEY = CryptoAes.GenerateHexString(40);
            PRESHARED_KEY_A = CryptoAes.KeyToBytes(PRESHARED_KEY, 32); //256-bits
            PRESHARED_KEY_B = CryptoAes.KeyToBytes(PRESHARED_KEY, 16); //128-bits
        }

        sb.AppendLine($"# version {Assembly.GetExecutingAssembly().GetName().Version.Major}.{Assembly.GetExecutingAssembly().GetName().Version.Minor}");
        sb.AppendLine();

        sb.AppendLine($"db_key        = {DB_KEY}");
        sb.AppendLine($"preshared_key = {PRESHARED_KEY}");
        sb.AppendLine();

        sb.AppendLine($"force_registry_keys = {force_registry_keys.ToString().ToLower()}");
        sb.AppendLine();

        sb.AppendLine("# you can use multiple entries");
        sb.AppendLine("ip_access   = *");
        sb.AppendLine();

        sb.AppendLine("http_enable = true");
        sb.AppendLine("http_prefix = https://+:443/");
        sb.AppendLine("http_prefix = http://127.0.0.1:80/");
        sb.AppendLine();

        sb.AppendLine("addressbook_enable = false");
        sb.AppendLine("addressbook_prefix = http://*:911/");
        sb.AppendLine();
        sb.AppendLine();

        sb.AppendLine("###");
        sb.AppendLine("###  Use NETSH to bind an SSL certificate with your https endpoint:");
        sb.AppendLine($"###  netsh http add sslcert ipport=0.0.0.0:443 certhash=[thumbprint] appid={{{GetAppid()}}}");
        sb.AppendLine("###");

        File.WriteAllText(Strings.FILE_CONFIG, sb.ToString());
    }

    static bool DisableServerHeaderRegKey() {
        string value;
        try {
            Microsoft.Win32.RegistryKey key = Microsoft.Win32.Registry.LocalMachine.CreateSubKey(@"SYSTEM\CurrentControlSet\Services\HTTP\Parameters");
            value = key.GetValue("DisableServerHeader")?.ToString();
            key.Close();
        } catch {
            return false;
        }

        if (value == "2") return true;

        try {
            Microsoft.Win32.RegistryKey key = Microsoft.Win32.Registry.LocalMachine.CreateSubKey(@"SYSTEM\CurrentControlSet\Services\HTTP\Parameters");
            key.SetValue("DisableServerHeader", 2, Microsoft.Win32.RegistryValueKind.DWord);
            key.Close();
            Console.BackgroundColor = ConsoleColor.Red;
            Console.ForegroundColor = ConsoleColor.White;
            Console.WriteLine("!! Reboot your machine !!");
            Console.BackgroundColor = ConsoleColor.Black;
            Console.WriteLine();
        } catch {
            Logging.Err(@"Failed to update Registry Key (HKEY_LOCAL_MACHINE\System\CurrentControlSet\Services\HTTP\Parameters)");
        }

        return true;
    }

    private static void StartServices() {
        if (http_enable) {
            Thread thread = new Thread(() => { mainListener = new HttpMainListener(http_prefixes, Strings.DIR_FRONTEND); });
            thread.Priority = http_priority;
            thread.Start();
        }

        if (addressbook_enable) {
            Thread.Sleep(3000);
            Thread thread = new Thread(() => { addressbookListener = new HttpAddressBookListener(addressbook_prefixes, Strings.DIR_ADDRESSBOOK); });
            thread.Priority = addressbook_priority;
            thread.Start();
        }
    }

    public static void ExtractZippedKnowlageFile() {
        DirectoryInfo dirIp = new DirectoryInfo(Strings.DIR_IP_LOCATION);
        FileInfo fileIpZip = new FileInfo($"{Strings.DIR_KNOWLAGE}\\ip.zip");
        if (!dirIp.Exists && fileIpZip.Exists)
            try {
                Console.Write(string.Format("{0, -24}", "Extracting proxy.zip"));
                ZipFile.ExtractToDirectory(fileIpZip.FullName, dirIp.FullName);
                Console.WriteLine("OK  ");
            } catch (Exception ex) {
                Console.WriteLine("Failed");
                Logging.Err(ex);
            }

        DirectoryInfo dirProxy = new DirectoryInfo(Strings.DIR_PROXY);
        FileInfo fileProxyZip = new FileInfo($"{Strings.DIR_KNOWLAGE}\\proxy.zip");
        if (!dirProxy.Exists && fileProxyZip.Exists)
            try {
                Console.Write(string.Format("{0, -24}", "Extracting proxy.zip"));
                ZipFile.ExtractToDirectory(fileProxyZip.FullName, dirProxy.FullName);
                Console.WriteLine("OK  ");
            } catch (Exception ex) {
                Console.WriteLine("Failed");
                Logging.Err(ex);
            }
    }

    public static int lastProgressValue = -1;
    public static void ProgressBar(in int percent, in string label, in bool isDone = false, in int width = 12) {
        if (lastProgressValue == percent) return; //refresh only if changed
        int c = percent * width / 100;
        int r = width - c;

        lastProgressValue = percent;

        Console.Write(string.Format("{0, -23} ", label));

        if (isDone) {
            lastProgressValue = -1;
            Console.Write("OK  ");
            for (int i = 0; i < width; i++) Console.Write(" ");
            Console.WriteLine();
            return;
        }

        Console.BackgroundColor = ConsoleColor.White;
        for (int i = 0; i < c; i++) Console.Write(" ");

        Console.BackgroundColor = ConsoleColor.DarkGray;
        for (int i = 0; i < r; i++) Console.Write(" ");

        Console.ResetColor();
        Console.Write($" {percent}%");

        Console.Write((char)13);
    }
}
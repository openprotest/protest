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

    Pro-test is open source.
    For more information, visit https://github.com/veniware/OpenProtest
 */

using System;
using System.Threading;
using System.Security.Principal;
using System.Diagnostics;
using System.Linq;
using System.IO;
using System.IO.Compression;
using System.Text;

class Program {
    public static string DB_KEY;
    public static string PRESHARED_KEY;
    public static byte[] DB_KEY_A; //AES key
    public static byte[] DB_KEY_B; //AES iv
    public static byte[] PRESHARED_KEY_A; //AES key
    public static byte[] PRESHARED_KEY_B; //AES iv

    public static bool force_registry_keys = false;

    private static bool http_enable = true;
    private static string http_ip = "127.0.0.1";
    private static ushort http_port = 80;
    private static readonly ThreadPriority http_priority = ThreadPriority.AboveNormal;
    private static HttpMainListener mainListener;

    private static bool addressbook_enable = false;
    private static string addressbook_ip = "*";
    private static ushort addressbook_port = 911;
    private static readonly ThreadPriority addressbook_priority = ThreadPriority.Normal;
    private static HttpAddressBookListener addressbookListener;

    static void Main(string[] args) {
        Console.Title = "Pro-test";
        DrawProTest();
        Console.WriteLine();

        Strings.InitDirs();

#if DEBUG
        Console.WriteLine(" - Debug mode");
#endif

        if (IsElevated()) Console.WriteLine(" - Elevated privileges");
        else SelfElevate();

        Console.WriteLine();

        bool loadConfig = LoadConfig();
        Console.WriteLine(string.Format("{0, -23} {1, -10}", "Loading configuration", loadConfig ? "Done" : "Failed"));
        if (!loadConfig) CreateConfig();

        ExtractZippedKnowlageFile();

        Database.LoadEquip();
        Database.LoadUsers();

        StartServices();

        Console.ResetColor();

#if DEBUG
        Thread.Sleep(1000);
        Console.WriteLine();
        while (true) {
            Console.Write(">");
            UserCommand(Console.ReadLine());
        }
#endif
    }

    private static void DrawProTest() {
        string version = System.Reflection.Assembly.GetExecutingAssembly().GetName().Version.ToString();

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
            Logging.Err($"  - Unable to elevate: {ex.Message}");
        }
    }

    private static bool IsElevated() {
        return (new WindowsPrincipal(WindowsIdentity.GetCurrent())).IsInRole(WindowsBuiltInRole.Administrator);
    }

    private static bool LoadConfig() {
        if (!File.Exists(Strings.FILE_CONFIG)) return false;

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
                case "http_ip":
                    http_ip = split[1];
                    break;
                case "http_port":
                    http_port = ushort.Parse(split[1]);
                    break;

                case "addressbook_enable":
                    addressbook_enable = (split[1] == "true");
                    break;
                case "addressbook_ip":
                    addressbook_ip = split[1];
                    break;
                case "addressbook_port":
                    addressbook_port = ushort.Parse(split[1]);
                    break;

                case "ip_access":
                    Session.ip_access.Add(split[1], null);
                    break;

                case "user_access":
                    Session.user_access.Add(split[1], null);
                    break;
            }
        }

        fileReader.Close();
        return true;
    }

    private static void CreateConfig() {
        Console.WriteLine(" - Creating default conficuration file");

        StringBuilder sb = new StringBuilder();

        if (DB_KEY is null || DB_KEY.Length > 0) {
            Console.WriteLine(" - Generate DB_KEY");
            DB_KEY = CryptoAes.GenerateHexString(32);
            DB_KEY_A = CryptoAes.KeyToBytes(DB_KEY, 32); //256-bits
            DB_KEY_B = CryptoAes.KeyToBytes(DB_KEY, 16) ; //128-bits
        }

        if (PRESHARED_KEY is null || PRESHARED_KEY.Length > 0) {
            Console.WriteLine(" - Generate PRESHARED_KEY");
            PRESHARED_KEY = CryptoAes.GenerateHexString(32);
            PRESHARED_KEY_A = CryptoAes.KeyToBytes(PRESHARED_KEY, 32); //256-bits
            PRESHARED_KEY_B = CryptoAes.KeyToBytes(PRESHARED_KEY, 16); //128-bits
        }

        sb.AppendLine("#version 4.0");
        sb.AppendLine();

        sb.AppendLine($"db_key        = {DB_KEY}");
        sb.AppendLine($"preshared_key = {PRESHARED_KEY}");
        sb.AppendLine();

        sb.AppendLine($"force_registry_keys = {force_registry_keys.ToString().ToLower()}");
        sb.AppendLine();

        sb.AppendLine();
        sb.AppendLine("ip_access = *");
        sb.AppendLine("user_access = administrator");

        sb.AppendLine();
        sb.AppendLine("http_enable = true");
        sb.AppendLine($"http_ip     = {http_ip}");
        sb.AppendLine($"http_port   = {http_port}");

        sb.AppendLine();
        sb.AppendLine("addressbook_enable = false");
        sb.AppendLine("addressbook_ip     = *");
        sb.AppendLine("addressbook_port   = 911");

        sb.AppendLine();

        File.WriteAllText(Strings.FILE_CONFIG, sb.ToString());
    }

    private static void StartServices() {
        if (http_enable) {
            Thread thread = new Thread(() => { mainListener = new HttpMainListener(http_ip, http_port, Strings.DIR_FRONTEND); });
            thread.Priority = http_priority;
            thread.Start();
        }

        if (addressbook_enable) {
            Thread.Sleep(3000);
            Thread thread = new Thread(() => { addressbookListener = new HttpAddressBookListener(addressbook_ip, addressbook_port, Strings.DIR_ADDRESSBOOK); });
            thread.Priority = addressbook_priority;
            thread.Start();
        }
    }

    private static void UserCommand(in string command) {
        switch (command.ToLower()) {
            case "logo":
            case "version":
                DrawProTest();
                break;

            case "reload":
                mainListener?.cache?.ReloadCache();
                addressbookListener?.cache?.ReloadCache();
                break;

            case "restart":
                try {
                    new Process {
                        StartInfo = new ProcessStartInfo(System.Reflection.Assembly.GetEntryAssembly().Location)
                    }.Start();
                    Environment.Exit(0);
                } catch {}
                break;

            case "elevate":
                if (IsElevated())
                    Console.WriteLine("Process is already elevated.");
                else
                    SelfElevate();
                break;

            default:
                break;
        }

        Console.WriteLine();
    }

    public static void ExtractZippedKnowlageFile() {
        DirectoryInfo dirIp = new DirectoryInfo(Strings.DIR_IP_LOCATION);
        FileInfo fileIpZip = new FileInfo($"{Strings.DIR_KNOWLAGE}\\ip.zip");
        if (!dirIp.Exists && fileIpZip.Exists)
            try {
                Console.Write(string.Format("{0, -24}", "Extracting proxy.zip"));
                ZipFile.ExtractToDirectory(fileIpZip.FullName, dirIp.FullName);
                Console.WriteLine("Done");
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
                Console.WriteLine("Done");
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
            Console.Write("Done");
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
/*
    Pro-test
    Copyright (C) 2019 veniware

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
 */

using System;
using System.Threading;
using System.Security.Principal;

class Program {
    static readonly string CONFIG_FILENAME = "config.txt";

    public static string DB_KEY;
    public static string PRESHARED_KEY;

    public static bool force_registry_keys = false;

    static bool http_enable = true;
    static string http_ip = "127.0.0.1";
    static ushort http_port = 80;
    static readonly ThreadPriority http_priority = ThreadPriority.AboveNormal;

    static bool addressbook_enable = true;
    static string addressbook_ip = "*";
    static ushort addressbook_port = 911;
    static readonly ThreadPriority addressbook_priority = ThreadPriority.Normal;

    static bool protest_enable = false;
    static string protest_ip = "*";
    static ushort protest_port = 3210;
    static readonly ThreadPriority protest_priority = ThreadPriority.AboveNormal;

    private static bool IsElevated() {
        return (new WindowsPrincipal(WindowsIdentity.GetCurrent())).IsInRole(WindowsBuiltInRole.Administrator);
    }

    private static void LoadConfig() {
        if (!System.IO.File.Exists(CONFIG_FILENAME)) return;

        System.IO.StreamReader fileReader = new System.IO.StreamReader(CONFIG_FILENAME);
        string line;
        while ((line = fileReader.ReadLine()) != null) {
            line = line.Trim();
            if (line.StartsWith("#")) continue;

            string[] split = line.Split('=');
            if (split.Length < 2) continue;

            split[0] = split[0].Trim().ToLower();
            split[1] = split[1].Trim();

            switch (split[0]) {
                case "key":
                    DB_KEY = split[1];
                    PRESHARED_KEY = split[1];
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

                case "protest_app_enable":
                    protest_enable = (split[1] == "true");
                    break;
                case "protest_ip":
                    protest_ip = split[1];
                    break;
                case "protest_port":
                    protest_port = ushort.Parse(split[1]);
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
    }

    private static void LoadDB() {
        Tools.ExtractZippedKnowlageFile();
        NoSQL.LoadEquip();
        NoSQL.LoadUsers();
        Scripts.LoadTools();

        Console.WriteLine($"Total equip loaded: {NoSQL.equip.Count}");
        Console.WriteLine($"Total users loaded: {NoSQL.users.Count}");
        Console.WriteLine();
    }

    static bool CheckUrlSegmentLengthRegKey() {
        string value;
        bool isOk = true;

        try {
            Microsoft.Win32.RegistryKey key = Microsoft.Win32.Registry.LocalMachine.CreateSubKey(@"SYSTEM\CurrentControlSet\Services\HTTP\Parameters");
            value = key.GetValue("UrlSegmentMaxLength").ToString();
            key.Close();
        } catch {
            value = "";
            isOk = false;
        }

        if (force_registry_keys && (!isOk || value != "0"))
            try {
                Microsoft.Win32.RegistryKey key = Microsoft.Win32.Registry.LocalMachine.CreateSubKey(@"SYSTEM\CurrentControlSet\Services\HTTP\Parameters");
                key.SetValue("UrlSegmentMaxLength", 0, Microsoft.Win32.RegistryValueKind.DWord);
                key.SetValue("DisableServerHeader", 2, Microsoft.Win32.RegistryValueKind.DWord);
                key.Close();
                Console.BackgroundColor = ConsoleColor.Red;
                Console.ForegroundColor = ConsoleColor.White;
                Console.WriteLine("!! Reboot your machine !!");
                Console.BackgroundColor = ConsoleColor.Black;
                Console.WriteLine();
            } catch {
                ErrorLog.Err(@"Failed to update Registry Key (HKEY_LOCAL_MACHINE\System\CurrentControlSet\Services\HTTP\Parameters)");
            }

        return false;
    }

    static void Main(string[] args) {
        Console.Title = "Pro-test";

        const string PRO_TEST =
            "###############  ###################\n" +
            "#    #    #   #  #    #   #   #    #\n" +
            "#  # #  # # # #####  ## ###  ###  ##\n" +
            "#  # #  # # # #   #  ##  ##   ##  #\n" +
            "#    #   ##   #####  ## ##### ##  #\n" +
            "#  ###  # #   #  ##  ##   #   ##  #\n" +
            "###############  ##################\n";
        
        Console.WriteLine();
        Console.Write("  ");
        for (int i = 0; i < PRO_TEST.Length; i++)
            if (PRO_TEST[i] == '#') {
                Console.ForegroundColor = ConsoleColor.Gray;
                Console.BackgroundColor = ConsoleColor.Gray;
                Console.Write("#");

            } else if (PRO_TEST[i] == ' ') {
                Console.ForegroundColor = ConsoleColor.Black;
                Console.BackgroundColor = ConsoleColor.Black;
                Console.Write("#");

            } else if (PRO_TEST[i] == '\n') {
                Console.ForegroundColor = ConsoleColor.Black;
                Console.BackgroundColor = ConsoleColor.Black;
                Console.WriteLine("#");
                Console.Write("  ");
            }

        Console.ForegroundColor = ConsoleColor.Gray;
        Console.BackgroundColor = ConsoleColor.Black;
        Console.WriteLine($"{"v" + System.Reflection.Assembly.GetExecutingAssembly().GetName().Version.ToString(),35}");
        Console.WriteLine();

        Console.ForegroundColor = ConsoleColor.White;
#if DEBUG
        Console.WriteLine(" - Debug mode");
#endif
        if (IsElevated()) {
            Console.WriteLine(" - Elevated");
            Console.WriteLine();
        }

        CheckUrlSegmentLengthRegKey();

        Console.ForegroundColor = ConsoleColor.DarkGray;
        LoadConfig();
        NoSQL.InitDirs();
        LoadDB();

        if (http_enable) {
            Console.WriteLine($"HTTP:    \t {http_ip}:{http_port}");
            Thread thread = new Thread(() => { Http http = new Http(http_ip, http_port, $"{System.IO.Directory.GetCurrentDirectory()}\\protest_front"); });
            thread.Priority = http_priority;
            thread.Start();
        }

        if (addressbook_enable) {
            Console.WriteLine($"Address Book:\t {addressbook_ip}:{addressbook_port}");
            Thread thread = new Thread(() => { AddressBook http = new AddressBook(addressbook_ip, addressbook_port, $"{System.IO.Directory.GetCurrentDirectory()}\\addressbook_front"); });
            thread.Priority = addressbook_priority;
            thread.Start();
        }

        if (protest_enable) {
            Console.WriteLine($"Pro-test App:\t {protest_ip}:{protest_port}");
            Thread thread = new Thread(() => { Http http = new Http(protest_ip, protest_port, $"{System.IO.Directory.GetCurrentDirectory()}\\"); });
            thread.Priority = protest_priority;
            thread.Start();
        }

        Console.ResetColor();
        Console.WriteLine();
        new Thread(() => {
            Thread.Sleep(3000);
            NoSQL.FindDuplicates(NoSQL.equip, "IP");
            NoSQL.FindDuplicates(NoSQL.users, "USERNAME");
        }).Start();
        
        //TODO: BandwidthMonitor.StartTask();

#if DEBUG
        //while (true) { Console.ReadLine(); }
#endif
    }

}
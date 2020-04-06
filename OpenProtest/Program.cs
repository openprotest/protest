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

class Program {
    public static string DB_KEY;
    public static string PRESHARED_KEY;

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
        Thread.Sleep(50);

#if DEBUG
        Console.WriteLine("  - Debug mode");
#endif

        if (IsElevated()) Console.WriteLine("  - Elevated privileges");
        else SelfElevate();

        Console.WriteLine();
        LoadConfig();
        ExtractZippedKnowlageFile();
        StartServices();

        Thread.Sleep(1000);
        Console.ResetColor();
        Console.WriteLine();
        while (true) {
            Console.Write(">");
            UserCommand(Console.ReadLine());
        }
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

    private static void LoadConfig() {
        //TODO
    }

    public static void ExtractZippedKnowlageFile() {
        DirectoryInfo dirIp = new DirectoryInfo(Strings.DIR_IP_LOCATION);
        FileInfo fileIpZip = new FileInfo($"{Strings.DIR_KNOWLAGE}\\ip.zip");
        if (!dirIp.Exists && fileIpZip.Exists)
            try {
                Console.Write("Extracting ip.zip");
                ZipFile.ExtractToDirectory(fileIpZip.FullName, dirIp.FullName);
                Console.WriteLine("\t Done");
            } catch (Exception ex) {
                Logging.Err(ex);
            }

        DirectoryInfo dirProxy = new DirectoryInfo(Strings.DIR_PROXY);
        FileInfo fileProxyZip = new FileInfo($"{Strings.DIR_KNOWLAGE}\\proxy.zip");
        if (!dirProxy.Exists && fileProxyZip.Exists)
            try {
                Console.Write("Extracting proxy.zip");
                ZipFile.ExtractToDirectory(fileProxyZip.FullName, dirProxy.FullName);
                Console.WriteLine("\t Done");
            } catch (Exception ex) {
                Logging.Err(ex);
            }

        Console.WriteLine();
    }

    private static void StartServices() {
        if (http_enable) {
            Thread thread = new Thread(() => { mainListener = new HttpMainListener(http_ip, http_port, Strings.DIR_FRONTEND); });
            thread.Priority = http_priority;
            thread.Start();
        }

        if (addressbook_enable) {
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

}
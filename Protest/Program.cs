/*
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

 Pro-test
 Developed by Andreas Venizelou, 2024
 Released into the public domain under the GPL v3
 For more information, visit https://github.com/openprotest/protest
*/

global using System;
global using System.Linq;

namespace Protest;
internal class Program {
    internal static readonly string[] alternativeUriPrefixes = new string[] { "http://127.0.0.1:8080/" };

    static void Main(string[] args) {
        Console.Title = "Pro-test";

        Console.WriteLine(@"   _____");
        Console.WriteLine(@"  |  __ \            _            _");
        Console.WriteLine(@"  | |_/ / __ ___ ___| |_ ___  ___| |_");
        Console.WriteLine(@"  |  __/ '__/ _ \___| __/ _ \/ __| __|");
        Console.WriteLine(@"  | |  | | | (_) |  | ||  __/\__ \ |_");
        Console.WriteLine(@"  \_|  |_|  \___/   \__ \___||___/\__|");
        Console.WriteLine($"{Data.VersionToString(), 38}");
        Console.WriteLine();

#if DEBUG
        Console.WriteLine(" - Debug mode");
#endif
        Console.WriteLine($" - Startup time: {DateTime.Now.ToString(Data.DATETIME_FORMAT)}");
        Console.WriteLine();

        Data.InitializeDirectories();

        bool loadConfig = Configuration.Load();
        Console.WriteLine(String.Format("{0, -23} {1, -10}", "Loading configuration", loadConfig ? "OK  " : "Failed"));
        if (!loadConfig) {
            Console.WriteLine("Creating default configuration file");
            Configuration.CreateDefault();
        }

        if (OperatingSystem.IsWindows() && Configuration.force_registry_keys) {
            bool disableHeader = Configuration.DisableServerHeaderRegKey();
            Console.WriteLine(String.Format("{0, -23} {1, -10}", "Force registry keys", disableHeader ? "OK  " : "Failed"));
        }

        Console.Write("Loading database");
        DatabaseInstances.Initialize();
        Console.WriteLine("        OK");

        bool loadRbac = Http.Auth.LoadRbac();
        Console.WriteLine(String.Format("{0, -23} {1, -10}", "Loading RBAC", loadRbac ? "OK  " : "Failed"));

        Console.Write("Launching tasks");
        Tasks.Automation.Initialize();
        Console.WriteLine("         OK");

        Console.WriteLine();

        try {
            Http.Listener listener = new Http.Listener(Configuration.http_prefixes, Configuration.front_path);
            Console.WriteLine(listener.ToString());
            Console.WriteLine();
            listener.Start();
        }
        catch (System.Net.HttpListenerException ex) {
            if (ex.ErrorCode != 5) return; //access denied
            Console.WriteLine("Switching to alternative prefix");

            Http.Listener listener = new Http.Listener(alternativeUriPrefixes, Configuration.front_path);
            Console.WriteLine(listener.ToString());
            Console.WriteLine();
            listener.Start();
        }
    }
}
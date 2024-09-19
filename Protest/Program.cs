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
    static void Main(string[] args) {
        Console.Title = "Pro-test";

        Console.WriteLine(@"   _____");
        Console.WriteLine(@"  |  __ \            _            _");
        Console.WriteLine(@"  | |_/ / __ ___ ___| |_ ___  ___| |_");
        Console.WriteLine(@"  |  __/ '__/ _ \___| __/ _ \/ __| __|");
        Console.WriteLine(@"  | |  | | | (_) |  | ||  __/\__ \ |_");
        Console.WriteLine(@"  \_|  |_|  \___/   \__ \___||___/\__|");

#if DEBUG
        Console.WriteLine($"  Debug mode {Data.VersionToString(), 25}");
#else
        Console.WriteLine($"{Data.VersionToString(), 38}");
#endif

        Console.WriteLine();

        Console.WriteLine($"Startup time: {DateTime.Now.ToString(Data.DATETIME_FORMAT)}");
        Console.WriteLine();

        Data.InitializeDirectories();

        bool loadConfig = Configuration.Load();
        Console.WriteLine(String.Format("{0, -23} {1, -10}", "Loading configuration", loadConfig ? "Done" : "Failed"));
        if (!loadConfig) {
            Console.WriteLine("Creating default configuration file");
            Configuration.CreateDefault();
        }

        Console.Write("Loading database");
        DatabaseInstances.Initialize();
        Console.WriteLine("        Done");

        bool loadRbac = Http.Auth.LoadRbac();
        Console.WriteLine(String.Format("{0, -23} {1, -10}", "Loading RBAC", loadRbac ? "Done" : "Failed"));

        Console.Write("Starting tasks");
        Tasks.Automation.Initialize();
        Console.WriteLine("        Done");

        Console.WriteLine();

        try {
            StartServer(Configuration.http_prefixes);
        }
        catch (System.Net.HttpListenerException ex) {
            if (ex.ErrorCode != 5) return; //access denied
            Console.WriteLine("Switching to fallback uri prefix");
            StartServer(new string[] { "http://127.0.0.1:8080/" });
        }
    }

    private static void StartServer(string[] prefixes) {
        Http.Listener listener = new Http.Listener(prefixes, Configuration.front_path);
        Console.WriteLine(listener.ToString());
        Console.WriteLine();
        listener.Start();
    }
}
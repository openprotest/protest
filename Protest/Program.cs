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
 Developed by Andreas Venizelou, 2026
 Licensed under the GNU General Public License v3
 For more information, visit https://github.com/openprotest/protest
*/

global using System;
global using System.Linq;

using System.Threading.Tasks;

namespace Protest;

internal class Program {
    static async Task Main(string[] args) {
        Console.Title = "Pro-test";

        Console.WriteLine(@"   _____");
        Console.WriteLine(@"  |  __ \            _            _");
        Console.WriteLine(@"  | |_/ / __ ___ ___| |_ ___  ___| |_");
        Console.WriteLine(@"  |  __/ '__/ _ \___| __/ _ \/ __| __|");
        Console.WriteLine(@"  | |  | | | (_) |  | ||  __/\__ \ |_");
        Console.WriteLine(@"  \_|  |_|  \___/   \__ \___||___/\__|");

#if DEBUG
        Console.WriteLine($"  Debug mode {Data.VersionToString(),25}");
#else
        Console.WriteLine($"{Data.VersionToString(), 38}");
#endif

        Console.WriteLine();

        Console.WriteLine($"Startup time: {DateTime.Now.ToString(Data.DATETIME_FORMAT)}");
        Console.WriteLine();

        Data.InitializeDirectories();

        bool configurationLoaded = Configuration.Load();
        Console.WriteLine($"{"Loading configuration",-23} {(configurationLoaded ? "Done" : "Failed"),-10}");
        if (!configurationLoaded) {
            Console.WriteLine("Creating default configuration file");
            Configuration.CreateDefault();
        }

        Console.Write($"{"Loading database",-24}");
        DatabaseInstances.Initialize();
        Console.WriteLine("Done");

        bool rbacLoaded = Http.Auth.LoadRbac();
        Console.WriteLine($"{"Loading RBAC",-23} {(rbacLoaded ? "Done" : "Failed"),-10}");

        Console.Write($"{"Starting tasks",-24}");
        Tasks.Automation.Initialize();
        Console.WriteLine("Done");

        Console.WriteLine();

        //Console.CancelKeyPress += (_, e) => Console.WriteLine("\nProtest shutting down...");

        try {
            await StartServer(Configuration.httpPrefixes);
        }
        catch (System.Net.HttpListenerException ex) when (ex.ErrorCode == 5) { //5: access denied
            Console.WriteLine(ex.Message);
            Console.WriteLine("Switching to fallback URI prefix");
            await StartServer(Configuration.fallbackUri);
        }
        catch (Exception ex) {
            Console.Error.WriteLine(ex);
            Environment.ExitCode = 1;
        }
    }

    private static async Task StartServer(string[] prefixes) {
        Http.Listener listener = new Http.Listener(prefixes, Configuration.frontPath);
        Console.WriteLine(listener);
        Console.WriteLine();

        await listener.StartAsync();
    }
}
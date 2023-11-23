using System.IO;
using System.Collections.Generic;
using System.Reflection;
using System.Runtime.Versioning;
using System.Text;

namespace Protest;
internal static class Configuration {
    internal static string DB_KEY_STRING;
    internal static byte[] DB_KEY;
    internal static byte[] DB_KEY_IV;

    internal static bool force_registry_keys = false;

    internal static string front_path = $"{Data.DIR_ROOT}{Data.DELIMITER}front";
    internal static string[] http_prefixes = new string[] { "http://127.0.0.1:8080/" };

    internal static string IP2LOCATION_API_KEY = null;

    internal static bool Load() {
        if (!File.Exists(Data.FILE_CONFIG)) return false;

        List<string> httpPrefixes = new List<string>();

        StreamReader fileReader = new StreamReader(Data.FILE_CONFIG);
        while (!fileReader.EndOfStream) {
            ReadOnlySpan<char> line = fileReader.ReadLine().AsSpan().Trim();
            if (line.StartsWith("#")) continue;

            int hashIndex = line.IndexOf('#');
            if (hashIndex > -1) line = line[..(hashIndex - 1)];

            int equal_index = line.IndexOf('=');
            if (equal_index < 0) continue;

            ReadOnlySpan<char> name = line[..equal_index].Trim();
            ReadOnlySpan<char> value = line[(equal_index + 1)..].Trim();

            switch (name) {
            case "title":
                Console.Title = $"Pro-test - {value}";
                break;

            case "db_key":
                DB_KEY_STRING = value.ToString();
                DB_KEY = DB_KEY_STRING.Length > 0 ? Cryptography.HashStringToBytes(DB_KEY_STRING, 32) : null; //256-bits
                DB_KEY_IV = DB_KEY_STRING.Length > 0 ? Cryptography.HashStringToBytes(DB_KEY_STRING, 16) : null; //128-bits
                break;

            case "force_registry_keys":
                force_registry_keys = value == "true";
                break;

            case "http_prefix":
                httpPrefixes.Add(value.ToString());
                break;

            case "front_path":
                front_path = value.ToString();
                break;

            case "ip2location_api_key":
                IP2LOCATION_API_KEY = value.ToString();
                break;
            }
        }

        fileReader.Close();

        if (httpPrefixes.Count > 0) http_prefixes = httpPrefixes.ToArray();

        if (IP2LOCATION_API_KEY is null) {
            try {
                IP2LOCATION_API_KEY = File.ReadAllText($"{Data.DIR_KNOWLADGE}{Data.DELIMITER}ip2location-api-key.txt").Trim();
            }
            catch { }
        }

        return true;
    }

    internal static void LocateFrontEnd() {
        DirectoryInfo frontDirectory = new DirectoryInfo(front_path);
        int upCount = 5;
        while (!frontDirectory.Exists && upCount-- > 0) {
            string path = frontDirectory.FullName;
            if (path.EndsWith($"{Data.DELIMITER}front")) {
                path = path[..^6];
            }

            int separatorIndex = path.LastIndexOf(Data.DELIMITER);
            if (separatorIndex > 0) {
                frontDirectory = new DirectoryInfo($"{path[..separatorIndex]}{Data.DELIMITER}front");
            }
        }

        if (frontDirectory.Exists && frontDirectory.FullName != front_path) {
            front_path = frontDirectory.FullName;
        }
    }

    internal static void CreateDefault() {
        LocateFrontEnd();

        StringBuilder builder = new StringBuilder();

        if (DB_KEY_STRING is null || DB_KEY_STRING.Length > 0) {
            DB_KEY_STRING = Cryptography.RandomStringGenerator(40);
            DB_KEY = Cryptography.HashStringToBytes(DB_KEY_STRING, 32); //256-bits
            DB_KEY_IV = Cryptography.HashStringToBytes(DB_KEY_STRING, 16); //128-bits
        }

        builder.AppendLine($"# version {Assembly.GetExecutingAssembly().GetName().Version.Major}.{Assembly.GetExecutingAssembly().GetName().Version.Minor}");
        builder.AppendLine();

        builder.AppendLine($"db_key = {DB_KEY_STRING}");
        builder.AppendLine();

        builder.AppendLine($"front_path = {front_path}");
        builder.AppendLine();

        builder.AppendLine($"force_registry_keys = {force_registry_keys.ToString().ToLower()}");
        builder.AppendLine();

        builder.AppendLine("http_prefix = http://127.0.0.1:8080/");
        builder.AppendLine("http_prefix = http://[::1]:8080/");
        builder.AppendLine("#http_prefix = https://+:443/");
        builder.AppendLine();

        builder.AppendLine("#ip2location_api_key = PASTE-API-KEY-HERE");
        builder.AppendLine();

        builder.AppendLine();
        builder.AppendLine("###");
        builder.AppendLine("###  Use NETSH to bind an SSL certificate with your https endpoint:");
        builder.AppendLine($"###  netsh http add sslcert ipport=0.0.0.0:443 certhash=[thumbprint] appid={{{Data.GUID}}}");
        builder.AppendLine("###");

        File.WriteAllText(Data.FILE_CONFIG, builder.ToString());
    }

    [SupportedOSPlatform("windows")]
    internal static bool DisableServerHeaderRegKey() {
        string value;
        try {
            Microsoft.Win32.RegistryKey key = Microsoft.Win32.Registry.LocalMachine.CreateSubKey(@"SYSTEM\CurrentControlSet\Services\HTTP\Parameters");
            value = key.GetValue("DisableServerHeader")?.ToString();
            key.Close();
        }
        catch {
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
        }
        catch {
            Logger.Error(@"Failed to update Registry Key (HKEY_LOCAL_MACHINE\System\CurrentControlSet\Services\HTTP\Parameters)");
        }

        return true;
    }

}
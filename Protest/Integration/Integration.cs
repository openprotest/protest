using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading;
using Protest.Http;

namespace Protest.Integration;

internal class Integration {
    //Pattern is an optional regular expression that a supplied value has to match.
    //An optional field may be left empty; clearing it (not a secret) removes the stored value.
    internal sealed record Field(string Name, string Label, bool Secret, string[] Suggestions, string Pattern = null, bool Optional = false);
    internal sealed record TypeInfo(string Key, string Label, Field[] Fields);
    internal sealed record Instance(string Id, string Type, string Name, string Description, bool Enabled);

    private const int MAX_PAYLOAD = 64 * 1024;
    private const int MAX_NAME = 64;
    private const int MAX_DESCRIPTION = 500;
    private const int MAX_VALUE = 512;

    //fixed so that a migration interrupted halfway is redone over the same file instead of creating a duplicate
    private const string LEGACY_ESET_INSTANCE_ID = "e5e70000-0000-4000-8000-000000000001";
    private const string LEGACY_ESET_FILE = "eset.json";

    //Each integration type declares the fields the end user has to fill in; the front-end builds its dialog from this.
    internal static readonly TypeInfo[] Types = [
        new TypeInfo("eset", "ESET", [
            new Field("url",      "Identity endpoint", false, ["eu01.protect.eset.com", "eu02.protect.eset.com", "us01.protect.eset.com", "ca01.protect.eset.com"]),
            new Field("username", "Username",          false, null),
            new Field("password", "Password",          true,  null)
        ]),

        //the tenant ends up in the sign-in URL, so it is restricted to what a tenant id or domain can contain
        new TypeInfo("entra", "Entra ID", [
            new Field("tenant", "Tenant ID",     false, null, @"^[A-Za-z0-9][A-Za-z0-9.\-]*$"),
            new Field("client", "Client ID",     false, null, @"^[0-9A-Fa-f]{8}-([0-9A-Fa-f]{4}-){3}[0-9A-Fa-f]{12}$"),
            new Field("secret", "Client secret", true,  null)
        ]),

        //Consoles use a self-signed certificate unless one was installed, so the certificate can be pinned by its
        //SHA-256 thumbprint. The address is only a host (and a port), it is where the API key is sent.
        new TypeInfo("unifi", "UniFi", [
            new Field("url",        "Console address",        false, null, @"^(https?://)?[A-Za-z0-9]([A-Za-z0-9.\-]*[A-Za-z0-9])?(:[0-9]{1,5})?/?$"),
            new Field("key",        "API key",                true,  null),
            new Field("thumbprint", "Certificate thumbprint", false, null, @"^[0-9A-Fa-f]{2}(:?[0-9A-Fa-f]{2}){31}$", true)
        ])
    ];

    private static readonly Lock mutex = new Lock();
    private static readonly Dictionary<string, Instance> instances = new Dictionary<string, Instance>();
    private static bool loaded;

    internal static TypeInfo FindType(string key) => Types.FirstOrDefault(t => t.Key == key);

    internal static Instance[] GetInstances(string type = null) {
        lock (mutex) {
            EnsureLoaded();
            return instances.Values
                .Where(i => type is null || i.Type == type)
                .OrderBy(i => i.Name, StringComparer.OrdinalIgnoreCase)
                .ToArray();
        }
    }

    internal static bool TryGetInstance(string id, out Instance instance) {
        lock (mutex) {
            EnsureLoaded();
            return instances.TryGetValue(id, out instance);
        }
    }

    //The credentials stay encrypted on disk and are only decrypted when they are needed.
    internal static Dictionary<string, string> ReadConfig(string id) {
        try {
            byte[] file;
            lock (mutex) {
                file = File.ReadAllBytes(PathOf(id));
            }

            using JsonDocument doc = JsonDocument.Parse(file);
            byte[] cipher = Convert.FromBase64String(doc.RootElement.GetProperty("secret").GetString());
            byte[] plain = Cryptography.Decrypt(cipher, Configuration.DB_KEY, Configuration.DB_KEY_IV);
            return JsonSerializer.Deserialize<Dictionary<string, string>>(plain);
        }
        catch (Exception ex) {
            Logger.Error(ex);
            return null;
        }
    }

    public static byte[] GetTypes() {
        var list = Types.Select(t => new {
            type   = t.Key,
            label  = t.Label,
            fields = t.Fields.Select(f => new {
                name        = f.Name,
                label       = f.Label,
                secret      = f.Secret,
                optional    = f.Optional,
                suggestions = f.Suggestions ?? []
            }).ToArray()
        }).ToArray();

        return JsonSerializer.SerializeToUtf8Bytes(list);
    }

    public static byte[] List() {
        var list = GetInstances().Select(i => new {
            id          = i.Id,
            type        = i.Type,
            label       = FindType(i.Type)?.Label ?? i.Type,
            name        = i.Name,
            description = i.Description,
            enabled     = i.Enabled,
            error       = GetLastError(i)
        }).ToArray();

        return JsonSerializer.SerializeToUtf8Bytes(list);
    }

    //Everything but the secret fields, which are never sent back to the front-end.
    public static byte[] Get(HttpListenerContext ctx) {
        if (!TryGetInstanceParameter(ctx, out Instance instance)) return Data.CODE_NOT_FOUND.Array;

        Dictionary<string, string> config = ReadConfig(instance.Id);
        if (config is null) return Data.CODE_FAILED.Array;

        Dictionary<string, string> visible = new Dictionary<string, string>();
        foreach (Field field in FindType(instance.Type).Fields) {
            if (!field.Secret && config.TryGetValue(field.Name, out string value)) {
                visible[field.Name] = value;
            }
        }

        return JsonSerializer.SerializeToUtf8Bytes(new {
            id          = instance.Id,
            type        = instance.Type,
            name        = instance.Name,
            description = instance.Description,
            enabled     = instance.Enabled,
            config      = visible
        });
    }

    //Creates the instance when the payload has no id. A secret field left empty keeps its stored value.
    public static byte[] Save(HttpListenerContext ctx, string origin) {
        using JsonDocument doc = ReadJsonBody(ctx);
        if (doc is null || doc.RootElement.ValueKind != JsonValueKind.Object) return Data.CODE_INVALID_ARGUMENT.Array;
        JsonElement root = doc.RootElement;

        Instance existing = null;
        string idText = GetString(root, "id");
        if (!String.IsNullOrEmpty(idText)) {
            if (!Guid.TryParse(idText, out Guid guid) || !TryGetInstance(guid.ToString(), out existing)) {
                return Data.CODE_NOT_FOUND.Array;
            }
        }

        TypeInfo type = FindType(existing?.Type ?? GetString(root, "type"));
        if (type is null) return Data.CODE_INVALID_ARGUMENT.Array;

        string name = (GetString(root, "name") ?? String.Empty).Trim();
        string description = (GetString(root, "description") ?? String.Empty).Trim();

        if (name.Length == 0) return Error("The name is required");
        if (name.Length > MAX_NAME) return Error($"The name cannot be longer than {MAX_NAME} characters");
        if (name.Any(Char.IsControl)) return Error("The name contains invalid characters"); //it is written to the audit log
        if (description.Length > MAX_DESCRIPTION) return Error($"The description cannot be longer than {MAX_DESCRIPTION} characters");

        bool enabled = root.TryGetProperty("enabled", out JsonElement enabledEl)
            ? enabledEl.ValueKind == JsonValueKind.True
            : (existing?.Enabled ?? true);

        Dictionary<string, string> config = existing is null ? new Dictionary<string, string>() : ReadConfig(existing.Id);
        if (config is null) return Data.CODE_FAILED.Array;

        bool hasConfig = root.TryGetProperty("config", out JsonElement supplied) && supplied.ValueKind == JsonValueKind.Object;
        bool configChanged = false;

        foreach (Field field in type.Fields) {
            string value = null;
            bool present = hasConfig && supplied.TryGetProperty(field.Name, out JsonElement valueEl) && valueEl.ValueKind == JsonValueKind.String;
            if (present) {
                value = field.Secret ? supplied.GetProperty(field.Name).GetString() : supplied.GetProperty(field.Name).GetString().Trim();
            }

            if (String.IsNullOrEmpty(value)) {
                config.TryGetValue(field.Name, out string stored);

                if (field.Optional) {
                    if (present && !field.Secret && !String.IsNullOrEmpty(stored)) { //emptied on purpose
                        config[field.Name] = String.Empty;
                        configChanged = true;
                    }
                    continue;
                }

                if (String.IsNullOrEmpty(stored)) {
                    return Error($"{field.Label} is required");
                }
                continue;
            }

            if (value.Length > MAX_VALUE) return Error($"{field.Label} is too long");

            if (field.Pattern is not null && !Regex.IsMatch(value, field.Pattern, RegexOptions.CultureInvariant)) {
                return Error($"{field.Label} is not valid");
            }

            if (!config.TryGetValue(field.Name, out string current) || current != value) {
                config[field.Name] = value;
                configChanged = true;
            }
        }

        Instance instance;
        lock (mutex) {
            EnsureLoaded();

            foreach (Instance other in instances.Values) {
                if (other.Id != existing?.Id && String.Equals(other.Name, name, StringComparison.OrdinalIgnoreCase)) {
                    return Error("An integration with this name already exists");
                }
            }

            instance = new Instance(existing?.Id ?? Guid.NewGuid().ToString(), type.Key, name, description, enabled);

            try {
                WriteInstance(instance, config);
            }
            catch (Exception ex) {
                Logger.Error(ex);
                return Data.CODE_FAILED.Array;
            }

            instances[instance.Id] = instance;
        }

        if (existing is null) {
            Logger.Action(origin, "Integration", $"Add {type.Label} integration: {name}");
        }
        else {
            if (configChanged) DropClient(instance); //forces a new login with the new credentials

            string renamed = existing.Name == name ? String.Empty : $" (previously {existing.Name})";
            string credentials = configChanged ? " (credentials changed)" : String.Empty;
            Logger.Action(origin, "Integration", $"Modify {type.Label} integration: {name}{renamed}{credentials}");
        }

        return Encoding.UTF8.GetBytes($"{{\"status\":\"ok\",\"id\":\"{instance.Id}\"}}");
    }

    public static byte[] Delete(HttpListenerContext ctx, string origin) {
        if (!TryGetInstanceParameter(ctx, out Instance instance)) return Data.CODE_NOT_FOUND.Array;

        lock (mutex) {
            try {
                File.Delete(PathOf(instance.Id));
            }
            catch (Exception ex) {
                Logger.Error(ex);
                return Data.CODE_FAILED.Array;
            }

            instances.Remove(instance.Id);
        }

        DropClient(instance);

        Logger.Action(origin, "Integration", $"Delete {FindType(instance.Type).Label} integration: {instance.Name}");
        return Data.CODE_OK.Array;
    }

    public static byte[] Test(HttpListenerContext ctx, string origin) {
        if (!TryGetInstanceParameter(ctx, out Instance instance)) return Data.CODE_NOT_FOUND.Array;

        string error = instance.Type switch {
            "eset"  => Eset.Get(instance.Id).TestAsync().GetAwaiter().GetResult(),
            "entra" => EntraId.Get(instance.Id).TestAsync().GetAwaiter().GetResult(),
            "unifi" => UniFi.Get(instance.Id).TestAsync().GetAwaiter().GetResult(),
            _       => "Unsupported integration type"
        };

        Logger.Action(origin, "Integration", $"Test {FindType(instance.Type).Label} integration: {instance.Name} ({(error is null ? "succeeded" : "failed")})");

        return error is null ? Data.CODE_OK.Array : Error(error);
    }

    private static string GetLastError(Instance instance) => instance.Type switch {
        "eset"  => Eset.GetLastError(instance.Id),
        "entra" => EntraId.GetLastError(instance.Id),
        "unifi" => UniFi.GetLastError(instance.Id),
        _       => null
    };

    private static void DropClient(Instance instance) {
        if (instance.Type == "eset") Eset.Drop(instance.Id);
        else if (instance.Type == "entra") EntraId.Drop(instance.Id);
        else if (instance.Type == "unifi") UniFi.Drop(instance.Id);
    }

    //What the fetch screen sends to pick the instances to use: nothing (off), "all", or the id of one instance.
    //"true" is what the older clients sent for ESET, and means all.
    internal static string NormalizeSelector(string value) {
        if (String.IsNullOrWhiteSpace(value)) return null;

        value = value.Trim();
        if (value.Equals("true", StringComparison.OrdinalIgnoreCase) || value.Equals("all", StringComparison.OrdinalIgnoreCase)) return "all";

        return Guid.TryParse(value, out Guid guid) ? guid.ToString() : null;
    }

    //The enabled instances of a type that a selector refers to. A disabled or removed instance matches nothing.
    internal static Instance[] GetEnabledInstances(string type, string selector) {
        selector = NormalizeSelector(selector);
        if (selector is null) return [];

        return GetInstances(type)
            .Where(i => i.Enabled && (selector == "all" || i.Id == selector))
            .ToArray();
    }

    //The name shown as the origin of the data an instance provides, e.g. "ESET (Customer C)"
    internal static string SourceLabel(Instance instance) {
        string typeLabel = FindType(instance.Type)?.Label ?? instance.Type;
        return String.Equals(instance.Name, typeLabel, StringComparison.OrdinalIgnoreCase)
            ? typeLabel
            : $"{typeLabel} ({instance.Name})";
    }

    //Enabled instances only, for the fetch screen to choose from. Does not need the permission to manage integrations.
    public static byte[] ListEnabled() {
        var list = GetInstances().Where(i => i.Enabled).Select(i => new {
            id   = i.Id,
            type = i.Type,
            name = i.Name
        }).ToArray();

        return JsonSerializer.SerializeToUtf8Bytes(list);
    }

    private static string PathOf(string id) => Path.Join(Data.DIR_INTEGRATION, $"{id}.json");

    private static byte[] Error(string message) =>
        Encoding.UTF8.GetBytes($"{{\"error\":\"{Data.EscapeJsonText(message)}\"}}");

    private static string GetString(JsonElement element, string property) =>
        element.TryGetProperty(property, out JsonElement value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;

    private static bool TryGetInstanceParameter(HttpListenerContext ctx, out Instance instance) {
        instance = null;

        Dictionary<string, string> parameters = Listener.ParseQuery(ctx);
        if (parameters is null || !parameters.TryGetValue("id", out string id) || !Guid.TryParse(id, out Guid guid)) {
            return false;
        }

        return TryGetInstance(guid.ToString(), out instance);
    }

    private static JsonDocument ReadJsonBody(HttpListenerContext ctx) {
        if (ctx.Request.ContentLength64 > MAX_PAYLOAD) return null;

        using StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding);
        char[] buffer = new char[MAX_PAYLOAD + 1];
        int count = reader.ReadBlock(buffer, 0, buffer.Length);
        if (count == 0 || count > MAX_PAYLOAD) return null;

        try {
            return JsonDocument.Parse(new string(buffer, 0, count));
        }
        catch (JsonException) {
            return null;
        }
    }

    //The name, description and enabled flag are stored in the clear so the list needs no decryption; all of the
    //type specific fields (endpoint, username, password, ...) go into the encrypted "secret" blob.
    private static void WriteInstance(Instance instance, Dictionary<string, string> config) {
        Directory.CreateDirectory(Data.DIR_INTEGRATION);

        byte[] cipher = Cryptography.Encrypt(JsonSerializer.SerializeToUtf8Bytes(config), Configuration.DB_KEY, Configuration.DB_KEY_IV);

        byte[] json = JsonSerializer.SerializeToUtf8Bytes(new {
            id          = instance.Id,
            type        = instance.Type,
            name        = instance.Name,
            description = instance.Description,
            enabled     = instance.Enabled,
            secret      = Convert.ToBase64String(cipher)
        });

        string path = PathOf(instance.Id);
        string temp = $"{path}.tmp";
        File.WriteAllBytes(temp, json);
        File.Move(temp, path, true);
    }

    //Must be called with the mutex held.
    private static void EnsureLoaded() {
        if (loaded) return;
        loaded = true;

        try {
            if (!Directory.Exists(Data.DIR_INTEGRATION)) return;

            MigrateLegacyEset();

            foreach (FileInfo file in new DirectoryInfo(Data.DIR_INTEGRATION).GetFiles("*.json")) {
                try {
                    Instance instance = ReadEnvelope(file);
                    if (instance is not null) {
                        instances[instance.Id] = instance;
                    }
                }
                catch (Exception ex) {
                    Logger.Debug(ex);
                }
            }
        }
        catch (Exception ex) {
            Logger.Error(ex);
        }
    }

    private static Instance ReadEnvelope(FileInfo file) {
        using JsonDocument doc = JsonDocument.Parse(File.ReadAllBytes(file.FullName));
        JsonElement root = doc.RootElement;

        if (!Guid.TryParse(GetString(root, "id"), out Guid guid)) return null;

        string id = guid.ToString();
        if (!String.Equals(Path.GetFileNameWithoutExtension(file.Name), id, StringComparison.OrdinalIgnoreCase)) return null;

        string type = GetString(root, "type");
        if (FindType(type) is null) return null;

        string name = GetString(root, "name");
        if (String.IsNullOrWhiteSpace(name)) return null;

        return new Instance(
            id,
            type,
            name,
            GetString(root, "description") ?? String.Empty,
            root.TryGetProperty("enabled", out JsonElement enabled) && enabled.ValueKind == JsonValueKind.True
        );
    }

    //Before multiple instances existed, the one and only ESET integration was a single encrypted eset.json.
    private static void MigrateLegacyEset() {
        string legacy = Path.Join(Data.DIR_INTEGRATION, LEGACY_ESET_FILE);
        if (!File.Exists(legacy)) return;

        try {
            byte[] plain = Cryptography.Decrypt(File.ReadAllBytes(legacy), Configuration.DB_KEY, Configuration.DB_KEY_IV);
            using JsonDocument doc = JsonDocument.Parse(plain);

            Dictionary<string, string> config = new Dictionary<string, string> {
                ["url"]      = doc.RootElement.GetProperty("url").GetString(),
                ["username"] = doc.RootElement.GetProperty("username").GetString(),
                ["password"] = doc.RootElement.GetProperty("password").GetString()
            };

            WriteInstance(new Instance(LEGACY_ESET_INSTANCE_ID, "eset", "ESET", String.Empty, true), config);
            File.Move(legacy, $"{legacy}.migrated", true);

            Logger.Action("system", "Integration", "Migrated the existing ESET integration to a multi-instance entry: ESET");
        }
        catch (Exception ex) {
            Logger.Error(ex);
        }
    }
}

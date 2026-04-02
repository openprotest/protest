using System.Collections.Generic;
using System.IO;
using System.Runtime.Versioning;
using System.Text.Json;
using System.Text.Json.Serialization;
using Protest.Tasks;

namespace Protest.Tools;

internal static class WindowsUpdate {

    private const string CRITICAL_CATEGORY_ID = "E6CF1350-C01B-414D-A61F-263D14D133B4";
    private const string SECURITY_CATEGORY_ID = "0FA1201D-4330-4FA8-8AE9-B877473B6441";

    private static readonly JsonSerializerOptions serializerOptions;

    public struct UpdatesResult {
        public long timestamp;
        public List<UpdateInfo> updates;
        public uint criticalCount;
        public uint securityCount;
        public bool isRebootRequired;
    }

    public struct UpdateInfo {
        public string title;
        public string description;
        public string kbArticleIds;
        public bool   isCritical;
        public bool   isSecurity;
        public bool   rebootRequired;
        //public bool   eulaAccepted;
    }

    static WindowsUpdate() {
        serializerOptions = new JsonSerializerOptions();
        serializerOptions.Converters.Add(new UpdatesJsonConverter());
    }


    [SupportedOSPlatform("windows")]
    internal static bool CheckEntry(Database.Entry device, string ipString, out Issues.Issue? issue, int cacheMaxAge = 120) {
        if (device is null) {
            issue = null;
            return false;
        }

        try {
            bool hasHostname = device.attributes.TryGetValue("hostname", out Database.Attribute hostname);
            string hostnameString = hostname?.value.Split(';')[0];

            if (String.IsNullOrWhiteSpace(ipString) || String.IsNullOrWhiteSpace(hostnameString)) {
                issue = null;
                return false;
            }

            string name = !string.IsNullOrWhiteSpace(hostnameString) ? hostnameString : ipString;

            if (!String.IsNullOrWhiteSpace(ipString)) {
                bool r =  CheckHost(ipString, device.filename, name, out issue, cacheMaxAge);
                Console.WriteLine(r);
                return r;
            }
            else if (hasHostname) {
                bool r = CheckHost(hostnameString, device.filename, hostnameString, out issue, cacheMaxAge);
                Console.WriteLine(r);
                return r;
            }
            else {
                issue = null;
                return false;
            }
        }
        catch (Exception) {
            issue = null;
            return false;
        }
    }

    [SupportedOSPlatform("windows")]
    private static bool CheckHost(string host, string file, string name, out Issues.Issue? issue, int cacheMaxAge = 120) {
        if (String.IsNullOrWhiteSpace(host)) {
            issue = null;
            return false;
        }

        UpdatesResult result;
        UpdatesResult? cache = GetCache(file);
        bool rechable = Protocols.Icmp.Ping(host);

        if (rechable) {
            long now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            bool useCache = cache is not null && now - cache.Value.timestamp < cacheMaxAge * 60;
            result = useCache ? cache.Value : GetUpdates(host, file);
        }
        else if (cache is null) {
            issue = null;
            return false;
        }
        else {
            result = cache.Value;
        }

        if (result.criticalCount > 0 || result.securityCount > 0) {
            issue = new Issues.Issue {
                severity   = Issues.SeverityLevel.critical,
                message    = $"Critical/security updates are available ({result.criticalCount + result.securityCount})",
                name       = name,
                identifier = host,
                category   = "Operating system",
                source     = "WUA",
                file       = file,
                isUser     = false
            };
            return true;
        }

        issue = null;
        return false;
    }

    [SupportedOSPlatform("windows")]
    private static UpdatesResult GetUpdates(string host, string file) {
        Type sessionType = Type.GetTypeFromProgID("Microsoft.Update.Session", host, true);

        dynamic session = Activator.CreateInstance(sessionType)!;
        session.ClientApplicationID = "Pro-test";

        dynamic searcher = session.CreateUpdateSearcher();
        dynamic result = searcher.Search("IsInstalled=0 and IsHidden=0 and Type='Software'");

        uint criticalCount = 0;
        uint securityCount = 0;
        bool isRebootRequired = false;
        List<UpdateInfo> updates = new List<UpdateInfo>();

        for (int i = 0; i < result.Updates.Count; i++) {
            dynamic update = result.Updates.Item(i);

            bool isCritical = false, isSecurity = false;

            for (int j = 0; j < update.Categories.Count; j++) {
                dynamic category = update.Categories.Item(j);
                string categoryType = category.Type;
                if (!string.Equals(categoryType, "UpdateClassification", StringComparison.OrdinalIgnoreCase)) {
                    continue;
                }

                string categoryId = Convert.ToString(category.CategoryID);
                if (!String.IsNullOrEmpty(categoryId)) {
                    if (string.Equals(categoryId, CRITICAL_CATEGORY_ID, StringComparison.OrdinalIgnoreCase)) {
                        isCritical = true;
                        criticalCount++;
                    }
                    else if (string.Equals(categoryId, SECURITY_CATEGORY_ID, StringComparison.OrdinalIgnoreCase)) {
                        isSecurity = true;
                        securityCount++;
                    }
                }
            }

            List<string> kbIds = new List<string>();
            for (int k = 0; k < update.KBArticleIDs.Count; k++) {
                dynamic value = update.KBArticleIDs.Item(k);
                if (value is null) continue;
                kbIds.Add($"KB{Convert.ToString(value)}");
            }

            bool rebootRequired = Convert.ToBoolean(update.RebootRequired);
            if (rebootRequired) {
                isRebootRequired = true;
            }

            updates.Add(new UpdateInfo {
                title          = Convert.ToString(update.Title) ?? "--",
                description    = Convert.ToString(update.Description) ?? "--",
                kbArticleIds   = String.Join(", ", kbIds),
                isCritical     = isCritical,
                isSecurity     = isSecurity,
                rebootRequired = rebootRequired,
                //eulaAccepted   = Convert.ToBoolean(update.EulaAccepted)
            });
        }

        UpdatesResult updatesResult = new UpdatesResult {
            timestamp        = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
            updates          = updates,
            criticalCount    = criticalCount,
            securityCount    = securityCount,
            isRebootRequired = isRebootRequired,
        };

        SetCache(updatesResult, file);

        return updatesResult;
    }

    internal static bool EvaluateResults() {
        
        return false;
    }

    private static void SetCache(UpdatesResult updatesResult, string file) {
        DirectoryInfo cacheDirectory = new DirectoryInfo(Data.DIR_WUA_CACHE);
        if (!cacheDirectory.Exists) {
            cacheDirectory.Create();
        }

        try {
            byte[] bytes = JsonSerializer.SerializeToUtf8Bytes<UpdatesResult>(updatesResult, serializerOptions);
            File.WriteAllBytes($"{Data.DIR_WUA_CACHE}{Data.DELIMITER}{file}", bytes);
        }
        catch (Exception ex) {
            Logger.Error(ex);
        }
    }

    internal static UpdatesResult? GetCache(string file) {
        DirectoryInfo cacheDirectory = new DirectoryInfo(Data.DIR_WUA_CACHE);
        if (!cacheDirectory.Exists) return null;

        string fullname = $"{Data.DIR_WUA_CACHE}{Data.DELIMITER}{file}";

        if (!File.Exists(fullname)) return null;

        try {
            byte[]  bytes = File.ReadAllBytes(fullname);
            UpdatesResult result = JsonSerializer.Deserialize<UpdatesResult>(bytes, serializerOptions);
            return result;
        }
        catch (Exception ex) {
            Logger.Error(ex);
            return null;
        }
    }
}

file sealed class UpdatesJsonConverter : JsonConverter<WindowsUpdate.UpdatesResult> {
    public override WindowsUpdate.UpdatesResult Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) {
        long timestamp = 0;
        uint criticalCount = 0;
        uint securityCount = 0;
        bool isRebootRequired = false;
        List<WindowsUpdate.UpdateInfo> updates = new();

        if (reader.TokenType == JsonTokenType.None) {
            reader.Read();
        }

        if (reader.TokenType != JsonTokenType.StartObject) throw new JsonException();

        while (reader.Read()) {
            if (reader.TokenType == JsonTokenType.EndObject) break;
            if (reader.TokenType != JsonTokenType.PropertyName) continue;

            string propertyName = reader.GetString();
            reader.Read();

            switch (propertyName) {
            case "timestamp"        : timestamp        = reader.GetInt64(); break;
            case "criticalCount"    : criticalCount    = reader.GetUInt32(); break;
            case "securityCount"    : securityCount    = reader.GetUInt32(); break;
            case "isRebootRequired" : isRebootRequired = reader.GetBoolean(); break;

            case "updates":
                if (reader.TokenType != JsonTokenType.StartArray)  throw new JsonException();

                while (reader.Read()) {
                    if (reader.TokenType == JsonTokenType.EndArray) {
                        break;
                    }

                    if (reader.TokenType != JsonTokenType.StartObject) {
                        throw new JsonException();
                    }

                    string title          = string.Empty;
                    string description    = string.Empty;
                    string kbArticleIds   = string.Empty;
                    bool   isCritical     = false;
                    bool   isSecurity     = false;
                    bool   rebootRequired = false;
                    //bool   eulaAccepted   = false;

                    while (reader.Read()) {
                        if (reader.TokenType == JsonTokenType.EndObject) break;
                        if (reader.TokenType != JsonTokenType.PropertyName) continue;

                        string updatePropertyName = reader.GetString();
                        reader.Read();

                        switch (updatePropertyName) {
                        case "title"          : title = reader.GetString() ?? string.Empty; break;
                        case "description"    : description = reader.GetString() ?? string.Empty; break;
                        case "kbArticleIds"   : kbArticleIds = reader.GetString() ?? string.Empty; break;
                        case "isCritical"     : isCritical = reader.GetBoolean(); break;
                        case "isSecurity"     : isSecurity = reader.GetBoolean(); break;
                        case "rebootRequired" : rebootRequired = reader.GetBoolean(); break;
                        //case "eulaAccepted"   : eulaAccepted = reader.GetBoolean(); break;
                        default: reader.Skip(); break;
                        }
                    }

                    updates.Add(new WindowsUpdate.UpdateInfo {
                        title          = title,
                        description    = description,
                        kbArticleIds   = kbArticleIds,
                        isCritical     = isCritical,
                        isSecurity     = isSecurity,
                        rebootRequired = rebootRequired,
                        //eulaAccepted   = eulaAccepted
                    });
                }
                break;

            default:
                reader.Skip();
                break;
            }
        }

        return new WindowsUpdate.UpdatesResult {
            timestamp        = timestamp,
            updates          = updates,
            criticalCount    = criticalCount,
            securityCount    = securityCount,
            isRebootRequired = isRebootRequired,
        };
    }

    public override void Write(Utf8JsonWriter writer, WindowsUpdate.UpdatesResult value, JsonSerializerOptions options) {
        writer.WriteStartObject();
        writer.WriteNumber("timestamp", value.timestamp);
        writer.WriteNumber("criticalCount", value.criticalCount);
        writer.WriteNumber("securityCount", value.securityCount);
        writer.WriteBoolean("isRebootRequired", value.isRebootRequired);

        writer.WritePropertyName("updates");

        writer.WriteStartArray();
        for (int i = 0; i < value.updates.Count; i ++) {
            writer.WriteStartObject();
            writer.WriteString("title"       , value.updates[i].title);
            writer.WriteString("description" , value.updates[i].description);
            writer.WriteString("kbArticleIds", value.updates[i].kbArticleIds);

            writer.WriteBoolean("isCritical"    , value.updates[i].isCritical);
            writer.WriteBoolean("isSecurity"    , value.updates[i].isSecurity);
            writer.WriteBoolean("rebootRequired", value.updates[i].rebootRequired);
            //writer.WriteBoolean("eulaAccepted"  , value.updates[i].eulaAccepted);

            writer.WriteEndObject();
        }
        writer.WriteEndArray();

        writer.WriteEndObject();
    }
}
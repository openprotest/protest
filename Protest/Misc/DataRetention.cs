using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Text;
using System.Text.Json;
using System.Threading;
using Protest.Http;

namespace Protest;

internal static class DataRetention {
    internal const int MIN_DAYS = 30;

    internal delegate int PurgeDelegate(int days);

    internal sealed record Category(string Key, string Label, PurgeDelegate Purge, int DefaultDays);

    internal sealed class Settings {
        public string key { get; set; }
        public bool enable { get; set; }
        public int days { get; set; }
    }

    internal static readonly Category[] Categories = new Category[] {
        new("recordings",     "session recordings", Protocols.SessionRecording.DeleteOlderThan, 30),
        new("lifeline",       "lifeline",            Tasks.Lifeline.DeleteOlderThan, 365),
        new("lastseen",       "last-seen",           Tasks.LastSeen.DeleteOlderThan, 365),
        new("watchdog",       "watchdog",            Tasks.Watchdog.DeleteOlderThan, 90),
        new("logs",           "log",                 Logger.DeleteOlderThan, 90),
        new("devicetimeline", "device timeline",     days => DatabaseInstances.devices.DeleteOldTimelineEntries(days), 365),
        new("usertimeline",   "user timeline",       days => DatabaseInstances.users.DeleteOldTimelineEntries(days), 365)
    };

    private static readonly Lock settingsMutex = new Lock();

    internal static Dictionary<string, Settings> LoadSettings() {
        Dictionary<string, Settings> settings = new Dictionary<string, Settings>();

        try {
            if (File.Exists(Data.FILE_DATA_RETENTION)) {
                string plain = File.ReadAllText(Data.FILE_DATA_RETENTION);
                Settings[] array = JsonSerializer.Deserialize<Settings[]>(plain);
                if (array is not null) {
                    for (int i = 0; i < array.Length; i++) {
                        if (array[i]?.key is not null) {
                            settings[array[i].key] = array[i];
                        }
                    }
                }
            }
        }
        catch (Exception ex) {
            Logger.Error(ex);
        }

        foreach (Category category in Categories) {
            if (!settings.ContainsKey(category.Key)) {
                settings[category.Key] = new Settings { key = category.Key, enable = false, days = category.DefaultDays };
            }
        }

        return settings;
    }

    internal static byte[] ListSettings() {
        Dictionary<string, Settings> settings = LoadSettings();
        try {
            return JsonSerializer.SerializeToUtf8Bytes(settings.Values);
        }
        catch {
            return Data.CODE_FAILED.Array;
        }
    }

    internal static byte[] SaveSettings(HttpListenerContext ctx, string origin) {
        using StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding);
        string payload = reader.ReadToEnd();

        if (String.IsNullOrEmpty(payload)) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        try {
            Settings[] array = JsonSerializer.Deserialize<Settings[]>(payload);
            if (array is null) return Data.CODE_INVALID_ARGUMENT.Array;

            for (int i = 0; i < array.Length; i++) {
                array[i].days = Math.Max(array[i].days, MIN_DAYS);
            }

            lock (settingsMutex) {
                File.WriteAllBytes(Data.FILE_DATA_RETENTION, JsonSerializer.SerializeToUtf8Bytes(array));
            }

            return Data.CODE_OK.Array;
        }
        catch (Exception ex) {
            Logger.Error(ex);
            return Data.CODE_FAILED.Array;
        }
    }

    internal static int PurgeEnabledCategories() {
        Dictionary<string, Settings> settings = LoadSettings();
        int totalDeleted = 0;

        foreach (Category category in Categories) {
            if (!settings.TryGetValue(category.Key, out Settings setting) || !setting.enable) continue;
            totalDeleted += category.Purge(Math.Max(setting.days, MIN_DAYS));
        }

        return totalDeleted;
    }

    internal static int Purge(string key, int days) {
        days = Math.Max(days, MIN_DAYS);

        foreach (Category category in Categories) {
            if (category.Key == key) {
                return category.Purge(days);
            }
        }

        return 0;
    }

    internal static void PurgeAll(int days) {
        days = Math.Max(days, MIN_DAYS);
        foreach (Category category in Categories) {
            category.Purge(days);
        }
    }

    internal static byte[] Handler(HttpListenerContext ctx, string origin, string key) {
        Dictionary<string, string> parameters = Listener.ParseQuery(ctx);
        if (parameters is null || !parameters.TryGetValue("days", out string daysString) || !int.TryParse(daysString, out int days)) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        Category category = Array.Find(Categories, c => c.Key == key);
        if (category is null) return Data.CODE_INVALID_ARGUMENT.Array;

        days = Math.Max(days, MIN_DAYS);

        int deleted = category.Purge(days);
        Logger.Action(origin, "Data retention", $"Deleted {deleted} {category.Label} item(s) older than {days} day(s)");

        return Encoding.UTF8.GetBytes($"{{\"deleted\":{deleted}}}");
    }
}

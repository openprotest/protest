using System.Collections.Generic;
using System.Net;
using System.Text;
using Protest.Http;

namespace Protest;

internal static class DataRetention {
    internal const int MIN_DAYS = 30;

    internal delegate int PurgeDelegate(int days);

    internal sealed record Category(string Key, string Label, PurgeDelegate Purge);

    internal static readonly Category[] Categories = new Category[] {
        new("recordings",     "session recordings", Protocols.SessionRecording.DeleteOlderThan),
        new("lifeline",       "lifeline",            Tasks.Lifeline.DeleteOlderThan),
        new("lastseen",       "last-seen",           Tasks.LastSeen.DeleteOlderThan),
        new("watchdog",       "watchdog",            Tasks.Watchdog.DeleteOlderThan),
        new("logs",           "log",                 Logger.DeleteOlderThan),
        new("devicetimeline", "device timeline",     days => DatabaseInstances.devices.DeleteOldTimelineEntries(days)),
        new("usertimeline",   "user timeline",       days => DatabaseInstances.users.DeleteOldTimelineEntries(days))
    };

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

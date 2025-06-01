using System.Collections.Generic;

namespace Protest;

internal static class DatabaseInstances {
    internal static Database devices;
    internal static Database users;

    internal static void Initialize() {
        devices = new Database("device", Data.DIR_DEVICES);
        users = new Database("user", Data.DIR_USERS);
    }

    internal static string FindDeviceByMac(string mac) {
        if (mac is null) return null;

        mac = mac?.Replace(":", String.Empty).Replace("-", String.Empty).ToLowerInvariant();

        foreach (KeyValuePair<string, Database.Entry> entry in devices.dictionary) {
            if (!entry.Value.attributes.TryGetValue(mac, out Database.Attribute macAttr)) continue;

            string[] entryMac = macAttr.value.
                Replace(":", String.Empty)
                .Replace("-", String.Empty)
                .ToLowerInvariant()
                .Split(';')
                .Select(o=>o.Trim())
                .ToArray();

            for (int i = 0; i < entryMac.Length; i++) {
                if (entryMac[i] == mac) return entry.Key;
            }
        }

        return null;
    }
}

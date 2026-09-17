using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Net;
using System.Text;

namespace Protest.Tools;

internal static class VaultMigration {

    private sealed class Pair {
        public string passwordKey;
        public string password;
        public string usernameKey; //null if no partner attribute was found
        public string username;
        public string targetAttrName;
        public string prefix;
    }

    public static byte[] Scan(HttpListenerContext ctx, string origin) {
        List<Vault.CredentialEntry> vault = Vault.Load();
        Dictionary<(string username, string password), Guid> dedup = new Dictionary<(string, string), Guid>();
        foreach (Vault.CredentialEntry entry in vault) {
            dedup.TryAdd((entry.username, entry.password), entry.guid);
        }

        int created = 0, reused = 0, skipped = 0;

        ScanDatabase(DatabaseInstances.devices, true, vault, dedup, origin, ref created, ref reused, ref skipped);
        ScanDatabase(DatabaseInstances.users, false, vault, dedup, origin, ref created, ref reused, ref skipped);

        Vault.PersistAll(vault);

        return Encoding.UTF8.GetBytes($"{{\"created\":{created},\"reused\":{reused},\"skipped\":{skipped}}}");
    }

    public static byte[] FindOrphans() {
        Dictionary<Guid, int> referenceCounts = CountReferences();

        List<Vault.CredentialEntry> credentials = Vault.Load();
        List<VaultSshKeys.SshKeyEntry> sshKeys = VaultSshKeys.Load();

        StringBuilder builder = new StringBuilder();
        builder.Append('[');
        bool first = true;

        foreach (Vault.CredentialEntry entry in credentials) {
            if (referenceCounts.ContainsKey(entry.guid)) continue;
            if (!first) builder.Append(',');
            first = false;

            builder.Append('{');
            builder.Append("\"type\":\"credential\",");
            builder.Append($"\"guid\":\"{entry.guid}\",");
            builder.Append($"\"name\":\"{Data.EscapeJsonText(entry.name)}\",");
            builder.Append($"\"username\":\"{Data.EscapeJsonText(entry.username)}\"");
            builder.Append('}');
        }

        foreach (VaultSshKeys.SshKeyEntry entry in sshKeys) {
            if (referenceCounts.ContainsKey(entry.guid)) continue;
            if (!first) builder.Append(',');
            first = false;

            builder.Append('{');
            builder.Append("\"type\":\"sshkey\",");
            builder.Append($"\"guid\":\"{entry.guid}\",");
            builder.Append($"\"name\":\"{Data.EscapeJsonText(entry.name)}\",");
            builder.Append($"\"username\":\"{Data.EscapeJsonText(entry.username)}\"");
            builder.Append('}');
        }

        builder.Append(']');
        return Encoding.UTF8.GetBytes(builder.ToString());
    }

    //counts, per vault guid, how many device/user "*credentials*" attributes reference it
    public static Dictionary<Guid, int> CountReferences() {
        Dictionary<Guid, int> counts = new Dictionary<Guid, int>();
        CountReferencesInDatabase(DatabaseInstances.devices, counts);
        CountReferencesInDatabase(DatabaseInstances.users, counts);
        return counts;
    }

    private static void CountReferencesInDatabase(Database database, Dictionary<Guid, int> counts) {
        foreach (Database.Entry entry in database.dictionary.Values) {
            foreach (KeyValuePair<string, Database.Attribute> attr in entry.attributes) {
                if (!attr.Key.Contains("credentials", StringComparison.OrdinalIgnoreCase)) continue;
                if (String.IsNullOrEmpty(attr.Value?.value)) continue;

                string[] parts = attr.Value.value.Split(';');
                foreach (string part in parts) {
                    if (Guid.TryParse(part.Trim(), out Guid guid)) {
                        counts[guid] = counts.TryGetValue(guid, out int count) ? count + 1 : 1;
                    }
                }
            }
        }
    }

    private static void ScanDatabase(Database database, bool isDevice, List<Vault.CredentialEntry> vault, Dictionary<(string username, string password), Guid> dedup, string origin, ref int created, ref int reused, ref int skipped) {
        foreach (Database.Entry entry in database.dictionary.Values) {
            List<KeyValuePair<string, Database.Attribute>> attributes = new List<KeyValuePair<string, Database.Attribute>>(entry.attributes);
            Dictionary<string, string> valuesByKey = new Dictionary<string, string>();
            foreach (KeyValuePair<string, Database.Attribute> pair in attributes) {
                valuesByKey[pair.Key] = pair.Value?.value ?? String.Empty;
            }

            List<Pair> pairs = new List<Pair>();

            foreach (KeyValuePair<string, Database.Attribute> attr in attributes) {
                if (!attr.Key.Contains("password")) continue;
                if (String.IsNullOrEmpty(attr.Value?.value)) continue;

                string prefix = attr.Key.Replace("password", String.Empty).Trim();
                string usernameKey = prefix.Length > 0 ? $"{prefix} username" : "username";
                string targetAttrName = prefix.Length > 0 ? $"{prefix} credentials" : "credentials";

                if (valuesByKey.TryGetValue(targetAttrName, out string existingTarget) && !String.IsNullOrEmpty(existingTarget)) {
                    skipped++;
                    continue;
                }

                string usernameValue = String.Empty;
                string usernameSourceKey = null;

                if (prefix != "anydesk" && valuesByKey.TryGetValue(usernameKey, out string un) && !String.IsNullOrEmpty(un)) {
                    usernameValue = un;
                    usernameSourceKey = usernameKey;
                }

                pairs.Add(new Pair {
                    passwordKey    = attr.Key,
                    password       = attr.Value.value,
                    usernameKey    = usernameSourceKey,
                    username       = usernameValue,
                    targetAttrName = targetAttrName,
                    prefix         = prefix
                });
            }

            if (pairs.Count == 0) continue;

            Dictionary<string, List<Guid>> guidsByTarget = new Dictionary<string, List<Guid>>();
            ConcurrentDictionary<string, Database.Attribute> modifications = new ConcurrentDictionary<string, Database.Attribute>();

            foreach (Pair pair in pairs) {
                (string, string) dedupKey = (pair.username, pair.password);

                Guid guid;
                if (dedup.TryGetValue(dedupKey, out Guid existingGuid)) {
                    guid = existingGuid;
                    reused++;
                }
                else {
                    string name;
                    if (valuesByKey.TryGetValue("name", out string n) && !String.IsNullOrEmpty(n)) {
                        name = n;
                    }
                    else if (isDevice) {
                        name = valuesByKey.TryGetValue("hostname", out string h) && !String.IsNullOrEmpty(h) ? h
                            : valuesByKey.TryGetValue("ip", out string ip) && !String.IsNullOrEmpty(ip) ? ip
                            : !String.IsNullOrEmpty(pair.username) ? pair.username
                            : "Migrated credential";
                    }
                    else {
                        name = !String.IsNullOrEmpty(pair.username) ? pair.username
                            : "Migrated credential";
                    }

                    if (pair.prefix == "anydesk") {
                        name = $"Anydesk - {name}";
                    }

                    guid = Guid.NewGuid();
                    Vault.CredentialEntry newEntry = new Vault.CredentialEntry {
                        guid     = guid,
                        name     = name,
                        username = pair.username,
                        password = pair.password
                    };

                    vault.Add(newEntry);
                    dedup[dedupKey] = guid;
                    created++;
                }

                if (!guidsByTarget.TryGetValue(pair.targetAttrName, out List<Guid> guidList)) {
                    guidList = new List<Guid>();
                    guidsByTarget[pair.targetAttrName] = guidList;
                }
                if (!guidList.Contains(guid)) guidList.Add(guid);

                //remove previus
                modifications[pair.passwordKey] = new Database.Attribute { value = null };
                /*if (pair.usernameKey is not null) {
                    modifications[pair.usernameKey] = new Database.Attribute { value = null };
                }*/
            }

            long now = DateTime.Now.Ticks;
            foreach (KeyValuePair<string, List<Guid>> target in guidsByTarget) {
                modifications[target.Key] = new Database.Attribute {
                    value  = String.Join(";", target.Value),
                    origin = origin,
                    date   = now
                };
            }

            database.Save(entry.filename, modifications, Database.SaveMethod.merge, origin);
        }
    }
}

using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Text;
using System.Text.Json;

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

    private sealed class MergeRequest {
        public Guid   keep   = Guid.Empty;
        public Guid[] remove = Array.Empty<Guid>();
    }

    //a credential or an ssh key, reduced to what deduplication needs
    private sealed class VaultItem {
        public string                            type;     //"credential" or "sshkey"
        public Guid                              guid;
        public string                            name;
        public string                            username;
        public string                            identity; //equal identities are interchangeable secrets
        public VaultAccessControl.PermissionMode permissionMode;
        public string[]                          permissionList;
    }

    private static List<VaultItem> LoadVaultItems(List<Vault.CredentialEntry> credentials, List<VaultSshKeys.SshKeyEntry> sshKeys) {
        List<VaultItem> items = new List<VaultItem>();

        foreach (Vault.CredentialEntry entry in credentials) {
            items.Add(new VaultItem {
                type           = "credential",
                guid           = entry.guid,
                name           = entry.name,
                username       = entry.username,
                identity       = $"{entry.username}\0{entry.password}",
                permissionMode = entry.permissionMode,
                permissionList = entry.permissionList
            });
        }

        foreach (VaultSshKeys.SshKeyEntry entry in sshKeys) {
            items.Add(new VaultItem {
                type           = "sshkey",
                guid           = entry.guid,
                name           = entry.name,
                username       = entry.username,
                identity       = $"{entry.username}\0{NormalizeKey(entry.privateKey)}\0{entry.passphrase}",
                permissionMode = entry.permissionMode,
                permissionList = entry.permissionList
            });
        }

        return items;
    }

    //the same key pasted from different systems can differ in line endings and surrounding whitespace
    private static string NormalizeKey(string key) {
        return (key ?? String.Empty).Replace("\r\n", "\n").Replace('\r', '\n').Trim();
    }

    //groups credentials with identical username and password, and ssh keys with identical username, private key and passphrase.
    //the most referenced entry of each group is suggested as the one to keep
    public static byte[] FindDuplicates() {
        Dictionary<Guid, int> referenceCounts = CountReferences();
        List<VaultItem> items = LoadVaultItems(Vault.Load(), VaultSshKeys.Load());

        List<List<VaultItem>> groups = items
            .GroupBy(o => (o.type, o.identity))
            .Where(o => o.Count() > 1)
            .Select(o => o.OrderByDescending(e => referenceCounts.GetValueOrDefault(e.guid)).ToList()) //stable, ties keep the vault order
            .ToList();

        StringBuilder builder = new StringBuilder();
        builder.Append('[');

        for (int i = 0; i < groups.Count; i++) {
            if (i > 0) builder.Append(',');

            List<VaultItem> group = groups[i];
            bool permissionsDiffer = group.Any(o => !SamePermissions(o, group[0]));

            builder.Append('{');
            builder.Append($"\"type\":\"{group[0].type}\",");
            builder.Append($"\"keep\":\"{group[0].guid}\",");
            builder.Append($"\"permissionsDiffer\":{(permissionsDiffer ? "true" : "false")},");
            builder.Append("\"entries\":[");
            for (int j = 0; j < group.Count; j++) {
                if (j > 0) builder.Append(',');
                builder.Append('{');
                builder.Append($"\"guid\":\"{group[j].guid}\",");
                builder.Append($"\"name\":\"{Data.EscapeJsonText(group[j].name)}\",");
                builder.Append($"\"username\":\"{Data.EscapeJsonText(group[j].username)}\",");
                builder.Append($"\"uses\":{referenceCounts.GetValueOrDefault(group[j].guid)}");
                builder.Append('}');
            }
            builder.Append("]}");
        }

        builder.Append(']');
        return Encoding.UTF8.GetBytes(builder.ToString());
    }

    private static bool SamePermissions(VaultItem a, VaultItem b) {
        if (a.permissionMode != b.permissionMode) return false;
        if (a.permissionMode == VaultAccessControl.PermissionMode.None) return true;

        HashSet<string> listA = new HashSet<string>(a.permissionList ?? Array.Empty<string>(), StringComparer.OrdinalIgnoreCase);
        return listA.SetEquals(b.permissionList ?? Array.Empty<string>());
    }

    //payload: [{"keep":guid, "remove":[guid, ...]}, ...], credentials and ssh keys alike
    //every device/user reference to a removed entry is pointed to the kept one, then the removed entries are deleted.
    //the kept entry's name and permissions are the ones that remain.
    public static byte[] Deduplicate(HttpListenerContext ctx, string origin) {
        using StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding);
        string payload = reader.ReadToEnd();
        if (String.IsNullOrEmpty(payload)) return Data.CODE_INVALID_ARGUMENT.Array;

        MergeRequest[] requests;
        try {
            requests = JsonSerializer.Deserialize<MergeRequest[]>(payload, new JsonSerializerOptions { IncludeFields = true });
        }
        catch (JsonException) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }
        if (requests is null) return Data.CODE_INVALID_ARGUMENT.Array;

        List<Vault.CredentialEntry> credentials = Vault.Load();
        List<VaultSshKeys.SshKeyEntry> sshKeys = VaultSshKeys.Load();
        Dictionary<Guid, VaultItem> byGuid = LoadVaultItems(credentials, sshKeys).ToDictionary(o => o.guid);

        //removed guid -> kept guid, only for entries that are still identical to the kept one
        Dictionary<Guid, Guid> replace = new Dictionary<Guid, Guid>();
        HashSet<Guid> kept = new HashSet<Guid>();
        List<string> log = new List<string>();

        foreach (MergeRequest request in requests) {
            if (request?.remove is null) continue;
            if (!byGuid.TryGetValue(request.keep, out VaultItem keepItem)) continue;
            if (replace.ContainsKey(request.keep)) continue; //already merged into another entry

            int count = 0;
            foreach (Guid guid in request.remove.Distinct()) {
                if (guid == request.keep) continue;
                if (kept.Contains(guid) || replace.ContainsKey(guid)) continue;
                if (!byGuid.TryGetValue(guid, out VaultItem removeItem)) continue;
                if (removeItem.type != keepItem.type || removeItem.identity != keepItem.identity) continue;

                replace[guid] = request.keep;
                count++;
            }

            if (count == 0) continue;

            kept.Add(request.keep);
            log.Add($"Merge {count} duplicate {(keepItem.type == "sshkey" ? "SSH key(s)" : "credential(s)")} into \"{keepItem.name}\"");
        }

        if (replace.Count == 0) {
            return Encoding.UTF8.GetBytes("{\"merged\":0,\"removed\":0,\"updated\":0}");
        }

        //repoint references first, if this fails midway every reference still resolves
        int updated = 0;
        updated += ReplaceReferences(DatabaseInstances.devices, replace, origin);
        updated += ReplaceReferences(DatabaseInstances.users, replace, origin);

        int removedCredentials = credentials.RemoveAll(o => replace.ContainsKey(o.guid));
        if (removedCredentials > 0) Vault.PersistAll(credentials);

        int removedSshKeys = sshKeys.RemoveAll(o => replace.ContainsKey(o.guid));
        if (removedSshKeys > 0) VaultSshKeys.PersistAll(sshKeys);

        foreach (string message in log) {
            Logger.Action(origin, "Vault", message);
        }

        return Encoding.UTF8.GetBytes($"{{\"merged\":{log.Count},\"removed\":{removedCredentials + removedSshKeys},\"updated\":{updated}}}");
    }

    private static int ReplaceReferences(Database database, Dictionary<Guid, Guid> replace, string origin) {
        int updated = 0;
        long now = DateTime.Now.Ticks;

        foreach (Database.Entry entry in database.dictionary.Values.ToArray()) {
            ConcurrentDictionary<string, Database.Attribute> modifications = new ConcurrentDictionary<string, Database.Attribute>();

            foreach (KeyValuePair<string, Database.Attribute> attr in entry.attributes) {
                if (!attr.Key.Contains("credentials", StringComparison.OrdinalIgnoreCase)) continue;
                if (String.IsNullOrEmpty(attr.Value?.value)) continue;

                bool replaced = false;
                List<string> result = new List<string>();

                foreach (string part in attr.Value.value.Split(';')) {
                    string value = part.Trim();
                    if (value.Length == 0) continue;

                    if (Guid.TryParse(value, out Guid guid) && replace.TryGetValue(guid, out Guid keep)) {
                        value = keep.ToString();
                        replaced = true;
                    }

                    //a device may have referenced both the kept entry and its duplicate
                    if (!result.Contains(value, StringComparer.OrdinalIgnoreCase)) {
                        result.Add(value);
                    }
                }

                if (!replaced) continue;

                modifications[attr.Key] = new Database.Attribute {
                    value  = String.Join("; ", result),
                    origin = origin,
                    date   = now
                };
            }

            if (modifications.IsEmpty) continue;

            database.Save(entry.filename, modifications, Database.SaveMethod.merge, origin);
            updated++;
        }

        return updated;
    }

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

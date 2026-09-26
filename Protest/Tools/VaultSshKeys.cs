using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using Protest.Http;

namespace Protest.Tools;

internal static class VaultSshKeys {
    private static readonly Lock mutex = new Lock();

    //SshKeyEntry uses public fields, not properties - IncludeFields is required or System.Text.Json silently ignores them all
    private static readonly JsonSerializerOptions serializerOptions = new JsonSerializerOptions {
        IncludeFields = true,
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase, allowIntegerValues: false) }
    };

    public sealed class SshKeyEntry {
        public Guid guid;
        public string                            name           = String.Empty;
        public string                            username       = String.Empty;
        public string                            privateKey     = String.Empty;
        public string                            passphrase     = String.Empty;
        public string                            publicKey      = String.Empty;
        public VaultAccessControl.PermissionMode permissionMode = VaultAccessControl.PermissionMode.None;
        public string[]                          permissionList = Array.Empty<string>();
    }

    public static bool IsAllowed(SshKeyEntry entry, string username) {
        if (entry is null) return false;
        return VaultAccessControl.IsAllowed(entry.permissionMode, entry.permissionList, username);
    }

    public static List<SshKeyEntry> Load() {
        if (!File.Exists(Data.FILE_VAULT_SSHKEYS)) return new List<SshKeyEntry>();

        try {
            byte[] bytes;
            lock (mutex) {
                bytes = File.ReadAllBytes(Data.FILE_VAULT_SSHKEYS);
            }

            byte[] plain = Cryptography.Decrypt(bytes, Configuration.DB_KEY, Configuration.DB_KEY_IV);
            List<SshKeyEntry> entries = JsonSerializer.Deserialize<List<SshKeyEntry>>(plain, serializerOptions);
            return entries ?? new List<SshKeyEntry>();
        }
        catch (Exception ex) {
            Logger.Error(ex);
            return new List<SshKeyEntry>();
        }
    }

    private static void Persist(List<SshKeyEntry> entries) {
        byte[] plain = JsonSerializer.SerializeToUtf8Bytes(entries, serializerOptions);
        byte[] cipher = Cryptography.Encrypt(plain, Configuration.DB_KEY, Configuration.DB_KEY_IV);
        lock (mutex) {
            File.WriteAllBytes(Data.FILE_VAULT_SSHKEYS, cipher);
        }
    }

    internal static void PersistAll(List<SshKeyEntry> entries) {
        Persist(entries);
    }

    public static byte[] List() {
        List<SshKeyEntry> entries = Load();
        Dictionary<Guid, int> referenceCounts = VaultMigration.CountReferences();

        StringBuilder builder = new StringBuilder();
        builder.Append('[');

        for (int i = 0; i < entries.Count; i++) {
            if (i > 0) builder.Append(',');

            int uses = referenceCounts.TryGetValue(entries[i].guid, out int count) ? count : 0;

            builder.Append('{');
            builder.Append($"\"guid\":\"{entries[i].guid}\",");
            builder.Append($"\"name\":\"{Data.EscapeJsonText(entries[i].name)}\",");
            builder.Append($"\"username\":\"{Data.EscapeJsonText(entries[i].username)}\",");
            builder.Append($"\"publicKey\":\"{Data.EscapeJsonText(entries[i].publicKey)}\",");
            builder.Append($"\"hasPassphrase\":{(entries[i].passphrase.Length > 0 ? "true" : "false")},");
            builder.Append($"\"uses\":{uses},");
            builder.Append($"\"permissionMode\":{JsonSerializer.Serialize(entries[i].permissionMode, serializerOptions)},");
            builder.Append("\"permissionList\":[");
            for (int j = 0; j < (entries[i].permissionList?.Length ?? 0); j++) {
                if (j > 0) builder.Append(',');
                builder.Append($"\"{Data.EscapeJsonText(entries[i].permissionList[j])}\"");
            }
            builder.Append(']');
            builder.Append('}');
        }

        builder.Append(']');
        return Encoding.UTF8.GetBytes(builder.ToString());
    }

    public static byte[] GetSecret(HttpListenerContext ctx, string username) {
        Dictionary<string, string> parameters = Listener.ParseQuery(ctx);
        if (parameters is null || !parameters.TryGetValue("guid", out string guidString) || !Guid.TryParse(guidString, out Guid guid)) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        SshKeyEntry entry = Load().Find(e => e.guid == guid);
        if (entry is null) return Data.CODE_NOT_FOUND.Array;

        if (!IsAllowed(entry, username)) {
            return Data.CODE_UNAUTHORIZED.Array;
        }

        StringBuilder builder = new StringBuilder();
        builder.Append('{');
        builder.Append($"\"username\":\"{Data.EscapeJsonText(entry.username)}\",");
        builder.Append($"\"privateKey\":\"{Data.EscapeJsonText(entry.privateKey)}\",");
        builder.Append($"\"passphrase\":\"{Data.EscapeJsonText(entry.passphrase)}\",");
        builder.Append($"\"publicKey\":\"{Data.EscapeJsonText(entry.publicKey)}\"");
        builder.Append('}');

        return Encoding.UTF8.GetBytes(builder.ToString());
    }

    public static byte[] Save(HttpListenerContext ctx, string origin) {
        using StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding);
        string payload = reader.ReadToEnd();

        if (String.IsNullOrEmpty(payload)) return Data.CODE_INVALID_ARGUMENT.Array;

        try {
            SshKeyEntry incoming = JsonSerializer.Deserialize<SshKeyEntry>(payload, serializerOptions);
            if (incoming is null) return Data.CODE_INVALID_ARGUMENT.Array;

            incoming.name       ??= String.Empty;
            incoming.username   ??= String.Empty;
            incoming.privateKey ??= String.Empty;
            incoming.passphrase ??= String.Empty;
            incoming.publicKey  ??= String.Empty;

            incoming.permissionList = VaultAccessControl.NormalizePermissionList(incoming.permissionList);

            List<SshKeyEntry> entries = Load();
            SshKeyEntry existing = incoming.guid != Guid.Empty ? entries.Find(e => e.guid == incoming.guid) : null;

            if (existing is not null && incoming.privateKey.Length == 0) {
                incoming.privateKey = existing.privateKey; //keep old value if left blank
                if (incoming.passphrase.Length == 0) incoming.passphrase = existing.passphrase;
            }

            if (incoming.privateKey.Length == 0) {
                return Data.CODE_INVALID_ARGUMENT.Array;
            }

            if (existing is not null) {
                entries.Remove(existing);
            }
            else {
                incoming.guid = Guid.NewGuid();
            }

            entries.Add(incoming);
            Persist(entries);

            Logger.Action(origin, "Vault", $"Save SSH key \"{incoming.name}\"");

            return Encoding.UTF8.GetBytes($"{{\"guid\":\"{incoming.guid}\"}}");
        }
        catch (JsonException) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }
        catch (Exception ex) {
            Logger.Error(ex);
            return Data.CODE_FAILED.Array;
        }
    }

    public static byte[] Delete(HttpListenerContext ctx, string origin) {
        Dictionary<string, string> parameters = Listener.ParseQuery(ctx);
        if (parameters is null || !parameters.TryGetValue("guid", out string guidString) || !Guid.TryParse(guidString, out Guid guid)) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        List<SshKeyEntry> entries = Load();
        int removed = entries.RemoveAll(e => e.guid == guid);
        if (removed == 0) return Data.CODE_NOT_FOUND.Array;

        Persist(entries);
        Logger.Action(origin, "Vault", $"Delete SSH key {guid}");

        return Data.CODE_OK.Array;
    }

    public static bool FromGuid(Guid guid, out SshKeyEntry entry) {
        entry = Load().Find(e => e.guid == guid);
        return entry is not null;
    }
}

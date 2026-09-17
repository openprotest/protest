using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Text;
using System.Text.Json;
using System.Threading;
using Protest.Http;

namespace Protest.Tools;

internal static class Vault {
    private static readonly Lock mutex = new Lock();

    private static readonly JsonSerializerOptions serializerOptions = new JsonSerializerOptions { IncludeFields = true };

    public sealed class CredentialEntry {
        public Guid guid;
        public string name     = String.Empty;
        public string username = String.Empty;
        public string password = String.Empty;
    }

    public static List<CredentialEntry> Load() {
        if (!File.Exists(Data.FILE_VAULT)) return new List<CredentialEntry>();

        try {
            byte[] bytes;
            lock (mutex) {
                bytes = File.ReadAllBytes(Data.FILE_VAULT);
            }

            byte[] plain = Cryptography.Decrypt(bytes, Configuration.DB_KEY, Configuration.DB_KEY_IV);
            List<CredentialEntry> entries = JsonSerializer.Deserialize<List<CredentialEntry>>(plain, serializerOptions);
            return entries ?? new List<CredentialEntry>();
        }
        catch (Exception ex) {
            Logger.Error(ex);
            return new List<CredentialEntry>();
        }
    }

    private static void Persist(List<CredentialEntry> entries) {
        byte[] plain = JsonSerializer.SerializeToUtf8Bytes(entries, serializerOptions);
        byte[] cipher = Cryptography.Encrypt(plain, Configuration.DB_KEY, Configuration.DB_KEY_IV);
        lock (mutex) {
            File.WriteAllBytes(Data.FILE_VAULT, cipher);
        }
    }

    internal static void PersistAll(List<CredentialEntry> entries) {
        Persist(entries);
    }

    public static byte[] List() {
        List<CredentialEntry> entries = Load();
        Dictionary<Guid, int> referenceCounts = VaultMigration.CountReferences();

        StringBuilder builder = new StringBuilder();
        builder.Append('[');

        for (int i = 0; i < entries.Count; i++) {
            if (i > 0) builder.Append(',');

            int strength = entries[i].password.Length > 0 ? (int)PasswordStrength.Entropy(entries[i].password) : 0;
            int uses = referenceCounts.TryGetValue(entries[i].guid, out int count) ? count : 0;

            builder.Append('{');
            builder.Append($"\"guid\":\"{entries[i].guid}\",");
            builder.Append($"\"name\":\"{Data.EscapeJsonText(entries[i].name)}\",");
            builder.Append($"\"username\":\"{Data.EscapeJsonText(entries[i].username)}\",");
            builder.Append($"\"hasPassword\":{(entries[i].password.Length > 0 ? "true" : "false")},");
            builder.Append($"\"strength\":{strength},");
            builder.Append($"\"uses\":{uses}");
            builder.Append('}');
        }

        builder.Append(']');
        return Encoding.UTF8.GetBytes(builder.ToString());
    }

    public static byte[] GetSecret(HttpListenerContext ctx) {
        Dictionary<string, string> parameters = Listener.ParseQuery(ctx);
        if (parameters is null || !parameters.TryGetValue("guid", out string guidString) || !Guid.TryParse(guidString, out Guid guid)) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        CredentialEntry entry = Load().Find(e => e.guid == guid);
        if (entry is null) return Data.CODE_NOT_FOUND.Array;

        //return Encoding.UTF8.GetBytes($"{{\"username\":\"{Data.EscapeJsonText(entry.username)}\",\"password\":\"{Data.EscapeJsonText(entry.password)}\"}}");
        return Encoding.UTF8.GetBytes($"{{\"name\":\"{Data.EscapeJsonText(entry.name)}\",\"username\":\"{Data.EscapeJsonText(entry.username)}\",\"password\":\"{Data.EscapeJsonText(entry.password)}\"}}");
    }

    public static byte[] Save(HttpListenerContext ctx, string origin) {
        using StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding);
        string payload = reader.ReadToEnd();

        if (String.IsNullOrEmpty(payload)) return Data.CODE_INVALID_ARGUMENT.Array;

        try {
            CredentialEntry incoming = JsonSerializer.Deserialize<CredentialEntry>(payload, serializerOptions);
            if (incoming is null) return Data.CODE_INVALID_ARGUMENT.Array;

            incoming.name     ??= String.Empty;
            incoming.username ??= String.Empty;
            incoming.password ??= String.Empty;

            List<CredentialEntry> entries = Load();
            CredentialEntry existing = incoming.guid != Guid.Empty ? entries.Find(e => e.guid == incoming.guid) : null;

            if (existing is not null && incoming.password.Length == 0) {
                incoming.password = existing.password; //keep old value if left blank
            }

            if (incoming.username.Length == 0 && incoming.password.Length == 0) {
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

            Logger.Action(origin, "Vault", $"Save credential \"{incoming.name}\"");

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

        List<CredentialEntry> entries = Load();
        int removed = entries.RemoveAll(e => e.guid == guid);
        if (removed == 0) return Data.CODE_NOT_FOUND.Array;

        Persist(entries);
        Logger.Action(origin, "Vault", $"Delete credential {guid}");

        return Data.CODE_OK.Array;
    }

    public static bool FromGuid(Guid guid, out CredentialEntry entry) {
        entry = Load().Find(e => e.guid == guid);
        return entry is not null;
    }
}

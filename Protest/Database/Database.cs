#if !DEBUG && NET7_0_OR_GREATER
//#define DEFLATE
#define BROTLI
# endif

using System.IO;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Text;
using System.Text.Json;
using System.Net;
using Protest.Http;

namespace Protest;

public sealed class Database {
    public enum SaveMethod {
        ignore = 0,
        createnew = 1,
        overwrite = 2,
        append = 3,
        merge = 4
    }

    public record Attribute {
        public string value;
        public string origin;
        public long date; //utc
    }

    public record Entry {
        public string filename;
        public ConcurrentDictionary<string, Attribute> attributes;
        public object mutex;
    }

    public readonly ConcurrentDictionary<string, Entry> dictionary;
    private readonly string name;
    private readonly string location;

    internal long version = 0;
    private long lastCachedVersion = -1;
    private Cache.Entry lastCached;

    private readonly JsonSerializerOptions databaseSerializerOptions;
    private readonly JsonSerializerOptions attrubutesSerializerOptions;
    private readonly JsonSerializerOptions attrubutesSerializerOptionsWithPassword;
    private readonly JsonSerializerOptions contactsSerializerOptions;

    public Database(string name, string location) {
        this.name = name;
        this.location = location;
        dictionary = new ConcurrentDictionary<string, Entry>();

        databaseSerializerOptions = new JsonSerializerOptions();
        attrubutesSerializerOptions = new JsonSerializerOptions();
        attrubutesSerializerOptionsWithPassword = new JsonSerializerOptions();
        contactsSerializerOptions = new JsonSerializerOptions();

        databaseSerializerOptions.Converters.Add(new DatabaseJsonConverter(name, location, true));
        attrubutesSerializerOptions.Converters.Add(new AttributesJsonConverter(true));
        attrubutesSerializerOptionsWithPassword.Converters.Add(new AttributesJsonConverter(false));
        contactsSerializerOptions.Converters.Add(new ContactsJsonConverter());

        ReadAll();
    }

    public static string GenerateFilename(int offset=0) {
        return (DateTime.UtcNow.Ticks + offset).ToString("x");
    }

    private void ReadAll() {
        DirectoryInfo dir = new DirectoryInfo(location);
        if (!dir.Exists) return;

        bool successful = false;
        FileInfo[] files = dir.GetFiles();

        for (int i = 0; i < files.Length; i++) {
            Entry entry = Read(files[i], attrubutesSerializerOptionsWithPassword);
            if (entry is null) continue;

            dictionary.Remove(files[i].Name, out _);
            dictionary.TryAdd(files[i].Name, entry);
            successful = true;
        }

        if (successful) {
            version = DateTime.UtcNow.Ticks;
        }
    }

    private static Entry Read(FileInfo file, JsonSerializerOptions serializerOptions) {
        try {
            byte[] bytes = File.ReadAllBytes(file.FullName);
            byte[] plain = Cryptography.Decrypt(bytes, Configuration.DB_KEY, Configuration.DB_KEY_IV);

            ConcurrentDictionary<string, Attribute> attributes = JsonSerializer.Deserialize<ConcurrentDictionary<string, Attribute>>(plain, serializerOptions);

            return new Entry {
                filename = file.Name,
                attributes = attributes,
                mutex = new object()
            };
        }
        catch (Exception ex) {
            Logger.Error(ex);
            return null;
        }
    }

    private bool Write(Entry entry) {
        string filename = $"{location}{Data.DELIMITER}{entry.filename}";

        byte[] plain = JsonSerializer.SerializeToUtf8Bytes(entry.attributes, attrubutesSerializerOptionsWithPassword);
        byte[] cipher = Cryptography.Encrypt(plain, Configuration.DB_KEY, Configuration.DB_KEY_IV);

        try {
            lock (entry.mutex) {
                File.WriteAllBytes(filename, cipher);
            }
        }
        catch (Exception ex) {
            Logger.Error(ex);
            return false;
        }

        return true;
    }

    public bool Delete(string file, string origin) {
        if (!dictionary.ContainsKey(file)) {
            return false;
        }

        if (!dictionary.Remove(file, out _)) {
            return false;
        }

        try {
            File.Delete($"{location}{Data.DELIMITER}{file}");
        }
        catch (Exception ex) {
            Logger.Error(ex);
            return false;
        }

        Logger.Action(origin, $"Delete entry from {this.name} database: {file}");

        version = DateTime.UtcNow.Ticks;

        StringBuilder broadcastMessage = new StringBuilder();
        broadcastMessage.Append('{');
        broadcastMessage.Append("\"action\":\"delete\",");
        broadcastMessage.Append($"\"type\":\"{Data.EscapeJsonText(this.name)}\",");
        broadcastMessage.Append($"\"target\":\"{file}\",");
        broadcastMessage.Append($"\"origin\":\"{origin}\",");
        broadcastMessage.Append($"\"version\":\"{version}\"");
        broadcastMessage.Append('}');

        KeepAlive.Broadcast(Encoding.UTF8.GetBytes(broadcastMessage.ToString()), $"/db/{this.name}/list");

        return true;
    }

    public bool Delete(Entry entry, string origin) {
        return Delete(entry.filename, origin);
    }

    public bool Save(string file, ConcurrentDictionary<string, Attribute> modifications, SaveMethod method, string origin) {
        if (String.IsNullOrEmpty(file)) {
            file = GenerateFilename();
        }

        bool exist = dictionary.ContainsKey(file);
        if (!exist) method = SaveMethod.createnew;

        dictionary.Remove(file, out Entry oldEntry);

        long lastModTimestamp = 0;
        if (oldEntry is not null) {
            foreach (Attribute attr in oldEntry.attributes.Values) {
                lastModTimestamp = Math.Max(lastModTimestamp, attr.date);
            }

            //if password is empty-string, keep old value
            foreach (KeyValuePair<string, Attribute> pair in modifications) {
                if (pair.Key.Contains("password", StringComparison.OrdinalIgnoreCase) &&
                    String.IsNullOrEmpty(pair.Value.value) &&
                    oldEntry.attributes.TryGetValue(pair.Key, out Attribute oldPassword)) {
                    modifications[pair.Key] = oldPassword;
                }
            }

            if (lastModTimestamp > 0) { //create timeline
                try {
                    DirectoryInfo timelineDir = new DirectoryInfo($"{location}{Data.DELIMITER}{file}_");
                    if (!timelineDir.Exists) {
                        timelineDir.Create();
                    }

                    byte[] plain = JsonSerializer.SerializeToUtf8Bytes(oldEntry.attributes, attrubutesSerializerOptions); //remove password from timeline
                    byte[] cipher = Cryptography.Encrypt(plain, Configuration.DB_KEY, Configuration.DB_KEY_IV);
                    File.WriteAllBytes($"{timelineDir.FullName}{Data.DELIMITER}{lastModTimestamp}", cipher);
                }
                catch (Exception ex) {
                    Logger.Error($"Failed to create timeline object for {file}.\n{ex.Message}");
                }
            }
        }

        Entry newEntry = method switch {
            //SaveMethod.ignore    => null,
            SaveMethod.createnew => SaveNew(file, modifications, origin),                 //keep the old file, create new
            SaveMethod.overwrite => SaveOverwrite(file, modifications, oldEntry, origin), //ignore previous attributes
            SaveMethod.append    => SaveAppend(file, modifications, oldEntry, origin),    //append new attributes
            SaveMethod.merge     => SaveMerge(file, modifications, oldEntry, origin),     //merge all attributes
            _ => null
        };

        if (newEntry is null) return true;

        dictionary.TryAdd(file, newEntry);

        version = DateTime.UtcNow.Ticks;

        StringBuilder broadcastMessage = new StringBuilder();
        broadcastMessage.Append('{');
        broadcastMessage.Append("\"action\":\"update\",");
        broadcastMessage.Append($"\"type\":\"{Data.EscapeJsonText(name)}\",");
        broadcastMessage.Append($"\"target\":\"{Data.EscapeJsonText(file)}\",");
        broadcastMessage.Append($"\"origin\":\"{Data.EscapeJsonText(origin)}\",");
        broadcastMessage.Append($"\"version\":\"{version}\",");

        broadcastMessage.Append("\"obj\":");
        broadcastMessage.Append(JsonSerializer.Serialize(newEntry.attributes, attrubutesSerializerOptions));

        broadcastMessage.Append('}');

        KeepAlive.Broadcast(Encoding.UTF8.GetBytes(broadcastMessage.ToString()), $"/db/{this.name}/list");

        //new Thread(() => { Write(newEntry); }).Start();
        //return true;
        return Write(newEntry);
    }

    private Entry SaveNew(string file, ConcurrentDictionary<string, Attribute> modifications, string origin) {
        Entry newEntry = new Entry() {
            filename = dictionary.ContainsKey(file) ? GenerateFilename(1) : file,
            attributes = modifications,
            mutex = new object()
        };

        Logger.Action(origin, $"Create new entry on {this.name} database: {file}");
        return newEntry;
    }
    private Entry SaveOverwrite(string file, ConcurrentDictionary<string, Attribute> modifications, Entry oldEntry, string origin) {
        //dictionary.Remove(file, out Entry oldEntry);

        //keep old origin and date, if data didn't change
        foreach (KeyValuePair<string, Attribute> pair in modifications) {
            if (!oldEntry.attributes.ContainsKey(pair.Key)) continue;
            if (oldEntry.attributes[pair.Key].value != pair.Value.value) continue;
            pair.Value.origin = oldEntry.attributes[pair.Key].origin;
            pair.Value.date = oldEntry.attributes[pair.Key].date;
        }

        oldEntry.attributes = modifications;

        Logger.Action(origin, $"Modify entry on {this.name} database: {file}");
        return oldEntry;
    }
    private Entry SaveAppend(string file, ConcurrentDictionary<string, Attribute> modifications, Entry oldEntry, string origin) {
        //dictionary.Remove(file, out Entry oldEntry);

        foreach (KeyValuePair<string, Attribute> pair in modifications) {
            if (!oldEntry.attributes.ContainsKey(pair.Key)) {
                oldEntry.attributes.TryAdd(pair.Key, pair.Value);
            }
        }

        Logger.Action(origin, $"Modify entry on {this.name} database: {file}");
        return oldEntry;
    }
    private Entry SaveMerge(string file, ConcurrentDictionary<string, Attribute> modifications, Entry oldEntry, string origin) {
        //dictionary.Remove(file, out Entry oldEntry);

        foreach (KeyValuePair<string, Attribute> pair in oldEntry.attributes) {
            if (!modifications.ContainsKey(pair.Key)) {
                modifications.TryAdd(pair.Key, pair.Value);
            }
        }

        oldEntry.attributes = modifications;

        Logger.Action(origin, $"Modify entry on {this.name} database: {file}");
        return oldEntry;
    }

    public Entry GetEntry(string file) {
        if (dictionary.TryGetValue(file, out Entry entry)) return entry;
        return null;
    }

    public byte[] GridHandler(HttpListenerContext ctx, string origin) {
        try {
            string payload;
            using StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding);
            payload = reader.ReadToEnd();

#pragma warning disable CA1869 //Cache and reuse
            JsonSerializerOptions options = new JsonSerializerOptions();
#pragma warning restore CA1869
            options.Converters.Add(new GridDataConverter(origin));

            Dictionary<string, ConcurrentDictionary<string, Attribute>> mods = JsonSerializer.Deserialize<Dictionary<string, ConcurrentDictionary<string, Attribute>>>(payload, options);

            foreach (KeyValuePair<string, ConcurrentDictionary<string, Attribute>> pair in mods) {
                Save(pair.Key, pair.Value, SaveMethod.merge, origin);
            }
        }
        catch (Exception ex) {
            Logger.Error(ex);
            return Encoding.UTF8.GetBytes($"{{\"error\":\"{Data.EscapeJsonText(ex.Message)}\"}}");
        }

        return Data.CODE_OK.Array;
    }

    public byte[] SaveHandler(HttpListenerContext ctx, Dictionary<string, string> parameters, string origin) {
        try {
            string file;
            if (parameters is not null) {
                parameters!.TryGetValue("file", out file);
            }
            else {
               file = GenerateFilename();
            }

            string payload;
            using StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding);
            payload = reader.ReadToEnd();

            if (String.IsNullOrEmpty(payload)) return Data.CODE_INVALID_ARGUMENT.Array;

            ConcurrentDictionary<string, Attribute> modifications = JsonSerializer.Deserialize<ConcurrentDictionary<string, Attribute>>(payload, attrubutesSerializerOptionsWithPassword);

            long date = DateTime.UtcNow.Ticks;

            foreach (KeyValuePair<string, Attribute> pair in modifications) {
                pair.Value.origin = origin;
                pair.Value.date = date;
            }

            if (Save(file, modifications, SaveMethod.overwrite, origin)) {
                return Encoding.UTF8.GetBytes($"{{\"status\":\"ok\", \"filename\":\"{Data.EscapeJsonText(file)}\"}}");
            }

            return Data.CODE_FAILED.Array;
        }
        catch (Exception ex) {
            Logger.Error(ex);
            return null;
        }
    }

    public byte[] DeleteHandler(Dictionary<string, string> parameters, string origin) {
        if (parameters is null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        parameters!.TryGetValue("file", out string file);
        if (file is null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        if (Delete(file, origin)) {
            return Data.CODE_OK.Array;
        }
        else {
            return Data.CODE_FILE_NOT_FOUND.Array;
        }
    }

    public byte[] TimelineHandler(Dictionary<string, string> parameters) {
        if (parameters is null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        parameters.TryGetValue("file", out string file);

        if (file is null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        string fullname = $"{location}{Data.DELIMITER}{file}";
        StringBuilder builder = new StringBuilder();

        try {
            DirectoryInfo timelineDir = new DirectoryInfo($"{fullname}_");
            if (!timelineDir.Exists) return Data.CODE_FILE_NOT_FOUND.Array;

            builder.Append('{');

            FileInfo[] files = timelineDir.GetFiles();
            for (int i = 0; i < files.Length; i++) {
                if (i > 0) builder.Append(',');
                builder.Append($"\"{Data.EscapeJsonText(files[i].Name)}\":");

                try {
                    byte[] bytes = File.ReadAllBytes(files[i].FullName);
                    string plain = Encoding.UTF8.GetString(Cryptography.Decrypt(bytes, Configuration.DB_KEY, Configuration.DB_KEY_IV));
                    builder.Append(plain);
                }
                catch {
                    builder.Append("null");
                }
            }
            builder.Append('}');
        }
        catch { }

        return Encoding.UTF8.GetBytes(builder.ToString());
    }

    public byte[] Serialize(HttpListenerContext ctx) {
        string acceptEncoding = ctx.Request.Headers.Get("Accept-Encoding")?.ToLower() ?? String.Empty;
        bool acceptGZip = acceptEncoding.Contains("gzip");

        Cache.Entry entry;
        if (lastCachedVersion == version) {
            entry = this.lastCached;
        }
        else {
            byte[] bytes = JsonSerializer.SerializeToUtf8Bytes(this, databaseSerializerOptions);

            entry = new Cache.Entry {
                bytes = bytes,
                gzip = Cache.GZip(bytes),
#if BROTLI
                brotli = Cache.Brotli(bytes),
#endif

#if DEFLATE
                deflate = Cache.Deflate(bytes),
#endif
            };

            this.lastCached = entry;
            lastCachedVersion = version;
        }

        ctx.Response.ContentType = "application/json; charset=utf-8";

#if BROTLI
        bool acceptBrotli = acceptEncoding.Contains("br");
        if (acceptBrotli) {
            ctx.Response.AddHeader("Content-Encoding", "br");
            return entry.brotli;
        }
#endif

#if DEFLATE
        bool acceptDeflate = acceptEncoding.Contains("deflate");
        if (acceptDeflate) {
            ctx.Response.AddHeader("Content-Encoding", "deflate");
            return entry.deflate;
        }
#endif

        if (acceptGZip) { //gzip
            ctx.Response.AddHeader("Content-Encoding", "gzip");
            return entry.gzip;
        }

        return entry.bytes;
    }

    public byte[] SerializeContacts() {
        return JsonSerializer.SerializeToUtf8Bytes(this, contactsSerializerOptions);
    }

    public byte[] AttributeValue(Dictionary<string, string> parameters) {
        if (parameters is null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        parameters.TryGetValue("file", out string file);
        parameters.TryGetValue("attribute", out string attribute);

        if (file is null || attribute is null) return null;

        return GetAttributeValue(file, attribute);
    }
    public byte[] GetAttributeValue(string file, string attributeName) {
        if (String.IsNullOrEmpty(file)) return null;
        if (String.IsNullOrEmpty(attributeName)) return null;

        file = Uri.UnescapeDataString(file);
        attributeName = Uri.UnescapeDataString(attributeName);

        dictionary.TryGetValue(file, out Entry entry);
        if (entry is null) return null;

        if (entry.attributes.TryGetValue(attributeName, out Attribute value)) return Encoding.UTF8.GetBytes(value.value);

        return null;
    }
}
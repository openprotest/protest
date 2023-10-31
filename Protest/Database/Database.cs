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
        public string initiator;
        public long date; //utc
    }

    public record Entry {
        public string filename;
        public SynchronizedDictionary<string, Attribute> attributes;
        public object syncWrite;
    }

    public readonly ConcurrentDictionary<string, Entry> dictionary;
    private readonly string name;
    private readonly string location;

    internal long version = 0;
    private long lastCachedVersion = -1;
    private Cache.Entry lastCached;

    public Database(string name, string location) {
        this.name = name;
        this.location = location;
        dictionary = new ConcurrentDictionary<string, Entry>();
        ReadAll();
    }

    public static string GenerateFilename(int offset = 0) {
        return (DateTime.UtcNow.Ticks + offset).ToString("x");
    }

    private void ReadAll() {
        DirectoryInfo dir = new DirectoryInfo(location);
        if (!dir.Exists) return;

        bool successful = false;
        FileInfo[] files = dir.GetFiles();

        JsonSerializerOptions options = new JsonSerializerOptions();
        options.Converters.Add(new AttributesJsonConverter(false));

        for (int i = 0; i < files.Length; i++) {
            Entry entry = Read(files[i], options);
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

            return new Entry {
                filename = file.Name,
                attributes = JsonSerializer.Deserialize<SynchronizedDictionary<string, Attribute>>(plain, serializerOptions),
                syncWrite = new object()
            };
        }
        catch (Exception ex) {
            Logger.Error(ex);
            return null;
        }
    }

    private bool Write(Entry entry) {
        string filename = $"{location}{Data.DELIMITER}{entry.filename}";

        JsonSerializerOptions options = new JsonSerializerOptions();
        options.Converters.Add(new AttributesJsonConverter(false));

        byte[] plain = JsonSerializer.SerializeToUtf8Bytes(entry.attributes, options);
        byte[] cipher = Cryptography.Encrypt(plain, Configuration.DB_KEY, Configuration.DB_KEY_IV);

        try {
            lock (entry.syncWrite) {
                File.WriteAllBytes(filename, cipher);
            }
        }
        catch (Exception ex) {
            Logger.Error(ex);
            return false;
        }

        return true;
    }

    public bool Delete(string file, string initiator) {
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

        Logger.Action(initiator, $"Delete entry from {this.name} database: {file}");

        version = DateTime.UtcNow.Ticks;

        StringBuilder broadcastMessage = new StringBuilder();
        broadcastMessage.Append('{');
        broadcastMessage.Append("\"action\":\"delete\",");
        broadcastMessage.Append($"\"type\":\"{Data.EscapeJsonText(this.name)}\",");
        broadcastMessage.Append($"\"target\":\"{file}\",");
        broadcastMessage.Append($"\"initiator\":\"{initiator}\",");
        broadcastMessage.Append($"\"version\":\"{version}\"");
        broadcastMessage.Append('}');

        KeepAlive.Broadcast(Encoding.UTF8.GetBytes(broadcastMessage.ToString()), $"/db/{this.name}/list");

        return true;
    }

    public bool Delete(Entry entry, string initiator) {
        return Delete(entry.filename, initiator);
    }

    public bool Save(string file, SynchronizedDictionary<string, Attribute> modifications, SaveMethod method, string initiator) {
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

            //if password is null, keep old value
            foreach (KeyValuePair<string, Attribute> pair in modifications) {
                if (pair.Key.Contains("password") &&
                    pair.Value.value.Length == 0 &&
                    oldEntry.attributes.ContainsKey(pair.Key)) {
                    modifications[pair.Key] = oldEntry.attributes[pair.Key];
                }
            }

            if (lastModTimestamp > 0) { //create timeline
                try {
                    //remove passwords
                    List<string> toRemove = new List<string>();
                    foreach (KeyValuePair<string, Attribute> pair in oldEntry.attributes) {
                        if (pair.Key.Contains("password"))
                            toRemove.Add(pair.Key);
                    }
                    for (int i = 0; i < toRemove.Count; i++) {
                        oldEntry.attributes.Remove(toRemove[i]);
                    }

                    DirectoryInfo timelineDir = new DirectoryInfo($"{location}{Data.DELIMITER}{file}_");
                    if (!timelineDir.Exists) timelineDir.Create();

                    JsonSerializerOptions options = new JsonSerializerOptions();
                    options.Converters.Add(new AttributesJsonConverter(false));

                    byte[] plain = JsonSerializer.SerializeToUtf8Bytes(oldEntry.attributes, options);
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
            SaveMethod.createnew => SaveNew(file, modifications, initiator),                 //keep the old file, create new
            SaveMethod.overwrite => SaveOverwrite(file, modifications, oldEntry, initiator), //ignore previous attributes
            SaveMethod.append    => SaveAppend(file, modifications, oldEntry, initiator),    //append new attributes
            SaveMethod.merge     => SaveMerge(file, modifications, oldEntry, initiator),     //merged all attributes
            _ => null,
        };

        if (newEntry is null) return true;

        dictionary.TryAdd(file, newEntry);

        version = DateTime.UtcNow.Ticks;

        StringBuilder broadcastMessage = new StringBuilder();
        broadcastMessage.Append('{');
        broadcastMessage.Append("\"action\":\"update\",");
        broadcastMessage.Append($"\"type\":\"{Data.EscapeJsonText(name)}\",");
        broadcastMessage.Append($"\"target\":\"{Data.EscapeJsonText(file)}\",");
        broadcastMessage.Append($"\"initiator\":\"{Data.EscapeJsonText(initiator)}\",");
        broadcastMessage.Append($"\"version\":\"{version}\",");

        broadcastMessage.Append("\"obj\":");
        JsonSerializerOptions options2 = new JsonSerializerOptions();
        options2.Converters.Add(new AttributesJsonConverter(true));
        broadcastMessage.Append(JsonSerializer.Serialize(newEntry.attributes, options2));

        broadcastMessage.Append('}');

        KeepAlive.Broadcast(Encoding.UTF8.GetBytes(broadcastMessage.ToString()), $"/db/{this.name}/list");

        //new Thread(() => { Write(newEntry); }).Start();
        //return true;
        return Write(newEntry);
    }

    private Entry SaveNew(string file, SynchronizedDictionary<string, Attribute> modifications, string initiator) {
        Entry newEntry = new Entry() {
            filename = dictionary.ContainsKey(file) ? GenerateFilename(1) : file,
            attributes = modifications,
            syncWrite = new object()
        };

        Logger.Action(initiator, $"Create new entry on {this.name} database: {file}");
        return newEntry;
    }
    private Entry SaveOverwrite(string file, SynchronizedDictionary<string, Attribute> modifications, Entry oldEntry, string initiator) {
        //dictionary.Remove(file, out Entry oldEntry);

        //keep old initiator and date, if data didn't change
        foreach (KeyValuePair<string, Attribute> pair in modifications) {
            if (!oldEntry.attributes.ContainsKey(pair.Key)) continue;
            if (pair.Value.value != oldEntry.attributes[pair.Key].value) continue;
            pair.Value.initiator = oldEntry.attributes[pair.Key].initiator;
            pair.Value.date = oldEntry.attributes[pair.Key].date;
        }

        oldEntry.attributes = modifications;

        Logger.Action(initiator, $"Modify entry on {this.name} database: {file}");
        return oldEntry;
    }
    private Entry SaveAppend(string file, SynchronizedDictionary<string, Attribute> modifications, Entry oldEntry, string initiator) {
        //dictionary.Remove(file, out Entry oldEntry);

        foreach (KeyValuePair<string, Attribute> pair in modifications) {
            if (!oldEntry.attributes.ContainsKey(pair.Key)) {
                oldEntry.attributes.TryAdd(pair.Key, pair.Value);
            }
        }

        Logger.Action(initiator, $"Modify on entry {this.name} database: {file}");
        return oldEntry;
    }
    private Entry SaveMerge(string file, SynchronizedDictionary<string, Attribute> modifications, Entry oldEntry, string initiator) {
        //dictionary.Remove(file, out Entry oldEntry);

        foreach (KeyValuePair<string, Attribute> pair in oldEntry.attributes) {
            if (!modifications.ContainsKey(pair.Key)) {
                modifications.TryAdd(pair.Key, pair.Value);
            }
        }

        oldEntry.attributes = modifications;

        Logger.Action(initiator, $"Modify entry on {this.name} database: {file}");
        return oldEntry;
    }

    public Entry GetEntry(string file) {
        if (dictionary.TryGetValue(file, out Entry entry)) return entry;
        return null;
    }

    public byte[] GridHandler(HttpListenerContext ctx, string initiator) {
        try {
            string payload;
            using StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding);
            payload = reader.ReadToEnd();
        
            JsonSerializerOptions options = new JsonSerializerOptions();
            options.Converters.Add(new GridDataConverter(initiator));
            
            Dictionary<string, SynchronizedDictionary<string, Attribute>> mods = JsonSerializer.Deserialize<Dictionary<string, SynchronizedDictionary<string, Attribute>>>(payload, options);

            foreach (KeyValuePair<string, SynchronizedDictionary<string, Attribute>> pair in mods) {
                Save(pair.Key, pair.Value, SaveMethod.merge, initiator);
            }
        }
        catch (Exception ex) {
            Logger.Error(ex);
            return Encoding.UTF8.GetBytes($"{{\"error\":\"{Data.EscapeJsonText(ex.Message)}\"}}");
        }

        return Data.CODE_OK.Array;
    }

    public byte[] SaveHandler(HttpListenerContext ctx, Dictionary<string, string> parameters, string initiator) {
        if (parameters is null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        parameters!.TryGetValue("file", out string file);
        file ??= GenerateFilename();

        string payload;
        using StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding);
        payload = reader.ReadToEnd();

        if (String.IsNullOrEmpty(payload)) return Data.CODE_INVALID_ARGUMENT.Array;

        JsonSerializerOptions options = new JsonSerializerOptions();
        options.Converters.Add(new AttributesJsonConverter(false));
        SynchronizedDictionary<string, Attribute> modifications = JsonSerializer.Deserialize<SynchronizedDictionary<string, Attribute>>(payload, options);

        long date = DateTime.UtcNow.Ticks;

        foreach (KeyValuePair<string, Attribute> pair in modifications) {
            pair.Value.initiator = initiator;
            pair.Value.date = date;
        }

        if (Save(file, modifications, SaveMethod.overwrite, initiator)) {
            return Encoding.UTF8.GetBytes($"{{\"status\":\"ok\", \"filename\":\"{Data.EscapeJsonText(file)}\"}}");
        }

        return Data.CODE_FAILED.Array;
    }

    public byte[] DeleteHandler(Dictionary<string, string> parameters, string initiator) {
        if (parameters is null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        parameters!.TryGetValue("file", out string file);
        if (file is null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        if (Delete(file, initiator)) {
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
            JsonSerializerOptions options = new JsonSerializerOptions();
            options.Converters.Add(new DatabaseJsonConverter(name, location, true));

            byte[] bytes = JsonSerializer.SerializeToUtf8Bytes(this, options);

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
        JsonSerializerOptions options = new JsonSerializerOptions();
        options.Converters.Add(new ContactsJsonConverter());

        return JsonSerializer.SerializeToUtf8Bytes(this, options);
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
#if !DEBUG && NET7_0_OR_GREATER
//#define DEFLATE
#define BROTLI
#endif

//#define SVG_TO_SVGZ
#define SVG_TO_LIGHT

using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Text;
using System.Threading;

namespace Protest.Http;

internal sealed class Cache {
    public struct Entry {
        public byte[] bytes;
        public byte[] gzip;
#if DEFLATE
        public byte[] deflate;
#endif
#if BROTLI
        public byte[] brotli;
#endif
        public string contentType;
        public KeyValuePair<string, string>[] headers;
    }

#if DEBUG
    private long _raw = 0, _brotli = 0, _deflate = 0, _gzip = 0;
#endif

    //public const uint CACHE_CONTROL_MAX_AGE = 86_400; //24h
    public const uint CACHE_CONTROL_MAX_AGE = 15_768_000; //6m

    private readonly static Dictionary<string, string> CONTENT_TYPE = new Dictionary<string, string>() {
        {"htm",  "text/html; charset=utf-8"},
        {"html", "text/html; charset=utf-8"},
        {"css",  "text/css; charset=utf-8"},

        {"txt",  "text/plain; charset=utf-8"},
        {"text", "text/plain; charset=utf-8"},
        {"log",  "text/plain; charset=utf-8"},
        {"csv",   "text/csv; charset=utf-8"},
        {"xml",   "text/xml; charset=utf-8"},
        {"vcf",   "text/vcard; charset=utf-8"},
        {"vcard", "text/vcard; charset=utf-8"},

        {"ico",  "image/x-icon"},
        //{"cur",  "application/octet-stream"},
        //{"bmp",  "image/bmp"},
        //{"gif",  "image/gif"},
        //{"tif",  "image/tiff"},
        //{"tiff", "image/tiff"},
        {"png",  "image/png"},
        {"jpg",  "image/jpeg"},
        {"jpe",  "image/jpeg"},
        {"jpeg", "image/jpeg"},
        {"webp", "image/webp"},
        {"svg",  "image/svg+xml; charset=utf-8"},
        {"svgz", "image/svg+xml; charset=utf-8"},

        {"otf",  "font/otf"},
        {"ttf",  "font/ttf"},

        {"js",   "application/javascript; charset=utf-8"},
        {"json", "application/json; charset=utf-8"},
        {"zip",  "application/application/zip"},
        //{"7z",  "application/x-7z-compressed"},
        //{"rar",  "application/x-rar-compressed"}
    };

    private string birthdate;
    private readonly string path;

    public readonly ConcurrentDictionary<string, Entry> cache = new ConcurrentDictionary<string, Entry>();

    public Cache(string path) {
        birthdate = DateTime.UtcNow.ToString(Data.DATETIME_FORMAT);
        this.path = path;
#if !DEBUG
        LoadStatic();
#endif
        LoadFiles();

#if DEBUG
        Console.WriteLine("Front-end cache:");
        if (_gzip > 0)    { Console.WriteLine($"  GZip    : {100 * _gzip / (_raw + 1),5}% {_raw,10} -> {_gzip,8}"); }
        if (_deflate > 0) { Console.WriteLine($"  Deflate : {100 * _deflate / (_raw + 1),5}% {_raw,10} -> {_deflate,8}"); }
        if (_brotli > 0)  { Console.WriteLine($"  Brotli  : {100 * _brotli / (_raw + 1),5}% {_raw,10} -> {_brotli,8}"); }
        Console.WriteLine();
        
        if (Directory.Exists(path)) {
            FileSystemWatcher watcher = new FileSystemWatcher(path);
            watcher.EnableRaisingEvents = true;
            watcher.NotifyFilter = NotifyFilters.FileName | NotifyFilters.DirectoryName | NotifyFilters.LastWrite;
            watcher.Filter = "*";
            watcher.IncludeSubdirectories = true;
            watcher.Changed += OnFileChanged;
        }
#endif

        GC.Collect();
    }

    private void OnFileChanged(object source, FileSystemEventArgs e) {
        Console.WriteLine($"Reloading: {e.FullPath}");

        new Thread(() => {
            Thread.Sleep(250);

            FileInfo file = new FileInfo(e.FullPath);
            if (!file.Exists) {
                return;
            }

            try {
                using FileStream fs = new FileStream(file.FullName, FileMode.Open, FileAccess.Read);
                using BinaryReader br = new BinaryReader(fs);
                byte[] bytes = br.ReadBytes((int)file.Length);

                string name = file.FullName;
                name = name.Replace(path, String.Empty);
                name = name.Replace("\\", "/");

                HandleFile(name, bytes, false);
            }
            catch {
                return;
            }

            birthdate = DateTime.UtcNow.ToString(Data.DATETIME_FORMAT);

            KeepAlive.Broadcast(KeepAlive.MSG_FORCE_RELOAD.ToArray(), "/");
        }).Start();
    }

#if !DEBUG
    private void LoadStatic() {
        HandleFiles(Http.StaticCacheSerialization.cache, true);
    }
#endif
    private bool LoadFiles() {
        DirectoryInfo dir = new DirectoryInfo(path);
        if (!dir.Exists) return false;

        Dictionary<string, byte[]> files = new Dictionary<string, byte[]>();

        foreach (FileInfo f in dir.GetFiles()) {
            LoadFile(f, files);
        }

        foreach (DirectoryInfo d in dir.GetDirectories()) {
            foreach (FileInfo f in d.GetFiles()) {
                LoadFile(f, files);
            }
        }

        HandleFiles(files, false);

        return true;
    }

    private void LoadFile(FileInfo f, Dictionary<string, byte[]> files) {
        string name = f.FullName;
        name = name.Replace(path, String.Empty);
        name = name.Replace("\\", "/");

        using FileStream fs = new FileStream(f.FullName, FileMode.Open, FileAccess.Read);
        using BinaryReader br = new BinaryReader(fs);

        byte[] bytes = br.ReadBytes((int)f.Length);

#if !DEBUG
        if (String.Equals(f.Extension, ".htm", StringComparison.OrdinalIgnoreCase) ||
            String.Equals(f.Extension, ".html", StringComparison.OrdinalIgnoreCase) ||
            String.Equals(f.Extension, ".svg", StringComparison.OrdinalIgnoreCase) ||
            String.Equals(f.Extension, ".css", StringComparison.OrdinalIgnoreCase) ||
            String.Equals(f.Extension, ".js", StringComparison.OrdinalIgnoreCase)) {
            bytes = Minify(bytes, false);
        }
#endif

        files.Add(name, bytes);
    }

    private void HandleFiles(Dictionary<string, byte[]> files, bool isGzipped) {
#if SVG_TO_SVGZ //svgz
        Dictionary<string, byte[]> toSvg = new Dictionary<string, byte[]>();
#endif

        foreach (KeyValuePair<string, byte[]> pair in files) {
            if (pair.Value is null) {
                continue;
            }

            HandleFile(pair.Key.ToLower(), pair.Value, isGzipped);
        }

#if SVG_TO_SVGZ //svgz
        foreach (KeyValuePair<string, byte[]> pair in toSvg) {
            string name = pair.Key;
            name = name.Replace(path, String.Empty);
            name = name.Replace("\\", "/");

            Entry entry = new Entry() {
                bytes = pair.Value,
                contentType = "image/svg+xml; charset=utf-8",
                headers = new KeyValuePair<string, string>[] { new KeyValuePair<string, string>("Content-Encoding", "gzip") },
            };

            cahce.Remove(name);
            cache.Add(name, entry);
        }
#endif

    }

    private void HandleFile(string name, byte[] bytes, bool isGzipped) {
        name = name.Replace("\\", "/");
        name = name.Replace(".html", String.Empty).Replace(".htm", String.Empty);
        if (name == "/index") { name = "/"; }

        Entry entry = ConstructEntry(name, bytes, isGzipped);
        cache.AddOrUpdate(name, key => entry, (key, existingValue) => entry);

#if DEBUG
        _raw += entry.bytes.LongLength;
        _gzip += entry.gzip.LongLength;
#if DEFLATE
        _deflate += entry.deflate.LongLength;
#endif
#if BROTLI
        _brotli += entry.brotli.LongLength;
#endif
#endif

#if SVG_TO_SVGZ //svgz
        if (name.EndsWith(".svg") && !files.ContainsKey($"{pair.Key}z")) {
            toSvg.Add($"{name}z", entry.gzip);
        }
#endif

#if SVG_TO_LIGHT
        byte[] pattern = "\"#202020\""u8.ToArray();
        byte[] target = "\"#c0c0c0\""u8.ToArray();
        if (name.StartsWith("/mono/") && name.EndsWith(".svg")) {
            if (Data.ContainsBytesSequence(entry.bytes, pattern)) {
                Data.ReplaceAllBytesSequence(entry.bytes, Encoding.UTF8.GetBytes("\"#202020\""), target);
                byte[] lightBytes = entry.bytes.ToArray();
                string lightName = $"{name}?light";
                Entry lightEntry = ConstructEntry(lightName, lightBytes, false, "svg");
                cache.AddOrUpdate(lightName, key => lightEntry, (key, existingValue) => lightEntry);

#if SVG_TO_SVGZ //svgz
                if (!files.ContainsKey($"{name}z?light")) {
                    toSvg.Add($"{name}z?light", lightEntry.gzip);
                }
#endif
            }
        }
#endif
    }

    private Entry ConstructEntry(string name, byte[] bytes, bool isGzipped, string extension = null) {
        extension ??= name.Split('.').Last();

        byte[] raw, gzip;
        if (isGzipped) {
            gzip = bytes;
            raw = UnGZip(bytes);
        }
        else {
            raw = bytes;
            gzip = GZip(raw);
        }

#if DEFLATE
        byte[] deflate = Deflate(raw);
#endif
#if BROTLI
        byte[] brotli = Brotli(raw);
#endif
        List<KeyValuePair<string, string>> headers = new List<KeyValuePair<string, string>>();
        if (name.EndsWith(".js")) {
            headers.Add(new KeyValuePair<string, string>("X-Content-Type-Options", "nosniff"));
        }

        headers.Add(new KeyValuePair<string, string>("Last-Modified", birthdate));
        headers.Add(new KeyValuePair<string, string>("Referrer-Policy", "no-referrer"));

#if DEBUG
        headers.Add(new KeyValuePair<string, string>("Cache-Control", "no-store"));
#else
        headers.Add(new KeyValuePair<string, string>("Cache-Control", name == "//" ? "no-store" : $"max-age={CACHE_CONTROL_MAX_AGE}"));
#endif

        Entry entry = new Entry() {
            bytes = raw,
            gzip = gzip,
#if DEFLATE
            deflate = deflate,
#endif
#if BROTLI
            brotli = brotli,
#endif
            contentType = CONTENT_TYPE.TryGetValue(extension, out string value) ? value : "text/html; charset=utf-8",
            headers = headers.ToArray()
        };

        return entry;
    }

    public static byte[] Minify(byte[] bytes, bool softMinify) {
        string text = Encoding.Default.GetString(bytes);
        StringBuilder result = new StringBuilder();

        string[] lines = text.Split('\n');

        foreach (string line in lines) {
            string trimmedLine = line.Trim();
            if (string.IsNullOrEmpty(trimmedLine)) continue;
            if (trimmedLine.StartsWith("//")) continue;

            int commentIndex = trimmedLine.IndexOf("//");
            if (commentIndex >= 0 && !trimmedLine.Contains("://")) {
                trimmedLine = trimmedLine.Substring(0, commentIndex).TrimEnd();
            }

            trimmedLine = trimmedLine.Replace("\t", " ");

            while (trimmedLine.Contains("  ")) {
                trimmedLine = trimmedLine.Replace("  ", " ");
            }

            trimmedLine = trimmedLine.Replace(" = ", "=")
                                     .Replace(" == ", "==")
                                     .Replace(" === ", "===")
                                     .Replace(" != ", "!=")
                                     .Replace(" !== ", "!==")
                                     .Replace("{ {", "{{")
                                     .Replace("} }", "}}")
                                     .Replace(") {", "){")
                                     .Replace("; ", ";")
                                     .Replace(": ", ":")
                                     .Replace(" !impossible;", "!impossible;");

            if (softMinify) {
                result.AppendLine(trimmedLine);
            }
            else {
                result.Append(trimmedLine);
            }
        }

        int startIndex, endIndex;
        while ((startIndex = result.ToString().IndexOf("/*")) >= 0 &&
               (endIndex = result.ToString().IndexOf("*/", startIndex)) >= 0) {
            result.Remove(startIndex, endIndex - startIndex + 2);
        }

        return Encoding.UTF8.GetBytes(result.ToString());
    }

    public static byte[] GZip(byte[] bytes) {
        if (bytes is null) return Array.Empty<byte>();

        using MemoryStream ms = new MemoryStream();
        using (GZipStream zip = new GZipStream(ms, CompressionMode.Compress, true)) {
            zip.Write(bytes, 0, bytes.Length);
        }

        byte[] array = ms.ToArray();

        return array;
    }
    public static byte[] UnGZip(byte[] bytes) {
        if (bytes is null) return Array.Empty<byte>();

        using MemoryStream zipped = new MemoryStream(bytes);
        using GZipStream unzip = new GZipStream(zipped, CompressionMode.Decompress);
        using MemoryStream ms = new MemoryStream();
        unzip.CopyTo(ms);
        return ms.ToArray();
    }

#if DEFLATE
    public static byte[] Deflate(byte[] bytes) {
        if (bytes is null) return Array.Empty<byte>();

        byte[] output;
        using MemoryStream msInput = new MemoryStream(bytes);
        using MemoryStream ms = new MemoryStream();
        using DeflateStream bs = new DeflateStream(ms, CompressionMode.Compress);
        msInput.CopyTo(bs);
        bs.Close();
        output = ms.ToArray();
        return output;
    }
    public static byte[] UnDeflate(byte[] bytes) {
        if (bytes is null) return Array.Empty<byte>();

        byte[] output;
        using MemoryStream msInput = new MemoryStream(bytes);
        using DeflateStream bs = new DeflateStream(msInput, CompressionMode.Decompress);
        using MemoryStream ms = new MemoryStream();
        bs.CopyTo(ms);
        ms.Seek(0, SeekOrigin.Begin);
        output = ms.ToArray();
        return output;
    }
#endif

#if BROTLI
    public static byte[] Brotli(byte[] bytes) {
        if (bytes is null) return Array.Empty<byte>();

        byte[] output;
        using MemoryStream msInput = new MemoryStream(bytes);
        using MemoryStream ms = new MemoryStream();
        using BrotliStream bs = new BrotliStream(ms, CompressionMode.Compress);
        msInput.CopyTo(bs);
        bs.Close();
        output = ms.ToArray();
        return output;
    }
    public static byte[] UnBrotli(byte[] bytes) {
        if (bytes is null) return Array.Empty<byte>();

        byte[] output;
        using MemoryStream msInput = new MemoryStream(bytes);
        using BrotliStream bs = new BrotliStream(msInput, CompressionMode.Decompress);
        using MemoryStream ms = new MemoryStream();
        bs.CopyTo(ms);
        ms.Seek(0, SeekOrigin.Begin);
        output = ms.ToArray();
        return output;
    }
#endif

}
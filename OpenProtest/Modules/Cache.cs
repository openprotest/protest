//#define MINIFY
//#define BUNDLING
//#define BUNDLING_SVG
#define SVG_TO_SVGZ

#if !DEBUG
#define MINIFY
#define BUNDLING
#endif


using System;
using System.Text;
using System.Collections;
using System.Linq;
using System.Text.RegularExpressions;
using System.IO;
using System.IO.Compression;

class Cache {
    public struct CacheEntry {
        public byte[] bytes;
        public byte[] gzip;
        public byte[] webp;
        public string contentType;
    }

    public static Hashtable CONTENT_TYPE = new Hashtable() {
        {"htm",  "text/html"},
        {"html", "text/html"},
        {"css",  "text/css"},
        {"png",  "image/png"},
        {"jpg",  "image/jpeg"},
        {"webp", "image/webp"},
        {"ico",  "image/x-icon"},
        {"svg",  "image/svg+xml"},
        {"svgz", "image/svg+xml"},
        {"js",   "application/javascript"},
        {"json", "application/json"},
        {"zip",  "application"}
    };

    public const int CACHE_CONTROL_MIN_FRESH = 28_800; //8h
    public const int CACHE_CONTROL_MAX_AGE = 86_400; //24h

    public readonly string birthdate;
    private readonly string path;
    public Hashtable hash = new Hashtable();

    public Cache(in string path) {
        birthdate = DateTime.Now.ToString(Strings.DATETIME_FORMAT);

        this.path = path;
        LoadExternalContentType();
        LoadCache();
    }

    public void ReloadCache() {
        LoadExternalContentType();
        hash.Clear();
        LoadCache();
        GC.Collect();
    }

    private bool LoadExternalContentType() {
        FileInfo file = new FileInfo(Strings.FILE_CONTENT_TYPE);
        if (!file.Exists) return false;

        using StreamReader fileReader = new StreamReader(file.FullName);
        string line;
        while ((line = fileReader.ReadLine()) != null) {
            line = line.Trim();
            if (line.StartsWith("#")) continue;

            string[] split = line.Split((char)9);
            if (split.Length < 2) continue;

            split[0] = split[0].Trim().ToLower();
            split[1] = split[1].Trim().ToLower();

            CONTENT_TYPE[split[0]] = split[1];
        }

        return true;
    }

    private bool LoadCache() {
        int _bundling = 0;
        long _preMinify = 0, _postMinify = 0;
        long _preGZip = 0, _postGZip = 0;
        long _preWebp = 0, _postWebp = 0;

        long _totalCache = 0;

#if SVG_TO_SVGZ //svgz
        Hashtable toSVG = new Hashtable();
#endif

        DirectoryInfo dir = new DirectoryInfo(path);
        if (!dir.Exists) return false;

        Hashtable files = new Hashtable();

        foreach (FileInfo f in dir.GetFiles())
            LoadFile(f, files);

        foreach (DirectoryInfo d in dir.GetDirectories())
            foreach (FileInfo f in d.GetFiles())
                LoadFile(f, files);

        int count = 0;
        foreach (DictionaryEntry o in files) {
            if (path == Strings.DIR_FRONTEND)
                Program.ProgressBar(count++ * 100 / files.Count, "Caching front-end");

            byte[] bytes = (byte[])o.Value;

            FileInfo file = new FileInfo($"{path}\\{(string)o.Key}");
            string extention = file.Extension.ToLower().Replace(".", "");

            string name = file.FullName;
            name = name.Replace($"{path}\\", "");
            name = name.Replace("\\", "/");
            name = name.Replace(".html", "").Replace(".htm", "");

            if (name == "index") name = "";

            CacheEntry entry = new CacheEntry();

#if MINIFY //minify
            if (extention == "htm" || extention == "html" || extention == "css" || extention == "js") {
                _preMinify += bytes.LongLength;
                bytes = Minify(bytes);
                _postMinify += bytes.LongLength;
            }
#endif

            //gzip
            _preGZip += bytes.LongLength;
            byte[] gzip = GZip(bytes);
            if (gzip.Length < bytes.Length) {
                entry.gzip = gzip;
                _postGZip += gzip.LongLength;
            } else {
                _postGZip += bytes.LongLength;
            }

#if SVG_TO_SVGZ //svgz
            if (extention == "svg" && !files.ContainsKey($"{o.Key}z"))
                toSVG.Add($"{file.FullName}z", gzip);
#endif

            //webp
            if (extention == "jpg" || extention == "jpe" || extention == "jpeg" || extention == "jfif" ||
                extention == "tif" || extention == "tiff" ||
                extention == "png" ||
                extention == "bmp" || extention == "dib") {

                if (files.ContainsKey($"{o.Key}.webp")) {
                    entry.webp = (byte[])files[$"{o.Key}.webp"];
                    _preWebp += bytes.LongLength;
                    _postWebp += entry.webp.Length;
                }
            }

            entry.contentType = CONTENT_TYPE.ContainsKey(extention) ? (string)CONTENT_TYPE[extention] : "text/html";

            entry.bytes = bytes;
            hash.Add(name, entry);

            _totalCache += entry.bytes.LongLength;
            _totalCache += entry.gzip?.LongLength ?? 0;
            _totalCache += entry.webp?.LongLength ?? 0;
        }

        if (path == Strings.DIR_FRONTEND) {
            Program.ProgressBar(100, "Caching front-end", true);
            Console.WriteLine();
        }

#if BUNDLING //bundling
        Hashtable bundling = new Hashtable();

        foreach (DictionaryEntry o in hash) {
            string name = (string)o.Key;
            if (name.Length == 0 || name.EndsWith(".htm") || name.EndsWith(".html")) {
                CacheEntry entry = (CacheEntry)o.Value;
                entry.bytes = Bundling(entry.bytes, ref _bundling);
                entry.gzip = GZip(entry.bytes);
                bundling.Add(name, entry);
            }
        }

        foreach (DictionaryEntry o in bundling) {
            string name = (string)o.Key;
            if (hash.ContainsKey(name)) hash.Remove(name);
            hash.Add(name, o.Value);
        }
#endif

#if SVG_TO_SVGZ //svgz
        foreach (DictionaryEntry o in toSVG) {
            string name = o.Key.ToString();
            name = name.Replace($"{path}\\", "");
            name = name.Replace("\\", "/");

            CacheEntry entry = new CacheEntry() {
                bytes = (byte[])o.Value,
                contentType = "image/svg+xml"
            };

            hash.Add(name, entry);

            _totalCache += entry.bytes.LongLength;
        }
#endif

#if DEBUG
        Console.ForegroundColor = ConsoleColor.DarkGray;
        Console.WriteLine($" Bundling  : {_bundling,5} files");
        Console.WriteLine($" Minify    : {100 * _postMinify / (_preMinify + 1),5}% {_preMinify,10} -> {_postMinify,8}");
        Console.WriteLine($" GZip      : {100 * _postGZip / (_preGZip + 1),5}% {_preGZip,10} -> {_postGZip,8}");
        Console.WriteLine($" Webp      : {100 * _postWebp / (_preWebp + 1),5}% {_preWebp,10} -> {_postWebp,8}");
        Console.WriteLine();
        Console.ResetColor();
#endif

        return true;
    }

    private void LoadFile(FileInfo f, Hashtable files) {
        string name = f.FullName;
        name = name.Replace($"{path}\\", "");
        name = name.Replace("\\", "/");

        if (name.ToLower() == "thumbs.db") return;

        FileStream fs = new FileStream(f.FullName, FileMode.Open, FileAccess.Read);
        BinaryReader br = new BinaryReader(fs);

        byte[] bytes = br.ReadBytes((int)f.Length);

        br.Dispose();
        fs.Dispose();

        //Console.WriteLine((char)bytes[0] + " " + (char)bytes[1] + " "  + (char)bytes[2] + " " + (char)bytes[3] + " " + (char)bytes[4] + "    " + name);

        files.Add(name, bytes);
    }

    private byte[] Bundling(byte[] bytes, ref int _bundling) { //bundling
        string str = Encoding.UTF8.GetString(bytes);

        //bundling js
        string scriptPattern = "<script\\ssrc=.\\w+\\.\\w+.></script>";
        foreach (Match match in Regex.Matches(str, scriptPattern, RegexOptions.IgnoreCase)) {
            string jsFilename = Regex.Match(match.Value, "\\w+\\.js").Value;
            if (hash.ContainsKey(jsFilename)) {
                string replacement = $"<script>{Encoding.Default.GetString(((CacheEntry)hash[jsFilename]).bytes)}</script>";
                str = str.Replace(match.Value, replacement);
                _bundling++;
            }
        }

        //bundling css
        string stylePattern = "<link\\srel=.stylesheet.\\shref=.\\w+\\.css.\\s/>|<link\\srel=.stylesheet.\\shref=.\\w+\\.css./>";
        foreach (Match match in Regex.Matches(str, stylePattern, RegexOptions.IgnoreCase)) {
            string cssFilename = Regex.Match(match.Value, "\\w+\\.css").Value;
            if (hash.ContainsKey(cssFilename)) {
                string replacement = $"<style>{Encoding.Default.GetString(((CacheEntry)hash[cssFilename]).bytes)}</style>";
                str = str.Replace(match.Value, replacement);
                _bundling++;
            }
        }

        return Encoding.Default.GetBytes(str);
    }

    private byte[] Minify(byte[] bytes) {
        string[] lines = Encoding.Default.GetString(bytes).Split('\n');

        for (int i = 0; i < lines.Length; i++) {
            lines[i] = lines[i].Trim();

            lines[i] = lines[i].Replace("\t", " ");

            //remove double space
            while (lines[i].IndexOf("  ") > -1)
                lines[i] = lines[i].Replace("  ", " ");

            //lines[i] = lines[i].Replace(" + ", "+"); because css calc() sux
            //lines[i] = lines[i].Replace(" - ", "-"); because css calc() sux
            lines[i] = lines[i].Replace(" = ", "=");
            lines[i] = lines[i].Replace(" == ", "==");
            lines[i] = lines[i].Replace(" === ", "===");
            lines[i] = lines[i].Replace(" != ", "!=");
            lines[i] = lines[i].Replace(" !== ", "!==");

            lines[i] = lines[i].Replace("{ {", "{{");
            lines[i] = lines[i].Replace("} }", "}}");

            lines[i] = lines[i].Replace(") {", "){");
  
            lines[i] = lines[i].Replace("; ", ";");
            lines[i] = lines[i].Replace(": ", ":");

            //lines[i] = lines[i].Replace(";}", "}"); // <--

            //remove single line comment
            int p = lines[i].IndexOf("//");
            if (p > -1)
                if (p == 0)
                    lines[i] = "";
                else if (lines[i][p - 1] != ':') //if not a url, e.g: http://...
                    lines[i] = lines[i].Substring(0, p);
        }

        string mini = "";
        for (int i = 0; i < lines.Length; i++) {
            if (lines[i].EndsWith("else")) lines[i] += " ";
            if (lines.Length > 0) mini += lines[i];
        }

        //remove multi-line comments
        int p0 = mini.IndexOf("/*");
        int p1 = mini.IndexOf("*/");
        while (p0 < p1) {
            mini = mini.Remove(p0, (p1 + 2) - p0);
            p0 = mini.IndexOf("/*");
            p1 = mini.IndexOf("*/");
        }

        

        return Encoding.UTF8.GetBytes(mini);
    }

    private static byte[] GZip(byte[] bytes) {
        if (bytes is null) return null;

        MemoryStream mem = new MemoryStream();
        using (GZipStream zip = new GZipStream(mem, System.IO.Compression.CompressionMode.Compress, true)) {
            zip.Write(bytes, 0, bytes.Length);
        }

        byte[] arary = mem.ToArray();
        mem.Dispose();

        return arary;
    }

}

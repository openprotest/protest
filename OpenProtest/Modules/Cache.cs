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
using System.Text.RegularExpressions;
using System.IO;
using System.Collections;

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
        {"js",   "application/javascript"},
        {"png",  "image/png"},
        {"jpg",  "image/jpeg"},
        {"webp", "image/webp"},
        {"svg",  "image/svg+xml"},
        {"svgz", "image/svg+xml"}
    };

    public readonly string birthdate;
    public Hashtable hash = new Hashtable();
    private readonly string path;

    public Cache(in string path) {
        birthdate = DateTime.Now.ToString(NoSQL.DATETIME_FORMAT);

        this.path = path;
        LoadExternalContentType();
        LoadCache();
    }

    private bool LoadExternalContentType() {
        FileInfo file = new FileInfo($"{Directory.GetCurrentDirectory()}\\knowlage\\content_type.txt");
        if (!file.Exists) return false;

        StreamReader fileReader = new StreamReader(file.FullName);
        string line;
        while ((line = fileReader.ReadLine()) != null) {
            line = line.Trim();
            if (line.StartsWith("#")) continue;

            string[] split = line.Split((char) 9);
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

        foreach (DictionaryEntry o in files) {
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
                if (name.Length > 0) bytes = Minify(bytes);
                _postMinify += bytes.LongLength;
            }
#endif

#if BUNDLING //bundling
            if (extention == "htm" || extention == "html") {
                bytes = Bundling(bytes, files, ref _bundling);
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

        Console.ForegroundColor = ConsoleColor.DarkGray;
        Console.WriteLine($" Bundling  : {_bundling, 5} files");
        Console.WriteLine($" Minify    : {100 * _postMinify / (_preMinify + 1),5}% {_preMinify,10} -> {_postMinify,8}");
        Console.WriteLine($" GZip      : {100 * _postGZip / (_preGZip + 1),5}% {_preGZip,10} -> {_postGZip,8}");
        Console.WriteLine($" Webp      : {100 * _postWebp / (_preWebp + 1),5}% {_preWebp,10} -> {_postWebp,8}");

        Console.WriteLine();
        Console.ResetColor();
        return true;
    }

    private void LoadFile(FileInfo f, Hashtable files) {
        string name = f.FullName;
        name = name.Replace($"{path}\\", "");
        name = name.Replace("\\", "/");

        if (name.ToLower() == "thumbs.db") return;
        
        FileStream fs = new FileStream(f.FullName, FileMode.Open, FileAccess.Read);
        BinaryReader br = new BinaryReader(fs);

        byte[] bytes = br.ReadBytes((int) f.Length);
        
        br.Dispose();
        fs.Dispose();

        //Console.WriteLine((char)bytes[0] + " " + (char)bytes[1] + " "  + (char)bytes[2] + " " + (char)bytes[3] + " " + (char)bytes[4] + "    " + name);

        files.Add(name, bytes);
    }
    

    public byte[] Bundling(byte[] bytes, Hashtable files, ref int _bundling) { //bundling
        string str = Encoding.UTF8.GetString(bytes);

        //bundling js
        string scriptPattern = "<script\\ssrc=.\\w+\\.\\w+.></script>";
        foreach (Match match in Regex.Matches(str, scriptPattern, RegexOptions.IgnoreCase)) {
            string jsFilename = Regex.Match(match.Value, "\\w+\\.js").Value;
            if (files.ContainsKey(jsFilename)) {
                string replacement = $"<script>{Encoding.Default.GetString((byte[])files[jsFilename])}</script>";
                str = str.Replace(match.Value, replacement);
                _bundling++;
            }
        }

        //bundling css
        string stylePattern = "<link\\srel=.stylesheet.\\shref=.\\w+\\.css.\\s/>|<link\\srel=.stylesheet.\\shref=.\\w+\\.css./>";
        foreach (Match match in Regex.Matches(str, stylePattern, RegexOptions.IgnoreCase)) {
            string cssFilename = Regex.Match(match.Value, "\\w+\\.css").Value;
            if (files.ContainsKey(cssFilename)) {
                string replacement = $"<style>{Encoding.Default.GetString((byte[])files[cssFilename])}</style>";
                str = str.Replace(match.Value, replacement);
                _bundling++;
            }
        }

        //bundling svg in js url
        /*string svgjsPattern = "url\\(\\w+\\.svg\\)";
        foreach (Match match in Regex.Matches(str, svgjsPattern, RegexOptions.IgnoreCase)) {
            string svgFilename = Regex.Match(match.Value, "\\w+\\.svg").Value;
            if (files.ContainsKey(svgFilename)) {
                string replacement = $"url(\"data:image/svg+xml;utf8,{Encoding.Default.GetString(((byte[])files[svgFilename])).Replace("\n", "").Replace("\"","'")}\")";
                str = str.Replace(match.Value, replacement);
                _bundling++;
            }
        }*/

        return Encoding.Default.GetBytes(str);
    }

    public byte[] Minify(byte[] bytes) {
        string[] lines = Encoding.Default.GetString(bytes).Split('\n');

        for (int i=0; i< lines.Length; i++) {
            lines[i] = lines[i].Trim();

            lines[i] = lines[i].Replace("\t", " ");

            //remove double space
            while (lines[i].IndexOf("  ") > -1)
                lines[i] = lines[i].Replace("  ", " ");

            //lines[i] = lines[i].Replace(" + ", "+"); because css calc() sux
            //lines[i] = lines[i].Replace(" - ", "-"); because css calc() sux
            //lines[i] = lines[i].Replace(" * ", "*");
            //lines[i] = lines[i].Replace(" / ", "/");
            lines[i] = lines[i].Replace(" = ", "=");
            lines[i] = lines[i].Replace(" == ", "==");
            lines[i] = lines[i].Replace(" === ", "===");
            lines[i] = lines[i].Replace(" != ", "!=");
            lines[i] = lines[i].Replace(" !== ", "!==");

            lines[i] = lines[i].Replace("{ {", "{{");
            lines[i] = lines[i].Replace("} }", "}}");

            lines[i] = lines[i].Replace(") {", "){");
            /*lines[i] = lines[i].Replace("{ ", "{");
            lines[i] = lines[i].Replace(" {", "{");

            lines[i] = lines[i].Replace("} ", "}");
            lines[i] = lines[i].Replace(" }", "}");*/

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

    public static byte[] GZip(byte[] bytes) {
        if (bytes is null) return null;

        MemoryStream mem = new MemoryStream();
        using (System.IO.Compression.GZipStream zip = new System.IO.Compression.GZipStream(mem, System.IO.Compression.CompressionMode.Compress, true)) {
            zip.Write(bytes, 0, bytes.Length);
        }
   
        byte[] arary = mem.ToArray();
        mem.Dispose();

        return arary;
    }

}
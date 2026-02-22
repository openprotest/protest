using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;

namespace Protest.Tools;

internal static class Documentation {
    private static readonly Lock mutex = new Lock();

    public static byte[] List(Dictionary<string, string> parameters) {
        string keywords = null;
        parameters?.TryGetValue("keywords", out keywords);
        keywords ??= String.Empty;

        string[] keywordsArray = keywords.Split(' ').Where(o=>o.Length > 0).ToArray();

        DirectoryInfo dir = new DirectoryInfo(Data.DIR_DOCUMENTATION);
        if (!dir.Exists) {
            return "[]"u8.ToArray();
        }

        List<FileInfo> files = dir.GetFiles().ToList();
        files.Sort((a, b) => String.Compare(a.Name, b.Name));

        StringBuilder builder = new StringBuilder();

        builder.Append('[');
        lock (mutex) {
            bool first = true;
            for (int i = 0; i < files.Count; i++) {
                if (files[i].Name.EndsWith(".html.gz")) continue;

                try {
                    string words = File.ReadAllText(files[i].FullName);

                    bool found = true;
                    if (keywordsArray.Length > 0) {
                        for (int j = 0; j < keywordsArray.Length; j++) {
                            if (!words.Contains(keywordsArray[j], StringComparison.InvariantCultureIgnoreCase)) {
                                found = false;
                                break;
                            }
                        }
                    }

                    if (!found) continue;

                    if (!first) builder.Append(',');
                    builder.Append($"\"{Data.EscapeJsonText(files[i].Name)}\"");
                    first = false;
                }
                catch { }
            }
        }
        builder.Append(']');

        return Encoding.UTF8.GetBytes(builder.ToString());
    }

    public static byte[] View(HttpListenerContext ctx, Dictionary<string, string> parameters, bool serveGZip = false) {
        string acceptEncoding = ctx.Request.Headers.Get("Accept-Encoding")?.ToLower() ?? String.Empty;
        bool acceptGZip = acceptEncoding.Contains("gzip");

        if (acceptGZip) {
            ctx.Response.AddHeader("Content-Encoding", "gzip");
        }

        return View(parameters, acceptGZip);
    }

    public static byte[] View(Dictionary<string, string> parameters, bool serveGZip = false) {
        parameters.TryGetValue("name", out string name);
        if (String.IsNullOrEmpty(name)) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        try {
            FileInfo file = new FileInfo($"{Data.DIR_DOCUMENTATION}\\{name}.html.gz");
            if (!file.Exists)
                return Data.CODE_FILE_NOT_FOUND.Array;

            byte[] bytes = File.ReadAllBytes(file.FullName);
            if (serveGZip) return bytes;
            return Http.Cache.UnGZip(bytes);
        }
        catch {
            return Data.CODE_FAILED.Array;
        }
    }

    public static byte[] Create(HttpListenerContext ctx, string origin) {
        using StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding);
        string[] payload = reader.ReadToEnd().Split((char)127);

        if (payload.Length < 3)
            return Data.CODE_NOT_ENOUGH_INFO.Array;
        if (payload[0].Length == 0)
            return Data.CODE_NOT_ENOUGH_INFO.Array;

        if (payload[1].IndexOf("<script") > -1)
            return Encoding.UTF8.GetBytes("unsafe content: scripts are not allowed");

        string filename = payload[0];
        foreach (char c in Path.GetInvalidFileNameChars()) {
            filename = filename.Replace(c, '_');
        }

        List<string> keywords = new List<string>();

        StringBuilder builder = new StringBuilder();
        builder.Append("<!--");
        builder.Append('[');
        for (int i = 2; i < payload.Length - 3; i += 4) {
            if (i != 2) {
                builder.Append(',');
            }

            builder.Append($"\"{Data.EscapeJsonText(payload[i])}\",");
            builder.Append($"\"{Data.EscapeJsonText(payload[i+1])}\",");
            builder.Append($"\"{Data.EscapeJsonText(payload[i+2])}\",");
            builder.Append($"\"{Data.EscapeJsonText(payload[i+3])}\"");

            if (!keywords.Contains(payload[i])) {
                keywords.Add(payload[i]); //filename
            }

            if (!keywords.Contains(payload[i + 2])) {
                keywords.Add(payload[i + 2]); //label1
            }

            if (!keywords.Contains(payload[i + 3])) {
                keywords.Add(payload[i + 3]); //label2
            }
        }
        builder.Append(']');
        builder.AppendLine("-->");

        int commentStop = payload[1].IndexOf("-->");
        if (payload[1].StartsWith("<!--") && commentStop > -1)
            builder.Append(payload[1][(commentStop + 3)..].Trim());
        else
            builder.Append(payload[1]);

        if (payload[1].IndexOf("<script") > -1)
            return "{\"error\":\"Unsafe content. Scripts are not allowed.\"}"u8.ToArray();

        int idx = 0;
        string text = String.Empty;
        while (idx < payload[1].Length) {

            if (payload[1][idx] == '<') {
                if (text.Length > 0) {
                    string[] split = text.ToLower().Split(new char[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
                    for (int i = 0; i < split.Length; i++)
                        if (!keywords.Contains(split[i]))
                            keywords.Add(split[i]);
                    text = String.Empty;
                }

                int tagStop = payload[1].IndexOf('>', idx);
                if (tagStop == -1)
                    break;
                idx = tagStop + 1;
                continue;
            }

            text += payload[1][idx++];
        }

        keywords.Sort();

        idx = 0;
        if (keywords.Count > 1) {
            while (idx < keywords.Count - 1) {
                if (keywords[idx + 1].StartsWith(keywords[idx])) {
                    keywords.RemoveAt(idx);
                }
                else {
                    idx++;
                }
            }
        }

        lock (mutex) {
            try {
                DirectoryInfo dir = new DirectoryInfo(Data.DIR_DOCUMENTATION);
                if (!dir.Exists) {
                    dir.Create();
                }

                FileInfo html = new FileInfo($"{Data.DIR_DOCUMENTATION}\\{filename}.html.gz");

                File.WriteAllBytes(html.FullName, Http.Cache.GZip(Encoding.UTF8.GetBytes(builder.ToString())));

                FileInfo words = new FileInfo($"{Data.DIR_DOCUMENTATION}\\{filename}");
                File.WriteAllText(words.FullName, String.Join("\n", keywords.ToArray()));
            }
            catch {
                return Data.CODE_FILE_NOT_FOUND.Array;
            }
        }

        Logger.Action(origin, $"Create documentation: {filename}");

        return Data.CODE_OK.Array;
    }



    public static byte[] Delete(Dictionary<string, string> parameters, string origin) {
        if (parameters is null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        parameters.TryGetValue("name", out string name);
        if (String.IsNullOrEmpty(name)) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        lock (mutex)
            try {
                FileInfo file = new FileInfo($"{Data.DIR_DOCUMENTATION}\\{name}");
                if (file.Exists) {
                    file.Delete();
                }

                FileInfo html = new FileInfo($"{Data.DIR_DOCUMENTATION}\\{name}.html.gz");
                if (html.Exists) {
                    html.Delete();
                }

                Logger.Action(origin, $"Delete documentation: {name}");
            }
            catch {
                return Data.CODE_FAILED.Array;
            }

        return Data.CODE_OK.Array;
    }
}

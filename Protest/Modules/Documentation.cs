using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Text;

class Documentation {
    static readonly object DOC_LOCK = new object();

    public static byte[] GetDocs(in string[] para) {
        string[] keywords = null;
        for (int i = 0; i < para.Length; i++)
            if (para[i].StartsWith("keywords=")) keywords = Strings.EscapeUrl(para[i].Substring(9)).Split(' ');

        DirectoryInfo dir = new DirectoryInfo(Strings.DIR_DOCUMENTATION);
        if (!dir.Exists) return Strings.FLE.Array;

        List<FileInfo> files = new List<FileInfo>();
        files.AddRange(dir.GetFiles());
        files.Sort((a, b) => String.Compare(a.Name, b.Name));

        StringBuilder sb = new StringBuilder();

        lock (DOC_LOCK)
            for (int i = 0; i < files.Count; i++)
                if (!files[i].Name.EndsWith(".html.gz"))
                    try {
                        string words = File.ReadAllText(files[i].FullName);

                        bool found = true;
                        if (!(keywords is null) && keywords.Length > 0) //search content
                            for (int j = 0; j < keywords.Length; j++)
                                if (words.IndexOf(keywords[j], StringComparison.InvariantCultureIgnoreCase) == -1) {
                                    found = false;
                                    break;
                                }

                        if (!found) //match filename
                            found = (keywords.Length == 1 && files[i].Name == keywords[0]);

                        if (!found) continue;                       
                        
                        sb.Append(files[i].Name + ((char)127).ToString());

                    } catch { }

        return Encoding.UTF8.GetBytes(sb.ToString());
    }

    public static byte[] CreateDoc(in HttpListenerContext ctx, in string performer) {
        StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding);
        string[] payload = reader.ReadToEnd().Split((char)127);

        if (payload.Length < 3) return Strings.INF.Array;
        if (payload[0].Length == 0) return Strings.INF.Array;

        string filename = payload[0];
        foreach (char c in Path.GetInvalidFileNameChars())
            filename = filename.Replace(c, '_');

        StringBuilder sb = new StringBuilder();
        sb.Append("<!--");
        sb.Append("[");
        for (int i = 2; i < payload.Length - 3; i += 4) {
            if (i != 2) sb.Append(",");
            sb.Append($"\"{Strings.EscapeJson(payload[i])}\",");
            sb.Append($"\"{Strings.EscapeJson(payload[i + 1])}\",");
            sb.Append($"\"{Strings.EscapeJson(payload[i + 2])}\",");
            sb.Append($"\"{Strings.EscapeJson(payload[i + 3])}\"");
        }
        sb.Append("]");
        sb.AppendLine("-->");

        int commentStop = payload[1].IndexOf("-->");
        if (payload[1].StartsWith("<!--") && commentStop > -1)
            sb.Append(payload[1].Substring(commentStop + 3).Trim());
        else
            sb.Append(payload[1]);

        if (payload[1].IndexOf("<script") > -1)
            return Encoding.UTF8.GetBytes("unsafe content. scripts are not allowed.");

        List<string> keywords = new List<string>();
        int idx = 0;
        string text = "";
        while (idx < payload[1].Length) {

            if (payload[1][idx] == '<') {
                if (text.Length > 0) {
                    string[] split = text.ToLower().Split(new char[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
                    for (int i = 0; i < split.Length; i++)
                        if (!keywords.Contains(split[i]))
                            keywords.Add(split[i]);                    
                    text = "";
                }

                int tagStop = payload[1].IndexOf('>', idx);
                if (tagStop == -1) break;
                idx = tagStop + 1;
                continue;
            }

            text += payload[1][idx++];
        }

        keywords.Sort();
 
        idx = 0;
        if (keywords.Count > 1)
            while (idx < keywords.Count - 1)
                if (keywords[idx+1].StartsWith(keywords[idx]))
                    keywords.RemoveAt(idx);
                else
                    idx++;

        lock (DOC_LOCK)
            try {
                DirectoryInfo dir = new DirectoryInfo(Strings.DIR_DOCUMENTATION);
                if (!dir.Exists) dir.Create();

                FileInfo html = new FileInfo($"{Strings.DIR_DOCUMENTATION}\\{filename}.html.gz");

                File.WriteAllBytes(html.FullName, Cache.GZip(sb.ToString()));

                FileInfo words = new FileInfo($"{Strings.DIR_DOCUMENTATION}\\{filename}");
                File.WriteAllText(words.FullName, String.Join("\n", keywords.ToArray()));

            } catch {
                return Strings.FLE.Array;
            }

        Logging.Action(performer, $"Create documentation: {filename}");

        return Strings.OK.Array;
    }

    public static byte[] PreviewDoc(in string[] para, bool serveGZip = false) {
        string name = String.Empty;
        for (int i = 0; i < para.Length; i++)
            if (para[i].StartsWith("name=")) name = Strings.EscapeUrl(para[i].Substring(5));

        if (name.Length == 0) return Strings.INF.Array;

        try {
            FileInfo file = new FileInfo($"{Strings.DIR_DOCUMENTATION}\\{name}.html.gz");
            if (!file.Exists) return Strings.FLE.Array;

            byte[] bytes = File.ReadAllBytes(file.FullName);
            if (serveGZip) return bytes;
            return Cache.UnGZip(bytes);
        } catch { }

        return Strings.FAI.Array;
    }

    public static byte[] DeleteDoc(in string[] para, in string performer) {
        string name = String.Empty;
        for (int i = 0; i < para.Length; i++)
            if (para[i].StartsWith("name=")) name = Strings.EscapeUrl(para[i].Substring(5));

        lock (DOC_LOCK)
            try {
                FileInfo file = new FileInfo($"{Strings.DIR_DOCUMENTATION}\\{name}");
                if (file.Exists) file.Delete();
                FileInfo html = new FileInfo($"{Strings.DIR_DOCUMENTATION}\\{name}.html.gz");
                if (html.Exists) html.Delete();

                Logging.Action(performer, $"Delete documentation: {name}");
            } catch {
                return Strings.FAI.Array;
            }

        return Strings.OK.Array;
    }

}

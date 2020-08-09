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
        files.Sort((a, b) => String.Compare(b.Name, a.Name));

        StringBuilder sb = new StringBuilder();

        lock (DOC_LOCK)
            for (int i = 0; i < files.Count; i++)    
                try {
                    string data = File.ReadAllText(files[i].FullName);

                    bool found = true;
                    if (!(keywords is null) && keywords.Length > 0) //search content
                        for (int j = 0; j < keywords.Length; j++)
                            if (data.IndexOf(keywords[j], StringComparison.InvariantCultureIgnoreCase) == -1) {
                                found = false;
                                break;
                            }

                    if (!found) //match filename
                        found = (keywords.Length == 1 && files[i].Name == keywords[0]);

                    if (!found) continue;

                    if (sb.Length > 0) sb.Append(((char)127).ToString());
                    sb.Append(files[i].Name);

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
        for (int i = 2; i < payload.Length-3; i+=4) {
            if (i != 2) sb.Append(",");
            sb.Append($"\"{Strings.EscapeJson(payload[i])}\",");
            sb.Append($"\"{Strings.EscapeJson(payload[i+1])}\",");
            sb.Append($"\"{Strings.EscapeJson(payload[i+2])}\",");
            sb.Append($"\"{Strings.EscapeJson(payload[i+3])}\"");
        }
        sb.Append("]");
        sb.AppendLine("-->");


        int end = payload[1].IndexOf("-->");
        if (payload[1].StartsWith("<!--") && end > -1)
            sb.Append(payload[1].Substring(end+3).Trim());
        else
            sb.Append(payload[1]);
       
        lock (DOC_LOCK) 
            try {
                DirectoryInfo dir = new DirectoryInfo(Strings.DIR_DOCUMENTATION);
                if (!dir.Exists) dir.Create();

                FileInfo file = new FileInfo($"{Strings.DIR_DOCUMENTATION}\\{filename}");
                File.WriteAllText(file.FullName, sb.ToString());

            } catch {
                return Strings.FLE.Array;
            }
        

        return Strings.OK.Array;
    }

    public static byte[] PreviewDoc(in string[] para) {
        string name = String.Empty;
        for (int i = 0; i < para.Length; i++)
            if (para[i].StartsWith("name=")) name = Strings.EscapeUrl(para[i].Substring(5));

        if (name.Length == 0) return Strings.INF.Array;

        try {
            FileInfo file = new FileInfo($"{Strings.DIR_DOCUMENTATION}\\{name}");
            if (!file.Exists) return Strings.FLE.Array;
            return File.ReadAllBytes(file.FullName);
        } catch { }

        return Strings.FAI.Array;
    }

    public static byte[] DeleteDoc(in string[] para, in string performer) {

        return null;
    }

}

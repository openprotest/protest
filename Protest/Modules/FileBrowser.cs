using System;
using System.IO;
using System.Linq;
using System.Text;

public static class FileBrowser {

    public static byte[] Get(in string[] para) {
        string path = String.Empty;
        for (int i = 1; i < para.Length; i++)
            if (para[i].StartsWith("path=")) path = Strings.EscapeUrl(para[i].Substring(5));

        if (path.Length == 0) return null;

        if (path.StartsWith("smb:")) path = $"\\\\{path.Substring(4)}";
        path = path.Replace("/", "\\");

        StringBuilder sb = new StringBuilder();

        try {
            DirectoryInfo dir = new DirectoryInfo(path);

            DirectoryInfo[] dirs = dir.GetDirectories();
            for (int i = 0; i < dirs.Length; i++) {
                sb.Append($"f{(char)127}");
                sb.Append($"{dirs[i].Name}{(char)127}");
                sb.Append($"{dirs[i].FullName}{(char)127}");
                sb.Append($"{dirs[i].LastWriteTime.ToString(Strings.DATETIME_FORMAT)}{(char)127}");
                sb.Append($"{(char)127}");
            }

            FileInfo[] files = dir.GetFiles();
            for (int i = 0; i < files.Length; i++) {
                sb.Append($"f{(char)127}");
                sb.Append($"{files[i].Name}{(char)127}");
                sb.Append($"{files[i].FullName}{(char)127}");
                sb.Append($"{files[i].LastWriteTime.ToString(Strings.DATETIME_FORMAT)}{(char)127}");
                sb.Append($"{files.Length}{(char)127}");
            }

        } catch { }

        return Encoding.UTF8.GetBytes(sb.ToString());
    }
}
using System;
using System.IO;
using System.Linq;
using System.Text;

public static class FileBrowser {

    public static byte[] Get(in string[] para) {
        string path = String.Empty;
        for (int i = 1; i < para.Length; i++)
            if (para[i].StartsWith("path=")) path = Strings.DecodeUrl(para[i].Substring(5));

        if (path.Length == 0) return null;

        if (path.StartsWith("smb:")) path = path.Substring(4);

        StringBuilder sb = new StringBuilder();

        if (path.IndexOf("/") == -1) {
            try {
                string[] share = Encoding.UTF8.GetString(Wmi.WmiQuery(path, "SELECT Caption, Name, Type FROM Win32_Share")).Split((char)127);

                for (int i = 4; i < share.Length; i+=3) {
                    if (share[i].Length == 0) continue;

                    string c = share[i];
                    string n = share[i+1];
                    string t = share[i+2];

                    if (n == "IPC$") continue;

                    string type = "";
                    if (n.Length == 2 && n[1] == '$')
                        type = "h";
                    else if (n[n.Length - 1] == '$')
                        type = "d";
                    else
                        type = "s";

                    sb.Append($"{type}{(char)127}");
                    sb.Append($"{n}{(char)127}");
                    sb.Append($"{n}{(char)127}");
                    sb.Append($"{c}{(char)127}");
                    sb.Append((char)127);
                }

                return Encoding.UTF8.GetBytes(sb.ToString());
            } catch { }
            return null;
        }
        
        path = "\\\\" + path.Replace("/", "\\");

        try {
            DirectoryInfo dir = new DirectoryInfo(path);

            DirectoryInfo[] dirs = dir.GetDirectories();
            for (int i = 0; i < dirs.Length; i++) {
                sb.Append($"d{(char)127}");
                sb.Append($"{dirs[i].Name}{(char)127}");
                sb.Append($"{dirs[i].FullName}{(char)127}");
                sb.Append($"{dirs[i].LastWriteTime.ToString(Strings.DATETIME_FORMAT)}{(char)127}");
                sb.Append((char)127);
            }

            FileInfo[] files = dir.GetFiles();
            for (int i = 0; i < files.Length; i++) {
                sb.Append($"f{(char)127}");
                sb.Append($"{files[i].Name}{(char)127}");
                sb.Append($"{files[i].FullName}{(char)127}");
                sb.Append($"{files[i].LastWriteTime.ToString(Strings.DATETIME_FORMAT)}{(char)127}");
                sb.Append($"{Strings.SizeToString(files[i].Length)}{(char)127}");
            }

        } catch (Exception ex) {
            return Encoding.UTF8.GetBytes(ex.Message);
        }

        return Encoding.UTF8.GetBytes(sb.ToString());
    }
}
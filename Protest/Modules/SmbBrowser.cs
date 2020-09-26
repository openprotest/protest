using System;
using System.IO;
using System.Linq;

public static class SmbBrowser {
    
    public static byte[] Get(in string[] para) {
        string path = String.Empty;
        for (int i = 1; i < para.Length; i++)
            if (para[i].StartsWith("path=")) path = Strings.EscapeUrl(para[i].Substring(5));

        if (path.Length == 0) return null;

        try {
            DirectoryInfo dir = new DirectoryInfo(path);

            DirectoryInfo[] dirs = dir.GetDirectories();
            FileInfo[] files = dir.GetFiles();

        } catch { }

        return null;
    }

}
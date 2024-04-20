using Microsoft.VisualBasic;
using System.Collections.Generic;
using System.Diagnostics.CodeAnalysis;
using System.IO;
using System.IO.Compression;
using System.IO.Pipes;
using System.Net;
using System.Text;

namespace Protest;
internal static class Backup {

    private static readonly object mutex;
    static Backup() {
        mutex = new object();
    }

    internal static byte[] Create(Dictionary<string, string> parameters) {
        if (parameters is null || !parameters.TryGetValue("name", out string name) || String.IsNullOrEmpty(name)) {
            name = $"backup-{DateTime.UtcNow.ToString(Data.DATE_FORMAT_FILE)}";
        }

        Console.WriteLine(name);

        foreach (char c in Path.GetInvalidFileNameChars()) {
            name = name.Replace (c, '_');
        }
        
        Console.WriteLine(name);

        try {
            DirectoryInfo backupDirectory = new DirectoryInfo(Data.DIR_BACKUP);
    
            lock (mutex) {
                if (!backupDirectory.Exists) { backupDirectory.Create(); }

                int count = 1;
                string filename = $"{Data.DIR_BACKUP}{Data.DELIMITER}{name}.zip";
                while (File.Exists(filename)) {
                    filename = $"{Data.DIR_BACKUP}{Data.DELIMITER}{name}-{++count}.zip";
                }

                DirectoryInfo copyDirectory = new DirectoryInfo($"{filename}.tmp");
                if (copyDirectory.Exists) copyDirectory.Delete();
                copyDirectory.Create();

                DirectoryInfo[] directories = [
                    new DirectoryInfo(Data.DIR_DATA),
                    new DirectoryInfo(Data.DIR_LOG),
                    new DirectoryInfo(Data.DIR_ACL)
                ];

                for (int i = 0; i < directories.Length; i++) {
                    if (directories[i].Exists) {
                        CopyAll(directories[i], new DirectoryInfo($"{copyDirectory.FullName}{Data.DELIMITER}{directories[i].Name}"));
                    }
                }

                ZipFile.CreateFromDirectory(copyDirectory.FullName, filename);
                copyDirectory.Delete(true);
            }

            return List();
        }
        catch (Exception ex) {
            Logger.Error(ex);
            return Encoding.UTF8.GetBytes($"{{\"error\":\"{ex.Message}\"}}");
        }
    }

    private static void CopyAll(DirectoryInfo source, DirectoryInfo destination) {
        if (!destination.Exists) destination.Create();

        FileInfo[] files = source.GetFiles();
        for (int i = 0; i < files.Length; i++) {
            files[i].CopyTo($"{destination.FullName}{Data.DELIMITER}{files[i].Name}");
        }

        DirectoryInfo[] subfolders = source.GetDirectories();
        for (int i = 0; i < subfolders.Length; i++) {
            CopyAll(subfolders[i], new DirectoryInfo(subfolders[i].FullName.Replace(source.FullName, destination.FullName)));
        }
    }

    internal static byte[] Delete(Dictionary<string, string> parameters) {
        if (parameters is null) { return Data.CODE_FAILED.Array; }

        parameters.TryGetValue("name", out string name);
        if (String.IsNullOrEmpty(name)) { return Data.CODE_INVALID_ARGUMENT.Array; }

        try {
            string filename = $"{Data.DIR_BACKUP}{Data.DELIMITER}{name}";
            if (File.Exists(filename)) {
                File.Delete(filename);
                return List();
            }
            else {
                return Data.CODE_FILE_NOT_FOUND.Array;
            }
        }
        catch {
            return Data.CODE_FAILED.Array;
        }
    }

    internal static byte[] List() {
        DirectoryInfo directory = new DirectoryInfo(Data.DIR_BACKUP);
        if (!directory.Exists) return "[]"u8.ToArray();

        FileInfo[] files = directory.GetFiles();

        StringBuilder builder = new StringBuilder();
        builder.Append('[');

        bool first = true;
        foreach (FileInfo file in files) {
            if (!first) builder.Append(',');

            builder.Append('{');
            builder.Append($"\"name\":\"{Data.EscapeJsonText(file.Name)}\",");
            builder.Append($"\"date\":{file.CreationTimeUtc.Ticks},");
            builder.Append($"\"size\":{file.Length}");
            builder.Append('}');

            first = false;
        }

        builder.Append(']');

        return Encoding.UTF8.GetBytes(builder.ToString());
    }
}
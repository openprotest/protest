using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.VisualBasic;
using System.Collections.Generic;
using System.Diagnostics.CodeAnalysis;
using System.IO;
using System.IO.Compression;
using System.IO.Pipes;
using System.Net;
using System.Text;
using System.Threading;

namespace Protest;
internal static class Backup {

    private static readonly object mutex;
    static Backup() {
        mutex = new object();
    }

    internal static byte[] Create(Dictionary<string, string> parameters, string origin) {
        if (parameters is null || !parameters.TryGetValue("name", out string name) || String.IsNullOrEmpty(name)) {
            name = $"backup-{DateTime.UtcNow.ToString(Data.DATE_FORMAT_FILE)}";
        }

        foreach (char c in Path.GetInvalidFileNameChars()) {
            name = name.Replace(c, '_');
        }

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
                    new DirectoryInfo(Data.DIR_RBAC)
                ];

                for (int i = 0; i < directories.Length; i++) {
                    if (directories[i].Exists) {
                        CopyAll(directories[i], new DirectoryInfo($"{copyDirectory.FullName}{Data.DELIMITER}{directories[i].Name}"));
                    }
                }

                ZipFile.CreateFromDirectory(copyDirectory.FullName, filename);
                copyDirectory.Delete(true);
            }

            Logger.Action(origin, $"Create backup: {name}");

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

    internal static byte[] Delete(Dictionary<string, string> parameters, string origin) {
        if (parameters is null) { return Data.CODE_FAILED.Array; }

        parameters.TryGetValue("name", out string name);
        if (String.IsNullOrEmpty(name)) { return Data.CODE_INVALID_ARGUMENT.Array; }

        string filename = $"{Data.DIR_BACKUP}{Data.DELIMITER}{name}";

        try {
            if (File.Exists(filename)) {
                File.Delete(filename);
                Logger.Action(origin, $"Delete backup: {name}");
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

    internal static byte[] Download(HttpListenerContext ctx, Dictionary<string, string> parameters, string origin) {
        if (parameters is null) { return Data.CODE_FAILED.Array; }
        
        parameters.TryGetValue("name", out string name);
        if (String.IsNullOrEmpty(name)) { return Data.CODE_INVALID_ARGUMENT.Array; }

        string filename = $"{Data.DIR_BACKUP}{Data.DELIMITER}{name}";

        if (!File.Exists(filename)) {
            return Data.CODE_FILE_NOT_FOUND.Array;
        }

        try {
            using FileStream fs = File.OpenRead(filename);
            ctx.Response.ContentLength64 = fs.Length;
            ctx.Response.SendChunked = false;
            ctx.Response.ContentType = System.Net.Mime.MediaTypeNames.Application.Octet;
            ctx.Response.AddHeader("Content-disposition", "attachment; filename=" + name);

            byte[] buffer = new byte[64 * 1024];
            int read;
            using (BinaryWriter bw = new BinaryWriter(ctx.Response.OutputStream)) {
                while ((read = fs.Read(buffer, 0, buffer.Length)) > 0) {
                    bw.Write(buffer, 0, read);
                    bw.Flush();
                }

                bw.Close();
            }

            ctx.Response.StatusCode = (int)HttpStatusCode.OK;
            ctx.Response.StatusDescription = "OK";
            ctx.Response.OutputStream.Close();

            Logger.Action(origin, $"Download backup: {name}");

            return null;
        }
        catch {
            return Data.CODE_FAILED.Array;
        }
    }

    internal static byte[] List() {
        DirectoryInfo directory = new DirectoryInfo(Data.DIR_BACKUP);
        if (!directory.Exists) return "{\"data\":{},\"length\":0}"u8.ToArray();

        FileInfo[] files = directory.GetFiles();

        StringBuilder builder = new StringBuilder();
        builder.Append("{\"data\":{");

        bool first = true;
        foreach (FileInfo file in files) {
            if (!first) builder.Append(',');

            builder.Append($"\"{Data.EscapeJsonText(file.Name)}\":{{");
            builder.Append($"\"name\":{{\"v\":\"{Data.EscapeJsonText(file.Name)}\"}},");
            builder.Append($"\"date\":{{\"v\":{file.CreationTimeUtc.Ticks}}},");
            builder.Append($"\"size\":{{\"v\":{file.Length}}}");
            builder.Append('}');

            first = false;
        }

        builder.Append("},");

        builder.Append($"\"length\":{files.Length}");

        builder.Append('}');

        return Encoding.UTF8.GetBytes(builder.ToString());
    }
}
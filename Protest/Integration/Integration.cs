using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Text;
using System.Text.Json;
using Protest.Http;

namespace Protest.Integration;

internal class Integration {

    public static byte[] GetStatus(HttpListenerContext ctx) {
        Dictionary<string, string> parameters = Listener.ParseQuery(ctx);

        try {
            if (!Directory.Exists(Data.DIR_INTEGRATION)) {
                return Data.CODE_FAILED.ToArray();
            }

            string[] match = new string[] { "entraid.json", "eset.json", "unifi.json", "sophos.json", "checkpoint.json" };

            DirectoryInfo dirInfo = new DirectoryInfo(Data.DIR_INTEGRATION);
            FileInfo[] files = dirInfo.GetFiles();

            Dictionary<string, bool> list = new Dictionary<string, bool>();

            for (int i = 0; i < files.Length; i++) {
                string filename = files[i].Name;
                if (!match.Contains(filename)) continue;
                list.Add(filename.Replace(".json", ""), true);
            }

            return JsonSerializer.SerializeToUtf8Bytes(list);
        }
        catch {
            return Data.CODE_FAILED.ToArray();
        }
    }

    public static byte[] Save(HttpListenerContext ctx, string origin) {
        Dictionary<string, string> parameters = Listener.ParseQuery(ctx);

        if (parameters is null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        if (!parameters.TryGetValue("category", out string category)) return Data.CODE_INVALID_ARGUMENT.Array;

        try {
            if (!Directory.Exists(Data.DIR_INTEGRATION)) {
                Directory.CreateDirectory(Data.DIR_INTEGRATION);
            }
        }
        catch {
            return Data.CODE_FAILED.Array;
        }

        switch (category.ToLower()) {
        case "eset": return Eset.SetApiCredentials(parameters);
        default    : return Data.CODE_INVALID_ARGUMENT.Array;
        }
    }

}
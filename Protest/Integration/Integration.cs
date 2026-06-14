using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Text;

namespace Protest.Integration;

internal class Integration {

    public static byte[] GetStatus(Dictionary<string, string> parameters) {
        return Encoding.UTF8.GetBytes("[]");
    }

    public static byte[] Save(HttpListenerContext ctx, Dictionary<string, string> parameters, string origin) {
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
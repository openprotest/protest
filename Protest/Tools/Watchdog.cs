using System.Collections.Generic;

namespace Protest.Tools;
internal class Watchdog {
    public static byte[] List(Dictionary<string, string> parameters) {
        if (parameters == null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        try {
            //TODO:
        }
        catch (Exception ex) {
            Logger.Error(ex);
            return Data.CODE_FAILED.Array;
        }

        return null;
    }

    public static byte[] Create(Dictionary<string, string> parameters, string initiator) {
        parameters.TryGetValue("name", out string name);
        parameters.TryGetValue("target", out string target);
        parameters.TryGetValue("port", out string port);
        parameters.TryGetValue("method", out string method);
        parameters.TryGetValue("keyword", out string keyword);
        parameters.TryGetValue("query", out string query);
        parameters.TryGetValue("rrType", out string rrType);
        parameters.TryGetValue("httpStatus", out string httpStatus);

        parameters.TryGetValue("interval", out string interval);
        parameters.TryGetValue("retries", out string retries);

        try {
            //TODO:
        }
        catch (Exception ex) {
            Logger.Error(ex);
            return Data.CODE_FAILED.Array;
        }
        finally {
            Logger.Action(initiator, $"Create a new watcher {""}");
        }

        return Data.CODE_OK.Array;
    }

    public static byte[] Delete(Dictionary<string, string> parameters, string initiator) {
        if (parameters == null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        parameters.TryGetValue("file", out string interval);

        try {
            //TODO:
        }
        catch (Exception ex) {
            Logger.Error(ex);
            return Data.CODE_FAILED.Array;
        }
        finally {
            Logger.Action(initiator, $"Delete watcher {""}");
        }

        return Data.CODE_OK.Array;
    }
}

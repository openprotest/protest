using System.Collections.Generic;
using System.Net.Sockets;
using System.Text;

namespace Protest.Proprietary.Printers;

internal static class Generic {
    public static byte[] PrintTestPage(Dictionary<string, string> parameters) {
        if (parameters is null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        if (parameters.TryGetValue("host", out string host)) {
            return PrintTestPage(host);
        }
        else {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }
    }

    public static byte[] PrintTestPage(string target) {
        string msg = "\r\n\r\n" +
            @"  _______        _     _____" + "\r\n" +
            @" |__   __|      | |   |  __ \" + "\r\n" +
            @"    | | ___  ___| |_  | |__) |_ _  __ _  ___" + "\r\n" +
            @"    | |/ _ \/ __| __| |  ___/ _` |/ _` |/ _ \" + "\r\n" +
            @"    | |  __/\__ \ |_  | |  | (_| | (_| |  __/" + "\r\n" +
            @"    |_|\___||___/\__| |_|   \__,_|\__, |\___|" + "\r\n" +
            @"                                   __/ |" + "\r\n" +
            @"                                  |___/" + "\r\n" +
            "\r\n" +
            "---------------------------------------------\r\n" +
            "  " + DateTime.Now.ToLongTimeString() + "\r\n" +
            "  " + DateTime.Now.ToLongDateString() + "\r\n" +
            "---------------------------------------------\r\n" +
            "\n\n\n\n\n\n\n\n" +
            "\x1Bm\0\0"; //cut

        byte[] data = Encoding.ASCII.GetBytes(msg);

        try {
            TcpClient client = new TcpClient();
            client.Connect(target, 9100);

            NetworkStream stream = client.GetStream();
            stream.Write(data, 0, data.Length);

            stream.Flush();
            stream.Close();
            client.Close();

        }
        catch (ArgumentNullException) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }
        catch (SocketException) {
            return Data.CODE_TCP_CONN_FAILURE.Array;
        }
        catch {
            return Data.CODE_FAILED.Array;
        }

        return Data.CODE_OK.Array;
    }
}
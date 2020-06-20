using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Sockets;
using System.Text;
using System.Threading.Tasks;

class PrintTools {
    public static byte[] PrintTestPage(string[] para) {
        string target = "";
        for (int i = 1; i < para.Length; i++)
            if (para[i].StartsWith("target=")) {
                target = para[i].Substring(7);
                break;
            }

        if (target.Length == 0) return Strings.INV.Array;

        return PrintTestPage(target);
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

        } catch (ArgumentNullException) {
            return Strings.INV.Array;
        } catch (SocketException) {
            return Strings.TCP.Array;
        } catch {
            return Strings.FAI.Array;
        }

        return Strings.OK.Array;
    }
}

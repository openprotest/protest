using System;
using System.IO;
using System.Linq;
using System.Net.NetworkInformation;
using System.Text;

public static class LastSeen {

    public static void Seen(string ip) {
        try {
            string filename = $"{Strings.DIR_LASTSEEN}\\{ip}.txt";
            File.WriteAllText(filename, DateTime.Now.ToString(Strings.DATETIME_FORMAT_LONG));
        } catch (Exception ex) {
            Logging.Err(ex);
        }
    }

    public static byte[] HasBeenSeen(string[] para, bool recordOnly = false) {
        string ip = null;
        for (int i = 1; i < para.Length; i++)
            if (para[i].StartsWith("ip=")) ip = para[i].Substring(3);

        return HasBeenSeen(ip, recordOnly);
    }

    public static byte[] HasBeenSeen(string ip, bool recordOnly = false) {
        if (ip is null) return Strings.INV.Array;

        if (!recordOnly)
            try {
                using System.Net.NetworkInformation.Ping p = new System.Net.NetworkInformation.Ping();
                if (p.Send(ip, 1000).Status == IPStatus.Success) {
                    Seen(ip);
                    return Encoding.UTF8.GetBytes("Just now");
                }
            } catch { }

        string filename = $"{Strings.DIR_LASTSEEN}\\{ip}.txt";

        try {
            if (File.Exists(filename))
                return File.ReadAllBytes(filename);
        } catch { }

        return Encoding.UTF8.GetBytes("Never");
    }

}
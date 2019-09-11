using System;
using System.IO;
using System.Net.NetworkInformation;
using System.Text;

static class LastSeen {
    static readonly string DIR_LASTSEEN = $"{Directory.GetCurrentDirectory()}\\lastseen";

    public static void Seen(string ip) {
        try {
            string filename = $"{DIR_LASTSEEN}\\{ip}.txt";
            File.WriteAllText(filename, DateTime.Now.ToString(NoSQL.DATETIME_FORMAT_LONG));
        } catch (Exception ex) {
            ErrorLog.Err(ex);
        }
    }

    public static byte[] HasBeenSeen(string[] para) {
        string ip = null;
        for (int i = 1; i < para.Length; i++)
            if (para[i].StartsWith("ip=")) ip = para[i].Substring(3);

        return HasBeenSeen(ip);
    }

    public static byte[] HasBeenSeen(string ip) {
        if (ip is null) return Tools.INV.Array;

        string filename = $"{DIR_LASTSEEN}\\{ip}.txt";

        try {
            Ping p = new Ping();
            if (p.Send(ip, 1000).Status == IPStatus.Success) {
                Seen(ip);
                return Encoding.UTF8.GetBytes("Just now");
            } 
        } catch { }

        try {
            if (File.Exists(filename))
            return File.ReadAllBytes(filename);
        } catch { }

        return Encoding.UTF8.GetBytes("Never");
    }

}
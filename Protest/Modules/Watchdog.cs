using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

public static class Watchdog {

    public static byte[] Settings(in string[] para, in string performer) {
        DirectoryInfo dirWatchdog = new DirectoryInfo(Strings.DIR_WATCHDOG);
        if (!dirWatchdog.Exists) dirWatchdog.Create();

        bool enable = true;
        string frequency = String.Empty;
        for (int i = 1; i < para.Length; i++)
            if (para[i].StartsWith("enable=")) enable = para[i].Substring(7) == "true";
            else if (para[i].StartsWith("frequency=")) frequency = para[i].Substring(10);

        Logging.Action(performer, $"Change watchdog settings");
        return Strings.OK.Array;
    }

    public static byte[] Add(in string[] para, in string performer) {
        DirectoryInfo dirWatchdog = new DirectoryInfo(Strings.DIR_WATCHDOG);
        if (!dirWatchdog.Exists) dirWatchdog.Create();

        string host  = String.Empty;
        string proto = String.Empty;
        string port  = String.Empty;
        for (int i = 1; i < para.Length; i++)
            if (para[i].StartsWith("host=")) host = para[i].Substring(5);
            else if (para[i].StartsWith("proto=")) proto = para[i].Substring(6);
            else if (para[i].StartsWith("port=")) port = para[i].Substring(5);

        if (host.Length == 0 || proto.Length == 0) return Strings.INF.Array;
        if (proto == "tcp" && port.Length == 0) return Strings.INF.Array;

        string filename = $"{host} {proto}{(proto=="tcp"?port:String.Empty)}";

        try {
            DirectoryInfo dir = new DirectoryInfo($"{Strings.DIR_WATCHDOG}\\{filename}");
            if (!dir.Exists) dir.Create();
        } catch (Exception ex) {
            return Encoding.UTF8.GetBytes(ex.Message);
        }

        Logging.Action(performer, $"Add watchdog entry: {filename}");
        return Strings.OK.Array;
    }

    public static byte[] Remove(in string[] para, in string performer) {
        DirectoryInfo dirWatchdog = new DirectoryInfo(Strings.DIR_WATCHDOG);
        if (!dirWatchdog.Exists) return Strings.FLE.Array;

        string name = String.Empty;
        for (int i = 1; i < para.Length; i++)
            if (para[i].StartsWith("name=")) name = para[i].Substring(5);

        if (name.Length == 0) return Strings.INF.Array;

        try {
            DirectoryInfo dir = new DirectoryInfo($"{Strings.DIR_WATCHDOG}\\{name}");
            if (dir.Exists) dir.Delete();
        } catch (Exception ex) {
            return Encoding.UTF8.GetBytes(ex.Message);
        }

        Logging.Action(performer, $"Remove watchdog entry: {name}");
        return Strings.OK.Array;
    }

    public static byte[] Get(in string[] para, in string performer) {
        DirectoryInfo dirWatchdog = new DirectoryInfo(Strings.DIR_WATCHDOG);
        if (!dirWatchdog.Exists) return Strings.FAI.Array;





        return null;
    }

}

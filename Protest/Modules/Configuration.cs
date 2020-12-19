using System;
using System.IO;
using System.Linq;
using System.Text;
using Renci.SshNet;

public static class Configuration {

    public static byte[] GetConfig(in string[] para) {
        string file = null;
        for (int i = 1; i < para.Length; i++)
            if (para[i].StartsWith("file=")) file = Strings.DecodeUrl(para[i].Substring(5));
        
        try {
            return File.ReadAllBytes($"{Strings.DIR_CONFIG}\\{file}");
        } catch { }

        return null;
    }

    public static byte[] FetchConfiguration(in string[] para, in string performer) {
        string file = null, username = null, password = null;
        for (int i = 1; i < para.Length; i++) {
            if (para[i].StartsWith("file=")) file = Strings.DecodeUrl(para[i].Substring(5));
            if (para[i].StartsWith("user=")) username = Strings.DecodeUrl(para[i].Substring(5));
            if (para[i].StartsWith("pass=")) password = Strings.DecodeUrl(para[i].Substring(5));
        }

        if (file is null || file.Length == 0) return Strings.INV.Array;
        if (!Database.equip.ContainsKey(file)) return Strings.FLE.Array;

        Database.DbEntry entry = (Database.DbEntry)Database.equip[file];
        if (!entry.hash.ContainsKey("IP")) return Strings.INF.Array;

        string host = ((string[])entry.hash["IP"])[0];
        if (host.IndexOf(";") > -1) host = host.Split(';')[0].Trim();

        if (host.Length == 0) { //if ip is null, use hostname
            host = ((string[])entry.hash["HOSTNAME"])[0];
            if (host.IndexOf(";") > -1) host = host.Split(';')[0].Trim();
            host = System.Net.Dns.GetHostAddresses(host)[0].ToString();
        }

        if (host is null || host.Length == 0) return Strings.INF.Array;

        string[] overwriteProto = null;
        if (entry.hash.ContainsKey(".OVERWRITEPROTOCOL"))
            overwriteProto = ((string[])entry.hash[".OVERWRITEPROTOCOL"])[0].Trim().Split(';');
        else if (entry.hash.ContainsKey("OVERWRITEPROTOCOL"))
            overwriteProto = ((string[])entry.hash["OVERWRITEPROTOCOL"])[0].Trim().Split(';');

        int port = 22;
        for (int i = 0; i < overwriteProto?.Length; i++) {
            overwriteProto[i] = overwriteProto[i].Trim();
            if (!overwriteProto[i].StartsWith("ssh:")) continue;
            Int32.TryParse(overwriteProto[i].Substring(4), out port);
            break;
        }
        
        if (entry.hash.ContainsKey("USERNAME"))
            username = ((string[])entry.hash["USERNAME"])[0].Split(';')[0].Trim();

        if (entry.hash.ContainsKey("PASSWORD"))
            password = ((string[])entry.hash["PASSWORD"])[0].Split(';')[0].Trim();

        if (username is null || username.Length == 0) return Strings.INF.Array;
        if (password is null) return Strings.INF.Array;

        SshClient ssh = new SshClient(port == 22 ? host : $"{host}:{port}", username, password);
        
        ssh.Connect();

        string payload = ssh.RunCommand("/ export").Execute();

        byte[] result = Encoding.UTF8.GetBytes(FormatRouterOs(payload));

        File.WriteAllBytes($"{Strings.DIR_CONFIG}\\{file}", result);

        return result;
    }

    public static string FormatRouterOs(string payload) {
        StringBuilder sb = new StringBuilder();

        string[] split = payload.Split('\n');
        for (int i = 0; i < split.Length; i++) {
            split[i] = split[i].Trim();
            if (split[i].EndsWith("\\")) {
                sb.Append(split[i].Substring(0, split[i].Length - 1));
            } else {
                sb.Append(split[i]);
                sb.AppendLine();
            }
        }

        return sb.ToString();
    }

    public static string FormatCisco(string payload) {
        return payload;
    }
}
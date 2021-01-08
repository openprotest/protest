using System;
using System.IO;
using System.Linq;
using System.Net;
using System.Text;
using Renci.SshNet;

public static class Configuration {

    private enum DeviceType {
        unknown  = -1,
        cisco    = 1,
        hpe      = 2,
        mikrotik = 4
    }

    public static byte[] GetConfig(in string[] para, bool serveGZip = false) {
        string file = null;
        for (int i = 1; i < para.Length; i++)
            if (para[i].StartsWith("file=")) file = Strings.DecodeUrl(para[i].Substring(5));
        
        try {
            byte[] bytes = File.ReadAllBytes($"{Strings.DIR_CONFIG}\\{file}");

            byte[] gzip = CryptoAes.Decrypt(bytes, Program.DB_KEY_A, Program.DB_KEY_B);
            if (serveGZip) return gzip;

            byte[] plain = Cache.UnGZip(gzip);
            return plain;
        } catch { }

        return null;
    }

    public static byte[] FetchConfiguration(in HttpListenerContext ctx, in string[] para, in string performer, bool serveGZip = false) {
        string file = null, username = null, password = null;
        for (int i = 1; i < para.Length; i++)
            if (para[i].StartsWith("file=")) file = Strings.DecodeUrl(para[i].Substring(5));

        if (file is null || file.Length == 0) return Strings.INV.Array;
        if (!Database.equip.ContainsKey(file)) return Strings.FLE.Array;

        Database.DbEntry entry = (Database.DbEntry)Database.equip[file];
        if (!entry.hash.ContainsKey("IP")) return Strings.INF.Array;

        using (StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding)) {
            string payload = reader.ReadToEnd().Trim();
            string[] split = payload.Split((char)127);
            if (split.Length == 2) {
                username = split[0];
                password = split[1];
            }
        }

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

        if (username is null || username.Length == 0) {
            if (entry.hash.ContainsKey("SSH USERNAME"))
                username = ((string[])entry.hash["SSH USERNAME"])[0].Split(';')[0].Trim();
            if (entry.hash.ContainsKey("SSH PASSWORD"))
                password = ((string[])entry.hash["SSH PASSWORD"])[0].Split(';')[0].Trim();
        }

        if (username is null || username.Length == 0) {
            if (entry.hash.ContainsKey("USERNAME"))
                username = ((string[])entry.hash["USERNAME"])[0].Split(';')[0].Trim();
            if (entry.hash.ContainsKey("PASSWORD"))
                password = ((string[])entry.hash["PASSWORD"])[0].Split(';')[0].Trim();
        }

        if (username is null || username.Length == 0) return Strings.INF.Array;
        if (password is null) return Strings.INF.Array;

        try {
            SshClient ssh = new SshClient(port == 22 ? host : $"{host}:{port}", username, password);
            ssh.Connect();

            string payload;
            string firstLine;                

            payload = ssh.RunCommand("show running-config").Execute();
            firstLine = payload.Split('\n')[0];
            if (firstLine.Trim() != "^" && firstLine.IndexOf("bad command name") == -1) { //cisco
                byte[] plain = Encoding.UTF8.GetBytes(payload);
                byte[] gzip = Cache.GZip(plain);
                byte[] cipher = CryptoAes.Encrypt(gzip, Program.DB_KEY_A, Program.DB_KEY_B);
                File.WriteAllBytes($"{Strings.DIR_CONFIG}\\{file}", cipher);
                return serveGZip ? gzip : plain;
            }

            payload = ssh.RunCommand("display current-configuration").Execute();
            firstLine = payload.Split('\n')[0];
            if (firstLine.Trim() != "^" && firstLine.IndexOf("bad command name") == -1) { //hpe
                byte[] plain = Encoding.UTF8.GetBytes(payload);
                byte[] gzip = Cache.GZip(plain);
                byte[] cipher = CryptoAes.Encrypt(gzip, Program.DB_KEY_A, Program.DB_KEY_B);
                File.WriteAllBytes($"{Strings.DIR_CONFIG}\\{file}", cipher);
                return serveGZip ? gzip : plain;
            }

            payload = ssh.RunCommand("/ export").Execute();
            firstLine = payload.Split('\n')[0];
            if (firstLine.Trim() != "^") { //mikrotik
                byte[] plain = Encoding.UTF8.GetBytes(FormatRouterOs(payload));
                byte[] gzip = Cache.GZip(plain);
                byte[] cipher = CryptoAes.Encrypt(gzip, Program.DB_KEY_A, Program.DB_KEY_B);
                File.WriteAllBytes($"{Strings.DIR_CONFIG}\\{file}", cipher);
                return serveGZip ? gzip : plain;
            }

        } catch { }

        return null;
    }

    private static string FormatRouterOs(in string payload) {
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

}
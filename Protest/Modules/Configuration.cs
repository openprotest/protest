using System;
using System.IO;
using System.Linq;
using System.Net;
using System.Text;
using System.Collections.Generic;
using Renci.SshNet;
using System.Text.RegularExpressions;

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

    public static byte[] SetConfig(in HttpListenerContext ctx, in string[] para) {
        string file = null;
        for (int i = 1; i < para.Length; i++)
            if (para[i].StartsWith("file=")) file = Strings.DecodeUrl(para[i].Substring(5));

        if (file is null || file.Length == 0)
            return Strings.INF.Array;

        using StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding);
        string payload = reader.ReadToEnd();

        byte[] plain = Encoding.UTF8.GetBytes(FormatRouterOs(payload));
        byte[] gzip = Cache.GZip(plain);
        byte[] cipher = CryptoAes.Encrypt(gzip, Program.DB_KEY_A, Program.DB_KEY_B);
        File.WriteAllBytes($"{Strings.DIR_CONFIG}\\{file}", cipher);

        return Strings.OK.Array;
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

                Logging.Action(performer, $"Fetch device configuration for {host}");

                return serveGZip ? gzip : plain;
            }

            payload = ssh.RunCommand("display current-configuration").Execute();
            firstLine = payload.Split('\n')[0];
            if (firstLine.Trim() != "^" && firstLine.IndexOf("bad command name") == -1) { //hpe
                byte[] plain = Encoding.UTF8.GetBytes(payload);
                byte[] gzip = Cache.GZip(plain);
                byte[] cipher = CryptoAes.Encrypt(gzip, Program.DB_KEY_A, Program.DB_KEY_B);
                File.WriteAllBytes($"{Strings.DIR_CONFIG}\\{file}", cipher);

                Logging.Action(performer, $"Fetch device configuration for {host}");

                return serveGZip ? gzip : plain;
            }

            payload = ssh.RunCommand("/ export").Execute();
            firstLine = payload.Split('\n')[0];
            if (firstLine.Trim() != "^") { //mikrotik
                byte[] plain = Encoding.UTF8.GetBytes(FormatRouterOs(payload));
                byte[] gzip = Cache.GZip(plain);
                byte[] cipher = CryptoAes.Encrypt(gzip, Program.DB_KEY_A, Program.DB_KEY_B);
                File.WriteAllBytes($"{Strings.DIR_CONFIG}\\{file}", cipher);

                Logging.Action(performer, $"Fetch device configuration for {host}");

                return serveGZip ? gzip : plain;
            }

        } catch { }

        return null;
    }

    public static byte[] GetInterfaces(in string[] para) {
        string file = null;
        for (int i = 1; i < para.Length; i++)
            if (para[i].StartsWith("file=")) file = Strings.DecodeUrl(para[i].Substring(5));

        if (file is null || file.Length == 0)
            return Encoding.UTF8.GetBytes($"{{\"error\":\"{Encoding.UTF8.GetString(Strings.INF.Array)}\"}}");

        string absolutePath = $"{Strings.DIR_CONFIG}\\{file}";
        if (!File.Exists(absolutePath))
            return Encoding.UTF8.GetBytes($"{{\"error\":\"configuration file does not exists\"}}");

        string[] lines;
        try {
            byte[] bytes = File.ReadAllBytes(absolutePath);
            byte[] gzip = CryptoAes.Decrypt(bytes, Program.DB_KEY_A, Program.DB_KEY_B);
            byte[] plain = Cache.UnGZip(gzip);
            lines = Encoding.UTF8.GetString(plain).Split('\n');
        } catch {
            return Encoding.UTF8.GetBytes($"{{\"error\":\"{Encoding.UTF8.GetString(Strings.FAI.Array)}\"}}");
        }

        List<string[]> interfaces = new List<string[]>();

        int lastEther = 0, lastSfp = 0;
        bool isSubinterface = false;
        string currentInt = null;
        string currentSpeed = "N/A";
        string currentVlan = "";
        string currentComment = "";

        for (int i = 0; i < lines.Length; i++) {
            lines[i] = lines[i].Trim();

            if (lines[i].StartsWith("set [ find default-name=", StringComparison.OrdinalIgnoreCase)) { //mikrotik interface                
                Match intMatch = Regex.Match(lines[i], "default-name=[\"']?(\\w+\\s?)+[\"']?", RegexOptions.IgnoreCase);
                string defname = intMatch.Value.Replace("default-name=", "");
                if (defname.IndexOf("\"") == -1) defname = defname.Split(' ')[0];
                if (defname.StartsWith("\"") && defname.EndsWith("\"")) defname = defname.Substring(1, defname.Length - 2);

                string interf;
                if (defname.IndexOf("ether") > -1) {
                    interf = "Ethernet";
                    if (Int32.TryParse(defname.Replace("ether", ""),  out int ether)) {
                        if (lastEther + 1 < ether)
                            for (int j = lastEther+1; j < ether; j++)
                                interfaces.Add(new string[] { "Ethernet", "N/A", "", "" });
                        lastEther = ether;
                    }

                } else if (defname.IndexOf("sfp") > -1) {
                    interf = "SFP";
                    if (Int32.TryParse(defname.Replace("sfp", ""), out int sfp)) {
                        if (lastSfp + 1 < sfp)
                            for (int j = lastEther+1; j < sfp; j++)
                                interfaces.Add(new string[] { "SFP", "N/A", "", "" });
                        lastSfp = sfp;
                    }

                } else {
                    interf = "Ethernet";
                }

                Match speedMatch = Regex.Match(lines[i], @"speed=\""?(\w+\s?)+\""?", RegexOptions.IgnoreCase);
                string speed = speedMatch.Value.Replace("speed=", "");
                if (speed.IndexOf("\"") == -1) speed = speed.Split(' ')[0];
                if (speed.StartsWith("\"") && speed.EndsWith("\"")) speed = speed.Substring(1, speed.Length - 2);
                speed = FormarRouterOsSpeed(speed);

                if (speedMatch.Value?.Length > 0)
                lines[i] = lines[i].Replace(speedMatch.Value, String.Empty);

                if (speed is null || speed == "N/A" || speed == "") //default value for Mikrotik is 1 Gbps
                    speed = "1 Gbps";

                Match commentMatch = Regex.Match(lines[i], @"comment=\""?(.*)+\""?", RegexOptions.IgnoreCase);
                string comment = commentMatch.Value.Replace("comment=", "");
                if (comment.IndexOf("\"") == -1) comment = comment.Split(' ')[0];
                comment = comment.Trim();
                if (comment.StartsWith("\"") && comment.EndsWith("\"")) comment = comment.Substring(1, comment.Length - 2);

                interfaces.Add(new string[] {
                    interf ?? "Ethernet",
                    speed ?? "N/A",
                    "",
                    comment ?? ""
                });
            }

            //cisco and hpe interface
            if (lines[i].StartsWith("interface", StringComparison.OrdinalIgnoreCase)) {
                
                if (!isSubinterface && currentInt != null) {
                    interfaces.Add(new string[] {
                        currentInt,
                        currentSpeed,
                        currentVlan,
                        currentComment
                    });
                }

                isSubinterface = lines[i].IndexOf('.') > -1;
                //currentInt = null;
                //currentSpeed = "N/A";
                currentVlan = "";
                currentComment = "";

                if (lines[i].IndexOf("ethernet", StringComparison.OrdinalIgnoreCase) > -1) {
                    currentInt = "Ethernet";

                } else if (lines[i].IndexOf("serial", StringComparison.OrdinalIgnoreCase) > -1) {
                    currentInt = "Serial";

                } else if (lines[i].IndexOf("aux", StringComparison.OrdinalIgnoreCase) > -1) {
                    currentInt = "Ethernet";
                    currentComment = "Auxiliary";

                } else if (lines[i].IndexOf("null0", StringComparison.OrdinalIgnoreCase) > -1) {
                    currentInt = "Ethernet";
                    currentComment = "Null interface";

                } else {
                    currentInt = "Ethernet";
                }

                if (lines[i].IndexOf("gigabitethernet", StringComparison.OrdinalIgnoreCase) > -1) { //1000 Mbps
                    currentSpeed = "1 Gbps";
                } else if (lines[i].IndexOf("fastethernet", StringComparison.OrdinalIgnoreCase) > -1) { //100 Mbps
                    currentSpeed = "100 Mbps";
                } else if (lines[i].IndexOf("ethernet", StringComparison.OrdinalIgnoreCase) > -1) { //10 Mbps
                    currentSpeed = "10 Mbps";
                //} else if (lines[i].IndexOf("aux", StringComparison.OrdinalIgnoreCase) > -1) {
                //    currentSpeed = "N/A";
                //} else if (lines[i].IndexOf("serial", StringComparison.OrdinalIgnoreCase) > -1) {
                //    currentSpeed = "N/A";
                } else {
                    currentSpeed = "N/A";
                }
            }

            if (lines[i].StartsWith("switchport access vlan ", StringComparison.OrdinalIgnoreCase)) {
                string vlan = lines[i].Substring(23);
                if (Int32.TryParse(vlan, out _))
                    currentVlan = vlan;

            } else if (lines[i].ToLower() == "switchport mode trunk") {
                currentVlan = "TRUNK";
            }

            //overwrites default interface speed
            if (lines[i].StartsWith("speed", StringComparison.OrdinalIgnoreCase)) {
                string speed = lines[i].ToLower();
                if (!speed.EndsWith("auto")) currentSpeed = FormatCiscoSpeed(speed);
            }
            
            if (lines[i].StartsWith("description", StringComparison.OrdinalIgnoreCase)) {
                string description = lines[i].Substring(11).Trim();
                if (description.StartsWith("\"") && description.EndsWith("\""))
                    description = description.Substring(1, description.Length - 2);
                currentComment = description;
            }
        }

        if (!isSubinterface && currentInt != null) {
            interfaces.Add(new string[] {
                currentInt,
                currentSpeed,
                currentVlan,
                currentComment
            });
        }

        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < interfaces.Count; i++) {
            if (sb.Length != 1) sb.Append(",");
            sb.Append("{");
            sb.Append($"\"port\":\"{interfaces[i][0].Replace("\"", "\\\"")}\",");
            sb.Append($"\"speed\":\"{interfaces[i][1].Replace("\"", "\\\"")}\",");
            sb.Append($"\"vlan\":\"{interfaces[i][2].Replace("\"", "\\\"")}\",");
            sb.Append($"\"comment\":\"{interfaces[i][3].Replace("\"", "\\\"")}\"");
            sb.Append("}");
        }
        sb.Append("]");

        return Encoding.UTF8.GetBytes(sb.ToString());
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

    private static string FormarRouterOsSpeed(in string speed) {
        return speed.ToLower() switch {
            "10mbps"   => "10 Mbps",
            "100mbps"  => "100 Mbps",
            "1000mbps" => "1 Gpbs",
            "2500mbps" => "2.5 Gpbs",
            "5gbps"    => "5 Gpbs",
            "10gbps"   => "10 Gbps",
            "25gbps"   => "25 Gbps",
            "40gbps"   => "40 Gbps",
            "100gbps"  => "100 Gbps",
            "200gbps"  => "200 Gbps",
            "400gbps"  => "400 Gbps",
            "800gbps"  => "800 Gbps",
            _ => "N/A"
        };
    }

    private static string FormatCiscoSpeed(in string speed) {
        return speed switch {
            "speed 10"     => "10 Mbps",
            "speed 100"    => "100 Mbps",
            "speed 1000"   => "1 Gpbs",
            "speed 2500"   => "2.5 Gpbs",
            "speed 5000"   => "5 Gpbs",
            "speed 10000"  => "10 Gbps",
            "speed 25000"  => "25 Gbps",
            "speed 40000"  => "40 Gbps",
            "speed 100000" => "100 Gbps",
            "speed 200000" => "200 Gbps",
            "speed 400000" => "400 Gbps",
            "speed 800000" => "800 Gbps",
            _ => "N/A"
        };
    }
}
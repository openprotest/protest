using Renci.SshNet;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;

namespace Protest;
internal static partial class DeviceConfiguration {
    public static byte[] View(Dictionary<string, string> parameters) {
        if (parameters is null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        parameters.TryGetValue("file", out string file);
        if (string.IsNullOrEmpty(file)) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        try {
            byte[] bytes = File.ReadAllBytes($"{Data.DIR_CONFIG}{Data.DELIMITER}{file}");
            byte[] plain = Cryptography.Decrypt(bytes, Configuration.DB_KEY, Configuration.DB_KEY_IV);

            byte[] unzipped = Http.Cache.UnGZip(plain);
            return unzipped;
        }
        catch { }

        return null;
    }

    public static byte[] Save(Dictionary<string, string> parameters, HttpListenerContext ctx, string initiator) {
        if (parameters is null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }
        
        parameters.TryGetValue("file", out string file);
        if (string.IsNullOrEmpty(file)) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding);
        string payload = reader.ReadToEnd();

        byte[] plain = Encoding.UTF8.GetBytes(FormatRouterOs(payload));
        byte[] gzip = Http.Cache.GZip(plain);
        byte[] cipher = Cryptography.Encrypt(gzip, Configuration.DB_KEY, Configuration.DB_KEY_IV);
        File.WriteAllBytes($"{Data.DIR_CONFIG}{Data.DELIMITER}{file}", cipher);

        Logger.Action(initiator, $"Modify the device conficuration for file: {file}");

        return Data.CODE_OK.Array;
    }

    public static byte[] Fetch(Dictionary<string, string> parameters, HttpListenerContext ctx, string initiator) {
        if (parameters is null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        parameters.TryGetValue("file", out string file);
        if (string.IsNullOrEmpty(file)) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        string username = null, password = null;
        using (StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding)) {
            string payload = reader.ReadToEnd().Trim();
            string[] split = payload.Split((char)127);
            if (split.Length == 2) {
                username = split[0];
                password = split[1];
            }
        }

        DatabaseInstances.devices.dictionary.TryGetValue(file, out Database.Entry entry);

        if (!entry.attributes.TryGetValue("ip", out Database.Attribute ipAttr)) {
            return Data.CODE_NOT_ENOUGH_INFO.Array;
        }

        string host = ipAttr.value.Split(";")[0].Trim();
        if (String.IsNullOrEmpty(host)) {
            return Data.CODE_NOT_ENOUGH_INFO.Array;
        }


        Database.Attribute overwriteProtoAttr;
        string[] overwriteProto = null;
        if (entry.attributes.TryGetValue(".overwriteprotocol", out overwriteProtoAttr)) {
            overwriteProto = overwriteProtoAttr.value.Split(";");
        }
        else if (entry.attributes.TryGetValue("overwriteprotocol", out overwriteProtoAttr)) {
            overwriteProto = overwriteProtoAttr.value.Split(";");
        }

        int port = 22;
        for (int i = 0; i < overwriteProto?.Length; i++) {
            overwriteProto[i] = overwriteProto[i].Trim();
            if (!overwriteProto[i].StartsWith("ssh:")) {
                continue;
            }
            Int32.TryParse(overwriteProto[i][4..], out port);
            break;
        }

        if (String.IsNullOrEmpty(username)) {
            if (entry.attributes.TryGetValue("ssh username", out Database.Attribute usernameAttr)) {
                username = usernameAttr.value;
            }
            if (entry.attributes.TryGetValue("ssh password", out Database.Attribute passwordAttr)) {
                password = passwordAttr.value;
            }
        }

        if (String.IsNullOrEmpty(username)) {
            if (entry.attributes.TryGetValue("username", out Database.Attribute usernameAttr)) {
                username = usernameAttr.value;
            }
            if (entry.attributes.TryGetValue("password", out Database.Attribute passwordAttr)) {
                password = passwordAttr.value;
            }
        }

        if (String.IsNullOrEmpty(username)) {
            return Data.CODE_NOT_ENOUGH_INFO.Array;
        }

        try {
            SshClient ssh = new SshClient(port == 22 ? host : $"{host}:{port}", username, password);
            ssh.Connect();

            string payload;
            string firstLine;

            payload = ssh.RunCommand("show running-config").Execute();
            firstLine = payload.Split('\n')[0];
            if (firstLine.Trim() != "^" && !firstLine.Contains("bad command name", StringComparison.Ordinal)) { //cisco
                byte[] plain = Encoding.UTF8.GetBytes(payload);
                byte[] gzip = Http.Cache.GZip(plain);
                byte[] cipher = Cryptography.Encrypt(gzip, Configuration.DB_KEY, Configuration.DB_KEY_IV);
                File.WriteAllBytes($"{Data.DIR_CONFIG}{Data.DELIMITER}{file}", cipher);

                Logger.Action(initiator, $"Fetch device configuration for file: {host}");

                return plain;
            }

            payload = ssh.RunCommand("display current-configuration").Execute();
            firstLine = payload.Split('\n')[0];
            if (firstLine.Trim() != "^" && !firstLine.Contains("bad command name", StringComparison.Ordinal)) { //hpe
                byte[] plain = Encoding.UTF8.GetBytes(payload);
                byte[] gzip = Http.Cache.GZip(plain);
                byte[] cipher = Cryptography.Encrypt(gzip, Configuration.DB_KEY, Configuration.DB_KEY_IV);
                File.WriteAllBytes($"{Data.DIR_CONFIG}{Data.DELIMITER}{file}", cipher);

                Logger.Action(initiator, $"Fetch device configuration for file: {host}");

                return plain;
            }

            payload = ssh.RunCommand("/ export").Execute();
            firstLine = payload.Split('\n')[0];
            if (firstLine.Trim() != "^") { //mikrotik
                byte[] plain = Encoding.UTF8.GetBytes(FormatRouterOs(payload));
                byte[] gzip = Http.Cache.GZip(plain);
                byte[] cipher = Cryptography.Encrypt(gzip, Configuration.DB_KEY, Configuration.DB_KEY_IV);
                File.WriteAllBytes($"{Data.DIR_CONFIG}{Data.DELIMITER}{file}", cipher);

                Logger.Action(initiator, $"Fetch device configuration for file: {host}");

                return plain;
            }

            return null;
        }
        catch {
            return null;
        }
    }


    [GeneratedRegex("default-name=[\"']?(\\w+\\s?)+[\"']?", RegexOptions.IgnoreCase, "en-US")]
    private static partial Regex DefaultNameRegex();
    
    [GeneratedRegex("speed=\\\"?(\\w+\\s?)+\\\"?", RegexOptions.IgnoreCase, "en-US")]
    private static partial Regex SpeedRegex();
    
    [GeneratedRegex("comment=\\\"?(.*)+\\\"?", RegexOptions.IgnoreCase, "en-US")]
    private static partial Regex CommentRegex();

    public static byte[] ExtractInterfaces(Dictionary<string, string> parameters) {
        if (parameters is null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        parameters.TryGetValue("file", out string file);
        if (string.IsNullOrEmpty(file)) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        string absolutePath = $"{Data.DIR_CONFIG}{Data.DELIMITER}{file}";
        if (!File.Exists(absolutePath)) {
            return "{\"error\":\"configuration file does not exists\"}"u8.ToArray();
        }

        string[] lines;
        try {
            byte[] bytes = File.ReadAllBytes(absolutePath);
            byte[] gzip = Cryptography.Decrypt(bytes, Configuration.DB_KEY, Configuration.DB_KEY_IV);
            byte[] plain = Http.Cache.UnGZip(gzip);
            lines = Encoding.UTF8.GetString(plain).Split('\n');
        }
        catch {
            return Data.CODE_FAILED.Array;
        }


        List<string[]> interfaces = new List<string[]>();

        int lastEther = 0, lastSfp = 0;
        bool isSubinterface = false;
        string currentInt = null;
        string currentSpeed = "N/A";
        string currentVlan = String.Empty;
        string currentComment = String.Empty;

        for (int i = 0; i < lines.Length; i++) {
            lines[i] = lines[i].Trim();
            lines[i] = lines[i].Replace("\x2002", " ");

            if (lines[i].StartsWith("set [ find default-name=", StringComparison.OrdinalIgnoreCase)) { //mikrotik interface
                Match intMatch = DefaultNameRegex().Match(lines[i]);
                string defname = intMatch.Value.Replace("default-name=", String.Empty);
                if (!defname.Contains('"', StringComparison.Ordinal)) {
                    defname = defname.Split(' ')[0];
                }
                if (defname.StartsWith("\"") && defname.EndsWith("\"")) {
                    defname = defname[1..^1];
                }

                string interf;
                if (defname.IndexOf("ether") > -1) {
                    interf = "Ethernet";
                    if (int.TryParse(defname.Replace("ether", String.Empty), out int ether)) {
                        if (lastEther + 1 < ether)
                            for (int j = lastEther + 1; j < ether; j++)
                                interfaces.Add(new string[] { "Ethernet", "N/A", String.Empty, String.Empty });
                        lastEther = ether;
                    }

                }
                else if (defname.IndexOf("sfp") > -1) {
                    interf = "SFP";
                    if (int.TryParse(defname.Replace("sfp", String.Empty), out int sfp)) {
                        if (lastSfp + 1 < sfp)
                            for (int j = lastSfp + 1; j < sfp; j++)
                                interfaces.Add(new string[] { "SFP", "N/A", String.Empty, String.Empty });
                        lastSfp = sfp;
                    }
                }
                else {
                    interf = "Ethernet";
                }

                Match speedMatch = SpeedRegex().Match(lines[i]);
                string speed = speedMatch.Value.Replace("speed=", String.Empty);
                if (!speed.Contains('"', StringComparison.Ordinal)) {
                    speed = speed.Split(' ')[0];
                }
                if (speed.StartsWith("\"") && speed.EndsWith("\"")) {
                    speed = speed[1..^1];
                }
                speed = FormarRouterOsSpeed(speed);

                if (speedMatch.Value?.Length > 0) {
                    lines[i] = lines[i].Replace(speedMatch.Value, string.Empty);
                }

                if (speed is null || speed == "N/A" || speed == String.Empty) {//default value for Mikrotik is 1 Gbps
                    speed = "1 Gbps";
                }
                Match commentMatch = CommentRegex().Match(lines[i]);
                string comment = commentMatch.Value.Replace("comment=", String.Empty);
                if (!comment.Contains('"', StringComparison.Ordinal)) {
                    comment = comment.Split(' ')[0];
                }
                comment = comment.Trim();
                
                if (comment.StartsWith("\"") && comment.EndsWith("\"")) {
                    comment = comment[1..^1];
                }

                interfaces.Add(new string[] {
                    interf ?? "Ethernet",
                    speed ?? "N/A",
                    String.Empty,
                    comment ?? String.Empty
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
                currentVlan = String.Empty;
                currentComment = String.Empty;

                if (lines[i].IndexOf("ethernet", StringComparison.OrdinalIgnoreCase) > -1) {
                    currentInt = "Ethernet";
                }
                else if (lines[i].IndexOf("serial", StringComparison.OrdinalIgnoreCase) > -1) {
                    currentInt = "Serial";
                }
                else if (lines[i].IndexOf("aux", StringComparison.OrdinalIgnoreCase) > -1) {
                    currentInt = "Ethernet";
                    currentComment = "Auxiliary";
                }
                else if (lines[i].IndexOf("null0", StringComparison.OrdinalIgnoreCase) > -1) {
                    currentInt = "Ethernet";
                    currentComment = "Null interface";
                }
                else {
                    currentInt = "Ethernet";
                }

                if (lines[i].IndexOf("gigabitethernet", StringComparison.OrdinalIgnoreCase) > -1) { //1000 Mbps
                    currentSpeed = "1 Gbps";
                }
                else if (lines[i].IndexOf("fastethernet", StringComparison.OrdinalIgnoreCase) > -1) { //100 Mbps
                    currentSpeed = "100 Mbps";
                }
                else if (lines[i].IndexOf("ethernet", StringComparison.OrdinalIgnoreCase) > -1) { //10 Mbps
                    currentSpeed = "10 Mbps";
                }
                /*else if (lines[i].IndexOf("aux", StringComparison.OrdinalIgnoreCase) > -1) {
                    currentSpeed = "N/A";
                }
                else if (lines[i].IndexOf("serial", StringComparison.OrdinalIgnoreCase) > -1) {
                    currentSpeed = "N/A";
                }*/
                else {
                    currentSpeed = "N/A";
                }
            }

            if (lines[i].StartsWith("switchport access vlan ", StringComparison.OrdinalIgnoreCase)) {
                string vlan = lines[i][23..];
                if (int.TryParse(vlan, out _)) {
                    currentVlan = vlan;
                }
            }
            else if (lines[i].ToLower() == "switchport mode trunk") {
                currentVlan = "TRUNK";
            }

            //overwrites default interface speed
            if (lines[i].StartsWith("speed", StringComparison.OrdinalIgnoreCase)) {
                string speed = lines[i].ToLower();
                if (!speed.EndsWith("auto")) {
                    currentSpeed = FormatCiscoSpeed(speed);
                }
            }

            if (lines[i].StartsWith("description", StringComparison.OrdinalIgnoreCase)) {
                string description = lines[i][11..].Trim();
                if (description.StartsWith("\"") && description.EndsWith("\"")) {
                    description = description[1..^1];
                }

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

        StringBuilder builder = new StringBuilder("[");
        for (int i = 0; i < interfaces.Count; i++) {
            if (builder.Length != 1) builder.Append(',');
            builder.Append('{');
            builder.Append($"\"port\":\"{interfaces[i][0].Replace("\"", "\\\"")}\",");
            builder.Append($"\"speed\":\"{interfaces[i][1].Replace("\"", "\\\"")}\",");
            builder.Append($"\"vlan\":\"{interfaces[i][2].Replace("\"", "\\\"")}\",");
            builder.Append($"\"comment\":\"{interfaces[i][3].Replace("\"", "\\\"")}\"");
            builder.Append('}');
        }
        builder.Append(']');

        return Encoding.UTF8.GetBytes(builder.ToString());
    }

    private static string FormatRouterOs(in string payload) {
        StringBuilder bulider = new StringBuilder();

        string[] split = payload.Split('\n');
        for (int i = 0; i < split.Length; i++) {
            split[i] = split[i].Trim();
            if (split[i].EndsWith("\\")) {
                bulider.Append(split[i][..^1]);
            }
            else {
                bulider.Append(split[i]);
                bulider.AppendLine();
            }
        }

        return bulider.ToString();
    }

    private static string FormarRouterOsSpeed(in string speed) {
        return speed.ToLower() switch {
            "10mbps" => "10 Mbps",
            "100mbps" => "100 Mbps",
            "1000mbps" => "1 Gpbs",
            "2500mbps" => "2.5 Gpbs",
            "5gbps" => "5 Gpbs",
            "10gbps" => "10 Gbps",
            "25gbps" => "25 Gbps",
            "40gbps" => "40 Gbps",
            "100gbps" => "100 Gbps",
            "200gbps" => "200 Gbps",
            "400gbps" => "400 Gbps",
            "800gbps" => "800 Gbps",
            _ => "N/A"
        };
    }

    private static string FormatCiscoSpeed(in string speed) {
        return speed switch {
            "speed 10" => "10 Mbps",
            "speed 100" => "100 Mbps",
            "speed 1000" => "1 Gpbs",
            "speed 2500" => "2.5 Gpbs",
            "speed 5000" => "5 Gpbs",
            "speed 10000" => "10 Gbps",
            "speed 25000" => "25 Gbps",
            "speed 40000" => "40 Gbps",
            "speed 100000" => "100 Gbps",
            "speed 200000" => "200 Gbps",
            "speed 400000" => "400 Gbps",
            "speed 800000" => "800 Gbps",
            _ => "N/A"
        };
    }
}

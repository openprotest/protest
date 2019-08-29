using System;
using System.Linq;
using System.Text;
using System.Net.Sockets;
using System.Diagnostics;
using System.IO;
using System.Threading;

static class RaClient {
    public static byte[] RaResponse(string[] para, string remoteIp) {
        if (para.Length < 3) return Tools.INF.Array;

        string method = para[1];
        string filename = para[2];
        string arg = (para.Length > 3) ? para[3] : "";
        string property = "";

        if (filename.Contains(":")) {
            property = filename.Split(':')[1];
            filename = filename.Split(':')[0];
        }

        if (remoteIp == "127.0.0.1") {
            if (filename.Length == 0) return Tools.INF.Array;
            if (!NoSQL.equip.ContainsKey(filename)) return Tools.FLE.Array;

            NoSQL.DbEntry entry = (NoSQL.DbEntry)NoSQL.equip[filename];

            string hostname = "";
            if (entry.hash.ContainsKey("IP")) hostname = ((string[])entry.hash["IP"])[0].Split(';')[0].Trim();
            else if (entry.hash.ContainsKey("HOSTNAME")) hostname = ((string[])entry.hash["HOSTNAME"])[0].Split(';')[0].Trim();
            if (hostname.Length == 0) return Tools.INF.Array;

            switch (method) {
                case "vnc":
                    try {
                        Process.Start(
                        "C:\\Program Files\\uvnc bvba\\UltraVNC\\vncviewer.exe",
                        "-autoscaling " + hostname);
                    } catch  {}
                    break;

                case "rdp":
                    try {
                        Process.Start(
                        "mstsc",
                        " /v " + hostname);
                    } catch {}
                    break;

                case "pse":
                    try {
                        string file = Path.GetTempPath() + DateTime.Now.Ticks + ".bat";
                        File.WriteAllText(
                            file,
                            $"ECHO OFF\npsexec \\\\{hostname} -u .\\administrator cmd.exe"
                        );

                        using (Process p = new Process()) {
                            p.StartInfo.FileName = "explorer.exe";
                            p.StartInfo.Arguments = file;
                            p.Start();
                        }

                        new Thread(() => {
                            Thread.Sleep(3000);
                            File.Delete(filename);
                        }).Start();

                    } catch  {}
                    break;

                case "smb":
                    try {
                        using (Process p = new Process()) {
                            p.StartInfo.FileName = "explorer.exe";
                            p.StartInfo.Arguments = $"\\\\{hostname}\\{arg}";
                            p.StartInfo.UseShellExecute = true;
                            p.Start();
                        }
                    } catch {}
                    break;

                /*case "ssh":
                    try {
                        using (Process p = new Process()) {
                            p.StartInfo.FileName = "ssh";
                            p.StartInfo.Arguments = $"{hostname}";
                            p.StartInfo.UseShellExecute = true;
                            p.Start();
                        }
                    } catch { }
                    break;*/

                case "stpe":
                    return Tools.TCP.Array;

                case "stpu":
                    return Tools.TCP.Array;

                case "stp":
                    return Tools.TCP.Array;
            }

        } else {
            byte[] payload;

            if (method == "stpe")
                payload = Encoding.UTF8.GetBytes(
                    $"stp{(char)127}none{(char)127}" +
                    Encoding.UTF8.GetString(NoSQL.GetValue(NoSQL.equip, filename, property))
                );

            else if (method == "stpu")
                payload = Encoding.UTF8.GetBytes(
                    $"stp{(char)127}none{(char)127}" +
                    Encoding.UTF8.GetString(NoSQL.GetValue(NoSQL.users, filename, property))
                );

            else {
                if (filename.Length == 0) return Tools.INF.Array;
                if (!NoSQL.equip.ContainsKey(filename)) return Tools.FLE.Array;

                NoSQL.DbEntry entry = (NoSQL.DbEntry)NoSQL.equip[filename];

                string hostname = "";
                if (entry.hash.ContainsKey("IP")) hostname = ((string[])entry.hash["IP"])[0].Split(';')[0].Trim();
                else if (entry.hash.ContainsKey("HOSTNAME")) hostname = ((string[])entry.hash["HOSTNAME"])[0].Split(';')[0].Trim();
                if (hostname.Length == 0) return Tools.INF.Array;

                payload = Encoding.UTF8.GetBytes($"{method}{(char)127}{hostname}{(char)127}{arg}");
            }

            try {
                payload = Crypto.Encrypt(payload, Program.PRESHARED_KEY);
                TcpClient client = new TcpClient(remoteIp, 5810);
                client.GetStream().Write(payload, 0, payload.Length);
                client.Close();

            } catch {
                return Tools.TCP.Array;
            }
        }

        return Tools.OK.Array;
    }
}
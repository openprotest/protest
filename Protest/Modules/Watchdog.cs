using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Mail;
using System.Net.Mime;
using System.Net.NetworkInformation;
using System.Net.WebSockets;
using System.Text;
using System.Threading;

public static class Watchdog {
    private static Thread watchThread = null;
    private static Hashtable lastStatus = new Hashtable();

    private static bool enable = true;
    private static int interval = 240;

    private static bool email = false;
    private static int threshold = 50;
    private static string contition = "fall";
    private static string server = String.Empty;
    private static int port = 587;
    private static string sender = String.Empty;
    private static string username = String.Empty;
    private static string password = String.Empty;
    private static string recipients = String.Empty;
    private static bool ssl = true;

    public static byte[] Settings(in HttpListenerContext ctx, in string performer) {
        DirectoryInfo dirWatchdog = new DirectoryInfo(Strings.DIR_WATCHDOG);
        if (!dirWatchdog.Exists) dirWatchdog.Create();

        bool sendtest = false;
        string password = String.Empty;

        using (StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding)) {
            string[] para = reader.ReadToEnd().Split((char)127);

            for (int i = 0; i < para.Length; i++)
                if (para[i].StartsWith("enable=")) enable = para[i].Substring(7) == "true";
                else if (para[i].StartsWith("interval=")) int.TryParse(para[i].Substring(9), out interval);

                else if (para[i].StartsWith("email=")) email = para[i].Substring(6) == "true";
                else if (para[i].StartsWith("threshold=")) int.TryParse(para[i].Substring(10), out threshold);
                else if (para[i].StartsWith("contition=")) contition = para[i].Substring(10);
                else if (para[i].StartsWith("server=")) server = para[i].Substring(7);
                else if (para[i].StartsWith("port=")) int.TryParse(para[i].Substring(5), out port);
                else if (para[i].StartsWith("sender=")) sender = para[i].Substring(7);
                else if (para[i].StartsWith("username=")) username = para[i].Substring(9);
                else if (para[i].StartsWith("password=")) password = para[i].Substring(9);
                else if (para[i].StartsWith("recipients=")) recipients = para[i].Substring(11);
                else if (para[i].StartsWith("ssl=")) ssl = para[i].Substring(4) == "true";
                else if (para[i].StartsWith("sendtest=")) sendtest = para[i].Substring(9) == "true";
        }

        if (password.Length > 0) Watchdog.password = password;

        FileInfo file = new FileInfo($"{Strings.DIR_WATCHDOG}\\watchdog.cfg");
        string contents = String.Empty;
        contents += $"enable     = {enable.ToString().ToLower()}\r\n";
        contents += $"interval   = {interval}\r\n";

        contents += $"email      = {email.ToString().ToLower()}\r\n";
        contents += $"threshold  = {threshold}\r\n";
        contents += $"contition  = {contition}\r\n";
        contents += $"server     = {server}\r\n";
        contents += $"port       = {port}\r\n";
        contents += $"sender     = {sender}\r\n";
        contents += $"username   = {username}\r\n";
        contents += $"password   = { CryptoAes.EncryptB64(Watchdog.password, Program.DB_KEY_A, Program.DB_KEY_B).Replace('=', '-') }\r\n";
        contents += $"recipients = {recipients}\r\n";
        contents += $"ssl        = {ssl.ToString().ToLower()}\r\n";

        try {
            File.WriteAllText(file.FullName, contents);
        } catch (Exception ex) {
            return Encoding.UTF8.GetBytes(ex.Message);
        }

        if (Watchdog.enable && Watchdog.watchThread is null) {
            Watchdog.watchThread = new Thread(BackgroundService) {
                Name = "Watchdog",
                Priority = ThreadPriority.BelowNormal
            };
            Watchdog.watchThread.Start();
        }
        
        if (!Watchdog.enable && !(Watchdog.watchThread is null)) {
            if (Watchdog.watchThread.IsAlive) Watchdog.watchThread.Abort();
            Watchdog.watchThread = null;
        }

        if (sendtest) SmtpTest();

        Logging.Action(performer, $"Change watchdog settings");
        return Strings.OK.Array;
    }

    public static byte[] GetConfig() {
        string payload = String.Empty;

        payload += $"{enable.ToString().ToLower()}{(char)127}";
        payload += $"{interval}{(char)127}";

        payload += $"{email.ToString().ToLower()}{(char)127}";
        payload += $"{threshold}{(char)127}";
        payload += $"{contition}{(char)127}";
        payload += $"{server}{(char)127}";
        payload += $"{port}{(char)127}";
        payload += $"{sender}{(char)127}";
        payload += $"{username}{(char)127}";
        payload += $"{(char)127}"; //payload += $"{password}{(char)127}";
        payload += $"{recipients}{(char)127}";
        payload += $"{ssl.ToString().ToLower()}{(char)127}";

        return Encoding.UTF8.GetBytes(payload);
    }

    public static void LoadConfig() {
        FileInfo file = new FileInfo($"{Strings.DIR_WATCHDOG}\\watchdog.cfg");
        if (!file.Exists) return;

        StreamReader fileReader = new StreamReader(file.FullName);
        string line;
        while ((line = fileReader.ReadLine()) != null) {
            line = line.Trim();
            if (line.StartsWith("#")) continue;

            string[] split = line.Split('=');
            if (split.Length < 2) continue;

            split[0] = split[0].Trim().ToLower();
            split[1] = split[1].Trim();

            switch (split[0]) {
                case "enable":
                    Watchdog.enable = split[1] == "true";
                    break;

                case "interval":
                    int.TryParse(split[1], out Watchdog.interval);
                    break;

                case "email":
                    Watchdog.email = split[1] == "true";
                    break;

                case "threshold":
                    int.TryParse(split[1], out Watchdog.threshold);
                    break;

                case "contition":
                    Watchdog.contition = split[1];
                    break;

                case "server":
                    Watchdog.server = split[1];
                    break;

                case "port":
                    int.TryParse(split[1], out Watchdog.port);
                    break;

                case "sender":
                    Watchdog.sender = split[1];
                    break;

                case "username":
                    Watchdog.username = split[1];
                    break;

                case "password":
                    try {
                        Watchdog.password = CryptoAes.DecryptB64(split[1].Replace("--", "=="), Program.DB_KEY_A, Program.DB_KEY_B);
                    } catch {
                        Watchdog.password = String.Empty;
                    }
                    break;

                case "recipients":
                    Watchdog.recipients = split[1];
                    break;

                case "ssl":
                    Watchdog.ssl = split[1] == "true";
                    break;
            }


        }

        if (Watchdog.enable) {
            Watchdog.watchThread = new Thread(BackgroundService);
            Watchdog.watchThread.Name = "Watchdog";
            Watchdog.watchThread.Priority = ThreadPriority.BelowNormal;
            Watchdog.watchThread.Start();
        }

        fileReader.Close();
    }

    public static byte[] Add(in string[] para, in string performer) {
        DirectoryInfo dirWatchdog = new DirectoryInfo(Strings.DIR_WATCHDOG);
        if (!dirWatchdog.Exists) dirWatchdog.Create();

        string host  = String.Empty;
        string proto = String.Empty;
        string port  = String.Empty;
        for (int i = 1; i < para.Length; i++)
            if (para[i].StartsWith("host=")) host = para[i].Substring(5).Trim();
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
            if (para[i].StartsWith("name=")) name = Strings.DecodeUrl(para[i].Substring(5));

        if (name.Length == 0) return Strings.INF.Array;

        try {
            DirectoryInfo dir = new DirectoryInfo($"{Strings.DIR_WATCHDOG}\\{name}");
            if (dir.Exists) dir.Delete(true);
        } catch (Exception ex) {
            return Encoding.UTF8.GetBytes(ex.Message);
        }

        Logging.Action(performer, $"Remove watchdog entry: {name}");
        return Strings.OK.Array;
    }

    public static async void WsView(HttpListenerContext ctx) {
        WebSocketContext wsc;
        WebSocket ws;
        try {
            wsc = await ctx.AcceptWebSocketAsync(null);
            ws = wsc.WebSocket;
        } catch (WebSocketException ex) {
            ctx.Response.Close();
            Logging.Err(ex);
            return;
        }

        string sessionId = ctx.Request.Cookies["sessionid"]?.Value ?? null;

        if (sessionId is null) {
            ctx.Response.Close();
            return;
        }

        try {
            while (ws.State == WebSocketState.Open) {
                byte[] buff = new byte[2048];
                WebSocketReceiveResult receiveResult = await ws.ReceiveAsync(new ArraySegment<byte>(buff), CancellationToken.None);

                if (receiveResult.MessageType == WebSocketMessageType.Close) {
                    await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, CancellationToken.None);
                    break;
                }

                if (!Session.CheckAccess(sessionId)) { //check session
                    ctx.Response.Close();
                    return;
                }

                string[] split = Encoding.Default.GetString(buff, 0, receiveResult.Count).Split(':');
                if (split.Length == 0) continue;
                if (split[0].Length == 0) continue;
                
                switch (split[0]) {
                    case "list": {
                        DirectoryInfo dirWatchdog = new DirectoryInfo(Strings.DIR_WATCHDOG);
                        if (!dirWatchdog.Exists) break;

                        StringBuilder sb = new StringBuilder($"list\n");
                        try {
                            List<DirectoryInfo> list = new List<DirectoryInfo>();
                            list.AddRange(dirWatchdog.GetDirectories());
                            list.Sort((a, b) => String.Compare(a.Name, b.Name));
                            foreach (DirectoryInfo o in list)
                                sb.Append($"{o.Name}\n");
                        } catch { }

                        ArraySegment<byte> segment = new ArraySegment<byte>(Encoding.UTF8.GetBytes(sb.ToString()));
                        await ws.SendAsync(segment, WebSocketMessageType.Text, true, CancellationToken.None);
                        break;
                    }

                    case "get": {
                        DirectoryInfo dirWatchdog = new DirectoryInfo(Strings.DIR_WATCHDOG);
                        if (!dirWatchdog.Exists) break;

                        foreach (DirectoryInfo o in dirWatchdog.GetDirectories())
                            try {
                                FileInfo file = new FileInfo($"{o.FullName}\\{(split.Length > 1 ? split[1] : DateTime.Now.ToString(Strings.DATE_FORMAT_FILE))}.txt");
                                if (!file.Exists) continue;

                                byte[] content = File.ReadAllBytes(file.FullName);
                                ArraySegment<byte> segment = new ArraySegment<byte>(content);
                                await ws.SendAsync(segment, WebSocketMessageType.Text, true, CancellationToken.None);
                            } catch { }

                        await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, CancellationToken.None);
                        break;
                    }
                }
            }

        } catch (Exception ex) {
            Logging.Err(ex);
        }
    }

    public static void BackgroundService() {
        DateTime now = DateTime.Now;
        Thread.Sleep((9 - now.Minute % 10) * 60000 + (59 - now.Second) * 1000 + (999 - now.Millisecond));

        while (true) {
            TimeSpan start = new TimeSpan(DateTime.Now.Ticks);
            Hashtable statusHash = new Hashtable();
                        
            try {
                DirectoryInfo dirWatchdog = new DirectoryInfo(Strings.DIR_WATCHDOG);
                if (!dirWatchdog.Exists) continue;

                List<DirectoryInfo> list = new List<DirectoryInfo>();
                list.AddRange(dirWatchdog.GetDirectories());
                list.Sort((a, b) => String.Compare(a.Name, b.Name));
                
                foreach (DirectoryInfo o in list) {
                    string[] split = o.Name.Split(' ');
                    if (split.Length < 2) continue;

                    string host = split[0].Trim();
                    string protocol = split[1].Trim();

                    bool bStatus = false;
                    string sStatus = String.Empty;

                    if (protocol == "arp") {
                        bStatus = Arp.ArpPing(host);
                        sStatus = bStatus.ToString().ToLower();

                    } else if (protocol == "icmp") {
                        System.Net.NetworkInformation.Ping p = new System.Net.NetworkInformation.Ping();
                        try {
                            PingReply reply = p.Send(host, 1000);
                            if (reply.Status != IPStatus.Success) reply = p.Send(host, 1000); //retry

                            if (reply.Status == IPStatus.Success) {
                                bStatus = reply.RoundtripTime < threshold;
                                sStatus = reply.RoundtripTime.ToString();

                            } else if (reply.Status == IPStatus.DestinationHostUnreachable || reply.Status == IPStatus.DestinationNetworkUnreachable) {
                                bStatus = false;
                                sStatus = "Unreachable";

                            } else {
                                if (reply.Status.ToString() == "11050")
                                    sStatus = "General failure";
                                else
                                    sStatus = reply.Status.ToString();

                                bStatus = false;
                            }

                        } catch {
                            bStatus = false;
                            sStatus = "PingError";
                        } finally {
                            p.Dispose();
                        }

                    } else if (protocol.StartsWith("tcp")) {
                        int.TryParse(protocol.Substring(3), out int port);
                        if (port == 0) continue;                        
                        bStatus = PortScan.SinglePortscan(host, port);
                        sStatus = bStatus.ToString().ToLower();                        
                    }

                    if (statusHash.ContainsKey(o.Name)) statusHash.Remove(o.Name);
                        statusHash.Add(o.Name, bStatus);

                    try {
                        string date = DateTime.Now.ToString(Strings.DATE_FORMAT_FILE);
                        string time = DateTime.Now.ToString(Strings.Time_FORMAT);

                        FileInfo file = new FileInfo($"{o.FullName}\\{date}.txt");
                        if (!file.Exists) File.AppendAllText(file.FullName, $"{o.Name}\n{date}\n");
                        File.AppendAllText(file.FullName, $"{time} {sStatus}\n");
                    } catch { }
                }

            } catch { }

            List<string[]> notifications = new List<string[]>();

            foreach (DictionaryEntry o in statusHash) {
                if (!lastStatus.ContainsKey(o.Key)) continue;
                
                bool current = (bool)o.Value;
                bool last = (bool)lastStatus[o.Key];
                if (current == last) continue;

                string[] split = o.Key.ToString().Split(' ');
                if (split.Length < 2) continue;

                string host = split[0];
                string protocol = split[1];
                string status = null;

                if (current && (contition == "rise" || contition == "both")) //rise
                    status = "started";
                
                if (last && (contition == "fall" || contition == "both")) //fall
                    status = "stoped";

                if (!(status is null)) //format[key, status, host, message]
                    notifications.Add(new string[] {
                        o.Key.ToString(),
                        status,
                        host,
                        $"Host {host} {status} responding to {protocol.ToUpper()} request",
                    });
            }

            lastStatus = statusHash;

            notifications.Sort((string[] a, string[] b) => String.Compare(a[0], b[0]));

            if (notifications.Count > 0) SendSmtpNotification(notifications);

            TimeSpan finish = new TimeSpan(DateTime.Now.Ticks);

            int d = (int)finish.Subtract(start).TotalMilliseconds;
            int s = interval * 60 * 1000;
            if (d < s) Thread.Sleep(s - d);
        }
    }

    private static void SendSmtpNotification(List<string[]> notifications) {
        Stream pngGreenDot = new MemoryStream(Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAEr2lUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSLvu78iIGlkPSJXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQiPz4KPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iWE1QIENvcmUgNS41LjAiPgogPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4KICA8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0iIgogICAgeG1sbnM6ZXhpZj0iaHR0cDovL25zLmFkb2JlLmNvbS9leGlmLzEuMC8iCiAgICB4bWxuczp0aWZmPSJodHRwOi8vbnMuYWRvYmUuY29tL3RpZmYvMS4wLyIKICAgIHhtbG5zOnBob3Rvc2hvcD0iaHR0cDovL25zLmFkb2JlLmNvbS9waG90b3Nob3AvMS4wLyIKICAgIHhtbG5zOnhtcD0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wLyIKICAgIHhtbG5zOnhtcE1NPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvbW0vIgogICAgeG1sbnM6c3RFdnQ9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9zVHlwZS9SZXNvdXJjZUV2ZW50IyIKICAgZXhpZjpQaXhlbFhEaW1lbnNpb249IjE2IgogICBleGlmOlBpeGVsWURpbWVuc2lvbj0iMTYiCiAgIGV4aWY6Q29sb3JTcGFjZT0iMSIKICAgdGlmZjpJbWFnZVdpZHRoPSIxNiIKICAgdGlmZjpJbWFnZUxlbmd0aD0iMTYiCiAgIHRpZmY6UmVzb2x1dGlvblVuaXQ9IjIiCiAgIHRpZmY6WFJlc29sdXRpb249IjcyLjAiCiAgIHRpZmY6WVJlc29sdXRpb249IjcyLjAiCiAgIHBob3Rvc2hvcDpDb2xvck1vZGU9IjMiCiAgIHBob3Rvc2hvcDpJQ0NQcm9maWxlPSJzUkdCIElFQzYxOTY2LTIuMSIKICAgeG1wOk1vZGlmeURhdGU9IjIwMjAtMDktMDRUMTY6Mzk6NDgrMDM6MDAiCiAgIHhtcDpNZXRhZGF0YURhdGU9IjIwMjAtMDktMDRUMTY6Mzk6NDgrMDM6MDAiPgogICA8eG1wTU06SGlzdG9yeT4KICAgIDxyZGY6U2VxPgogICAgIDxyZGY6bGkKICAgICAgc3RFdnQ6YWN0aW9uPSJwcm9kdWNlZCIKICAgICAgc3RFdnQ6c29mdHdhcmVBZ2VudD0iQWZmaW5pdHkgUGhvdG8gMS43LjMiCiAgICAgIHN0RXZ0OndoZW49IjIwMjAtMDktMDRUMTY6Mzk6NDgrMDM6MDAiLz4KICAgIDwvcmRmOlNlcT4KICAgPC94bXBNTTpIaXN0b3J5PgogIDwvcmRmOkRlc2NyaXB0aW9uPgogPC9yZGY6UkRGPgo8L3g6eG1wbWV0YT4KPD94cGFja2V0IGVuZD0iciI/Pgb4TjUAAAGBaUNDUHNSR0IgSUVDNjE5NjYtMi4xAAAokXWRuUsDQRSHvxzijYIWFhaLRqsoHiDaWCR4gVokK3g1yZpDyMZld4MEW8FWUBBtvAr9C7QVrAVBUQSxsrBWtFFZ3xohIuYNb943v5n3mHkDXjWj6Za/C/SsbUZGQsr0zKxS/kglfmppJRjTLGMiOqxS0t5u8LjxqsOtVfrcv1a9kLA08FQID2qGaQuPCo8v24bLm8KNWjq2IHwsHDTlgsLXrh4v8JPLqQJ/uGyqkTB464WV1C+O/2ItberC8nICeian/dzHfUlNIjsVldgi3oxFhBFCKIwxRJg+uhmQuY8OeuiUFSXyu77zJ1mSXE1mgzwmi6RIYxMUNSfVExKToidkZMi7/f/bVyvZ21OoXhOCsgfHeWmD8g34XHec933H+TwA3z2cZYv5S3vQ/yr6elEL7ELdKpycF7X4FpyuQdOdETNj35JP3JtMwvMR1M5AwyVUzRV69rPP4S2oK/JVF7C9A+1yvm7+C3ZYZ+1REzlHAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAzklEQVQ4ja3TvW0CQRDF8d9t5EZw6oQmjNY5TtyBv8JrgAJwB5dAAQg3QULKFQIRcnCDfToB0p35S5Os9j3tzM4rdHhZje7xjHEUbKIWVa537ftFS5jwjhnuusbBASXmVa6PvwYhXuHxgrDLGk9Vro8pDt56iGGCVyii5+2VZ1/igIekGVhfsdBMk79JD2F8E4N/kTQLMpTNTQwWmi/pyx7LFLtdDjAoq1zvTkOc47uHeI0vmiGKYGR8ut7OHh8iB7TSeCJWe+p8nJfdOP8Ag505pxTxKn4AAAAASUVORK5CYII="));
        Stream pngRedDot = new MemoryStream(Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAEr2lUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSLvu78iIGlkPSJXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQiPz4KPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iWE1QIENvcmUgNS41LjAiPgogPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4KICA8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0iIgogICAgeG1sbnM6ZXhpZj0iaHR0cDovL25zLmFkb2JlLmNvbS9leGlmLzEuMC8iCiAgICB4bWxuczp0aWZmPSJodHRwOi8vbnMuYWRvYmUuY29tL3RpZmYvMS4wLyIKICAgIHhtbG5zOnBob3Rvc2hvcD0iaHR0cDovL25zLmFkb2JlLmNvbS9waG90b3Nob3AvMS4wLyIKICAgIHhtbG5zOnhtcD0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wLyIKICAgIHhtbG5zOnhtcE1NPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvbW0vIgogICAgeG1sbnM6c3RFdnQ9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9zVHlwZS9SZXNvdXJjZUV2ZW50IyIKICAgZXhpZjpQaXhlbFhEaW1lbnNpb249IjE2IgogICBleGlmOlBpeGVsWURpbWVuc2lvbj0iMTYiCiAgIGV4aWY6Q29sb3JTcGFjZT0iMSIKICAgdGlmZjpJbWFnZVdpZHRoPSIxNiIKICAgdGlmZjpJbWFnZUxlbmd0aD0iMTYiCiAgIHRpZmY6UmVzb2x1dGlvblVuaXQ9IjIiCiAgIHRpZmY6WFJlc29sdXRpb249IjcyLjAiCiAgIHRpZmY6WVJlc29sdXRpb249IjcyLjAiCiAgIHBob3Rvc2hvcDpDb2xvck1vZGU9IjMiCiAgIHBob3Rvc2hvcDpJQ0NQcm9maWxlPSJzUkdCIElFQzYxOTY2LTIuMSIKICAgeG1wOk1vZGlmeURhdGU9IjIwMjAtMDktMDRUMTY6Mzk6MTgrMDM6MDAiCiAgIHhtcDpNZXRhZGF0YURhdGU9IjIwMjAtMDktMDRUMTY6Mzk6MTgrMDM6MDAiPgogICA8eG1wTU06SGlzdG9yeT4KICAgIDxyZGY6U2VxPgogICAgIDxyZGY6bGkKICAgICAgc3RFdnQ6YWN0aW9uPSJwcm9kdWNlZCIKICAgICAgc3RFdnQ6c29mdHdhcmVBZ2VudD0iQWZmaW5pdHkgUGhvdG8gMS43LjMiCiAgICAgIHN0RXZ0OndoZW49IjIwMjAtMDktMDRUMTY6Mzk6MTgrMDM6MDAiLz4KICAgIDwvcmRmOlNlcT4KICAgPC94bXBNTTpIaXN0b3J5PgogIDwvcmRmOkRlc2NyaXB0aW9uPgogPC9yZGY6UkRGPgo8L3g6eG1wbWV0YT4KPD94cGFja2V0IGVuZD0iciI/PtSPkUEAAAGBaUNDUHNSR0IgSUVDNjE5NjYtMi4xAAAokXWRuUsDQRSHvxzijYIWFhaLRqsoHiDaWCR4gVokK3g1yZpDyMZld4MEW8FWUBBtvAr9C7QVrAVBUQSxsrBWtFFZ3xohIuYNb943v5n3mHkDXjWj6Za/C/SsbUZGQsr0zKxS/kglfmppJRjTLGMiOqxS0t5u8LjxqsOtVfrcv1a9kLA08FQID2qGaQuPCo8v24bLm8KNWjq2IHwsHDTlgsLXrh4v8JPLqQJ/uGyqkTB464WV1C+O/2ItberC8nICeian/dzHfUlNIjsVldgi3oxFhBFCKIwxRJg+uhmQuY8OeuiUFSXyu77zJ1mSXE1mgzwmi6RIYxMUNSfVExKToidkZMi7/f/bVyvZ21OoXhOCsgfHeWmD8g34XHec933H+TwA3z2cZYv5S3vQ/yr6elEL7ELdKpycF7X4FpyuQdOdETNj35JP3JtMwvMR1M5AwyVUzRV69rPP4S2oK/JVF7C9A+1yvm7+C3ZYZ+1REzlHAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAyUlEQVQ4ja3TvW0CQRDF8d9t5EbMhSQ0YWTnuAg+HF4DLgAXAQVY0ASJQ7hCIEIEN8DpBEh35i9Nstr3tDM7L9Ng67WHTwyiYBO1yJW7+v2sJkyY4hsvTePggALzXHm8GIT4F293hE1W+MiVxxQHkxZiGGIMWfT89+DZ9zign1QDaysWmlFynXQXBk8x+BdJtSBd2TzFYKH6krbssUyx20UHgyJX7s5DnGPdQrzCD9UQRTDe8eVxO3vMRA6opfFMrPbI7Tgvm3E+AeHkMlJ6DSfvAAAAAElFTkSuQmCC"));

#if !DEBUG
        try {
#endif
            FileInfo fileLogo = new FileInfo($"{Strings.DIR_FRONTEND}\\res\\icon96.png");
            LinkedResource logo = null;
            if (fileLogo.Exists)
                logo = new LinkedResource(fileLogo.FullName, "image/png") {
                    ContentId = Guid.NewGuid().ToString(),
                    TransferEncoding = TransferEncoding.Base64
                };

            LinkedResource fileGreen = new LinkedResource(pngGreenDot, "image/png") {
                ContentId = Guid.NewGuid().ToString(),
                TransferEncoding = TransferEncoding.Base64
            };

            LinkedResource fileRed = new LinkedResource(pngRedDot, "image/png") {
                ContentId = Guid.NewGuid().ToString(),
                TransferEncoding = TransferEncoding.Base64
            };

            bool redFlag = false, greenFlag = false;

            StringBuilder body = new StringBuilder();
            body.Append("<html>");
            body.Append("<p style=\"text-align:center\">");
            body.Append("<table style=\"width:640px;text-align:center\">");

            if (!(logo is null)) body.Append($"<tr><td><img src=\"cid:{logo.ContentId}\"/></td></tr>");
            body.Append("<tr><td style=\"height:18px\"></td></tr>"); //seperatator
            body.Append("<tr><td style=\"height:40px;color:#fff;background:#e67624;font-size:24px\"><b>Watchdog notification</b></td></tr>");

            for (int i = 0; i < notifications.Count; i++) { //format[key, status, host, message] 
                body.Append($"<tr>");
                body.Append($"<td style=\"border-bottom:1px solid #808080;height:28px;font-size:18;text-align:left\">");
                body.Append($"&nbsp;&nbsp;<img src=\"cid:{(notifications[i][1] == "started" ? fileGreen.ContentId : fileRed.ContentId)}\"/>");
                body.Append($"&nbsp;&nbsp;{notifications[i][3]}");
                body.Append($"</td>");
                body.Append($"</tr>");

                if (notifications[i][1] == "started")
                    greenFlag = true;
                else
                    redFlag = true;
            }

            body.Append("<tr><td style=\"height:20px\"></td></tr>"); //seperatator
            body.Append("<tr><td style=\"color:#202020\">Sent from <a href=\"https://github.com/veniware/OpenProtest\" style=\"color:#e67624\">Pro-test</a></td></tr>");
            //body.Append("<tr><td style=\"height:16px\"></td></tr>"); //seperatator

            /*body.Append("<tr>");
            body.Append("<td style=\"color:#202020\">");
            body.Append("<a href=\"https://paypal.me/veniware/10\" style=\"color:#202020\">Make a donation</a>");
            body.Append("&nbsp;or&nbsp;");
            body.Append("<a href=\"https://github.com/veniware/OpenProtest\" style=\"color:#202020\">get involved</a>");
            body.Append("</td>");
            body.Append("</tr>");*/

            body.Append("</table>");
            body.Append("</p>");
            body.Append("</html>");

            MailMessage mail = new MailMessage {
                From = new MailAddress(sender, "Pro-test"),
                Subject = $"Pro-test notification {DateTime.Now.ToString(Strings.DATETIME_FORMAT)}",
                IsBodyHtml = true
            };

            AlternateView view = AlternateView.CreateAlternateViewFromString(body.ToString(), null, "text/html");
            if (!(logo is null)) view.LinkedResources.Add(logo);
            if (greenFlag) view.LinkedResources.Add(fileGreen);
            if (redFlag) view.LinkedResources.Add(fileRed);
            mail.AlternateViews.Add(view);

            string[] recipientSplit = recipients.Split(';');
            for (int i = 0; i < recipientSplit.Length; i++)
                mail.To.Add(recipientSplit[i].Trim());

            SmtpClient smtp = new SmtpClient(server) {
                Port = port,
                EnableSsl = ssl,
                Credentials = new NetworkCredential(username, password)
            };
            smtp.Send(mail);

            Logging.Action("Watchdog", "Successfully sent an email notification");

            smtp.Dispose();
            mail.Dispose();
            body.Clear();
            logo.Dispose();
            fileGreen.Dispose();
            fileRed.Dispose();

#if !DEBUG
        } catch (SmtpFailedRecipientException ex) { Logging.Err(ex);
        } catch (SmtpException ex)                { Logging.Err(ex);
        } catch (Exception ex)                    { Logging.Err(ex);
        }
#endif
    }

    private static void SmtpTest() {
#if !DEBUG
        try {
#endif
            FileInfo fileLogo = new FileInfo($"{Strings.DIR_FRONTEND}\\res\\icon96.png");
            LinkedResource logo = null;
            if (fileLogo.Exists)
                logo = new LinkedResource(fileLogo.FullName, "image/png") {
                    ContentId = Guid.NewGuid().ToString().Replace("-", String.Empty),
                    TransferEncoding = TransferEncoding.Base64
                };

            StringBuilder body = new StringBuilder();
            body.Append("<html>");
            body.Append("<p style=\"text-align:center\">");
            body.Append("<table style=\"width:500px;text-align:center\">");

            if (!(logo is null)) body.Append($"<tr><td><img src=\"cid:{logo.ContentId}\"/></td></tr>");
            body.Append("<tr><td style=\"height:18px\"></td></tr>"); //seperatator
            body.Append("<tr><td style=\"height:40px;color:#fff;background:#e67624;font-size:24px\">You have successfully configure your SMTP client.</td></tr>");
            body.Append("<tr><td style=\"height:20px\"></td></tr>"); //seperatator
            body.Append("<tr><td style=\"color:#202020\">Sent from <a href=\"https://github.com/veniware/OpenProtest\" style=\"color:#e67624\">Pro-test</a></td></tr>");
            //body.Append("<tr><td style=\"height:16px\"></td></tr>"); //seperatator

            /*body.Append("<tr>");
            body.Append("<td style=\"color:#202020\">");
            body.Append("<a href=\"https://paypal.me/veniware/10\" style=\"color:#202020\">Make a donation</a>");
            body.Append("&nbsp;or&nbsp;");
            body.Append("<a href=\"https://github.com/veniware/OpenProtest\" style=\"color:#202020\">get involved</a>");
            body.Append("</td>");
            body.Append("</tr>");*/

            body.Append("</table>");
            body.Append("</p>");
            body.Append("</html>");

            MailMessage mail = new MailMessage {
                From = new MailAddress(sender, "Pro-test"),
                Subject = "SMTP test from Pro-test",
                IsBodyHtml = true
            };

            AlternateView view = AlternateView.CreateAlternateViewFromString(body.ToString(), null, "text/html");
            if (!(logo is null)) view.LinkedResources.Add(logo);
            mail.AlternateViews.Add(view);

            string[] addressSplit = recipients.Split(';');
            for (int i = 0; i < addressSplit.Length; i++)
                mail.To.Add(addressSplit[i].Trim());

            using SmtpClient smtp = new SmtpClient(server) {
                Port = port,
                EnableSsl = ssl,
                Credentials = new NetworkCredential(username, password)
            };
            smtp.Send(mail);

            smtp.Dispose();
            mail.Dispose();
            body.Clear();
            logo.Dispose();

#if !DEBUG
        } catch (SmtpFailedRecipientException ex) { Logging.Err(ex);
        } catch (SmtpException ex)                { Logging.Err(ex);
        } catch (Exception ex)                    { Logging.Err(ex);
        }
#endif
    }

}

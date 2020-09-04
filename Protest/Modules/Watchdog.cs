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

        using (StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding)) {
            string[] para = reader.ReadToEnd().Split('&');

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

        FileInfo file = new FileInfo($"{Strings.DIR_WATCHDOG}\\watchdog.txt");
        string contents = String.Empty;
        contents += $"enable = {enable.ToString().ToLower()}\n";
        contents += $"interval = {interval}\n";

        contents += $"email = {email.ToString().ToLower()}\n";
        contents += $"threshold = {threshold}\n";
        contents += $"contition = {contition}\n";
        contents += $"server = {server}\n";
        contents += $"port = {port}\n";
        contents += $"sender = {sender}\n";
        contents += $"username = {username}\n";
        contents += $"password = {password}\n";
        contents += $"recipients = {recipients}\n";
        contents += $"ssl = {ssl.ToString().ToLower()}\n";

        try {
            File.WriteAllText(file.FullName, contents);
        } catch (Exception ex) {
            return Encoding.UTF8.GetBytes(ex.Message);
        }

        if (Watchdog.enable && Watchdog.watchThread is null) {
            Watchdog.watchThread = new Thread(BackgroundService);
            Watchdog.watchThread.Name = "Watchdog";
            Watchdog.watchThread.Priority = ThreadPriority.BelowNormal;
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
        payload += $"{password}{(char)127}";
        payload += $"{recipients}{(char)127}";
        payload += $"{ssl.ToString().ToLower()}{(char)127}";

        return Encoding.UTF8.GetBytes(payload);
    }

    public static void LoadConfig() {
        FileInfo file = new FileInfo($"{Strings.DIR_WATCHDOG}\\watchdog.txt");
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
                    Watchdog.password = split[1];
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
            if (para[i].StartsWith("name=")) name = Strings.EscapeUrl(para[i].Substring(5));

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

    public static async void WsView(HttpListenerContext ctx, string remoteIp) {
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
                    await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None);
                    break;
                }

                if (!Session.CheckAccess(sessionId, remoteIp)) { //check session
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

                        await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None);
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

            Hashtable notifications = new Hashtable();

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

                if (!(status is null))
                    notifications.Add(o.Key, new string[] { host, $"Host {host} {status} responding to {protocol.ToUpper()} request" });
            }

            lastStatus = statusHash;

            if (notifications.Count > 0) SendSmtpNotification(notifications);

            TimeSpan finish = new TimeSpan(DateTime.Now.Ticks);

            int d = (int)finish.Subtract(start).TotalMilliseconds;
            int s = interval * 60 * 1000;
            if (d < s) Thread.Sleep(s - d);
        }
    }

    private static void SendSmtpNotification(Hashtable notifications) {
        try {
            LinkedResource logo = new LinkedResource($"{Strings.DIR_FRONTEND}\\res\\icon96.png", "image/png") {
                ContentId = Guid.NewGuid().ToString().Replace("-", ""),
                TransferEncoding = TransferEncoding.Base64
            };

            StringBuilder body = new StringBuilder();
            body.Append("<html>");
            body.Append("<p style=\"text-align:center\">");
            body.Append("<table style=\"width:640px;text-align:center\">");

            body.Append($"<tr><td><img src=\"cid:{logo.ContentId}\"/></td></tr>");
            body.Append("<tr><td style=\"height:18px\"></td></tr>"); //seperatator
            body.Append("<tr><td style=\"height:40px;color:#fff;background:#e67624;font-size:24px\"><b>Watchdog notification</b></td></tr>");

            foreach (DictionaryEntry e in notifications) {
                string[] value = (string[]) e.Value;
                body.Append($"<tr style=\"border-bottom:1px solid #888;height:28px;font-size:17;text-align:left\">");
                body.Append($"<td>{value[1]}</td>");
                body.Append($"</tr>");
            }

            body.Append("<tr><td style=\"height:20px\"></td></tr>"); //seperatator
            body.Append("<tr><td style=\"color:#202020\">Sent from Pro-test.</td></tr>");
            body.Append("<tr><td style=\"height:16px\"></td></tr>"); //seperatator

            body.Append("<tr>");
            body.Append("<td style=\"color:#202020\">");
            body.Append("<a href=\"https://paypal.me/veniware/10\" style=\"color:#202020\">Make a donation</a>");
            body.Append("&nbsp;or&nbsp;");
            body.Append("<a href=\"https://github.com/veniware/OpenProtest\" style=\"color:#202020\">get involved</a>");
            body.Append("</td>");
            body.Append("</tr>");

            body.Append("</table>");
            body.Append("</p>");
            body.Append("</html>");

            using MailMessage mail = new MailMessage {
                From = new MailAddress(sender, "Pro-test"),
                Subject = $"Pro-test notification {DateTime.Now.ToString(Strings.DATETIME_FORMAT)}",
                IsBodyHtml = true
            };

            AlternateView view = AlternateView.CreateAlternateViewFromString(body.ToString(), null, "text/html");
            view.LinkedResources.Add(logo);
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

            Logging.Action("Watchdog notification", "Successfully sent an email notification");

        } catch (Exception ex) {
            Logging.Err(ex);
        }
    }

    private static void SmtpTest() {
        try {
            LinkedResource logo = new LinkedResource($"{Strings.DIR_FRONTEND}\\res\\icon96.png", "image/png") {
                ContentId = Guid.NewGuid().ToString().Replace("-", ""),
                TransferEncoding = TransferEncoding.Base64
            };

            StringBuilder body = new StringBuilder();
            body.Append("<html>");
            body.Append("<p style=\"text-align:center\">");
            body.Append("<table style=\"width:500px;text-align:center\">");

            body.Append($"<tr><td><img src=\"cid:{logo.ContentId}\"/></td></tr>");
            body.Append("<tr><td style=\"height:18px\"></td></tr>"); //seperatator
            body.Append("<tr><td style=\"height:40px;color:#fff;background:#e67624;font-size:24px\">You have successfully configure your SMTP client.</td></tr>");
            body.Append("<tr><td style=\"height:20px\"></td></tr>"); //seperatator
            body.Append("<tr><td style=\"color:#202020\">Sent from Pro-test.</td></tr>");
            body.Append("<tr><td style=\"height:16px\"></td></tr>"); //seperatator

            body.Append("<tr>");
            body.Append("<td style=\"color:#202020\">");
            body.Append("<a href=\"https://paypal.me/veniware/10\" style=\"color:#202020\">Make a donation</a>");
            body.Append("&nbsp;or&nbsp;");
            body.Append("<a href=\"https://github.com/veniware/OpenProtest\" style=\"color:#202020\">get involved</a>");
            body.Append("</td>");
            body.Append("</tr>");

            body.Append("</table>");
            body.Append("</p>");
            body.Append("</html>");

            MailMessage mail = new MailMessage {
                From = new MailAddress(sender, "Pro-test"),
                Subject = "SMTP test from Pro-test",
                IsBodyHtml = true,
            };

            AlternateView view = AlternateView.CreateAlternateViewFromString(body.ToString(), null, "text/html");
            view.LinkedResources.Add(logo);
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

        } catch (Exception ex) {
            Logging.Err(ex);
        }
    }

}

using System;
using System.Net;
using System.Text;
using System.Threading;

class Http {
    readonly string ip;
    readonly ushort port;
    readonly string path;

    HttpListener listener;
    public Cache cache;

    public Http(in string ip, in ushort port, in string path) {
        this.ip = ip;
        this.port = port;
        this.path = path;

        cache = new Cache(path);

        if (!HttpListener.IsSupported) throw new Exception("Unsupported OS");
        listener = new HttpListener();
        listener.Prefixes.Add("http://" + ip + ":" + port + "/");

        try {
            listener.Start();
        } catch (HttpListenerException ex) {
            ErrorLog.Err(ex);
            return;
        }

        while (true)
            try {
                HttpListenerContext ctx = listener.GetContext();
                Thread thread = new Thread(() => Serve(ctx));
                thread.Start();
            }
        catch (Exception ex) { ErrorLog.Err(ex); }
    }

    public virtual void Serve(in HttpListenerContext ctx) {
        string forwarded = ctx.Request.Headers["X-Forwarded-For"];
        string remoteIp = forwarded is null ? ctx.Request.RemoteEndPoint.Address.ToString() : forwarded;
        
        if (!(Session.ip_access.ContainsKey(remoteIp) || Session.ip_access.ContainsKey("*"))) { //check ip_access
            //ctx.Response.StatusCode = (int)HttpStatusCode.Unauthorized;
            ctx.Response.Close();
            return;
        }

        //TODO: check again with reverse proxy
        /*if (ctx.Request.UrlReferrer != null && !ctx.Request.UrlReferrer.IsLoopback)  //CSRF protection
            if (ctx.Request.UrlReferrer.Host != ctx.Request.UserHostName.Split(':')[0]) {
                ctx.Response.StatusCode = (int)HttpStatusCode.Forbidden;
                ctx.Response.OutputStream.Write(Encoding.UTF8.GetBytes("403 Forbidden"), 0, 13);
                ctx.Response.Close();
                return;
            }*/

        byte[] buffer = null;
        string url = ctx.Request.Url.AbsolutePath;
        string[] para = url.Split('&');
        if (para[0].StartsWith("/")) para[0] = para[0].Substring(1);

        string performer = remoteIp;

        bool validCookie = Session.CheckAccess(ctx, remoteIp);

        if (!validCookie && forwarded == null && remoteIp == "127.0.0.1") { //auto-login if localhost
            string token = Session.GrantAccess(remoteIp, "localhost");
            ctx.Response.AppendCookie(new Cookie() {
                Name = "sessionid",
                Value = token,
                HttpOnly = true,
                Domain = ctx.Request.UserHostName,
                Expires = new DateTime(DateTime.Now.Ticks + Session.HOUR * Session.SESSION_TIMEOUT)
            });

            ActionLog.Action($"localhost@{remoteIp}", "Auto-login");
            performer = "localhost";
        }

        if (!(validCookie || para[0]=="a" || para[0]=="res/icon24.png") && remoteIp != "127.0.0.1") {
            if (cache.hash.ContainsKey("login")) {
                buffer = ((Cache.CacheEntry)cache.hash["login"]).bytes;
                ctx.Response.ContentType = "text/html";
                try {
                    if (buffer != null) ctx.Response.OutputStream.Write(buffer, 0, buffer.Length);
                } catch { }
            }

            ctx.Response.Close();
            return;
        }

        if (ctx.Request.IsWebSocketRequest) {
            ServeWebSocket(ctx, para, remoteIp);
            return;
        }

        //ctx.Response.SendChunked = false;
        //ctx.Response.ContentEncoding = Encoding.UTF8;

        bool isModified = (ctx.Request.Headers.Get("If-Modified-Since") != cache.birthdate);
        bool acceptGzip = ctx.Request.Headers.Get("Accept-Encoding")?.ToLower().Contains("gzip") ?? false;

#if !DEBUG
        try {
#endif
            if (!isModified) {
                ctx.Response.StatusCode = (int)HttpStatusCode.NotModified;
                ctx.Response.OutputStream.Write(new byte[0], 0, 0);
                ctx.Response.Close();
                return;
            }

            bool acceptWebP = false;
            if (ctx.Request.AcceptTypes != null)
                for (int i = 0; i < ctx.Request.AcceptTypes.Length; i++)
                    if (ctx.Request.AcceptTypes[i].Contains("image/webp")) {
                        acceptWebP = true;
                        break;
                    }

            if (cache.hash.ContainsKey(para[0])) { //get from cache

                ctx.Response.StatusCode = (int)HttpStatusCode.OK;
                ctx.Response.AddHeader("Last-Modified", cache.birthdate);
                ctx.Response.AddHeader("Referrer-Policy", "no-referrer");

                Cache.CacheEntry entry = (Cache.CacheEntry)cache.hash[para[0]];

                if (acceptWebP && entry.webp != null) { //webp
                    buffer = entry.webp;
                    ctx.Response.ContentType = "image/webp";

                } else if (acceptGzip && entry.gzip != null) { //GZip
                    buffer = entry.gzip;
                    ctx.Response.ContentType = entry.contentType;
                    ctx.Response.AddHeader("Content-Encoding", "gzip");

                } else { //raw
                    buffer = entry.bytes;
                    ctx.Response.ContentType = entry.contentType;
                    if (para[0].EndsWith("svgz")) ctx.Response.AddHeader("Content-Encoding", "gzip");
                }

            } else { //dynamic
                ctx.Response.StatusCode = (int)HttpStatusCode.OK;
                ctx.Response.ContentType = "text/plain";
                ctx.Response.AddHeader("Cache-Control", "no-store");

                performer = Session.GetUsername(ctx.Request.Cookies["sessionid"]?.Value ?? "");

                switch (para[0]) {
                    case "a":
                        if (!(Session.TryLogin(ctx, remoteIp) is null))
                            buffer = Tools.OK.Array;
                        break;

                    case "logout": buffer = Session.Logout(ctx); break;

                    case "getequipver":  buffer = Encoding.UTF8.GetBytes(NoSQL.equip_version.ToString()); break;
                    case "getusersver":  buffer = Encoding.UTF8.GetBytes(NoSQL.users_version.ToString()); break;
                    case "getequiplist": buffer = NoSQL.GetTable(NoSQL.equip, NoSQL.equip_version); break;
                    case "getuserslist": buffer = NoSQL.GetTable(NoSQL.users, NoSQL.users_version); break;

                    case "gettargetequip": buffer = NoSQL.GetTargetEquip(para); break;
                    case "gettargetuser":  buffer = NoSQL.GetTargetUser(para); break;

                    case "saveequip": buffer = NoSQL.SaveEquip(ctx, performer); break;
                    case "delequip":  buffer = NoSQL.DeleteEquip(para, performer); break;
                    case "saveuser":  buffer = NoSQL.SaveUser(ctx, performer); break;
                    case "deluser":   buffer = NoSQL.DeleteUser(para, performer); break;

                    case "lastseen": buffer = LastSeen.HasBeenSeen(para); break;

                    case "dnslookup": buffer = Tools.DnsLookup(para); break;
                    case "maclookup": buffer = Tools.MacLookup(para); break;
                    case "locateip":  buffer = Tools.LocateIp(para); break;
                    case "ping":      buffer = Tools.XhrPing(para); break;

                    case "wakeup":   buffer = WoL.Wakeup(para); break;
                    case "shutdown": buffer = Encoding.UTF8.GetBytes(Wmi.Wmi_Win32Shutdown(para, 12)); break;
                    case "reboot":   buffer = Encoding.UTF8.GetBytes(Wmi.Wmi_Win32Shutdown(para, 6)); break;
                    case "logoff":   buffer = Encoding.UTF8.GetBytes(Wmi.Wmi_Win32Shutdown(para, 4)); break;

                    case "wmiverify": buffer = Encoding.UTF8.GetBytes(Wmi.WmiVerify(para, true)); break;
                    case "adverify":  buffer = Encoding.UTF8.GetBytes(ActiveDir.ActiveDirVerify(para)); break;

                    case "unlockuser":  buffer = ActiveDir.UnlockUser(para); break;
                    case "enableuser":  buffer = ActiveDir.EnableUser(para); break;
                    case "disableuser": buffer = ActiveDir.DisableUser(para); break;

                    case "printtest": buffer = Tools.PrintTestPage(para); break;

                    case "fetchequip": buffer = Fetch.FetchEquipTask(para, performer); break;
                    case "fetchusers": buffer = Fetch.FetchUsersTask(para, performer); break;

                    case "getequiprop": buffer = NoSQL.GetValue(NoSQL.equip, para); break;
                    case "getcurrentnetworkinfo": buffer = Tools.GetCurrentNetworkInfo(); break;

                    case "getuserprop": buffer = NoSQL.GetValue(NoSQL.users, para); break;
                    case "getentropy": buffer = PasswordStrength.GetEntropy(); break;

                    case "getclients": buffer = Session.GetClients(); break;
                    case "kickclient": buffer = Session.KickClients(para); break;

                    case "getdebitnotes":         buffer = DebitNotes.GetDebitNotes(para); break;
                    case "getdebitnotestemplate": buffer = DebitNotes.GetDebitNoteTemplate(); break;
                    case "createdebitnote":       buffer = DebitNotes.CreateDebitNote(para); break;
                    case "markdebitnote":         buffer = DebitNotes.MarkDebitNote(para); break;
                    case "deldebitnote":          buffer = DebitNotes.DeleteDebitNote(para); break;

                    case "wmiquery":    buffer = Wmi.WmiQuery(para); break;
                    case "killprocess": buffer = Wmi.WmiKillProcess(para); break;

                    case "gettasksobj":     buffer = ProTasks.GetTasks(); break;
                    case "gettasksongoing": buffer = ProTasks.GetOnGoing(); break;
                    case "gettasksresults": buffer = ProTasks.GetResults(); break;

                    case "getscripttools":         buffer = Scripts.GetScriptTools(); break;
                    case "getusercolumns":          buffer = Scripts.GetUserColumns(); break;
                    case "getequipcolumns":         buffer = Scripts.GetEquipColumns(); break;
                    case "getadusercolumns":        buffer = Scripts.GetAdUserColumns(); break;
                    case "getadworkstationcolumns": buffer = Scripts.GetAdWorkstationColumns(); break;
                    case "getadgroupcolumn":        buffer = Scripts.GetAdGroupColumns(); break;

                    case "listscripts": buffer = Scripts.ListScripts(); break;
                    case "loadscript":  buffer = Scripts.LoadScript(para); break;
                    case "savescript":  buffer = Scripts.SaveScript(ctx, para); break;
                    case "runscript":   buffer = Scripts.RunScript(para); break;

                    case "getmetrics": buffer = BandwidthMonitor.GetMetrics(para); break;

                    case "getnetdrives": buffer = NetworkDrive.GetNetDrive(para); break;

                    case "ramsg": buffer = RaClient.RaResponse(para, remoteIp); break;

                    default: //not found
                        ctx.Response.StatusCode = (int)HttpStatusCode.NotFound;
                        buffer = null;
                        break;
                }
            }

            ctx.Response.AddHeader("Length", buffer?.Length.ToString() ?? "0");
            if (buffer != null) ctx.Response.OutputStream.Write(buffer, 0, buffer.Length);

            ctx.Response.OutputStream.Dispose();

#if !DEBUG
        } catch (ObjectDisposedException) { //Do nothing
        } catch (HttpListenerException) { //Do nothing
        } catch (Exception ex) {
            ErrorLog.Err(ex);
        }
#endif
    }

    public virtual void ServeWebSocket(in HttpListenerContext ctx, in string[] para, in string remoteIp) {
        switch (para[0]) {
            case "ws/publictransportation": Tools.WsPublicTransportationAsync(ctx, remoteIp); break;
            case "ws/ping":                 Tools.WsPing(ctx, remoteIp); break;
            case "ws/portscan":             Tools.WsPortScan(ctx, remoteIp); break;
            case "ws/traceroute":           Tools.WsTraceRoute(ctx, remoteIp); break;
            case "ws/webcheck":             Tools.WsWebCheck(ctx, remoteIp); break;
            //case "ws/speedtest":            Tools.WsSpeedTest(ctx, remoteIp); break;
        }
    }

    public override string ToString() {
        return "HttpListener on " + ip + ":" + port;
    }

    ~Http() {
        if (listener != null && listener.IsListening) listener.Stop();
    }
}
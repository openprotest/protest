using System;
using System.Linq;
using System.Net;
using System.Text;

class HttpMainListener : Http {
    public HttpMainListener(string ip, ushort port, string path) : base(ip, port, path) { }

    public override void Serve(in HttpListenerContext ctx) {
        string forwarded = ctx.Request.Headers["X-Forwarded-For"];

        string remoteIp = forwarded is null ? ctx.Request.RemoteEndPoint.Address.ToString() : forwarded;
        if (remoteIp != "127.0.0.1" && !(Session.ip_access.ContainsKey(remoteIp) || Session.ip_access.ContainsKey("*"))) { //check ip_access
            //ctx.Response.StatusCode = (int)HttpStatusCode.Unauthorized;
            ctx.Response.Close();
            return;
        }

        /*if (ctx.Request.UrlReferrer != null && !ctx.Request.UrlReferrer.IsLoopback)  //CSRF protection
            if (ctx.Request.UrlReferrer.Host != ctx.Request.UserHostName.Split(':')[0]) {
                ctx.Response.StatusCode = (int)HttpStatusCode.Forbidden;
                ctx.Response.OutputStream.Write(Encoding.UTF8.GetBytes("403 Forbidden"), 0, 13);
                ctx.Response.Close();
                return;
            }*/

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

            //Logging.Action("localhost", $"Auto-login from {remoteIp}");
            performer = "localhost";
        }

        byte[] buffer = null;

        if (!(validCookie || para[0] == "a" || para[0] == "res/icon24.png") && remoteIp != "127.0.0.1") {
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
            WebSocketHandler(ctx, para, remoteIp);
            return;
        }

        bool isModified = (ctx.Request.Headers.Get("If-Modified-Since") != cache.birthdate);
        bool acceptGzip = ctx.Request.Headers.Get("Accept-Encoding")?.ToLower().Contains("gzip") ?? false;

        try {
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

        ctx.Response.AddHeader("Referrer-Policy", "no-referrer");

        if (cache.hash.ContainsKey(para[0])) { //get from cache
            ctx.Response.StatusCode = (int)HttpStatusCode.OK;
            ctx.Response.AddHeader("Last-Modified", cache.birthdate);

#if DEBUG
            ctx.Response.AddHeader("Cache-Control", "no-store");
#else
            ctx.Response.AddHeader("Cache-Control", $"max-age={Cache.CACHE_CONTROL_MAX_AGE}");
            //ctx.Response.AddHeader("Cache-Control", $"min-fresh={Cache.CACHE_CONTROL_MIN_FRESH}");
#endif
           
            Cache.CacheEntry entry = (Cache.CacheEntry)cache.hash[para[0]];

            if (acceptWebP && entry.webp != null) { //webp
                buffer = entry.webp;
                ctx.Response.ContentType = "image/webp";

            } else if (acceptGzip && entry.gzip != null) { //gzip
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

            performer = Session.GetUsername(ctx.Request.Cookies["sessionid"]?.Value);

            switch (para[0]) {
                case "a":
                    if (!(Session.TryLogin(ctx, remoteIp) is null)) buffer = Strings.OK.Array;
                    break;

                case "logout": buffer = Session.RevokeAccess(ctx) ? Strings.OK.Array : Strings.FAI.Array; break;
                case "version": buffer = Strings.Version(); break;

                case "ra": buffer = RaHandler.RaResponse(para, remoteIp); break;

                case "ping"        : buffer = Ping.XhrPing(para); break;
                case "dnslookup"   : buffer = Dns.DnsLookup(ctx); break;
                case "locateip"    : buffer = LocateIp.Locate(ctx); break;
                case "maclookup"   : buffer = MacLookup.Lookup(ctx); break;
                case "dhcpdiscover": buffer = Dhcp.DiscoverDhcp(para); break;
                case "ntprequest"  : buffer = Ntp.NtpRequest(para); break;

                case "db/getequipver"  : buffer = Encoding.UTF8.GetBytes(Database.equipVer.ToString()); break;
                case "db/getusersver"  : buffer = Encoding.UTF8.GetBytes(Database.usersVer.ToString()); break;
                case "db/getequiptable": buffer = Database.GetEquipTable(); break;
                case "db/getuserstable": buffer = Database.GetUsersTable(); break;
             
                case "db/getentropy": buffer = PasswordStrength.GetEntropy(); break;

                case "db/getequiprop": buffer = Database.GetValue(Database.equip, para); break;
                case "db/getuserprop": buffer = Database.GetValue(Database.users, para); break;

                case "db/saveequip": buffer = Database.SaveEquip(ctx, performer); break;
                case "db/delequip" : buffer = Database.DeleteEquip(para, performer); break;
                case "db/saveuser" : buffer = Database.SaveUser(ctx, performer); break;
                case "db/deluser"  : buffer = Database.DeleteUser(para, performer); break;

                case "db/gandalf"  : buffer = PasswordStrength.GandalfThreadWrapper(ctx, performer); ; break;

                case "fetch/fetchequip": buffer = Fetch.SingleFetchEquipBytes(para); break;
                case "fetch/fetchuser" :  buffer = Fetch.SingleFetchUserBytes(para); break;
                case "fetch/import"    : buffer = Fetch.ImportDatabase(ctx, performer); break;
                case "fetch/equip_ip"  : buffer = Fetch.FetchEquip(ctx, performer); break;
                case "fetch/equip_dc"  : buffer = Fetch.FetchEquip(ctx, performer); break;
                case "fetch/users_dc"  : buffer = Fetch.FetchUsers(ctx, performer); break;

                case "fetch/gettaskstatus": buffer = Encoding.UTF8.GetBytes(Fetch.GetTaskStatus()); break;
                case "fetch/abort"        : buffer = Fetch.AbortFetch(performer); break;
                case "fetch/approve"      : buffer = Fetch.ApproveLastFetch(performer); break;
                case "fetch/discard"      : buffer = Fetch.DiscardLastFetch(performer); break;

                //case "speedtest/downstream": buffer = SpeedTest.TestDownstream(ctx, para); break;
                //case "speedtest/upstream"  : buffer = SpeedTest.TestUpstream(ctx, para); break;
                
                case "mng/checkforupdate": buffer = Update.CheckGitHubVersion(); break;
                case "mng/getcurrentnetworkinfo": buffer = ActiveDirectory.GetCurrentNetworkInfo(); break;

                case "mng/wmiquery"   : buffer = Wmi.WmiQuery(para); break;
                case "mng/killprocess": buffer = Wmi.WmiKillProcess(para); break;

                case "mng/wakeup"  : buffer = WoL.Wakeup(para); break;
                case "mng/shutdown": buffer = Encoding.UTF8.GetBytes(Wmi.Wmi_Win32Shutdown(para, 12)); break;
                case "mng/reboot"  : buffer = Encoding.UTF8.GetBytes(Wmi.Wmi_Win32Shutdown(para, 6)); break;
                case "mng/logoff"  : buffer = Encoding.UTF8.GetBytes(Wmi.Wmi_Win32Shutdown(para, 4)); break;

                case "mng/unlockuser": buffer =  ActiveDirectory.UnlockUser(para); break;
                case "mng/enableuser": buffer =  ActiveDirectory.EnableUser(para); break;
                case "mng/disableuser": buffer = ActiveDirectory.DisableUser(para); break;

                case "mng/printtest": buffer = PrintTools.PrintTestPage(para); break;

                case "mng/getscripttools"         : buffer = Scripts.GetTools(); break;
                case "mng/getusercolumns"         : buffer = Scripts.GetUserColumns(); break;
                case "mng/getequipcolumns"        : buffer = Scripts.GetEquipColumns(); break;
                case "mng/getadusercolumns"       : buffer = Scripts.GetAdUserColumns(); break;
                case "mng/getadworkstationcolumns": buffer = Scripts.GetAdWorkstationColumns(); break;
                case "mng/getadgroupcolumn"       : buffer = Scripts.GetAdGroupColumns(); break;

                case "scripts/list"   : buffer = Scripts.List(); break;
                case "scripts/load"   : buffer = Scripts.Load(para); break;
                case "scripts/save"   : buffer = Scripts.Save(ctx, para); break;
                case "scripts/run"    : buffer = Scripts.Run(para); break;
                case "scripts/create" : buffer = Scripts.Create(para); break;
                case "scripts/delete" : buffer = Scripts.DeleteScript(para); break;
                case "scripts/getreport" : buffer = Scripts.GetReport(para); break;
                case "scripts/delreport" : buffer = Scripts.DeleteReport(para); break;
                case "scripts/getpreview": buffer = Scripts.GetPreview(para); break;
                        
                case "docs/get":    buffer = Documentation.Get(para); break;
                case "docs/create": buffer = Documentation.Create(ctx, performer); break;
                case "docs/delete": buffer = Documentation.Delete(para, performer); break;
                case "docs/view":
                    buffer = Documentation.PreviewDoc(para, acceptGzip);
                    if (acceptGzip) ctx.Response.AddHeader("Content-Encoding", "gzip");
                    break;

                case "debitnotes/get"     : buffer = DebitNotes.Get(para); break;
                case "debitnotes/template": buffer = DebitNotes.GetTemplate(); break;
                case "debitnotes/create"  : buffer = DebitNotes.Create(ctx, performer); break;
                case "debitnotes/mark"    : buffer = DebitNotes.Mark(para, performer); break;
                case "debitnotes/delete"  : buffer = DebitNotes.Delete(para, performer); break;

                case "watchdog/settings" : buffer = Watchdog.Settings(ctx, performer); break;
                case "watchdog/getconfig": buffer = Watchdog.GetConfig(); break;
                case "watchdog/add"      : buffer = Watchdog.Add(para, performer); break;
                case "watchdog/remove"   : buffer = Watchdog.Remove(para, performer); break;

                case "backup/get": buffer = Backup.Get(); break;
                case "backup/create": buffer = Backup.Create(para, performer); break;
                case "backup/delete": buffer = Backup.Delete(para, performer); break;

                case "clients/get": buffer = Session.GetClients(); break;
                case "clients/kick": buffer = Session.KickClient(para, performer); break;

                case "files/get": buffer = FileBrowser.Get(para); break;

                case "log/get": buffer = Logging.Get(); break;

                default: //not found
                    ctx.Response.StatusCode = (int)HttpStatusCode.NotFound;
                    buffer = null;
                    break;
            }
        }

        ctx.Response.AddHeader("Length", buffer?.Length.ToString() ?? "0");
        if (buffer != null) ctx.Response.OutputStream.Write(buffer, 0, buffer.Length);

        ctx.Response.OutputStream.Dispose();

        } catch (ObjectDisposedException) { //do nothing
        } catch (HttpListenerException) { //do nothing
        }
#if !DEBUG
        catch (Exception ex) {
            Logging.Err(ex);
        }
#endif
    }

    public virtual void WebSocketHandler(in HttpListenerContext ctx, in string[] para, in string remoteIp) {
        switch (para[0]) {
            case "ws/ping": Ping.WsPing(ctx, remoteIp); break;
            case "ws/portscan": PortScan.WsPortScan(ctx, remoteIp); break;
            case "ws/traceroute": TraceRoute.WsTraceRoute(ctx, remoteIp); break;
            case "ws/webcheck": WebCheck.WsWebCheck(ctx, remoteIp); break;
            case "ws/telnet": Telnet.WsTelnet(ctx, remoteIp); break;
            case "ws/watchdog": Watchdog.WsView(ctx, remoteIp); break;
            
            case "ws/keepalive": KeepAlive.Connect(ctx, remoteIp); break;
            case "ws/liveinfo_equip": LiveInfo.InstantInfoEquip(ctx, remoteIp); break;
            case "ws/liveinfo_user": LiveInfo.InstantInfoUser(ctx, remoteIp); break;
            

            default: ctx.Response.Close(); break;
        }
    }

    public override string ToString() {
        return $"Pro-test listening on {this.ip}:{this.port}";
    }
}
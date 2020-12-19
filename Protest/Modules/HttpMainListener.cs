using System;
using System.Linq;
using System.Net;
using System.Text;

class HttpMainListener : Http {
    public HttpMainListener(in string[] uriPrefixes, in string path) : base(uriPrefixes, path) { }

    public override void Serve(in HttpListenerContext ctx) {
        string remoteIp = ctx.Request.RemoteEndPoint.Address.ToString();
        bool isLoopback = ctx.Request.Url.IsLoopback; //remoteIp.StartsWith("127.") || remoteIp == "::1";

        if (!isLoopback && !(Session.ip_access.ContainsKey(remoteIp) || Session.ip_access.ContainsKey("*"))) { //check ip_access
            ctx.Response.StatusCode = (int)HttpStatusCode.Forbidden; 
            ctx.Response.Close();
            return;
        }

        if (ctx.Request.UrlReferrer != null && ctx.Request.UrlReferrer.Host != ctx.Request.UserHostName.Split(':')[0]) { //CSRF protection
            ctx.Response.StatusCode = (int)HttpStatusCode.Forbidden;
            ctx.Response.Close();
            return;
        }

        string url = ctx.Request.Url.AbsolutePath;
        string[] para = url.Split('&');
        if (para[0].StartsWith("/")) para[0] = para[0].Substring(1);

        string performer = remoteIp;
        bool validCookie = Session.CheckAccess(ctx);

        if (!validCookie && isLoopback) { //auto-login if loopback
            string token = Session.GrantAccess(remoteIp, "loopback");
            if (!(token is null))
                ctx.Response.AppendCookie(new Cookie() {
                    Name = "sessionid",
                    Value = token,
                    HttpOnly = true,
                    Domain = ctx.Request.UserHostName.Split(':')[0],
                    //SameSite = "Lax",
                    Expires = new DateTime(DateTime.Now.Ticks + Session.HOUR * Session.SESSION_TIMEOUT)
                });

            performer = "loopback";
        }

        byte[] buffer = null;

        if (!(validCookie || para[0] == "a" || para[0] == "res/icon24.png") && !isLoopback) {
            if (cache.hash.ContainsKey("login")) {
                buffer = ((Cache.CacheEntry)cache.hash["login"]).bytes;
                ctx.Response.ContentType = "text/html";
                ctx.Response.StatusCode = (int)HttpStatusCode.Forbidden;
                try {
                    if (buffer != null) ctx.Response.OutputStream.Write(buffer, 0, buffer.Length);
                } catch { }
            }
            ctx.Response.Close();
            return;
        }

        bool acceptGzip = ctx.Request.Headers.Get("Accept-Encoding")?.ToLower().Contains("gzip") ?? false;

        try {
            bool acceptWebP = false;
            if (ctx.Request.AcceptTypes != null)
                for (int i = 0; i < ctx.Request.AcceptTypes.Length; i++)
                    if (ctx.Request.AcceptTypes[i].Contains("image/webp")) {
                        acceptWebP = true;
                        break;
                    }

            ctx.Response.AddHeader("Referrer-Policy", "no-referrer");

            if (cache.hash.ContainsKey(para[0])) { //get from cache
                bool isModified = ctx.Request.Headers.Get("If-Modified-Since") != cache.birthdate;
                if (!isModified) {
                    ctx.Response.StatusCode = (int)HttpStatusCode.NotModified;
                    ctx.Response.OutputStream.Write(new byte[0], 0, 0);
                    ctx.Response.Close();
                    return;
                }

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
                Session.SessionEntry? session = Session.GetSessionEntry(ctx.Request.Cookies["sessionid"]?.Value);
                AccessControl authorization = session?.accessControl;
                performer = session?.username;

                if (ctx.Request.IsWebSocketRequest) {
                    WebSocketHandler(ctx, para, session?.accessControl);
                    return;
                }

                ctx.Response.StatusCode = (int)HttpStatusCode.OK;
                ctx.Response.ContentType = "text/plain";
                ctx.Response.AddHeader("Cache-Control", "no-store");

                if (para[0] == "a") {
                    if (!(Session.TryLogin(ctx, remoteIp) is null)) buffer = Strings.OK.Array;

                } else if (para[0].StartsWith("db/")) {
                    if (authorization is null || authorization.database == AccessControl.AccessLevel.Deny) {
                        ctx.Response.StatusCode = (int)HttpStatusCode.Unauthorized;
                    } else if (authorization.database == AccessControl.AccessLevel.Read) {
                        switch (para[0]) {
                            case "db/getequiptable":
                                buffer = Database.GetEquipTable(acceptGzip);
                                if (acceptGzip) ctx.Response.AddHeader("Content-Encoding", "gzip");
                                break;

                            case "db/getuserstable":
                                buffer = Database.GetUsersTable(acceptGzip);
                                if (acceptGzip) ctx.Response.AddHeader("Content-Encoding", "gzip");
                                break;

                            case "db/getequiprop":
                                if (authorization.password == AccessControl.AccessLevel.Deny) {
                                    ctx.Response.StatusCode = (int)HttpStatusCode.Unauthorized;
                                    break;
                                }
                                buffer = Database.GetValue(Database.equip, para);
                                break;

                            case "db/getuserprop":
                                if (authorization.password == AccessControl.AccessLevel.Deny) {
                                    ctx.Response.StatusCode = (int)HttpStatusCode.Unauthorized;
                                    break;
                                }
                                buffer = Database.GetValue(Database.users, para);
                                break;

                            case "db/getequipver": buffer = Encoding.UTF8.GetBytes(Database.equipVer.ToString()); break;
                            case "db/getusersver": buffer = Encoding.UTF8.GetBytes(Database.usersVer.ToString()); break;

                            case "db/getentropy": buffer = PasswordStrength.GetEntropy(); break;
                            case "db/gandalf": buffer = PasswordStrength.GandalfThreadWrapper(ctx, performer); break;

                            default: ctx.Response.StatusCode = (int)HttpStatusCode.NotFound; break;
                        }

                    } else if (authorization.database == AccessControl.AccessLevel.Full) {
                        switch (para[0]) {
                            case "db/getequiptable":
                                buffer = Database.GetEquipTable(acceptGzip);
                                if (acceptGzip) ctx.Response.AddHeader("Content-Encoding", "gzip");
                                break;

                            case "db/getuserstable":
                                buffer = Database.GetUsersTable(acceptGzip);
                                if (acceptGzip) ctx.Response.AddHeader("Content-Encoding", "gzip");
                                break;

                            case "db/getequiprop":
                                if (authorization.password == AccessControl.AccessLevel.Deny) {
                                    ctx.Response.StatusCode = (int)HttpStatusCode.Unauthorized;
                                    break;
                                }
                                buffer = Database.GetValue(Database.equip, para);
                                break;

                            case "db/getuserprop":
                                if (authorization.password == AccessControl.AccessLevel.Deny) {
                                    ctx.Response.StatusCode = (int)HttpStatusCode.Unauthorized;
                                    break;
                                }
                                buffer = Database.GetValue(Database.users, para);
                                break;

                            case "db/getequipver": buffer = Encoding.UTF8.GetBytes(Database.equipVer.ToString()); break;
                            case "db/getusersver": buffer = Encoding.UTF8.GetBytes(Database.usersVer.ToString()); break;

                            case "db/getentropy": buffer = PasswordStrength.GetEntropy(); break;
                            case "db/gandalf": buffer = PasswordStrength.GandalfThreadWrapper(ctx, performer); break;

                            case "db/saveequip": buffer = Database.SaveEquip(ctx, performer); break;
                            case "db/delequip": buffer = Database.DeleteEquip(para, performer); break;
                            case "db/saveuser": buffer = Database.SaveUser(ctx, performer); break;
                            case "db/deluser": buffer = Database.DeleteUser(para, performer); break;

                            default: ctx.Response.StatusCode = (int)HttpStatusCode.NotFound; break;
                        }
                    }

                } else if (para[0].StartsWith("fetch/")) {
                    if (authorization is null || authorization.database == AccessControl.AccessLevel.Deny) {
                        ctx.Response.StatusCode = (int)HttpStatusCode.Unauthorized;
                    } else {
                        switch (para[0]) {
                            case "fetch/fetchequip": buffer = Fetch.SingleFetchEquipBytes(para); break;
                            case "fetch/fetchuser": buffer = Fetch.SingleFetchUserBytes(para); break;
                            case "fetch/import": buffer = Fetch.ImportDatabase(ctx, performer); break;
                            case "fetch/equip_ip": buffer = Fetch.FetchEquip(ctx, performer); break;
                            case "fetch/equip_dc": buffer = Fetch.FetchEquip(ctx, performer); break;
                            case "fetch/users_dc": buffer = Fetch.FetchUsers(ctx, performer); break;
                            case "fetch/gettaskstatus": buffer = Encoding.UTF8.GetBytes(Fetch.GetTaskStatus()); break;
                            case "fetch/abort": buffer = Fetch.AbortFetch(performer); break;
                            case "fetch/approve": buffer = Fetch.ApproveLastFetch(performer); break;
                            case "fetch/discard": buffer = Fetch.DiscardLastFetch(performer); break;
   
                            default: ctx.Response.StatusCode = (int)HttpStatusCode.NotFound; break;
                        }
                    }

                } else if (para[0].StartsWith("config/")) {
                    if (authorization is null || authorization.database == AccessControl.AccessLevel.Deny) {
                        ctx.Response.StatusCode = (int)HttpStatusCode.Unauthorized;
                    } else {
                        switch (para[0]) {
                            case "config/get": buffer   = Configuration.GetConfig(para); break;
                            case "config/fetch": buffer = Configuration.FetchConfiguration(para, performer); break;

                            default: ctx.Response.StatusCode = (int)HttpStatusCode.NotFound; break;
                        }
                    }

                } else if (para[0].StartsWith("wmi/")) {
                    if (authorization is null || authorization.wmi == AccessControl.AccessLevel.Deny) {
                        ctx.Response.StatusCode = (int)HttpStatusCode.Unauthorized;
                    } else {
                        switch (para[0]) {
                            case "wmi/wmiquery": buffer = Wmi.WmiQuery(ctx, para); break;
                            case "wmi/killprocess": buffer = Wmi.WmiKillProcess(para); break;
                            default: ctx.Response.StatusCode = (int)HttpStatusCode.NotFound; break;
                        }
                    }

                } else if (para[0].StartsWith("scripts/")) {
                    if (authorization is null || authorization.scripts == AccessControl.AccessLevel.Deny) {
                        ctx.Response.StatusCode = (int)HttpStatusCode.Unauthorized;
                    } else {
                        switch (para[0]) {
                            case "scripts/getscripttools": buffer = Scripts.GetTools(); break;
                            case "scripts/getusercolumns": buffer = Scripts.GetUserColumns(); break;
                            case "scripts/getequipcolumns": buffer = Scripts.GetEquipColumns(); break;
                            case "scripts/getadusercolumns": buffer = Scripts.GetAdUserColumns(); break;
                            case "scripts/getadworkstationcolumns": buffer = Scripts.GetAdWorkstationColumns(); break;
                            case "scripts/getadgroupcolumn": buffer = Scripts.GetAdGroupColumns(); break;
                            case "scripts/list": buffer = Scripts.List(); break;
                            case "scripts/load": buffer = Scripts.Load(para); break;
                            case "scripts/save": buffer = Scripts.Save(ctx, para); break;
                            case "scripts/run": buffer = Scripts.Run(para); break;
                            case "scripts/create": buffer = Scripts.Create(para); break;
                            case "scripts/delete": buffer = Scripts.DeleteScript(para); break;
                            case "scripts/getreport": buffer = Scripts.GetReport(para); break;
                            case "scripts/delreport": buffer = Scripts.DeleteReport(para); break;
                            case "scripts/getpreview": buffer = Scripts.GetPreview(para); break;
                            default: ctx.Response.StatusCode = (int)HttpStatusCode.NotFound; break;
                        }
                    }

                } else if (para[0].StartsWith("docs/")) {
                    if (authorization is null || authorization.documentation == AccessControl.AccessLevel.Deny) {
                        ctx.Response.StatusCode = (int)HttpStatusCode.Unauthorized;
                    } else if (authorization.documentation == AccessControl.AccessLevel.Read) {
                        switch (para[0]) {
                            case "docs/get": buffer = Documentation.Get(para); break;
                            case "docs/view":
                                buffer = Documentation.PreviewDoc(para, acceptGzip);
                                if (acceptGzip) ctx.Response.AddHeader("Content-Encoding", "gzip");
                                break;
                            default: ctx.Response.StatusCode = (int)HttpStatusCode.NotFound; break;
                        }
                    } else if (authorization.documentation == AccessControl.AccessLevel.Full) {
                        switch (para[0]) {
                            case "docs/create": buffer = Documentation.Create(ctx, performer); break;
                            case "docs/delete": buffer = Documentation.Delete(para, performer); break;
                            case "docs/get": buffer = Documentation.Get(para); break;
                            case "docs/view":
                                buffer = Documentation.PreviewDoc(para, acceptGzip);
                                if (acceptGzip) ctx.Response.AddHeader("Content-Encoding", "gzip");
                                break;
                            default: ctx.Response.StatusCode = (int)HttpStatusCode.NotFound; break;
                        }
                    }

                } else if (para[0].StartsWith("debitnotes/")) {
                    if (authorization is null || authorization.debitnotes == AccessControl.AccessLevel.Deny) {
                        ctx.Response.StatusCode = (int)HttpStatusCode.Unauthorized;
                    } else if (authorization.debitnotes == AccessControl.AccessLevel.Read) {
                        switch (para[0]) {
                            case "debitnotes/get": buffer = DebitNotes.Get(para); break;
                            case "debitnotes/template": buffer = DebitNotes.GetTemplate(); break;
                            default: ctx.Response.StatusCode = (int)HttpStatusCode.NotFound; break;
                        }
                    } else if (authorization.debitnotes == AccessControl.AccessLevel.Full) {
                        switch (para[0]) {
                            case "debitnotes/get": buffer = DebitNotes.Get(para); break;
                            case "debitnotes/template": buffer = DebitNotes.GetTemplate(); break;
                            case "debitnotes/create": buffer = DebitNotes.Create(ctx, performer); break;
                            case "debitnotes/mark": buffer = DebitNotes.Mark(para, performer); break;
                            case "debitnotes/delete": buffer = DebitNotes.Delete(para, performer); break;
                            default: ctx.Response.StatusCode = (int)HttpStatusCode.NotFound; break;
                        }
                    }

                } else if (para[0].StartsWith("watchdog/")) {
                    if (authorization is null || authorization.watchdog == AccessControl.AccessLevel.Deny) {
                        ctx.Response.StatusCode = (int)HttpStatusCode.Unauthorized;
                    } else if (authorization.watchdog == AccessControl.AccessLevel.Read) {
                        switch (para[0]) {
                            case "watchdog/getconfig": buffer = Watchdog.GetConfig(); break;
                            default: ctx.Response.StatusCode = (int)HttpStatusCode.NotFound; break;
                        }
                    } else if (authorization.watchdog == AccessControl.AccessLevel.Full) {
                        switch (para[0]) {
                            case "watchdog/settings": buffer = Watchdog.Settings(ctx, performer); break;
                            case "watchdog/getconfig": buffer = Watchdog.GetConfig(); break;
                            case "watchdog/add": buffer = Watchdog.Add(para, performer); break;
                            case "watchdog/remove": buffer = Watchdog.Remove(para, performer); break;
                            default: ctx.Response.StatusCode = (int)HttpStatusCode.NotFound; break;
                        }
                    }

                } else if (para[0].StartsWith("backup/")) {
                    if (authorization is null || authorization.backup == AccessControl.AccessLevel.Deny) {
                        ctx.Response.StatusCode = (int)HttpStatusCode.Unauthorized;
                    } else {
                        switch (para[0]) {
                            case "backup/get": buffer = Backup.Get(); break;
                            case "backup/create": buffer = Backup.Create(para, performer); break;
                            case "backup/delete": buffer = Backup.Delete(para, performer); break;
                            default: ctx.Response.StatusCode = (int)HttpStatusCode.NotFound; break;
                        }
                    }

                } else if (para[0].StartsWith("clients/")) {
                    if (authorization is null || authorization.manageusers == AccessControl.AccessLevel.Deny) {
                        ctx.Response.StatusCode = (int)HttpStatusCode.Unauthorized;
                    } else {
                        switch (para[0]) {
                            case "clients/get": buffer = Session.GetClients(); break;
                            case "clients/kick": buffer = Session.KickClient(para, performer); break;
                            default: ctx.Response.StatusCode = (int)HttpStatusCode.NotFound; break;
                        }
                    }

                } else if (para[0].StartsWith("acl/")) {
                    if (authorization is null || authorization.manageusers == AccessControl.AccessLevel.Deny) {
                        ctx.Response.StatusCode = (int)HttpStatusCode.Unauthorized;
                    } else {
                        switch (para[0]) {
                            case "acl/get": buffer = Session.GetAcl(); break;
                            case "acl/save": buffer = Session.SaveAcl(para, ctx, performer); break;
                            case "acl/delete": buffer = Session.DeleteAcl(para, performer); break;
                            default: ctx.Response.StatusCode = (int)HttpStatusCode.NotFound; break;
                        }
                    }

                } else if (para[0].StartsWith("mngh/")) {
                    if (authorization is null || authorization.remotehosts == AccessControl.AccessLevel.Deny) {
                        ctx.Response.StatusCode = (int)HttpStatusCode.Unauthorized;
                    } else {
                        switch (para[0]) {
                            case "mngh/wakeup": buffer = WoL.Wakeup(para); break;
                            case "mngh/shutdown": buffer = Encoding.UTF8.GetBytes(Wmi.Wmi_Win32Shutdown(para, 12)); break;
                            case "mngh/reboot": buffer = Encoding.UTF8.GetBytes(Wmi.Wmi_Win32Shutdown(para, 6)); break;
                            case "mngh/logoff": buffer = Encoding.UTF8.GetBytes(Wmi.Wmi_Win32Shutdown(para, 4)); break;
                            case "mngh/printtest": buffer = PrintTools.PrintTestPage(para); break;
                            case "mngh/getfiles": buffer = FileBrowser.Get(para); break;
                            default: ctx.Response.StatusCode = (int)HttpStatusCode.NotFound; break;
                        }
                    }

                } else if (para[0].StartsWith("mngu/")) {
                    if (authorization is null || authorization.domainusers == AccessControl.AccessLevel.Deny) {
                        ctx.Response.StatusCode = (int)HttpStatusCode.Unauthorized;
                    } else {
                        switch (para[0]) {
                            case "mngu/unlockuser": buffer = ActiveDirectory.UnlockUser(para); break;
                            case "mngu/enableuser": buffer = ActiveDirectory.EnableUser(para); break;
                            case "mngu/disableuser": buffer = ActiveDirectory.DisableUser(para); break;
                            default: ctx.Response.StatusCode = (int)HttpStatusCode.NotFound; break;
                        }
                    }

                } else if (para[0].StartsWith("log/")) {
                    if (authorization is null || authorization.log == AccessControl.AccessLevel.Deny) {
                        ctx.Response.StatusCode = (int)HttpStatusCode.Unauthorized;
                    } else {
                        switch (para[0]) {
                            case "log/get": buffer = Logging.Get(); break;
                            default: ctx.Response.StatusCode = (int)HttpStatusCode.NotFound; break;
                        }
                    }

                } else if (para[0] == "ra") {
                    if (authorization is null || authorization.remoteagent == AccessControl.AccessLevel.Deny) {
                        ctx.Response.StatusCode = (int)HttpStatusCode.Unauthorized;
                    } else {
                        buffer = RaHandler.RaResponse(para, remoteIp);
                    }

                } else {
                    switch (para[0]) {
                        case "logout"        : buffer = Session.RevokeAccess(ctx, performer) ? Strings.OK.Array : Strings.FAI.Array; break;
                        case "version"       : buffer = Strings.Version(); break;
                        case "checkforupdate": buffer = Update.CheckGitHubVersion(); break;
                        case "getcurrentnetworkinfo": buffer = ActiveDirectory.GetCurrentNetworkInfo(); break;

                        case "ping":
                            if (authorization is null || authorization.utilities == AccessControl.AccessLevel.Deny)
                                ctx.Response.StatusCode = (int)HttpStatusCode.Unauthorized;
                            else
                                buffer = Ping.XhrPing(para);
                            break;

                        case "dnslookup":
                            if (authorization is null || authorization.utilities == AccessControl.AccessLevel.Deny)
                                ctx.Response.StatusCode = (int)HttpStatusCode.Unauthorized;
                            else
                                buffer = Dns.DnsLookup(ctx);
                            break;

                        case "locateip":
                            if (authorization is null || authorization.utilities == AccessControl.AccessLevel.Deny)
                                ctx.Response.StatusCode = (int)HttpStatusCode.Unauthorized;
                            else
                                buffer = LocateIp.Locate(ctx);
                            break;

                        case "maclookup":
                            if (authorization is null || authorization.utilities == AccessControl.AccessLevel.Deny)
                                ctx.Response.StatusCode = (int)HttpStatusCode.Unauthorized;
                            else
                                buffer = MacLookup.Lookup(ctx);
                            break;


                        case "dhcpdiscover":
                            if (authorization is null || authorization.utilities == AccessControl.AccessLevel.Deny)
                                ctx.Response.StatusCode = (int)HttpStatusCode.Unauthorized;
                            else
                                buffer = Dhcp.DiscoverDhcp(para);
                            break;


                        case "ntprequest":
                            if (authorization is null || authorization.utilities == AccessControl.AccessLevel.Deny)
                                ctx.Response.StatusCode = (int)HttpStatusCode.Unauthorized;
                            else
                                buffer = Ntp.NtpRequest(para);
                            break;

                        //case "speedtest/downstream": buffer = SpeedTest.TestDownstream(ctx, para); break;
                        //case "speedtest/upstream"  : buffer = SpeedTest.TestUpstream(ctx, para); break;

                        default: ctx.Response.StatusCode = (int)HttpStatusCode.NotFound; break;
                    }
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

    public virtual void WebSocketHandler(in HttpListenerContext ctx, in string[] para, AccessControl authorization) {
        switch (para[0]) {
            case "ws/keepalive" : KeepAlive.Connect(ctx); break;
            case "ws/webcheck"  : WebCheck.WsWebCheck(ctx); break;

            case "ws/ping":
                if (authorization is null || authorization.utilities == AccessControl.AccessLevel.Deny) {
                    ctx.Response.StatusCode = (int)HttpStatusCode.Unauthorized;
                    ctx.Response.Close();
                } else
                    Ping.WsPing(ctx);
                break;

            case "ws/portscan":
                if (authorization is null || authorization.utilities == AccessControl.AccessLevel.Deny) {
                    ctx.Response.StatusCode = (int)HttpStatusCode.Unauthorized;
                    ctx.Response.Close();
                } else
                    PortScan.WsPortScan(ctx);
                break;

            case "ws/traceroute":
                if (authorization is null || authorization.utilities == AccessControl.AccessLevel.Deny) {
                    ctx.Response.StatusCode = (int)HttpStatusCode.Unauthorized;
                    ctx.Response.Close();
                } else
                    TraceRoute.WsTraceRoute(ctx);
                break;

            case "ws/telnet":
                if (authorization is null || authorization.telnet == AccessControl.AccessLevel.Deny) {
                    ctx.Response.StatusCode = (int)HttpStatusCode.Unauthorized;
                    ctx.Response.Close();
                } else
                    Telnet.WsTelnet(ctx);
                break;

            case "ws/watchdog":
                if (authorization is null || authorization.watchdog == AccessControl.AccessLevel.Deny) {
                    ctx.Response.StatusCode = (int)HttpStatusCode.Unauthorized;
                    ctx.Response.Close();
                } else
                    Watchdog.WsView(ctx);
                break;

            case "ws/liveinfo_equip":
                if (authorization is null || authorization.remotehosts == AccessControl.AccessLevel.Deny) {
                    ctx.Response.StatusCode = (int)HttpStatusCode.Unauthorized;
                    ctx.Response.Close();
                } else
                    LiveInfo.InstantInfoEquip(ctx); break;

            case "ws/liveinfo_user":
                if (authorization is null || authorization.domainusers == AccessControl.AccessLevel.Deny) {
                    ctx.Response.StatusCode = (int)HttpStatusCode.Unauthorized;
                    ctx.Response.Close();
                } else
                    LiveInfo.InstantInfoUser(ctx); break;

            default:
                ctx.Response.StatusCode = (int)HttpStatusCode.NotFound;
                ctx.Response.Close();
                break;
        }
    }
}
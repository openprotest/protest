using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Text;
using System.Threading.Tasks;

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

        if (ctx.Request.UrlReferrer != null && !ctx.Request.UrlReferrer.IsLoopback)  //CSRF protection
            if (ctx.Request.UrlReferrer.Host != ctx.Request.UserHostName.Split(':')[0]) {
                ctx.Response.StatusCode = (int)HttpStatusCode.Forbidden;
                ctx.Response.OutputStream.Write(Encoding.UTF8.GetBytes("403 Forbidden"), 0, 13);
                ctx.Response.Close();
                return;
            }

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

            Logging.Action($"localhost@{remoteIp}", "Auto-login");
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
                    if (!(Session.TryLogin(ctx, remoteIp) is null)) buffer = Strings.OK.Array;
                    break;

                case "logout": buffer = Session.RevokeAccess(ctx) ? Strings.OK.Array : Strings.FAI.Array; break;

                case "dnslookup":    buffer = Dns.DnsLookup(para); break;
                case "dhcpdiscover": buffer = Dhcp.DiscoverDhcp(para); break;
                case "locateip":     buffer = LocateIp.Locate(para); break;
                case "maclookup":    buffer = MacLookup.Lookup(para); break;

                case "wakeup": buffer = WoL.Wakeup(para); break;
                case "shutdown": buffer = Encoding.UTF8.GetBytes(Wmi.Wmi_Win32Shutdown(para, 12)); break;
                case "reboot": buffer = Encoding.UTF8.GetBytes(Wmi.Wmi_Win32Shutdown(para, 6)); break;
                case "logoff": buffer = Encoding.UTF8.GetBytes(Wmi.Wmi_Win32Shutdown(para, 4)); break;

                case "wmiquery": buffer = Wmi.WmiQuery(para); break;
                case "killprocess": buffer = Wmi.WmiKillProcess(para); break;

                case "wmiverify": buffer = Encoding.UTF8.GetBytes(Wmi.WmiVerify(para, "ba")); break;
                case "adverify": buffer = Encoding.UTF8.GetBytes(ActiveDirectory.ActiveDirVerify(para)); break;

                case "getscripttools": buffer = Scripts.GetScriptTools(); break;
                case "getusercolumns": buffer = Scripts.GetUserColumns(); break;
                case "getequipcolumns": buffer = Scripts.GetEquipColumns(); break;
                case "getadusercolumns": buffer = Scripts.GetAdUserColumns(); break;
                case "getadworkstationcolumns": buffer = Scripts.GetAdWorkstationColumns(); break;
                case "getadgroupcolumn": buffer = Scripts.GetAdGroupColumns(); break;

                case "listscripts": buffer = Scripts.ListScripts(); break;
                case "loadscript":  buffer = Scripts.LoadScript(para); break;
                case "savescript":  buffer = Scripts.SaveScript(ctx, para); break;
                case "runscript":   buffer = Scripts.RunScript(para); break;
                case "newscript":   buffer = Scripts.NewScript(para); break;
                case "delscript":   buffer = Scripts.DeleteScript(para); break;
                case "delreport":   buffer = Scripts.DeleteReport(para); break;
                case "getreport":   buffer = Scripts.GetReport(para); break;
                
                default: //not found
                    ctx.Response.StatusCode = (int)HttpStatusCode.NotFound;
                    buffer = null;
                    break;
            }
        }

        ctx.Response.AddHeader("Length", buffer?.Length.ToString() ?? "0");
        if (buffer != null) ctx.Response.OutputStream.Write(buffer, 0, buffer.Length);

        ctx.Response.OutputStream.Dispose();

        } catch (ObjectDisposedException) { //Do nothing
        } catch (HttpListenerException) { //Do nothing
        }
#if !DEBUG
        catch (Exception ex) {
            Logging.Err(ex);
        }
#endif
    }

    public virtual void WebSocketHandler(in HttpListenerContext ctx, in string[] para, in string remoteIp) {
        switch (para[0]) {
            //case "ws/publictransportation": Tools.WsPublicTransportationAsync(ctx, remoteIp); break;
            case "ws/ping": Ping.WsPing(ctx, remoteIp); break;
            case "ws/portscan": PortScan.WsPortScan(ctx, remoteIp); break;
            case "ws/traceroute": TraceRoute.WsTraceRoute(ctx, remoteIp); break;
            case "ws/webcheck": WebCheck.WsWebCheck(ctx, remoteIp); break;
            //case "ws/speedtest": Tools.WsSpeedTest(ctx, remoteIp); break;
        }
    }

    public override string ToString() {
        return $"Protest listening on {this.ip}:{this.port}";
    }
}

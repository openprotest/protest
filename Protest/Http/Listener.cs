#if !DEBUG && NET7_0_OR_GREATER
//#define DEFLATE
#define BROTLI
#endif

using System.Collections.Generic;
using System.Net;
using System.Text;
using System.Threading.Tasks;

namespace Protest.Http;

internal sealed class Listener {
    private readonly HttpListener listener;
    private readonly Cache cache;

    private static readonly Dictionary<string, Func<HttpListenerContext, string, byte[]>> routing = new Dictionary<string, Func<HttpListenerContext, string, byte[]>> {
        ["/logout"]                       = (ctx, username) => Auth.RevokeAccess(ctx, username) ? Data.CODE_OK.Array : Data.CODE_FAILED.Array,
        ["/version"]                      = (ctx, username) => Data.VersionToJson(),

        ["/barcode39"]                    = (ctx, username) => Protocols.Barcode39.GenerateSvgHandler(ctx),
        ["/barcode128"]                   = (ctx, username) => Protocols.Barcode128B.GenerateSvgHandler(ctx),

        ["/db/user/list"]                 = (ctx, username) => DatabaseInstances.users.Serialize(ctx),
        ["/db/user/timeline"]             = (ctx, username) => DatabaseInstances.users.TimelineHandler(ctx),
        ["/db/user/save"]                 = (ctx, username) => DatabaseInstances.users.SaveHandler(ctx, username),
        ["/db/user/delete"]               = (ctx, username) => DatabaseInstances.users.DeleteHandler(ctx, username),
        ["/db/user/grid"]                 = (ctx, username) => DatabaseInstances.users.GridHandler(ctx, username),
        ["/db/user/attribute"]            = (ctx, username) => DatabaseInstances.users.AttributeValue(ctx),

        ["/db/device/list"]               = (ctx, username) => DatabaseInstances.devices.Serialize(ctx),
        ["/db/device/timeline"]           = (ctx, username) => DatabaseInstances.devices.TimelineHandler(ctx),
        ["/db/device/save"]               = (ctx, username) => DatabaseInstances.devices.SaveHandler(ctx, username),
        ["/db/device/delete"]             = (ctx, username) => DatabaseInstances.devices.DeleteHandler(ctx, username),
        ["/db/device/grid"]               = (ctx, username) => DatabaseInstances.devices.GridHandler(ctx, username),
        ["/db/device/attribute"]          = (ctx, username) => DatabaseInstances.devices.AttributeValue(ctx),

        ["/db/getentropy"]                = (ctx, username) => Tools.PasswordStrength.GetEntropy(),

        ["/fetch/networkinfo"]            = (ctx, username) => Protocols.Ldap.NetworkInfo(),
        ["/fetch/singledevice"]           = (ctx, username) => Tasks.Fetch.SingleDeviceSerialize(ctx, true),
        ["/fetch/singleuser"]             = (ctx, username) => Tasks.Fetch.SingleUserSerialize(ctx),
        ["/fetch/status"]                 = (ctx, username) => Tasks.Fetch.Status(),
        ["/fetch/devices"]                = (ctx, username) => Tasks.Fetch.DevicesTask(ctx, username),
        ["/fetch/users"]                  = (ctx, username) => Tasks.Fetch.UsersTask(ctx, username),
        ["/fetch/approve"]                = (ctx, username) => Tasks.Fetch.ApproveLastTask(ctx, username),
        ["/fetch/abort"]                  = (ctx, username) => Tasks.Fetch.CancelTask(username),
        ["/fetch/discard"]                = (ctx, username) => Tasks.Fetch.DiscardLastTask(username),
        ["/fetch/import"]                 = (ctx, username) => Tasks.Import.ImportTask(ctx, username),

        ["/manage/device/wol"]            = (ctx, username) => Protocols.Wol.Wakeup(ctx),
        ["/manage/device/shutdown"]       = (ctx, username) => OperatingSystem.IsWindows() ? Protocols.Wmi.Wmi_Win32PowerHandler(ctx, 12) : null,
        ["/manage/device/reboot"]         = (ctx, username) => OperatingSystem.IsWindows() ? Protocols.Wmi.Wmi_Win32PowerHandler(ctx, 6) : null,
        ["/manage/device/logoff"]         = (ctx, username) => OperatingSystem.IsWindows() ? Protocols.Wmi.Wmi_Win32PowerHandler(ctx, 4) : null,
        ["/manage/device/printtest"]      = (ctx, username) => Proprietary.Printers.Generic.PrintTestPage(ctx),

        ["/manage/user/unlock"]           = (ctx, username) => OperatingSystem.IsWindows() ? Protocols.Ldap.UnlockUser(ctx, username) : null,
        ["/manage/user/enable"]           = (ctx, username) => OperatingSystem.IsWindows() ? Protocols.Ldap.EnableUser(ctx, username) : null,
        ["/manage/user/disable"]          = (ctx, username) => OperatingSystem.IsWindows() ? Protocols.Ldap.DisableUser(ctx, username) : null,

        ["/docs/list"]                    = (ctx, username) => Tools.Documentation.List(ctx),
        ["/docs/create"]                  = (ctx, username) => Tools.Documentation.Create(ctx, username),
        ["/docs/delete"]                  = (ctx, username) => Tools.Documentation.Delete(ctx, username),
        ["/docs/view"]                    = (ctx, username) => Tools.Documentation.View(ctx),

        ["/chat/history"]                 = (ctx, username) => Chat.GetHistory(),

        ["/debit/list"]                   = (ctx, username) => Tools.DebitNotes.List(ctx),
        ["/debit/view"]                   = (ctx, username) => Tools.DebitNotes.View(ctx),
        ["/debit/create"]                 = (ctx, username) => Tools.DebitNotes.Create(ctx, username),
        ["/debit/delete"]                 = (ctx, username) => Tools.DebitNotes.Delete(ctx, username),
        ["/debit/return"]                 = (ctx, username) => Tools.DebitNotes.Return(ctx, username),
        ["/debit/templates"]              = (ctx, username) => Tools.DebitNotes.ListTemplate(),
        ["/debit/banners"]                = (ctx, username) => Tools.DebitNotes.ListBanners(),

        ["/watchdog/list"]                = (ctx, username) => Tasks.Watchdog.List(),
        ["/watchdog/view"]                = (ctx, username) => Tasks.Watchdog.View(ctx),
        ["/watchdog/create"]              = (ctx, username) => Tasks.Watchdog.Create(ctx, username),
        ["/watchdog/delete"]              = (ctx, username) => Tasks.Watchdog.Delete(ctx, username),

        ["/notifications/list"]           = (ctx, username) => Tasks.Watchdog.ListNotifications(),
        ["/notifications/save"]           = (ctx, username) => Tasks.Watchdog.SaveNotifications(ctx, username),

        ["/lifeline/ping/view"]           = (ctx, username) => Tasks.Lifeline.ViewPing(ctx),
        ["/lifeline/memory/view"]         = (ctx, username) => Tasks.Lifeline.ViewFile(ctx, "memory"),
        ["/lifeline/cpu/view"]            = (ctx, username) => Tasks.Lifeline.ViewFile(ctx, "cpu"),
        ["/lifeline/disk/view"]           = (ctx, username) => Tasks.Lifeline.ViewFile(ctx, "disk"),
        ["/lifeline/diskio/view"]         = (ctx, username) => Tasks.Lifeline.ViewFile(ctx, "diskio"),
        ["/lifeline/printcount/view"]     = (ctx, username) => Tasks.Lifeline.ViewFile(ctx, "printcount"),
        ["/lifeline/switchcount/view"]    = (ctx, username) => Tasks.Lifeline.ViewFile(ctx, "switchcount"),
        ["/lifeline/switchstpchanges/view"] = (ctx, username) => Tasks.Lifeline.ViewFile(ctx, "switchstpchanges"),

        ["/tools/bulkping"]               = (ctx, username) => Protocols.Icmp.BulkPing(ctx),
        ["/tools/dnslookup"]              = (ctx, username) => Protocols.Dns.Resolve(ctx),
        ["/tools/mdnslookup"]             = (ctx, username) => Protocols.Mdns.Resolve(ctx),
        ["/tools/ntp"]                    = (ctx, username) => Protocols.Ntp.Request(ctx),
        ["/tools/maclookup"]              = (ctx, username) => Tools.MacLookup.Lookup(ctx),
        ["/tools/nics/list"]              = (ctx, username) => Tools.IpDiscovery.ListNics(),

        ["/snmp/get"]                     = (ctx, username) => Protocols.Snmp.Polling.GetHandler(ctx),
        ["/snmp/set"]                     = (ctx, username) => Protocols.Snmp.Polling.SetHandler(ctx),
        ["/snmp/walk"]                    = (ctx, username) => Protocols.Snmp.Polling.WalkHandler(ctx),
        ["/snmp/switchinterface"]         = (ctx, username) => Protocols.Snmp.Polling.GetInterfaces(ctx),

        ["/wmi/query"]                    = (ctx, username) => OperatingSystem.IsWindows() ? Protocols.Wmi.Query(ctx) : null,
        ["/wmi/killprocess"]              = (ctx, username) => OperatingSystem.IsWindows() ? Protocols.Wmi.WmiKillProcess(ctx) : null,

        ["/rproxy/list"]                  = (ctx, username) => Proxy.ReverseProxy.List(),
        ["/rproxy/create"]                = (ctx, username) => Proxy.ReverseProxy.Create(ctx, username),
        ["/rproxy/delete"]                = (ctx, username) => Proxy.ReverseProxy.Delete(ctx, username),
        ["/rproxy/start"]                 = (ctx, username) => Proxy.ReverseProxy.Start(ctx, username),
        ["/rproxy/stop"]                  = (ctx, username) => Proxy.ReverseProxy.Stop(ctx, username),

        ["/issues/start"]                 = (ctx, username) => Tasks.Issues.Start(username),

        ["/rbac/list"]                    = (ctx, username) => Auth.ListUsers(),
        ["/rbac/create"]                  = (ctx, username) => Auth.CreateUser(ctx, username),
        ["/rbac/delete"]                  = (ctx, username) => Auth.DeleteUser(ctx, username),
        ["/rbac/sessions"]                = (ctx, username) => Auth.ListSessions(),
        ["/rbac/kickuser"]                = (ctx, username) => Auth.KickUser(ctx, username),
        ["/rbac/reregistermfa"]           = (ctx, username) => Auth.ResetMfaSecret(ctx, username),

        ["/tasks/list"]                   = (ctx, username) => Tasks.Tasks.ListTasks(),

        ["/config/checkupdate"]           = (ctx, username) => Update.CheckLatestRelease(),

        ["/config/backup/list"]           = (ctx, username) => Backup.List(),
        ["/config/backup/create"]         = (ctx, username) => Backup.Create(ctx, username),
        ["/config/backup/delete"]         = (ctx, username) => Backup.Delete(ctx, username),
        ["/config/backup/download"]       = (ctx, username) => Backup.Download(ctx, username),

        ["/config/zones/list"]            = (ctx, username) => Tools.Zones.ListZones(),
        ["/config/zones/save"]            = (ctx, username) => Tools.Zones.SaveZones(ctx, username),
        ["/config/dhcprange/list"]        = (ctx, username) => Tools.DhcpRange.ListRange(),
        ["/config/dhcprange/save"]        = (ctx, username) => Tools.DhcpRange.SaveRange(ctx, username),

        ["/config/smtpprofiles/list"]     = (ctx, username) => Tools.SmtpProfiles.List(),
        ["/config/smtpprofiles/save"]     = (ctx, username) => Tools.SmtpProfiles.Save(ctx, username),
        ["/config/smtpprofiles/test"]     = (ctx, username) => Tools.SmtpProfiles.SendTest(ctx),

        ["/config/snmpprofiles/list"]     = (ctx, username) => Tools.SnmpProfiles.List(ctx),
        ["/config/snmpprofiles/save"]     = (ctx, username) => Tools.SnmpProfiles.Save(ctx, username),

        ["/config/integration/getstatus"] = (ctx, username) => Integration.Integration.GetStatus(),
        ["/config/integration/getcred"]   = (ctx, username) => Integration.Integration.GetCredentials(ctx),
        ["/config/integration/save"]      = (ctx, username) => Integration.Integration.Save(ctx, username),

        ["/config/cert/list"]             = (ctx, username) => Tools.Cert.List(),
        ["/config/cert/create"]           = (ctx, username) => Tools.Cert.Create(ctx, username),
        ["/config/cert/delete"]           = (ctx, username) => Tools.Cert.Delete(ctx, username),
        ["/config/cert/info"]             = (ctx, username) => Tools.Cert.GetCertInfo(ctx),
        ["/config/cert/upload"]           = (ctx, username) => Tools.Cert.Upload(ctx, username),
        ["/config/cert/download"]         = (ctx, username) => Tools.Cert.Download(ctx, username),

        ["/api/list"]                     = (ctx, username) => Tools.Api.List(),
        ["/api/save"]                     = (ctx, username) => Tools.Api.Save(ctx, username),

        ["/log/list"]                     = (ctx, username) => Logger.List(ctx)
    };

    public Listener(string ip, ushort port, string path) {
        if (!HttpListener.IsSupported) throw new NotSupportedException();
        cache = new Cache(path);
        listener = new HttpListener();
        Bind(new string[] { $"http://{ip}:{port}/" });
    }

    public Listener(string[] uriPrefixes, string path) {
        if (!HttpListener.IsSupported) throw new NotSupportedException();
        cache = new Cache(path);
        listener = new HttpListener();
        Bind(uriPrefixes);
    }

    ~Listener() {
        Stop();
    }

    private void Bind(string[] uriPrefixes) {
        listener.IgnoreWriteExceptions = true;

        for (int i = 0; i < uriPrefixes.Length; i++) {
            listener.Prefixes.Add(uriPrefixes[i]);
        }

        try {
            listener.Start();
        }
        catch (HttpListenerException ex) {
            Logger.Error(ex);
            throw;
        }
    }

    public async Task StartAsync() {
        while (listener.IsListening) {
            try {
                HttpListenerContext ctx = await listener.GetContextAsync();
                //_ = Task.Run(() => ListenerCallback(ctx));
                _ = ListenerCallback(ctx);
            }
            catch (HttpListenerException) when (!listener.IsListening) {
                break; //normal shutdown
            }
        }
    }

    public void Stop() {
        if (listener is not null) {
            if (listener.IsListening) {
                listener.Stop();
            }

            listener.Abort();
        }
    }

    private async Task ListenerCallback(HttpListenerContext ctx) {
#if !DEBUG
        try
#endif
        {
            string xForwardedForHeader = ctx.Request?.Headers?.Get("X-Forwarded-For");
            if (!String.IsNullOrEmpty(xForwardedForHeader)) {
                IPAddress remoteIp = ctx.Request.RemoteEndPoint.Address;

                if (!Configuration.trustedProxies.Contains(remoteIp)) {
                    Logger.Action("Unauthenticated", "AAA", $"Rejected X-Forwarded-For from non-trusted peer {remoteIp}");
                    ctx.Response.StatusCode = 400;
                    ctx.Response.Close();
                    return;
                }

                ReadOnlySpan<char> span = xForwardedForHeader.AsSpan();
                int commaIndex = span.IndexOf(',');
                ReadOnlySpan<char> clientSpan = (commaIndex >= 0 ? span[..commaIndex] : span).Trim();

                if (!IPAddress.TryParse(clientSpan, out IPAddress xForwardedIp)) {
                    Logger.Action("Unauthenticated", "AAA", $"Rejected malformed X-Forwarded-For from {remoteIp}");
                    ctx.Response.StatusCode = 400;
                    ctx.Response.Close();
                    return;
                }

                if (IPAddress.IsLoopback(xForwardedIp)) {
                    Logger.Action("Unauthenticated", "AAA", $"Rejected loopback X-Forwarded-For from {remoteIp}");
                    ctx.Response.StatusCode = 400;
                    ctx.Response.Close();
                    return;
                }

                ctx.Request.RemoteEndPoint.Address = xForwardedIp;
            }

            string path = ctx.Request.Url.PathAndQuery;

            if (String.Equals(path, "/auth", StringComparison.Ordinal)) {
                Auth.AuthHandler(ctx);
                ctx.Response.Close();
                return;
            }

            if (String.Equals(ctx.Request.Url?.LocalPath, "/api", StringComparison.Ordinal)) {
                Tools.Api.HandleApiCall(ctx);
                ctx.Response.Close();
                return;
            }

            if (String.Equals(path, "/contacts", StringComparison.Ordinal)) {
                byte[] buffer = DatabaseInstances.users.SerializeContacts();
                ctx.Response.StatusCode = (int)HttpStatusCode.OK;
                ctx.Response.ContentLength64 = buffer?.Length ?? 0;
                if (buffer is not null) {
                    await ctx.Response.OutputStream.WriteAsync(buffer);
                }
                ctx.Response.Close();
                return;
            }

            ctx.Response.AddHeader("X-Frame-Options", "DENY");
            ctx.Response.AddHeader("X-Content-Type-Options", "nosniff");

            //ctx.Response.AddHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' data:");
            //relaxed policy for debit-notes printing
            ctx.Response.AddHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self' 'unsafe-inline'");

            if (await CacheHandler(ctx, path)) return;

            if (!Auth.IsAuthenticated(ctx)) {
                ctx.Response.StatusCode = (int)HttpStatusCode.Unauthorized;
                ctx.Response.Close();
                return;
            }

            if (!Auth.IsAuthorized(ctx, ctx.Request.Url.AbsolutePath)) {
                ctx.Response.StatusCode = (int)HttpStatusCode.Forbidden;
                ctx.Response.Close();
                return;
            }

            if (await WebSocketHandler(ctx)) return;

            Dictionary<string, string> parameters = ParseQuery(ctx);

            if (await DynamicHandler(ctx, parameters)) return;

            ctx.Response.StatusCode = (int)HttpStatusCode.NotFound;
            ctx.Response.Close();
        }
#if !DEBUG
        catch (Exception ex) {
            Logger.Debug(ex);
        }
#endif
    }

    public static Dictionary<string, string> ParseQuery(HttpListenerContext ctx) {
        return ParseQuery(ctx.Request.Url.Query);
    }

    private static Dictionary<string, string> ParseQuery(string queryString) {
        if (String.IsNullOrEmpty(queryString)) return null;

        ReadOnlySpan<char> span = queryString.AsSpan();
        if (span.StartsWith("?")) span = span[1..];
        if (span.IsEmpty) return null;

        Dictionary<string, string> parameters = new Dictionary<string, string>();

        while (!span.IsEmpty) {
            int equalsIndex = span.IndexOf('=');
            if (equalsIndex < 0) break;

            ReadOnlySpan<char> key = span[..equalsIndex];
            span = span[(equalsIndex + 1)..];

            int ampersandIndex = span.IndexOf('&');
            ReadOnlySpan<char> value;

            if (ampersandIndex >= 0) {
                value = span[..ampersandIndex];
                span = span[(ampersandIndex + 1)..];
            }
            else {
                value = span;
                span = span[span.Length..];
            }

            parameters[Uri.UnescapeDataString(key.ToString())] = Uri.UnescapeDataString(value.ToString());
        }

        return parameters;
    }

    private async Task<bool> CacheHandler(HttpListenerContext ctx, string path) {
        if (!cache.cache.TryGetValue(path, out Cache.Entry entry)) return false;

        if (String.Equals(path, "/", StringComparison.Ordinal)) {
            if (Auth.IsAuthenticated(ctx)) {
                entry = cache.cache["/"];
            }
            else {
                entry = cache.cache.TryGetValue("/login", out Cache.Entry value) ? value : default;
            }
        }

        string acceptEncoding = ctx.Request.Headers.Get("Accept-Encoding")?.ToLower() ?? String.Empty;
        bool acceptGZip = acceptEncoding.Contains("gzip");

#if DEFLATE
        bool acceptDeflate = acceptEncoding.Contains("deflate");
#endif

        byte[] buffer;
#if BROTLI
        bool acceptBrotli = acceptEncoding.Contains("br");
        if (acceptBrotli && entry.brotli is not null) { //brotli
            buffer = entry.brotli;
            ctx.Response.AddHeader("Content-Encoding", "br");
        }
        else
#endif
#if DEFLATE
        if (acceptDeflate && entry.deflate is not null) { //deflate
            buffer = entry.deflate;
            ctx.Response.AddHeader("Content-Encoding", "deflate");
        }
        else
#endif
        if (acceptGZip && entry.gzip is not null) { //gzip
            buffer = entry.gzip;
            ctx.Response.AddHeader("Content-Encoding", "gzip");
        }
        else { //raw
            buffer = entry.bytes;
        }

        ctx.Response.StatusCode = (int)HttpStatusCode.OK;
        ctx.Response.ContentType = entry.contentType;
        ctx.Response.ContentLength64 = buffer?.Length ?? 0;

        for (int i = 0; i < entry.headers.Length; i++) {
            ctx.Response.AddHeader(entry.headers[i].Key, entry.headers[i].Value);
        }

        try {
            if (buffer is not null) {
                await ctx.Response.OutputStream.WriteAsync(buffer);
            }
            await ctx.Response.OutputStream.FlushAsync();
        }
        catch (HttpListenerException ex) {
            Logger.Debug(ex);
        }

        ctx.Response.Close();
        return true;
    }

    private static async Task<bool> DynamicHandler(HttpListenerContext ctx, Dictionary<string, string> parameters) {
        string sessionId = ctx.Request.Cookies["sessionid"]?.Value;
        string username = IPAddress.IsLoopback(ctx.Request.RemoteEndPoint.Address) ? "loopback" : Auth.GetUsername(sessionId);

        ctx.Response.AddHeader("Cache-Control", "no-cache");

        string path = ctx.Request.Url.AbsolutePath;
        if (routing.TryGetValue(path, out Func<HttpListenerContext, string, byte[]> handler)) {
            byte[] buffer = handler(ctx, username);
            ctx.Response.StatusCode = (int)HttpStatusCode.OK;
            ctx.Response.ContentLength64 = buffer?.Length ?? 0;

            if (buffer is not null) {
                await ctx.Response.OutputStream.WriteAsync(buffer);
            }

            ctx.Response.Close();
            return true;
        }
        else {
            return false;
        }
    }

    private static async Task<bool> WebSocketHandler(HttpListenerContext ctx) {
        if (!ctx.Request.IsWebSocketRequest) {
            return false;
        }

        string origin = ctx.Request.Headers.Get("Origin");

        if (String.IsNullOrEmpty(origin) || !Uri.TryCreate(origin, UriKind.Absolute, out Uri originUri)) {
            ctx.Response.StatusCode = 403;
            ctx.Response.Close();
            return true;
        }

        string userHostName = ctx.Request.UserHostName;
        bool isSameHost = String.Equals(originUri.Host, userHostName, StringComparison.Ordinal)
            || String.Equals($"{originUri.Host}:{originUri.Port}", userHostName, StringComparison.Ordinal);

        if (!isSameHost) {
            Logger.Action("Unauthenticated", "AAA", $"Rejected WebSocket from cross-origin {origin} (host {userHostName})");
            ctx.Response.StatusCode = 403;
            ctx.Response.Close();
            return true;
        }

        switch (ctx.Request.Url.AbsolutePath) {
        case "/ws/keepalive":        await KeepAlive.WebSocketHandler(ctx);          return true;
        case "/ws/ping":             await Protocols.Icmp.WebSocketHandler(ctx);     return true;
        case "/ws/dhcp":             await Protocols.Dhcp.WebSocketHandler(ctx);     return true;
        case "/ws/terminal":         await Tools.Terminal.WebSocketHandler(ctx);     return true;
        case "/ws/telnet":           await Protocols.Telnet.WebSocketHandler(ctx);   return true;
        case "/ws/ssh":              await Protocols.Ssh.WebSocketHandler(ctx);      return true;
        case "/ws/issues":           await Tasks.Issues.WebSocketHandler(ctx);       return true;
        case "/ws/reverseproxy":     await Proxy.ReverseProxy.WebSocketHandler(ctx); return true;
        case "/ws/ipdiscovery":      await Tools.IpDiscovery.WebSocketHandler(ctx);  return true;
        case "/ws/portscan":         await Tools.PortScan.WebSocketHandler(ctx);     return true;
        case "/ws/traceroute":       await Tools.TraceRoute.WebSocketHandler(ctx);   return true;
        case "/ws/websitecheck":     await Tools.WebsiteCheck.WebSocketHandler(ctx); return true;
        case "/ws/monitor":          await Tools.Monitor.WebSocketHandler(ctx);      return true;
        case "/ws/topology":         await Tools.Topology.WebSocketHandler(ctx);     return true;
        case "/ws/livestats/device": await Tools.LiveStats.DeviceStats(ctx);         return true;
        case "/ws/livestats/user":   await Tools.LiveStats.UserStats(ctx);           return true;
        }

        return false;
    }

    public override string ToString() {
        StringBuilder builder = new StringBuilder();
        foreach (string prefix in listener.Prefixes) {
            if (builder.Length > 0) {
                builder.AppendLine();
            }
            builder.Append($"Listening on {prefix}");
        }
        return builder.ToString();
    }
}

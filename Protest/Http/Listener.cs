#if !DEBUG && NET7_0_OR_GREATER
//#define DEFLATE
#define BROTLI
#endif

using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Collections.Immutable;
using System.Net;
using System.Security.Cryptography;
using System.Threading.Tasks;
using Protest.Tasks;
using Protest.Tools;

namespace Protest.Http;

internal sealed class Listener {
    private readonly HttpListener listener;
    private readonly Cache cache;

    private const long RATE_LIMIT_TIME_WINDOW = 6_000_000_000; //10 minutes
    private const int MAX_REQUESTS_PER_WIN_PERIOD = 5;
    private static readonly ConcurrentDictionary<IPAddress, List<long>> rateLimLog = new ConcurrentDictionary<IPAddress, List<long>>();

    private static readonly Dictionary<string, Func<HttpListenerContext, Dictionary<string, string>, string, byte[]>> routing
    = new Dictionary<string, Func<HttpListenerContext, Dictionary<string, string>, string, byte[]>> {

        ["/logout"] =              (ctx, parameters, username) => Auth.RevokeAccess(ctx, username) ? Data.CODE_OK.Array : Data.CODE_FAILED.Array,
        ["/version"] =             (ctx, parameters, username) => Data.VersionToJson(),

        ["/barcode39"] =           (ctx, parameters, username) => Protocols.Barcode39.GenerateSvgHandler(ctx, parameters),
        ["/barcode128"] =          (ctx, parameters, username) => Protocols.Barcode128B.GenerateSvgHandler(ctx, parameters),

        ["/db/user/list"] =        (ctx, parameters, username) => DatabaseInstances.users.Serialize(ctx),
        ["/db/user/timeline"] =    (ctx, parameters, username) => DatabaseInstances.users.TimelineHandler(parameters),
        ["/db/user/save"] =        (ctx, parameters, username) => DatabaseInstances.users.SaveHandler(ctx, parameters, username),
        ["/db/user/delete"] =      (ctx, parameters, username) => DatabaseInstances.users.DeleteHandler(parameters, username),
        ["/db/user/grid"] =        (ctx, parameters, username) => DatabaseInstances.users.GridHandler(ctx, username),
        ["/db/user/attribute"] =   (ctx, parameters, username) => DatabaseInstances.users.AttributeValue(parameters),

        ["/db/device/list"] =      (ctx, parameters, username) => DatabaseInstances.devices.Serialize(ctx),
        ["/db/device/timeline"] =  (ctx, parameters, username) => DatabaseInstances.devices.TimelineHandler(parameters),
        ["/db/device/save"] =      (ctx, parameters, username) => DatabaseInstances.devices.SaveHandler(ctx, parameters, username),
        ["/db/device/delete"] =    (ctx, parameters, username) => DatabaseInstances.devices.DeleteHandler(parameters, username),
        ["/db/device/grid"] =      (ctx, parameters, username) => DatabaseInstances.devices.GridHandler(ctx, username),
        ["/db/device/attribute"] = (ctx, parameters, username) => DatabaseInstances.devices.AttributeValue(parameters),

        ["/db/config/view"] =      (ctx, parameters, username) => DeviceConfiguration.View(parameters),
        ["/db/config/save"] =      (ctx, parameters, username) => DeviceConfiguration.Save(ctx, parameters, username),
        ["/db/config/fetch"] =     (ctx, parameters, username) => DeviceConfiguration.Fetch(ctx, parameters, username),
        ["/db/config/extract"] =   (ctx, parameters, username) => DeviceConfiguration.ExtractInterfaces(parameters),

        ["/db/getentropy"] =       (ctx, parameters, username) => Tools.PasswordStrength.GetEntropy(),
        ["/db/gandalf"] =          (ctx, parameters, username) => Tools.PasswordStrength.GandalfThreadWrapper(ctx, username),

        ["/fetch/networkinfo"] =   (ctx, parameters, username) => Protocols.Ldap.NetworkInfo(),
        ["/fetch/singledevice"] =  (ctx, parameters, username) => Tasks.Fetch.SingleDeviceSerialize(parameters, true),
        ["/fetch/singleuser"] =    (ctx, parameters, username) => Tasks.Fetch.SingleUserSerialize(parameters),
        ["/fetch/status"] =        (ctx, parameters, username) => Tasks.Fetch.Status(),
        ["/fetch/devices"] =       (ctx, parameters, username) => Tasks.Fetch.DevicesTask(ctx, parameters, username),
        ["/fetch/users"] =         (ctx, parameters, username) => Tasks.Fetch.UsersTask(parameters, username),
        ["/fetch/approve"] =       (ctx, parameters, username) => Tasks.Fetch.ApproveLastTask(parameters, username),
        ["/fetch/abort"] =         (ctx, parameters, username) => Tasks.Fetch.CancelTask(username),
        ["/fetch/discard"] =       (ctx, parameters, username) => Tasks.Fetch.DiscardLastTask(username),
        ["/fetch/import"] =        (ctx, parameters, username) => Tasks.Import.ImportTask(parameters, username),

        ["/manage/device/wol"] =       (ctx, parameters, username) => Protocols.Wol.Wakeup(parameters),
        ["/manage/device/shutdown"] =  (ctx, parameters, username) => OperatingSystem.IsWindows() ? Protocols.Wmi.Wmi_Win32PowerHandler(parameters, 12) : null,
        ["/manage/device/reboot"] =    (ctx, parameters, username) => OperatingSystem.IsWindows() ? Protocols.Wmi.Wmi_Win32PowerHandler(parameters, 6) : null,
        ["/manage/device/logoff"] =    (ctx, parameters, username) => OperatingSystem.IsWindows() ? Protocols.Wmi.Wmi_Win32PowerHandler(parameters, 4) : null,
        ["/manage/device/printtest"] = (ctx, parameters, username) => Proprietary.Printers.Generic.PrintTestPage(parameters),

        ["/manage/user/unlock"] =      (ctx, parameters, username) => OperatingSystem.IsWindows() ? Protocols.Ldap.UnlockUser(parameters) : null,
        ["/manage/user/enable"] =      (ctx, parameters, username) => OperatingSystem.IsWindows() ? Protocols.Ldap.EnableUser(parameters) : null,
        ["/manage/user/disable"] =     (ctx, parameters, username) => OperatingSystem.IsWindows() ? Protocols.Ldap.DisableUser(parameters) : null,

        ["/docs/list"] =               (ctx, parameters, username) => Tools.Documentation.List(parameters),
        ["/docs/create"] =             (ctx, parameters, username) => Tools.Documentation.Create(ctx, username),
        ["/docs/delete"] =             (ctx, parameters, username) => Tools.Documentation.Delete(parameters, username),
        ["/docs/view"] =               (ctx, parameters, username) => Tools.Documentation.View(ctx, parameters),

        ["/chat/history"] =            (ctx, parameters, username) => Chat.GetHistory(),

        ["/debit/list"] =              (ctx, parameters, username) => Tools.DebitNotes.List(parameters),
        ["/debit/view"] =              (ctx, parameters, username) => Tools.DebitNotes.View(parameters),
        ["/debit/create"] =            (ctx, parameters, username) => Tools.DebitNotes.Create(ctx, username),
        ["/debit/delete"] =            (ctx, parameters, username) => Tools.DebitNotes.Delete(parameters, username),
        ["/debit/return"] =            (ctx, parameters, username) => Tools.DebitNotes.Return(parameters, username),
        ["/debit/templates"] =         (ctx, parameters, username) => Tools.DebitNotes.ListTemplate(),
        ["/debit/banners"] =           (ctx, parameters, username) => Tools.DebitNotes.ListBanners(),

        ["/watchdog/list"] =           (ctx, parameters, username) => Tasks.Watchdog.List(),
        ["/watchdog/view"] =           (ctx, parameters, username) => Tasks.Watchdog.View(parameters),
        ["/watchdog/create"] =         (ctx, parameters, username) => Tasks.Watchdog.Create(ctx, parameters, username),
        ["/watchdog/delete"] =         (ctx, parameters, username) => Tasks.Watchdog.Delete(parameters, username),

        ["/notifications/list"] =      (ctx, parameters, username) => Tasks.Watchdog.ListNotifications(),
        ["/notifications/save"] =      (ctx, parameters, username) => Tasks.Watchdog.SaveNotifications(ctx, username),

        ["/lifeline/ping/view"] =       (ctx, parameters, username) => Tasks.Lifeline.ViewPing(parameters),
        ["/lifeline/memory/view"] =     (ctx, parameters, username) => Tasks.Lifeline.ViewFile(parameters, "memory"),
        ["/lifeline/cpu/view"] =        (ctx, parameters, username) => Tasks.Lifeline.ViewFile(parameters, "cpu"),
        ["/lifeline/disk/view"] =       (ctx, parameters, username) => Tasks.Lifeline.ViewFile(parameters, "disk"),
        ["/lifeline/diskio/view"] =     (ctx, parameters, username) => Tasks.Lifeline.ViewFile(parameters, "diskio"),
        ["/lifeline/printcount/view"] = (ctx, parameters, username) => Tasks.Lifeline.ViewFile(parameters, "printcount"),
        ["/lifeline/switchcount/view"] = (ctx, parameters, username) => Tasks.Lifeline.ViewFile(parameters, "switchcount"),

        ["/tools/bulkping"] =          (ctx, parameters, username) => Protocols.Icmp.BulkPing(parameters),
        ["/tools/dnslookup"] =         (ctx, parameters, username) => Protocols.Dns.Resolve(parameters),
        ["/tools/mdnslookup"] =        (ctx, parameters, username) => Protocols.Mdns.Resolve(parameters),
        ["/tools/ntp"] =               (ctx, parameters, username) => Protocols.Ntp.Request(parameters),
        ["/tools/locateip"] =          (ctx, parameters, username) => Tools.LocateIp.Locate(ctx),
        ["/tools/maclookup"] =         (ctx, parameters, username) => Tools.MacLookup.Lookup(ctx),
        ["/tools/nics/list"] =         (ctx, parameters, username) => Tools.IpDiscovery.ListNics(),

        //["/tools/downstream"] =        (ctx, parameters, username) => Tools.SpeedTest.DownStream(ctx, parameters),
        //["/tools/upstream"] =          (ctx, parameters, username) => Tools.SpeedTest.UpStream(ctx, parameters),
        
        ["/snmp/get"] =                (ctx, parameters, username) => Protocols.Snmp.Polling.GetHandler(ctx, parameters),
        ["/snmp/set"] =                (ctx, parameters, username) => Protocols.Snmp.Polling.SetHandler(ctx, parameters),
        ["/snmp/walk"] =               (ctx, parameters, username) => Protocols.Snmp.Polling.WalkHandler(ctx, parameters),
        ["/snmp/switchinterface"] =    (ctx, parameters, username) => Protocols.Snmp.Polling.SwitchInterface(parameters),

        ["/wmi/query"] =               (ctx, parameters, username) => OperatingSystem.IsWindows() ? Protocols.Wmi.Query(ctx, parameters) : null,
        ["/wmi/killprocess"] =         (ctx, parameters, username) => OperatingSystem.IsWindows() ? Protocols.Wmi.WmiKillProcess(parameters) : null,

        ["/rproxy/list"] =             (ctx, parameters, username) => Proxy.ReverseProxy.List(),
        ["/rproxy/create"] =           (ctx, parameters, username) => Proxy.ReverseProxy.Create(ctx, parameters, username),
        ["/rproxy/delete"] =           (ctx, parameters, username) => Proxy.ReverseProxy.Delete(parameters, username),
        ["/rproxy/start"] =            (ctx, parameters, username) => Proxy.ReverseProxy.Start(parameters, username),
        ["/rproxy/stop"] =             (ctx, parameters, username) => Proxy.ReverseProxy.Stop(parameters, username),

        ["/issues/start"] =            (ctx, parameters, username) => Issues.Start(username),

        ["/rbac/list"] =                (ctx, parameters, username) => Auth.ListUsers(),
        ["/rbac/create"] =              (ctx, parameters, username) => Auth.CreateUser(ctx, parameters, username),
        ["/rbac/delete"] =              (ctx, parameters, username) => Auth.DeleteUser(parameters, username),
        ["/rbac/sessions"] =            (ctx, parameters, username) => Auth.ListSessions(),
        ["/rbac/kickuser"] =            (ctx, parameters, username) => Auth.KickUser(parameters, username),

        ["/tasks/list"] =               (ctx, parameters, username) => Tasks.Tasks.ListTasks(),

        ["/config/checkupdate"] =       (ctx, parameters, username) => Update.CheckLatestRelease(),

        ["/config/backup/list"] =       (ctx, parameters, username) => Backup.List(),
        ["/config/backup/create"] =     (ctx, parameters, username) => Backup.Create(parameters, username),
        ["/config/backup/delete"] =     (ctx, parameters, username) => Backup.Delete(parameters, username),
        ["/config/backup/download"] =   (ctx, parameters, username) => Backup.Download(ctx, parameters, username),

        ["/config/zones/list"] =        (ctx, parameters, username) => Tools.Zones.ListZones(),
        ["/config/zones/save"] =        (ctx, parameters, username) => Tools.Zones.SaveZones(ctx, username),
        ["/config/dhcprange/list"] =    (ctx, parameters, username) => Tools.DhcpRange.ListRange(),
        ["/config/dhcprange/save"] =    (ctx, parameters, username) => Tools.DhcpRange.SaveRange(ctx, username),

        ["/config/smtpprofiles/list"] = (ctx, parameters, username) => Tools.SmtpProfiles.List(),
        ["/config/smtpprofiles/save"] = (ctx, parameters, username) => Tools.SmtpProfiles.Save(ctx, username),
        ["/config/smtpprofiles/test"] = (ctx, parameters, username) => Tools.SmtpProfiles.SendTest(parameters),
        ["/config/snmpprofiles/list"] = (ctx, parameters, username) => Tools.SnmpProfiles.List(),
        ["/config/snmpprofiles/save"] = (ctx, parameters, username) => Tools.SnmpProfiles.Save(ctx, username),

        ["/config/cert/list"] =         (ctx, parameters, username) => Tools.Cert.List(),
        ["/config/cert/upload"] =       (ctx, parameters, username) => Tools.Cert.Upload(ctx, username),
        ["/config/cert/create"] =       (ctx, parameters, username) => Tools.Cert.Create(ctx, username),
        ["/config/cert/delete"] =       (ctx, parameters, username) => Tools.Cert.Delete(parameters, username),
        ["/config/cert/download"] =     (ctx, parameters, username) => Tools.Cert.Download(ctx, parameters, username),

        ["/config/upload/iplocation"] = (ctx, parameters, username) => Update.LocationFormDataHandler(ctx),
        ["/config/upload/proxy"] =      (ctx, parameters, username) => Update.ProxyFormDataHandler(ctx),
        ["/config/upload/tor"] =        (ctx, parameters, username) => Update.TorFormDataHandler(ctx),

        ["/api/list"] =                 (ctx, parameters, username) => Tools.Api.List(),
        ["/api/save"] =                 (ctx, parameters, username) => Tools.Api.Save(ctx, username),

        ["/log/list"] =                 (ctx, parameters, username) => Logger.List(parameters)
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

    public void Start() {
        while (listener.IsListening) {
            IAsyncResult result = listener.BeginGetContext(ListenerCallback, listener);
            result.AsyncWaitHandle.WaitOne();
        }

        Console.WriteLine("Listener stopped");
    }

    public void Stop() {
        if (listener is not null && listener.IsListening) listener.Stop();
        listener.Abort();
    }

    private void ListenerCallback(IAsyncResult result) {
#if !DEBUG
        try
#endif
        {

        HttpListenerContext ctx = listener.EndGetContext(result);

        //Cross Site Request Forgery protection
        if (ctx.Request?.UrlReferrer is not null) {
            if (!Uri.IsWellFormedUriString(ctx.Request.UrlReferrer.ToString(), UriKind.Absolute)) {
                ctx.Response.StatusCode = 418; //I'm a teapot
                ctx.Response.Close();
                return;
            }

            string userHostName = ctx.Request.UserHostName;
            string referrerHost = ctx.Request.UrlReferrer.Host;
            int    referrerPort = ctx.Request.UrlReferrer.Port;
            bool isSameHost = String.Equals(referrerHost, userHostName, StringComparison.Ordinal);
            if (!isSameHost && !String.Equals($"{referrerHost}:{referrerPort}", userHostName, StringComparison.Ordinal)) {
                ctx.Response.StatusCode = 418; //I'm a teapot
                ctx.Response.Close();
                return;
            }

            UriHostNameType type = Uri.CheckHostName(referrerHost);
            if (type != UriHostNameType.Dns && type != UriHostNameType.IPv4 && type != UriHostNameType.IPv6) {
                ctx.Response.StatusCode = 418; //I'm a teapot
                ctx.Response.Close();
                return;
            }
        }

        string xRealIpHeader = ctx.Request?.Headers?.Get("X-Real-IP");
        if (xRealIpHeader is not null && IPAddress.TryParse(xRealIpHeader, out IPAddress realIp)) {
            if (IPAddress.IsLoopback(realIp)) {
                ctx.Response.StatusCode = 418; //I'm a teapot
                ctx.Response.Close();
                return;
            }
            ctx.Request.RemoteEndPoint.Address = realIp;
        }

        string path = ctx.Request.Url.PathAndQuery;

        if (String.Equals(path, "/auth", StringComparison.Ordinal)) {
            AuthHandler(ctx);
            ctx.Response.Close();
            return;
        }

        if (String.Equals(ctx.Request.Url?.LocalPath, "/api", StringComparison.Ordinal)) {
            Api.HandleApiCall(ctx);
            ctx.Response.Close();
            return;
        }

        if (String.Equals(path, "/contacts", StringComparison.Ordinal)) {
            byte[] buffer = DatabaseInstances.users.SerializeContacts();
            ctx.Response.StatusCode = (int)HttpStatusCode.OK;
            ctx.Response.OutputStream.Write(buffer, 0, buffer.Length);
            ctx.Response.AddHeader("Content-Length", buffer?.Length.ToString() ?? "0");
            ctx.Response.Close();
            return;
        }

        if (CacheHandler(ctx, path)) { return; }

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

        if (WebSocketHandler(ctx)) { return; }

        Dictionary<string, string> parameters = null;
        string query = ctx.Request.Url.Query;
        if (query.Length > 0) {
            parameters = ParseQuery(query);
        }

        if (DynamicHandler(ctx, parameters)) return;

        ctx.Response.StatusCode = (int)HttpStatusCode.NotFound;
        ctx.Response.Close();
        
        }
#if !DEBUG
        catch { }
#endif
    }

    public static Dictionary<string, string> ParseQuery(string queryString) {
        if (String.IsNullOrEmpty(queryString)) return null;

        Dictionary<string, string> parameters = new Dictionary<string, string>();

        ReadOnlySpan<char> span = queryString.AsSpan();
        if (span.StartsWith("?")) span = span[1..];

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

    private bool CacheHandler(HttpListenerContext ctx, string path) {
        if (!cache.cache.TryGetValue(path, out Cache.Entry entry)) return false;

        if (String.Equals(path, "/", StringComparison.Ordinal)) {
            if (!Auth.IsAuthenticated(ctx)) {
                entry = cache.cache.TryGetValue("/login", out Cache.Entry value) ? value : default;
            }
            else {
                entry = cache.cache["/"];
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
        ctx.Response.AddHeader("Length", buffer?.Length.ToString() ?? "0");

        for (int i = 0; i < entry.headers.Length; i++) {
            ctx.Response.AddHeader(entry.headers[i].Key, entry.headers[i].Value);
        }

        try {
            if (buffer is not null) ctx.Response.OutputStream.Write(buffer, 0, buffer.Length);
            ctx.Response.OutputStream.Flush();
#if DEBUG
        }
        catch (HttpListenerException ex) {
            Console.Error.WriteLine(ex.Message);
            Console.Error.WriteLine(ex.StackTrace);
        }
#else
        }
        catch (HttpListenerException) { /*do nothing*/ }
#endif

        ctx.Response.Close();
        return true;
    }

    private static bool AuthHandler(HttpListenerContext ctx) {
        if (!String.Equals(ctx.Request.HttpMethod, "POST", StringComparison.Ordinal)) {
            ctx.Response.StatusCode = (int)HttpStatusCode.BadRequest;
            return false;
        }

        IPAddress clientIP = ctx.Request.RemoteEndPoint?.Address;
        if (clientIP is null) {
            ctx.Response.StatusCode = (int)HttpStatusCode.BadRequest;
            return false;
        }

        if (IsRateLimited(clientIP)) {
            ctx.Response.StatusCode = (int)HttpStatusCode.TooManyRequests;
            return false;
        }

        bool isSuccessful = Auth.AttemptAuthentication(ctx, out _);
        ctx.Response.StatusCode = isSuccessful
            ? (int)HttpStatusCode.Accepted
            : (int)HttpStatusCode.Unauthorized;

        return true;
    }

    private static bool IsRateLimited(IPAddress clientIP) {
        List<long> timestamps = rateLimLog.GetOrAdd(clientIP, _ => new List<long>());

        long currentTime = DateTime.UtcNow.Ticks;
        for (int i = timestamps.Count - 1; i >= 0; i--) {
            if (currentTime - timestamps[i] > RATE_LIMIT_TIME_WINDOW) {
                timestamps.RemoveAt(i);
            }
        }

        if (rateLimLog[clientIP].Count >= MAX_REQUESTS_PER_WIN_PERIOD) {
            return true;
        }

        timestamps.Add(currentTime);
        return false;
    }

    private static bool DynamicHandler(HttpListenerContext ctx, Dictionary<string, string> parameters) {
        string sessionId = ctx.Request.Cookies["sessionid"]?.Value ?? null;
        string username = IPAddress.IsLoopback(ctx.Request.RemoteEndPoint.Address) ? "loopback" : Auth.GetUsername(sessionId);

        ctx.Response.AddHeader("Cache-Control", "no-cache");

        string path = ctx.Request.Url.AbsolutePath;
        if (routing.TryGetValue(path, out Func<HttpListenerContext, Dictionary<string, string>, string, byte[]> handler)) {
            byte[] buffer = handler(ctx, parameters, username);
            if (buffer is not null) {
                ctx.Response.StatusCode = (int)HttpStatusCode.OK;
                ctx.Response.AddHeader("Length", buffer?.Length.ToString() ?? "0");
                ctx.Response.OutputStream.Write(buffer, 0, buffer.Length);
            }

            ctx.Response.Close();
            return true;
        }
        else {
            return false;
        }
    }

    private static bool WebSocketHandler(HttpListenerContext ctx) {
        if (!ctx.Request.IsWebSocketRequest) {
            return false;
        }

        switch (ctx.Request.Url.AbsolutePath) {
        case "/ws/keepalive":        KeepAlive.WebSocketHandler(ctx);          return true;
        case "/ws/ping":             Protocols.Icmp.WebSocketHandler(ctx);     return true;
        case "/ws/dhcp":             Protocols.Dhcp.WebSocketHandler(ctx);     return true;
        case "/ws/telnet":           Protocols.Telnet.WebSocketHandler(ctx);   return true;
        case "/ws/ssh":              Protocols.Ssh.WebSocketHandler(ctx);      return true;
        case "/ws/issues":           Tasks.Issues.WebSocketHandler(ctx);       return true;
        case "/ws/reverseproxy":     Proxy.ReverseProxy.WebSocketHandler(ctx); return true;
        case "/ws/ipdiscovery":      Tools.IpDiscovery.WebSocketHandler(ctx);  return true;
        case "/ws/portscan":         Tools.PortScan.WebSocketHandler(ctx);     return true;
        case "/ws/traceroute":       Tools.TraceRoute.WebSocketHandler(ctx);   return true;
        case "/ws/sitecheck":        Tools.SiteCheck.WebSocketHandler(ctx);    return true;
        case "/ws/monitor":          Tools.Monitor.WebSocketHandler(ctx);      return true;
        case "/ws/livestats/device": Tools.LiveStats.DeviceStats(ctx);         return true;
        case "/ws/livestats/user":   Tools.LiveStats.UserStats(ctx);           return true;
        }

        return false;
    }

    public override string ToString() {
        string s = String.Empty;
        foreach (string prefix in listener.Prefixes) {
            s += (s.Length == 0 ? String.Empty : "\n") + "Listening on " + prefix;
        }

        return s;
    }
}
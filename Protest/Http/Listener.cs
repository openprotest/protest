#if !DEBUG && NET7_0_OR_GREATER
//#define DEFLATE
#define BROTLI
#endif

using System.Collections.Generic;
using System.Net;
using System.Runtime.CompilerServices;
using System.Text;
using System.Threading.Tasks;

namespace Protest.Http;

internal sealed class Listener {
    private const long MAX_AUTH_PAYLOAD = 4_096;

    private readonly HttpListener listener;
    private readonly Cache cache;

    //the socket peer of each IPEndPoint, before X-Forwarded-For replaced it
    private static readonly ConditionalWeakTable<IPEndPoint, IPAddress> peerAddresses = new ConditionalWeakTable<IPEndPoint, IPAddress>();

    //every handler is awaited, one that waits on another host hands over its Task, so the wait holds no thread,
    //the rest are synchronous, new() wraps their result in a ValueTask without allocating
    private static readonly Dictionary<string, Func<HttpListenerContext, string, ValueTask<byte[]>>> routing = new Dictionary<string, Func<HttpListenerContext, string, ValueTask<byte[]>>> {
        ["/logout"]                       = (ctx, username) => new(Auth.RevokeAccess(ctx, username) ? Data.CODE_OK.Array : Data.CODE_FAILED.Array),
        ["/version"]                      = (ctx, username) => new(Data.VersionToJson()),

        ["/barcode39"]                    = (ctx, username) => new(Protocols.Barcode39.GenerateSvgHandler(ctx)),
        ["/barcode128"]                   = (ctx, username) => new(Protocols.Barcode128B.GenerateSvgHandler(ctx)),

        ["/db/user/list"]                 = (ctx, username) => new(DatabaseInstances.users.Serialize(ctx)),
        ["/db/user/timeline"]             = (ctx, username) => new(DatabaseInstances.users.TimelineHandler(ctx)),
        ["/db/user/save"]                 = (ctx, username) => new(DatabaseInstances.users.SaveHandler(ctx, username)),
        ["/db/user/delete"]               = (ctx, username) => new(DatabaseInstances.users.DeleteHandler(ctx, username)),
        ["/db/user/grid"]                 = (ctx, username) => new(DatabaseInstances.users.GridHandler(ctx, username)),
        ["/db/user/attribute"]            = (ctx, username) => new(DatabaseInstances.users.AttributeValue(ctx)),

        ["/db/device/list"]               = (ctx, username) => new(DatabaseInstances.devices.Serialize(ctx)),
        ["/db/device/timeline"]           = (ctx, username) => new(DatabaseInstances.devices.TimelineHandler(ctx)),
        ["/db/device/save"]               = (ctx, username) => new(DatabaseInstances.devices.SaveHandler(ctx, username)),
        ["/db/device/delete"]             = (ctx, username) => new(DatabaseInstances.devices.DeleteHandler(ctx, username)),
        ["/db/device/grid"]               = (ctx, username) => new(DatabaseInstances.devices.GridHandler(ctx, username)),
        ["/db/device/attribute"]          = (ctx, username) => new(DatabaseInstances.devices.AttributeValue(ctx)),

        ["/vault/credential/list"]        = (ctx, username) => new(Vault.List()),
        ["/vault/credential/get"]         = (ctx, username) => new(Vault.GetSecret(ctx, username)),
        ["/vault/credential/save"]        = (ctx, username) => new(Vault.Save(ctx, username)),
        ["/vault/credential/delete"]      = (ctx, username) => new(Vault.Delete(ctx, username)),

        ["/vault/sshkey/list"]            = (ctx, username) => new(VaultSshKeys.List()),
        ["/vault/sshkey/get"]             = (ctx, username) => new(VaultSshKeys.GetSecret(ctx, username)),
        ["/vault/sshkey/save"]            = (ctx, username) => new(VaultSshKeys.Save(ctx, username)),
        ["/vault/sshkey/delete"]          = (ctx, username) => new(VaultSshKeys.Delete(ctx, username)),

        ["/vault/scan"]                   = (ctx, username) => new(VaultMigration.Scan(ctx, username)),
        ["/vault/orphans"]                = (ctx, username) => new(VaultMigration.FindOrphans()),
        ["/vault/duplicates"]             = (ctx, username) => new(VaultMigration.FindDuplicates()),
        ["/vault/deduplicate"]            = (ctx, username) => new(VaultMigration.Deduplicate(ctx, username)),
        ["/vault/users"]                  = (ctx, username) => new(Auth.ListUsernames()),

        ["/fetch/networkinfo"]            = (ctx, username) => new(Protocols.Ldap.NetworkInfo()),
        ["/fetch/integrations"]           = (ctx, username) => new(Integration.Integration.ListEnabled()),
        ["/fetch/singledevice"]           = (ctx, username) => new(Tasks.Fetch.SingleDeviceSerialize(ctx, true)),
        ["/fetch/singleuser"]             = (ctx, username) => new(Tasks.Fetch.SingleUserSerialize(ctx)),
        ["/fetch/status"]                 = (ctx, username) => new(Tasks.Fetch.Status()),
        ["/fetch/devices"]                = (ctx, username) => new(Tasks.Fetch.DevicesTask(ctx, username)),
        ["/fetch/users"]                  = (ctx, username) => new(Tasks.Fetch.UsersTask(ctx, username)),
        ["/fetch/approve"]                = (ctx, username) => new(Tasks.Fetch.ApproveLastTask(ctx, username)),
        ["/fetch/abort"]                  = (ctx, username) => new(Tasks.Fetch.CancelTask(username)),
        ["/fetch/discard"]                = (ctx, username) => new(Tasks.Fetch.DiscardLastTask(username)),
        ["/fetch/import"]                 = (ctx, username) => new(Tasks.Import.ImportTask(ctx, username)),

        ["/manage/device/wol"]            = (ctx, username) => new(Protocols.Wol.Wakeup(ctx)),
        ["/manage/device/shutdown"]       = (ctx, username) => new(OperatingSystem.IsWindows() ? Protocols.Wmi.Wmi_Win32PowerHandler(ctx, 12) : null),
        ["/manage/device/reboot"]         = (ctx, username) => new(OperatingSystem.IsWindows() ? Protocols.Wmi.Wmi_Win32PowerHandler(ctx, 6) : null),
        ["/manage/device/logoff"]         = (ctx, username) => new(OperatingSystem.IsWindows() ? Protocols.Wmi.Wmi_Win32PowerHandler(ctx, 4) : null),
        ["/manage/device/printtest"]      = (ctx, username) => new(Proprietary.Printers.Generic.PrintTestPage(ctx)),

        ["/manage/user/unlock"]           = (ctx, username) => new(OperatingSystem.IsWindows() ? Protocols.Ldap.UnlockUser(ctx, username) : null),
        ["/manage/user/enable"]           = (ctx, username) => new(OperatingSystem.IsWindows() ? Protocols.Ldap.EnableUser(ctx, username) : null),
        ["/manage/user/disable"]          = (ctx, username) => new(OperatingSystem.IsWindows() ? Protocols.Ldap.DisableUser(ctx, username) : null),

        ["/docs/list"]                    = (ctx, username) => new(Tools.Documentation.List(ctx)),
        ["/docs/create"]                  = (ctx, username) => new(Tools.Documentation.Create(ctx, username)),
        ["/docs/delete"]                  = (ctx, username) => new(Tools.Documentation.Delete(ctx, username)),
        ["/docs/view"]                    = (ctx, username) => new(Tools.Documentation.View(ctx)),

        ["/chat/history"]                 = (ctx, username) => new(Chat.GetHistory()),

        ["/debit/list"]                   = (ctx, username) => new(Tools.DebitNotes.List(ctx)),
        ["/debit/view"]                   = (ctx, username) => new(Tools.DebitNotes.View(ctx)),
        ["/debit/create"]                 = (ctx, username) => new(Tools.DebitNotes.Create(ctx, username)),
        ["/debit/delete"]                 = (ctx, username) => new(Tools.DebitNotes.Delete(ctx, username)),
        ["/debit/return"]                 = (ctx, username) => new(Tools.DebitNotes.Return(ctx, username)),
        ["/debit/templates"]              = (ctx, username) => new(Tools.DebitNotes.ListTemplate()),
        ["/debit/banners"]                = (ctx, username) => new(Tools.DebitNotes.ListBanners()),

        ["/watchdog/list"]                = (ctx, username) => new(Tasks.Watchdog.List()),
        ["/watchdog/view"]                = (ctx, username) => new(Tasks.Watchdog.View(ctx)),
        ["/watchdog/create"]              = (ctx, username) => new(Tasks.Watchdog.Create(ctx, username)),
        ["/watchdog/delete"]              = (ctx, username) => new(Tasks.Watchdog.Delete(ctx, username)),

        ["/notifications/list"]           = (ctx, username) => new(Tasks.Watchdog.ListNotifications()),
        ["/notifications/save"]           = (ctx, username) => new(Tasks.Watchdog.SaveNotifications(ctx, username)),

        ["/lifeline/ping/view"]           = (ctx, username) => new(Tasks.Lifeline.ViewPing(ctx)),
        ["/lifeline/memory/view"]         = (ctx, username) => new(Tasks.Lifeline.ViewFile(ctx, "memory")),
        ["/lifeline/cpu/view"]            = (ctx, username) => new(Tasks.Lifeline.ViewFile(ctx, "cpu")),
        ["/lifeline/disk/view"]           = (ctx, username) => new(Tasks.Lifeline.ViewFile(ctx, "disk")),
        ["/lifeline/diskio/view"]         = (ctx, username) => new(Tasks.Lifeline.ViewFile(ctx, "diskio")),
        ["/lifeline/printcount/view"]     = (ctx, username) => new(Tasks.Lifeline.ViewFile(ctx, "printcount")),
        ["/lifeline/switchcount/view"]    = (ctx, username) => new(Tasks.Lifeline.ViewFile(ctx, "switchcount")),
        ["/lifeline/switchstpchanges/view"] = (ctx, username) => new(Tasks.Lifeline.ViewFile(ctx, "switchstpchanges")),
        ["/lifeline/months"]              = (ctx, username) => new(Tasks.Lifeline.ListMonths(ctx)),
        ["/lifeline/devices"]             = (ctx, username) => new(Tasks.Lifeline.ListDevices()),

        ["/tools/bulkping"]               = (ctx, username) => new(Protocols.Icmp.BulkPing(ctx)),
        ["/tools/dnslookup"]              = (ctx, username) => new(Protocols.Dns.Resolve(ctx)),
        ["/tools/mdnslookup"]             = (ctx, username) => new(Protocols.Mdns.Resolve(ctx)),
        ["/tools/ntp"]                    = (ctx, username) => new(Protocols.Ntp.Request(ctx)),
        ["/tools/maclookup"]              = (ctx, username) => new(Tools.MacLookup.Lookup(ctx)),
        ["/tools/nics/list"]              = (ctx, username) => new(Tools.IpDiscovery.ListNics()),
        ["/serial/ports"]                 = (ctx, username) => new(Protocols.SerialCom.ListPorts()),

        ["/snmp/get"]                     = (ctx, username) => new(Protocols.Snmp.Polling.GetHandler(ctx)),
        ["/snmp/set"]                     = (ctx, username) => new(Protocols.Snmp.Polling.SetHandler(ctx)),
        ["/snmp/walk"]                    = (ctx, username) => new(Protocols.Snmp.Polling.WalkHandler(ctx)),
        ["/snmp/switchinterface"]         = (ctx, username) => new(Protocols.Snmp.Polling.GetInterfaces(ctx)),

        ["/snmptraps/list"]               = (ctx, username) => new(Protocols.Snmp.Traps.ListHandler(ctx)),
        ["/snmptraps/devices"]            = (ctx, username) => new(Protocols.Snmp.Traps.ListDevices()),
        ["/snmptraps/summary"]            = (ctx, username) => new(Protocols.LogFiles.SummaryHandler(ctx, Data.DIR_SNMP_TRAPS, 6)),
        ["/snmptraps/listeners/list"]     = (ctx, username) => new(Protocols.Snmp.Traps.List()),
        ["/snmptraps/listeners/save"]     = (ctx, username) => new(Protocols.Snmp.Traps.Save(ctx, username)),

        ["/syslog/list"]                  = (ctx, username) => new(Protocols.Syslog.ListHandler(ctx)),
        ["/syslog/devices"]               = (ctx, username) => new(Protocols.Syslog.ListDevices()),
        ["/syslog/summary"]               = (ctx, username) => new(Protocols.LogFiles.SummaryHandler(ctx, Data.DIR_SYSLOG, 8)),
        ["/syslog/listeners/list"]        = (ctx, username) => new(Protocols.Syslog.List()),
        ["/syslog/listeners/save"]        = (ctx, username) => new(Protocols.Syslog.Save(ctx, username)),

        ["/winevents/list"]               = (ctx, username) => new(Protocols.WinEvents.ListHandler(ctx)),
        ["/winevents/devices"]            = (ctx, username) => new(Protocols.WinEvents.ListDevices()),
        ["/winevents/summary"]            = (ctx, username) => new(Protocols.WinEvents.SummaryHandler(ctx)),
        ["/winevents/fetch"]              = (ctx, username) => new(Protocols.WinEvents.FetchHandlerAsync(ctx)),

        ["/sftp/download"]                = (ctx, username) => new(Protocols.Sftp.DownloadFileHandler(ctx, username)),
        ["/sftp/upload"]                  = (ctx, username) => new(Protocols.Sftp.UploadFileHandler(ctx, username)),

        ["/wmi/query"]                    = (ctx, username) => new(OperatingSystem.IsWindows() ? Protocols.Wmi.Query(ctx) : null),
        ["/wmi/killprocess"]              = (ctx, username) => new(OperatingSystem.IsWindows() ? Protocols.Wmi.WmiKillProcess(ctx) : null),

        ["/rproxy/list"]                  = (ctx, username) => new(Proxy.ReverseProxy.List()),
        ["/rproxy/create"]                = (ctx, username) => new(Proxy.ReverseProxy.Create(ctx, username)),
        ["/rproxy/delete"]                = (ctx, username) => new(Proxy.ReverseProxy.Delete(ctx, username)),
        ["/rproxy/start"]                 = (ctx, username) => new(Proxy.ReverseProxy.Start(ctx, username)),
        ["/rproxy/stop"]                  = (ctx, username) => new(Proxy.ReverseProxy.Stop(ctx, username)),

        ["/issues/start"]                 = (ctx, username) => new(Tasks.Issues.Start(username)),

        ["/rbac/list"]                    = (ctx, username) => new(Auth.ListUsers()),
        ["/rbac/create"]                  = (ctx, username) => new(Auth.CreateUser(ctx, username)),
        ["/rbac/delete"]                  = (ctx, username) => new(Auth.DeleteUser(ctx, username)),
        ["/rbac/sessions"]                = (ctx, username) => new(Auth.ListSessions()),
        ["/rbac/kickuser"]                = (ctx, username) => new(Auth.KickUser(ctx, username)),
        ["/rbac/reregistermfa"]           = (ctx, username) => new(Auth.ResetMfaSecret(ctx, username)),

        ["/scheduler/list"]               = (ctx, username) => new(Tasks.Scheduler.List()),
        ["/scheduler/save"]               = (ctx, username) => new(Tasks.Scheduler.Save(ctx, username)),
        ["/scheduler/run"]                = (ctx, username) => new(Tasks.Scheduler.Run(ctx, username)),

        ["/config/checkupdate"]           = (ctx, username) => new(Update.CheckLatestRelease()),

        ["/config/backup/list"]           = (ctx, username) => new(Backup.List()),
        ["/config/backup/create"]         = (ctx, username) => new(Backup.Create(ctx, username)),
        ["/config/backup/delete"]         = (ctx, username) => new(Backup.Delete(ctx, username)),
        ["/config/backup/download"]       = (ctx, username) => new(Backup.Download(ctx, username)),

        ["/config/zones/list"]            = (ctx, username) => new(Tools.Zones.ListZones()),
        ["/config/zones/save"]            = (ctx, username) => new(Tools.Zones.SaveZones(ctx, username)),
        ["/config/dhcprange/list"]        = (ctx, username) => new(Tools.DhcpRange.ListRange()),
        ["/config/dhcprange/save"]        = (ctx, username) => new(Tools.DhcpRange.SaveRange(ctx, username)),

        ["/config/smtpprofiles/list"]           = (ctx, username) => new(Tools.SmtpProfiles.List()),
        ["/config/smtpprofiles/save"]           = (ctx, username) => new(Tools.SmtpProfiles.Save(ctx, username)),
        ["/config/smtpprofiles/test"]           = (ctx, username) => new(Tools.SmtpProfiles.SendTest(ctx)),
        ["/config/smtpprofiles/oauth/start"]    = (ctx, username) => new(Tools.SmtpOAuth.Start(ctx)),
        ["/config/smtpprofiles/oauth/poll"]     = (ctx, username) => new(Tools.SmtpOAuth.Poll(ctx)),
        ["/config/smtpprofiles/oauth/complete"] = (ctx, username) => new(Tools.SmtpOAuth.Complete(ctx)),

        ["/config/snmpprofiles/list"]     = (ctx, username) => new(Tools.SnmpProfiles.List(ctx)),
        ["/config/snmpprofiles/save"]     = (ctx, username) => new(Tools.SnmpProfiles.Save(ctx, username)),

        ["/config/integration/types"]     = (ctx, username) => new(Integration.Integration.GetTypes()),
        ["/config/integration/list"]      = (ctx, username) => new(Integration.Integration.List()),
        ["/config/integration/get"]       = (ctx, username) => new(Integration.Integration.Get(ctx)),
        ["/config/integration/save"]      = (ctx, username) => new(Integration.Integration.Save(ctx, username)),
        ["/config/integration/delete"]    = (ctx, username) => new(Integration.Integration.Delete(ctx, username)),
        ["/config/integration/test"]      = (ctx, username) => new(Integration.Integration.Test(ctx, username)),

        ["/config/cert/list"]             = (ctx, username) => new(Tools.Cert.List()),
        ["/config/cert/create"]           = (ctx, username) => new(Tools.Cert.Create(ctx, username)),
        ["/config/cert/delete"]           = (ctx, username) => new(Tools.Cert.Delete(ctx, username)),
        ["/config/cert/info"]             = (ctx, username) => new(Tools.Cert.GetCertInfo(ctx)),
        ["/config/cert/upload"]           = (ctx, username) => new(Tools.Cert.Upload(ctx, username)),
        ["/config/cert/download"]         = (ctx, username) => new(Tools.Cert.Download(ctx, username)),

        ["/config/dataretention/lifeline"]       = (ctx, username) => new(DataRetention.Handler(ctx, username, "lifeline")),
        ["/config/dataretention/lastseen"]       = (ctx, username) => new(DataRetention.Handler(ctx, username, "lastseen")),
        ["/config/dataretention/watchdog"]       = (ctx, username) => new(DataRetention.Handler(ctx, username, "watchdog")),
        ["/config/dataretention/recordings"]     = (ctx, username) => new(DataRetention.Handler(ctx, username, "recordings")),
        ["/config/dataretention/logs"]           = (ctx, username) => new(DataRetention.Handler(ctx, username, "logs")),
        ["/config/dataretention/syslog"]         = (ctx, username) => new(DataRetention.Handler(ctx, username, "syslog")),
        ["/config/dataretention/snmptraps"]      = (ctx, username) => new(DataRetention.Handler(ctx, username, "snmptraps")),
        ["/config/dataretention/winevents"]      = (ctx, username) => new(DataRetention.Handler(ctx, username, "winevents")),
        ["/config/dataretention/devicetimeline"] = (ctx, username) => new(DataRetention.Handler(ctx, username, "devicetimeline")),
        ["/config/dataretention/usertimeline"]   = (ctx, username) => new(DataRetention.Handler(ctx, username, "usertimeline")),

        ["/config/dataretention/settings/list"]  = (ctx, username) => new(DataRetention.ListSettings()),
        ["/config/dataretention/settings/save"]  = (ctx, username) => new(DataRetention.SaveSettings(ctx, username)),

        ["/config/sessionrecording/get"]  = (ctx, username) => new(Protocols.SessionRecording.GetSettings()),
        ["/config/sessionrecording/save"] = (ctx, username) => new(Protocols.SessionRecording.SaveSettings(ctx, username)),

        ["/api/list"]                     = (ctx, username) => new(Tools.Api.List()),
        ["/api/save"]                     = (ctx, username) => new(Tools.Api.Save(ctx, username)),

        ["/log/list"]                     = (ctx, username) => new(Logger.List(ctx)),

        ["/recordings/list"]              = (ctx, username) => new(Protocols.SessionRecording.ListHandler(ctx)),
        ["/recordings/meta"]              = (ctx, username) => new(Protocols.SessionRecording.MetaHandler(ctx))
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
                //an async method runs synchronously up to its first await that does not complete, called inline the synchronous handlers
                //would run on this loop, and a slow one (a winevents/list page reads up to 256MB) would hold back every other request
                _ = Task.Run(() => ListenerCallback(ctx));
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
            //the managed listener (Linux, macOS) hands every request of a keep-alive connection the same IPEndPoint,
            //start from the socket peer, so the client of one request is never carried into the next
            IPEndPoint remoteEndPoint = ctx.Request.RemoteEndPoint;
            IPAddress remoteIp = peerAddresses.GetValue(remoteEndPoint, endPoint => endPoint.Address);
            remoteEndPoint.Address = remoteIp;

            string xForwardedForHeader = ctx.Request?.Headers?.Get("X-Forwarded-For");
            if (String.IsNullOrEmpty(xForwardedForHeader)) {
                //a proxy on this host would pass the backdoor for every client it forwards
                if (Configuration.backdoor && IPAddress.IsLoopback(remoteIp) && Configuration.trustedProxies.Contains(remoteIp)) {
                    Logger.Action("Unauthenticated", "AAA", $"Rejected request without X-Forwarded-For from trusted proxy {remoteIp}");
                    ctx.Response.StatusCode = 400;
                    ctx.Response.Close();
                    return;
                }
            }
            else {
                if (!Configuration.trustedProxies.Contains(remoteIp)) {
                    Logger.Action("Unauthenticated", "AAA", $"Rejected X-Forwarded-For from non-trusted peer {remoteIp}");
                    ctx.Response.StatusCode = 400;
                    ctx.Response.Close();
                    return;
                }

                //each proxy appends the address it received the request from, entries to its left came from the client and can be forged,
                //walk from the right, past our trusted proxies, the first other entry is the client
                ReadOnlySpan<char> span = xForwardedForHeader.AsSpan();
                IPAddress xForwardedIp;
                while (true) {
                    int commaIndex = span.LastIndexOf(',');
                    if (!IPAddress.TryParse(span[(commaIndex + 1)..].Trim(), out xForwardedIp)) break;
                    if (commaIndex < 0 || !Configuration.trustedProxies.Contains(xForwardedIp)) break;
                    span = span[..commaIndex];
                }

                if (xForwardedIp is null) {
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

                remoteEndPoint.Address = xForwardedIp;
            }

            //DNS rebinding: a page whose name now points to 127.0.0.1 is same-origin to itself, the backdoor would let it in,
            //with the backdoor on, a loopback client has to name a loopback host
            if (Configuration.backdoor && IPAddress.IsLoopback(remoteEndPoint.Address) && !ctx.Request.Url.IsLoopback) {
                Logger.Action("Unauthenticated", "AAA", $"Rejected loopback request for host {ctx.Request.UserHostName}");
                ctx.Response.StatusCode = 400;
                ctx.Response.Close();
                return;
            }

            //behind a proxy the Host header names the backend, the origin checks need the host the browser used
            string host = ctx.Request.UserHostName;
            string xForwardedHostHeader = ctx.Request.Headers.Get("X-Forwarded-Host");
            if (xForwardedHostHeader is not null) {
                //a proxy that appends would keep the entries the client sent, only a single value set by the proxy is accepted
                if (!Configuration.trustedProxies.Contains(remoteIp) || xForwardedHostHeader.Contains(',')) {
                    Logger.Action("Unauthenticated", "AAA", $"Rejected X-Forwarded-Host from {remoteIp}");
                    ctx.Response.StatusCode = 400;
                    ctx.Response.Close();
                    return;
                }

                host = xForwardedHostHeader.Trim();
            }

            ctx.Response.AddHeader("X-Frame-Options", "DENY");
            ctx.Response.AddHeader("X-Content-Type-Options", "nosniff");

            //relaxed policy for debit-notes printing
            //wasm-unsafe-eval lets the IronRDP client compile its WebAssembly module
            //blob: media lets the RTSP viewer play through Media Source Extensions, its object URLs only come from scripts of this origin
            ctx.Response.AddHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; img-src 'self' data:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
            //ctx.Response.AddHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' data:");

            string path = ctx.Request.Url.PathAndQuery;

            if (String.Equals(path, "/auth", StringComparison.Ordinal)) {
                //before the rate limit, or any site could have the user's browser use it up and lock them out
                if (!IsSameOrigin(ctx, host)) {
                    Logger.Action("Unauthenticated", "AAA", $"Rejected cross-origin request to /auth from {ctx.Request.Headers.Get("Origin") ?? ctx.Request.Headers.Get("Sec-Fetch-Site")}");
                    ctx.Response.StatusCode = (int)HttpStatusCode.Forbidden;
                    ctx.Response.Close();
                    return;
                }

                //read whole, before anyone is authenticated, a chunked body has no length to check
                if (ctx.Request.ContentLength64 < 0 || ctx.Request.ContentLength64 > MAX_AUTH_PAYLOAD) {
                    ctx.Response.StatusCode = (int)HttpStatusCode.RequestEntityTooLarge;
                    ctx.Response.Close();
                    return;
                }

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
                if (Configuration.addressBook || Auth.IsAuthenticated(ctx)) {
                    byte[] buffer = DatabaseInstances.users.SerializeContacts();
                    ctx.Response.StatusCode = (int)HttpStatusCode.OK;
                    ctx.Response.ContentLength64 = buffer?.Length ?? 0;
                    if (buffer is not null) {
                        await ctx.Response.OutputStream.WriteAsync(buffer);
                    }
                }
                else {
                    ctx.Response.StatusCode = (int)HttpStatusCode.Forbidden;
                }

                ctx.Response.Close();
                return;
            }

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

            if (!IsSameOrigin(ctx, host)) {
                Logger.Action(Auth.GetPrincipal(ctx) ?? "Unauthenticated", "AAA", $"Rejected cross-origin request to {ctx.Request.Url.AbsolutePath} from {ctx.Request.Headers.Get("Origin") ?? ctx.Request.Headers.Get("Sec-Fetch-Site")}");
                ctx.Response.StatusCode = (int)HttpStatusCode.Forbidden;
                ctx.Response.Close();
                return;
            }

            if (await WebSocketHandler(ctx, host)) return;

            //streamed, outside the byte[] routing
            if (String.Equals(ctx.Request.Url.AbsolutePath, "/speedtest", StringComparison.Ordinal)) {
                await Tools.SpeedTest.Handler(ctx);
                return;
            }

            Dictionary<string, string> parameters = ParseQuery(ctx);

            if (await DynamicHandler(ctx, parameters)) return;

            ctx.Response.StatusCode = (int)HttpStatusCode.NotFound;
            ctx.Response.Close();
        }
#if !DEBUG
        catch (Exception ex) {
            Logger.Debug(ex);
            ctx.Response.Abort();
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
        ctx.Response.AddHeader("Cache-Control", "no-store");

        string path = ctx.Request.Url.AbsolutePath;
        if (!routing.TryGetValue(path, out Func<HttpListenerContext, string, ValueTask<byte[]>> handler)) {
            return false;
        }

        string username = Auth.GetPrincipal(ctx);
        if (username is null) {
            ctx.Response.StatusCode = (int)HttpStatusCode.Forbidden;
            ctx.Response.Close();
            return true;
        }

        byte[] buffer = await handler(ctx, username);
        ctx.Response.StatusCode = (int)HttpStatusCode.OK;
        ctx.Response.ContentLength64 = buffer?.Length ?? 0;

        if (buffer is not null) {
            await ctx.Response.OutputStream.WriteAsync(buffer);
        }

        ctx.Response.Close();
        return true;
    }

    //SameSite=Strict still sends the session cookie from pages of the same site: other ports of this host, our own reverse proxies,
    //sibling subdomains, and links opened from other applications. Only requests from this exact origin may act with it.
    //Sec-Fetch-Site is set by the browser and also covers GETs, which carry no Origin. With neither header the client is not a browser,
    //or one too old to send them, and is let through.
    private static bool IsSameOrigin(HttpListenerContext ctx, string host) {
        string fetchSite = ctx.Request.Headers.Get("Sec-Fetch-Site");
        if (fetchSite is not null) {
            return String.Equals(fetchSite, "same-origin", StringComparison.Ordinal);
        }

        string origin = ctx.Request.Headers.Get("Origin");
        return origin is null || IsOwnOrigin(origin, host);
    }

    //host and port must match the host the browser used, the scheme is not compared, behind a TLS-terminating proxy the listener can't tell it
    private static bool IsOwnOrigin(string origin, string host) {
        if (String.IsNullOrEmpty(origin) || String.IsNullOrEmpty(host)) return false;
        if (!Uri.TryCreate(origin, UriKind.Absolute, out Uri originUri)) return false;

        //browsers leave the default port out of Host
        return String.Equals(host, $"{originUri.Host}:{originUri.Port}", StringComparison.OrdinalIgnoreCase)
            || originUri.IsDefaultPort && String.Equals(host, originUri.Host, StringComparison.OrdinalIgnoreCase);
    }

    private static async Task<bool> WebSocketHandler(HttpListenerContext ctx, string host) {
        if (!ctx.Request.IsWebSocketRequest) {
            return false;
        }

        string origin = ctx.Request.Headers.Get("Origin");

        if (!IsOwnOrigin(origin, host)) {
            Logger.Action("Unauthenticated", "AAA", $"Rejected WebSocket from cross-origin {origin} (host {host})");
            ctx.Response.StatusCode = 403;
            ctx.Response.Close();
            return true;
        }

        switch (ctx.Request.Url.AbsolutePath) {
        case "/ws/keepalive"        : await KeepAlive.WebSocketHandler(ctx);           return true;
        case "/ws/reverseproxy"     : await Proxy.ReverseProxy.WebSocketHandler(ctx);  return true;
        case "/ws/ping"             : await Protocols.Icmp.WebSocketHandler(ctx);      return true;
        case "/ws/dhcp"             : await Protocols.Dhcp.WebSocketHandler(ctx);      return true;
        case "/ws/telnet"           : await Protocols.Telnet.WebSocketHandler(ctx);    return true;
        case "/ws/ssh"              : await Protocols.Ssh.WebSocketHandler(ctx);       return true;
        case "/ws/serial"           : await Protocols.SerialCom.WebSocketHandler(ctx); return true;
        case "/ws/sftp"             : await Protocols.Sftp.WebSocketHandler(ctx);      return true;
        case "/ws/vnc"              : await Protocols.Vnc.WebSocketHandler(ctx);       return true;
        case "/ws/rdp"              : await Protocols.Rdp.WebSocketHandler(ctx);       return true;
        case "/ws/rustdesk"         : await Protocols.RustDesk.WebSocketHandler(ctx);  return true;
        case "/ws/rtsp"             : await Protocols.Rtsp.WebSocketHandler(ctx);      return true;
        case "/ws/terminal"         : await Tools.Terminal.WebSocketHandler(ctx);      return true;
        case "/ws/winrm"            : await Tools.WinRM.WebSocketHandler(ctx);         return true;
        case "/ws/ipdiscovery"      : await Tools.IpDiscovery.WebSocketHandler(ctx);   return true;
        case "/ws/portscan"         : await Tools.PortScan.WebSocketHandler(ctx);      return true;
        case "/ws/traceroute"       : await Tools.TraceRoute.WebSocketHandler(ctx);    return true;
        case "/ws/websitecheck"     : await Tools.WebsiteCheck.WebSocketHandler(ctx);  return true;
        case "/ws/speedtest"        : await Tools.SpeedTest.WebSocketHandler(ctx);     return true;
        case "/ws/monitor"          : await Tools.Monitor.WebSocketHandler(ctx);       return true;
        case "/ws/topology"         : await Tools.Topology.WebSocketHandler(ctx);      return true;
        case "/ws/livestats/device" : await Tools.LiveStats.DeviceStats(ctx);          return true;
        case "/ws/livestats/user"   : await Tools.LiveStats.UserStats(ctx);            return true;
        case "/ws/issues"           : await Tasks.Issues.WebSocketHandler(ctx);        return true;
        case "/ws/recordingplayback": await Protocols.SessionRecording.PlaybackWebSocketHandler(ctx); return true;
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

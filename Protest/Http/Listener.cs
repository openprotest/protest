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

            string scheme = ctx.Request.Url.Scheme;
            string xForwardedProtoHeader = ctx.Request.Headers.Get("X-Forwarded-Proto");
            if (xForwardedProtoHeader is not null) {
                if (!Configuration.trustedProxies.Contains(remoteIp)
                    || (xForwardedProtoHeader != "http" && xForwardedProtoHeader != "https")) {
                    Logger.Action("Unauthenticated", "AAA", $"Rejected X-Forwarded-Proto from {remoteIp}");
                    ctx.Response.StatusCode = (int)HttpStatusCode.BadRequest;
                    ctx.Response.Close();
                    return;
                }

                scheme = xForwardedProtoHeader;
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
                if (!IsSameOrigin(ctx, host, scheme)) {
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

            if (!IsSameOrigin(ctx, host, scheme)) {
                Logger.Action(Auth.GetPrincipal(ctx) ?? "Unauthenticated", "AAA", $"Rejected cross-origin request to {ctx.Request.Url.AbsolutePath} from {ctx.Request.Headers.Get("Origin") ?? ctx.Request.Headers.Get("Sec-Fetch-Site")}");
                ctx.Response.StatusCode = (int)HttpStatusCode.Forbidden;
                ctx.Response.Close();
                return;
            }

            if (await WebSocketHandler(ctx, host, scheme)) return;

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
        if (!Router.routes.TryGetValue(path, out Func<HttpListenerContext, string, ValueTask<byte[]>> handler)) {
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

    //SameSite=Strict still allows requests from other ports and same-site subdomains.
    //Without Fetch Metadata, require a matching Origin or, if Origin is absent, Referer.
    private static bool IsSameOrigin(HttpListenerContext ctx, string host, string scheme) {
        string fetchSite = ctx.Request.Headers.Get("Sec-Fetch-Site");
        if (fetchSite is not null) {
            return String.Equals(fetchSite, "same-origin", StringComparison.Ordinal);
        }

        string origin = ctx.Request.Headers.Get("Origin");
        return IsOwnOrigin(origin ?? ctx.Request.Headers.Get("Referer"), host, scheme);
    }

    //Compare the browser-facing scheme, host, and effective port, using forwarded values from a trusted proxy when present.
    private static bool IsOwnOrigin(string origin, string host, string scheme) {
        if (String.IsNullOrEmpty(origin) || String.IsNullOrEmpty(host)) return false;
        if (!Uri.TryCreate(origin, UriKind.Absolute, out Uri originUri)) return false;
        if (!Uri.TryCreate($"{scheme}://{host}", UriKind.Absolute, out Uri targetUri)) return false;

        return String.Equals(originUri.Scheme, targetUri.Scheme, StringComparison.OrdinalIgnoreCase)
            && String.Equals(originUri.Host, targetUri.Host, StringComparison.OrdinalIgnoreCase)
            && originUri.Port == targetUri.Port;
    }

    private static async Task<bool> WebSocketHandler(HttpListenerContext ctx, string host, string scheme) {
        if (!ctx.Request.IsWebSocketRequest) return false;

        string origin = ctx.Request.Headers.Get("Origin");

        if (!IsOwnOrigin(origin, host, scheme)) {
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

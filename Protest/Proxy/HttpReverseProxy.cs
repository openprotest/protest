using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Connections;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Server.Kestrel.Core;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Primitives;
using Yarp.ReverseProxy.Configuration;
using Yarp.ReverseProxy.Forwarder;
using Yarp.ReverseProxy.Transforms;

namespace Protest.Proxy;

internal sealed class HttpReverseProxy : ReverseProxyAbstract {
    private IHostBuilder hostBuilder;
    private IHost host;
    private readonly HttpLimits limits;

    public HttpReverseProxy(Guid guid, HttpLimits limits, IpFilter ipFilter) : base(guid, ipFilter) {
        this.limits = limits;
    }

    public override bool Start(IPEndPoint proxy, string destination, string certificate, string password, string origin) {
        Exception returnStatus = null;
        bool toListener = IsListener(destination);

        try {
            hostBuilder = Host.CreateDefaultBuilder();

            hostBuilder.ConfigureLogging(logger => ConfigureLogging(logger));

            ClusterConfig cluster = new ClusterConfig {
                ClusterId    = "c1",
                HttpRequest  = new ForwarderRequestConfig { ActivityTimeout = Timeout.InfiniteTimeSpan },
                Destinations = new Dictionary<string, DestinationConfig> {{ "d1", new DestinationConfig { Address = destination }}}
            };

            hostBuilder.ConfigureWebHostDefaults(webHost => {
                webHost.ConfigureKestrel(options => this.ConfigureKestrel(options, proxy, certificate, password));
                webHost.Configure(application => this.Configure(application));

                RouteConfig[] routes = new RouteConfig[] {
                    new RouteConfig {
                        RouteId   = "r1",
                        ClusterId = "c1",
                        Match     = new RouteMatch { Path = "/{**all}" }
                    }
                };

                webHost.ConfigureServices(services => ConfigureServices(services, routes, new ClusterConfig[] { cluster }, toListener));
            });

            //string destinations = cluster.Destinations.Values
            //    .Select(o=> o.Address.ToString())
            //    .Aggregate((destination, accumulator)=> String.IsNullOrEmpty(accumulator) ? destination : $"{accumulator}, {destination}");

            this.host = hostBuilder.Build();

            this.thread = new Thread(async () => {
                try {
                    await this.host.RunAsync(cancellationToken);
                }
                catch (Exception ex) {
                    Interlocked.Increment(ref this.errors);
                    returnStatus = ex;
                }
                finally {
                    await Task.Delay(50);
                    ReverseProxy.running.TryRemove(this.guid.ToString(), out _);
                    Stop(origin);
                }
            });

            this.thread.Priority = ThreadPriority.AboveNormal;
            this.thread.Start();
        }
        catch (Exception ex) {
            Logger.Error(ex);
            throw;
        }

        Thread.Sleep(500);
        if (returnStatus is not null) {
            throw returnStatus;
        }

        return base.Start(proxy, destination, certificate, password, origin);
    }

    public override bool Stop(string origin) {
        try {
            if (this.host is not null) {
                cancellationTokenSource.Cancel();
                this.host.StopAsync(CancellationToken.None).GetAwaiter().GetResult();
            }
        }
        catch (Exception ex) {
            Logger.Error(ex);
            throw;
        }
        finally {
            this.host?.Dispose();
            this.host = null;
        }

        return base.Stop(origin);
    }

    private static void ConfigureLogging(ILoggingBuilder logger) {
        logger.ClearProviders();

#if DEBUG
        logger.AddConsole();
        logger.SetMinimumLevel(LogLevel.Warning);
        logger.AddFilter("Microsoft", LogLevel.Warning);
        logger.AddFilter("Microsoft.Hosting.Lifetime", LogLevel.Information);
        logger.AddFilter("Yarp.ReverseProxy", LogLevel.Warning);
#endif
    }

    private void ConfigureKestrel(KestrelServerOptions options, IPEndPoint endPoint, string certificate = null, string password = null) {
        try {
            limits.Apply(options.Limits);

            options.Listen(endPoint, listenOptions => {
                //registered first, so filtered clients are dropped before the TLS handshake
                if (ipFilter.enabled) {
                    listenOptions.Use(FilterConnections(ipFilter));
                }

                if (String.IsNullOrEmpty(certificate)) return;

                if (String.IsNullOrEmpty(password)) {
                    listenOptions.UseHttps(certificate);
                }
                else {
                    listenOptions.UseHttps(certificate, password);
                }
            });
        }
        catch (Exception ex) {
            Thread.Sleep(50);
            Logger.Error(ex);
            ReverseProxy.running.TryRemove(this.guid.ToString(), out _);
            Stop("system");
            throw;
        }
    }

    //captures only the filter, the middleware lives as long as the host
    private static Func<ConnectionDelegate, ConnectionDelegate> FilterConnections(IpFilter filter) =>
        next => connection => {
            if (filter.IsAllowed(connection.RemoteEndPoint)) {
                return next(connection);
            }

            connection.Abort();
            return Task.CompletedTask;
        };

    private void Configure(IApplicationBuilder application) {
        application.UseMiddleware<TrafficCountingHttpMiddleware>(bytesRx, bytesTx);
        application.UseRouting();
        application.UseEndpoints(endpoints => endpoints.MapReverseProxy());
    }

    private static void ConfigureServices(IServiceCollection services, IReadOnlyList<RouteConfig> routes, IReadOnlyList<ClusterConfig> clusters, bool toListener) {
        services.AddSingleton<IHostLifetime, CustomHostLifetime>();
        //services.AddSingleton(bytesRx);
        //services.AddSingleton(bytesTx);

        IReverseProxyBuilder rpBuilder = services.AddReverseProxy();

        rpBuilder.LoadFromMemory(routes, clusters);

        //YARP sets X-Forwarded-For, -Proto and -Host on its own, replacing any the client sent
        //the session cookie is kept from every backend but Pro-test itself
        if (!toListener) {
            rpBuilder.AddTransforms(builderContext => {
                builderContext.AddRequestTransform(RemoveSessionCookieTransform);
                builderContext.AddResponseTransform(RemoveSessionSetCookieTransform);
            });
        }
    }

    //cookies are not scoped to a port, a browser sends the Pro-test session cookie to a proxy on the same host, keep it from the backend
    private static ValueTask RemoveSessionCookieTransform(RequestTransformContext ctx) {
        if (!ctx.ProxyRequest.Headers.TryGetValues("Cookie", out IEnumerable<string> values)) return ValueTask.CompletedTask;

        string cookies = String.Join("; ", values
            .SelectMany(value => value.Split(';'))
            .Select(cookie => cookie.Trim())
            .Where(cookie => cookie.Length > 0 && !IsSessionCookie(cookie)));

        ctx.ProxyRequest.Headers.Remove("Cookie");
        if (cookies.Length > 0) {
            ctx.ProxyRequest.Headers.TryAddWithoutValidation("Cookie", cookies);
        }

        return ValueTask.CompletedTask;
    }

    //for the same reason, a session cookie the backend sets would reach the listener too, and replace the user's own
    private static ValueTask RemoveSessionSetCookieTransform(ResponseTransformContext ctx) {
        StringValues setCookies = ctx.HttpContext.Response.Headers.SetCookie;
        if (StringValues.IsNullOrEmpty(setCookies)) return ValueTask.CompletedTask;

        ctx.HttpContext.Response.Headers.SetCookie = setCookies.Where(cookie => !IsSessionCookie(cookie)).ToArray();
        return ValueTask.CompletedTask;
    }

    //the listener looks cookies up by name ignoring case
    private static bool IsSessionCookie(string cookie) =>
        String.Equals(cookie.Split('=', 2)[0].Trim(), Http.Auth.SESSION_COOKIE, StringComparison.OrdinalIgnoreCase);

    //the destination is this Pro-test when it is a local address, on the scheme and port of one of the listener's prefixes,
    //and the host of that prefix is a wildcard or resolves to the same address
    internal static bool IsListener(string destination) {
        if (!Uri.TryCreate(destination, UriKind.Absolute, out Uri uri)) return false;

        try {
            IPAddress[] addresses = Dns.GetHostAddresses(uri.DnsSafeHost).Select(Normalize).ToArray();
            HashSet<IPAddress> local = NetworkInterface.GetAllNetworkInterfaces()
                .SelectMany(nic => nic.GetIPProperties().UnicastAddresses)
                .Select(unicast => Normalize(unicast.Address))
                .ToHashSet();

            if (!addresses.Any(address => IPAddress.IsLoopback(address) || local.Contains(address))) return false;

            foreach (string prefix in Configuration.httpPrefixes) {
                //http://host:port/, the host can be + or *, which HttpListener accepts and Uri doesn't
                int schemeEnd = prefix.IndexOf("://", StringComparison.Ordinal);
                if (schemeEnd < 0) continue;

                string scheme = prefix[..schemeEnd];
                string authority = prefix[(schemeEnd + 3)..];
                int pathStart = authority.IndexOf('/');
                if (pathStart >= 0) authority = authority[..pathStart];

                int portStart = authority.LastIndexOf(':');
                bool hasPort = portStart > authority.LastIndexOf(']'); //the colons of an IPv6 address are inside the brackets
                string host = hasPort ? authority[..portStart] : authority;
                int port = String.Equals(scheme, "https", StringComparison.OrdinalIgnoreCase) ? 443 : 80;
                if (hasPort && !Int32.TryParse(authority[(portStart + 1)..], out port)) continue;

                if (!String.Equals(scheme, uri.Scheme, StringComparison.OrdinalIgnoreCase) || port != uri.Port) continue;
                if (host is "+" or "*") return true;
                if (Dns.GetHostAddresses(host.Trim('[', ']')).Select(Normalize).Intersect(addresses).Any()) return true;
            }
        }
        catch (Exception ex) when (ex is SocketException or ArgumentException or NetworkInformationException) {
            //unresolved, treated as any other backend, the session cookie is kept from it
        }

        return false;
    }

    private static IPAddress Normalize(IPAddress address) =>
        address.IsIPv4MappedToIPv6 ? address.MapToIPv4() : address;
}

internal sealed class HttpLimits {
    //Sizes are in bytes, times in seconds, rates in bytes/sec. A null value means unlimited, infinite or disabled
    //Defaults keep proxied connections alive indefinitely, the rest match Kestrel's defaults

    public double? keepAliveTimeout                 = null;
    public long?   maxConcurrentConnections         = null;
    public long?   maxConcurrentUpgradedConnections = null;
    public long?   maxRequestBodySize               = null;
    public long?   maxRequestBufferSize             = null;
    public int     maxRequestHeaderCount            = 100;
    public int     maxRequestHeadersTotalSize       = 32_768;
    public int     maxRequestLineSize               = 8_192;
    public long?   maxResponseBufferSize            = null;
    public double? requestHeadersTimeout            = 30;
    public double? minRequestBodyDataRate           = null;
    public double  minRequestBodyGracePeriod        = 5;
    public double? minResponseDataRate              = null;
    public double  minResponseGracePeriod           = 5;

    public int     http2MaxStreamsPerConnection     = 100;
    public int     http2HeaderTableSize             = 4_096;
    public int     http2MaxFrameSize                = 16_384;
    public int     http2MaxRequestHeaderFieldSize   = 32_768;
    public int     http2InitialConnectionWindowSize = 1_048_576;
    public int     http2InitialStreamWindowSize     = 786_432;
    public double? http2KeepAlivePingDelay          = null;
    public double  http2KeepAlivePingTimeout        = 20;

    public int     http3MaxRequestHeaderFieldSize   = 32_768;

    public void Apply(KestrelServerLimits limits) {
        Set("Keep-alive timeout",                   ()=> limits.KeepAliveTimeout                 = ToTimeSpan(keepAliveTimeout));
        Set("Max concurrent connections",           ()=> limits.MaxConcurrentConnections         = maxConcurrentConnections);
        Set("Max concurrent upgraded connections",  ()=> limits.MaxConcurrentUpgradedConnections = maxConcurrentUpgradedConnections);
        Set("Max request body size",                ()=> limits.MaxRequestBodySize               = maxRequestBodySize);
        Set("Max request buffer size",              ()=> limits.MaxRequestBufferSize             = maxRequestBufferSize);
        Set("Max request header count",             ()=> limits.MaxRequestHeaderCount            = maxRequestHeaderCount);
        Set("Max request headers total size",       ()=> limits.MaxRequestHeadersTotalSize       = maxRequestHeadersTotalSize);
        Set("Max request line size",                ()=> limits.MaxRequestLineSize               = maxRequestLineSize);
        Set("Max response buffer size",             ()=> limits.MaxResponseBufferSize            = maxResponseBufferSize);
        Set("Request headers timeout",              ()=> limits.RequestHeadersTimeout            = ToTimeSpan(requestHeadersTimeout));
        Set("Min request body data rate",           ()=> limits.MinRequestBodyDataRate           = ToMinDataRate(minRequestBodyDataRate, minRequestBodyGracePeriod));
        Set("Min response data rate",               ()=> limits.MinResponseDataRate              = ToMinDataRate(minResponseDataRate, minResponseGracePeriod));

        Set("HTTP/2 max streams per connection",    ()=> limits.Http2.MaxStreamsPerConnection     = http2MaxStreamsPerConnection);
        Set("HTTP/2 header table size",             ()=> limits.Http2.HeaderTableSize             = http2HeaderTableSize);
        Set("HTTP/2 max frame size",                ()=> limits.Http2.MaxFrameSize                = http2MaxFrameSize);
        Set("HTTP/2 max request header field size", ()=> limits.Http2.MaxRequestHeaderFieldSize   = http2MaxRequestHeaderFieldSize);
        Set("HTTP/2 initial connection window size",()=> limits.Http2.InitialConnectionWindowSize = http2InitialConnectionWindowSize);
        Set("HTTP/2 initial stream window size",    ()=> limits.Http2.InitialStreamWindowSize     = http2InitialStreamWindowSize);
        Set("HTTP/2 keep-alive ping delay",         ()=> limits.Http2.KeepAlivePingDelay          = ToTimeSpan(http2KeepAlivePingDelay));
        Set("HTTP/2 keep-alive ping timeout",       ()=> limits.Http2.KeepAlivePingTimeout        = TimeSpan.FromSeconds(http2KeepAlivePingTimeout));

        Set("HTTP/3 max request header field size", ()=> limits.Http3.MaxRequestHeaderFieldSize   = http3MaxRequestHeaderFieldSize);
    }

    public string Validate() {
        try {
            Apply(new KestrelServerLimits());
        }
        catch (ArgumentException ex) {
            return ex.Message;
        }

        //Kestrel checks these on start-up
        if (maxRequestBufferSize < maxRequestLineSize) {
            return "Max request buffer size must be greater than or equal to max request line size.";
        }

        if (maxRequestBufferSize < maxRequestHeadersTotalSize) {
            return "Max request buffer size must be greater than or equal to max request headers total size.";
        }

        return null;
    }

    private static TimeSpan ToTimeSpan(double? seconds) =>
        seconds.HasValue ? TimeSpan.FromSeconds(seconds.Value) : Timeout.InfiniteTimeSpan;

    private static MinDataRate ToMinDataRate(double? bytesPerSecond, double gracePeriod) =>
        bytesPerSecond.HasValue ? new MinDataRate(bytesPerSecond.Value, TimeSpan.FromSeconds(gracePeriod)) : null;

    private static void Set(string name, Action action) {
        //Kestrel's setters throw on out-of-range values, re-throw with the parameter's name
        try {
            action();
        }
        catch (Exception ex) when (ex is ArgumentException or OverflowException) {
            string message = ex is ArgumentException { ParamName: not null } argEx
                ? argEx.Message.Split(" (Parameter")[0]
                : ex.Message;
            throw new ArgumentException($"{name}: {message}", ex);
        }
    }
}

file sealed class CustomHostLifetime : IHostLifetime {
    //Custom Host Lifetime: overrides the default behavior, so the reverse proxy will not terminate on Ctrl+C
    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
    public Task WaitForStartAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
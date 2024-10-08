﻿using System.Net;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Server.Kestrel.Core;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.DependencyInjection;
using Yarp.ReverseProxy.Configuration;
using Yarp.ReverseProxy.Transforms;
using Protest.Protocols;

namespace Protest.Proxy;

internal sealed class HttpReverseProxy : ReverseProxyAbstract {
    private IHostBuilder hostBuilder;
    private IHost host;

    public HttpReverseProxy(Guid guid) : base(guid) {}

    public override bool Start(IPEndPoint proxy, string destination, string certificate, string password, string origin) {
        Exception returnStatus = null;

        try {
            hostBuilder = Host.CreateDefaultBuilder();

            hostBuilder.ConfigureLogging(logger => this.ConfigureLogging(logger));

            ClusterConfig cluster = new ClusterConfig {
                ClusterId    = "c1",
                Destinations = new Dictionary<string, DestinationConfig> {
                    { "d1", new DestinationConfig { Address = destination } }
                }
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

                webHost.ConfigureServices(services => this.ConfigureServices(services, routes, new ClusterConfig[] { cluster }));
            });

            string destinations = cluster.Destinations.Values
                .Select(o=> o.Address.ToString())
                .Aggregate((destination, accumulator)=> String.IsNullOrEmpty(accumulator) ? destination : $"{accumulator}, {destination}");

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

    private void ConfigureLogging(ILoggingBuilder logger) {
        logger.ClearProviders();
        
        //logger.AddConsole();
        //logger.SetMinimumLevel(LogLevel.Warning);
        //logger.AddFilter("Microsoft", LogLevel.Warning);
        //logger.AddFilter("Microsoft.Hosting.Lifetime", LogLevel.Information);
        //logger.AddFilter("Yarp.ReverseProxy", LogLevel.Warning);
    }

    private void ConfigureKestrel(KestrelServerOptions options, IPEndPoint endPoint, string certificate = null, string password = null) {
        try {
            if (String.IsNullOrEmpty(certificate)) {
                options.Listen(endPoint);
            }
            else if (String.IsNullOrEmpty(password)) {
                options.Listen(endPoint, options => options.UseHttps(certificate));
            }
            else {
                options.Listen(endPoint, options => options.UseHttps(certificate, password));
            }
        }
        catch (Exception ex) {
            Thread.Sleep(50);
            Logger.Error(ex);
            ReverseProxy.running.TryRemove(this.guid.ToString(), out _);
            Stop("system");
            throw;
        }
    }

    private void Configure(IApplicationBuilder application) {
        application.UseMiddleware<TrafficCountingHttpMiddleware>(bytesRx, bytesTx);
        application.UseRouting();
        application.UseEndpoints(endpoints => endpoints.MapReverseProxy());
    }

    private void ConfigureServices(IServiceCollection services, IReadOnlyList<RouteConfig> routes, IReadOnlyList<ClusterConfig> clusters) {
        services.AddSingleton<IHostLifetime, CustomHostLifetime>();
        //services.AddSingleton(bytesRx);
        //services.AddSingleton(bytesTx);

        IReverseProxyBuilder rpBuilder = services.AddReverseProxy();

        rpBuilder.LoadFromMemory(routes, clusters);

        rpBuilder.AddTransforms(builderContext => {
            builderContext.AddRequestTransform(transformContext => {

                /*
                !!! DONT RELAY THE X-REAL-IP FROM OTHER PROXIES ON THE CHAIN !!!
                Any intermediary proxy or client can modify the X-Real-IP header to spool their IP.
                */

                string realIp = transformContext.HttpContext.Connection.RemoteIpAddress?.ToString();
                if (realIp is not null) {
                    transformContext.ProxyRequest.Headers.Remove("X-Real-IP");
                    transformContext.ProxyRequest.Headers.Add("X-Real-IP", realIp);

                    //string existingXForwardedFor = transformContext.HttpContext.Request.Headers["X-Forwarded-For"].ToString();
                    //string newXForwardedFor      = String.IsNullOrEmpty(existingXForwardedFor) ? realIp : $"{existingXForwardedFor}, {realIp}";
                    //transformContext.ProxyRequest.Headers.Remove("X-Forwarded-For");
                    //transformContext.ProxyRequest.Headers.Add("X-Forwarded-For", newXForwardedFor);
                }

                //transformContext.ProxyRequest.Headers.Add("X-Forwarded-Host", transformContext.HttpContext.Request.Host.Value);
                //transformContext.ProxyRequest.Headers.Add("X-Forwarded-Proto", transformContext.HttpContext.Request.Scheme);

                transformContext.HttpContext.Request.Headers.Remove("Host");
                //transformContext.ProxyRequest.Headers.Host = transformContext.HttpContext.Request.Headers.Host;

                return ValueTask.CompletedTask;
            });
        });
    }
}

file sealed class CustomHostLifetime : IHostLifetime {
    //Custom Host Lifetime: overrides the default behavior, so the reverse proxy will not terminate on Ctrl+C
    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
    public Task WaitForStartAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
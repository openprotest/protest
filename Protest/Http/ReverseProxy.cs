using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Text;
using System.Threading.Tasks;
using Microsoft.AspNetCore;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Server.Kestrel.Core;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Yarp.ReverseProxy.Configuration;
using Yarp.ReverseProxy.Transforms;
using Protest.Protocols;
using System.Threading;
using Yarp.ReverseProxy.LoadBalancing;

namespace Protest.Http;

internal sealed class ReverseProxy : IDisposable {
    private IHostBuilder hostBuilder;
    private IHost host;

    public ReverseProxy(IPEndPoint listener, IPEndPoint destination, string certificate = null, string password = null)
        : this(listener, new IPEndPoint[] { destination }, certificate, password) {
    }

    public ReverseProxy(IPEndPoint listener, IPEndPoint[] destinations, string certificate = null, string password = null) {
        int counter = 0;
        Dictionary<string, DestinationConfig> dictionary = destinations.ToDictionary(
            key=> $"d{++counter}",
            value => new DestinationConfig { Address = $"http://{value.Address}:{value.Port}" }
            );

        ClusterConfig cluster = new ClusterConfig {
            ClusterId = "c1",
            //LoadBalancingPolicy = "",
            Destinations = dictionary
        };

        Initialize(listener, cluster, certificate, password);
    }

    public ReverseProxy(IPEndPoint listener, ClusterConfig cluster, string certificate = null, string password = null) {
        Initialize(listener, cluster, certificate, password);
    }

    private bool Initialize(IPEndPoint listener, ClusterConfig cluster, string certificate, string password) {
        hostBuilder = Host.CreateDefaultBuilder();

        hostBuilder.ConfigureLogging(logger => this.ConfigureLogging(logger));

        hostBuilder.ConfigureWebHostDefaults(webHost => {
            webHost.ConfigureKestrel(options => this.ConfigureKestrel(options, listener, certificate, password));
            webHost.Configure(application => this.Configure(application));

            RouteConfig[] routes = new RouteConfig[] {
                new RouteConfig {
                    RouteId = "r1",
                    ClusterId = "c1",
                    Match = new RouteMatch { Path = "/{**all}" }
                }
            };

            webHost.ConfigureServices(services => this.ConfigureServices(services, routes, new ClusterConfig[] { cluster }));
        });

        string destinations = cluster.Destinations.Values
            .Select(o=>o.Address.ToString())
            .Aggregate((destination, accumulator)=> String.IsNullOrEmpty(accumulator) ? destination : $"{accumulator}, {destination}");
        
        Console.WriteLine($"Start proxying from {listener} to {destinations}");

        this.host = hostBuilder.Build();
        this.host.Run();

        //Console.WriteLine($"Stop proxying from {listener} to {destinations}");

        return true;
    }

    public void Stop() {
        this.host?.StopAsync();
        this.host = null;
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

    private void Configure(IApplicationBuilder application) {
        application.UseRouting();
        application.UseEndpoints(endpoints => endpoints.MapReverseProxy());
    }

    private void ConfigureServices(IServiceCollection services, IReadOnlyList<RouteConfig> routes, IReadOnlyList<ClusterConfig> clusters) {
        services.AddSingleton<IHostLifetime, CustomHostLifetime>();

        IReverseProxyBuilder rpBuilder = services.AddReverseProxy();

        rpBuilder.LoadFromMemory(routes, clusters);

        rpBuilder.AddTransforms(builderContext => {
            builderContext.AddRequestTransform(transformContext => {
                string remoteIpAddress = transformContext.HttpContext.Connection.RemoteIpAddress?.ToString();
                string existingXForwardedFor = transformContext.HttpContext.Request.Headers["X-Forwarded-For"].ToString();
                string newXForwardedFor = string.IsNullOrEmpty(existingXForwardedFor) ? remoteIpAddress : $"{existingXForwardedFor}, {remoteIpAddress}";

                transformContext.ProxyRequest.Headers.Remove("X-Forwarded-For");
                transformContext.ProxyRequest.Headers.Add("X-Forwarded-For", newXForwardedFor);
                //transformContext.ProxyRequest.Headers.Add("X-Forwarded-Host", transformContext.HttpContext.Request.Host.Value);
                //transformContext.ProxyRequest.Headers.Add("X-Forwarded-Proto", transformContext.HttpContext.Request.Scheme);

                transformContext.HttpContext.Request.Headers.Remove("Host");
                //transformContext.ProxyRequest.Headers.Host = transformContext.HttpContext.Request.Headers.Host;

                return ValueTask.CompletedTask;
            });
        });
    }

    public void Dispose() {
        this.Stop();
    }
}

file class CustomHostLifetime : IHostLifetime {
    /* Custom Host Lifetime: overrides the default behavior,
     * so the reverse proxy will not terminate on Ctrl+C
     */
    public Task StopAsync(CancellationToken cancellationToken) =>
        Task.CompletedTask;

    public Task WaitForStartAsync(CancellationToken cancellationToken) =>
         Task.CompletedTask;
}
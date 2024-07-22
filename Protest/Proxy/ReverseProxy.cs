using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Net;

namespace Protest.Proxy;

internal abstract class ReverseProxy {

    public static ConcurrentDictionary<string, ReverseProxy> ReverseProxies = new ConcurrentDictionary<string, ReverseProxy>();

    public static byte[] List() {
        return null;
    }

    public static byte[] Create(HttpListenerContext ctx, Dictionary<string, string> parameters, string origin) {
        return null;
    }

    public static byte[] Delete(Dictionary<string, string> parameters, string origin) {
        return null;
    }

    public ulong GetTotalUpstream { get; }
    public ulong GetTotalDownstream { get; }

    public virtual bool Start(IPEndPoint listener, string destination) {
        return Start(listener, destination, null, null);
    }

    public abstract bool Start(IPEndPoint listener, string destination, string certificate, string password);
    public abstract bool Pause();
    public abstract bool Stop();
}

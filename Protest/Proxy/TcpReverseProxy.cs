using System;
using System.Collections.Generic;
using System.Net;

namespace Protest.Proxy;
internal sealed class TcpReverseProxy : ReverseProxyAbstract {
    public TcpReverseProxy(Guid guid) : base(guid) {
    }

    public override bool Start(IPEndPoint listener, string destination, string certificate, string password, string origin) {
        this.totalUpstream = 0;
        this.totalDownstream = 0;
        isRunning = true;
        return true;
    }

    public override bool Stop(string origin) {
        this.totalUpstream = 0;
        this.totalDownstream = 0;
        isRunning = false;
        return true;
    }
}

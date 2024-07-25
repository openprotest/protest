using System.Net;
using System.Collections.Generic;
using System.Threading;

namespace Protest.Proxy;
internal sealed class TcpReverseProxy : ReverseProxyAbstract {
    public TcpReverseProxy(Guid guid) : base(guid) {}

    public override bool Start(IPEndPoint listener, string destination, string certificate, string password, string origin) {
        this.thread = new Thread(() => {

        });

        this.thread.Start();

        return base.Start(listener, destination, certificate, password, origin);
    }

    public override bool Stop(string origin) {
        return base.Stop(origin);
    }
}

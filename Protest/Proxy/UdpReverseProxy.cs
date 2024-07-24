using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Text;
using System.Threading.Tasks;

namespace Protest.Proxy;
internal sealed class UdpReverseProxy : ReverseProxy {

    public override bool Start(IPEndPoint listener, string destination, string certificate, string password, string origin) {
        this.totalUpstream = 0;
        this.totalDownstream = 0;


        return true;
    }

    public override bool Stop(string origin) {
        this.totalUpstream = 0;
        this.totalDownstream = 0;
        return true;
    }
}

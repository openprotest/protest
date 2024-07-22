using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Text;
using System.Threading.Tasks;

namespace Protest.Proxy;
internal class UdpReverseProxy : ReverseProxy {
    public override bool Pause() {
        throw new NotImplementedException();
    }

    public override bool Start(IPEndPoint listener, string destination, string certificate, string password) {
        throw new NotImplementedException();
    }

    public override bool Stop() {
        throw new NotImplementedException();
    }
}

using System.Net;
using System.Collections.Generic;
using System.Threading;
using System.Net.Sockets;

namespace Protest.Proxy;
internal sealed class UdpReverseProxy : ReverseProxyAbstract {

    private UdpClient udpListener;

    public UdpReverseProxy(Guid guid) : base(guid) {}

    public override bool Start(IPEndPoint listener, string destination, string certificate, string password, string origin) {
        this.thread = new Thread(/*async*/ () => {
            udpListener = new UdpClient(listener);

            while (this.isRunning) {
                try {
                    //TODO:

                }
                catch {
                    this.error++;
                }
            }
        });
        
        this.thread.Start();

        return base.Start(listener, destination, certificate, password, origin);
    }

    public override bool Stop(string origin) {
        return base.Stop(origin);
    }
}

using System.Net;
using System.Collections.Generic;
using System.Threading;
using System.Net.Sockets;

namespace Protest.Proxy;
internal sealed class TcpReverseProxy : ReverseProxyAbstract {
    
    private TcpListener tcpListener;

    public TcpReverseProxy(Guid guid) : base(guid) {}

    public override bool Start(IPEndPoint listener, string destination, string certificate, string password, string origin) {
        this.thread = new Thread(async () => {
            tcpListener = new TcpListener(listener.Address, listener.Port);
            tcpListener.Start();

            while (this.isRunning) {
                try {
                    TcpClient client = await tcpListener.AcceptTcpClientAsync(cancellationToken);

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
        cancellationTokenSource.Cancel();
        tcpListener.Stop();
        tcpListener.Dispose();
        return base.Stop(origin);
    }
}

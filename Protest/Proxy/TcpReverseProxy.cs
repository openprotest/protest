using System.Net;
using System.Collections.Generic;
using System.Threading;
using System.Net.Sockets;

namespace Protest.Proxy;
internal sealed class TcpReverseProxy : ReverseProxyAbstract {
    
    private TcpListener tcpListener;

    public TcpReverseProxy(Guid guid) : base(guid) {}

    public override bool Start(IPEndPoint listener, string destination, string certificate, string password, string origin) {
        try {
            tcpListener = new TcpListener(listener.Address, listener.Port);
            tcpListener.Start();
        }
        catch (SocketException) {
            throw;
        }
        catch (Exception) {
            throw;
        }

        this.thread = new Thread(async () => {
            while (this.isRunning) {
                try {
                    TcpClient client = await tcpListener.AcceptTcpClientAsync(cancellationToken);
                    ServeClient(client);
                }
                catch {
                    this.errors++;
                }
            }
        });

        this.thread.Start();

        return base.Start(listener, destination, certificate, password, origin);
    }

    private void ServeClient(TcpClient client) {

    }

    public override bool Stop(string origin) {
        cancellationTokenSource.Cancel();
        tcpListener.Stop();
        tcpListener.Dispose();
        return base.Stop(origin);
    }
}

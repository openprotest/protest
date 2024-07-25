using System;
using System.Net;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace Protest.Proxy;

internal abstract class ReverseProxyAbstract {
    public Guid guid;
    public bool isRunning = false;
    public ulong totalUpstream, totalDownstream;
    protected readonly CancellationTokenSource cancellationTokenSource;
    protected readonly CancellationToken cancellationToken;

    public ReverseProxyAbstract(Guid guid) {
        this.guid = guid;
        cancellationTokenSource = new CancellationTokenSource();
        cancellationToken = cancellationTokenSource.Token;
    }

    public virtual bool Start(IPEndPoint proxy, string destination, string origin) {
        return Start(proxy, destination, null, null, origin);
    }

    public abstract bool Start(IPEndPoint proxy, string destination, string certificate, string password, string origin);
    public abstract bool Stop(string origin);

}

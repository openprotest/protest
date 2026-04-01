using System.Collections.Concurrent;
using System.Net;
using System.Threading;

namespace Protest.Proxy;

internal abstract class ReverseProxyAbstract {
    protected readonly CancellationTokenSource cancellationTokenSource;
    protected readonly CancellationToken cancellationToken;

    public readonly Guid guid;
    public bool isRunning = false;
    public ulong errors;
    protected Thread thread;

    public readonly ConcurrentDictionary<string, long> bytesRx;
    public readonly ConcurrentDictionary<string, long> bytesTx;

    public ReverseProxyAbstract(Guid guid) {
        this.guid = guid;
        bytesRx = new ConcurrentDictionary<string, long>();
        bytesTx = new ConcurrentDictionary<string, long>();
        cancellationTokenSource = new CancellationTokenSource();
        cancellationToken = cancellationTokenSource.Token;
    }

    public virtual bool Start(IPEndPoint proxy, string destination, string origin) {
        return Start(proxy, destination, null, null, origin);
    }

    public virtual bool Start(IPEndPoint proxy, string destination, string certificate, string password, string origin) {
        isRunning = true;
        return true;
    }

    public virtual bool Stop(string origin) {
        isRunning = false;
        return true;
    }
}

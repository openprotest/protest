using System.Net;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace Protest.Proxy;

internal abstract class ReverseProxyAbstract {
    public Guid guid;
    public bool isRunning = false;
    public ulong rx, tx, errors;
    protected Thread thread;
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

    public virtual bool Start(IPEndPoint proxy, string destination, string certificate, string password, string origin) {
        this.tx = 0;
        this.rx = 0;
        isRunning = true;
        return true;
    }
    
    public virtual bool Stop(string origin) {
        isRunning = false;
        this.tx = 0;
        this.rx = 0;
        return true;
    }
}

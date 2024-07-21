namespace Protest.Proxy;

internal interface IReverseProxy {

    public ulong GetTotalUpstream { get; }
    public ulong GetTotalDownstream { get; }

    public bool Start();

    public bool Pause();

    public bool Stop();

}

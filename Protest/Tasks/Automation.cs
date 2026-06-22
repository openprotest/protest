namespace Protest.Tasks;

internal static class Automation {

    //static readonly ConcurrentDictionary<string, TaskWrapper> tasks = new ConcurrentDictionary<string, TaskWrapper>();

    static public void Initialize() {
        Proxy.ReverseProxy.Initialize();
        Watchdog.Initialize();
#if !DEBUG
        Lifeline.Initialize();
#endif
    }
}
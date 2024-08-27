namespace Protest.Tasks;

internal static class Automation {

    //static readonly ConcurrentDictionary<string, TaskWrapper> tasks = new ConcurrentDictionary<string, TaskWrapper>();

    static public void Initialize() {
        Watchdog.Initialize();
        Lifeline.Initialize();
        Proxy.ReverseProxy.Initialize();
    }
}
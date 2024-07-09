using System.Collections.Concurrent;
using System.Text;

namespace Protest.Workers;

internal static class Automation {

    //static readonly ConcurrentDictionary<string, TaskWrapper> tasks = new ConcurrentDictionary<string, TaskWrapper>();

    static public void Initialize() {
        Watchdog.Initialize();
        Lifeline.Initialize();
    }
}
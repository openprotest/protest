using System.Collections.Concurrent;
using System.Text;

namespace Protest.Tasks;

internal static class Automation {

    //static readonly ConcurrentDictionary<string, TaskWrapper> tasks = new ConcurrentDictionary<string, TaskWrapper>();
    
    static public void Initialize() {
        Tasks.Watchdog.Initialize();
        Tasks.Lifeline.Initialize();
    }

    public static byte[] ListTasks() {
        StringBuilder builder = new StringBuilder();

        builder.Append('{');
        builder.Append("\"data\":{");

        builder.Append("\"lifeline\":{");
        builder.Append($"\"name\":{{\"v\":\"Lifeline\"}},");
        builder.Append($"\"status\":{{\"v\":\"Running\"}},");
        builder.Append($"\"progress\":{{\"v\":\"-/-\"}}");
        builder.Append("},");

        builder.Append("\"watchdog\":{");
        builder.Append($"\"name\":{{\"v\":\"Watchdog\"}},");
        builder.Append($"\"status\":{{\"v\":\"Running\"}},");
        builder.Append($"\"progress\":{{\"v\":\"-/-\"}}");
        builder.Append("},");

        //builder.Append("\"lastseen\":{");
        //builder.Append($"\"name\":{{\"v\":\"Lastseen\"}},");
        //builder.Append($"\"status\":{{\"v\":\"Running\"}},");
        //builder.Append($"\"progress\":{{\"v\":\"-/-\"}}");
        //builder.Append("},");

        builder.Append("\"fetch\":{");
        builder.Append($"\"name\":{{\"v\":\"Fetch\"}},");
        builder.Append($"\"status\":{{\"v\":\"Stopped\"}},");
        builder.Append($"\"progress\":{{\"v\":\"-/-\"}}");
        builder.Append('}');


        builder.Append("},");

        builder.Append("\"length\":3");

        builder.Append('}');

        return Encoding.UTF8.GetBytes(builder.ToString());
    }
}
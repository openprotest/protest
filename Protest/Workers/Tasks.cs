using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Protest.Workers;
internal static class Tasks {
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

        builder.Append("\"issues\":{");
        builder.Append($"\"name\":{{\"v\":\"Issues\"}},");
        builder.Append($"\"status\":{{\"v\":\"Stopped\"}},");
        builder.Append($"\"progress\":{{\"v\":\"-/-\"}}");
        builder.Append("},");

        builder.Append("\"fetch\":{");
        builder.Append($"\"name\":{{\"v\":\"Fetch\"}},");
        builder.Append($"\"status\":{{\"v\":\"Stopped\"}},");
        builder.Append($"\"progress\":{{\"v\":\"-/-\"}}");
        builder.Append('}');


        builder.Append("},");

        builder.Append("\"length\":4");

        builder.Append('}');

        return Encoding.UTF8.GetBytes(builder.ToString());
    }
}

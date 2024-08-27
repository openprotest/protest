using System.Text.Json;

namespace Protest.Tasks;
internal static class Tasks {
    public static byte[] ListTasks() {

        byte[] bytes = JsonSerializer.SerializeToUtf8Bytes(new {
            data = new[] {
                new {
                    name     = new { v = "Lifeline" },
                    status   = new { v = Lifeline.task?.status.ToString() ?? "Stopped" },
                    progress = new { v = Lifeline.task?.ProgressString() ?? "-/-"}
                },
                new {
                    name     = new { v = "Watchdog" },
                    status   = new { v = Watchdog.task?.status.ToString() ?? "Stopped" },
                    progress = new { v =Watchdog.task?.ProgressString() ?? "-/-" }
                },
                /*new {
                    name     = new { v = "Lastseen" },
                    status   = new { v = TaskWrapper.TaskStatus.Stopped.ToString() },
                    progress = new { v = "-/-" }
                },*/
                new {
                    name     = new { v = "Issues" },
                    status   = new { v = Issues.task?.status.ToString() ?? "Stopped" },
                    progress = new { v = Issues.task?.ProgressString() ?? "-/-" }
                },
                new {
                    name     = new { v = "Fetch" },
                    status   = new { v = Fetch.task?.status.ToString() ?? "Stopped" },
                    progress = new { v = Fetch.task?.ProgressString() ?? "-/-" }
                }
            },

            length = 4
        });

        return bytes;
    }
}
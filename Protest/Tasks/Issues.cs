using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace Protest.Tasks;

internal static class Issues {

    public static TaskWrapper task;

    public static bool StartTask(string origin) {
        if (task is not null) return false;

        Thread thread = new Thread(() => IssuesScanner());

        task = new TaskWrapper("Issues") {
            thread = thread,
            origin = origin,
            TotalSteps = 0,
            CompletedSteps = 0
        };

        task.thread.Start();

        return true;
    }

    public static bool StopTask(string origin) {
        if (task is null) return false;
        task.RequestCancel(origin);
        return true;
    }

    private static void IssuesScanner() {

    }
}
using System;
using System.Collections.Generic;
using System.Text;
using System.Threading;

class ProTasks {
    static readonly List<ProTasks> onGoingTasks = new List<ProTasks>();

    public readonly string name;
    public string status;
    public string report;
    public int stepsTotal;
    public int stepsCompleted;
    public readonly object lockTokken;
    public readonly DateTime started;

    private Thread thread;

    public ProTasks(Thread thread, in string name, in string performer) {
        this.name = name;
        status = "Initializing";
        stepsTotal = 0;
        stepsCompleted = 0;
        lockTokken = new object();
        this.thread = thread;

        onGoingTasks.Add(this);

        started = DateTime.Now;

        ActionLog.Action(performer, $"Start task: {name}");
        Console.WriteLine($"Start task:  \t{name}\t" + started.ToString());

        thread.Start();
    }

    public void Abort() {
        if (thread != null && thread.IsAlive)
            lock (lockTokken) {
                thread.Abort();
            }

        lock (lockTokken) {
            if (onGoingTasks.Contains(this)) onGoingTasks.Remove(this);
            status = "Aborted by user"; //TODO: push users name
        }

        Console.WriteLine("Abort!");
    }

    public void Complete() {
        lock (lockTokken) {
            if (onGoingTasks.Contains(this)) onGoingTasks.Remove(this);
            status = "Completed";
        }

        Console.WriteLine($"Finish task: \t{name}\t" + DateTime.Now.ToString());
    }

    public static byte[] GetTasks() {
        return null;
    }

    public static byte[] GetOnGoing() {
        StringBuilder sb = new StringBuilder();

        foreach (ProTasks o in onGoingTasks) {
            sb.Append($"{o.name}{(char)127}");
            sb.Append($"{o.status}{(char)127}");
            sb.Append($"{o.report}{(char)127}");
            sb.Append($"{o.stepsTotal}{(char)127}");
            sb.Append($"{o.stepsCompleted}{(char)127}");
            sb.Append($"{o.started}{(char)127}");
        }

        return Encoding.UTF8.GetBytes(sb.ToString());
    }

    public static byte[] GetResults() {
        return null;
    }



}
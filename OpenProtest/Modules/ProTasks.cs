using System;
using System.Linq;
using System.Threading;
using System.Collections.Generic;

class ProTasks {
    static readonly List<ProTasks> ongoingTasks = new List<ProTasks>();

    public readonly string name;
    public string status;
    public string report;
    public int steps;
    public int stepsCompleted;
    public readonly object lockTokken;
    public readonly DateTime started;

    private Thread thread;

    public ProTasks(Thread thread, in string name, in string performer) {
        this.name = name;
        status = "Initializing";
        steps = 0;
        stepsCompleted = 0;
        lockTokken = new object();
        this.thread = thread;

        ongoingTasks.Add(this);

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
            if (ongoingTasks.Contains(this)) ongoingTasks.Remove(this);
            status = "Aborted by user"; //TODO: push users name
        }

        Console.WriteLine("Abort!");
    }

    public void Complete() {
        lock (lockTokken) {
            if (ongoingTasks.Contains(this)) ongoingTasks.Remove(this);
            status = "Completed";
        }

        Console.WriteLine($"Finish task: \t{name}\t" + DateTime.Now.ToString());
    }

}
using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

public class TaskWrapper {

    private static readonly Hashtable onGoingTasks = Hashtable.Synchronized(new Hashtable());

    public readonly string name;
    public string status;
    //public string report;
    public int stepsTotal;
    public int stepsCompleted;
    public readonly object lockTokken;
    public readonly DateTime started;

    public Thread thread = null;

    public TaskWrapper(in string name, in string performer) {
        this.name = name;
        status = "Initializing";
        stepsTotal = 0;
        stepsCompleted = 0;
        lockTokken = new object();

        onGoingTasks.Add(name, this);

        started = DateTime.Now;

        Logging.Action(performer, $"Start task: {name}");
        //Console.WriteLine($"Start task:  \t{name}\t{started}");
    }

    public void Abort(in string performer) {
        if (thread != null && thread.IsAlive)
            lock (lockTokken) {
                thread.Abort();
            }

        lock (lockTokken) {
            if (onGoingTasks.Contains(this.name)) onGoingTasks.Remove(this.name);
            status = $"Aborted by user: {performer}";
        }
    }

    public void Complete() {
        lock (lockTokken) {
            if (onGoingTasks.Contains(this.name)) onGoingTasks.Remove(this.name);
            status = "Completed";
        }

        //Console.WriteLine($"Finish task: \t{name}\t" + DateTime.Now.ToString());
    }

    public string GetETC() {
        if (stepsCompleted < 1) return "Calculating";

        long d = DateTime.Now.Ticks - started.Ticks; //total duration
        double tps = d / stepsCompleted; //avg ticks/step 
        TimeSpan etc = new TimeSpan((long)(tps * (stepsTotal - stepsCompleted)));

        if (etc.Days == 0) 
            return $"{etc.Hours}:{etc.Minutes.ToString().PadLeft(2, '0')}:{etc.Seconds.ToString().PadLeft(2, '0')}";
        else if (etc.Days == 1)
            return $"1 day, {etc.Hours}:{etc.Minutes.ToString().PadLeft(2, '0')}:{etc.Seconds.ToString().PadLeft(2, '0')}";
        else 
            return $"{etc.TotalDays} days";
    }

    public static byte[] GetOnGoing() {
        StringBuilder sb = new StringBuilder();
        
        //TODO:
        //foreach (TaskWrapper o in onGoingTasks)
        //    sb.Append($"{o.name}{(char)127}{o.status}{(char)127}{o.report}{(char)127}{o.stepsTotal}{(char)127}{o.stepsCompleted}{(char)127}{o.started}{(char)127}");

        return Encoding.UTF8.GetBytes(sb.ToString());
    }

    public static byte[] GetResults() {
        return null;
    }

}

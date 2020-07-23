using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

public class TaskWrapper {

    private static readonly Hashtable onGoingTasks = Hashtable.Synchronized(new Hashtable());

    private long lastSet = 0;

    public readonly string name;
    public string status;
    private int stepsCompleted;
    public int stepsTotal;
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
    
    public string GetEtc() {
        if (stepsCompleted < 1) return "Calculating";

        long d = lastSet - started.Ticks; //total duration
        
        double tps = d / stepsCompleted; //avg ticks/step

        long etc = (long)(tps * (stepsTotal - stepsCompleted));
        if (etc - (DateTime.Now.Ticks - lastSet) > 0) //subtract time passed since last-set
            etc -= DateTime.Now.Ticks - lastSet;

        TimeSpan ts = new TimeSpan(etc);
        if (ts.Days == 0) 
            return $"{ts.Hours.ToString().PadLeft(2, '0')}:{ts.Minutes.ToString().PadLeft(2, '0')}:{ts.Seconds.ToString().PadLeft(2, '0')}";
        else if (ts.Days == 1)
            return $"1 day, {ts.Hours.ToString().PadLeft(2, '0')}:{ts.Minutes.ToString().PadLeft(2, '0')}:{ts.Seconds.ToString().PadLeft(2, '0')}";
        else 
            return $"{Math.Round(ts.TotalDays)} days";
    }

    public int GetStepsCompleted() {
        return stepsCompleted;
    }
    public void SetStepsCompleted(int value) {
        stepsCompleted = value;
        lastSet = DateTime.Now.Ticks;
    }

    public void Complete() {
        lock (lockTokken) {
            if (onGoingTasks.Contains(this.name)) onGoingTasks.Remove(this.name);
            status = "Completed";
        }

        //Console.WriteLine($"Finish task: \t{name}\t" + DateTime.Now.ToString());
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

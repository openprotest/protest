using System.Threading;

namespace Protest.Tools;

internal sealed class ThreadWrapper : IDisposable {
    private readonly CancellationTokenSource cancellationTokenSource;
    public readonly CancellationToken cancellationToken;

    //private readonly object syncLock;
    public readonly long started;

    private long _lastSet = 0;
    private int _totalSteps;

    public Thread thread;
    public string name;
    public string initiator;
    public string status;

    public int TotalSteps {
        get => _totalSteps;
        set {
            _totalSteps = value;
            _lastSet = DateTime.UtcNow.Ticks;
        }
    }

    public int CompletedSteps { get; set; }

    public ThreadWrapper(string name) {
        //syncLock = new object();
        cancellationTokenSource = new CancellationTokenSource();
        cancellationToken = cancellationTokenSource.Token;
        started = DateTime.UtcNow.Ticks;
        status = "Initializing";
        this.name = name;
    }

    public string CalculateEtc() {
        if (CompletedSteps < 1) return "Calculating";

        long d = _lastSet - started; //total duration

        double tps = d / CompletedSteps; //avg ticks/step

        long etc = (long)(tps * (TotalSteps - CompletedSteps));
        if (etc - (DateTime.UtcNow.Ticks - _lastSet) > 0) //subtract time passed since last-set
            etc -= DateTime.UtcNow.Ticks - _lastSet;

        TimeSpan ts = new TimeSpan(etc);
        if (ts.Days == 0)
            return $"{ts.Hours.ToString().PadLeft(2, '0')}:{ts.Minutes.ToString().PadLeft(2, '0')}:{ts.Seconds.ToString().PadLeft(2, '0')}";
        else if (ts.Days == 1)
            return $"1 day, {ts.Hours.ToString().PadLeft(2, '0')}:{ts.Minutes.ToString().PadLeft(2, '0')}:{ts.Seconds.ToString().PadLeft(2, '0')}";
        else
            return $"{Math.Round(ts.TotalDays)} days";
    }

    public void RequestCancel(string initiator) {
        Logger.Action(initiator, $"Canceling task: {this.name}");
        cancellationTokenSource.Cancel();
    }

    public void Dispose() {
        cancellationTokenSource?.Dispose();
    }
}
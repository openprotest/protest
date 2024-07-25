using System.Threading;
using System.Threading.Tasks;

namespace Protest.Workers;

internal sealed class TaskWrapper : IDisposable {

    public enum TaskStatus : byte {
        initializing,
        running,
        idle,
        canceling,
        canceled
    }

    private readonly CancellationTokenSource cancellationTokenSource;
    public readonly CancellationToken cancellationToken;

    public readonly long started;

    private long _lastSet = 0;
    private int _totalSteps;

    public Thread thread;
    public string name;
    public string origin;
    public TaskStatus status;

    public int TotalSteps {
        get => _totalSteps;
        set {
            _totalSteps = value;
            _lastSet = DateTime.UtcNow.Ticks;
        }
    }

    public int CompletedSteps { get; set; }

    public TaskWrapper(string name) {
        status = TaskStatus.initializing;
        cancellationTokenSource = new CancellationTokenSource();
        cancellationToken = cancellationTokenSource.Token;
        started = DateTime.UtcNow.Ticks;
        this.name = name;
    }

    public string CalculateEtc() {
        if (CompletedSteps < 1) { return "Calculating"; }

        long d = _lastSet - started; //total duration

        double tps = d / CompletedSteps; //avg ticks/step

        long etc = (long)(tps * (TotalSteps - CompletedSteps));
        if (etc - (DateTime.UtcNow.Ticks - _lastSet) > 0) { //subtract time passed since last-set
            etc -= DateTime.UtcNow.Ticks - _lastSet;
        }

        TimeSpan ts = new TimeSpan(etc);
        if (ts.Days == 0) {
            return $"{ts.Hours.ToString().PadLeft(2, '0')}:{ts.Minutes.ToString().PadLeft(2, '0')}:{ts.Seconds.ToString().PadLeft(2, '0')}";
        }
        else if (ts.Days == 1) {
            return $"1 day, {ts.Hours.ToString().PadLeft(2, '0')}:{ts.Minutes.ToString().PadLeft(2, '0')}:{ts.Seconds.ToString().PadLeft(2, '0')}";
        }
        else {
            return $"{Math.Round(ts.TotalDays)} days";
        }
    }

    public void RequestCancel(string origin) {
        status = TaskStatus.canceling;
        Logger.Action(origin, $"Canceling task: {name}");
        cancellationTokenSource.Cancel();
    }

    public void Sleep(int millisecond, int interval = 300_000) {
        long start = DateTime.UtcNow.Ticks;
        while (!cancellationToken.IsCancellationRequested) {
            long elapsed = (DateTime.UtcNow.Ticks - start) / 10_000; //to milliseconds
            if (elapsed >= millisecond) return;

            int remain = (int)(millisecond - elapsed);
            if (remain < interval) {
                Thread.Sleep(remain);
            }
            else {
                Thread.Sleep(interval);
            }
        }
    }

    public async Task SleepAsync(int millisecond, int interval = 300_000) {
        long start = DateTime.UtcNow.Ticks;
        while (!cancellationToken.IsCancellationRequested) {
            long elapsed = (DateTime.UtcNow.Ticks - start) / 10_000; //to milliseconds
            if (elapsed >= millisecond) return;

            int remain = (int)(millisecond - elapsed);
            if (remain < interval) {
                await Task.Delay(remain, cancellationToken);
            }
            else {
                await Task.Delay(interval, cancellationToken);
            }
        }
    }

    public void Dispose() {
        status = TaskStatus.canceled;
        cancellationTokenSource?.Dispose();
    }
}
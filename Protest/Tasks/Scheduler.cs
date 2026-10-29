using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Protest.Http;

namespace Protest.Tasks;

internal static class Scheduler {
    private const long ONE_HOUR_IN_TICKS = TimeSpan.TicksPerHour;

    public sealed class Job {
        public string key { get; set; }
        public string type { get; set; } = "system";
        public string label { get; set; }
        public bool enable { get; set; }
        public int intervalHours { get; set; }
        public long lastRun { get; set; }
    }

    public static TaskWrapper task;

    private static readonly ConcurrentDictionary<string, Job> jobs = new ConcurrentDictionary<string, Job>();
    private static readonly ConcurrentDictionary<string, byte> runningJobs = new ConcurrentDictionary<string, byte>();
    private static readonly Lock fileMutex = new Lock();

    public static void Initialize() {
        LoadJobs();

        if (jobs.TryGetValue("lifeline", out Job lifelineJob) && lifelineJob.intervalHours > 0) {
            Lifeline.intervalHours = lifelineJob.intervalHours;
        }

        Watchdog.LoadFromDisk();

        SyncEngineState("system");

        StartTask("system");
    }

    private static void LoadJobs() {
        try {
            if (File.Exists(Data.FILE_SCHEDULER)) {
                string plain = File.ReadAllText(Data.FILE_SCHEDULER);
                Job[] array = JsonSerializer.Deserialize<Job[]>(plain);
                if (array is not null) {
                    for (int i = 0; i < array.Length; i++) {
                        if (array[i]?.key is null) continue;
                        jobs[array[i].key] = array[i];
                    }
                }
            }
        }
        catch (Exception ex) {
            Logger.Error(ex);
        }

        jobs.TryAdd("lastseen",      new Job { key = "lastseen",      label = "Last seen",      enable = false, intervalHours = 2 });
        jobs.TryAdd("lifeline",      new Job { key = "lifeline",      label = "Lifeline",       enable = true,  intervalHours = 4 });
        jobs.TryAdd("watchdog",      new Job { key = "watchdog",      label = "Watchdog",       enable = true,  intervalHours = 0 });
        jobs.TryAdd("issues",        new Job { key = "issues",        label = "Issues",         enable = false, intervalHours = 4 });
        jobs.TryAdd("winevents",     new Job { key = "winevents",     label = "Windows events", enable = false, intervalHours = 4 });
        jobs.TryAdd("dataretention", new Job { key = "dataretention", label = "Data retention", enable = false, intervalHours = 24 });
        jobs.TryAdd("backup",        new Job { key = "backup",        label = "Backup",         enable = false, intervalHours = 24 * 30 });

        SaveJobs();
    }

    private static void SaveJobs() {
        try {
            lock (fileMutex) {
                File.WriteAllBytes(Data.FILE_SCHEDULER, JsonSerializer.SerializeToUtf8Bytes(jobs.Values));
            }
        }
        catch (Exception ex) {
            Logger.Error(ex);
        }
    }

    private static void SyncEngineState(string origin) {
        if (jobs.TryGetValue("lifeline", out Job lifelineJob)) {
#if !DEBUG
            if (lifelineJob.enable) {
                Lifeline.StartTask(origin);
            }
            else {
                Lifeline.StopTask(origin);
            }
#endif
        }

        if (jobs.TryGetValue("watchdog", out Job watchdogJob)) {
            if (watchdogJob.enable && Watchdog.HasWatchers) {
                Watchdog.StartTask(origin);
            }
            else {
                Watchdog.StopTask(origin);
            }
        }
    }

    public static bool StartTask(string origin) {
        if (task is not null) return false;

        Thread thread = new Thread(() => SchedulerLoop());

        task = new TaskWrapper("Scheduler") {
            thread         = thread,
            author         = origin,
            TotalSteps     = 0,
            CompletedSteps = 0
        };

        task.thread.Priority = ThreadPriority.BelowNormal;
        task.thread.Start();

        return true;
    }

    private static void SchedulerLoop() {
        //align time to the next hour boundary
        long alignGap = (ONE_HOUR_IN_TICKS - DateTime.UtcNow.Ticks % ONE_HOUR_IN_TICKS) / 10_000;
        task?.status = TaskWrapper.TaskStatus.Idle;
        task?.Sleep((int)alignGap);

        while (true) {
            task.status = TaskWrapper.TaskStatus.Running;

            SyncEngineState("system");
            RunDueJobs();

            task.status = TaskWrapper.TaskStatus.Idle;
            task.Sleep((int)(ONE_HOUR_IN_TICKS / 10_000));

            if (task.cancellationToken.IsCancellationRequested) {
                task.status = TaskWrapper.TaskStatus.Canceling;
                task.Dispose();
                task = null;
                return;
            }
        }
    }

    private static void RunDueJobs() {
        long nowTicks = DateTime.UtcNow.Ticks;

        foreach (string key in runnableJobs) {
            if (jobs.TryGetValue(key, out Job job) && job.enable && IsDue(job, nowTicks) && runningJobs.TryAdd(key, 0)) {
                RunJob(job, "system", nowTicks);
            }
        }
    }

    //runs a job's action once and records the run, the caller claims the job in runningJobs
    private static void RunJob(Job job, string origin, long nowTicks) {
        try {
            switch (job.key) {
            case "issues":
                Issues.Start(origin);
                break;

            case "winevents":
                Protocols.WinEvents.StartFetchAll(origin);
                break;

            case "lastseen":
                LastSeen.StartPingAll();
                break;

            case "dataretention":
                int deleted = DataRetention.PurgeEnabledCategories();
                if (deleted > 0) {
                    Logger.Action(origin, "Scheduler", $"Data retention job deleted {deleted} item(s)");
                }
                break;

            case "backup":
                Backup.Create(origin, null);
                Logger.Action(origin, "Scheduler", "Backup job created a new backup");
                break;
            }
        }
        catch (Exception ex) {
            Logger.Error(ex);
        }
        finally {
            job.lastRun = nowTicks;
            SaveJobs();
            runningJobs.TryRemove(job.key, out _);
        }
    }

    private static bool IsRunning(string key) {
        if (runningJobs.ContainsKey(key)) return true;

        return key switch {
            "issues"    => Issues.task is not null,
            "winevents" => Protocols.WinEvents.IsRunning,
            "lastseen"  => LastSeen.IsRunning,
            _ => false
        };
    }

    public static byte[] Run(HttpListenerContext ctx, string origin) {
        Dictionary<string, string> parameters = Listener.ParseQuery(ctx);
        if (parameters is null || !parameters.TryGetValue("key", out string key) || !jobs.TryGetValue(key, out Job job)) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        if (!runnableJobs.Contains(key)) {
            return Encoding.UTF8.GetBytes($"{{\"error\":\"{Data.EscapeJsonText(job.label)} runs continuously and cannot be run on demand\"}}");
        }

        //IsRunning also covers the job's own engine, the claim in runningJobs stops a second request racing this one
        if (IsRunning(key) || !runningJobs.TryAdd(key, 0)) {
            return Data.CODE_OTHER_TASK_IN_PROGRESS.Array;
        }

        Logger.Action(origin, "Scheduler", $"Run job: {job.label}");

        long nowTicks = DateTime.UtcNow.Ticks;
        _ = Task.Run(() => RunJob(job, origin, nowTicks));

        return Data.CODE_OK.Array;
    }

    private static bool IsDue(Job job, long nowTicks) {
        if (job.intervalHours <= 0) return false;
        if (job.lastRun <= 0) return true;
        return (nowTicks - job.lastRun) >= job.intervalHours * ONE_HOUR_IN_TICKS;
    }

    private static readonly string[] jobOrder = new[] { "lifeline", "watchdog", "issues", "winevents", "lastseen", "dataretention", "backup" };

    //jobs the scheduler starts, in run order, lifeline and watchdog run continuously on their own
    private static readonly string[] runnableJobs = new[] { "issues", "winevents", "lastseen", "dataretention", "backup" };

    private static string FormatInterval(int hours) {
        if (hours <= 48) return $"{hours}h";

        double days = hours / 24.0;
        return days % 1 == 0 ? $"{(int)days}d" : $"{days:0.#}d";
    }

    public static byte[] List() {
        Dictionary<string, object> data = new Dictionary<string, object>();
        List<object> raw = new List<object>();

        IEnumerable<Job> ordered = jobOrder
            .Select(key => jobs.TryGetValue(key, out Job job) ? job : null)
            .Where(job => job is not null)
            .Concat(jobs.Values.Where(job => !jobOrder.Contains(job.key))); //future custom jobs

        foreach (Job job in ordered) {
            string status = job.key switch {
                "lifeline"  => Lifeline.task?.status.ToString() ?? "Stopped",
                "watchdog"  => Watchdog.task?.status.ToString() ?? "Stopped",
                "issues"    => Issues.task?.status.ToString() ?? (job.enable ? "Idle" : "Stopped"),
                _           => IsRunning(job.key) ? "Running" : job.enable ? "Idle" : "Stopped"
            };

            string interval = job.key == "watchdog" ? "-" : $"Every {FormatInterval(job.intervalHours)}";
            string lastRun = job.lastRun > 0 ? new DateTime(job.lastRun, DateTimeKind.Utc).ToLocalTime().ToString(Data.DATETIME_FORMAT_LONG) : "Never";

            data[job.key] = new {
                name     = new { v = job.label },
                status   = new { v = status },
                enabled  = new { v = job.enable ? "Enabled" : "Disabled" },
                interval = new { v = interval },
                lastrun  = new { v = lastRun }
            };

            raw.Add(new {
                key           = job.key,
                type          = job.type,
                label         = job.label,
                enable        = job.enable,
                intervalHours = job.intervalHours,
                lastRun       = job.lastRun,
                runnable      = runnableJobs.Contains(job.key)
            });
        }

        return JsonSerializer.SerializeToUtf8Bytes(new { data, length = data.Count, jobs = raw });
    }

    public static byte[] Save(HttpListenerContext ctx, string origin) {
        using StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding);
        string payload = reader.ReadToEnd();

        if (String.IsNullOrEmpty(payload)) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        try {
            Job incoming = JsonSerializer.Deserialize<Job>(payload);
            if (incoming?.key is null || !jobs.TryGetValue(incoming.key, out Job existing)) {
                return Data.CODE_INVALID_ARGUMENT.Array;
            }

            existing.enable = incoming.enable;

            if (existing.key != "watchdog") {
                existing.intervalHours = Math.Max(incoming.intervalHours, 1);
            }

            if (existing.key == "lifeline") {
                Lifeline.intervalHours = existing.intervalHours;
            }

            SaveJobs();
            SyncEngineState(origin);

            Logger.Action(origin, "Scheduler", $"Modified job: {existing.label}");

            return Data.CODE_OK.Array;
        }
        catch (Exception ex) {
            Logger.Error(ex);
            return Data.CODE_FAILED.Array;
        }
    }
}

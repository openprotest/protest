using System.IO;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Net.NetworkInformation;
using System.Threading;
using System.Threading.Tasks;

namespace Protest.Tasks;

internal static class LastSeen {
    private const int MAX_PARALLEL = 32;

    private static readonly ConcurrentDictionary<string, Lock> mutexes = new ConcurrentDictionary<string, Lock>();
    private static int pingingAll;

    internal static bool IsRunning => Volatile.Read(ref pingingAll) == 1;

    internal static void StartPingAll() {
        if (Interlocked.Exchange(ref pingingAll, 1) == 1) return;

        _ = Task.Run(() => {
            try {
                Parallel.ForEach(DeviceHosts(), new ParallelOptions { MaxDegreeOfParallelism = MAX_PARALLEL }, host => HasBeenSeen(host));
            }
            catch (Exception ex) {
                Logger.Error(ex);
            }
            finally {
                Volatile.Write(ref pingingAll, 0);
            }
        });
    }

    private static HashSet<string> DeviceHosts() {
        HashSet<string> hosts = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (Database.Entry entry in DatabaseInstances.devices.dictionary.Values) {
            if (!entry.attributes.TryGetValue("ip", out Database.Attribute attribute) || String.IsNullOrWhiteSpace(attribute?.value)) {
                if (!entry.attributes.TryGetValue("hostname", out attribute) || String.IsNullOrWhiteSpace(attribute?.value)) continue;
            }

            foreach (string host in attribute.value.Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)) {
                if (Uri.CheckHostName(host) != UriHostNameType.Unknown) hosts.Add(host);
            }
        }

        return hosts;
    }

    public static void Seen(string ip) {
        ip = ip.ToLower().Replace(':', '_');
        if (!Data.IsValidFilename(ip)) return;

        string filename = $"{Data.DIR_LASTSEEN}\\{ip}.txt";
        try {
            Lock mutex = mutexes.GetOrAdd(ip, new Lock());
            lock (mutex) {
                File.WriteAllText(filename, DateTime.Now.ToString(Data.DATETIME_FORMAT_LONG));
            }
        }
        catch (Exception ex) {
            Logger.Error(ex);
        }
    }

    public static string HasBeenSeen(string ip, bool recordOnly = false) {
        if (ip is null) return null;

        if (!recordOnly) {
            try {
                using Ping p = new Ping();
                if (p.Send(ip, 1000).Status == IPStatus.Success) {
                    Seen(ip);
                    return "Just now";
                }
            }
            catch (PingException) {
                //do nothing
            }
            catch (Exception ex) {
                Logger.Debug(ex);
            }
        }

        ip = ip.ToLower().Replace(':', '_');

        if (!Data.IsValidFilename(ip)) return "Never";

        string filename = $"{Data.DIR_LASTSEEN}\\{ip}.txt";

        try {
            if (File.Exists(filename)) {
                Lock mutex = mutexes.GetOrAdd(ip, new Lock());
                lock (mutex) {
                    return File.ReadAllText(filename);
                }
            }
        }
        catch (Exception ex) {
            Logger.Debug(ex);
        }

        return "Never";
    }

    internal static int DeleteOlderThan(int days) {
        days = Math.Max(days, DataRetention.MIN_DAYS);
        int deletedCount = 0;

        try {
            DirectoryInfo dir = new DirectoryInfo(Data.DIR_LASTSEEN);
            if (!dir.Exists) return 0;

            DateTime cutoff = DateTime.UtcNow.AddDays(-days);

            foreach (FileInfo file in dir.GetFiles("*.txt")) {
                if (file.LastWriteTimeUtc >= cutoff) continue;

                try {
                    file.Delete();
                    deletedCount++;
                }
                catch (Exception ex) {
                    Logger.Error(ex);
                }
            }
        }
        catch (Exception ex) {
            Logger.Error(ex);
        }

        return deletedCount;
    }
}
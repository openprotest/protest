using System.IO;
using System.Collections.Concurrent;
using System.Net.NetworkInformation;
using System.Threading;

namespace Protest.Tasks {
    internal static class LastSeen {

        private static ConcurrentDictionary<string, object> mutexes = new ConcurrentDictionary<string, object>();

        public static void Seen(in string ip) {
            string filename = $"{Data.DIR_LASTSEEN}\\{ip}.txt";
            try {
                if (!mutexes.TryGetValue(ip, out object mutex)) {
                    mutex = new object();
                    mutexes[ip] = mutex;
                }

                lock (mutex) {
                    File.WriteAllText(filename, DateTime.Now.ToString(Data.DATETIME_FORMAT_LONG));
                    //File.WriteAllText(filename, DateTime.UtcNow.ToString());
                }
            }
            catch (Exception ex) {
                Logger.Error(ex);
            }
        }

        public static string HasBeenSeen(in string[] para, bool recordOnly = false) {
            string ip = null;
            for (int i = 1; i < para.Length; i++) {
                if (para[i].StartsWith("ip=")) {
                    ip = para[i][3..];
                }
            }

            return HasBeenSeen(ip, recordOnly);
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
                catch { }
            }

            string filename = $"{Data.DIR_LASTSEEN}\\{ip}.txt";

            try {
                if (File.Exists(filename)) {
                    if (!mutexes.TryGetValue(ip, out object mutex)) {
                        mutex = new object();
                        mutexes[ip] = mutex;
                    }

                    lock (mutex) {
                        return File.ReadAllText(filename);
                    }
                }
            }
            catch { }

            return "Never";
        }

    }
}

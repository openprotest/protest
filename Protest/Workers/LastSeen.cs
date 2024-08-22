using System.IO;
using System.Collections.Concurrent;
using System.Net.NetworkInformation;
using System.Threading;

namespace Protest.Workers {
    internal static class LastSeen {

        private static ConcurrentDictionary<string, object> mutexes = new ConcurrentDictionary<string, object>();

        public static void Seen(string ip) {
            ip = ip.ToLower().Replace(':', '_');
            string filename = $"{Data.DIR_LASTSEEN}\\{ip}.txt";
            try {
                object mutex = mutexes.GetOrAdd(ip, new object());
                lock (mutex) {
                    File.WriteAllText(filename, DateTime.Now.ToString(Data.DATETIME_FORMAT_LONG));
                    //File.WriteAllText(filename, DateTime.UtcNow.ToString());
                }
            }
            catch (Exception ex) {
                Logger.Error(ex);
            }
        }

        public static string HasBeenSeen(string ip, bool recordOnly = false) {
            if (ip is null) return null;

            ip = ip.ToLower().Replace(':', '_');

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
                    object mutex = mutexes.GetOrAdd(ip, new object());
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

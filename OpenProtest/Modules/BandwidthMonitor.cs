using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Management;
using System.Net.NetworkInformation;
using System.Threading;
using System.Threading.Tasks;
using Renci.SshNet;

static class BandwidthMonitor {
    private const int LOOP_SLEEP_DURATION = 3600000 * 2; //2 hours
    private static readonly object metrics_lock = new object();
    public static readonly string DIR_METRICS = $"{Directory.GetCurrentDirectory()}\\metrics";
    
    public static void StartTask() {
        Thread.Sleep(5000);

        ProTasks task = null;
        Thread thread = new Thread(()=> {
            if (task is null) Thread.Sleep(5000);
            AsyncStartMetricsGathering(task);
        });

        task = new ProTasks(thread, "Metrics gatherer", "null");
        task.stepsTotal = 0;
    }

    public static async void AsyncStartMetricsGathering(ProTasks task) {
        List<string> hosts = new List<string>();
        Hashtable previous = new Hashtable();
        Hashtable ignore = new Hashtable();
        long equip_version = 0, ignoreCount = 0;

        while (true) {
            task.status = "Gathering";

            if (equip_version != NoSQL.equip_version || ignoreCount != ignore.Count) { //hosts list
                hosts.Clear();
                foreach (DictionaryEntry o in NoSQL.equip) {
                    NoSQL.DbEntry entry = (NoSQL.DbEntry) o.Value;
                    if (entry.hash.ContainsKey("IP")) {
                        string[] value = ((string[])entry.hash["IP"])[0].Split(';');
                        for (int i = 0; i < value.Length; i++) {
                            value[i] = value[i].Trim();
                            if (value[i].Length == 0) continue;
                            if (ignore.ContainsKey(value[i])) continue;
                            if (!hosts.Contains(value[i])) hosts.Add(value[i]);
                        }
                    }
                }
                equip_version = NoSQL.equip_version;
            }

            List<Task<Int64[]>> tasks = new List<Task<Int64[]>>();
            for (int i = 0; i < hosts.Count; i++) tasks.Add(AsyncGather(hosts[i]));
            Int64[][] result = await Task.WhenAll(tasks);

            lock (metrics_lock)
                for (int i = 0; i < result.Length; i++)
                    if (result[i].Length == 3) {
                        if (previous.ContainsKey(hosts[i])) {
                            Int64[] lastValue = (Int64[])previous[hosts[i]];
                            Int64 lastReceived = lastValue[0];
                            Int64 lastSent = lastValue[1];
                            Int64 received = result[i][0];
                            Int64 sent = result[i][1];

                            if (received < lastReceived || sent < lastSent) continue;

                            DateTime date = new DateTime(result[i][2]);

                            string filename = $"{DIR_METRICS}\\{date.Year}{date.Month.ToString().PadLeft(2, '0')}_{hosts[i]}.txt";
                            string contents = $"{date.ToString("ddHHmm")}\t{received - lastReceived}\t{sent - lastSent}\n";

                            try {
                                File.AppendAllText(filename, contents);
                            } catch {}
                        }

                    } else { //no info
                        if (result[i][0] == -2 && !ignore.ContainsKey(hosts[i]))
                           ignore.Add(hosts[i], null); //if host respones to ping but not to wmic then ignore on next loop.

                        if (previous.ContainsKey(hosts[i])) { //if has previous value but no current
                            DateTime date = DateTime.Now;
                            string filename = $"{DIR_METRICS}\\{date.Year}{date.Month.ToString().PadLeft(2, '0')}_{hosts[i]}.txt";
                            string contents = $"{date.ToString("ddHHmm")}\t0\t0\n";

                            try {
                                File.AppendAllText(filename, contents);
                            } catch {}
                        }
                    }

            previous.Clear();
            for (int i = 0; i < result.Length; i++)
                if (result[i].Length == 3) 
                    previous.Add(hosts[i], result[i]); //UInt64[3]            

            task.status = "Sleeping";
            Thread.Sleep(LOOP_SLEEP_DURATION);
        }
    }

    public static async Task<Int64[]> AsyncGather(string host) {
        Ping p = new Ping();
        bool pingResult = false;

        try {
            PingReply reply = await p.SendPingAsync(host, 1000);
            pingResult = reply.Status == IPStatus.Success;
            if (!pingResult) { //2nd try
                reply = await p.SendPingAsync(host, 1000);
                pingResult = reply.Status == IPStatus.Success;
            }
        } catch {
            return new Int64[] { -1 }; //unreachable
        } finally {
            p.Dispose();
        }

        if (pingResult) {
            LastSeen.Seen(host);
            UInt64 bytesReceived = 0, bytesSent = 0;

            ManagementScope scope = Wmi.WmiScope(host);
            if (scope is null) return GatherSecureShell(host); //try ssh

            try {
                using ManagementObjectCollection moc = new ManagementObjectSearcher(scope, new SelectQuery("SELECT BytesReceivedPersec, BytesSentPersec FROM Win32_PerfRawData_Tcpip_NetworkInterface")).Get();
                foreach (ManagementObject o in moc) {
                    bytesReceived += UInt64.Parse(o.GetPropertyValue("BytesReceivedPersec").ToString());
                    bytesSent += UInt64.Parse(o.GetPropertyValue("BytesSentPersec").ToString());
                }
            } catch { }

            if (bytesReceived == 0 && bytesSent == 0)
                return new Int64[] { 0 }; //no traffic
            else
                return new Int64[] { (Int64)bytesReceived, (Int64)bytesSent, (Int64)DateTime.Now.Ticks }; // <-
        }

        return new Int64[] { -1 }; //unreachable
    }

    public static Int64[] GatherSecureShell(string host) {
        string username = "", password = "";

        foreach (DictionaryEntry o in NoSQL.equip) {
            NoSQL.DbEntry entry = (NoSQL.DbEntry)o.Value;
            lock(entry.write_lock) {
                if (entry.hash.ContainsKey("IP")) {
                    string[] value = ((string[])entry.hash["IP"])[0].Split(';');
                    for (int i = 0; i < value.Length; i++) value[i] = value[i].Trim();
                
                    if (value.Contains(host)) {

                        if (entry.hash.ContainsKey("SSH USERNAME") && entry.hash.ContainsKey("SSH PASSWORD")) {
                            username = ((string[])entry.hash["SSH USERNAME"])[0];
                            password = ((string[])entry.hash["SSH PASSWORD"])[0];
                            break;
                        } else 
                            return new Int64[] { -2 }; //no service

                    } else 
                        continue;
                }
            }
        }

        if (username.Length == 0 && password.Length == 0) return new Int64[] { -2 }; //no service

        try {
            ConnectionInfo conInfo = new ConnectionInfo(host, username, new PasswordAuthenticationMethod(username, password));

            UInt64 bytesReceived = 0, bytesSent = 0;
            using (SshClient sshclient = new SshClient(conInfo)) {
                sshclient.Connect();
                string[] result = sshclient.RunCommand("ifconfig").Result.Split('\n');

                bool flag = false;
                for (int i = 0; i < result.Length; i++) {

                    if (result[i].StartsWith("lo")) {
                        flag = true;
                        continue;
                    }

                    if (result[i].Contains("RX bytes:") && result[i].Contains("TX bytes:")) {
                        if (flag) { //if interface is lo skip
                            flag = false;
                            continue;
                        }

                        string rx = result[i].Split(':')[1];
                        rx = rx.Substring(0, rx.IndexOf(" "));
                        bytesReceived += UInt64.Parse(rx);

                        string tx = result[i].Split(':')[2];
                        tx = tx.Substring(0, tx.IndexOf(" "));
                        bytesSent += UInt64.Parse(tx);
                    }
                }

            };

            if (bytesReceived == 0 && bytesSent == 0)
                return new Int64[] { 0 }; //no traffic
            else
                return new Int64[] { (Int64)bytesReceived, (Int64)bytesSent, (Int64)DateTime.Now.Ticks }; // <-

        } catch {
            return new Int64[] { -2 }; //no service
        }
    } 

    public static byte[] GetMetrics(string[] para) {
        string ip = "", date = "";
        for (int i = 1; i < para.Length; i++) {
            if (para[i].StartsWith("ip=")) ip = para[i].Substring(5);
            if (para[i].StartsWith("date=")) date = para[i].Substring(9);
        }

        if (ip.Length == 0) return null;
        if (date.Length == 0) date = DateTime.Now.ToString("yyyyMM");

        DirectoryInfo dirMetrics = new DirectoryInfo(DIR_METRICS);
        if (!dirMetrics.Exists) return null;

        FileInfo[] files = dirMetrics.GetFiles($"*{ip}.*", SearchOption.TopDirectoryOnly);

        if (files.Length == 0) return null;

        if (files.Length > 1)
            Array.Sort(files, delegate (FileInfo a, FileInfo b) { //reverse sort by name
                return String.Compare(b.Name, a.Name);
            });

        string target = files[0].FullName;

        lock (metrics_lock)
            try {
                return File.ReadAllBytes(target);
            } catch {
                return null;
            }
    }

}
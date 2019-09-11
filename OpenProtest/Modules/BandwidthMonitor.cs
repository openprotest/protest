using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Management;
using System.Net.NetworkInformation;
using System.Threading;
using System.Threading.Tasks;

static class BandwidthMonitor {
    public static readonly string DIR_METRICS = $"{Directory.GetCurrentDirectory()}\\metrics";

    public static async void StartGatheringMetrics() {
        List<string> hosts = new List<string>();
        Hashtable pass = new Hashtable();
        Hashtable ignore = new Hashtable(); //TODO: sdfsdf
        long equip_version = 0;

        while (true) {

            if (equip_version != NoSQL.equip_version) { //build ip list
                hosts.Clear();
                foreach (DictionaryEntry o in NoSQL.equip) {
                    NoSQL.DbEntry entry = (NoSQL.DbEntry) o.Value;
                    if (entry.hash.ContainsKey("IP")) {
                        string[] value = ((string[])entry.hash["IP"])[0].Split(';');
                        for (int i = 0; i < value.Length; i++) {
                            value[i] = value[i].Trim();
                            if (value[i].Length == 0) continue;
                            if (!hosts.Contains(value[i])) hosts.Add(value[i]);
                        }
                    }
                }
                equip_version = NoSQL.equip_version;
            }

            List<Task<UInt64[]>> tasks = new List<Task<UInt64[]>>();
            for (int i = 0; i < hosts.Count; i++)
                if (! ignore.ContainsKey(hosts[i]))
                    tasks.Add(AsyncGather(hosts[i]));

            UInt64[][] result = await Task.WhenAll(tasks);

            for (int i = 0; i < result.Length; i++)
                if (result[i].Length == 3) {
                    if (pass.ContainsKey(hosts[i])) {
                        UInt64[] last = (UInt64[])pass[hosts[i]];
                        UInt64 lastReceived = last[0];
                        UInt64 lastSent = last[1];
                        UInt64 received = result[i][0];
                        UInt64 sent = result[i][1];

                        if (received < lastReceived || sent < lastSent) continue;

                        DateTime date = new DateTime((long)last[2]);

                        string filename = $"{DIR_METRICS}\\{date.Year}{date.Month.ToString().PadLeft(2, '0')}_{hosts[i]}.txt";
                        string contents = $"{date.ToString("ddHHmm")}\t{received - lastReceived}\t{sent - lastSent}\n";

                        try {
                            File.AppendAllText(filename, contents);
                        } catch (Exception ex) {
                            Console.WriteLine(ex.Message);
                        }

                        pass.Remove(hosts[i]);
                        pass.Add(hosts[i], result[i]); //UInt64[3]

                    } else {
                        pass.Add(hosts[i], result[i]); //UInt64[3]
                    }

                } else {
                    if (result[i][0] == 1 && !ignore.ContainsKey(hosts[i]))
                       ignore.Add(hosts[i], null); //if host respones to ping but not to wmic then ignore on next loop.
                }

            //Thread.Sleep(3600000 * 2); //2 hours
        }
    }

    public static async Task<UInt64[]> AsyncGather(string hostname) {
        Ping p = new Ping();
        bool pingResult = false;

        try {
            PingReply reply = await p.SendPingAsync(hostname, 1000);
            pingResult = reply.Status == IPStatus.Success;
            if (!pingResult) { //2nd try
                reply = await p.SendPingAsync(hostname, 1000);
                pingResult = reply.Status == IPStatus.Success;
            }
        } catch {
            return new UInt64[] { 0 };
        } finally {
            p.Dispose();
        }

        if (pingResult) {
            LastSeen.Seen(hostname);
            UInt64 bytesReceived = 0, bytesSent = 0;

            ManagementScope scope = Wmi.WmiScope(hostname);
            if (scope is null) return new UInt64[] { 1 };

            try {
                using (ManagementObjectCollection moc = new ManagementObjectSearcher(scope, new SelectQuery("Win32_PerfRawData_Tcpip_NetworkInterface")).Get())
                    foreach (ManagementObject o in moc) {
                        bytesReceived += UInt64.Parse(o.GetPropertyValue("BytesReceivedPersec").ToString());
                        bytesSent += UInt64.Parse(o.GetPropertyValue("BytesSentPersec").ToString());
                    }
            } catch { }

            if (bytesReceived == 0 && bytesSent == 0)
                return new UInt64[] { 2 };
            else 
                return new UInt64[] { bytesReceived, bytesSent, (UInt64)DateTime.Now.Ticks };

        }

        return new UInt64[] { 0 };
    }

}
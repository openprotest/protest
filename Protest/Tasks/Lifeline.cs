using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Management;
using System.Net;
using System.Net.NetworkInformation;
using System.Runtime.Versioning;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using Protest.Tools;
using Lextm.SharpSnmpLib;

namespace Protest.Tasks;

internal static partial class Lifeline {
    private const long FOUR_HOURS_IN_TICKS = 144_000_000_000L;

    private static ConcurrentDictionary<string, object> pingMutexes = new ConcurrentDictionary<string, object>();
    private static ConcurrentDictionary<string, object> wmiMutexes = new ConcurrentDictionary<string, object>();

    [GeneratedRegex("^(([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\\-]*[a-zA-Z0-9])\\.)*([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9\\-]*[A-Za-z0-9])$")]
    private static partial Regex ValidHostnameRegex();

    public static TaskWrapper task;

    public static void Initialize() {
        StartTask("system");
    }

    public static bool StartTask(string origin) {
        if (task is not null) return false;

        Thread thread = new Thread(() => LifelineLoop());

        task = new TaskWrapper("Lifeline") {
            thread = thread,
            origin = origin,
            TotalSteps = 0,
            CompletedSteps = 0
        };

        task.thread.Start();

        return true;
    }

    public static bool StopTask(string origin) {
        if (task is null) return false;
        task.RequestCancel(origin);
        return true;
    }

    private static void LifelineLoop() {
        Regex regex = ValidHostnameRegex();
        ConcurrentDictionary<string, object> mutex = new ConcurrentDictionary<string, object>();
        HashSet<string> ping = new HashSet<string>();
        HashSet<string[]> wmi = new HashSet<string[]>();
        HashSet<string[]> snmp = new HashSet<string[]>();

        Tools.SnmpProfiles.Profile[] snmpProfiles = Tools.SnmpProfiles.Load();

        long lastVersion = 0;

        while (true) {
            long startTimeStamp = DateTime.UtcNow.Ticks;
            
            if (lastVersion != DatabaseInstances.devices.version) {
                mutex.Clear();
                ping.Clear();
                wmi.Clear();
                snmp.Clear();

                foreach (Database.Entry entry in DatabaseInstances.devices.dictionary.Values) {
                    string[] remoteEndPoint;

                    entry.attributes.TryGetValue("type", out Database.Attribute type);

                    if (entry.attributes.TryGetValue("ip", out Database.Attribute ipAttr)) {
                        remoteEndPoint = ipAttr.value.Split(';');
                    }
                    else if (entry.attributes.TryGetValue("hostname", out Database.Attribute hostnameAttr)) {
                        remoteEndPoint = hostnameAttr.value.Split(';');
                    }
                    else {
                        continue;
                    }

                    string os = entry.attributes.TryGetValue("operating system", out Database.Attribute osAttr) ?
                    osAttr.value.ToLower() :
                    null;

                    bool wmiOnce = true;
                    for (int i = 0; i < remoteEndPoint.Length; i++) {
                        if (remoteEndPoint[i].Length == 0) continue;
                        if (!regex.IsMatch(remoteEndPoint[i])) continue;

                        ping.Add(remoteEndPoint[i]);
                        mutex.TryAdd(remoteEndPoint[i], new Object());

                        if (wmiOnce && os is not null && os.Contains("windows")) {
                            wmiOnce = false;
                            wmi.Add(new string[] { entry.filename, remoteEndPoint[i] });
                            mutex.TryAdd(entry.filename, new Object());
                        }
                    }

                    if (type is not null) {
                        switch (type.value.ToLower().Trim()) {
                        case "fax":
                        case "multiprinter":
                        case "ticket printer":
                        case "printer":
                            IPAddress ipAddress;
                            if (!IPAddress.TryParse(remoteEndPoint[0], out ipAddress)) {
                                try {
                                    ipAddress = System.Net.Dns.GetHostEntry(remoteEndPoint[0]).AddressList[0];
                                }
                                catch { }
                            }

                            entry.attributes.TryGetValue("snmp profile", out Database.Attribute snmpProfile);

                            snmp.Add(new string[] { entry.filename, ipAddress.ToString(), snmpProfile?.value });
                            mutex.TryAdd(entry.filename, new Object());

                            break;
                        }
                    }

                }

                lastVersion = DatabaseInstances.devices.version;
            }

            Thread pingThread = new Thread(() => {
                foreach (string host in ping) {
                    mutex.TryGetValue(host, out object obj);
                    try {
                        lock (obj) {
                            IcmpQuery(host);
                        }
                    }
                    catch { }
                }
            });

            Thread wmiThread = null, snmpThread = null;

            if (OperatingSystem.IsWindows()) {
                wmiThread = new Thread(() => {
                    if (!OperatingSystem.IsWindows()) {
                        return;
                    }

                    foreach (string[] data in wmi) {
                        mutex.TryGetValue(data[0], out object obj);
                        try {
                            lock (obj) {
                                bool p = IcmpQuery(data[1]);
                                if (!p) { continue; }
                                WmiQuery(data[0], data[1]);
                            }
                        }
                        catch { }
                    }
                });
            }

            if (true) {
                snmpThread = new Thread(() => {
                    foreach (string[] data in snmp) {
                        mutex.TryGetValue(data[0], out object obj);
                        try {
                            lock (obj) {
                                bool p = IcmpQuery(data[1]);
                                if (!p) continue;
                                SnmpQuery(data[0], data[1], data[2], snmpProfiles);
                            }
                        }
                        catch { }
                    }


                });
            }


            pingThread.Start();
            wmiThread?.Start();
            snmpThread?.Start();

            pingThread.Join();
            wmiThread?.Join();
            snmpThread?.Join();

            task.Sleep(Math.Max((int)((FOUR_HOURS_IN_TICKS - (DateTime.UtcNow.Ticks - startTimeStamp)) / 10_000), 0));

            if (task.cancellationToken.IsCancellationRequested) {
                task?.Dispose();
                task = null;
                return;
            }
        }
    }

    private static bool IcmpQuery(string host) {
        DateTime now = DateTime.UtcNow;
        short rtt = -1;

        using Ping ping = new Ping();
        try {
            PingReply reply = ping.Send(host, 1000); //1st try
            if (reply.Status == IPStatus.Success) {
                LastSeen.Seen(host);
                rtt = (short)reply.RoundtripTime;
            }
            else {
                reply = ping.Send(host, 1000); //2nd try
                if (reply.Status == IPStatus.Success) {
                    LastSeen.Seen(host);
                    rtt = (short)reply.RoundtripTime;
                }
            }
        }
        catch {
            rtt = -1;
        }

        string dir = $"{Data.DIR_LIFELINE}{Data.DELIMITER}rtt{Data.DELIMITER}{host}";
        if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);

        try {
            object mutex = pingMutexes.GetOrAdd(host, new object());

            lock (mutex) {
                using FileStream stream = new FileStream($"{dir}{Data.DELIMITER}{now:yyyyMM}", FileMode.Append);
                using BinaryWriter writer = new BinaryWriter(stream, Encoding.UTF8, false);
                writer.Write(((DateTimeOffset)now).ToUnixTimeMilliseconds()); //8 bytes
                writer.Write(rtt); //2 bytes

                writer.Dispose();
                stream.Dispose();
            }

            return rtt >= 0;
        }
        catch (IOException ex){
            Logger.Error(ex);
            return false;
        }
        catch {
            return rtt >= 0;
        }
    }

    [SupportedOSPlatform("windows")]
    private static void WmiQuery(string file, string host) {
        byte cpuUsage = 255, diskUsage = 255;
        ulong memoryFree = 0, memoryTotal = 0;

        List<byte> diskCaption = new List<byte>();
        List<ulong> diskFree = new List<ulong>();
        List<ulong> diskTotal = new List<ulong>();

        ManagementScope scope;
        try {
            scope = Protocols.Wmi.Scope(host);
            if (scope is null) { return; }
        }
        catch {
            return;
        }

        try {
            using ManagementObjectCollection os = new ManagementObjectSearcher(scope, new SelectQuery("SELECT PercentIdleTime FROM Win32_PerfFormattedData_PerfOS_Processor WHERE Name = '_Total'")).Get();
            foreach (ManagementObject o in os.Cast<ManagementObject>()) {
                if (o is null) continue;
                ulong idle = (ulong)o.GetPropertyValue("PercentIdleTime");
                cpuUsage = (byte)idle;
                break;
            }
        }
        catch { }

        try {
            using ManagementObjectCollection os = new ManagementObjectSearcher(scope, new SelectQuery("SELECT PercentIdleTime FROM Win32_PerfFormattedData_PerfDisk_PhysicalDisk WHERE Name = '_Total'")).Get();
            foreach (ManagementObject o in os.Cast<ManagementObject>()) {
                if (o is null) continue;
                ulong idle = (ulong)o.GetPropertyValue("PercentIdleTime");
                diskUsage = (byte)idle;
                break;
            }
        }
        catch { }

        try {
            using ManagementObjectCollection os = new ManagementObjectSearcher(scope, new SelectQuery("Win32_OperatingSystem")).Get();
            foreach (ManagementObject o in os.Cast<ManagementObject>()) {
                if (o is null) continue;
                memoryFree += (ulong)o.GetPropertyValue("FreePhysicalMemory");
                memoryTotal += (ulong)o.GetPropertyValue("TotalVisibleMemorySize");
            }
        }
        catch { }

        try {
            using ManagementObjectCollection logicalDisk = new ManagementObjectSearcher(scope, new SelectQuery("SELECT Caption, FreeSpace, Size FROM Win32_LogicalDisk WHERE DriveType = 3")).Get();
            foreach (ManagementObject o in logicalDisk.Cast<ManagementObject>()) {
                if (o is null) continue;

                string caption = o.GetPropertyValue("Caption")?.ToString();
                object free = o.GetPropertyValue("FreeSpace");
                object size = o.GetPropertyValue("Size");

                if (String.IsNullOrEmpty(caption)) continue;
                if (free is null || size is null) continue;
                if ((ulong)size == 0) continue;

                diskCaption.Add(Convert.ToByte(caption[0]));
                diskFree.Add((ulong)free);
                diskTotal.Add((ulong)size);
            }
        }
        catch { }


        DateTime now = DateTime.UtcNow;

        object mutex = wmiMutexes.GetOrAdd(host, new object());

        lock (mutex) {
            if (cpuUsage != 255) {
                string dirCpu = $"{Data.DIR_LIFELINE}{Data.DELIMITER}cpu{Data.DELIMITER}{file}";
                if (!Directory.Exists(dirCpu)) Directory.CreateDirectory(dirCpu);

                try {
                    using FileStream stream = new FileStream($"{dirCpu}{Data.DELIMITER}{now:yyyyMM}", FileMode.Append);
                    using BinaryWriter writer = new BinaryWriter(stream, Encoding.UTF8, false);
                    writer.Write(((DateTimeOffset)now).ToUnixTimeMilliseconds()); //8 bytes
                    writer.Write((byte)(100 - cpuUsage)); //1 byte

                    writer.Dispose();
                    stream.Dispose();
                }
                catch { }
            }

            if (diskUsage != 255) {
                string dirDiskUsage = $"{Data.DIR_LIFELINE}{Data.DELIMITER}diskusage{Data.DELIMITER}{file}";
                if (!Directory.Exists(dirDiskUsage)) Directory.CreateDirectory(dirDiskUsage);

                try {
                    using FileStream stream = new FileStream($"{dirDiskUsage}{Data.DELIMITER}{now:yyyyMM}", FileMode.Append);
                    using BinaryWriter writer = new BinaryWriter(stream, Encoding.UTF8, false);
                    writer.Write(((DateTimeOffset)now).ToUnixTimeMilliseconds()); //8 bytes
                    writer.Write((byte)(100 - diskUsage)); //1 byte

                    writer.Dispose();
                    stream.Dispose();
                }
                catch { }
            }

            if (memoryTotal > 0) {
                string dirMemory = $"{Data.DIR_LIFELINE}{Data.DELIMITER}memory{Data.DELIMITER}{file}";
                if (!Directory.Exists(dirMemory)) Directory.CreateDirectory(dirMemory);

                try {
                    using FileStream stream = new FileStream($"{dirMemory}{Data.DELIMITER}{now:yyyyMM}", FileMode.Append);
                    using BinaryWriter writer = new BinaryWriter(stream, Encoding.UTF8, false);
                    writer.Write(((DateTimeOffset)now).ToUnixTimeMilliseconds()); //8 bytes
                    writer.Write(memoryTotal - memoryFree); //8 bytes
                    writer.Write(memoryTotal); //8 bytes

                    writer.Dispose();
                    stream.Dispose();
                }
                catch { }
            }

            if (diskCaption.Count > 0) {
                string dirDisk = $"{Data.DIR_LIFELINE}{Data.DELIMITER}disk{Data.DELIMITER}{file}";
                if (!Directory.Exists(dirDisk)) Directory.CreateDirectory(dirDisk);

                try {
                    using FileStream stream = new FileStream($"{dirDisk}{Data.DELIMITER}{now:yyyyMM}", FileMode.Append);
                    using BinaryWriter writer = new BinaryWriter(stream, Encoding.UTF8, false);
                    writer.Write(((DateTimeOffset)now).ToUnixTimeMilliseconds()); //8 bytes
                    writer.Write(diskCaption.Count); //4 bytes

                    for (int i = 0; i < diskCaption.Count; i++) {
                        writer.Write(diskCaption[i]); //1 bytes
                        writer.Write(diskTotal[i] - diskFree[i]); //8 bytes
                        writer.Write(diskTotal[i]); //8 bytes
                    }

                    writer.Dispose();
                    stream.Dispose();
                }
                catch { }
            }
        }
    }

    private static void SnmpQuery(string file, string _ipAddress, string _profile, SnmpProfiles.Profile[] snmpProfiles) {
        if (!IPAddress.TryParse(_ipAddress, out IPAddress ipAddress)) { return; }

        SnmpProfiles.Profile profile = null;
        if (!String.IsNullOrEmpty(_profile) && Guid.TryParse(_profile, out Guid guid)) {
            for (int i = 0; i < snmpProfiles.Length; i++) {
                if (snmpProfiles[i].guid == guid) {
                    profile = snmpProfiles[i];
                    break;
                }
            }
        }

        if (profile is null) {
            return;
        }

        string[][] printerConsumable = Protocols.Snmp.Polling.ParseResponse(Protocols.Snmp.Polling.SnmpGetQuery(ipAddress, profile, Protocols.Snmp.Oid.LIFELINE_PRINTER_OID, Protocols.Snmp.Polling.SnmpOperation.Get));

        if (printerConsumable is null || printerConsumable.Length == 0) {
            return;
        }

        object mutex = wmiMutexes.GetOrAdd(_ipAddress, new object());

        lock (mutex) {
            //TODO: store to file
            for (int i = 0; i < printerConsumable?.Length; i++) {
                Console.WriteLine(printerConsumable[i][0] + "\t" + printerConsumable[i][1]);
            }
            Console.WriteLine(" - - - ");
        }
    }

    public static byte[] ViewFile(Dictionary<string, string> parameters, string type) {
        if (parameters is null) { return null; }

        parameters.TryGetValue("file", out string file);
        if (String.IsNullOrEmpty(file)) { return null; }

        parameters.TryGetValue("date", out string date);
        if (String.IsNullOrEmpty(date)) {
            DateTime now = DateTime.Now;
            date = now.ToString("yyyyMM");
        }

        try {
            return File.ReadAllBytes($"{Data.DIR_LIFELINE}{Data.DELIMITER}{type}{Data.DELIMITER}{file}{Data.DELIMITER}{date}");
        }
        catch {
            return null;
        }
    }

    public static byte[] ViewPing(Dictionary<string, string> parameters) {
        if (parameters is null) { return null; }

        parameters.TryGetValue("host", out string host);
        if (String.IsNullOrEmpty(host)) { return null; }

        parameters.TryGetValue("date", out string date);
        if (String.IsNullOrEmpty(date)) {
            DateTime now = DateTime.Now;
            date = now.ToString("yyyyMM");
        }

        try {
            return File.ReadAllBytes($"{Data.DIR_LIFELINE}{Data.DELIMITER}rtt{Data.DELIMITER}{host}{Data.DELIMITER}{date}");
        }
        catch {
            return null;
        }
    }

    public static byte[] ViewPrintCounter() {
        //TODO: view print counter
        return null;
    }
}
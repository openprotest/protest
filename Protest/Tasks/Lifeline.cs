using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Management;
using System.Net.NetworkInformation;
using System.Runtime.Versioning;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;

namespace Protest.Tasks;

internal static partial class Lifeline {
    private const long FOUR_HOURS_IN_TICKS = 144_000_000_000L;

    [GeneratedRegex("^(([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\\-]*[a-zA-Z0-9])\\.)*([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9\\-]*[A-Za-z0-9])$")]
    private static partial Regex ValidHostnameRegex();

    public static TaskWrapper task;

    public static void Initialize() {
        //TODO: autostart
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
        ConcurrentDictionary<string, object> lockTable = new ConcurrentDictionary<string, object>();
        HashSet<string> pingOnly = new HashSet<string>();
        HashSet<string> pingAndWmi = new HashSet<string>();

        long lastVersion = 0;

        while (true) {
            long startTimeStamp = DateTime.UtcNow.Ticks;
            
            if (lastVersion != DatabaseInstances.devices.version) {
                lockTable.Clear();
                pingOnly.Clear();
                pingAndWmi.Clear();

                foreach (Database.Entry entry in DatabaseInstances.devices.dictionary.Values) {
                    string[] remoteEndPoint;

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

                    for (int i = 0; i < remoteEndPoint.Length; i++) {
                        if (remoteEndPoint[i].Length == 0) continue;
                        if (!regex.IsMatch(remoteEndPoint[i])) continue;

                        if (os is not null && os.Contains("windows")) {
                            pingAndWmi.Add(remoteEndPoint[i]);
                        }
                        else {
                            pingOnly.Add(remoteEndPoint[i]);
                        }

                        lockTable.TryAdd(remoteEndPoint[i], new Object());
                    }
                }

                lastVersion = DatabaseInstances.devices.version;
            }

            Thread pingThread = new Thread(() => {
                foreach (string host in pingOnly) {
                    lockTable.TryGetValue(host, out object lockObject);
                    try {
                        lock (lockObject) {
                            DoPing(host);
                        }
                    }
                    catch { }
                }
            });

            Thread wmiThread = new Thread(() => {
                if (!OperatingSystem.IsWindows()) return;

                foreach (string host in pingAndWmi) {
                    lockTable.TryGetValue(host, out object lockObject);
                    try {
                        lock (lockObject) {
                            bool p = DoPing(host);
                            if (!p) continue;
                            DoWmi(host);
                        }
                    }
                    catch { }
                }
            });

            pingThread.Start();
            wmiThread.Start();

            pingThread.Join();
            wmiThread.Join();

            task.Sleep(Math.Max((int)((FOUR_HOURS_IN_TICKS - (DateTime.UtcNow.Ticks - startTimeStamp)) / 10_000), 0));

            if (task.cancellationToken.IsCancellationRequested) {
                task.Dispose();
                task = null;
                return;
            }
        }
    }

    private static bool DoPing(string host) {
        DateTime now = DateTime.UtcNow;
        short rtt = -1;

        Ping ping = new Ping();
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
        using FileStream stream = new FileStream($"{dir}{Data.DELIMITER}{now:yyyyMM}", FileMode.Append);

        try {
            using BinaryWriter writer = new BinaryWriter(stream, Encoding.UTF8, false);
            writer.Write(((DateTimeOffset)now).ToUnixTimeMilliseconds()); //8 bytes
            writer.Write(rtt); //2 bytes
            return rtt >= 0;
        }
        catch {
            return rtt >= 0;
        }
    }

    [SupportedOSPlatform("windows")]
    private static void DoWmi(string host) {
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
            using ManagementObjectCollection os = new ManagementObjectSearcher(scope, new SelectQuery("Win32_OperatingSystem")).Get();
            foreach (ManagementObject o in os.Cast<ManagementObject>()) {
                if (o is null) continue;
                memoryFree += (ulong)o!.GetPropertyValue("FreePhysicalMemory");
                memoryTotal += (ulong)o!.GetPropertyValue("TotalVisibleMemorySize");
            }
        }
        catch { }

        try {
            using ManagementObjectCollection logicalDisk = new ManagementObjectSearcher(scope, new SelectQuery("SELECT * FROM Win32_LogicalDisk WHERE DriveType = 3")).Get();
            foreach (ManagementObject o in logicalDisk.Cast<ManagementObject>()) {
                if (o is null) continue;

                string caption = o!.GetPropertyValue("Caption")?.ToString();
                object free = o!.GetPropertyValue("FreeSpace");
                object size = o!.GetPropertyValue("Size");

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

        if (memoryTotal > 0) {
            string dirMemory = $"{Data.DIR_LIFELINE}{Data.DELIMITER}memory{Data.DELIMITER}{host}";
            if (!Directory.Exists(dirMemory)) Directory.CreateDirectory(dirMemory);
            using FileStream memoryStream = new FileStream($"{dirMemory}{Data.DELIMITER}{now:yyyyMM}", FileMode.Append);

            try {
                using BinaryWriter writer = new BinaryWriter(memoryStream, Encoding.UTF8, false);
                writer.Write(((DateTimeOffset)now).ToUnixTimeMilliseconds()); //8 bytes
                writer.Write(memoryTotal - memoryFree); //8 bytes
                writer.Write(memoryTotal); //8 bytes
            }
            catch { }
        }

        if (diskCaption.Count > 0) {
            string dirDisk = $"{Data.DIR_LIFELINE}{Data.DELIMITER}disk{Data.DELIMITER}{host}";
            if (!Directory.Exists(dirDisk)) Directory.CreateDirectory(dirDisk);
            using FileStream diskStream = new FileStream($"{dirDisk}{Data.DELIMITER}{now:yyyyMM}", FileMode.Append);

            try {
                using BinaryWriter writer = new BinaryWriter(diskStream, Encoding.UTF8, false);
                writer.Write(((DateTimeOffset)now).ToUnixTimeMilliseconds()); //8 bytes
                writer.Write(diskCaption.Count); //4 bytes

                for (int i = 0; i < diskCaption.Count; i++) {
                    writer.Write(diskCaption[i]); //1 bytes
                    writer.Write(diskTotal[i] - diskFree[i]); //8 bytes
                    writer.Write(diskTotal[i]); //8 bytes
                }
            }
            catch { }
        }
    }

    public static byte[] ViewPing(Dictionary<string, string> parameters) {
        if (parameters is null) { return null; }

        parameters.TryGetValue("host", out string host);
        if (String.IsNullOrEmpty(host)) return null;

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

    public static byte[] ViewMemory(Dictionary<string, string> parameters) {
        if (parameters is null) { return null; }

        parameters.TryGetValue("host", out string host);
        if (String.IsNullOrEmpty(host)) return null;

        parameters.TryGetValue("date", out string date);
        if (String.IsNullOrEmpty(date)) {
            DateTime now = DateTime.Now;
            date = now.ToString("yyyyMM");
        }

        try {
            return File.ReadAllBytes($"{Data.DIR_LIFELINE}{Data.DELIMITER}memory{Data.DELIMITER}{host}{Data.DELIMITER}{date}");
        }
        catch {
            return null;
        }
    }

    public static byte[] ViewDisk(Dictionary<string, string> parameters) {
        if (parameters is null) { return null; }

        parameters.TryGetValue("host", out string host);
        if (String.IsNullOrEmpty(host)) return null;

        parameters.TryGetValue("date", out string date);
        if (String.IsNullOrEmpty(date)) {
            DateTime now = DateTime.Now;
            date = now.ToString("yyyyMM");
        }

        try {
            return File.ReadAllBytes($"{Data.DIR_LIFELINE}{Data.DELIMITER}disk{Data.DELIMITER}{host}{Data.DELIMITER}{date}");
        }
        catch {
            return null;
        }
    }
}
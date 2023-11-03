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

namespace Protest.Tasks;

internal static partial class Lifeline {
    private const long FOUR_HOURS_IN_TICKS = 144_000_000_000L;

    [GeneratedRegex("^(([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\\-]*[a-zA-Z0-9])\\.)*([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9\\-]*[A-Za-z0-9])$")]
    private static partial Regex ValidHostnameRegex();

    private static readonly ConcurrentDictionary<string, object> lockTable = new ConcurrentDictionary<string, object>();

    public static TaskWrapper task;

    public static void Initialize() {
        //TODO: if autostart then start task
        StartTask("system");
    }

    public static bool StartTask(string initiator) {
        if (task is not null) return false;

        Thread thread = new Thread(() => LifelineLoop());

        task = new TaskWrapper("Lifeline") {
            thread = thread,
            initiator = initiator,
            TotalSteps = 0,
            CompletedSteps = 0
        };

        task.thread.Start();

        return true;
    }

    public static bool StopTask(string initiator) {
        if (task is null) return false;
        task.RequestCancel(initiator);
        return true;
    }

    private static void LifelineLoop() {
        Regex regex = ValidHostnameRegex();
        HashSet<string> pingOnly = new HashSet<string>();
        HashSet<string> pingAndWmiA = new HashSet<string>();
        HashSet<string> pingAndWmiB = new HashSet<string>();

        long lastVersion = 0;

        while (true) {
            long startTimeStamp = DateTime.UtcNow.Ticks;
            
            if (lastVersion != DatabaseInstances.devices.version) {
                pingOnly.Clear();
                pingAndWmiA.Clear();
                pingAndWmiB.Clear();

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
                            if (pingAndWmiB.Count > pingAndWmiA.Count) {
                                pingAndWmiA.Add(remoteEndPoint[i]);
                            }
                            else {
                                pingAndWmiB.Add(remoteEndPoint[i]);
                            }
                        }
                        else {
                            pingOnly.Add(remoteEndPoint[i]);
                        }
                    }
                }

                lastVersion = DatabaseInstances.devices.version;
            }

            Thread pingThread = new Thread(() => {
                foreach (string host in pingOnly) {
                    WritePing(host);
                }
            });

            Thread wmiThreadA = new Thread(() => {
                if (!OperatingSystem.IsWindows()) return;

                foreach (string host in pingAndWmiA) {
                    try {
                        if (!WritePing(host)) continue;
                        ManagementScope scope = Protocols.Wmi.Scope(host);
                        WriteMemory(host, scope);
                        WriteDisk(host, scope);
                    }
                    catch { }
                }
            });

            Thread wmiThreadB = new Thread(() => {
                if (!OperatingSystem.IsWindows())
                    return;

                foreach (string host in pingAndWmiB) {
                    try {
                        if (!WritePing(host)) continue;
                        ManagementScope scope = Protocols.Wmi.Scope(host);
                        WriteMemory(host, scope);
                        WriteDisk(host, scope);
                    }
                    catch { }
                }
            });

            pingThread.Start();
            wmiThreadA.Start();
            wmiThreadB.Start();

            pingThread.Join();
            wmiThreadA.Join();
            wmiThreadB.Join();

            task.Sleep((int)Math.Max(FOUR_HOURS_IN_TICKS - (DateTime.UtcNow.Ticks - startTimeStamp) / 10_000L, 0));

            if (task.cancellationToken.IsCancellationRequested) {
                task.Dispose();
                task = null;
                return;
            }
        }
    }

    private static bool WritePing(string host) {
        DateTime now = DateTime.UtcNow;
        short rtt = -1;

        Ping ping = new Ping();
        try {
            PingReply reply = ping.Send(host, 1000); //1st try
            if (reply.Status != IPStatus.Success) {
                LastSeen.Seen(host);
                rtt = (short)reply.RoundtripTime;
            }

            reply = ping.Send(host, 1000); //2nd try
            if (reply.Status != IPStatus.Success) {
                LastSeen.Seen(host);
                rtt = (short)reply.RoundtripTime;
            }
        }
        catch { }

        string dir = $"{Data.DIR_LIFELINE}{Data.DELIMITER}rtt{Data.DELIMITER}{host}";
        using FileStream stream = new FileStream($"{dir}{Data.DELIMITER}{now:yyyyMM}", FileMode.Append);

        try {
            if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);

            using BinaryWriter writer = new BinaryWriter(stream, Encoding.UTF8, false);
            writer.Write(((DateTimeOffset)now).ToUnixTimeMilliseconds()); //8 bytes
            writer.Write(rtt); //2 bytes
        }
        finally {
            stream.Close();
        }

        return rtt >= 0;
    }

    [SupportedOSPlatform("windows")]
    private static void WriteMemory(string host, ManagementScope scope) {
        DateTime now = DateTime.UtcNow;
        ulong total = 0, free = 0;

        try {
            using ManagementObjectCollection logicalDisk = new ManagementObjectSearcher(scope, new SelectQuery("SELECT * FROM Win32_OperatingSystem")).Get();
            foreach (ManagementObject o in logicalDisk.Cast<ManagementObject>()) {
                if (o is null) continue;
                total += (ulong)o.GetPropertyValue("TotalPhysicalMemory");
                free += (ulong)o.GetPropertyValue("FreePhysicalMemory");
            }
        }
        catch { }

        string dir = $"{Data.DIR_LIFELINE}{Data.DELIMITER}memory{Data.DELIMITER}{host}";
        using FileStream stream = new FileStream($"{dir}{Data.DELIMITER}{now:yyyyMM}", FileMode.Append);

        try {
            if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);

            using BinaryWriter writer = new BinaryWriter(stream, Encoding.UTF8, false);
            writer.Write(((DateTimeOffset)now).ToUnixTimeMilliseconds()); //8 bytes
            writer.Write(total); //8 bytes
            writer.Write(total - free); //8 bytes
        }
        finally {
            stream.Close();
        }
    }

    [SupportedOSPlatform("windows")]
    private static void WriteDisk(string host, ManagementScope scope) {
        DateTime now = DateTime.UtcNow;
        List<byte> caption = new List<byte>();
        List<ulong> size = new List<ulong>();
        List<ulong> free = new List<ulong>();

        try {
            using ManagementObjectCollection logicalDisk = new ManagementObjectSearcher(scope, new SelectQuery("SELECT * FROM Win32_LogicalDisk WHERE DriveType = 3")).Get();
            foreach (ManagementObject o in logicalDisk.Cast<ManagementObject>()) {
                if (o is null) continue;
                caption.Add((byte)o.GetPropertyValue("Caption").ToString()[0]);
                size.Add((ulong)o.GetPropertyValue("Size"));
                free.Add((ulong)o.GetPropertyValue("FreeSpace"));
            }
        }
        catch { }

        string dir = $"{Data.DIR_LIFELINE}{Data.DELIMITER}disk{Data.DELIMITER}{host}";
        using FileStream stream = new FileStream($"{dir}{Data.DELIMITER}{now:yyyyMM}", FileMode.Append);

        try {
            if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);

            using BinaryWriter writer = new BinaryWriter(stream, Encoding.UTF8, false);
            writer.Write(((DateTimeOffset)now).ToUnixTimeMilliseconds()); //8 bytes
            writer.Write(caption.Count); //4 bytes

            for (int i = 0; i < caption.Count; i++) {
                writer.Write(caption[i]); //1 bytes
                writer.Write(size[i]); //8 bytes
                writer.Write(size[i] - free[i]); //8 bytes
            }
        }
        finally {
            stream.Close();
        }
    }

    public static byte[] ViewPing(Dictionary<string, string> parameters) {
        if (parameters is null) { return null; }

        parameters.TryGetValue("host", out string host);
        if (String.IsNullOrEmpty(host)) return null;

        parameters.TryGetValue("date", out string date);
        if (String.IsNullOrEmpty(date)) return null;

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
        if (String.IsNullOrEmpty(date)) return null;

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
        if (String.IsNullOrEmpty(date)) return null;

        try {
            return File.ReadAllBytes($"{Data.DIR_LIFELINE}{Data.DELIMITER}disk{Data.DELIMITER}{host}{Data.DELIMITER}{date}");
        }
        catch {
            return null;
        }
    }
}
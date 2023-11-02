using System.Collections.Generic;
using System.IO;
using System.Management;
using System.Net.NetworkInformation;
using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using System.Text;
using System.Threading;

namespace Protest.Tasks;

internal static class Lifeline {
    private const long FOUR_HOURS_IN_TICKS = 144_000_000_000L;

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
        HashSet<string> ping = new HashSet<string>();
        HashSet<string> wmi = new HashSet<string>();

        long lastVersion = 0;

        while (true) {
            long startTimeStamp = DateTime.UtcNow.Ticks;
            
            if (lastVersion != DatabaseInstances.devices.version) {
                ping.Clear();
                wmi.Clear();

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
                        ping.Add(remoteEndPoint[i]);
                        if (os is not null && os.Contains("windows")) {
                            wmi.Add(remoteEndPoint[i]);
                        }
                    }
                }

                lastVersion = DatabaseInstances.devices.version;
            }

            Thread pingThread = new Thread(() => {
                foreach (string host in ping) {
                    Ping(host);
                }
            });

            Thread wmiThread = new Thread(() => {
                if (!OperatingSystem.IsWindows()) return;

                foreach (string host in wmi) {
                    try {
                        ManagementScope scope = Protocols.Wmi.Scope(host);
                        Memory(host, scope);
                        Disk(host, scope);
                    }
                    catch { }
                }
            });

            pingThread.Start();
            wmiThread.Start();

            pingThread.Join();
            wmiThread.Join();

            task.Sleep((int)Math.Max(FOUR_HOURS_IN_TICKS - (DateTime.UtcNow.Ticks - startTimeStamp) / 10_000L, 0));

            if (task.cancellationToken.IsCancellationRequested) {
                task.Dispose();
                task = null;
                return;
            }
        }
    }

    private static void Ping(string host) {
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

        try {
            using FileStream stream = new FileStream($"{Data.DIR_LIFELINE}{Data.DELIMITER}rtt{Data.DELIMITER}{host}", FileMode.Append);
            using BinaryWriter writer = new BinaryWriter(stream, Encoding.UTF8, false);
            writer.Write(((DateTimeOffset)now).ToUnixTimeMilliseconds()); //8 bytes
            writer.Write(rtt); //2 bytes
            stream.Close();
        } catch { }
    }

    [SupportedOSPlatform("windows")]
    private static void Memory(string host, ManagementScope scope) {
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

        try {
            using FileStream stream = new FileStream($"{Data.DIR_LIFELINE}{Data.DELIMITER}memory{Data.DELIMITER}{host}", FileMode.Append);
            using BinaryWriter writer = new BinaryWriter(stream, Encoding.UTF8, false);
            writer.Write(((DateTimeOffset)now).ToUnixTimeMilliseconds()); //8 bytes
            writer.Write(total); //8 bytes
            writer.Write(total - free); //8 bytes
            stream.Close();
        }
        catch { }
    }

    [SupportedOSPlatform("windows")]
    private static void Disk(string host, ManagementScope scope) {
        DateTime now = DateTime.UtcNow;
        List<string> caption = new List<string>();
        List<ulong> size = new List<ulong>();
        List<ulong> free = new List<ulong>();

        try {
            using ManagementObjectCollection logicalDisk = new ManagementObjectSearcher(scope, new SelectQuery("SELECT * FROM Win32_LogicalDisk WHERE DriveType = 3")).Get();
            foreach (ManagementObject o in logicalDisk.Cast<ManagementObject>()) {
                if (o is null) continue;
                caption.Add(o.GetPropertyValue("Caption").ToString());
                size.Add((ulong)o.GetPropertyValue("Size"));
                free.Add((ulong)o.GetPropertyValue("FreeSpace"));
            }
        }
        catch { }

        try {
            using FileStream stream = new FileStream($"{Data.DIR_LIFELINE}{Data.DELIMITER}disk{Data.DELIMITER}{host}", FileMode.Append);
            using BinaryWriter writer = new BinaryWriter(stream, Encoding.UTF8, false);

            writer.Write(((DateTimeOffset)now).ToUnixTimeMilliseconds()); //8 bytes
            writer.Write(caption.Count); //4 bytes

            for (int i = 0; i < caption.Count; i++) {
                writer.Write(caption[i]); //8 bytes
                writer.Write(size[i]); //8 bytes
                writer.Write(size[i] - free[i]); //8 bytes
            }

            stream.Close();
        }
        catch { }
    }

}
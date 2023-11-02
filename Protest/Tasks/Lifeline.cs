using System.Collections.Generic;
using System.Management;
using System.Net.NetworkInformation;
using System.Runtime.InteropServices;
using System.Runtime.Versioning;
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
        if (task is null)
            return false;
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
                        Memory(scope);
                        Disk(scope);
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
        Ping ping = new Ping();
        try {
            PingReply reply = ping.Send(host, 500);

            if (reply.Status != IPStatus.Success) {
                LastSeen.Seen(host);
            }
            else {

            }
        }
        catch { }
    }

    [SupportedOSPlatform("windows")]
    private static void Memory(ManagementScope scope) {
        try {
            using ManagementObjectCollection logicalDisk = new ManagementObjectSearcher(scope, new SelectQuery("SELECT * FROM Win32_LogicalDisk WHERE DriveType = 3")).Get();
            foreach (ManagementObject o in logicalDisk.Cast<ManagementObject>()) {
                string caption = o.GetPropertyValue("Caption").ToString();
                ulong size = (ulong)o.GetPropertyValue("Size");
                ulong free = (ulong)o.GetPropertyValue("FreeSpace");

            }
        }
        catch { }
    }

    [SupportedOSPlatform("windows")]
    private static void Disk(ManagementScope scope) {

        //Win32_OperatingSystem : FreePhysicalMemory, TotalPhysicalMemory
        //

        try {
            using ManagementObjectCollection logicalDisk = new ManagementObjectSearcher(scope, new SelectQuery("SELECT * FROM Win32_LogicalDisk WHERE DriveType = 3")).Get();
            foreach (ManagementObject o in logicalDisk.Cast<ManagementObject>()) {
                string caption = o.GetPropertyValue("Caption").ToString();
                ulong size = (ulong)o.GetPropertyValue("Size");
                ulong free = (ulong)o.GetPropertyValue("FreeSpace");

            }
        }
        catch { }
    }

}
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Net.NetworkInformation;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;
using System.Data;
using System.DirectoryServices;
using Protest.Http;
using Protest.Tools;
using System.Collections.Concurrent;

namespace Protest.Tasks;

internal static class Fetch {

    enum Type {
        none = 0,
        devices = 1,
        users = 2,
    }

    struct Result {
        public string name;
        public Type type;
        public long started;
        public long finished;
        public ConcurrentDictionary<string, ConcurrentDictionary<string, string[]>> dataset;
        public int successful;
        public int unsuccessful;
    }

    private static readonly JsonSerializerOptions fetchSerializerOptions;

    public static TaskWrapper task;
    private static Result? result;

    static Fetch() {
        fetchSerializerOptions = new JsonSerializerOptions();
        fetchSerializerOptions.Converters.Add(new FetchedDataJsonConverter());
    }

    public static byte[] SingleDeviceSerialize(Dictionary<string, string> parameters, bool asynchronous = false) {
        parameters.TryGetValue("target", out string target);
        parameters.TryGetValue("wmi", out string wmi);
        parameters.TryGetValue("kerberos", out string kerberos);
        parameters.TryGetValue("snmp", out string snmp);
        parameters.TryGetValue("portscan", out string portScan);

        if (target is null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        ConcurrentDictionary<string, string[]> data = SingleDevice(target, true, wmi == "true", kerberos == "true", snmp, portScan, asynchronous, CancellationToken.None);

        if (data is null || data.IsEmpty) {
            return "{\"error\":\"Failed to fetch data.\"}"u8.ToArray();
        }

        return JsonSerializer.SerializeToUtf8Bytes(data, fetchSerializerOptions);
    }
    public static async Task<ConcurrentDictionary<string, string[]>> SingleDeviceAsync(string target, bool useDns, bool useWmi, bool useKerberos, string argSnmp, string argPortScan, bool asynchronous, CancellationToken cancellationToken) {
        PingReply reply = null;
        try {
            reply = await new Ping().SendPingAsync(target, 1500);
            if (reply.Status != IPStatus.Success)
                reply = await new Ping().SendPingAsync(target, 1500);
        }
        catch { }

        if (reply?.Status == IPStatus.Success) {
            ConcurrentDictionary<string, string[]> data = SingleDevice(target, useDns, useWmi, useKerberos, argSnmp, argPortScan, asynchronous, cancellationToken);
            return data;
        }

        return null;
    }
    public static ConcurrentDictionary<string, string[]> SingleDevice(string target, bool useDns, bool useWmi, bool useKerberos, string argSnmp, string argPortScan, bool asynchronous, CancellationToken cancellationToken) {
        if (target.Contains(';')) {
            target = target.Split(';')[0].Trim();
        }
        
        bool isIp = IPAddress.TryParse(target, out IPAddress ipAddress);

        string hostname = null;
        IPAddress[] ipList = Array.Empty<IPAddress>();

        if (isIp) {
            ipList = new IPAddress[] { ipAddress };
            try {
                hostname = Dns.GetHostEntry(target).HostName;
            }
            catch { }
        }
        else {
            hostname = target;
            try {
                ipList = Dns.GetHostAddresses(target).Where(o => !IPAddress.IsLoopback(o)).ToArray();
            }
            catch { }
        }

        if (ipList.Length == 0) {
            return null;
        }

        Dictionary<string, string> wmi = new Dictionary<string, string>();
        Dictionary<string, string> ad = new Dictionary<string, string>();
        string netbios = Protocols.NetBios.GetBiosName(ipList.First()?.ToString());
        string portscan = string.Empty;

        Thread tWmi = null, tSnmp = null, tAd = null, tPortscan = null;

        if (useWmi) {
            tWmi = new Thread(() => {
                if (!OperatingSystem.IsWindows()) {
                    return;
                }

                wmi = Protocols.Wmi.WmiFetch(target);

                if (wmi.TryGetValue("owner", out string owner)) {
                    if (owner.IndexOf('\\') > -1) {
                        owner = owner.Split('\\')[1];
                    }
                    SearchResult user = Protocols.Kerberos.GetUser(owner);
                    string fn = string.Empty, sn = string.Empty;

                    if (user is not null && user.Properties["givenName"].Count > 0)
                        fn = user.Properties["givenName"][0].ToString();

                    if (user is not null && user.Properties["sn"].Count > 0)
                        sn = user.Properties["sn"][0].ToString();

                    string fullname = $"{fn} {sn}".Trim();
                    if (!String.IsNullOrEmpty(fullname)) {
                        wmi.Add("owner name", fullname);
                    }
                }
            });
        }

        if (argSnmp is not null) {
            tSnmp = new Thread(() => {

            });
        }

        if (useKerberos) {
            tAd = new Thread(() => {
                if (!OperatingSystem.IsWindows()) return;

                if (hostname is null) return;

                SearchResult result = Protocols.Kerberos.GetWorkstation(hostname);
                if (result is null) return;

                if (result.Properties["description"].Count > 0) {
                    string value = result.Properties["description"][0].ToString();
                    if (value.Length > 0) ad.Add("description", value);
                }

                if (result.Properties["distinguishedName"].Count > 0) {
                    string value = result.Properties["distinguishedName"][0].ToString();
                    if (value.Length > 0) ad.Add("distinguished name", value);
                }

                if (result.Properties["dNSHostName"].Count > 0) {
                    string value = result.Properties["dNSHostName"][0].ToString();
                    if (value.Length > 0) ad.Add("fqdn", value);
                }

                if (result.Properties["operatingSystem"].Count > 0) {
                    string value = result.Properties["operatingSystem"][0].ToString();
                    if (value.Length > 0) ad.Add("operating system", value);
                }

                if (result.Properties["whenCreated"].Count > 0) {
                    string value = result.Properties["whenCreated"][0].ToString();
                    if (value.Length > 0) ad.Add("created on dc", value);
                }

                /*if (result.Properties["whenChanged"].Count > 0) {
                    string value = result.Properties["whenChanged"][0].ToString();
                    if (value.Length > 0) ad.Add("CHANGED ON DC", value);
                }*/

                ad.Add("guid", new Guid((byte[])result.Properties["objectGuid"][0]).ToString());
            });
        }

        if (argPortScan is not null) {
            tPortscan = new Thread(() => {
                if (argPortScan is null) return;

                short[] portsPool = argPortScan == "full" ? PortScan.BASIC_PORTS : PortScan.BASIC_PORTS;

                bool[] ports = PortScan.PortsScanAsync(target, portsPool).Result;

                for (int i = 0; i < portsPool.Length; i++) {
                    if (ports[i]) {
                        portscan += $"{portsPool[i]}; ";
                    }
                }

                if (portscan.EndsWith("; ")) {
                    portscan = portscan[..^2];
                }
            });
        }

        if (asynchronous) {
            tWmi?.Start();
            tSnmp?.Start();
            tAd?.Start();
            tPortscan?.Start();

            tWmi?.Join();
            tSnmp?.Join();
            tAd?.Join();
            tPortscan?.Join();

        }
        else {
            tWmi?.Start();
            tWmi?.Join();
            if (cancellationToken.IsCancellationRequested)
                return null;

            tSnmp?.Start();
            tSnmp?.Join();
            if (cancellationToken.IsCancellationRequested)
                return null;

            tAd?.Start();
            tAd?.Join();
            if (cancellationToken.IsCancellationRequested)
                return null;

            tPortscan?.Start();
            tPortscan?.Join();
            if (cancellationToken.IsCancellationRequested)
                return null;
        }

        ConcurrentDictionary<string, string[]> data = new ConcurrentDictionary<string, string[]>();

        foreach (KeyValuePair<string, string> o in wmi) {
            data.TryAdd(o.Key, new string[] { o.Value.ToString(), "WMI", string.Empty });
        }

        foreach (KeyValuePair<string, string> o in ad) {
            string key = o.Key.ToString();

            if (key == "operating system") { //os not found in ad, use wmi
                if (!wmi.ContainsKey("operating system")) {
                    data.TryAdd(o.Key, new string[] { o.Value.ToString(), "Kerberos", string.Empty });
                }
            }
            else {
                data.TryAdd(o.Key, new string[] { o.Value.ToString(), "Kerberos", string.Empty });
            }
        }

        if (portscan.Length > 0) {
            data.TryAdd("ports", new string[] { portscan, "Port-scan", string.Empty });
        }

        if (wmi.TryGetValue("mac address", out string mac)) {
            mac = mac.Split(';')[0].Trim();
        }
        else {
            mac = Protocols.Arp.ArpRequest(target);
            if (mac is not null && mac.Length > 0) {
                data.TryAdd("mac address", new string[] { mac, "ARP", string.Empty });
            }
        }

        if (!wmi.ContainsKey("manufacturer") && mac.Length > 0) {
            byte[] manufacturerArray = MacLookup.Lookup(mac);
            if (manufacturerArray is not null) {
                string manufacturer = Encoding.UTF8.GetString(manufacturerArray);
                if (manufacturer.Length > 0 && manufacturer != "not found") {
                    data.TryAdd("manufacturer", new string[] { manufacturer, "MAC lookup", string.Empty });
                }
            }
        }

        if (!wmi.ContainsKey("hostname")) {
            if (netbios is not null && netbios.Length > 0) { //use netbios
                data.TryAdd("hostname", new string[] { netbios, "NetBIOS", string.Empty });
            }
            else if (useDns && hostname is not null && hostname.Length > 0) { //use dns
                data.TryAdd("hostname", new string[] { hostname, "DNS", string.Empty });
            }
        }

        if (!data.ContainsKey("ip") && ipList is not null) {
            data.TryAdd("ip", new string[] { string.Join("; ", ipList.Select(o => o.ToString())), "IP", string.Empty });
        }

        if (!data.ContainsKey("type")) {
            if (data.TryGetValue("operating system", out string[] value)) {
                string os = value[0];
                if (os.Contains("server", StringComparison.CurrentCultureIgnoreCase)) { //if os is windows server, set type as server
                    data.TryAdd("type", new string[] { "Server", "Kerberos", string.Empty });
                }
            }
        }

        if (!data.ContainsKey("location")) {
            for (int i = 0; i < ipList.Length; i++) {
                byte[] bytes = ipList[i].GetAddressBytes();
                ulong ipNumber = ((ulong)bytes[0] << 24) + ((ulong)bytes[0] << 16) + ((ulong)bytes[0] << 8) + bytes[0];
                if (ipNumber >= 2130706432 && ipNumber <= 2147483647) continue; //127.0.0.0 <> 127.255.255.255
                if (ipNumber >= 167772160 && ipNumber >= 184549375)   continue;   //10.0.0.0 <> 10.255.255.255
                if (ipNumber >= 2886729728 && ipNumber >= 2887778303) continue; //172.16.0.0 <> 172.31.255.255
                if (ipNumber >= 3232235520 && ipNumber >= 3232301055) continue; //192.168.0.0 <> 192.168.255.255
                if (ipNumber >= 2851995648 && ipNumber >= 184549375)  continue;  //169.254.0.0 <> 169.254.255.255
                if (ipNumber >= 3758096384)                           continue; // > 224.0.0.0

                string ipLocation = Encoding.UTF8.GetString(LocateIp.Locate(ipAddress?.ToString(), true));
                if (ipLocation is null) continue;
                data.TryAdd("location", new string[] { ipLocation, "Locate IP", string.Empty });
            }
        }

        /*if (!hash.ContainsKey("type") && !gateways is not null) {
            for (int i = 0; i < gateways.Length; i++)
                if (gateways.Count(o => o.ToString() == ip) > 0) {
                    hash.Add("type", new string[] { "Router", "IP", String.Empty });
                    break;
                }
        }*/

        //if no type found, try to guess from ports
        if (!data.ContainsKey("type") && portscan.Length > 0) {
            int[] ports = portscan.Split(';').Select(o => int.Parse(o.Trim())).ToArray();

            if (ports.Contains(445) && ports.Contains(3389) && (ports.Contains(53) || ports.Contains(67) || ports.Contains(389) || ports.Contains(636) || ports.Contains(853))) { //SMB, RDP, DNS, DHCP, LDAP
                data.TryAdd("type", new string[] { "Server", "Port-scan", string.Empty });
            }
            else if (ports.Contains(445) && ports.Contains(3389)) { //SMB, RDP
                data.TryAdd("type", new string[] { "Workstation", "Port-scan", string.Empty });
            }
            else if (ports.Contains(515) || ports.Contains(631) || ports.Contains(9100)) { //LPD, IPP, Print-server
                data.TryAdd("type", new string[] { "Printer", "Port-scan", string.Empty });
            }
            else if (ports.Contains(6789) || ports.Contains(10001)) { //ap
                data.TryAdd("type", new string[] { "Access point", "Port-scan", string.Empty });
            }
            else if (ports.Contains(7442) || ports.Contains(7550)) { //cam
                data.TryAdd("type", new string[] { "Camera", "Port-scan", string.Empty });
            }
        }

        if (!data.ContainsKey("type") && wmi.Count > 0) {
            data.TryAdd("type", new string[] { "Workstation", "WMI", string.Empty });
        }

        if (cancellationToken.IsCancellationRequested) return null;

        return data;
    }

    public static byte[] SingleUserSerialize(Dictionary<string, string> parameters) {
        parameters.TryGetValue("target", out string target);

        if (target is null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        ConcurrentDictionary<string, string[]> data = SingleUser(target);

        if (data is null || data.IsEmpty) {
            return "{\"error\":\"Failed to fetch data.\"}"u8.ToArray();
        } 

        return JsonSerializer.SerializeToUtf8Bytes(data, fetchSerializerOptions);
    }
    public static ConcurrentDictionary<string, string[]> SingleUser(string target) {
        if (!OperatingSystem.IsWindows())
            return null;

        Dictionary<string, string> fetch = Protocols.Kerberos.AdFetch(target);
        if (fetch is null) {
            return null;
        }

        ConcurrentDictionary<string, string[]> data = new ConcurrentDictionary<string, string[]>();

        foreach (KeyValuePair<string, string> o in fetch) {
            data.TryAdd(o.Key, new string[] { o.Value.ToString(), "Kerberos", string.Empty });
        }

        return data;
    }

    public static byte[] DevicesTask(Dictionary<string, string> parameters, string origin) {
        if (parameters is null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        parameters.TryGetValue("range", out string range);
        parameters.TryGetValue("domain", out string domain);

        parameters.TryGetValue("dns", out string dns);
        parameters.TryGetValue("wmi", out string wmi);
        parameters.TryGetValue("kerberos", out string kerberos);
        parameters.TryGetValue("snmp", out string snmp);
        parameters.TryGetValue("portscan", out string portscan);
        parameters.TryGetValue("retries", out string retries);
        parameters.TryGetValue("interval", out string interval);

        string[] hosts;

        if (range is not null) {
            string[] split = range.Split('-');
            if (split.Length != 2)
                return Data.CODE_INVALID_ARGUMENT.Array;
            if (split[0] is null || split[1] is null)
                return Data.CODE_INVALID_ARGUMENT.Array;

            byte[] arrFrom = IPAddress.Parse(split[0]).GetAddressBytes();
            byte[] arrTo = IPAddress.Parse(split[1]).GetAddressBytes();
            Array.Reverse(arrFrom);
            Array.Reverse(arrTo);

            uint intFrom = BitConverter.ToUInt32(arrFrom, 0);
            uint intTo = BitConverter.ToUInt32(arrTo, 0);
            if (intFrom > intTo)
                return Data.CODE_INVALID_ARGUMENT.Array;

            hosts = new string[intTo - intFrom + 1];

            for (uint i = intFrom; i < intTo + 1 && i < uint.MaxValue - 1; i++) {
                byte[] bytes = BitConverter.GetBytes(i);
                Array.Reverse(bytes);
                hosts[i - intFrom] = string.Join(".", bytes);
            }
        }
        else if (domain is not null) {
            hosts = OperatingSystem.IsWindows() ? Protocols.Kerberos.GetAllWorkstations(domain) : Array.Empty<string>();
            if (hosts is null) return Data.CODE_FAILED.Array;
        }
        else if (parameters.ContainsKey("update")) {
            List<string> gist = new List<string>();
            foreach (Database.Entry entry in DatabaseInstances.devices.dictionary.Values) {
                entry.attributes.TryGetValue("ip", out Database.Attribute ip);
                entry.attributes.TryGetValue("hostname", out Database.Attribute hostname);
                if (ip is not null) {
                    gist.Add(ip.value);
                    continue;
                }
                else if (hostname is not null) {
                    gist.Add(hostname.value);
                    continue;
                }
            }
            hosts = gist.ToArray();
        }
        else {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        return DevicesTask(
            hosts,
            dns == "true",
            wmi == "true",
            kerberos == "true",
            snmp,
            portscan,
            int.Parse(retries),

            float.Parse(interval) switch {
                0 => .5f,
                1 => 1,
                2 => 2,
                3 => 4,
                4 => 6,
                5 => 8,
                6 => 12,
                7 => 24,
                8 => 48,
                _ => 0
            },

            origin);
    }
    public static byte[] DevicesTask(string[] hosts, bool dns, bool wmi, bool kerberos, string snmp, string portscan, int retries, float interval, string origin) {
        if (task is not null) return Data.CODE_OTHER_TASK_IN_PROGRESS.Array;
        if (result is not null) return Data.CODE_OTHER_TASK_IN_PROGRESS.Array;

        int totalFetched = 0;
        int totalRetries = 0;

        Thread thread = new Thread(async () => {
            const int WINDOW = 32;
            ConcurrentDictionary<string, ConcurrentDictionary<string, string[]>> dataset = new ConcurrentDictionary<string, ConcurrentDictionary<string, string[]>>();

            task.status = TaskWrapper.TaskStatus.running;

            List<string> queue = new List<string>(hosts);
            List<string> redo = new List<string>();

            while (!task.cancellationToken.IsCancellationRequested) {

                while (queue.Count > 0) {
                    int size = Math.Min(WINDOW, queue.Count);

                    List<Task<ConcurrentDictionary<string, string[]>>> tasks = new List<Task<ConcurrentDictionary<string, string[]>>>();
                    for (int i = 0; i < size; i++) {
                        tasks.Add(SingleDeviceAsync(queue[i], dns, wmi, kerberos, snmp, portscan, false, task.cancellationToken));
                    }

                    ConcurrentDictionary<string, string[]>[] result = await Task.WhenAll(tasks);

                    if (task.cancellationToken.IsCancellationRequested) {
                        break;
                    }

                    for (int i = 0; i < size; i++) {
                        if (result[i] is null) { //unreachable
                            redo.Add(queue[i]);
                        }
                        else if (!result[i].IsEmpty)
                        {
                            task.CompletedSteps = ++totalFetched;
                            if (dataset.ContainsKey(queue[i])) {
                                continue;
                            }
                            dataset.TryAdd(queue[i], result[i]);
                        }
                    }

                    queue.RemoveRange(0, size);
                }

                if (task.cancellationToken.IsCancellationRequested) {
                    break;
                }

                (redo, queue) = (queue, redo);

                if (retries > totalRetries++ && queue.Count > 0) {
                    long wait0 = DateTime.UtcNow.Ticks;
                    task.status = TaskWrapper.TaskStatus.idle;

                    KeepAlive.Broadcast($"{{\"action\":\"update-fetch\",\"type\":\"devices\",\"task\":{Encoding.UTF8.GetString(Status())}}}", "/fetch/status");

                    task.Sleep((int)(interval * 3_600_000));
                    if (task.cancellationToken.IsCancellationRequested) {
                        break;
                    }

                    task.status = TaskWrapper.TaskStatus.running;

                    KeepAlive.Broadcast($"{{\"action\":\"update-fetch\",\"type\":\"devices\",\"task\":{Encoding.UTF8.GetString(Status())}}}", "/fetch/status");
                }
                else {
                    break;
                }
            }

            if (task.cancellationToken.IsCancellationRequested) {
                KeepAlive.Broadcast("{\"action\":\"abort-fetch\",\"type\":\"devices\"}"u8.ToArray(), "/fetch/status");
                Logger.Action(origin, "Devices fetch task aborted");

                task.Dispose();
                task = null;
                return;
            }

            result = new Result() {
                name = task.name,
                type = Type.devices,
                started = task.started,
                finished = DateTime.UtcNow.Ticks,
                dataset = dataset,
                successful = task.CompletedSteps,
                unsuccessful = task.TotalSteps - task.CompletedSteps,
            };

            KeepAlive.Broadcast($"{{\"action\":\"finish-fetch\",\"type\":\"devices\",\"task\":{Encoding.UTF8.GetString(Status())}}}", "/fetch/status");
            Logger.Action(origin, "Fetch task finished");
        });

        KeepAlive.Broadcast("{\"action\":\"start-fetch\",\"type\":\"devices\"}"u8.ToArray(), "/fetch/status");
        Logger.Action(origin, "Devices fetch task started");

        task = new TaskWrapper("Fetch devices") {
            thread = thread,
            origin = origin,
            TotalSteps = hosts.Length,
            CompletedSteps = 0
        };
        task.thread.Start();

        return Data.CODE_OK.Array;
    }

    public static byte[] UsersTask(Dictionary<string, string> parameters, string origin) {
        if (parameters is null) {
            return Data.CODE_INVALID_ARGUMENT.ToArray();
        }

        if (parameters.ContainsKey("update")) {
            List<string> users = new List<string>();
            foreach (Database.Entry entry in DatabaseInstances.users.dictionary.Values) {
                if (!entry.attributes.TryGetValue("type", out Database.Attribute type)) continue;
                if (!entry.attributes.TryGetValue("username", out Database.Attribute username)) continue;
                if (type.value != "Domain user") continue;
                if (username.value is null) continue;
                users.Add(username.value);
            }
            return UsersTask(users.ToArray(), origin);
        }
        else if (parameters.TryGetValue("domain", out string domain)) {
            if (domain is null) {
                return Data.CODE_INVALID_ARGUMENT.ToArray();
            }

            string[] users = OperatingSystem.IsWindows() ? Protocols.Kerberos.GetAllUsers(domain) : Array.Empty<string>();
            if (users is null)
                return Data.CODE_FAILED.Array;
            return UsersTask(users, origin);
        }

        return Data.CODE_INVALID_ARGUMENT.ToArray();
    }
    public static byte[] UsersTask(string[] users, string origin) {
        if (task is not null) return Data.CODE_OTHER_TASK_IN_PROGRESS.Array;
        if (result is not null) return Data.CODE_OTHER_TASK_IN_PROGRESS.Array;

        Thread thread = new Thread(() => {
            long lastBroadcast = DateTime.UtcNow.Ticks;
            ConcurrentDictionary<string, ConcurrentDictionary<string, string[]>> dataset = new ConcurrentDictionary<string, ConcurrentDictionary<string, string[]>>();

            task.status = TaskWrapper.TaskStatus.running;

            for (int i = 0; i < users.Length; i++) {
                ConcurrentDictionary<string, string[]> hash = SingleUser(users[i]);
                task.CompletedSteps++;

                dataset.TryAdd(users[i], hash);

                if (task.cancellationToken.IsCancellationRequested) {
                    break;
                }

                if (DateTime.UtcNow.Ticks - lastBroadcast > 30_000_000) { //after 3 seconds
                    KeepAlive.Broadcast($"{{\"action\":\"update-fetch\",\"type\":\"users\",\"task\":{Encoding.UTF8.GetString(Status())}}}", "/fetch/status");
                    lastBroadcast = DateTime.UtcNow.Ticks;
                }
            }

            result = new Result() {
                name = task.name,
                type = Type.users,
                started = task.started,
                finished = DateTime.UtcNow.Ticks,
                dataset = dataset,
                successful = task.CompletedSteps,
                unsuccessful = task.TotalSteps - task.CompletedSteps,
            };

            KeepAlive.Broadcast($"{{\"action\":\"finish-fetch\",\"type\":\"users\",\"task\":{Encoding.UTF8.GetString(Status())}}}", "/fetch/status");
            Logger.Action(origin, "Users fetch task finished");
        });

        KeepAlive.Broadcast("{\"action\":\"start-fetch\",\"type\":\"users\"}"u8.ToArray(), "/fetch/status");
        Logger.Action(origin, "Users fetch task started");

        task = new TaskWrapper("Fetch users") {
            thread = thread,
            origin = origin,
            TotalSteps = users.Length,
            CompletedSteps = 0
        };
        task.thread.Start();

        return Data.CODE_OK.Array;
    }

    public static byte[] Status() {
        if (result is not null) {
            StringBuilder response = new StringBuilder();

            response.Append('{');
            response.Append($"\"name\":\"{Data.EscapeJsonText(result?.name)}\",");
            response.Append($"\"type\":\"{result?.type}\",");
            response.Append($"\"status\":\"pending\",");
            response.Append($"\"started\":\"{result?.started}\",");
            response.Append($"\"finished\":\"{result?.finished}\",");
            response.Append($"\"successful\":\"{Data.EscapeJsonText(result?.successful.ToString())}\",");
            response.Append($"\"unsuccessful\":\"{Data.EscapeJsonText(result?.unsuccessful.ToString())}\"");
            response.Append('}');

            return Encoding.UTF8.GetBytes(response.ToString());
        }

        if (task is not null) {
            StringBuilder response = new StringBuilder();

            if (task.cancellationToken.IsCancellationRequested) {
                response.Append('{');
                response.Append($"\"name\":\"{Data.EscapeJsonText(task.name)}\",");
                response.Append($"\"status\":\"canceling\",");
                response.Append($"\"started\":\"{task.started}\",");
                response.Append($"\"completed\":\"{Data.EscapeJsonText(task.CompletedSteps.ToString())}\",");
                response.Append($"\"total\":\"{Data.EscapeJsonText(task.TotalSteps.ToString())}\",");
                response.Append($"\"etc\":\"{Data.EscapeJsonText(task.CalculateEtc())}\"");
                response.Append('}');
                return Encoding.UTF8.GetBytes(response.ToString());
            }

            response.Append('{');
            response.Append($"\"name\":\"{Data.EscapeJsonText(task.name)}\",");
            response.Append($"\"status\":\"{Data.EscapeJsonText(task.status.ToString())}\",");
            response.Append($"\"started\":\"{task.started}\",");
            response.Append($"\"completed\":\"{Data.EscapeJsonText(task.CompletedSteps.ToString())}\",");
            response.Append($"\"total\":\"{Data.EscapeJsonText(task.TotalSteps.ToString())}\",");
            response.Append($"\"etc\":\"{Data.EscapeJsonText(task.CalculateEtc())}\"");
            response.Append('}');
            return Encoding.UTF8.GetBytes(response.ToString());
        }

        return "{\"status\":\"none\"}"u8.ToArray();
    }

    public static byte[] CancelTask(string origin) {
        if (task is null) return Data.CODE_TASK_DONT_EXITSTS.Array;

        KeepAlive.Broadcast("{\"action\":\"cancel-fetch\",\"type\":\"devices\"}"u8.ToArray(), "/fetch/status");
        task.RequestCancel(origin);
        //wrapper = null;

        return Data.CODE_OK.Array;
    }

    public static byte[] ApproveLastTask(Dictionary<string, string> parameters, string origin) {
        if (result is null) return Data.CODE_TASK_DONT_EXITSTS.Array;

        parameters.TryGetValue("condition", out string targetAttribute);
        parameters.TryGetValue("action", out string action);

        Database.SaveMethod saveMethod = action switch {
            "0" => Database.SaveMethod.ignore,
            "2" => Database.SaveMethod.overwrite,
            "3" => Database.SaveMethod.append,
            "4" => Database.SaveMethod.merge,
            _ => Database.SaveMethod.createnew
        };

        Database database;

        if (result?.type == Type.devices) {
            Logger.Action(origin, "Approve fetched devices");
            KeepAlive.Broadcast("{\"action\":\"approve-fetch\",\"type\":\"devices\"}"u8.ToArray(), "/fetch/status");

            database = DatabaseInstances.devices;
        }
        else if (result?.type == Type.users) {
            Logger.Action(origin, "Approve fetched users");
            KeepAlive.Broadcast("{\"action\":\"approve-fetch\",\"type\":\"users\"}"u8.ToArray(), "/fetch/status");

            database = DatabaseInstances.users;
        }
        else {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        Dictionary<string, string> values = new Dictionary<string, string>();

        foreach (KeyValuePair<string, Database.Entry> entry in database.dictionary) {
            if (!entry.Value.attributes.TryGetValue(targetAttribute, out Database.Attribute attribute)) continue;

            string[] key = attribute.value.Split(';').Select(o => o.Trim().ToLower()).ToArray();

            for (int i = 0; i < key.Length; i++) {
                if (key[i].Length == 0)
                    continue;
                if (values.ContainsKey(key[i]))
                    continue;
                values.Add(key[i], entry.Value.filename);
            }
        }

        long date = DateTime.UtcNow.Ticks;

        foreach (KeyValuePair<string, ConcurrentDictionary<string, string[]>> pair in result?.dataset) {
            ConcurrentDictionary<string, Database.Attribute> attributes = new ConcurrentDictionary<string, Database.Attribute>();
            foreach (KeyValuePair<string, string[]> attr in pair.Value) {
                attributes.TryAdd(attr.Key, new Database.Attribute() {
                    value = attr.Value[0],
                    date = date,
                    origin = origin,
                });
            }

            if (pair.Value.TryGetValue(targetAttribute, out string[] targetValue)) {
                if (values.TryGetValue(targetValue[0], out string file)) {
                    database.Save(file, attributes, saveMethod, origin);
                }
            }
            else {
                database.Save(null, attributes, saveMethod, origin);
            }
        }

        values.Clear();

        if (result?.type == Type.devices) {
            KeepAlive.Broadcast("{\"action\":\"approve-fetch\",\"type\":\"devices\"}"u8.ToArray(), "/fetch/status");
            Logger.Action(origin, "Devices fetched data approved");
        }
        else if (result?.type == Type.users) {
            KeepAlive.Broadcast("{\"action\":\"approve-fetch\",\"type\":\"users\"}"u8.ToArray(), "/fetch/status");
            Logger.Action(origin, "Users fetched data approved");
        }


        result = null;
        task = null;
        return Data.CODE_OK.Array;
    }

    public static byte[] DiscardLastTask(string origin) {
        KeepAlive.Broadcast("{\"action\":\"discard-fetch\",\"type\":\"devices\"}"u8.ToArray(), "/fetch/status");
        Logger.Action(origin, "Discard fetched data");

        result = null;
        task = null;
        return Data.CODE_OK.Array;
    }

    public static byte[] ImportTask(Dictionary<string, string> parameters, string origin) {
        if (parameters is null) {
            return Data.CODE_INVALID_ARGUMENT.ToArray();
        }

        parameters.TryGetValue("ip", out string ip);
        parameters.TryGetValue("port", out string port);
        parameters.TryGetValue("protocol", out string protocol);
        parameters.TryGetValue("username", out string username);
        parameters.TryGetValue("password", out string password);
        parameters.TryGetValue("devices", out string importDevices);
        parameters.TryGetValue("users", out string importUsers);
        parameters.TryGetValue("debitnotes", out string importDebitNotes);

        IPAddress ipAddress = IPAddress.Parse(ip);
        if (!IPAddress.IsLoopback(ipAddress)) {
            return "{\"error\":\"Please prefer to import data on the same host, via the loopback address, to avoid information exposure.\"}"u8.ToArray();
        }

        bool fetchDevices = importDevices?.Equals("true") ?? false;
        bool fetchUsers = importUsers?.Equals("true") ?? false;
        bool fetchDebitNotes = importDebitNotes?.Equals("true") ?? false;

        string sessionid = null;
        float version = 0f;

        Uri uri = new Uri($"{protocol}://{ip}:{port}");

        ServicePointManager.ServerCertificateValidationCallback = (message, cert, chain, errors) => { return true; };

        try {
            using HttpClient versionClient = new HttpClient();
            versionClient.BaseAddress = uri;
            versionClient.DefaultRequestHeaders.UserAgent.Add(new System.Net.Http.Headers.ProductInfoHeaderValue("pro-test", "5.0"));
            versionClient.DefaultRequestHeaders.Accept.Add(new System.Net.Http.Headers.MediaTypeWithQualityHeaderValue("*/*"));

            HttpResponseMessage versionResponse;
            try {
                versionResponse = versionClient.GetAsync("/version").Result; //ver. 5

                if (versionResponse.StatusCode == HttpStatusCode.NotFound) {
                    version = 3.2f;
                }
                else {
                    string[] ver = versionResponse.Content.ReadAsStringAsync().Result
                                   .Replace("{", string.Empty)
                                   .Replace("}", string.Empty)
                                   .Replace("\"", string.Empty)
                                   .Replace(" ", string.Empty)
                                   .Split(',');

                    string major = "0", minor = "0";
                    for (int i = 0; i < ver.Length; i++) {
                        if (ver[i].StartsWith("major:"))
                            major = ver[i][6..];
                        if (ver[i].StartsWith("minor:"))
                            minor = ver[i][6..];
                    }
                    version = float.Parse($"{major}.{minor}");
                }

                versionResponse.Headers.TryGetValues("Set-Cookie", out IEnumerable<string> cookies);

                if (cookies is not null) {
                    foreach (string cookie in cookies) {
                        string[] cookieSplit = cookie.Split(';');
                        for (int i = 0; i < cookieSplit.Length; i++) {
                            if (cookieSplit[i].StartsWith("sessionid=")) {
                                sessionid = cookieSplit[i][10..];
                                break;
                            }
                        }
                    }
                }

            }
            catch (HttpRequestException ex) {
                Logger.Error(ex);
                return Encoding.UTF8.GetBytes($"{{\"error\":\"{Data.EscapeJsonText(ex.Message)}\"}}");
            }
            catch (ArgumentNullException ex) {
                Logger.Error(ex);
                return Encoding.UTF8.GetBytes($"{{\"error\":\"{Data.EscapeJsonText(ex.Message)}\"}}");
            }
            catch (InvalidOperationException ex) {
                Logger.Error(ex);
                return Encoding.UTF8.GetBytes($"{{\"error\":\"{Data.EscapeJsonText(ex.Message)}\"}}");
            }
            catch (Exception ex) {
                Logger.Error(ex);
                return Encoding.UTF8.GetBytes($"{{\"error\":\"{Data.EscapeJsonText(ex.Message)}\"}}");
            }

        }
        catch (Exception ex) {
            return Encoding.UTF8.GetBytes($"{{\"error\":\"{Data.EscapeJsonText(ex.Message)}\"}}");
        }

        CookieContainer cookieContainer = new CookieContainer();
        if (sessionid is not null) {
            cookieContainer.Add(new Cookie() {
                Name = "sessionid",
                Value = sessionid,
                Domain = ip
            });
        }

        if (version < 4f || version > 6f) {
            Logger.Error("Remote host is running an unsupported version");
            return "{\"error\":\"Remote host is running an unsupported version\"}"u8.ToArray();
        }

        if (fetchDevices) {
            Logger.Action(origin, $"Importing devices from {ip}");
            if (version >= 4f && version < 5f) {
                ImportDevicesV4(uri, cookieContainer);
            }
            else if (version >= 5f && version < 6f) {
                ImportDevicesV5(uri, cookieContainer);
            }
        }

        if (fetchUsers) {
            Logger.Action(origin, $"Importing users from {ip}");
            if (version >= 4f && version < 5f) {
                ImportUsersV4(uri, cookieContainer);
            }
            else if (version >= 5f && version < 6f) {
                ImportUsersV5(uri, cookieContainer);
            }
        }

        if (fetchDebitNotes) {
            Logger.Action(origin, $"Importing users from {ip}");
            if (version >= 4f && version < 5f) {
                ImportDebitNotesV4(uri, cookieContainer);
            }
            else if (version >= 5f && version < 6f) {
                ImportDebitNotesV5(uri, cookieContainer);
            }
        }

        GC.Collect();

        return Data.CODE_OK.Array;
    }

    public static void ImportDevicesV4(Uri uri, CookieContainer cookieContainer) {
        using HttpClientHandler handler = new HttpClientHandler();
        handler.CookieContainer = cookieContainer;

        using HttpClient client = new HttpClient(handler);
        client.BaseAddress = uri;
        client.DefaultRequestHeaders.UserAgent.Add(new System.Net.Http.Headers.ProductInfoHeaderValue("pro-test", "5.0"));
        client.DefaultRequestHeaders.Accept.Add(new System.Net.Http.Headers.MediaTypeWithQualityHeaderValue("*/*"));

        Task<HttpResponseMessage> res = client.GetAsync("db/getequiptable");
        string payload = res.Result.Content.ReadAsStringAsync().Result;
        string[] split = payload.Split((char)127);

        long filenameCount = DateTime.UtcNow.Ticks;
        long initDate = DateTime.UtcNow.Ticks;

        int i = 1;
        while (i < split.Length) {
            if (int.TryParse(split[i], out int len)) {
                string filename = null;
                ConcurrentDictionary<string, Database.Attribute> attributes = new ConcurrentDictionary<string, Database.Attribute>();

                for (int j = i + 1; j < i + len * 4; j += 4) {
                    if (split[j] == ".FILENAME") {
                        filename = split[j + 1];
                        continue;
                    }

                    string name = split[j].ToLower();
                    string value = split[j + 1];
                    long date;
                    string origin;

                    string[] originSplit = split[j + 2].Split(",").Select(o => o.Trim()).ToArray();
                    if (originSplit.Length == 1) {
                        origin = originSplit[0];
                        date = initDate;
                    }
                    else if (originSplit.Length >= 2) {
                        origin = originSplit[0];
                        string[] dateSplit = originSplit[1].Split("-");
                        if (dateSplit.Length == 3) {
                            int year = int.Parse(dateSplit[2]);
                            int month = int.Parse(dateSplit[1]);
                            int day = int.Parse(dateSplit[0]);
                            date = new DateTime(year, month, day).Ticks;
                        }
                        else {
                            date = initDate;
                        }
                    }
                    else {
                        origin = "Import task";
                        date = initDate;
                    }

                    attributes.TryAdd(name, new Database.Attribute() {
                        value = value,
                        date = date,
                        origin = origin
                    });
                }

                foreach (KeyValuePair<string, Database.Attribute> attr in attributes) {
                    if (attr.Key.Contains("password") && filename is not null) {
                        string password = GetHiddenAttribute(uri, cookieContainer, $"db/getequiprop&file={filename}&property={attr.Key.ToUpper()}");
                        attributes[attr.Key].value = password;
                    }
                }

                DatabaseInstances.devices.Save((++filenameCount).ToString("x"), attributes, Database.SaveMethod.createnew, "Import task");
            }

            i += 1 + len * 4;
        }
    }

    public static void ImportUsersV4(Uri uri, CookieContainer cookieContainer) {
        using HttpClientHandler handler = new HttpClientHandler();
        handler.CookieContainer = cookieContainer;

        using HttpClient client = new HttpClient(handler);
        client.BaseAddress = uri;
        client.DefaultRequestHeaders.UserAgent.Add(new System.Net.Http.Headers.ProductInfoHeaderValue("pro-test", "5.0"));
        client.DefaultRequestHeaders.Accept.Add(new System.Net.Http.Headers.MediaTypeWithQualityHeaderValue("*/*"));

        Task<HttpResponseMessage> res = client.GetAsync("db/getuserstable");
        string payload = res.Result.Content.ReadAsStringAsync().Result;
        string[] split = payload.Split((char)127);

        long filenameCount = DateTime.UtcNow.Ticks;
        long initDate = DateTime.UtcNow.Ticks;

        int i = 1;
        while (i < split.Length) {
            if (int.TryParse(split[i], out int len)) {
                string filename = null;
                ConcurrentDictionary<string, Database.Attribute> attributes = new ConcurrentDictionary<string, Database.Attribute>();

                for (int j = i + 1; j < i + len * 4; j += 4) {
                    if (split[j] == ".FILENAME") {
                        filename = split[j + 1];
                        continue;
                    }

                    string name = split[j].ToLower();
                    string value = split[j + 1];
                    long date;
                    string origin;

                    string[] originSplit = split[j + 2].Split(",").Select(o => o.Trim()).ToArray();
                    if (originSplit.Length == 1) {
                        origin = originSplit[0];
                        date = initDate;
                    }
                    else if (originSplit.Length >= 2) {
                        origin = originSplit[0];
                        string[] dateSplit = originSplit[1].Split("-");
                        if (dateSplit.Length == 3) {
                            int year = int.Parse(dateSplit[2]);
                            int month = int.Parse(dateSplit[1]);
                            int day = int.Parse(dateSplit[0]);
                            date = new DateTime(year, month, day).Ticks;
                        }
                        else {
                            date = initDate;
                        }
                    }
                    else {
                        origin = "Import task";
                        date = initDate;
                    }

                    attributes.TryAdd(name, new Database.Attribute() {
                        value = value,
                        date = date,
                        origin = origin
                    });
                }

                foreach (KeyValuePair<string, Database.Attribute> attr in attributes) {
                    if (attr.Key.Contains("password") && filename is not null) {
                        string password = GetHiddenAttribute(uri, cookieContainer, $"db/getuserprop&file={filename}&property={attr.Key.ToUpper()}");
                        attributes[attr.Key].value = password;
                    }
                }

                DatabaseInstances.users.Save((++filenameCount).ToString("x"), attributes, Database.SaveMethod.createnew, "Import task");
            }

            i += 1 + len * 4;
        }
    }

    private static void ImportDebitNotesV4(Uri uri, CookieContainer cookieContainer) {
        using HttpClientHandler handler = new HttpClientHandler();
        handler.CookieContainer = cookieContainer;

        using HttpClient client = new HttpClient(handler);
        client.BaseAddress = uri;
        client.DefaultRequestHeaders.UserAgent.Add(new System.Net.Http.Headers.ProductInfoHeaderValue("pro-test", "5.0"));
        client.DefaultRequestHeaders.Accept.Add(new System.Net.Http.Headers.MediaTypeWithQualityHeaderValue("*/*"));

        Task<HttpResponseMessage> res = client.GetAsync($"debitnotes/get&keywords=&from=2000-01-01&to={DateTime.Now:yyyy-MM-dd}&filters=111");
        string payload = res.Result.Content.ReadAsStringAsync().Result;
        string[] split = payload.Split((char)127);

        for (int i = 0; i < split.Length - 9; i += 10) {
            string code       = split[i+0];
            string firstname  = split[i+1];
            string lastname   = split[i+2];
            string title      = split[i+3];
            string department = split[i+4];
            string date       = split[i+5];
            string it         = split[i+6];
            string template   = split[i+7];
            string equip      = split[i+8];
            string status     = split[i+9];

            Thread.Sleep(1);

            string[] dateSplit = date.Split('-');
            string[] equipSplit = equip.Split(';');

            StringBuilder builder = new StringBuilder();
            builder.Append('{');

            if (dateSplit.Length == 3) {
                builder.Append($"\"date\":{new DateTime(int.Parse(dateSplit[2]), int.Parse(dateSplit[1]), int.Parse(dateSplit[0])).Ticks.ToString()},");
            }
            else {
                builder.Append($"\"date\":{DateTime.UtcNow.Ticks},");
            }

            builder.Append($"\"status\":\"{status}\",");
            builder.Append($"\"template\":\"{Data.EscapeJsonText(template)}\",");
            builder.Append($"\"banner\":\"default.svg\",");
            builder.Append($"\"firstname\":\"{Data.EscapeJsonText(firstname)}\",");
            builder.Append($"\"lastname\":\"{Data.EscapeJsonText(lastname)}\",");
            builder.Append($"\"title\":\"{Data.EscapeJsonText(title)}\",");
            builder.Append($"\"department\":\"{Data.EscapeJsonText(department)}\",");
            builder.Append($"\"issuer\":\"{Data.EscapeJsonText(it)}\",");

            builder.Append($"\"devices\":[");
            bool first = true;
            for (int j = 0; j < equipSplit.Length - 2; j += 3) {
                if (!first)
                    builder.Append(',');
                builder.Append('{');
                builder.Append($"\"description\":\"{Data.EscapeJsonText(equipSplit[j])}\",");
                builder.Append($"\"model\":\"\",");
                builder.Append($"\"quantity\":{int.Parse(equipSplit[j + 1])},");
                builder.Append($"\"serial\":\"{Data.EscapeJsonText(equipSplit[j + 2])}\"");
                builder.Append('}');
                first = false;
            }
            builder.Append(']');


            builder.Append('}');

            DebitNotes.Create(builder.ToString(), "Import task");
        }
    }

    public static void ImportDevicesV5(Uri uri, CookieContainer cookieContainer) {
        using HttpClientHandler handler = new HttpClientHandler();
        handler.CookieContainer = cookieContainer;

        using HttpClient client = new HttpClient(handler);
        client.BaseAddress = uri;
        client.DefaultRequestHeaders.UserAgent.Add(new System.Net.Http.Headers.ProductInfoHeaderValue("pro-test", "5.0"));
        client.DefaultRequestHeaders.Accept.Add(new System.Net.Http.Headers.MediaTypeWithQualityHeaderValue("*/*"));

        Task<HttpResponseMessage> res = client.GetAsync("/db/device/list");
        byte[] bytes = res.Result.Content.ReadAsByteArrayAsync().Result;

#pragma warning disable CA1869 // Cache and reuse
        JsonSerializerOptions options = new JsonSerializerOptions();
#pragma warning restore CA1869
        options.Converters.Add(new DatabaseJsonConverter("import", $"{Data.DIR_DEVICES}_import", false));
        Database import = JsonSerializer.Deserialize<Database>(bytes, options);

        foreach (Database.Entry entry in import.dictionary.Values) {
            DatabaseInstances.devices.Save(entry.filename, entry.attributes, Database.SaveMethod.createnew, "Import task");
        }
    }

    public static void ImportUsersV5(Uri uri, CookieContainer cookieContainer) {
        using HttpClientHandler handler = new HttpClientHandler();
        handler.CookieContainer = cookieContainer;

        using HttpClient client = new HttpClient(handler);
        client.BaseAddress = uri;
        client.DefaultRequestHeaders.UserAgent.Add(new System.Net.Http.Headers.ProductInfoHeaderValue("pro-test", "5.0"));
        client.DefaultRequestHeaders.Accept.Add(new System.Net.Http.Headers.MediaTypeWithQualityHeaderValue("*/*"));

        Task<HttpResponseMessage> res = client.GetAsync("/db/user/list");
        byte[] bytes = res.Result.Content.ReadAsByteArrayAsync().Result;

#pragma warning disable CA1869 // Cache and reuse
        JsonSerializerOptions options = new JsonSerializerOptions();
#pragma warning restore CA1869
        options.Converters.Add(new DatabaseJsonConverter("import", $"{Data.DIR_USERS}_import", false));
        Database import = JsonSerializer.Deserialize<Database>(bytes, options);

        foreach (Database.Entry entry in import.dictionary.Values) {
            DatabaseInstances.users.Save(entry.filename, entry.attributes, Database.SaveMethod.createnew, "Import task");
        }
    }

    private record DebitParseHelper {
        [JsonPropertyName("file")]
        public string File { get; set; }
        [JsonPropertyName("status")]
        public string Status { get; set; }
        [JsonPropertyName("name")]
        public string Name { get; set; }
    }
    private static void ImportDebitNotesV5(Uri uri, CookieContainer cookieContainer) {
        using HttpClientHandler handler = new HttpClientHandler();
        handler.CookieContainer = cookieContainer;

        using HttpClient client = new HttpClient(handler);
        client.BaseAddress = uri;
        client.DefaultRequestHeaders.UserAgent.Add(new System.Net.Http.Headers.ProductInfoHeaderValue("pro-test", "5.0"));
        client.DefaultRequestHeaders.Accept.Add(new System.Net.Http.Headers.MediaTypeWithQualityHeaderValue("*/*"));

        Task<HttpResponseMessage> listResponse = client.GetAsync($"debit/list?upto=all&short=true&long=true&returned=true");
        string listPayload = listResponse.Result.Content.ReadAsStringAsync().Result;

        DebitParseHelper[] records = JsonSerializer.Deserialize<DebitParseHelper[]>(listPayload);
        Console.WriteLine(records.Length);

        for (int i = 0; i < records.Length; i++) {
            Task<HttpResponseMessage> viewResponse = client.GetAsync($"debit/view?status={records[i].Status}&file={records[i].File}");
            string viewPayload = viewResponse.Result.Content.ReadAsStringAsync().Result;
            DebitNotes.Create(viewPayload, "Import task");
        }
    }

    public static string GetHiddenAttribute(Uri uri, CookieContainer cookieContainer, string path) {
        using HttpClientHandler handler = new HttpClientHandler();
        handler.CookieContainer = cookieContainer;

        using HttpClient client = new HttpClient(handler);
        client.BaseAddress = uri;
        client.DefaultRequestHeaders.UserAgent.Add(new System.Net.Http.Headers.ProductInfoHeaderValue("pro-test", "4.0"));

        Task<HttpResponseMessage> res = client.GetAsync(path);
        string value = res.Result.Content.ReadAsStringAsync().Result;
        return value;
    }
}

internal sealed class FetchedDataJsonConverter : JsonConverter<Dictionary<string, string>> {
    public override Dictionary<string, string> Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) {
        return null;
    }

    public override void Write(Utf8JsonWriter writer, Dictionary<string, string> value, JsonSerializerOptions options) {
        writer.WriteStartObject();

        foreach (KeyValuePair<string, string> pair in value) {
            writer.WritePropertyName(pair.Key);
            writer.WriteStringValue(pair.Value);
        }

        writer.WriteEndObject();
    }
}
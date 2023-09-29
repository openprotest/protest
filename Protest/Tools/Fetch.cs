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

namespace Protest.Tools;

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
        public SynchronizedDictionary<string, SynchronizedDictionary<string, string[]>> dataset;
        public int successful;
        public int unsuccessful;
    }

    private static ThreadWrapper wrapper;
    private static Result? result;

    public static byte[] SingleDeviceSerialize(Dictionary<string, string> parameters, bool asynchronous = false) {
        parameters.TryGetValue("target", out string target);
        parameters.TryGetValue("wmi", out string wmi);
        parameters.TryGetValue("kerberos", out string kerberos);
        parameters.TryGetValue("snmp", out string snmp);
        parameters.TryGetValue("portscan", out string portScan);

        if (target is null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        SynchronizedDictionary<string, string[]> data = SingleDevice(target, true, wmi == "true", kerberos == "true", snmp, portScan, asynchronous, CancellationToken.None);

        JsonSerializerOptions options = new JsonSerializerOptions();
        options.Converters.Add(new FetchedDataJsonConverter());
        return JsonSerializer.SerializeToUtf8Bytes(data, options);
    }
    public static async Task<SynchronizedDictionary<string, string[]>> SingleDeviceAsync(string target, bool useDns, bool useWmi, bool useKerberos, string argSnmp, string argPortScan, bool asynchronous, CancellationToken cancellationToken) {
        PingReply reply = null;
        try {
            reply = await new Ping().SendPingAsync(target, 1500);
            if (reply.Status != IPStatus.Success)
                reply = await new Ping().SendPingAsync(target, 1500);
        }
        catch { }

        if (reply?.Status == IPStatus.Success) {
            SynchronizedDictionary<string, string[]> data = SingleDevice(target, useDns, useWmi, useKerberos, argSnmp, argPortScan, asynchronous, cancellationToken);
            return data;
        }

        return null;
    }
    public static SynchronizedDictionary<string, string[]> SingleDevice(string target, bool useDns, bool useWmi, bool useKerberos, string argSnmp, string argPortScan, bool asynchronous, CancellationToken cancellationToken) {
        bool isIp = IPAddress.TryParse(target, out IPAddress ipAddress);

        string hostname = null;
        IPAddress[] ipList = Array.Empty<IPAddress>();

        if (isIp) {
            ipList = new IPAddress[] { ipAddress };
            try {
                hostname = System.Net.Dns.GetHostEntry(target).HostName;
            }
            catch { }

        }
        else {
            hostname = target;
            try {
                ipList = System.Net.Dns.GetHostAddresses(target).Where(o => !IPAddress.IsLoopback(o)).ToArray();
            }
            catch { }
        }

        if (ipList.Length == 0) {
            return null;
        }

        Dictionary<string, string> wmi = new Dictionary<string, string>();
        Dictionary<string, string> ad = new Dictionary<string, string>();
        string netbios = Protocols.NetBios.GetBiosName(ipList.First()?.ToString());
        string portscan = String.Empty;

        Thread tWmi = null, tSnmp = null, tAd = null, tPortscan = null;

        if (useWmi) {
            tWmi = new Thread(() => {
                if (!OperatingSystem.IsWindows()) return;

                wmi = Protocols.Wmi.WmiFetch(target);

                if (wmi.ContainsKey("owner")) {
                    string owner = wmi["owner"];
                    if (owner.IndexOf('\\') > -1) owner = owner.Split('\\')[1];

                    SearchResult user = Protocols.Kerberos.GetUser(owner);
                    string fn = String.Empty, sn = String.Empty;

                    if (user is not null && user.Properties["givenName"].Count > 0)
                        fn = user.Properties["givenName"][0].ToString();

                    if (user is not null && user.Properties["sn"].Count > 0)
                        sn = user.Properties["sn"][0].ToString();

                    wmi.Add("owner name", $"{fn} {sn}".Trim());
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

                for (int i = 0; i < portsPool.Length; i++)
                    if (ports[i]) portscan += $"{portsPool[i]}; ";

                if (portscan.EndsWith("; ")) portscan = portscan[..^2];
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
            tWmi?.Start(); tWmi?.Join();
            if (cancellationToken.IsCancellationRequested) return null;

            tSnmp?.Start(); tSnmp?.Join();
            if (cancellationToken.IsCancellationRequested) return null;

            tAd?.Start(); tAd?.Join();
            if (cancellationToken.IsCancellationRequested) return null;

            tPortscan?.Start(); tPortscan?.Join();
            if (cancellationToken.IsCancellationRequested) return null;
        }

        SynchronizedDictionary<string, string[]> data = new SynchronizedDictionary<string, string[]>();

        foreach (KeyValuePair<string, string> o in wmi)
            data.Add(o.Key, new string[] { o.Value.ToString(), "WMI", String.Empty });

        foreach (KeyValuePair<string, string> o in ad) {
            string key = o.Key.ToString();

            if (key == "operating system") { //os not found in ad, use wmi
                if (!wmi.ContainsKey("operating system"))
                    data.Add(o.Key, new string[] { o.Value.ToString(), "Kerberos", String.Empty });
            }
            else {
                data.Add(o.Key, new string[] { o.Value.ToString(), "Kerberos", String.Empty });
            }
        }

        if (portscan.Length > 0)
            data.Add("ports", new string[] { portscan, "Port-scan", String.Empty });

        string mac = String.Empty;
        if (wmi.ContainsKey("mac address")) {
            mac = (wmi["mac address"]).Split(';')[0].Trim();
        }
        else {
            mac = Protocols.Arp.ArpRequest(target);
            if (mac is not null && mac.Length > 0)
                data.Add("mac address", new string[] { mac, "ARP", String.Empty });
        }

        if (!wmi.ContainsKey("manufacturer") && mac.Length > 0) {
            byte[] manufacturerArray = MacLookup.Lookup(mac);
            if (manufacturerArray is not null) {
                string manufacturer = Encoding.UTF8.GetString(manufacturerArray);
                if (manufacturer.Length > 0 && manufacturer != "not found")
                    data.Add("manufacturer", new string[] { manufacturer, "MAC lookup", String.Empty });
            }
        }

        if (!wmi.ContainsKey("hostname")) {
            if (netbios is not null && netbios.Length > 0) { //use netbios
                data.Add("hostname", new string[] { netbios, "NetBIOS", String.Empty });
            }
            else if (useDns && hostname is not null && hostname.Length > 0) { //use dns
                data.Add("hostname", new string[] { hostname, "DNS", String.Empty });
            }
        }

        if (!data.ContainsKey("ip") && ipList is not null) {
            data.Add("ip", new string[] { String.Join("; ", ipList.Select(o => o.ToString())), "IP", String.Empty });
        }

        if (!data.ContainsKey("type")) {
            if (data.ContainsKey("operating system")) {
                string os = (data["operating system"])[0];
                if (os.ToLower().Contains("server")) //if os is windows server, set type as server
                    data.Add("type", new string[] { "Server", "Kerberos", String.Empty });
            }
        }
        
        if (!data.ContainsKey("location")) {
            for (int i=0; i < ipList.Length; i++) {
                byte[] bytes = ipList[i].GetAddressBytes();
                ulong ipNumber = ((ulong)bytes[0]<<24) + ((ulong)bytes[0]<<16) + ((ulong)bytes[0]<<8) + bytes[0];
                if (ipNumber >= 2130706432 && ipNumber <= 2147483647) continue; //127.0.0.0 <> 127.255.255.255
                if (ipNumber >= 167772160 && ipNumber >= 184549375) continue;   //10.0.0.0 <> 10.255.255.255
                if (ipNumber >= 2886729728 && ipNumber >= 2887778303) continue; //172.16.0.0 <> 172.31.255.255
                if (ipNumber >= 3232235520 && ipNumber >= 3232301055) continue; //192.168.0.0 <> 192.168.255.255
                if (ipNumber >= 2851995648 && ipNumber >= 184549375) continue;  //169.254.0.0 <> 169.254.255.255
                if (ipNumber >= 3758096384) continue; // > 224.0.0.0

                string ipLocation = Encoding.UTF8.GetString(LocateIp.Locate(ipAddress.ToString()));
                string[] split = ipLocation.Split(';');
                if (split.Length > 5) split = new string[] { split[0], split[1], split[2], split[3], split[4] };

                data.Add("location", new string[] { String.Join(';', split), "Locate IP", String.Empty });
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

            if (ports.Contains(445) && ports.Contains(3389) && (ports.Contains(53) || ports.Contains(67) || ports.Contains(389) || ports.Contains(636) || ports.Contains(853))) //SMB, RDP, DNS, DHCP, LDAP
                data.Add("type", new string[] { "Server", "Port-scan", String.Empty });

            else if (ports.Contains(445) && ports.Contains(3389)) //SMB, RDP
                data.Add("type", new string[] { "Workstation", "Port-scan", String.Empty });

            else if (ports.Contains(515) || ports.Contains(631) || ports.Contains(9100)) //LPD, IPP, Print-server
                data.Add("type", new string[] { "Printer", "Port-scan", String.Empty });

            else if (ports.Contains(6789) || ports.Contains(10001)) //ap
                data.Add("type", new string[] { "Access point", "Port-scan", String.Empty });

            else if (ports.Contains(7442) || ports.Contains(7550)) //cam
                data.Add("type", new string[] { "Camera", "Port-scan", String.Empty });
        }

        if (!data.ContainsKey("type") && wmi.Count > 0) {
            data.Add("type", new string[] { "Workstation", "WMI", String.Empty });
        }

        if (cancellationToken.IsCancellationRequested) return null;

        return data;
    }

    public static byte[] SingleUserSerialize(Dictionary<string, string> parameters) {
        parameters.TryGetValue("target", out string target);

        if (target is null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        SynchronizedDictionary<string, string[]> data = SingleUser(target);

        JsonSerializerOptions options = new JsonSerializerOptions();
        options.Converters.Add(new FetchedDataJsonConverter());
        return JsonSerializer.SerializeToUtf8Bytes(data, options);
    }
    public static SynchronizedDictionary<string, string[]> SingleUser(string target) {
        if (!OperatingSystem.IsWindows()) return null;

        Dictionary<string, string> fetch = Protocols.Kerberos.AdFetch(target);
        if (fetch is null) {
            return null;
        }

        SynchronizedDictionary<string, string[]> data = new SynchronizedDictionary<string, string[]>();

        foreach (KeyValuePair<string, string> o in fetch)
            data.Add(o.Key, new string[] { o.Value.ToString(), "Kerberos", String.Empty });

        return data;
    }

    public static byte[] DevicesTask(Dictionary<string, string> parameters, string initiator) {
        if (parameters is null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        parameters.TryGetValue("range",    out string range);
        parameters.TryGetValue("domain",   out string domain);

        parameters.TryGetValue("dns",      out string dns);
        parameters.TryGetValue("wmi",      out string wmi);
        parameters.TryGetValue("kerberos", out string kerberos);
        parameters.TryGetValue("snmp",     out string snmp);
        parameters.TryGetValue("portscan", out string portscan);
        parameters.TryGetValue("retries",  out string retries);
        parameters.TryGetValue("interval", out string interval);

        string[] hosts;

        if (range is not null) {
            string[] split = range.Split('-');
            if (split.Length != 2) return Data.CODE_INVALID_ARGUMENT.Array;
            if (split[0] is null || split[1] is null) return Data.CODE_INVALID_ARGUMENT.Array;

            byte[] arrFrom = IPAddress.Parse(split[0]).GetAddressBytes();
            byte[] arrTo = IPAddress.Parse(split[1]).GetAddressBytes();
            Array.Reverse(arrFrom);
            Array.Reverse(arrTo);

            uint intFrom = BitConverter.ToUInt32(arrFrom, 0);
            uint intTo = BitConverter.ToUInt32(arrTo, 0);
            if (intFrom > intTo) return Data.CODE_INVALID_ARGUMENT.Array;

            hosts = new string[intTo - intFrom + 1];

            for (uint i = intFrom; i < intTo + 1 && i < UInt32.MaxValue - 1; i++) {
                byte[] bytes = BitConverter.GetBytes(i);
                Array.Reverse(bytes);
                hosts[i - intFrom] = String.Join(".", bytes);
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

            initiator);
    }
    public static byte[] DevicesTask(string[] hosts, bool dns, bool wmi, bool kerberos, string snmp, string portscan, int retries, float interval, string initiator) {
        if (wrapper is not null) return Data.CODE_OTHER_TASK_IN_PROGRESS.Array;
        if (result is not null) return Data.CODE_OTHER_TASK_IN_PROGRESS.Array;

        int totalFetched = 0;
        int totalRetries = 0;

        Thread thread = new Thread(async ()=> {
            const int WINDOW = 32;
            SynchronizedDictionary<string, SynchronizedDictionary<string, string[]>> dataset = new SynchronizedDictionary<string, SynchronizedDictionary<string, string[]>>();

            wrapper.status = "fetching";

            List<string> queue = new List<string>(hosts);
            List<string> redo = new List<string>();

            while (!wrapper.cancellationToken.IsCancellationRequested) {

                while (queue.Count > 0) {
                    int size = Math.Min(WINDOW, queue.Count);

                    List<Task<SynchronizedDictionary<string, string[]>>> tasks = new List<Task<SynchronizedDictionary<string, string[]>>>();
                    for (int i = 0; i < size; i++)
                        tasks.Add(SingleDeviceAsync(queue[i], dns, wmi, kerberos, snmp, portscan, false, wrapper.cancellationToken));

                    SynchronizedDictionary<string, string[]>[] result = await Task.WhenAll(tasks);

                    if (wrapper.cancellationToken.IsCancellationRequested) {
                        break;
                    }

                    for (int i = 0; i < size; i++) {
                        if (result[i] is null) { //unreachable
                            redo.Add(queue[i]);
                        }
                        else if (result[i].Count > 0) {
                            wrapper.CompletedSteps = ++totalFetched;
                            if (dataset.ContainsKey(queue[i])) {
                                continue;
                            }
                            dataset.Add(queue[i], result[i]);
                        }
                    }

                    queue.RemoveRange(0, size);
                }

                if (wrapper.cancellationToken.IsCancellationRequested) {
                    break;
                }

                (redo, queue) = (queue, redo);

                if (retries > totalRetries++ && queue.Count > 0) {
                    long wait0 = DateTime.UtcNow.Ticks;
                    wrapper.status = "idle";

                    KeepAlive.Broadcast($"{{\"action\":\"updatefetch\",\"type\":\"devices\",\"task\":{Encoding.UTF8.GetString(Status())}}}", "/fetch/status");

                    do {
                        Thread.Sleep(15_000); //15 sec
                        if (wrapper.cancellationToken.IsCancellationRequested) {
                            break;
                        }
                    } while (DateTime.UtcNow.Ticks - wait0 < (long)(interval * 36_000_000_000f));

                    wrapper.status = "fetching";

                    KeepAlive.Broadcast($"{{\"action\":\"updatefetch\",\"type\":\"devices\",\"task\":{Encoding.UTF8.GetString(Status())}}}", "/fetch/status");
                }
                else {
                    break;
                }
            }

            if (wrapper.cancellationToken.IsCancellationRequested) {
                KeepAlive.Broadcast("{\"action\":\"abortfetch\",\"type\":\"devices\"}"u8.ToArray(), "/fetch/status");
                Logger.Action(initiator, "Fetch task aborted");

                wrapper.Dispose();
                wrapper = null;
                return;
            }

            result = new Result() {
                name         = wrapper.name,
                type         = Type.devices,
                started      = wrapper.started,
                finished     = DateTime.UtcNow.Ticks,
                dataset      = dataset,
                successful   = wrapper.CompletedSteps,
                unsuccessful = wrapper.TotalSteps - wrapper.CompletedSteps,
            };

            KeepAlive.Broadcast($"{{\"action\":\"finishfetch\",\"type\":\"devices\",\"task\":{Encoding.UTF8.GetString(Status())}}}", "/fetch/status");
            Logger.Action(initiator, "Fetch task succesully finished");
        });

        KeepAlive.Broadcast("{\"action\":\"startfetch\",\"type\":\"devices\"}"u8.ToArray(), "/fetch/status");
        Logger.Action(initiator, "Start fetch task");

        wrapper = new ThreadWrapper("Fetching devices") {
            thread         = thread,
            initiator      = initiator,
            TotalSteps     = hosts.Length,
            CompletedSteps = 0
        };
        wrapper.thread.Start();

        return Data.CODE_OK.Array;
    }

    public static byte[] UsersTask(Dictionary<string, string> parameters, string initiator) {
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
            return UsersTask(users.ToArray(), initiator);
        }
        else if (parameters.TryGetValue("domain", out string domain)) {
            if (domain is null) {
                return Data.CODE_INVALID_ARGUMENT.ToArray();
            }

            string[] users = OperatingSystem.IsWindows() ? Protocols.Kerberos.GetAllUsers(domain) : Array.Empty<string>();
            if (users is null) return Data.CODE_FAILED.Array;
            return UsersTask(users, initiator);
        }

        return Data.CODE_INVALID_ARGUMENT.ToArray();
    }
    public static byte[] UsersTask(string[] users, string initiator) {
        if (wrapper is not null) return Data.CODE_OTHER_TASK_IN_PROGRESS.Array;
        if (result is not null) return Data.CODE_OTHER_TASK_IN_PROGRESS.Array;

        Thread thread = new Thread(()=> {
            long lastBroadcast = DateTime.UtcNow.Ticks;
            SynchronizedDictionary<string, SynchronizedDictionary<string, string[]>> dataset = new SynchronizedDictionary<string, SynchronizedDictionary<string, string[]>>();

            wrapper.status = "fetching";

            for (int i = 0; i < users.Length; i++) {
                SynchronizedDictionary<string, string[]> hash = SingleUser(users[i]);
                wrapper.CompletedSteps++;

                dataset.Add(users[i], hash);

                if (wrapper.cancellationToken.IsCancellationRequested) {
                    break;
                }

                if (DateTime.UtcNow.Ticks - lastBroadcast > 30_000_000) { //after 3 seconds
                    KeepAlive.Broadcast($"{{\"action\":\"updatefetch\",\"type\":\"users\",\"task\":{Encoding.UTF8.GetString(Status())}}}", "/fetch/status");
                    lastBroadcast = DateTime.UtcNow.Ticks;
                }
            }

            result = new Result() {
                name         = wrapper.name,
                type         = Type.users,
                started      = wrapper.started,
                finished     = DateTime.UtcNow.Ticks,
                dataset      = dataset,
                successful   = wrapper.CompletedSteps,
                unsuccessful = wrapper.TotalSteps - wrapper.CompletedSteps,
            };

            KeepAlive.Broadcast($"{{\"action\":\"finishfetch\",\"type\":\"users\",\"task\":{Encoding.UTF8.GetString(Status())}}}", "/fetch/status");
            Logger.Action(initiator, "Fetch task succesully finished");
        });

        KeepAlive.Broadcast("{\"action\":\"startfetch\",\"type\":\"users\"}"u8.ToArray(), "/fetch/status");
        Logger.Action(initiator, "Start fetch task");

        wrapper = new ThreadWrapper("Fetching users") {
            thread         = thread,
            initiator      = initiator,
            TotalSteps     = users.Length,
            CompletedSteps = 0
        };
        wrapper.thread.Start();

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

        if (wrapper is not null) {
            StringBuilder response = new StringBuilder();

            if (wrapper.cancellationToken.IsCancellationRequested) {
                response.Append('{');
                response.Append($"\"name\":\"{Data.EscapeJsonText(wrapper.name)}\",");
                response.Append($"\"status\":\"canceling\",");
                response.Append($"\"started\":\"{wrapper.started}\",");
                response.Append($"\"completed\":\"{Data.EscapeJsonText(wrapper.CompletedSteps.ToString())}\",");
                response.Append($"\"total\":\"{Data.EscapeJsonText(wrapper.TotalSteps.ToString())}\",");
                response.Append($"\"etc\":\"{Data.EscapeJsonText(wrapper.CalculateEtc())}\"");
                response.Append('}');
                return Encoding.UTF8.GetBytes(response.ToString());
            }

            response.Append('{');
            response.Append($"\"name\":\"{Data.EscapeJsonText(wrapper.name)}\",");
            response.Append($"\"status\":\"{Data.EscapeJsonText(wrapper.status)}\",");
            response.Append($"\"started\":\"{wrapper.started}\",");
            response.Append($"\"completed\":\"{Data.EscapeJsonText(wrapper.CompletedSteps.ToString())}\",");
            response.Append($"\"total\":\"{Data.EscapeJsonText(wrapper.TotalSteps.ToString())}\",");
            response.Append($"\"etc\":\"{Data.EscapeJsonText(wrapper.CalculateEtc())}\"");
            response.Append('}');
            return Encoding.UTF8.GetBytes(response.ToString());
        }

        return "{\"status\":\"none\"}"u8.ToArray();
    }

    public static byte[] CancelTask(string initiator) {
        if (wrapper is null) return Data.CODE_TASK_DONT_EXITSTS.Array;

        KeepAlive.Broadcast("{\"action\":\"cancelfetch\",\"type\":\"devices\"}"u8.ToArray(), "/fetch/status");
        Logger.Action(initiator, "Canceling fetch task");
        wrapper.RequestCancel(initiator);
        //wrapper = null;

        return Data.CODE_OK.Array;
    }

    public static byte[] ApproveLastTask(Dictionary<string, string> parameters, string initiator) {
        if (result is null) return Data.CODE_TASK_DONT_EXITSTS.Array;

        parameters.TryGetValue("condition", out string targetAttribute);
        parameters.TryGetValue("action", out string action);

        Database.SaveMethod saveMethod = action switch {
            "0" => Database.SaveMethod.ignore,
            "2" => Database.SaveMethod.overwrite,
            "3" => Database.SaveMethod.append,
            "4" => Database.SaveMethod.merge,
            _   => Database.SaveMethod.createnew
        };

        Console.WriteLine(action);
        Console.WriteLine(saveMethod);
        Console.WriteLine(targetAttribute);

        Database database;

        if (result?.type == Type.devices) {
            Logger.Action(initiator, "Approve fetched devices");
            KeepAlive.Broadcast("{\"action\":\"approvefetch\",\"type\":\"devices\"}"u8.ToArray(), "/fetch/status");
        
            database = DatabaseInstances.devices;
        }
        else if (result?.type == Type.users) {
            Logger.Action(initiator, "Approve fetched users");
            KeepAlive.Broadcast("{\"action\":\"approvefetch\",\"type\":\"users\"}"u8.ToArray(), "/fetch/status");

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
                if (key[i].Length == 0) continue;
                if (values.ContainsKey(key[i])) continue;
                values.Add(key[i], entry.Value.filename);
            }
        }

        long date = DateTime.UtcNow.Ticks;

        foreach (KeyValuePair<string, SynchronizedDictionary<string, string[]>> pair in result?.dataset) {
            SynchronizedDictionary<string, Database.Attribute> attributes = new SynchronizedDictionary<string, Database.Attribute>();
            foreach (KeyValuePair<string, string[]> attr in pair.Value) {
                attributes.Add(attr.Key, new Database.Attribute() {
                    value = attr.Value[0],
                    date = date,
                    initiator = initiator,
                });
            }
            
            if (pair.Value.ContainsKey(targetAttribute)) {
                string value = pair.Value[targetAttribute][0];
                string file = values.ContainsKey(value) ? values[value] : null;
                database.Save(file, attributes, saveMethod, initiator);
            }
            else {
                database.Save(null, attributes, saveMethod, initiator);
            }
        }

        values.Clear();

        if (result?.type == Type.devices) {
            KeepAlive.Broadcast("{\"action\":\"approvefetch\",\"type\":\"devices\"}"u8.ToArray(), "/fetch/status");
        }
        else if (result?.type == Type.users) {
            KeepAlive.Broadcast("{\"action\":\"approvefetch\",\"type\":\"users\"}"u8.ToArray(), "/fetch/status");
        }

        Logger.Action(initiator, "Fetched data approved");

        result = null;
        wrapper = null;
        return Data.CODE_OK.Array;
    }

    public static byte[] DiscardLastTask(string initiator) {
        KeepAlive.Broadcast("{\"action\":\"discardfetch\",\"type\":\"devices\"}"u8.ToArray(), "/fetch/status");
        Logger.Action(initiator, "Discard fetched data");

        result = null;
        wrapper = null;
        return Data.CODE_OK.Array;
    }

    public static byte[] ImportTask(Dictionary<string, string> parameters, string initiator) {
        if (parameters is null) {
            return Data.CODE_INVALID_ARGUMENT.ToArray();
        }
        
        parameters.TryGetValue("ip",        out string ip);
        parameters.TryGetValue("port",      out string port);
        parameters.TryGetValue("protocol",  out string protocol);
        parameters.TryGetValue("username",  out string username);
        parameters.TryGetValue("password",  out string password);
        parameters.TryGetValue("devices",   out string importDevices);
        parameters.TryGetValue("users",     out string importUsers);

        bool fetchDevices     = importDevices?.Equals("true") ?? false;
        bool fetchUsers       = importUsers?.Equals("true") ?? false;

        string sessionid = null;
        float version = 0f;

        Uri uri = new Uri($"{protocol}://{ip}:{port}");
        HttpContent payload = new StringContent($"{username}{(char)127}{password}", Encoding.UTF8, "text/plain");

        ServicePointManager.ServerCertificateValidationCallback = (message, cert, chain, errors) => { return true; };

        try {
            using HttpClient clientAuth = new HttpClient();
            clientAuth.BaseAddress = uri;
            clientAuth.DefaultRequestHeaders.UserAgent.Add(new System.Net.Http.Headers.ProductInfoHeaderValue("pro-test", "5.0"));
            clientAuth.DefaultRequestHeaders.Accept.Add(new System.Net.Http.Headers.MediaTypeWithQualityHeaderValue("*/*"));

            HttpResponseMessage res_auth;
            try {
                res_auth = clientAuth.PostAsync("/auth", payload).Result;
            }
            catch (HttpRequestException ex) {
                if (ex.StatusCode == HttpStatusCode.NotFound || ex.StatusCode == HttpStatusCode.Unauthorized || ex.StatusCode == HttpStatusCode.Forbidden) {
                    res_auth = clientAuth.PostAsync("/a", payload).Result;
                } else {
                    throw;
                }
            }
            catch {
                throw;
            }

            Thread.Sleep(1000);

            res_auth.Headers.TryGetValues("Set-Cookie", out IEnumerable<string> cookies);

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

        try {
            using HttpClientHandler handler = new HttpClientHandler();
            handler.CookieContainer = cookieContainer;
            using (HttpClient client_ver = new HttpClient(handler)) {
                client_ver.BaseAddress = uri;
                client_ver.DefaultRequestHeaders.UserAgent.Add(new System.Net.Http.Headers.ProductInfoHeaderValue("pro-test", "5.0"));
                client_ver.DefaultRequestHeaders.Accept.Add(new System.Net.Http.Headers.MediaTypeWithQualityHeaderValue("*/*"));

                Task<HttpResponseMessage> res_ver = client_ver.GetAsync("version");

                if (res_ver.Result.StatusCode == HttpStatusCode.NotFound) {
                    version = 3.2f;
                }
                else {
                    string[] ver = res_ver.Result.Content.ReadAsStringAsync().Result
                        .Replace("{", String.Empty)
                        .Replace("}", String.Empty)
                        .Replace("\"", String.Empty)
                        .Replace(" ", String.Empty)
                        .Split(',');

                    string major="0", minor="0";
                    for (int i = 0; i < ver.Length; i++) {
                        if (ver[i].StartsWith("major:"))
                            major = ver[i][6..];
                        if (ver[i].StartsWith("minor:"))
                            minor = ver[i][6..];
                    }
                    version = float.Parse($"{major}.{minor}");
                }
            };
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

        if (version < 4f || version > 6f) {
            Logger.Error("Remote host is running an unsupported version");
            return "{\"error\":\"Remote host is running an unsupported version\"}"u8.ToArray();
        }

        if (fetchDevices) {
            Logger.Action(initiator, $"Importing devices from {ip}");
            if (version >= 4f && version < 5f) {
                ImportDevicesV4(uri, cookieContainer);
            }
            else if (version >= 5f && version < 6f) {
                ImportDevicesV5(uri, cookieContainer);
            }
        }

        if (fetchUsers) {
            Logger.Action(initiator, $"Importing users from {ip}");
            if (version >= 4f && version < 5f) {
                ImportUsersV4(uri, cookieContainer);
            }
            else if (version >= 5f && version < 6f) {
                ImportUsersV5(uri, cookieContainer);
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
                SynchronizedDictionary<string, Database.Attribute> attributes = new SynchronizedDictionary<string, Database.Attribute>();
                
                for (int j = i + 1; j < i + len * 4; j += 4) {
                    if (split[j] == ".FILENAME") {
                        filename = split[j + 1];
                        continue;
                    }

                    string name = split[j].ToLower();
                    string value = split[j+1];
                    long date;
                    string initiator;

                    string[] initiatorSplit = split[j + 2].Split(",").Select(o=>o.Trim()).ToArray();
                    if (initiatorSplit.Length == 1) {
                        initiator = initiatorSplit[0];
                        date = initDate;
                    }
                    else if (initiatorSplit.Length >= 2) {
                        initiator = initiatorSplit[0];
                        string[] dateSplit = initiatorSplit[1].Split("-");
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
                        initiator = "Imported";
                        date = initDate;
                    }

                    attributes.Add(name, new Database.Attribute() {
                        value = value,
                        date = date,
                        initiator = initiator
                    });
                }

                foreach (var attr in attributes) {
                    if (attr.Key.Contains ("password") && filename is not null) {
                        string password = GetHiddenAttribute(uri, cookieContainer, $"db/getequiprop&file={filename}&property={attr.Key.ToUpper()}");
                        attributes[attr.Key].value = password;
                    }
                }

                DatabaseInstances.devices.Save((++filenameCount).ToString("x"), attributes, Database.SaveMethod.createnew, "Pro-test");
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
                SynchronizedDictionary<string, Database.Attribute> attributes = new SynchronizedDictionary<string, Database.Attribute>();

                for (int j = i + 1; j < i + len * 4; j += 4) {
                    if (split[j] == ".FILENAME") {
                        filename = split[j + 1];
                        continue;
                    }

                    string name = split[j].ToLower();
                    string value = split[j+1];
                    long date;
                    string initiator;

                    string[] initiatorSplit = split[j + 2].Split(",").Select(o=>o.Trim()).ToArray();
                    if (initiatorSplit.Length == 1) {
                        initiator = initiatorSplit[0];
                        date = initDate;
                    }
                    else if (initiatorSplit.Length >= 2) {
                        initiator = initiatorSplit[0];
                        string[] dateSplit = initiatorSplit[1].Split("-");
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
                        initiator = "Imported";
                        date = initDate;
                    }

                    attributes.Add(name, new Database.Attribute() {
                        value = value,
                        date = date,
                        initiator = initiator
                    });
                }

                foreach (var attr in attributes) {
                    if (attr.Key.Contains("password") && filename is not null) {
                        string password = GetHiddenAttribute(uri, cookieContainer, $"db/getuserprop&file={filename}&property={attr.Key.ToUpper()}");
                        attributes[attr.Key].value = password;
                        Console.WriteLine(password);
                    }
                }

                DatabaseInstances.users.Save((++filenameCount).ToString("x"), attributes, Database.SaveMethod.createnew, "Pro-test");
            }

            i += 1 + len * 4;
        }
    }

    public static void ImportDevicesV5(Uri uri, CookieContainer cookieContainer) {
        using HttpClientHandler handler = new HttpClientHandler();
        handler.CookieContainer = cookieContainer;

        using HttpClient client = new HttpClient(handler);
        client.BaseAddress = uri;
        client.DefaultRequestHeaders.UserAgent.Add(new System.Net.Http.Headers.ProductInfoHeaderValue("pro-test", "5.0"));
        client.DefaultRequestHeaders.Accept.Add(new System.Net.Http.Headers.MediaTypeWithQualityHeaderValue("*/*"));

        Task<HttpResponseMessage> res = client.GetAsync("/db/device/get");
        byte[] bytes = res.Result.Content.ReadAsByteArrayAsync().Result;
        
        JsonSerializerOptions options = new JsonSerializerOptions();
        options.Converters.Add(new DatabaseJsonConverter("import", $"{Data.DIR_DEVICES}_import", false));
        Database import = JsonSerializer.Deserialize<Database>(bytes, options);

        foreach (Database.Entry entry in import.dictionary.Values) {
            Console.WriteLine(entry.filename);
            DatabaseInstances.devices.Save(entry.filename, entry.attributes, Database.SaveMethod.createnew, "Pro-test");
        }

        //TODO: update ui
    }

    public static void ImportUsersV5(Uri uri, CookieContainer cookieContainer) {
        using HttpClientHandler handler = new HttpClientHandler();
        handler.CookieContainer = cookieContainer;

        using HttpClient client = new HttpClient(handler);
        client.BaseAddress = uri;
        client.DefaultRequestHeaders.UserAgent.Add(new System.Net.Http.Headers.ProductInfoHeaderValue("pro-test", "5.0"));
        client.DefaultRequestHeaders.Accept.Add(new System.Net.Http.Headers.MediaTypeWithQualityHeaderValue("*/*"));

        Task<HttpResponseMessage> res = client.GetAsync("/db/user/get");
        byte[] bytes = res.Result.Content.ReadAsByteArrayAsync().Result;

        JsonSerializerOptions options = new JsonSerializerOptions();
        options.Converters.Add(new DatabaseJsonConverter("import", $"{Data.DIR_USERS}_import", false));
        Database import = JsonSerializer.Deserialize<Database>(bytes, options);

        foreach (Database.Entry entry in import.dictionary.Values) {
            Console.WriteLine(entry.filename);
            DatabaseInstances.users.Save(entry.filename, entry.attributes, Database.SaveMethod.createnew, "Pro-test");
        }

        //TODO: update ui
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
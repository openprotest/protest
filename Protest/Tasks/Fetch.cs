using System.Collections.Generic;
using System.Collections.Concurrent;
using System.IO;
using System.Data;
using System.DirectoryServices;
using System.Net;
using System.Net.Http;
using System.Net.NetworkInformation;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;
using Protest.Http;
using Protest.Tools;
using Lextm.SharpSnmpLib;
using Protest.Protocols.Snmp;

namespace Protest.Tasks;

internal static class Fetch {

    enum Type : byte {
        none    = 0,
        devices = 1,
        users   = 2,
    }

    struct Result {
        public string name;
        public Type   type;
        public long   started;
        public long   finished;
        public ConcurrentDictionary<string, ConcurrentDictionary<string, string[]>> dataset;
        public int    successful;
        public int    unsuccessful;
    }

    private static readonly JsonSerializerOptions fetchSerializerOptions;

    public static TaskWrapper task;
    private static Result? result;

    static Fetch() {
        fetchSerializerOptions = new JsonSerializerOptions();
        fetchSerializerOptions.Converters.Add(new FetchedDataJsonConverter());
    }

    public static byte[] SingleDeviceSerialize(Dictionary<string, string> parameters, bool asynchronous = false) {
        if (parameters is null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        parameters.TryGetValue("target", out string target);
        parameters.TryGetValue("wmi", out string wmi);
        parameters.TryGetValue("ldap", out string ldap);
        parameters.TryGetValue("snmp", out string snmpProfileGuid);
        parameters.TryGetValue("portscan", out string portScan);

        if (target is null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        SnmpProfiles.Profile[] snmpProfiles = null;
        if (SnmpProfiles.FromGuid(snmpProfileGuid, out SnmpProfiles.Profile snmpProfile)) {
            snmpProfiles = new SnmpProfiles.Profile[] { snmpProfile };
        }

        ConcurrentDictionary<string, string[]> data = SingleDevice(
            target,
            true,
            wmi?.Equals("true") ?? false,
            ldap?.Equals("true") ?? false,
            snmpProfiles,
            portScan,
            asynchronous,
            CancellationToken.None
        );

        if (data is null || data.IsEmpty) {
            return "{\"error\":\"Failed to fetch data.\"}"u8.ToArray();
        }

        return JsonSerializer.SerializeToUtf8Bytes(data, fetchSerializerOptions);
    }
    public static async Task<ConcurrentDictionary<string, string[]>> SingleDeviceAsync(string target, bool useDns, bool useWmi, bool useLdap, SnmpProfiles.Profile[] snmpProfiles, string argPortScan, bool asynchronous, CancellationToken cancellationToken) {
        PingReply reply = null;
        try {
            using Ping ping = new Ping();
            reply = await ping.SendPingAsync(target, 1500);
            if (reply.Status != IPStatus.Success) {
                reply = await ping.SendPingAsync(target, 1500);
            }
        }
        catch { }

        if (reply?.Status == IPStatus.Success) {
            ConcurrentDictionary<string, string[]> data = SingleDevice(target, useDns, useWmi, useLdap, snmpProfiles , argPortScan, asynchronous, cancellationToken);
            return data;
        }

        return null;
    }
    public static ConcurrentDictionary<string, string[]> SingleDevice(string target, bool useDns, bool useWmi, bool useLdap, SnmpProfiles.Profile[] snmpProfiles, string argPortScan, bool asynchronous, CancellationToken cancellationToken) {
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
        string netBios = Protocols.NetBios.GetBiosName(ipList.First()?.ToString());
        string portScan = string.Empty;

        Thread tWmi = null, tAd = null, tPortScan = null;

        if (useWmi) {
            tWmi = new Thread(() => {
                if (!OperatingSystem.IsWindows()) { return; }
                wmi = Protocols.Wmi.WmiFetch(target);

                if (wmi.TryGetValue("owner", out string owner)) {
                    if (owner.IndexOf('\\') > -1) {
                        owner = owner.Split('\\')[1];
                    }
                    SearchResult user = Protocols.Ldap.GetUser(owner);
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

        if (useLdap) {
            tAd = new Thread(() => {
                if (!OperatingSystem.IsWindows()) { return; }
                if (hostname is null) { return; }

                SearchResult result = Protocols.Ldap.GetWorkstation(hostname);
                if (result is null) { return; }

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

                ad.Add("object guid", new Guid((byte[])result.Properties["objectGuid"][0]).ToString());
            });
        }

        if (argPortScan is not null) {
            tPortScan = new Thread(() => {
                short[] portsPool = argPortScan == "full" ? PortScan.BASIC_PORTS : PortScan.BASIC_PORTS;

                bool[] ports = PortScan.PortsScanAsync(target, portsPool, 1000, true).GetAwaiter().GetResult();

                for (int i = 0; i < portsPool.Length; i++) {
                    if (ports[i]) {
                        portScan += $"{portsPool[i]}; ";
                    }
                }

                if (portScan.EndsWith("; ")) {
                    portScan = portScan[..^2];
                }
            });
        }

        if (asynchronous) {
            tWmi?.Start();
            tAd?.Start();
            tPortScan?.Start();

            tWmi?.Join();
            tAd?.Join();
            tPortScan?.Join();
        }
        else {
            tWmi?.Start();
            tWmi?.Join();
            if (cancellationToken.IsCancellationRequested) {
                return null;
            }

            tAd?.Start();
            tAd?.Join();
            if (cancellationToken.IsCancellationRequested) {
                return null;
            }

            tPortScan?.Start();
            tPortScan?.Join();
            if (cancellationToken.IsCancellationRequested) {
                return null;
            }
        }

        ConcurrentDictionary<string, string[]> data = new ConcurrentDictionary<string, string[]>();

        foreach (KeyValuePair<string, string> o in wmi) {
            data.TryAdd(o.Key, new string[] { o.Value, "WMI", string.Empty });
        }

        foreach (KeyValuePair<string, string> o in ad) {
            string key = o.Key;
            if (key == "operating system") { //os not found in ad, use wmi
                if (!wmi.ContainsKey("operating system")) {
                    data.TryAdd(key, new string[] { o.Value, "LDAP", string.Empty });
                }
            }
            else {
                data.TryAdd(key, new string[] { o.Value, "LDAP", string.Empty });
            }
        }

        if (portScan.Length > 0) {
            data.TryAdd("ports", new string[] { portScan, "Port-scan", string.Empty });
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
            if (netBios is not null && netBios.Length > 0) { //use netbios
                data.TryAdd("hostname", new string[] { netBios, "NetBIOS", string.Empty });
            }
            else if (useDns && hostname is not null && hostname.Length > 0) { //use dns
                if (hostname.Contains('.')) {
                    hostname = hostname.Split('.')[0];
                }
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
                    data.TryAdd("type", new string[] { "Server", "LDAP", string.Empty });
                }
            }
        }

        if (!data.ContainsKey("location")) {
            for (int i = 0; i < ipList.Length; i++) {
                byte[] bytes = ipList[i].GetAddressBytes();
                if (bytes.Length != 4) continue;

                ulong ipNumber = ((ulong)bytes[0] << 24) + ((ulong)bytes[1] << 16) + ((ulong)bytes[2] << 8) + bytes[3];
                if (ipNumber >= 2130706432 && ipNumber <= 2147483647) continue; //127.0.0.0 <> 127.255.255.255
                if (ipNumber >= 167772160 && ipNumber <= 184549375) continue; //10.0.0.0 <> 10.255.255.255
                if (ipNumber >= 2886729728 && ipNumber <= 2887778303) continue; //172.16.0.0 <> 172.31.255.255
                if (ipNumber >= 3232235520 && ipNumber <= 3232301055) continue; //192.168.0.0 <> 192.168.255.255
                if (ipNumber >= 2851995648 && ipNumber <= 184549375) continue; //169.254.0.0 <> 169.254.255.255
                if (ipNumber >= 3758096384) continue; // <= 224.0.0.0

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

        if (cancellationToken.IsCancellationRequested) {
            return null;
        }

        //if no type found, try to guess from ports
        if (!data.ContainsKey("type") && portScan.Length > 0) {
            int[] ports = portScan.Split(';').Select(o => int.Parse(o.Trim())).ToArray();

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

        if (cancellationToken.IsCancellationRequested) {
            return null;
        }

        if (snmpProfiles is not null) {
            IList<Variable> result;
            SnmpProfiles.Profile profile;

            if (snmpProfiles.Length == 0) {
                result = null;
                profile = null;
            }
            else if (snmpProfiles.Length == 1) {
                result = Protocols.Snmp.Polling.SnmpQuery(ipAddress, snmpProfiles[0], Protocols.Snmp.Oid.GENERIC_OID, Polling.SnmpOperation.Get);
                profile = snmpProfiles[0];
            }
            else {
                (result, profile) = Protocols.Snmp.Polling.SnmpQueryTrialAndError(ipAddress, snmpProfiles, Protocols.Snmp.Oid.GENERIC_OID);
            }

            Dictionary<string, string> formatted = Protocols.Snmp.Polling.ParseResponse(result);
            if (formatted is not null && formatted.TryGetValue(Protocols.Snmp.Oid.SYSTEM_DESCRIPTOR, out string snmpDescription)) {
                data.TryAdd("descriptor", new string[] { snmpDescription, "SNMP", string.Empty });
            }
            if (formatted is not null && formatted.TryGetValue(Protocols.Snmp.Oid.SYSTEM_NAME, out string snmpHostname)) {
                data.TryAdd("hostname", new string[] { snmpHostname, "SNMP", string.Empty });
            }
            if (formatted is not null && formatted.TryGetValue(Protocols.Snmp.Oid.SYSTEM_LOCATION, out string snmpLocation)) {
                data.TryAdd("location", new string[] { snmpLocation, "SNMP", string.Empty });
            }

            if (result is not null) {
                data.TryAdd("snmp profile", new string[] { profile.guid.ToString(), "SNMP", string.Empty });
            }

            if (!data.ContainsKey("type")) {
                IList<Variable> dot1dBaseBridgeAddress = Protocols.Snmp.Polling.SnmpQuery(ipAddress, profile, ["1.3.6.1.2.1.17.1.1.0"], Polling.SnmpOperation.Get);
                if (dot1dBaseBridgeAddress?.Count > 0) {
                    data.TryAdd("type", new string[] { "Switch", "SNMP", string.Empty });
                }
            }

            if (data.TryGetValue("type", out string[] type) && profile is not null) {
                switch (type[0].ToLower().Trim()) {
                case "fax":
                case "multiprinter":
                case "ticket printer":
                case "printer":
                    IList<Variable> printerResult = Protocols.Snmp.Polling.SnmpQuery(ipAddress, profile, Protocols.Snmp.Oid.PRINTERS_OID, Polling.SnmpOperation.Get);
                    Dictionary<string, string> printerFormatted = Protocols.Snmp.Polling.ParseResponse(printerResult);
                    if (printerFormatted is not null && printerFormatted.TryGetValue(Protocols.Snmp.Oid.PRINTER_MODEL, out string snmpModel)) {
                        data.TryAdd("model", new string[] { snmpModel, "SNMP", string.Empty });
                    }
                    if (printerFormatted is not null && printerFormatted.TryGetValue(Protocols.Snmp.Oid.PRINTER_SERIAL_NO, out string snmpSerialNo)) {
                        data.TryAdd("serial number", new string[] { snmpSerialNo, "SNMP", string.Empty });
                    }
                    break;

                case "firewall":
                case "router":
                case "switch":
                    string interfaces = Protocols.Snmp.Polling.FetchInterfaces(ipList[0], profile);
                    if (interfaces is  null) break;
                    data.TryAdd(".interfaces", new string[] { interfaces, "SNMP", string.Empty });
                    break;
                }
            }
        }

        if (cancellationToken.IsCancellationRequested) {
            return null;
        }

        return data;
    }

    private static void ParseSnmpAttributes() {

    }

    public static byte[] SingleUserSerialize(Dictionary<string, string> parameters) {
        if (parameters is null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

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

        Dictionary<string, string> fetch = Protocols.Ldap.AdFetch(target);
        if (fetch is null) {
            return null;
        }

        ConcurrentDictionary<string, string[]> data = new ConcurrentDictionary<string, string[]>();

        foreach (KeyValuePair<string, string> o in fetch) {
            data.TryAdd(o.Key, new string[] { o.Value.ToString(), "LDAP", string.Empty });
        }

        return data;
    }

    public static byte[] DevicesTask(HttpListenerContext ctx, Dictionary<string, string> parameters, string origin) {
        if (parameters is null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        parameters.TryGetValue("range", out string range);
        parameters.TryGetValue("domain", out string domain);

        using StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding);
        string payload = reader.ReadToEnd();
        string[] payloadLines = payload.Split("\n");

        string dns = null;
        string wmi = null;
        string ldap = null;
        string portScan = null;
        string retriesStr = null;
        string intervalStr = null;

        string snmp2 = null;
        string[] snmp2Profiles = null;
        
        string snmp3 = null;
        string[] snmp3Profiles = null;

        for (int i = 0; i < payloadLines.Length; i++) {
            if (payloadLines[i].StartsWith("dns=")) {
                dns = payloadLines[i][4..].Trim();
            }
            else if (payloadLines[i].StartsWith("wmi=")) {
                wmi = payloadLines[i][4..].Trim();
            }
            else if (payloadLines[i].StartsWith("ldap=")) {
                ldap = payloadLines[i][9..].Trim();
            }
            else if (payloadLines[i].StartsWith("portscan=")) {
                portScan = payloadLines[i][9..].Trim();
            }
            else if (payloadLines[i].StartsWith("retries=")) {
                retriesStr = payloadLines[i][8..].Trim();
            }
            else if (payloadLines[i].StartsWith("interval=")) {
                intervalStr = payloadLines[i][9..].Trim();
            }
            else if (payloadLines[i].StartsWith("snmp2=")) {
                snmp2 = payloadLines[i][6..].Trim();
            }
            else if (payloadLines[i].StartsWith("snmp3=")) {
                snmp3 = payloadLines[i][6..].Trim();
            }
            else if (payloadLines[i].StartsWith("snmp2profiles=")) {
                snmp2Profiles = payloadLines[i][14..].Trim().Split(',');
            }
            else if (payloadLines[i].StartsWith("snmp3profiles=")) {
                snmp3Profiles = payloadLines[i][14..].Trim().Split(',');
            }
        }

        dns         ??= "false";
        wmi         ??= "false";
        ldap        ??= "false";
        snmp2       ??= "false";
        snmp3       ??= "false";
        portScan    ??= "false";
        retriesStr  ??= "0";
        intervalStr ??= "-1";

        SnmpProfiles.Profile[] snmpProfiles = SnmpProfiles.Load();

        if (snmp2.Equals("true") && snmp2Profiles is null) {
            snmp2Profiles = snmpProfiles.Where(o=>o.version != 3).Select(o=>o.guid.ToString()).ToArray();
        }

        if (snmp3.Equals("true") && snmp3Profiles is null) {
            snmp3Profiles = snmpProfiles.Where(o => o.version == 3).Select(o => o.guid.ToString()).ToArray();
        }

        if (!int.TryParse(retriesStr, out int retries)) { retries = 0; }

        float interval = intervalStr switch {
            "0" => .5f,
            "1" => 1,
            "2" => 2,
            "3" => 4,
            "4" => 6,
            "5" => 8,
            "6" => 12,
            "7" => 24,
            "8" => 48,
            _ => 0
        };

        string[] hosts;

        if (!String.IsNullOrEmpty(range)) {
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

            for (uint i = intFrom; i < intTo + 1 && i < uint.MaxValue - 1; i++) {
                byte[] bytes = BitConverter.GetBytes(i);
                Array.Reverse(bytes);
                hosts[i - intFrom] = string.Join(".", bytes);
            }
        }
        else if (!String.IsNullOrEmpty(domain)) {
            hosts = OperatingSystem.IsWindows() ? Protocols.Ldap.GetAllWorkstations(domain) : Array.Empty<string>();
            if (hosts is null) return Data.CODE_FAILED.Array;
        }
        else if (parameters.ContainsKey("update")) {
            IEnumerable<Database.Entry> values = DatabaseInstances.devices.dictionary.Values;
            List<string> gist = new List<string>(values.Count());
            foreach (Database.Entry entry in values) {
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
            dns?.Equals("true") ?? false,
            wmi?.Equals("true") ?? false,
            ldap?.Equals("true") ?? false,
            null,
            portScan,
            retries,
            interval,
            origin
        );
    }
    public static byte[] DevicesTask(string[] hosts, bool dns, bool wmi, bool ldap, SnmpProfiles.Profile[] snmpProfiles, string portScan, int retries, float interval, string origin) {
        if (task is not null) return Data.CODE_OTHER_TASK_IN_PROGRESS.Array;
        if (result is not null) return Data.CODE_OTHER_TASK_IN_PROGRESS.Array;

        int totalFetched = 0;
        int totalRetries = 0;

        Thread thread = new Thread(async () => {
            const int WINDOW = 32;
            ConcurrentDictionary<string, ConcurrentDictionary<string, string[]>> dataset = new ConcurrentDictionary<string, ConcurrentDictionary<string, string[]>>();

            task.status = TaskWrapper.TaskStatus.Running;

            List<string> queue = new List<string>(hosts);
            List<string> redo = new List<string>();

            while (!task.cancellationToken.IsCancellationRequested) {

                while (queue.Count > 0) {
                    int size = Math.Min(WINDOW, queue.Count);

                    List<Task<ConcurrentDictionary<string, string[]>>> tasks = new List<Task<ConcurrentDictionary<string, string[]>>>(size);
                    for (int i = 0; i < size; i++) {
                        tasks.Add(SingleDeviceAsync(queue[i], dns, wmi, ldap, snmpProfiles, portScan, false, task.cancellationToken));
                    }

                    ConcurrentDictionary<string, string[]>[] result = await Task.WhenAll(tasks);

                    if (task.cancellationToken.IsCancellationRequested) {
                        break;
                    }

                    for (int i = 0; i < size; i++) {
                        if (result[i] is null) { //unreachable
                            redo.Add(queue[i]);
                        }
                        else if (!result[i].IsEmpty) {
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
                    task.status = TaskWrapper.TaskStatus.Idle;

                    KeepAlive.Broadcast($"{{\"action\":\"update-fetch\",\"type\":\"devices\",\"task\":{Encoding.UTF8.GetString(Status())}}}", "/fetch/status");

                    await task.SleepAsync((int)(interval * 3_600_000), 60_000);
                    if (task.cancellationToken.IsCancellationRequested) {
                        break;
                    }

                    task.status = TaskWrapper.TaskStatus.Running;

                    KeepAlive.Broadcast($"{{\"action\":\"update-fetch\",\"type\":\"devices\",\"task\":{Encoding.UTF8.GetString(Status())}}}", "/fetch/status");
                }
                else {
                    break;
                }
            }

            if (task.cancellationToken.IsCancellationRequested) {
                KeepAlive.Broadcast("{\"action\":\"abort-fetch\",\"type\":\"devices\"}"u8.ToArray(), "/fetch/status");
                Logger.Action(origin, "Devices fetch task aborted");

                task?.Dispose();
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
            IEnumerable<Database.Entry> values = DatabaseInstances.users.dictionary.Values;
            List<string> users = new List<string>(values.Count());
            foreach (Database.Entry entry in values) {
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

            string[] users = OperatingSystem.IsWindows() ? Protocols.Ldap.GetAllUsers(domain) : Array.Empty<string>();
            if (users is null) return Data.CODE_FAILED.Array;

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

            task.status = TaskWrapper.TaskStatus.Running;

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

        if (parameters is null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        parameters.TryGetValue("condition", out string targetAttribute);
        parameters.TryGetValue("action", out string action);

        Database.SaveMethod saveMethod = action switch {
            "0" => Database.SaveMethod.ignore,
            "2" => Database.SaveMethod.overwrite,
            "3" => Database.SaveMethod.append,
            "4" => Database.SaveMethod.merge,
            _   => Database.SaveMethod.createnew
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
                if (key[i].Length == 0) continue;
                if (values.ContainsKey(key[i])) continue;
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
                    origin = origin
                });
            }

            if (pair.Value.TryGetValue(targetAttribute, out string[] targetValue)) { //existing
                if (values.TryGetValue(targetValue[0], out string file)) {

                    if (database.dictionary.TryGetValue(file, out Database.Entry oldEntry)) {
                        //keep old name if it exists
                        if (oldEntry.attributes.TryGetValue("name", out Database.Attribute oldName)
                            && String.IsNullOrEmpty(oldName.value)) {
                            attributes.AddOrUpdate("name", oldName, (_, _) => oldName);
                        }

                        //keep old type if it exists
                        if (oldEntry.attributes.TryGetValue("type", out Database.Attribute oldType)
                            && String.IsNullOrEmpty(oldType.value)) {
                            attributes.AddOrUpdate("type", oldType, (_, _) => oldType);
                        }
                    }

                    database.Save(file, attributes, saveMethod, origin);
                }
            }
            else { //new
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
}

file sealed class FetchedDataJsonConverter : JsonConverter<Dictionary<string, string>> {
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
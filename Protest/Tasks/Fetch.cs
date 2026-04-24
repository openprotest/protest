using Lextm.SharpSnmpLib;
using Protest.Http;
using Protest.Protocols.Snmp;
using Protest.Tools;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Data;
using System.DirectoryServices;
using System.IO;
using System.Net;
using System.Net.NetworkInformation;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;

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
        public int    successful;
        public int    unsuccessful;
        public ConcurrentDictionary<string, ConcurrentDictionary<string, string[]>> dataset;
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
    public static async Task<ConcurrentDictionary<string, string[]>> SingleDeviceAsync(string target, bool useDns, bool useWmi, bool useLdap, SnmpProfiles.Profile[] snmpProfiles, string argPortScan, bool asynchronous, CancellationToken token) {
        PingReply reply = null;
        try {
            using Ping ping = new Ping();
            reply = await ping.SendPingAsync(target, 1500);
            if (reply.Status != IPStatus.Success) {
                reply = await ping.SendPingAsync(target, 1500);
            }
        }
#if DEBUG
        catch (Exception ex) {
            Logger.Error(ex);
        }
#else
        catch { }
#endif

        if (reply?.Status == IPStatus.Success) {
            ConcurrentDictionary<string, string[]> data = SingleDevice(target, useDns, useWmi, useLdap, snmpProfiles , argPortScan, asynchronous, token);
            return data;
        }

        return null;
    }
    public static ConcurrentDictionary<string, string[]> SingleDevice(string target, bool useDns, bool useWmi, bool useLdap, SnmpProfiles.Profile[] snmpProfiles, string argPortScan, bool asynchronous, CancellationToken token) {
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
#if DEBUG
            catch (Exception ex) {
                Logger.Error(ex);
            }
#else
            catch { }
#endif
        }
        else {
            hostname = target;
            try {
                ipList = Dns.GetHostAddresses(target).Where(o => !IPAddress.IsLoopback(o)).ToArray();
            }
#if DEBUG
            catch (Exception ex) {
                Logger.Error(ex);
            }
#else
            catch { }
#endif
        }

        if (ipList.Length == 0) {
            return null;
        }

        Dictionary<string, string> wmi = new Dictionary<string, string>();
        Dictionary<string, string> ad = new Dictionary<string, string>();
        string netBios = Protocols.NetBios.GetBiosName(ipList.First()?.ToString());

        Thread tWmi = null, tAd = null, tPortScan = null;

        if (useWmi) {
            tWmi = new Thread(() => {
                if (!OperatingSystem.IsWindows()) { return; }
                wmi = Protocols.Wmi.WmiFetch(target, token);

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

        StringBuilder portsBuilder = new StringBuilder();
        if (argPortScan is not null) {
            tPortScan = new Thread(() => {

                switch (argPortScan) {

                case "wellknown": {
                    bool[] ports = PortScan.PortsScanAsync(target, 1, 1023, 500, true, token).GetAwaiter().GetResult();
                    for (int i = 0; i < ports.Length; i++) {
                        if (!ports[i]) continue;
                        portsBuilder.Append(portsBuilder.Length == 0 ? i + 1 : $"; {i + 1}");
                    }
                    break;
                }

                case "extended": {
                    bool[] ports = PortScan.PortsScanAsync(target, 1, 8191, 500, true, token).GetAwaiter().GetResult();
                    for (int i = 0; i < ports.Length; i++) {
                        if (!ports[i]) continue;
                        portsBuilder.Append(portsBuilder.Length == 0 ? i + 1 : $"; {i + 1}");
                    }
                    break;
                }

                default: {
                    short[] portsPool = PortScan.BASIC_PORTS;
                    bool[] ports = PortScan.PortsScanAsync(target, portsPool, 1000, true, token).GetAwaiter().GetResult();
                    for (int i = 0; i < ports.Length; i++) {
                        if (!ports[i]) continue;
                        portsBuilder.Append(portsBuilder.Length == 0 ? portsPool[i] : $"; {portsPool[i]}");
                    }
                    break;
                }
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
            if (token.IsCancellationRequested) {
                return null;
            }

            tAd?.Start();
            tAd?.Join();
            if (token.IsCancellationRequested) {
                return null;
            }

            tPortScan?.Start();
            tPortScan?.Join();
            if (token.IsCancellationRequested) {
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

        string portsString = portsBuilder.ToString();
        if (!String.IsNullOrEmpty(portsString)) {
            data.TryAdd("ports", new string[] { portsString, "Port-scan", string.Empty });
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

        if (!wmi.ContainsKey("manufacturer") && !String.IsNullOrEmpty(mac)) {
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

        if (!data.ContainsKey("type") && data.TryGetValue("operating system", out string[] value)) {
            string os = value[0];
            if (os.Contains("server", StringComparison.CurrentCultureIgnoreCase)) { //if os is windows server, set type as server
                data.TryAdd("type", new string[] { "Server", "LDAP", string.Empty });
            }
        }

        if (token.IsCancellationRequested) {
            return null;
        }

        //if no type found, try guessing from ports
        if (!data.ContainsKey("type") && !String.IsNullOrEmpty(portsString)) {
            int[] ports = portsString.Split(';').Select(o => int.Parse(o.Trim())).ToArray();

            if (ports.Contains(445) && ports.Contains(3389) && (ports.Contains(53) || ports.Contains(67) || ports.Contains(389) || ports.Contains(636) || ports.Contains(853))) { //SMB, RDP, DNS, DHCP, LDAP
                data.TryAdd("type", new string[] { "Server", "Port-scan", string.Empty });
            }
            else if (ports.Contains(445) && ports.Contains(3389)) { //SMB, RDP
                data.TryAdd("type", new string[] { "Workstation", "Port-scan", string.Empty });
            }
            else if (ports.Contains(515) || ports.Contains(631) || ports.Contains(9100)) { //LPD, IPP, Print-server
                data.TryAdd("type", new string[] { "Printer", "Port-scan", string.Empty });
            }
            else if (ports.Contains(6789)) { //ap
                data.TryAdd("type", new string[] { "Access point", "Port-scan", string.Empty });
            }
            else if (ports.Contains(7442) || ports.Contains(7550)) { //cam
                data.TryAdd("type", new string[] { "Camera", "Port-scan", string.Empty });
            }
        }

        if (!data.ContainsKey("type") && wmi.Count > 0) {
            data.TryAdd("type", new string[] { "Workstation", "WMI", string.Empty });
        }

        if (token.IsCancellationRequested) {
            return null;
        }

        if (snmpProfiles is not null) {
            IList<Variable> snmpResult;
            SnmpProfiles.Profile profile;

            if (snmpProfiles.Length == 0) {
                snmpResult = null;
                profile = null;
            }
            else if (snmpProfiles.Length == 1) {
                snmpResult = Protocols.Snmp.Polling.SnmpQuery(ipAddress, snmpProfiles[0], Protocols.Snmp.Oid.GENERIC_OID, Polling.SnmpOperation.Get);
                profile = snmpProfiles[0];
            }
            else {
                (snmpResult, profile) = Protocols.Snmp.Polling.SnmpQueryTrialAndError(ipAddress, snmpProfiles, Protocols.Snmp.Oid.GENERIC_OID, token);
            }

            Dictionary<string, string> formatted = Protocols.Snmp.Polling.ParseResponse(snmpResult);
            if (formatted is not null && formatted.TryGetValue(Protocols.Snmp.Oid.SYSTEM_DESCRIPTOR, out string snmpDescription)) {
                data.TryAdd("descriptor", new string[] { snmpDescription, "SNMP", string.Empty });
            }
            if (formatted is not null && formatted.TryGetValue(Protocols.Snmp.Oid.SYSTEM_NAME, out string snmpHostname) && !String.IsNullOrEmpty(snmpHostname)) {
                data.TryAdd("hostname", new string[] { snmpHostname, "SNMP", string.Empty });
            }
            if (formatted is not null && formatted.TryGetValue(Protocols.Snmp.Oid.SYSTEM_LOCATION, out string snmpLocation) && !String.IsNullOrEmpty(snmpLocation)) {
                data.TryAdd("location", new string[] { snmpLocation, "SNMP", string.Empty });
            }
            if (formatted is not null && formatted.TryGetValue(Protocols.Snmp.Oid.SYSTEM_CONTACT, out string snmpContact) && !String.IsNullOrEmpty(snmpContact)) {
                data.TryAdd("contact", new string[] { snmpContact, "SNMP", string.Empty });
            }

            if (snmpResult is not null) {
                data.TryAdd("snmp profile", new string[] { profile.guid.ToString(), "SNMP", string.Empty });
            }

            if (token.IsCancellationRequested) return null;

            if (!data.ContainsKey("mac address")) {
                IList<Variable> macAddressResult = Protocols.Snmp.Polling.SnmpQuery(ipAddress, profile, [Protocols.Snmp.Oid.LLDP_LOCAL_SYS_DATA], Polling.SnmpOperation.Walk);
            
                if (macAddressResult is not null) {
                    Dictionary<string, byte[]> parsed = Protocols.Snmp.Polling.ParseResponseBytes(macAddressResult);
                    if (parsed.TryGetValue(Protocols.Snmp.Oid.LLDP_LOCAL_CHASSIS_ID_TYPE, out byte[] chassisIdType)
                        && chassisIdType.Length >= 3 && chassisIdType[2] == 4
                        && parsed.TryGetValue(Protocols.Snmp.Oid.LLDP_LOCAL_CHASSIS_ID, out byte[] chassisId)
                        && chassisId.Length == 8
                        && chassisId.Any(o => o != 0)) {

                        string macAddress = BitConverter.ToString(chassisId, 2).Replace('-', ':');
                        data.TryAdd("mac address", new string[] { String.Join("; ", macAddress), "SNMP", string.Empty });
                    }
                }
            }

            if (!data.ContainsKey("type")) {
                if (token.IsCancellationRequested) return null;
                IList<Variable> dot1dBaseBridgeAddress = Protocols.Snmp.Polling.SnmpQuery(ipAddress, profile, ["1.3.6.1.2.1.17.1.1.0"], Polling.SnmpOperation.Get);
                if (dot1dBaseBridgeAddress?.Count > 0) {
                    data.TryAdd("type", new string[] { "Switch", "SNMP", string.Empty });
                }
            }

            if (data.TryGetValue("type", out string[] type) && profile is not null) {
                if (token.IsCancellationRequested) return null;

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

        if (token.IsCancellationRequested) {
            return null;
        }

        return data;
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
                ldap = payloadLines[i][5..].Trim();
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
                snmp2Profiles = payloadLines[i][14..].ToLower().Trim().Split(',');
            }
            else if (payloadLines[i].StartsWith("snmp3profiles=")) {
                snmp3Profiles = payloadLines[i][14..].ToLower().Trim().Split(',');
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
        List<SnmpProfiles.Profile> filteredSnmpProfiles = new List<SnmpProfiles.Profile>();

        if (snmp2.Equals("true")) {
            snmp2Profiles ??= snmpProfiles.Where(o=>o.version != 3).Select(o=>o.guid.ToString()).ToArray();

            filteredSnmpProfiles.AddRange(
                snmpProfiles.Where(o => o.version != 3 && snmp2Profiles.Contains(o.guid.ToString().ToLower()))
            );
        }

        if (snmp3.Equals("true")) {
            snmp3Profiles ??= snmpProfiles.Where(o=>o.version == 3).Select(o=>o.guid.ToString()).ToArray();

            filteredSnmpProfiles.AddRange(
                snmpProfiles.Where(o => o.version == 3 && snmp3Profiles.Contains(o.guid.ToString().ToLower()))
            );
        }

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

        int.TryParse(retriesStr, out int retries);

        return DevicesTask(
            hosts,
            dns?.Equals("true") ?? false,
            wmi?.Equals("true") ?? false,
            ldap?.Equals("true") ?? false,
            filteredSnmpProfiles.ToArray(),
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

            task?.status = TaskWrapper.TaskStatus.Running;

            List<string> queue = new List<string>(hosts);
            List<string> redo = new List<string>();

            while (task is not null && !task.cancellationToken.IsCancellationRequested) {

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

            if (task is not null) {
                if (task.cancellationToken.IsCancellationRequested) {
                    KeepAlive.Broadcast("{\"action\":\"abort-fetch\",\"type\":\"devices\"}"u8.ToArray(), "/fetch/status");
                    Logger.Action(origin, "Fetch", "Devices fetch task aborted");

                    task.Dispose();
                    task = null;
                    return;
                }

                result = new Result() {
                    name         = task.name,
                    type         = Type.devices,
                    started      = task.started,
                    finished     = DateTime.UtcNow.Ticks,
                    dataset      = dataset,
                    successful   = task.CompletedSteps,
                    unsuccessful = task.TotalSteps - task.CompletedSteps,
                };
            }

            KeepAlive.Broadcast($"{{\"action\":\"finish-fetch\",\"type\":\"devices\",\"task\":{Encoding.UTF8.GetString(Status())}}}", "/fetch/status");
            Logger.Action(origin, "Fetch", "Fetch task finished");
        });

        KeepAlive.Broadcast("{\"action\":\"start-fetch\",\"type\":\"devices\"}"u8.ToArray(), "/fetch/status");
        Logger.Action(origin, "Fetch", "Devices fetch task started");

        task = new TaskWrapper("Fetch devices") {
            thread = thread,
            author = origin,
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
            Logger.Action(origin, "Fetch", "Users fetch task finished");
        });

        KeepAlive.Broadcast("{\"action\":\"start-fetch\",\"type\":\"users\"}"u8.ToArray(), "/fetch/status");
        Logger.Action(origin, "Fetch", "Users fetch task started");

        task = new TaskWrapper("Fetch users") {
            thread = thread,
            author = origin,
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
            response.Append($"\"name\":\"{Data.EscapeJsonText(result.Value.name)}\",");
            response.Append($"\"type\":\"{result.Value.type}\",");
            response.Append($"\"status\":\"pending\",");
            response.Append($"\"started\":\"{result.Value.started}\",");
            response.Append($"\"finished\":\"{result.Value.finished}\",");
            response.Append($"\"successful\":\"{result.Value.successful}\",");
            response.Append($"\"unsuccessful\":\"{result.Value.unsuccessful}\"");
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
                response.Append($"\"completed\":\"{task.CompletedSteps}\",");
                response.Append($"\"total\":\"{task.TotalSteps}\",");
                response.Append($"\"etc\":\"{task.CalculateEtc()}\"");
                response.Append('}');
                return Encoding.UTF8.GetBytes(response.ToString());
            }
            else {
                response.Append('{');
                response.Append($"\"name\":\"{Data.EscapeJsonText(task.name)}\",");
                response.Append($"\"status\":\"{task.status}\",");
                response.Append($"\"started\":\"{task.started}\",");
                response.Append($"\"completed\":\"{task.CompletedSteps}\",");
                response.Append($"\"total\":\"{task.TotalSteps}\",");
                response.Append($"\"etc\":\"{task.CalculateEtc()}\"");
                response.Append('}');
                return Encoding.UTF8.GetBytes(response.ToString());
            }
        }

        return "{\"status\":\"none\"}"u8.ToArray();
    }

    public static byte[] CancelTask(string origin) {
        if (task is null) return Data.CODE_TASK_DONT_EXIST.Array;

        KeepAlive.Broadcast("{\"action\":\"cancel-fetch\",\"type\":\"devices\"}"u8.ToArray(), "/fetch/status");
        task.RequestCancel(origin);
        //wrapper = null;

        return Data.CODE_OK.Array;
    }

    public static byte[] ApproveLastTask(Dictionary<string, string> parameters, string origin) {
        if (result is null) return Data.CODE_TASK_DONT_EXIST.Array;

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

        if (result.Value.type == Type.devices) {
            Logger.Action(origin, "Fetch", "Approve fetched devices");
            KeepAlive.Broadcast("{\"action\":\"approve-fetch\",\"type\":\"devices\"}"u8.ToArray(), "/fetch/status");

            database = DatabaseInstances.devices;
        }
        else if (result.Value.type == Type.users) {
            Logger.Action(origin, "Fetch", "Approve fetched users");
            KeepAlive.Broadcast("{\"action\":\"approve-fetch\",\"type\":\"users\"}"u8.ToArray(), "/fetch/status");

            database = DatabaseInstances.users;
        }
        else {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        Dictionary<string, string> conflicted = new Dictionary<string, string>();

        foreach (KeyValuePair<string, Database.Entry> entry in database.dictionary) {
            if (!entry.Value.attributes.TryGetValue(targetAttribute, out Database.Attribute attribute)) continue;

            string[] key = attribute.value.Split(';').Select(o => o.Trim().ToLower()).ToArray();

            for (int i = 0; i < key.Length; i++) {
                if (key[i].Length == 0) continue;
                if (conflicted.ContainsKey(key[i])) continue;
                conflicted.Add(key[i], entry.Value.filename);
            }
        }

        long date = DateTime.UtcNow.Ticks;

        foreach (KeyValuePair<string, ConcurrentDictionary<string, string[]>> pair in result.Value.dataset) {
            ConcurrentDictionary<string, Database.Attribute> attributes = new ConcurrentDictionary<string, Database.Attribute>();
            foreach (KeyValuePair<string, string[]> attr in pair.Value) {
                attributes.TryAdd(attr.Key, new Database.Attribute() {
                    value  = attr.Value[0],
                    date   = date,
                    origin = origin
                });
            }

            if (pair.Value.TryGetValue(targetAttribute, out string[] targetValue)
                && conflicted.TryGetValue(targetValue[0], out string file)
                && database.dictionary.TryGetValue(file, out Database.Entry oldEntry)) { //conflict triggered

                //keep old name if exists
                if (oldEntry.attributes.TryGetValue("name", out Database.Attribute oldName) && !String.IsNullOrEmpty(oldName.value)) {
                    attributes.AddOrUpdate("name", oldName, (_, _) => oldName);
                }

                //keep old type if exists
                if (oldEntry.attributes.TryGetValue("type", out Database.Attribute oldType) && !String.IsNullOrEmpty(oldType.value)) {
                    attributes.AddOrUpdate("type", oldType, (_, _) => oldType);
                }

                database.Save(file, attributes, saveMethod, origin);
            }
            else {
                database.Save(null, attributes, saveMethod, origin);
            }
        }

        conflicted.Clear();

        if (result.Value.type == Type.devices) {
            KeepAlive.Broadcast("{\"action\":\"approve-fetch\",\"type\":\"devices\"}"u8.ToArray(), "/fetch/status");
            Logger.Action(origin, "Fetch", "Devices fetched data approved");
        }
        else if (result.Value.type == Type.users) {
            KeepAlive.Broadcast("{\"action\":\"approve-fetch\",\"type\":\"users\"}"u8.ToArray(), "/fetch/status");
            Logger.Action(origin, "Fetch", "Users fetched data approved");
        }

        result = null;
        task = null;
        return Data.CODE_OK.Array;
    }

    public static byte[] DiscardLastTask(string origin) {
        KeepAlive.Broadcast("{\"action\":\"discard-fetch\",\"type\":\"devices\"}"u8.ToArray(), "/fetch/status");
        Logger.Action(origin, "Fetch", "Discard fetched data");

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
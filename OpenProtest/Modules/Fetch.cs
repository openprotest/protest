using System;
using System.Linq;
using System.Collections;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using System.Net;
using System.Net.NetworkInformation;
using System.DirectoryServices;

static class Fetch {
    public static byte[] FetchEquip(string[] para, string performer) {
        string domain = null;
        string ip = null;
        string portscan = null;
        string dublicate = null;
        string unreachable = null;
        string implevel = null;
        string un = null;
        string ps = null;

        for (int i = 1; i < para.Length; i++) {
            if (para[i].StartsWith("ip=")) ip = para[i].Substring(3);
            if (para[i].StartsWith("domain=")) domain = para[i].Substring(7);
            if (para[i].StartsWith("portscan=")) portscan = para[i].Substring(9);
            if (para[i].StartsWith("dublicate=")) dublicate = para[i].Substring(10);
            if (para[i].StartsWith("unreachable=")) unreachable = para[i].Substring(12);
            if (para[i].StartsWith("implevel=")) implevel = para[i].Substring(9);
            if (para[i].StartsWith("un=")) un = para[i].Substring(3);
            if (para[i].StartsWith("ps=")) ps = para[i].Substring(3);
        }

        Int32.TryParse(unreachable, out int intUnreachable);

        NoSQL.SaveMethod saveMethod = NoSQL.SaveMethod.Append;
        if (dublicate == "ig") saveMethod = NoSQL.SaveMethod.Ignore;
        else if (dublicate == "ne") saveMethod = NoSQL.SaveMethod.CreateNew;
        else if (dublicate == "ov") saveMethod = NoSQL.SaveMethod.Overwrite;
        else if (dublicate == "ap") saveMethod = NoSQL.SaveMethod.Append;
        else if (dublicate == "me") saveMethod = NoSQL.SaveMethod.Merge;
        
        string[] hosts;

        if (domain is null) { //ip range
            string[] ipSplit = ip.Split('-');
            if (ipSplit.Length < 2) return Tools.INF.Array;

            byte[] arrFrom = IPAddress.Parse(ipSplit[0]).GetAddressBytes();
            byte[] arrTo = IPAddress.Parse(ipSplit[1]).GetAddressBytes();
            Array.Reverse(arrFrom);
            Array.Reverse(arrTo);

            uint intFrom = BitConverter.ToUInt32(arrFrom, 0);
            uint intTo = BitConverter.ToUInt32(arrTo, 0);

            hosts = new string[intTo - intFrom + 1];
            for (uint i = intFrom; i < intTo + 1 && i < UInt32.MaxValue - 1; i++)
                hosts[i - intFrom] = i.ToString();
            
        } else { //domain
            hosts = ActiveDir.GetAllWorkstations(domain);
            if (hosts is null) return Tools.INV.Array;
        }

        Hashtable hashcopy = new Hashtable();
        foreach (DictionaryEntry o in NoSQL.equip) 
            hashcopy.Add(o.Key, o.Value);        

        ProTasks task = null;

        Thread thread = new Thread(async ()=> {
            const int WINDOW = 32;
            const int MAX_RETRY = 1;
            int retry_count = 0;
            int index = 0;

            List<string> list = new List<string>();
            List<string> fetched = new List<string>();
            List<string> unreach = new List<string>();
            List<string> noinfo = new List<string>();
            List<string> error = new List<string>();

            for (int i=0; i<hosts.Length; i++) 
                list.Add(hosts[i]);

            task.status = "Fetching";

            while (true) {
                List<Task<string>> tasks = new List<Task<string>>();
                while (list.Count > index && tasks.Count < WINDOW) 
                    tasks.Add(SingleFetchEquip(list[index++], performer, hashcopy, domain, ip, portscan, saveMethod, unreachable, implevel, un, ps));

                index = 0;

                string[] result = await Task.WhenAll(tasks);

                for (int i = 0; i < result.Length; i++) 
                    if (result[i] == "done") fetched.Add(list[i]);
                    else if (result[i] == "unreachable") unreach.Add(list[i]);
                    else if (result[i] == "noinfo") noinfo.Add(list[i]);
                    else if (result[i] == "invalid" || result[i] == "error") error.Add(list[i]);

                for (int i = 0; i < result.Length; i++)
                    list.RemoveAt(0);

                task.stepsCompleted = fetched.Count + noinfo.Count + error.Count;
                task.report = $"Fetched: {fetched.Count}, No info: {noinfo.Count}, Error: {error.Count}";

                if (list.Count == 0 && unreach.Count == 0) break;

                if (list.Count == 0) {
                    List<string> temp = list; //swap
                    list = unreach;
                    unreach = temp;

                    if (++retry_count > MAX_RETRY) break;

                    task.status = "Sleeping";
                    Thread.Sleep(intUnreachable * 3600000); //hours to millisec
                    task.status = "Fetching";
                }
            }

            NoSQL.BroadcastMessage("update_equip");

            task.Complete();
        });

        task = new ProTasks(thread, "Fetch equipment", performer);
        task.steps = hosts.Length;
        
        return Tools.OK.Array;
    }

    public static async Task<string> SingleFetchEquip(string host, string performer, Hashtable hashcopy,
        string domain, string ip, string portscan, NoSQL.SaveMethod saveMethod, string unreachable, string implevel, string un, string ps) {

        try {
            IPAddress ipAddr = null;
            if (long.TryParse(host, out long ulAddr)) {
                ipAddr = new IPAddress(ulAddr);

            } else
                try {
                    IPAddress[] ipAddresses = await Dns.GetHostAddressesAsync(host);
                    if (ipAddresses.Length > 0)
                        for (int i = 0; i < ipAddresses.Length; i++)
                            if (ipAddresses[i].AddressFamily== System.Net.Sockets.AddressFamily.InterNetwork) {
                                ipAddr = ipAddresses[i];
                                break;
                            }

                    if (ipAddr is null) return "invalid";

                } catch { return "invalid"; }
                                    
            byte[] bytes = ipAddr.GetAddressBytes();
            Array.Reverse(bytes);
            ipAddr = new IPAddress(bytes);
            
            bool ping;
            try {
                PingReply reply = await new Ping().SendPingAsync(ipAddr.ToString(), 2000);
                ping = (reply.Status == IPStatus.Success);
            } catch {
                ping = false;
            }

            if (!ping) return "unreachable";

            LastSeen.Seen(ipAddr.ToString());

            string verify = Wmi.WmiVerify(ipAddr.ToString(), false);

            if (portscan == "ba") {
                bool[] ports = Tools.PortsScanAsync(ipAddr.ToString(), Knowlage.basic_ports).Result;
                string strPorts = "";
                for (int i = 0; i < ports.Length; i++)
                    if (ports[i])
                        strPorts += (strPorts.Length == 0) ? Knowlage.basic_ports[i].ToString() : $"; {Knowlage.basic_ports[i].ToString()}";
                if (strPorts.Length > 0) verify += $"PORTS{(char)127}{strPorts}{(char)127}";

            } else if (portscan == "fu") {
                ushort[] known_ports = new ushort[Knowlage.protocol.Count];
                int count = 0;
                foreach (DictionaryEntry o in Knowlage.protocol)
                    known_ports[count++] = (ushort)o.Key;

                bool[] ports = Tools.PortsScanAsync(ipAddr.ToString(), Knowlage.basic_ports).Result;
                string strPorts = "";
                for (int i = 0; i < ports.Length; i++)
                    if (ports[i])
                        strPorts += (strPorts.Length == 0) ? Knowlage.basic_ports[i].ToString() : $"; {Knowlage.basic_ports[i].ToString()}";
                if (strPorts.Length > 0) verify += $"PORTS{(char)127}{strPorts}{(char)127}";
            }

            string[] split = verify.Split((char)127);

            if (split.Length < 4) return "noinfo";

            string v_ip = null;
            string v_mac = null;
            string v_hostname = null;

            for (int i = 0; i < split.Length - 1; i += 2) {
                if (split[i] == "IP") v_ip = split[i + 1];
                if (split[i] == "MAC ADDRESS") v_mac = split[i + 1].ToUpper();
                if (split[i] == "HOSTNAME") v_hostname = split[i + 1].ToUpper();
            }

            string filename = "";

            byte score = 0;
            foreach (DictionaryEntry o in hashcopy) { //find in db
                NoSQL.DbEntry entry = (NoSQL.DbEntry)o.Value;
                byte s = 0;

                if (v_ip != null) if (entry.hash.ContainsKey("IP") && ((string[])entry.hash["IP"])[0].ToString().Contains(v_ip)) s += 1;
                if (v_mac != null) if (entry.hash.ContainsKey("MAC ADDRESS") && ((string[])entry.hash["MAC ADDRESS"])[0].ToString().ToUpper().Contains(v_mac)) s += 4;
                if (v_hostname != null) if (entry.hash.ContainsKey("HOSTNAME") && ((string[])entry.hash["HOSTNAME"])[0].ToString().ToUpper().Contains(v_hostname)) s += 2;

                if (s > score) {
                    score = s;
                    filename = (string) o.Key;
                    if (s >= 5) break;
                }
            }

            if (filename.Length == 0) filename = DateTime.Now.Ticks.ToString();

            NoSQL.SaveEntry(split, filename, saveMethod, performer, false);

        } catch (Exception) {
            return "error";
        }
                
        return "done";
    }

    public static byte[] FetchUsers(string[] para, string performer) {
        string domain = null;
        string dublicate = null;
        string un = null;
        string ps = null;

        for (int i = 1; i < para.Length; i++) {
            if (para[i].StartsWith("domain=")) domain = para[i].Substring(7);
            if (para[i].StartsWith("dublicate=")) dublicate = para[i].Substring(10);
            if (para[i].StartsWith("un=")) un = para[i].Substring(3);
            if (para[i].StartsWith("ps=")) ps = para[i].Substring(3);
        }

        NoSQL.SaveMethod saveMethod = NoSQL.SaveMethod.Append;
        if (dublicate == "ig") saveMethod = NoSQL.SaveMethod.Ignore;
        else if (dublicate == "ne") saveMethod = NoSQL.SaveMethod.CreateNew;
        else if (dublicate == "ov") saveMethod = NoSQL.SaveMethod.Overwrite;
        else if (dublicate == "ap") saveMethod = NoSQL.SaveMethod.Append;
        else if (dublicate == "me") saveMethod = NoSQL.SaveMethod.Merge;

        Hashtable hashcopy = new Hashtable();
        foreach (DictionaryEntry o in NoSQL.users)
            hashcopy.Add(o.Key, o.Value);

        SearchResultCollection result = null;
        
        try {
            DirectoryEntry dir = ActiveDir.GetDirectoryEntry(domain);
            DirectorySearcher searcher = new DirectorySearcher(dir);
            searcher.Filter = "(&(objectClass=user)(objectCategory=person))";
            result = searcher.FindAll();
        } catch (Exception ex) {
            ErrorLog.Err(ex);
            return Tools.INV.Array;
        }

        if (result is null || result.Count == 0) return Tools.INV.Array;
        
        ProTasks task = null;

        Thread thread = new Thread(() => {
            int count = 0;
            
            foreach (SearchResult o in result) {
                SingleFetchUser(o, performer, hashcopy, domain, saveMethod, un, ps);

                if (++count % 50 == 0) {
                    task.stepsCompleted = count;
                    task.report = $"Fetched: {count}";
                }
            }

            task.stepsCompleted = count;
            task.report = $"Fetched: {count}";

            NoSQL.BroadcastMessage("update_users");

            task.Complete();
        });

        task = new ProTasks(thread, "Fetch users", performer);
        task.steps = result.Count;

        return Tools.OK.Array;
    }

    public static string SingleFetchUser(SearchResult user, string performer, Hashtable hashcopy,
        string domain, NoSQL.SaveMethod saveMethod, string un, string ps) {

        try {
            string verify = ActiveDir.ActiveDirVerify(user);
            string[] split = verify.Split((char)127);

            if (split.Length < 2)
                return "noinfo";

            string v_username = null;

            for (int i = 0; i < split.Length - 1; i += 2)
                if (split[i] == "USERNAME") v_username = split[i + 1];
            
            string filename = "";

            foreach (DictionaryEntry o in hashcopy) { //find in db
                NoSQL.DbEntry entry = (NoSQL.DbEntry)o.Value;
                if (v_username != null)
                    if (entry.hash.ContainsKey("USERNAME") && ((string[])entry.hash["USERNAME"])[0].ToString().Contains(v_username)) 
                        filename = (string)o.Key;
            }

            if (filename.Length == 0) filename = DateTime.Now.Ticks.ToString();

            NoSQL.SaveEntry(split, filename, saveMethod, performer, true);

        } catch (Exception) {
            return "error";
        }

        return "done";
    }

}
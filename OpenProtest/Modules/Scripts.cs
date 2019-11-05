using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.DirectoryServices;
using System.Net;
using System.Net.NetworkInformation;
using System.IO;
using System.Text.RegularExpressions;

public class ScriptNode {
    public string name;
    public string[] columns;
    public string[] values;
    public string[][] parameters;
    public ScriptSocket[] sockets;

    public ScriptNode[] sourceNodes;
    public ScriptResult result;
}

public class ScriptSocket {
    public char type;
    public string label;
    public ScriptNode node;
}

public class ScriptLink {
    public ScriptNode primaryNode;
    public ScriptNode secondaryNode;
    public ScriptSocket primary;
    public ScriptSocket secondary;
}

public class ScriptResult {
    public string[] header;
    public List<string[]> array = new List<string[]>();
}

static class Scripts {
    private const long QUARTER = 9000000000;

    private static readonly string DIR_SCRIPTS = $"{Directory.GetCurrentDirectory()}\\scripts";
    private static readonly string DIR_SCRIPTS_SCRIPTS = $"{Directory.GetCurrentDirectory()}\\scripts\\scripts";
    private static readonly string DIR_SCRIPTS_REPORTS = $"{Directory.GetCurrentDirectory()}\\scripts\\reports";
    
    private static readonly Hashtable tools = new Hashtable();
    private static string tools_payload = null;

    private static readonly object cache_lock = new object();
    private static byte[] adUserCache = null, adWorkstationCache = null, adGroupCache = null;
    private static long adUserCache_timestamp = 0, adWorkstationCache_timestamp = 0, adGroupCache_timestamp = 0;

    public static void LoadTools() {
        string FILE_SCRIPT = $"{Directory.GetCurrentDirectory()}\\scripts\\tools.txt";
        
        if (tools_payload is null)
            try {
                tools_payload = File.ReadAllText(FILE_SCRIPT);
                while(tools_payload.IndexOf("\t\t") > -1) tools_payload = tools_payload.Replace("\t\t", "\t");
            } catch (Exception ex) {
                ErrorLog.Err(ex);
            }

        string[] lines = tools_payload.Split('\n');
        for (int i = 0; i < lines.Length; i++) {
            lines[i] = lines[i].Trim();
            if (lines[i].StartsWith("#")) continue; //skip comments
            
            string[] split = lines[i].Split('\t');
            if (split.Length == 1) continue; //label

            string name = split[0].Trim();
            List<string[]> parameters = new List<string[]>();

            for (int j = 2; j < split.Length; j++) {
                string[] s = split[j].Split(',');
                if (s.Length < 2) continue;
                s = s.Select(o => o.Trim()).ToArray();
                parameters.Add(s);
            }

            tools.Add(name, parameters.ToArray());
            parameters.Clear();
        }
    }

    public static byte[] GetScriptTools() {
        if (tools_payload is null) return null;
        return Encoding.UTF8.GetBytes(tools_payload);
    }

    public static byte[] GetEquipColumns() {
        Hashtable hash = new Hashtable();
        StringBuilder sb = new StringBuilder();

        foreach (DictionaryEntry o in NoSQL.equip) {
            NoSQL.DbEntry entry = (NoSQL.DbEntry)o.Value;
            foreach (DictionaryEntry c in entry.hash) {
                string k = c.Key.ToString();
                if (hash.ContainsKey(k)) continue;
                hash.Add(k, null);
                sb.Append(sb.Length == 0 ? k : $"{(char)127}{k}");
            }
        }

        hash.Clear();
        return Encoding.UTF8.GetBytes(sb.ToString());
    }

    public static byte[] GetUserColumns() {
        Hashtable hash = new Hashtable();
        StringBuilder sb = new StringBuilder();

        foreach (DictionaryEntry o in NoSQL.users) {
            NoSQL.DbEntry entry = (NoSQL.DbEntry)o.Value;
            foreach (DictionaryEntry c in entry.hash) {
                string k = c.Key.ToString();
                if (hash.ContainsKey(k)) continue;
                hash.Add(k, null);
                sb.Append(sb.Length == 0 ? k : $"{(char)127}{k}");
            }
        }

        hash.Clear();
        return Encoding.UTF8.GetBytes(sb.ToString());
    }

    public static byte[] GetAdUserColumns() {
        if (!(adUserCache is null) && adUserCache_timestamp > DateTime.Now.Ticks - QUARTER)
            return adUserCache;

        Hashtable hash = new Hashtable();
        StringBuilder sb = new StringBuilder();

        string domain = null;
        try {
            domain = IPGlobalProperties.GetIPGlobalProperties()?.DomainName ?? null;
        } catch { }

        SearchResultCollection result = null;
        try {
            DirectoryEntry dir = ActiveDir.GetDirectoryEntry(domain);
            DirectorySearcher searcher = new DirectorySearcher(dir);
            searcher.Filter = "(&(objectClass=user)(objectCategory=person))";
            result = searcher.FindAll();
        } catch (Exception ex) {
            ErrorLog.Err(ex);
            return null;
        }

        if (result is null || result.Count == 0) return null;

        foreach (SearchResult o in result)
            foreach (DictionaryEntry e in o.Properties) {
                if (hash.ContainsKey(e.Key)) continue;
                hash.Add(e.Key, null);
                sb.Append(sb.Length == 0 ? e.Key : $"{(char)127}{e.Key}");
            }

        hash.Clear();

        lock (cache_lock) {
            adUserCache_timestamp = DateTime.Now.Ticks;
            adUserCache = Encoding.UTF8.GetBytes(sb.ToString());
            return adUserCache;
        }
    }

    public static byte[] GetAdWorkstationColumns() {
        if (!(adWorkstationCache is null) && adWorkstationCache_timestamp > DateTime.Now.Ticks - QUARTER)
            return adWorkstationCache;

        Hashtable hash = new Hashtable();
        StringBuilder sb = new StringBuilder();

        string domain = null;
        try {
            domain = IPGlobalProperties.GetIPGlobalProperties()?.DomainName ?? null;
        } catch { }

        SearchResultCollection result = null;
        try {
            DirectoryEntry dir = ActiveDir.GetDirectoryEntry(domain);
            DirectorySearcher searcher = new DirectorySearcher(dir);
            searcher.Filter = "(objectClass=computer)";
            result = searcher.FindAll();
        } catch (Exception ex) {
            ErrorLog.Err(ex);
            return null;
        }

        if (result is null || result.Count == 0) return null;

        foreach (SearchResult o in result)
            foreach (DictionaryEntry e in o.Properties) {
                if (hash.ContainsKey(e.Key)) continue;
                hash.Add(e.Key, null);
                sb.Append(sb.Length == 0 ? e.Key : $"{(char)127}{e.Key}");
            }

        hash.Clear();

        lock (cache_lock) {
            adWorkstationCache_timestamp = DateTime.Now.Ticks;
            adWorkstationCache = Encoding.UTF8.GetBytes(sb.ToString());
            return adWorkstationCache;
        }
    }

    public static byte[] GetAdGroupColumns() {
        if (!(adGroupCache is null) && adGroupCache_timestamp > DateTime.Now.Ticks - QUARTER)
            return adGroupCache;
     
        Hashtable hash = new Hashtable();
        StringBuilder sb = new StringBuilder();

        string domain = null;
        try {
            domain = IPGlobalProperties.GetIPGlobalProperties()?.DomainName ?? null;
        } catch { }

        SearchResultCollection result = null;
        try {
            DirectoryEntry dir = ActiveDir.GetDirectoryEntry(domain);
            DirectorySearcher searcher = new DirectorySearcher(dir);
            searcher.Filter = "(&(objectClass=group))";
            result = searcher.FindAll();
        } catch (Exception ex) {
            ErrorLog.Err(ex);
            return null;
        }

        if (result is null || result.Count == 0) return null;

        foreach (SearchResult o in result)
            foreach (DictionaryEntry e in o.Properties) {
                if (hash.ContainsKey(e.Key)) continue;
                hash.Add(e.Key, null);
                sb.Append(sb.Length == 0 ? e.Key : $"{(char)127}\n{e.Key}");
            }

        hash.Clear();

        lock (cache_lock) {
            adGroupCache_timestamp = DateTime.Now.Ticks;
            adGroupCache = Encoding.UTF8.GetBytes(sb.ToString());
            return adGroupCache;
        }
    }

    public static byte[] ListScripts() {
        DirectoryInfo dir = new DirectoryInfo(DIR_SCRIPTS_SCRIPTS);

        if (!dir.Exists) return null;

        StringBuilder sb = new StringBuilder();

        FileInfo[] files = dir.GetFiles();
        for (int i = 0; i < files.Length; i++) 
            sb.Append(sb.Length == 0 ? files[i].Name : $"{(char)127}{files[i].Name}");
        
        return Encoding.UTF8.GetBytes(sb.ToString());
    }

    public static byte[] LoadScript(in string[] para) {
        string filename = "";
        for (int i = 1; i < para.Length; i++)
            if (para[i].StartsWith("filename=")) filename = para[i].Substring(9);

        FileInfo scriptfile = new FileInfo($"{DIR_SCRIPTS_SCRIPTS}\\{filename}");

        if (!scriptfile.Exists) return Tools.FLE.Array;

        try {
            return File.ReadAllBytes(scriptfile.FullName);
        } catch (Exception ex) {
            ErrorLog.Err(ex);
            return Tools.FAI.Array;
        }
    }

    public static byte[] SaveScript(in HttpListenerContext ctx, in string[] para) {
        string filename = "";
        for (int i = 1; i < para.Length; i++)
            if (para[i].StartsWith("filename=")) filename = para[i].Substring(9);

        DirectoryInfo dir = new DirectoryInfo(DIR_SCRIPTS);
        if (!dir.Exists) dir.Create();

        DirectoryInfo dir_scripts = new DirectoryInfo(DIR_SCRIPTS_SCRIPTS);
        if (!dir_scripts.Exists) dir_scripts.Create();

        DirectoryInfo dir_reports = new DirectoryInfo(DIR_SCRIPTS_REPORTS);
        if (!dir_reports.Exists) dir_reports.Create();


        string payload;
        using (StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding))
            payload = reader.ReadToEnd();
               
        //if (payload.Length == 0) return Tools.INV.Array;

        try {
            File.WriteAllText($"{DIR_SCRIPTS_SCRIPTS}\\{filename}", payload);
        } catch (Exception ex) {
            ErrorLog.Err(ex);
            return Tools.FAI.Array;
        }

        return Tools.OK.Array;
    }

    private static bool IsEndPoint(ScriptNode node) {
        switch (node.name) {
            case "Text file": return true;
            case "CSV file": return true;
            case "JSON file": return true;
            case "XML file": return true;
            case "HTML file": return true;
            case "Send e-mail": return true;

            case "Wake on LAN": return true;
            case "Turn off PC": return true;
            case "Restart PC": return true;
            case "Log off PC": return true;

            default: return false;
        }
    }

    public static byte[] RunScript(in string[] para) {
        string filename = "";
        for (int i = 1; i < para.Length; i++) 
            if (para[i].StartsWith("filename=")) filename = para[i].Substring(9);

        return RunScript(filename);
    }
    public static byte[] RunScript(in string filename) {
        if (filename.Length == 0) return Tools.INV.Array;
        if (!File.Exists($"{DIR_SCRIPTS_SCRIPTS}\\{filename}")) return Tools.FLE.Array;

        string script = "";
        try {
            script = File.ReadAllText($"{DIR_SCRIPTS_SCRIPTS}\\{filename}");
        } catch (Exception ex) {
            ErrorLog.Err(ex);
            return Tools.FAI.Array;
        }

        List<ScriptNode> nodes = new List<ScriptNode>();
        List<ScriptLink> links = new List<ScriptLink>();
        string[] lines = script.Split("\n".ToCharArray(), StringSplitOptions.RemoveEmptyEntries);

        for (int i = 0; i < lines.Length; i++) { //nodes
            lines[i] = lines[i].Trim();
            if (lines[i].StartsWith("#")) continue; //skip comments

            string[] split = lines[i].Split((char)127);
            if (split.Length < 3) continue;
            if (split[0] != "n") continue;  

            List<string> values = new List<string>();
            List<string> columns = new List<string>();
            List<ScriptSocket> sockets = new List<ScriptSocket>();

            for (int j = 3; j < split.Length; j++) {
                string[] vSplit = split[j].Split(':');
                if (vSplit[0] == "v")
                    values.Add(vSplit[1]);
                else if (vSplit[0] == "c")
                    columns.Add(vSplit[1]);
            }

            ScriptNode newNode = new ScriptNode() {
                name = split[1],
                values = values.ToArray(),
                columns = columns.ToArray(),
                parameters = tools.ContainsKey(split[1]) ? (string[][])tools[split[1]] : new string[][] {}
            };

            foreach (string[] param in newNode.parameters) { //sockets
                if (param[0] != "o" && param[0] != "i") continue;
                ScriptSocket newSocket = new ScriptSocket() {
                    type = param[0][0],
                    label = param[1],
                    node = newNode
                };
                sockets.Add(newSocket);
            }

            newNode.sockets = sockets.ToArray();

            nodes.Add(newNode);

            values.Clear();
            columns.Clear();
            sockets.Clear();
        }

        for (int i = 0; i < lines.Length; i++) { //links
            string[] split = lines[i].Split((char)127);
            if (split.Length < 5) continue;
            if (split[0] != "l") continue;

            int primartIndex = int.Parse(split[1]);
            int secondaryIndex = int.Parse(split[3]);
            ScriptNode primaryNode = nodes[primartIndex];
            ScriptNode secondaryNode = nodes[secondaryIndex];

            ScriptSocket primary, secondary;

            primary = Array.Find(primaryNode.sockets, o=> o.type == 'o' && o.label == split[2]);
            secondary = Array.Find(secondaryNode.sockets, o=> o.type == 'i' && o.label == split[4]);

            if (primary is null || secondary is null) continue;

            ScriptLink newLink = new ScriptLink() {
                primaryNode   = primaryNode,
                secondaryNode = secondaryNode,
                primary       = primary,
                secondary     = secondary
            };
            links.Add(newLink);
        }

        StringBuilder log = new StringBuilder();

        List<ScriptNode> endpoints = nodes.FindAll(o => IsEndPoint(o));
        foreach (ScriptNode node in endpoints)
            CascadeNode(node, links, log);
        
        return Tools.OK.Array;
    }

    private static void CascadeNode(in ScriptNode node, in List<ScriptLink> allLinks, in StringBuilder log) {
        ScriptSocket[] inputs = node.sockets.Where(o => o.type == 'i').ToArray();

        foreach (ScriptSocket input in inputs) {
            if (node.sourceNodes is null) node.sourceNodes = new ScriptNode[inputs.Length];

            for (int i = 0; i < inputs.Length; i++) {
                ScriptLink link = allLinks.Find(o => ScriptLink.Equals(o.secondary, inputs[i]));
                if (link is null) {
                    Console.WriteLine($" ! Node {node.name} is unlinked.");
                    continue;
                }

                node.sourceNodes[i] = link.primaryNode;
            }
        }

        if (!(node.sourceNodes is null))
            for (int i = 0; i < node.sourceNodes.Length; i++) //cascade
                CascadeNode(node.sourceNodes[i], allLinks, log);

        if (node.result is null) node.result = InvokeNode(node, log);
    }

    private static ScriptResult InvokeNode(in ScriptNode node, in StringBuilder log) {
        switch (node.name) {
            case "Protest users":       return ProtestUsers(node);
            case "Protest equipment":   return ProtestEquip(node);
            case "Domain users":        return DomainUsers(node);
            case "Domain workstations": return DomainWorkstation(node);
            case "Domain groups":       return DomainGroups(node);
            case "IPv4 subnet":         return IPv4Subnet(node);
            case "Single value":        return SingleValue(node);

            case "Secure shell":       return SSh(node).Result;
            case "PS exec":            return PsExec(node).Result;
            case "WMI query":          return WmiQuery(node).Result;
            case "NetBIOS request":    return NetBiosRequest(node).Result;
            case "DNS lookup":         return DnsLookup(node).Result;
            case "Reverse DNS lookup": return ReverseDnsLookUp(node).Result;
            case "Ping":               return Ping(node).Result;
            case "Trace route":        return TraceRoute(node).Result;
            case "Port scan":          return PortScan(node).Result;
            case "Locate IP":          return LocateIp(node);
            case "MAC lookup":         return MacLookUp(node);

            case "Subtract rows": return SubtractRows(node);
            case "Sort":          return Sort(node);
            case "Reverse order": return ReverseOrder(node);
            case "Trim":          return Trim(node);
            case "Unique":        return Unique(node);
            case "Merge columns": return MergeColumns(node);
            case "Merge rows":    return MergeRows(node);

            case "Equal":        return Equal(node);
            case "Greater than": return GreaterThan(node);
            case "Less than":    return LessThan(node);
            case "Contain":      return Contain(node);
            case "Regex match":  return RegexMatch(node);

            case "Absolute value": return AbsValue(node);
            case "Round":          return Round(node);
            case "Quantization":   return Quantization(node);
            case "Sampling":       return Sampling(node);
            case "Sum":            return Sum(node);
            case "Maximum":        return Maximum(node);
            case "Minimum":        return Minimum(node);
            case "Mean":           return Mean(node);
            case "Median":         return Median(node);
            case "Mode":           return Mode(node);
            case "Range":          return Range(node);

            case "Text file":   return SaveTxt(node);
            case "CSV file":    return SaveCsv(node);
            case "JSON file":   return SaveJson(node);
            case "XML file":    return SaveXml(node);
            case "HTML file":   return SaveHtml(node);
            case "Send e-mail": return SendEMail(node);

            default: //bypass
                log.AppendLine($" ! Undefined node: {node.name}.");
                return node.sourceNodes[0].result;
        }
    }

    private static ScriptResult ProtestUsers(in ScriptNode node) {
        List<string> header = new List<string>();
        foreach (DictionaryEntry o in NoSQL.users) {
            NoSQL.DbEntry entry = (NoSQL.DbEntry)o.Value;
            foreach (DictionaryEntry c in entry.hash) {
                string k = c.Key.ToString();
                if (node.columns.Length > 0 && !node.columns.Contains(k)) continue;
                if (header.Contains(k)) continue;
                header.Add(k);
            }
        }

        ScriptResult result = new ScriptResult();
        result.header = header.ToArray();

        foreach (DictionaryEntry o in NoSQL.users) {
            NoSQL.DbEntry entry = (NoSQL.DbEntry)o.Value;

            string[] row = new string[header.Count];
            foreach (DictionaryEntry c in entry.hash) {
                int index = header.IndexOf(c.Key.ToString());
                if (index < 0) continue;
                row[index] = ((string[])c.Value)[0];
            }
            result.array.Add(row);
        }

        header.Clear();

        return result;
    }
    private static ScriptResult ProtestEquip(in ScriptNode node) {
        List<string> header = new List<string>();
        foreach (DictionaryEntry o in NoSQL.equip) {
            NoSQL.DbEntry entry = (NoSQL.DbEntry)o.Value;
            foreach (DictionaryEntry c in entry.hash) {
                string k = c.Key.ToString();
                if (node.columns.Length > 0 && !node.columns.Contains(k)) continue;
                if (header.Contains(k)) continue;
                header.Add(k);
            }
        }

        ScriptResult result = new ScriptResult();
        result.header = header.ToArray();

        foreach (DictionaryEntry o in NoSQL.equip) {
            NoSQL.DbEntry entry = (NoSQL.DbEntry)o.Value;

            string[] row = new string[header.Count];
            foreach (DictionaryEntry c in entry.hash) {
                int index = header.IndexOf(c.Key.ToString());
                if (index < 0) continue;
                row[index] = ((string[])c.Value)[0];
            }
            result.array.Add(row);
        }

        header.Clear();

        return result;
    }
    private static ScriptResult DomainToResult(in ScriptNode node, string filter) {
        string domain = null;
        try {
            domain = IPGlobalProperties.GetIPGlobalProperties()?.DomainName ?? null;
        } catch { }

        SearchResultCollection adResult = null;
        try {
            DirectoryEntry dir = ActiveDir.GetDirectoryEntry(domain);
            DirectorySearcher searcher = new DirectorySearcher(dir);
            searcher.Filter = filter;
            adResult = searcher.FindAll();
        } catch (Exception ex) {
            ErrorLog.Err(ex);
            return null;
        }

        if (adResult is null || adResult.Count == 0) return null;

        List<string> header = new List<string>();
        foreach (SearchResult o in adResult)
            foreach (DictionaryEntry e in o.Properties) {
                if (node.columns.Length > 0 && !node.columns.Contains(e.Key.ToString())) continue;
                if (header.Contains(e.Key.ToString())) continue;
                header.Add(e.Key.ToString());
            }


        ScriptResult result = new ScriptResult();
        result.header = header.ToArray();

        foreach (SearchResult o in adResult) {
            string[] row = new string[header.Count];
            foreach (DictionaryEntry e in o.Properties) {
                int index = header.IndexOf(e.Key.ToString());
                if (index < 0) continue;
                row[index] = o.Properties[e.Key.ToString()][0].ToString();
            }
            result.array.Add(row);
        }

        header.Clear();

        return result;
    }
    private static ScriptResult DomainUsers(in ScriptNode node) {
        return DomainToResult(node, "(&(objectClass=user)(objectCategory=person))");
    }
    private static ScriptResult DomainWorkstation(in ScriptNode node) {
        return DomainToResult(node, "(objectClass=computer)");
    }
    private static ScriptResult DomainGroups(in ScriptNode node) {
        return DomainToResult(node, "(&(objectClass=group))");
    }
    private static ScriptResult IPv4Subnet (in ScriptNode node) {
        /* [0] IP
         * [1] CIDR prefix
         * [2] -> */

        if (node.values.Length < 2) return null;
        IPAddress ip;
        byte prefix;

        if (!IPAddress.TryParse(node.values[0], out ip)) return null;

        if (!byte.TryParse(node.values[1], out prefix)) return null;
        
        if (prefix > 31) return null;

        IPAddress subnet = Tools.GetNetworkAddress(ip, prefix);

        byte[] arrFrom = subnet.GetAddressBytes();
        Array.Reverse(arrFrom);

        uint intFrom = BitConverter.ToUInt32(arrFrom, 0);
        uint intTo = (uint)(intFrom + Math.Pow(2, 32 - prefix));

        List<string[]> array = new List<string[]>();
        for (uint i = intFrom; i < intTo && i < UInt32.MaxValue - 1; i++) {
            byte[] a = BitConverter.GetBytes(i);
            Array.Reverse(a);
            array.Add(new string[] { String.Join(".", a) });
        }

        ScriptResult result = new ScriptResult() {
            header = new string[] { "IP address" },
            array = array
        };

        return result;
    }
    private static ScriptResult SingleValue(in ScriptNode node) {
        /* [0] Value
         * [1] -> */

        ScriptResult result = new ScriptResult() {
            header = new string[] { "Value" },
            array = new List<string[]>()
        };
        result.array.Add(new string[] { node.values[0] });

        return result;
    }
    
    private static async Task<ScriptResult> SSh(ScriptNode node) {
        List<string[]> array = new List<string[]>();

        return new ScriptResult() { //sorted
            header = new string[] { "Host", "Timestamp", "Input", "Output" },
            array = array
        };
    }
    private static async Task<ScriptResult> PsExec(ScriptNode node) {
        List<string[]> array = new List<string[]>();

        return new ScriptResult() { //sorted
            header = new string[] { "Host", "Timestamp", "Input", "Output" },
            array = array
        };
    }
    private static async Task<ScriptResult> WmiQuery(ScriptNode node) {
        List<string[]> array = new List<string[]>();

        return new ScriptResult() {
            header = new string[] { },
            array = array
        };
    }
    private static async Task<ScriptResult> NetBiosRequest(ScriptNode node) {
        /* [0] <-
         * [1] column
         * [2] async
         * [3] -> */

        bool isAsync = node.values[2] == "True";

        int index = Array.IndexOf(node.sourceNodes[0].result.header, node.values[1]);
        List<string[]> array = new List<string[]>();

        if (index > -1) 
            if (isAsync) {
                List<Task<string>> tasks = new List<Task<string>>();
                for (int i = 0; i < node.sourceNodes[0].result.array.Count; i++) {
                    string ip = node.sourceNodes[0].result.array[i][index];
                    tasks.Add(NetBios.GetBiosNameAsync(ip));
                }

                string[] result = await Task.WhenAll(tasks);
                for (int i = 0; i < result.Length; i++) {
                    string host = node.sourceNodes[0].result.array[i][index];
                    array.Add(new string[] { host, result[i] });
                }

            } else {
                for (int i = 0; i < node.sourceNodes[0].result.array.Count; i++) {
                    string ip = node.sourceNodes[0].result.array[i][index];
                    string biosName = await NetBios.GetBiosNameAsync(ip);
                    array.Add(new string[] { ip is null ? "" : ip, biosName });
                }
            }

        return new ScriptResult() {
            header = new string[] { "IP Address", "NetBIOS name" },
            array = array
        };
    }
    private static async Task<ScriptResult> DnsLookup(ScriptNode node) {
        /* [0] <-
         * [1] column
         * [2] async
         * [3] -> */

        int index = Array.IndexOf(node.sourceNodes[0].result.header, node.values[1]);
        List<string[]> array = new List<string[]>();

        if (index > -1) {
            bool isAsync = node.values[2] == "True";

            if (isAsync) {
                List<Task<IPAddress[]>> tasks = new List<Task<IPAddress[]>>();
                for (int i = 0; i < node.sourceNodes[0].result.array.Count; i++) {
                    string hostname = node.sourceNodes[0].result.array[i][index];
                    tasks.Add(DnsLookupAsync(hostname));
                }

                IPAddress[][] result = await Task.WhenAll(tasks);
                for (int i = 0; i < result.Length; i++) {
                    if (result[i] is null) {
                        array.Add(new string[] { "", "no such host is known" });
                        continue;
                    }
                    array.Add(new string[] { node.sourceNodes[0].result.array[i][index], String.Join(";", result[i].Select(o => o.ToString())) });
                }

            } else {
                for (int i = 0; i < node.sourceNodes[0].result.array.Count; i++) {
                    string hostname = node.sourceNodes[0].result.array[i][index];
                    IPAddress[] ips = await DnsLookupAsync(hostname);

                    if (ips is null) {
                        array.Add(new string[] { "", "no such host is known" });
                        continue;
                    }
                    array.Add(new string[] { hostname, String.Join(";", ips.Select(o => o.ToString())) });
                }
            }
        }
        
        return new ScriptResult() {
            header = new string[] { "Hostname", "IP Address" },
            array = array
        };
    }
    private static async Task<ScriptResult> ReverseDnsLookUp(ScriptNode node) {
        /* [0] <-
         * [1] column
         * [2] async
         * [3] -> */

        int index = Array.IndexOf(node.sourceNodes[0].result.header, node.values[1]);
        List<string[]> array = new List<string[]>();

        if (index > -1) {
            bool isAsync = node.values[2] == "True";

            if (isAsync) {
                List<Task<IPHostEntry>> tasks = new List<Task<IPHostEntry>>();
                for (int i = 0; i < node.sourceNodes[0].result.array.Count; i++) {
                    string ip = node.sourceNodes[0].result.array[i][index];
                    tasks.Add(ReverseDnsLookupAsync(ip));
                }

                IPHostEntry[] result = await Task.WhenAll(tasks);
                for (int i = 0; i < result.Length; i++) {
                    if (result[i] is null) {
                        array.Add(new string[] { "", "no such host is known" });
                        continue;
                    }
                    array.Add(new string[] { node.sourceNodes[0].result.array[i][index], result[i].HostName });
                }

            } else {
                for (int i = 0; i < node.sourceNodes[0].result.array.Count; i++) {
                    string ip = node.sourceNodes[0].result.array[i][index];
                    IPHostEntry host = await ReverseDnsLookupAsync(ip);

                    if (host is null) {
                        array.Add(new string[] { "", "no such host is known" });
                        continue;
                    }
                    array.Add(new string[] { ip, host.HostName });
                }
            }
        }
        return new ScriptResult() {
            header = new string[] { "IP address", "Hostname" },
            array = array
        };
    }
    private static async Task<ScriptResult> Ping(ScriptNode node) {
        /* [0] <-
         * [1] column
         * [2] async
         * [3] Time out
         * [4] -> */

        int index = Array.IndexOf(node.sourceNodes[0].result.header, node.values[1]);
        List<string[]> array = new List<string[]>();

        if (index > -1) {
            bool isAsync = node.values[2] == "True";
            int timeout = 1000;
            int.TryParse(node.values[3], out timeout);
            
            if (isAsync) {
                List<Task<PingReply>> tasks = new List<Task<PingReply>>();
                for (int i = 0; i < node.sourceNodes[0].result.array.Count; i++) {
                    string host = node.sourceNodes[0].result.array[i][index];
                    tasks.Add(PingAsync(host, timeout));
                }

                PingReply[] result = await Task.WhenAll(tasks);
                for (int i = 0; i < result.Length; i++) {
                    if (result[i] is null) {
                        array.Add(new string[] { "", "Invalid address", "" });
                        continue;
                    }
                    array.Add(new string[] { result[i].Address.ToString(), result[i].Status.ToString(), result[i].RoundtripTime.ToString() });
                }

            } else {
                for (int i = 0; i < node.sourceNodes[0].result.array.Count; i++) {
                    string host = node.sourceNodes[0].result.array[i][index];
                    PingReply reply = await PingAsync(host, timeout);

                    if (reply is null) {
                        array.Add(new string[] { "", "Invalid address", "" });
                        continue;
                    }
                    array.Add(new string[] { reply.Address.ToString(), reply.Status.ToString(), reply.RoundtripTime.ToString() });
                }
            }
        }

        return new ScriptResult() {
            header = new string[] { "Host", "Status", "Roundtrip time" },
            array = array
        };
    }
    private static async Task<ScriptResult> TraceRoute(ScriptNode node) {
         /* [0] <-
          * [1] column
          * [2] async
          * [3] -> */

        bool isAsync = node.values[2] == "True";

        int index = Array.IndexOf(node.sourceNodes[0].result.header, node.values[1]);
        List<string[]> array = new List<string[]>();

        if (index > -1) {
            const short timeout = 2000; //2s
            const short ttl = 30;
        
            if (isAsync) {
                List<Task<string>> tasks = new List<Task<string>>();
                for (int i = 0; i < node.sourceNodes[0].result.array.Count; i++) {
                    string host = node.sourceNodes[0].result.array[i][index];
                    tasks.Add(TraceRouteAsync(host, timeout, ttl));
                }

                string[] result = await Task.WhenAll(tasks);
                for (int i = 0; i < result.Length; i++) {
                    string host = node.sourceNodes[0].result.array[i][index];
                    array.Add(new string[] { host, result[i] });
                }

            } else {
                for (int i = 0; i < node.sourceNodes[0].result.array.Count; i++) {
                    string host = node.sourceNodes[0].result.array[i][index];
                    string result = await TraceRouteAsync(host, timeout, ttl);
                    array.Add(new string[] { host is null ? "" : host, result });
                }
            }
        }

        return new ScriptResult() {
            header = new string[] { "Host", "Route" },
            array = array
        };
    }
    private static async Task<ScriptResult> PortScan(ScriptNode node) {
        /* [0] <-
         * [1] column
         * [2] async
         * [3] from
         * [4] to
         * [5] -> */

        bool isAsync = node.values[2] == "True";

        int index = Array.IndexOf(node.sourceNodes[0].result.header, node.values[1]);
        List<string[]> array = new List<string[]>();

        if (index > -1) {
            int from = 1;
            int to = 1023;
            int.TryParse(node.values[3], out from);
            int.TryParse(node.values[4], out to);

            if (isAsync) {
                List<Task<string>> tasks = new List<Task<string>>();
                for (int i = 0; i < node.sourceNodes[0].result.array.Count; i++) {
                    string host = node.sourceNodes[0].result.array[i][index];
                    tasks.Add(PortScanAsync(host, from, to));
                }

                string[] result = await Task.WhenAll(tasks);
                for (int i = 0; i < result.Length; i++) {
                    string host = node.sourceNodes[0].result.array[i][index];
                    array.Add(new string[] { host, result[i] });
                }

            } else {
                for (int i = 0; i < node.sourceNodes[0].result.array.Count; i++) {
                    string host = node.sourceNodes[0].result.array[i][index];
                    string result = await PortScanAsync(host, from, to);
                    array.Add(new string[] { host is null ? "" : host, result });
                }
            }
        }

        return new ScriptResult() {
            header = new string[] { "Host", "Ports" },
            array = array
        };
    }
    private static ScriptResult LocateIp(in ScriptNode node) {
        /* [0] <-
         * [1] column
         * [2] -> */

        int index = Array.IndexOf(node.sourceNodes[0].result.header, node.values[1]);
        List<string[]> array = new List<string[]>();
        
        if (index > -1)
            for (int i = 0; i < node.sourceNodes[0].result.array.Count; i++) {
                string host = node.sourceNodes[0].result.array[i][index];
                if (host is null) {
                    array.Add(new string[] { "null", "null", "null", "null", "null", "null", "null", "null" });
                    continue;
                }

                string[] result = Encoding.UTF8.GetString(Tools.LocateIp(host)).Split(';');
                if (result.Length < 6) {
                    array.Add(new string[] { host, result[0], "", "", "", "", "", "" });
                    continue;
                }

                string[] coordinates = result[4].Split(',');
                array.Add(new string[] { host, result[0], result[1], result[2], result[3], coordinates[0], coordinates[1], result[5] });
            }

        return new ScriptResult() {
            header = new string[] { "Host", "Code", "Country", "Region", "City", "Latitude", "Longitude", "Is proxy" },
            array = array
        };
    }
    private static ScriptResult MacLookUp(in ScriptNode node) {
        /* [0] <-
         * [1] column
         * [2] -> */

        int index = Array.IndexOf(node.sourceNodes[0].result.header, node.values[1]);
        List<string[]> array = new List<string[]>();

        if (index > -1)
            for (int i = 0; i < node.sourceNodes[0].result.array.Count; i++) {
                string mac = node.sourceNodes[0].result.array[i][index];
                if (mac is null) {
                    array.Add(new string[] { "null", "null"});
                    continue;
                }

                string manufacturer = Encoding.UTF8.GetString(Tools.MacLookup(mac));
                array.Add(new string[] { mac, manufacturer });
            }

        return new ScriptResult() { //sorted
            header = new string[] { "MAC address", "Manufacturer" },
            array = array
        };
    }

    private static ScriptResult SubtractRows(in ScriptNode node) {
        /* [0] <- Minuend
        /* [1] <- Subtrahend
        /* [2] -> Difference */

        List<string[]> minuend = node.sourceNodes[0].result.array;
        List<string[]> subtrahend = node.sourceNodes[1].result.array;
        List<string[]> difference = new List<string[]>();
               
        for (int i = 0; i < minuend.Count; i++) {
            bool mached = false;

            for (int j = 0; j < subtrahend.Count; j++)
                if (subtrahend[j].SequenceEqual(minuend[i])) {
                    mached = true;
                    break;
                }           

            if (mached) continue;
            difference.Add(minuend[i]);
        }

        return new ScriptResult() {
            header = node.sourceNodes[0].result.header,
            array = difference
        };
    }
    private static ScriptResult Sort(in ScriptNode node) {
        /* [0] <-
         * [1] Sort by
         * [2] -> */

        int index = Array.IndexOf(node.sourceNodes[0].result.header, node.values[1]);
#nullable enable
        List<string[]>? sorted = null;
#nullable disable

        if (index > -1) {
            sorted = node.sourceNodes[0].result.array.ConvertAll(o => o); //semi-deep copy
            sorted.Sort((string[] a, string[] b) => {
                double da, db;
                if (double.TryParse(a[index], out da) && double.TryParse(b[index], out db)) {
                    if (da > db) return 1;
                    if (da < db) return -1;
                    return 0;
                }
                return a[index].CompareTo(b[index]);
            });
        }

        return new ScriptResult() { //sorted
            header = node.sourceNodes[0].result.header,
            array = sorted is null ? node.sourceNodes[0].result.array : sorted
        };
    }
    private static ScriptResult ReverseOrder(in ScriptNode node) {
        /* [0] <-
         * [2] -> */

        List<string[]> reversed = node.sourceNodes[0].result.array.ConvertAll(o => o); //shallow copy
        reversed.Reverse();

        return new ScriptResult() {
            header = node.sourceNodes[0].result.header,
            array = reversed
        };
    }
    private static ScriptResult Trim(in ScriptNode node) { //remove if empty
        /* [0] <-
         * [1] -> */

        List<string[]> trimmed = new List<string[]>();
        for (int i = 0; i < node.sourceNodes[0].result.array.Count; i++) {
            if (node.sourceNodes[0].result.array.TrueForAll(o => o.Length == 0)) continue;
            trimmed.Add(node.sourceNodes[0].result.array[i]);
        }

        return new ScriptResult() {
            header = node.sourceNodes[0].result.header,
            array = trimmed
        };
    }
    private static ScriptResult Unique(in ScriptNode node) { //remove duplicates
        /* [0] <-
         * [1] column
         * [2] -> */

        int index = Array.IndexOf(node.sourceNodes[0].result.header, node.values[1]);
        List<string[]> unique = new List<string[]>();

        if (index == -1) //[All] or not found
            for (int i = 0; i < node.sourceNodes[0].result.array.Count; i++) {
                bool mached = false;
                for (int j = 0; j < node.sourceNodes[0].result.array.Count; j++)
                    if (i != j && node.sourceNodes[0].result.array[i].SequenceEqual(node.sourceNodes[0].result.array[j])) {
                        mached = true;
                        break;
                    }

                if (mached) continue;
                unique.Add(node.sourceNodes[0].result.array[i]);
            }

        else 
            for (int i = 0; i < node.sourceNodes[0].result.array.Count; i++) {
                bool mached = false;
                for (int j = 0; j < node.sourceNodes[0].result.array.Count; j++)
                    if (i != j && node.sourceNodes[0].result.array[i][index] == node.sourceNodes[0].result.array[j][index]) {
                        mached = true;
                        break;
                    }

                if (mached) continue;
                unique.Add(node.sourceNodes[0].result.array[i]);
            }

        return new ScriptResult() {
            header = node.sourceNodes[0].result.header,
            array = unique
        };
    }
    private static ScriptResult MergeColumns(in ScriptNode node) {
        /* [0] <- A
        /* [1] <- B
        /* [2] -> Out */

        ScriptResult a = node.sourceNodes[0].result;
        ScriptResult b = node.sourceNodes[1].result;

        if (a.array.Count == 0 || b.array.Count == 0)
            return new ScriptResult() {
                header = a.header,
                array = a.array
            };

        List<string[]> array = new List<string[]>();

        for (int i = 0; i < Math.Max(a.array.Count, b.array.Count); i++) {
            string[] newRow = new string[a.header.Length + b.header.Length];

            if (i < a.array.Count)
                Array.Copy(a.array[i], 0, newRow, 0, a.array[i].Length);

            if (i < b.array.Count)
                Array.Copy(b.array[i], 0, newRow, a.array[0].Length, b.array[i].Length);

            array.Add(newRow);
        }

        string[] header = new string[a.header.Length + b.header.Length];
        Array.Copy(a.header, 0, header, 0, a.header.Length);
        Array.Copy(b.header, 0, header, a.header.Length, b.header.Length);

        return new ScriptResult() {
            header = header,
            array = array
        };
    }
    private static ScriptResult MergeRows(in ScriptNode node) {
        /* [0] <- A
        /* [1] <- B
        /* [2] -> Out */

        List<string[]> a = node.sourceNodes[0].result.array;
        List<string[]> b = node.sourceNodes[1].result.array;
        List<string[]> output = new List<string[]>();

        output.AddRange(a);
        output.AddRange(b);

        return new ScriptResult() {
            header = node.sourceNodes[0].result.header,
            array = output
        };
    }

    private static ScriptResult Equal(in ScriptNode node) {
        /* [0] <-
         * [1] value
         * [2] column
         * [3] -> */

        string value = node.values[1];
        int index = Array.IndexOf(node.sourceNodes[0].result.header, node.values[2]);

        List<string[]> array = new List<string[]>();
        if (index > -1)
            array = node.sourceNodes[0].result.array.Where(o => o[index] == value).ToList();
        
        return new ScriptResult() {
            header = node.sourceNodes[0].result.header,
            array = array
        };
    }
    private static ScriptResult GreaterThan(in ScriptNode node) {
        /* [0] <-
         * [1] value
         * [2] column
         * [3] -> */

        string value = node.values[1];
        int index = Array.IndexOf(node.sourceNodes[0].result.header, node.values[2]);

        List<string[]> array = new List<string[]>();
        if (index > -1) {
            double a;
            if (double.TryParse(value, out a))
                array = node.sourceNodes[0].result.array.Where(o => {
                    double b;
                    if (double.TryParse(o[index], out b)) {
                        if (a < b) return true;
                        return false;
                    }

                    if (String.Compare(value, o[index]) < 0) return true;
                    return false;
                }).ToList();                

             else 
                array = node.sourceNodes[0].result.array.Where(o => {
                    if (String.Compare(value, o[index]) < 0) return true;
                    return false;
                }).ToList();
        }

        return new ScriptResult() {
            header = node.sourceNodes[0].result.header,
            array = array
        };
    }
    private static ScriptResult LessThan(in ScriptNode node) {
        /* [0] <-
         * [1] value
         * [2] column
         * [3] -> */

        string value = node.values[1];
        int index = Array.IndexOf(node.sourceNodes[0].result.header, node.values[2]);

        List<string[]> array = new List<string[]>();
        if (index > -1) {
            double a;
            if (double.TryParse(value, out a))
                array = node.sourceNodes[0].result.array.Where(o => {
                    double b;
                    if (double.TryParse(o[index], out b)) {
                        if (b < a) return true;
                        return false;
                    }

                    if (String.Compare(o[index], value) < 0) return true;
                    return false;
                }).ToList();

            else
                array = node.sourceNodes[0].result.array.Where(o => {
                    if (String.Compare(o[index], value) < 0) return true;
                    return false;
                }).ToList();
        }

        return new ScriptResult() {
            header = node.sourceNodes[0].result.header,
            array = array
        };
    }
    private static ScriptResult Contain(in ScriptNode node) {
        /* [0] <-
         * [1] value
         * [2] column
         * [3] -> */

        string value = node.values[1];
        int index = Array.IndexOf(node.sourceNodes[0].result.header, node.values[2]);

        List<string[]> array = new List<string[]>();
        if (index > -1)
            array = node.sourceNodes[0].result.array.Where(o => o[index].IndexOf(value) > -1).ToList();

        return new ScriptResult() {
            header = node.sourceNodes[0].result.header,
            array = array
        };
    }
    private static ScriptResult RegexMatch(in ScriptNode node) {
        /* [0] <-
         * [1] regex
         * [2] column
         * [3] -> */

        string pattern = node.values[1];
        int index = Array.IndexOf(node.sourceNodes[0].result.header, node.values[2]);

        List<string[]> array = new List<string[]>();
        if (index > -1) 
            try {
                Regex regex = new Regex(pattern);
                array = node.sourceNodes[0].result.array.Where(o => regex.Match(o[index]).Success).ToList();
            } catch { }

        return new ScriptResult() {
            header = node.sourceNodes[0].result.header,
            array = array
        };
    }

    private static ScriptResult AbsValue(in ScriptNode node) {
        /* [0] <-
         * [1] column
         * [2] -> */

        int index = Array.IndexOf(node.sourceNodes[0].result.header, node.values[1]);

        List<string[]> array = new List<string[]>();
        if (index > -1) 
            for (int i = 0; i < node.sourceNodes[0].result.array.Count; i++) {
                string[] targetRow = node.sourceNodes[0].result.array[i];
                string[] newRow = new string[targetRow.Length];
                Array.Copy(targetRow, 0, newRow, 0, targetRow.Length);

                double n;
                newRow[index] = double.TryParse(targetRow[index], out n) ? Math.Abs(n).ToString() : targetRow[index];

                array.Add(newRow);
            }

        return new ScriptResult() {
            header = node.sourceNodes[0].result.header,
            array = array
        };
    }
    private static ScriptResult Round(in ScriptNode node) {
        /* [0] <-
         * [1] column
         * [2] -> */

        int index = Array.IndexOf(node.sourceNodes[0].result.header, node.values[1]);

        List<string[]> array = new List<string[]>();
        if (index > -1)
            for (int i = 0; i < node.sourceNodes[0].result.array.Count; i++) {
                string[] targetRow = node.sourceNodes[0].result.array[i];
                string[] newRow = new string[targetRow.Length];
                Array.Copy(targetRow, 0, newRow, 0, targetRow.Length);

                double n;
                newRow[index] = double.TryParse(targetRow[index], out n) ? Math.Round(n).ToString() : targetRow[index];

                array.Add(newRow);
            }

        return new ScriptResult() {
            header = node.sourceNodes[0].result.header,
            array = array
        };
    }
    private static ScriptResult Quantization(in ScriptNode node) {
        /* [0] <-
         * [1] column
         * [2] step
         * [3] -> */

        int index = Array.IndexOf(node.sourceNodes[0].result.header, node.values[1]);

        List<string[]> array = new List<string[]>();
        if (index > -1) {
            int step = 10;
            int.TryParse(node.values[2], out step);
            
            for (int i = 0; i < node.sourceNodes[0].result.array.Count; i++) {
                string[] targetRow = node.sourceNodes[0].result.array[i];
                string[] newRow = new string[targetRow.Length];
                Array.Copy(targetRow, 0, newRow, 0, targetRow.Length);

                double n;
                newRow[index] = double.TryParse(targetRow[index], out n) ? (n - n%step).ToString() : targetRow[index];
                array.Add(newRow);
            }
        }

        return new ScriptResult() {
            header = node.sourceNodes[0].result.header,
            array = array
        };
    }
    private static ScriptResult Sampling(in ScriptNode node) {
        /* [0] <-
         * [1] percent
         * [2] -> */

        double percent = 50;
        double.TryParse(node.values[1], out percent);

        int step = (int)(100 / percent);

        List<string[]> array = new List<string[]>();
        for (int i = 0; i < node.sourceNodes[0].result.array.Count; i+=step)
            array.Add(node.sourceNodes[0].result.array[i]);
                
        return new ScriptResult() {
            header = node.sourceNodes[0].result.header,
            array = array
        };
    }
    private static ScriptResult Sum(in ScriptNode node) {
        /* [0] <-
         * [1] column
         * [2] -> */

        int index = Array.IndexOf(node.sourceNodes[0].result.header, node.values[1]);

        double sum = 0;
        try {
            for (int i = 0; i < node.sourceNodes[0].result.array.Count; i++) {
                double n;
                if (double.TryParse(node.sourceNodes[0].result.array[i][index], out n))
                    sum += n;
            }
        } catch { }

        List<string[]> array = new List<string[]>();
        array.Add(new string[] { sum.ToString() });

        return new ScriptResult() {
            header = new string[] { "Sum" },
            array = array
        };
    }
    private static ScriptResult Maximum(in ScriptNode node) {
        /* [0] <-
         * [1] column
         * [2] -> */

        int index = Array.IndexOf(node.sourceNodes[0].result.header, node.values[1]);
        
        double max = double.MinValue;
        try {
            for (int i = 0; i < node.sourceNodes[0].result.array.Count; i++) {
                double n;
                if (double.TryParse(node.sourceNodes[0].result.array[i][index], out n))
                    if (max < n) max = n;
            }
        } catch { }

        List<string[]> array = new List<string[]>();
        array.Add(new string[] { max.ToString() });

        return new ScriptResult() {
            header = new string[] { "Maximium" },
            array = array
        };
    }
    private static ScriptResult Minimum(in ScriptNode node) {
        /* [0] <-
         * [1] column
         * [2] -> */

        int index = Array.IndexOf(node.sourceNodes[0].result.header, node.values[1]);

        double min = double.MaxValue;
        try {
            for (int i = 0; i < node.sourceNodes[0].result.array.Count; i++) {
                double n;
                if (double.TryParse(node.sourceNodes[0].result.array[i][index], out n))
                    if (min > n) min = n;
            }
        } catch { }

        List<string[]> array = new List<string[]>();
        array.Add(new string[] { min.ToString() });

        return new ScriptResult() {
            header = new string[] { "Minimum" },
            array = array
        };
    }
    private static ScriptResult Mean(in ScriptNode node) {
        /* [0] <-
         * [1] column
         * [2] -> */

        int index = Array.IndexOf(node.sourceNodes[0].result.header, node.values[1]);

        double sum = 0;
        try {
            for (int i = 0; i < node.sourceNodes[0].result.array.Count; i++) {
                double n;
                if (double.TryParse(node.sourceNodes[0].result.array[i][index], out n))
                    sum += n;
            }
        } catch { }

        double avg = sum / (double)node.sourceNodes[0].result.array.Count;

        List<string[]> array = new List<string[]>();
        array.Add(new string[] { avg.ToString() });

        return new ScriptResult() {
            header = new string[] { "Mean" },
            array = array
        };
    }
    private static ScriptResult Median(in ScriptNode node) {
        /* [0] <-
         * [1] column
         * [2] -> */

        int index = Array.IndexOf(node.sourceNodes[0].result.header, node.values[1]);

        string mean = "";

        if (index > -1) {
            List<string> sort = new List<string>();
            sort = node.sourceNodes[0].result.array.ConvertAll(o => o[index]); //semi-deep copy
            sort.Sort((string a, string b) => {
                double da, db;
                if (double.TryParse(a, out da) && double.TryParse(b, out db)) {
                    if (da > db) return 1;
                    if (da < db) return -1;
                    return 0;
                }
                return a.CompareTo(b);
            });

            mean = sort[(int)(sort.Count / 2)];
        }

        List<string[]> array = new List<string[]>();
        array.Add(new string[] { mean });

        return new ScriptResult() {
            header = new string[] { "Median" },
            array = array
        };
    }
    private static ScriptResult Mode(in ScriptNode node) {
        /* [0] <-
         * [1] column
         * [2] -> */

        string mode = "";

        int index = Array.IndexOf(node.sourceNodes[0].result.header, node.values[1]);

        if (index > -1) {
            Hashtable hash = new Hashtable();
            for (int i = 0; i < node.sourceNodes[0].result.array.Count; i++) {
                string value = node.sourceNodes[0].result.array[i][index];
                if (hash.ContainsKey(value)) {
                    int last = (int)hash[value];
                    hash[value] = ++last;
                } else
                    hash.Add(value, 1);                
            }

            int max = 0;
            
            foreach (DictionaryEntry e in hash)
                if (max < (int)e.Value) {
                    max = (int)e.Value;
                    mode = e.Key.ToString();
                }            
        }

        List<string[]> array = new List<string[]>();
        array.Add(new string[] { mode });

        return new ScriptResult() {
            header = new string[] { "Mode" },
            array = array
        };
    }
    private static ScriptResult Range(in ScriptNode node) {
        /* [0] <-
         * [1] column
         * [2] -> */

        int index = Array.IndexOf(node.sourceNodes[0].result.header, node.values[1]);

        double min = double.MaxValue;
        double max = double.MinValue;
        double range = 0;

        if (index > -1)
            try {
                for (int i = 0; i < node.sourceNodes[0].result.array.Count; i++) {
                    double n;
                    if (double.TryParse(node.sourceNodes[0].result.array[i][index], out n)) {
                        if (max < n) max = n;
                        if (min > n) min = n;
                    }
                }

                range = max - min;
            } catch { }
        
        List<string[]> array = new List<string[]>();
        array.Add(new string[] { range.ToString() });

        return new ScriptResult() {
            header = new string[] { "Range" },
            array = array
        };
    }

    private static ScriptResult SaveTxt(in ScriptNode node) {
        int[] columnsLength = new int[node.sourceNodes[0].result.header.Length];
        for (int i = 0; i < columnsLength.Length; i++)
            columnsLength[i] = node.sourceNodes[0].result.header[i].Length;

        for (int i = 0; i < node.sourceNodes[0].result.array.Count; i++) 
            for (int j = 0; j < node.sourceNodes[0].result.array[i].Length; j++)
                if (columnsLength[j] < node.sourceNodes[0].result.array[i][j]?.Length)
                    columnsLength[j] = node.sourceNodes[0].result.array[i][j].Length;
        
        StringBuilder text = new StringBuilder();

        for (int i = 0; i < node.sourceNodes[0].result.header.Length; i++) { //header
            text.Append(node.sourceNodes[0].result.header[i].PadRight(columnsLength[i], ' '));
            if (i < node.sourceNodes[0].result.header.Length - 1) text.Append("\t");
        }
        text.Append("\n");

        for (int i = 0; i < columnsLength.Length; i++) { //dash line
            text.Append(new string('-', columnsLength[i]));
            if (i < columnsLength.Length - 1) text.Append("\t");
        }
        text.Append("\n");

        for (int i = 0; i < node.sourceNodes[0].result.array.Count; i++) { //data
            for (int j=0; j < node.sourceNodes[0].result.array[i].Length; j++) {
                if (!(node.sourceNodes[0].result.array[i][j] is null))
                    text.Append(node.sourceNodes[0].result.array[i][j]);

                if (j < node.sourceNodes[0].result.array[i].Length - 1) {
                    if (node.sourceNodes[0].result.array[i][j] is null)
                        text.Append(new string(' ', columnsLength[j]));
                    else 
                        text.Append(new string(' ', columnsLength[j] - node.sourceNodes[0].result.array[i][j].Length));                    
                    text.Append("\t");
                }
            }
            text.Append("\n");
        }

        string filename = escapeFilename(node.values[1]);
        if (filename.Length == 0)
            filename = DateTime.Now.Ticks.ToString();
        else
            filename = $"{filename}_{DateTime.Now.Ticks.ToString()}";

        File.WriteAllText($"{DIR_SCRIPTS_REPORTS}\\{filename}.txt", text.ToString());
        return null;
    }
    private static ScriptResult SaveCsv(in ScriptNode node) {
        StringBuilder text = new StringBuilder();

        for (int i = 0; i < node.sourceNodes[0].result.header.Length; i++) {
            text.Append($"\"{node.sourceNodes[0].result.header[i].Replace("\"", "\"\"")}\"");
            if (i < node.sourceNodes[0].result.array.Count - 1) text.Append(",");
        }

        text.Append("\n");

        for (int i = 0; i < node.sourceNodes[0].result.array.Count; i++) {
            for (int j = 0; j < node.sourceNodes[0].result.array[i].Length; j++) {
                string v = node.sourceNodes[0].result.array[i][j];
                text.Append($"\"{v?.Replace("\"", "\"\"")}\"");
                if (j < node.sourceNodes[0].result.array[i].Length - 1) text.Append(",");
            }
            text.Append("\n");
        }

        string filename = escapeFilename(node.values[1]);
        if (filename.Length == 0)
            filename = DateTime.Now.Ticks.ToString();
        else
            filename = $"{filename}_{DateTime.Now.Ticks.ToString()}";

        File.WriteAllText($"{DIR_SCRIPTS_REPORTS}\\{filename}.csv", text.ToString());
        return null;
    }
    private static ScriptResult SaveJson(in ScriptNode node) {
        StringBuilder text = new StringBuilder();

        text.AppendLine("{\"array\": [");

        for (int i = 0; i < node.sourceNodes[0].result.array.Count; i++) { //rows loop
            text.AppendLine("{");
            for (int j = 0; j < node.sourceNodes[0].result.array[i].Length; j++) { //cell loop
                string k = node.sourceNodes[0].result.header[j];
                k = k.Replace("\\", "\\\\"); //escape chars
                k = k.Replace("/", "\\/");
                k = k.Replace("\"", "\\\"");
                k = k.Replace("\n", "\\n");
                k = k.Replace("\r", "\\r");
                k = k.Replace("\t", "\\t");

                string v = node.sourceNodes[0].result.array[i][j];
                v = v?.Replace("\\", "\\\\"); //escape chars
                v = v?.Replace("/", "\\/");
                v = v?.Replace("\"", "\\\"");
                v = v?.Replace("\n", "\\n");
                v = v?.Replace("\r", "\\r");
                v = v?.Replace("\t", "\\t");

                text.Append($"\"{k}\": ");
                text.Append(v is null ? "null" : $"\"{v}\"");
                if (j < node.sourceNodes[0].result.array[i].Length - 1) text.Append(",");
                text.AppendLine();
            }

            text.Append("}");
            if (i < node.sourceNodes[0].result.array.Count - 1) text.Append(",");
        }

        text.AppendLine();
        text.Append("]}");

        string filename = escapeFilename(node.values[1]);
        if (filename.Length == 0)
            filename = DateTime.Now.Ticks.ToString();
        else
            filename = $"{filename}_{DateTime.Now.Ticks.ToString()}";

        File.WriteAllText($"{DIR_SCRIPTS_REPORTS}\\{filename}.json", text.ToString());
        return null;
    }
    private static ScriptResult SaveXml(in ScriptNode node) {
        StringBuilder text = new StringBuilder();

        text.AppendLine("<?xml version=\"1.0\" encoding=\"UTF-8\"?>");
        text.AppendLine("<array>");

        for (int i = 0; i < node.sourceNodes[0].result.array.Count; i++) { //rows loop
            text.AppendLine("\t<entry>");
            for (int j = 0; j < node.sourceNodes[0].result.array[i].Length; j++) { //cell loop
                string k = node.sourceNodes[0].result.header[j];
                string v = node.sourceNodes[0].result.array[i][j];
                if (v is null) continue;

                string symbols = "!\"#$%&'()*+'-./:;<=>?@[\\]^`{|}~";
                k = k.Replace(" ", "_");

                foreach (char c in symbols) 
                    k = k.Replace(c, '_');

                foreach (char c in symbols)
                    while (k.StartsWith(c.ToString()))
                        k = k.Substring(1);

                string value = "";
                for (int c = 0; c < v.Length; c++)
                    if (v[c] < 127) value += v[c];

                value = value.Replace("<", "&lt;");
                value = value.Replace(">", "&gt;");
                value = value.Replace("&", "&amp;");
                value = value.Replace("'", "&apos;");
                value = value.Replace("\"", "&quot;");

                text.AppendLine($"\t\t<{k}>{value}</{k}>");
            }
            text.AppendLine("\t</entry>");
        }

        text.AppendLine("</array>");

        string filename = escapeFilename(node.values[1]);
        if (filename.Length == 0)
            filename = DateTime.Now.Ticks.ToString();
        else
            filename = $"{filename}_{DateTime.Now.Ticks.ToString()}";

        File.WriteAllText($"{DIR_SCRIPTS_REPORTS}\\{filename}.xml", text.ToString());
        return null;
    }
    private static ScriptResult SaveHtml(in ScriptNode node) {
        StringBuilder text = new StringBuilder();

        //TODO:

        string filename = escapeFilename(node.values[1]);
        if (filename.Length == 0)
            filename = DateTime.Now.Ticks.ToString();
        else
            filename = $"{filename}_{DateTime.Now.Ticks.ToString()}";

        File.WriteAllText($"{DIR_SCRIPTS_REPORTS}\\{filename}.xml", text.ToString());
        return null;
    }
    private static ScriptResult SendEMail(in ScriptNode node) { return null; }
    
    public static string escapeFilename(string filename) {
        return filename.Replace("\\", "_")
            .Replace("/", "_")
            .Replace(":", "_")
            .Replace("*", "_")
            .Replace("?", "_")
            .Replace("\"", "_")
            .Replace("<", "_")
            .Replace(">", "_")
            .Replace("|", "_");
    }
    
    
    private static async Task<IPAddress[]> DnsLookupAsync(string hostname) {
        if (hostname is null) return null;
        try {
            return await Dns.GetHostAddressesAsync(hostname);
        } catch {
            return null;
        }
    }

    private static async Task<IPHostEntry> ReverseDnsLookupAsync(string ip) {
        if (ip is null) return null;
        try {
            return await Dns.GetHostEntryAsync(ip);
        } catch {
            return null;
        }
    }

    private static async Task<PingReply> PingAsync(string host, int timeout) {
        if (host is null) return null;
        Ping p = new Ping();
        try {
            PingReply reply = await p.SendPingAsync(host, timeout);
            p.Dispose();
            return reply;
        } catch {
            p.Dispose();
            return null;
        }
    }

    private static readonly byte[] TRACE_ROUTE_BUFFER = Encoding.ASCII.GetBytes("0000000000000000000000000000000");
    private static async Task<string> TraceRouteAsync(string host, int timeout, short ttl) {
        if (host is null) return "";

        string route = "";
        string lastAddress = "";

        using (Ping p = new Ping())
            for (short i = 1; i < ttl; i++) 
                try {
                    PingReply reply = await p.SendPingAsync(host, timeout, TRACE_ROUTE_BUFFER, new PingOptions(i, true));

                    if (reply.Status == IPStatus.Success || reply.Status == IPStatus.TtlExpired) {

                        if (lastAddress == reply.Address.ToString())
                            break;
                        else
                            lastAddress = reply.Address.ToString();

                        route += reply.Address.ToString() + ";";

                    } else if (reply.Status == IPStatus.TimedOut)
                        route += "Timed out;";

                    else
                        break;

                } catch {}

        if (route.EndsWith(";")) return route.Substring(0, route.Length -1);
        return route;
    }

    private static async Task<string> PortScanAsync(string host, int from, int to) {
        if (host is null) return "";
        
        bool[] t = await Tools.PortsScanAsync(host, from, to);

        string ports = "";
        for (int i = 0; i < t.Length; i++) 
            if (t[i]) 
                ports += (from+i).ToString() + ";"; 

        if (ports.EndsWith(";")) return ports.Substring(0, ports.Length - 1);
        return ports;
    }

}

public class ScriptWrapper {}
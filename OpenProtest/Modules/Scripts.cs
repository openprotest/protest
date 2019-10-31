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

public class ScriptNode {
    public string name;
    public string[] columns;
    public string[] values;
    public string[][] parameters;
    public ScriptSocket[] sockets;
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
        
        return null;
    }

    private static ScriptResult CascadeNode(in ScriptNode node, in List<ScriptLink> links, in StringBuilder log) {
        ScriptSocket[] inputSockets = node.sockets.Where(o => o.type == 'i').ToArray();
                
        for (int i = 0; i < inputSockets.Length; i++) {
            ScriptLink link = links.Find(o => ScriptLink.Equals(o.secondary, inputSockets[i]));
            if (link is null) {
                Console.WriteLine($" ! Node {node.name} is unlinked.");
                continue;
            }

            if (node.result is null) node.result = CascadeNode(link.primaryNode, links, log);
        }
        
        return InvokeNode(node, log);
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

            case "Sort": return Sort(node);

            //TODO: ...

            case "Text file":   return SaveTxt(node);
            case "CSV file":    return SaveCsv(node);
            case "JSON file":   return SaveJson(node);
            case "XML file":    return SaveXml(node);
            case "HTML file":   return SaveHtml(node);
            case "Send e-mail": return SendEMail(node);

            default: //bypass
                log.AppendLine($" ! Undefined node: {node.name}.");
                return node.result;
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
         * [2] ->
         */

        if (node.values.Length < 2) return null;
        IPAddress ip;
        byte prefix;

        if (!IPAddress.TryParse(node.values[0], out ip))
            return null;

        if (!byte.TryParse(node.values[1], out prefix))
            return null;
        
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
         * [1] ->
         */

        ScriptResult result = new ScriptResult() {
            header = new string[] { "Value" },
            array = new List<string[]>()
        };
        result.array.Add(new string[] { node.values[0] });

        return result;
    }
    

    private static ScriptResult Sort(in ScriptNode node) {
        /* [0] <-
         * [1] Sort by
         * [2] ->
         * [3] ->
         */

#nullable enable
        int index = Array.IndexOf(node.result.header, node.values[1]);
        List<string[]>? sorted = null, reversed = null;
        
        if (index > -1) {
            sorted   = node.result.array.ConvertAll(o => o); //semi-deep copy
            reversed = node.result.array.ConvertAll(o => o); //   -- >> --

            sorted.Sort((string[] a, string[] b) => {
                double da, db;
                if (double.TryParse(a[index], out da) && double.TryParse(b[index], out db)) {
                    if (da > db) return 1;
                    if (da < db) return -1;
                    return 0;
                }
                return a[index].CompareTo(b[index]);
            });

            reversed.Sort((string[] b, string[] a) => {
                double da, db;
                if (double.TryParse(a[index], out da) && double.TryParse(b[index], out db)) {
                    if (da > db) return 1;
                    if (da < db) return -1;
                    return 0;
                }
                return a[index].CompareTo(b[index]);
            });
        }

        ScriptResult result = new ScriptResult() { //sorted
            header = node.result.header,
            array = sorted is null ? node.result.array : sorted
        };
        
#nullable disable
        return result;
    }


    private static ScriptResult SaveTxt(in ScriptNode node) {
        StringBuilder text = new StringBuilder();

        for (int i = 0; i < node.result.header.Length; i++) {
            text.Append(node.result.header[i]);
            if (i < node.result.header.Length - 1) text.Append("\t");
        }
        text.Append("\n");

        for (int i = 0; i < node.result.header.Length; i++) {
            text.Append(new String('-', node.result.header[i].Length));
            if (i < node.result.header.Length - 1) text.Append("\t");
        }
        text.Append("\n");

        for (int i = 0; i < node.result.array.Count; i++) {
            for (int j=0; j < node.result.array[i].Length; j++) {
                text.Append(node.result.array[i][j]);
                if (j < node.result.array[i].Length - 1) text.Append("\t");
            }
            text.Append("\n");
        }

        File.WriteAllText($"{DIR_SCRIPTS_REPORTS}\\{DateTime.Now.Ticks}.txt", text.ToString());
        return null;
    }

    private static ScriptResult SaveCsv(in ScriptNode node) {
        StringBuilder text = new StringBuilder();

        for (int i = 0; i < node.result.header.Length; i++) {
            text.Append($"\"{node.result.header[i].Replace("\"", "\"\"")}\"");
            if (i < node.result.array.Count - 1) text.Append(",");
        }

        text.Append("\n");

        for (int i = 0; i < node.result.array.Count; i++) {
            for (int j = 0; j < node.result.array[i].Length; j++) {
                string v = node.result.array[i][j];
                text.Append($"\"{v?.Replace("\"", "\"\"")}\"");
                if (j < node.result.array[i].Length - 1) text.Append(",");
            }
            text.Append("\n");
        }

        File.WriteAllText($"{DIR_SCRIPTS_REPORTS}\\{DateTime.Now.Ticks}.csv", text.ToString());
        return null;
    }

    private static ScriptResult SaveJson(in ScriptNode node) {
        StringBuilder text = new StringBuilder();

        text.AppendLine("{\"array\": [");

        for (int i = 0; i < node.result.array.Count; i++) { //rows loop
            text.AppendLine("{");
            for (int j = 0; j < node.result.array[i].Length; j++) { //cell loop
                string k = node.result.header[j];
                k = k.Replace("\\", "\\\\"); //escape chars
                k = k.Replace("/", "\\/");
                k = k.Replace("\"", "\\\"");
                k = k.Replace("\n", "\\n");
                k = k.Replace("\r", "\\r");
                k = k.Replace("\t", "\\t");

                string v = node.result.array[i][j];
                v = v?.Replace("\\", "\\\\"); //escape chars
                v = v?.Replace("/", "\\/");
                v = v?.Replace("\"", "\\\"");
                v = v?.Replace("\n", "\\n");
                v = v?.Replace("\r", "\\r");
                v = v?.Replace("\t", "\\t");

                text.Append($"\"{k}\": ");
                text.Append(v is null ? "null" : $"\"{v}\"");
                if (j < node.result.array[i].Length - 1) text.Append(",");
                text.AppendLine();
            }

            text.Append("}");
            if (i < node.result.array.Count - 1) text.Append(",");
        }

        text.AppendLine();
        text.Append("]}");

        File.WriteAllText($"{DIR_SCRIPTS_REPORTS}\\{DateTime.Now.Ticks}.json", text.ToString());
        return null;
    }

    private static ScriptResult SaveXml(in ScriptNode node) {
        StringBuilder text = new StringBuilder();

        text.AppendLine("<?xml version=\"1.0\" encoding=\"UTF-8\"?>");
        File.WriteAllText($"{DIR_SCRIPTS_REPORTS}\\{DateTime.Now.Ticks}.xml", text.ToString());

        return null;
    }

    private static ScriptResult SaveHtml(in ScriptNode node) { return null; }
    private static ScriptResult SendEMail(in ScriptNode node) { return null; }
    
}

public class ScriptWrapper {}
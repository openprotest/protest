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

static class Scripts {
    private static readonly string DIR_SCRIPTS = $"{Directory.GetCurrentDirectory()}\\scripts";
    private static readonly string DIR_SCRIPTS_SCRIPTS = $"{Directory.GetCurrentDirectory()}\\scripts\\scripts";
    private static readonly string DIR_SCRIPTS_REPORTS = $"{Directory.GetCurrentDirectory()}\\scripts\\reports";
    

    struct Node {
        public string name;
        public string[] columns;
        public string[] parameters;
        public string[] values;
        public Socket[] sockets;
    }

    struct Socket {
        public byte type;
        public string label;
    }

    struct Link {
        public Socket primary;
        public Socket secondary;
    }

    private static string tools_payload = null;
    private static Hashtable tools = new Hashtable();

    //TODO: cache optimization

    public static void LoadScript() {
        string FILE_SCRIPT = $"{Directory.GetCurrentDirectory()}\\scripts\\scripts.txt";
        
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
            string[] split = lines[i].Split('\t');

            for (int j = 0; j < split.Length; j++) {

            }
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
        return Encoding.UTF8.GetBytes(sb.ToString());
    }

    public static byte[] GetAdWorkstationColumns() {
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
        return Encoding.UTF8.GetBytes(sb.ToString());
    }

    public static byte[] GetAdGroupColumns() {
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
        return Encoding.UTF8.GetBytes(sb.ToString());
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

        List<Node> nodes = new List<Node>();
        List<Link> links = new List<Link>();

        string[] lines = script.Split("\n".ToCharArray(), StringSplitOptions.RemoveEmptyEntries);

        for (int i = 0; i < lines.Length; i++) {

            string[] split = lines[i].Split((char)127);

            if (split[0] == "n") { //node
                if (split.Length < 3) continue;

                List<string> values = new List<string>();
                List<string> columns = new List<string>();
                for (int j = 3; j < split.Length; j++) {
                    string[] vSplit = split[j].Split(':');
                    if (vSplit[0] == "v")
                        values.Add(vSplit[1]);
                    else if (vSplit[0] == "c")
                        columns.Add(vSplit[1]);
                }

                Node n = new Node() {
                    name = split[1],
                    values = values.ToArray(),
                    columns = columns.ToArray()
                    //TODO: parameters
                    //TODO: sockets
                };
                nodes.Add(n);

                Console.WriteLine(nodes.Count);
                //calc calumns

                values.Clear();
                columns.Clear();

            } else if (split[0] == "l") { //link
                if (split.Length < 5) continue;

                int primartIndex = int.Parse(split[1]);
                int secondaryIndex = int.Parse(split[3]);

                Node primaryNode = nodes[primartIndex];
                Node secondaryNode = nodes[secondaryIndex];

                Socket? primary = null, secondary = null;
                //primary = Array.Find(primaryNode.sockets, o=> {return o.type == (byte)'o' && o.label == split[2];});
                //secondary = Array.Find(secondaryNode.sockets, o=> {return o.type == (byte)'i' && o.label == split[4];});

                if (primary is null || secondary is null) continue;

                Link l = new Link() {
                    primary = (Socket) primary,
                    secondary = (Socket) secondary
                };
                
                links.Add(l);
            }
        }

        for (int i = 0; i < lines.Length; i++) {
            //get nodes
        }

        for (int i = 0; i < lines.Length; i++) {
            //find links and CalculateColumns
        }

        for (int i = 0; i < lines.Length; i++) {
            //ignore links?
        }

        return null;
    }

    private static string[] CalculateColumns(string name, string[] selectedColumns = null) {
        List<string> columns = new List<string>();


        switch (name) {
            case "Protest users":        break;
            case "Protest equipment":    break;
            case "Domain users":         break;
            case "Domain workstations":  break;
            case "Domain groups":        break;
            case "IPv4 subnet":          break;
            case "Single value":         break;
        }

        return columns.ToArray();
    }
}
using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.NetworkInformation;
using System.Security.Policy;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

public static class Fetch {
    
    struct FetchResult {
        public string name;
        public string type;
        public DateTime started;
        public DateTime finished;
        public Hashtable dataset;
        public int successful;
        public int unsuccessful;
        public int conflictContition;
        public int conflictAction;
    }
    
    public static TaskWrapper fetchTask = null;
    private static FetchResult? lastFetch = null;

    public static string GetFetchTaskStatus() {
        string response;

        if (!(fetchTask is null)) {
            response = "{";
            response += $"\"status\":\"{Strings.EscapeJson(fetchTask.status)}\",";
            response += $"\"name\":\"{Strings.EscapeJson(fetchTask.name)}\",";
            response += $"\"started\":\"{Strings.EscapeJson(fetchTask.started.ToString())}\",";
            response += $"\"completed\":\"{Strings.EscapeJson(fetchTask.GetStepsCompleted().ToString())}\",";
            response += $"\"total\":\"{Strings.EscapeJson(fetchTask.stepsTotal.ToString())}\",";
            response += $"\"etc\":\"{Strings.EscapeJson(fetchTask.GetEtc())}\"";
            response += "}";

        } else if (!(lastFetch is null)) {
            response = "{";
            response += $"\"status\":\"pending\",";
            response += $"\"name\":\"{Strings.EscapeJson(lastFetch?.name)}\",";
            response += $"\"started\":\"{Strings.EscapeJson(lastFetch?.started.ToString())}\",";
            response += $"\"finished\":\"{Strings.EscapeJson(lastFetch?.finished.ToString())}\",";
            response += $"\"successful\":\"{Strings.EscapeJson(lastFetch?.successful.ToString())}\",";
            response += $"\"unsuccessful\":\"{Strings.EscapeJson(lastFetch?.unsuccessful.ToString())}\"";
            response += "}";


        } else {
            response = "{\"status\":\"none\"}";
        }

        return response;
    }

    public static byte[] AbortFetch(in string performer) {
        if (fetchTask is null) return Strings.NTK.Array;
        if (!fetchTask.thread.IsAlive) return Strings.NTK.Array;

        fetchTask.Abort(performer);
        fetchTask = null;
        GC.Collect();
        return Strings.OK.Array;
    }

    public static byte[] ApproveLastFetch(in string performer) {
        if (lastFetch is null) return Strings.NTK.Array;

        Database.SaveMethod saveMethod = (Database.SaveMethod)lastFetch?.conflictContition;

        if (lastFetch?.type == "equip") {
            foreach (DictionaryEntry o in lastFetch?.dataset)
                Database.SaveEntry((Hashtable)o.Value, null, saveMethod, performer, false);

            lastFetch = null;
            KeepAlive.Broadcast($"{{\"action\":\"approvedfetch\",\"type\":\"equip\"}}");
            return Strings.OK.Array;

        } else if (lastFetch?.type == "users") {
            foreach (DictionaryEntry o in lastFetch?.dataset)
                Database.SaveEntry((Hashtable)o.Value, null, saveMethod, performer, true);

            lastFetch = null;
            KeepAlive.Broadcast($"{{\"action\":\"approvedfetch\",\"type\":\"user\"}}");
            return Strings.OK.Array;
        }

        return Strings.INV.Array;
    }

    public static byte[] DiscardLastFetch(in string performer) {
        lastFetch = null;
        GC.Collect();
        return Strings.OK.Array;
    }

    public static byte[] ImportDatabase(in HttpListenerContext ctx, in string performer) {
        string ip = "127.0.0.1";
        int port = 443;
        string protocol = "https";
        string username = "";
        string password = "";
        bool importEquip = true;
        bool importUsers = true;

        using (StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding)) {
            string[] para = reader.ReadToEnd().Split('&');
            for (int i = 0; i < para.Length; i++) {
                if (para[i].StartsWith("ip=")) ip = para[i].Substring(3);
                if (para[i].StartsWith("port=")) port = int.Parse(para[i].Substring(5));
                if (para[i].StartsWith("protocol=")) protocol = para[i].Substring(9);
                if (para[i].StartsWith("username=")) username = para[i].Substring(9);
                if (para[i].StartsWith("password=")) password = para[i].Substring(9);
                if (para[i].StartsWith("equip=")) importEquip = para[i].Substring(6) == "true";
                if (para[i].StartsWith("users=")) importUsers = para[i].Substring(6) == "true";
            }
        }

        string sessionid = "";
        double version = 0.0;

        Uri uri = new Uri($"{protocol}://{ip}:{port}");
        HttpContent auth_paylaod = new StringContent($"{username}{(char)127}{password}", Encoding.UTF8, "text/plain");

        ServicePointManager.ServerCertificateValidationCallback = (message, cert, chain, errors) => { return true; };

        try {
            using HttpClient client_auth = new HttpClient();
            client_auth.BaseAddress = uri;
            client_auth.DefaultRequestHeaders.UserAgent.Add(new System.Net.Http.Headers.ProductInfoHeaderValue("pro-test", "4.0"));
            client_auth.DefaultRequestHeaders.Accept.Add(new System.Net.Http.Headers.MediaTypeWithQualityHeaderValue("*/*"));

            Task<HttpResponseMessage> res_auth = client_auth.PostAsync("a", auth_paylaod); //POST

            string setcookie = res_auth.Result.Headers.GetValues("Set-Cookie").Single();

            string[] cookieSplit = setcookie.Split(';');
            for (int i = 0; i < cookieSplit.Length; i++) {
                cookieSplit[i] = cookieSplit[i].Trim();
                if (cookieSplit[i].StartsWith("sessionid=")) {
                    sessionid = cookieSplit[i].Substring(10);
                    break;
                }
            }
        } catch { }

        if (sessionid.Length == 0) return Strings.FAI.Array;

        CookieContainer cookieContainer = new CookieContainer();
        cookieContainer.Add(new Cookie() {
            Name = "sessionid",
            Value = sessionid,
            Domain = ip
        });

        try {
            using HttpClientHandler handler = new HttpClientHandler();
            handler.CookieContainer = cookieContainer;
            using (HttpClient client_ver = new HttpClient(handler)) {
                client_ver.BaseAddress = uri;
                client_ver.DefaultRequestHeaders.UserAgent.Add(new System.Net.Http.Headers.ProductInfoHeaderValue("pro-test", "4.0"));
                client_ver.DefaultRequestHeaders.Accept.Add(new System.Net.Http.Headers.MediaTypeWithQualityHeaderValue("*/*"));

                Task<HttpResponseMessage> res_ver = client_ver.GetAsync("version");

                if (res_ver.Result.StatusCode == HttpStatusCode.NotFound) {
                    version = 3.2;
                } else {
                    string[] ver = res_ver.Result.Content.ReadAsStringAsync().Result
                        .Replace("{", "")
                        .Replace("}", "")
                        .Replace("\"", "")
                        .Replace(" ", "")
                        .Split(',');

                    string major="0", minor="0";
                    for (int i=0; i<ver.Length; i++) {
                        if (ver[i].StartsWith("major:")) major = ver[i].Substring(6);
                        if (ver[i].StartsWith("minor:")) minor = ver[i].Substring(6);
                    }
                    version = double.Parse($"{major}.{minor}");
                }
            };

        } catch (HttpRequestException ex) {
            Logging.Err(ex);

        } catch (ArgumentNullException ex) {
            Logging.Err(ex);

        } catch (InvalidOperationException ex) {
            Logging.Err(ex);

        } catch (Exception ex) {
            Logging.Err(ex);
        }

        if (importEquip) {
            Logging.Action(in performer, $"Import users from {ip}");
            if (version < 4)
                ImportEquip_3(uri, cookieContainer);
            else if (version == 4)
                ImportEquip_4(uri, cookieContainer);
        }

        if (importUsers) {
            Logging.Action(in performer, $"Import equipment from {ip}");
            if (version < 4)
                ImportUsers_3(uri, cookieContainer);
            else if (version == 4)
                ImportUsers_4(uri, cookieContainer);
        }

        GC.Collect();

        return Strings.OK.Array;
    }


    public static void ImportEquip_3(Uri uri, CookieContainer cookieContainer) {
        using HttpClientHandler handler = new HttpClientHandler();
        handler.CookieContainer = cookieContainer;

        using HttpClient client = new HttpClient(handler);
        client.BaseAddress = uri;
        client.DefaultRequestHeaders.UserAgent.Add(new System.Net.Http.Headers.ProductInfoHeaderValue("pro-test", "4.0"));
        client.DefaultRequestHeaders.Accept.Add(new System.Net.Http.Headers.MediaTypeWithQualityHeaderValue("*/*"));

        Task<HttpResponseMessage> res = client.GetAsync("getequiplist");
        string payload = res.Result.Content.ReadAsStringAsync().Result;

        string[] split = payload.Split((char)127);

        int i = 1;
        while (i < split.Length) {
            Program.ProgressBar(i * 100 / split.Length, "Importing equipment");

            if (int.TryParse(split[i], out int len)) {

                Hashtable hash = new Hashtable();
                for (int j = i + 1; j < i + len * 4; j += 4)
                    hash.Add(split[j], new string[] { split[j + 1], split[j + 2], "" });

                string filename = hash.ContainsKey(".FILENAME") ? ((string[])hash[".FILENAME"])[0] : DateTime.Now.Ticks.ToString();


                if (hash.ContainsKey("L1 CACHE") && hash.ContainsKey("L2 CACHE") && hash.ContainsKey("L3 CACHE")) { //normalize
                    string L1 = ((string[])hash["L1 CACHE"])[0];
                    string L2 = ((string[])hash["L2 CACHE"])[0];
                    string L3 = ((string[])hash["L3 CACHE"])[0];
                    string date = ((string[])hash["L1 CACHE"])[1];

                    hash.Remove("L1 CACHE");
                    hash.Remove("L2 CACHE");
                    hash.Remove("L3 CACHE");

                    hash["CPU CACHE"] = new string[] { $"{L1}/{L2}/{L3}", date, "" };
                }

                if (hash.ContainsKey(".VOLUME")) hash.Remove(".VOLUME");
                if (hash.ContainsKey(".CANREMOTE")) hash.Remove(".CANREMOTE");


                Hashtable passwords = new Hashtable();
                foreach (DictionaryEntry e in hash) //get passwords
                    if (((string)e.Key).Contains("PASSWORD")) {
                        string password = GetHiddenProperty(uri, cookieContainer, $"getequiprop&file={filename}&property={(string)e.Key}");
                        string performer = ((string[])hash[e.Key])[1];
                        passwords.Add(e.Key, new string[] { password, performer});
                    }
                foreach (DictionaryEntry e in passwords) {
                    string[] value = (string[])passwords[e.Key];
                    hash[e.Key] = new string[] { value[0], value[1], "" };
                }


                while (Database.equip.ContainsKey(filename)) {
                    Thread.Sleep(1);
                    filename = DateTime.Now.Ticks.ToString();
                }
                hash[".FILENAME"] = new string[] { filename, "", "" };

                Database.DbEntry entry = new Database.DbEntry() {
                    filename = filename,
                    hash = hash,
                    isUser = false,
                    write_lock = new object()
                };

                Database.equip.Add(filename, entry);
                Database.Write(entry, null);
            }
            i += 1 + len * 4;
        }

        Program.ProgressBar(100, "Importing equipment", true);
        Console.WriteLine();
    }

    public static void ImportUsers_3(Uri uri, CookieContainer cookieContainer) {
        using HttpClientHandler handler = new HttpClientHandler();
        handler.CookieContainer = cookieContainer;

        using HttpClient client = new HttpClient(handler);
        client.BaseAddress = uri;
        client.DefaultRequestHeaders.UserAgent.Add(new System.Net.Http.Headers.ProductInfoHeaderValue("pro-test", "4.0"));
        //client.DefaultRequestHeaders.Accept.Add(new System.Net.Http.Headers.MediaTypeWithQualityHeaderValue("*/*"));

        Task<HttpResponseMessage> res = client.GetAsync("getuserslist");
        string payload = res.Result.Content.ReadAsStringAsync().Result;

        string[] split = payload.Split((char)127);

        int i = 1;
        while (i < split.Length) {
            Program.ProgressBar(i * 100 / split.Length, "Importing users");

            if (int.TryParse(split[i], out int len)) {

                Hashtable hash = new Hashtable();
                for (int j = i + 1; j < i + len * 4; j += 4)
                    hash.Add(split[j], new string[] { split[j + 1], split[j + 2], "" });

                string filename = hash.ContainsKey(".FILENAME") ? ((string[])hash[".FILENAME"])[0] : DateTime.Now.Ticks.ToString();


                Hashtable passwords = new Hashtable();
                foreach (DictionaryEntry e in hash) //get passwords
                    if (((string)e.Key).Contains("PASSWORD")) {
                        string password = GetHiddenProperty(uri, cookieContainer, $"getuserprop&file={filename}&property={(string)e.Key}");
                        string performer = ((string[])hash[e.Key])[1];
                        passwords.Add(e.Key, new string[] { password, performer });
                    }
                foreach (DictionaryEntry e in passwords) {
                    string[] value = (string[])passwords[e.Key];
                    hash[e.Key] = new string[] { value[0], value[1], "" };
                }


                while (Database.users.ContainsKey(filename)) {
                    Thread.Sleep(1);
                    filename = DateTime.Now.Ticks.ToString();
                }
                hash[".FILENAME"] = new string[] { filename, "", "" };

                Database.DbEntry entry = new Database.DbEntry() {
                    filename = filename,
                    hash = hash,
                    isUser = true,
                    write_lock = new object()
                };

                Database.users.Add(filename, entry);
                Database.Write(entry, null);
            }
            i += 1 + len * 4;
        }

        Program.ProgressBar(100, "Importing users", true);
        Console.WriteLine();
    }

    public static void ImportEquip_4(Uri uri, CookieContainer cookieContainer) {
        ImportEquip_3(uri, cookieContainer);
    }

    public static void ImportUsers_4(Uri uri, CookieContainer cookieContainer) {
        ImportUsers_3(uri, cookieContainer);
    }

    public static string GetHiddenProperty(Uri uri, CookieContainer cookieContainer, string path) {
        using HttpClientHandler handler = new HttpClientHandler();
        handler.CookieContainer = cookieContainer;

        using HttpClient client = new HttpClient(handler);
        client.BaseAddress = uri;
        client.DefaultRequestHeaders.UserAgent.Add(new System.Net.Http.Headers.ProductInfoHeaderValue("pro-test", "4.0"));
        //client.DefaultRequestHeaders.Accept.Add(new System.Net.Http.Headers.MediaTypeWithQualityHeaderValue("*/*"));

        Task<HttpResponseMessage> res = client.GetAsync(path);
        string payload = res.Result.Content.ReadAsStringAsync().Result;

        return payload;
    }

    public static byte[] FetchArrayToBytes(Hashtable hash) {
        if (hash is null) return Strings.INF.Array;

        StringBuilder sb = new StringBuilder();
        foreach (DictionaryEntry o in hash) {
            string[] value = (string[])o.Value;
            sb.Append($"{o.Key}{(char)127}{value[0]}{(char)127}{value[1]}{(char)127}");
        }
        return Encoding.UTF8.GetBytes(sb.ToString());
    }

    public static byte[] SingleFetchEquipBytes(string[] para) {
        string host = null, filename = null;
        for (int i = 0; i < para.Length; i++) {
            if (para[i].StartsWith("host=")) host = para[i].Substring(5);
            if (para[i].StartsWith("filename=")) filename = para[i].Substring(9);
        }

        if (!(filename is null) && filename.Length > 0) {
            if (!Database.equip.ContainsKey(filename)) return Strings.FLE.Array;

            Database.DbEntry entry = (Database.DbEntry)Database.equip[filename];
            if (!entry.hash.ContainsKey("IP")) return Strings.INF.Array;

            host = ((string[])entry.hash["IP"])[0];
            if (host.IndexOf(";") > -1) host = host.Split(';')[0].Trim();

            if (host.Length == 0) {
                host = ((string[])entry.hash["HOSTNAME"])[0];
                if (host.IndexOf(";") > -1) host = host.Split(';')[0].Trim();
                host = System.Net.Dns.GetHostAddresses(host)[0].ToString();
            }
        }

        if (host is null || host.Length == 0) return Strings.INV.Array;
        return FetchArrayToBytes(SingleFetchEquip(host));
    }    
    public static Hashtable SingleFetchEquip(string host, bool async = true) {
        if (host is null) return null;

        string ip = null;
        if (host?.Split('.').Length == 4) {
            bool isIp = true;
            string[] split = host.Split('.');
            for (int i = 0; i < 4; i++)
                if (!byte.TryParse(split[i], out _)) {
                    isIp = false;
                    break;
                }
            if (isIp) ip = host;
        }

        string hostname = null;
        try {
            hostname = System.Net.Dns.GetHostEntry(host).HostName;
            hostname = hostname.Split('.')[0];

            if (ip is null) {
                IPAddress[] resolvedIp = System.Net.Dns.GetHostEntry(host).AddressList;
                for (int i = 0; i < resolvedIp.Length; i++) //getIPv4 from DNS
                    if (resolvedIp[i].AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork) {
                        ip = resolvedIp[i].ToString();
                        break;
                    }
            }
        } catch { }

        string netbios = NetBios.GetBiosName(ip?.ToString());
        
        Hashtable wmi      = new Hashtable();
        Hashtable ad       = new Hashtable();
        string portscan = "";

        Thread tWmi = new Thread(()=> {
            wmi = Wmi.WmiFetch(host);
        });

        Thread tAd = new Thread(()=> {
            if (hostname is null) return;

            System.DirectoryServices.SearchResult result = ActiveDirectory.GetWorkstation(hostname);
            if (result is null) return;

            if (result.Properties["description"].Count > 0) {
                string value = result.Properties["description"][0].ToString();
                if (value.Length > 0) ad.Add("DESCRIPTION", value);
            }
            
            if (result.Properties["distinguishedName"].Count > 0) {
                string value = result.Properties["distinguishedName"][0].ToString();
                if (value.Length > 0) ad.Add("DISTINGUISHED NAME", value);
            }
            
            if (result.Properties["dNSHostName"].Count > 0) {
                string value = result.Properties["dNSHostName"][0].ToString();
                if (value.Length > 0) ad.Add("DNS HOSTNAME", value);
            }
            
            if (result.Properties["operatingSystem"].Count > 0) {
                string value = result.Properties["operatingSystem"][0].ToString();
                if (value.Length > 0) ad.Add("OPERATING SYSTEM", value);
            }
            
            if (result.Properties["whenCreated"].Count > 0) {
                string value = result.Properties["whenCreated"][0].ToString();
                if (value.Length > 0) ad.Add("CREATED ON DC", value);
            }

            /*if (result.Properties["whenChanged"].Count > 0) {
                string value = result.Properties["whenChanged"][0].ToString();
                if (value.Length > 0) ad.Add("CHANGED ON DC", value);
            }*/
        });

        Thread tPortscan = new Thread(async()=> {
            bool[] ports = await PortScan.PortsScanAsync(host, PortScan.basic_ports);

            for (int i = 0; i< PortScan.basic_ports.Length; i++)
                if (ports[i]) portscan += $"{PortScan.basic_ports[i]}; ";

            if (portscan.EndsWith("; ")) portscan = portscan.Substring(0, portscan.Length - 2);
        });
        
        if (async) {
            tWmi.Start(); tAd.Start(); tPortscan.Start();
            tWmi.Join(); tAd.Join(); tPortscan.Join();
        } else {
            tWmi.Start(); tWmi.Join();            
            tAd.Start(); tAd.Join();
            tPortscan.Start(); tPortscan.Join();
        }

        //StringBuilder content = new StringBuilder();
        Hashtable hash = new Hashtable();

        foreach (DictionaryEntry o in wmi)
            hash.Add(o.Key,  new string[] { o.Value.ToString(), "WMI", "" });

        foreach (DictionaryEntry o in ad) {
            string key = o.Key.ToString();

            if (key == "OPERATING SYSTEM") {
                if (!wmi.ContainsKey("OPERATING SYSTEM"))
                    hash.Add(o.Key, new string[] { o.Value.ToString(), "Active directory", "" });
            } else {
                hash.Add(o.Key, new string[] { o.Value.ToString(), "Active directory", "" });
            }
        }

        if (portscan.Length > 0)
            hash.Add("PORTS", new string[] { portscan, "Port-scan", "" });
        
        string mac = "";
        if (wmi.ContainsKey("MAC ADDRESS")) {
            mac = ((string)wmi["MAC ADDRESS"]).Split(';')[0].Trim();
        } else {
            mac = Arp.ArpRequest(host);
            if (!(mac is null) && mac.Length > 0)
                hash.Add("MAC ADDRESS", new string[] { mac, "ARP", "" });
        }

        if (!wmi.ContainsKey("MANUFACTURER") && mac.Length > 0) {
            string manufacturer = Encoding.UTF8.GetString(MacLookup.Lookup(mac));
            if (!(manufacturer is null) && manufacturer.Length > 0)
                hash.Add("MANUFACTURER", new string[] { mac , "MAC lookup", "" });
        }

        if (!wmi.ContainsKey("HOSTNAME"))
            if (!(netbios is null) && netbios.Length > 0) { //use biosnet
                hash.Add("HOSTNAME", new string[] { netbios, "NetBIOS", "" });
            } else { //use dns
                hash.Add("HOSTNAME", new string[] { hostname, "DNS", "" });
            }
        
        //name and type

        return hash;
    }

    public static byte[] SingleFetchUserBytes(string[] para) {
        string username = null, filename = null;
        for (int i = 0; i < para.Length; i++) {
            if (para[i].StartsWith("username=")) username = para[i].Substring(9);
            if (para[i].StartsWith("filename=")) filename = para[i].Substring(9);
        }

        if (!(filename is null) && filename.Length > 0) {
            if (!Database.users.ContainsKey(filename)) return Strings.FLE.Array;

            Database.DbEntry entry = (Database.DbEntry)Database.users[filename];
            if (!entry.hash.ContainsKey("USERNAME")) return Strings.INF.Array;

            username = ((string[])entry.hash["USERNAME"])[0];
            if (username.IndexOf(";") > -1) username = username.Split(';')[0].Trim();
        }

        if (username is null || username.Length == 0) return Strings.INV.Array;
        return FetchArrayToBytes(SingleFetchUser(username));
    }
    public static Hashtable SingleFetchUser(string username) {
        if (username is null) return null;

        Hashtable fetch = ActiveDirectory.AdFetch(username);

        if (fetch is null) return null;
        Hashtable hash = new Hashtable();

        foreach (DictionaryEntry o in fetch)
            hash.Add(o.Key, new string[] { o.Value.ToString(), "Active directory", "" });

        return hash;
    }

    public static byte[] FetchEquip(in HttpListenerContext ctx, string performer) {
        string from = null, to = null, domain = null;
        int portscan=0, conflictcontition = 0, conflictaction = 0, retries = 0, interval = 0;
        using (StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding)) {
            string[] para = reader.ReadToEnd().Split('&');
            for (int i = 0; i < para.Length; i++) {
                if (para[i].StartsWith("from=")) from = para[i].Substring(5);
                if (para[i].StartsWith("to=")) to = para[i].Substring(3);
                if (para[i].StartsWith("domain=")) domain = para[i].Substring(7);

                if (para[i].StartsWith("portscan=")) portscan = int.Parse(para[i].Substring(9));
                if (para[i].StartsWith("conflictcontition=")) int.TryParse(para[i].Substring(18), out conflictcontition);
                if (para[i].StartsWith("conflictaction=")) int.TryParse(para[i].Substring(15), out conflictaction);
                if (para[i].StartsWith("retries=")) int.TryParse(para[i].Substring(8), out retries);
                if (para[i].StartsWith("interval=")) int.TryParse(para[i].Substring(9), out interval);
            }
        }

        if (!(from is null) && !(to is null)) {
            byte[] arrFrom = IPAddress.Parse(from).GetAddressBytes();
            byte[] arrTo = IPAddress.Parse(to).GetAddressBytes();
            Array.Reverse(arrFrom);
            Array.Reverse(arrTo);

            uint intFrom = BitConverter.ToUInt32(arrFrom, 0);
            uint intTo = BitConverter.ToUInt32(arrTo, 0);

            if (intFrom > intTo) return Strings.INV.Array;

            string[]  hosts = new string[intTo - intFrom + 1];
            for (uint i = intFrom; i < intTo + 1 && i < UInt32.MaxValue - 1; i++)
                hosts[i - intFrom] = i.ToString();

            return FetchEquipTask(hosts, portscan, conflictcontition, conflictaction, retries, interval , performer);
        }

        if (!(domain is null)) {
            string[] hosts = ActiveDirectory.GetAllWorkstations(domain);
            if (hosts is null) return Strings.FAI.Array;
            return FetchEquipTask(hosts, portscan, conflictcontition, conflictaction, retries, interval, performer);
        }

        return Strings.INF.Array;
    }
    
    public static byte[] FetchUsers(in HttpListenerContext ctx, string performer) {
        string domain = null;
        int conflictcontition = 0, conflictaction = 0;
        using (StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding)) {
            string[] para = reader.ReadToEnd().Split('&'); 
            for (int i = 0; i < para.Length; i++) {
                if (para[i].StartsWith("domain=")) domain = para[i].Substring(7);
                if (para[i].StartsWith("conflictcontition=")) int.TryParse(para[i].Substring(18), out conflictcontition);
                if (para[i].StartsWith("conflictaction=")) int.TryParse(para[i].Substring(15), out conflictaction);
            }
        }
        
        if (domain is null) return Strings.INF.Array;

        string[] users = ActiveDirectory.GetAllUsers(domain);
        if (users is null) return Strings.FAI.Array;

        return FetchUsersTask(users, conflictcontition, conflictaction, performer);
    }

    public static byte[] FetchEquipTask(string[] hosts, int portscan, int conflictcontition, int conflictaction, int retries, int interval, string performer) {
        if (!(fetchTask is null)) return Strings.TSK.Array;
        if (!(lastFetch is null)) return Strings.TSK.Array;

        const int WINDOW = 32;

        Action onComplete = () => {
            fetchTask = null;
        };

        Thread thread = new Thread(() => {
            fetchTask.status = "fetching";
            DateTime lastBroadcast = DateTime.Now;
            KeepAlive.Broadcast($"{{\"action\":\"startfetch\",\"type\":\"equip\",\"task\":{GetFetchTaskStatus()}}}");

            int retriesCount = 0;
            int idle = interval switch
            {
                0 => (int)Session.HOUR / 2,
                1 => (int)Session.HOUR,
                2 => (int)Session.HOUR * 2,
                3 => (int)Session.HOUR * 4,
                4 => (int)Session.HOUR * 6,
                5 => (int)Session.HOUR * 8,
                6 => (int)Session.HOUR * 12,
                7 => (int)Session.HOUR * 24,
                8 => (int)Session.HOUR * 48,
                _ => 0
            };

            Hashtable dataset = Hashtable.Synchronized(new Hashtable());
            List<string> queue = new List<string>();
            List<string> redo = new List<string>();
            List<string> done = new List<string>();

            queue.AddRange(hosts);

            do {
                List<Task<Hashtable>> tasks = new List<Task<Hashtable>>();

                for (int i = 0; i <  Math.Min(WINDOW, queue.Count); i++)
                    tasks.Add(new Task<Hashtable> (()=> {

                        PingReply reply = null;
                        try {
                            reply = new System.Net.NetworkInformation.Ping().SendPingAsync(hosts[i], 1500).Result;
                        } catch { }

                        if (reply?.Status == IPStatus.Success) {
                            return SingleFetchEquip(hosts[i]);
                        }

                        return null;
                    }));

                Hashtable[] result = Task.WhenAll(tasks).Result;



                fetchTask.status = "sleeping";
                Thread.Sleep(idle);
                fetchTask.status = "fetching";

            } while (retries < retriesCount++ && queue.Count > 0);



            for (int i = 0; i < hosts.Length; i++) {
                Hashtable hash = SingleFetchEquip(hosts[i]);

                if (DateTime.Now.Ticks - lastBroadcast.Ticks > 600_000_000) { //after a minute(s)
                    KeepAlive.Broadcast($"{{\"action\":\"updatefetch\",\"type\":\"equip\",\"task\":{GetFetchTaskStatus()}}}");
                    lastBroadcast = DateTime.Now;
                }

                if (hash is null) continue;
                fetchTask.SetStepsCompleted(i + 1);
                dataset.Add(hosts[i], hash);
            }

            lastFetch = new FetchResult() {
                name = fetchTask.name,
                type = "equip",
                started = fetchTask.started,
                finished = DateTime.Now,
                dataset = dataset,
                successful = fetchTask.GetStepsCompleted(),
                unsuccessful = fetchTask.stepsTotal - fetchTask.GetStepsCompleted(),
                conflictContition = conflictcontition,
                conflictAction = conflictaction
            };

            fetchTask.Complete();
            onComplete();
            KeepAlive.Broadcast($"{{\"action\":\"finishfetch\",\"type\":\"equip\",\"task\":{GetFetchTaskStatus()}}}");
        });

        fetchTask = new TaskWrapper("Fetching equipment", performer) {
            stepsTotal = hosts.Length,
            thread = thread
        };
        fetchTask.thread.Start();

        return Strings.OK.Array;
    }

    public static byte[] FetchUsersTask(string[] users,  int conflictcontition, int conflictaction, string performer) {
        if (!(fetchTask is null)) return Strings.TSK.Array;
        if (!(lastFetch is null)) return Strings.TSK.Array;

        Hashtable dataset = new Hashtable();

        Action onComplete = () => {
            fetchTask = null;
        };

        Thread thread = new Thread(() => {
            fetchTask.status = "fetching";

            DateTime lastBroadcast = new DateTime(0); //DateTime.Now;
            KeepAlive.Broadcast($"{{\"action\":\"startfetch\",\"type\":\"users\",\"task\":{GetFetchTaskStatus()}}}");

            for (int i = 0; i < users.Length; i++) {
                Hashtable hash = SingleFetchUser(users[i]);
                fetchTask.SetStepsCompleted(i + 1);
                
                if (DateTime.Now.Ticks - lastBroadcast.Ticks > 50_000_000) { //after 5 seconds
                    KeepAlive.Broadcast($"{{\"action\":\"updatefetch\",\"type\":\"users\",\"task\":{GetFetchTaskStatus()}}}"); 
                    lastBroadcast = DateTime.Now;
                }

                dataset.Add(users[i], hash);
            }

            lastFetch = new FetchResult() {
                name = fetchTask.name,
                type = "users",
                started = fetchTask.started,
                finished = DateTime.Now,
                dataset = dataset,
                successful = dataset.Count,
                unsuccessful = fetchTask.stepsTotal - dataset.Count,
                conflictContition = conflictcontition,
                conflictAction = conflictaction
            };

            fetchTask.Complete();
            onComplete();
            KeepAlive.Broadcast($"{{\"action\":\"finishfetch\",\"type\":\"users\",\"task\":{GetFetchTaskStatus()}}}");
        });

        fetchTask = new TaskWrapper("Fetching users", performer) {
            stepsTotal = users.Length,
            thread = thread,
        };
        fetchTask.thread.Start();

        return Strings.OK.Array;
    }

}
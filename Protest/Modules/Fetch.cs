using System;
using System.Collections;
using System.Collections.Generic;
using System.DirectoryServices;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.NetworkInformation;
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

    public static string GetTaskStatus() {
        string response;

        if (!(lastFetch is null)) {
            response = "{";
            response += $"\"status\":\"pending\",";
            response += $"\"name\":\"{Strings.EscapeJson(lastFetch?.name)}\",";
            response += $"\"started\":\"{Strings.EscapeJson(lastFetch?.started.ToString())}\",";
            response += $"\"finished\":\"{Strings.EscapeJson(lastFetch?.finished.ToString())}\",";
            response += $"\"successful\":\"{Strings.EscapeJson(lastFetch?.successful.ToString())}\",";
            response += $"\"unsuccessful\":\"{Strings.EscapeJson(lastFetch?.unsuccessful.ToString())}\"";
            response += "}";

        }  else if (!(fetchTask is null)) {
            response = "{";
            response += $"\"status\":\"{Strings.EscapeJson(fetchTask.status)}\",";
            response += $"\"name\":\"{Strings.EscapeJson(fetchTask.name)}\",";
            response += $"\"started\":\"{Strings.EscapeJson(fetchTask.started.ToString())}\",";
            response += $"\"completed\":\"{Strings.EscapeJson(fetchTask.GetStepsCompleted().ToString())}\",";
            response += $"\"total\":\"{Strings.EscapeJson(fetchTask.stepsTotal.ToString())}\",";
            response += $"\"etc\":\"{Strings.EscapeJson(fetchTask.GetEtc())}\"";
            response += "}";

        } else {
            response = "{\"status\":\"none\"}";
        }

        return response;
    }

    public static byte[] AbortFetch(in string performer) {
        if (fetchTask is null) return Strings.NTK.Array;

        fetchTask.Abort(performer);
        fetchTask = null;
        lastFetch = null;
        GC.Collect();
        return Strings.OK.Array;
    }

    public static byte[] ApproveLastFetch(in string performer) {
        if (lastFetch is null) return Strings.NTK.Array;

        Database.SaveMethod saveMethod = (Database.SaveMethod)lastFetch?.conflictAction;

        if (lastFetch?.type == "equip") {

            string keyProperty = lastFetch?.conflictContition switch {
                1 => "IP",
                2 => "HOSTNAME",
                3 => "MAC ADDRESS",
                _ => null
            };

            Hashtable keys = new Hashtable();
            foreach (DictionaryEntry e in Database.equip) {
                Database.DbEntry entry = (Database.DbEntry)e.Value;
                if (!entry.hash.ContainsKey(keyProperty)) continue;
                string[] key = ((string[])entry.hash[keyProperty])[0].Split(';').Select(o => o.Trim().ToLower()).ToArray();
                for (int i = 0; i < key.Length; i++) {
                    if (key[i].Length == 0) continue;
                    if (keys.ContainsKey(key[i])) continue;
                    keys.Add(key[i], entry.filename);
                }
            }

            foreach (DictionaryEntry o in lastFetch?.dataset) {
                Hashtable hash = (Hashtable)o.Value;
                if (hash.ContainsKey(keyProperty)) {
                    string filename = ((string[])hash[keyProperty])[0];
                    string conflictedFile = keys.ContainsKey(filename) ? (string)keys[filename] : null;
                    Database.SaveEntry(hash, conflictedFile, saveMethod, performer, false);
                } else {
                    Database.SaveEntry(hash, null, saveMethod, performer, false);
                }
            }

            keys.Clear();
            fetchTask = null;
            lastFetch = null;
            //Database.equipVer = DateTime.Now.Ticks;
            KeepAlive.Broadcast($"{{\"action\":\"approvedfetch\",\"type\":\"equip\"}}");
            Logging.Action(in performer, "Approve fetched equipment");
            KeepAlive.Broadcast($"{{\"action\":\"version\",\"userver\":\"{Database.usersVer}\",\"equipver\":\"{Database.equipVer}\"}}");
            return Strings.OK.Array;

        } else if (lastFetch?.type == "users") {
            Hashtable keys = new Hashtable();
            foreach (DictionaryEntry e in Database.users) {
                Database.DbEntry entry = (Database.DbEntry)e.Value;
                if (!entry.hash.ContainsKey("USERNAME")) continue;
                string[] key = ((string[])entry.hash["USERNAME"])[0].Split(';').Select(o=>o.Trim().ToLower()).ToArray();
                for (int i = 0; i < key.Length; i++) {
                    if (key[i].Length == 0) continue;
                    if (keys.ContainsKey(key[i])) continue;
                    keys.Add(key[i], entry.filename);
                }
            }

            foreach (DictionaryEntry o in lastFetch?.dataset) {
                Hashtable hash = (Hashtable)o.Value;
                if (hash.ContainsKey("USERNAME")) {
                    string filename = ((string[])hash["USERNAME"])[0];
                    string conflictedFile = keys.ContainsKey(filename) ? (string)keys[filename] : null;
                    Database.SaveEntry(hash, conflictedFile, saveMethod, performer, true);
                } else {
                    Database.SaveEntry(hash, null, saveMethod, performer, true);
                }
            }

            keys.Clear();
            fetchTask = null;
            lastFetch = null;
            //Database.usersVer = DateTime.Now.Ticks;
            KeepAlive.Broadcast($"{{\"action\":\"approvedfetch\",\"type\":\"user\"}}");
            Logging.Action(in performer, "Approve fetched users");
            KeepAlive.Broadcast($"{{\"action\":\"version\",\"userver\":\"{Database.usersVer}\",\"equipver\":\"{Database.equipVer}\"}}");
            return Strings.OK.Array;
        }

        return Strings.INV.Array;
    }

    public static byte[] DiscardLastFetch(in string performer) {
        lastFetch = null;
        GC.Collect();
        Logging.Action(in performer, "Discard fetched data");
        return Strings.OK.Array;
    }

    public static byte[] ImportDatabase(in HttpListenerContext ctx, in string performer) {
        string ip = "127.0.0.1";
        int port = 443;
        string protocol = "https";
        string username = String.Empty;
        string password = String.Empty;
        bool importEquip = true;
        bool importUsers = true;

        using (StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding)) {
            string[] para = reader.ReadToEnd().Split('&');
            for (int i = 0; i < para.Length; i++)
                if (para[i].StartsWith("ip=")) ip =       para[i].Substring(3);
                else if (para[i].StartsWith("port="))     port        = int.Parse(para[i].Substring(5));
                else if (para[i].StartsWith("protocol=")) protocol    = para[i].Substring(9);
                else if (para[i].StartsWith("username=")) username    = para[i].Substring(9);
                else if (para[i].StartsWith("password=")) password    = para[i].Substring(9);
                else if (para[i].StartsWith("equip="))    importEquip = para[i].Substring(6) == "true";
                else if (para[i].StartsWith("users="))    importUsers = para[i].Substring(6) == "true";
        }

        string sessionid = String.Empty;
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
                        .Replace("{", String.Empty)
                        .Replace("}", String.Empty)
                        .Replace("\"", String.Empty)
                        .Replace(" ", String.Empty)
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
                hash[".FILENAME"] = new string[] { filename, String.Empty, "" };

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
                hash[".FILENAME"] = new string[] { filename, String.Empty, "" };

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
        using HttpClientHandler handler = new HttpClientHandler();
        handler.CookieContainer = cookieContainer;

        using HttpClient client = new HttpClient(handler);
        client.BaseAddress = uri;
        client.DefaultRequestHeaders.UserAgent.Add(new System.Net.Http.Headers.ProductInfoHeaderValue("pro-test", "4.0"));
        client.DefaultRequestHeaders.Accept.Add(new System.Net.Http.Headers.MediaTypeWithQualityHeaderValue("*/*"));

        Task<HttpResponseMessage> res = client.GetAsync("db/getequiptable");
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

                Hashtable passwords = new Hashtable();
                foreach (DictionaryEntry e in hash) //get passwords
                    if (((string)e.Key).Contains("PASSWORD")) {
                        string password = GetHiddenProperty(uri, cookieContainer, $"db/getequiprop&file={filename}&property={(string)e.Key}");
                        string performer = ((string[])hash[e.Key])[1];
                        passwords.Add(e.Key, new string[] { password, performer });
                    }
                foreach (DictionaryEntry e in passwords) {
                    string[] value = (string[])passwords[e.Key];
                    hash[e.Key] = new string[] { value[0], value[1], "" };
                }


                while (Database.equip.ContainsKey(filename)) {
                    Thread.Sleep(1);
                    filename = DateTime.Now.Ticks.ToString();
                }
                hash[".FILENAME"] = new string[] { filename, String.Empty, "" };

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

    public static void ImportUsers_4(Uri uri, CookieContainer cookieContainer) {
        using HttpClientHandler handler = new HttpClientHandler();
        handler.CookieContainer = cookieContainer;

        using HttpClient client = new HttpClient(handler);
        client.BaseAddress = uri;
        client.DefaultRequestHeaders.UserAgent.Add(new System.Net.Http.Headers.ProductInfoHeaderValue("pro-test", "4.0"));
        //client.DefaultRequestHeaders.Accept.Add(new System.Net.Http.Headers.MediaTypeWithQualityHeaderValue("*/*"));

        Task<HttpResponseMessage> res = client.GetAsync("db/getuserstable");
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
                        string password = GetHiddenProperty(uri, cookieContainer, $"db/getuserprop&file={filename}&property={(string)e.Key}");
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
                hash[".FILENAME"] = new string[] { filename, String.Empty, "" };

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

    public static byte[] SingleFetchEquipBytes(in string[] para) {
        string host = null, filename = null;
        for (int i = 1; i < para.Length; i++)
            if (para[i].StartsWith("host=")) host = para[i].Substring(5);
            else if (para[i].StartsWith("filename=")) filename = para[i].Substring(9);

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
        return FetchArrayToBytes(SingleFetchEquip(host, true, PortScan.basic_ports));
    }    
    public static Hashtable SingleFetchEquip(string host, bool async = true, short[] ports_pool = null, IPAddress[] gateways = null) {
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
        
        Hashtable wmi   = new Hashtable();
        Hashtable ad    = new Hashtable();
        string portscan = String.Empty;

        Thread tWmi = new Thread(()=> {
            wmi = Wmi.WmiFetch(host);

            if (wmi.ContainsKey("OWNER")) {
                string owner = (string)wmi["OWNER"];
                if (owner.IndexOf('\\') > -1) owner = owner.Split('\\')[1];

                SearchResult user = ActiveDirectory.GetUser(owner);
                string fn = String.Empty;
                string sn = String.Empty;

                if (!(user is null) && user.Properties["givenName"].Count > 0) 
                    fn = user.Properties["givenName"][0].ToString();                

                if (!(user is null) && user.Properties["sn"].Count > 0) 
                    sn = user.Properties["sn"][0].ToString();

                string fullname = $"{fn} {sn}".Trim();
                wmi.Add("OWNER FULLNAME", fullname);
            }
        });

        Thread tAd = new Thread(()=> {
            if (hostname is null) return;

            SearchResult result = ActiveDirectory.GetWorkstation(hostname);
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
        
        Thread tPortscan = new Thread(() => {
            if (ports_pool is null) return;
            bool[] ports = PortScan.PortsScanAsync(host, ports_pool).Result;
            
            for (int i = 0; i < ports_pool.Length; i++)
                if (ports[i]) portscan += $"{ports_pool[i]}; ";

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

        Hashtable hash = new Hashtable();

        foreach (DictionaryEntry o in wmi)
            hash.Add(o.Key,  new string[] { o.Value.ToString(), "WMI", "" });


        foreach (DictionaryEntry o in ad) {
            string key = o.Key.ToString();

            if (key == "OPERATING SYSTEM") { //OS not found in ad use wmi
                if (!wmi.ContainsKey("OPERATING SYSTEM"))
                    hash.Add(o.Key, new string[] { o.Value.ToString(), "Active directory", "" });
            } else {
                hash.Add(o.Key, new string[] { o.Value.ToString(), "Active directory", "" });
            }
        }

        if (portscan.Length > 0)
            hash.Add("PORTS", new string[] { portscan, "Port-scan", "" });

        string mac = String.Empty;
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
                hash.Add("MANUFACTURER", new string[] { manufacturer, "MAC lookup", "" });
        }

        if (!wmi.ContainsKey("HOSTNAME")) {
            if (!(netbios is null) && netbios.Length > 0) //use biosnet
                hash.Add("HOSTNAME", new string[] { netbios, "NetBIOS", "" });
            else if (!(hostname is null) && hostname.Length > 0) //use dns
                hash.Add("HOSTNAME", new string[] { hostname, "DNS", "" });
        }

        if (!hash.ContainsKey("IP") && !(ip is null) && ip.Length > 0)
            hash.Add("IP", new string[] { ip, "IP", "" });

        if (!hash.ContainsKey("TYPE")) 
            if (hash.ContainsKey("OPERATING SYSTEM")) {
                string os = ((string[])hash["OPERATING SYSTEM"])[0];
                if (os.ToLower().Contains("server"))  //if os is windows server, set type as server
                    hash.Add("TYPE", new string[] { "Server", "Active directory", "" });
            }

        if (!hash.ContainsKey("TYPE") && !(gateways is null))
            for (int i = 0; i < gateways.Length; i++)
                if (gateways.Count(o => o.ToString() == ip) > 0) {
                    hash.Add("TYPE", new string[] { "Router", "IP", "" });
                    break;
                }

        if (!hash.ContainsKey("TYPE"))
            if (portscan.Length > 0) {
                string[] ports = portscan.Split(';');
                for (int i = 0; i< ports.Length; i++) ports[i] = ports[i].Trim();

                if (ports.Contains("445") && ports.Contains("3389") && (ports.Contains("53") || ports.Contains("67") || ports.Contains("389") || ports.Contains("636") || ports.Contains("853"))) //SMB, RDP, DNS, DHCP, LDAP
                    hash.Add("TYPE", new string[] { "Server", "Port-scan", "" });

                else if (ports.Contains("445") && ports.Contains("3389")) //SMB, RDP
                    hash.Add("TYPE", new string[] { "PC tower", "Port-scan", "" });

                else if (ports.Contains("515") || ports.Contains("631") || ports.Contains("9100"))  //LPD, IPP, Printserver
                    hash.Add("TYPE", new string[] { "Printer", "Port-scan", "" });

                else if (ports.Contains("6789") || ports.Contains("10001")) //ubnt ap
                    hash.Add("TYPE", new string[] { "Access point", "Port-scan", "" });

                else if (ports.Contains("7442") || ports.Contains("7550")) //ubnt cam
                    hash.Add("TYPE", new string[] { "Camera", "Port-scan", "" });
            }        

        return hash;
    }

    public static byte[] SingleFetchUserBytes(in string[] para) {
        string username = null, filename = null;
        for (int i = 1; i < para.Length; i++) 
            if (para[i].StartsWith("username=")) username = para[i].Substring(9);
            else if (para[i].StartsWith("filename=")) filename = para[i].Substring(9);
        
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

    public static async Task<Hashtable> SingleFetchEquipAsync(string host, bool async = true, short[] ports_pool = null, IPAddress[] gateways = null) {
        PingReply reply = null;
        try {
            reply = await new System.Net.NetworkInformation.Ping().SendPingAsync(host, 1500);
            if (reply.Status != IPStatus.Success)
                reply = await new System.Net.NetworkInformation.Ping().SendPingAsync(host, 1500);
        } catch { }

        if (reply?.Status == IPStatus.Success) {
            Hashtable hash = SingleFetchEquip(host, async, ports_pool, gateways);
            if (hash is null) return new Hashtable(); // rechable, but no fetch
            return hash;
        }

        return null;
    }

    public static byte[] FetchEquip(string[] hosts, int portscan, int conflictcontition, int conflictaction, int retries, int interval, in string performer) {
        if (!(fetchTask is null)) return Strings.TSK.Array;
        if (!(lastFetch is null)) return Strings.TSK.Array;

        const int WINDOW = 16;

        Thread thread = new Thread(async() => {
            fetchTask.status = "fetching";
            DateTime lastBroadcast = DateTime.Now;
            KeepAlive.Broadcast($"{{\"action\":\"startfetch\",\"type\":\"equip\",\"task\":{GetTaskStatus()}}}");

            int totalFetches = 0;
            int retriesCount = 0;
            int idle = (int)(3_600_000 * interval switch {
                0 => .5,
                1 => 1,
                2 => 2,
                3 => 4,
                4 => 6,
                5 => 8,
                6 => 12,
                7 => 24,
                8 => 48,
                _ => 0
            });

            Hashtable dataset = Hashtable.Synchronized(new Hashtable());
            List<string> queue = new List<string>();
            List<string> redo = new List<string>();

            queue.AddRange(hosts);

            short[] ports_pool = portscan switch {
                1=> PortScan.basic_ports,
                2=> new short[9999],
                _=> null
            };

            if (portscan == 2) //full
                for (int i = 0; i < ports_pool.Length; i++)
                    ports_pool[i] = (short)(i + 1);

            IPAddress[] gateways = IpTools.GetGateway();

            while (!(fetchTask is null)) {
                while (queue.Count > 0) {
                    int SIZE = Math.Min(WINDOW, queue.Count);
  
                    List<Task<Hashtable>> tasks = new List<Task<Hashtable>>();
                    for (int i = 0; i < SIZE; i++)
                        tasks.Add(SingleFetchEquipAsync(queue[i], false, ports_pool, gateways));

                    Hashtable[] result = await Task.WhenAll(tasks);

                    if (fetchTask is null) break;

                    for (int i = 0; i < SIZE; i++)
                        if (result[i] is null) { //unreachable
                            redo.Add(queue[i]);

                        } else if (result[i].Count > 0) {
                            fetchTask?.SetStepsCompleted(++totalFetches);
                            dataset.Add(queue[i], result[i]);
                        }

                    for (int i = 0; i < SIZE; i++) //remove the 1st [WINDOW] items
                        queue.RemoveAt(0);

                    KeepAlive.Broadcast($"{{\"action\":\"updatefetch\",\"type\":\"equip\",\"task\":{GetTaskStatus()}}}");
                }

                if (fetchTask is null) break;

                queue.Clear();
                List<string> temp = queue;
                queue = redo;
                redo = temp;

                if (retries > retriesCount++ && queue.Count > 0) {
                    fetchTask.status = "idle";
                    Thread.Sleep(idle);
                    fetchTask.status = "fetching";
                } else {
                    break;
                }
            }

            if (fetchTask is null) return;

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

            fetchTask?.Complete();
            KeepAlive.Broadcast($"{{\"action\":\"finishfetch\",\"type\":\"equip\",\"task\":{GetTaskStatus()}}}");
        });

        fetchTask = new TaskWrapper("Fetching equipment", performer) {
            stepsTotal = hosts.Length,
            thread = thread
        };
        fetchTask.thread.Start();

        return Strings.OK.Array;
    }
    public static byte[] FetchEquip(in HttpListenerContext ctx, in string performer) {
        string from = null, to = null, domain = null;
        int portscan=0, conflictcontition = 0, conflictaction = 0, retries = 0, interval = 0;
        using (StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding)) {
            string[] para = reader.ReadToEnd().Split('&');
            for (int i = 0; i < para.Length; i++) 
                if (para[i].StartsWith("from="))           from = para[i].Substring(5);
                else if (para[i].StartsWith("to="))        to = para[i].Substring(3);
                else if (para[i].StartsWith("domain="))    domain = para[i].Substring(7);
                else if (para[i].StartsWith("portscan="))  portscan = int.Parse(para[i].Substring(9));
                else if (para[i].StartsWith("conflictcontition="))    int.TryParse(para[i].Substring(18), out conflictcontition);
                else if (para[i].StartsWith("conflictaction="))       int.TryParse(para[i].Substring(15), out conflictaction);
                else if (para[i].StartsWith("retries="))              int.TryParse(para[i].Substring(8), out retries);
                else if (para[i].StartsWith("interval="))             int.TryParse(para[i].Substring(9), out interval);
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
            for (uint i = intFrom; i < intTo + 1 && i < UInt32.MaxValue - 1; i++) {
                byte[] bytes = BitConverter.GetBytes(i);
                Array.Reverse(bytes);
                hosts[i - intFrom] = String.Join(".", bytes);
            }

            return FetchEquip(hosts, portscan, conflictcontition, conflictaction, retries, interval , performer);
        }

        if (!(domain is null)) {
            string[] hosts = ActiveDirectory.GetAllWorkstations(domain);
            if (hosts is null) return Strings.FAI.Array;
            return FetchEquip(hosts, portscan, conflictcontition, conflictaction, retries, interval, performer);
        }

        return Strings.INF.Array;
    }
    
    public static byte[] FetchUsers(in HttpListenerContext ctx, in string performer) {
        string domain = null;
        int conflictcontition = 0, conflictaction = 0;
        using (StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding)) {
            string[] para = reader.ReadToEnd().Split('&'); 
            for (int i = 0; i < para.Length; i++)
                if (para[i].StartsWith("domain=")) domain = para[i].Substring(7);
                else if (para[i].StartsWith("conflictcontition=")) int.TryParse(para[i].Substring(18), out conflictcontition);
                else if (para[i].StartsWith("conflictaction=")) int.TryParse(para[i].Substring(15), out conflictaction);
        }
        
        if (domain is null) return Strings.INF.Array;

        string[] users = ActiveDirectory.GetAllUsers(domain);
        if (users is null) return Strings.FAI.Array;

        return FetchUsers(users, conflictcontition, conflictaction, performer);
    }
    public static byte[] FetchUsers(string[] users,  int conflictcontition, int conflictaction, in string performer) {
        if (!(fetchTask is null)) return Strings.TSK.Array;
        if (!(lastFetch is null)) return Strings.TSK.Array;

        Hashtable dataset = new Hashtable();

        Thread thread = new Thread(() => {
            fetchTask.status = "fetching";

            DateTime lastBroadcast = new DateTime(0); //DateTime.Now;
            KeepAlive.Broadcast($"{{\"action\":\"startfetch\",\"type\":\"users\",\"task\":{GetTaskStatus()}}}");

            for (int i = 0; i < users.Length; i++) {
                Hashtable hash = SingleFetchUser(users[i]);
                fetchTask.SetStepsCompleted(i + 1);
                
                if (DateTime.Now.Ticks - lastBroadcast.Ticks > 50_000_000) { //after 5 seconds
                    KeepAlive.Broadcast($"{{\"action\":\"updatefetch\",\"type\":\"users\",\"task\":{GetTaskStatus()}}}"); 
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
            KeepAlive.Broadcast($"{{\"action\":\"finishfetch\",\"type\":\"users\",\"task\":{GetTaskStatus()}}}");
        });

        fetchTask = new TaskWrapper("Fetching users", performer) {
            stepsTotal = users.Length,
            thread = thread,
        };
        fetchTask.thread.Start();

        return Strings.OK.Array;
    }

}
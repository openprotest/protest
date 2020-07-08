using System;
using System.Collections;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

public static class Fetch {

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
                        passwords.Add(e.Key, password);
                    }
                foreach (DictionaryEntry e in passwords)
                    hash[e.Key] = new string[] { e.Value.ToString(), "fetched from v3", "" };


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
                        passwords.Add(e.Key, password);
                    }
                foreach (DictionaryEntry e in passwords)
                    hash[e.Key] = new string[] { e.Value.ToString(), "fetched from v3", "" };


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

    public static void ImportEquip_4(Uri uri, CookieContainer cookieContainer) { }

    public static void ImportUsers_4(Uri uri, CookieContainer cookieContainer) { }

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

    public static byte[] SingleFetchEquip(string[] para) {
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
        return SingleFetchEquip(host);
    }

    public static byte[] SingleFetchEquip(string ip) {
        if (ip is null) return Strings.INF.Array;
        if (ip.Length == 0) return Strings.INF.Array;

        string netbios = NetBios.GetBiosName(ip);

        Hashtable wmi      = new Hashtable();
        Hashtable ad       = new Hashtable();
        string portscan = "";

        Thread tWmi = new Thread(()=> {
            wmi = Wmi.WmiFetch(ip);
        });

        Thread tAd = new Thread(()=> {
            if (netbios is null) return;

            System.DirectoryServices.SearchResult result = ActiveDirectory.GetWorkstation(netbios);
            if (result is null) return;

            if (result.Properties["description"].Count > 0) {
                string value = ActiveDirectory.FileTimeString(result.Properties["description"][0].ToString());
                if (value.Length > 0) ad.Add("DESCRIPTION", value);
            }
            
            if (result.Properties["distinguishedName"].Count > 0) {
                string value = ActiveDirectory.FileTimeString(result.Properties["distinguishedName"][0].ToString());
                if (value.Length > 0) ad.Add("DISTINGUISHED NAME", value);
            }
            
            if (result.Properties["dNSHostName"].Count > 0) {
                string value = ActiveDirectory.FileTimeString(result.Properties["dNSHostName"][0].ToString());
                if (value.Length > 0) ad.Add("DNS HOSTNAME", value);
            }
            
            if (result.Properties["objectSid"].Count > 0) {
                string value = ActiveDirectory.FileTimeString(result.Properties["objectSid"][0].ToString());
                if (value.Length > 0) ad.Add("SID", value);
            }

            if (result.Properties["operatingSystem"].Count > 0) {
                string value = ActiveDirectory.FileTimeString(result.Properties["operatingSystem"][0].ToString());
                if (value.Length > 0) ad.Add("OPERATING SYSTEM", value);
            }
            
            if (result.Properties["whenCreated"].Count > 0) {
                string value = ActiveDirectory.FileTimeString(result.Properties["whenCreated"][0].ToString());
                if (value.Length > 0) ad.Add("CREATED ON DC", value);
            }

            if (result.Properties["whenChanged"].Count > 0) {
                string value = ActiveDirectory.FileTimeString(result.Properties["whenChanged"][0].ToString());
                if (value.Length > 0) ad.Add("CHANGED ON DC", value);
            }
        });

        Thread tPortscan = new Thread(async()=> {
            bool[] ports = await PortScan.PortsScanAsync(ip, PortScan.basic_ports);

            for (int i = 0; i< PortScan.basic_ports.Length; i++)
                if (ports[i]) portscan += $"{PortScan.basic_ports[i]}; ";

            if (portscan.EndsWith("; ")) portscan = portscan.Substring(0, portscan.Length - 2);

        });

        tWmi.Start(); tAd.Start(); tPortscan.Start();
        tWmi.Join();  tAd.Join();  tPortscan.Join();

        StringBuilder content = new StringBuilder();

        foreach (DictionaryEntry o in wmi)
            content.Append($"{o.Key}{(char)127}{o.Value}{(char)127}WMI{(char)127}");

        foreach (DictionaryEntry o in ad) {
            string key = o.Key.ToString();

            if (key == "OPERATING SYSTEM") {
                if (!wmi.ContainsKey("OPERATING SYSTEM"))
                    content.Append($"{key}{(char)127}{o.Value}{(char)127}Active directory{(char)127}");

            } else {
                content.Append($"{key}{(char)127}{o.Value}{(char)127}Active directory{(char)127}");
            }
        }

        if (portscan.Length > 0) 
            content.Append($"PORTS{(char)127}{portscan}{(char)127}Port-scan{(char)127}");
        
        string mac = "";
        if (wmi.ContainsKey("MAC ADDRESS")) {
            mac = ((string)wmi["MAC ADDRESS"]).Split(';')[0].Trim();
        } else {
            mac = Arp.ArpRequest(ip);
            if (!(mac is null) && mac.Length > 0)
                content.Append($"MAC ADDRESS{(char)127}{mac}{(char)127}ARP{(char)127}");
        }

        if (!wmi.ContainsKey("MANUFACTURER") && mac.Length > 0) {
            string manufacturer = Encoding.UTF8.GetString(MacLookup.Lookup(mac));
            if (!(manufacturer is null) && manufacturer.Length > 0)
                content.Append($"MANUFACTURER{(char)127}{mac}{(char)127}MAC lookup{(char)127}");
        }

        if (!wmi.ContainsKey("HOSTNAME"))
            if (!(netbios is null) && netbios.Length > 0) { //use biosnet
                content.Append($"HOSTNAME{(char)127}{netbios}{(char)127}NetBIOS{(char)127}");
            } else { //use dns
                try {
                    string hostname = System.Net.Dns.GetHostEntry(ip).HostName;
                    content.Append($"HOSTNAME{(char)127}{hostname}{(char)127}DNS{(char)127}");
                } catch { }
            }
        
        //name and type

        return Encoding.UTF8.GetBytes(content.ToString());
    }

    public static byte[] SingleFetchUser(string[] para) {
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
        return SingleFetchUser(username);
    }
    public static byte[] SingleFetchUser(string username) {
        if (username is null) return Strings.INF.Array;
        if (username.Length == 0) return Strings.INF.Array;

        Hashtable hash = ActiveDirectory.AdFetch(username);
        if (hash is null) return Strings.FAI.Array;

        StringBuilder content = new StringBuilder();

        foreach (DictionaryEntry o in hash) 
            content.Append($"{o.Key}{(char)127}{o.Value}{(char)127}Active directory{(char)127}");
        
        return Encoding.UTF8.GetBytes(content.ToString());
    }

}
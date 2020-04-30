using System;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;

public static class Fetch {

    public static byte[] ImportDatabase(HttpListenerContext ctx) {
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

        /*try*/
        {
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
        }

        CookieContainer cookieContainer = new CookieContainer();
        cookieContainer.Add(new Cookie() {
            Name = "sessionid",
            Value = sessionid,
            Domain = ip
        });

        {
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
                    for (int i=0;i< ver.Length; i++) {
                        if (ver[i].StartsWith("major:")) major = ver[i].Substring(6);
                        if (ver[i].StartsWith("minor:")) minor = ver[i].Substring(6);
                    }
                    version = double.Parse($"{major}.{minor}");
                }
            };
        }

        if (sessionid.Length == 0) {
            //TODO:
            return null;
        }

        if (importEquip) {
            if (version < 4) 
                ImportEquip_3(uri, cookieContainer);
            else if (version == 4)
                ImportEquip_4(uri, cookieContainer);
        }

        if (importUsers) {
            if (version < 4) 
                ImportUsers_3(uri, cookieContainer);
             else if (version == 4)
                ImportUsers_4(uri, cookieContainer);
        }

        /*}catch (HttpRequestException ex) {
            Logging.Err(ex);

        } catch (ArgumentNullException ex) {
            Logging.Err(ex);

        } catch (InvalidOperationException ex) {
            Logging.Err(ex);

        } catch (Exception ex) {
            Logging.Err(ex);
        }*/

        return null;
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
            if (int.TryParse(split[i], out int len)) {
                Database.DbEntry entry = new Database.DbEntry();

                for (int j = i + 1; j < i + len * 4; j += 4) {
                    entry.hash.Add(split[j], new string[] { split[j + 1], split[j + 2] });
                }
                
                //Database.equip.Add(filename, entry);
                //Database.Write(entry, performer);
            }
            i += 1 + len * 4;
        }

    }

    public static void ImportUsers_3(Uri uri, CookieContainer cookieContainer) {
        using HttpClientHandler handler = new HttpClientHandler();
        handler.CookieContainer = cookieContainer;

        using HttpClient client = new HttpClient(handler);
        client.BaseAddress = uri;
        client.DefaultRequestHeaders.UserAgent.Add(new System.Net.Http.Headers.ProductInfoHeaderValue("pro-test", "4.0"));
        client.DefaultRequestHeaders.Accept.Add(new System.Net.Http.Headers.MediaTypeWithQualityHeaderValue("*/*"));

        Task<HttpResponseMessage> res = client.GetAsync("getuserslist");
        string payload = res.Result.Content.ReadAsStringAsync().Result;

    }

    public static void ImportEquip_4(Uri uri, CookieContainer cookieContainer) { }

    public static void ImportUsers_4(Uri uri, CookieContainer cookieContainer) { }

}

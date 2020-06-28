using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading.Tasks;


public static class Unifi {

    public static byte[] CamSnap(string filename) {
        if (!Database.equip.ContainsKey(filename))
            return Strings.FLE.Array;

        Database.DbEntry equip = (Database.DbEntry)Database.equip[filename];

        if (!equip.hash.ContainsKey("IP"))
            return Strings.INF.Array;

        if (!equip.hash.ContainsKey("USERNAME") || !equip.hash.ContainsKey("PASSWORD"))
            return Strings.INF.Array;

        string username = ((string[])equip.hash["USERNAME"])[0];
        string password = ((string[])equip.hash["PASSWORD"])[0];

        string protocol = "http";
        int port = 80;
        string ip = ((string[])equip.hash["IP"])[0];
        Uri uri = new Uri($"{protocol}://{ip}:{port}");

        CookieContainer cookieContainer = new CookieContainer();
        cookieContainer.Add(new Cookie() {
            Name = "authId",
            Value = "73f5693a-83ce-4902-92cd-c86718b19b8d",
            Domain = ip
        });
        cookieContainer.Add(new Cookie() {
            Name = "ubntActiveUser",
            Value = "true",
            Domain = ip
        });

        //try {
        using HttpClientHandler handler = new HttpClientHandler();
        handler.CookieContainer = cookieContainer;

        using HttpClient client_auth = new HttpClient();
        client_auth.BaseAddress = uri;
        client_auth.DefaultRequestHeaders.UserAgent.Add(new ProductInfoHeaderValue("pro-test", "4.0"));
        client_auth.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("*/*"));
        client_auth.BaseAddress = new Uri($"{protocol}://{ip}/");

        //Console.WriteLine($"{{\"username\":\"{username}\",\"password\":\"{password}\"}}");

        HttpContent auth_paylaod = new StringContent($"{{\"username\":\"{username}\", \"password\":\"{password}\"}}", Encoding.UTF8, "application/json");
        Task<HttpResponseMessage> res_auth = client_auth.PostAsync("login", auth_paylaod); //POST



        Console.WriteLine(res_auth.Result.Content.ReadAsStringAsync().Result);
        Console.WriteLine(res_auth.Result.Headers.ToString());

        Console.WriteLine(res_auth.Result.Headers.Contains("Set-Cookie"));

        //string setcookie = res_auth.Result.Headers.GetValues("Set-Cookie").Single();
        //Console.WriteLine(setcookie);

        //} catch { }

        return null;
    }

    public static byte[] CamInfo(string filename) {
        if (!Database.equip.ContainsKey(filename))
            return Strings.FLE.Array;

        Database.DbEntry equip = (Database.DbEntry)Database.equip[filename];

        if (!equip.hash.ContainsKey("IP"))
            return Strings.INF.Array;

        if (!equip.hash.ContainsKey("USERNAME") || !equip.hash.ContainsKey("PASSWORD"))
            return Strings.INF.Array;

        string username = ((string[])equip.hash["USERNAME"])[0];
        string password = ((string[])equip.hash["PASSWORD"])[0];

        return null;
    }

    public static byte[] ApInfo(string filename) {
        if (!Database.equip.ContainsKey(filename))
            return Strings.FLE.Array;

        Database.DbEntry equip = (Database.DbEntry)Database.equip[filename];

        if (!equip.hash.ContainsKey("IP"))
            return Strings.INF.Array;

        if (!equip.hash.ContainsKey("USERNAME") || !equip.hash.ContainsKey("PASSWORD"))
            return Strings.INF.Array;

        string username = ((string[])equip.hash["USERNAME"])[0];
        string password = ((string[])equip.hash["PASSWORD"])[0];

        return null;
    }

}
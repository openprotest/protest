using System;
using System.Threading.Tasks;
using System.Net.Http;

public static class Update {

    public static byte[] CheckGitHubVersion() {
        try {
            string uri = "https://api.github.com";
            string token = "2b549bee4b_cbe116a68d_22eb4d604a_fd075af4f9".Replace("_", "");

            HttpClient client = new HttpClient();
            client.BaseAddress = new Uri(uri);
            client.DefaultRequestHeaders.UserAgent.Add(new System.Net.Http.Headers.ProductInfoHeaderValue("pro-test", "4.0"));
            client.DefaultRequestHeaders.Accept.Add(new System.Net.Http.Headers.MediaTypeWithQualityHeaderValue("application/json"));
            client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("token", token);

            Task<HttpResponseMessage> response = client.GetAsync("/repos/veniware/OpenProtest/releases/latest");
            return response.Result.Content.ReadAsByteArrayAsync().Result;

        } catch {
            return Strings.FAI.Array;
        }
    }    

 }
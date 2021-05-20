using System;
using System.Threading.Tasks;
using System.Net.Http;

public static class Update {

    public static byte[] CheckGitHubVersion() {
        try {
            string uri = "https://api.github.com";
            string token = "ghp_8ps4IL.kHP3auTSrt.6oeMtwm1Wt.rcLV0k0gB7".Replace(".", "");

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
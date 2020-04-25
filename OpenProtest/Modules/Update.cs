using System;
using System.Threading.Tasks;
using System.Net.Http;

public static class Update {

    public static byte[] CheckGitHubVersion() {
        try {
            string uri = "https://api.github.com";
            string token = "b5c03bfc9dd8b5980900b266c6d133b3beadb524";

            HttpClient client = new HttpClient();
            client.BaseAddress = new Uri(uri);
            client.DefaultRequestHeaders.UserAgent.Add(new System.Net.Http.Headers.ProductInfoHeaderValue("pro-test", "4.0"));
            client.DefaultRequestHeaders.Accept.Add(new System.Net.Http.Headers.MediaTypeWithQualityHeaderValue("application/json"));
            client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("token", token);

            Task<HttpResponseMessage> response = client.GetAsync("/repos/veniware/OpenProtest/releases/latest");

            return response.Result.Content.ReadAsByteArrayAsync().Result;

        } catch (Exception ex) {
            return Strings.FAI.Array;
        }
    }    

 }
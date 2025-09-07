using Microsoft.VisualBasic.FileIO;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Text;

namespace Protest;
internal static class Update {

    private static readonly string RELEASE_URL = "https://raw.githubusercontent.com/openprotest/protest/master/RELEASE";

    public static byte[] CheckLatestRelease() {
        using HttpClient client = new HttpClient();

        try {
            HttpResponseMessage responseMessage = client.GetAsync(RELEASE_URL).GetAwaiter().GetResult();
            responseMessage.EnsureSuccessStatusCode();

            string data = responseMessage.Content.ReadAsStringAsync().GetAwaiter().GetResult().Trim();
            string[] split = data.Split('.');

            if (split.Length >= 4) {
                return Encoding.UTF8.GetBytes($"{{\"version\":\"{data}\",\"major\":\"{split[0]}\",\"minor\":\"{split[1]}\",\"build\":\"{split[2]}\",\"revision\":\"{split[3]}\"}}");
            }
        }
        catch {}

        return Data.CODE_FAILED.Array;
    }

}
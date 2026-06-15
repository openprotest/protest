using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;

namespace Protest.Integration;

internal static class Eset {
    private static readonly HttpClient httpClient;

    static Eset() {
        httpClient = new HttpClient();
        httpClient.DefaultRequestHeaders.Add("User-Agent", "Pro-test");
    }

    public static async Task Fetch() {
        ReadCredentials(out string url, out string username, out string password);

        string iamUrl = GetIamUrl(url);
        string deviceUrl = GetDeviceManagementUrl(url);
        /*try*/ {
            string accessToken = await AuthenticateAsync(iamUrl, username, password);

            Task<List<JsonElement>> devicesTask    = FetchDevicesAsync(deviceUrl, accessToken);
            Task<List<JsonElement>> detectionsTask = FetchDetectionsAsync(deviceUrl, accessToken);

            await Task.WhenAll(devicesTask, detectionsTask);

            List <JsonElement> devices    = devicesTask.Result;
            List<JsonElement> detections = detectionsTask.Result;
        }
        /*catch (Exception ex) {
            Logger.Error(ex);
        }*/
    }

    public static byte[] SetApiCredentials(Dictionary<string, string> parameters) {
        if (parameters is null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        if (!parameters.TryGetValue("url", out string url)) return Data.CODE_INVALID_ARGUMENT.Array;
        if (!parameters.TryGetValue("username", out string username)) return Data.CODE_INVALID_ARGUMENT.Array;
        if (!parameters.TryGetValue("password", out string password)) return Data.CODE_INVALID_ARGUMENT.Array;

        byte[] plain = JsonSerializer.SerializeToUtf8Bytes(new {
            url      = url,
            username = username,
            password = password
        });

        byte[] cipher = Cryptography.Encrypt(plain, Configuration.DB_KEY, Configuration.DB_KEY_IV);

        try {
            File.WriteAllBytes(Path.Join(Data.DIR_INTEGRATION, "eset.json"), cipher);
        }
        catch (IOException ex) {
            Logger.Error(ex);
            return Data.CODE_FAILED.ToArray();
        }
        catch (Exception ex) {
            Logger.Error(ex);
            return Data.CODE_FAILED.ToArray();
        }

        return Data.CODE_OK.ToArray();
    }

    private static string GetRegion(string protectServerUrl) {
        string host = protectServerUrl.Split('/').Last(s => s.Length > 0);
        string subdomain = host.Split('.')[0];
        string region = subdomain.TrimEnd('0', '1', '2', '3', '4', '5', '6', '7', '8', '9');
        return String.IsNullOrEmpty(region) ? "eu" : region;
    }

    private static string GetIamUrl(string protectServerUrl) =>
        $"https://{GetRegion(protectServerUrl)}.business-account.iam.eset.systems";

    private static string GetDeviceManagementUrl(string protectServerUrl) =>
        $"https://{GetRegion(protectServerUrl)}.device-management.eset.systems";

    private static void ReadCredentials(out string url, out string username, out string password) {
        string filename = Path.Join(Data.DIR_INTEGRATION, "eset.json");

        if (!File.Exists(filename)) {
            url      = String.Empty;
            username = String.Empty;
            password = String.Empty;
            return;
        }

        byte[] cipher = File.ReadAllBytes(filename);
        byte[] plain = Cryptography.Decrypt(cipher, Configuration.DB_KEY, Configuration.DB_KEY_IV);

        using JsonDocument doc = JsonDocument.Parse(plain);

        url      = doc.RootElement.GetProperty("url").GetString();
        username = doc.RootElement.GetProperty("username").GetString();
        password = doc.RootElement.GetProperty("password").GetString();
    }

    private static bool IsAuthenticated(string accessToken, DateTime tokenExpiryUtc) => !String.IsNullOrWhiteSpace(accessToken) && DateTime.UtcNow < tokenExpiryUtc;

    private static async Task<string> AuthenticateAsync(string iamUrl, string username, string password) {
        using FormUrlEncodedContent form = new FormUrlEncodedContent([
            new("username", username),
            new("password", password),
            new("grant_type", "password")
        ]);

        using HttpResponseMessage response = await httpClient.PostAsync($"{iamUrl}/oauth/token", form);

        if (!response.IsSuccessStatusCode) {
            throw new Exception($"ESET auth failed ({(int)response.StatusCode})");
        }

        string json = await response.Content.ReadAsStringAsync();

        using JsonDocument doc = JsonDocument.Parse(json);

        string accessToken = doc.RootElement.GetProperty("access_token").GetString();

        if (doc.RootElement.TryGetProperty("refresh_token", out JsonElement refresh)) {
            string refreshToken = refresh.GetString();
        }

        //int expiresIn = doc.RootElement.GetProperty("expires_in").GetInt32();
        //DateTime tokenExpiryUtc = DateTime.UtcNow.AddSeconds(expiresIn - 60);

        httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

        return accessToken;
    }

    private static string DecodeToken(string accessToken) {
        string payload = accessToken.Split('.')[1];

        while (payload.Length % 4 != 0) {
            payload += "=";
        }

        byte[] bytes = Convert.FromBase64String(payload.Replace('-', '+').Replace('_', '/'));

        return Encoding.UTF8.GetString(bytes);
    }

    private static async Task<List<JsonElement>> FetchDevicesAsync(string deviceMgmtUrl, string accessToken) {
        List<JsonElement> devices = new List<JsonElement>();
        string pageToken = null;

        do {
            string url = $"{deviceMgmtUrl}/v1/devices?pageSize=1000";

            if (!String.IsNullOrEmpty(pageToken)) {
                url += $"&pageToken={Uri.EscapeDataString(pageToken)}";
            }

            using HttpRequestMessage request = new(HttpMethod.Get, url);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

            using HttpResponseMessage response = await httpClient.SendAsync(request);

            if (!response.IsSuccessStatusCode) {
                string error = await response.Content.ReadAsStringAsync();
                throw new Exception($"ESET device fetch failed ({(int)response.StatusCode}): {error}");
            }

            string json = await response.Content.ReadAsStringAsync();

            using JsonDocument doc = JsonDocument.Parse(json);

            if (doc.RootElement.TryGetProperty("devices", out JsonElement deviceList)) {
                foreach (JsonElement device in deviceList.EnumerateArray()) {
                    devices.Add(device.Clone());
                }
            }

            pageToken = doc.RootElement.TryGetProperty("nextPageToken", out JsonElement nextToken)
                ? nextToken.GetString()
                : null;

        } while (!String.IsNullOrEmpty(pageToken));

        return devices;
    }

    private static async Task<JsonElement?> FetchDeviceAsync(string deviceMgmtUrl, string accessToken, string uuid) {
        using HttpRequestMessage request = new(HttpMethod.Get, $"{deviceMgmtUrl}/v1/devices/{Uri.EscapeDataString(uuid)}");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

        using HttpResponseMessage response = await httpClient.SendAsync(request);

        if (response.StatusCode == System.Net.HttpStatusCode.NotFound) {
            return null;
        }

        if (!response.IsSuccessStatusCode) {
            throw new Exception($"ESET device fetch failed ({(int)response.StatusCode})");
        }

        string json = await response.Content.ReadAsStringAsync();
        using JsonDocument doc = JsonDocument.Parse(json);
        return doc.RootElement.Clone();
    }

    private static async Task<List<JsonElement>> FetchDetectionsAsync(string deviceMgmtUrl, string accessToken) {
        List<JsonElement> detections = new List<JsonElement>();
        string pageToken = null;

        do {
            string url = $"{deviceMgmtUrl}/v1/detections?pageSize=1000";

            if (!String.IsNullOrEmpty(pageToken)) {
                url += $"&pageToken={Uri.EscapeDataString(pageToken)}";
            }

            using HttpRequestMessage request = new(HttpMethod.Get, url);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

            using HttpResponseMessage response = await httpClient.SendAsync(request);

            if (!response.IsSuccessStatusCode) {
                string error = await response.Content.ReadAsStringAsync();
                throw new Exception($"ESET detections fetch failed ({(int)response.StatusCode}): {error}");
            }

            string json = await response.Content.ReadAsStringAsync();

            using JsonDocument doc = JsonDocument.Parse(json);

            if (doc.RootElement.TryGetProperty("detections", out JsonElement detectionList)) {
                foreach (JsonElement detection in detectionList.EnumerateArray()) {
                    detections.Add(detection.Clone());
                }
            }

            pageToken = doc.RootElement.TryGetProperty("nextPageToken", out JsonElement nextToken)
                ? nextToken.GetString()
                : null;

        } while (!String.IsNullOrEmpty(pageToken));

        return detections;
    }
}
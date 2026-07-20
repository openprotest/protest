using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace Protest.Integration;

internal static class Eset {
    private static readonly HttpClient httpClient;

    private static readonly SemaphoreSlim fetchSemaphore;

    private static string accessToken;
    private static string refreshToken;
    private static DateTime tokenExpiryUtc;

    private static string iamUrl;
    private static string deviceUrl;

    private const long CACHE_TTL = 72_000_000_000L; //2 hours in ticks
    private static long cacheDate;

    public static readonly ConcurrentDictionary<string, DeviceEntry> devicesCache;
    public static readonly ConcurrentDictionary<string, long> detectionsPerDeviceCount;

    public struct DeviceEntry {
        public string   uuid;
        public string   displayName;
        public string   description;
        public string   os;
        public string   osVer;
        public string   ip;
        public string   mac;
        public bool     isMobile;
        public int      functionalityProblemCount;
        public string   manufacturer;
        public string   serialNumber;
        public string[] processors;
    }

    static Eset() {
        httpClient = new HttpClient();
        httpClient.DefaultRequestHeaders.Add("User-Agent", "Pro-test");

        fetchSemaphore = new SemaphoreSlim(1, 1);
        devicesCache = new ConcurrentDictionary<string, DeviceEntry>();
        detectionsPerDeviceCount = new ConcurrentDictionary<string, long>();
    }

    public static async Task FetchAsync() {
        try {
            await fetchSemaphore.WaitAsync();

            if (DateTime.UtcNow.Ticks - cacheDate < CACHE_TTL) return;

            if (!IsAuthenticated()) {
                ReadCredentials(out string url, out string username, out string password);
                iamUrl = GetIamUrl(url);
                deviceUrl = GetDeviceManagementUrl(url);
                await AuthenticateAsync(username, password);
            }

            Task<List<JsonElement>> devicesTask    = FetchDevicesAsync(deviceUrl);
            Task<List<JsonElement>> detectionsTask = FetchDetectionsAsync(deviceUrl);

            bool devicesOk = false;

            try {
                ParseDevice(await devicesTask);
                devicesOk = true;
            }
            catch (Exception ex) {
                Logger.Error(ex);
            }

            try {
                ParseDetections(await detectionsTask);
            }
            catch (Exception ex) {
                Logger.Error(ex);
            }

            if (devicesOk) {
                cacheDate = DateTime.UtcNow.Ticks;
            }
        }
        catch (Exception ex) {
            Logger.Error(ex);
        }
        finally {
            fetchSemaphore.Release();
        }
    }

    public static byte[] GetApiCredentials() {
        ReadCredentials(out string url, out string username, out _);
        return Encoding.UTF8.GetBytes($"{{\"url\":\"{Data.EscapeJsonText(url)}\",\"username\":\"{username}\"}}");
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

        return Data.CODE_OK.ToArray();
    }

    private static void ParseDevice(List<JsonElement> devices) {
        devicesCache.Clear();

        for (int i = 0; i < devices.Count; i++) {
            JsonElement device = devices[i];

            if (!device.TryGetProperty("uuid", out JsonElement uuidEl)) continue;
            if (!device.TryGetProperty("displayName", out JsonElement displayNameEl)) continue;

            DeviceEntry entry = new DeviceEntry{
                uuid        = uuidEl.GetString(),
                displayName = displayNameEl.GetString(),
            };

            if (device.TryGetProperty("description", out JsonElement descEl)) {
                entry.description = descEl.GetString();
            }

            if (device.TryGetProperty("primaryLocalIpAddress", out JsonElement ipEl)) {
                entry.ip = ipEl.GetString();
            }

            if (device.TryGetProperty("isMobile", out JsonElement isMobileEl)) {
                entry.isMobile = isMobileEl.GetBoolean();
            }

            if (device.TryGetProperty("functionalityProblemCount", out JsonElement problemCountEl)) {
                entry.functionalityProblemCount = problemCountEl.GetInt32();
            }

            if (device.TryGetProperty("operatingSystem", out JsonElement osEl)) {
                if (osEl.TryGetProperty("displayName", out JsonElement osNameEl)) {
                    entry.os = osNameEl.GetString();
                }

                if (osEl.TryGetProperty("version", out JsonElement osVerEl) && osVerEl.TryGetProperty("name", out JsonElement osVerNameEl)) {
                    entry.osVer = osVerNameEl.GetString();
                }
            }

            if (device.TryGetProperty("hardwareProfiles", out JsonElement profilesEl) && profilesEl.GetArrayLength() > 0) {
                JsonElement profile = profilesEl[0];

                if (profile.TryGetProperty("manufacturer", out JsonElement mfrEl)) {
                    entry.manufacturer = mfrEl.GetString();
                }

                if (profile.TryGetProperty("bios", out JsonElement biosEl) && biosEl.TryGetProperty("serialNumber", out JsonElement serialEl)) {
                    entry.serialNumber = serialEl.GetString();
                }

                if (profile.TryGetProperty("processors", out JsonElement procsEl)) {
                    List<string> list = new List<string>();
                    foreach (JsonElement p in procsEl.EnumerateArray()) {
                        if (p.TryGetProperty("caption", out JsonElement capEl)) {
                            list.Add(capEl.GetString());
                        }
                    }
                    entry.processors = list.ToArray();
                }

                if (profile.TryGetProperty("networkAdapters", out JsonElement adaptersEl)) {
                    StringBuilder macs = new StringBuilder();
                    foreach (JsonElement a in adaptersEl.EnumerateArray()) {
                        string mac = a.TryGetProperty("macAddress", out JsonElement macEl) ? macEl.GetString() : null;
                        if (String.IsNullOrEmpty(mac)) continue;
                        if (macs.Length > 0) macs.Append("; ");
                        macs.Append(mac);
                    }

                    entry.mac = macs.ToString();
                }
            }

            if (String.IsNullOrWhiteSpace(entry.displayName)) continue;

            string name = entry.displayName.ToLowerInvariant();
            devicesCache[name] = entry;

            int dot = name.IndexOf('.');
            if (dot > 0) {
                devicesCache.TryAdd(name[..dot], entry);
            }
        }

    }

    public static bool TryResolveDevice(string name, out DeviceEntry entry) {
        entry = default;

        if (String.IsNullOrWhiteSpace(name)) return false;

        name = name.ToLowerInvariant();
        if (devicesCache.TryGetValue(name, out entry)) return true;

        int dot = name.IndexOf('.');
        if (dot > 0 && devicesCache.TryGetValue(name[..dot], out entry)) return true;

        return false;
    }

    private static void ParseDetections(List<JsonElement> detections) {
        detectionsPerDeviceCount.Clear();

        for (int i = 0; i < detections.Count; i++) {
            JsonElement detection = detections[i];
            if (!detection.TryGetProperty("context", out JsonElement contextEl)) continue;
            if (!contextEl.TryGetProperty("deviceUuid", out JsonElement deviceUuidEl)) continue;

            Eset.detectionsPerDeviceCount.AddOrUpdate(deviceUuidEl.GetString(), 1, (_, current) => current + 1);
        }
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

    private static bool IsAuthenticated() =>
        !String.IsNullOrWhiteSpace(accessToken) && DateTime.UtcNow < tokenExpiryUtc;

    private static async Task AuthenticateAsync(string username, string password) {
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

        Eset.accessToken = doc.RootElement.GetProperty("access_token").GetString();

        if (doc.RootElement.TryGetProperty("refresh_token", out JsonElement refresh)) {
            Eset.refreshToken = refresh.GetString();
        }

        int expiresIn = doc.RootElement.GetProperty("expires_in").GetInt32();
        Eset.tokenExpiryUtc = DateTime.UtcNow.AddSeconds(expiresIn - 60);

    }

    private static async Task<List<JsonElement>> FetchDevicesAsync(string deviceMgmtUrl) {
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

    private static async Task<List<JsonElement>> FetchDetectionsAsync(string deviceMgmtUrl) {
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
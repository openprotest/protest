using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace Protest.Integration;

internal sealed class Eset {
    private static readonly HttpClient httpClient;
    private static readonly ConcurrentDictionary<string, Eset> clients = new ConcurrentDictionary<string, Eset>();

    private const long CACHE_TTL = 72_000_000_000L; //2 hours in ticks
    private static readonly TimeSpan RETRY_AFTER_FAILURE = TimeSpan.FromMinutes(5);

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

    private readonly string id;
    private readonly SemaphoreSlim fetchSemaphore = new SemaphoreSlim(1, 1);

    private string accessToken;
    private string refreshToken;
    private DateTime tokenExpiryUtc;

    private string iamUrl;
    private string deviceUrl;

    private long cacheDate;
    private DateTime retryAfterUtc;
    private volatile string lastError;

    private volatile ConcurrentDictionary<string, DeviceEntry> devicesCache = new ConcurrentDictionary<string, DeviceEntry>();
    private volatile ConcurrentDictionary<string, DeviceEntry> devicesByUuid = new ConcurrentDictionary<string, DeviceEntry>(StringComparer.OrdinalIgnoreCase);
    private volatile ConcurrentDictionary<string, long> detectionsPerDeviceCount = new ConcurrentDictionary<string, long>(StringComparer.OrdinalIgnoreCase);

    static Eset() {
        httpClient = new HttpClient();
        httpClient.DefaultRequestHeaders.Add("User-Agent", "Pro-test");
    }

    private Eset(string id) {
        this.id = id;
    }

    internal static Eset Get(string id) => clients.GetOrAdd(id, key => new Eset(key));

    //forgets the login and the cache, used when the credentials change or the instance is removed
    internal static void Drop(string id) => clients.TryRemove(id, out _);

    internal static string GetLastError(string id) => clients.TryGetValue(id, out Eset client) ? client.lastError : null;

    //selector: null or "all" for every enabled instance, or the id of the one to use (see Integration.NormalizeSelector)
    private static Eset[] GetEnabled(string selector = "all") =>
        Integration.GetEnabledInstances("eset", selector).Select(i => Get(i.Id)).ToArray();

    //The tenant name shown as the origin of the data it provides.
    private string Label => Integration.TryGetInstance(id, out Integration.Instance instance)
        ? Integration.SourceLabel(instance)
        : "ESET";

    //The selected tenants in parallel; a tenant that fails does not hold back or break the others.
    public static async Task FetchAllAsync(string selector = "all") {
        Eset[] enabled = GetEnabled(selector);
        if (enabled.Length == 0) return;

        await Task.WhenAll(enabled.Select(client => client.FetchAsync()));
    }

    //First match wins, tenants are searched in name order.
    public static bool TryResolveDevice(string name, out DeviceEntry entry, out string source, string selector = "all") {
        entry = default;
        source = null;

        if (String.IsNullOrWhiteSpace(name)) return false;

        foreach (Eset client in GetEnabled(selector)) {
            if (client.TryResolve(name, out entry)) {
                source = client.Label;
                return true;
            }
        }

        return false;
    }

    //The uuid is unique across tenants, so unlike the host name it always finds the right one.
    public static bool TryFindByUuid(string uuid, out DeviceEntry entry, out long detections, out string source) {
        entry = default;
        detections = 0;
        source = null;

        if (String.IsNullOrWhiteSpace(uuid)) return false;

        foreach (Eset client in GetEnabled()) {
            bool hasDevice = client.devicesByUuid.TryGetValue(uuid, out DeviceEntry deviceEntry);
            bool hasDetections = client.detectionsPerDeviceCount.TryGetValue(uuid, out long count);
            if (!hasDevice && !hasDetections) continue;

            entry = deviceEntry;
            detections = count;
            source = client.Label;
            return true;
        }

        return false;
    }

    public async Task FetchAsync() {
        await fetchSemaphore.WaitAsync();

        try {
            if (DateTime.UtcNow.Ticks - cacheDate < CACHE_TTL) return;
            if (DateTime.UtcNow < retryAfterUtc) return;

            if (!IsAuthenticated()) {
                await AuthenticateStoredAsync();
            }

            Task<List<JsonElement>> devicesTask    = FetchDevicesAsync(deviceUrl);
            Task<List<JsonElement>> detectionsTask = FetchDetectionsAsync(deviceUrl);

            bool devicesOk = false;

            try {
                ParseDevice(await devicesTask);
                devicesOk = true;
            }
            catch (Exception ex) {
                Fail(ex);
            }

            try {
                ParseDetections(await detectionsTask);
            }
            catch (Exception ex) {
                Logger.Error($"{Label}: {ex.Message}");
            }

            if (devicesOk) {
                cacheDate = DateTime.UtcNow.Ticks;
                lastError = null;
            }
        }
        catch (Exception ex) {
            Fail(ex);
        }
        finally {
            fetchSemaphore.Release();
        }
    }

    //Logs in again with the stored credentials; returns the reason when it fails.
    public async Task<string> TestAsync() {
        await fetchSemaphore.WaitAsync();

        try {
            await AuthenticateStoredAsync();

            lastError = null;
            retryAfterUtc = default;
            return null;
        }
        catch (Exception ex) {
            lastError = Shorten(ex.Message);
            return ex.Message;
        }
        finally {
            fetchSemaphore.Release();
        }
    }

    //A tenant that cannot be reached is not retried on every single device fetch.
    private void Fail(Exception ex) {
        Logger.Error($"{Label}: {ex.Message}");
        lastError = Shorten(ex.Message);
        retryAfterUtc = DateTime.UtcNow + RETRY_AFTER_FAILURE;
    }

    private static string Shorten(string message) => message.Length > 200 ? message[..200] : message;

    private void ParseDevice(List<JsonElement> devices) {
        ConcurrentDictionary<string, DeviceEntry> byName = new ConcurrentDictionary<string, DeviceEntry>();
        ConcurrentDictionary<string, DeviceEntry> byUuid = new ConcurrentDictionary<string, DeviceEntry>(StringComparer.OrdinalIgnoreCase);

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

            if (!String.IsNullOrEmpty(entry.uuid)) {
                byUuid[entry.uuid] = entry;
            }

            if (String.IsNullOrWhiteSpace(entry.displayName)) continue;

            string name = entry.displayName.ToLowerInvariant();
            byName[name] = entry;

            int dot = name.IndexOf('.');
            if (dot > 0) {
                byName.TryAdd(name[..dot], entry);
            }
        }

        devicesCache = byName;
        devicesByUuid = byUuid;
    }

    private bool TryResolve(string name, out DeviceEntry entry) {
        entry = default;

        name = name.ToLowerInvariant();
        if (devicesCache.TryGetValue(name, out entry)) return true;

        int dot = name.IndexOf('.');
        if (dot > 0 && devicesCache.TryGetValue(name[..dot], out entry)) return true;

        return false;
    }

    private void ParseDetections(List<JsonElement> detections) {
        ConcurrentDictionary<string, long> counts = new ConcurrentDictionary<string, long>(StringComparer.OrdinalIgnoreCase);

        for (int i = 0; i < detections.Count; i++) {
            JsonElement detection = detections[i];
            if (!detection.TryGetProperty("context", out JsonElement contextEl)) continue;
            if (!contextEl.TryGetProperty("deviceUuid", out JsonElement deviceUuidEl)) continue;

            counts.AddOrUpdate(deviceUuidEl.GetString(), 1, (_, current) => current + 1);
        }

        detectionsPerDeviceCount = counts;
    }

    private static string GetRegion(string protectServerUrl) {
        string host = protectServerUrl.Split('/').LastOrDefault(s => s.Length > 0);
        if (String.IsNullOrEmpty(host)) throw new Exception("Invalid identity endpoint");

        string subdomain = host.Split('.')[0];
        string region = subdomain.TrimEnd('0', '1', '2', '3', '4', '5', '6', '7', '8', '9');
        return String.IsNullOrEmpty(region) ? "eu" : region;
    }

    private static string GetIamUrl(string protectServerUrl) =>
        $"https://{GetRegion(protectServerUrl)}.business-account.iam.eset.systems";

    private static string GetDeviceManagementUrl(string protectServerUrl) =>
        $"https://{GetRegion(protectServerUrl)}.device-management.eset.systems";

    private bool IsAuthenticated() =>
        !String.IsNullOrWhiteSpace(accessToken) && DateTime.UtcNow < tokenExpiryUtc;

    private async Task AuthenticateStoredAsync() {
        Dictionary<string, string> config = Integration.ReadConfig(id);

        if (config is null
            || !config.TryGetValue("url", out string url)
            || !config.TryGetValue("username", out string username)
            || !config.TryGetValue("password", out string password)) {
            throw new Exception("The credentials are missing or unreadable");
        }

        iamUrl = GetIamUrl(url);
        deviceUrl = GetDeviceManagementUrl(url);
        await AuthenticateAsync(username, password);
    }

    private async Task AuthenticateAsync(string username, string password) {
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

        accessToken = doc.RootElement.GetProperty("access_token").GetString();

        if (doc.RootElement.TryGetProperty("refresh_token", out JsonElement refresh)) {
            refreshToken = refresh.GetString();
        }

        int expiresIn = doc.RootElement.GetProperty("expires_in").GetInt32();
        tokenExpiryUtc = DateTime.UtcNow.AddSeconds(expiresIn - 60);
    }

    private async Task<List<JsonElement>> FetchDevicesAsync(string deviceMgmtUrl) {
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

    private async Task<List<JsonElement>> FetchDetectionsAsync(string deviceMgmtUrl) {
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

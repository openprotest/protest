using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Net.Security;
using System.Security.Authentication;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace Protest.Integration;

//One object per configured UniFi console (see Integration.Instance). It reads the devices of the UniFi Network
//application (access points, switches, gateways) and the cameras of UniFi Protect through their local
//integration APIs, which are authenticated with an API key that is created on the console.
internal sealed class UniFi {
    private static readonly ConcurrentDictionary<string, UniFi> clients = new ConcurrentDictionary<string, UniFi>();

    private const long CACHE_TTL = 72_000_000_000L; //2 hours in ticks
    private static readonly TimeSpan RETRY_AFTER_FAILURE = TimeSpan.FromMinutes(5);

    private const int PAGE_SIZE = 200;
    private const int MAX_PAGES = 500;

    //the Network application answers on one of these, depending on how it is hosted
    private static readonly string[] NETWORK_PATHS = ["proxy/network/integration/v1", "integration/v1"];
    private const string PROTECT_PATH = "proxy/protect/integration/v1";

    public struct DeviceEntry {
        public string id;
        public string mac;         //AA:BB:CC:DD:EE:FF
        public string ip;
        public string name;
        public string model;
        public string type;        //as in the device types of the application: "access point", "switch", "camera", ...
        public string firmware;
        public string serial;
        public string state;
        public string application;  //"Network" or "Protect"
    }

    private sealed class HttpStatusException : Exception {
        public readonly HttpStatusCode status;
        public HttpStatusException(HttpStatusCode status, string message) : base(message) {
            this.status = status;
        }
    }

    private readonly string id;
    private readonly SemaphoreSlim semaphore = new SemaphoreSlim(1, 1);

    private HttpClient client;
    private string baseUrl;
    private string pinnedThumbprint;
    private volatile string lastCertificate;
    private string networkPath;

    private long cacheDate;
    private DateTime retryAfterUtc;
    private volatile string lastError;

    private volatile List<DeviceEntry> devicesCache = new List<DeviceEntry>();
    private volatile Dictionary<string, DeviceEntry> byMac = new Dictionary<string, DeviceEntry>();
    private volatile Dictionary<string, DeviceEntry> byIp = new Dictionary<string, DeviceEntry>();

    private UniFi(string id) {
        this.id = id;
    }

    internal static UniFi Get(string id) => clients.GetOrAdd(id, key => new UniFi(key));

    //forgets the connection and the cache, used when the credentials change or the instance is removed
    internal static void Drop(string id) {
        if (clients.TryRemove(id, out UniFi removed)) {
            removed.client?.Dispose();
        }
    }

    internal static string GetLastError(string id) => clients.TryGetValue(id, out UniFi unifi) ? unifi.lastError : null;

    //selector: null or "all" for every enabled instance, or the id of the one to use (see Integration.NormalizeSelector)
    private static UniFi[] GetEnabled(string selector) =>
        Integration.GetEnabledInstances("unifi", selector).Select(i => Get(i.Id)).ToArray();

    //The console name shown as the origin of the data it provides.
    private string Label => Integration.TryGetInstance(id, out Integration.Instance instance)
        ? Integration.SourceLabel(instance)
        : "UniFi";

    //The selected consoles in parallel, a console that fails does not hold back or break the others.
    //A forced refresh ignores the cache and the wait after a failure, it is for when the user asked for the data.
    public static async Task RefreshAllAsync(string selector, bool force = false, CancellationToken token = default) {
        UniFi[] enabled = GetEnabled(selector);
        if (enabled.Length == 0) return;

        await Task.WhenAll(enabled.Select(unifi => unifi.RefreshAsync(force, token)));
    }

    //Every device of the selected consoles, freshly read. A console that cannot be read contributes nothing.
    public static async Task<List<(DeviceEntry device, string source)>> FetchDevicesAsync(string selector, CancellationToken token = default) {
        UniFi[] enabled = GetEnabled(selector);
        List<(DeviceEntry device, string source)> devices = new List<(DeviceEntry, string)>();
        if (enabled.Length == 0) return devices;

        bool[] succeeded = await Task.WhenAll(enabled.Select(unifi => unifi.RefreshAsync(true, token)));

        for (int i = 0; i < enabled.Length; i++) {
            if (!succeeded[i]) continue;

            string label = enabled[i].Label;
            foreach (DeviceEntry device in enabled[i].devicesCache) {
                devices.Add((device, label));
            }
        }

        return devices;
    }

    //The device is found by its MAC address, or else by its IP address. First match wins, consoles are searched in name order.
    public static bool TryResolveDevice(IEnumerable<string> macs, IEnumerable<string> ips, string selector, out DeviceEntry entry, out string source) {
        entry = default;
        source = null;

        foreach (UniFi unifi in GetEnabled(selector)) {
            if (unifi.TryResolve(macs, ips, out entry)) {
                source = unifi.Label;
                return true;
            }
        }

        return false;
    }

    private bool TryResolve(IEnumerable<string> macs, IEnumerable<string> ips, out DeviceEntry entry) {
        entry = default;

        foreach (string mac in macs) {
            string key = MacKey(mac);
            if (key is not null && byMac.TryGetValue(key, out entry)) return true;
        }

        foreach (string ip in ips) {
            if (!String.IsNullOrWhiteSpace(ip) && byIp.TryGetValue(ip.Trim(), out entry)) return true;
        }

        return false;
    }

    //Checks the address, the API key and the certificate, and that the cameras can be read when Protect is there.
    //Returns the reason when it fails.
    public async Task<string> TestAsync() {
        await semaphore.WaitAsync();

        try {
            Configure();

            await FindNetworkPathAsync(CancellationToken.None);
            lastError = null;
            retryAfterUtc = default;

            try {
                using JsonDocument doc = await GetJsonAsync($"{PROTECT_PATH}/cameras", CancellationToken.None);
            }
            catch (HttpStatusException ex) when (ex.status == HttpStatusCode.NotFound) { } //there is no Protect on this console
            catch (Exception ex) {
                return $"Connected to the Network application, but the cameras could not be read: {ex.Message}";
            }

            return null;
        }
        catch (Exception ex) {
            lastError = Shorten(ex.Message);
            return ex.Message;
        }
        finally {
            semaphore.Release();
        }
    }

    private async Task<bool> RefreshAsync(bool force, CancellationToken token) {
        await semaphore.WaitAsync();

        try {
            if (!force) {
                if (DateTime.UtcNow.Ticks - cacheDate < CACHE_TTL) return true;
                if (DateTime.UtcNow < retryAfterUtc) return false;
            }

            Configure();

            List<DeviceEntry> devices = await FetchNetworkDevicesAsync(token);
            string warning = null;

            //the cameras are a bonus: the devices are kept even when they cannot be read
            try {
                devices.AddRange(await FetchCamerasAsync(token));
            }
            catch (OperationCanceledException) {
                throw;
            }
            catch (Exception ex) {
                warning = $"The cameras could not be read: {ex.Message}";
                Logger.Error($"{Label}: {warning}");
            }

            Index(devices);

            cacheDate = DateTime.UtcNow.Ticks;
            lastError = warning is null ? null : Shorten(warning);
            return true;
        }
        catch (OperationCanceledException) {
            return false;
        }
        catch (Exception ex) {
            //a console that cannot be reached is not retried on every single device fetch
            Logger.Error($"{Label}: {ex.Message}");
            lastError = Shorten(ex.Message);
            retryAfterUtc = DateTime.UtcNow + RETRY_AFTER_FAILURE;
            return false;
        }
        finally {
            semaphore.Release();
        }
    }

    private static string Shorten(string message) => message.Length > 200 ? message[..200] : message;

    //Reads the stored settings and prepares the connection; it is done once, changed settings come with a new object.
    private void Configure() {
        if (client is not null) return;

        Dictionary<string, string> config = Integration.ReadConfig(id);

        if (config is null
            || !config.TryGetValue("url", out string url)
            || !config.TryGetValue("key", out string key)
            || String.IsNullOrWhiteSpace(url)
            || String.IsNullOrWhiteSpace(key)) {
            throw new Exception("The settings are missing or unreadable");
        }

        config.TryGetValue("thumbprint", out string thumbprint);

        string host = url.Trim();
        foreach (string scheme in new[] { "https://", "http://" }) {
            if (host.StartsWith(scheme, StringComparison.OrdinalIgnoreCase)) host = host[scheme.Length..];
        }
        host = host.TrimEnd('/');

        if (host.Length == 0 || host.Contains('/') || host.Contains('@') || host.Contains('?') || host.Contains('#')) {
            throw new Exception("The console address is not valid");
        }

        baseUrl = $"https://{host}";
        pinnedThumbprint = NormalizeThumbprint(thumbprint);

        SocketsHttpHandler handler = new SocketsHttpHandler {
            AllowAutoRedirect = false, //the API key is only ever sent to the console
            ConnectTimeout = TimeSpan.FromSeconds(10),
            SslOptions = new SslClientAuthenticationOptions {
                RemoteCertificateValidationCallback = ValidateCertificate
            }
        };

        HttpClient created = new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(60) };
        created.DefaultRequestHeaders.Add("User-Agent", "Pro-test");
        created.DefaultRequestHeaders.Add("Accept", "application/json");
        created.DefaultRequestHeaders.Add("X-API-KEY", key.Trim());

        client = created;
    }

    //A console has a self-signed certificate unless one was installed. With a thumbprint set, only the certificate that
    //has that thumbprint is accepted; without one, the certificate has to be trusted by this machine.
    private bool ValidateCertificate(object sender, X509Certificate certificate, X509Chain chain, SslPolicyErrors errors) {
        if (certificate is null) return false;

        string thumbprint = certificate.GetCertHashString(HashAlgorithmName.SHA256);
        lastCertificate = thumbprint;

        if (pinnedThumbprint is not null) {
            return String.Equals(thumbprint, pinnedThumbprint, StringComparison.OrdinalIgnoreCase);
        }

        return errors == SslPolicyErrors.None;
    }

    internal static string NormalizeThumbprint(string thumbprint) {
        if (String.IsNullOrWhiteSpace(thumbprint)) return null;

        string normalized = thumbprint.Replace(":", String.Empty).Replace(" ", String.Empty).ToUpperInvariant();
        return normalized.Length == 64 ? normalized : null;
    }

    private static string FormatThumbprint(string thumbprint) =>
        String.IsNullOrEmpty(thumbprint) ? "unknown" : String.Join(":", Enumerable.Range(0, thumbprint.Length / 2).Select(i => thumbprint.Substring(i * 2, 2)));

    private string CertificateError() {
        string seen = FormatThumbprint(lastCertificate);

        return pinnedThumbprint is null
            ? $"The console's certificate is not trusted. If this is your console, enter its SHA-256 thumbprint as the certificate thumbprint of this integration: {seen}"
            : $"The console's certificate does not match the thumbprint of this integration, it has {seen}";
    }

    private async Task<JsonDocument> GetJsonAsync(string path, CancellationToken token) {
        try {
            using HttpResponseMessage response = await client.GetAsync($"{baseUrl}/{path}", token);

            if (!response.IsSuccessStatusCode) {
                string reason = response.StatusCode switch {
                    HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden => "the console refused the API key",
                    HttpStatusCode.NotFound => "not found",
                    _ => ((int)response.StatusCode >= 300 && (int)response.StatusCode < 400) ? "the console redirected the request" : $"status {(int)response.StatusCode}"
                };

                throw new HttpStatusException(response.StatusCode, $"{reason} ({path.Split('?')[0]})");
            }

            return JsonDocument.Parse(await response.Content.ReadAsStringAsync(token));
        }
        catch (HttpRequestException ex) when (ex.InnerException is AuthenticationException) {
            throw new Exception(CertificateError());
        }
        catch (HttpRequestException ex) {
            throw new Exception($"The console could not be reached: {ex.Message}");
        }
    }

    private async Task<string> FindNetworkPathAsync(CancellationToken token) {
        if (networkPath is not null) return networkPath;

        foreach (string path in NETWORK_PATHS) {
            try {
                using JsonDocument doc = await GetJsonAsync($"{path}/sites?limit=1", token);
                networkPath = path;
                return path;
            }
            catch (HttpStatusException ex) when (ex.status == HttpStatusCode.NotFound) { }
        }

        throw new Exception("The UniFi Network application was not found on this console, check the address and that the application is up to date");
    }

    //The list endpoints return {"offset", "limit", "count", "totalCount", "data": [...]}
    private async Task<List<JsonElement>> ListPagedAsync(string path, CancellationToken token) {
        List<JsonElement> items = new List<JsonElement>();
        int offset = 0;

        for (int page = 0; page < MAX_PAGES; page++) {
            using JsonDocument doc = await GetJsonAsync($"{path}?offset={offset}&limit={PAGE_SIZE}", token);
            JsonElement root = doc.RootElement;

            JsonElement data = default;
            bool isList = root.ValueKind == JsonValueKind.Array
                ? (data = root).ValueKind == JsonValueKind.Array
                : root.ValueKind == JsonValueKind.Object && root.TryGetProperty("data", out data) && data.ValueKind == JsonValueKind.Array;
            if (!isList) break;

            int count = 0;
            foreach (JsonElement item in data.EnumerateArray()) {
                items.Add(item.Clone());
                count++;
            }

            int total = root.ValueKind == JsonValueKind.Object && root.TryGetProperty("totalCount", out JsonElement totalEl) && totalEl.TryGetInt32(out int n) ? n : -1;

            offset += count;
            if (count == 0) break;
            if (total >= 0 ? offset >= total : count < PAGE_SIZE) break;
        }

        return items;
    }

    private async Task<List<DeviceEntry>> FetchNetworkDevicesAsync(CancellationToken token) {
        string path = await FindNetworkPathAsync(token);

        List<DeviceEntry> devices = new List<DeviceEntry>();

        foreach (JsonElement site in await ListPagedAsync($"{path}/sites", token)) {
            string siteId = GetString(site, "id");
            if (String.IsNullOrEmpty(siteId)) continue;

            foreach (JsonElement device in await ListPagedAsync($"{path}/sites/{Uri.EscapeDataString(siteId)}/devices", token)) {
                if (TryParseNetworkDevice(device, out DeviceEntry entry)) {
                    devices.Add(entry);
                }
            }
        }

        return devices;
    }

    //Protect is optional, a console without it answers "not found"
    private async Task<List<DeviceEntry>> FetchCamerasAsync(CancellationToken token) {
        List<DeviceEntry> cameras = new List<DeviceEntry>();

        try {
            using JsonDocument doc = await GetJsonAsync($"{PROTECT_PATH}/cameras", token);
            JsonElement root = doc.RootElement;

            JsonElement data = default;
            bool isList = root.ValueKind == JsonValueKind.Array
                ? (data = root).ValueKind == JsonValueKind.Array
                : root.ValueKind == JsonValueKind.Object && root.TryGetProperty("data", out data) && data.ValueKind == JsonValueKind.Array;

            if (isList) {
                foreach (JsonElement camera in data.EnumerateArray()) {
                    if (TryParseCamera(camera, out DeviceEntry entry)) {
                        cameras.Add(entry);
                    }
                }
            }
        }
        catch (HttpStatusException ex) when (ex.status == HttpStatusCode.NotFound) { }

        return cameras;
    }

    private void Index(List<DeviceEntry> devices) {
        Dictionary<string, DeviceEntry> macs = new Dictionary<string, DeviceEntry>();
        Dictionary<string, DeviceEntry> ips = new Dictionary<string, DeviceEntry>();

        foreach (DeviceEntry device in devices) {
            string key = MacKey(device.mac);
            if (key is not null) macs.TryAdd(key, device);
            if (!String.IsNullOrEmpty(device.ip)) ips.TryAdd(device.ip, device);
        }

        devicesCache = devices;
        byMac = macs;
        byIp = ips;
    }

    internal static bool TryParseNetworkDevice(JsonElement element, out DeviceEntry entry) {
        entry = default;

        string mac = FormatMac(GetString(element, "macAddress") ?? GetString(element, "mac"));
        string name = GetString(element, "name");
        string deviceId = GetString(element, "id");
        if (mac is null && String.IsNullOrEmpty(deviceId)) return false;

        string model = GetString(element, "model");

        List<string> features = new List<string>();
        if (element.TryGetProperty("features", out JsonElement featuresEl)) {
            if (featuresEl.ValueKind == JsonValueKind.Array) {
                features.AddRange(featuresEl.EnumerateArray().Where(o => o.ValueKind == JsonValueKind.String).Select(o => o.GetString()));
            }
            else if (featuresEl.ValueKind == JsonValueKind.Object) {
                features.AddRange(featuresEl.EnumerateObject().Select(o => o.Name));
            }
        }

        entry = new DeviceEntry {
            id          = deviceId,
            mac         = mac,
            ip          = GetString(element, "ipAddress") ?? GetString(element, "ip"),
            name        = name,
            model       = model,
            type        = ClassifyNetworkDevice(model, features),
            firmware    = GetString(element, "firmwareVersion"),
            serial      = GetString(element, "serialNumber") ?? GetString(element, "serial"),
            state       = GetString(element, "state"),
            application = "Network"
        };

        return true;
    }

    internal static bool TryParseCamera(JsonElement element, out DeviceEntry entry) {
        entry = default;

        string mac = FormatMac(GetString(element, "mac") ?? GetString(element, "macAddress"));
        string cameraId = GetString(element, "id");
        if (mac is null && String.IsNullOrEmpty(cameraId)) return false;

        entry = new DeviceEntry {
            id          = cameraId,
            mac         = mac,
            ip          = GetString(element, "host") ?? GetString(element, "ipAddress") ?? GetString(element, "ip"),
            name        = GetString(element, "name"),
            model       = GetString(element, "marketName") ?? GetString(element, "model") ?? GetString(element, "type"),
            type        = "camera",
            firmware    = GetString(element, "firmwareVersion"),
            serial      = GetString(element, "serialNumber"),
            state       = GetString(element, "state"),
            application = "Protect"
        };

        return true;
    }

    //The type, in the words of the device types of the application. A Dream Machine has an access point and a switch in
    //it too, it is a gateway first.
    internal static string ClassifyNetworkDevice(string model, IReadOnlyCollection<string> features) {
        string m = (model ?? String.Empty).ToUpperInvariant().Replace(" ", String.Empty).Replace("-", String.Empty);

        if (StartsWithAny(m, "UDM", "UDR", "UDW", "UXG", "USG", "UCG", "UGW", "EFG")) return "firewall";
        if (StartsWithAny(m, "UAP", "U6", "U7", "UWB", "NANOHD", "FLEXHD", "BEACONHD")) return "access point";
        if (StartsWithAny(m, "USW", "US8", "US16", "US24", "US48", "USL", "ECS", "FLEXMINI")) return "switch";
        if (StartsWithAny(m, "UNVR")) return "nvr";
        if (StartsWithAny(m, "UCK")) return "server";

        if (features is not null) {
            if (features.Any(o => String.Equals(o, "accessPoint", StringComparison.OrdinalIgnoreCase))) return "access point";
            if (features.Any(o => String.Equals(o, "switching", StringComparison.OrdinalIgnoreCase))) return "switch";
        }

        return null;
    }

    private static bool StartsWithAny(string value, params string[] prefixes) =>
        prefixes.Any(prefix => value.StartsWith(prefix, StringComparison.Ordinal));

    //12 hexadecimal digits, upper case, no separators; or null when it is not a MAC address
    internal static string MacKey(string mac) {
        if (String.IsNullOrWhiteSpace(mac)) return null;

        string key = new string(mac.Where(Uri.IsHexDigit).ToArray()).ToUpperInvariant();
        return key.Length == 12 ? key : null;
    }

    internal static string FormatMac(string mac) {
        string key = MacKey(mac);
        return key is null ? null : String.Join(":", Enumerable.Range(0, 6).Select(i => key.Substring(i * 2, 2)));
    }

    private static string GetString(JsonElement element, string property) =>
        element.ValueKind == JsonValueKind.Object && element.TryGetProperty(property, out JsonElement value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;
}

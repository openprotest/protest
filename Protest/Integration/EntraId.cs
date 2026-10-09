using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace Protest.Integration;

internal sealed class EntraId {
    private static readonly HttpClient httpClient;
    private static readonly ConcurrentDictionary<string, EntraId> clients = new ConcurrentDictionary<string, EntraId>();

    private const long CACHE_TTL = 72_000_000_000L; //2 hours in ticks
    private static readonly TimeSpan RETRY_AFTER_FAILURE = TimeSpan.FromMinutes(5);

    private const string GRAPH_HOST = "graph.microsoft.com";
    private const string DEVICE_FIELDS = "id,deviceId,displayName,operatingSystem,operatingSystemVersion,manufacturer,model,approximateLastSignInDateTime";
    private const string USER_FIELDS = "id,displayName,givenName,surname,userPrincipalName,mail,jobTitle,department,companyName,employeeId,mobilePhone,businessPhones,faxNumber,onPremisesImmutableId";

    public struct DeviceEntry {
        public string         id;
        public string         deviceId;
        public string         displayName;
        public string         os;
        public string         osVer;
        public string         manufacturer;
        public string         model;
        public DateTimeOffset lastSignIn;
    }

    public sealed class UserEntry {
        public string username;
        public Dictionary<string, string> attributes;
    }

    private readonly string id;
    private readonly SemaphoreSlim semaphore = new SemaphoreSlim(1, 1);

    private string accessToken;
    private DateTime tokenExpiryUtc;

    private long devicesCacheDate;
    private long usersCacheDate;
    private DateTime retryAfterUtc;
    private volatile string lastError;

    private volatile ConcurrentDictionary<string, DeviceEntry> devicesCache = new ConcurrentDictionary<string, DeviceEntry>();
    private volatile List<UserEntry> usersCache = new List<UserEntry>();

    static EntraId() {
        httpClient = new HttpClient();
        httpClient.DefaultRequestHeaders.Add("User-Agent", "Pro-test");
    }

    private EntraId(string id) {
        this.id = id;
    }

    internal static EntraId Get(string id) => clients.GetOrAdd(id, key => new EntraId(key));

    //forgets the login and the cache, used when the credentials change or the instance is removed
    internal static void Drop(string id) => clients.TryRemove(id, out _);

    internal static string GetLastError(string id) => clients.TryGetValue(id, out EntraId client) ? client.lastError : null;

    //selector: null or "all" for every enabled instance, or the id of the one to use (see Integration.NormalizeSelector)
    private static EntraId[] GetEnabled(string selector) =>
        Integration.GetEnabledInstances("entra", selector).Select(i => Get(i.Id)).ToArray();

    //The tenant name shown as the origin of the data it provides.
    private string Label => Integration.TryGetInstance(id, out Integration.Instance instance)
        ? Integration.SourceLabel(instance)
        : "Entra ID";

    //The selected tenants in parallel; a tenant that fails does not hold back or break the others.
    //A forced fetch ignores the cache and the wait after a failure, it is for when the user asked for the data.
    public static async Task FetchDevicesAsync(string selector, bool force = false, CancellationToken token = default) {
        EntraId[] enabled = GetEnabled(selector);
        if (enabled.Length == 0) return;

        await Task.WhenAll(enabled.Select(client => client.RefreshAsync(true, false, force, token)));
    }

    //First match wins, tenants are searched in name order.
    public static bool TryResolveDevice(string name, string selector, out DeviceEntry entry, out string source) {
        entry = default;
        source = null;

        if (String.IsNullOrWhiteSpace(name)) return false;

        foreach (EntraId client in GetEnabled(selector)) {
            if (client.TryResolve(name, out entry)) {
                source = client.Label;
                return true;
            }
        }

        return false;
    }

    //Every user of the selected tenants, always freshly read. A tenant that cannot be read contributes nothing.
    public static async Task<List<(UserEntry user, string source)>> FetchUsersAsync(string selector, CancellationToken token = default) {
        EntraId[] enabled = GetEnabled(selector);
        List<(UserEntry user, string source)> users = new List<(UserEntry, string)>();
        if (enabled.Length == 0) return users;

        bool[] succeeded = await Task.WhenAll(enabled.Select(client => client.RefreshAsync(false, true, true, token)));

        for (int i = 0; i < enabled.Length; i++) {
            if (!succeeded[i]) continue;

            string label = enabled[i].Label;
            foreach (UserEntry user in enabled[i].usersCache) {
                users.Add((user, label));
            }
        }

        return users;
    }

    //Signs in again with the stored credentials and checks that the permissions that are needed were granted.
    //Returns the reason when it fails.
    public async Task<string> TestAsync() {
        await semaphore.WaitAsync();

        try {
            await AuthenticateStoredAsync(CancellationToken.None);

            lastError = null;
            retryAfterUtc = default;

            List<string> missing = new List<string>();

            foreach ((string resource, string permission) in new[] { ("devices", "Device.Read.All"), ("users", "User.Read.All") }) {
                using HttpRequestMessage request = new HttpRequestMessage(HttpMethod.Get, $"https://{GRAPH_HOST}/v1.0/{resource}?$select=id&$top=1");
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

                using HttpResponseMessage response = await httpClient.SendAsync(request);

                if (response.StatusCode == HttpStatusCode.Forbidden || response.StatusCode == HttpStatusCode.Unauthorized) {
                    missing.Add(permission);
                }
                else if (!response.IsSuccessStatusCode) {
                    return $"Microsoft Graph returned {(int)response.StatusCode} when reading the {resource}";
                }
            }

            return missing.Count == 0
                ? null
                : $"Signed in, but the application is missing the {String.Join(" and ", missing)} permission";
        }
        catch (Exception ex) {
            lastError = Shorten(ex.Message);
            return ex.Message;
        }
        finally {
            semaphore.Release();
        }
    }

    private async Task<bool> RefreshAsync(bool devices, bool users, bool force, CancellationToken token) {
        await semaphore.WaitAsync();

        try {
            long now = DateTime.UtcNow.Ticks;
            bool needDevices = devices && (force || now - devicesCacheDate >= CACHE_TTL);
            bool needUsers = users && (force || now - usersCacheDate >= CACHE_TTL);

            if (!needDevices && !needUsers) return true;
            if (!force && DateTime.UtcNow < retryAfterUtc) return false;

            if (!IsAuthenticated()) {
                await AuthenticateStoredAsync(token);
            }

            if (needDevices) {
                ParseDevices(await FetchPagedAsync("devices", DEVICE_FIELDS, "Device.Read.All", token));
                devicesCacheDate = DateTime.UtcNow.Ticks;
            }

            if (needUsers) {
                ParseUsers(await FetchPagedAsync("users", USER_FIELDS, "User.Read.All", token));
                usersCacheDate = DateTime.UtcNow.Ticks;
            }

            lastError = null;
            return true;
        }
        catch (OperationCanceledException) {
            return false;
        }
        catch (Exception ex) {
            //a tenant that cannot be reached is not retried on every single device fetch
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

    private bool IsAuthenticated() =>
        !String.IsNullOrWhiteSpace(accessToken) && DateTime.UtcNow < tokenExpiryUtc;

    private async Task AuthenticateStoredAsync(CancellationToken token) {
        Dictionary<string, string> config = Integration.ReadConfig(id);

        if (config is null
            || !config.TryGetValue("tenant", out string tenant)
            || !config.TryGetValue("client", out string client)
            || !config.TryGetValue("secret", out string secret)) {
            throw new Exception("The credentials are missing or unreadable");
        }

        using FormUrlEncodedContent form = new FormUrlEncodedContent([
            new("client_id", client),
            new("client_secret", secret),
            new("scope", $"https://{GRAPH_HOST}/.default"),
            new("grant_type", "client_credentials")
        ]);

        using HttpResponseMessage response = await httpClient.PostAsync(
            $"https://login.microsoftonline.com/{Uri.EscapeDataString(tenant)}/oauth2/v2.0/token", form, token);

        string json = await response.Content.ReadAsStringAsync(token);

        if (!response.IsSuccessStatusCode) {
            throw new Exception(SignInError((int)response.StatusCode, json));
        }

        using JsonDocument doc = JsonDocument.Parse(json);

        accessToken = doc.RootElement.GetProperty("access_token").GetString();

        int expiresIn = doc.RootElement.GetProperty("expires_in").GetInt32();
        tokenExpiryUtc = DateTime.UtcNow.AddSeconds(expiresIn - 60);
    }

    //Entra explains what is wrong ("AADSTS7000215: Invalid client secret provided...") on the first line of error_description
    internal static string SignInError(int status, string json) {
        try {
            using JsonDocument doc = JsonDocument.Parse(json);

            if (doc.RootElement.TryGetProperty("error_description", out JsonElement description) && description.ValueKind == JsonValueKind.String) {
                string text = description.GetString().Split('\n')[0].Trim();
                if (text.Length > 0) return $"Entra sign-in failed: {text}";
            }
        }
        catch (JsonException) { }

        return $"Entra sign-in failed ({status})";
    }

    private async Task<List<JsonElement>> FetchPagedAsync(string resource, string select, string permission, CancellationToken token) {
        List<JsonElement> items = new List<JsonElement>();
        string url = $"https://{GRAPH_HOST}/v1.0/{resource}?$select={select}&$top=999";

        while (!String.IsNullOrEmpty(url)) {
            using HttpRequestMessage request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

            using HttpResponseMessage response = await httpClient.SendAsync(request, token);

            if (!response.IsSuccessStatusCode) {
                if (response.StatusCode == HttpStatusCode.Forbidden || response.StatusCode == HttpStatusCode.Unauthorized) {
                    throw new Exception($"Reading the {resource} was denied, the application needs the {permission} permission");
                }

                throw new Exception($"Microsoft Graph returned {(int)response.StatusCode} when reading the {resource}");
            }

            using JsonDocument doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync(token));

            if (doc.RootElement.TryGetProperty("value", out JsonElement list)) {
                foreach (JsonElement item in list.EnumerateArray()) {
                    items.Add(item.Clone());
                }
            }

            url = doc.RootElement.TryGetProperty("@odata.nextLink", out JsonElement next) ? next.GetString() : null;

            //the access token is only ever sent to Microsoft Graph
            if (url is not null && !(Uri.TryCreate(url, UriKind.Absolute, out Uri nextUri) && nextUri.Scheme == Uri.UriSchemeHttps && nextUri.Host == GRAPH_HOST)) {
                throw new Exception("Microsoft Graph returned an unexpected paging link");
            }
        }

        return items;
    }

    private void ParseDevices(List<JsonElement> devices) {
        ConcurrentDictionary<string, DeviceEntry> byName = new ConcurrentDictionary<string, DeviceEntry>();

        foreach (JsonElement device in devices) {
            if (!TryParseDevice(device, out DeviceEntry entry)) continue;

            string name = entry.displayName.ToLowerInvariant();
            AddDevice(byName, name, entry);

            int dot = name.IndexOf('.');
            if (dot > 0) {
                AddDevice(byName, name[..dot], entry);
            }
        }

        devicesCache = byName;
    }

    //The same name is often registered more than once, the device that signed in most recently is the one in use.
    private static void AddDevice(ConcurrentDictionary<string, DeviceEntry> byName, string name, DeviceEntry entry) {
        byName.AddOrUpdate(name, entry, (_, current) => entry.lastSignIn > current.lastSignIn ? entry : current);
    }

    internal static bool TryParseDevice(JsonElement element, out DeviceEntry entry) {
        entry = default;

        string displayName = GetString(element, "displayName");
        if (String.IsNullOrWhiteSpace(displayName)) return false;

        entry = new DeviceEntry {
            id           = GetString(element, "id"),
            deviceId     = GetString(element, "deviceId"),
            displayName  = displayName,
            os           = GetString(element, "operatingSystem"),
            osVer        = GetString(element, "operatingSystemVersion"),
            manufacturer = GetString(element, "manufacturer"),
            model        = GetString(element, "model")
        };

        if (DateTimeOffset.TryParse(GetString(element, "approximateLastSignInDateTime"), null, System.Globalization.DateTimeStyles.AssumeUniversal, out DateTimeOffset lastSignIn)) {
            entry.lastSignIn = lastSignIn;
        }

        return true;
    }

    private bool TryResolve(string name, out DeviceEntry entry) {
        entry = default;

        name = name.ToLowerInvariant();
        if (devicesCache.TryGetValue(name, out entry)) return true;

        int dot = name.IndexOf('.');
        if (dot > 0 && devicesCache.TryGetValue(name[..dot], out entry)) return true;

        return false;
    }

    private void ParseUsers(List<JsonElement> users) {
        List<UserEntry> list = new List<UserEntry>(users.Count);

        foreach (JsonElement user in users) {
            UserEntry entry = ParseUser(user);
            if (entry is not null) list.Add(entry);
        }

        usersCache = list;
    }

    //The attributes use the names of the ones fetched from a domain, so the same person from both sources merges into one record.
    internal static UserEntry ParseUser(JsonElement element) {
        string upn = GetString(element, "userPrincipalName");
        if (String.IsNullOrWhiteSpace(upn)) return null;

        int at = upn.IndexOf('@');
        string username = at > 0 ? upn[..at] : upn;

        Dictionary<string, string> attributes = new Dictionary<string, string> {
            { "type", "Entra user" }
        };

        AddAttribute(attributes, "title",         GetString(element, "jobTitle"));
        AddAttribute(attributes, "first name",    GetString(element, "givenName"));
        AddAttribute(attributes, "last name",     GetString(element, "surname"));
        AddAttribute(attributes, "username",      username);
        AddAttribute(attributes, "display name",  GetString(element, "displayName"));
        AddAttribute(attributes, "employee id",   GetString(element, "employeeId"));
        AddAttribute(attributes, "company",       GetString(element, "companyName"));
        AddAttribute(attributes, "department",    GetString(element, "department"));
        AddAttribute(attributes, "e-mail",        GetString(element, "mail"));

        if (element.TryGetProperty("businessPhones", out JsonElement phones) && phones.ValueKind == JsonValueKind.Array) {
            AddAttribute(attributes, "telephone number", String.Join("; ", phones.EnumerateArray()
                .Where(o => o.ValueKind == JsonValueKind.String && !String.IsNullOrWhiteSpace(o.GetString()))
                .Select(o => o.GetString())));
        }

        AddAttribute(attributes, "mobile number", GetString(element, "mobilePhone"));
        AddAttribute(attributes, "fax",           GetString(element, "faxNumber"));

        string entraId = GetString(element, "id");

        //a user synced from a domain keeps the GUID that it has there, which is the immutable id (base64) of its object
        string guid = ImmutableIdToGuid(GetString(element, "onPremisesImmutableId")) ?? entraId;
        AddAttribute(attributes, "object guid", guid);
        AddAttribute(attributes, "entra id", entraId);

        return new UserEntry { username = username, attributes = attributes };
    }

    internal static string ImmutableIdToGuid(string immutableId) {
        if (String.IsNullOrEmpty(immutableId)) return null;

        try {
            byte[] bytes = Convert.FromBase64String(immutableId);
            return bytes.Length == 16 ? new Guid(bytes).ToString() : null;
        }
        catch (FormatException) {
            return null;
        }
    }

    private static void AddAttribute(Dictionary<string, string> attributes, string name, string value) {
        if (!String.IsNullOrWhiteSpace(value)) {
            attributes[name] = value.Trim();
        }
    }

    private static string GetString(JsonElement element, string property) =>
        element.TryGetProperty(property, out JsonElement value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;
}

using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Protest.Http;

namespace Protest.Tools;

internal static class Ares {
    private sealed record Agent(string Id, string Type, string Name, bool Enabled, string Secret);
    internal sealed record Model(string Id, string Name);

    private const int MAX_PAYLOAD = 64 * 1024;
    private static readonly Lock mutex = new Lock();
    private static readonly Dictionary<string, string> errors = new Dictionary<string, string>();
    private static readonly JsonSerializerOptions jsonOptions = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
    private static readonly HttpClient httpClient = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false }) { Timeout = TimeSpan.FromSeconds(30) };

    private static string ProviderLabel(string type) => type switch {
        "openai" => "OpenAI",
        "anthropic" => "Anthropic",
        _ => null
    };

    public static byte[] GetTypes() => JsonSerializer.SerializeToUtf8Bytes(new[] {
        new { type = "openai", label = "OpenAI" },
        new { type = "anthropic", label = "Anthropic" }
    });

    public static byte[] List(bool enabledOnly = false) {
        lock (mutex) {
            var list = ReadAgents().Where(agent => !enabledOnly || agent.Enabled).Select(agent => new {
                id = agent.Id,
                type = agent.Type,
                label = ProviderLabel(agent.Type),
                name = agent.Name,
                enabled = agent.Enabled,
                error = errors.GetValueOrDefault(agent.Id)
            }).ToArray();

            return JsonSerializer.SerializeToUtf8Bytes(list);
        }
    }

    public static byte[] Get(HttpListenerContext ctx) {
        lock (mutex) {
            Agent agent = ReadAgent(RequestId(ctx));
            if (agent is null) return Data.CODE_NOT_FOUND.Array;

            return JsonSerializer.SerializeToUtf8Bytes(new {
                id = agent.Id,
                type = agent.Type,
                name = agent.Name,
                enabled = agent.Enabled
            });
        }
    }

    public static byte[] Save(HttpListenerContext ctx, string origin) {
        using JsonDocument doc = ReadJsonBody(ctx);
        if (doc is null || doc.RootElement.ValueKind != JsonValueKind.Object) return Data.CODE_INVALID_ARGUMENT.Array;
        JsonElement root = doc.RootElement;

        bool invalidId = root.TryGetProperty("id", out JsonElement idValue) && idValue.ValueKind is not (JsonValueKind.Null or JsonValueKind.String);
        bool invalidKey = root.TryGetProperty("key", out JsonElement keyValue) && keyValue.ValueKind != JsonValueKind.String;
        bool invalidEnabled = root.TryGetProperty("enabled", out JsonElement enabledValue) && enabledValue.ValueKind is not (JsonValueKind.True or JsonValueKind.False);
        if (invalidId || invalidKey || invalidEnabled) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        lock (mutex) {
            string id = GetString(root, "id");
            Agent existing = null;
            if (!String.IsNullOrEmpty(id)) {
                if (!Guid.TryParse(id, out Guid guid)) return Data.CODE_INVALID_ARGUMENT.Array;
                existing = ReadAgent(guid.ToString());
                if (existing is null) return Data.CODE_NOT_FOUND.Array;
            }

            string type = existing?.Type ?? GetString(root, "type");
            if (ProviderLabel(type) is null) return Data.CODE_INVALID_ARGUMENT.Array;

            string name = (GetString(root, "name") ?? String.Empty).Trim();
            string key = (GetString(root, "key") ?? String.Empty).Trim();
            bool enabled = root.TryGetProperty("enabled", out JsonElement flag) ? flag.ValueKind == JsonValueKind.True : existing?.Enabled ?? true;

            if (name.Length == 0 || name.Length > 64 || name.Any(Char.IsControl)) return Error("Enter a name of up to 64 characters without control characters");
            if (key.Length == 0 && existing is null) return Error("An API key is required");
            if (key.Length > 512 || key.Any(character => character < '!' || character > '~')) return Error("The API key is not valid");
            if (ReadAgents().Any(agent => agent.Id != existing?.Id && String.Equals(agent.Name, name, StringComparison.OrdinalIgnoreCase))) {
                return Error("An agent with this name already exists");
            }

            try {
                string secret = key.Length == 0 ? existing.Secret : Convert.ToBase64String(Cryptography.Encrypt(Encoding.UTF8.GetBytes(key), Configuration.DB_KEY, Configuration.DB_KEY_IV));
                Agent agent = new Agent(existing?.Id ?? Guid.NewGuid().ToString(), type, name, enabled, secret);
                Directory.CreateDirectory(Data.DIR_ARES_AGENTS);
                string path = PathOf(agent.Id);
                string temporary = $"{path}.tmp";
                File.WriteAllBytes(temporary, JsonSerializer.SerializeToUtf8Bytes(agent, jsonOptions));
                File.Move(temporary, path, true);
                errors.Remove(agent.Id);

                Logger.Action(origin, "A.R.E.S.", $"{(existing is null ? "Add" : "Modify")} {ProviderLabel(type)} agent: {name}");
                return JsonSerializer.SerializeToUtf8Bytes(new { status = "ok", id = agent.Id });
            }
            catch (Exception ex) {
                Logger.Error(ex);
                return Data.CODE_FAILED.Array;
            }
        }
    }

    public static byte[] Delete(HttpListenerContext ctx, string origin) {
        lock (mutex) {
            Agent agent = ReadAgent(RequestId(ctx));
            if (agent is null) return Data.CODE_NOT_FOUND.Array;

            try {
                File.Delete(PathOf(agent.Id));
                errors.Remove(agent.Id);
                Logger.Action(origin, "A.R.E.S.", $"Delete {ProviderLabel(agent.Type)} agent: {agent.Name}");
                return Data.CODE_OK.Array;
            }
            catch (Exception ex) {
                Logger.Error(ex);
                return Data.CODE_FAILED.Array;
            }
        }
    }

    public static Task<byte[]> TestAsync(HttpListenerContext ctx, string origin) => GetModelsAsync(ctx, origin, true);

    public static async Task<byte[]> GetModelsAsync(HttpListenerContext ctx, string origin, bool test = false) {
        Agent agent;
        lock (mutex) {
            agent = ReadAgent(RequestId(ctx));
        }
        if (agent is null) return Data.CODE_NOT_FOUND.Array;
        if (!test && !agent.Enabled) return Error("The selected agent is disabled. Select an enabled agent.");

        string error = null;
        Model[] models = [];
        try {
            byte[] plain = Cryptography.Decrypt(Convert.FromBase64String(agent.Secret), Configuration.DB_KEY, Configuration.DB_KEY_IV);
            using CancellationTokenSource timeout = new CancellationTokenSource(TimeSpan.FromSeconds(30));
            models = await FetchModelsAsync(agent.Type, Encoding.UTF8.GetString(plain), httpClient, timeout.Token);
            if (models.Length == 0) error = "The provider returned no available models for this API key";
        }
        catch (HttpRequestException ex) {
            error = ex.StatusCode is null
                ? $"Cannot connect to {ProviderLabel(agent.Type)}"
                : $"{ProviderLabel(agent.Type)} rejected the models request (HTTP {(int)ex.StatusCode}). Check the API key, permissions, and rate limits.";
        }
        catch (OperationCanceledException) {
            error = $"The request to {ProviderLabel(agent.Type)} timed out";
        }
        catch (Exception ex) {
            Logger.Error(ex);
            error = "Unable to load models from this agent";
        }

        lock (mutex) {
            //Ignore results from requests that started before the agent was edited or removed.
            if (ReadAgent(agent.Id) != agent) return Error("The agent configuration changed. Refresh the agent list.");
            if (error is null) errors.Remove(agent.Id);
            else errors[agent.Id] = error;
        }

        if (test) Logger.Action(origin, "A.R.E.S.", $"Test {ProviderLabel(agent.Type)} agent: {agent.Name} ({(error is null ? "succeeded" : "failed")})");
        if (error is not null) return Error(error);
        if (test) return Data.CODE_OK.Array;

        return JsonSerializer.SerializeToUtf8Bytes(new {
            agent = new { id = agent.Id, type = agent.Type, name = agent.Name, label = ProviderLabel(agent.Type) },
            revision = Convert.ToHexString(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(agent, jsonOptions))),
            models = models.Select(model => new { id = model.Id, name = model.Name }).ToArray()
        });
    }

    internal static async Task<Model[]> FetchModelsAsync(string type, string key, HttpClient client, CancellationToken token = default) {
        string endpoint = type switch {
            "openai" => "https://api.openai.com/v1/models",
            "anthropic" => "https://api.anthropic.com/v1/models?limit=1000",
            _ => throw new ArgumentException("Unsupported agent provider", nameof(type))
        };
        Dictionary<string, Model> models = new Dictionary<string, Model>();
        HashSet<string> cursors = new HashSet<string>();
        string cursor = null;

        do {
            string url = cursor is null ? endpoint : $"{endpoint}&after_id={Uri.EscapeDataString(cursor)}";
            using HttpRequestMessage request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", key);
            if (type == "anthropic") request.Headers.Add("anthropic-version", "2026-10-21");
            using HttpResponseMessage response = await client.SendAsync(request, token);
            response.EnsureSuccessStatusCode();
            using JsonDocument doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync(token));
            JsonElement root = doc.RootElement;
            foreach (JsonElement entry in root.GetProperty("data").EnumerateArray()) {
                string id = GetString(entry, "id");
                if (String.IsNullOrWhiteSpace(id)) continue;
                models[id] = new Model(id, GetString(entry, "display_name") ?? id);
            }

            cursor = null;
            if (type == "anthropic" && root.TryGetProperty("has_more", out JsonElement more) && more.ValueKind == JsonValueKind.True) {
                cursor = GetString(root, "last_id");
                if (String.IsNullOrEmpty(cursor) || !cursors.Add(cursor)) throw new JsonException("Invalid model pagination cursor");
            }
        } while (cursor is not null);

        return models.Values.OrderBy(model => model.Name, StringComparer.OrdinalIgnoreCase).ToArray();
    }

    private static string PathOf(string id) => Path.Join(Data.DIR_ARES_AGENTS, $"{id}.json");

    private static Agent ReadAgent(string id) {
        if (id is null) return null;
        try {
            string path = PathOf(id);
            if (!File.Exists(path)) return null;
            Agent agent = JsonSerializer.Deserialize<Agent>(File.ReadAllBytes(path), jsonOptions);
            return agent?.Id == id && ProviderLabel(agent.Type) is not null && !String.IsNullOrWhiteSpace(agent.Name) && !String.IsNullOrEmpty(agent.Secret) ? agent : null;
        }
        catch (Exception ex) {
            Logger.Error(ex);
            return null;
        }
    }

    private static Agent[] ReadAgents() {
        if (!Directory.Exists(Data.DIR_ARES_AGENTS)) return [];
        return Directory.EnumerateFiles(Data.DIR_ARES_AGENTS, "*.json")
            .Select(path => Guid.TryParse(Path.GetFileNameWithoutExtension(path), out Guid guid) ? ReadAgent(guid.ToString()) : null)
            .Where(agent => agent is not null)
            .OrderBy(agent => agent.Name, StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    private static string RequestId(HttpListenerContext ctx) {
        Dictionary<string, string> parameters = Listener.ParseQuery(ctx);
        return parameters is not null && parameters.TryGetValue("id", out string id) && Guid.TryParse(id, out Guid guid) ? guid.ToString() : null;
    }

    private static string GetString(JsonElement root, string name) =>
        root.TryGetProperty(name, out JsonElement value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;

    private static byte[] Error(string message) => JsonSerializer.SerializeToUtf8Bytes(new { error = message });

    private static JsonDocument ReadJsonBody(HttpListenerContext ctx) {
        if (ctx.Request.ContentLength64 > MAX_PAYLOAD) return null;
        using StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding);
        char[] buffer = new char[MAX_PAYLOAD + 1];
        int count = reader.ReadBlock(buffer, 0, buffer.Length);
        if (count == 0 || count > MAX_PAYLOAD) return null;
        try {
            return JsonDocument.Parse(new string(buffer, 0, count));
        }
        catch (JsonException) {
            return null;
        }
    }
}

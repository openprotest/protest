using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;

namespace Protest.Ares;

internal static partial class Core {

    //Presentation order for provider-advertised levels. Unfamiliar values are kept.
    private static readonly string[] effortOrder = ["none", "minimal", "low", "medium", "high", "xhigh", "max"];

    [GeneratedRegex(@"-\d{4}-\d{2}-\d{2}$")]
    private static partial Regex ModelSnapshotSuffix();

    //Fallbacks for known models whose APIs do not return an effort list.
    private static string[] FallbackReasoningOptions(string type, string model) {
        string name = ModelSnapshotSuffix().Replace(model, String.Empty);
        return (type, name) switch {
            ("openai", "o1" or "o3" or "o3-mini" or "o4-mini") => ["low", "medium", "high"],
            ("openai", "gpt-5" or "gpt-5-mini" or "gpt-5-nano") => ["minimal", "low", "medium", "high"],
            ("openai", "gpt-5.1") => ["none", "low", "medium", "high"],
            ("openai", "gpt-5.2" or "gpt-5.4" or "gpt-5.5" or "gpt-6-luna") => ["none", "low", "medium", "high", "xhigh"],
            ("openai", "gpt-6.2-astra" or "gpt-6.2-sol") => ["low", "medium", "high", "xhigh"],
            ("openai", "gpt-6-astra" or "gpt-6.1-sol") => ["low", "medium", "high", "xhigh", "max"],
            ("openai", "gpt-6-sol") => ["none", "low", "medium", "high", "xhigh", "max"],
            ("xai", "grok-4.6" or "grok-4.7") => ["low", "medium", "high", "xhigh"],
            ("xai", "grok-4.5") => ["low", "medium", "high"],
            ("google", "gemini-4-neon" or "gemini-4-hydrogen") => ["low", "medium", "high", "xhigh"],
            ("google", "gemini-4-carbon" or "gemini-4-argon" or "gemini-3.8-flash" or "gemini-3.1-pro-preview") => ["low", "medium", "high"],
            ("google", "gemini-3.6-flash" or "gemini-3.5-flash-lite" or "gemini-3.1-flash-lite" or "gemini-3-flash-preview") => ["minimal", "low", "medium", "high"],
            ("google", "gemini-3-pro-preview") => ["low", "high"],
            ("google", "gemini-2.5-pro") => ["low", "medium", "high"],
            ("google", "gemini-2.5-flash" or "gemini-2.5-flash-lite") => ["none", "low", "medium", "high"],
            _ => []
        };
    }

    internal static async Task<string[]> FetchReasoningOptionsAsync(string type, string key, string model, HttpClient client, CancellationToken token = default, string endpoint = null) {
        //These model APIs do not expose the accepted Chat Completions effort values.
        //https://developers.openai.com/api/reference/resources/models/methods/retrieve
        //https://aistudio.google.com/api-reference/models
        if (type is "openai" or "google") return FallbackReasoningOptions(type, model);

        string address = type switch {
            "anthropic" => $"https://api.anthropic.com/v1/models/{Uri.EscapeDataString(model)}",
            "xai" => $"https://api.x.ai/v1/language-models/{Uri.EscapeDataString(model)}",
            "ollama" => $"{NormalizeEndpoint(endpoint ?? "http://localhost:11434") ?? throw new ArgumentException("Invalid Ollama server URL")}/api/show",
            _ => throw new ArgumentException("Unsupported agent provider", nameof(type))
        };

        using HttpRequestMessage request = new HttpRequestMessage(type == "ollama" ? HttpMethod.Post : HttpMethod.Get, address);

        if (!String.IsNullOrEmpty(key)) request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", key);

        if (type == "anthropic") {
            request.Headers.Add("anthropic-version", "2026-10-21");
        }
        else if (type == "ollama") {
            request.Content = new StringContent(JsonSerializer.Serialize(new { model }), Encoding.UTF8, "application/json");
        }

        using HttpResponseMessage response = await client.SendAsync(request, token);
        response.EnsureSuccessStatusCode();

        using JsonDocument doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync(token));
        if (doc.RootElement.ValueKind != JsonValueKind.Object) throw new JsonException("Invalid model capability response");
        return ReadReasoningOptions(type, doc.RootElement) ?? FallbackReasoningOptions(type, model);
    }

    internal static string[] ReadReasoningOptions(string type, JsonElement root) {
        if (root.ValueKind != JsonValueKind.Object) return [];

        if (type == "anthropic") {
            if (!root.TryGetProperty("capabilities", out JsonElement capabilities) || capabilities.ValueKind != JsonValueKind.Object ||
                !capabilities.TryGetProperty("effort", out JsonElement effort) || effort.ValueKind != JsonValueKind.Object ||
                !effort.TryGetProperty("supported", out JsonElement supported) || supported.ValueKind != JsonValueKind.True) return [];

            return effort.EnumerateObject().Where(property => ValidEffort(property.Name) && property.Value.ValueKind == JsonValueKind.Object &&
                    property.Value.TryGetProperty("supported", out JsonElement enabled) && enabled.ValueKind == JsonValueKind.True)
                .Select(property => property.Name).Distinct().OrderBy(level => {
                    int index = Array.IndexOf(effortOrder, level);
                    return index < 0 ? effortOrder.Length : index;
                }).ToArray();
        }

        //https://docs.x.ai/developers/rest-api-reference/inference/models
        if (type == "xai") {
            //Null signals missing metadata. An explicitly empty list must override the fallback.
            if (!root.TryGetProperty("capabilities", out JsonElement xaiCapabilities) || xaiCapabilities.ValueKind == JsonValueKind.Null) return null;
            if (xaiCapabilities.ValueKind != JsonValueKind.Object) return [];
            if (!xaiCapabilities.TryGetProperty("reasoning_effort", out JsonElement efforts) || efforts.ValueKind == JsonValueKind.Null) return null;
            if (efforts.ValueKind != JsonValueKind.Array) return [];

            return efforts.EnumerateArray().Where(value => value.ValueKind == JsonValueKind.String).Select(value => value.GetString())
                .Where(ValidEffort).Distinct().ToArray();
        }

        if (type == "ollama" && root.TryGetProperty("thinking", out JsonElement thinking) && thinking.ValueKind == JsonValueKind.Object &&
            thinking.TryGetProperty("values", out JsonElement values) && values.ValueKind == JsonValueKind.Array) {

            string[] options = values.EnumerateArray().Select(value => value.ValueKind switch {
                JsonValueKind.True => "true", JsonValueKind.False => "false", JsonValueKind.String => value.GetString(), _ => null
            }).Where(ValidEffort).Distinct().ToArray();

            return options.Length == 1 && options[0] == "false" ? [] : options;
        }

        return [];
    }

    private static bool ValidEffort(string value) => !String.IsNullOrWhiteSpace(value) && value.Length <= 64 && !value.Any(Char.IsControl);
}

using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;

namespace Protest.Tools;

internal static partial class Ares {

    [GeneratedRegex(@"-\d{4}-\d{2}-\d{2}$")]
    private static partial Regex MyRegex();

    //Chat Completions has no model-capability discovery endpoint. Unknown models use defaults.
    //https://developers.openai.com/api/docs/guides/reasoning
    internal static string[] OpenAiReasoningOptions(string model) {
        string name = Regex.Replace(model, @"-\d{4}-\d{2}-\d{2}$", String.Empty);
        return name switch {
            "o1" or "o3" or "o3-mini" or "o4-mini" => ["low", "medium", "high"],
            "gpt-5" or "gpt-5-mini" or "gpt-5-nano" => ["minimal", "low", "medium", "high"],
            "gpt-5.1" => ["none", "low", "medium", "high"],
            "gpt-5.2" or "gpt-5.4" or "gpt-5.5" => ["none", "low", "medium", "high", "xhigh"],
            "gpt-6-astra" or "gpt-6.1-sol" or "gpt-6.2-astra" or "gpt-6.2-sol" => ["low", "medium", "high", "xhigh", "max"],
            "gpt-6-sol" or "gpt-6-luna" => ["none", "low", "medium", "high", "xhigh", "max"],
            _ => []
        };
    }

    //Model-specific effort levels documented by the providers; unknown models use defaults.
    //https://docs.x.ai/developers/model-capabilities/text/reasoning
    //https://ai.google.dev/gemini-api/docs/openai#thinking
    internal static string[] CompatibleReasoningOptions(string type, string model) {
        string name = MyRegex().Replace(model, String.Empty);
        return (type, name) switch {
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
        if (type == "openai") return OpenAiReasoningOptions(model);
        if (type is "xai" or "google") return CompatibleReasoningOptions(type, model);

        string address = type switch {
            "anthropic" => $"https://api.anthropic.com/v1/models/{Uri.EscapeDataString(model)}",
            "ollama" => $"{NormalizeEndpoint(endpoint ?? "http://localhost:11434") ?? throw new ArgumentException("Invalid Ollama server URL")}/api/show",
            _ => throw new ArgumentException("Unsupported agent provider", nameof(type))
        };

        using HttpRequestMessage request = new HttpRequestMessage(type == "ollama" ? HttpMethod.Post : HttpMethod.Get, address);

        if (!String.IsNullOrEmpty(key)) request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", key);

        if (type == "anthropic") {
            request.Headers.Add("anthropic-version", "2026-10-21");
        }
        else {
            request.Content = new StringContent(JsonSerializer.Serialize(new { model }), Encoding.UTF8, "application/json");
        }

        using HttpResponseMessage response = await client.SendAsync(request, token);
        response.EnsureSuccessStatusCode();

        using JsonDocument doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync(token));
        return ReadReasoningOptions(type, doc.RootElement);
    }

    internal static string[] ReadReasoningOptions(string type, JsonElement root) {
        if (root.ValueKind != JsonValueKind.Object) return [];

        if (type == "anthropic") {
            if (!root.TryGetProperty("capabilities", out JsonElement capabilities) || capabilities.ValueKind != JsonValueKind.Object ||
                !capabilities.TryGetProperty("effort", out JsonElement effort) || effort.ValueKind != JsonValueKind.Object ||
                !effort.TryGetProperty("supported", out JsonElement supported) || supported.ValueKind != JsonValueKind.True) return [];

            return new string[] { "low", "medium", "high", "xhigh", "max" }
                .Where(level => effort.TryGetProperty(level, out JsonElement capability) && capability.ValueKind == JsonValueKind.Object &&
                    capability.TryGetProperty("supported", out JsonElement enabled) && enabled.ValueKind == JsonValueKind.True).ToArray();
        }

        if (type == "ollama" && root.TryGetProperty("thinking", out JsonElement thinking) && thinking.ValueKind == JsonValueKind.Object &&
            thinking.TryGetProperty("values", out JsonElement values) && values.ValueKind == JsonValueKind.Array) {

            string[] options = values.EnumerateArray().Select(value => value.ValueKind switch {
                JsonValueKind.True => "true", JsonValueKind.False => "false", JsonValueKind.String => value.GetString(), _ => null
            }).Where(value => !String.IsNullOrWhiteSpace(value) && value.Length <= 64 && !value.Any(Char.IsControl)).Distinct().ToArray();

            return options.Length == 1 && options[0] == "false" ? [] : options;
        }

        return [];
    }
}

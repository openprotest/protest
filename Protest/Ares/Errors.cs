using System.Net;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Protest.Ares;

internal static partial class Core {
    private const int MAX_PROVIDER_ERROR_LENGTH = 4096;

    private static bool IsProviderError(JsonElement root) => root.TryGetProperty("error", out _) || GetString(root, "type") == "error";

    private static string ReadProviderError(string type, HttpStatusCode status, string body, string key) {
        try {
            using JsonDocument doc = JsonDocument.Parse(body);
            return ReadProviderError(type, status, doc.RootElement, key);
        }
        catch (JsonException) {
            //Proxy HTML and malformed bodies are not useful provider diagnostics.
            return FormatProviderError(type, status, null, null, null);
        }
    }

    private static string ReadProviderError(string type, HttpStatusCode? status, JsonElement root, string key) {
        string code = null;
        string errorType = null;
        string message = null;
        if (root.ValueKind == JsonValueKind.Object && root.TryGetProperty("error", out JsonElement error)) {
            if (error.ValueKind == JsonValueKind.Object) {
                code = GetString(error, "code");
                errorType = GetString(error, "type");
                message = GetString(error, "message");
            }
            else if (error.ValueKind == JsonValueKind.String) {
                message = error.GetString();
            }
        }

        if (message is null && root.ValueKind == JsonValueKind.Object && GetString(root, "type") == "error") {
            message = GetString(root, "message");
        }

        if (!String.IsNullOrEmpty(message)) {
            message = String.Concat(message.Where(character => !Char.IsControl(character) || character is '\n' or '\t')).Trim();
            if (!String.IsNullOrEmpty(key)) message = message.Replace(key, "[redacted]", StringComparison.Ordinal);
            message = ProviderCredentialPattern().Replace(message, "[redacted]");
            if (message.Length > MAX_PROVIDER_ERROR_LENGTH) {
                int length = Char.IsHighSurrogate(message[MAX_PROVIDER_ERROR_LENGTH - 1]) ? MAX_PROVIDER_ERROR_LENGTH - 1 : MAX_PROVIDER_ERROR_LENGTH;
                message = message[..length] + "…";
            }
        }

        return FormatProviderError(type, status, code, errorType, message);
    }

    private static string FormatProviderError(string type, HttpStatusCode? status, string code, string errorType, string message) {
        bool hasDetails = !String.IsNullOrEmpty(message);
        string summary = status is null ? $"{ProviderLabel(type)} stopped the response." :
            ProviderErrorSummary(type, status.Value, code, errorType, hasDetails);
        string detail = hasDetails ? $"{summary}\n{message}" : summary;
#if DEBUG
        LogProviderChatJson(JsonSerializer.Serialize(new { error = new { message = detail } }), true);
#endif
        return detail;
    }

    private static string ProviderErrorSummary(string type, HttpStatusCode status, string code, string errorType, bool hasDetails) {
        string provider = ProviderLabel(type);
        string summary = $"{provider} rejected the message (HTTP {(int)status}).";

        if (status == HttpStatusCode.TooManyRequests && type != "ollama") {
            if (code == "credit_balance_exhausted") return $"{provider} API credits are exhausted (HTTP 429). Check the API organization's billing and credit balance.";
            if (code == "organization_spend_limit_exceeded") return $"{provider} API organization spending limit reached (HTTP 429). Check the organization's spending limits.";
            if (code == "organization_usage_limit_exceeded") return $"{provider} API organization usage limit reached (HTTP 429). Check the organization's API Limits page.";

            if (code == "insufficient_quota" || errorType == "insufficient_quota") {
                return $"{provider} API quota is unavailable or exhausted (HTTP 429). Check API billing, credits, and spending limits for the organization/project that owns this key.";
            }

            if (code == "rate_limit_exceeded" || errorType == "rate_limit_error") {
                return $"{provider} API rate limit reached (HTTP 429). Wait briefly and try again, or check the project's rate limits.";
            }

            return hasDetails ? summary :
                $"{provider} returned HTTP 429. Check API billing, credits, and request limits; the response did not identify a specific cause.";
        }

        if (hasDetails) return summary;
        return type == "ollama" ? $"{summary} Check the selected model, server URL, and access settings." :
            $"{summary} Check the selected model, API key, quota, and rate limits.";
    }

    [GeneratedRegex(@"\b(?:sk-|xai-)[A-Za-z0-9_-]+|\bAIza[A-Za-z0-9_-]+|\b(?i:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+", RegexOptions.CultureInvariant)]
    private static partial Regex ProviderCredentialPattern();
}

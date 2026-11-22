#if DEBUG
using System.Text;
using System.Text.Json;

namespace Protest.Ares;

internal static partial class Core {
    private static void LogProviderChatJson(string json, bool incoming) {
        string contentColor = incoming ? "\u001b[38;2;122;212;43m" : "\u001b[38;2;255;128;0m";
        string mutedColor = incoming ? "\u001b[38;2;85;140;55m" : "\u001b[38;2;166;100;33m";
        string direction = incoming ? "->" : "<-";
        Console.WriteLine($"{mutedColor}{direction} {ColorProviderChatJson(json, contentColor, mutedColor)}\u001b[0m");
    }

    private static string ColorProviderChatJson(string json, string contentColor, string mutedColor) {
        byte[] bytes = Encoding.UTF8.GetBytes(json);
        Utf8JsonReader reader = new Utf8JsonReader(bytes);
        StringBuilder output = new StringBuilder();
        string property = null;
        int copied = 0;

        try {
            while (reader.Read()) {
                if (reader.TokenType == JsonTokenType.PropertyName) {
                    property = reader.GetString();
                    continue;
                }

                //Provider text can be a content string or an Anthropic-style text/thinking block.
                if (reader.TokenType == JsonTokenType.String && property is "content" or "text" or "thinking" or "reasoning" or "reasoning_content" or "refusal" or "message") {
                    int start = (int)reader.TokenStartIndex + 1;
                    int end = (int)reader.BytesConsumed - 1;
                    output.Append(Encoding.UTF8.GetString(bytes, copied, start - copied));
                    output.Append(contentColor);
                    output.Append(Encoding.UTF8.GetString(bytes, start, end - start));
                    output.Append(mutedColor);
                    copied = end;
                }
                property = null;
            }
        }
        catch (JsonException) {
            //Malformed responses and stream terminators remain visible without affecting parsing.
            return json;
        }
        output.Append(Encoding.UTF8.GetString(bytes, copied, bytes.Length - copied));
        return output.ToString();
    }
}
#endif

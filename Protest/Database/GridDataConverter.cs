using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Protest;

internal sealed class GridDataConverter : JsonConverter<Dictionary<string, ConcurrentDictionary<string, Database.Attribute>>> {

    private readonly string origin;
    public GridDataConverter(string origin) {
        this.origin = origin;
    }

    public override Dictionary<string, ConcurrentDictionary<string, Database.Attribute>> Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) {
        if (reader.TokenType != JsonTokenType.StartObject) {
            throw new JsonException("Expected the start of an object.");
        }

        Dictionary<string, ConcurrentDictionary<string, Database.Attribute>> mods = new Dictionary<string, ConcurrentDictionary<string, Database.Attribute>>();

        while (reader.Read()) {
            if (reader.TokenType == JsonTokenType.EndObject) {
                break;
            }

            if (reader.TokenType != JsonTokenType.PropertyName) {
                throw new JsonException("Expected a property name.");
            }

            string file = reader.GetString();
            reader.Read(); // Move to the inner object's start

            ConcurrentDictionary<string, Database.Attribute> mod = new ConcurrentDictionary<string, Database.Attribute>();
            while (reader.Read()) {
                if (reader.TokenType == JsonTokenType.EndObject) {
                    break;
                }

                if (reader.TokenType != JsonTokenType.PropertyName) {
                    throw new JsonException("Expected a property name.");
                }

                string key = reader.GetString();
                reader.Read(); // Move to the attribute's value

                Database.Attribute attribute = new Database.Attribute {
                    value = reader.GetString(),
                    origin = origin,
                    date = DateTime.UtcNow.Ticks
                };

                mod[key] = attribute;
            }

            mods[file] = mod;
        }

        return mods;
    }

    public override void Write(Utf8JsonWriter writer, Dictionary<string, ConcurrentDictionary<string, Database.Attribute>> value, JsonSerializerOptions options) {
        writer.WriteStartObject();

        foreach (KeyValuePair<string, ConcurrentDictionary<string, Database.Attribute>> pair in value) {
            writer.WritePropertyName(pair.Key);

            writer.WriteStartObject();
            foreach (KeyValuePair<string, Database.Attribute> mod in pair.Value) {
                writer.WriteString(mod.Key, mod.Value.value);
            }
            writer.WriteEndObject();
        }

        writer.WriteEndObject();
    }
}
using System.Collections.Generic;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Protest;

public sealed class DatabaseJsonConverter : JsonConverter<Database> {
    private readonly string name;
    private readonly string location;
    private readonly AttributesJsonConverter converter;
    public DatabaseJsonConverter(string name, string location, bool ignorePasswords) {
        this.name = name;
        this.location = location;
        this.converter = new AttributesJsonConverter(ignorePasswords);
    }

    public override Database Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) {
        Database database = new Database(name, location);

        while (reader.Read()) {

            if (reader.TokenType == JsonTokenType.EndObject) {
                break;
            }

            if (reader.TokenType != JsonTokenType.PropertyName) {
                throw new JsonException("Expected property name");
            }

            string propertyName = reader.GetString();
            reader.Read(); //value

            if (propertyName == "version") {
                if (reader.TryGetInt32(out int version)) {
                    database.version = version;
                }
            }
            //else if (propertyName == "length") {}
            else if (propertyName == "data") {
                if (reader.TokenType == JsonTokenType.StartObject) {
                    while (reader.Read()) {
                        if (reader.TokenType == JsonTokenType.EndObject) {
                            break;
                        }

                        string entryKey = reader.GetString();
                        reader.Read();

                        Database.Entry entry = new Database.Entry {
                            filename = entryKey,
                            attributes = this.converter.Read(ref reader, typeof(Database.Attribute), options),
                            syncWrite = new object()
                        };

                        database.dictionary.TryAdd(entryKey, entry);
                    }
                }
            }
        }

        return database;
    }

    public override void Write(Utf8JsonWriter writer, Database value, JsonSerializerOptions options) {
        writer.WriteStartObject();

        writer.WriteNumber("version", value.version);
        writer.WriteNumber("length", value.dictionary.Values.Count);

        writer.WritePropertyName("data");
        writer.WriteStartObject();
        foreach (KeyValuePair<string, Database.Entry> pair in value.dictionary) {
            writer.WritePropertyName(pair.Key);
            this.converter.Write(writer, pair.Value.attributes, options);
        }
        writer.WriteEndObject();

        writer.WriteEndObject();
    }
}
﻿using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Protest;

internal sealed class AttributesJsonConverter : JsonConverter<ConcurrentDictionary<string, Database.Attribute>> {
    private readonly bool ignorePasswords = false;

    public AttributesJsonConverter(bool ignorePasswords) {
        this.ignorePasswords = ignorePasswords;
    }

    public override ConcurrentDictionary<string, Database.Attribute> Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) {
        ConcurrentDictionary<string, Database.Attribute> dictionary = new ConcurrentDictionary<string, Database.Attribute>();

        reader.Read(); //root object

        while (reader.TokenType != JsonTokenType.EndObject) {

            string key = reader.GetString();

            Database.Attribute attr = new Database.Attribute();

            bool removeValue = this.ignorePasswords && key.Contains("password");

            while (reader.TokenType != JsonTokenType.EndObject) {
                string propertyName = reader.GetString();

                reader.Read(); //start of attribute

                if (propertyName == "v") {
                    attr.value = removeValue ? String.Empty : reader.GetString();
                }
                else if (propertyName == "o") {
                    attr.origin = removeValue ? String.Empty : reader.GetString();
                }
                else if (propertyName == "d") {
                    try {
                        attr.date = removeValue ? 0 : reader.GetInt64();
                    }
                    catch { }
                }

                reader.Read(); //end obj
            }

            dictionary.TryAdd(key, attr);

            reader.Read(); //end of attribute
        }

        //reader.Read(); //end of root

        return dictionary;
    }

    public override void Write(Utf8JsonWriter writer, ConcurrentDictionary<string, Database.Attribute> value, JsonSerializerOptions options) {
        ReadOnlySpan<char> _v = stackalloc[] {'v'};
        ReadOnlySpan<char> _o = stackalloc[] {'o'};
        ReadOnlySpan<char> _d = stackalloc[] {'d'};

        writer.WriteStartObject();

        foreach (KeyValuePair<string, Database.Attribute> pair in value) {
            string key = pair.Key.ToLower();
            writer.WritePropertyName(key);

            writer.WriteStartObject();
            writer.WriteString(_v, key.Contains("password") && ignorePasswords ? String.Empty : pair.Value.value);
            writer.WriteString(_o, pair.Value.origin);
            writer.WriteNumber(_d, pair.Value.date);
            writer.WriteEndObject();
        }

        writer.WriteEndObject();
    }
}
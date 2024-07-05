using System.Text.Json;
using System.Text.Json.Serialization;

namespace Protest;

internal sealed class ContactsJsonConverter : JsonConverter<Database> {
    public override Database Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) {
        throw new NotImplementedException();
    }

    public override void Write(Utf8JsonWriter writer, Database value, JsonSerializerOptions options) {
        ReadOnlySpan<byte> _title = "title"u8;
        ReadOnlySpan<byte> _name = "name"u8;
        ReadOnlySpan<byte> _department = "department"u8;
        ReadOnlySpan<byte> _email = "email"u8;
        ReadOnlySpan<byte> _telephone = "telephone"u8;
        ReadOnlySpan<byte> _mobile = "mobile"u8;

        writer.WriteStartArray();

        foreach (Database.Entry entry in value.dictionary.Values) {
            entry.attributes.TryGetValue("type", out Database.Attribute type);
            if (type is not null) {
                if (String.Equals(type.value.ToLower(), "hidden")) continue;
                if (String.Equals(type.value.ToLower(), "credentials")) continue;
            }

            entry.attributes.TryGetValue("e-mail", out Database.Attribute email);
            entry.attributes.TryGetValue("telephone number", out Database.Attribute telephoneNumber);
            entry.attributes.TryGetValue("mobile number", out Database.Attribute mobileNumber);

            if (String.IsNullOrEmpty(email?.value)
                && String.IsNullOrEmpty(telephoneNumber?.value)
                && String.IsNullOrEmpty(mobileNumber?.value)) {
                continue;
            }

            entry.attributes.TryGetValue("title", out Database.Attribute title);
            entry.attributes.TryGetValue("department", out Database.Attribute department);
            entry.attributes.TryGetValue("first name", out Database.Attribute firstname);
            entry.attributes.TryGetValue("last name", out Database.Attribute lastname);

            string name = $"{firstname?.value} {lastname?.value}".Trim();

            writer.WriteStartObject();

            if (title?.value.Length > 0)      writer.WriteString(_title, title.value);
            if (name?.Length > 0)             writer.WriteString(_name, name);
            if (department?.value.Length > 0) writer.WriteString(_department, department.value);

            if (email?.value.Length > 0)           writer.WriteString(_email, email.value);
            if (telephoneNumber?.value.Length > 0) writer.WriteString(_telephone, telephoneNumber.value);
            if (mobileNumber?.value.Length > 0)    writer.WriteString(_mobile, mobileNumber.value);

            writer.WriteEndObject();
        }

        writer.WriteEndArray();
    }
}
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Text;
using System.Text.Json.Serialization;
using System.Text.Json;

namespace Protest.Tools;

internal static class DebitNotes {
    static private readonly object mutex = new object();

    static private readonly JsonSerializerOptions debitSerializerOptions;

    public record Device {
        public string description;
        public string model;
        public string serial;
        public int quantity;
    }

    public record Record {
        public long issuedDate;
        public long returnedDate;
        public string status;
        public string banner;
        public string template;
        public string firstname;
        public string lastname;
        public string title;
        public string department;
        public string issuer;
        public Device[] devices;
    }

    static DebitNotes() {
        debitSerializerOptions = new JsonSerializerOptions();
        debitSerializerOptions.Converters.Add(new DebitJsonConverter());
    }

    public static byte[] List(Dictionary<string, string> parameters) {
        string keywords = String.Empty;
        string strUpTo = String.Empty;
        string strShortTerm = String.Empty;
        string strLongTerm = String.Empty;
        string strReturned = String.Empty;
        
        if (parameters is not null) {
            parameters.TryGetValue("keywords", out keywords);
            parameters.TryGetValue("upto", out strUpTo);
            parameters.TryGetValue("short", out strShortTerm);
            parameters.TryGetValue("long", out strLongTerm);
            parameters.TryGetValue("returned", out strReturned);
        }

        if (!int.TryParse(strUpTo, out int upToYears)) upToYears = 4;
        bool shortTerm = strShortTerm == "true";
        bool longTerm = strLongTerm == "true";
        bool returned = strReturned == "true";

        long afterDate = DateTime.UtcNow.Ticks - upToYears * 315_360_000_000_000L;

        string[] keywordsArray = keywords?.Split(' ').Where(o=>o.Length > 0).ToArray() ?? Array.Empty<string>();

        List<FileInfo> files = new List<FileInfo>();

        if (shortTerm) {
            DirectoryInfo dirShort = new DirectoryInfo(Data.DIR_DEBIT_SHORT);
            if (dirShort.Exists) files.AddRange(dirShort.GetFiles());
        }

        if (longTerm) {
            DirectoryInfo dirLong = new DirectoryInfo(Data.DIR_DEBIT_LONG);
            if (dirLong.Exists) files.AddRange(dirLong.GetFiles());
        }

        if (returned) {
            DirectoryInfo dirReturned = new DirectoryInfo(Data.DIR_DEBIT_RETURNED);
            if (dirReturned.Exists) files.AddRange(dirReturned.GetFiles());
        }

        files.Sort((a, b) => String.Compare(a.Name, b.Name));

        StringBuilder builder = new StringBuilder();
        builder.Append('[');

        bool first = true;
        lock (mutex) {
            for (int i = 0; i < files.Count; i++) {
                string data = File.ReadAllText(files[i].FullName);
                if (String.IsNullOrEmpty(data)) continue;

                Record record;
                try {
                    record = JsonSerializer.Deserialize<Record>(data, debitSerializerOptions);
                }
                catch {
                    continue;
                }

                if (record.issuedDate < afterDate) continue;

                bool match = true;
                if (keywordsArray.Length > 0) {
                    for (int j = 0; j < keywordsArray.Length; j++) {
                        bool found = false;

                        if (record.firstname.Contains(keywordsArray[j], StringComparison.OrdinalIgnoreCase)) {
                            found = true;
                        }
                        else if (record.lastname.Contains(keywordsArray[j], StringComparison.OrdinalIgnoreCase)) {
                            found = true;
                        }
                        else if (record.title.Contains(keywordsArray[j], StringComparison.OrdinalIgnoreCase)) {
                            found = true;
                        }
                        else if (record.department.Contains(keywordsArray[j], StringComparison.OrdinalIgnoreCase)) {
                            found = true;
                        }
                        else if (record.issuer.Contains(keywordsArray[j], StringComparison.OrdinalIgnoreCase)) {
                            found = true;
                        }
                        else if (files[i].Name.Contains(keywordsArray[j], StringComparison.OrdinalIgnoreCase)) {
                            found = true;
                        }
                        else {
                            for (int k=0; k< record.devices.Length; k++) {
                                if (record.devices[k].description.Contains(keywordsArray[j], StringComparison.OrdinalIgnoreCase)) {
                                    found = true;
                                }
                                else if (record.devices[k].model.Contains(keywordsArray[j], StringComparison.OrdinalIgnoreCase)) {
                                    found = true;
                                }
                                else if (record.devices[k].serial.Contains(keywordsArray[j], StringComparison.OrdinalIgnoreCase)) {
                                    found = true;
                                }

                                if (found) break;
                            }
                        }

                        if (!found) {
                            match = false;
                            break;
                        }
                    }
                }
                if (!match) continue;

                if (files[i].FullName.StartsWith(Data.DIR_DEBIT_SHORT)) {
                    record.status = "short";
                }
                else if (files[i].FullName.StartsWith(Data.DATETIME_FORMAT_LONG)) {
                    record.status = "long";
                }
                else if (files[i].FullName.StartsWith(Data.DIR_DEBIT_RETURNED)) {
                    record.status = "returned";
                }

                if (!first) builder.Append(',');

                builder.Append('{');
                builder.Append($"\"file\":\"{files[i].Name}\",");
                builder.Append($"\"status\":\"{record.status}\",");
                builder.Append($"\"name\":\"{Data.EscapeJsonText($"{record.firstname} {record.lastname}".Trim() )}\"");
                builder.Append('}');

                first = false;
            }
        }

        builder.Append(']');

        return Encoding.UTF8.GetBytes(builder.ToString());
    }

    public static byte[] View(Dictionary<string, string> parameters) {
        string file = null;
        string status = null;
        parameters?.TryGetValue("status", out status);
        parameters?.TryGetValue("file", out file);
        if (String.IsNullOrEmpty(file)) return Data.CODE_INVALID_ARGUMENT.Array;

        string filename = status switch  {
            "short"    => $"{Data.DIR_DEBIT_SHORT}{Data.DELIMITER}{file}",
            "long"     => $"{Data.DIR_DEBIT_LONG}{Data.DELIMITER}{file}",
            "returned" => $"{Data.DIR_DEBIT_RETURNED}{Data.DELIMITER}{file}",
            _ => null
        };

        if (filename is null ) return Data.CODE_FILE_NOT_FOUND.Array;

        try {
            byte[] data = File.ReadAllBytes(filename);
            return data;
        }
        catch {
            return Data.CODE_FAILED.Array;
        }
    }

    public static byte[] Create(HttpListenerContext ctx, string origin) {
        StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding);
        string payload = reader.ReadToEnd();
        return Create(payload, origin);
    }

    public static byte[] Create(string payload, string origin) {
        Record record;
        try {
            record = JsonSerializer.Deserialize<Record>(payload, debitSerializerOptions);
        }
        catch {
            return Data.CODE_FAILED.Array;
        }

        string name = $"D-{Database.GenerateFilename()}";

        try {
            DirectoryInfo dir = new DirectoryInfo(Data.DIR_DEBIT);
            if (!dir.Exists) dir.Create();

            lock (mutex) {
                if (record.status == "short") {
                    DirectoryInfo dirShort = new DirectoryInfo(Data.DIR_DEBIT_SHORT);
                    if (!dirShort.Exists) dirShort.Create();
                    File.WriteAllText($"{dirShort}{Data.DELIMITER}{name}", payload, Encoding.UTF8);
                }
                else if (record.status == "long") {
                    DirectoryInfo dirLong = new DirectoryInfo(Data.DIR_DEBIT_LONG);
                    if (!dirLong.Exists) dirLong.Create();
                    File.WriteAllText($"{dirLong}{Data.DELIMITER}{name}", payload, Encoding.UTF8);
                }
                else if (record.status == "returned") {
                    DirectoryInfo dirReturned = new DirectoryInfo(Data.DIR_DEBIT_RETURNED);
                    if (!dirReturned.Exists) dirReturned.Create();

                    record.status = "returned";
                    record.returnedDate = DateTime.UtcNow.Ticks;

                    byte[] json = JsonSerializer.SerializeToUtf8Bytes(record, debitSerializerOptions);
                    File.WriteAllBytes($"{dirReturned}{Data.DELIMITER}{name}", json);
                }
                else {
                    return Data.CODE_INVALID_ARGUMENT.Array;
                }
            }

            Logger.Action(origin, $"Create a debit note: {name}");
        }
        catch (Exception ex) {
            Logger.Error(ex);
            return Data.CODE_FAILED.Array;
        }

        return Encoding.UTF8.GetBytes($"{{\"file\":\"{name}\"}}");
    }

    public static byte[] Delete(Dictionary<string, string> parameters, string origin) {
        string file = null;
        string status = null;
        parameters?.TryGetValue("status", out status);
        parameters?.TryGetValue("file", out file);
        if (String.IsNullOrEmpty(file)) return Data.CODE_INVALID_ARGUMENT.Array;

        string filename = status switch  {
            "short" => $"{Data.DIR_DEBIT_SHORT}{Data.DELIMITER}{file}",
            "long"  => $"{Data.DIR_DEBIT_LONG}{Data.DELIMITER}{file}",
            _       => null
        };

        if (filename is null) return Data.CODE_FILE_NOT_FOUND.Array;

        try {
            File.Delete(filename);
            Logger.Action(origin, $"Delete debit note: {file}");
            return Data.CODE_OK.Array;
        }
        catch {
            return Data.CODE_FAILED.Array;
        }
    }

    public static byte[] Return(Dictionary<string, string> parameters, string origin) {
        string file = null;
        string status = null;
        parameters?.TryGetValue("status", out status);
        parameters?.TryGetValue("file", out file);
        if (String.IsNullOrEmpty(file)) return Data.CODE_INVALID_ARGUMENT.Array;

        string filename = status switch  {
            "short" => $"{Data.DIR_DEBIT_SHORT}{Data.DELIMITER}{file}",
            "long"  => $"{Data.DIR_DEBIT_LONG}{Data.DELIMITER}{file}",
            _       => null
        };

        if (filename is null) return Data.CODE_FILE_NOT_FOUND.Array;

        try {
            string data = File.ReadAllText(filename);

            Record record = JsonSerializer.Deserialize<Record>(data, debitSerializerOptions);
            record.status = "returned";
            record.returnedDate = DateTime.UtcNow.Ticks;

            byte[] json = JsonSerializer.SerializeToUtf8Bytes(record, debitSerializerOptions);
            File.WriteAllBytes($"{Data.DIR_DEBIT_RETURNED}{Data.DELIMITER}{file}", json);

            File.Delete(filename);

            Logger.Action(origin, $"Mark a debit note as returned: {file}");

            return Encoding.UTF8.GetBytes($"{{\"file\":\"{file}\"}}");
        }
        catch {
            return Data.CODE_FAILED.Array;
        }
    }

    public static byte[] ListTemplate() {
        DirectoryInfo dir = new DirectoryInfo(Data.DIR_DEBIT_TEMPLATE);

        StringBuilder builder = new StringBuilder();
        builder.Append('[');
        FileInfo[] files = dir.GetFiles();
        bool first = true;
        foreach (FileInfo f in files) {
            if (!first) builder.Append(',');
            try {
                string text = File.ReadAllText(f.FullName);
                builder.Append('{');
                builder.Append($"\"name\":\"{Data.EscapeJsonText(f.Name.EndsWith(".txt", StringComparison.InvariantCultureIgnoreCase) ? f.Name[..^f.Extension.Length] : f.Name)}\",");
                builder.Append($"\"content\":\"{Data.EscapeJsonTextWithUnicodeCharacters(text)}\"");
                builder.Append('}');
                first = false;
            }
            catch { }
        }
        
        builder.Append(']');

        return Encoding.UTF8.GetBytes(builder.ToString());
    }

    public static byte[] ListBanners() {
        DirectoryInfo dir = new DirectoryInfo($"{Configuration.front_path}{Data.DELIMITER}custom");
        if (!dir.Exists) return "[]"u8.ToArray();

        StringBuilder builder = new StringBuilder();
        builder.Append('[');
        FileInfo[] files = dir.GetFiles();
        bool first = true;
        foreach (FileInfo f in files) {
            if (!first) builder.Append(',');
            builder.Append($"\"{Data.EscapeJsonText(f.Name)}\"");
            first = false;
        }
        builder.Append(']');
        return Encoding.UTF8.GetBytes(builder.ToString());
    }
}

file sealed class DebitJsonConverter : JsonConverter<DebitNotes.Record> {
    public override DebitNotes.Record Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) {
        if (reader.TokenType != JsonTokenType.StartObject) {
            throw new JsonException();
        }

        DebitNotes.Record record = new DebitNotes.Record();

        while (reader.Read()) {
            if (reader.TokenType == JsonTokenType.EndObject) { //end of json
                break;
            }

            if (reader.TokenType != JsonTokenType.PropertyName) {
                continue;
            }

            string propertyName = reader.GetString();
            reader.Read();

            switch (propertyName) {
            case "date"      : record.issuedDate   = reader.GetInt64();  break;
            case "returned"  : record.returnedDate = reader.GetInt64();  break;
            case "status"    : record.status       = reader.GetString(); break;
            case "banner"    : record.banner       = reader.GetString(); break;
            case "template"  : record.template     = reader.GetString(); break;
            case "firstname" : record.firstname    = reader.GetString(); break;
            case "lastname"  : record.lastname     = reader.GetString(); break;
            case "title"     : record.title        = reader.GetString(); break;
            case "department": record.department   = reader.GetString(); break;
            case "issuer"    : record.issuer       = reader.GetString(); break;

            case "devices":
                if (reader.TokenType != JsonTokenType.StartArray) {
                    throw new JsonException();
                }

                List<DebitNotes.Device> devices = new List<DebitNotes.Device>();

                while (reader.Read()) {
                    if (reader.TokenType == JsonTokenType.EndArray) { //end of devices array
                        break;
                    }

                    if (reader.TokenType == JsonTokenType.StartObject) {
                        DebitNotes.Device device = new DebitNotes.Device();

                        while (reader.Read()) {
                            if (reader.TokenType == JsonTokenType.EndObject) { //end of device
                                devices.Add(device);
                                break;
                            }

                            if (reader.TokenType == JsonTokenType.PropertyName) {
                                string devicePropertyName = reader.GetString();
                                reader.Read();

                                switch (devicePropertyName) {
                                case "description" : device.description  = reader.GetString(); break;
                                case "model"       : device.model        = reader.GetString(); break;
                                case "serial"      : device.serial       = reader.GetString(); break;
                                case "quantity"    : device.quantity     = reader.GetInt32();  break;
                                default: break;
                                }
                            }
                        }
                    }
                }

                record.devices = devices.ToArray();
                break;

            default:
                break;
            }
        }

        return record;
    }

    public override void Write(Utf8JsonWriter writer, DebitNotes.Record value, JsonSerializerOptions options) {
        writer.WriteStartObject();

        writer.WriteNumber("date", value.issuedDate);
        writer.WriteString("status", value.status);
        writer.WriteString("banner", value.banner);
        writer.WriteString("template", value.template);
        writer.WriteString("firstname", value.firstname);
        writer.WriteString("lastname", value.lastname);
        writer.WriteString("title", value.title);
        writer.WriteString("department", value.department);
        writer.WriteString("issuer", value.issuer);

        if (value.returnedDate > 0) {
            writer.WriteNumber("returned", value.returnedDate);
        }

        writer.WritePropertyName("devices");
        writer.WriteStartArray();
        for (int i=0; i<value.devices.Length; i++) {
            writer.WriteStartObject();
            writer.WriteString("description", value.devices[i].description);
            writer.WriteString("model", value.devices[i].model);
            writer.WriteString("serial", value.devices[i].serial);
            writer.WriteNumber("quantity", value.devices[i].quantity);
            writer.WriteEndObject();
        }
        writer.WriteEndArray();

        writer.WriteEndObject();
    }
}
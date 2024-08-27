using System;
using System.Collections.Concurrent;
using System.Net;
using System.Net.Http;
using System.Collections.Generic;

using System.Text;
using System.Text.Json.Serialization;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Protest.Tools;

namespace Protest.Tasks;

internal class Import {
    public static byte[] ImportTask(Dictionary<string, string> parameters, string origin) {
        if (parameters is null) {
            return Data.CODE_INVALID_ARGUMENT.ToArray();
        }

        parameters.TryGetValue("ip",         out string ip);
        parameters.TryGetValue("port",       out string port);
        parameters.TryGetValue("protocol",   out string protocol);
        parameters.TryGetValue("username",   out string username);
        parameters.TryGetValue("password",   out string password);
        parameters.TryGetValue("devices",    out string importDevices);
        parameters.TryGetValue("users",      out string importUsers);
        parameters.TryGetValue("debitnotes", out string importDebitNotes);

        IPAddress ipAddress = IPAddress.Parse(ip);
        if (!IPAddress.IsLoopback(ipAddress)) {
            return "{\"error\":\"Please prefer to import data on the same host, via the loopback address, to avoid information exposure.\"}"u8.ToArray();
        }

        bool fetchDevices = importDevices?.Equals("true") ?? false;
        bool fetchUsers = importUsers?.Equals("true") ?? false;
        bool fetchDebitNotes = importDebitNotes?.Equals("true") ?? false;

        string sessionid = null;
        float version = 0f;

        Uri uri = new Uri($"{protocol}://{ip}:{port}");

        ServicePointManager.ServerCertificateValidationCallback = (message, cert, chain, errors) => { return true; };

        try {
            using HttpClient versionClient = new HttpClient();
            versionClient.BaseAddress = uri;
            versionClient.DefaultRequestHeaders.UserAgent.Add(new System.Net.Http.Headers.ProductInfoHeaderValue("pro-test", "5.0"));
            versionClient.DefaultRequestHeaders.Accept.Add(new System.Net.Http.Headers.MediaTypeWithQualityHeaderValue("*/*"));

            HttpResponseMessage versionResponse;
            try {
                versionResponse = versionClient.GetAsync("/version").GetAwaiter().GetResult(); //ver. 5

                if (versionResponse.StatusCode == HttpStatusCode.NotFound) {
                    version = 3.2f;
                }
                else {
                    string[] ver = versionResponse.Content.ReadAsStringAsync().GetAwaiter().GetResult()
                                   .Replace("{", string.Empty)
                                   .Replace("}", string.Empty)
                                   .Replace("\"", string.Empty)
                                   .Replace(" ", string.Empty)
                                   .Split(',');

                    string major = "0", minor = "0";
                    for (int i = 0; i < ver.Length; i++) {
                        if (ver[i].StartsWith("major:"))
                            major = ver[i][6..];
                        if (ver[i].StartsWith("minor:"))
                            minor = ver[i][6..];
                    }
                    version = float.Parse($"{major}.{minor}");
                }

                versionResponse.Headers.TryGetValues("Set-Cookie", out IEnumerable<string> cookies);

                if (cookies is not null) {
                    foreach (string cookie in cookies) {
                        string[] cookieSplit = cookie.Split(';');
                        for (int i = 0; i < cookieSplit.Length; i++) {
                            if (cookieSplit[i].StartsWith("sessionid=")) {
                                sessionid = cookieSplit[i][10..];
                                break;
                            }
                        }
                    }
                }

            }
            catch (HttpRequestException ex) {
                Logger.Error(ex);
                return Encoding.UTF8.GetBytes($"{{\"error\":\"{Data.EscapeJsonText(ex.Message)}\"}}");
            }
            catch (ArgumentNullException ex) {
                Logger.Error(ex);
                return Encoding.UTF8.GetBytes($"{{\"error\":\"{Data.EscapeJsonText(ex.Message)}\"}}");
            }
            catch (InvalidOperationException ex) {
                Logger.Error(ex);
                return Encoding.UTF8.GetBytes($"{{\"error\":\"{Data.EscapeJsonText(ex.Message)}\"}}");
            }
            catch (Exception ex) {
                Logger.Error(ex);
                return Encoding.UTF8.GetBytes($"{{\"error\":\"{Data.EscapeJsonText(ex.Message)}\"}}");
            }

        }
        catch (Exception ex) {
            return Encoding.UTF8.GetBytes($"{{\"error\":\"{Data.EscapeJsonText(ex.Message)}\"}}");
        }

        CookieContainer cookieContainer = new CookieContainer();
        if (sessionid is not null) {
            cookieContainer.Add(new Cookie() {
                Name = "sessionid",
                Value = sessionid,
                Domain = ip
            });
        }

        if (version < 4f || version > 6f) {
            Logger.Error("Remote host is running an unsupported version");
            return "{\"error\":\"Remote host is running an unsupported version\"}"u8.ToArray();
        }

        if (fetchDevices) {
            Logger.Action(origin, $"Importing devices from {ip}");
            if (version >= 4f && version < 5f) {
                ImportDevicesV4(uri, cookieContainer);
            }
            else if (version >= 5f && version < 6f) {
                ImportDevicesV5(uri, cookieContainer);
            }
        }

        if (fetchUsers) {
            Logger.Action(origin, $"Importing users from {ip}");
            if (version >= 4f && version < 5f) {
                ImportUsersV4(uri, cookieContainer);
            }
            else if (version >= 5f && version < 6f) {
                ImportUsersV5(uri, cookieContainer);
            }
        }

        if (fetchDebitNotes) {
            Logger.Action(origin, $"Importing users from {ip}");
            if (version >= 4f && version < 5f) {
                ImportDebitNotesV4(uri, cookieContainer);
            }
            else if (version >= 5f && version < 6f) {
                ImportDebitNotesV5(uri, cookieContainer);
            }
        }

        GC.Collect();

        return Data.CODE_OK.Array;
    }

    public static void ImportDevicesV4(Uri uri, CookieContainer cookieContainer) {
        using HttpClientHandler handler = new HttpClientHandler();
        handler.CookieContainer = cookieContainer;

        using HttpClient client = new HttpClient(handler);
        client.BaseAddress = uri;
        client.DefaultRequestHeaders.UserAgent.Add(new System.Net.Http.Headers.ProductInfoHeaderValue("pro-test", "5.0"));
        client.DefaultRequestHeaders.Accept.Add(new System.Net.Http.Headers.MediaTypeWithQualityHeaderValue("*/*"));

        Task<HttpResponseMessage> res = client.GetAsync("db/getequiptable");
        string payload = res.Result.Content.ReadAsStringAsync().GetAwaiter().GetResult();
        string[] split = payload.Split((char)127);

        long filenameCount = DateTime.UtcNow.Ticks;
        long initDate = DateTime.UtcNow.Ticks;

        int i = 1;
        while (i < split.Length) {
            if (int.TryParse(split[i], out int len)) {
                string filename = null;
                ConcurrentDictionary<string, Database.Attribute> attributes = new ConcurrentDictionary<string, Database.Attribute>();

                for (int j = i + 1; j < i + len * 4; j += 4) {
                    if (split[j] == ".FILENAME") {
                        filename = split[j + 1];
                        continue;
                    }

                    string name = split[j].ToLower();
                    string value = split[j + 1];
                    long date;
                    string origin;

                    string[] originSplit = split[j + 2].Split(",").Select(o => o.Trim()).ToArray();
                    if (originSplit.Length == 1) {
                        origin = originSplit[0];
                        date = initDate;
                    }
                    else if (originSplit.Length >= 2) {
                        origin = originSplit[0];
                        string[] dateSplit = originSplit[1].Split("-");
                        if (dateSplit.Length == 3) {
                            int year = int.Parse(dateSplit[2]);
                            int month = int.Parse(dateSplit[1]);
                            int day = int.Parse(dateSplit[0]);
                            date = new DateTime(year, month, day).Ticks;
                        }
                        else {
                            date = initDate;
                        }
                    }
                    else {
                        origin = "Import task";
                        date = initDate;
                    }

                    attributes.TryAdd(name, new Database.Attribute() {
                        value = value,
                        date = date,
                        origin = origin
                    });
                }

                foreach (KeyValuePair<string, Database.Attribute> attr in attributes) {
                    if (attr.Key.Contains("password") && filename is not null) {
                        string password = GetHiddenAttribute(uri, cookieContainer, $"db/getequiprop&file={filename}&property={attr.Key.ToUpper()}");
                        attributes[attr.Key].value = password;
                    }
                }

                DatabaseInstances.devices.Save((++filenameCount).ToString("x"), attributes, Database.SaveMethod.createnew, "Import task");
            }

            i += 1 + len * 4;
        }
    }

    public static void ImportUsersV4(Uri uri, CookieContainer cookieContainer) {
        using HttpClientHandler handler = new HttpClientHandler();
        handler.CookieContainer = cookieContainer;

        using HttpClient client = new HttpClient(handler);
        client.BaseAddress = uri;
        client.DefaultRequestHeaders.UserAgent.Add(new System.Net.Http.Headers.ProductInfoHeaderValue("pro-test", "5.0"));
        client.DefaultRequestHeaders.Accept.Add(new System.Net.Http.Headers.MediaTypeWithQualityHeaderValue("*/*"));

        Task<HttpResponseMessage> res = client.GetAsync("db/getuserstable");
        string payload = res.Result.Content.ReadAsStringAsync().GetAwaiter().GetResult();
        string[] split = payload.Split((char)127);

        long filenameCount = DateTime.UtcNow.Ticks;
        long initDate = DateTime.UtcNow.Ticks;

        int i = 1;
        while (i < split.Length) {
            if (int.TryParse(split[i], out int len)) {
                string filename = null;
                ConcurrentDictionary<string, Database.Attribute> attributes = new ConcurrentDictionary<string, Database.Attribute>();

                for (int j = i + 1; j < i + len * 4; j += 4) {
                    if (split[j] == ".FILENAME") {
                        filename = split[j + 1];
                        continue;
                    }

                    string name = split[j].ToLower();
                    string value = split[j + 1];
                    long date;
                    string origin;

                    string[] originSplit = split[j + 2].Split(",").Select(o => o.Trim()).ToArray();
                    if (originSplit.Length == 1) {
                        origin = originSplit[0];
                        date = initDate;
                    }
                    else if (originSplit.Length >= 2) {
                        origin = originSplit[0];
                        string[] dateSplit = originSplit[1].Split("-");
                        if (dateSplit.Length == 3) {
                            int year = int.Parse(dateSplit[2]);
                            int month = int.Parse(dateSplit[1]);
                            int day = int.Parse(dateSplit[0]);
                            date = new DateTime(year, month, day).Ticks;
                        }
                        else {
                            date = initDate;
                        }
                    }
                    else {
                        origin = "Import task";
                        date = initDate;
                    }

                    attributes.TryAdd(name, new Database.Attribute() {
                        value = value,
                        date = date,
                        origin = origin
                    });
                }

                foreach (KeyValuePair<string, Database.Attribute> attr in attributes) {
                    if (attr.Key.Contains("password") && filename is not null) {
                        string password = GetHiddenAttribute(uri, cookieContainer, $"db/getuserprop&file={filename}&property={attr.Key.ToUpper()}");
                        attributes[attr.Key].value = password;
                    }
                }

                DatabaseInstances.users.Save((++filenameCount).ToString("x"), attributes, Database.SaveMethod.createnew, "Import task");
            }

            i += 1 + len * 4;
        }
    }

    private static void ImportDebitNotesV4(Uri uri, CookieContainer cookieContainer) {
        using HttpClientHandler handler = new HttpClientHandler();
        handler.CookieContainer = cookieContainer;

        using HttpClient client = new HttpClient(handler);
        client.BaseAddress = uri;
        client.DefaultRequestHeaders.UserAgent.Add(new System.Net.Http.Headers.ProductInfoHeaderValue("pro-test", "5.0"));
        client.DefaultRequestHeaders.Accept.Add(new System.Net.Http.Headers.MediaTypeWithQualityHeaderValue("*/*"));

        Task<HttpResponseMessage> res = client.GetAsync($"debitnotes/get&keywords=&from=2000-01-01&to={DateTime.Now:yyyy-MM-dd}&filters=111");
        string payload = res.Result.Content.ReadAsStringAsync().GetAwaiter().GetResult();
        string[] split = payload.Split((char)127);

        for (int i = 0; i < split.Length - 9; i += 10) {
            string code       = split[i+0];
            string firstname  = split[i+1];
            string lastname   = split[i+2];
            string title      = split[i+3];
            string department = split[i+4];
            string date       = split[i+5];
            string it         = split[i+6];
            string template   = split[i+7];
            string equip      = split[i+8];
            string status     = split[i+9];

            Thread.Sleep(1);

            string[] dateSplit = date.Split('-');
            string[] equipSplit = equip.Split(';');

            StringBuilder builder = new StringBuilder();
            builder.Append('{');

            if (dateSplit.Length == 3) {
                builder.Append($"\"date\":{new DateTime(int.Parse(dateSplit[2]), int.Parse(dateSplit[1]), int.Parse(dateSplit[0])).Ticks.ToString()},");
            }
            else {
                builder.Append($"\"date\":{DateTime.UtcNow.Ticks},");
            }

            builder.Append($"\"status\":\"{status}\",");
            builder.Append($"\"template\":\"{Data.EscapeJsonText(template)}\",");
            builder.Append($"\"banner\":\"default.svg\",");
            builder.Append($"\"firstname\":\"{Data.EscapeJsonText(firstname)}\",");
            builder.Append($"\"lastname\":\"{Data.EscapeJsonText(lastname)}\",");
            builder.Append($"\"title\":\"{Data.EscapeJsonText(title)}\",");
            builder.Append($"\"department\":\"{Data.EscapeJsonText(department)}\",");
            builder.Append($"\"issuer\":\"{Data.EscapeJsonText(it)}\",");

            builder.Append($"\"devices\":[");
            bool first = true;
            for (int j = 0; j < equipSplit.Length - 2; j += 3) {
                if (!first)
                    builder.Append(',');
                builder.Append('{');
                builder.Append($"\"description\":\"{Data.EscapeJsonText(equipSplit[j])}\",");
                builder.Append($"\"model\":\"\",");
                builder.Append($"\"quantity\":{int.Parse(equipSplit[j + 1])},");
                builder.Append($"\"serial\":\"{Data.EscapeJsonText(equipSplit[j + 2])}\"");
                builder.Append('}');
                first = false;
            }
            builder.Append(']');


            builder.Append('}');

            DebitNotes.Create(builder.ToString(), "Import task");
        }
    }

    public static void ImportDevicesV5(Uri uri, CookieContainer cookieContainer) {
        using HttpClientHandler handler = new HttpClientHandler();
        handler.CookieContainer = cookieContainer;

        using HttpClient client = new HttpClient(handler);
        client.BaseAddress = uri;
        client.DefaultRequestHeaders.UserAgent.Add(new System.Net.Http.Headers.ProductInfoHeaderValue("pro-test", "5.0"));
        client.DefaultRequestHeaders.Accept.Add(new System.Net.Http.Headers.MediaTypeWithQualityHeaderValue("*/*"));

        Task<HttpResponseMessage> res = client.GetAsync("/db/device/list");
        byte[] bytes = res.Result.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult();

#pragma warning disable CA1869 // Cache and reuse
        JsonSerializerOptions options = new JsonSerializerOptions();
#pragma warning restore CA1869
        options.Converters.Add(new DatabaseJsonConverter("import", $"{Data.DIR_DEVICES}_import", false));

        try {
            Database import = JsonSerializer.Deserialize<Database>(bytes, options);
            foreach (Database.Entry entry in import.dictionary.Values) {
                DatabaseInstances.devices.Save(entry.filename, entry.attributes, Database.SaveMethod.createnew, "Import task");
            }
        }
        catch { }
    }

    public static void ImportUsersV5(Uri uri, CookieContainer cookieContainer) {
        using HttpClientHandler handler = new HttpClientHandler();
        handler.CookieContainer = cookieContainer;

        using HttpClient client = new HttpClient(handler);
        client.BaseAddress = uri;
        client.DefaultRequestHeaders.UserAgent.Add(new System.Net.Http.Headers.ProductInfoHeaderValue("pro-test", "5.0"));
        client.DefaultRequestHeaders.Accept.Add(new System.Net.Http.Headers.MediaTypeWithQualityHeaderValue("*/*"));

        Task<HttpResponseMessage> res = client.GetAsync("/db/user/list");
        byte[] bytes = res.Result.Content.ReadAsByteArrayAsync().Result;

#pragma warning disable CA1869 // Cache and reuse
        JsonSerializerOptions options = new JsonSerializerOptions();
#pragma warning restore CA1869
        options.Converters.Add(new DatabaseJsonConverter("import", $"{Data.DIR_USERS}_import", false));

        try {
            Database import = JsonSerializer.Deserialize<Database>(bytes, options);
            foreach (Database.Entry entry in import.dictionary.Values) {
                DatabaseInstances.users.Save(entry.filename, entry.attributes, Database.SaveMethod.createnew, "Import task");
            }
        }
        catch { }
    }

    private record DebitParseHelper {
        [JsonPropertyName("file")]
        public string File { get; set; }
        [JsonPropertyName("status")]
        public string Status { get; set; }
        [JsonPropertyName("name")]
        public string Name { get; set; }
    }
    private static void ImportDebitNotesV5(Uri uri, CookieContainer cookieContainer) {
        using HttpClientHandler handler = new HttpClientHandler();
        handler.CookieContainer = cookieContainer;

        using HttpClient client = new HttpClient(handler);
        client.BaseAddress = uri;
        client.DefaultRequestHeaders.UserAgent.Add(new System.Net.Http.Headers.ProductInfoHeaderValue("pro-test", "5.0"));
        client.DefaultRequestHeaders.Accept.Add(new System.Net.Http.Headers.MediaTypeWithQualityHeaderValue("*/*"));

        Task<HttpResponseMessage> listResponse = client.GetAsync($"debit/list?upto=all&short=true&long=true&returned=true");
        string listPayload = listResponse.Result.Content.ReadAsStringAsync().GetAwaiter().GetResult();

        try {
            DebitParseHelper[] records = JsonSerializer.Deserialize<DebitParseHelper[]>(listPayload);
            for (int i = 0; i < records.Length; i++) {
                Task<HttpResponseMessage> viewResponse = client.GetAsync($"debit/view?status={records[i].Status}&file={records[i].File}");
                string viewPayload = viewResponse.Result.Content.ReadAsStringAsync().GetAwaiter().GetResult();
                DebitNotes.Create(viewPayload, "Import task");
            }
        }
        catch { }
    }

    public static string GetHiddenAttribute(Uri uri, CookieContainer cookieContainer, string path) {
        using HttpClientHandler handler = new HttpClientHandler();
        handler.CookieContainer = cookieContainer;

        using HttpClient client = new HttpClient(handler);
        client.BaseAddress = uri;
        client.DefaultRequestHeaders.UserAgent.Add(new System.Net.Http.Headers.ProductInfoHeaderValue("pro-test", "4.0"));

        Task<HttpResponseMessage> res = client.GetAsync(path);
        string value = res.Result.Content.ReadAsStringAsync().GetAwaiter().GetResult();
        return value;
    }
}

using System.IO;
using System.Net;
using System.Text;
using System.Text.Json.Serialization;
using System.Text.Json;
using System.Net.Http;

namespace Protest.Tools;

internal static class LocateIp {

    static private readonly JsonSerializerOptions locationDerializerOptions;
    static private readonly JsonSerializerOptions locationDerializerOptionsOnlyLocation;

    static LocateIp() {
        locationDerializerOptions = new JsonSerializerOptions();
        locationDerializerOptionsOnlyLocation = new JsonSerializerOptions();

        locationDerializerOptions.Converters.Add(new IP2LApiJsonConverter(false));
        locationDerializerOptionsOnlyLocation.Converters.Add(new IP2LApiJsonConverter(true));
    }

    public static byte[] Locate(HttpListenerContext ctx) {
        string payload;
        using (StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding))
            payload = reader.ReadToEnd();

        if (String.IsNullOrEmpty(payload)) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        return Locate(payload, false);
    }
    public static byte[] Locate(string ip, bool onlyLocation = false) {
        string[] split = ip.Split('.');
        if (split.Length != 4) { //if not an ip, do a dns resolve
            IPAddress[] dnsResponse = Protocols.Dns.NativeDnsLookup(ip);
            if (dnsResponse is null) return null;
            split = dnsResponse.Select(x => x.ToString()).ToArray();
            split = dnsResponse.Length > 0 ? dnsResponse[0].ToString().Split(".") : null;
        }

        if (split.Length != 4) {
            return null;
        }

        try {
            byte msb = byte.Parse(split[0]); //most significant bit
            uint target = BitConverter.ToUInt32(new byte[] {
                byte.Parse(split[3]),
                byte.Parse(split[2]),
                byte.Parse(split[1]),
                msb
            }, 0);

            FileInfo file = new FileInfo($"{Data.DIR_IP_LOCATION}\\{split[0]}.bin");

            if (!file.Exists) {
                return LocateViaOnlineApi(String.Join(".", split), onlyLocation);
            }

            FileStream stream = new FileStream(file.FullName, FileMode.Open, FileAccess.Read);

            uint dictionaryStart = BitConverter.ToUInt32(new byte[] {
                (byte)stream.ReadByte(),
                (byte)stream.ReadByte(),
                (byte)stream.ReadByte(),
                (byte)stream.ReadByte()
            }, 0);

            uint from, to;
            uint pivot;
            uint low = 4;
            uint high = dictionaryStart;

            do { //binary search
                pivot = (low + high) / 2;
                pivot = 4 + pivot - pivot % 26;
                stream.Position = pivot;

                from = BitConverter.ToUInt32(new byte[] {
                    0,
                    (byte)stream.ReadByte(),
                    (byte)stream.ReadByte(),
                    msb,
                }, 0);

                to = BitConverter.ToUInt32(new byte[] {
                    255,
                    (byte)stream.ReadByte(),
                    (byte)stream.ReadByte(),
                    msb,
                }, 0);

                if (target >= from && target <= to) break; //found

                if (target < from && target < to) high = pivot;
                if (target > from && target > to) low = pivot;
            } while (high - low >= 26);

            if (target >= from && target <= to) { //### found ###
                string fl = Encoding.UTF8.GetString(new byte[] { (byte)stream.ReadByte(), (byte)stream.ReadByte() });

                byte[] bytes = new byte[4];

                for (sbyte i = 0; i < 4; i++) bytes[i] = (byte)stream.ReadByte();
                uint ptr1 = BitConverter.ToUInt32(bytes, 0);

                for (sbyte i = 0; i < 4; i++) bytes[i] = (byte)stream.ReadByte();
                uint ptr2 = BitConverter.ToUInt32(bytes, 0);

                for (sbyte i = 0; i < 4; i++) bytes[i] = (byte)stream.ReadByte();
                uint ptr3 = BitConverter.ToUInt32(bytes, 0);

                for (sbyte i = 0; i < 4; i++) bytes[i] = (byte)stream.ReadByte();
                Single lon = BitConverter.ToSingle(bytes, 0);

                for (sbyte i = 0; i < 4; i++) bytes[i] = (byte)stream.ReadByte();
                Single lat = BitConverter.ToSingle(bytes, 0);

                stream.Position = (long)(dictionaryStart + ptr1);
                string s1 = String.Empty;
                while (true) {
                    int b = stream.ReadByte();
                    if (b == 0) break;
                    s1 += (char)b;
                }

                stream.Position = (long)(dictionaryStart + ptr2);
                string s2 = String.Empty;
                while (true) {
                    int b = stream.ReadByte();
                    if (b == 0) break;
                    s2 += (char)b;
                }

                stream.Position = (long)(dictionaryStart + ptr3);
                string s3 = String.Empty;
                while (true) {
                    int b = stream.ReadByte();
                    if (b == 0) break;
                    s3 += (char)b;
                }

                stream.Close();

                if (onlyLocation) {
                    return Encoding.UTF8.GetBytes(
                        fl + ";" +
                        s1 + ";" +
                        s2 + ";" +
                        s3 + ";" +
                        lon + "," + lat
                    );
                }
                else {
                    bool isTor = IsTor(String.Join(".", split));
                    bool isProxy = !isTor && IsProxy(String.Join(".", split));

                    return Encoding.UTF8.GetBytes(
                        fl + ";" +
                        s1 + ";" +
                        s2 + ";" +
                        s3 + ";" +
                        lon + "," + lat + ";" +
                        isProxy.ToString().ToLower() + ";" +
                        isTor.ToString().ToLower()
                    );
                }


            } //### end found ###
            stream.Close();
        }
        catch {}

        return LocateViaOnlineApi(String.Join(".", split), onlyLocation);
    }

    public static byte[] LocateViaOnlineApi(string ip, bool onlyLocation = false) {
        try {
            string url = $"https://api.ip2location.io/?key={Configuration.IP2LOCATION_API_KEY}&ip={ip}";
            using HttpClient client = new HttpClient();
            client.DefaultRequestHeaders.Add("Accept", "application/dns-json");

            HttpResponseMessage responseMessage = client.GetAsync(url).Result;
            responseMessage.EnsureSuccessStatusCode();

            string data = responseMessage.Content.ReadAsStringAsync().Result;
            string access = JsonSerializer.Deserialize<string>(data, onlyLocation ? locationDerializerOptionsOnlyLocation : locationDerializerOptions) ;
            return Encoding.UTF8.GetBytes(access);
        }
        catch (JsonException) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }
        catch {
            return "not found"u8.ToArray();
        }
    }

    public static bool IsProxy(in IPAddress ip) {
        return IsProxy(ip.ToString());
    }
    public static bool IsProxy(in string ip) {
        string[] split = ip.Split('.');
        if (split.Length != 4) { //if not an ip, do a dns resolve

            IPAddress[] response = Protocols.Dns.NativeDnsLookup(ip);
            if (response is null) return false;
            split = response.Select(x => x.ToString()).ToArray();
        }

        if (split.Length != 4) return false;

        try {
            byte msb = byte.Parse(split[0]); //most significant bit
            uint target = BitConverter.ToUInt32(new byte[] {
                    byte.Parse(split[3]),
                    byte.Parse(split[2]),
                    byte.Parse(split[1]),
                    msb
                }, 0);

            FileInfo file = new FileInfo($"{Data.DIR_PROXY}\\{split[0]}.bin");
            if (!file.Exists) return false;

            using FileStream stream = new FileStream(file.FullName, FileMode.Open, FileAccess.Read);

            uint from, to;
            uint pivot;
            uint low = 4;
            uint high = (uint)file.Length - 1;

            do { //binary search
                pivot = (low + high) / 2;
                pivot -= pivot % 6;
                stream.Position = pivot;

                from = BitConverter.ToUInt32(new byte[] {
                    (byte)stream.ReadByte(),
                    (byte)stream.ReadByte(),
                    (byte)stream.ReadByte(),
                    msb,
                }, 0);

                to = BitConverter.ToUInt32(new byte[] {
                    (byte)stream.ReadByte(),
                    (byte)stream.ReadByte(),
                    (byte)stream.ReadByte(),
                    msb,
                }, 0);

                if (target >= from && target <= to) break; //found

                if (target < from && target < to) high = pivot;
                if (target > from && target > to) low = pivot;
            } while (high - low > 6);

            if (target >= from && target <= to) { //### found ###
                stream.Close();
                return true;
            }

        }
        catch {
            return false;
        }

        return false;
    }

    public static bool IsTor(in IPAddress ip) {
        return IsTor(ip.ToString());
    }
    public static bool IsTor(in string ip) {
        string[] split = ip.Split('.');
        if (split.Length != 4) { //if not an ip, do a dns resolve

            IPAddress[] response = Protocols.Dns.NativeDnsLookup(ip);
            if (response is null) return false;
            split = response.Select(x => x.ToString()).ToArray();
        }

        if (split.Length != 4) return false;

        try {
            uint target = BitConverter.ToUInt32(new byte[] {
                    byte.Parse(split[3]),
                    byte.Parse(split[2]),
                    byte.Parse(split[1]),
                    byte.Parse(split[0]),
                }, 0);

            FileInfo file = new FileInfo(Data.FILE_TOR);
            if (!file.Exists) return false;

            using FileStream stream = new FileStream(file.FullName, FileMode.Open, FileAccess.Read);

            uint pivot;
            uint low = 4;
            uint high = (uint)file.Length - 1;
            uint current;

            do { //binary search
                pivot = (low + high) / 2;
                pivot -= pivot % 4;
                stream.Position = pivot;

                current = BitConverter.ToUInt32(new byte[] {
                    (byte)stream.ReadByte(),
                    (byte)stream.ReadByte(),
                    (byte)stream.ReadByte(),
                    (byte)stream.ReadByte()
                }, 0);

                if (target == current) break; //found

                if (target < current) high = pivot;
                if (target > current) low = pivot;
            } while (high - low > 7);

            if (target == current) { //### found ###
                stream.Close();
                return true;
            }

        }
        catch {
            return false;
        }

        return false;
    }
}

file sealed class IP2LApiJsonConverter : JsonConverter<string> {
    private readonly bool onlyLocation;
    public IP2LApiJsonConverter(bool onlyLocation) {
        this.onlyLocation = onlyLocation;
    }

    public override string Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) {
        string countryCode = String.Empty;
        string countryName = String.Empty;
        string regionName = String.Empty;
        string cityName = String.Empty;
        double latitude = 0, longitude = 0;
        bool isProxy = false;

        while (reader.Read()) {
            if (reader.TokenType == JsonTokenType.EndObject)
                break;

            if (reader.TokenType == JsonTokenType.PropertyName) {
                string propertyName = reader.GetString();
                reader.Read();

                if (propertyName == "ip") {
                    reader.Skip();
                }
                else if (propertyName == "country_code") {
                    countryCode = reader.GetString();
                }
                else if (propertyName == "country_name") {
                    countryName = reader.GetString();
                }
                else if (propertyName == "region_name") {
                    regionName = reader.GetString();
                }
                else if (propertyName == "city_name") {
                    cityName = reader.GetString();
                }
                else if (propertyName == "latitude") {
                    latitude = reader.GetDouble();
                }
                else if (propertyName == "longitude") {
                    longitude = reader.GetDouble();
                }
                else if (propertyName == "is_proxy") {
                    isProxy = reader.GetBoolean();
                }
                else {
                    reader.Skip();
                }
            }
        }

        StringBuilder builder = new StringBuilder();
        
        builder.Append(countryCode);
        builder.Append(';');
        builder.Append(countryName);
        builder.Append(';');
        builder.Append(regionName);
        builder.Append(';');
        builder.Append(cityName);
        builder.Append(';');

        builder.Append(latitude);
        builder.Append(',');
        builder.Append(longitude);

        if (!onlyLocation) {
            builder.Append(';');
            builder.Append(isProxy);
            builder.Append(";false");
        }

        return builder.ToString();
    }

    public override void Write(Utf8JsonWriter writer, string value, JsonSerializerOptions options) {
        throw new JsonException();
    }
}
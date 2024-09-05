using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Threading.Tasks;
using System.IO;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Xml;
using System.Xml.Serialization;

namespace Protest.Protocols;

internal class Ssdp {
    private const int DEFAULT_TIMEOUT = 2000;
    private static readonly IPAddress SSDP_MULTICAST_ADDRESS_V4 = IPAddress.Parse("239.255.255.250");
    private static readonly IPAddress SSDP_MULTICAST_ADDRESS_V6 = IPAddress.Parse("ff02::c");
    private static readonly int SSDP_PORT = 1900;

    public static readonly byte[] ALL_SERVICES_QUERY =
        "M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: \"ssdp:discover\"\r\nMX: 1\r\nST: ssdp:all\r\n\r\n"u8.ToArray();

    public record JsonDevice {
        public string name = null;
        public string type = null;
        public string hostname = null;
        public string manufacturer = null;
        public string formFactor = null;
        public string uHeight = null;
        public string model = null;
        public string serialNumber = null;
        public string mac = null;
        public string location = null;

        public bool ipv4Enabled = default;
        public string[] ipv4Address = null;
        public JsonProtocol[] ipv4Protocols = null;

        public bool ipv6Enabled = default;
        public string[] ipv6Address = null;
        public JsonProtocol[] ipv6Protocols = null;
    }

    public record JsonProtocol {
        public string protocol { get; set; }
        public int port { get; set; }
        public bool enabled { get; set; }
    }

    private static readonly HttpClient httpClient;
    private static readonly JsonSerializerOptions deviceJsonSerializerOptions;

    static Ssdp() {
        deviceJsonSerializerOptions = new JsonSerializerOptions();
        deviceJsonSerializerOptions.Converters.Add(new DeviceJsonConverter());

        HttpClientHandler clientHandler = new HttpClientHandler() {
            ServerCertificateCustomValidationCallback = (sender, cert, chain, sslPolicyErrors) => { return true; }
        };

        httpClient = new HttpClient(clientHandler) {
            Timeout = TimeSpan.FromSeconds(1)
        };
    }

    public static void Discover() {
        SendRequest(ALL_SERVICES_QUERY, DEFAULT_TIMEOUT);
    }

    private static void SendRequest(byte[] requestBytes, int timeout) {
        List<IPAddress> localAddresses = new List<IPAddress>();
        foreach (NetworkInterface netInterface in System.Net.NetworkInformation.NetworkInterface.GetAllNetworkInterfaces()) {
            foreach (UnicastIPAddressInformation unicastAddress in netInterface.GetIPProperties().UnicastAddresses) {
                if (unicastAddress.Address.AddressFamily == AddressFamily.InterNetwork ||
                    unicastAddress.Address.AddressFamily == AddressFamily.InterNetworkV6) {
                    localAddresses.Add(unicastAddress.Address);
                }
            }
        }

        foreach (IPAddress localAddress in localAddresses) {
            using Socket socket = CreateAndBindSocket(localAddress, out IPEndPoint remoteEndPoint, timeout);
            if (socket == null) continue;

            socket.SendTo(requestBytes, remoteEndPoint);

            byte[] buffer = new byte[1024];
            socket.ReceiveTimeout = timeout;

            try {
                while (true) {
                    int receivedLength = socket.Receive(buffer);
                    ParseHttpResponse(buffer, 0, receivedLength);
                }
            }
            catch (SocketException) {}
        }
    }

    private static Socket CreateAndBindSocket(IPAddress localAddress, out IPEndPoint remoteEndPoint, int timeout) {
        Socket socket = null;
        remoteEndPoint = null;

        try {
            if (localAddress.AddressFamily == AddressFamily.InterNetwork) {
                socket = new Socket(AddressFamily.InterNetwork, SocketType.Dgram, ProtocolType.Udp);
                socket.SetSocketOption(SocketOptionLevel.IP, SocketOptionName.AddMembership, new MulticastOption(SSDP_MULTICAST_ADDRESS_V4, localAddress));
                remoteEndPoint = new IPEndPoint(SSDP_MULTICAST_ADDRESS_V4, SSDP_PORT);
            }
            else if (localAddress.AddressFamily == AddressFamily.InterNetworkV6) {
                socket = new Socket(AddressFamily.InterNetworkV6, SocketType.Dgram, ProtocolType.Udp);
                socket.SetSocketOption(SocketOptionLevel.IPv6, SocketOptionName.AddMembership, new IPv6MulticastOption(SSDP_MULTICAST_ADDRESS_V6));
                remoteEndPoint = new IPEndPoint(SSDP_MULTICAST_ADDRESS_V6, SSDP_PORT);
            }
            else {
                return null;
            }

            socket.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.ReuseAddress, true);
            socket.Bind(new IPEndPoint(localAddress, 0));
            socket.ReceiveTimeout = timeout;

            return socket;
        }
        catch (SocketException) {
            socket?.Dispose();
            return null;
        }
    }

    private static void ParseHttpResponse(byte[] buffer, int index, int count) {
        string response = Encoding.UTF8.GetString(buffer, 0, count);
        string[] split = response.Split("\r\n", StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        for (int i = 0; i < split.Length; i++) {
            if (!split[i].StartsWith("LOCATION:", StringComparison.OrdinalIgnoreCase)) {
                continue;
            }

            string url = split[i][9..].Trim();

            SendHttpRequest(url).GetAwaiter().GetResult();

            //Task.Run(()=> SendHttpRequest(url)).Wait();
        }
    }

    private static async Task<bool> SendHttpRequest(string url) {
        HttpResponseMessage response = await httpClient.GetAsync(url);
        if (response.StatusCode != HttpStatusCode.OK) {
            return false;
        }

        string httpContent = await response.Content.ReadAsStringAsync();

        if (url.EndsWith(".json", StringComparison.OrdinalIgnoreCase)) {
            JsonDevice[] device = ParseJsonResponse(httpContent);
        }
        else if (url.EndsWith(".xml", StringComparison.OrdinalIgnoreCase)) {
            DeviceXmlParser.XmlRoot device =  DeviceXmlParser.ParseResponse(httpContent);
        }

        return true;
    }

    private static JsonDevice[] ParseJsonResponse(string httpContent) {
        JsonDevice[] response = JsonSerializer.Deserialize<JsonDevice[]>(httpContent, deviceJsonSerializerOptions);
        return response;
    }

}

file sealed class DeviceJsonConverter : JsonConverter<Ssdp.JsonDevice> {
    public override Ssdp.JsonDevice Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) {
        Ssdp.JsonDevice device = new Ssdp.JsonDevice();

        if (reader.TokenType != JsonTokenType.StartObject) {
            throw new JsonException("Expected start of object");
        }

        while (reader.Read()) {
            if (reader.TokenType == JsonTokenType.EndObject) {
                break;
            }

            if (reader.TokenType == JsonTokenType.PropertyName) {
                string propertyName = reader.GetString().Replace("-","").Replace("_","").ToLower();

                reader.Read();

                switch (propertyName) {
                case "name":
                    device.name = reader.GetString();
                    break;

                case "type":
                    device.type = reader.GetString();
                    break;

                case "hostname":
                    device.hostname = reader.GetString();
                    break;

                case "manufacturer":
                    device.manufacturer = reader.GetString();
                    break;

                case "form-factor":
                case "enclosure-form-factor":
                    device.formFactor = reader.GetString();
                    break;

                case "uheight":
                    device.uHeight = reader.GetString();
                    break;

                case "model":
                case "enclosuremachinetypemodel":
                    device.model = reader.GetString();
                    break;

                case "serialnumber":
                case "enclosureserialnumber":
                    device.serialNumber = reader.GetString();
                    break;

                case "macaddress":
                    device.mac = reader.GetString();
                    break;

                case "location":
                    device.location = reader.GetString();
                    break;

                case "ipv4enabled":
                    device.ipv4Enabled = reader.GetBoolean();
                    break;

                case "ipv4address":
                    device.ipv4Address = JsonSerializer.Deserialize<string[]>(ref reader, options);
                    break;

                case "ipv4protocols":
                    device.ipv4Protocols = JsonSerializer.Deserialize<Ssdp.JsonProtocol[]>(ref reader, options);
                    break;

                case "ipv6enabled":
                    device.ipv6Enabled= reader.GetBoolean();
                    break;

                case "ipv6address":
                    device.ipv6Address = JsonSerializer.Deserialize<string[]>(ref reader, options);
                    break;

                case "ipv6protocols":
                    device.ipv6Protocols = JsonSerializer.Deserialize<Ssdp.JsonProtocol[]>(ref reader, options);
                    break;

                default:
                    reader.Skip();
                    break;
                }
            }
        }

        return device;
    }

    public override void Write(Utf8JsonWriter writer, Ssdp.JsonDevice value, JsonSerializerOptions options) {
        //not used
        throw new NotImplementedException();
    }
}

public static class DeviceXmlParser {
    public static XmlRoot ParseResponse(string xmlContent) {
        XmlReaderSettings settings = new XmlReaderSettings {
            IgnoreWhitespace = true,
            DtdProcessing = DtdProcessing.Ignore
        };

        try {
            using StringReader stringReader = new StringReader(xmlContent);

            using XmlReader xmlReader = XmlReader.Create(stringReader, settings);
            xmlReader.MoveToContent();

            XmlSerializer serializer;
            string namespaceUri = xmlReader.NamespaceURI;
            if (string.IsNullOrEmpty(namespaceUri)) {
                serializer = new XmlSerializer(typeof(XmlRoot));
            }
            else {
                serializer = new XmlSerializer(typeof(XmlRoot), namespaceUri);
            }

            XmlRoot root = (XmlRoot)serializer.Deserialize(xmlReader);
            return root;
        }
        catch {
            return null;
        }
    }

    [XmlRoot("root")]
    public class XmlRoot {
        public XmlRoot() { }

        [XmlElement("specVersion")]
        public SpecVersion SpecVersion { get; set; }

        [XmlElement("device")]
        public Device Device { get; set; }
    }

    public class SpecVersion {
        public SpecVersion() { }

        [XmlElement("major")]
        public int Major { get; set; }

        [XmlElement("minor")]
        public int Minor { get; set; }
    }

    public class Device {
        public Device() { }

        [XmlElement("deviceType")]
        public string DeviceType { get; set; }

        [XmlElement("friendlyName")]
        public string FriendlyName { get; set; }

        [XmlElement("manufacturer")]
        public string Manufacturer { get; set; }

        [XmlElement("manufacturerURL")]
        public string ManufacturerURL { get; set; }

        [XmlElement("modelDescription")]
        public string ModelDescription { get; set; }

        [XmlElement("modelName")]
        public string ModelName { get; set; }

        [XmlElement("modelNumber")]
        public string ModelNumber { get; set; }

        [XmlElement("modelURL")]
        public string ModelURL { get; set; }

        [XmlElement("modelType")]
        public string ModelType { get; set; }

        [XmlElement("serialNumber")]
        public string SerialNumber { get; set; }

        [XmlElement("UDN")]
        public string UDN { get; set; }

        [XmlElement("serviceList")]
        public ServiceList ServiceList { get; set; }

        [XmlElement("presentationURL")]
        public string PresentationURL { get; set; }
    }

    public class ServiceList {
        public ServiceList() { }

        [XmlElement("service")]
        public Service[] Services { get; set; }
    }

    public class Service {
        public Service() { }

        [XmlElement("URLBase")]
        public string URLBase { get; set; }

        [XmlElement("serviceType")]
        public string ServiceType { get; set; }

        [XmlElement("serviceId")]
        public string ServiceId { get; set; }

        [XmlElement("SCPDURL")]
        public string SCPDURL { get; set; }

        [XmlElement("controlURL")]
        public string ControlURL { get; set; }

        [XmlElement("eventSubURL")]
        public string EventSubURL { get; set; }
    }

}

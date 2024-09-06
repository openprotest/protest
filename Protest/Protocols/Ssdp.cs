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
using System.Threading;

namespace Protest.Protocols;

internal class Ssdp {
    private const int DEFAULT_TIMEOUT = 2000;
    private static readonly IPAddress SSDP_MULTICAST_ADDRESS_V4 = IPAddress.Parse("239.255.255.250");
    private static readonly IPAddress SSDP_MULTICAST_ADDRESS_V6 = IPAddress.Parse("ff02::c");
    private static readonly int SSDP_PORT = 1900;

    public static readonly byte[] ALL_SERVICES_QUERY =
        "M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: \"ssdp:discover\"\r\nMX: 1\r\nST: ssdp:all\r\n\r\n"u8.ToArray();

    public record SsdpDevice {
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
        public SsdpService[] ipv4Protocols = null;

        public bool ipv6Enabled = default;
        public string[] ipv6Address = null;
        public SsdpService[] ipv6Protocols = null;
    }

    public record SsdpService {
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
            Timeout = TimeSpan.FromMilliseconds(1500)
        };
    }

    public static SsdpDevice[] Discover(NetworkInterface nic, int timeout, CancellationToken token) {
        IPAddress[] nics = IpTools.GetIpAddresses();

        List<SsdpDevice> devices = new List<SsdpDevice>();

        foreach (IPAddress localAddress in nics) {
            if (token.IsCancellationRequested) {
                break;
            }

            using Socket socket = CreateAndBindSocket(localAddress, timeout, out IPEndPoint remoteEndPoint);
            if (socket == null) continue;

            socket.SendTo(ALL_SERVICES_QUERY, remoteEndPoint);

            byte[] buffer = new byte[1024];
            socket.ReceiveTimeout = timeout;

            try {
                while (true) {
                    int receivedLength;
                    IPAddress remoteIP;
                    if (localAddress.AddressFamily == AddressFamily.InterNetwork) {
                        EndPoint remoteEP = new IPEndPoint(IPAddress.Any, 0);
                        receivedLength = socket.ReceiveFrom(buffer, ref remoteEP);

                        remoteIP = ((IPEndPoint)remoteEP).Address;
                    }
                    else {
                        receivedLength = socket.Receive(buffer);
                        remoteIP = null;
                    }

                    List<SsdpDevice> list = ParseSsdpResponse(buffer, 0, receivedLength, remoteIP, token);
                    if (list is not null && list.Count > 0) {
                        devices.AddRange(list);
                    }
                }
            }
            catch (SocketException) { }
        }

        return devices.ToArray();
    }

    public static Socket CreateAndBindSocket(IPAddress localAddress, int timeout, out IPEndPoint remoteEndPoint) {
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

    private static List<SsdpDevice> ParseSsdpResponse(byte[] buffer, int index, int count, IPAddress remoteIp, CancellationToken token) {
        string response = Encoding.UTF8.GetString(buffer, 0, count);
        string[] split = response.Split("\r\n", StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        List<SsdpDevice> devices = new List<SsdpDevice>();

        for (int i = 0; i < split.Length; i++) {
            if (token.IsCancellationRequested) {
                break;
            }

            if (!split[i].StartsWith("LOCATION:", StringComparison.OrdinalIgnoreCase)) {
                continue;
            }

            string url = split[i][9..].Trim();
            string remoteIpString;

            if (remoteIp is not null) {
                remoteIpString = remoteIp.ToString();
            }
            else if (url.Contains('[')) {
                int start = url.IndexOf('[') + 1;
                int stop = url.IndexOf(']');
                remoteIpString = url[start..stop];
            }
            else {
                int start = url.IndexOf("://") + 3;
                int stop = Math.Min(url.IndexOf('/', start), url.IndexOf(':', start));
                remoteIpString = url[start..stop];
            }

            SsdpDevice[] list = SendHttpRequest(url, remoteIpString);

            if (list is not null && list.Length > 0) {
                devices.AddRange(list);
            }
        }

        return devices;
    }

    private static SsdpDevice[] SendHttpRequest(string url, string remoteIpString) {
        string httpContent;
        try {
            HttpResponseMessage response = httpClient.GetAsync(url).GetAwaiter().GetResult();
            if (response.StatusCode != HttpStatusCode.OK) {
                return null;
            }

            httpContent = response.Content.ReadAsStringAsync().GetAwaiter().GetResult();
        }
        catch {
            return null;
        }

        if (url.EndsWith(".json", StringComparison.OrdinalIgnoreCase)) {
            SsdpDevice[] device = ParseJsonResponse(httpContent);
            return device;
        }
        else if (url.EndsWith(".xml", StringComparison.OrdinalIgnoreCase)) {
            DeviceXmlParser.XmlRoot root = DeviceXmlParser.ParseResponse(httpContent);

            if (root is null) {
                return null;
            }

            SsdpDevice device = new SsdpDevice() {
                name         = root.Device.FriendlyName,
                type         = root.Device.DeviceType,
                hostname     = null,
                manufacturer = root.Device.Manufacturer,
                formFactor   = null,
                uHeight      = null,
                model        = root.Device.ModelName,
                serialNumber = root.Device.SerialNumber,
                mac          = null,
                location     = null,

                ipv4Enabled   = !String.IsNullOrEmpty(remoteIpString),
                ipv4Address   = new string[] { remoteIpString },
                ipv4Protocols = null,

                ipv6Enabled   = default,
                ipv6Address   = null,
                ipv6Protocols = null,
            };

            return new SsdpDevice[] { device };
        }

        return null;
    }

    private static SsdpDevice[] ParseJsonResponse(string httpContent) {
        SsdpDevice[] response = JsonSerializer.Deserialize<SsdpDevice[]>(httpContent, deviceJsonSerializerOptions);
        return response;
    }

}

file sealed class DeviceJsonConverter : JsonConverter<Ssdp.SsdpDevice> {
    public override Ssdp.SsdpDevice Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) {
        Ssdp.SsdpDevice device = new Ssdp.SsdpDevice();

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

                case "ipv6enabled":
                    device.ipv6Enabled = reader.GetBoolean();
                    break;

                case "ipv6address":
                    device.ipv6Address = JsonSerializer.Deserialize<string[]>(ref reader, options);
                    break;

                case "ipv4protocols":
                    device.ipv4Protocols = JsonSerializer.Deserialize<Ssdp.SsdpService[]>(ref reader, options);
                    break;

                case "ipv6protocols":
                    device.ipv6Protocols = JsonSerializer.Deserialize<Ssdp.SsdpService[]>(ref reader, options);
                    break;

                default:
                    reader.Skip();
                    break;
                }
            }
        }

        return device;
    }

    public override void Write(Utf8JsonWriter writer, Ssdp.SsdpDevice value, JsonSerializerOptions options) {
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

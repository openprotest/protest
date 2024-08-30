using System.Collections.Concurrent;
using System.Collections.Frozen;
using System.Collections.Generic;
using System.Diagnostics.CodeAnalysis;
using System.IO;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;
using Protest.Http;
using Protest.Protocols;

using static Protest.Protocols.Dns;
using static Protest.Protocols.Mdns;

namespace Protest.Tools;

internal static class IpDiscovery {

    private readonly static FrozenDictionary<ushort, string> PORTS_TO_PROTOCOL = new Dictionary<ushort, string>() {
        { 22,   "SSH" },
        { 23,   "Telnet" },
        { 53,   "DNS" },
        { 67,   "DHCP" },
        { 80,   "HTTP" },
        { 443,  "HTTPS" },
        { 445,  "SMB" },
        { 8080, "Alt-HTTP" },
        { 8443, "Alt-HTTPS" },
        { 9100, "Print service" },

    }.ToFrozenDictionary();

    internal struct HostEntry {
        internal string description;
        internal string name;
        internal string ip;
        internal string ipv6;
        internal string mac;
        internal string manufacturer;
        internal string services;
    }

    private static readonly JsonSerializerOptions hostSerializerOptions;

    static IpDiscovery() {
        hostSerializerOptions = new JsonSerializerOptions();
        hostSerializerOptions.Converters.Add(new HostJsonConverter());
    }

    public static byte[] ListNics() {
        List<string[]> filtered = new List<string[]>();

        NetworkInterface[] nics = NetworkInterface.GetAllNetworkInterfaces();
        foreach (NetworkInterface nic in nics) {
            UnicastIPAddressInformationCollection unicast = nic.GetIPProperties().UnicastAddresses;
            GatewayIPAddressInformationCollection gateway = nic.GetIPProperties().GatewayAddresses;

            if (unicast.Count == 0) continue;

            IPAddress localIpV4 = null;
            IPAddress subnetMask = null;

            foreach (UnicastIPAddressInformation address in unicast) {
                if (address.Address.AddressFamily == AddressFamily.InterNetwork) {
                    localIpV4 = address.Address;
                    subnetMask = address.IPv4Mask;
                }
            }

            if (localIpV4 is null || IPAddress.IsLoopback(localIpV4)) {
                continue;
            }

            filtered.Add( new string[] { nic.Id, nic.Name, IpTools.SubnetMaskToCidr(subnetMask).ToString(), localIpV4.ToString()});
        }

        return JsonSerializer.SerializeToUtf8Bytes(filtered.Select(o=>new {
            id   = o[0],
            name = o[1],
            cidr = o[2],
            ip   = o[3],
        }));
    }

    public static NetworkInterface GetNic(string id) {
        NetworkInterface[] nics = NetworkInterface.GetAllNetworkInterfaces().Where(o=>o.Id == id).ToArray();
        if (nics.Length > 0) { return nics[0]; }
        return null;
    }

    private static void WsWriteText(WebSocket ws, [StringSyntax(StringSyntaxAttribute.Json)] string text, object mutex) {
        lock (mutex) {
            WsWriteText(ws, Encoding.UTF8.GetBytes(text), mutex);
        }
    }
    private static void WsWriteText(WebSocket ws, byte[] bytes, object mutex) {
        lock (mutex) {
            ws.SendAsync(new ArraySegment<byte>(bytes, 0, bytes.Length), WebSocketMessageType.Text, true, CancellationToken.None);
        }
    }

    public static async void WebSocketHandler(HttpListenerContext ctx) {
        WebSocket ws;
        try {
            WebSocketContext wsc = await ctx.AcceptWebSocketAsync(null);
            ws = wsc.WebSocket;
        }
        catch (WebSocketException ex) {
            ctx.Response.Close();
            Logger.Error(ex);
            return;
        }

        if (!Auth.IsAuthenticatedAndAuthorized(ctx, ctx.Request.Url.AbsolutePath)) {
            await ws.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, null, CancellationToken.None);
            return;
        }

        object mutex = new object();
        using CancellationTokenSource tokenSource = new CancellationTokenSource();

        NetworkInterface nic = null;

        try {
            byte[] buff = new byte[256];
            WebSocketReceiveResult receiveResult = await ws.ReceiveAsync(new ArraySegment<byte>(buff), CancellationToken.None);
            string id = Encoding.Default.GetString(buff, 0, receiveResult.Count);
            nic = GetNic(id);
        }
        catch { }

        if (nic is null) {
            await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, null, CancellationToken.None);
            return;
        }

        ConcurrentDictionary<string, HostEntry> dic = new ConcurrentDictionary<string, HostEntry>();

        try {
            await Task.Delay(50);

            while (ws.State == WebSocketState.Open) {
                if (!Auth.IsAuthenticatedAndAuthorized(ctx, ctx.Request.Url.AbsolutePath)) {
                    ctx.Response.Close();
                    break;
                }

                DiscoverAdapter(dic, nic, ws, mutex, tokenSource.Token);
                DiscoverMdns(dic, nic, ws, mutex, tokenSource.Token);
                //DiscoverIcmp(dic, nic, ws, mutex, tokenSource.Token);

                await Task.Delay(30000);
            }
        }
        catch { }
        finally {
            if (ws?.State == WebSocketState.Open) {
                try {
                    await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, null, CancellationToken.None);
                }
                catch { }
            }
        }
    }

    private static void DiscoverAdapter(ConcurrentDictionary<string, HostEntry> dic, NetworkInterface nic, WebSocket ws, object mutex, CancellationToken token) {
        UnicastIPAddressInformationCollection unicast = nic.GetIPProperties().UnicastAddresses;
        GatewayIPAddressInformationCollection gateway = nic.GetIPProperties().GatewayAddresses;

        if (unicast.Count == 0) return;

        IPAddress localIpV4 = null, localIpV6 = null;
        foreach (UnicastIPAddressInformation address in unicast) {
            if (address.Address.AddressFamily == AddressFamily.InterNetwork) {
                localIpV4 = address.Address;
            }
            else if (address.Address.AddressFamily == AddressFamily.InterNetworkV6) {
                localIpV6 = address.Address;
            }
        }

        if (localIpV4 is not null || localIpV6 is not null) {
            string ipv4String = localIpV4.ToString();

            string hostname = NetBios.GetBiosName(ipv4String, 200);
            string mac = String.Join(":", nic.GetPhysicalAddress().GetAddressBytes().Select(b => b.ToString("X2")));

            HostEntry host = new HostEntry() {
                description  = String.Empty,
                name         = hostname,
                ip           = localIpV4?.ToString() ?? String.Empty,
                ipv6         = localIpV6?.ToString() ?? String.Empty,
                mac          = mac,
                manufacturer = MacLookup.LookupToString(mac),
                services     = String.Empty,
            };

            dic.AddOrUpdate(ipv4String, host, (key, value) => value);

            WsWriteText(ws, JsonSerializer.Serialize<HostEntry>(host, hostSerializerOptions), mutex);
        }

        IPAddress gwIpV4 = null, gwIpV6 = null;
        foreach (GatewayIPAddressInformation address in gateway) {
            if (address.Address.AddressFamily == AddressFamily.InterNetwork) {
                gwIpV4 = address.Address;
            }
            else if (address.Address.AddressFamily == AddressFamily.InterNetworkV6) {
                gwIpV6 = address.Address;
            }
        }

        if (gwIpV4 is not null || gwIpV6 is not null) {
            string ipv4String = gwIpV4.ToString();

            string hostname = NetBios.GetBiosName(ipv4String, 200);
            string mac = Arp.ArpRequest(ipv4String);

            HostEntry gwHost = new HostEntry() {
                description  = String.Empty,
                name         = hostname,
                ip           = gwIpV4?.ToString() ?? String.Empty,
                ipv6         = gwIpV6?.ToString() ?? String.Empty,
                mac          = mac,
                manufacturer = MacLookup.LookupToString(mac),
                services     = String.Empty,
            };

            dic.AddOrUpdate(ipv4String, gwHost, (key, value) => value);

            WsWriteText(ws, JsonSerializer.Serialize<HostEntry>(gwHost, hostSerializerOptions), mutex);
        }
    }

    private static void DiscoverIcmp(ConcurrentDictionary<string, HostEntry> dic, NetworkInterface nic, WebSocket ws, object mutex, CancellationToken token) {
        List<IPAddress> hosts = new List<IPAddress>();

        UnicastIPAddressInformationCollection addresses = nic.GetIPProperties().UnicastAddresses;
        if (addresses.Count == 0) return;

        foreach (UnicastIPAddressInformation address in addresses) {
            IPAddress networkAddress   = IpTools.GetNetworkAddress(address.Address, address.IPv4Mask);
            IPAddress broadcastAddress = IpTools.GetBroadcastAddress(address.Address, address.IPv4Mask);

            if (networkAddress.AddressFamily == AddressFamily.InterNetworkV6 ||
                networkAddress.IsApipa() ||
                IPAddress.IsLoopback(networkAddress)) {
                continue;
            }

            byte[] networkBytes = networkAddress.GetAddressBytes();
            byte[] broadcastBytes = broadcastAddress.GetAddressBytes();

            if (networkBytes.All(o => o == 0) || networkBytes.All(o => o == 255)) {
                continue;
            }

            uint start = BitConverter.ToUInt32(networkBytes.Reverse().ToArray(), 0);
            uint end = BitConverter.ToUInt32(broadcastBytes.Reverse().ToArray(), 0);

            for (uint i = start + 1; i < end; i++) {
                byte[] ipBytes = BitConverter.GetBytes(i).Reverse().ToArray();
                hosts.Add(new IPAddress(ipBytes));
            }
        }

        Task<bool[]> task = PingArrayAsync(hosts, 500);
        task.Wait();

        for (int i = 0; i < task.Result.Length; i++) {
            if (!task.Result[i]) continue;
            string ipString = hosts[i].ToString();
            string mac = Arp.ArpRequest(ipString);

            WsWriteText(ws, JsonSerializer.Serialize(new {
                description  = String.Empty,
                name         = String.Empty,
                ip           = ipString,
                ipv6         = String.Empty,
                mac          = mac,
                manufacturer = MacLookup.LookupToString(mac),
                services     = String.Empty,
            }), mutex);
        }
    }

    private static async Task<bool[]> PingArrayAsync(List<IPAddress> host, int timeout) {
        List<Task<bool>> tasks = new List<Task<bool>>();
        for (int i = 0; i < host.Count; i++) tasks.Add(PingAsync(host[i], timeout));
        bool[] result = await Task.WhenAll(tasks);
        return result;
    }
    private static async Task<bool> PingAsync(IPAddress host, int timeout) {
        using Ping p = new Ping();

        try {
            PingReply reply = await p.SendPingAsync(host, timeout, Icmp.ICMP_PAYLOAD);
            if (reply.Status == IPStatus.Success) {
                return true;
            }

            //retry:
            reply = await p.SendPingAsync(host, timeout*2, Icmp.ICMP_PAYLOAD);
            return reply.Status == IPStatus.Success;
        }
        catch (ArgumentException) {
            return false;
        }
        catch (PingException) {
            return false;
        }
        catch (Exception) {
            return false;
        }
    }

    private static void DiscoverMdns(ConcurrentDictionary<string, HostEntry> dic, NetworkInterface nic, WebSocket ws, object mutex, CancellationToken token) {
        MdnsMulticast(dic, nic, ws, mutex, token, ANY_QUERY, Protocols.Dns.RecordType.ANY, 1000);
        MdnsMulticast(dic, nic, ws, mutex, token, HTTP_QUERY, Protocols.Dns.RecordType.ANY, 1000);
    }

    private static void MdnsMulticast(ConcurrentDictionary<string, HostEntry> dic, NetworkInterface nic, WebSocket ws, object mutex, CancellationToken token, string queryString, RecordType type, int timeout) {
        UnicastIPAddressInformationCollection addresses = nic.GetIPProperties().UnicastAddresses;
        if (addresses.Count == 0) return;

        byte[] request = ConstructQuery(queryString, type);

        foreach (UnicastIPAddressInformation address in addresses) {
            if (IPAddress.IsLoopback(address.Address)) continue;

            using Socket socket = CreateAndBindSocket(address.Address, timeout, out IPEndPoint remoteEndPoint);
            if (socket == null) continue;

            try {
                socket.SendTo(request, remoteEndPoint);

                DateTime endTime = DateTime.Now.AddMilliseconds(timeout);
                while (DateTime.Now <= endTime) {
                    if (token.IsCancellationRequested) break;
                    MdnsResponse(ws, mutex, type, socket);
                }
            }
            catch { }
        }
    }

    private static void MdnsResponse(WebSocket ws, object mutex, RecordType type, Socket socket) {
        byte[] reply = new byte[1024];

        try {
            EndPoint remoteEP = new IPEndPoint(IPAddress.Any, 0);
            int length = socket.ReceiveFrom(reply, ref remoteEP);
            if (length == 0) return;

            new Thread(() => {
                byte[] actualReply = new byte[length];
                Array.Copy(reply, actualReply, length);

                string hostname = string.Empty;
                IPAddress ipAddress = ((IPEndPoint)remoteEP).Address;
                string ipString = ipAddress.ToString();
                string ipv6 = String.Empty;
                string macAddress = Protocols.Arp.ArpRequest(ipString);
                StringBuilder services = new StringBuilder();

                Answer[] answer = ParseAnswers(actualReply, type, ipAddress, out _, out _, out _, true);
                for (int j = 0; j < answer.Length; j++) {
                    if (answer[j].type == RecordType.AAAA) {
                        ipv6 = answer[j].answerString;
                    }
                    else if (answer[j].type == RecordType.SRV) {
                        string[] split = answer[j].answerString.Split(':');
                        if (split.Length >= 2) {
                            hostname = split[0].EndsWith(".local") ? hostname = split[0][..^6] : hostname = split[0];

                            if (ushort.TryParse(split[1], out ushort port)) {
                                if (services.Length > 0) services.Append(',');
                                services.Append(PORTS_TO_PROTOCOL[port] ?? split[1]);
                            }
                        }
                    }
                    else if (answer[j].type == RecordType.PTR) {
                        if (answer[j].answerString.EndsWith("_ssh._tcp.local")) {
                            if (services.Length > 0) services.Append(',');
                            services.Append("SSH");
                        }
                        else if (answer[j].answerString.EndsWith("_http._tcp.local")) {
                            if (services.Length > 0) services.Append(',');
                            services.Append("HTTP");
                        }
                        else if (answer[j].answerString.EndsWith("_https._tcp.local")) {
                            if (services.Length > 0) services.Append(',');
                            services.Append("HTTP");
                        }
                        else if (answer[j].answerString.EndsWith("_udisks-ssh._tcp.local")) {
                            if (services.Length > 0) services.Append(',');
                            services.Append("U-DISK");
                        }
                        else if (answer[j].answerString.EndsWith("_smb._tcp.local")) {
                            if (services.Length > 0) services.Append(',');
                            services.Append("SMB");
                        }
                        else if (answer[j].answerString.EndsWith("_sftp-ssh._tcp.local")) {
                            if (services.Length > 0) services.Append(',');
                            services.Append("SFTP");
                        }
                        else if (answer[j].answerString.EndsWith("_http-alt._tcp.local")) {
                            if (services.Length > 0) services.Append(',');
                            services.Append("Alt-HTTP");
                        }
                        else if (answer[j].answerString.EndsWith("_printer._tcp.local")
                            || answer[j].answerString.EndsWith("_ipp._tcp.local")
                            || answer[j].answerString.EndsWith("_ipps._tcp.local")
                            || answer[j].answerString.EndsWith("_print-caps._tcp.local")) {
                            if (services.Length > 0) services.Append(',');
                            services.Append("Print service");
                        }
                        else if (answer[j].answerString.EndsWith("_scanner._tcp.local")
                            || answer[j].answerString.EndsWith("_uscan._tcp.local")
                            || answer[j].answerString.EndsWith("_uscans._tcp.local")) {
                            if (services.Length > 0) services.Append(',');
                            services.Append("Scan service");
                        }
                    }
                }

                WsWriteText(ws, JsonSerializer.Serialize(new {
                    name         = hostname,
                    ip           = ipString,
                    ipv6         = ipv6,
                    mac          = macAddress,
                    manufacturer = MacLookup.LookupToString(macAddress),
                    services     = services.ToString(),
                }), mutex);

            }).Start();
        }
        catch { }
    }
}

file sealed class HostJsonConverter : JsonConverter<IpDiscovery.HostEntry> {
    public override IpDiscovery.HostEntry Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) {
        throw new NotImplementedException();
    }

    public override void Write(Utf8JsonWriter writer, IpDiscovery.HostEntry value, JsonSerializerOptions options) {
        ReadOnlySpan<byte> _name = "name"u8;
        ReadOnlySpan<byte> _ip = "ip"u8;
        ReadOnlySpan<byte> _ipv6 = "ipv6"u8;
        ReadOnlySpan<byte> _mac = "mac"u8;
        ReadOnlySpan<byte> _manufacturer = "manufacturer"u8;
        ReadOnlySpan<byte> _services = "services"u8;

        writer.WriteStartObject();
        writer.WriteString(_name,         value.name);
        writer.WriteString(_ip,           value.ip);
        writer.WriteString(_ipv6,         value.ipv6);
        writer.WriteString(_mac,          value.mac);
        writer.WriteString(_manufacturer, value.manufacturer);
        writer.WriteString(_services,     value.services);
        writer.WriteEndObject();
    }
}
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics.CodeAnalysis;
using System.Diagnostics.Metrics;
using System.IO;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Protest.Http;
using Protest.Protocols;
using static Protest.Protocols.Dns;
using static Protest.Protocols.Mdns;

namespace Protest.Tools;

internal static class IpDiscovery {

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

        Thread[] threads = new Thread[] {
            new Thread(()=> DiscoverAdapter(nic, ws, mutex, tokenSource.Token)),
            new Thread(()=> DiscoverIcmp(nic, ws, mutex, tokenSource.Token)),
            new Thread(()=> DiscoverMdns(nic, ws, mutex, tokenSource.Token)),
        };

        try {
            for (int i = 0; i < threads.Length; i++) {
                threads[i].Start();
            }

            await Task.Delay(50);

            while (ws.State == WebSocketState.Open) {
                if (!Auth.IsAuthenticatedAndAuthorized(ctx, ctx.Request.Url.AbsolutePath)) {
                    ctx.Response.Close();
                    break;
                }

                if (threads.All(o=> !o.IsAlive)) {
                    break;
                }

                //keep socket connection open

                await Task.Delay(2000);
            }

            if (threads.Any(o=>o.IsAlive)) {
                tokenSource.Cancel();
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

    private static void DiscoverAdapter(NetworkInterface nic, WebSocket ws, object mutex, CancellationToken token) {
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

            WsWriteText(ws, JsonSerializer.Serialize(new {
                description  = String.Empty,
                name         = hostname,
                ip           = localIpV4?.ToString() ?? String.Empty,
                ipv6         = localIpV6?.ToString() ?? String.Empty,
                mac          = mac,
                manufacturer = MacLookup.LookupToString(mac),
                services     = String.Empty,
            }), mutex);
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

            WsWriteText(ws, JsonSerializer.Serialize(new {
                description  = String.Empty,
                name         = hostname,
                ip           = ipv4String ?? String.Empty,
                ipv6         = gwIpV6?.ToString() ?? String.Empty,
                mac          = mac,
                manufacturer = MacLookup.LookupToString(mac),
                services     = String.Empty,
            }), mutex);
        }
    }

    private static void DiscoverIcmp(NetworkInterface nic, WebSocket ws, object mutex, CancellationToken token) {
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

    private static void DiscoverMdns(NetworkInterface nic, WebSocket ws, object mutex, CancellationToken token) {
        MdnsMulticast(nic, ws, mutex, token, ANY_QUERY, Protocols.Dns.RecordType.ANY, 1000);
        MdnsMulticast(nic, ws, mutex, token, HTTP_QUERY, Protocols.Dns.RecordType.ANY, 1000);
    }

    public static void MdnsMulticast(NetworkInterface nic, WebSocket ws, object mutex, CancellationToken token, string queryString, RecordType type, int timeout) {
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
                    if (answer[j].type == RecordType.SRV) {
                        ipv6 = answer[j].answerString;
                    }
                    else if (answer[j].type == RecordType.SRV) {
                        string[] split = answer[j].answerString.Split(':');
                        if (split.Length >= 2) {
                            hostname = split[0].EndsWith(".local") ? hostname = split[0][..^6] : hostname = split[0];

                            if (services.Length > 0) services.Append(',');
                            services.Append(split[1]);
                        }
                    }
                    else if (answer[j].type == RecordType.PTR) {
                        if (answer[j].answerString.EndsWith("_ssh._tcp.local")) {
                            if (services.Length > 0) services.Append(',');
                            services.Append("22");
                        }
                        else if (answer[j].answerString.EndsWith("_http._tcp.local")) {
                            if (services.Length > 0) services.Append(',');
                            services.Append("80");
                        }
                        else if (answer[j].answerString.EndsWith("_https._tcp.local")) {
                            if (services.Length > 0) services.Append(',');
                            services.Append("443");
                        }
                        else if (answer[j].answerString.EndsWith("_smb._tcp.local")) {
                            if (services.Length > 0) services.Append(',');
                            services.Append("445");
                        }
                        else if (answer[j].answerString.EndsWith("_http-alt._tcp.local")) {
                            if (services.Length > 0) services.Append(',');
                            services.Append("8080");
                        }
                        else if (answer[j].answerString.EndsWith("_printer._tcp.local")) {
                            if (services.Length > 0) services.Append(',');
                            services.Append("9100");
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

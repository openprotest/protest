using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Text;
using System.Threading.Tasks;

namespace Protest.Protocols;

internal class Ssdp {
    private static readonly IPAddress SSDP_MULTICAST_ADDRESS_V4 = IPAddress.Parse("239.255.255.250");
    private static readonly IPAddress SSDP_MULTICAST_ADDRESS_V6 = IPAddress.Parse("ff02::c");
    private static readonly int SSDP_PORT = 1900;

    public static readonly byte[] ALL_SERVICES_QUERY =
        "M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: \"ssdp:discover\"\r\nMX: 1\r\nST: ssdp:all\r\n\r\n"u8.ToArray();

    private static readonly HttpClient httpClient;

    static Ssdp() {
        HttpClientHandler clientHandler = new HttpClientHandler();
        clientHandler.ServerCertificateCustomValidationCallback = (sender, cert, chain, sslPolicyErrors) => { return true; };

        httpClient = new HttpClient(clientHandler);
        httpClient.Timeout = TimeSpan.FromSeconds(1);
    }

    public static void Discover() {
        SendRequest(ALL_SERVICES_QUERY, 2_000);
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
            Console.WriteLine(url);

            Task.Run(async ()=> {
                HttpResponseMessage response = await httpClient.GetAsync(url);
                
                //response.EnsureSuccessStatusCode();
                string s = await response.Content.ReadAsStringAsync();
                
                Console.WriteLine(s.Length);

                return s;
            }).Wait();

        }
    }
}
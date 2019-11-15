using System;
using System.Linq;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Text;

static class DhcpDiscover {

    public static byte[] Discover() {
        NetworkInterface[] interfaces = NetworkInterface.GetAllNetworkInterfaces();

        StringBuilder sb = new StringBuilder();

        foreach (NetworkInterface o in interfaces) {
            if (o.OperationalStatus == OperationalStatus.Down) continue;

            foreach (UnicastIPAddressInformation ipInfo in o.GetIPProperties().UnicastAddresses) {
                if (ipInfo.Address.AddressFamily != AddressFamily.InterNetwork) continue;
                byte[] offer = Discover(ipInfo.Address);
                if (offer is null) continue;

                string info = ExtractInfo(offer);
                if (info is null || info.Length == 0) continue;
                sb.Append(info);
                sb.Append((char)127);
            }
        }

        return Encoding.UTF8.GetBytes(sb.ToString()); ;
    }

    public static byte[] Discover(IPAddress ip, int timeout = 3000) {
        int p = 0;
        byte[] dgram = new byte[512];

        dgram[p++] = 0x01; //message type
        dgram[p++] = 0x01; //harware type
        dgram[p++] = 0x06; //mac length
        dgram[p++] = 0x00; //hops

        Random rnd = new Random();
        dgram[p++] = (byte)rnd.Next(0,255); //transaction id
        dgram[p++] = (byte)rnd.Next(0,255);
        dgram[p++] = (byte)rnd.Next(0,255);
        dgram[p++] = (byte)rnd.Next(0,255);

        dgram[p++] = 0x00; //seconds elapsed
        dgram[p++] = 0x00;

        dgram[p++] = 0x00; //bootp flags
        dgram[p++] = 0x00;

        dgram[p++] = 0x00; //client ip address
        dgram[p++] = 0x00;
        dgram[p++] = 0x00;
        dgram[p++] = 0x00;

        dgram[p++] = 0x00; //your ip address
        dgram[p++] = 0x00;
        dgram[p++] = 0x00;
        dgram[p++] = 0x00;

        dgram[p++] = 0x00; //next server ip address
        dgram[p++] = 0x00;
        dgram[p++] = 0x00;
        dgram[p++] = 0x00;

        dgram[p++] = 0x00; //relay server ip address
        dgram[p++] = 0x00;
        dgram[p++] = 0x00;
        dgram[p++] = 0x00;

        dgram[p++] = 0x7e; //client mac address
        dgram[p++] = 0x57;
        dgram[p++] = 0x7e;
        dgram[p++] = 0x57;
        dgram[p++] = 0x7e;
        dgram[p++] = 0x57;

        for (int i=0;i<10; i++) //padding
            dgram[p++] = 0x00;

        for (int i = 0; i < 64; i++) //server host name
            dgram[p++] = 0x00;

        for (int i = 0; i < 128; i++) //boot file name
            dgram[p++] = 0x00;

        dgram[p++] = 0x63; //magic cookie
        dgram[p++] = 0x82;
        dgram[p++] = 0x53;
        dgram[p++] = 0x63;

        dgram[p++] = 0x35; //DHCP message type
        dgram[p++] = 0x01; //length
        dgram[p++] = 0x01; //1:discover, 2:offer

        dgram[p++] = 0x35; //opt: discover
        dgram[p++] = 0x01; //length
        dgram[p++] = 0x01; //discover

        dgram[p++] = 0x3d; //opt: client id
        dgram[p++] = 0x07; //length
        dgram[p++] = 0x01; //hardware type: ethernet
        dgram[p++] = 0x7e; //mac address
        dgram[p++] = 0x57;
        dgram[p++] = 0x7e;
        dgram[p++] = 0x57;
        dgram[p++] = 0x7e;
        dgram[p++] = 0x57;

        dgram[p++] = 0x3d; //opt: hostname
        dgram[p++] = 0x07; //length
        dgram[p++] = 0x50;
        dgram[p++] = 0x52;
        dgram[p++] = 0x30;
        dgram[p++] = 0x54;
        dgram[p++] = 0x45;
        dgram[p++] = 0x53;
        dgram[p++] = 0x54;

        dgram[p++] = 0x3d; //opt: request list
        dgram[p++] = 0x0e; //length
        dgram[p++] = 0x01; //subnet mask
        dgram[p++] = 0x03; //router
        dgram[p++] = 0x06; //domain name server
        dgram[p++] = 0x0f; //domain name
        dgram[p++] = 0x1f; //perform router discover
        dgram[p++] = 0x21; //static router
        dgram[p++] = 0x2b; //ventor-specific info
        dgram[p++] = 0x2c; //netbios over tcp name server
        dgram[p++] = 0x2e; //netbios over tcp node type
        dgram[p++] = 0x2f; //netbios over tcp scope
        dgram[p++] = 0x77; //domain search
        dgram[p++] = 0x79; //classless static route
        dgram[p++] = 0xf9; //private/classless static route
        dgram[p++] = 0xfc; //private/proxy autodiscover

        dgram[p++] = 0xff; //end

        for (int i = 0; i < 15; i++) //padding
            dgram[p++] = 0x00;

        try {
            IPEndPoint local = new IPEndPoint(ip, 68);
            IPEndPoint remote = new IPEndPoint(IPAddress.Broadcast, 67);

            Socket socket = new Socket(AddressFamily.InterNetwork, SocketType.Dgram, ProtocolType.Udp);
            socket.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.ReuseAddress, true);
            socket.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.DontRoute, true);
            socket.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.Broadcast, true);
            socket.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.ReceiveTimeout, timeout);
            socket.Bind(local);
            socket.SendTo(dgram, remote);

            byte[] offer = new byte[1024];
            socket.Receive(offer);
            socket.Dispose();
            return offer;

        } catch (ArgumentNullException ex) {
            ErrorLog.Err(ex);

        //} catch (SocketException ex) {
            //ErrorLog.Err(ex);

        } catch (System.Security.SecurityException ex) {
            ErrorLog.Err(ex);
            
        } catch (Exception ex) {
            //ErrorLog.Err(ex);
        }

        return null;
    }

    private static string ExtractInfo(byte[] offer) {
        if (offer is null) return null;
        if (offer.Length == 0) return "invalid response";

        bool isOffer = offer[0] == 2;
        if (!isOffer) return "invalid response";

        if (offer.Length < 34) return "invalid response";

        byte hardware = offer[1]; //hardware type
        byte maclen = offer[2]; //hardware address length
        byte hops = offer[3];

        string id = "0x"+ offer[4].ToString("X2") + offer[5].ToString("X2") + offer[6].ToString("X2") + offer[7].ToString("X2");
        string clientIp = $"{offer[12]}.{offer[13]}.{offer[14]}.{offer[15]}";
        string offeredIp = $"{offer[16]}.{offer[17]}.{offer[18]}.{offer[19]}";

        string nextServerIp = $"{offer[20]}.{offer[21]}.{offer[22]}.{offer[23]}";
        string relayServerIp = $"{offer[24]}.{offer[25]}.{offer[26]}.{offer[27]}";
        string clientMac = $"{offer[28].ToString("X2")}-{offer[29].ToString("X2")}-{offer[30].ToString("X2")}-{offer[31].ToString("X2")}-{offer[32].ToString("X2")}-{offer[33].ToString("X2")}";

        StringBuilder sb = new StringBuilder();
        sb.AppendLine($"message type:offer");
        //sb.AppendLine($"hardware type:{hardware}");
        //sb.AppendLine($"hardware address length:{maclen}");
        sb.AppendLine($"hops:{hops}");

        sb.AppendLine($"transaction id:{id}");
        sb.AppendLine($"client ip:{clientIp}");
        sb.AppendLine($"offered ip:{offeredIp}");

        sb.AppendLine($"next server ip:{nextServerIp}");
        sb.AppendLine($"relay server ip:{relayServerIp}");
        sb.AppendLine($"client mac:{clientMac}");

        //https://www.iana.org/assignments/bootp-dhcp-parameters/bootp-dhcp-parameters.xhtml
        int p = 240; //-42
        while (p < offer.Length && offer[p] != 255) {
            byte opt = offer[p++];
            byte length = offer[p++];
            int value;

            switch (opt) {
                case 1:
                    sb.AppendLine($"subnet mask:{offer[p]}.{offer[p+1]}.{offer[p+2]}.{offer[p+3]}");
                    break;

                case 3:
                    sb.AppendLine($"router:{offer[p]}.{offer[p+1]}.{offer[p+2]}.{offer[p+3]}");
                    break;

                case 6:
                    sb.Append("domain name server:");
                    for (int i = 0; i < length; i+=4) {
                        sb.Append($"{offer[p+i]}.{offer[p+i+1]}.{offer[p+i+2]}.{offer[p+i+3]}");
                        if (i + 4 < length) sb.Append(", ");
                    }
                    sb.AppendLine();
                    break;

                case 15:
                    sb.Append("domain name:");
                    for (int i = 0; i < length; i++)
                        sb.Append((char)offer[p+i]);
                    
                    sb.AppendLine();
                    break;

                case 28:
                    sb.AppendLine($"broadcast address{offer[p]}.{offer[p+1]}.{offer[p+2]}.{offer[p+3]}");
                    break;

                case 35:
                    sb.Append("arp timeout:");
                    value = BitConverter.ToInt32(new byte[] { offer[p+3], offer[p+2], offer[p+1], offer[p] }, 0);
                    sb.AppendLine(value.ToString());
                    break;

                case 38:
                    sb.Append("tcp keepalive interval:");
                    value = BitConverter.ToInt32(new byte[] { offer[p+3], offer[p+2], offer[p+1], offer[p] }, 0);
                    sb.AppendLine(value.ToString());
                    break;

                case 51:
                    sb.Append("ip address lease time:");
                    value = BitConverter.ToInt32(new byte[] { offer[p+3], offer[p+2], offer[p+1], offer[p] }, 0);
                    sb.Append($"{value}s");
                    if (value > 86400) sb.Append($" ({value/86400} days)");
                    sb.AppendLine();
                    break;

                case 54:
                    sb.AppendLine($"dhcp server id:{offer[p]}.{offer[p+1]}.{offer[p+2]}.{offer[p+3]}");
                    break;

                case 58:
                    sb.Append("renewal time value:");
                    value = BitConverter.ToInt32(new byte[] { offer[p + 3], offer[p + 2], offer[p + 1], offer[p] }, 0);
                    sb.Append($"{value}s");
                    if (value > 86400) sb.Append($" ({value/86400} days)");
                    sb.AppendLine();
                    break;

                case 59:
                    sb.Append("rebinding time value:");
                    value = BitConverter.ToInt32(new byte[] { offer[p + 3], offer[p + 2], offer[p + 1], offer[p] }, 0);
                    sb.Append($"{value}s");
                    if (value > 86400) sb.Append($" ({value/86400} days)");
                    sb.AppendLine();
                    break;

                default: break;
            }
            p += length;
        }

        return sb.ToString();
    }
}
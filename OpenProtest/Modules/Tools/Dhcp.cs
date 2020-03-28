using System;
using System.Linq;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Text;
using System.Threading;

public static class Dhcp {
    //https://www.iana.org/assignments/bootp-dhcp-parameters/bootp-dhcp-parameters.xhtml

    public static byte[] DiscoverDhcp(string[] para) {
        int timeout = 2000;
        string mac = "";
        bool accept = false;
        for (int i = 0; i < para.Length; i++) {
            if (para[i].StartsWith("timeout=")) int.TryParse(para[i].Substring(8), out timeout);
            if (para[i].StartsWith("mac=")) mac = para[i].Substring(4);
            if (para[i].StartsWith("accept=")) accept = para[i].Substring(7) == "true";
        }

        StringBuilder sb = new StringBuilder();

        NetworkInterface[] interfaces = NetworkInterface.GetAllNetworkInterfaces();

        foreach (NetworkInterface o in interfaces) {
            if (o.OperationalStatus == OperationalStatus.Down) continue;

            foreach (UnicastIPAddressInformation ipInfo in o.GetIPProperties().UnicastAddresses) {
                if (ipInfo.Address.AddressFamily != AddressFamily.InterNetwork) continue;
                string respone = Dhcp4way(ipInfo.Address, mac.Length > 0 ? mac : o.GetPhysicalAddress().ToString(), timeout, accept);
                if (respone is null) continue;

                sb.Append(respone);
                sb.Append((char)127);
            }
        }

        return Encoding.UTF8.GetBytes(sb.ToString());
    }

    public static string Dhcp4way(IPAddress ip, string mac, int timeout, bool accept = false) {
       try {
            IPEndPoint localIp = new IPEndPoint(ip, 68);
            IPEndPoint remoteIp = new IPEndPoint(IPAddress.Broadcast, 67);

            long timestamp = DateTime.Now.Ticks;

            Socket socket = new Socket(AddressFamily.InterNetwork, SocketType.Dgram, ProtocolType.Udp);
            socket.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.ReuseAddress, true);
            socket.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.DontRoute, true);
            socket.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.Broadcast, true);
            socket.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.ReceiveTimeout, timeout);
            socket.Bind(localIp);

            StringBuilder sb = new StringBuilder();

            Random rnd = new Random(); //transaction id
            byte[] transactionId = new byte[4];
            for (int i = 0; i < 4; i++) transactionId[i] = (byte)rnd.Next(0, 255);
        
            byte[] discoverRequest = Discover(sb, timestamp, mac, transactionId);
            sb.Append((char)127);
            socket.SendTo(discoverRequest, remoteIp);

            byte[] offer = new byte[1024];
            socket.Receive(offer);
            string offerMac;
            byte[] offerIp;
            byte[] offerDhcpServer;
            Offer(sb, offer, out offerMac, out offerIp, out offerDhcpServer);
            sb.Append((char)127);

            if (accept) { //accept the offer
                byte[] request = Request(sb, timestamp, transactionId, offerMac, offerIp, offerDhcpServer);
                sb.Append((char)127);
                socket.SendTo(request, remoteIp);

                byte[] acknowledge = new byte[1024];
                socket.Receive(acknowledge);
                Acknowledge(sb, acknowledge);
                sb.Append((char)127);
            }

            socket.Dispose();
            return sb.ToString();

        } catch (ArgumentNullException ex) {
            Logging.Err(ex);

        } catch (System.Security.SecurityException ex) {
            Logging.Err(ex);

        } catch (Exception) { }

        return null;
    }

    private static byte[] Discover(StringBuilder sb, long timestamp, string mac, byte[] transactionId) {
        int p = 0;
        byte[] dgram = new byte[512];

        dgram[p++] = 0x01; //message type
        dgram[p++] = 0x00; //harware type 0:pseudo
        dgram[p++] = 0x06; //mac length
        dgram[p++] = 0x00; //hops

        sb.AppendLine($"message type:{MessageTypeToString(dgram[0])}");
        //sb.AppendLine($"harware type:{HardwareTypeToString(dgram[1])}");

        sb.AppendLine($"transaction id:0x{transactionId[0]:X2}{transactionId[1]:X2}{transactionId[2]:X2}{transactionId[3]:X2}");
        dgram[p++] = transactionId[0];
        dgram[p++] = transactionId[1];
        dgram[p++] = transactionId[2];
        dgram[p++] = transactionId[3];

        double secElapsed = (DateTime.Now.Ticks - timestamp) / 100000000;
        sb.AppendLine($"seconds elapsed:{secElapsed}");
        dgram[p++] = 0x00; //seconds elapsed
        dgram[p++] = secElapsed > 255 ? (byte)0xff : (byte)secElapsed;

        dgram[p++] = 0x00; //bootp flags
        dgram[p++] = 0x00;

        sb.AppendLine("client ip address:0.0.0.0");
        dgram[p++] = 0x00; //client ip address
        dgram[p++] = 0x00;
        dgram[p++] = 0x00;
        dgram[p++] = 0x00;

        sb.AppendLine("your ip address:0.0.0.0");
        dgram[p++] = 0x00; //your ip address
        dgram[p++] = 0x00;
        dgram[p++] = 0x00;
        dgram[p++] = 0x00;

        //sb.AppendLine("next server ip address:0.0.0.0");
        dgram[p++] = 0x00; //next server ip address
        dgram[p++] = 0x00;
        dgram[p++] = 0x00;
        dgram[p++] = 0x00;

        //sb.AppendLine("relay server ip address:0.0.0.0");
        dgram[p++] = 0x00; //relay server ip address
        dgram[p++] = 0x00;
        dgram[p++] = 0x00;
        dgram[p++] = 0x00;

        sb.AppendLine($"client mac address:{mac}");
        mac = mac.Replace(":", "");
        mac = mac.Replace("-", "");
        if (mac.Length == 12) {
            dgram[p++] = Convert.ToByte(mac.Substring(0, 2), 16); //client mac address
            dgram[p++] = Convert.ToByte(mac.Substring(2, 2), 16);
            dgram[p++] = Convert.ToByte(mac.Substring(4, 2), 16);
            dgram[p++] = Convert.ToByte(mac.Substring(6, 2), 16);
            dgram[p++] = Convert.ToByte(mac.Substring(8, 2), 16);
            dgram[p++] = Convert.ToByte(mac.Substring(10, 2), 16);
        } else {
            dgram[p++] = 0x00;
            dgram[p++] = 0x00;
            dgram[p++] = 0x00;
            dgram[p++] = 0x00;
            dgram[p++] = 0x00;
            dgram[p++] = 0x00;
        }

        for (int i = 0; i < 10; i++) //padding
            dgram[p++] = 0x00;

        for (int i = 0; i < 64; i++) //server host name
            dgram[p++] = 0x00;

        for (int i = 0; i < 128; i++) //boot file name
            dgram[p++] = 0x00;

        dgram[p++] = 0x63; //magic cookie
        dgram[p++] = 0x82;
        dgram[p++] = 0x53;
        dgram[p++] = 0x63;


        sb.AppendLine($"dhcp message type:{DhcpMessageTypeToString(1)}");
        dgram[p++] = 0x35; //dhcp message type
        dgram[p++] = 0x01; //length
        dgram[p++] = 0x01; //1:discover, 2:offer

        sb.AppendLine($"client id:{mac}");
        dgram[p++] = 0x3d; //opt: client id
        dgram[p++] = 0x07; //length
        dgram[p++] = 0x01; //hardware type: ethernet
        if (mac.Length == 12) {
            dgram[p++] = Convert.ToByte(mac.Substring(0, 2), 16); //mac address
            dgram[p++] = Convert.ToByte(mac.Substring(2, 2), 16);
            dgram[p++] = Convert.ToByte(mac.Substring(4, 2), 16);
            dgram[p++] = Convert.ToByte(mac.Substring(6, 2), 16);
            dgram[p++] = Convert.ToByte(mac.Substring(8, 2), 16);
            dgram[p++] = Convert.ToByte(mac.Substring(10, 2), 16);
        } else {
            dgram[p++] = 0x00;
            dgram[p++] = 0x00;
            dgram[p++] = 0x00;
            dgram[p++] = 0x00;
            dgram[p++] = 0x00;
            dgram[p++] = 0x00;
        }

        sb.AppendLine($"hostname:PROTEST");
        dgram[p++] = 0x0c; //opt: hostname
        dgram[p++] = 0x07; //length
        dgram[p++] = 0x50; //P
        dgram[p++] = 0x52; //R
        dgram[p++] = 0x30; //O
        dgram[p++] = 0x54; //T
        dgram[p++] = 0x45; //E
        dgram[p++] = 0x53; //S
        dgram[p++] = 0x54; //T

        dgram[p++] = 0x37; //opt: request list
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

        return dgram;
    }

    private static byte[] Request(StringBuilder sb, long timestamp, byte[] transactionId, string mac, byte[] requestedIp, byte[] dhcpServerIp) {
        int p = 0;
        byte[] dgram = new byte[512];

        sb.AppendLine($"message type:{MessageTypeToString(1)}");
        //sb.AppendLine($"harware type:{HardwareTypeToString(1)}");
        dgram[p++] = 0x01; //message type
        dgram[p++] = 0x01; //harware type
        dgram[p++] = 0x06; //mac length
        dgram[p++] = 0x00; //hops

        sb.AppendLine($"transaction id:0x{transactionId[0]:X2}{transactionId[1]:X2}{transactionId[2]:X2}{transactionId[3]:X2}");
        dgram[p++] = transactionId[0]; //transaction id
        dgram[p++] = transactionId[1];
        dgram[p++] = transactionId[2];
        dgram[p++] = transactionId[3];

        double secElapsed = (DateTime.Now.Ticks - timestamp) / 100000000;
        sb.AppendLine($"seconds elapsed:{secElapsed}");
        dgram[p++] = 0x00; //seconds elapsed
        dgram[p++] = secElapsed > 255 ? (byte)0xff : (byte)secElapsed;

        dgram[p++] = 0x00; //bootp flags
        dgram[p++] = 0x00;

        sb.AppendLine("client ip address:0.0.0.0");
        dgram[p++] = 0x00; //client ip address
        dgram[p++] = 0x00;
        dgram[p++] = 0x00;
        dgram[p++] = 0x00;

        sb.AppendLine("your ip address:0.0.0.0");
        dgram[p++] = 0x00; //your ip address
        dgram[p++] = 0x00;
        dgram[p++] = 0x00;
        dgram[p++] = 0x00;

        //sb.AppendLine("next server ip address:0.0.0.0");
        dgram[p++] = 0x00; //next server ip address
        dgram[p++] = 0x00;
        dgram[p++] = 0x00;
        dgram[p++] = 0x00;

        //sb.AppendLine("relay server ip address:0.0.0.0");
        dgram[p++] = 0x00; //relay server ip address
        dgram[p++] = 0x00;
        dgram[p++] = 0x00;
        dgram[p++] = 0x00;

        sb.AppendLine($"client mac address:{mac}");
        mac = mac.Replace(":", "");
        mac = mac.Replace("-", "");
        if (mac is null || mac.Length == 12) {
            dgram[p++] = Convert.ToByte(mac.Substring(0, 2), 16); //client mac address
            dgram[p++] = Convert.ToByte(mac.Substring(2, 2), 16);
            dgram[p++] = Convert.ToByte(mac.Substring(4, 2), 16);
            dgram[p++] = Convert.ToByte(mac.Substring(6, 2), 16);
            dgram[p++] = Convert.ToByte(mac.Substring(8, 2), 16);
            dgram[p++] = Convert.ToByte(mac.Substring(10, 2), 16);
        } else {
            dgram[p++] = 0x00;
            dgram[p++] = 0x00;
            dgram[p++] = 0x00;
            dgram[p++] = 0x00;
            dgram[p++] = 0x00;
            dgram[p++] = 0x00;
        }

        for (int i = 0; i < 10; i++) //padding
            dgram[p++] = 0x00;

        for (int i = 0; i < 64; i++) //server host name
            dgram[p++] = 0x00;

        for (int i = 0; i < 128; i++) //boot file name
            dgram[p++] = 0x00;

        dgram[p++] = 0x63; //magic cookie
        dgram[p++] = 0x82;
        dgram[p++] = 0x53;
        dgram[p++] = 0x63;

        sb.AppendLine($"dhcp message type:{DhcpMessageTypeToString(3)}");
        dgram[p++] = 0x35; //DHCP message type
        dgram[p++] = 0x01; //length
        dgram[p++] = 0x03; //1:discover, 2:offer, 3:request, 4:ack

        sb.AppendLine($"client identifier:{mac}");
        dgram[p++] = 0x3d; //opt: client id
        dgram[p++] = 0x07; //length
        dgram[p++] = 0x01; //hardware type: ethernet
        if (mac.Length == 12) {
            dgram[p++] = Convert.ToByte(mac.Substring(0, 2), 16); //mac address
            dgram[p++] = Convert.ToByte(mac.Substring(2, 2), 16);
            dgram[p++] = Convert.ToByte(mac.Substring(4, 2), 16);
            dgram[p++] = Convert.ToByte(mac.Substring(6, 2), 16);
            dgram[p++] = Convert.ToByte(mac.Substring(8, 2), 16);
            dgram[p++] = Convert.ToByte(mac.Substring(10, 2), 16);
        } else {
            dgram[p++] = 0x00;
            dgram[p++] = 0x00;
            dgram[p++] = 0x00;
            dgram[p++] = 0x00;
            dgram[p++] = 0x00;
            dgram[p++] = 0x00;
        }

        sb.AppendLine($"requested ip address:{requestedIp[0]}.{requestedIp[1]}.{requestedIp[2]}.{requestedIp[3]}");
        dgram[p++] = 0x32; //opt: requested ip Address
        dgram[p++] = 0x04; //length
        dgram[p++] = requestedIp[0]; //ip address
        dgram[p++] = requestedIp[1];
        dgram[p++] = requestedIp[2];
        dgram[p++] = requestedIp[3];

        sb.AppendLine($"dhcp server identifier:{dhcpServerIp[0]}.{dhcpServerIp[1]}.{dhcpServerIp[2]}.{dhcpServerIp[3]}");
        dgram[p++] = 0x32; //opt: dhcp 
        dgram[p++] = 0x04; //length
        dgram[p++] = dhcpServerIp[0]; //ip address
        dgram[p++] = dhcpServerIp[1];
        dgram[p++] = dhcpServerIp[2];
        dgram[p++] = dhcpServerIp[3];

        sb.AppendLine("hostname:PROTEST");
        dgram[p++] = 0x0c; //opt: hostname
        dgram[p++] = 0x07; //length
        dgram[p++] = 0x50; //p
        dgram[p++] = 0x52; //r
        dgram[p++] = 0x30; //o
        dgram[p++] = 0x54; //t
        dgram[p++] = 0x45; //e
        dgram[p++] = 0x53; //s
        dgram[p++] = 0x54; //t

        dgram[p++] = 0x37; //opt: request list
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

        return dgram;
    }

    private static void Offer(StringBuilder sb, byte[] buffer, out string offerMac, out byte[] offerIp, out byte[] offerDhcpServer) {
        offerMac = "";
        offerIp = new byte[4];
        offerDhcpServer = new byte[4];

        if (buffer is null) return;
        if (buffer.Length == 0) return;

        byte messageType = buffer[0];  //message type
        //byte hardwareType = buffer[1]; //hardware type
        //byte maclen = buffer[2];     //hardware address length
        byte hops = buffer[3];

        string id = $"0x{buffer[4]:X2}{buffer[5]:X2}{buffer[6]:X2}{buffer[7]:X2}";
        int secElapsed = buffer[8]*256 + buffer[9];
        string clientIp = $"{buffer[12]}.{buffer[13]}.{buffer[14]}.{buffer[15]}";
        string offeredIp = $"{buffer[16]}.{buffer[17]}.{buffer[18]}.{buffer[19]}";
        //string nextServerIp = $"{buffer[20]}.{buffer[21]}.{buffer[22]}.{buffer[23]}";
        //string relayServerIp = $"{buffer[24]}.{buffer[25]}.{buffer[26]}.{buffer[27]}";
        offerMac = $"{buffer[28]:X2}{buffer[29]:X2}{buffer[30]:X2}{buffer[31]:X2}{buffer[32]:X2}{buffer[33]:X2}"; //client mac

        offerIp[0] = buffer[16];
        offerIp[1] = buffer[17];
        offerIp[2] = buffer[18];
        offerIp[3] = buffer[19];

        sb.AppendLine($"message type:{MessageTypeToString(messageType)}");
        //sb.AppendLine($"hardware type:{HardwareTypeToString(hardwareType)}");
        sb.AppendLine($"hops:{hops}");
        sb.AppendLine($"transaction id:{id}");
        sb.AppendLine($"seconds elapsed:{secElapsed}");
        sb.AppendLine($"client ip:{clientIp}");
        sb.AppendLine($"offered ip:{offeredIp}");
        //sb.AppendLine($"next server ip:{nextServerIp}");
        //sb.AppendLine($"relay server ip:{relayServerIp}");
        sb.AppendLine($"client mac:{offerMac}");

        if (buffer.Length < 34) return;

        int p = 240; //-42
        while (p < buffer.Length && buffer[p] != 255) {
            byte opt = buffer[p++];
            byte length = buffer[p++];
            string s = OptionToString(opt, buffer, p, length);
            if (s.Length > 0) sb.AppendLine(s);

            if (opt==54) { //dhcp server id
                offerDhcpServer[0] = buffer[p];
                offerDhcpServer[1] = buffer[p+1];
                offerDhcpServer[2] = buffer[p+2];
                offerDhcpServer[3] = buffer[p+3];
            }

            p += length;
        }
    }

    private static void Acknowledge(StringBuilder sb, byte[] buffer) {
        if (buffer is null) return;
        if (buffer.Length == 0) return;

        byte messageType = buffer[0];
        //byte hardwareType = buffer[1]; //hardware type
        //byte maclen = buffer[2]; //hardware address length
        byte hops = buffer[3];

        string id = $"0x{buffer[4]:X2}{buffer[5]:X2}{buffer[6]:X2}{buffer[7]:X2}";
        int secElapsed = buffer[8] * 256 + buffer[9];
        string clientIp = $"{buffer[12]}.{buffer[13]}.{buffer[14]}.{buffer[15]}";
        string yourip = $"{buffer[16]}.{buffer[17]}.{buffer[18]}.{buffer[19]}";
        //string nextServerIp = $"{buffer[20]}.{buffer[21]}.{buffer[22]}.{buffer[23]}";
        //string relayServerIp = $"{buffer[24]}.{buffer[25]}.{buffer[26]}.{buffer[27]}";
        string clientMac = $"{buffer[28]:X2}{buffer[29]:X2}{buffer[30]:X2}{buffer[31]:X2}{buffer[32]:X2}{buffer[33]:X2}";

        sb.AppendLine($"message type:{MessageTypeToString(messageType)}");
        //sb.AppendLine($"hardware type:{HardwareTypeToString(hardwareType)}");
        sb.AppendLine($"hops:{hops}");
        sb.AppendLine($"transaction id:{id}");
        sb.AppendLine($"seconds elapsed:{secElapsed}");
        sb.AppendLine($"client ip:{clientIp}");
        sb.AppendLine($"offered ip:{yourip}");
        //sb.AppendLine($"next server ip:{nextServerIp}");
        //sb.AppendLine($"relay server ip:{relayServerIp}");
        sb.AppendLine($"client mac:{clientMac}");

        int p = 240; //-42
        while (p < buffer.Length && buffer[p] != 255) {
            byte opt = buffer[p++];
            byte length = buffer[p++];
            string s = OptionToString(opt, buffer, p, length);
            if (s.Length > 0) sb.AppendLine(s);
            p += length;
        }
    }

    private static string HardwareTypeToString(int value) {
        return value switch
        {
            0 => "(0) pseudo",
            1 => "(1) ethernet ",
            2 => "(2) experimental ethernet",
            3 => "(3) AX.25",
            4 => "(4) proteon ProNET",
            5 => "(5) chaos",
            6 => "(6) ieee 802",
            7 => "(7) ARCNET",
            8 => "(8) hyperchannel",
            9 => "(9) lanstat",
            10 => "(10) autonet short address",
            11 => "(11) localtalk",
            12 => "(12) localnet",
            13 => "(13) ultra link",
            14 => "(14) SMDS",
            15 => "(15) frame relay DLCI",
            16 => "(16) ATM",
            17 => "(17) HDLC",
            18 => "(18) fiber channel",
            19 => "(19) ATM (RFC 2225)",
            20 => "(20) serial line",
            21 => "(21) ATM",
            22 => "(22) MIL STD 188-220",
            23 => "(23) metricom STRIP",
            24 => "(24) ieee 1394.1995",
            25 => "(25) mapos",
            26 => "(26) twinaxial",
            27 => "(27) EUI-64",
            28 => "(28) HIPARP",
            29 => "(29) ip over ISO-7816-3",
            30 => "(30) ARPSec",
            31 => "(31) ipsec tunnel",
            32 => "(32) infiniband",
            33 => "(33) CAI TIA 102",
            _ => $"({value}) unknown type"
        };
    }

    private static string MessageTypeToString(int value) {
        return value switch {
            1 => "(1) boot request",
            2 => "(2) boot replay",
            _ => $"({value}) unknown type"
        };
    }

    private static string DhcpMessageTypeToString(int value) {
        return value switch
        {
            1 => "(1) discover",
            2 => "(2) offer",
            3 => "(3) request",
            4 => "(4) decline",
            5 => "(5) acknowledge",
            6 => "(6) negative acknowledgment",
            7 => "(7) release",
            8 => "(8) informational",
            9 => "(9) force renew",
            _ =>$"({value}) unknown type"
        };
    }

    private static string OptionToString(byte opt, byte[] buff, int p, int length) {
        StringBuilder sb = new StringBuilder();
        int value;

        switch (opt) {
            case 1:
                return $"subnet mask:{buff[p]}.{buff[p + 1]}.{buff[p + 2]}.{buff[p + 3]}";

            case 3:
                return $"gateway:{buff[p]}.{buff[p + 1]}.{buff[p + 2]}.{buff[p + 3]}";

            case 6:
                sb.Append("domain name server:");
                for (int i = 0; i < length; i += 4) {
                    sb.Append($"{buff[p + i]}.{buff[p + i + 1]}.{buff[p + i + 2]}.{buff[p + i + 3]}");
                    if (i + 4 < length) sb.Append(", ");
                }
                sb.AppendLine();
                return sb.ToString();

            case 15:
                sb.Append("domain name:");
                for (int i = 0; i < length; i++)
                    sb.Append((char)buff[p + i]);

                sb.AppendLine();
                return sb.ToString();

            case 28:
                return $"broadcast address{buff[p]}.{buff[p + 1]}.{buff[p + 2]}.{buff[p + 3]}";

            case 35:
                sb.Append("arp timeout:");
                value = BitConverter.ToInt32(new byte[] { buff[p + 3], buff[p + 2], buff[p + 1], buff[p] }, 0);
                sb.AppendLine(value.ToString());
                return sb.ToString();

            case 38:
                sb.Append("tcp keepalive interval:");
                value = BitConverter.ToInt32(new byte[] { buff[p + 3], buff[p + 2], buff[p + 1], buff[p] }, 0);
                sb.AppendLine(value.ToString());
                return sb.ToString();

            case 51:
                sb.Append("ip address lease time:");
                value = BitConverter.ToInt32(new byte[] { buff[p + 3], buff[p + 2], buff[p + 1], buff[p] }, 0);
                sb.Append($"{value}s");
                if (value > 86400) sb.Append($" ({value / 86400} days)");
                sb.AppendLine();
                return sb.ToString();

            case 53:
                return $"dhcp message type:{DhcpMessageTypeToString(buff[p])}";

            case 54:
                return $"dhcp server identifier:{buff[p]}.{buff[p + 1]}.{buff[p + 2]}.{buff[p + 3]}";

            case 58:
                sb.Append("renewal time value:");
                value = BitConverter.ToInt32(new byte[] { buff[p + 3], buff[p + 2], buff[p + 1], buff[p] }, 0);
                sb.Append($"{value}s");
                if (value > 86400) sb.Append($" ({value / 86400} days)");
                sb.AppendLine();
                return sb.ToString();

            case 59:
                sb.Append("rebinding time value:");
                value = BitConverter.ToInt32(new byte[] { buff[p + 3], buff[p + 2], buff[p + 1], buff[p] }, 0);
                sb.Append($"{value}s");
                if (value > 86400) sb.Append($" ({value / 86400} days)");
                sb.AppendLine();
                return sb.ToString();

            default: return "";
        }
    }

}

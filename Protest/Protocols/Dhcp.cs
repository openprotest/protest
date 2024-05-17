using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Net;
using System.Text;
using System.Net.WebSockets;
using System.Threading;
using System.Threading.Tasks;
using Protest.Http;

namespace Protest.Protocols;

internal static class Dhcp {
    private static readonly byte[] NULL_IP = new byte[] {0,0,0,0};

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

        byte[] buff = new byte[1024];
        WebSocketReceiveResult receiveResult = await ws.ReceiveAsync(new ArraySegment<byte>(buff), CancellationToken.None);

        if (!Auth.IsAuthenticatedAndAuthorized(ctx, ctx.Request.Url.AbsolutePath)) {
            await ws.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, null, CancellationToken.None);
            return;
        }

        if (receiveResult.MessageType == WebSocketMessageType.Close) {
            await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, CancellationToken.None);
        }

        int timeout = 5000;
        string mac = String.Empty;
        string hostname = String.Empty;
        bool accept = false;

        string[] attributes = Encoding.Default.GetString(buff, 0, receiveResult.Count).Trim().Split('&');
        for (int i = 0; i < attributes.Length; i++) {
            if (attributes[i].StartsWith("timeout=")) {
                timeout = int.Parse(Uri.UnescapeDataString(attributes[i][8..].ToString()));
            }
            else if (attributes[i].StartsWith("mac=")) {
                mac = Uri.UnescapeDataString(attributes[i][4..].ToString()).Replace("-", String.Empty).Replace(":", String.Empty);
            }
            else if (attributes[i].StartsWith("hostname=")) {
                hostname = Uri.UnescapeDataString(attributes[i][9..].ToString());
            }
            else if (attributes[i].StartsWith("accept=")) {
                accept = Uri.UnescapeDataString(attributes[i][7..].ToString()) == "true";
            }
        }

        if (mac.Length == 0) {
            mac = NetworkInterface
                .GetAllNetworkInterfaces()
                .Where(nic => nic.OperationalStatus == OperationalStatus.Up && nic.NetworkInterfaceType != NetworkInterfaceType.Loopback)
                .FirstOrDefault().GetPhysicalAddress().ToString();
        }

        try {
            Dhcp4wayHandshake(ws, mac, hostname, timeout, accept);
        }
        catch (Exception ex) {
            string error = $"{{\"error\":\"{Data.EscapeJsonText(ex.Message)}\"}}";
            await ws.SendAsync(new ArraySegment<byte>(Encoding.UTF8.GetBytes(error), 0, error.Length), WebSocketMessageType.Text, true, CancellationToken.None);
        }

        string over = "{\"over\":true}";
        await ws.SendAsync(new ArraySegment<byte>(Encoding.UTF8.GetBytes(over), 0, over.Length), WebSocketMessageType.Text, true, CancellationToken.None);
        await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, null, CancellationToken.None);
    }

    public static void Dhcp4wayHandshake(WebSocket ws, string mac, string hostname, int timeout, bool accept = false) {
        IPEndPoint remote = new IPEndPoint(IPAddress.Broadcast, 67);
        IPEndPoint local = new IPEndPoint(IPAddress.Any, 68);

        Random rnd = new Random();

        byte[] transactionId = new byte[4];
        for (int i = 0; i < 4; i++) {
            transactionId[i] = (byte)rnd.Next(0, 255);
        }

        string id = "0x";
        for (int i = 0; i < 4; i++) {
            id += transactionId[i].ToString("x2");
        }

        if (mac.Length == 0) {
            for (int i = 0; i < 6; i++) {
                mac += rnd.Next(0, 255).ToString("x2");
            }
        }

        long timestamp = DateTime.Now.Ticks;
        byte[] discover = Discover(timestamp, mac, hostname, transactionId, Array.Empty<byte>());

        SendMessage(ws, discover, discover.Length, 1, id, id, mac, NULL_IP, NULL_IP);

        using Socket socket = new Socket(AddressFamily.InterNetwork, SocketType.Dgram, ProtocolType.Udp);
        socket.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.ReuseAddress, true);
        socket.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.DontRoute, true);
        socket.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.Broadcast, true);
        socket.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.ReceiveTimeout, timeout);
        socket.Bind(local);

        socket.SendTo(discover, remote);

        byte[] reply = new byte[2048];
        int length = 0;

        while (ws.State == WebSocketState.Open) {
            try {
                length = socket.Receive(reply);

                HandleReply(reply, length, out byte type, out string replyId, out string replayMac, out byte[] ip, out byte[] server);
                SendMessage(ws, reply, length, type, id, replyId, mac, server, ip);

                if (type == 0x02 && accept) { //offer
                    byte[] request = Request(timestamp, transactionId, mac, hostname, ip, server, Array.Empty<byte>());
                    socket.SendTo(request, remote);
                    SendMessage(ws, request, request.Length, 3, id, id, mac, server, ip);
                }
            }
            catch {
                break;
            }
        }

    }

    private static void SendMessage(WebSocket ws, byte[] message, int length, int type, string groupId, string id, string mac, byte[] server, byte[] ip) {
        if (ws.State == WebSocketState.Closed) return;

        StringBuilder builder = new StringBuilder();
        builder.Append('{');
        builder.Append($"\"type\":\"{type}\",");
        builder.Append($"\"typeString\":\"{DhcpMessageTypeToString(type)}\",");
        builder.Append($"\"id\":\"{id}\",");
        builder.Append($"\"groupId\":\"{groupId}\",");
        builder.Append($"\"mac\":\"{mac}\",");
        builder.Append($"\"server\":\"{String.Join(".", server)}\",");
        builder.Append($"\"ip\":\"{String.Join(".", ip)}\",");

        builder.Append("\"data\":[");
        for (int i = 0; i < length; i++) {
            if (i > 0) builder.Append(',');
            builder.Append(message[i]);
        }
        builder.Append(']');

        builder.Append('}');

        ws.SendAsync(new ArraySegment<byte>(Encoding.UTF8.GetBytes(builder.ToString()), 0, builder.Length), WebSocketMessageType.Text, true, CancellationToken.None);
    }

    private static void HandleReply(byte[] reply, int length, out byte type, out string replyId, out string mac, out byte[] ip, out byte[] server) {
        type = 0;
        replyId = "--";
        mac = String.Empty;
        ip = new byte[4];
        server = new byte[4];

        if (reply is null) return;
        if (length == 0) return;

        //byte hardwareType = buffer[1]; //hardware type
        byte macLength = reply[2];     //hardware address length
        //byte hops = reply[3];

        replyId = $"0x{reply[4]:x2}{reply[5]:x2}{reply[6]:x2}{reply[7]:x2}";
        //int secElapsed = reply[8] * 256 + reply[9];
        //string clientIp = $"{reply[12]}.{reply[13]}.{reply[14]}.{reply[15]}";
        //string offeredIp = $"{reply[16]}.{reply[17]}.{reply[18]}.{reply[19]}";
        //string nextServerIp = $"{reply[20]}.{reply[21]}.{reply[22]}.{reply[23]}";
        //string relayServerIp = $"{reply[24]}.{reply[25]}.{reply[26]}.{reply[27]}";

        //string offerMac = $"{reply[28]:x2}{reply[29]:x2}{reply[30]:x2}{reply[31]:x2}{reply[32]:x2}{reply[33]:x2}"; //client mac
        for (int i = 0; i < macLength; i++) {
            mac += $"{reply[28 + i]:x2}";
        }

        ip[0] = reply[16];
        ip[1] = reply[17];
        ip[2] = reply[18];
        ip[3] = reply[19];

        if (length < 34) return;

        int index = 240;
        while (index < length && reply[index] != 255) {
            byte opt = reply[index++];
            byte len = reply[index++];

            switch (opt) {
            case 53: //type
                type = reply[index];
                break;

            case 54: //dhcp server id
                server[0] = reply[index];
                server[1] = reply[index + 1];
                server[2] = reply[index + 2];
                server[3] = reply[index + 3];
                break;
            }

            index += len;
        }
    }

    private static byte[] Discover(long timestamp, string mac, string hostname, byte[] transactionId, byte[] options) {
        int index = 0;
        byte[] buffer = new byte[352];

        buffer[index++] = 0x01; //message type
        buffer[index++] = 0x00; //hardware type 0:pseudo
        buffer[index++] = 0x06; //mac length
        buffer[index++] = 0x00; //hops

        buffer[index++] = transactionId[0];
        buffer[index++] = transactionId[1];
        buffer[index++] = transactionId[2];
        buffer[index++] = transactionId[3];

        double secElapsed = (DateTime.Now.Ticks - timestamp) / 100_000_000;
        buffer[index++] = 0x00; //seconds elapsed
        buffer[index++] = secElapsed > 255 ? (byte)0xff : (byte)secElapsed;

        buffer[index++] = 0x00; //bootp flags
        buffer[index++] = 0x00;

        buffer[index++] = 0x00; //client ip address
        buffer[index++] = 0x00;
        buffer[index++] = 0x00;
        buffer[index++] = 0x00;

        buffer[index++] = 0x00; //your ip address
        buffer[index++] = 0x00;
        buffer[index++] = 0x00;
        buffer[index++] = 0x00;

        buffer[index++] = 0x00; //next server ip address
        buffer[index++] = 0x00;
        buffer[index++] = 0x00;
        buffer[index++] = 0x00;

        buffer[index++] = 0x00; //relay server ip address
        buffer[index++] = 0x00;
        buffer[index++] = 0x00;
        buffer[index++] = 0x00;

        mac = mac.Replace(":", String.Empty);
        mac = mac.Replace("-", String.Empty);
        if (mac.Length == 12) {
            buffer[index++] = Convert.ToByte(mac[0..2], 16); //client mac address
            buffer[index++] = Convert.ToByte(mac[2..4], 16);
            buffer[index++] = Convert.ToByte(mac[4..6], 16);
            buffer[index++] = Convert.ToByte(mac[6..8], 16);
            buffer[index++] = Convert.ToByte(mac[8..10], 16);
            buffer[index++] = Convert.ToByte(mac[10..12], 16);
        }
        else {
            buffer[index++] = 0x00;
            buffer[index++] = 0x00;
            buffer[index++] = 0x00;
            buffer[index++] = 0x00;
            buffer[index++] = 0x00;
            buffer[index++] = 0x00;
        }

        for (int i = 0; i < 10; i++) {//padding
            buffer[index++] = 0x00;
        }

        for (int i = 0; i < 64; i++) { //server host name
            buffer[index++] = 0x00;
        }
        
        for (int i = 0; i < 128; i++) { //boot file name
            buffer[index++] = 0x00;
        }

        buffer[index++] = 0x63; //magic cookie
        buffer[index++] = 0x82;
        buffer[index++] = 0x53;
        buffer[index++] = 0x63;

        buffer[index++] = 0x35; //dhcp message type
        buffer[index++] = 0x01; //length
        buffer[index++] = 0x01; //1:discover, 2:offer

        buffer[index++] = 0x3d; //opt: client id
        buffer[index++] = 0x07; //length
        buffer[index++] = 0x01; //hardware type: ethernet
        if (mac.Length == 12) {
            buffer[index++] = Convert.ToByte(mac[0..2], 16); //mac address
            buffer[index++] = Convert.ToByte(mac[2..4], 16);
            buffer[index++] = Convert.ToByte(mac[4..6], 16);
            buffer[index++] = Convert.ToByte(mac[6..8], 16);
            buffer[index++] = Convert.ToByte(mac[8..10], 16);
            buffer[index++] = Convert.ToByte(mac[10..12], 16);
        }
        else {
            buffer[index++] = 0x00;
            buffer[index++] = 0x00;
            buffer[index++] = 0x00;
            buffer[index++] = 0x00;
            buffer[index++] = 0x00;
            buffer[index++] = 0x00;
        }

        if (hostname.Length > 0) {
            buffer[index++] = 0x0c; //opt: hostname
            buffer[index++] = (byte)hostname.Length; //length
            for (int i = 0; i < hostname.Length; i++) {
                buffer[index++] = (byte)hostname[i];
            }
        }

        //index: 252

        if (options.Length == 0) {
            buffer[index++] = 0x37; //opt: request list
            buffer[index++] = 0x0e; //length
            buffer[index++] = 0x01; //subnet mask
            buffer[index++] = 0x03; //router
            buffer[index++] = 0x04; //time server
            buffer[index++] = 0x06; //domain name server
            buffer[index++] = 0x0f; //domain name
            buffer[index++] = 0x1f; //perform router discover
            buffer[index++] = 0x21; //static router
            buffer[index++] = 0x2a; //ntp servers
            buffer[index++] = 0x2b; //vendor-specific info
            buffer[index++] = 0x2c; //netbios name server
            buffer[index++] = 0x2e; //netbios node type
            buffer[index++] = 0x2f; //netbios scope
            buffer[index++] = 0x77; //domain search
            buffer[index++] = 0x79; //classless static route
        }
        else {
            int optionsSize = Math.Min(options.Length, 96);

            buffer[index++] = 0x37; //opt: request list
            buffer[index++] = (byte)optionsSize;

            for (int i = 0; i < optionsSize; i++) {
                buffer[index++] = options[i];
            }
        }

        buffer[index++] = 0xff; //end

        //dgram[index++] = 0x00;
        for (int i = 0; i < 15; i++) { //padding
            buffer[index++] = 0x00;
        }

        return buffer;
    }

    private static byte[] Request(long timestamp, byte[] transactionId, string mac, string hostname, byte[] requestedIp, byte[] dhcpServerIp, byte[] options) {
        int index = 0;
        byte[] buffer = new byte[512];

        buffer[index++] = 0x01; //message type
        buffer[index++] = 0x01; //hardware type
        buffer[index++] = 0x06; //mac length
        buffer[index++] = 0x00; //hops

        buffer[index++] = transactionId[0]; //transaction id
        buffer[index++] = transactionId[1];
        buffer[index++] = transactionId[2];
        buffer[index++] = transactionId[3];

        double secElapsed = (DateTime.Now.Ticks - timestamp) / 100_000_000;
        buffer[index++] = 0x00; //seconds elapsed
        buffer[index++] = secElapsed > 255 ? (byte)0xff : (byte)secElapsed;

        buffer[index++] = 0x00; //bootp flags
        buffer[index++] = 0x00;

        buffer[index++] = 0x00; //client ip address
        buffer[index++] = 0x00;
        buffer[index++] = 0x00;
        buffer[index++] = 0x00;

        buffer[index++] = 0x00; //your ip address
        buffer[index++] = 0x00;
        buffer[index++] = 0x00;
        buffer[index++] = 0x00;

        buffer[index++] = 0x00; //next server ip address
        buffer[index++] = 0x00;
        buffer[index++] = 0x00;
        buffer[index++] = 0x00;

        buffer[index++] = 0x00; //relay server ip address
        buffer[index++] = 0x00;
        buffer[index++] = 0x00;
        buffer[index++] = 0x00;

        mac = mac.Replace(":", String.Empty);
        mac = mac.Replace("-", String.Empty);
        if (mac is null || mac.Length == 12) {
            buffer[index++] = Convert.ToByte(mac[0..2], 16); //client mac address
            buffer[index++] = Convert.ToByte(mac[2..4], 16);
            buffer[index++] = Convert.ToByte(mac[4..6], 16);
            buffer[index++] = Convert.ToByte(mac[6..8], 16);
            buffer[index++] = Convert.ToByte(mac[8..10], 16);
            buffer[index++] = Convert.ToByte(mac[10..12], 16);
        }
        else {
            buffer[index++] = 0x00;
            buffer[index++] = 0x00;
            buffer[index++] = 0x00;
            buffer[index++] = 0x00;
            buffer[index++] = 0x00;
            buffer[index++] = 0x00;
        }

        for (int i = 0; i < 10; i++) {//padding
            buffer[index++] = 0x00;
        }

        for (int i = 0; i < 64; i++) { //server host name
            buffer[index++] = 0x00;
        }

        for (int i = 0; i < 128; i++) { //boot file name
            buffer[index++] = 0x00;
        }

        buffer[index++] = 0x63; //magic cookie
        buffer[index++] = 0x82;
        buffer[index++] = 0x53;
        buffer[index++] = 0x63;

        buffer[index++] = 0x35; //DHCP message type
        buffer[index++] = 0x01; //length
        buffer[index++] = 0x03; //1:discover, 2:offer, 3:request, 5:ack

        buffer[index++] = 0x3d; //opt: client id
        buffer[index++] = 0x07; //length
        buffer[index++] = 0x01; //hardware type: ethernet
        if (mac.Length == 12) {
            buffer[index++] = Convert.ToByte(mac[0..2], 16); //mac address
            buffer[index++] = Convert.ToByte(mac[2..4], 16);
            buffer[index++] = Convert.ToByte(mac[4..6], 16);
            buffer[index++] = Convert.ToByte(mac[6..8], 16);
            buffer[index++] = Convert.ToByte(mac[8..10], 16);
            buffer[index++] = Convert.ToByte(mac[10..12], 16);
        }
        else {
            buffer[index++] = 0x00;
            buffer[index++] = 0x00;
            buffer[index++] = 0x00;
            buffer[index++] = 0x00;
            buffer[index++] = 0x00;
            buffer[index++] = 0x00;
        }

        buffer[index++] = 0x32; //opt: requested ip Address
        buffer[index++] = 0x04; //length
        buffer[index++] = requestedIp[0]; //ip address
        buffer[index++] = requestedIp[1];
        buffer[index++] = requestedIp[2];
        buffer[index++] = requestedIp[3];

        buffer[index++] = 0x36; //opt: dhcp 
        buffer[index++] = 0x04; //length
        buffer[index++] = dhcpServerIp[0]; //ip address
        buffer[index++] = dhcpServerIp[1];
        buffer[index++] = dhcpServerIp[2];
        buffer[index++] = dhcpServerIp[3];

        if (hostname.Length > 0) {
            buffer[index++] = 0x0c; //opt: hostname
            buffer[index++] = (byte)hostname.Length; //length
            for (int i = 0; i < hostname.Length; i++) {
                buffer[index++] = (byte)hostname[i];
            }
        }

        //index: 264

        if (options.Length == 0) {
            buffer[index++] = 0x37; //opt: request list
            buffer[index++] = 0x0e; //length
            buffer[index++] = 0x01; //subnet mask
            buffer[index++] = 0x03; //router
            buffer[index++] = 0x04; //time server
            buffer[index++] = 0x06; //domain name server
            buffer[index++] = 0x0f; //domain name
            buffer[index++] = 0x1f; //perform router discover
            buffer[index++] = 0x21; //static router
            buffer[index++] = 0x2a; //ntp servers
            buffer[index++] = 0x2b; //vendor-specific info
            buffer[index++] = 0x2c; //netbios name server
            buffer[index++] = 0x2e; //netbios node type
            buffer[index++] = 0x2f; //netbios scope
            buffer[index++] = 0x77; //domain search
            buffer[index++] = 0x79; //classless static route
        }
        else {
            int optionsSize = Math.Min(options.Length, 96);

            buffer[index++] = 0x37; //opt: request list
            buffer[index++] = (byte)optionsSize;

            for (int i = 0; i < optionsSize; i++) {
                buffer[index++] = options[i];
            }
        }

        buffer[index++] = 0xff; //end

        return buffer;
    }

    private static string DhcpMessageTypeToString(int value) {
        return value switch {
            1 => "discover",
            2 => "offer",
            3 => "request",
            4 => "decline",
            5 => "acknowledge",
            6 => "negative acknowledgment",
            7 => "release",
            8 => "informational",
            9 => "force renew",
            _ => $"({value}) unknown type"
        };
    }
}

using System;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Text;

static class NetBios {

    static byte[] NameRequest = new byte[]{
            0x80, 0x94, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x20, 0x43, 0x4b, 0x41,
            0x41, 0x41, 0x41, 0x41, 0x41, 0x41, 0x41, 0x41,
            0x41, 0x41, 0x41, 0x41, 0x41, 0x41, 0x41, 0x41,
            0x41, 0x41, 0x41, 0x41, 0x41, 0x41, 0x41, 0x41,
            0x41, 0x41, 0x41, 0x41, 0x41, 0x00, 0x00, 0x21,
            0x00, 0x01 };

    public static string GetBiosName(in string ip) {
        byte[] receiveBuffer = new byte[1024];
        Socket requestSocket = new Socket(AddressFamily.InterNetwork, SocketType.Dgram, ProtocolType.Udp);
        requestSocket.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.ReceiveTimeout, 1000);
        
        EndPoint remoteEndpoint = new IPEndPoint(IPAddress.Parse(ip), 137);
        IPEndPoint originEndpoint = new IPEndPoint(IPAddress.Any, 0);
        requestSocket.Bind(originEndpoint);
        requestSocket.SendTo(NameRequest, remoteEndpoint);

        try {
            int receivedByteCount = requestSocket.ReceiveFrom(receiveBuffer, ref remoteEndpoint);
            if (receivedByteCount >= 90) {
                Encoding enc = new ASCIIEncoding();

                Console.WriteLine(enc.GetString(receiveBuffer));

                string deviceName = enc.GetString(receiveBuffer, 57, 16).Trim();
                //string networkName = enc.GetString(receiveBuffer, 75, 16).Trim();
                return deviceName;
            }
        } catch { }

        return null;
    }

}
using System;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading.Tasks;

public static class NetBios {

    static readonly byte[] BIOS_NAME_REQUEST = new byte[]{
            0x80, 0x94, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x20, 0x43, 0x4b, 0x41,
            0x41, 0x41, 0x41, 0x41, 0x41, 0x41, 0x41, 0x41,
            0x41, 0x41, 0x41, 0x41, 0x41, 0x41, 0x41, 0x41,
            0x41, 0x41, 0x41, 0x41, 0x41, 0x41, 0x41, 0x41,
            0x41, 0x41, 0x41, 0x41, 0x41, 0x00, 0x00, 0x21,
            0x00, 0x01 };

    public static string GetBiosName(in string ip) {
        if (ip is null) return null;

        using Socket requestSocket = new Socket(AddressFamily.InterNetwork, SocketType.Dgram, ProtocolType.Udp);
        requestSocket.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.ReceiveTimeout, 1000);

        try {
            EndPoint remoteEndpoint = new IPEndPoint(IPAddress.Parse(ip), 137);
            requestSocket.Bind(new IPEndPoint(IPAddress.Any, 0));
            requestSocket.SendTo(BIOS_NAME_REQUEST, remoteEndpoint);

            byte[] receiveBuffer = new byte[1024];
            int receivedByteCount = requestSocket.ReceiveFrom(receiveBuffer, ref remoteEndpoint);
            if (receivedByteCount >= 90) {
                Encoding enc = new ASCIIEncoding();

                string biosName = enc.GetString(receiveBuffer, 57, 16).Trim();
                //string networkName = enc.GetString(receiveBuffer, 75, 16).Trim();
                return biosName;
            }
        } catch { }

        return null;
    }

    public static async Task<string> GetBiosNameAsync(string host) {
        using UdpClient client = new UdpClient();
        try {
            await client.SendAsync(BIOS_NAME_REQUEST, BIOS_NAME_REQUEST.Length, host, 137);

            IAsyncResult asyncResult = client.BeginReceive(null, null);
            asyncResult.AsyncWaitHandle.WaitOne(TimeSpan.FromMilliseconds(2000));

            if (asyncResult.IsCompleted) {
                IPEndPoint remoteEP = null;
                byte[] buffer = client.EndReceive(asyncResult, ref remoteEP);

                Encoding enc = new ASCIIEncoding();
                string biosName = enc.GetString(buffer, 57, 16).Trim();

                int spIdx = biosName.IndexOf(" ");
                if (spIdx > -1) biosName = biosName.Substring(0, spIdx);

                return biosName;

            } else //time out
                return "";

        } catch {
            return "";
        }
    }

}
using System.Net.Sockets;
using System.Net;
using System.Text;
using System.Threading.Tasks;

namespace Protest.Protocols;

internal static class NetBios {
    static readonly byte[] BIOS_NAME_REQUEST = new byte[] {
            0x80, 0x94, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x20, 0x43, 0x4b, 0x41,
            0x41, 0x41, 0x41, 0x41, 0x41, 0x41, 0x41, 0x41,
            0x41, 0x41, 0x41, 0x41, 0x41, 0x41, 0x41, 0x41,
            0x41, 0x41, 0x41, 0x41, 0x41, 0x41, 0x41, 0x41,
            0x41, 0x41, 0x41, 0x41, 0x41, 0x00, 0x00, 0x21,
            0x00, 0x01
    };

    public static string GetBiosName(in string ip) {
        if (ip is null) return null;

        using Socket socket = new Socket(AddressFamily.InterNetwork, SocketType.Dgram, ProtocolType.Udp);
        socket.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.ReceiveTimeout, 1000);

        try {
            EndPoint remoteEndpoint = new IPEndPoint(IPAddress.Parse(ip), 137);
            socket.Bind(new IPEndPoint(IPAddress.Any, 0));
            socket.SendTo(BIOS_NAME_REQUEST, remoteEndpoint);

            byte[] receiveBuffer = new byte[1024];
            int receivedByteCount = socket.ReceiveFrom(receiveBuffer, ref remoteEndpoint);
            if (receivedByteCount >= 90) {
                Encoding enc = new ASCIIEncoding();

                if (receiveBuffer[72] == 0) {
                    return enc.GetString(receiveBuffer, 57, 15).Trim();
                }
                else {
                    return enc.GetString(receiveBuffer, 57, 16).Trim();
                }
            }
        }
        catch { }

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

                int nameIndex = biosName.IndexOf(" ");
                if (nameIndex > -1) biosName = biosName[..nameIndex];

                return biosName;

            }
            else { //time out
                return String.Empty;
            }
        }
        catch {
            return String.Empty;
        }
    }
}
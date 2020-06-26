using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading.Tasks;

static class Ntp {
    public static string NtpRequest(string server = "time.google.com", int timeout = 3000) {       
        byte[] data = new byte[48];
        data[0] = 0xDB; //Leap Indicator
        
        try {
            IPAddress address = System.Net.Dns.GetHostEntry(server).AddressList[0];
            var remoteEndPoint = new IPEndPoint(address, 123);
            using (var socket = new Socket(AddressFamily.InterNetwork, SocketType.Dgram, ProtocolType.Udp)) {
                socket.Connect(remoteEndPoint);

                socket.ReceiveTimeout = timeout;

                socket.Send(data);
                socket.Receive(data);
                socket.Close();
            }
        } catch {
            return null;
        }

        //ulong reference = FlipBits(BitConverter.ToUInt32(data, 16)) * 1000 + FlipBits(BitConverter.ToUInt32(data, 20)) * 1000 / 0x100000000L;
        //ulong origin    = FlipBits(BitConverter.ToUInt32(data, 24)) * 1000 + FlipBits(BitConverter.ToUInt32(data, 28)) * 1000 / 0x100000000L;
        //ulong reveive   = FlipBits(BitConverter.ToUInt32(data, 32)) * 1000 + FlipBits(BitConverter.ToUInt32(data, 36)) * 1000 / 0x100000000L;
        ulong transmit  = FlipBits(BitConverter.ToUInt32(data, 40)) * 1000 + FlipBits(BitConverter.ToUInt32(data, 44)) * 1000 / 0x100000000L;

        DateTime transmit_time = new DateTime(1900, 1, 1, 0, 0, 0, DateTimeKind.Utc).AddMilliseconds(transmit);
        DateTime local_time = transmit_time.ToLocalTime();

        return $"{{\"transmit\":\"{transmit_time.ToString(Strings.TIME_FORMAT_MILLI)}\",\"local\":\"{local_time.ToString(Strings.TIME_FORMAT_MILLI)}\"}}";
    }
    
    static ulong FlipBits(ulong n) {
        return (uint)(((n & 0xff000000) >> 24) + ((n & 0x00ff0000) >> 8) + ((n & 0x0000ff00) << 8) + ((n & 0x000000ff) << 24));
    }

}
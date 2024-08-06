using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.Tasks;

using static Protest.Protocols.Dns;

namespace Protest.Protocols;

internal class Mdns {

    public static byte[] Resolve(Dictionary<string, string> parameters) {
        if (parameters is null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        parameters.TryGetValue("query", out string query);
        parameters.TryGetValue("type", out string typeString);
        parameters.TryGetValue("timeout", out string timeoutString);

        if (!int.TryParse(Uri.UnescapeDataString(timeoutString), out int timeout)) {
            timeout = 3000;
        }

        timeout = Math.Max(timeout, 500);

        RecordType type = type = Uri.UnescapeDataString(typeString) switch {
            "A"     => RecordType.A,
            "NS"    => RecordType.NS,
            "CNAME" => RecordType.CNAME,
            "SOA"   => RecordType.SOA,
            "PTR"   => RecordType.PTR,
            "MX"    => RecordType.MX,
            "TXT"   => RecordType.TXT,
            "AAAA"  => RecordType.AAAA,
            "SRV"   => RecordType.SRV,
            "ANY"   => RecordType.ANY,
            _       => RecordType.A,
        };

        return Resolve(query, timeout, type);
    }

    public static byte[] Resolve(string queryString, int timeout = 3000, RecordType type = RecordType.A) {
        /*try*/ {


            IPEndPoint remote = new IPEndPoint(IPAddress.Parse("224.0.0.251"), 5353);
            IPEndPoint local = new IPEndPoint(IPAddress.Any, 5353);

            byte[] query = ConstructQuery(queryString, type);
            long timestamp = DateTime.Now.Ticks;

            using Socket socket = new Socket(AddressFamily.InterNetwork, SocketType.Dgram, ProtocolType.Udp);
            socket.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.ReuseAddress, true);
            socket.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.DontRoute, true);
            socket.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.Broadcast, true);
            socket.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.ReceiveTimeout, timeout);
            socket.Bind(local);

            socket.SendTo(query, remote);


            using UdpClient udpClient = new UdpClient();
            udpClient.EnableBroadcast = true;


            List<byte[]> receivedData = new List<byte[]>();
            DateTime endTime = DateTime.Now.AddMilliseconds(timeout);

            while (DateTime.Now < endTime) {
                int length = 0;
                byte[] reply = new byte[2048];

                Console.WriteLine(length);


                try {
                    length = socket.Receive(reply);
                }
                catch {}
            }


            return ParseResponses(receivedData);
        }
        /*catch (Exception ex) {
            Console.WriteLine($"Error: {ex.Message}");
            return "{\"error\":\"unknown error\",\"errorcode\":\"0\"}"u8.ToArray();
        }*/
    }

    private static byte[] ConstructQuery(string queryString, RecordType type) {
        using MemoryStream ms = new MemoryStream();
        using BinaryWriter bw = new BinaryWriter(ms);

        // Transaction ID
        bw.Write((ushort)0); // 0 for mDNS

        // Flags
        bw.Write((ushort)0x0100); // Standard query

        // Questions
        bw.Write((ushort)1); // One question

        // Answer RRs
        bw.Write((ushort)0);

        // Authority RRs
        bw.Write((ushort)0);

        // Additional RRs
        bw.Write((ushort)0);

        // Write the question
        foreach (string label in queryString.Split('.')) {
            bw.Write((byte)label.Length);
            bw.Write(Encoding.UTF8.GetBytes(label));
        }
        bw.Write((byte)0); // End of the name

        // Write the type and class
        bw.Write((ushort)type); // Type A
        bw.Write((ushort)0x0001); // Class IN with unicast response

        byte[] query = ms.ToArray();

        return query;
    }

    private static byte[] ParseResponses(List<byte[]> responses) {
        List<Answer> allAnswers = new List<Answer>();

        foreach (byte[] response in responses) {
            ushort answerCount, authorityCount, additionalCount;
            Answer[] answers = Dns.DeconstructResponse(response, out answerCount, out authorityCount, out additionalCount);
            allAnswers.AddRange(answers);
        }

        return JsonSerializer.SerializeToUtf8Bytes(new { answer = allAnswers });
    }
}
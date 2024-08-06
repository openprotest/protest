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

internal class MulticastDns {

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

        Console.WriteLine(query);
        Console.WriteLine(timeout);
        Console.WriteLine(type);
        Console.WriteLine();

        return Resolve(query, timeout, type).Result;
    }

    public static async Task<byte[]> Resolve(string queryString, int timeout = 3000, RecordType type = RecordType.A) {
        try {
            using UdpClient udpClient = new UdpClient();
            udpClient.EnableBroadcast = true;
            udpClient.Client.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.ReuseAddress, true);

            IPEndPoint multicastEndPoint = new IPEndPoint(IPAddress.Parse("224.0.0.251"), 5353);
            IPEndPoint localEndPoint = new IPEndPoint(IPAddress.Any, 5353);

            udpClient.Client.Bind(localEndPoint);

            byte[] query = ConstructQuery(queryString, type);

            await udpClient.SendAsync(query, query.Length, multicastEndPoint);

            List<byte[]> receivedData = new List<byte[]>();
            DateTime endTime = DateTime.Now.AddMilliseconds(timeout);

            while (DateTime.Now < endTime) {
                Task<UdpReceiveResult> receiveTask = udpClient.ReceiveAsync();
                if (await Task.WhenAny(receiveTask, Task.Delay(timeout)) == receiveTask) {
                    UdpReceiveResult response = receiveTask.Result;
                    receivedData.Add(response.Buffer);

                    Console.WriteLine(response.ToString());

                }
                else {
                    break;
                }
            }

            return ParseResponses(receivedData);
        }
        catch {
            return "{\"error\":\"unknown error\",\"errorcode\":\"0\"}"u8.ToArray();
        }
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
        bw.Write((ushort)0x8001); // Class IN with unicast response

        byte[] query = ms.ToArray();

        return query;
    }

    private static byte[] ParseResponses(List<byte[]> responses) {
        List<Answer> allAnswers = new List<Answer>();

        foreach (byte[] response in responses) {
            ushort answerCount, authorityCount, additionalCount;
            Answer[] answers = DeconstructResponse(response, out answerCount, out authorityCount, out additionalCount);
            allAnswers.AddRange(answers);
        }

        return JsonSerializer.SerializeToUtf8Bytes(new { answer = allAnswers });
    }
}
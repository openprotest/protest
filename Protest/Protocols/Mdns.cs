using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Security.Claims;
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
        IPAddress multicast = IPAddress.Parse("224.0.0.251");

        IPEndPoint remote = new IPEndPoint(multicast, 5353);
        IPEndPoint local = new IPEndPoint(IPAddress.Any, 5353); //IPAddress.Any

        byte[] query = ConstructQuery(queryString, type);

        /*try*/ {
            using Socket socket = new Socket(AddressFamily.InterNetwork, SocketType.Dgram, ProtocolType.Udp);
            socket.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.ReuseAddress, true);
            socket.Bind(local);
            socket.SetSocketOption(SocketOptionLevel.IP, SocketOptionName.AddMembership, new MulticastOption(multicast));

            socket.SendTo(query, remote);

            List<byte[]> receivedData = new List<byte[]>();
            DateTime endTime = DateTime.Now.AddMilliseconds(timeout);

            while (DateTime.Now < endTime) {
                int length = -1;
                byte[] reply = new byte[2048];

                try {
                    length = socket.Receive(reply);
                    Console.WriteLine(length);
                    if (length > 0) {
                        byte[] actualReply = new byte[length];
                        Array.Copy(reply, actualReply, length);
                        receivedData.Add(actualReply);
                    }
                }
                catch (Exception ex) {
                    Console.WriteLine(ex.ToString());
                }
            }

            List<Answer> answers = new List<Answer>();

            foreach (byte[] response in receivedData) {
                ushort answerCount, authorityCount, additionalCount;
                Answer[] answer = DeconstructResponse(response, out answerCount, out authorityCount, out additionalCount);
                if (answerCount == 0 && authorityCount == 0 && additionalCount == 0) { continue; }
                answers.AddRange(answer);
            }

            StringBuilder builder = new StringBuilder();

            builder.Append('{');

            if (answers.Count > 0 && answers[0].error > 0) {
                string errorMessage = answers[0].error switch {
                    0 => "no error",
                    1 => "query format error",
                    2 => "server failure",
                    3 => "no such name",
                    4 => "function not implemented",
                    5 => "refused",
                    6 => "name should not exist",
                    7 => "RRset should not exist",
                    8 => "server not authoritative for the zone",
                    9 => "name not in zone",
                    _ => "unknown error"
                };
                builder.Append($"\"error\":\"{errorMessage}\",\"errorcode\": \"{answers[0].error}\",");
            }

            builder.Append("\"req\":[],");
            builder.Append("\"res\":[],");

            builder.Append("\"answer\":[");
            int count = 0;
            for (int i = 0; i < answers.Count; i++) {
                if (answers[i].isAuthoritative || answers[i].isAdditional) continue;

                if (count > 0) builder.Append(',');

                Console.WriteLine("t: " + answers[i].type);

                builder.Append('{');
                switch (answers[i].type) {
                case RecordType.A:
                    builder.Append("\"type\":\"A\",");
                    builder.Append($"\"name\":\"{String.Join(".", answers[i].name)}\",");
                    break;

                case RecordType.NS:
                    builder.Append("\"type\":\"NS\",");
                    builder.Append($"\"name\":\"{Dns.LabelsToString(answers[i].name, 0, receivedData[i], out _)}\",");
                    break;

                case RecordType.CNAME:
                    builder.Append("\"type\":\"CNAME\",");
                    builder.Append($"\"name\":\"{Dns.LabelsToString(answers[i].name, 0, receivedData[i], out _)}\",");
                    break;

                case RecordType.SOA:
                    builder.Append("\"type\":\"SOA\",");
                    builder.Append($"\"name\":\"{Dns.LabelsToString(answers[i].name, 0, receivedData[i], out _)}\",");
                    break;

                case RecordType.PTR:
                    builder.Append("\"type\":\"PTR\",");
                    builder.Append($"\"name\":\"{Dns.LabelsToString(answers[i].name, 0, receivedData[i], out _)}\",");
                    break;

                case RecordType.MX:
                    builder.Append("\"type\":\"MX\",");
                    builder.Append($"\"name\":\"{Dns.LabelsToString(answers[i].name, 0, receivedData[i], out _)}\",");
                    break;

                case RecordType.TXT:
                    builder.Append("\"type\":\"TXT\",");
                    builder.Append($"\"name\":\"{Dns.LabelsToString(answers[i].name, 0, receivedData[i], out _)}\",");
                    break;

                case RecordType.AAAA:
                    builder.Append("\"type\":\"AAAA\",");
                    if (answers[i].name.Length != 16) {
                        builder.Append($"\"name\":\"\"");
                        break;
                    }

                    builder.Append($"\"name\":\"");
                    for (int j = 0; j < 16; j += 2) {
                        if (j > 0) builder.Append(':');
                        ushort word = (ushort)((answers[i].name[j] << 8) | answers[i].name[j + 1]);
                        builder.Append(word.ToString("x4"));
                    }

                    builder.Append("\",");
                    break;

                case RecordType.SRV:
                    builder.Append("\"type\":\"SRV\",");
                    builder.Append($"\"name\":\"{String.Join(".", answers[i].name)}\",");
                    break;
                }

                builder.Append($"\"ttl\":\"{answers[i].ttl}\"");

                builder.Append('}');

                count++;
            }
            builder.Append(']');

            builder.Append('}');

            return Encoding.UTF8.GetBytes(builder.ToString());
        }
        /*catch (Exception ex) {
            Console.WriteLine($"Error: {ex.Message}");
            return "{\"error\":\"unknown error\",\"errorcode\":\"0\"}"u8.ToArray();
        }*/
    }

    private static byte[] ConstructQuery(string queryString, RecordType type) {
        using MemoryStream ms = new MemoryStream();
        using BinaryWriter bw = new BinaryWriter(ms);

        int len = 12;
        string[] label = queryString.Split('.');

        for (int i = 0; i < label.Length; i++) {
            len += label[i].Length + 1;
        }
        len += 5; //1[null] + 2[type] + 2[class]


        byte[] query = new byte[len];


        //transaction id
        Random rand = new Random();
        query[0] = (byte)rand.Next(0, 255);
        query[1] = (byte)rand.Next(0, 255);

        //flags
        query[2] = (byte)0x00;
        query[3] = (byte)0x00;

        //questions
        query[4] = (byte)0x00;
        query[5] = (byte)0x01;

        //answer RRs
        query[6] = (byte)0x00;
        query[7] = (byte)0x00;

        //authority RRs
        query[8] = (byte)0x00;
        query[9] = (byte)0x00;

        //additional RRs
        query[10] = (byte)0x00;
        query[11] = (byte)0x00;

        //question
        short index = 12;
        for (int i = 0; i < label.Length; i++) {
            query[index++] = (byte)label[i].Length;
            for (int j = 0; j < label[i].Length; j++) {
                query[index++] = (byte)label[i][j];
            }
        }

        query[index++] = 0x00; //null termination

        query[index++] = 0x00; //type
        query[index++] = (byte)type;

        query[index++] = 0x00; //class
        query[index++] = (byte)Dns.Class.IN;

        return query;
    }

    public static Answer[] DeconstructResponse(byte[] response, out ushort answerCount, out ushort authorityCount, out ushort additionalCount) {
        //ushort transactionId = BitConverter.ToUInt16(response, 0);
        //ushort flags         = BitConverter.ToUInt16(response, 2);

        ushort questionCount = (ushort)((response[4] << 8) | response[5]);
        answerCount = (ushort)((response[6] << 8) | response[7]);
        authorityCount = (ushort)((response[8] << 8) | response[9]);
        additionalCount = (ushort)((response[10] << 8) | response[11]);

        bool isResponse = (response[2] & 0b10000000) == 0b10000000;
        byte error = (byte)(response[3] & 0b00001111);

        if (error > 0) {
            return new Answer[] { new Answer { error = error } };
        }

        int index = 12;

        for (int i = 0; i < questionCount; i++) { //skip questions
            while (index < response.Length) {
                byte len = response[index++];
                if (len == 0) break;
                index += len;
            }
            index += 2; //skip type
            index += 2; //skip class
        }

        Answer[] result = new Answer[answerCount + authorityCount + additionalCount];

        if (result.Length == 0) {
            return result;
        }

        int count = 0;
        while (index < response.Length) {
            Answer a = new Answer();

            index += 2; //skip name

            a.type = (RecordType)((response[index] << 8) | response[index + 1]);
            index += 2;

            index += 2; //skip class

            a.ttl = (response[index] << 24) | (response[index + 1] << 16) | (response[index + 2] << 8) | response[index + 3];
            index += 4;

            a.length = (ushort)((response[index] << 8) | response[index + 1]);
            index += 2;

            if (a.type == RecordType.MX) {
                a.length -= 2;
                index += 2; //skip preference
            }

            a.name = new byte[a.length];
            for (int i = 0; i < a.length && index < response.Length; i++) {
                a.name[i] = response[index++];
            }

            if (count > answerCount + authorityCount) {
                a.isAdditional = true;
            }
            else if (count > answerCount) {
                a.isAuthoritative = true;
            }

            result[count++] = a;
        }

        return result;
    }
}
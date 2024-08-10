using Microsoft.AspNetCore.Identity.UI.Services;
using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading.Tasks;

using static Protest.Protocols.Dns;

namespace Protest.Protocols;

internal class Mdns {

    private static readonly IPAddress MDNS_MULTICAST_ADDRESS_V4 = IPAddress.Parse("224.0.0.251");
    private static readonly IPAddress MDNS_MULTICAST_ADDRESS_V6 = IPAddress.Parse("ff02::fb");
    private static readonly int MDNS_PORT = 5353;

    private struct Answer {
        public RecordType type;
        public int ttl;
        public ushort length;
        public string questionString;
        public string answerString;
        public IPAddress remote;
        public bool isAuthoritative;
        public bool isAdditional;
        public byte error;
    }

    public static byte[] Resolve(Dictionary<string, string> parameters) {
        if (parameters is null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        parameters.TryGetValue("query", out string query);
        parameters.TryGetValue("type", out string typeString);
        parameters.TryGetValue("timeout", out string timeoutString);

        if (!int.TryParse(Uri.UnescapeDataString(timeoutString), out int timeout)) {
            timeout = 2000;
        }

        timeout = Math.Max(timeout, 500);

        RecordType type = Uri.UnescapeDataString(typeString) switch {
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

    public static byte[] Resolve(string queryString, int timeout = 2000, RecordType type = RecordType.A) {
        byte[] query = ConstructQuery(queryString, type);
        List<byte[]> receivedData = new List<byte[]>();
        List<IPAddress> sender = new List<IPAddress>();

        IPAddress[] nics = IpTools.GetIpAddresses();
        for (int i = 0; i < nics.Length && receivedData.Count == 0; i++) {
            if (IPAddress.IsLoopback(nics[i])) { continue; }

            IPAddress localAddress = nics[i];
            IPEndPoint localEndPoint = new IPEndPoint(localAddress, MDNS_PORT);

            IPEndPoint remoteEndPoint;
            Socket socket = null;
            try {
                if (localAddress.AddressFamily == AddressFamily.InterNetwork) {
                    socket = new Socket(AddressFamily.InterNetwork, SocketType.Dgram, ProtocolType.Udp);
                    socket.SetSocketOption(SocketOptionLevel.IP, SocketOptionName.AddMembership, new MulticastOption(MDNS_MULTICAST_ADDRESS_V4, localAddress));
                    remoteEndPoint = new IPEndPoint(MDNS_MULTICAST_ADDRESS_V4, MDNS_PORT);
                }
                else if (localAddress.AddressFamily == AddressFamily.InterNetworkV6) {
                    socket = new Socket(AddressFamily.InterNetworkV6, SocketType.Dgram, ProtocolType.Udp);
                    socket.SetSocketOption(SocketOptionLevel.IPv6, SocketOptionName.AddMembership, new IPv6MulticastOption(MDNS_MULTICAST_ADDRESS_V6));
                    remoteEndPoint = new IPEndPoint(MDNS_MULTICAST_ADDRESS_V6, MDNS_PORT);
                }
                else {
                    continue;
                }

                socket.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.ReuseAddress, true);
                socket.Bind(localEndPoint);

                socket.ReceiveTimeout = timeout;

                socket.SendTo(query, remoteEndPoint);

                DateTime endTime = DateTime.Now.AddMilliseconds(timeout);

                while (DateTime.Now <= endTime) {
                    byte[] reply = new byte[1024];

                    try {
                        EndPoint remoteEP = new IPEndPoint(IPAddress.Any, 0);
                        int length = socket.ReceiveFrom(reply, ref remoteEP);

                        if (length > 0) {
                            byte[] actualReply = new byte[length];
                            Array.Copy(reply, actualReply, length);

                            receivedData.Add(actualReply);
                            sender.Add(((IPEndPoint)remoteEP).Address);
                        }
                    }
                    catch { }
                }
            }
            catch { }
            finally {
                socket?.Dispose();
            }
        }

        List<byte[]> matchingData = new List<byte[]>();
        List<Answer> answers = new List<Answer>();

        try {
            for (int i = 0; i < receivedData.Count; i++) {
                byte[] response = receivedData[i];
                ushort answerCount, authorityCount, additionalCount;
                Answer[] answer = DeconstructResponse(response, type, sender[i], out answerCount, out authorityCount, out additionalCount);
                bool matched = false;

                for (int j = 0; j < answer.Length; j++) {
                    if (type != RecordType.ANY && answer[j].type != type) { continue; }
                    if (!answer[j].questionString.Equals(queryString, StringComparison.OrdinalIgnoreCase)) { continue; }

                    answers.Add(answer[j]);
                    if (!matched) {
                        matched = true;
                        matchingData.Add(response);
                    }
                }
            }

        }
        catch {
            return "{\"error\":\"unknown error\",\"errorcode\":\"0\"}"u8.ToArray();
        }

        return Serialize(query, matchingData, answers);
    }

    private static byte[] ConstructQuery(string queryString, RecordType type) {
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
        query[2] = 0x00;
        query[3] = 0x00;

        //questions
        query[4] = 0x00;
        query[5] = 0x01;

        //answer RRs
        query[6] = 0x00;
        query[7] = 0x00;

        //authority RRs
        query[8] = 0x00;
        query[9] = 0x00;

        //additional RRs
        query[10] = 0x00;
        query[11] = 0x00;

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

    private static Answer[] DeconstructResponse(byte[] response, RecordType queryType, IPAddress remoteEndPoint, out ushort answerCount, out ushort authorityCount, out ushort additionalCount) {
        if (response.Length < 12) {
            answerCount = 0;
            authorityCount = 0;
            additionalCount = 0;
            return new Answer[] { new Answer { error = 254 } };
        }

        //ushort transactionId = BitConverter.ToUInt16(response, 0);
        //ushort flags         = BitConverter.ToUInt16(response, 2);
        ushort questionCount = (ushort)((response[4] << 8) | response[5]);
        answerCount          = (ushort)((response[6] << 8) | response[7]);
        authorityCount       = (ushort)((response[8] << 8) | response[9]);
        additionalCount      = (ushort)((response[10] << 8) | response[11]);

        byte error = (byte)(response[3] & 0b00001111);
        if (error > 0) {
            return new Answer[] { new Answer { error = error } };
        }

        int index = 12;

        for (int i = 0; i < questionCount; i++) { //skip questions section
            while (index < response.Length) {
                byte len = response[index++];
                if (len == 0) break;
                index += len;
            }
            index += 4; //skip type and class
        }

        List<Answer> result = new List<Answer>();

        for (int i = 0; i < answerCount + authorityCount + additionalCount; i++) {
            if (index >= response.Length) {
                break;
            }

            Answer ans = new Answer();
            ans.remote = remoteEndPoint;

            int nameStartIndex;

            if ((response[index] & 0xFF) == 0xC0) { //pointer
                nameStartIndex = response[index+1];
                index += 2;
            }
            else {
                nameStartIndex = index;
                while (index < response.Length && response[index] != 0) {
                    index += response[index] + 1;
                }
                index++; //null-termination byte
            }

            if (index + 10 > response.Length) {
                ans.error = 254;
                break;
            }

            ans.type = (RecordType)((response[index] << 8) | response[index + 1]);
            index += 2;

            index += 2; //skip class

            ans.ttl = (response[index] << 24) | (response[index + 1] << 16) | (response[index + 2] << 8) | response[index + 3];
            index += 4;

            ans.length = (ushort)((response[index] << 8) | response[index + 1]);
            index += 2;

            switch (ans.type) {
            case RecordType.A:
                if (ans.length == 4 && index + 4 <= response.Length) {
                    ans.answerString = $"{response[index]}.{response[index + 1]}.{response[index + 2]}.{response[index + 3]}";
                    index += 4;
                }
                break;

            case RecordType.AAAA:
                if (ans.length == 16 && index + 16 <= response.Length) {
                    ans.answerString = string.Join(":", Enumerable.Range(0, 8)
                        .Select(j => ((response[index + 2 * j] << 8) | response[index + 2 * j + 1]).ToString("x4")));
                    index += 16;
                }
                break;

            case RecordType.MX:
                if (index + 2 <= response.Length) {
                    //preference = (ushort)((response[index] << 8) | response[index + 1]);
                    index += 2;
                    ans.answerString = ExtractName(response, index);
                }
                break;

            case RecordType.CNAME:
            case RecordType.NS:
            case RecordType.PTR:
                ans.answerString = ExtractName(response, index);
                break;

            default:
                ans.answerString = String.Empty; //BitConverter.ToString(response, index, ans.length);
                index += ans.length;
                break;
            }

            //if (ans.length > response.Length - ans.length) {
            //    ans.error = 254;
            //    break;
            //}

            ans.questionString = ExtractName(response, nameStartIndex);

            if (i >= answerCount + authorityCount) {
                ans.isAdditional = true;
            }
            else if (i >= answerCount) {
                ans.isAuthoritative = true;
            }

            result.Add(ans);
        }

        return result.ToArray();
    }

    private static string ExtractName(byte[] response, int startIndex) {
        StringBuilder name = new StringBuilder();
        int index = startIndex;

        while (response[index] != 0) {
            if ((response[index] & 0xC0) == 0xC0) {
                //compressed name
                int pointer = ((response[index] & 0x3F) << 8) | response[index + 1];
                name.Append(ExtractName(response, pointer));
                break;
            }
            else {
                int length = response[index++];
                for (int i = 0; i < length; i++) {
                    name.Append((char)response[index++]);
                }
                name.Append('.');
            }
        }
        if (name.Length > 0) {
            name.Length--; //remove trailing dot
        }
        return name.ToString();
    }

    private static byte[] Serialize(byte[] query, List<byte[]> data, List<Answer> answers) {
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
                254 => "invalid response",
                _ => "unknown error"
            };
            builder.Append($"\"error\":\"{errorMessage}\",\"errorcode\": \"{answers[0].error}\",");
        }

        builder.Append("\"req\":[");
        for (int i = 0; i < query.Length; i++) {
            if (i > 0) builder.Append(',');
            builder.Append(query[i]);
        }
        builder.Append("],");

        builder.Append("\"res\":[");
        bool first = true;
        for (int i = 0; i < data.Count; i++) {
            if (!first) builder.Append(',');

            builder.Append('[');
            for (int j = 0; j < data[i].Length; j++) {
                if (j > 0) builder.Append(',');
                builder.Append(data[i][j]);
            }
            builder.Append(']');
            first = false;
        }
        builder.Append("],");

        builder.Append("\"answer\":[");
        int count = 0;
        for (int i = 0; i < answers.Count; i++) {
            if (answers[i].isAuthoritative || answers[i].isAdditional) continue;

            if (count > 0) builder.Append(',');

            builder.Append('{');

            switch (answers[i].type) {
            case RecordType.A:
                builder.Append("\"type\":\"A\",");
                builder.Append($"\"name\":\"{answers[i].answerString}\",");
                break;

            case RecordType.NS:
                builder.Append("\"type\":\"NS\",");
                builder.Append($"\"name\":\"{answers[i].answerString}\",");
                break;

            case RecordType.CNAME:
                builder.Append("\"type\":\"CNAME\",");
                builder.Append($"\"name\":\"{answers[i].answerString}\",");
                break;

            case RecordType.SOA:
                builder.Append("\"type\":\"SOA\",");
                builder.Append($"\"name\":\"{answers[i].answerString}\",");
                break;

            case RecordType.PTR:
                builder.Append("\"type\":\"PTR\",");
                builder.Append($"\"name\":\"{answers[i].answerString}\",");
                break;

            case RecordType.MX:
                builder.Append("\"type\":\"MX\",");
                builder.Append($"\"name\":\"{answers[i].answerString}\",");
                break;

            case RecordType.TXT:
                builder.Append("\"type\":\"TXT\",");
                builder.Append($"\"name\":\"{answers[i].answerString}\",");
                break;

            case RecordType.AAAA:
                builder.Append("\"type\":\"AAAA\",");
                builder.Append($"\"name\":\"{answers[i].answerString}\",");
                break;

            case RecordType.SRV:
                builder.Append("\"type\":\"SRV\",");
                builder.Append($"\"name\":\"{answers[i].answerString}\",");
                break;
            }

            builder.Append($"\"ttl\":\"{answers[i].ttl}\",");
            builder.Append($"\"remote\":\"{answers[i].remote.ToString()}\"");

            builder.Append('}');

            count++;
        }
        builder.Append(']');

        builder.Append('}');
        return Encoding.UTF8.GetBytes(builder.ToString());
    }
}
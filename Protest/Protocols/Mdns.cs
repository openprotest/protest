﻿using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;

using static Protest.Protocols.Dns;

namespace Protest.Protocols;

internal class Mdns {
    private const int DEFAULT_TIMEOUT = 1000;
    private static readonly IPAddress MDNS_MULTICAST_ADDRESS_V4 = IPAddress.Parse("224.0.0.251");
    private static readonly IPAddress MDNS_MULTICAST_ADDRESS_V6 = IPAddress.Parse("ff02::fb");
    private static readonly int MDNS_PORT = 5353;

    public const string ANY_QUERY     = "_services._dns-sd._udp.local";
    public const string HTTP_QUERY    = "_http._tcp.local";
    public const string PRINTER_QUERY = "_ipp._tcp.local";
    public const string IPP_QUERY     = "_printer._tcp.local";

    public struct Answer {
        public RecordType type;
        public int        ttl;
        public ushort     length;
        public string     questionString;
        public string     answerString;
        public IPAddress  remote;
        public bool       isAuthoritative;
        public bool       isAdditional;
        public byte       error;
    }

    public static byte[] Resolve(Dictionary<string, string> parameters) {
        if (parameters is null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        parameters.TryGetValue("query", out string query);
        parameters.TryGetValue("type", out string typeString);
        parameters.TryGetValue("timeout", out string timeoutString);
        parameters.TryGetValue("additionalrrs", out string additionalString);

        if (!int.TryParse(Uri.UnescapeDataString(timeoutString), out int timeout)) {
            timeout = DEFAULT_TIMEOUT;
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

        bool includeAdditionalRrs = additionalString?.Equals("true", StringComparison.OrdinalIgnoreCase) ?? false;

        return Resolve(query, timeout, type, includeAdditionalRrs);
    }

    public static byte[] Resolve(string queryString, int timeout = DEFAULT_TIMEOUT, RecordType type = RecordType.A, bool includeAdditionalRrs = false) {
        byte[] request = ConstructQuery(queryString, type);

        (List<byte[]> matchingData, List<Answer> answers) = ResolveInternal(queryString, request, timeout, type, includeAdditionalRrs);
        return Serialize(request, matchingData, answers);
    }

    public static Answer[] ResolveToArray(string queryString, int timeout = DEFAULT_TIMEOUT, RecordType type = RecordType.A, bool includeAdditionalRrs = false) {
        byte[] request = ConstructQuery(queryString, type);

        (_, List<Answer> answers) = ResolveInternal(queryString, request, timeout, type, includeAdditionalRrs);
        return answers.ToArray();
    }

    private static (List<byte[]>, List<Answer>) ResolveInternal(string queryString, byte[] request, int timeout, RecordType type, bool includeAdditionalRrs) {
        List<byte[]> receivedData = new List<byte[]>();
        List<IPAddress> senders = new List<IPAddress>();

        IPAddress[] nics = IpTools.GetIpAddresses();
        for (int i = 0; i < nics.Length && receivedData.Count == 0; i++) {
            if (IPAddress.IsLoopback(nics[i])) continue;

            using Socket socket = CreateAndBindSocket(nics[i], timeout, out IPEndPoint remoteEndPoint);
            if (socket == null) continue;

            try {
                socket.SendTo(request, remoteEndPoint);

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
                            senders.Add(((IPEndPoint)remoteEP).Address);
                        }
                    }
                    catch { }
                }
            }
            catch { }
        }

        List<byte[]> matchingData = new List<byte[]>();
        List<Answer> answers = new List<Answer>();

        for (int i = 0; i < receivedData.Count; i++) {
            byte[] response = receivedData[i];

            try {
                Answer[] answer = ParseAnswers(response, type, senders[i], out _, out _, out _, includeAdditionalRrs);

                foreach (Answer ans in answer) {
                    if (type != RecordType.ANY && ans.type != type) continue;
                    if (!includeAdditionalRrs && !ans.questionString.Equals(queryString, StringComparison.OrdinalIgnoreCase)) continue;

                    answers.Add(ans);
                    matchingData.Add(response);
                }
            }
            catch { }
        }

        return (matchingData, answers);
    }

    public static Socket CreateAndBindSocket(IPAddress localAddress, int timeout, out IPEndPoint remoteEndPoint) {
        Socket socket = null;
        remoteEndPoint = null;

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
                return null;
            }

            socket.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.ReuseAddress, true);
            socket.Bind(new IPEndPoint(localAddress, MDNS_PORT));
            socket.ReceiveTimeout = timeout;

            return socket;
        }
        catch {
            socket?.Dispose();
            return null;
        }
    }

    public static byte[] ConstructQuery(string queryString, RecordType type) {
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

    public static Answer[] ParseAnswers(byte[] response, RecordType queryType, IPAddress remoteEndPoint, out ushort answerCount, out ushort authorityCount, out ushort additionalCount, bool additionalString) {
        if (response.Length < 12) {
            answerCount = 0;
            authorityCount = 0;
            additionalCount = 0;
            return new Answer[] { };
        }

        byte error = (byte)(response[3] & 0b00001111);
        if (error > 0) {
            answerCount = 0;
            authorityCount = 0;
            additionalCount = 0;
            return new Answer[] { };
        }

        ushort questionCount = (ushort)((response[4] << 8) | response[5]);
        answerCount = (ushort)((response[6] << 8) | response[7]);
        authorityCount = (ushort)((response[8] << 8) | response[9]);
        additionalCount = (ushort)((response[10] << 8) | response[11]);

        int index = 12;

        for (int i = 0; i < questionCount; i++) { //skip questions section
            while (index < response.Length) {
                byte len = response[index++];
                if (len == 0) break;
                index += len;
            }
            index += 4; //skip type, class amd null byte
        }

        int totalRecords;

        if (additionalString) {
            totalRecords = answerCount + authorityCount + additionalCount;
        }
        else {
            totalRecords = answerCount;
        }

        List<Answer> result = new List<Answer>(totalRecords);

        for (int i = 0; i < totalRecords; i++) {
            if (index + 10 >= response.Length) break;

            int nameStart = index;
            int nameEnd   = index;

            if ((response[index] & 0xC0) == 0xC0) { //pointer
                nameEnd += 2;
            }
            else {
                while (nameEnd < response.Length && response[nameEnd] != 0 && (response[nameEnd] & 0xC0) != 0xC0) {
                    nameEnd++;
                }

                if (response[nameEnd] == 0) { //null termination
                    nameEnd++;
                }
                else if ((response[nameEnd] & 0xC0) == 0xC0) { //pointer
                    nameEnd += 2;
                }
            }

            index = nameEnd;

            Answer answer = new Answer() {
                questionString = ExtractName(response, nameStart),
                remote = remoteEndPoint
            };

            answer.type = (RecordType)((response[index] << 8) | response[index + 1]);
            index += 2;

            index += 2; //skip class

            if (index + 4 > response.Length) {
                answer.error = 254;
                break;
            }
            answer.ttl = (response[index] << 24) | (response[index + 1] << 16) | (response[index + 2] << 8) | response[index + 3];
            index += 4;

            answer.length = (ushort)((response[index] << 8) | response[index + 1]);
            index += 2;

            switch (answer.type) {
            case RecordType.A:
                if (answer.length == 4 && index + 4 <= response.Length) {
                    answer.answerString = $"{response[index]}.{response[index + 1]}.{response[index + 2]}.{response[index + 3]}";
                }
                break;

            case RecordType.AAAA:
                if (answer.length == 16 && index + 16 <= response.Length) {
                    string answerString = string.Join(":", Enumerable.Range(0, 8).Select(j => ((response[index + 2 * j] << 8) | response[index + 2 * j + 1]).ToString("x4")));
                    answer.answerString = Data.CompressIPv6(answerString);
                }
                break;

            case RecordType.TXT:
                if (response.Length == 0) {
                    answer.answerString = null;
                    break;
                }

                if (index + answer.length < response.Length) {
                    answer.answerString = Encoding.UTF8.GetString(response, index, answer.length);
                }
                break;

            case RecordType.MX:
                if (index + 2 <= response.Length) {
                    //preference = (ushort)((response[index] << 8) | response[index + 1]);
                    index += 2;
                    answer.answerString = ExtractName(response, index);
                }
                break;

            case RecordType.CNAME:
            case RecordType.NS:
            case RecordType.PTR:
                answer.answerString = ExtractName(response, index);
                break;

            case RecordType.SRV:
                if (index + 6 <= response.Length) {
                    //priority = (ushort)((response[index] << 8) | response[index + 1]);
                    //weight = (ushort)((response[index+2] << 8) | response[index + 3]);
                    ushort port = (ushort)((response[index+4] << 8) | response[index + 5]);
                    answer.answerString = ExtractName(response, index + 6) + ":" + port;
                }
                break;

            case RecordType.NSEC:
                answer.answerString = ExtractName(response, index);
                break;

            default:
                if (answer.length > 0 && index + answer.length < response.Length) {
                    answer.answerString = BitConverter.ToString(response, index, answer.length);
                }
                else {
                    answer.answerString = null;
                }
                break;
            }

            index += answer.length;

            if (i >= answerCount + authorityCount) {
                answer.isAdditional = true;
            }
            else if (i >= answerCount) {
                answer.isAuthoritative = true;
            }

            result.Add(answer);
        }

        return result.ToArray();
    }

    private static string ExtractName(byte[] response, int startIndex) {
        int index = startIndex;
        int length = 0;

        while (index < response.Length && response[index] != 0) {
            if ((response[index] & 0xC0) == 0xC0) { //pointer
                int pointer = ((response[index] & 0x3F) << 8) | response[index + 1];
                length += ExtractName(response, pointer).Length;
                break;
            }
            else {
                int labelLength = response[index++];
                length += labelLength + 1; // label + dot
                index += labelLength;
            }
        }

        Span<char> name = stackalloc char[length];
        index = startIndex;
        int nameIndex = 0;

        while (index < response.Length && response[index] != 0) {
            if ((response[index] & 0xC0) == 0xC0) { //pointer
                int pointer = ((response[index] & 0x3F) << 8) | response[index + 1];
                string pointerName = ExtractName(response, pointer);
                pointerName.AsSpan().CopyTo(name.Slice(nameIndex));
                nameIndex += pointerName.Length;
                break;
            }
            else {
                int labelLength = response[index++];
                for (int i = 0; i < labelLength && index < response.Length; i++) {
                    name[nameIndex++] = (char)response[index++];
                }
                name[nameIndex++] = '.';
            }
        }

        if (nameIndex > 0 && name[nameIndex - 1] == '.') {
            nameIndex--;
        }

        return new string(name.Slice(0, nameIndex));
    }

    private static byte[] Serialize(byte[] request, List<byte[]> data, List<Answer> answers) {
        StringBuilder builder = new StringBuilder();

        builder.Append('{');

        if (answers.Count > 0 && answers[0].error > 0) {
            string errorMessage = answers[0].error switch {
                0   => "no error",
                1   => "query format error",
                2   => "server failure",
                3   => "no such name",
                4   => "function not implemented",
                5   => "refused",
                6   => "name should not exist",
                7   => "RRset should not exist",
                8   => "server not authoritative for the zone",
                9   => "name not in zone",
                254 => "invalid response",
                _   => "unknown error"
            };
            builder.Append($"\"error\":\"{errorMessage}\",\"errorcode\": \"{answers[0].error}\",");
        }

        builder.Append("\"req\":[");
        for (int i = 0; i < request.Length; i++) {
            if (i > 0) builder.Append(',');
            builder.Append(request[i]);
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
            //if (answers[i].isAuthoritative || answers[i].isAdditional) continue;

            string name = answers[i].answerString;
            if (name is null) continue;

            if (answers[i].type == RecordType.TXT) {
                int delimiter = name.IndexOf((char)65533);
                if (delimiter > -1) {
                    name = name[..delimiter];
                }
                name = name.Trim();
            }

            for (byte j = 0; j < 32; j++) {
                name = name.Replace(((char)j).ToString(), "");
            }
            for (byte j = 127; j < 255; j++) {
                name = name.Replace(((char)j).ToString(), "");
            }

            if (name.Length == 0) continue;
            if (name.Length == 1 && name[0] == 0) continue;

            if (count > 0) builder.Append(',');

            builder.Append('{');

            builder.Append(answers[i].type switch {
                RecordType.A     => "\"type\":\"A\",",
                RecordType.NS    => "\"type\":\"NS\",",
                RecordType.CNAME => "\"type\":\"CNAME\",",
                RecordType.SOA   => "\"type\":\"SOA\",",
                RecordType.PTR   => "\"type\":\"PTR\",",
                RecordType.MX    => "\"type\":\"MX\",",
                RecordType.TXT   => "\"type\":\"TXT\",",
                RecordType.AAAA  => "\"type\":\"AAAA\",",
                RecordType.NSEC  => "\"type\":\"NSEC\",",
                RecordType.SRV   => "\"type\":\"SRV\",",
                _                => "\"type\":\"unknown\",",
            });

            builder.Append($"\"name\":\"{Data.EscapeJsonText(name)}\",");

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
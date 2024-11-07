using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Text;
using System.Threading.Tasks;
using System.Net.Http;
using System.Collections.Generic;
using System.Net.Security;
using System.IO;

namespace Protest.Protocols;

internal static class Dns {

    public enum TransportMethod : byte {
        auto  = 0,
        udp   = 1,
        tcp   = 2,
        tls   = 5,
        https = 6,
        quic  = 7,
    }

    public enum RecordType : byte {
        A     = 1,
        NS    = 2,
        CNAME = 5,
        SOA   = 6,
        PTR   = 12,
        MX    = 15,
        TXT   = 16,
        AAAA  = 28,
        SRV   = 33,
        NSEC  = 47,
        ANY   = 255
    }

    public enum Class : byte {
        IN = 1, //Internet
        CS = 2, //CSNET -Obsolete
        CH = 3, //Chaos -Obsolete
        HS = 4  //Hesiod
    }

    private struct Answer {
        public RecordType type;
        public int ttl;
        public ushort length;
        public byte[] name;
        public bool isAuthoritative;
        public bool isAdditional;
        public byte error;
    }

    public static byte[] Resolve(Dictionary<string, string> parameters) {
        if (parameters is null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        parameters.TryGetValue("domain", out string domainNamesString);
        parameters.TryGetValue("server", out string dnsServer);
        parameters.TryGetValue("timeout", out string timeoutString);
        parameters.TryGetValue("transport", out string transportString);
        parameters.TryGetValue("type", out string typeString);
        parameters.TryGetValue("standard", out string standardString);
        parameters.TryGetValue("inverse", out string inverseString);
        parameters.TryGetValue("status", out string statusString);
        parameters.TryGetValue("truncated", out string truncatedString);
        parameters.TryGetValue("recursive", out string recursiveString);

        int timeout = 2000;
        TransportMethod transport = TransportMethod.auto;

        RecordType type = RecordType.A;
        bool isStandard = false;
        bool isInverse = false;
        bool showServerStatus = false;
        bool isTruncated = false;
        bool isRecursive = false;

        string[] domainNames = Uri.UnescapeDataString(domainNamesString).Split(',').Select(o => o.Trim()).ToArray();
        if (domainNames is null) return Array.Empty<byte>();

        if (dnsServer is not null) dnsServer = Uri.UnescapeDataString(dnsServer);
        dnsServer ??= GetLocalDnsAddress(true).ToString();

        if (domainNames is null) return Array.Empty<byte>();

        timeout = int.Parse(Uri.UnescapeDataString(timeoutString));

        transport = transportString switch {
            //"auto"  => TransportMethod.auto,
            "udp"   => TransportMethod.udp,
            "tcp"   => TransportMethod.tcp,
            "tls"   => TransportMethod.tls,
            "https" => TransportMethod.https,
            "quic"  => TransportMethod.quic,
            _       => TransportMethod.auto
        };

        type = Uri.UnescapeDataString(typeString) switch {
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

        isStandard       = standardString is not null  && standardString.Equals("true", StringComparison.OrdinalIgnoreCase);
        isInverse        = inverseString is not null   && inverseString.Equals("true", StringComparison.OrdinalIgnoreCase);
        showServerStatus = statusString is not null    && statusString.Equals("true", StringComparison.OrdinalIgnoreCase);
        isTruncated      = truncatedString is not null && truncatedString.Equals("true", StringComparison.OrdinalIgnoreCase);
        isRecursive      = recursiveString is null     || recursiveString.Equals("true", StringComparison.OrdinalIgnoreCase);

        return Resolve(domainNames, dnsServer, timeout, out _, out _, out _, transport, type, isStandard, isInverse, showServerStatus, isTruncated, isRecursive);
    }

    public static byte[] Resolve(
        string[] domainNames,
        string dnsServer,
        int timeout,
        out ushort answerCount,
        out ushort authorityCount,
        out ushort additionalCount,
        TransportMethod transport = TransportMethod.udp,
        RecordType type = RecordType.A,
        bool isStandard = false,
        bool isInverse = false,
        bool showServerStatus = false,
        bool isTruncated = false,
        bool isRecursive = true
    ) {
        try {
            if (transport == TransportMethod.https) {
                if (type == RecordType.PTR) {
                    string[] split = domainNames[0].Split(".");
                    if (split.Length == 4 && split.All(o => int.TryParse(o, out int n) && n >= 0 && n <= 255)) {
                        domainNames[0] = $"{String.Join(".", split.Reverse())}.in-addr.arpa";
                    }
                }

                string url = $"https://{dnsServer}/dns-query?name={domainNames[0]}&type={type}";
                using HttpClient client = new HttpClient();
                client.DefaultRequestHeaders.Add("Accept", "application/dns-json");

                HttpResponseMessage responseMessage = client.GetAsync(url).GetAwaiter().GetResult();
                responseMessage.EnsureSuccessStatusCode();

                answerCount = 1;
                authorityCount = 0;
                additionalCount = 0;

                string data = responseMessage.Content.ReadAsStringAsync().GetAwaiter().GetResult();
                return Encoding.UTF8.GetBytes(data);
            }

            byte[] query = ConstructQuery(domainNames, type, out string replaced, isStandard, isInverse, showServerStatus, isTruncated, isRecursive);

            if (transport == TransportMethod.auto) {
                transport = query.Length > 4096 ? TransportMethod.tcp : TransportMethod.udp;
            }

            if (!IPAddress.TryParse(dnsServer, out IPAddress serverIp)) {
                serverIp = GetLocalDnsAddress();
            }

            byte[] response;

            if (transport == TransportMethod.tls) {
                IPEndPoint remoteEndPoint = new IPEndPoint(serverIp, 853);

                using Socket socket = new Socket(remoteEndPoint.Address.AddressFamily, SocketType.Stream, ProtocolType.Tcp);
                socket.Connect(remoteEndPoint);

                using Stream stream = new NetworkStream(socket, ownsSocket: true);

                using SslStream secureStream = new SslStream(
                    stream,
                    false,
                    (sender, certificate, chain, errors) => errors == SslPolicyErrors.None,
                    null,
                    EncryptionPolicy.RequireEncryption
                );

                secureStream.ReadTimeout = timeout;
                secureStream.AuthenticateAsClient(serverIp.ToString());

                secureStream.Write(new byte[] { (byte)(query.Length >> 8), (byte)query.Length }); //length
                secureStream.Flush();

                secureStream.Write(query);
                secureStream.Flush();

                byte[] responseLengthBytes = new byte[2];
                secureStream.Read(responseLengthBytes, 0, 2);
                if (BitConverter.IsLittleEndian) Array.Reverse(responseLengthBytes);

                short responseLength = BitConverter.ToInt16(responseLengthBytes, 0);
                response = new byte[responseLength];
                secureStream.Read(response, 0, responseLength);

                secureStream.Close();
                socket.Close();
            }
            else if (transport == TransportMethod.tcp) {
                IPEndPoint remoteEndPoint = new IPEndPoint(serverIp, 53);

                using Socket socket = new Socket(SocketType.Stream, ProtocolType.Tcp);
                socket.Connect(remoteEndPoint);
                //socket.ReceiveTimeout = timeout;

                byte[] lengthBytes = BitConverter.GetBytes((short)query.Length);
                if (BitConverter.IsLittleEndian) Array.Reverse(lengthBytes);

                byte[] message = new byte[lengthBytes.Length + query.Length];
                Buffer.BlockCopy(lengthBytes, 0, message, 0, lengthBytes.Length);
                Buffer.BlockCopy(query, 0, message, lengthBytes.Length, query.Length);
                socket.Send(message);

                byte[] responseLengthBytes = new byte[2];
                socket.Receive(responseLengthBytes, 2, SocketFlags.None);
                if (BitConverter.IsLittleEndian) Array.Reverse(responseLengthBytes);

                short responseLength = BitConverter.ToInt16(responseLengthBytes, 0);
                response = new byte[responseLength];
                socket.Receive(response, responseLength, SocketFlags.None);

                socket.Close();
            }
            else { //udp
                IPEndPoint remoteEndPoint = new IPEndPoint(serverIp, 53);
                using Socket socket = new Socket(SocketType.Dgram, ProtocolType.Udp);

                socket.Connect(remoteEndPoint);
                socket.ReceiveTimeout = timeout;
                socket.Send(query);

                response = new byte[4096];
                int receivedLength = socket.Receive(response);
                Array.Resize(ref response, receivedLength);

                socket.Close();
            }

            Answer[] deconstructed = ParseAnswers(response, out answerCount, out authorityCount, out additionalCount);
            return Serialize(query, replaced, response, deconstructed);
        }
        catch (SocketException ex) {
            if (ex.ErrorCode == 10060) {
                answerCount = 0;
                authorityCount = 0;
                additionalCount = 0;
                return "{\"error\":\"connection timed out\",\"errorcode\":\"0\"}"u8.ToArray();
            }
            else {
                answerCount = 0;
                authorityCount = 0;
                additionalCount = 0;
                return "{\"error\":\"unknown error\",\"errorcode\":\"0\"}"u8.ToArray();
            }
        }
        catch {
            answerCount = 0;
            authorityCount = 0;
            additionalCount = 0;
            return "{\"error\":\"unknown error\",\"errorcode\":\"0\"}"u8.ToArray();
        }
    }

    private static byte[] Serialize(byte[] query, string replaced, byte[] response, Answer[] deconstructed) {
        StringBuilder builder = new StringBuilder();

        builder.Append('{');

        if (deconstructed.Length > 0 && deconstructed[0].error > 0) {
            string errorMessage = deconstructed[0].error switch {
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
            builder.Append($"\"error\":\"{errorMessage}\",\"errorcode\": \"{deconstructed[0].error}\",");
        }

        builder.Append("\"req\":[");
        for (int i = 0; i < query.Length; i++) {
            if (i > 0) builder.Append(',');
            builder.Append(query[i]);
        }
        builder.Append("],");

        builder.Append("\"res\":[");
        for (int i = 0; i < response.Length; i++) {
            if (i > 0) builder.Append(',');
            builder.Append(response[i]);
        }
        builder.Append("],");

        if (replaced is not null) {
            builder.Append($"\"replace\":\"{replaced}\",");
        }

        builder.Append("\"answer\":[");
        int count = 0;
        for (int i = 0; i < deconstructed.Length; i++) {
            if (deconstructed[i].isAuthoritative || deconstructed[i].isAdditional) continue;

            if (count > 0) builder.Append(',');

            builder.Append('{');
            switch (deconstructed[i].type) {
            case RecordType.A:
                builder.Append("\"type\":\"A\",");
                builder.Append($"\"name\":\"{String.Join(".", deconstructed[i].name)}\",");
                break;

            case RecordType.NS:
                builder.Append("\"type\":\"NS\",");
                builder.Append($"\"name\":\"{ExtractLabel(deconstructed[i].name, 0, response, out _)}\",");
                break;

            case RecordType.CNAME:
                builder.Append("\"type\":\"CNAME\",");
                builder.Append($"\"name\":\"{ExtractLabel(deconstructed[i].name, 0, response, out _)}\",");
                break;

            case RecordType.SOA:
                builder.Append("\"type\":\"SOA\",");
                builder.Append($"\"name\":\"{ExtractLabel(deconstructed[i].name, 0, response, out _)}\",");
                break;

            case RecordType.PTR:
                builder.Append("\"type\":\"PTR\",");
                builder.Append($"\"name\":\"{ExtractLabel(deconstructed[i].name, 0, response, out _)}\",");
                break;

            case RecordType.MX:
                builder.Append("\"type\":\"MX\",");
                builder.Append($"\"name\":\"{ExtractLabel(deconstructed[i].name, 0, response, out _)}\",");
                break;

            case RecordType.TXT:
                builder.Append("\"type\":\"TXT\",");
                builder.Append($"\"name\":\"{ExtractLabel(deconstructed[i].name, 0, response, out _)}\",");
                break;

            case RecordType.AAAA:
                builder.Append("\"type\":\"AAAA\",");
                if (deconstructed[i].name.Length != 16) {
                    builder.Append($"\"name\":\"\"");
                    break;
                }

                builder.Append($"\"name\":\"");
                for (int j = 0; j < 16; j += 2) {
                    if (j > 0) builder.Append(':');
                    ushort word = (ushort)((deconstructed[i].name[j] << 8) | deconstructed[i].name[j + 1]);
                    builder.Append(Data.CompressIPv6(word.ToString("x4")));
                }

                builder.Append("\",");
                break;

            case RecordType.SRV:
                builder.Append("\"type\":\"SRV\",");
                builder.Append($"\"name\":\"{String.Join(".", deconstructed[i].name)}\",");
                break;
            }

            builder.Append($"\"ttl\":\"{deconstructed[i].ttl}\"");

            builder.Append('}');

            count++;
        }
        builder.Append(']');

        builder.Append('}');

        return Encoding.UTF8.GetBytes(builder.ToString());
    }

    private static byte[] ConstructQuery(
        string[] domainNames,
        RecordType type,
        out string replaced,
        bool isStandard = false,     //1
        bool isInverse = false,      //2
        bool isServerStatus = false, //3
        bool isTruncated = false,    //6
        bool isRecursive = true      //7
    ) {

        replaced = null;

        ushort questions = (ushort)domainNames.Length;

        int len = 12;
        string[][] labels = new string[domainNames.Length][];

        for (int i = 0; i < labels.Length; i++) {
            labels[i] = domainNames[i].Split('.');

            if (type == RecordType.PTR && labels[i].Length == 4
                && labels[i].All(o => int.TryParse(o, out int n) && n >= 0 && n <= 255)) {
                replaced = $"{String.Join(".", labels[i].Reverse())}.in-addr.arpa";
                labels[i] = replaced.Split('.');
            }

            if (labels[i].Length == 1) { //append domain prefix id needed
                string domain = GetDomain();
                replaced = $"{String.Join(".", labels[i])}.{domain}";
                labels[i] = replaced.Split('.');
            }

            for (int j = 0; j < labels[i].Length; j++) {
                len += labels[i][j].Length + 1;
            }
            len += 5; //1[null] + 2[type] + 2[class]
        }

        byte[] query = new byte[len];

        //transaction id
        Random rand = new Random();
        query[0] = (byte)rand.Next(0, 255);
        query[1] = (byte)rand.Next(0, 255);

        //DNS query flags
        if (isStandard) query[2] |= 0b10000000;
        if (isInverse) query[2] |= 0b01000000;
        if (isServerStatus) query[2] |= 0b00100000;
        if (isTruncated) query[2] |= 0b00000010;
        if (isRecursive) query[2] |= 0b00000001;

        //questions
        query[4] = (byte)(questions << 8);
        query[5] = (byte)questions;

        //answer RRs
        ushort answers = 0;
        query[6] = (byte)(answers << 8);
        query[7] = (byte)answers;

        //authority RRs
        ushort authority = 0;
        query[8] = (byte)(authority << 8);
        query[9] = (byte)authority;

        //additional RRs
        ushort additional = 0;
        query[10] = (byte)(additional << 8);
        query[11] = (byte)additional;

        short index = 12;

        for (int i = 0; i < labels.Length; i++) {
            for (int j = 0; j < labels[i].Length; j++) {
                query[index++] = (byte)labels[i][j].Length;
                for (int k = 0; k < labels[i][j].Length; k++) {
                    query[index++] = (byte)labels[i][j][k];
                }
            }

            query[index++] = 0x00; //null termination

            query[index++] = 0x00; //type
            query[index++] = (byte)type;

            query[index++] = 0x00; //class
            query[index++] = (byte)Class.IN;
        }

        return query;
    }

    private static Answer[] ParseAnswers(byte[] response, out ushort answerCount, out ushort authorityCount, out ushort additionalCount) {
        if (response.Length < 12) {
            answerCount = 0;
            authorityCount = 0;
            additionalCount = 0;
            return new Answer[] { new Answer { error = 254 } };
        }

        //ushort transactionId = BitConverter.ToUInt16(response, 0);
        //ushort query = (ushort)((response[2] << 8) | response[3]);
        ushort questionCount = (ushort)((response[4] << 8) | response[5]);
        answerCount = (ushort)((response[6] << 8) | response[7]);
        authorityCount = (ushort)((response[8] << 8) | response[9]);
        additionalCount = (ushort)((response[10] << 8) | response[11]);

        //bool isResponse = (response[2] & 0b10000000) == 0b10000000;

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
            index += 4; //skip type and class
        }

        Answer[] result = new Answer[answerCount + authorityCount + additionalCount];

        if (result.Length == 0) {
            return result;
        }

        int count = 0;
        while (index < response.Length) {
            Answer ans = new Answer();

            index += 2; //skip name

            ans.type = (RecordType)((response[index] << 8) | response[index + 1]);
            index += 2;

            index += 2; //skip class

            ans.ttl = (response[index] << 24) | (response[index + 1] << 16) | (response[index + 2] << 8) | response[index + 3];
            index += 4;

            ans.length = (ushort)((response[index] << 8) | response[index + 1]);
            index += 2;

            if (ans.type == RecordType.MX) {
                ans.length -= 2;
                index += 2; //skip preference
            }

            if (ans.length > response.Length - index) {
                ans.error = 254;
                break;
            }
            ans.name = new byte[ans.length];
            Array.Copy(response, index, ans.name, 0, ans.length);
            index += ans.length;

            if (count > answerCount + authorityCount) {
                ans.isAdditional = true;
            }
            else if (count > answerCount) {
                ans.isAuthoritative = true;
            }

            result[count++] = ans;
        }

        return result;
    }

    private static string ExtractLabel(byte[] labels, int offset, byte[] response, out bool isNullTerminated) {
        if (labels.Length - offset < 2) {
            isNullTerminated = false;
            return String.Empty;
        }

        StringBuilder builder = new StringBuilder();

        int index = offset;
        while (index < labels.Length) {

            if (index > 0 && (labels[index ]& 0xC0)  != 0xc0) builder.Append('.');

            switch (labels[index]) {
            case 0x00: //null terminated
                string domainName = builder.ToString();
                if (domainName[^1] == '.') domainName = domainName[..^1];
                isNullTerminated = true;
                return domainName;

            case 0xc0: //pointer
                builder.Append(ExtractLabel(response, labels[index + 1], response, out bool nt));
                if (nt) {
                    isNullTerminated = true;
                    return builder.ToString();
                }
                index++;
                break;

            default:
                int labelLength = labels[index];
                for (int i = index + 1; i < index + labels[index] + 1; i++) {
                    if (i >= labels.Length) break;
                    if (labels[i] == 0) break;
                    builder.Append(Convert.ToChar(labels[i]));
                }
                index += labelLength;

                break;
            }

            index++;
        }

        isNullTerminated = false;
        return builder.ToString();
    }

    private static IPAddress GetLocalDnsAddress(bool forceIPv4 = false) {
        NetworkInterface[] networkInterfaces = NetworkInterface.GetAllNetworkInterfaces();

        foreach (NetworkInterface networkInterface in networkInterfaces) {
            if (networkInterface.OperationalStatus == OperationalStatus.Up) {
                IPInterfaceProperties ipProperties = networkInterface.GetIPProperties();
                IPAddressCollection dnsAddresses = ipProperties.DnsAddresses;

                foreach (IPAddress dnsAddress in dnsAddresses) {
                    if (forceIPv4 && dnsAddress.AddressFamily != AddressFamily.InterNetwork) { continue; }
                    return dnsAddress;
                }
            }
        }

        return new IPAddress(0);
    }

    public static string GetDomain() {
        try {
            if (OperatingSystem.IsWindows()) {
                return System.DirectoryServices.ActiveDirectory.Domain.GetComputerDomain().ToString();
            }
            else {
                return String.Empty;
            }
        }
        catch {
            return String.Empty;
        }
    }

    public static IPAddress[] NativeDnsLookup(string hostname) {
        try {
            return System.Net.Dns.GetHostAddresses(hostname);
        }
        catch {
            return null;
        }
    }

    public static async Task<string> NativeReverseDnsLookupAsync(IPAddress ip) {
        try {
            return (await System.Net.Dns.GetHostEntryAsync(ip)).HostName;
        }
        catch {
            return String.Empty;
        }
    }
}
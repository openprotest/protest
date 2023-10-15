using System.Collections.Generic;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;

namespace Protest.Protocols;

internal static class Ntp {
    public static byte[] Request(Dictionary<string, string> parameters) {
        if (parameters is null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        if (!parameters.TryGetValue("server", out string server)) {
            server = "time.nist.gov";
        }

        if (!parameters.TryGetValue("timeout", out string timeoutString)) {
            timeoutString = "3000";
        }
        int timeout = int.Parse(Uri.UnescapeDataString(timeoutString.ToString()));

        if (String.IsNullOrEmpty(server)) return "Invalid address"u8.ToArray();

        return Request(server, timeout);
    }

    public static byte[] Request(string server, int timeout) {
        byte[] query = ConstructQuery();
        byte[] response = new byte[48];
        long start, end;

        try {
            IPAddress address = System.Net.Dns.GetHostEntry(server).AddressList[0];
            IPEndPoint remoteEndPoint = new IPEndPoint(address, 123);

            using Socket socket = new Socket(AddressFamily.InterNetwork, SocketType.Dgram, ProtocolType.Udp);
            socket.Connect(remoteEndPoint);
            socket.ReceiveTimeout = timeout;

            socket.Send(query);
            start = DateTime.Now.Ticks;
            socket.Receive(response);
            end = DateTime.Now.Ticks;

            long roundtrip = (end - start) / 10_000;

            long milliseconds = DeconstructResponse(response);

            DateTime ntpTime = new DateTime(1900, 1, 1, 0, 0, 0, DateTimeKind.Utc).AddMilliseconds(milliseconds);
            DateTime localTime = ntpTime.ToLocalTime();

            StringBuilder builder = new StringBuilder();
            builder.Append('{');

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

            builder.Append($"\"transmit\":\"{ntpTime.ToString(Data.TIME_FORMAT_MILLI)}\",");
            builder.Append($"\"local\":\"{localTime.ToString(Data.TIME_FORMAT_MILLI)}\",");
            builder.Append($"\"roundtrip\":\"{roundtrip}\"");

            builder.Append('}');

            return Encoding.UTF8.GetBytes(builder.ToString());

        }
        catch (SocketException ex) {
            if (ex.ErrorCode == 10060) { //timed out
                return "{\"error\":\"connection timed out\"}"u8.ToArray();
            }
            else {
                return "{\"error\":\"unknown error\"}"u8.ToArray();
            }

        }
        catch {
            return "{\"error\":\"unknown error\"}"u8.ToArray();
        }
    }

    private static byte[] ConstructQuery() {
        byte[] query = new byte[48];

        //NTP query flags
        query[0] |= 0xdb; //leap indicator, ver3, client mode

/*
        query[1] = 0; //peer clock stratum

        query[2] = 0; //peer polling interval

        query[3] = 0; //peer clock precision

        query[4] = 0; //root delay
        query[5] = 0;
        query[6] = 0;
        query[7] = 0;

        query[8] = 0; //root dispersion
        query[9] = 0;
        query[10] = 0;
        query[11] = 0;

        query[12] = 0; //reference id
        query[13] = 0;
        query[14] = 0;
        query[15] = 0;

        query[16] = 0; //reference timestamp
        query[17] = 0;
        query[18] = 0;
        query[19] = 0;
        query[20] = 0;
        query[21] = 0;
        query[22] = 0;
        query[23] = 0;

        query[24] = 0; //original timestamp
        query[25] = 0;
        query[26] = 0;
        query[27] = 0;
        query[28] = 0;
        query[29] = 0;
        query[30] = 0;
        query[31] = 0;

        query[32] = 0; //receive timestamp
        query[33] = 0;
        query[34] = 0;
        query[35] = 0;
        query[36] = 0;
        query[37] = 0;
        query[38] = 0;
        query[39] = 0;

        query[40] = 0; //transmit timestamp
        query[41] = 0;
        query[42] = 0;
        query[43] = 0;
        query[44] = 0;
        query[45] = 0;
        query[46] = 0;
        query[47] = 0;
*/

        return query;
    }

    private static long DeconstructResponse(byte[] response) {
        ulong intPart = (ulong)response[40] << 24 | (ulong)response[41] << 16 | (ulong)response[42] << 8 | response[43];
        ulong fractPart = (ulong)response[44] << 24 | (ulong)response[45] << 16 | (ulong)response[46] << 8 | response[47];
        ulong milliseconds = (intPart * 1000) + ((fractPart * 1000) / 0x100000000L);
        return (long)milliseconds;
    }
}
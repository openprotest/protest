using System.Collections.Generic;
using System.Formats.Asn1;
using System.IO;
using System.Net;
using System.Net.Security;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Numerics;
using System.Runtime.InteropServices;
using System.Security.Authentication;
using System.Security.Cryptography.X509Certificates;
using System.Threading;
using System.Threading.Tasks;
using Protest.Http;

namespace Protest.Protocols;

//Gateway for the IronRDP web client, speaking the RDCleanPath protocol:
//the client sends its X.224 connection request wrapped in a DER encoded RDCleanPath PDU, the gateway forwards it,
//upgrades the server connection to TLS and returns the X.224 response along with the server's certificate chain.
//From then on the client speaks plain RDP over the WebSocket and the gateway carries it over the TLS connection.
internal static class Rdp {

    private const int DEFAULT_PORT = 3389;
    private const int HANDSHAKE_TIMEOUT = 20_000;
    private const int CLOSE_GRACE = 2_000;
    private const int MAX_PDU_LENGTH = 65_536;

    private const ulong RDCLEANPATH_VERSION = 3390;

    private const ushort GENERAL_ERROR_CODE = 1;
    private const ushort NEGOTIATION_ERROR_CODE = 2;

    private const byte TLS_ALERT_HANDSHAKE_FAILURE = 40;

    private const byte TYPE_RDP_NEG_RSP = 0x02;
    private const byte TYPE_RDP_NEG_FAILURE = 0x03;

    private const uint PROTOCOL_RDP = 0; //standard RDP security, no TLS
    private const uint PROTOCOL_SSL = 1; //TLS without CredSSP

    private const ushort SEC_ENCRYPT = 0x0008;
    private const ushort SEC_INFO_PKT = 0x0040;
    private const uint INFO_UNICODE = 0x0010;

    //no wallpaper, outlines instead of window contents while dragging, no menu animations, no cursor shadow or blinking
    private const uint OPTIMIZED_PERFORMANCE_FLAGS = 0x0001 | 0x0002 | 0x0004 | 0x0020 | 0x0040;

    internal sealed class RdCleanPathRequest {
        public string destination;
        public byte[] x224;
    }

    public static async Task WebSocketHandler(HttpListenerContext ctx) {
        if (!Auth.IsAuthenticatedAndAuthorized(ctx, ctx.Request.Url.AbsolutePath)) {
            ctx.Response.Close();
            return;
        }

        string deviceFile = ctx.Request.QueryString["file"];

        WebSocket ws;
        try {
            HttpListenerWebSocketContext wsc = await ctx.AcceptWebSocketAsync(null);
            ws = wsc.WebSocket;
        }
        catch (WebSocketException ex) {
            ctx.Response.Close();
            Logger.Error(ex);
            return;
        }

        if (ws is null) return;

        string sessionId = ctx.Request.Cookies["sessionid"]?.Value;
        string origin = IPAddress.IsLoopback(ctx.Request.RemoteEndPoint.Address) ? "loopback" : Auth.GetUsername(sessionId);

        TcpClient tcp = new TcpClient() {
            NoDelay = true,              //input events are small and latency bound, Nagle would hold them back
            ReceiveBufferSize = 65_536   //what waits here while flow control holds back is already stale, keep it small
        };
        Stream stream = null;
        string host = null;
        int port = DEFAULT_PORT;
        bool established = false;
        SessionRecording recording = null;

        try {
            using CancellationTokenSource handshakeCts = new CancellationTokenSource(HANDSHAKE_TIMEOUT);

            (byte[] requestBytes, byte[] clientLeftover) = await ReceivePdu(ws, handshakeCts.Token);
            if (requestBytes is null) return;

            RdCleanPathRequest request = DecodeRequest(requestBytes);
            if (request is null || !TryParseDestination(request.destination, out host, out port)) {
                await SendPdu(ws, EncodeGeneralError());
                return;
            }

            try {
                await tcp.ConnectAsync(host, port, handshakeCts.Token);
            }
            catch (SocketException ex) {
                Logger.Action(origin, "Remote-access", $"RDP connection to {host}:{port} failed: {ex.Message}");
                await SendPdu(ws, EncodeWsaError((ushort)ex.SocketErrorCode));
                return;
            }
            catch (OperationCanceledException) {
                Logger.Action(origin, "Remote-access", $"RDP connection to {host}:{port} timed out");
                await SendPdu(ws, EncodeWsaError((ushort)SocketError.TimedOut));
                return;
            }

            NetworkStream network = tcp.GetStream();
            stream = network;

            await network.WriteAsync(request.x224, handshakeCts.Token);
            byte[] x224Response = await ReadTpkt(network, handshakeCts.Token);

            if (x224Response is null) {
                await SendPdu(ws, EncodeGeneralError());
                return;
            }

            if (IsNegotiationFailure(x224Response)) {
                Logger.Action(origin, "Remote-access", $"RDP connection to {host}:{port} failed: protocol negotiation was refused");
                await SendPdu(ws, EncodeNegotiationError(x224Response));
                return;
            }

            List<byte[]> certificateChain = new List<byte[]>();

            if (GetSelectedProtocol(x224Response) != PROTOCOL_RDP) {
                SslStream ssl = new SslStream(network, false);
                stream = ssl;

                //RDP hosts present self-signed certificates most of the time, the chain is passed on to the client for CredSSP
                SslClientAuthenticationOptions options = new SslClientAuthenticationOptions {
                    TargetHost = host,
                    AllowTlsResume = false, //CredSSP doesn't support resumed sessions [MS-CSSP], the host drops the connection
                    CertificateRevocationCheckMode = X509RevocationMode.NoCheck,
                    RemoteCertificateValidationCallback = (sender, certificate, chain, errors) => {
                        if (certificate is null) return false;

                        certificateChain.Add(certificate.GetRawCertData());
                        if (chain is not null) {
                            for (int i = 1; i < chain.ChainElements.Count; i++) {
                                certificateChain.Add(chain.ChainElements[i].Certificate.RawData);
                            }
                        }

                        return true;
                    }
                };

                try {
                    await ssl.AuthenticateAsClientAsync(options, handshakeCts.Token);
                }
                catch (AuthenticationException ex) {
                    Logger.Action(origin, "Remote-access", $"RDP connection to {host}:{port} failed: {ex.Message}");
                    await SendPdu(ws, EncodeTlsError(TLS_ALERT_HANDSHAKE_FAILURE));
                    return;
                }

                if (certificateChain.Count > 0) {
                    using X509Certificate2 leaf = X509CertificateLoader.LoadCertificate(certificateChain[0]);
                    Logger.Action(origin, "Remote-access", $"RDP host {host}:{port} presented certificate {leaf.Subject} ({leaf.Thumbprint})");
                }
            }

            FlowControl flow = new FlowControl();

            string serverAddress = tcp.Client.RemoteEndPoint?.ToString() ?? $"{host}:{port}";
            byte[] response = EncodeResponse(x224Response, certificateChain, serverAddress);
            await SendPdu(ws, response);
            flow.Consume(response.Length); //the window counts every message, this one included

            Logger.Action(origin, "Remote-access", $"Establish RDP connection to {host}:{port}");
            established = true;

            recording = SessionRecording.Start("rdp", host, port, deviceFile, origin);
            StreamRecorder recorder = null;

            if (recording is not null) {
                //the first chunk is the handshake a playback client receives, it selects TLS so the player skips CredSSP
                List<byte[]> leaf = certificateChain.Count > 0 ? new List<byte[]> { certificateChain[0] } : new List<byte[]>();
                byte[] playbackResponse = EncodeResponse(ToTlsConfirm(x224Response), leaf, serverAddress);
                recording.WriteVideo(playbackResponse, playbackResponse.Length);

                recorder = new StreamRecorder(recording.WriteVideo, recording.MarkInteracted);
            }

            PointerTracker pointer = new PointerTracker();

            if (clientLeftover?.Length > 0) {
                recorder?.ObserveClient(clientLeftover);
                pointer.ObserveClient(clientLeftover);
                await stream.WriteAsync(clientLeftover);
                await stream.FlushAsync();
            }

            using CancellationTokenSource cts = new CancellationTokenSource();

            Task upstream   = PumpToServer(ctx, ws, stream, cts, recorder, flow, pointer);
            Task downstream = PumpToWs(ws, stream, cts, recorder, flow, pointer);

            await Task.WhenAny(upstream, downstream);

            //once PumpToWs has sent a close frame the receive loop is given a moment to take the client's reply,
            //cancelling it aborts the socket
            await Task.WhenAny(upstream, Task.Delay(CLOSE_GRACE));
            cts.Cancel();
        }
        catch (SocketException ex) {
            Logger.Debug(ex);
        }
        catch (OperationCanceledException) { } //timed out
        catch (WebSocketException) { }
        catch (IOException) { }
        catch (Exception ex) {
            Logger.Error(ex);
        }
        finally {
            if (established) {
                Logger.Action(origin, "Remote-access", $"Close RDP connection to {host}:{port}");
            }

            recording?.Stop();

            stream?.Dispose();
            tcp.Close();

            if (ws.State == WebSocketState.Open) {
                try {
                    await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, string.Empty, CancellationToken.None);
                }
                catch (Exception ex) {
                    Logger.Debug(ex);
                }
            }
        }
    }

    //Accumulates WebSocket messages until a complete DER element is received, returns the element and any bytes past it.
    internal static async Task<(byte[], byte[])> ReceivePdu(WebSocket ws, CancellationToken token) {
        List<byte> received = new List<byte>();

        while (true) {
            int total = GetDerLength(received);
            if (total < 0) return (null, null);
            if (total > 0 && received.Count >= total) {
                return (received.GetRange(0, total).ToArray(), received.GetRange(total, received.Count - total).ToArray());
            }

            byte[] message = await WebSocketHelper.WsReadBinary(ws, token, 4096);
            if (message is null) return (null, null); //close frame received

            received.AddRange(message);
            if (received.Count > MAX_PDU_LENGTH) return (null, null);
        }
    }

    //Returns the total length of the DER element at the start of the buffer, 0 when more bytes are needed, or -1 if it isn't valid.
    private static int GetDerLength(List<byte> buffer) {
        if (buffer.Count < 2) return 0;
        if (buffer[0] != 0x30) return -1; //SEQUENCE

        int first = buffer[1];
        if (first < 0x80) return 2 + first;

        int count = first & 0x7f;
        if (count == 0 || count > 3) return -1;
        if (buffer.Count < 2 + count) return 0;

        int length = 0;
        for (int i = 0; i < count; i++) {
            length = length << 8 | buffer[2 + i];
        }

        int total = 2 + count + length;
        return total > MAX_PDU_LENGTH ? -1 : total;
    }

    internal static RdCleanPathRequest DecodeRequest(byte[] bytes) {
        try {
            AsnReader reader = new AsnReader(bytes, AsnEncodingRules.DER);
            AsnReader sequence = reader.ReadSequence();

            ulong version = 0;
            RdCleanPathRequest request = new RdCleanPathRequest();

            while (sequence.HasData) {
                Asn1Tag tag = sequence.PeekTag();
                if (tag.TagClass != TagClass.ContextSpecific) return null;

                AsnReader field = sequence.ReadSequence(tag); //explicit tagging

                //proxy_auth (3) is ignored, the WebSocket is already authenticated by the session cookie
                //preconnection_blob (5) is ignored, Hyper-V console connections are not supported
                switch (tag.TagValue) {
                case 0:
                    if (!field.TryReadUInt64(out version)) return null;
                    break;

                case 2:
                    request.destination = field.ReadCharacterString(UniversalTagNumber.UTF8String);
                    break;

                case 6:
                    request.x224 = field.ReadOctetString();
                    break;
                }
            }

            if (version != RDCLEANPATH_VERSION) return null;
            if (String.IsNullOrWhiteSpace(request.destination) || request.x224 is null || request.x224.Length < 11) return null;

            return request;
        }
        catch (AsnContentException) {
            return null;
        }
    }

    internal static bool TryParseDestination(string destination, out string host, out int port) {
        host = destination?.Trim();
        port = DEFAULT_PORT;

        if (String.IsNullOrEmpty(host)) return false;

        if (host.StartsWith('[')) { //[ipv6]:port
            int close = host.IndexOf(']');
            if (close < 0) return false;

            string rest = host[(close + 1)..];
            host = host[1..close];

            if (rest.Length > 0) {
                if (!rest.StartsWith(':') || !int.TryParse(rest[1..], out port)) return false;
            }
        }
        else if (host.IndexOf(':') == host.LastIndexOf(':') && host.Contains(':')) { //host:port, a bare ipv6 has more than one colon
            int colon = host.IndexOf(':');
            if (!int.TryParse(host[(colon + 1)..], out port)) return false;
            host = host[..colon];
        }

        return host.Length > 0 && port > 0 && port <= 65535;
    }

    //Reads a single TPKT packet (version 3, big-endian length including the 4-byte header).
    private static async Task<byte[]> ReadTpkt(NetworkStream stream, CancellationToken token) {
        byte[] header = new byte[4];
        await stream.ReadExactlyAsync(header, token);

        if (header[0] != 3) return null;

        int length = header[2] << 8 | header[3];
        if (length < 11 || length > 4096) return null;

        byte[] packet = new byte[length];
        header.CopyTo(packet, 0);
        await stream.ReadExactlyAsync(packet.AsMemory(4), token);

        return packet;
    }

    //TPKT (4 bytes) + X.224 connection confirm (7 bytes) + optional RDP_NEG_RSP or RDP_NEG_FAILURE (8 bytes)
    private static bool IsNegotiationFailure(byte[] x224) =>
        x224.Length >= 19 && x224[11] == TYPE_RDP_NEG_FAILURE;

    private static uint GetSelectedProtocol(byte[] x224) {
        if (x224.Length < 19 || x224[11] != TYPE_RDP_NEG_RSP) return PROTOCOL_RDP;
        return BitConverter.ToUInt32(x224, 15); //little-endian
    }

    internal static byte[] ToTlsConfirm(byte[] x224) {
        byte[] copy = x224.ToArray();
        if (copy.Length >= 19 && copy[11] == TYPE_RDP_NEG_RSP) {
            BitConverter.TryWriteBytes(copy.AsSpan(15, 4), PROTOCOL_SSL);
        }
        return copy;
    }

    private static Asn1Tag ContextTag(int value) => new Asn1Tag(TagClass.ContextSpecific, value, true);

    private static byte[] EncodePdu(Action<AsnWriter> writeFields) {
        AsnWriter writer = new AsnWriter(AsnEncodingRules.DER);

        using (writer.PushSequence()) {
            using (writer.PushSequence(ContextTag(0))) {
                writer.WriteInteger(new BigInteger(RDCLEANPATH_VERSION));
            }
            writeFields(writer);
        }

        return writer.Encode();
    }

    private static void WriteError(AsnWriter writer, ushort code, ushort? wsaError = null, byte? tlsAlert = null) {
        using (writer.PushSequence(ContextTag(1))) {
            using (writer.PushSequence()) {
                using (writer.PushSequence(ContextTag(0))) {
                    writer.WriteInteger(code);
                }

                if (wsaError.HasValue) {
                    using (writer.PushSequence(ContextTag(2))) {
                        writer.WriteInteger(wsaError.Value);
                    }
                }

                if (tlsAlert.HasValue) {
                    using (writer.PushSequence(ContextTag(3))) {
                        writer.WriteInteger(tlsAlert.Value);
                    }
                }
            }
        }
    }

    private static byte[] EncodeGeneralError() =>
        EncodePdu(writer => WriteError(writer, GENERAL_ERROR_CODE));

    private static byte[] EncodeWsaError(ushort wsaError) =>
        EncodePdu(writer => WriteError(writer, GENERAL_ERROR_CODE, wsaError: wsaError));

    private static byte[] EncodeTlsError(byte alert) =>
        EncodePdu(writer => WriteError(writer, GENERAL_ERROR_CODE, tlsAlert: alert));

    private static byte[] EncodeNegotiationError(byte[] x224) =>
        EncodePdu(writer => {
            WriteError(writer, NEGOTIATION_ERROR_CODE);
            using (writer.PushSequence(ContextTag(6))) {
                writer.WriteOctetString(x224);
            }
        });

    internal static byte[] EncodeResponse(byte[] x224, List<byte[]> certificateChain, string serverAddress) =>
        EncodePdu(writer => {
            using (writer.PushSequence(ContextTag(6))) {
                writer.WriteOctetString(x224);
            }

            using (writer.PushSequence(ContextTag(7))) {
                using (writer.PushSequence()) {
                    foreach (byte[] certificate in certificateChain) {
                        writer.WriteOctetString(certificate);
                    }
                }
            }

            using (writer.PushSequence(ContextTag(9))) {
                writer.WriteCharacterString(UniversalTagNumber.UTF8String, serverAddress);
            }
        });

    private static async Task SendPdu(WebSocket ws, byte[] pdu) {
        if (ws.State != WebSocketState.Open) return;

        try {
            using CancellationTokenSource cts = new CancellationTokenSource(5_000);
            await ws.SendAsync(new ArraySegment<byte>(pdu), WebSocketMessageType.Binary, true, cts.Token);
        }
        catch (Exception ex) {
            Logger.Debug(ex);
        }
    }

    //Sends a close frame without waiting for the reply, returns false if it didn't go out.
    private static async Task<bool> SendClose(WebSocket ws, string reason) {
        if (ws.State != WebSocketState.Open) return false;

        try {
            using CancellationTokenSource cts = new CancellationTokenSource(5_000);
            await ws.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, reason, cts.Token);
            return true;
        }
        catch (Exception ex) {
            Logger.Debug(ex);
            return false;
        }
    }

    private static async Task PumpToServer(HttpListenerContext ctx, WebSocket ws, Stream stream, CancellationTokenSource cts, StreamRecorder recorder, FlowControl flow, PointerTracker pointer) {
        ClientInfoOptimizer optimizer = new ClientInfoOptimizer();
        byte[] buffer = new byte[2048]; //input events are a few bytes each, larger messages are assembled

        try {
            while ((ws.State == WebSocketState.Open || ws.State == WebSocketState.CloseSent) && !cts.IsCancelled()) {
                (byte[] message, bool isText)? received = await ReceiveMessage(ws, buffer, cts.Token);
                if (received is null) {
                    return; //close frame received
                }

                //the gateway is closing, what the client sends before its reply has nowhere to go
                if (ws.State == WebSocketState.CloseSent) continue;

                //IronRDP only sends binary messages, text ones are the window's flow control acknowledgements
                if (received.Value.isText) {
                    if (long.TryParse(received.Value.message, out long processed)) {
                        flow.Acknowledge(processed);
                    }
                    continue;
                }

                byte[] message = received.Value.message;

                if (!Auth.IsAuthenticatedAndAuthorized(ctx, "/ws/rdp")) {
                    return;
                }

                optimizer.Observe(message);
                recorder?.ObserveClient(message);
                pointer.ObserveClient(message);

                await stream.WriteAsync(message, cts.Token);
                await stream.FlushAsync(cts.Token);
            }
        }
        catch (OperationCanceledException) { }
        catch (WebSocketException) { }
        catch (IOException) { }
        finally {
            cts.Cancel();
        }
    }

    private static async Task<(byte[] message, bool isText)?> ReceiveMessage(WebSocket ws, byte[] buffer, CancellationToken token) {
        WebSocketReceiveResult result = await ws.ReceiveAsync(new ArraySegment<byte>(buffer), token);
        if (result.MessageType == WebSocketMessageType.Close) return null;

        bool isText = result.MessageType == WebSocketMessageType.Text;
        if (result.EndOfMessage) return (buffer[..result.Count], isText);

        using MemoryStream ms = new MemoryStream();
        ms.Write(buffer, 0, result.Count);

        do {
            result = await ws.ReceiveAsync(new ArraySegment<byte>(buffer), token);
            if (result.MessageType == WebSocketMessageType.Close) return null;
            ms.Write(buffer, 0, result.Count);
        } while (!result.EndOfMessage);

        return (ms.ToArray(), isText);
    }

    private static async Task PumpToWs(WebSocket ws, Stream stream, CancellationTokenSource cts, StreamRecorder recorder, FlowControl flow, PointerTracker pointer) {
        //screen updates come in bursts, larger reads mean fewer WebSocket messages for the client to handle
        byte[] buffer = new byte[65_536];
        string reason = null;

        try {
            while (ws.State == WebSocketState.Open && !cts.IsCancelled()) {
                int allowed = await flow.AcquireAsync(buffer.Length, cts.Token);
                int count = await stream.ReadAsync(buffer.AsMemory(0, allowed), cts.Token);
                if (count == 0) {
                    reason = "The remote host closed the connection";
                    break;
                }
                flow.Consume(count);
                recorder?.ObserveServer(buffer, count);
                await ws.SendAsync(new ArraySegment<byte>(buffer, 0, count), WebSocketMessageType.Binary, true, cts.Token);

                //text messages would corrupt IronRDP's stream, they go only to a window that intercepts them
                List<string> pointers = pointer.ObserveServer(buffer, count);
                if (pointers is not null && flow.Enabled) {
                    foreach (string message in pointers) {
                        await ws.SendAsync(System.Text.Encoding.UTF8.GetBytes(message), WebSocketMessageType.Text, true, cts.Token);
                    }
                }
            }
        }
        catch (OperationCanceledException) { }
        catch (WebSocketException) { }
        catch (IOException) {
            reason = "The connection to the remote host was lost";
        }
        finally {
            //IronRDP reports an aborted WebSocket as a failed connection, so the client is told why it ends,
            //and the receive loop is left running to take the reply
            if (reason is null || !await SendClose(ws, reason)) {
                cts.Cancel();
            }
        }
    }

    //Returns true when the message is the client info PDU, its performance flags are then rewritten in place unless encrypted.
    //The IronRDP web client asks for the full experience, but without the graphics pipeline or bulk compression every
    //wallpaper redraw, animation and dragged window travels as bitmaps, so these are switched off, as Guacamole does.
    internal static bool OptimizeClientInfo(byte[] message) {
        //TPKT (4) + X.224 data (3) + MCS send data request (6 + 1 or 2 length bytes) + security header (4) + TS_INFO_PACKET
        if (message.Length < 15 || message[0] != 0x03 || message[5] != 0xf0 || (message[7] & 0xfc) != 0x64) return false;

        int length = Math.Min(message.Length, message[2] << 8 | message[3]);
        int security = (message[13] & 0x80) != 0 ? 15 : 14;
        if (length < security + 4 + 18) return false;

        ushort securityFlags = (ushort)(message[security] | message[security + 1] << 8);
        if ((securityFlags & SEC_INFO_PKT) == 0) return false;
        if ((securityFlags & SEC_ENCRYPT) != 0) return true; //standard RDP security, the packet can't be altered

        int info = security + 4;
        uint infoFlags = BitConverter.ToUInt32(message, info + 4);
        int terminator = (infoFlags & INFO_UNICODE) != 0 ? 2 : 1;

        //domain, username, password, alternate shell and working directory, their lengths exclude the terminator
        int offset = info + 18;
        for (int i = 0; i < 5; i++) {
            offset += BitConverter.ToUInt16(message, info + 8 + i * 2) + terminator;
        }

        //extended info: address family, client address, client directory, time zone, session id, performance flags
        if (offset + 4 > length) return true;
        offset += 4 + BitConverter.ToUInt16(message, offset + 2);

        if (offset + 2 > length) return true;
        offset += 2 + BitConverter.ToUInt16(message, offset);

        offset += 172 + 4;
        if (offset + 4 > length) return true;

        uint performanceFlags = BitConverter.ToUInt32(message, offset);
        BitConverter.TryWriteBytes(message.AsSpan(offset, 4), performanceFlags | OPTIMIZED_PERFORMANCE_FLAGS);

        return true;
    }

    //Looks for the client info PDU among the client's messages until the connection sequence is over. CredSSP comes
    //first and its DER messages start with 0x30, which reads as fast-path input, so input only marks the end once the
    //client has moved on to TPKT framed messages. Past the client info PDU nothing is inspected, as later PDUs could
    //pass for one.
    internal sealed class ClientInfoOptimizer {
        private bool tpktSeen;

        public bool Done { get; private set; }

        public void Observe(byte[] message) {
            if (Done || message.Length == 0) return;

            if (OptimizeClientInfo(message)) {
                Done = true;
            }
            else if (IsSlowPath(message)) {
                tpktSeen = true;
            }
            else if (tpktSeen && (message[0] & 0x03) == 0) {
                Done = true; //fast-path input, the client info PDU went by unrecognized
            }
        }
    }

    //The client's first slow-path PDU is the MCS connect initial, it is sent once CredSSP is over.
    private static bool IsSlowPath(byte[] message) =>
        message.Length >= 2 && message[0] == 0x03 && message[1] == 0x00;

    //TPKT carries its length in bytes 2-3, fast-path output in byte 1, or bytes 1-2 when the high bit is set.
    //Returns 0 while more header bytes are needed, or -1 when they are not RDP framing.
    private static int GetFrameLength(ReadOnlySpan<byte> header) {
        if (header[0] == 0x03) {
            if (header.Length < 4) return 0;
            int length = header[2] << 8 | header[3];
            return length >= 7 ? length : -1;
        }

        if ((header[0] & 0x03) != 0) return -1;
        if (header.Length < 2) return 0;
        if ((header[1] & 0x80) == 0) return header[1] >= 2 ? header[1] : -1;
        if (header.Length < 3) return 0;

        int fastPathLength = (header[1] & 0x7f) << 8 | header[2];
        return fastPathLength >= 3 ? fastPathLength : -1;
    }

    //Fast-path input PDUs from the client, true when one carries a key or a mouse click, pointer moves alone don't count.
    internal static bool HasUserInput(byte[] message) {
        if (message.Length < 2 || (message[0] & 0x03) != 0) return false; //not fast-path

        int numEvents = message[0] >> 2 & 0x0f;
        int i = (message[1] & 0x80) != 0 ? 3 : 2;

        if (numEvents == 0) {
            if (i >= message.Length) return false;
            numEvents = message[i++];
        }

        for (int n = 0; n < numEvents && i < message.Length; n++) {
            int eventCode = message[i] >> 5 & 0x07;
            i++;

            switch (eventCode) {
            case 0: //scancode
            case 4: //unicode
                return true;

            case 1: //mouse
            case 5: //relative mouse
                if (i + 2 > message.Length) return false;
                ushort pointerFlags = (ushort)(message[i] | message[i + 1] << 8);
                if ((pointerFlags & 0xf600) != 0) return true; //buttons and wheels
                i += 6;
                break;

            case 2: //extended mouse buttons
                return true;

            case 3: //synchronize
                break;

            case 6: //quality of experience timestamp
                i += 4;
                break;

            default:
                return false;
            }
        }

        return false;
    }

    //Records the server's output for playback. Everything before the MCS connection (CredSSP and the early user
    //authorization result) is left out, as the player connects without CredSSP, and a licensing exchange is replaced
    //with a "valid client" status, as its messages are bound to the original client's randoms and can't be replayed.
    //Once licensing is over the stream is recorded as is.
    internal sealed class StreamRecorder {
        private const ushort SEC_LICENSE_PKT = 0x0080;

        private const byte LICENSE_NEW_LICENSE = 0x03;
        private const byte LICENSE_UPGRADE_LICENSE = 0x04;
        private const byte LICENSE_ERROR_ALERT = 0xff;

        private static readonly byte[] VALID_CLIENT_MESSAGE = {
            0x80, 0x00, 0x00, 0x00, //security header, SEC_LICENSE_PKT
            0xff, 0x83, 0x10, 0x00, //preamble, error alert, version 3 with extended error messages, 16 bytes
            0x07, 0x00, 0x00, 0x00, //STATUS_VALID_CLIENT
            0x02, 0x00, 0x00, 0x00, //ST_NO_TRANSITION
            0x04, 0x00, 0x00, 0x00  //empty error blob
        };

        private readonly Action<byte[], int> write;
        private readonly Action interacted;
        private readonly List<byte> pending = new List<byte>();

        private volatile bool started;
        private bool dropping; //a license request was replaced, the rest of the exchange is left out
        private bool passthrough;

        public StreamRecorder(Action<byte[], int> write, Action interacted) {
            this.write = write;
            this.interacted = interacted;
        }

        public void ObserveClient(byte[] message) {
            if (!started && IsSlowPath(message)) {
                started = true;
            }

            if (started && HasUserInput(message)) {
                interacted();
            }
        }

        public void ObserveServer(byte[] buffer, int count) {
            if (!started) return;

            if (passthrough) {
                write(buffer, count);
                return;
            }

            pending.AddRange(buffer.AsSpan(0, count));

            int offset = 0;
            while (!passthrough && pending.Count - offset >= 4) {
                if (pending[offset] != 0x03) { //fast-path output, the connection sequence is over
                    passthrough = true;
                    break;
                }

                int length = pending[offset + 2] << 8 | pending[offset + 3];
                if (length < 4) {
                    passthrough = true;
                    break;
                }

                if (pending.Count - offset < length) break;

                byte[] pdu = pending.GetRange(offset, length).ToArray();
                offset += length;

                //up to the end of licensing every send data indication carries a security header, later ones may not
                int licenseType = GetLicenseMessageType(pdu);

                if (licenseType < 0) {
                    write(pdu, pdu.Length);
                }
                else if (dropping) {
                    passthrough = licenseType == LICENSE_NEW_LICENSE || licenseType == LICENSE_UPGRADE_LICENSE || licenseType == LICENSE_ERROR_ALERT;
                }
                else if (licenseType == LICENSE_ERROR_ALERT) { //the server skipped the exchange
                    write(pdu, pdu.Length);
                    passthrough = true;
                }
                else {
                    byte[] replacement = BuildValidClient(pdu);
                    write(replacement, replacement.Length);
                    dropping = true;
                }
            }

            if (passthrough) {
                byte[] rest = pending.GetRange(offset, pending.Count - offset).ToArray();
                if (rest.Length > 0) write(rest, rest.Length);
                pending.Clear();
            }
            else {
                pending.RemoveRange(0, offset);
            }
        }

        //TPKT (4) + X.224 data (3) + MCS send data indication (6 + 1 or 2 length bytes) + security header + licensing preamble
        private static int GetLicenseMessageType(byte[] pdu) {
            if (pdu.Length < 15 || pdu[5] != 0xf0 || (pdu[7] & 0xfc) != 0x68) return -1;

            int payload = (pdu[13] & 0x80) != 0 ? 15 : 14;
            if (pdu.Length < payload + 5) return -1;

            ushort flags = (ushort)(pdu[payload] | pdu[payload + 1] << 8);
            if ((flags & SEC_LICENSE_PKT) == 0) return -1;

            return pdu[payload + 4];
        }

        private static byte[] BuildValidClient(byte[] pdu) {
            int length = 14 + VALID_CLIENT_MESSAGE.Length;
            byte[] result = new byte[length];

            result[0] = 0x03; //TPKT
            result[3] = (byte)length;
            result[4] = 0x02; //X.224 data
            result[5] = 0xf0;
            result[6] = 0x80;
            Array.Copy(pdu, 7, result, 7, 6); //MCS send data indication, initiator, channel and priority
            result[13] = (byte)VALID_CLIENT_MESSAGE.Length;
            VALID_CLIENT_MESSAGE.CopyTo(result, 14);

            return result;
        }
    }

    //The IronRDP web client decodes whatever arrives on the browser's main thread, it never pushes back, so a server
    //drawing faster than the browser decodes builds up a backlog and the lag keeps growing (IronRDP issue #790).
    //The window reports how many bytes it has handed to IronRDP, which decodes and draws each message right away, and
    //the gateway keeps at most WINDOW bytes ahead of that. Past it the gateway stops reading, the server's send queue
    //fills up, and the server merges its pending updates the way it does for any slow client.
    internal sealed class FlowControl {
        public const int WINDOW = 131_072; //how far the browser may fall behind, the lag it can build up is about this over its decoding speed

        private readonly SemaphoreSlim acknowledged = new SemaphoreSlim(0, 1);
        private long sent;
        private long processed;
        private volatile bool enabled; //the first acknowledgement enables it, a client that never sends one is never held back

        //a window that acknowledges also takes the gateway's text messages
        public bool Enabled => enabled;

        public void Acknowledge(long count) {
            long current = Interlocked.Read(ref processed);
            while (count > current) {
                long previous = Interlocked.CompareExchange(ref processed, count, current);
                if (previous == current) break;
                current = previous;
            }

            enabled = true;

            if (acknowledged.CurrentCount == 0) {
                try { acknowledged.Release(); }
                catch (SemaphoreFullException) { }
            }
        }

        //Returns how many bytes may be read from the server now, waiting for the browser to catch up when it is a window behind.
        public async Task<int> AcquireAsync(int wanted, CancellationToken token) {
            while (enabled) {
                long ahead = Interlocked.Read(ref sent) - Interlocked.Read(ref processed);
                if (ahead < WINDOW) return (int)Math.Min(WINDOW - ahead, wanted);

                await acknowledged.WaitAsync(token);
            }

            return wanted;
        }

        public void Consume(int count) {
            Interlocked.Add(ref sent, count);
        }
    }

    //Follows the framing of a recorded server stream and reports the desktop size of every demand active PDU.
    //A player has to resize its canvas itself on a server driven reactivation, IronRDP only does that for its own requests.
    internal sealed class DesktopSizeScanner {
        private readonly List<byte> frame = new List<byte>();
        private int frameLength; //0 while the length is unknown
        private int skip;        //bytes left of a fast-path frame, these are never inspected
        private bool lost;

        public List<(int width, int height)> Scan(byte[] data) {
            List<(int, int)> sizes = null;
            int i = 0;

            while (i < data.Length && !lost) {
                if (skip > 0) {
                    int skipped = Math.Min(skip, data.Length - i);
                    i += skipped;
                    skip -= skipped;
                    continue;
                }

                if (frameLength == 0) {
                    frame.Add(data[i++]);
                    frameLength = GetFrameLength(CollectionsMarshal.AsSpan(frame));

                    if (frameLength < 0 || frameLength > 0 && frameLength < frame.Count) {
                        lost = true; //not RDP framing, stop looking
                        break;
                    }

                    if (frameLength > 0 && frame[0] != 0x03) { //fast-path output
                        skip = frameLength - frame.Count;
                        frame.Clear();
                        frameLength = 0;
                    }
                }
                else {
                    int take = Math.Min(frameLength - frame.Count, data.Length - i);
                    frame.AddRange(data.AsSpan(i, take));
                    i += take;
                }

                if (frameLength > 0 && frame.Count == frameLength) {
                    (int, int)? size = GetDemandActiveSize(frame.ToArray());
                    if (size.HasValue) (sizes ??= new List<(int, int)>()).Add(size.Value);

                    frame.Clear();
                    frameLength = 0;
                }
            }

            return sizes;
        }

        //TPKT + X.224 data + MCS send data indication + share control header (no security header past licensing),
        //then the demand active PDU, whose bitmap capability set holds the desktop size.
        internal static (int width, int height)? GetDemandActiveSize(byte[] pdu) {
            if (pdu.Length < 20 || pdu[5] != 0xf0 || (pdu[7] & 0xfc) != 0x68) return null;

            int share = (pdu[13] & 0x80) != 0 ? 15 : 14;
            if (pdu.Length < share + 6 + 8) return null;

            ushort pduType = BitConverter.ToUInt16(pdu, share + 2);
            if (pduType != 0x0011) return null; //version 1, demand active

            int demandActive = share + 6;
            int sourceDescriptorLength = BitConverter.ToUInt16(pdu, demandActive + 4);

            int offset = demandActive + 8 + sourceDescriptorLength;
            if (offset + 4 > pdu.Length) return null;

            int count = BitConverter.ToUInt16(pdu, offset);
            offset += 4; //number of capabilities and padding

            for (int n = 0; n < count && offset + 4 <= pdu.Length; n++) {
                ushort type = BitConverter.ToUInt16(pdu, offset);
                ushort length = BitConverter.ToUInt16(pdu, offset + 2);
                if (length < 4) return null;

                if (type == 0x0002 && length >= 16 && offset + 16 <= pdu.Length) { //bitmap capability set
                    return (BitConverter.ToUInt16(pdu, offset + 12), BitConverter.ToUInt16(pdu, offset + 14));
                }

                offset += length;
            }

            return null;
        }
    }

    //A recording holds the server's side of a connection, so the player has to agree with it on the channels. IronRDP
    //pairs the static virtual channels it requests with the recorded channel IDs by position and fails on traffic for one
    //it does not have, and what it requests depends on the browser (the clipboard needs a secure context) and on the
    //features in use. The player needs none of them, graphics come over the I/O channel, so the recorded traffic on the
    //recorded client's static channels is dropped. Their IDs come from the recorded MCS connect response.
    internal sealed class ChannelFilter {
        private const ushort SC_CORE = 0x0c01;
        private const ushort SC_NET  = 0x0c03;

        private readonly List<byte> frame = new List<byte>();
        private int frameLength; //0 while unknown
        private HashSet<int> channels;
        private bool lost;

        //Returns the complete PDUs of the stream so far that the player should get, a PDU split between reads goes out with the later one.
        public byte[] Filter(byte[] data) {
            if (lost) return data;

            using MemoryStream output = new MemoryStream(data.Length);
            int i = 0;

            while (i < data.Length) {
                if (frameLength == 0) {
                    frame.Add(data[i++]);
                    frameLength = GetFrameLength(CollectionsMarshal.AsSpan(frame));

                    if (frameLength < 0) { //not RDP framing, everything goes through from here on
                        lost = true;
                        output.Write(frame.ToArray());
                        output.Write(data, i, data.Length - i);
                        frame.Clear();
                        return output.ToArray();
                    }

                    if (frameLength == 0) continue;
                }

                int take = Math.Min(frameLength - frame.Count, data.Length - i);
                frame.AddRange(data.AsSpan(i, take));
                i += take;

                if (frame.Count == frameLength) {
                    byte[] pdu = frame.ToArray();
                    frame.Clear();
                    frameLength = 0;

                    if (Keep(pdu)) output.Write(pdu);
                }
            }

            return output.ToArray();
        }

        private bool Keep(byte[] pdu) {
            if (pdu[0] != 0x03 || pdu.Length < 12 || pdu[5] != 0xf0) return true; //fast-path output, or not X.224 data

            if (pdu[7] == 0x7f && pdu[8] == 0x66) { //MCS connect response
                channels = GetStaticChannels(pdu);
                return true;
            }

            if ((pdu[7] & 0xfc) == 0x68 && channels is not null) { //MCS send data indication: initiator, then channel ID
                int channelId = pdu[10] << 8 | pdu[11];
                return !channels.Contains(channelId);
            }

            return true;
        }

        //The server data blocks close the connect response, the server core data block first. The network data block lists the channel IDs.
        internal static HashSet<int> GetStaticChannels(byte[] pdu) {
            for (int start = 7; start + 4 <= pdu.Length; start++) {
                if (BitConverter.ToUInt16(pdu, start) != SC_CORE) continue;

                HashSet<int> found = null;
                int offset = start;

                while (offset + 4 <= pdu.Length) {
                    ushort type = BitConverter.ToUInt16(pdu, offset);
                    ushort length = BitConverter.ToUInt16(pdu, offset + 2);
                    if ((type & 0xff00) != 0x0c00 || length < 4 || offset + length > pdu.Length) break;

                    if (type == SC_NET && length >= 8) {
                        int count = BitConverter.ToUInt16(pdu, offset + 6);
                        if (8 + count * 2 > length) break;

                        found = new HashSet<int>();
                        for (int n = 0; n < count; n++) {
                            found.Add(BitConverter.ToUInt16(pdu, offset + 8 + n * 2));
                        }
                    }

                    offset += length;
                }

                if (offset == pdu.Length && found is not null) return found;
            }

            return null;
        }
    }

    //IronRDP's web client (0.7.0) leaves the server's pointer updates unhandled, its canvas would always show the
    //browser's arrow. The gateway follows the server's fast-path output and hands each pointer shape to the window as a
    //text message, which the window applies as the canvas cursor. Everything before the client's first slow-path PDU is
    //CredSSP and is not inspected.
    internal sealed class PointerTracker {
        private const byte UPDATETYPE_PTR_NULL      = 0x5;
        private const byte UPDATETYPE_PTR_DEFAULT   = 0x6;
        private const byte UPDATETYPE_COLOR         = 0x9;
        private const byte UPDATETYPE_CACHED        = 0xa;
        private const byte UPDATETYPE_POINTER       = 0xb;
        private const byte UPDATETYPE_LARGE_POINTER = 0xc;

        private const int FRAGMENT_SINGLE = 0;
        private const int FRAGMENT_LAST   = 1;
        private const int FRAGMENT_FIRST  = 2;

        private const int COMPRESSION_USED = 0x2;
        private const byte PACKET_COMPRESSED = 0x20;

        private const int MAX_POINTER_SIZE = 384;

        private readonly byte[] frame = new byte[0x8000]; //a fast-path PDU is at most 0x7fff bytes long
        private int filled;
        private int length; //0 while unknown
        private int skip;   //bytes left of a slow-path PDU, pointers come as fast-path output
        private bool lost;
        private volatile bool started;

        private MemoryStream fragments;
        private int fragmentCode;

        public void ObserveClient(byte[] message) {
            if (!started && IsSlowPath(message)) {
                started = true;
            }
        }

        //Returns the pointer messages found in this piece of server output, null when there are none.
        public List<string> ObserveServer(byte[] data, int count) {
            if (!started || lost) return null;

            List<string> messages = null;
            int i = 0;

            while (i < count) {
                if (skip > 0) {
                    int skipped = Math.Min(skip, count - i);
                    i += skipped;
                    skip -= skipped;
                    continue;
                }

                if (length == 0) {
                    frame[filled++] = data[i++];
                    length = GetFrameLength(frame.AsSpan(0, filled));

                    if (length < 0) {
                        lost = true; //not RDP framing, stop looking
                        return messages;
                    }

                    if (length == 0) continue;

                    if (frame[0] == 0x03) {
                        skip = length - filled;
                        filled = 0;
                        length = 0;
                        continue;
                    }
                }
                else {
                    int take = Math.Min(length - filled, count - i);
                    Buffer.BlockCopy(data, i, frame, filled, take);
                    filled += take;
                    i += take;
                }

                if (filled == length) {
                    ParseFastPath(ref messages);
                    filled = 0;
                    length = 0;
                }
            }

            return messages;
        }

        private void ParseFastPath(ref List<string> messages) {
            if ((frame[0] & 0xc0) != 0) return; //encrypted, standard RDP security

            int p = (frame[1] & 0x80) != 0 ? 3 : 2;

            while (p + 3 <= length) {
                byte header = frame[p++];
                int code = header & 0x0f;
                int fragmentation = header >> 4 & 0x03;

                bool compressed = false;
                if ((header >> 6 & 0x03) == COMPRESSION_USED) {
                    compressed = (frame[p++] & PACKET_COMPRESSED) != 0;
                }

                if (p + 2 > length) return;
                int size = frame[p] | frame[p + 1] << 8;
                p += 2;
                if (p + size > length) return;

                ReadOnlySpan<byte> update = frame.AsSpan(p, size);
                p += size;

                if (code is not (UPDATETYPE_PTR_NULL or UPDATETYPE_PTR_DEFAULT or UPDATETYPE_COLOR or UPDATETYPE_CACHED or UPDATETYPE_POINTER or UPDATETYPE_LARGE_POINTER)) {
                    continue;
                }

                if (compressed) { //bulk compression is never negotiated, nothing to decompress with
                    fragments = null;
                    continue;
                }

                if (fragmentation != FRAGMENT_SINGLE) {
                    if (fragmentation == FRAGMENT_FIRST) {
                        fragments = new MemoryStream();
                        fragmentCode = code;
                    }

                    if (fragments is null || fragmentCode != code) continue;

                    fragments.Write(update);
                    if (fragmentation != FRAGMENT_LAST) continue;

                    update = fragments.ToArray();
                    fragments = null;
                }

                string message = Describe(code, update);
                if (message is not null) {
                    (messages ??= new List<string>()).Add(message);
                }
            }
        }

        internal static string Describe(int code, ReadOnlySpan<byte> update) {
            switch (code) {
            case UPDATETYPE_PTR_NULL:    return "{\"pointer\":\"hidden\"}";
            case UPDATETYPE_PTR_DEFAULT: return "{\"pointer\":\"default\"}";

            case UPDATETYPE_CACHED:
                if (update.Length < 2) return null;
                return $"{{\"pointer\":\"cached\",\"index\":{BitConverter.ToUInt16(update)}}}";

            case UPDATETYPE_COLOR:
                return DescribeColorPointer(24, update);

            case UPDATETYPE_POINTER:
                if (update.Length < 2) return null;
                return DescribeColorPointer(BitConverter.ToUInt16(update), update[2..]);

            case UPDATETYPE_LARGE_POINTER:
                return DescribeLargePointer(update);
            }

            return null;
        }

        //TS_COLORPOINTERATTRIBUTE: cache index, hot spot, size, mask lengths, then the XOR and the AND masks
        private static string DescribeColorPointer(int bpp, ReadOnlySpan<byte> data) {
            if (data.Length < 14) return null;

            int index   = BitConverter.ToUInt16(data);
            int x       = BitConverter.ToUInt16(data[2..]);
            int y       = BitConverter.ToUInt16(data[4..]);
            int width   = BitConverter.ToUInt16(data[6..]);
            int height  = BitConverter.ToUInt16(data[8..]);
            int andMask = BitConverter.ToUInt16(data[10..]);
            int xorMask = BitConverter.ToUInt16(data[12..]);
            if (14 + xorMask + andMask > data.Length) return null;

            byte[] rgba = DecodePointer(bpp, width, height, data.Slice(14, xorMask), data.Slice(14 + xorMask, andMask));
            return PointerMessage(index, x, y, width, height, rgba);
        }

        //TS_LARGEPOINTERATTRIBUTE: like a color pointer, with its own bpp and 32-bit mask lengths, for up to 384x384
        private static string DescribeLargePointer(ReadOnlySpan<byte> data) {
            if (data.Length < 20) return null;

            int bpp     = BitConverter.ToUInt16(data);
            int index   = BitConverter.ToUInt16(data[2..]);
            int x       = BitConverter.ToUInt16(data[4..]);
            int y       = BitConverter.ToUInt16(data[6..]);
            int width   = BitConverter.ToUInt16(data[8..]);
            int height  = BitConverter.ToUInt16(data[10..]);
            long andMask = BitConverter.ToUInt32(data[12..]);
            long xorMask = BitConverter.ToUInt32(data[16..]);
            if (20 + xorMask + andMask > data.Length) return null;

            byte[] rgba = DecodePointer(bpp, width, height, data.Slice(20, (int)xorMask), data.Slice(20 + (int)xorMask, (int)andMask));
            return PointerMessage(index, x, y, width, height, rgba);
        }

        //rgba is empty for a pointer with no size or one that could not be decoded
        private static string PointerMessage(int index, int x, int y, int width, int height, byte[] rgba) =>
            $"{{\"pointer\":\"new\",\"index\":{index},\"x\":{x},\"y\":{y},\"width\":{width},\"height\":{height},\"rgba\":\"{(rgba is null ? String.Empty : Convert.ToBase64String(rgba))}\"}}";

        //Decodes a pointer bitmap into straight RGBA rows, top to bottom, the way IronRDP does: scan lines are padded to
        //two bytes and stored bottom-up (monochrome ones top-down), a set AND bit over black is transparent, and over white
        //it inverts the screen, which no browser cursor can, so a checker pattern stands in. Returns null when malformed.
        internal static byte[] DecodePointer(int bpp, int width, int height, ReadOnlySpan<byte> xorMask, ReadOnlySpan<byte> andMask) {
            if (width == 0 || height == 0) return Array.Empty<byte>();
            if (bpp is not (1 or 16 or 24 or 32)) return null;
            if (width > MAX_POINTER_SIZE || height > MAX_POINTER_SIZE) return null;

            int xorStride = (width * bpp + 15) / 16 * 2;
            int andStride = (width + 15) / 16 * 2;
            if (xorMask.Length != xorStride * height) return null;
            if (andMask.Length != 0 && andMask.Length != andStride * height) return null;

            byte[] rgba = new byte[width * height * 4];
            bool bottomUp = bpp != 1;

            for (int row = 0; row < height; row++) {
                int source = bottomUp ? height - 1 - row : row;
                ReadOnlySpan<byte> xorRow = xorMask.Slice(source * xorStride, xorStride);
                ReadOnlySpan<byte> andRow = andMask.Length == 0 ? ReadOnlySpan<byte>.Empty : andMask.Slice(source * andStride, andStride);

                for (int col = 0; col < width; col++) {
                    bool andBit = andRow.Length > 0 && (andRow[col >> 3] >> (7 - (col & 7)) & 1) != 0;
                    byte r, g, b, a = 0xff;

                    switch (bpp) {
                    case 1:
                        r = g = b = (xorRow[col >> 3] >> (7 - (col & 7)) & 1) != 0 ? (byte)0xff : (byte)0x00;
                        break;

                    case 16:
                        int color = xorRow[col * 2] | xorRow[col * 2 + 1] << 8;
                        r = (byte)(((color >> 11 & 0x1f) * 527 + 23) >> 6);
                        g = (byte)(((color >> 5 & 0x3f) * 259 + 33) >> 6);
                        b = (byte)(((color & 0x1f) * 527 + 23) >> 6);
                        break;

                    case 24:
                        b = xorRow[col * 3];
                        g = xorRow[col * 3 + 1];
                        r = xorRow[col * 3 + 2];
                        break;

                    default:
                        b = xorRow[col * 4];
                        g = xorRow[col * 4 + 1];
                        r = xorRow[col * 4 + 2];
                        a = xorRow[col * 4 + 3];
                        break;
                    }

                    int offset = (row * width + col) * 4;

                    if (andBit && a == 0xff && r == 0x00 && g == 0x00 && b == 0x00) {
                        continue; //transparent, the array starts zeroed
                    }

                    if (andBit && a == 0xff && r == 0xff && g == 0xff && b == 0xff) {
                        r = g = b = (row + col) % 2 == 0 ? (byte)0xff : (byte)0x00;
                    }

                    rgba[offset]     = r;
                    rgba[offset + 1] = g;
                    rgba[offset + 2] = b;
                    rgba[offset + 3] = a;
                }
            }

            return rgba;
        }
    }

    private static bool IsCancelled(this CancellationTokenSource cts) => cts.Token.IsCancellationRequested;
}

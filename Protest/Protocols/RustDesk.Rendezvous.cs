using System.Buffers.Binary;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Org.BouncyCastle.Math.EC.Rfc8032;

namespace Protest.Protocols;

//Reaching a host by its RustDesk ID. The ID server (hbbs) is asked for the host: behind the same public address as the
//gateway the host listens on its local address and the gateway connects to it, otherwise the host joins a relay (hbbr)
//and the gateway meets it there. Hole punching is left out, the gateway is a server and the relay always gets through.
//The ID server signs each host's identity key with its own, so with the server's key set the host's signed identity is
//checked before the key exchange, which direct IP access has no way to do.
internal static partial class RustDesk {

    internal const int RENDEZVOUS_PORT = 21116;
    internal const int RELAY_PORT      = 21117;
    private const int RENDEZVOUS_TIMEOUT    = 15_000;
    private const int LOCAL_CONNECT_TIMEOUT = 3_000;

    //RustDesk's own servers, as its client ships them
    internal const string PUBLIC_ID_SERVER  = "rs-ny.rustdesk.com";
    internal const string PUBLIC_SERVER_KEY = "OeVuKk5nlHiXp+APNn0Y3pC1Iwpwn44JGqrQCsWqmBw=";

    //the union of RendezvousMessage, by field number
    private const int RV_PUNCH_HOLE_REQUEST  = 8;
    private const int RV_PUNCH_HOLE_RESPONSE = 11;
    private const int RV_REQUEST_RELAY       = 18;
    private const int RV_RELAY_RESPONSE      = 19;

    private const int NAT_SYMMETRIC = 2; //a host told so relays rather than punches

    internal sealed class ServerProfile {
        public string idServer    = String.Empty; //host or host:port
        public string relayServer = String.Empty; //empty for the one the ID server names
        public string key         = String.Empty; //the ID server's public key, base64
    }

    internal sealed class RendezvousException : Exception {
        public RendezvousException(string message) : base(message) { }
    }

    private static readonly object serversMutex = new object();
    private static ServerProfile selfHostedServer, publicServer;

    //The profile a connection goes through, null for a self-hosted server that isn't set up.
    //The public servers fall back to RustDesk's own where they are left blank.
    internal static ServerProfile GetServer(bool isPublic) {
        lock (serversMutex) {
            if (publicServer is null) LoadServers();

            if (!isPublic) {
                return selfHostedServer.idServer.Length > 0 ? selfHostedServer : null;
            }

            return new ServerProfile {
                idServer    = publicServer.idServer.Length > 0 ? publicServer.idServer : PUBLIC_ID_SERVER,
                relayServer = publicServer.relayServer,
                key         = publicServer.key.Length > 0 ? publicServer.key : PUBLIC_SERVER_KEY
            };
        }
    }

    private static void LoadServers() {
        selfHostedServer = new ServerProfile();
        publicServer = new ServerProfile();

        try {
            if (!File.Exists(Data.FILE_RUSTDESK_SERVERS)) return;

            using JsonDocument doc = JsonDocument.Parse(File.ReadAllText(Data.FILE_RUSTDESK_SERVERS));
            selfHostedServer = ReadServer(doc.RootElement, "selfhosted");
            publicServer = ReadServer(doc.RootElement, "public");
        }
        catch (Exception ex) {
            Logger.Error(ex);
        }
    }

    private static ServerProfile ReadServer(JsonElement root, string name) {
        ServerProfile server = new ServerProfile();
        if (!root.TryGetProperty(name, out JsonElement element) || element.ValueKind != JsonValueKind.Object) return server;

        server.idServer    = ReadString(element, "idServer");
        server.relayServer = ReadString(element, "relayServer");
        server.key         = ReadString(element, "key");
        return server;
    }

    private static string ReadString(JsonElement element, string name) =>
        element.TryGetProperty(name, out JsonElement value) && value.ValueKind == JsonValueKind.String ? value.GetString().Trim() : String.Empty;

    internal static byte[] GetServerSettings() {
        ServerProfile selfHosted, publicDefaults;
        lock (serversMutex) {
            if (publicServer is null) LoadServers();
            selfHosted = selfHostedServer;
        }
        publicDefaults = GetServer(true);

        return Encoding.UTF8.GetBytes($"{{\"selfhosted\":{WriteServer(selfHosted)},\"public\":{WriteServer(publicDefaults)}}}");
    }

    private static string WriteServer(ServerProfile server) =>
        $"{{\"idServer\":\"{Data.EscapeJsonText(server.idServer)}\",\"relayServer\":\"{Data.EscapeJsonText(server.relayServer)}\",\"key\":\"{Data.EscapeJsonText(server.key)}\"}}";

    internal static byte[] SaveServerSettings(HttpListenerContext ctx, string origin) {
        if (ctx.Request.ContentLength64 > 64 * 1024) return Data.CODE_INVALID_ARGUMENT.Array;

        using StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding);
        string payload = reader.ReadToEnd();
        if (String.IsNullOrEmpty(payload)) return Data.CODE_INVALID_ARGUMENT.Array;

        ServerProfile selfHosted, publicOverride;
        try {
            using JsonDocument doc = JsonDocument.Parse(payload);
            selfHosted = ReadServer(doc.RootElement, "selfhosted");
            publicOverride = ReadServer(doc.RootElement, "public");
        }
        catch (JsonException) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        string error = ValidateServer(selfHosted, "self-hosted") ?? ValidateServer(publicOverride, "public");
        if (error is not null) {
            return Encoding.UTF8.GetBytes($"{{\"error\":\"{Data.EscapeJsonText(error)}\"}}");
        }

        try {
            lock (serversMutex) {
                File.WriteAllText(Data.FILE_RUSTDESK_SERVERS, $"{{\"selfhosted\":{WriteServer(selfHosted)},\"public\":{WriteServer(publicOverride)}}}");
                selfHostedServer = selfHosted;
                publicServer = publicOverride;
            }
        }
        catch (Exception ex) {
            Logger.Error(ex);
            return Data.CODE_FAILED.Array;
        }

        Logger.Action(origin, "Environment", "Modify RustDesk servers");
        return Data.CODE_OK.Array;
    }

    //Returns why the profile can't be used, null when it can.
    internal static string ValidateServer(ServerProfile server, string name) {
        if (!IsServerAddress(server.idServer)) return $"The {name} ID server is not a valid host";
        if (!IsServerAddress(server.relayServer)) return $"The {name} relay server is not a valid host";
        if (server.idServer.Length == 0 && server.relayServer.Length > 0) return $"The {name} relay server needs an ID server";
        if (server.key.Length > 0 && DecodeServerKey(server.key) is null) return $"The {name} key is not a RustDesk server key";
        return null;
    }

    //host, host:port or [ipv6]:port, empty for none
    internal static bool IsServerAddress(string value) {
        if (value.Length == 0) return true;
        if (value.Length > 260 || value.Contains("://")) return false;
        foreach (char c in value) {
            if (Char.IsWhiteSpace(c) || Char.IsControl(c)) return false;
        }

        (string host, _) = Ssh.ParseTarget(value, RENDEZVOUS_PORT);
        return Uri.CheckHostName(host) != UriHostNameType.Unknown;
    }

    //the server's Ed25519 public key, as hbbs prints it in id_ed25519.pub
    internal static byte[] DecodeServerKey(string key) {
        byte[] bytes = new byte[32];
        return Convert.TryFromBase64String(key, bytes, out int length) && length == 32 ? bytes : null;
    }

    //The ID as RustDesk shows it, grouped by spaces: digits, or a custom ID of letters, digits, '-' and '_'.
    //Returns null for anything else.
    internal static string NormalizePeerId(string value) {
        if (String.IsNullOrEmpty(value)) return null;

        StringBuilder builder = new StringBuilder(value.Length);
        foreach (char c in value) {
            if (Char.IsWhiteSpace(c)) continue;
            if (!Char.IsAsciiLetterOrDigit(c) && c != '-' && c != '_') return null;
            builder.Append(c);
        }

        return builder.Length is > 0 and <= 64 ? builder.ToString() : null;
    }

    //Connects to the host the ID server knows by the ID. Returns the stream to the host, the host's identity as the
    //server signs it (empty when it signs none), and whether the stream goes through the relay.
    internal static async Task<(TcpClient tcp, byte[] signedIdPk, bool relayed)> ConnectByIdAsync(string id, ServerProfile server, CancellationToken token) {
        (string rvHost, int rvPort) = Ssh.ParseTarget(server.idServer, RENDEZVOUS_PORT);

        using TcpClient rendezvous = await ConnectTcpAsync(rvHost, rvPort, "the ID server", token);
        Connection channel = new Connection(rendezvous.GetStream());

        await channel.SendAsync(new ProtoWriter().Message(RV_PUNCH_HOLE_REQUEST, new ProtoWriter()
            .String(1, id)
            .Varint(2, NAT_SYMMETRIC)   //nat_type
            .String(3, server.key)      //licence_key
            .String(6, CLIENT_VERSION)
            .Bool(8, true))             //force_relay
            .ToArray(), token);

        while (true) {
            byte[] message = await ReceiveRendezvousAsync(channel, token);
            ProtoReader reader = new ProtoReader(message);
            if (!reader.Next()) continue;

            switch (reader.Field) {
            case RV_PUNCH_HOLE_RESPONSE: {
                ProtoReader response = reader.Nested();
                byte[] address = null, signedIdPk = Array.Empty<byte>();
                string relayServer = String.Empty, otherFailure = String.Empty;
                ulong failure = 0;
                while (response.Next()) {
                    switch (response.Field) {
                    case 1: address = response.Bytes(); break;
                    case 2: signedIdPk = response.Bytes(); break;
                    case 3: failure = response.Value; break;
                    case 4: relayServer = response.String(); break;
                    case 7: otherFailure = response.String(); break;
                    }
                }

                IPEndPoint endPoint = DecodeAddress(address);
                if (endPoint is null) {
                    throw new RendezvousException(otherFailure.Length > 0 ? otherFailure : DescribePunchFailure(failure));
                }

                //the host listens on its local address, or it punched a hole the relay is the way past
                TcpClient direct = await TryConnectTcpAsync(endPoint, token);
                if (direct is not null) return (direct, signedIdPk, false);

                string relay = PickRelay(relayServer, server, rvHost);
                return (await RequestRelayAsync(id, relay, server, rvHost, rvPort, token), signedIdPk, true);
            }

            case RV_RELAY_RESPONSE: {
                ProtoReader response = reader.Nested();
                string uuid = String.Empty, relayServer = String.Empty, refuseReason = String.Empty;
                byte[] signedIdPk = Array.Empty<byte>();
                while (response.Next()) {
                    switch (response.Field) {
                    case 2: uuid = response.String(); break;
                    case 3: relayServer = response.String(); break;
                    case 5: signedIdPk = response.Bytes(); break;
                    case 6: refuseReason = response.String(); break;
                    }
                }

                if (refuseReason.Length > 0) throw new RendezvousException(refuseReason);
                if (uuid.Length == 0) throw new RendezvousException("The ID server gave no relay session");

                return (await CreateRelayAsync(id, uuid, PickRelay(relayServer, server, rvHost), server, token), signedIdPk, true);
            }
            }
        }
    }

    private static string DescribePunchFailure(ulong failure) => failure switch {
        0 => "The ID does not exist on the ID server",
        2 => "The host is offline",
        3 => "The key doesn't match the ID server's",
        4 => "The ID server's licence is used up",
        _ => "The ID server could not reach the host"
    };

    //the relay the host was told to use, the configured one, or the ID server's host on the relay port
    private static string PickRelay(string offered, ServerProfile server, string rvHost) {
        if (offered.Length > 0) return offered;
        if (server.relayServer.Length > 0) return server.relayServer;
        return rvHost.Contains(':') ? $"[{rvHost}]" : rvHost;
    }

    //After a direct connection failed, the host is asked through the ID server to meet at the relay.
    private static async Task<TcpClient> RequestRelayAsync(string id, string relay, ServerProfile server, string rvHost, int rvPort, CancellationToken token) {
        string uuid = Guid.NewGuid().ToString();

        using TcpClient rendezvous = await ConnectTcpAsync(rvHost, rvPort, "the ID server", token);
        Connection channel = new Connection(rendezvous.GetStream());

        await channel.SendAsync(new ProtoWriter().Message(RV_REQUEST_RELAY, new ProtoWriter()
            .String(1, id)
            .String(2, uuid)
            .String(4, relay)   //relay_server
            .Bool(5, true))     //secure
            .ToArray(), token);

        while (true) {
            byte[] message = await ReceiveRendezvousAsync(channel, token);
            ProtoReader reader = new ProtoReader(message);
            if (!reader.Next() || reader.Field != RV_RELAY_RESPONSE) continue;

            ProtoReader response = reader.Nested();
            while (response.Next()) {
                if (response.Field == 6 && response.String().Length > 0) throw new RendezvousException(response.String());
            }

            return await CreateRelayAsync(id, uuid, relay, server, token);
        }
    }

    //The relay pairs the two sides by the session's uuid and from then on carries the bytes as they are.
    private static async Task<TcpClient> CreateRelayAsync(string id, string uuid, string relay, ServerProfile server, CancellationToken token) {
        (string host, int port) = Ssh.ParseTarget(relay, RELAY_PORT);
        TcpClient tcp = await ConnectTcpAsync(host, port, "the relay server", token);

        try {
            byte[] frame = Connection.Frame(new ProtoWriter().Message(RV_REQUEST_RELAY, new ProtoWriter()
                .String(1, id)
                .String(2, uuid)
                .String(6, server.key))     //licence_key
                .ToArray());

            NetworkStream stream = tcp.GetStream();
            await stream.WriteAsync(frame, token);
            await stream.FlushAsync(token);
            return tcp;
        }
        catch {
            tcp.Dispose();
            throw;
        }
    }

    private static async Task<byte[]> ReceiveRendezvousAsync(Connection channel, CancellationToken token) {
        try {
            return await channel.ReceiveAsync(token);
        }
        catch (EndOfStreamException) {
            throw new RendezvousException("The ID server closed the connection");
        }
    }

    private static async Task<TcpClient> ConnectTcpAsync(string host, int port, string role, CancellationToken token) {
        TcpClient tcp = new TcpClient() { NoDelay = true };
        try {
            await tcp.ConnectAsync(host, port, token);
            return tcp;
        }
        catch (SocketException ex) {
            tcp.Dispose();
            throw new RendezvousException($"Could not reach {role} {host}:{port}: {ex.Message}");
        }
        catch {
            tcp.Dispose();
            throw;
        }
    }

    private static async Task<TcpClient> TryConnectTcpAsync(IPEndPoint endPoint, CancellationToken token) {
        TcpClient tcp = new TcpClient(endPoint.AddressFamily) { NoDelay = true };
        try {
            using CancellationTokenSource cts = CancellationTokenSource.CreateLinkedTokenSource(token);
            cts.CancelAfter(LOCAL_CONNECT_TIMEOUT);
            await tcp.ConnectAsync(endPoint, cts.Token);
            return tcp;
        }
        catch (Exception ex) when ((ex is SocketException or OperationCanceledException) && !token.IsCancellationRequested) {
            tcp.Dispose();
            return null;
        }
        catch {
            tcp.Dispose();
            throw;
        }
    }

    //AddrMangle of hbb_common: an IPv4 endpoint is folded with a timestamp into up to 16 little-endian bytes,
    //an IPv6 one is its 16 bytes and the port. Returns null for anything else.
    internal static IPEndPoint DecodeAddress(byte[] bytes) {
        if (bytes is null || bytes.Length == 0) return null;

        if (bytes.Length > 16) {
            if (bytes.Length != 18) return null;
            return new IPEndPoint(new IPAddress(bytes.AsSpan(0, 16)), BinaryPrimitives.ReadUInt16LittleEndian(bytes.AsSpan(16)));
        }

        Span<byte> padded = stackalloc byte[16];
        padded.Clear();
        bytes.CopyTo(padded);

        UInt128 number = BinaryPrimitives.ReadUInt128LittleEndian(padded);
        UInt128 tm = (number >> 17) & uint.MaxValue;
        uint ip = (uint)((number >> 49) - tm);
        ushort port = (ushort)((number & 0xFF_FFFFu) - (tm & 0xFFFFu));

        Span<byte> octets = stackalloc byte[4];
        BinaryPrimitives.WriteUInt32LittleEndian(octets, ip);
        return new IPEndPoint(new IPAddress(octets), port);
    }

    //A message signed the way libsodium signs, the 64-byte signature ahead of it. Returns the message when the
    //signature verifies with the key, null otherwise.
    internal static byte[] OpenSigned(byte[] signed, byte[] publicKey) {
        if (signed is null || signed.Length < 64 || publicKey?.Length != 32) return null;

        try {
            return Ed25519.Verify(signed, 0, publicKey, 0, signed, 64, signed.Length - 64) ? signed[64..] : null;
        }
        catch (ArgumentException) {
            return null;
        }
    }

    //IdPk { id = 1, pk = 2 }
    private static (string id, byte[] pk) ReadIdPk(byte[] message) {
        string id = null;
        byte[] pk = null;

        ProtoReader reader = new ProtoReader(message);
        while (reader.Next()) {
            if (reader.Field == 1) id = reader.String();
            else if (reader.Field == 2) pk = reader.Bytes();
        }

        return reader.Failed ? (null, null) : (id, pk);
    }

    //The host's identity key as the ID server vouches for it, null when the server's signature or the ID doesn't match.
    internal static byte[] GetVouchedKey(byte[] signedIdPk, byte[] serverKey, string id) {
        byte[] idPk = OpenSigned(signedIdPk, serverKey);
        if (idPk is null) return null;

        (string signedId, byte[] pk) = ReadIdPk(idPk);
        return signedId == id && pk?.Length == 32 ? pk : null;
    }

    //The host signs its key exchange with its identity key, and the ID it signs has to be the one asked for.
    internal static bool VerifySignedId(byte[] signedId, byte[] hostKey, string id) {
        byte[] idPk = OpenSigned(signedId, hostKey);
        return idPk is not null && ReadIdPk(idPk).id == id;
    }
}

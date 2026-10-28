using System.Buffers.Binary;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Numerics;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Org.BouncyCastle.Crypto.Digests;
using Org.BouncyCastle.Crypto.Engines;
using Org.BouncyCastle.Crypto.Macs;
using Org.BouncyCastle.Crypto.Parameters;
using Org.BouncyCastle.Math.EC.Rfc7748;
using Protest.Http;

namespace Protest.Protocols;

//Gateway for the RustDesk web client. The gateway is the controlling side of the connection: it connects to the host's
//direct IP access port, runs the key exchange when the host offers one, and logs in with the vault credentials or the
//password the user typed, so a vault password never reaches the browser. Once logged in, the host's protobuf messages go
//over the WebSocket as they are, one per binary message, and the browser decodes the video with WebCodecs.
//Text messages carry the login: the browser's opening message with the codecs it decodes, the gateway's prompts for a
//password or a 2FA code, and the browser's answers.
internal static class RustDesk {

    internal const int DEFAULT_PORT = 21118; //direct IP access
    private const int HANDSHAKE_TIMEOUT = 20_000;
    private const int CLOSE_GRACE = 2_000;
    private const int MAX_MESSAGE_LENGTH = 32 * 1024 * 1024;   //a key frame of a large desktop
    private const int MAX_CLIENT_MESSAGE_LENGTH = 4 * 1024 * 1024; //a pasted clipboard

    private const string CLIENT_ID = "Pro-test";
    private const string CLIENT_PLATFORM = "Web";
    private const string CLIENT_VERSION = "1.4.0"; //the protocol this gateway speaks, it gates features on the host

    internal const uint KX_VERSION_LATEST = 1;

    //the union of Message, by field number
    internal const int SIGNED_ID            = 3;
    internal const int PUBLIC_KEY           = 4;
    internal const int TEST_DELAY           = 5;
    internal const int LOGIN_REQUEST        = 7;
    internal const int LOGIN_RESPONSE       = 8;
    internal const int HASH                 = 9;
    internal const int MOUSE_EVENT          = 10;
    internal const int KEY_EVENT            = 15;
    internal const int CLIPBOARD            = 16;
    internal const int MISC                 = 19;
    internal const int MESSAGE_BOX          = 21;
    internal const int POINTER_DEVICE_EVENT = 26;
    internal const int AUTH_2FA             = 27;
    internal const int MULTI_CLIPBOARDS     = 28;

    private const int MISC_CLOSE_REASON = 9;

    private const string LOGIN_MSG_PASSWORD_EMPTY    = "Empty Password";
    private const string LOGIN_MSG_PASSWORD_WRONG    = "Wrong Password";
    private const string LOGIN_MSG_2FA_REQUIRED      = "2FA Required";
    private const string LOGIN_MSG_2FA_WRONG         = "Wrong 2FA Code";
    private const string LOGIN_MSG_NO_PASSWORD_ACCESS = "No Password Access";

    //what the browser may send once logged in: input, the clipboard, latency probes, and the video controls of Misc,
    //a login request or a file transfer, port forward or terminal would go past what this window does
    private static readonly HashSet<int> CLIENT_MESSAGES = new HashSet<int> {
        TEST_DELAY, MOUSE_EVENT, KEY_EVENT, CLIPBOARD, MISC, POINTER_DEVICE_EVENT, MULTI_CLIPBOARDS
    };

    private static readonly HashSet<int> CLIENT_MISC = new HashSet<int> {
        5,  //switch_display
        7,  //option
        9,  //close_reason
        10, //refresh_video
        12, //video_received
        30, //capture_displays
        31, //refresh_video_display
        35, //selected_sid
        36  //change_display_resolution
    };

    private const int MOUSE_TYPE_MASK = 0x7;
    private const int MOUSE_TYPE_MOVE = 0;
    private const int MOUSE_TYPE_MOVE_RELATIVE = 5;

    internal sealed class ClientHello {
        public string password;
        public bool vp8, av1, h264, h265;
        public bool clipboard;
    }

    private sealed class Session {
        public readonly object sync = new object();
        public string host;
        public int port;
        public string origin;
        public string username;   //the host's address, what the host expects to be called with direct IP access
        public string password;   //null without one
        public bool serverSideAuth;
        public ulong sessionId;
        public ClientHello hello;
        public string salt, challenge;
        public volatile bool authorized;
        public volatile SessionRecording recording;
    }

    public static async Task WebSocketHandler(HttpListenerContext ctx) {
        if (!Auth.IsAuthenticatedAndAuthorized(ctx, ctx.Request.Url.AbsolutePath)) {
            ctx.Response.Close();
            return;
        }

        string target = ctx.Request.QueryString["target"];
        if (String.IsNullOrEmpty(target)) {
            ctx.Response.StatusCode = 400;
            ctx.Response.Close();
            return;
        }

        (string host, int port) = Ssh.ParseTarget(target, DEFAULT_PORT);

        string deviceFile = ctx.Request.QueryString["file"];
        string credentialGuid = ctx.Request.QueryString["credential"];

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

        string origin = Auth.GetPrincipal(ctx);
        if (origin is null) {
            ws.Abort();
            return;
        }

        TcpClient tcp = new TcpClient() {
            NoDelay = true //input events are small and latency bound, Nagle would hold them back
        };

        Session session = new Session {
            host = host,
            port = port,
            origin = origin,
            serverSideAuth = !String.IsNullOrEmpty(credentialGuid),
            sessionId = BinaryPrimitives.ReadUInt64LittleEndian(RandomNumberGenerator.GetBytes(8)) | 1
        };

        try {
            using CancellationTokenSource handshakeCts = new CancellationTokenSource(HANDSHAKE_TIMEOUT);

            //the browser opens with the codecs it decodes and, without vault credentials, the password it was given
            session.hello = ParseHello(await WebSocketHelper.WsReadText(ws, handshakeCts.Token, 4096));
            if (session.hello is null) return;

            session.password = String.IsNullOrEmpty(session.hello.password) ? null : session.hello.password;
            session.hello.password = null;

            //with a vault credential the gateway logs in on the client's behalf and the password never reaches the browser
            if (session.serverSideAuth) {
                if (!Guid.TryParse(credentialGuid, out Guid guid) || !Vault.FromGuid(guid, out Vault.CredentialEntry credential)) {
                    Logger.Action(origin, "Remote-access", $"RustDesk connection to {host}:{port} failed: credentials don't exist");
                    await SendError(ws, "Credentials don't exist");
                    return;
                }

                if (!Vault.IsAllowed(credential, origin)) {
                    Logger.Action(origin, "Remote-access", $"RustDesk connection to {host}:{port} failed: access denied for this credential");
                    await SendError(ws, "Access denied for this credential");
                    return;
                }

                session.password = String.IsNullOrEmpty(credential.password) ? null : credential.password;
            }

            try {
                await tcp.ConnectAsync(host, port, handshakeCts.Token);
            }
            catch (SocketException ex) {
                Logger.Action(origin, "Remote-access", $"RustDesk connection to {host}:{port} failed: {ex.Message}");
                await SendError(ws, ex.SocketErrorCode == SocketError.ConnectionRefused
                    ? "The host refused the connection. Is direct IP access enabled in RustDesk's security settings?"
                    : ex.Message);
                return;
            }
            catch (OperationCanceledException) {
                Logger.Action(origin, "Remote-access", $"RustDesk connection to {host}:{port} timed out");
                await SendError(ws, "The host did not respond in time");
                return;
            }

            session.username = GetDirectAccessName(tcp.Client.RemoteEndPoint as IPEndPoint) ?? host;

            Connection connection = new Connection(tcp.GetStream());

            //a host keys the stream when it signs its identity, with direct IP access it goes straight to the login
            byte[] first;
            try {
                first = await connection.ReceiveAsync(handshakeCts.Token);

                if (GetUnionField(first) == SIGNED_ID) {
                    if (!TryCreateKeyExchange(GetSignedId(first), out string peerId, out byte[] reply, out Cipher cipher)) {
                        Logger.Action(origin, "Remote-access", $"RustDesk connection to {host}:{port} failed: invalid key exchange");
                        await SendError(ws, "The host's key exchange is invalid");
                        return;
                    }

                    await connection.SendAsync(reply, handshakeCts.Token);
                    connection.SetCipher(cipher);

                    Logger.Action(origin, "Remote-access", $"RustDesk host {host}:{port} identifies as {peerId}");

                    first = await connection.ReceiveAsync(handshakeCts.Token);
                }
            }
            catch (Exception ex) when (ex is OperationCanceledException or IOException or InvalidDataException) {
                string reason = ex is OperationCanceledException ? "The host did not respond in time"
                    : ex is EndOfStreamException ? "The host closed the connection"
                    : ex is InvalidDataException ? ex.Message
                    : "The connection to the host was lost";
                Logger.Action(origin, "Remote-access", $"RustDesk connection to {host}:{port} failed: {reason}");
                await SendError(ws, reason);
                return;
            }

            if (GetUnionField(first) is not (HASH or LOGIN_RESPONSE or MISC or MESSAGE_BOX)) {
                Logger.Action(origin, "Remote-access", $"RustDesk connection to {host}:{port} failed: not a RustDesk host");
                await SendError(ws, "Not a RustDesk host");
                return;
            }

            await WebSocketHelper.WsWriteText(ws, $"{{\"encrypted\":{(connection.IsEncrypted ? "true" : "false")}}}");

            using CancellationTokenSource cts = new CancellationTokenSource();

            Task upstream   = PumpToHost(ctx, ws, connection, session, cts);
            Task downstream = PumpToWs(ws, connection, session, first, deviceFile, cts);

            await Task.WhenAny(upstream, downstream);

            if (upstream.IsCompleted && connection.IsOpen) {
                //the browser left, the host is told so it ends the session rather than waiting it out
                await connection.TrySendAsync(EncodeCloseReason("Connection closed by the client"));
            }

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
            if (session.authorized) {
                Logger.Action(origin, "Remote-access", $"Close RustDesk connection to {host}:{port}");
            }

            session.recording?.Stop();

            tcp.Close();

            if (ws.State == WebSocketState.Open) {
                try {
                    await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, CancellationToken.None);
                }
                catch (Exception ex) {
                    Logger.Debug(ex);
                }
            }
        }
    }

    //With direct IP access the host takes a login only for the address it was reached at, a host name won't do
    internal static string GetDirectAccessName(IPEndPoint endPoint) {
        if (endPoint is null) return null;

        IPAddress address = endPoint.Address.IsIPv4MappedToIPv6 ? endPoint.Address.MapToIPv4() : endPoint.Address;
        if (address.AddressFamily == AddressFamily.InterNetworkV6) {
            address = new IPAddress(address.GetAddressBytes()); //without the scope, the host doesn't take one
        }

        return address.ToString();
    }

    internal static ClientHello ParseHello(string json) {
        if (String.IsNullOrEmpty(json)) return null;

        try {
            using JsonDocument doc = JsonDocument.Parse(json);
            JsonElement root = doc.RootElement;
            ClientHello hello = new ClientHello();

            if (root.TryGetProperty("password", out JsonElement password) && password.ValueKind == JsonValueKind.String) {
                hello.password = password.GetString();
            }

            if (root.TryGetProperty("clipboard", out JsonElement clipboard)) {
                hello.clipboard = clipboard.ValueKind == JsonValueKind.True;
            }

            if (root.TryGetProperty("codecs", out JsonElement codecs) && codecs.ValueKind == JsonValueKind.Array) {
                foreach (JsonElement codec in codecs.EnumerateArray()) {
                    switch (codec.GetString()) {
                    case "vp8" : hello.vp8  = true; break;
                    case "av1" : hello.av1  = true; break;
                    case "h264": hello.h264 = true; break;
                    case "h265": hello.h265 = true; break;
                    }
                }
            }

            return hello;
        }
        catch (JsonException) {
            return null;
        }
        catch (InvalidOperationException) {
            return null;
        }
    }

    private static async Task PumpToWs(WebSocket ws, Connection connection, Session session, byte[] first, string deviceFile, CancellationTokenSource cts) {
        string reason = null;

        try {
            byte[] message = first;

            while (ws.State == WebSocketState.Open && !cts.IsCancellationRequested) {
                message ??= await connection.ReceiveAsync(cts.Token);

                if (session.authorized) {
                    if (GetUnionField(message) != TEST_DELAY) {
                        session.recording?.WriteVideo(message, message.Length);
                    }
                    await ws.SendAsync(new ArraySegment<byte>(message), WebSocketMessageType.Binary, true, cts.Token);
                }
                else {
                    string error = await HandleLogin(ws, connection, session, message, cts.Token);
                    if (error is not null) {
                        reason = error;
                        break;
                    }

                    if (session.authorized) {
                        Logger.Action(session.origin, "Remote-access", $"Establish RustDesk connection to {session.host}:{session.port}{(session.serverSideAuth ? " with vault credentials" : "")}{(connection.IsEncrypted ? "" : ", unencrypted")}");

                        //the login response opens the recording, it holds the displays a player starts with
                        SessionRecording recording = SessionRecording.Start("rustdesk", session.host, session.port, deviceFile, session.origin);
                        recording?.WriteVideo(message, message.Length);
                        session.recording = recording;

                        await ws.SendAsync(new ArraySegment<byte>(message), WebSocketMessageType.Binary, true, cts.Token);
                    }
                }

                message = null;
            }
        }
        catch (OperationCanceledException) { }
        catch (WebSocketException) { }
        catch (EndOfStreamException) {
            reason = "The remote host closed the connection";
        }
        catch (InvalidDataException ex) {
            reason = ex.Message;
        }
        catch (IOException) {
            reason = "The connection to the remote host was lost";
        }
        finally {
            //the client is told why it ends, and the receive loop is left running to take the reply
            if (reason is null || !await SendClose(ws, reason)) {
                cts.Cancel();
            }
        }
    }

    //Handles what the host sends before the login is through. Returns why the connection ends, or null to carry on.
    private static async Task<string> HandleLogin(WebSocket ws, Connection connection, Session session, byte[] message, CancellationToken token) {
        ProtoReader reader = new ProtoReader(message);
        if (!reader.Next()) return null;

        switch (reader.Field) {
        case HASH: {
            ProtoReader hash = reader.Nested();
            string salt = String.Empty, challenge = String.Empty;
            while (hash.Next()) {
                if (hash.Field == 1) salt = hash.String();
                else if (hash.Field == 2) challenge = hash.String();
            }

            bool hasPassword;
            lock (session.sync) {
                session.salt = salt;
                session.challenge = challenge;
                hasPassword = session.password is not null;
            }

            //without a password the login still goes out, the remote user can accept it
            await connection.SendAsync(EncodeLogin(session), token);
            if (!hasPassword) {
                await WebSocketHelper.WsWriteText(ws, "{\"login\":\"password\"}");
            }
            return null;
        }

        case LOGIN_RESPONSE: {
            ProtoReader response = reader.Nested();
            string error = null;
            bool peerInfo = false;
            while (response.Next()) {
                if (response.Field == 1) error = response.String();
                else if (response.Field == 2) peerInfo = true;
            }

            if (peerInfo) {
                lock (session.sync) {
                    session.password = null;
                    session.authorized = true;
                }
                return null;
            }

            switch (error) {
            case LOGIN_MSG_PASSWORD_WRONG:
                bool vault;
                lock (session.sync) {
                    vault = session.serverSideAuth;
                    session.serverSideAuth = false; //what's typed next is the user's own
                    session.password = null;
                }
                Logger.Action(session.origin, "Remote-access", $"RustDesk authentication to {session.host}:{session.port} failed: wrong password{(vault ? " (vault credentials)" : "")}");
                await WebSocketHelper.WsWriteText(ws, $"{{\"login\":\"password\",\"error\":\"Wrong password\"{(vault ? ",\"vault\":true" : "")}}}");
                return null;

            case LOGIN_MSG_PASSWORD_EMPTY:
                await WebSocketHelper.WsWriteText(ws, "{\"login\":\"password\"}");
                return null;

            case LOGIN_MSG_NO_PASSWORD_ACCESS:
                await WebSocketHelper.WsWriteText(ws, "{\"login\":\"waiting\"}");
                return null;

            case LOGIN_MSG_2FA_REQUIRED:
                await WebSocketHelper.WsWriteText(ws, "{\"login\":\"2fa\"}");
                return null;

            case LOGIN_MSG_2FA_WRONG:
                Logger.Action(session.origin, "Remote-access", $"RustDesk authentication to {session.host}:{session.port} failed: wrong 2FA code");
                await WebSocketHelper.WsWriteText(ws, "{\"login\":\"2fa\",\"error\":\"Wrong 2FA code\"}");
                return null;

            default:
                error = String.IsNullOrEmpty(error) ? "The host refused the login" : error;
                Logger.Action(session.origin, "Remote-access", $"RustDesk connection to {session.host}:{session.port} failed: {error}");
                return error;
            }
        }

        case MISC: {
            ProtoReader misc = reader.Nested();
            while (misc.Next()) {
                if (misc.Field == MISC_CLOSE_REASON) {
                    string closeReason = misc.String();
                    Logger.Action(session.origin, "Remote-access", $"RustDesk connection to {session.host}:{session.port} closed by the host: {closeReason}");
                    return String.IsNullOrEmpty(closeReason) ? "The host closed the connection" : closeReason;
                }
            }
            return null;
        }

        case MESSAGE_BOX: {
            ProtoReader box = reader.Nested();
            string type = String.Empty, text = String.Empty;
            while (box.Next()) {
                if (box.Field == 1) type = box.String();
                else if (box.Field == 3) text = box.String();
            }

            if (type.Contains("error", StringComparison.OrdinalIgnoreCase) && text.Length > 0) {
                Logger.Action(session.origin, "Remote-access", $"RustDesk connection to {session.host}:{session.port} failed: {text}");
                return text;
            }
            return null;
        }

        default:
            return null;
        }
    }

    private static async Task PumpToHost(HttpListenerContext ctx, WebSocket ws, Connection connection, Session session, CancellationTokenSource cts) {
        byte[] buffer = new byte[8192];

        try {
            while ((ws.State == WebSocketState.Open || ws.State == WebSocketState.CloseSent) && !cts.IsCancellationRequested) {
                (byte[] message, bool isText)? received = await ReceiveMessage(ws, buffer, cts.Token);
                if (received is null) {
                    return; //close frame received
                }

                //the gateway is closing, what the client sends before its reply has nowhere to go
                if (ws.State == WebSocketState.CloseSent) continue;

                if (received.Value.isText) {
                    if (!session.authorized) {
                        await HandleLoginAnswer(connection, session, Encoding.UTF8.GetString(received.Value.message), cts.Token);
                    }
                    continue;
                }

                if (!session.authorized) continue;

                if (!Auth.IsAuthenticatedAndAuthorized(ctx, "/ws/rustdesk")) {
                    return;
                }

                byte[] message = received.Value.message;
                if (!IsAllowedClientMessage(message, out bool interaction)) continue;

                if (interaction) {
                    session.recording?.MarkInteracted();
                }

                await connection.SendAsync(message, cts.Token);
            }
        }
        catch (OperationCanceledException) { }
        catch (WebSocketException) { }
        catch (IOException) { }
        catch (InvalidDataException) { } //too large a message
        finally {
            cts.Cancel();
        }
    }

    //The browser answers a prompt with {"password":"..."} or {"code":"..."}.
    private static async Task HandleLoginAnswer(Connection connection, Session session, string json, CancellationToken token) {
        string password = null, code = null;

        try {
            using JsonDocument doc = JsonDocument.Parse(json);
            if (doc.RootElement.TryGetProperty("password", out JsonElement p) && p.ValueKind == JsonValueKind.String) password = p.GetString();
            if (doc.RootElement.TryGetProperty("code", out JsonElement c) && c.ValueKind == JsonValueKind.String) code = c.GetString();
        }
        catch (JsonException) {
            return;
        }

        if (code is not null) {
            await connection.SendAsync(new ProtoWriter()
                .Message(AUTH_2FA, new ProtoWriter().String(1, code.Trim()))
                .ToArray(), token);
            return;
        }

        if (password is null) return;

        bool hashed;
        lock (session.sync) {
            session.password = password.Length > 0 ? password : null;
            session.serverSideAuth = false;
            hashed = session.challenge is not null;
        }

        if (hashed) {
            await connection.SendAsync(EncodeLogin(session), token);
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
            if (ms.Length > MAX_CLIENT_MESSAGE_LENGTH) throw new InvalidDataException("The message is too large");
        } while (!result.EndOfMessage);

        return (ms.ToArray(), isText);
    }

    //Fails the client's connection with a reason, before anything else goes over the WebSocket.
    private static async Task SendError(WebSocket ws, string reason) {
        if (ws.State != WebSocketState.Open) return;

        try {
            using CancellationTokenSource cts = new CancellationTokenSource(5_000);
            byte[] json = Encoding.UTF8.GetBytes($"{{\"error\":\"{Data.EscapeJsonText(reason)}\"}}");
            await ws.SendAsync(new ArraySegment<byte>(json), WebSocketMessageType.Text, true, cts.Token);
            await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, cts.Token);
        }
        catch (Exception ex) {
            Logger.Debug(ex);
        }
    }

    //Sends a close frame without waiting for the reply, returns false if it didn't go out.
    private static async Task<bool> SendClose(WebSocket ws, string reason) {
        if (ws.State != WebSocketState.Open) return false;

        //a close reason is limited to 123 bytes
        while (Encoding.UTF8.GetByteCount(reason) > 123) {
            reason = reason[..^1];
        }

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

    internal static byte[] EncodeLogin(string username, string password, string salt, string challenge, ulong sessionId, string name, ClientHello hello) {
        ProtoWriter decoding = new ProtoWriter()
            .Varint(1, 1)                       //ability_vp9, every host encodes it
            .Varint(2, hello.h264 ? 1UL : 0)    //ability_h264
            .Varint(3, hello.h265 ? 1UL : 0)    //ability_h265
            .Varint(5, hello.vp8  ? 1UL : 0)    //ability_vp8
            .Varint(6, hello.av1  ? 1UL : 0);   //ability_av1

        ProtoWriter option = new ProtoWriter()
            .Varint(1, 3)                       //image_quality: balanced
            .Varint(7, 2)                       //disable_audio: yes, the window has no audio
            .Varint(8, hello.clipboard ? 1UL : 2UL) //disable_clipboard: no or yes, the window turns it on with its clipboard sync
            .Message(10, decoding);             //supported_decoding

        ProtoWriter login = new ProtoWriter()
            .String(1, username)
            .Bytes(2, HashPassword(password, salt, challenge))
            .String(4, CLIENT_ID)               //my_id
            .String(5, name)                    //my_name, the remote user sees who connects
            .Message(6, option)
            .Bool(9, true)                      //video_ack_required, the browser acknowledges every frame it decodes
            .Varint(10, sessionId)
            .String(11, CLIENT_VERSION)
            .String(13, CLIENT_PLATFORM);       //my_platform

        return new ProtoWriter().Message(LOGIN_REQUEST, login).ToArray();
    }

    private static byte[] EncodeLogin(Session session) {
        lock (session.sync) {
            return EncodeLogin(session.username, session.password, session.salt, session.challenge, session.sessionId, session.origin, session.hello);
        }
    }

    //sha256(sha256(password + salt) + challenge), nothing without a password so the remote user can accept the login
    internal static byte[] HashPassword(string password, string salt, string challenge) {
        if (String.IsNullOrEmpty(password)) return Array.Empty<byte>();

        byte[] h1 = SHA256.HashData(Encoding.UTF8.GetBytes(password + (salt ?? String.Empty)));
        byte[] challengeBytes = Encoding.UTF8.GetBytes(challenge ?? String.Empty);

        byte[] input = new byte[h1.Length + challengeBytes.Length];
        h1.CopyTo(input, 0);
        challengeBytes.CopyTo(input, h1.Length);

        return SHA256.HashData(input);
    }

    internal static byte[] EncodeCloseReason(string reason) =>
        new ProtoWriter().Message(MISC, new ProtoWriter().String(MISC_CLOSE_REASON, reason)).ToArray();

    //Returns the field number of the Message's union, 0 when it has none or isn't a message at all.
    internal static int GetUnionField(byte[] message) {
        ProtoReader reader = new ProtoReader(message);
        return reader.Next() ? reader.Field : 0;
    }

    private static byte[] GetSignedId(byte[] message) {
        ProtoReader reader = new ProtoReader(message);
        if (!reader.Next() || reader.Field != SIGNED_ID || reader.WireType != 2) return Array.Empty<byte>();

        ProtoReader signedId = reader.Nested();
        while (signedId.Next()) {
            if (signedId.Field == 1 && signedId.WireType == 2) return signedId.Bytes();
        }
        return Array.Empty<byte>();
    }

    //Every field of the message has to be one the browser may send, a second one would win over the first in the host's
    //parser. Interaction is set for input that changes something on the host, pointer moves alone don't count.
    internal static bool IsAllowedClientMessage(byte[] message, out bool interaction) {
        interaction = false;
        bool any = false;

        ProtoReader reader = new ProtoReader(message);
        while (reader.Next()) {
            if (reader.WireType != 2 || !CLIENT_MESSAGES.Contains(reader.Field)) return false;

            switch (reader.Field) {
            case MISC:
                ProtoReader misc = reader.Nested();
                while (misc.Next()) {
                    if (!CLIENT_MISC.Contains(misc.Field)) return false;
                }
                if (misc.Failed) return false;
                break;

            case KEY_EVENT:
            case POINTER_DEVICE_EVENT:
                interaction = true;
                break;

            case MOUSE_EVENT:
                ProtoReader mouse = reader.Nested();
                while (mouse.Next()) {
                    if (mouse.Field != 1 || mouse.WireType != 0) continue;
                    int type = (int)mouse.Value & MOUSE_TYPE_MASK;
                    if (type != MOUSE_TYPE_MOVE && type != MOUSE_TYPE_MOVE_RELATIVE) interaction = true;
                }
                break;
            }

            any = true;
        }

        return any && !reader.Failed;
    }

    //The host signs its ephemeral public key with its identity key. Without a rendezvous server to vouch for the
    //identity key there is nothing to check the signature against, as with RustDesk's own client: the stream is
    //encrypted, but a host that answers in place of the real one goes unnoticed.
    internal static bool TryCreateKeyExchange(byte[] signedId, out string peerId, out byte[] reply, out Cipher cipher) {
        peerId = null;
        reply = null;
        cipher = null;

        //a signed message is the signature (64 bytes) followed by the message, an IdPk
        if (signedId is null || signedId.Length <= 64) return false;

        string id = String.Empty;
        byte[] theirPk = null;
        uint advertised = 0;

        ProtoReader idPk = new ProtoReader(signedId, 64, signedId.Length - 64);
        while (idPk.Next()) {
            switch (idPk.Field) {
            case 1: id = idPk.String(); break;
            case 2: theirPk = idPk.Bytes(); break;
            case 4: advertised = (uint)idPk.Value; break;
            }
        }

        if (idPk.Failed || theirPk?.Length != 32) return false;

        byte[] ourSk = RandomNumberGenerator.GetBytes(32);
        X25519.ClampPrivateKey(ourSk);
        byte[] ourPk = new byte[32];
        X25519.GeneratePublicKey(ourSk, 0, ourPk, 0);

        byte[] key = RandomNumberGenerator.GetBytes(32);
        byte[] sealedKey = NaCl.Box(key, new byte[24], theirPk, ourSk);
        if (sealedKey is null) return false;

        uint picked = Math.Min(advertised, KX_VERSION_LATEST);

        reply = new ProtoWriter().Message(PUBLIC_KEY, new ProtoWriter()
            .Bytes(1, ourPk)       //asymmetric_value
            .Bytes(2, sealedKey)   //symmetric_value
            .Varint(3, picked))    //kx_version
            .ToArray();

        //version 1 keys each direction apart and binds the exchange into both, the gateway is the initiator
        cipher = picked == 0
            ? new Cipher(key, key)
            : new Cipher(DeriveSubkey(key, 1, advertised, picked, ourPk, theirPk), DeriveSubkey(key, 2, advertised, picked, ourPk, theirPk));

        peerId = id;
        return true;
    }

    private static readonly byte[] KX_SPLIT_CONTEXT = "rdkx-spl"u8.ToArray();

    //BLAKE2b keyed with the exchanged key, over the context, direction, versions and both ephemeral public keys
    internal static byte[] DeriveSubkey(byte[] key, byte direction, uint advertised, uint picked, byte[] initiatorPk, byte[] responderPk) {
        Blake2bDigest blake = new Blake2bDigest(key, 32, null, null);

        Span<byte> number = stackalloc byte[4];

        blake.BlockUpdate(KX_SPLIT_CONTEXT);
        blake.Update(direction);
        BinaryPrimitives.WriteUInt32LittleEndian(number, advertised);
        blake.BlockUpdate(number);
        BinaryPrimitives.WriteUInt32LittleEndian(number, picked);
        blake.BlockUpdate(number);
        blake.BlockUpdate(initiatorPk);
        blake.BlockUpdate(responderPk);

        byte[] subkey = new byte[32];
        blake.DoFinal(subkey, 0);
        return subkey;
    }

    //A secretbox per message, the nonce is the message's count in its direction, little-endian, then zeros.
    internal sealed class Cipher {
        private readonly byte[] sendKey;
        private readonly byte[] receiveKey;
        private ulong sent;
        private ulong received;

        public Cipher(byte[] sendKey, byte[] receiveKey) {
            this.sendKey = sendKey;
            this.receiveKey = receiveKey;
        }

        public byte[] Seal(ReadOnlySpan<byte> message) => NaCl.SecretBoxSeal(message, Nonce(++sent), sendKey);

        public byte[] Open(ReadOnlySpan<byte> box) => NaCl.SecretBoxOpen(box, Nonce(++received), receiveKey);

        private static byte[] Nonce(ulong count) {
            byte[] nonce = new byte[24];
            BinaryPrimitives.WriteUInt64LittleEndian(nonce, count);
            return nonce;
        }
    }

    //NaCl's box and secretbox: X25519, HSalsa20, XSalsa20 and Poly1305, the MAC ahead of the ciphertext
    internal static class NaCl {
        public static byte[] SecretBoxSeal(ReadOnlySpan<byte> message, byte[] nonce, byte[] key) {
            XSalsa20Engine engine = new XSalsa20Engine();
            engine.Init(true, new ParametersWithIV(new KeyParameter(key), nonce));

            //the first 32 bytes of the key stream are the one-time Poly1305 key
            byte[] macKey = new byte[32];
            engine.ProcessBytes(new byte[32], macKey);

            byte[] output = new byte[16 + message.Length];
            engine.ProcessBytes(message, output.AsSpan(16));

            Poly1305 mac = new Poly1305();
            mac.Init(new KeyParameter(macKey));
            mac.BlockUpdate(output.AsSpan(16));
            mac.DoFinal(output.AsSpan(0, 16));

            return output;
        }

        //Returns null when the box was not sealed with this key and nonce.
        public static byte[] SecretBoxOpen(ReadOnlySpan<byte> box, byte[] nonce, byte[] key) {
            if (box.Length < 16) return null;

            XSalsa20Engine engine = new XSalsa20Engine();
            engine.Init(false, new ParametersWithIV(new KeyParameter(key), nonce));

            byte[] macKey = new byte[32];
            engine.ProcessBytes(new byte[32], macKey);

            Poly1305 mac = new Poly1305();
            mac.Init(new KeyParameter(macKey));
            mac.BlockUpdate(box[16..]);
            Span<byte> tag = stackalloc byte[16];
            mac.DoFinal(tag);

            if (!CryptographicOperations.FixedTimeEquals(tag, box[..16])) return null;

            byte[] message = new byte[box.Length - 16];
            engine.ProcessBytes(box[16..], message);
            return message;
        }

        public static byte[] Box(ReadOnlySpan<byte> message, byte[] nonce, byte[] theirPk, byte[] ourSk) {
            byte[] key = BeforeNm(theirPk, ourSk);
            return key is null ? null : SecretBoxSeal(message, nonce, key);
        }

        public static byte[] BoxOpen(ReadOnlySpan<byte> box, byte[] nonce, byte[] theirPk, byte[] ourSk) {
            byte[] key = BeforeNm(theirPk, ourSk);
            return key is null ? null : SecretBoxOpen(box, nonce, key);
        }

        //the box key, HSalsa20 over the X25519 shared secret, null for a public key of low order
        public static byte[] BeforeNm(byte[] theirPk, byte[] ourSk) {
            byte[] shared = new byte[32];
            if (!X25519.CalculateAgreement(ourSk, 0, theirPk, 0, shared, 0)) return null;
            return HSalsa20(shared, new byte[16]);
        }

        public static byte[] HSalsa20(byte[] key, ReadOnlySpan<byte> input) {
            Span<uint> x = stackalloc uint[16];
            x[0]  = 0x61707865; //"expand 32-byte k"
            x[5]  = 0x3320646e;
            x[10] = 0x79622d32;
            x[15] = 0x6b206574;
            for (int i = 0; i < 4; i++) {
                x[1 + i]  = BinaryPrimitives.ReadUInt32LittleEndian(key.AsSpan(i * 4));
                x[11 + i] = BinaryPrimitives.ReadUInt32LittleEndian(key.AsSpan(16 + i * 4));
                x[6 + i]  = BinaryPrimitives.ReadUInt32LittleEndian(input[(i * 4)..]);
            }

            for (int i = 0; i < 10; i++) {
                //columns
                x[4]  ^= BitOperations.RotateLeft(x[0]  + x[12], 7);
                x[8]  ^= BitOperations.RotateLeft(x[4]  + x[0],  9);
                x[12] ^= BitOperations.RotateLeft(x[8]  + x[4],  13);
                x[0]  ^= BitOperations.RotateLeft(x[12] + x[8],  18);
                x[9]  ^= BitOperations.RotateLeft(x[5]  + x[1],  7);
                x[13] ^= BitOperations.RotateLeft(x[9]  + x[5],  9);
                x[1]  ^= BitOperations.RotateLeft(x[13] + x[9],  13);
                x[5]  ^= BitOperations.RotateLeft(x[1]  + x[13], 18);
                x[14] ^= BitOperations.RotateLeft(x[10] + x[6],  7);
                x[2]  ^= BitOperations.RotateLeft(x[14] + x[10], 9);
                x[6]  ^= BitOperations.RotateLeft(x[2]  + x[14], 13);
                x[10] ^= BitOperations.RotateLeft(x[6]  + x[2],  18);
                x[3]  ^= BitOperations.RotateLeft(x[15] + x[11], 7);
                x[7]  ^= BitOperations.RotateLeft(x[3]  + x[15], 9);
                x[11] ^= BitOperations.RotateLeft(x[7]  + x[3],  13);
                x[15] ^= BitOperations.RotateLeft(x[11] + x[7],  18);

                //rows
                x[1]  ^= BitOperations.RotateLeft(x[0]  + x[3],  7);
                x[2]  ^= BitOperations.RotateLeft(x[1]  + x[0],  9);
                x[3]  ^= BitOperations.RotateLeft(x[2]  + x[1],  13);
                x[0]  ^= BitOperations.RotateLeft(x[3]  + x[2],  18);
                x[6]  ^= BitOperations.RotateLeft(x[5]  + x[4],  7);
                x[7]  ^= BitOperations.RotateLeft(x[6]  + x[5],  9);
                x[4]  ^= BitOperations.RotateLeft(x[7]  + x[6],  13);
                x[5]  ^= BitOperations.RotateLeft(x[4]  + x[7],  18);
                x[11] ^= BitOperations.RotateLeft(x[10] + x[9],  7);
                x[8]  ^= BitOperations.RotateLeft(x[11] + x[10], 9);
                x[9]  ^= BitOperations.RotateLeft(x[8]  + x[11], 13);
                x[10] ^= BitOperations.RotateLeft(x[9]  + x[8],  18);
                x[12] ^= BitOperations.RotateLeft(x[15] + x[14], 7);
                x[13] ^= BitOperations.RotateLeft(x[12] + x[15], 9);
                x[14] ^= BitOperations.RotateLeft(x[13] + x[12], 13);
                x[15] ^= BitOperations.RotateLeft(x[14] + x[13], 18);
            }

            byte[] output = new byte[32];
            ReadOnlySpan<int> words = stackalloc int[] { 0, 5, 10, 15, 6, 7, 8, 9 };
            for (int i = 0; i < 8; i++) {
                BinaryPrimitives.WriteUInt32LittleEndian(output.AsSpan(i * 4), x[words[i]]);
            }
            return output;
        }
    }

    //A stream framed the way RustDesk frames TCP: a little-endian header of one to four bytes, its two low bits the
    //header's length less one and the rest the payload's length. Once keyed, every payload but a heartbeat is a secretbox.
    internal sealed class Connection {
        private readonly Stream stream;
        private readonly BufferedStream reader;
        private readonly SemaphoreSlim writeLock = new SemaphoreSlim(1, 1);
        private readonly byte[] header = new byte[4];
        private volatile Cipher cipher;
        private volatile bool open = true;

        public bool IsEncrypted => cipher is not null;
        public bool IsOpen => open;

        public Connection(Stream stream) {
            this.stream = stream;
            reader = new BufferedStream(stream, 65_536); //reads only, writes go out a frame at a time
        }

        public void SetCipher(Cipher cipher) {
            this.cipher = cipher;
        }

        public async Task<byte[]> ReceiveAsync(CancellationToken token) {
            try {
                Array.Clear(header);
                await reader.ReadExactlyAsync(header.AsMemory(0, 1), token);

                int headerLength = (header[0] & 0x03) + 1;
                if (headerLength > 1) {
                    await reader.ReadExactlyAsync(header.AsMemory(1, headerLength - 1), token);
                }

                uint length = BinaryPrimitives.ReadUInt32LittleEndian(header) >> 2;
                if (length > MAX_MESSAGE_LENGTH) throw new InvalidDataException("The host sent a message too large to take");

                byte[] payload = new byte[length];
                await reader.ReadExactlyAsync(payload, token);

                Cipher current = cipher;
                if (current is null || payload.Length <= 1) return payload;

                return current.Open(payload) ?? throw new InvalidDataException("A message from the host failed to decrypt");
            }
            catch (EndOfStreamException) {
                open = false;
                throw;
            }
        }

        public async Task SendAsync(byte[] message, CancellationToken token) {
            await writeLock.WaitAsync(token);
            try {
                Cipher current = cipher;
                byte[] frame = Frame(current is null ? message : current.Seal(message));
                await stream.WriteAsync(frame, token);
                await stream.FlushAsync(token);
            }
            finally {
                writeLock.Release();
            }
        }

        public async Task TrySendAsync(byte[] message) {
            try {
                using CancellationTokenSource cts = new CancellationTokenSource(2_000);
                await SendAsync(message, cts.Token);
            }
            catch (Exception ex) {
                Logger.Debug(ex);
            }
        }

        internal static byte[] Frame(byte[] payload) {
            int length = payload.Length;
            int headerLength = length <= 0x3F ? 1 : length <= 0x3FFF ? 2 : length <= 0x3F_FFFF ? 3 : 4;
            uint value = (uint)length << 2 | (uint)(headerLength - 1);

            byte[] frame = new byte[headerLength + length];
            for (int i = 0; i < headerLength; i++) {
                frame[i] = (byte)(value >> 8 * i);
            }
            payload.CopyTo(frame, headerLength);

            return frame;
        }
    }

    //Protocol buffers, only as much as the gateway reads and writes itself. Defaults are left out as proto3 does,
    //an embedded message is always written as it may be the member of a oneof.
    internal sealed class ProtoWriter {
        private readonly MemoryStream stream = new MemoryStream();

        public ProtoWriter Varint(int field, ulong value) {
            if (value == 0) return this;
            WriteVarint((ulong)field << 3);
            WriteVarint(value);
            return this;
        }

        public ProtoWriter Bool(int field, bool value) => Varint(field, value ? 1UL : 0UL);

        public ProtoWriter Bytes(int field, ReadOnlySpan<byte> value) {
            if (value.Length == 0) return this;
            WriteVarint((ulong)field << 3 | 2);
            WriteVarint((ulong)value.Length);
            stream.Write(value);
            return this;
        }

        public ProtoWriter String(int field, string value) => Bytes(field, Encoding.UTF8.GetBytes(value ?? System.String.Empty));

        public ProtoWriter Message(int field, ProtoWriter message) {
            byte[] bytes = message.ToArray();
            WriteVarint((ulong)field << 3 | 2);
            WriteVarint((ulong)bytes.Length);
            stream.Write(bytes);
            return this;
        }

        public byte[] ToArray() => stream.ToArray();

        private void WriteVarint(ulong value) {
            while (value >= 0x80) {
                stream.WriteByte((byte)(value | 0x80));
                value >>= 7;
            }
            stream.WriteByte((byte)value);
        }
    }

    internal sealed class ProtoReader {
        private readonly byte[] data;
        private readonly int end;
        private int position;

        public int Field { get; private set; }
        public int WireType { get; private set; }
        public ulong Value { get; private set; } //of varint and fixed fields
        public bool Failed { get; private set; }

        private int offset; //of length-delimited fields
        private int length;

        public ProtoReader(byte[] data) : this(data, 0, data?.Length ?? 0) { }

        public ProtoReader(byte[] data, int offset, int length) {
            this.data = data ?? Array.Empty<byte>();
            position = offset;
            end = offset + length;
        }

        //Moves to the next field, false at the end or when the message is malformed, which sets Failed.
        public bool Next() {
            if (Failed || position >= end) return false;

            if (!TryReadVarint(out ulong tag) || tag >> 3 == 0 || tag >> 3 > int.MaxValue) return Fail();

            Field = (int)(tag >> 3);
            WireType = (int)(tag & 7);

            switch (WireType) {
            case 0:
                if (!TryReadVarint(out ulong value)) return Fail();
                Value = value;
                return true;

            case 1:
                if (end - position < 8) return Fail();
                Value = BinaryPrimitives.ReadUInt64LittleEndian(data.AsSpan(position));
                position += 8;
                return true;

            case 2:
                if (!TryReadVarint(out ulong size) || size > (ulong)(end - position)) return Fail();
                offset = position;
                length = (int)size;
                position += length;
                return true;

            case 5:
                if (end - position < 4) return Fail();
                Value = BinaryPrimitives.ReadUInt32LittleEndian(data.AsSpan(position));
                position += 4;
                return true;

            default:
                return Fail();
            }
        }

        public byte[] Bytes() => WireType == 2 ? data.AsSpan(offset, length).ToArray() : Array.Empty<byte>();

        public string String() => WireType == 2 ? Encoding.UTF8.GetString(data, offset, length) : System.String.Empty;

        public ProtoReader Nested() => WireType == 2 ? new ProtoReader(data, offset, length) : new ProtoReader(Array.Empty<byte>());

        private bool Fail() {
            Failed = true;
            return false;
        }

        private bool TryReadVarint(out ulong value) {
            value = 0;
            for (int shift = 0; shift < 64; shift += 7) {
                if (position >= end) return false;
                byte b = data[position++];
                value |= (ulong)(b & 0x7f) << shift;
                if ((b & 0x80) == 0) return true;
            }
            return false;
        }
    }
}

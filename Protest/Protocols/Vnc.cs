using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Org.BouncyCastle.Crypto.Engines;
using Org.BouncyCastle.Crypto.Parameters;
using Protest.Http;

namespace Protest.Protocols;

internal static class Vnc {

    private const int DEFAULT_PORT = 5900;
    private const int HANDSHAKE_TIMEOUT = 20_000;

    private const byte SECURITY_NONE = 1;
    private const byte SECURITY_VNC_AUTH = 2;

    private static readonly byte[] RFB_VERSION_38 = "RFB 003.008\n"u8.ToArray();

    public static async Task WebSocketHandler(HttpListenerContext ctx) {
        if (!Auth.IsAuthenticatedAndAuthorized(ctx, ctx.Request.Url.AbsolutePath)) {
            ctx.Response.Close();
            return;
        }

        string target = ctx.Request.QueryString["target"];
        if (string.IsNullOrEmpty(target)) {
            ctx.Response.StatusCode = 400;
            ctx.Response.Close();
            return;
        }

        string[] split = target.Split(':');
        string host = split[0];
        int port = split.Length > 1 && int.TryParse(split[1], out int p) ? p : DEFAULT_PORT;

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

        string sessionId = ctx.Request.Cookies["sessionid"]?.Value;
        string origin = IPAddress.IsLoopback(ctx.Request.RemoteEndPoint.Address) ? "loopback" : Auth.GetUsername(sessionId);

        //with a vault credential, the proxy authenticates on the client's behalf and the password never reaches the browser
        bool serverSideAuth = !String.IsNullOrEmpty(credentialGuid);
        string password = null;

        if (serverSideAuth) {
            if (!Guid.TryParse(credentialGuid, out Guid guid) || !Tools.Vault.FromGuid(guid, out Tools.Vault.CredentialEntry credential)) {
                await RejectClient(ws, "Credentials don't exist");
                return;
            }

            if (!Tools.Vault.IsAllowed(credential, origin)) {
                await RejectClient(ws, "Access denied for this credential");
                return;
            }

            password = credential.password ?? String.Empty;
        }

        TcpClient tcp = new TcpClient();
        SessionRecording recording = null;
        bool established = false;

        try {
            await tcp.ConnectAsync(host, port);

            NetworkStream stream = tcp.GetStream();
            byte[] clientLeftover = null;

            if (serverSideAuth) {
                using CancellationTokenSource handshakeCts = new CancellationTokenSource(HANDSHAKE_TIMEOUT);

                string error;
                try {
                    error = await AuthenticateUpstream(stream, password, handshakeCts.Token);
                }
                catch (OperationCanceledException) {
                    error = "The server did not respond in time";
                }
                catch (EndOfStreamException) {
                    error = "The server closed the connection";
                }
                catch (IOException) {
                    error = "The connection to the server was lost";
                }

                if (error is not null) {
                    Logger.Action(origin, "Remote-access", $"VNC authentication to {host}:{port} failed: {error}");
                    await RejectClient(ws, error);
                    return;
                }

                //the client sees a server with no authentication
                clientLeftover = await HandshakeClient(ws, handshakeCts.Token);
                if (clientLeftover is null) return;
            }

            Logger.Action(origin, "Remote-access", $"Establish VNC connection to {host}:{port}{(serverSideAuth ? " with vault credentials" : "")}");
            established = true;

            recording = SessionRecording.Start("vnc", host, port, deviceFile, origin);

            if (serverSideAuth && recording is not null) {
                recording.WriteVideo(RFB_VERSION_38, RFB_VERSION_38.Length);
                recording.WriteVideo(new byte[] { 1, SECURITY_NONE }, 2);
                recording.WriteVideo(new byte[4], 4);
            }

            if (clientLeftover?.Length > 0) {
                await stream.WriteAsync(clientLeftover);
                await stream.FlushAsync();
            }

            using CancellationTokenSource cts = new CancellationTokenSource();

            Task upstream   = PumpToTcp(ctx, ws, stream, cts, recording);
            Task downstream = PumpToWs(ws, stream, cts, recording);

            await Task.WhenAny(upstream, downstream);
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
                Logger.Action(origin, "Remote-access", $"Close VNC connection to {host}:{port}");
            }

            recording?.Stop();

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

    private static async Task<string> AuthenticateUpstream(NetworkStream stream, string password, CancellationToken token) {
        byte[] versionBytes = await ReadExactly(stream, 12, token);
        string version = Encoding.ASCII.GetString(versionBytes);

        if (!version.StartsWith("RFB ") || version[11] != '\n'
            || !int.TryParse(version[4..7], out int major) || !int.TryParse(version[8..11], out int minor)) {
            return "Not a VNC server";
        }

        //3.3, 3.7 and 3.8 are the only versions that differ, anything newer (like Apple's 3.889) speaks 3.8
        int protocol = major > 3 || minor >= 8 ? 8 : minor == 7 ? 7 : 3;
        await stream.WriteAsync(Encoding.ASCII.GetBytes($"RFB 003.00{protocol}\n"), token);

        byte securityType;
        if (protocol == 3) {
            //in 3.3 the server picks the security type
            uint type = await ReadUInt32(stream, token);
            if (type == 0) return await ReadReason(stream, token) ?? "The server refused the connection";
            if (type != SECURITY_NONE && type != SECURITY_VNC_AUTH) return $"Unsupported security type: {type}";
            securityType = (byte)type;
        }
        else {
            byte count = (await ReadExactly(stream, 1, token))[0];
            if (count == 0) return await ReadReason(stream, token) ?? "The server refused the connection";

            byte[] types = await ReadExactly(stream, count, token);
            if (Array.IndexOf(types, SECURITY_VNC_AUTH) > -1) {
                securityType = SECURITY_VNC_AUTH;
            }
            else if (Array.IndexOf(types, SECURITY_NONE) > -1) {
                securityType = SECURITY_NONE;
            }
            else {
                return $"The server requires an authentication method that isn't supported with vault credentials (security types: {String.Join(", ", types)})";
            }

            await stream.WriteAsync(new byte[] { securityType }, token);
        }

        if (securityType == SECURITY_VNC_AUTH) {
            byte[] challenge = await ReadExactly(stream, 16, token);
            await stream.WriteAsync(EncryptChallenge(password, challenge), token);
        }

        //3.3 and 3.7 skip the security result when there is no authentication
        if (securityType == SECURITY_VNC_AUTH || protocol == 8) {
            uint result = await ReadUInt32(stream, token);
            if (result != 0) {
                string reason = protocol == 8 ? await ReadReason(stream, token) : null;
                return String.IsNullOrEmpty(reason) ? "Invalid password" : reason;
            }
        }

        return null;
    }

    private static async Task<byte[]> HandshakeClient(WebSocket ws, CancellationToken token) {
        List<byte> received = new List<byte>();

        await SendBinary(ws, RFB_VERSION_38, token);
        if (!await ReceiveAtLeast(ws, received, 12, token)) return null; //client version, we only speak 3.8

        await SendBinary(ws, new byte[] { 1, SECURITY_NONE }, token);
        if (!await ReceiveAtLeast(ws, received, 13, token)) return null; //chosen security type

        await SendBinary(ws, new byte[4], token); //security result: ok

        return received.GetRange(13, received.Count - 13).ToArray();
    }

    //Fails the client's handshake with a reason, which noVNC reports through its "securityfailure" event.
    private static async Task RejectClient(WebSocket ws, string reason) {
        if (ws.State != WebSocketState.Open) return;

        try {
            using CancellationTokenSource cts = new CancellationTokenSource(5_000);

            await SendBinary(ws, RFB_VERSION_38, cts.Token);
            if (!await ReceiveAtLeast(ws, new List<byte>(), 12, cts.Token)) return;

            byte[] reasonBytes = Encoding.UTF8.GetBytes(reason);
            byte[] message = new byte[5 + reasonBytes.Length];
            message[0] = 0; //no security types, a reason follows
            WriteUInt32(message, 1, (uint)reasonBytes.Length);
            reasonBytes.CopyTo(message, 5);

            await SendBinary(ws, message, cts.Token);
            await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, string.Empty, cts.Token);
        }
        catch (Exception ex) {
            Logger.Debug(ex);
        }
    }

    private static byte[] EncryptChallenge(string password, byte[] challenge) {
        byte[] key = new byte[8];
        for (int i = 0; i < 8 && i < password.Length; i++) {
            key[i] = ReverseBits((byte)password[i]);
        }

        DesEngine des = new DesEngine();
        des.Init(true, new KeyParameter(key));

        byte[] response = new byte[16];
        des.ProcessBlock(challenge, 0, response, 0);
        des.ProcessBlock(challenge, 8, response, 8);
        return response;
    }

    private static byte ReverseBits(byte b) {
        int result = 0;
        for (int i = 0; i < 8; i++) {
            result = (result << 1) | ((b >> i) & 1);
        }
        return (byte)result;
    }

    private static async Task<byte[]> ReadExactly(NetworkStream stream, int count, CancellationToken token) {
        byte[] buffer = new byte[count];
        await stream.ReadExactlyAsync(buffer, token);
        return buffer;
    }

    private static async Task<uint> ReadUInt32(NetworkStream stream, CancellationToken token) {
        byte[] bytes = await ReadExactly(stream, 4, token);
        return (uint)(bytes[0] << 24 | bytes[1] << 16 | bytes[2] << 8 | bytes[3]);
    }

    private static async Task<string> ReadReason(NetworkStream stream, CancellationToken token) {
        uint length = await ReadUInt32(stream, token);
        if (length == 0 || length > 4096) return null;
        return Encoding.UTF8.GetString(await ReadExactly(stream, (int)length, token));
    }

    private static void WriteUInt32(byte[] buffer, int offset, uint value) {
        buffer[offset]     = (byte)(value >> 24);
        buffer[offset + 1] = (byte)(value >> 16);
        buffer[offset + 2] = (byte)(value >> 8);
        buffer[offset + 3] = (byte)value;
    }

    private static Task SendBinary(WebSocket ws, byte[] data, CancellationToken token) =>
        ws.SendAsync(new ArraySegment<byte>(data), WebSocketMessageType.Binary, true, token);

    private static async Task<bool> ReceiveAtLeast(WebSocket ws, List<byte> received, int count, CancellationToken token) {
        while (received.Count < count) {
            byte[] message = await WebSocketHelper.WsReadBinary(ws, token, 1024);
            if (message is null) return false; //close frame received
            received.AddRange(message);
        }
        return true;
    }

    private static async Task PumpToTcp(HttpListenerContext ctx, WebSocket ws, NetworkStream stream, CancellationTokenSource cts, SessionRecording recording) {
        try {
            while (ws.State == WebSocketState.Open && !cts.IsCancelled()) {

                byte[] message = await WebSocketHelper.WsReadBinary(ws, cts.Token, 8192);
                if (message is null) {
                    return; //close frame received
                }

                if (!Auth.IsAuthenticatedAndAuthorized(ctx, "/ws/vnc")) {
                    return;
                }

                if (recording is not null && HasUserInput(message)) {
                    recording.MarkInteracted();
                }

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

    private static bool HasUserInput(byte[] message) {
        bool input = false;
        int i = 0;

        while (i < message.Length) {
            int length;

            switch (message[i]) {
            case 0: //SetPixelFormat
                length = 20;
                break;

            case 2: //SetEncodings
                if (i + 4 > message.Length) return false;
                length = 4 + 4 * (message[i + 2] << 8 | message[i + 3]);
                break;

            case 3: //FramebufferUpdateRequest
                length = 10;
                break;

            case 4: //KeyEvent
                length = 8;
                input = true;
                break;

            case 5: //PointerEvent
                if (i + 2 > message.Length) return false;
                length = 6;
                if (message[i + 1] != 0) input = true; //button mask, includes the wheel
                break;

            case 6: //ClientCutText
                if (i + 8 > message.Length) return false;
                uint textLength = (uint)(message[i + 4] << 24 | message[i + 5] << 16 | message[i + 6] << 8 | message[i + 7]);
                if (textLength > message.Length) return false;
                length = 8 + (int)textLength;
                break;

            case 255: //QEMU extended key event
                if (i + 2 > message.Length || message[i + 1] != 0) return false;
                length = 12;
                input = true;
                break;

            default:
                return false;
            }

            i += length;
        }

        return input && i == message.Length;
    }

    private static async Task PumpToWs(WebSocket ws, NetworkStream stream, CancellationTokenSource cts, SessionRecording recording) {
        byte[] buffer = new byte[8192];

        try {
            while (ws.State == WebSocketState.Open && !cts.IsCancelled()) {
                int count = await stream.ReadAsync(buffer, cts.Token);
                if (count == 0) return; //remote host closed the connection
                recording?.WriteVideo(buffer, count);
                await ws.SendAsync(new ArraySegment<byte>(buffer, 0, count), WebSocketMessageType.Binary, true, cts.Token);
            }
        }
        catch (OperationCanceledException) { }
        catch (WebSocketException) { }
        catch (IOException) { }
        finally {
            cts.Cancel();
        }
    }

    private static bool IsCancelled(this CancellationTokenSource cts) => cts.Token.IsCancellationRequested;
}

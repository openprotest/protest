using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Protest.Http;

namespace Protest.Protocols;

internal static class Telnet {
    public static async Task WebSocketHandler(HttpListenerContext ctx) {
        if (!Auth.IsAuthenticatedAndAuthorized(ctx, ctx.Request.Url.AbsolutePath)) {
            ctx.Response.Close();
            return;
        }

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

        string host = "0.0.0.0";
        int port = 23;

        try {
            byte[] connectionBuffer = new byte[512];
            WebSocketReceiveResult targetResult = await ws.ReceiveAsync(connectionBuffer, CancellationToken.None);
            string target = Encoding.UTF8.GetString(connectionBuffer, 0, targetResult.Count);

            string[] split = target.Split(':');
            host = split[0];
            port = 23;

            if (split.Length > 1) {
                _ = int.TryParse(split[1], out port);
            }

            TcpClient telnet;

            if (IPAddress.TryParse(host, out IPAddress ip)) {
                telnet = new TcpClient();
                telnet.Connect(ip, port);
            }
            else {
                telnet = new TcpClient(host, port);
            }

            NetworkStream stream = telnet.GetStream();

            Logger.Action(origin, "Remote-access", $"Establish telnet connection to {host}:{port}");

            await WebSocketHelper.WsWriteText(ws, "{\"connected\":true}"u8.ToArray());

            _ = Task.Run(() => HandleDownstream(ctx, ws, telnet, stream));

            bool nawsAnnounced = false;
            byte[] buff = new byte[2048];
            while (ws.State == WebSocketState.Open && telnet.Connected) { //handle upstream
                WebSocketReceiveResult receiveResult = await ws.ReceiveAsync(buff, CancellationToken.None);

                if (receiveResult.MessageType == WebSocketMessageType.Close) {
                    await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, CancellationToken.None);
                    telnet.Close();
                    break;
                }

                if (!Auth.IsAuthenticatedAndAuthorized(ctx, "/ws/telnet")) { //check session
                    ctx.Response.Close();
                    telnet.Close();
                    return;
                }

                if (TryResizeTelnet(buff, receiveResult.Count, stream, ref nawsAnnounced)) continue;

                stream.Write(buff, 0, receiveResult.Count);
            }
        }
        catch (SocketException ex) {
            if (ws.State == WebSocketState.Open) {
                try {
                    await WebSocketHelper.WsWriteText(ws, $"{{\"error\":\"{ex.Message}\"}}");
                    await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, CancellationToken.None);
                }
                catch (Exception exg) {
                    Logger.Debug(exg);
                }
            }
            return;
        }
        catch (Exception ex) {
            Logger.Error(ex);
        }
        finally {
            Logger.Action(origin, "Remote-access", $"Close telnet connection to {host}:{port}");

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

    //Telnet Negotiate About Window Size (RFC 1073). Best-effort: the client offers
    //WILL NAWS once, then emits an SB NAWS update per resize. Servers that never
    //agreed to NAWS ignore it; the frame is swallowed either way so it is never
    //written into the session as text.
    private static bool TryResizeTelnet(byte[] buffer, int count, Stream stream, ref bool nawsAnnounced) {
        if (count >= 100 || count == 0 || buffer[0] != '{') return false;

        try {
            using JsonDocument document = JsonDocument.Parse(Encoding.UTF8.GetString(buffer, 0, count));
            JsonElement root = document.RootElement;

            if (!root.TryGetProperty("cols", out JsonElement cols) || !root.TryGetProperty("rows", out JsonElement rows)) {
                return false;
            }

            int width  = Math.Clamp(cols.GetInt32(), 1, 65535);
            int height = Math.Clamp(rows.GetInt32(), 1, 65535);

            const byte IAC = 255, WILL = 251, SB = 250, SE = 240, NAWS = 31;

            if (!nawsAnnounced) {
                stream.Write(new byte[] { IAC, WILL, NAWS }, 0, 3);
                nawsAnnounced = true;
            }

            List<byte> payload = new List<byte> { IAC, SB, NAWS };
            //Data bytes equal to IAC (255) must be doubled inside the subnegotiation.
            void AddEscaped(byte b) {
                payload.Add(b);
                if (b == IAC) payload.Add(IAC);
            }
            AddEscaped((byte)(width >> 8));
            AddEscaped((byte)(width & 0xFF));
            AddEscaped((byte)(height >> 8));
            AddEscaped((byte)(height & 0xFF));
            payload.Add(IAC);
            payload.Add(SE);

            stream.Write(payload.ToArray(), 0, payload.Count);
            stream.Flush();
            return true;
        }
        catch {
            return false;
        }
    }

    private static async Task HandleDownstream(HttpListenerContext ctx, WebSocket ws, TcpClient telnet, Stream stream) {
        byte[] data = new byte[2048];

        while (ws!.State == WebSocketState.Open && telnet.Connected) {
            if (!Auth.IsAuthenticatedAndAuthorized(ctx, "/ws/telnet")) { //check session
                ctx.Response.Close();
                telnet.Close();
                return;
            }

            try {
                int count = await stream.ReadAsync(data);

                if (count == 0) { //remote host closed the connection
                    if (ws!.State == WebSocketState.Open) {
                        try {
                            await ws?.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, CancellationToken.None);
                        }
                        catch (Exception ex) {
                            Logger.Debug(ex);
                        }
                    }
                    return;
                }

                if (count == 1 && data[0] == 0) continue; //keep alive

                for (int i = 0; i < count; i++) {
                    if (data[i] > 127) data[i] = 46; //.
                }

                await ws!.SendAsync(new ArraySegment<byte>(data, 0, count), WebSocketMessageType.Text, true, CancellationToken.None);
            }
            catch (IOException) {
                return;
            }
            catch {
                return;
            }
        }
    }
}
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Text;
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
        string username = IPAddress.IsLoopback(ctx.Request.RemoteEndPoint.Address) ? "loopback" : Auth.GetUsername(sessionId);

        try {
            byte[] connectionBuffer = new byte[512];
            WebSocketReceiveResult targetResult = await ws.ReceiveAsync(connectionBuffer, CancellationToken.None);
            string target = Encoding.Default.GetString(connectionBuffer, 0, targetResult.Count);

            string[] split = target.Split(':');
            string host = split[0];
            int port = 23;

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

            Logger.Action(username, $"Establish telnet connection to {host}:{port}");

            await WebSocketHelper.WsWriteText(ws, "{\"connected\":true}"u8.ToArray());

            Thread fork = new Thread(() => HandleDownstream(ctx, ws, telnet, stream).GetAwaiter().GetResult());
            fork.Start();

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

                stream.Write(buff, 0, receiveResult.Count);
            }
        }
        catch (SocketException ex) {
            if (ws.State == WebSocketState.Open) {
                try {
                    await WebSocketHelper.WsWriteText(ws, $"{{\"error\":\"{ex.Message}\"}}");
                    await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, CancellationToken.None);
                }
#if DEBUG
                catch (Exception exg) {
                    Logger.Error(exg);
                }
#else
                catch { }
#endif
            }
            return;
        }
        catch (Exception ex) {
            Logger.Error(ex);
        }
        finally {
            if (ws.State == WebSocketState.Open) {
                try {
                    await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, CancellationToken.None);
                }
#if DEBUG
                catch (Exception ex) {
                    Logger.Error(ex);
                }
#else
                catch { }
#endif
            }
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
#if DEBUG
                        catch (Exception ex) {
                            Logger.Error(ex);
                        }
#else
                        catch { }
#endif
                    }
                    return;
                }

                if (count == 1 && data[0] == 0) continue; //keep alive

                for (int i = 0; i < count; i++) {
                    if (data[i] > 127) data[i] = 46; //.
                }

                await ws!.SendAsync(new ArraySegment<byte>(data, 0, count), WebSocketMessageType.Text, true, CancellationToken.None);

                //string dataString = Encoding.ASCII.GetString(data, 0, count);
                //Console.Write(dataString);
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
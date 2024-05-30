using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Protest.Http;
using Renci.SshNet;
using Renci.SshNet.Common;

namespace Protest.Protocols;

internal static class Ssh {
    private static async Task WsWriteText(WebSocket ws, string data) {
        if (ws.State == WebSocketState.Open) {
            await ws.SendAsync(new ArraySegment<byte>(Encoding.ASCII.GetBytes(data), 0, data.Length), WebSocketMessageType.Text, true, CancellationToken.None);
        }
    }
    private static async Task WsWriteText(WebSocket ws, byte[] data) {
        if (ws.State == WebSocketState.Open) {
            await ws.SendAsync(new ArraySegment<byte>(data, 0, data.Length), WebSocketMessageType.Text, true, CancellationToken.None);
        }
    }

    public static async void WebSocketHandler(HttpListenerContext ctx) {
        WebSocket ws;
        try {
            WebSocketContext wsc = await ctx.AcceptWebSocketAsync(null);
            ws = wsc.WebSocket;
        }
        catch (WebSocketException ex) {
            ctx.Response.Close();
            Logger.Error(ex);
            return;
        }

        if (!Auth.IsAuthenticatedAndAuthorized(ctx, ctx.Request.Url.AbsolutePath)) {
            await ws.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, null, CancellationToken.None);
            return;
        }

        string sessionId = ctx.Request.Cookies["sessionid"]?.Value ?? null;
        string origin = IPAddress.IsLoopback(ctx.Request.RemoteEndPoint.Address) ? "loopback" : Auth.GetUsername(sessionId);

        try {
            byte[] connectionBuffer = new byte[2048];
            WebSocketReceiveResult targetResult = await ws.ReceiveAsync(new ArraySegment<byte>(connectionBuffer), CancellationToken.None);
            string connectionString = Encoding.Default.GetString(connectionBuffer, 0, targetResult.Count);

            string[] lines = connectionString.Split("\n");
            string target = String.Empty;
            string file = null;
            string username = String.Empty;
            string password = String.Empty;
            for (int i = 0; i < lines.Length; i++) {
                if (lines[i].StartsWith("target=")) target   = lines[i].Substring(7);
                if (lines[i].StartsWith("file="))   file     = lines[i].Substring(5);
                if (lines[i].StartsWith("un="))     username = lines[i].Substring(3);
                if (lines[i].StartsWith("pw="))     password = lines[i].Substring(3);
            }

            string[] split = target.Split(':');
            string host = split[0];
            int port = 22;

            SshClient ssh = new SshClient(port == 22 ? host : $"{host}:{port}", username, password);
            ssh.Connect();

            Logger.Action(origin, $"Establish ssh connection to {username}@{host}:{port}");

            await WsWriteText(ws, "{\"connected\":true}"u8.ToArray());

            ShellStream shellStream = ssh.CreateShellStream("xterm", 80, 24, 800, 600, 1024);

            Thread fork = new Thread(() => HandleDownstream(ctx, ws, ssh, shellStream));
            fork.Start();

            byte[] buff = new byte[2048];
            while (ws.State == WebSocketState.Open && ssh.IsConnected) {
                WebSocketReceiveResult receiveResult = await ws.ReceiveAsync(buff, CancellationToken.None);

                if (receiveResult.MessageType == WebSocketMessageType.Close) {
                    await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, string.Empty, CancellationToken.None);
                    ssh.Disconnect();
                    break;
                }

                if (!Auth.IsAuthenticatedAndAuthorized(ctx, "/ws/ssh")) {
                    ctx.Response.Close();
                    ssh.Disconnect();
                    return;
                }

                shellStream.Write(Encoding.ASCII.GetString(buff, 0, receiveResult.Count));
            }
        }
        catch (SshAuthenticationException) {
            await WsWriteText(ws, "{\"error\":\"Invalid username or password\"}"u8.ToArray());
            await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, CancellationToken.None);
            return;
        }
        catch (SocketException ex) {
            await WsWriteText(ws, $"{{\"error\":\"{ex.Message}\"}}");
            await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, CancellationToken.None);
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
                catch { }
            }
        }
    }

    private static async void HandleDownstream(HttpListenerContext ctx, WebSocket ws, SshClient ssh, ShellStream shellStream) {
        byte[] data = new byte[2048];

        while (ws.State == WebSocketState.Open && ssh.IsConnected) {
            if (!Auth.IsAuthenticatedAndAuthorized(ctx, "/ws/ssh")) { //check session
                ctx.Response.Close();
                shellStream.Close();
                return;
            }

            try {
                int count = await shellStream.ReadAsync(data, 0, data.Length);

                if (count == 0) { //remote host closed the connection
                    if (ws.State == WebSocketState.Open) {
                        try {
                            await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, CancellationToken.None);
                        }
                        catch { }
                    }
                    return;
                }

                if (count == 1 && data[0] == 0) continue; //keep alive

                for (int i = 0; i < count; i++) {
                    if (data[i] > 127) data[i] = 46; //.
                }

                await ws.SendAsync(new ArraySegment<byte>(data, 0, count), WebSocketMessageType.Text, true, CancellationToken.None);

                string dataString = Encoding.ASCII.GetString(data, 0, count);
                Console.Write(dataString);
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
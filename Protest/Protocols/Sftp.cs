using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Renci.SshNet;
using Renci.SshNet.Common;
using Renci.SshNet.Sftp;
using Protest.Http;

namespace Protest.Protocols;

internal class Sftp {

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

        string username = String.Empty;
        string host = "0.0.0.0";
        int port = 22;

        try {
            byte[] connectionBuffer = new byte[2048];
            WebSocketReceiveResult targetResult = await ws.ReceiveAsync(new ArraySegment<byte>(connectionBuffer), CancellationToken.None);
            string connectionString = Encoding.UTF8.GetString(connectionBuffer, 0, targetResult.Count);

            string[] lines = connectionString.Split('\n');
            string target = String.Empty;
            string file = null;
            string password = String.Empty;
            for (int i = 0; i < lines.Length; i++) {
                if (lines[i].StartsWith("target=")) target   = lines[i][7..];
                if (lines[i].StartsWith("file="))   file     = lines[i][5..];
                if (lines[i].StartsWith("un="))     username = lines[i][3..];
                if (lines[i].StartsWith("pw="))     password = lines[i][3..];
            }

            string[] split = target.Split(':');
            host = split[0];
            port = 22;

            if (!String.IsNullOrEmpty(file) && DatabaseInstances.devices.dictionary.TryGetValue(file, out Database.Entry entry)) {
                Database.Attribute usernameAttribute;
                if (entry.attributes.TryGetValue("ssh username", out usernameAttribute)) {
                    username = usernameAttribute.value;
                }
                else if (entry.attributes.TryGetValue("username", out usernameAttribute)) {
                    username = usernameAttribute.value;
                }

                Database.Attribute passwordAttribute;
                if (entry.attributes.TryGetValue("ssh password", out passwordAttribute)) {
                    password = passwordAttribute.value;
                }
                else if (entry.attributes.TryGetValue("password", out passwordAttribute)) {
                    password = passwordAttribute.value;
                }
            }

            if (String.IsNullOrEmpty(username) || String.IsNullOrEmpty(password)) {
                await WebSocketHelper.WsWriteText(ws, "{\"error\":\"Invalid username or password\"}"u8.ToArray());
                await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, CancellationToken.None);
                return;
            }

            using SftpClient sftp = new SftpClient(port == 22 ? host : $"{host}:{port}", username, password);
            sftp.Connect();

            Logger.Action(origin, "Remote-access", $"Establish SFTP connection to {username}@{host}:{port}");

            await WebSocketHelper.WsWriteText(ws, "{\"connected\":true}"u8.ToArray());

            await HandleAction(ws, sftp, "list", ".", CancellationToken.None);

            while (ws.State == WebSocketState.Open && sftp.IsConnected) {
                string message = await WebSocketHelper.WsReadText(ws, CancellationToken.None);

                if (message is null) continue;

                string action, arg;
                int delimiterIndex = message.IndexOf(':');
                if (delimiterIndex == -1) {
                    action = message;
                    arg = null;
                }
                else {
                    action = message[..delimiterIndex];
                    arg = message[(delimiterIndex + 1)..];
                }

                await HandleAction(ws, sftp, action, arg, CancellationToken.None);
            }
        }
        catch (SshAuthenticationException ex) {
            await WebSocketHelper.WsWriteText(ws, $"{{\"error\":\"{ex.Message}\"}}");
            await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, CancellationToken.None);
            return;
        }
        catch (SocketException ex) {
            await WebSocketHelper.WsWriteText(ws, $"{{\"error\":\"{ex.Message}\"}}");
            await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, CancellationToken.None);
            return;
        }
        catch (Exception ex) {
            Logger.Error(ex);
        }
        finally {
            Logger.Action(origin, "Remote-access", $"Close SFTP connection to {username}@{host}:{port}");

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

    private static async Task HandleAction(WebSocket ws, SftpClient sftp, string action, string arg, CancellationToken token) {
        switch (action) {
        case "list": await ListDirectory(ws, sftp, arg, token); break;
        }
    }

    private static async Task ListDirectory(WebSocket ws, SftpClient sftp, string directory, CancellationToken token) {
        try {
            sftp.ChangeDirectory(directory);
            ISftpFile[] files = sftp.ListDirectory(".").ToArray();

            byte[] bytes = JsonSerializer.SerializeToUtf8Bytes(new {
                action           = "list",
                workingDirectory = sftp.WorkingDirectory,
                data             = files.Select(o => new {
                    name     = o.Name,
                    fullname = o.FullName,
                    size     = o.Length,
                    isFile   = o.IsRegularFile,
                    isDir    = o.IsDirectory,
                    isLink   = o.IsSymbolicLink,
                    modified = o.LastWriteTime.ToFileTimeUtc(),
                })
            .OrderBy(o => !o.isDir)
            .ThenBy(o => o.name, StringComparer.Ordinal)
            .ToList()
            });

            await ws.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, token);
        }
        catch (Exception ex) {
            await WebSocketHelper.WsWriteText(ws, $"{{\"error\":\"{ex.Message}\"}}");
            return;
        }
    }

}

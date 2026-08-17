using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;
using Renci.SshNet;
using Renci.SshNet.Common;
using Renci.SshNet.Sftp;
using Protest.Http;

namespace Protest.Protocols;

internal class Sftp {
    const long TOKEN_LIFETIME = TimeSpan.TicksPerMinute;

    private record SftpToken {
        public Guid   token;
        public long   timestamp;
        public string sessionId;
        public string path;
        public string remoteEndpoint;
        public string username;
        public string password;
    }

    private static ConcurrentDictionary<string, SftpToken> tokens = new ConcurrentDictionary<string, SftpToken>();

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
            string connectionString = await WebSocketHelper.WsReadText(ws, CancellationToken.None, 2048);

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

            await ListDirectory(ws, sftp, ".");

            while (ws.State == WebSocketState.Open && sftp.IsConnected) {
                string message = await WebSocketHelper.WsReadText(ws, CancellationToken.None, 2048);

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

                switch (action) {
                    case "list"     : await ListDirectory(ws, sftp, arg); break;
                    case "download" : await DownloadFilePrep(ws, sftp, sessionId, target, username, password, arg); break;
                    case "upload"   : await UploadFilePrep(ws, sftp, sessionId, target, username, password, arg); break;
                }
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

    public static byte[] DownloadFileHandler(HttpListenerContext ctx, string origin) {
        if (!Auth.IsAuthenticatedAndAuthorized(ctx, ctx.Request.Url.AbsolutePath)) {
            ctx.Response.Close();
            return Data.CODE_UNAUTHORIZED.Array;
        }

        Dictionary<string, string> parameters = Listener.ParseQuery(ctx);
        if (parameters is null) return Data.CODE_INVALID_ARGUMENT.Array;

        if (!parameters.TryGetValue("token", out string tokenId)
            || String.IsNullOrEmpty(tokenId)
            || !tokens.TryRemove(tokenId, out SftpToken token)) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        long now = DateTimeOffset.UtcNow.Ticks;
        if (now - token.timestamp > TOKEN_LIFETIME) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        string sessionId = ctx.Request.Cookies["sessionid"]?.Value;
        if (String.IsNullOrEmpty(sessionId) || token.sessionId != sessionId) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        try {
            using SftpClient sftp = new SftpClient(token.remoteEndpoint, token.username, token.password);
            sftp.Connect();

            SftpFileAttributes attributes = sftp.GetAttributes(token.path);

            ctx.Response.ContentLength64 = attributes.Size;
            ctx.Response.ContentType = "application/octet-stream";

            sftp.DownloadFile(token.path, ctx.Response.OutputStream);

            ctx.Response.OutputStream.Close();
            ctx.Response.Close();
        }
        catch (Exception ex) {
            Logger.Error(ex);
        }

        return null;
    }

    public static byte[] UploadFileHandler(HttpListenerContext ctx, string origin) {
        if (!Auth.IsAuthenticatedAndAuthorized(ctx, ctx.Request.Url.AbsolutePath)) {
            ctx.Response.Close();
            return Data.CODE_UNAUTHORIZED.Array;
        }

        Dictionary<string, string> parameters = Listener.ParseQuery(ctx);
        if (parameters is null) return Data.CODE_INVALID_ARGUMENT.Array;

        if (!parameters.TryGetValue("token", out string tokenId)
            || String.IsNullOrEmpty(tokenId)
            || !tokens.TryRemove(tokenId, out SftpToken token)) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        long now = DateTimeOffset.UtcNow.Ticks;
        if (now - token.timestamp > TOKEN_LIFETIME) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        string sessionId = ctx.Request.Cookies["sessionid"]?.Value;
        if (String.IsNullOrEmpty(sessionId) || token.sessionId != sessionId) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        try {
            using SftpClient sftp = new SftpClient(token.remoteEndpoint, token.username, token.password);
            sftp.Connect();

            //sftp.UploadFile();

            //ctx.Response.OutputStream.Close();
            //ctx.Response.Close();
        }
        catch (Exception ex) {
            Logger.Error(ex);
        }

        return null;
    }

    private static async Task ListDirectory(WebSocket ws, SftpClient sftp, string directory) {
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
                    modified = (int)o.LastWriteTime.Subtract(new DateTime(1970, 1, 1)).TotalSeconds
                })
            .OrderBy(o => !o.isDir)
            .ThenBy(o => o.name, StringComparer.Ordinal)
            .ToList()
            });

            await ws.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, CancellationToken.None);
        }
        catch (Exception ex) {
            await WebSocketHelper.WsWriteText(ws, $"{{\"error\":\"{ex.Message}\"}}");
            return;
        }
    }

    private static void CleanupTokens() {
        long now = DateTime.UtcNow.Ticks;

        foreach (KeyValuePair<string, SftpToken> pair in tokens) {
            if (now - pair.Value.timestamp > TOKEN_LIFETIME) {
                tokens.TryRemove(pair.Key, out _);
            }
        }
    }

    private static async Task DownloadFilePrep(WebSocket ws, SftpClient control, string sessionId, string remoteEndpoint, string username, string password, string src) {
        CleanupTokens();

        Guid tokenId = Guid.NewGuid();

        SftpToken token = new SftpToken {
            token          = tokenId,
            timestamp      = DateTime.UtcNow.Ticks,
            sessionId      = sessionId,
            remoteEndpoint = remoteEndpoint,
            username       = username,
            password       = password,
            path           = src
        };

        tokens[token.token.ToString()] = token;

        await WebSocketHelper.WsWriteText(ws, JsonSerializer.Serialize(new {
            action = "download",
            token  = tokenId,
            name   = src.Split('/').Last()
        }));
    }

    private static async Task UploadFilePrep(WebSocket ws, SftpClient control, string sessionId, string remoteEndpoint, string username, string password, string dest) {
        CleanupTokens();

        Guid tokenId = Guid.NewGuid();

        SftpToken token = new SftpToken {
            token          = tokenId,
            timestamp      = DateTime.UtcNow.Ticks,
            sessionId      = sessionId,
            remoteEndpoint = remoteEndpoint,
            username       = username,
            password       = password,
            path           = dest
        };

        tokens[token.token.ToString()] = token;

        await WebSocketHelper.WsWriteText(ws, JsonSerializer.Serialize(new {
            action = "upload",
            token  = tokenId,
            name   = dest.Split('/').Last()
        }));
    }

}

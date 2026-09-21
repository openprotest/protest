using System.Collections.Concurrent;
using System.Collections.Generic;
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
    const long TOKEN_LIFETIME = TimeSpan.TicksPerMinute * 5;

    private record SftpToken {
        public WebSocket ws;
        public long   timestamp;
        public string sessionId;
        public string path;
        public string remoteEndpoint;
        public string username;
        public string password;
        public string credentialGuid;
    }

    private static readonly ConcurrentDictionary<string, SftpToken> uploadTokens = new ConcurrentDictionary<string, SftpToken>();
    private static readonly ConcurrentDictionary<string, SftpToken>  downloadTokens = new ConcurrentDictionary<string, SftpToken>();

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
            string credentialGuid = null;
            string password = String.Empty;
            string workingDirectory = null;
            for (int i = 0; i < lines.Length; i++) {
                if (lines[i].StartsWith("target=")) target           = lines[i][7..];
                if (lines[i].StartsWith("un="))     username         = lines[i][3..];
                if (lines[i].StartsWith("pw="))     password         = lines[i][3..];
                if (lines[i].StartsWith("wd="))     workingDirectory = lines[i][3..];
                if (lines[i].StartsWith("credential=")) credentialGuid = lines[i][11..];
            }

            string[] split = target.Split(':');
            host = split[0];
            port = 22;

            AuthenticationMethod[] authMethods = CredentialResolver.Resolve(credentialGuid, ref username, ref password, origin, out bool permissionDenied);

            if (permissionDenied) {
                await WebSocketHelper.WsWriteText(ws, "{\"error\":\"Access denied for this credential\"}"u8.ToArray());
                await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, CancellationToken.None);
                return;
            }

            if (authMethods is null && (String.IsNullOrEmpty(username) || String.IsNullOrEmpty(password))) {
                await WebSocketHelper.WsWriteText(ws, "{\"error\":\"Invalid username or password\"}"u8.ToArray());
                await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, CancellationToken.None);
                return;
            }

            using SftpClient sftp = authMethods is not null
                ? new SftpClient(new ConnectionInfo(host, port, username, authMethods))
                : new SftpClient(port == 22 ? host : $"{host}:{port}", username, password);
            sftp.Connect();

            //the control connection is authenticated now - drop the resolved secret rather than holding it in
            //memory for the rest of this (potentially long-lived) session; reconnects reload it from the vault
            if (!String.IsNullOrEmpty(credentialGuid)) {
                password = null;
                authMethods = null;
            }

            Logger.Action(origin, "Remote-access", $"Establish SFTP connection to {username}@{host}:{port}");

            await WebSocketHelper.WsWriteText(ws, "{\"connected\":true}"u8.ToArray());

            if (!String.IsNullOrEmpty(workingDirectory)) {
                sftp.ChangeDirectory(workingDirectory);
            }

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
                case "mkdir"    : await MakeDirectory(ws, sftp, arg); break;
                case "rm"   : await Remove(ws, sftp, arg); break;
                case "download" : await DownloadFilePrep(ws, sftp, sessionId, target, username, password, credentialGuid, arg); break;
                case "upload"   : await UploadFilePrep(ws, sftp, sessionId, target, username, password, credentialGuid, arg); break;
                }
            }

            sftp.Disconnect();
        }
        catch (SshAuthenticationException ex) {
            await WebSocketHelper.WsWriteText(ws, $"{{\"error\":\"{Data.EscapeJsonText(ex.Message)}\"}}");
            await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, CancellationToken.None);
            return;
        }
        catch (SocketException ex) {
            await WebSocketHelper.WsWriteText(ws, $"{{\"error\":\"{Data.EscapeJsonText(ex.Message)}\"}}");
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
            || !downloadTokens.TryRemove(tokenId, out SftpToken token)) {
            return Data.CODE_UNAUTHORIZED.Array;
        }

        if (DateTimeOffset.UtcNow.Ticks - token.timestamp > TOKEN_LIFETIME) {
            return Data.CODE_UNAUTHORIZED.Array;
        }

        string sessionId = ctx.Request.Cookies["sessionid"]?.Value;
        if (origin != "loopback" && (String.IsNullOrEmpty(sessionId) || !String.Equals(token.sessionId, sessionId, StringComparison.Ordinal))) {
            return Data.CODE_UNAUTHORIZED.Array;
        }

        try {
            //re-resolve the secret now, from the vault, rather than trusting anything cached on the token
            string reconnectUsername = token.username;
            string reconnectPassword = token.password;
            AuthenticationMethod[] authMethods = CredentialResolver.Resolve(token.credentialGuid, ref reconnectUsername, ref reconnectPassword, origin, out bool permissionDenied);

            if (permissionDenied) {
                return "{\"error\":\"Access denied for this credential\"}"u8.ToArray();
            }

            using SftpClient sftp = authMethods is not null
                ? new SftpClient(new ConnectionInfo(token.remoteEndpoint.Split(':')[0], 22, reconnectUsername, authMethods))
                : new SftpClient(token.remoteEndpoint, reconnectUsername, reconnectPassword);
            sftp.Connect();

            SftpFileAttributes attributes = sftp.GetAttributes(token.path);
            ctx.Response.ContentLength64 = attributes.Size;
            ctx.Response.ContentType = "application/octet-stream";

            sftp.DownloadFile(token.path, ctx.Response.OutputStream);
            sftp.Disconnect();
        }
        catch (Exception ex) {
            Logger.Error(ex);
        }

        return "{}"u8.ToArray();
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
            || !uploadTokens.TryRemove(tokenId, out SftpToken token)) {
            return Data.CODE_UNAUTHORIZED.Array;
        }

        if (DateTimeOffset.UtcNow.Ticks - token.timestamp > TOKEN_LIFETIME) {
            return Data.CODE_UNAUTHORIZED.Array;
        }

        string sessionId = ctx.Request.Cookies["sessionid"]?.Value;
        if (origin != "loopback" && (String.IsNullOrEmpty(sessionId) || !String.Equals(token.sessionId, sessionId, StringComparison.Ordinal))) {
            return Data.CODE_UNAUTHORIZED.Array;
        }

        try {
            string contentType = ctx.Request.ContentType;
            long totalLength = ctx.Request.ContentLength64;

            if (String.IsNullOrEmpty(contentType) || !contentType.StartsWith("multipart/form-data", StringComparison.OrdinalIgnoreCase)) {
                return Data.CODE_INVALID_ARGUMENT.Array;
            }

            int boundaryIndex = contentType.IndexOf("boundary=", StringComparison.OrdinalIgnoreCase);
            if (boundaryIndex == -1) return Data.CODE_INVALID_ARGUMENT.Array;

            string boundary = contentType[(boundaryIndex + 9)..].Trim();

            if (boundary.Length >= 2 && boundary[0] == '"' && boundary[^1] == '"') {
                boundary = boundary[1..^1];
            }

            string directory = token.path.Substring(0, token.path.LastIndexOf('/'));
            string name = token.path.Split('/').Last();

            //re-resolve the secret now, from the vault, rather than trusting anything cached on the token
            string reconnectUsername = token.username;
            string reconnectPassword = token.password;
            AuthenticationMethod[] authMethods = CredentialResolver.Resolve(token.credentialGuid, ref reconnectUsername, ref reconnectPassword, origin, out bool permissionDenied);

            if (permissionDenied) {
                return "{\"error\":\"Access denied for this credential\"}"u8.ToArray();
            }

            using SftpClient sftp = authMethods is not null
                ? new SftpClient(new ConnectionInfo(token.remoteEndpoint.Split(':')[0], 22, reconnectUsername, authMethods))
                : new SftpClient(token.remoteEndpoint, reconnectUsername, reconnectPassword);
            sftp.Connect();

            Action<int> callback = async value => {
                await WebSocketHelper.WsWriteText(token.ws, $"{{\"action\":\"upload-status\",\"dir\":\"{directory}\",\"name\":\"{name}\",\"progress\":{value}}}");
            };

            using MultipartFileStream fileStream = new MultipartFileStream(ctx.Request.InputStream, boundary, totalLength, callback);

            sftp.UploadFile(fileStream, token.path);

            if (token.ws.State == WebSocketState.Open) {
                byte[] bytes = Encoding.UTF8.GetBytes($"{{\"action\":\"upload-status\",\"dir\":\"{directory}\",\"name\":\"{name}\",\"progress\":100}}");
                token.ws.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, CancellationToken.None);
            }

            sftp.Disconnect();
        }
        catch (Exception ex) {
            Logger.Error(ex);
            return Encoding.UTF8.GetBytes($"{{\"error\":\"{Data.EscapeJsonText(ex.Message)}\"}}");
        }

        return "{}"u8.ToArray();
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
            await WebSocketHelper.WsWriteText(ws, $"{{\"error\":\"{Data.EscapeJsonText(ex.Message)}\"}}");
            return;
        }
    }

    private static async Task Remove(WebSocket ws, SftpClient sftp, string args) {
        try {
            sftp.Delete(args);
            await WebSocketHelper.WsWriteText(ws, $"{{\"action\":\"rm\",\"path\":\"{Data.EscapeJsonText(args)}\"}}");
        }
        catch (Exception ex) {
            await WebSocketHelper.WsWriteText(ws, $"{{\"error\":\"{Data.EscapeJsonText(ex.Message)}\"}}");
        }
    }

    private static async Task MakeDirectory(WebSocket ws, SftpClient sftp, string args) {
        try {
            if (sftp.Exists(args)) {
                await WebSocketHelper.WsWriteText(ws, $"{{\"error\":\"Already exists\"}}");
                return;
            }

            sftp.CreateDirectory(args);
            await WebSocketHelper.WsWriteText(ws, $"{{\"action\":\"mkdir\",\"path\":\"{Data.EscapeJsonText(args)}\"}}");
        }
        catch (Exception ex) {
            await WebSocketHelper.WsWriteText(ws, $"{{\"error\":\"{Data.EscapeJsonText(ex.Message)}\"}}");
        }
    }

    private static void CleanupTokens() {
        long now = DateTime.UtcNow.Ticks;

        foreach (KeyValuePair<string, SftpToken> pair in downloadTokens) {
            if (now - pair.Value.timestamp > TOKEN_LIFETIME) {
                downloadTokens.TryRemove(pair.Key, out _);
            }
        }
        
        foreach (KeyValuePair<string, SftpToken> pair in uploadTokens) {
            if (now - pair.Value.timestamp > TOKEN_LIFETIME) {
                uploadTokens.TryRemove(pair.Key, out _);
            }
        }
    }

    private static async Task DownloadFilePrep(WebSocket ws, SftpClient control, string sessionId, string remoteEndpoint, string username, string password, string credentialGuid, string src) {
        CleanupTokens();

        Guid tokenId = Guid.NewGuid();

        SftpToken token = new SftpToken {
            timestamp      = DateTime.UtcNow.Ticks,
            sessionId      = sessionId,
            remoteEndpoint = remoteEndpoint,
            username       = username,
            password       = String.IsNullOrEmpty(credentialGuid) ? password : null,
            credentialGuid = credentialGuid,
            path           = src
        };

        downloadTokens[tokenId.ToString()] = token;

        await WebSocketHelper.WsWriteText(ws, JsonSerializer.Serialize(new {
            action = "download",
            token  = tokenId,
            name   = src.Split('/').Last()
        }));
    }

    private static async Task UploadFilePrep(WebSocket ws, SftpClient control, string sessionId, string remoteEndpoint, string username, string password, string credentialGuid, string dest) {
        CleanupTokens();

        Guid tokenId = Guid.NewGuid();

        SftpToken token = new SftpToken {
            ws             = ws,
            timestamp      = DateTime.UtcNow.Ticks,
            sessionId      = sessionId,
            remoteEndpoint = remoteEndpoint,
            username       = username,
            password       = String.IsNullOrEmpty(credentialGuid) ? password : null,
            credentialGuid = credentialGuid,
            path           = dest
        };

        uploadTokens[tokenId.ToString()] = token;

        await WebSocketHelper.WsWriteText(ws, JsonSerializer.Serialize(new {
            action    = "upload",
            token     = tokenId,
            directory = dest.Substring(0, dest.LastIndexOf('/')),
            name      = dest.Split('/').Last(),
        }));
    }

}
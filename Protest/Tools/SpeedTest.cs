using System.Buffers;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.WebSockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Protest.Http;

namespace Protest.Tools;

//a control websocket opens a session, the data flows on plain http:
//GET /speedtest streams the payload (downstream), POST /speedtest is a multipart file, read and discarded (upstream)
internal static class SpeedTest {
    private const int  PAYLOAD_SIZE    = 4 * 1024 * 1024;
    private const int  MIN_WRITE       = 64 * 1024;
    private const int  MAX_WRITE       = 4 * 1024 * 1024;
    private const int  READ_SIZE       = 1024 * 1024; //a single connection reaches about 3x the speed of 64 KiB reads
    private const int  MAX_SESSIONS    = 8;
    private const int  MAX_CONNECTIONS = 64;  //per session, until the next reset
    private const int  MAX_SECONDS     = 60;  //per connection
    private const long MAX_BYTES       = 16L * 1024 * 1024 * 1024; //per connection
    private const int  STATS_INTERVAL  = 200; //milliseconds

    //random, so nothing on the way can compress it
    private static readonly byte[] payload = RandomNumberGenerator.GetBytes(PAYLOAD_SIZE);

    private static readonly ConcurrentDictionary<Guid, Session> sessions = new ConcurrentDictionary<Guid, Session>();

    private enum Direction : byte { Down, Up }

    private sealed class Connection {
        public string id;
        public Direction direction;
        public long bytes;
        public int requests; //in progress
        public readonly long started = Stopwatch.GetTimestamp();
        public readonly CancellationTokenSource stop = new CancellationTokenSource();
    }

    private sealed class Session {
        public readonly Guid id = Guid.NewGuid();
        public string username;
        public readonly long started = Stopwatch.GetTimestamp();
        public readonly CancellationTokenSource closed = new CancellationTokenSource();
        public readonly ConcurrentDictionary<string, Connection> connections = new ConcurrentDictionary<string, Connection>(StringComparer.Ordinal);
    }

    private static string GetUsername(HttpListenerContext ctx) {
        return IPAddress.IsLoopback(ctx.Request.RemoteEndPoint.Address)
            ? "loopback"
            : Auth.GetUsername(ctx.Request.Cookies["sessionid"]?.Value);
    }

    //client assigned, e.g. "d0", "u3"
    private static bool IsValidConnectionId(string id) {
        if (String.IsNullOrEmpty(id) || id.Length > 32) return false;
        for (int i = 0; i < id.Length; i++) {
            char c = id[i];
            if (!char.IsAsciiLetterOrDigit(c) && c != '-' && c != '_') return false;
        }
        return true;
    }

    private static void StopConnections(Session session) {
        foreach (Connection connection in session.connections.Values) {
            try { connection.stop.Cancel(); } catch { }
        }
    }

    internal static async Task WebSocketHandler(HttpListenerContext ctx) {
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

        if (sessions.Count >= MAX_SESSIONS) {
            await WebSocketHelper.WsWriteText(ws, "{\"action\":\"error\",\"error\":\"Too many speed tests are running, try again later.\"}");
            try { await ws.CloseAsync(WebSocketCloseStatus.PolicyViolation, null, CancellationToken.None); } catch { }
            return;
        }

        Session session = new Session { username = GetUsername(ctx) };
        sessions[session.id] = session;

        using SemaphoreSlim writeLock = new SemaphoreSlim(1, 1);

        async Task Send(string message) {
            await writeLock.WaitAsync();
            try {
                await WebSocketHelper.WsWriteText(ws, message);
            }
            finally {
                writeLock.Release();
            }
        }

        try {
            await Send($"{{\"action\":\"session\",\"id\":\"{session.id}\",\"maxSeconds\":{MAX_SECONDS}}}");

            _ = StatsLoop(session, ws, Send);

            byte[] buffer = new byte[1024];
            while (ws.State == WebSocketState.Open) {
                WebSocketReceiveResult result = await ws.ReceiveAsync(new ArraySegment<byte>(buffer), session.closed.Token);

                if (result.MessageType == WebSocketMessageType.Close) {
                    await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, CancellationToken.None);
                    break;
                }

                if (!Auth.IsAuthenticatedAndAuthorized(ctx, ctx.Request.Url.AbsolutePath)) {
                    await ws.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, null, CancellationToken.None);
                    break;
                }

                string action;
                try {
                    using JsonDocument json = JsonDocument.Parse(buffer.AsMemory(0, result.Count));
                    action = json.RootElement.TryGetProperty("action", out JsonElement value) ? value.GetString() : null;
                }
                catch (JsonException) {
                    continue;
                }

                switch (action) {
                case "stop": //ends the transfers in progress
                    StopConnections(session);
                    break;

                case "reset": //a new test, the counters start over
                    StopConnections(session);
                    session.connections.Clear();
                    break;
                }
            }
        }
        catch (WebSocketException) { }
        catch (OperationCanceledException) { }
        catch (Exception ex) {
            Logger.Error(ex);
        }
        finally {
            sessions.TryRemove(session.id, out _);
            StopConnections(session);
            try { session.closed.Cancel(); } catch { }
        }
    }

    //cumulative bytes per connection, the client derives the speed
    private static async Task StatsLoop(Session session, WebSocket ws, Func<string, Task> send) {
        CancellationToken token = session.closed.Token;

        try {
            while (ws.State == WebSocketState.Open && !token.IsCancellationRequested) {
                await Task.Delay(STATS_INTERVAL, token);

                StringBuilder builder = new StringBuilder(256);
                builder.Append("{\"action\":\"stats\",\"t\":");
                builder.Append((long)Stopwatch.GetElapsedTime(session.started).TotalMilliseconds);
                builder.Append(",\"connections\":[");

                bool first = true;
                foreach (Connection connection in session.connections.Values) {
                    if (!first) builder.Append(',');
                    first = false;

                    builder.Append("{\"id\":\"").Append(connection.id).Append('"');
                    builder.Append(",\"dir\":\"").Append(connection.direction == Direction.Down ? "down" : "up").Append('"');
                    builder.Append(",\"bytes\":").Append(Interlocked.Read(ref connection.bytes));
                    builder.Append(",\"active\":").Append(Volatile.Read(ref connection.requests) > 0 ? "true" : "false");
                    builder.Append('}');
                }

                builder.Append("]}");
                await send(builder.ToString());
            }
        }
        catch (OperationCanceledException) { }
        catch (WebSocketException) { }
        catch (Exception ex) {
            Logger.Error(ex);
        }
    }

    //GET is the downstream, POST the upstream
    internal static async Task Handler(HttpListenerContext ctx) {
        ctx.Response.AddHeader("Cache-Control", "no-store");

        Dictionary<string, string> parameters = Listener.ParseQuery(ctx);
        string sessionString = null, connectionId = null;
        parameters?.TryGetValue("session", out sessionString);
        parameters?.TryGetValue("connection", out connectionId);

        Direction direction = ctx.Request.HttpMethod switch {
            "GET"  => Direction.Down,
            "POST" => Direction.Up,
            _      => (Direction)255
        };

        if (!Enum.IsDefined(direction)) {
            Close(ctx, HttpStatusCode.MethodNotAllowed);
            return;
        }

        if (!Guid.TryParse(sessionString, out Guid sessionId) || !IsValidConnectionId(connectionId)) {
            Close(ctx, HttpStatusCode.BadRequest);
            return;
        }

        //only the user who opened the session
        if (!sessions.TryGetValue(sessionId, out Session session) || session.username != GetUsername(ctx)) {
            Close(ctx, HttpStatusCode.NotFound);
            return;
        }

        if (!session.connections.TryGetValue(connectionId, out Connection connection)) {
            if (session.connections.Count >= MAX_CONNECTIONS) {
                Close(ctx, HttpStatusCode.TooManyRequests);
                return;
            }
            connection = session.connections.GetOrAdd(connectionId, id => new Connection { id = id, direction = direction });
        }

        if (connection.direction != direction) {
            Close(ctx, HttpStatusCode.Conflict);
            return;
        }

        TimeSpan remaining = TimeSpan.FromSeconds(MAX_SECONDS) - Stopwatch.GetElapsedTime(connection.started);
        if (remaining <= TimeSpan.Zero || connection.stop.IsCancellationRequested || Interlocked.Read(ref connection.bytes) >= MAX_BYTES) {
            Close(ctx, HttpStatusCode.TooManyRequests);
            return;
        }

        using CancellationTokenSource cts = CancellationTokenSource.CreateLinkedTokenSource(session.closed.Token, connection.stop.Token);
        cts.CancelAfter(remaining);

        //optional, a download without a size streams until the time or byte limit
        long size = MAX_BYTES;
        if (parameters.TryGetValue("size", out string sizeString) && long.TryParse(sizeString, out long requested)) {
            size = Math.Clamp(requested, MIN_WRITE, MAX_BYTES);
        }
        size = Math.Min(size, MAX_BYTES - Interlocked.Read(ref connection.bytes));

        //http.sys reads and writes ignore the token once pending, a stalled client would outlast the limits
        using CancellationTokenRegistration abort = cts.Token.Register(() => {
            try { ctx.Response.Abort(); } catch { }
        });

        Interlocked.Increment(ref connection.requests);
        try {
            if (direction == Direction.Down) {
                await Downstream(ctx, connection, size, cts.Token);
            }
            else {
                await Upstream(ctx, connection, cts.Token);
            }
        }
        catch (OperationCanceledException) { }
        catch (HttpListenerException) { } //the client went away
        catch (IOException) { }
        catch (InvalidDataException) { }   //a multipart body cut short
        catch (ObjectDisposedException) { } //aborted
        catch (Exception ex) {
            Logger.Debug(ex);
        }
        finally {
            Interlocked.Decrement(ref connection.requests);
            abort.Unregister();
            try { ctx.Response.Close(); } catch { }
        }
    }

    private static async Task Downstream(HttpListenerContext ctx, Connection connection, long size, CancellationToken token) {
        ctx.Response.StatusCode = (int)HttpStatusCode.OK;
        ctx.Response.ContentType = "application/octet-stream";

        if (size < MAX_BYTES) {
            ctx.Response.ContentLength64 = size;
        }
        else {
            ctx.Response.SendChunked = true;
        }

        Stream output = ctx.Response.OutputStream;

        long remaining = size;
        int writeSize = MIN_WRITE;
        int offset = 0;

        while (remaining > 0 && !token.IsCancellationRequested) {
            int count = (int)Math.Min(writeSize, remaining);
            if (offset + count > PAYLOAD_SIZE) offset = 0;

            long start = Stopwatch.GetTimestamp();
            await output.WriteAsync(payload.AsMemory(offset, count), token);
            double elapsed = Stopwatch.GetElapsedTime(start).TotalMilliseconds;

            offset += count;
            remaining -= count;
            if (Interlocked.Add(ref connection.bytes, count) >= MAX_BYTES) return;

            //http.sys completes a write once the client acknowledges it, so one write per round trip:
            //larger writes on fast or distant links, smaller ones keep the counter moving on slow links
            if (elapsed < 40 && writeSize < MAX_WRITE) {
                writeSize *= 2;
            }
            else if (elapsed > 160 && writeSize > MIN_WRITE) {
                writeSize /= 2;
            }
        }
    }

    //a multipart file upload counts only the file content, any other body is counted whole
    private static async Task Upstream(HttpListenerContext ctx, Connection connection, CancellationToken token) {
        string boundary = MultipartFileStream.GetBoundary(ctx.Request.ContentType);
        using MultipartFileStream multipart = boundary is null ? null : new MultipartFileStream(ctx.Request.InputStream, boundary, ctx.Request.ContentLength64);
        Stream input = (Stream)multipart ?? ctx.Request.InputStream;
        byte[] buffer = ArrayPool<byte>.Shared.Rent(READ_SIZE);

        try {
            int read;
            while ((read = await input.ReadAsync(buffer.AsMemory(0, READ_SIZE), token)) > 0) {
                if (Interlocked.Add(ref connection.bytes, read) >= MAX_BYTES) break;
            }
        }
        finally {
            ArrayPool<byte>.Shared.Return(buffer);
        }

        ctx.Response.StatusCode = (int)HttpStatusCode.OK;
        ctx.Response.ContentLength64 = 0;
    }

    private static void Close(HttpListenerContext ctx, HttpStatusCode status) {
        try {
            ctx.Response.StatusCode = (int)status;
            ctx.Response.Close();
        }
        catch { }
    }
}

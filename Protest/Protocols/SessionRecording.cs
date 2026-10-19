using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Protest.Http;

namespace Protest.Protocols;

internal sealed class SessionRecording {
    private readonly object writeLock = new object();
    private readonly Stopwatch clock = Stopwatch.StartNew();

    private readonly string directory;
    private readonly string host;
    private readonly int port;
    private readonly string device;
    private readonly string username;
    private readonly DateTime startUtc;

    private const long MAX_PENDING_BYTES = 32 * 1024 * 1024;
    private readonly List<(long offsetMs, byte[] data)> pending = new List<(long, byte[])>();
    private long pendingBytes;

    private FileStream videoFile;

    private bool stopped;

    internal string Id { get; }
    internal string Protocol { get; }

    private SessionRecording(string id, string protocol, string directory, string host, int port, string device, string username) {
        Id = id;
        Protocol = protocol;
        this.directory = directory;
        this.host = host;
        this.port = port;
        this.device = device;
        this.username = username;
        startUtc = DateTime.UtcNow;
    }

    private static readonly Lock settingsMutex = new Lock();

    internal static void Initialize() {
        LoadSettings();
        RecoverOrphanedRecordings();
    }

    private static void RecoverOrphanedRecordings() {
        try {
            DirectoryInfo root = new DirectoryInfo(Data.DIR_RECORDINGS);
            if (!root.Exists) return;

            foreach (DirectoryInfo protoDir in root.GetDirectories()) {
                foreach (DirectoryInfo recDir in protoDir.GetDirectories()) {
                    try {
                        RecoverRecordingIfOrphaned(protoDir, recDir);
                    }
                    catch (Exception ex) {
                        Logger.Error(ex);
                    }
                }
            }
        }
        catch (Exception ex) {
            Logger.Error(ex);
        }
    }

    private static void RecoverRecordingIfOrphaned(DirectoryInfo protoDir, DirectoryInfo recDir) {
        string metaPath = Path.Join(recDir.FullName, "meta.json");
        if (!File.Exists(metaPath)) return;

        using JsonDocument doc = JsonDocument.Parse(File.ReadAllText(metaPath));
        JsonElement root = doc.RootElement;

        if (root.TryGetProperty("end", out JsonElement endEl) && endEl.ValueKind == JsonValueKind.String) {
            return; //already finalized
        }

        if (!root.TryGetProperty("start", out JsonElement startEl) ||
            startEl.ValueKind != JsonValueKind.String ||
            !DateTime.TryParse(startEl.GetString(), null, System.Globalization.DateTimeStyles.AdjustToUniversal | System.Globalization.DateTimeStyles.AssumeUniversal, out DateTime start)) {
            return;
        }

        string videoPath = Path.Join(recDir.FullName, "video.bin");
        long lastOffsetMs = MeasureLastCompleteChunkOffset(videoPath);
        DateTime end = start.AddMilliseconds(lastOffsetMs);

        string id = root.TryGetProperty("id", out JsonElement idEl) && idEl.ValueKind == JsonValueKind.String ? idEl.GetString() : recDir.Name;
        string protocol = root.TryGetProperty("protocol", out JsonElement protoEl) && protoEl.ValueKind == JsonValueKind.String ? protoEl.GetString() : protoDir.Name;
        string host = root.TryGetProperty("host", out JsonElement hostEl) && hostEl.ValueKind == JsonValueKind.String ? hostEl.GetString() : "";
        int port = root.TryGetProperty("port", out JsonElement portEl) && portEl.ValueKind == JsonValueKind.Number ? portEl.GetInt32() : 0;
        string device = root.TryGetProperty("device", out JsonElement deviceEl) && deviceEl.ValueKind == JsonValueKind.String ? deviceEl.GetString() : null;
        string username = root.TryGetProperty("username", out JsonElement userEl) && userEl.ValueKind == JsonValueKind.String ? userEl.GetString() : "";

        StringBuilder builder = new StringBuilder();
        builder.Append('{');
        builder.Append($"\"id\":\"{Data.EscapeJsonText(id)}\",");
        builder.Append($"\"protocol\":\"{Data.EscapeJsonText(protocol)}\",");
        builder.Append($"\"host\":\"{Data.EscapeJsonText(host)}\",");
        builder.Append($"\"port\":{port},");
        builder.Append(device is null ? "\"device\":null," : $"\"device\":\"{Data.EscapeJsonText(device)}\",");
        builder.Append($"\"username\":\"{Data.EscapeJsonText(username)}\",");
        builder.Append($"\"start\":\"{start:yyyy-MM-ddTHH:mm:ssZ}\",");
        builder.Append($"\"end\":\"{end:yyyy-MM-ddTHH:mm:ssZ}\",");
        builder.Append($"\"durationMs\":{lastOffsetMs}");
        builder.Append('}');

        File.WriteAllText(metaPath, builder.ToString());
        Logger.Action("system", "Session recording", $"Recovered interrupted recording {id} ({protocol}) after unclean shutdown, duration {lastOffsetMs}ms");
    }

    //returns the offset (ms) of the last fully-written chunk, stopping at the first truncated one
    private static long MeasureLastCompleteChunkOffset(string videoPath) {
        if (!File.Exists(videoPath)) return 0;

        long lastOffsetMs = 0;

        try {
            using FileStream fs = new FileStream(videoPath, FileMode.Open, FileAccess.Read, FileShare.Read);
            byte[] header = new byte[12];

            while (fs.Position < fs.Length) {
                long chunkStart = fs.Position;
                int read = fs.Read(header, 0, 12);
                if (read < 12) break; //incomplete header

                long offsetMs = BitConverter.ToInt64(header, 0);
                int length = BitConverter.ToInt32(header, 8);

                if (offsetMs < 0 || length < 0 || chunkStart + 12 + length > fs.Length) break; //incomplete/corrupt trailing chunk

                fs.Seek(length, SeekOrigin.Current);
                lastOffsetMs = offsetMs;
            }
        }
        catch (Exception ex) {
            Logger.Error(ex);
        }

        return lastOffsetMs;
    }

    private static void LoadSettings() {
        try {
            if (File.Exists(Data.FILE_SESSION_RECORDING)) {
                string plain = File.ReadAllText(Data.FILE_SESSION_RECORDING);
                using JsonDocument doc = JsonDocument.Parse(plain);
                if (doc.RootElement.TryGetProperty("enable", out JsonElement enableEl)) {
                    Configuration.sessionRecording = enableEl.GetBoolean();
                }
            }
        }
        catch (Exception ex) {
            Logger.Error(ex);
        }
    }

    internal static byte[] GetSettings() {
        return Encoding.UTF8.GetBytes($"{{\"enable\":{(Configuration.sessionRecording ? "true" : "false")}}}");
    }

    internal static byte[] SaveSettings(HttpListenerContext ctx, string origin) {
        using StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding);
        string payload = reader.ReadToEnd();

        if (String.IsNullOrEmpty(payload)) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        try {
            using JsonDocument doc = JsonDocument.Parse(payload);
            bool enable = doc.RootElement.TryGetProperty("enable", out JsonElement enableEl) && enableEl.GetBoolean();

            Configuration.sessionRecording = enable;

            lock (settingsMutex) {
                File.WriteAllText(Data.FILE_SESSION_RECORDING, $"{{\"enable\":{(enable ? "true" : "false")}}}");
            }

            Logger.Action(origin, "Data retention", $"Session recording {(enable ? "enabled" : "disabled")}");

            KeepAlive.Broadcast($"{{\"action\":\"sessionrecording\",\"enable\":{(enable ? "true" : "false")}}}", "/ws/keepalive");

            return Data.CODE_OK.Array;
        }
        catch (Exception ex) {
            Logger.Error(ex);
            return Data.CODE_FAILED.Array;
        }
    }

    internal static SessionRecording Start(string protocol, string host, int port, string device, string username) {
        if (!Configuration.sessionRecording) return null;

        string id = $"{DateTime.UtcNow:yyyyMMddHHmmss}_{Cryptography.RandomStringGenerator(8)}";
        string dir = Path.Join(Data.DIR_RECORDINGS, protocol, id);

        return new SessionRecording(id, protocol, dir, host, port, device, username);
    }

    internal void MarkInteracted() {
        lock (writeLock) {
            if (stopped || videoFile is not null) return;
            Activate();
        }
    }

    private void Activate() {
        try {
            Directory.CreateDirectory(directory);
            videoFile = new FileStream(Path.Join(directory, "video.bin"), FileMode.Create, FileAccess.Write, FileShare.Read);

            WriteMetaFile(null);

            foreach ((long offsetMs, byte[] data) in pending) {
                WriteChunk(videoFile, offsetMs, data, data.Length);
            }
        }
        catch (Exception ex) {
            Logger.Error(ex);

            videoFile?.Dispose();
            videoFile = null;
            stopped = true;
        }
        finally {
            pending.Clear();
            pendingBytes = 0;
        }
    }

    internal void WriteVideo(byte[] buffer, int count) {
        if (stopped || count <= 0) return;

        lock (writeLock) {
            if (stopped) return;

            long offsetMs = clock.ElapsedMilliseconds;

            if (videoFile is null) {
                if (pendingBytes + count <= MAX_PENDING_BYTES) {
                    pending.Add((offsetMs, buffer.AsSpan(0, count).ToArray())); //callers reuse their buffers
                    pendingBytes += count;
                    return;
                }

                //too much output to hold back, and this is no short session: record from here on rather
                //than risk an unrecorded session that the user later takes over
                Activate();
                if (videoFile is null) return;
            }

            WriteChunk(videoFile, offsetMs, buffer, count);
        }
    }

    private static void WriteChunk(FileStream file, long offsetMs, byte[] buffer, int count) {
        Span<byte> header = stackalloc byte[12];
        BitConverter.TryWriteBytes(header[..8], offsetMs);
        BitConverter.TryWriteBytes(header[8..], count);
        file.Write(header);
        file.Write(buffer, 0, count);
    }

    internal void Stop() {
        bool recorded;

        lock (writeLock) {
            if (stopped) return;
            stopped = true;

            recorded = videoFile is not null;

            pending.Clear(); //the user never interacted, nothing is stored
            pendingBytes = 0;

            try { videoFile?.Flush(); videoFile?.Dispose(); }
            catch (Exception ex) { Logger.Debug(ex); }
        }

        if (recorded) {
            WriteMetaFile(DateTime.UtcNow);
        }
    }

    private void WriteMetaFile(DateTime? end) {
        try {
            StringBuilder builder = new StringBuilder();
            builder.Append('{');
            builder.Append($"\"id\":\"{Data.EscapeJsonText(Id)}\",");
            builder.Append($"\"protocol\":\"{Data.EscapeJsonText(Protocol)}\",");
            builder.Append($"\"host\":\"{Data.EscapeJsonText(host)}\",");
            builder.Append($"\"port\":{port},");
            builder.Append(device is null ? "\"device\":null," : $"\"device\":\"{Data.EscapeJsonText(device)}\",");
            builder.Append($"\"username\":\"{Data.EscapeJsonText(username)}\",");
            builder.Append($"\"start\":\"{startUtc:yyyy-MM-ddTHH:mm:ssZ}\",");
            builder.Append(end is null ? "\"end\":null," : $"\"end\":\"{end:yyyy-MM-ddTHH:mm:ssZ}\",");
            builder.Append($"\"durationMs\":{(end is null ? 0 : (long)(end.Value - startUtc).TotalMilliseconds)}");
            builder.Append('}');

            File.WriteAllText(Path.Join(directory, "meta.json"), builder.ToString());
        }
        catch (Exception ex) {
            Logger.Error(ex);
        }
    }

    internal static byte[] ListHandler(HttpListenerContext ctx) {
        Dictionary<string, string> parameters = Listener.ParseQuery(ctx);
        string protocolFilter = parameters is not null && parameters.TryGetValue("protocol", out string p) ? p : null;
        string deviceFilter = parameters is not null && parameters.TryGetValue("device", out string d) ? d : null;

        StringBuilder builder = new StringBuilder();
        builder.Append('[');
        bool first = true;

        try {
            DirectoryInfo root = new DirectoryInfo(Data.DIR_RECORDINGS);
            if (root.Exists) {
                IEnumerable<DirectoryInfo> protocolDirs = protocolFilter is null
                    ? root.GetDirectories()
                    : root.GetDirectories().Where(o => string.Equals(o.Name, protocolFilter, StringComparison.OrdinalIgnoreCase));

                foreach (DirectoryInfo protoDir in protocolDirs) {
                    foreach (DirectoryInfo recDir in protoDir.GetDirectories()) {
                        string metaPath = Path.Join(recDir.FullName, "meta.json");
                        if (!File.Exists(metaPath)) continue;

                        string json;
                        try {
                            json = File.ReadAllText(metaPath);
                        }
                        catch (Exception ex) {
                            Logger.Debug(ex);
                            continue;
                        }

                        if (deviceFilter is not null) {
                            try {
                                using JsonDocument doc = JsonDocument.Parse(json);
                                if (!doc.RootElement.TryGetProperty("device", out JsonElement deviceEl) ||
                                    deviceEl.ValueKind != JsonValueKind.String ||
                                    !string.Equals(deviceEl.GetString(), deviceFilter, StringComparison.Ordinal)) {
                                    continue;
                                }
                            }
                            catch (Exception ex) {
                                Logger.Debug(ex);
                                continue;
                            }
                        }

                        if (!first) builder.Append(',');
                        builder.Append(json);
                        first = false;
                    }
                }
            }
        }
        catch (Exception ex) {
            Logger.Error(ex);
        }

        builder.Append(']');
        return Encoding.UTF8.GetBytes(builder.ToString());
    }

    internal static byte[] MetaHandler(HttpListenerContext ctx) {
        Dictionary<string, string> parameters = Listener.ParseQuery(ctx);
        if (parameters is null ||
            !parameters.TryGetValue("protocol", out string protocol) ||
            !parameters.TryGetValue("id", out string id) ||
            !Data.IsValidFilename(protocol) ||
            !Data.IsValidFilename(id)) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        string dir = Path.Join(Data.DIR_RECORDINGS, protocol, id);
        string metaPath = Path.Join(dir, "meta.json");

        if (!File.Exists(metaPath)) return Data.CODE_NOT_FOUND.Array;

        try {
            return File.ReadAllBytes(metaPath);
        }
        catch (Exception ex) {
            Logger.Error(ex);
            return Data.CODE_FAILED.Array;
        }
    }

    internal static int DeleteOlderThan(int days) {
        days = Math.Max(days, DataRetention.MIN_DAYS);
        int deletedCount = 0;

        try {
            DirectoryInfo root = new DirectoryInfo(Data.DIR_RECORDINGS);
            if (!root.Exists) return 0;

            DateTime cutoff = DateTime.UtcNow.AddDays(-days);

            foreach (DirectoryInfo protoDir in root.GetDirectories()) {
                foreach (DirectoryInfo recDir in protoDir.GetDirectories()) {
                    DateTime reference = recDir.CreationTimeUtc;
                    string metaPath = Path.Join(recDir.FullName, "meta.json");

                    if (File.Exists(metaPath)) {
                        try {
                            using JsonDocument doc = JsonDocument.Parse(File.ReadAllText(metaPath));

                            if (doc.RootElement.TryGetProperty("end", out JsonElement endEl) &&
                                endEl.ValueKind == JsonValueKind.String &&
                                DateTime.TryParse(endEl.GetString(), null, System.Globalization.DateTimeStyles.AdjustToUniversal | System.Globalization.DateTimeStyles.AssumeUniversal, out DateTime endParsed)) {
                                reference = endParsed;
                            }
                            else if (doc.RootElement.TryGetProperty("start", out JsonElement startEl) &&
                                startEl.ValueKind == JsonValueKind.String &&
                                DateTime.TryParse(startEl.GetString(), null, System.Globalization.DateTimeStyles.AdjustToUniversal | System.Globalization.DateTimeStyles.AssumeUniversal, out DateTime startParsed)) {
                                reference = startParsed;
                            }
                        }
                        catch (Exception ex) {
                            Logger.Debug(ex);
                        }
                    }

                    if (reference >= cutoff) continue;

                    try {
                        Directory.Delete(recDir.FullName, true);
                        deletedCount++;
                    }
                    catch (Exception ex) {
                        Logger.Error(ex);
                    }
                }
            }
        }
        catch (Exception ex) {
            Logger.Error(ex);
        }

        return deletedCount;
    }


    internal static async Task PlaybackWebSocketHandler(HttpListenerContext ctx) {
        if (!Auth.IsAuthenticatedAndAuthorized(ctx, ctx.Request.Url.AbsolutePath)) {
            ctx.Response.Close();
            return;
        }

        string protocol = ctx.Request.QueryString["protocol"];
        string id = ctx.Request.QueryString["id"];

        if (!Data.IsValidFilename(protocol) || !Data.IsValidFilename(id)) {
            ctx.Response.StatusCode = 400;
            ctx.Response.Close();
            return;
        }

        string videoPath = Path.Join(Data.DIR_RECORDINGS, protocol, id, "video.bin");
        if (!File.Exists(videoPath)) {
            ctx.Response.StatusCode = 404;
            ctx.Response.Close();
            return;
        }

        double startMs = 0;
        if (double.TryParse(ctx.Request.QueryString["t"], System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out double parsedStart) && parsedStart > 0) {
            startMs = parsedStart;
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

        using CancellationTokenSource cts = new CancellationTokenSource();

        try {
            if (String.Equals(protocol, "rdp", StringComparison.Ordinal)) {
                await RdpPlayback(ctx, ws, videoPath, startMs, cts);
            }
            else {
                PlaybackState state = new PlaybackState(startMs);

                Task sender = SendLoop(ws, videoPath, state, startMs, 0, null, cts);
                Task receiver = ControlLoop(ws, state, cts);

                await Task.WhenAny(sender, receiver);
            }

            cts.Cancel();
        }
        finally {
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

    private sealed record RdpPlaybackControl(PlaybackState State, CancellationTokenSource Cts, WebSocket Socket);

    //IronRDP opens its own WebSocket for the recorded stream, so the player paces it through a second, control connection,
    //which also tells it when the desktop is resized. Both carry the same key and the control connection is opened first.
    //The first chunk of an RDP recording is the RDCleanPath response that answers the player's request.
    private static readonly ConcurrentDictionary<string, RdpPlaybackControl> rdpPlaybackControls = new ConcurrentDictionary<string, RdpPlaybackControl>();

    private static async Task RdpPlayback(HttpListenerContext ctx, WebSocket ws, string videoPath, double startMs, CancellationTokenSource cts) {
        string key = ctx.Request.QueryString["key"];
        if (String.IsNullOrEmpty(key) || key.Length > 64) return;

        if (ctx.Request.QueryString["control"] == "1") {
            PlaybackState state = new PlaybackState(startMs);
            if (!rdpPlaybackControls.TryAdd(key, new RdpPlaybackControl(state, cts, ws))) return;

            try {
                await ControlLoop(ws, state, cts);
            }
            finally {
                rdpPlaybackControls.TryRemove(key, out _);
            }
            return;
        }

        RdpPlaybackControl control = null;
        for (int i = 0; i < 100 && !rdpPlaybackControls.TryGetValue(key, out control); i++) {
            await Task.Delay(50);
        }
        if (control is null) return;

        //the stream ends along with its control connection
        CancellationTokenRegistration registration;
        try {
            registration = control.Cts.Token.Register(() => cts.Cancel());
        }
        catch (ObjectDisposedException) {
            return;
        }

        using (registration) {
            (byte[] request, _) = await Rdp.ReceivePdu(ws, cts.Token);
            if (request is null) return;

            byte[] handshake = await ReadFirstChunk(videoPath, cts.Token);
            if (handshake is null) return;

            await ws.SendAsync(new ArraySegment<byte>(handshake), WebSocketMessageType.Binary, true, cts.Token);

            //IronRDP resizes its canvas only for resizes it asked for, the player resizes it ahead of a recorded one
            Rdp.DesktopSizeScanner scanner = new Rdp.DesktopSizeScanner();
            Rdp.PlaybackFilter filter = new Rdp.PlaybackFilter(await GetLargestDesktopSize(videoPath, cts.Token));

            async Task<byte[]> BeforeSend(byte[] payload) {
                List<(int width, int height)> sizes = scanner.Scan(payload);
                if (sizes is not null) {
                    (int width, int height) = sizes[^1];
                    await WebSocketHelper.WsWriteText(control.Socket, $"{{\"event\":\"resize\",\"width\":{width},\"height\":{height}}}");
                    await Task.Delay(50, cts.Token);
                }

                return filter.Filter(payload);
            }

            Task<bool> sender = SendLoop(ws, videoPath, control.State, startMs, 1, BeforeSend, cts);
            Task drain = DrainLoop(ws, cts);

            //the stream is cut at the end as well, the player tells the end from a failure by this event, sent before the cut
            if (await Task.WhenAny(sender, drain) == sender && await sender) {
                try {
                    await WebSocketHelper.WsWriteText(control.Socket, "{\"event\":\"end\"}");
                }
                catch (Exception ex) {
                    Logger.Debug(ex);
                }
            }
        }
    }

    //The widest and the tallest desktop an RDP recording switches to, the player's drawing surface has to fit them all.
    private static async Task<(int width, int height)?> GetLargestDesktopSize(string videoPath, CancellationToken token) {
        Rdp.DesktopSizeScanner scanner = new Rdp.DesktopSizeScanner();
        int width = 0, height = 0;

        using FileStream fs = new FileStream(videoPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
        byte[] header = new byte[12];

        for (int chunk = 0; await ReadExactAsync(fs, header, 12, token) == 12; chunk++) {
            int length = BitConverter.ToInt32(header, 8);
            if (length < 0) break;

            byte[] payload = new byte[length];
            if (await ReadExactAsync(fs, payload, length, token) < length) break;
            if (chunk == 0) continue; //the RDCleanPath response

            List<(int width, int height)> sizes = scanner.Scan(payload);
            if (sizes is null) continue;

            foreach ((int w, int h) in sizes) {
                width = Math.Max(width, w);
                height = Math.Max(height, h);
            }
        }

        return width > 0 && height > 0 ? (width, height) : null;
    }

    private static async Task<byte[]> ReadFirstChunk(string videoPath, CancellationToken token) {
        using FileStream fs = new FileStream(videoPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);

        byte[] header = new byte[12];
        if (await ReadExactAsync(fs, header, 12, token) < 12) return null;

        int length = BitConverter.ToInt32(header, 8);
        if (length <= 0 || length > 1_048_576) return null;

        byte[] payload = new byte[length];
        return await ReadExactAsync(fs, payload, length, token) < length ? null : payload;
    }

    //Discards what the player sends, its input never reaches anything.
    private static async Task DrainLoop(WebSocket ws, CancellationTokenSource cts) {
        try {
            while (ws.State == WebSocketState.Open && !cts.IsCancellationRequested) {
                byte[] message = await WebSocketHelper.WsReadBinary(ws, cts.Token, 16_384);
                if (message is null) return; //close frame received
            }
        }
        catch (OperationCanceledException) { }
        catch (WebSocketException) { }
        finally {
            cts.Cancel();
        }
    }

    private static async Task ControlLoop(WebSocket ws, PlaybackState state, CancellationTokenSource cts) {
        try {
            while (ws.State == WebSocketState.Open && !cts.IsCancellationRequested) {
                string message = await WebSocketHelper.WsReadText(ws, cts.Token);
                if (message is null) return; //close frame received
                state.ApplyCommand(message);
            }
        }
        catch (OperationCanceledException) { }
        catch (WebSocketException) { }
        finally {
            cts.Cancel();
        }
    }

    //beforeSend sees each chunk before it goes out and returns what to send instead, nothing when empty.
    //Returns true once the last chunk is out, the connection is then left for the caller to end.
    private static async Task<bool> SendLoop(WebSocket ws, string videoPath, PlaybackState state, double startMs, int skipChunks, Func<byte[], Task<byte[]>> beforeSend, CancellationTokenSource cts) {
        bool ended = false;

        try {
            using FileStream fs = new FileStream(videoPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
            byte[] header = new byte[12];

            for (int i = 0; i < skipChunks; i++) {
                if (fs.Read(header, 0, 12) < 12) return false;
                fs.Seek(BitConverter.ToInt32(header, 8), SeekOrigin.Current);
            }

            //RFB's framebuffer updates, like RDP's, are incremental (no keyframes), so a seek is handled by the client
            //opening a brand new connection (and a brand new decoder) with the desired start time here:
            //replaying everything up to startMs back-to-back, unthrottled, lets a fresh decoder reconstruct
            //the exact screen state at that point, exactly as if it had been connected from the beginning.
            while (startMs > 0 && fs.Position < fs.Length) {
                long savedPos = fs.Position;
                if (fs.Read(header, 0, 12) < 12) break;

                long offsetMs = BitConverter.ToInt64(header, 0);
                int length = BitConverter.ToInt32(header, 8);
                byte[] payload = new byte[length];
                int readCount = await ReadExactAsync(fs, payload, length, cts.Token);
                if (readCount < length) break;

                if (offsetMs > startMs) {
                    fs.Position = savedPos; //rewind so this chunk is (re)sent by the normal paced loop below
                    break;
                }

                if (beforeSend is not null) payload = await beforeSend(payload);
                if (payload.Length > 0) {
                    await ws.SendAsync(new ArraySegment<byte>(payload), WebSocketMessageType.Binary, true, cts.Token);
                }

                if (ws.State != WebSocketState.Open || cts.IsCancellationRequested) return false;
            }

            long? pendingOffset = null;
            byte[] pendingPayload = null;

            while (ws.State == WebSocketState.Open && !cts.IsCancellationRequested) {
                if (pendingPayload is null) {
                    //nothing more to stream, a chunk cut short by an unclean shutdown ends it too;
                    //the client reconnects (with a start offset) to seek elsewhere
                    if (fs.Position >= fs.Length || fs.Read(header, 0, 12) < 12) {
                        ended = true;
                        break;
                    }

                    long offsetMs = BitConverter.ToInt64(header, 0);
                    int length = BitConverter.ToInt32(header, 8);
                    byte[] payload = new byte[length];
                    int readCount = await ReadExactAsync(fs, payload, length, cts.Token);
                    if (readCount < length) {
                        ended = true;
                        break;
                    }

                    pendingOffset = offsetMs;
                    pendingPayload = payload;
                }

                double virtualNow = state.CurrentVirtualTime(out bool playing);

                if (playing && virtualNow >= pendingOffset.Value) {
                    if (beforeSend is not null) pendingPayload = await beforeSend(pendingPayload);
                    if (pendingPayload.Length > 0) {
                        await ws.SendAsync(new ArraySegment<byte>(pendingPayload), WebSocketMessageType.Binary, true, cts.Token);
                    }
                    pendingOffset = null;
                    pendingPayload = null;
                }
                else {
                    await Task.Delay(30, cts.Token);
                }
            }
        }
        catch (OperationCanceledException) { }
        catch (WebSocketException) { }
        catch (IOException) { }
        finally {
            if (!ended) cts.Cancel();
        }

        return ended;
    }

    private static async Task<int> ReadExactAsync(FileStream fs, byte[] buffer, int count, CancellationToken token) {
        int total = 0;
        while (total < count) {
            int read = await fs.ReadAsync(buffer.AsMemory(total, count - total), token);
            if (read == 0) break;
            total += read;
        }
        return total;
    }

    private sealed class PlaybackState {
        private readonly object gate = new object();
        private readonly Stopwatch sw = Stopwatch.StartNew();

        private bool playing = true;
        private double speed = 1.0;
        private double baseOffsetMs;

        internal PlaybackState(double startMs) {
            baseOffsetMs = startMs;
        }

        private double CurrentUnlocked() => playing ? baseOffsetMs + sw.Elapsed.TotalMilliseconds * speed : baseOffsetMs;

        internal double CurrentVirtualTime(out bool isPlaying) {
            lock (gate) {
                isPlaying = playing;
                return CurrentUnlocked();
            }
        }

        internal void ApplyCommand(string json) {
            try {
                using JsonDocument doc = JsonDocument.Parse(json);
                if (!doc.RootElement.TryGetProperty("cmd", out JsonElement cmdEl)) return;
                string cmd = cmdEl.GetString();

                lock (gate) {
                    switch (cmd) {
                    case "play":
                        if (!playing) {
                            playing = true;
                            sw.Restart();
                        }
                        break;

                    case "pause":
                        if (playing) {
                            baseOffsetMs = CurrentUnlocked();
                            playing = false;
                        }
                        break;

                    case "speed":
                        if (doc.RootElement.TryGetProperty("x", out JsonElement xEl)) {
                            baseOffsetMs = CurrentUnlocked();
                            if (playing) sw.Restart();
                            double x = xEl.GetDouble();
                            speed = x > 0 ? x : 1.0;
                        }
                        break;
                    }
                }
            }
            catch (Exception ex) {
                Logger.Debug(ex);
            }
        }
    }
}

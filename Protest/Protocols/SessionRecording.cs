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
    private static Timer purgeTimer;

    private readonly object writeLock = new object();
    private readonly Stopwatch clock = Stopwatch.StartNew();

    private readonly string directory;
    private readonly string host;
    private readonly int port;
    private readonly string device;
    private readonly string username;
    private readonly DateTime startUtc;

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

    internal static void Initialize() {
        PurgeExpired();
        purgeTimer = new Timer(_ => PurgeExpired(), null, TimeSpan.FromHours(24), TimeSpan.FromHours(24));
    }

    internal static SessionRecording Start(string protocol, string host, int port, string device, string username) {
        if (!Configuration.sessionRecording) return null;

        try {
            string id = $"{DateTime.UtcNow:yyyyMMddHHmmss}_{Cryptography.RandomStringGenerator(8)}";
            string dir = Path.Join(Data.DIR_RECORDINGS, protocol, id);
            Directory.CreateDirectory(dir);

            SessionRecording recording = new SessionRecording(id, protocol, dir, host, port, device, username);

            recording.videoFile = new FileStream(Path.Join(dir, "video.bin"), FileMode.Create, FileAccess.Write, FileShare.Read);

            recording.WriteMetaFile(null);

            return recording;
        }
        catch (Exception ex) {
            Logger.Error(ex);
            return null;
        }
    }

    internal void WriteVideo(byte[] buffer, int count) {
        if (stopped || count <= 0) return;

        lock (writeLock) {
            if (stopped) return;
            WriteChunk(videoFile, clock.ElapsedMilliseconds, buffer, count);
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
        lock (writeLock) {
            if (stopped) return;
            stopped = true;

            try { videoFile?.Flush(); videoFile?.Dispose(); }
            catch (Exception ex) { Logger.Debug(ex); }
        }

        WriteMetaFile(DateTime.UtcNow);
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
            string.IsNullOrEmpty(protocol) ||
            string.IsNullOrEmpty(id) ||
            protocol.Contains("..") ||
            id.Contains("..")) {
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

    internal static void PurgeExpired() {
        try {
            DirectoryInfo root = new DirectoryInfo(Data.DIR_RECORDINGS);
            if (!root.Exists) return;

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
                }
            }
        }
        catch (Exception ex) {
            Logger.Error(ex);
        }
    }

    internal static async Task PlaybackWebSocketHandler(HttpListenerContext ctx) {
        if (!Auth.IsAuthenticatedAndAuthorized(ctx, ctx.Request.Url.AbsolutePath)) {
            ctx.Response.Close();
            return;
        }

        string protocol = ctx.Request.QueryString["protocol"];
        string id = ctx.Request.QueryString["id"];

        if (string.IsNullOrEmpty(protocol) || string.IsNullOrEmpty(id) || protocol.Contains("..") || id.Contains("..")) {
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
        PlaybackState state = new PlaybackState(startMs);

        try {
            Task sender = SendLoop(ws, videoPath, state, startMs, cts);
            Task receiver = ControlLoop(ws, state, cts);

            await Task.WhenAny(sender, receiver);
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

    private static async Task SendLoop(WebSocket ws, string videoPath, PlaybackState state, double startMs, CancellationTokenSource cts) {
        try {
            using FileStream fs = new FileStream(videoPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
            byte[] header = new byte[12];

            //RFB's framebuffer updates are incremental (no keyframes), so a seek is handled by the client
            //opening a brand new connection (and a brand new RFB instance) with the desired start time here:
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

                await ws.SendAsync(new ArraySegment<byte>(payload), WebSocketMessageType.Binary, true, cts.Token);

                if (ws.State != WebSocketState.Open || cts.IsCancellationRequested) return;
            }

            long? pendingOffset = null;
            byte[] pendingPayload = null;

            while (ws.State == WebSocketState.Open && !cts.IsCancellationRequested) {
                if (pendingPayload is null) {
                    if (fs.Position >= fs.Length) {
                        return; //nothing more to stream; the client reconnects (with a start offset) to seek elsewhere
                    }

                    int read = fs.Read(header, 0, 12);
                    if (read < 12) break;

                    long offsetMs = BitConverter.ToInt64(header, 0);
                    int length = BitConverter.ToInt32(header, 8);
                    byte[] payload = new byte[length];
                    int readCount = await ReadExactAsync(fs, payload, length, cts.Token);
                    if (readCount < length) break;

                    pendingOffset = offsetMs;
                    pendingPayload = payload;
                }

                double virtualNow = state.CurrentVirtualTime(out bool playing);

                if (playing && virtualNow >= pendingOffset.Value) {
                    await ws.SendAsync(new ArraySegment<byte>(pendingPayload), WebSocketMessageType.Binary, true, cts.Token);
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
            cts.Cancel();
        }
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

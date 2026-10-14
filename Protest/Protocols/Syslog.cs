using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Net;
using System.Net.Security;
using System.Net.Sockets;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Channels;
using System.Threading.Tasks;
using Protest.Http;
using Protest.Tools;

namespace Protest.Protocols;

internal static partial class Syslog {
    private const int    MAX_MESSAGE_LENGTH  = 8_192;
    private const int    MAX_FRAME_LENGTH    = 65_536;
    private const int    MAX_TCP_CLIENTS     = 256;
    private const int    MAX_LIVE_QUEUE      = 5_000;
    private const int    MAX_LIVE_BATCH      = 1_000;
    private const int    MAX_EMAIL_LINES     = 100;
    private const int    MAX_PAGE_LINES      = 2_000;
    private const long   MAX_PAGE_SCAN_BYTES = 256L * 1024 * 1024;
    private const int    EMAIL_INTERVAL      = 60; //seconds
    private const int    MAX_UNKNOWN_SENDERS = 1_024;
    private const int    UNKNOWN_INTERVAL    = 600; //seconds
    private const string TIMESTAMP_FORMAT    = "yyyy-MM-dd HH:mm:ss.fff";
    private const int    TIMESTAMP_LENGTH    = 23;
    private const sbyte  OFF                 = -1;

    private static readonly Lock mutex = new Lock();
    private static readonly Lock consoleMutex = new Lock();

    private static readonly string DEFAULT = """
    [{
        "enabled"    : false,
        "guid"       : "00000000-0000-0000-0000-000000000001",
        "name"       : "Syslog over TLS",
        "protocol"   : 3,
        "bindAddress": "0.0.0.0",
        "port"       : 6514,
        "console"    : -1,
        "disk"       : 7,
        "email"      : -1,
        "live"       : 7,
        "accept"     : 0
    }]
    """;

    internal enum Severity : byte {
        Emergency = 0,
        Alert = 1,
        Critical = 2,
        Error = 3,
        Warning = 4,
        Notice = 5,
        Informational = 6,
        Debug = 7
    }

    internal enum TransportProtocol : byte { UDP=1, TCP=2, TLS=3 }

    internal enum AcceptMode : byte { AllDevices=0, Whitelist=1 }

    internal sealed class SyslogListener {
        public bool enabled;
        public Guid guid;
        public string name = String.Empty;
        public TransportProtocol protocol;
        public string bindAddress = "0.0.0.0";
        public ushort port;
        public string certificate;
        public string password;

        //minimum severity that triggers each action, -1 is off
        public sbyte console = OFF;
        public sbyte disk    = (sbyte)Severity.Debug;
        public sbyte email   = OFF;
        public sbyte live    = (sbyte)Severity.Debug;

        public Guid smtpProfile;
        public string[] recipients = [];

        public AcceptMode accept = AcceptMode.AllDevices;
        public string[] devices = []; //device files
    }

    private sealed class Runner {
        public volatile SyslogListener config;
        public volatile HashSet<string> whitelist;
        public readonly CancellationTokenSource cts = new CancellationTokenSource();
        public UdpClient udp;
        public TcpListener tcp;
        public X509Certificate2 certificate;
        public int clients;

        public readonly ConcurrentQueue<EmailItem> emailQueue = new ConcurrentQueue<EmailItem>();
        public int emailCount;
        public int emailOverflow;
        public int emailSending;
        public long lastEmail;

        public readonly Lock unknownMutex = new Lock();
        public readonly Dictionary<IPAddress, long> unknownSenders = new Dictionary<IPAddress, long>();
        public long unknownReset;

        public Runner(SyslogListener config) {
            Apply(config);
        }

        public void Apply(SyslogListener config) {
            this.whitelist = new HashSet<string>(config.devices ?? [], StringComparer.Ordinal);
            this.config = config;
        }

        public void Dispose() {
            try { cts.Cancel(); } catch { }
            try { udp?.Dispose(); } catch { }
            try { tcp?.Stop(); } catch { }
            try { certificate?.Dispose(); } catch { }
        }
    }

    private sealed record EmailItem(DateTime time, string file, IPAddress remote, Message message);
    private readonly record struct DiskEntry(string file, string date, string line);

    internal static readonly ConcurrentDictionary<Guid, SyslogListener> listeners = new ConcurrentDictionary<Guid, SyslogListener>();
    private static readonly ConcurrentDictionary<Guid, Runner> running = new ConcurrentDictionary<Guid, Runner>();
    private static readonly ConcurrentDictionary<Guid, string> errors = new ConcurrentDictionary<Guid, string>();

    private static readonly Channel<DiskEntry> diskChannel = Channel.CreateBounded<DiskEntry>(new BoundedChannelOptions(100_000) {
        FullMode = BoundedChannelFullMode.DropWrite,
        SingleReader = true
    });

    private static readonly ConcurrentQueue<string> liveQueue = new ConcurrentQueue<string>();
    private static int liveCount;
    private static int liveFlushing;

    private static readonly JsonWriterOptions jsonWriterOptions = new JsonWriterOptions {
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping
    };

    //referenced so they are not collected
    private static Timer liveTimer;
    private static Timer emailTimer;

    internal static void Initialize() {
        liveTimer  = new Timer(_ => FlushLive(), null, 250, 250);
        emailTimer = new Timer(_ => FlushEmails(), null, 2_000, 2_000);
        _ = Task.Run(DiskWriterLoop);

        Reconcile(Load());
    }

    internal static SyslogListener[] Load() {
        SyslogListener[] loaded;

        try {
            if (File.Exists(Data.FILE_SYSLOG_LISTENERS)) {
                byte[] bytes;
                lock (mutex) {
                    bytes = File.ReadAllBytes(Data.FILE_SYSLOG_LISTENERS);
                }

                byte[] plain = Cryptography.Decrypt(bytes, Configuration.DB_KEY, Configuration.DB_KEY_IV);
                loaded = JsonSerializer.Deserialize(plain, SyslogJsonContext.Default.SyslogListenerArray);
            }
            else {
                loaded = JsonSerializer.Deserialize(DEFAULT, SyslogJsonContext.Default.SyslogListenerArray);
            }
        }
        catch (Exception ex) {
            Logger.Error(ex);
            return Array.Empty<SyslogListener>();
        }

        if (loaded is null) return Array.Empty<SyslogListener>();
        return loaded.Where(o => o is not null && Normalize(o)).ToArray();
    }

    internal static byte[] List() {
        SyslogListener[] array = listeners.Values.OrderBy(o => o.port).ThenBy(o => o.guid).ToArray();

        using MemoryStream ms = new MemoryStream();
        using (Utf8JsonWriter writer = new Utf8JsonWriter(ms, jsonWriterOptions)) {
            writer.WriteStartArray();
            for (int i = 0; i < array.Length; i++) {
                SyslogListener o = array[i];
                running.TryGetValue(o.guid, out Runner runner);
                errors.TryGetValue(o.guid, out string error);

                writer.WriteStartObject();
                writer.WriteBoolean("enabled",       o.enabled);
                writer.WriteString("guid",           o.guid);
                writer.WriteString("name",           o.name);
                writer.WriteNumber("protocol",       (byte)o.protocol);
                writer.WriteString("bindAddress",    o.bindAddress);
                writer.WriteNumber("port",           o.port);
                writer.WriteString("certificate",    o.certificate);
                writer.WriteBoolean("hasPassword",   !String.IsNullOrEmpty(o.password));
                writer.WriteNumber("console",        o.console);
                writer.WriteNumber("disk",           o.disk);
                writer.WriteNumber("email",          o.email);
                writer.WriteNumber("live",           o.live);
                writer.WriteString("smtpProfile",    o.smtpProfile);

                writer.WriteStartArray("recipients");
                for (int j = 0; j < o.recipients.Length; j++) writer.WriteStringValue(o.recipients[j]);
                writer.WriteEndArray();

                writer.WriteNumber("accept",         (byte)o.accept);

                writer.WriteStartArray("devices");
                for (int j = 0; j < o.devices.Length; j++) writer.WriteStringValue(o.devices[j]);
                writer.WriteEndArray();

                writer.WriteBoolean("running",       runner is not null);
                writer.WriteNumber("clients",        runner is null ? 0 : Volatile.Read(ref runner.clients));
                writer.WriteString("error",          error);
                writer.WriteEndObject();
            }
            writer.WriteEndArray();
        }

        return ms.ToArray();
    }

    internal static byte[] Save(HttpListenerContext ctx, string origin) {
        using StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding);
        string payload = reader.ReadToEnd();

        try {
            SyslogListener[] incoming = JsonSerializer.Deserialize(payload, SyslogJsonContext.Default.SyslogListenerArray);
            if (incoming is null) return Data.CODE_INVALID_ARGUMENT.Array;

            for (int i = 0; i < incoming.Length; i++) {
                if (incoming[i] is null || !Normalize(incoming[i])) {
                    return Data.CODE_INVALID_ARGUMENT.Array;
                }

                //an empty password keeps the stored one
                if (String.IsNullOrEmpty(incoming[i].password)
                    && listeners.TryGetValue(incoming[i].guid, out SyslogListener existing)) {
                    incoming[i].password = existing.password;
                }
            }

            byte[] plain = JsonSerializer.SerializeToUtf8Bytes(incoming, SyslogJsonContext.Default.SyslogListenerArray);
            byte[] cipher = Cryptography.Encrypt(plain, Configuration.DB_KEY, Configuration.DB_KEY_IV);
            lock (mutex) {
                File.WriteAllBytes(Data.FILE_SYSLOG_LISTENERS, cipher);
            }

            Reconcile(incoming);

            Logger.Action(origin, "Environment", "Modify syslog configuration");
            KeepAlive.Broadcast("{\"action\":\"syslog-listeners\"}"u8.ToArray(), "/syslog/listeners/list");
        }
        catch (JsonException) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }
        catch (Exception ex) {
            Logger.Error(ex);
            return Data.CODE_FAILED.Array;
        }

        return List();
    }

    private static bool Normalize(SyslogListener listener) {
        if (listener.guid == Guid.Empty) listener.guid = Guid.NewGuid();
        if (!Enum.IsDefined(listener.protocol)) return false;
        if (listener.port == 0) return false;

        listener.name = listener.name?.Trim() ?? String.Empty;
        listener.bindAddress = String.IsNullOrWhiteSpace(listener.bindAddress) ? "0.0.0.0" : listener.bindAddress.Trim();
        if (!IPAddress.TryParse(listener.bindAddress, out _)) return false;

        listener.certificate = String.IsNullOrWhiteSpace(listener.certificate) ? null : Path.GetFileName(listener.certificate.Trim());

        listener.console = Math.Clamp(listener.console, OFF, (sbyte)Severity.Debug);
        listener.disk    = Math.Clamp(listener.disk,    OFF, (sbyte)Severity.Debug);
        listener.email   = Math.Clamp(listener.email,   OFF, (sbyte)Severity.Warning); //no emails for notice, info and debug
        listener.live    = Math.Clamp(listener.live,    OFF, (sbyte)Severity.Debug);

        listener.recipients = (listener.recipients ?? [])
            .Where(o => !String.IsNullOrWhiteSpace(o))
            .Select(o => o.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        if (!Enum.IsDefined(listener.accept)) listener.accept = AcceptMode.AllDevices;

        listener.devices = (listener.devices ?? [])
            .Where(IsValidFile)
            .Distinct(StringComparer.Ordinal)
            .ToArray();

        return true;
    }

    private static bool IsValidFile(string file) {
        return !String.IsNullOrEmpty(file)
            && file.IndexOfAny(Path.GetInvalidFileNameChars()) < 0
            && file != "." && file != "..";
    }

    //starts, stops, restarts or updates the running listeners to match the given configuration
    private static void Reconcile(SyslogListener[] configuration) {
        lock (mutex) {
            Dictionary<Guid, SyslogListener> next = new Dictionary<Guid, SyslogListener>();
            for (int i = 0; i < configuration.Length; i++) {
                next[configuration[i].guid] = configuration[i];
            }

            foreach (KeyValuePair<Guid, Runner> pair in running) {
                if (next.TryGetValue(pair.Key, out SyslogListener listener)
                    && listener.enabled
                    && IsSameEndpoint(pair.Value.config, listener)) {
                    pair.Value.Apply(listener);
                    continue;
                }

                StopListener(pair.Key);
            }

            listeners.Clear();
            foreach (SyslogListener listener in next.Values) {
                listeners[listener.guid] = listener;
            }

            foreach (Guid guid in errors.Keys) {
                if (!next.TryGetValue(guid, out SyslogListener listener) || !listener.enabled) {
                    errors.TryRemove(guid, out _);
                }
            }

            foreach (SyslogListener listener in next.Values) {
                if (listener.enabled && !running.ContainsKey(listener.guid)) {
                    StartListener(listener);
                }
            }
        }
    }

    private static bool IsSameEndpoint(SyslogListener a, SyslogListener b) {
        return a.protocol == b.protocol
            && a.port == b.port
            && a.bindAddress == b.bindAddress
            && a.certificate == b.certificate
            && a.password == b.password;
    }

    //called by Reconcile, while holding the mutex
    private static bool StartListener(SyslogListener listener) {
        if (running.ContainsKey(listener.guid)) return true;

        Runner runner = new Runner(listener);

        try {
            IPAddress address = IPAddress.Parse(listener.bindAddress);
            IPEndPoint endpoint = new IPEndPoint(address, listener.port);

            switch (listener.protocol) {
            case TransportProtocol.UDP:
                runner.udp = new UdpClient(address.AddressFamily);
                if (address.Equals(IPAddress.IPv6Any)) runner.udp.Client.DualMode = true;
                runner.udp.Client.ReceiveBufferSize = 4 * 1024 * 1024;
                runner.udp.Client.Bind(endpoint);
                _ = Task.Run(() => UdpLoop(runner));
                break;

            case TransportProtocol.TCP:
            case TransportProtocol.TLS:
                if (listener.protocol == TransportProtocol.TLS) {
                    if (String.IsNullOrEmpty(listener.certificate)) {
                        throw new InvalidOperationException("A certificate is required for TLS");
                    }

                    string path = Path.Join(Data.DIR_CERTIFICATES, listener.certificate);
                    if (!File.Exists(path)) {
                        throw new FileNotFoundException($"Certificate not found: {listener.certificate}");
                    }

                    runner.certificate = X509CertificateLoader.LoadPkcs12FromFile(path, listener.password);
                    if (!runner.certificate.HasPrivateKey) {
                        throw new InvalidOperationException("The certificate has no private key");
                    }
                }

                runner.tcp = new TcpListener(endpoint);
                if (address.Equals(IPAddress.IPv6Any)) runner.tcp.Server.DualMode = true;
                runner.tcp.Start();
                _ = Task.Run(() => TcpLoop(runner));
                break;
            }

            running[listener.guid] = runner;
            errors.TryRemove(listener.guid, out _);
            return true;
        }
        catch (Exception ex) {
            runner.Dispose();
            errors[listener.guid] = ex.Message;
            Logger.Error($"Failed to start syslog listener {listener.protocol} {listener.bindAddress}:{listener.port}: {ex.Message}");
            return false;
        }
    }

    //called by Reconcile, while holding the mutex
    private static void StopListener(Guid guid) {
        if (running.TryRemove(guid, out Runner runner)) {
            runner.Dispose();
        }
    }

    private static async Task UdpLoop(Runner runner) {
        CancellationToken token = runner.cts.Token;

        while (!token.IsCancellationRequested) {
            UdpReceiveResult result;
            try {
                result = await runner.udp.ReceiveAsync(token);
            }
            catch (OperationCanceledException) { break; }
            catch (ObjectDisposedException) { break; }
            catch (SocketException) {
                if (token.IsCancellationRequested) break;
                continue;
            }

            try {
                Receive(runner, SenderIndex.NormalizeAddress(result.RemoteEndPoint.Address), result.Buffer, 0, result.Buffer.Length);
            }
            catch (Exception ex) {
                Logger.Error(ex);
            }
        }
    }

    private static async Task TcpLoop(Runner runner) {
        CancellationToken token = runner.cts.Token;

        while (!token.IsCancellationRequested) {
            TcpClient client;
            try {
                client = await runner.tcp.AcceptTcpClientAsync(token);
            }
            catch (OperationCanceledException) { break; }
            catch (ObjectDisposedException) { break; }
            catch (SocketException) {
                if (token.IsCancellationRequested) break;
                continue;
            }

            //the sender is resolved per message, a connection may come through a nat
            IPAddress remote = SenderIndex.NormalizeAddress(((IPEndPoint)client.Client.RemoteEndPoint).Address);

            if (Interlocked.Increment(ref runner.clients) > MAX_TCP_CLIENTS) {
                Interlocked.Decrement(ref runner.clients);
                client.Dispose();
                continue;
            }

            _ = Task.Run(() => ServeClient(runner, client, remote, token));
        }
    }

    private static async Task ServeClient(Runner runner, TcpClient client, IPAddress remote, CancellationToken token) {
        Stream stream = null;
        try {
            stream = client.GetStream();

            if (runner.certificate is not null) {
                SslStream ssl = new SslStream(stream, false);
                stream = ssl;

                using CancellationTokenSource handshake = CancellationTokenSource.CreateLinkedTokenSource(token);
                handshake.CancelAfter(10_000);

                await ssl.AuthenticateAsServerAsync(new SslServerAuthenticationOptions {
                    ServerCertificate = runner.certificate,
                    ClientCertificateRequired = false,
                    CertificateRevocationCheckMode = X509RevocationMode.NoCheck
                }, handshake.Token);
            }

            await ReadFrames(runner, stream, remote, token);
        }
        catch { }
        finally {
            try { stream?.Dispose(); } catch { }
            client.Dispose();
            Interlocked.Decrement(ref runner.clients);
        }
    }

    //RFC 6587: octet-counting or non-transparent (LF) framing, detected per frame
    private static async Task ReadFrames(Runner runner, Stream stream, IPAddress remote, CancellationToken token) {
        byte[] buffer = new byte[MAX_FRAME_LENGTH];
        int count = 0;

        while (!token.IsCancellationRequested) {
            int read = await stream.ReadAsync(buffer.AsMemory(count, buffer.Length - count), token);
            if (read == 0) break;
            count += read;

            int offset = 0;
            while (offset < count) {
                int consumed = NextFrame(buffer, offset, count - offset, out int start, out int length);
                if (consumed < 0) return; //invalid framing, drop the connection
                if (consumed == 0) break;

                if (length > 0) Receive(runner, remote, buffer, start, length);
                offset += consumed;
            }

            if (offset > 0) {
                Buffer.BlockCopy(buffer, offset, buffer, 0, count - offset);
                count -= offset;
            }

            if (count == buffer.Length) { //unterminated frame, flush as is
                Receive(runner, remote, buffer, 0, count);
                count = 0;
            }
        }
    }

    private static int NextFrame(byte[] buffer, int offset, int count, out int start, out int length) {
        int end = offset + count;
        int i = offset;

        start = offset;
        length = 0;

        while (i < end && (buffer[i] == '\n' || buffer[i] == '\r' || buffer[i] == 0 || buffer[i] == ' ')) i++;
        if (i == end) return count;

        if (buffer[i] >= '1' && buffer[i] <= '9') {
            int n = 0;
            int j = i;
            while (j < end && j - i < 6 && buffer[j] >= '0' && buffer[j] <= '9') {
                n = n * 10 + (buffer[j] - '0');
                j++;
            }

            if (j == end) return 0;

            if (buffer[j] == ' ') {
                if (n > MAX_FRAME_LENGTH - 8) return -1;
                if (end - (j + 1) < n) return 0;

                start = j + 1;
                length = n;
                return j + 1 + n - offset;
            }
        }

        int terminator = buffer.AsSpan(i, end - i).IndexOfAny((byte)'\n', (byte)0);
        if (terminator < 0) return 0;

        start = i;
        length = terminator;
        if (length > 0 && buffer[i + length - 1] == '\r') length--;
        return i + terminator + 1 - offset;
    }

    private static string AcceptedDevice(Runner runner, IPAddress remote, in Message message) {
        string file = ResolveDevice(remote, message);
        if (file is null) {
            WriteUnknownSender(runner, remote, message.hostname);
            return null;
        }
        if (runner.config.accept == AcceptMode.Whitelist && !runner.whitelist.Contains(file)) return null;
        return file;
    }

    private static string ResolveDevice(IPAddress remote, in Message message) {
        foreach (string ip in OriginAddresses(message.structuredData)) {
            string file = SenderIndex.Resolve(ip);
            if (file is not null) return file;
        }

        return SenderIndex.ResolveHost(message.hostname) ?? SenderIndex.Resolve(remote);
    }

    //RFC 5424 7.2: [origin ip="..." ip="..."]
    private static List<string> OriginAddresses(string structuredData) {
        List<string> list = new List<string>();
        int i = 0;

        while (i < structuredData.Length) {
            int start = structuredData.IndexOf("[origin", i, StringComparison.Ordinal);
            if (start < 0) break;
            i = start + 7;
            if (i < structuredData.Length && structuredData[i] != ' ' && structuredData[i] != ']') continue;

            while (i < structuredData.Length && structuredData[i] != ']') {
                while (i < structuredData.Length && structuredData[i] == ' ') i++;

                int equals = structuredData.IndexOf('=', i);
                if (equals < 0 || equals + 1 >= structuredData.Length || structuredData[equals + 1] != '"') return list;
                bool isIp = structuredData.AsSpan(i, equals - i).SequenceEqual("ip");

                StringBuilder value = new StringBuilder();
                i = equals + 2;
                while (i < structuredData.Length && structuredData[i] != '"') {
                    if (structuredData[i] == '\\' && i + 1 < structuredData.Length) i++;
                    value.Append(structuredData[i++]);
                }
                i++; //closing quote

                if (isIp) list.Add(value.ToString());
            }
        }

        return list;
    }

    //once per address per interval, when the listener echoes to the console
    private static void WriteUnknownSender(Runner runner, IPAddress remote, string hostname) {
        SyslogListener config = runner.config;
        if (config.console == OFF) return;

        DateTime now = DateTime.UtcNow;
        long interval = TimeSpan.TicksPerSecond * UNKNOWN_INTERVAL;

        lock (runner.unknownMutex) {
            if (runner.unknownSenders.TryGetValue(remote, out long last) && now.Ticks - last < interval) return;

            //bounded for spoofed sources, start over at most once per interval
            if (runner.unknownSenders.Count >= MAX_UNKNOWN_SENDERS && !runner.unknownSenders.ContainsKey(remote)) {
                if (now.Ticks - runner.unknownReset < interval) return;
                runner.unknownSenders.Clear();
                runner.unknownReset = now.Ticks;
            }

            runner.unknownSenders[remote] = now.Ticks;
        }

        string text = $"{now.ToString(Data.DATETIME_FORMAT_FILE, CultureInfo.InvariantCulture)}\tsyslog {"Unknown",-13} {remote,-24} {(String.IsNullOrEmpty(hostname) ? "" : $"host {hostname}, ")}not in the devices database, dropped ({config.protocol} {config.port})";

        lock (consoleMutex) {
            try {
                Console.ForegroundColor = ConsoleColor.DarkYellow;
                Console.WriteLine(text);
                Console.ResetColor();
            }
            catch { } //also called from the accept loop, must not throw
        }
    }

    private static void Receive(Runner runner, IPAddress remote, byte[] buffer, int offset, int length) {
        if (length > MAX_MESSAGE_LENGTH) length = MAX_MESSAGE_LENGTH;
        string text = Encoding.UTF8.GetString(buffer, offset, length);
        Message message = Parse(text);

        string file = AcceptedDevice(runner, remote, message);
        if (file is null) return;

        SyslogListener config = runner.config;

        int severity = message.severity;
        bool toConsole = severity <= config.console;
        bool toDisk    = severity <= config.disk;
        bool toEmail   = severity <= config.email;
        bool toLive    = severity <= config.live;

        if (!toConsole && !toDisk && !toEmail && !toLive) return;

        DateTime now = DateTime.UtcNow;

        if (toDisk || toLive) {
            string line = FormatLine(now, message, remote);

            if (toDisk) {
                diskChannel.Writer.TryWrite(new DiskEntry(file, now.ToString(Data.DATE_FORMAT_FILE, CultureInfo.InvariantCulture), line));
            }

            if (toLive) {
                if (Interlocked.Increment(ref liveCount) <= MAX_LIVE_QUEUE) {
                    liveQueue.Enqueue($"{file}\t{line}");
                }
                else {
                    Interlocked.Decrement(ref liveCount);
                }
            }
        }

        if (toConsole) {
            WriteConsole(now, message, remote);
        }

        if (toEmail) {
            if (Interlocked.Increment(ref runner.emailCount) <= MAX_EMAIL_LINES) {
                runner.emailQueue.Enqueue(new EmailItem(now, file, remote, message));
            }
            else {
                Interlocked.Decrement(ref runner.emailCount);
                Interlocked.Increment(ref runner.emailOverflow);
            }
        }
    }

    //time \t severity \t facility \t source \t hostname \t app \t procid \t msgid \t structured-data \t message
    private static string FormatLine(DateTime time, in Message message, IPAddress remote) {
        StringBuilder builder = new StringBuilder(128 + message.text.Length + message.structuredData.Length);
        builder.Append(time.ToString(TIMESTAMP_FORMAT, CultureInfo.InvariantCulture)).Append('\t');
        builder.Append((char)('0' + message.severity)).Append('\t');
        builder.Append(message.facility).Append('\t');
        builder.Append(remote).Append('\t');
        AppendEscaped(builder, message.hostname).Append('\t');
        AppendEscaped(builder, message.app).Append('\t');
        AppendEscaped(builder, message.procid).Append('\t');
        AppendEscaped(builder, message.msgid).Append('\t');
        AppendEscaped(builder, message.structuredData).Append('\t');
        AppendEscaped(builder, message.text);
        return builder.ToString();
    }

    private static StringBuilder AppendEscaped(StringBuilder builder, string value) {
        for (int i = 0; i < value.Length; i++) {
            char c = value[i];
            switch (c) {
            case '\\': builder.Append("\\\\"); break;
            case '\t': builder.Append("\\t");  break;
            case '\n': builder.Append("\\n");  break;
            case '\r': builder.Append("\\r");  break;
            default:
                if (c < 0x20 || c == 0x7f) builder.Append(' ');
                else builder.Append(c);
                break;
            }
        }
        return builder;
    }

    private static void WriteConsole(DateTime time, in Message message, IPAddress remote) {
        ConsoleColor color = message.severity switch {
            <= 2 => ConsoleColor.Red,
            3    => ConsoleColor.DarkRed,
            4    => ConsoleColor.Yellow,
            5    => ConsoleColor.Cyan,
            6    => ConsoleColor.Gray,
            _    => ConsoleColor.DarkGray
        };

        string source = String.IsNullOrEmpty(message.hostname) ? remote.ToString() : message.hostname;
        string app = String.IsNullOrEmpty(message.app) ? String.Empty : $"{message.app}: ";
        string text = $"{time.ToString(Data.DATETIME_FORMAT_FILE, CultureInfo.InvariantCulture)}\tsyslog {(Severity)message.severity,-13} {source,-24} {app}{message.text}";

        lock (consoleMutex) {
            Console.ForegroundColor = color;
            Console.WriteLine(text);
            Console.ResetColor();
        }
    }

    private static async Task DiskWriterLoop() {
        ChannelReader<DiskEntry> reader = diskChannel.Reader;
        Dictionary<string, (string date, StreamWriter writer)> writers = new Dictionary<string, (string, StreamWriter)>();
        HashSet<StreamWriter> touched = new HashSet<StreamWriter>();

        while (true) {
            try {
                Task<bool> wait = reader.WaitToReadAsync().AsTask();

                //release file handles while idle
                if (!wait.IsCompleted && writers.Count > 0) {
                    using CancellationTokenSource idle = new CancellationTokenSource();
                    Task first = await Task.WhenAny(wait, Task.Delay(30_000, idle.Token));
                    idle.Cancel();
                    if (first != wait) CloseWriters(writers);
                }

                if (!await wait) break;

                while (reader.TryRead(out DiskEntry entry)) {
                    StreamWriter writer = GetWriter(writers, entry);
                    if (writer is null) continue;

                    try {
                        writer.WriteLine(entry.line);
                        touched.Add(writer);
                    }
                    catch (Exception ex) {
                        Logger.Error(ex);
                        writers.Remove(entry.file);
                        touched.Remove(writer);
                        try { writer.Dispose(); } catch { }
                    }
                }

                foreach (StreamWriter writer in touched) {
                    try { writer.Flush(); } catch { }
                }
                touched.Clear();
            }
            catch (Exception ex) {
                Logger.Error(ex);
            }
        }

        CloseWriters(writers);
    }

    private static StreamWriter GetWriter(Dictionary<string, (string date, StreamWriter writer)> writers, DiskEntry entry) {
        if (writers.TryGetValue(entry.file, out (string date, StreamWriter writer) cached)) {
            if (cached.date == entry.date) return cached.writer;
            try { cached.writer.Dispose(); } catch { }
            writers.Remove(entry.file);
        }

        if (!IsValidFile(entry.file)) return null;

        string directory = Path.Join(Data.DIR_SYSLOG, entry.file);
        string path = Path.Join(directory, $"{entry.date}.log");

        for (int attempt = 0; attempt < 2; attempt++) {
            try {
                Directory.CreateDirectory(directory);
                FileStream stream = new FileStream(path, FileMode.Append, FileAccess.Write, FileShare.ReadWrite | FileShare.Delete);
                StreamWriter writer = new StreamWriter(stream, new UTF8Encoding(false));
                writers[entry.file] = (entry.date, writer);
                return writer;
            }
            catch (DirectoryNotFoundException) { } //deleted by data retention in the meantime
            catch (Exception ex) {
                Logger.Error(ex);
                return null;
            }
        }

        return null;
    }

    private static void CloseWriters(Dictionary<string, (string date, StreamWriter writer)> writers) {
        foreach ((string _, StreamWriter writer) in writers.Values) {
            try { writer.Dispose(); } catch { }
        }
        writers.Clear();
    }

    private static void FlushLive() {
        if (liveQueue.IsEmpty) return;
        if (Interlocked.Exchange(ref liveFlushing, 1) == 1) return;

        try {
            using MemoryStream ms = new MemoryStream();
            using (Utf8JsonWriter writer = new Utf8JsonWriter(ms, jsonWriterOptions)) {
                writer.WriteStartObject();
                writer.WriteString("action", "syslog");
                writer.WriteStartArray("lines");

                int count = 0;
                while (count < MAX_LIVE_BATCH && liveQueue.TryDequeue(out string line)) {
                    Interlocked.Decrement(ref liveCount);
                    writer.WriteStringValue(line);
                    count++;
                }

                writer.WriteEndArray();
                writer.WriteEndObject();
            }

            KeepAlive.Broadcast(ms.ToArray(), "/syslog");
        }
        catch (Exception ex) {
            Logger.Error(ex);
        }
        finally {
            Volatile.Write(ref liveFlushing, 0);
        }
    }

    //the first email goes out right away, the rest are grouped into one email per listener per interval
    private static void FlushEmails() {
        long now = DateTime.UtcNow.Ticks;

        foreach (Runner runner in running.Values) {
            if (Volatile.Read(ref runner.emailCount) == 0 && Volatile.Read(ref runner.emailOverflow) == 0) continue;
            if (now - Interlocked.Read(ref runner.lastEmail) < TimeSpan.TicksPerSecond * EMAIL_INTERVAL) continue;
            if (Interlocked.CompareExchange(ref runner.emailSending, 1, 0) != 0) continue;

            Interlocked.Exchange(ref runner.lastEmail, now);
            _ = Task.Run(() => SendEmail(runner));
        }
    }

    private static void SendEmail(Runner runner) {
        try {
            SyslogListener config = runner.config;

            List<EmailItem> items = new List<EmailItem>();
            while (runner.emailQueue.TryDequeue(out EmailItem item)) {
                Interlocked.Decrement(ref runner.emailCount);
                items.Add(item);
            }
            int overflow = Interlocked.Exchange(ref runner.emailOverflow, 0);

            if (items.Count == 0) return;
            if (config.smtpProfile == Guid.Empty || config.recipients.Length == 0) return;

            SmtpProfiles.Profile profile = Array.Find(SmtpProfiles.Load(), o => o?.guid == config.smtpProfile);
            if (profile is null) {
                Logger.Error("Syslog: SMTP profile not found");
                return;
            }

            int total = items.Count + overflow;
            string listenerName = String.IsNullOrEmpty(config.name) ? $"{config.protocol} {config.port}" : config.name;
            string subject = $"Syslog notification - {listenerName} - {total} message{(total == 1 ? "" : "s")} - {DateTime.Now.ToString(Data.DATETIME_FORMAT_TIMEZONE)}";

            SmtpProfiles.Send(profile, config.recipients, subject, BuildEmailBody(items, overflow, listenerName));
        }
        catch (Exception ex) {
            Logger.Error(ex);
        }
        finally {
            Volatile.Write(ref runner.emailSending, 0);
        }
    }

    private static string BuildEmailBody(List<EmailItem> items, int overflow, string listenerName) {
        static string Encode(string value) => WebUtility.HtmlEncode(value ?? String.Empty);

        StringBuilder body = new StringBuilder();
        body.Append("<html>");
        body.Append("<table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\">");
        body.Append("<tr><td>&nbsp;</td></tr>");
        body.Append("<tr><td align=\"center\">");

        body.Append("<table width=\"800\" bgcolor=\"#e0e0e0\" style=\"text-align:left\">");
        body.Append("<tr><td style=\"padding:10px\"></td></tr>");
        body.Append($"<tr><td style=\"height:40px;color:#202020;font-size:20px;text-align:center\"><b>Syslog - {Encode(listenerName)}</b></td></tr>");

        body.Append("<tr><td style=\"padding:10px\">");
        body.Append("<table width=\"100%\" cellpadding=\"4\" cellspacing=\"0\" style=\"font-family:monospace;font-size:13px;color:#202020\">");
        body.Append("<tr style=\"background-color:#c0c0c0\"><th align=\"left\">Time</th><th align=\"left\">Device</th><th align=\"left\">Severity</th><th align=\"left\">App</th><th align=\"left\">Message</th></tr>");

        for (int i = 0; i < items.Count; i++) {
            EmailItem item = items[i];
            string color = item.message.severity switch {
                <= 2 => "#c00000",
                3    => "#e06000",
                4    => "#a08000",
                _    => "#202020"
            };

            body.Append($"<tr style=\"color:{color}\">");
            body.Append($"<td style=\"white-space:nowrap\">{item.time.ToLocalTime().ToString(Data.DATETIME_FORMAT_FILE, CultureInfo.InvariantCulture)}</td>");
            body.Append($"<td>{Encode(GetDeviceName(item.file, item.remote))}</td>");
            body.Append($"<td>{(Severity)item.message.severity}</td>");
            body.Append($"<td>{Encode(item.message.app)}</td>");
            body.Append($"<td>{Encode(item.message.text)}</td>");
            body.Append("</tr>");
        }

        body.Append("</table>");
        body.Append("</td></tr>");

        if (overflow > 0) {
            body.Append($"<tr><td style=\"padding:10px;color:#606060\">and {overflow} more message{(overflow == 1 ? "" : "s")} not included.</td></tr>");
        }

        body.Append("<tr><td style=\"padding:10px\"></td></tr>");
        body.Append("</table>");

        body.Append("</td></tr>");
        body.Append("<tr><td>&nbsp;</td></tr>");
        body.Append("<tr><td style=\"text-align:center;color:#808080\">Sent from <a href=\"https://github.com/openprotest/protest\" style=\"color:#e67624\">Pro-test</a></td></tr>");
        body.Append("<tr><td>&nbsp;</td></tr>");
        body.Append("</table>");
        body.Append("</html>");

        return body.ToString();
    }

    private static string GetDeviceName(string file, IPAddress remote) {
        if (DatabaseInstances.devices?.dictionary.TryGetValue(file, out Database.Entry entry) == true) {
            if (entry.attributes.TryGetValue("name", out Database.Attribute name) && !String.IsNullOrEmpty(name?.value)) return name.value;
            if (entry.attributes.TryGetValue("hostname", out Database.Attribute hostname) && !String.IsNullOrEmpty(hostname?.value)) return hostname.value;
        }
        return remote.ToString();
    }

    internal static byte[] ListDevices() {
        try {
            DirectoryInfo dir = new DirectoryInfo(Data.DIR_SYSLOG);
            string[] files = dir.Exists
                ? dir.GetDirectories().Select(o => o.Name).Order(StringComparer.Ordinal).ToArray()
                : Array.Empty<string>();
            return JsonSerializer.SerializeToUtf8Bytes(files, SyslogJsonContext.Default.StringArray);
        }
        catch (Exception ex) {
            Logger.Error(ex);
            return Data.CODE_FAILED.Array;
        }
    }

    private readonly record struct Row(string time, string device, int index, string line);

    private static int CompareRowsDescending(Row a, Row b) {
        int c = String.CompareOrdinal(b.time, a.time);
        if (c != 0) return c;
        c = String.CompareOrdinal(b.device, a.device);
        if (c != 0) return c;
        return b.index.CompareTo(a.index);
    }

    private static bool IsTimestamp(string value) {
        return value is not null
            && value.Length == TIMESTAMP_LENGTH
            && DateTime.TryParseExact(value, TIMESTAMP_FORMAT, CultureInfo.InvariantCulture, DateTimeStyles.None, out _);
    }

    //pages back in time, newest first. "before" is inclusive: "skip" counts the lines at exactly "before" that were already returned
    internal static byte[] ListHandler(HttpListenerContext ctx) {
        Dictionary<string, string> parameters = Listener.ParseQuery(ctx) ?? new Dictionary<string, string>();

        parameters.TryGetValue("before", out string before);
        parameters.TryGetValue("from", out string from);
        parameters.TryGetValue("to", out string to);
        parameters.TryGetValue("device", out string device);
        parameters.TryGetValue("q", out string query);

        if (!IsTimestamp(before)) before = null;
        if (!IsTimestamp(from)) from = null;
        if (!IsTimestamp(to)) to = null; //exclusive

        int skip = parameters.TryGetValue("skip", out string skipString) && int.TryParse(skipString, out int s) ? Math.Max(0, s) : 0;
        if (before is null) skip = 0;

        //severity levels to include, as digits, e.g. "0123"
        int levelMask = 0xff;
        if (parameters.TryGetValue("levels", out string levelsString)) {
            levelMask = 0;
            for (int i = 0; i < levelsString.Length; i++) {
                if (levelsString[i] >= '0' && levelsString[i] <= '7') levelMask |= 1 << (levelsString[i] - '0');
            }
        }

        int limit = parameters.TryGetValue("limit", out string limitString) && int.TryParse(limitString, out int l)
            ? Math.Clamp(l, 1, MAX_PAGE_LINES)
            : MAX_PAGE_LINES;

        if (String.IsNullOrWhiteSpace(device)) device = null;
        else if (!IsValidFile(device)) return Data.CODE_INVALID_ARGUMENT.Array;

        if (String.IsNullOrWhiteSpace(query)) query = null;

        try {
            //collect date files of the relevant devices
            SortedDictionary<string, List<(string device, string path)>> dates = new SortedDictionary<string, List<(string, string)>>(StringComparer.Ordinal);

            DirectoryInfo root = new DirectoryInfo(Data.DIR_SYSLOG);
            DirectoryInfo[] directories = !root.Exists ? Array.Empty<DirectoryInfo>()
                : device is null ? root.GetDirectories()
                : Directory.Exists(Path.Join(Data.DIR_SYSLOG, device)) ? [new DirectoryInfo(Path.Join(Data.DIR_SYSLOG, device))]
                : Array.Empty<DirectoryInfo>();

            string upperDate = MinOrdinal(before, to) is string upper ? upper[..10].Replace("-", String.Empty) : null;
            string lowerDate = from?[..10].Replace("-", String.Empty);

            foreach (DirectoryInfo directory in directories) {
                foreach (FileInfo file in directory.GetFiles("*.log")) {
                    string date = Path.GetFileNameWithoutExtension(file.Name);
                    if (date.Length != 8 || !IsDigits(date)) continue;
                    if (upperDate is not null && String.CompareOrdinal(date, upperDate) > 0) continue;
                    if (lowerDate is not null && String.CompareOrdinal(date, lowerDate) < 0) continue;

                    if (!dates.TryGetValue(date, out List<(string, string)> list)) {
                        dates[date] = list = new List<(string, string)>();
                    }
                    list.Add((directory.Name, file.FullName));
                }
            }

            string[] orderedDates = dates.Keys.Reverse().ToArray();
            int keep = limit + skip + 1; //one extra to tell if there are more
            List<Row> rows = new List<Row>();
            long scanned = 0;
            int dateIndex = 0;
            bool budgetExceeded = false;

            for (; dateIndex < orderedDates.Length; dateIndex++) {
                List<Row> dayRows = new List<Row>();

                foreach ((string dev, string path) in dates[orderedDates[dateIndex]]) {
                    scanned += ScanFile(dev, path, before, from, to, levelMask, query, dayRows, keep);
                }

                dayRows.Sort(CompareRowsDescending);
                rows.AddRange(dayRows);

                if (rows.Count >= keep) {
                    dateIndex++;
                    break;
                }

                if (scanned > MAX_PAGE_SCAN_BYTES) {
                    dateIndex++;
                    budgetExceeded = true;
                    break;
                }
            }

            //drop the lines at "before" that the client already has
            if (skip > 0) {
                int skipped = 0;
                rows.RemoveAll(o => o.time == before && skipped++ < skip);
            }

            List<Row> page = rows.Count > limit ? rows.GetRange(0, limit) : rows;
            bool hasMoreDates = dateIndex < orderedDates.Length;

            string nextBefore = null;
            int nextSkip = 0;
            bool end;

            if (page.Count == limit && (rows.Count > limit || hasMoreDates)) {
                nextBefore = page[^1].time;
                nextSkip = page.Count(o => o.time == nextBefore) + (nextBefore == before ? skip : 0);
                end = false;
            }
            else if (budgetExceeded && hasMoreDates) {
                //resume from the end of the next date that was not scanned
                string nextDate = orderedDates[dateIndex];
                nextBefore = $"{nextDate[..4]}-{nextDate[4..6]}-{nextDate[6..8]} 23:59:59.999";
                nextSkip = 0;
                end = false;
            }
            else {
                end = true;
            }

            using MemoryStream ms = new MemoryStream();
            using (Utf8JsonWriter writer = new Utf8JsonWriter(ms, jsonWriterOptions)) {
                writer.WriteStartObject();
                writer.WriteStartArray("lines");
                for (int i = page.Count - 1; i >= 0; i--) { //oldest first
                    writer.WriteStringValue($"{page[i].device}\t{page[i].line}");
                }
                writer.WriteEndArray();
                writer.WriteString("before", nextBefore);
                writer.WriteNumber("skip", nextSkip);
                writer.WriteBoolean("end", end);
                writer.WriteEndObject();
            }

            return ms.ToArray();
        }
        catch (Exception ex) {
            Logger.Error(ex);
            return Data.CODE_FAILED.Array;
        }
    }

    private static string MinOrdinal(string a, string b) {
        if (a is null) return b;
        if (b is null) return a;
        return String.CompareOrdinal(a, b) <= 0 ? a : b;
    }

    private static long ScanFile(string device, string path, string before, string from, string to, int levelMask, string query, List<Row> rows, int keep) {
        long length = 0;

        try {
            using FileStream stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
            length = stream.Length;
            using StreamReader reader = new StreamReader(stream, Encoding.UTF8);

            int index = 0;
            int trimAt = Math.Max(keep * 2, keep + 4096);
            string line;

            while ((line = reader.ReadLine()) is not null) {
                index++;

                //skip malformed and partially written lines
                if (line.Length < TIMESTAMP_LENGTH + 4 || line[TIMESTAMP_LENGTH] != '\t' || line[TIMESTAMP_LENGTH + 2] != '\t') continue;
                if (line.AsSpan().Count('\t') < 9) continue;

                int severity = line[TIMESTAMP_LENGTH + 1] - '0';
                if (severity < 0 || severity > 7 || (levelMask & (1 << severity)) == 0) continue;

                if (before is not null && String.CompareOrdinal(line, 0, before, 0, TIMESTAMP_LENGTH) > 0) continue;
                if (to is not null && String.CompareOrdinal(line, 0, to, 0, TIMESTAMP_LENGTH) >= 0) continue;
                if (from is not null && String.CompareOrdinal(line, 0, from, 0, TIMESTAMP_LENGTH) < 0) continue;

                if (query is not null) {
                    //match on source, hostname, app, procid, msgid, structured-data and message
                    int start = line.IndexOf('\t', TIMESTAMP_LENGTH + 3);
                    if (start < 0 || !line.AsSpan(start + 1).Contains(query, StringComparison.OrdinalIgnoreCase)) continue;
                }

                rows.Add(new Row(line[..TIMESTAMP_LENGTH], device, index, line));

                if (rows.Count > trimAt) {
                    rows.Sort(CompareRowsDescending);
                    rows.RemoveRange(keep, rows.Count - keep);
                }
            }
        }
        catch (FileNotFoundException) { }
        catch (DirectoryNotFoundException) { }
        catch (Exception ex) {
            Logger.Error(ex);
        }

        return length;
    }

    internal static int DeleteOlderThan(int days) {
        days = Math.Max(days, DataRetention.MIN_DAYS);
        int deletedCount = 0;

        try {
            DirectoryInfo root = new DirectoryInfo(Data.DIR_SYSLOG);
            if (!root.Exists) return 0;

            DateTime cutoff = DateTime.UtcNow.AddDays(-days).Date;

            foreach (DirectoryInfo directory in root.GetDirectories()) {
                foreach (FileInfo file in directory.GetFiles("*.log")) {
                    string datePart = Path.GetFileNameWithoutExtension(file.Name);
                    if (!DateTime.TryParseExact(datePart, Data.DATE_FORMAT_FILE, CultureInfo.InvariantCulture, DateTimeStyles.None, out DateTime fileDate)) {
                        continue;
                    }

                    if (fileDate >= cutoff) continue;

                    try {
                        file.Delete();
                        deletedCount++;
                    }
                    catch (Exception ex) {
                        Logger.Error(ex);
                    }
                }

                try {
                    if (!directory.EnumerateFileSystemInfos().Any()) {
                        directory.Delete();
                    }
                }
                catch { }
            }
        }
        catch (Exception ex) {
            Logger.Error(ex);
        }

        return deletedCount;
    }
}

[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase, IncludeFields = true)]
[JsonSerializable(typeof(Syslog.SyslogListener[]))]
[JsonSerializable(typeof(string[]))]
internal partial class SyslogJsonContext : JsonSerializerContext {}

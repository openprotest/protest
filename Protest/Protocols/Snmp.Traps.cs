using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Channels;
using System.Threading.Tasks;
using Lextm.SharpSnmpLib;
using Lextm.SharpSnmpLib.Messaging;
using Lextm.SharpSnmpLib.Security;
using Protest.Http;
using Protest.Tools;

namespace Protest.Protocols.Snmp;

internal static partial class Traps {
    private const int    MAX_VARIABLES       = 128;
    private const int    MAX_VALUE_LENGTH    = 1_024;
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

    private const string OID_SNMP_TRAPS            = "1.3.6.1.6.3.1.1.5.";
    private const string OID_SNMP_TRAP_ADDRESS     = "1.3.6.1.6.3.18.1.3.0";
    private const string OID_USM_UNKNOWN_ENGINE_ID = "1.3.6.1.6.3.15.1.1.4.0";

    private static readonly Lock mutex = new Lock();
    private static readonly Lock consoleMutex = new Lock();

    private static readonly string DEFAULT = """
    [{
        "enabled"    : false,
        "guid"       : "00000000-0000-0000-0000-000000000001",
        "name"       : "SNMP traps",
        "bindAddress": "0.0.0.0",
        "port"       : 162,
        "console"    : -1,
        "disk"       : 5,
        "email"      : -1,
        "live"       : 5,
        "accept"     : 0
    }]
    """;

    //RFC 3584 3.1, generic trap codes of SNMPv1
    private static readonly Dictionary<string, string> STANDARD_TRAPS = new Dictionary<string, string> {
        { "1.3.6.1.6.3.1.1.5.1", "coldStart" },
        { "1.3.6.1.6.3.1.1.5.2", "warmStart" },
        { "1.3.6.1.6.3.1.1.5.3", "linkDown" },
        { "1.3.6.1.6.3.1.1.5.4", "linkUp" },
        { "1.3.6.1.6.3.1.1.5.5", "authenticationFailure" },
        { "1.3.6.1.6.3.1.1.5.6", "egpNeighborLoss" }
    };

    internal enum Severity : byte {
        Critical = 0,
        Major = 1,
        Minor = 2,
        Warning = 3,
        Indeterminate = 4,
        Cleared = 5
    }

    internal enum AcceptMode : byte { AllDevices=0, Whitelist=1 }

    private enum Outcome : byte { Rejected, Accepted, Protocol }

    internal sealed class TrapListener {
        public bool enabled;
        public Guid guid;
        public string name = String.Empty;
        public string bindAddress = "0.0.0.0";
        public ushort port;

        //minimum severity that triggers each action, -1 is off
        public sbyte console = OFF;
        public sbyte disk    = (sbyte)Severity.Cleared;
        public sbyte email   = OFF;
        public sbyte live    = (sbyte)Severity.Cleared;

        public Guid smtpProfile;
        public string[] recipients = [];

        public AcceptMode accept = AcceptMode.AllDevices;
        public string[] devices = []; //device files

        public Guid[] credentials = []; //snmp profiles, empty accepts any community and every snmpv3 profile
    }

    internal sealed class EngineState {
        public string engineId;
        public int engineBoots;
    }

    //built from the snmp profiles, replaced as a whole
    private sealed class Credentials {
        public readonly UserRegistry registry = new UserRegistry();
        public readonly Dictionary<string, Levels> levels = new Dictionary<string, Levels>(StringComparer.Ordinal); //snmpv3 user to the minimum security level
        public HashSet<string> communities; //null accepts any
        public string warning;
    }

    private sealed class Trap {
        public string version;
        public string pdu;
        public string user = String.Empty;
        public string oid;
        public uint uptime;
        public string origin = String.Empty;
        public IList<Variable> variables;
        public byte severity;
    }

    private sealed class Runner {
        public volatile TrapListener config;
        public volatile HashSet<string> whitelist;
        public volatile Credentials credentials;
        public readonly CancellationTokenSource cts = new CancellationTokenSource();
        public UdpClient udp;

        public readonly ConcurrentQueue<EmailItem> emailQueue = new ConcurrentQueue<EmailItem>();
        public int emailCount;
        public int emailOverflow;
        public int emailSending;
        public long lastEmail;

        public readonly Lock unknownMutex = new Lock();
        public readonly Dictionary<IPAddress, long> unknownSenders = new Dictionary<IPAddress, long>();
        public long unknownReset;

        public Runner(TrapListener config, SnmpProfiles.Profile[] profiles) {
            Apply(config, profiles);
        }

        public void Apply(TrapListener config, SnmpProfiles.Profile[] profiles) {
            this.whitelist = new HashSet<string>(config.devices ?? [], StringComparer.Ordinal);
            this.credentials = BuildCredentials(config, profiles);
            this.config = config;
        }

        public void Dispose() {
            try { cts.Cancel(); } catch { }
            try { udp?.Dispose(); } catch { }
        }
    }

    private sealed record EmailItem(DateTime time, string file, IPAddress remote, Trap trap);
    private readonly record struct DiskEntry(string file, string date, string line);

    internal static readonly ConcurrentDictionary<Guid, TrapListener> listeners = new ConcurrentDictionary<Guid, TrapListener>();
    private static readonly ConcurrentDictionary<Guid, Runner> running = new ConcurrentDictionary<Guid, Runner>();
    private static readonly ConcurrentDictionary<Guid, string> errors = new ConcurrentDictionary<Guid, string>();

    //snmp engine, authoritative for the informs we receive
    private static byte[] engineId;
    private static int engineBoots;
    private static readonly long engineStart = Environment.TickCount64;
    private static int unknownEngineIds;

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
        LoadEngine();

        liveTimer  = new Timer(_ => FlushLive(), null, 250, 250);
        emailTimer = new Timer(_ => FlushEmails(), null, 2_000, 2_000);
        _ = Task.Run(DiskWriterLoop);

        Reconcile(Load());
    }

    //the engine id persists, the boots counter increases on every start (RFC 3414 2.2)
    private static void LoadEngine() {
        EngineState state = null;

        try {
            if (File.Exists(Data.FILE_SNMP_TRAPS_ENGINE)) {
                state = JsonSerializer.Deserialize(File.ReadAllBytes(Data.FILE_SNMP_TRAPS_ENGINE), SnmpTrapsJsonContext.Default.EngineState);
            }
        }
        catch (Exception ex) {
            Logger.Error(ex);
        }

        byte[] id = null;
        try {
            if (!String.IsNullOrEmpty(state?.engineId)) id = Convert.FromHexString(state.engineId);
        }
        catch { }

        if (id is null || id.Length < 5 || id.Length > 32) {
            //RFC 3411 5, enterprise bit set, format 5: administratively assigned octets
            id = new byte[17];
            id[0] = 0x80;
            id[4] = 0x05;
            RandomNumberGenerator.Fill(id.AsSpan(5));
        }

        int boots = state?.engineBoots ?? 0;
        boots = boots < 1 ? 1 : boots >= Int32.MaxValue - 1 ? Int32.MaxValue : boots + 1;

        engineId = id;
        engineBoots = boots;

        try {
            EngineState next = new EngineState { engineId = Convert.ToHexString(id), engineBoots = boots };
            File.WriteAllBytes(Data.FILE_SNMP_TRAPS_ENGINE, JsonSerializer.SerializeToUtf8Bytes(next, SnmpTrapsJsonContext.Default.EngineState));
        }
        catch (Exception ex) {
            Logger.Error(ex);
        }
    }

    private static int EngineTime => (int)Math.Min((Environment.TickCount64 - engineStart) / 1000, Int32.MaxValue);

    internal static TrapListener[] Load() {
        TrapListener[] loaded;

        try {
            if (File.Exists(Data.FILE_SNMP_TRAPS_LISTENERS)) {
                byte[] bytes;
                lock (mutex) {
                    bytes = File.ReadAllBytes(Data.FILE_SNMP_TRAPS_LISTENERS);
                }

                byte[] plain = Cryptography.Decrypt(bytes, Configuration.DB_KEY, Configuration.DB_KEY_IV);
                loaded = JsonSerializer.Deserialize(plain, SnmpTrapsJsonContext.Default.TrapListenerArray);
            }
            else {
                loaded = JsonSerializer.Deserialize(DEFAULT, SnmpTrapsJsonContext.Default.TrapListenerArray);
            }
        }
        catch (Exception ex) {
            Logger.Error(ex);
            return Array.Empty<TrapListener>();
        }

        if (loaded is null) return Array.Empty<TrapListener>();
        return loaded.Where(o => o is not null && Normalize(o)).ToArray();
    }

    internal static byte[] List() {
        TrapListener[] array = listeners.Values.OrderBy(o => o.port).ThenBy(o => o.guid).ToArray();
        string engine = Convert.ToHexString(engineId ?? []);

        using MemoryStream ms = new MemoryStream();
        using (Utf8JsonWriter writer = new Utf8JsonWriter(ms, jsonWriterOptions)) {
            writer.WriteStartArray();
            for (int i = 0; i < array.Length; i++) {
                TrapListener o = array[i];
                running.TryGetValue(o.guid, out Runner runner);
                errors.TryGetValue(o.guid, out string error);

                writer.WriteStartObject();
                writer.WriteBoolean("enabled",       o.enabled);
                writer.WriteString("guid",           o.guid);
                writer.WriteString("name",           o.name);
                writer.WriteString("bindAddress",    o.bindAddress);
                writer.WriteNumber("port",           o.port);
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

                writer.WriteStartArray("credentials");
                for (int j = 0; j < o.credentials.Length; j++) writer.WriteStringValue(o.credentials[j]);
                writer.WriteEndArray();

                writer.WriteBoolean("running",       runner is not null);
                writer.WriteString("error",          error);
                writer.WriteString("warning",        runner?.credentials.warning);
                writer.WriteString("engineId",       engine);
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
            TrapListener[] incoming = JsonSerializer.Deserialize(payload, SnmpTrapsJsonContext.Default.TrapListenerArray);
            if (incoming is null) return Data.CODE_INVALID_ARGUMENT.Array;

            for (int i = 0; i < incoming.Length; i++) {
                if (incoming[i] is null || !Normalize(incoming[i])) {
                    return Data.CODE_INVALID_ARGUMENT.Array;
                }
            }

            byte[] plain = JsonSerializer.SerializeToUtf8Bytes(incoming, SnmpTrapsJsonContext.Default.TrapListenerArray);
            byte[] cipher = Cryptography.Encrypt(plain, Configuration.DB_KEY, Configuration.DB_KEY_IV);
            lock (mutex) {
                File.WriteAllBytes(Data.FILE_SNMP_TRAPS_LISTENERS, cipher);
            }

            Reconcile(incoming);

            Logger.Action(origin, "Environment", "Modify SNMP traps configuration");
            KeepAlive.Broadcast("{\"action\":\"snmptraps-listeners\"}"u8.ToArray(), "/snmptraps/listeners/list");
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

    //called when the snmp profiles change
    internal static void ReloadCredentials() {
        SnmpProfiles.Profile[] profiles = SnmpProfiles.Load();

        lock (mutex) {
            foreach (Runner runner in running.Values) {
                runner.Apply(runner.config, profiles);
            }
        }

        KeepAlive.Broadcast("{\"action\":\"snmptraps-listeners\"}"u8.ToArray(), "/snmptraps/listeners/list");
    }

    private static bool Normalize(TrapListener listener) {
        if (listener.guid == Guid.Empty) listener.guid = Guid.NewGuid();
        if (listener.port == 0) return false;

        listener.name = listener.name?.Trim() ?? String.Empty;
        listener.bindAddress = String.IsNullOrWhiteSpace(listener.bindAddress) ? "0.0.0.0" : listener.bindAddress.Trim();
        if (!IPAddress.TryParse(listener.bindAddress, out _)) return false;

        listener.console = Math.Clamp(listener.console, OFF, (sbyte)Severity.Cleared);
        listener.disk    = Math.Clamp(listener.disk,    OFF, (sbyte)Severity.Cleared);
        listener.email   = Math.Clamp(listener.email,   OFF, (sbyte)Severity.Warning);
        listener.live    = Math.Clamp(listener.live,    OFF, (sbyte)Severity.Cleared);

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

        listener.credentials = (listener.credentials ?? [])
            .Where(o => o != Guid.Empty)
            .Distinct()
            .ToArray();

        return true;
    }

    private static bool IsValidFile(string file) {
        return !String.IsNullOrEmpty(file)
            && file.IndexOfAny(Path.GetInvalidFileNameChars()) < 0
            && file != "." && file != "..";
    }

    //starts, stops, restarts or updates the running listeners to match the given configuration
    private static void Reconcile(TrapListener[] configuration) {
        SnmpProfiles.Profile[] profiles = SnmpProfiles.Load();

        lock (mutex) {
            Dictionary<Guid, TrapListener> next = new Dictionary<Guid, TrapListener>();
            for (int i = 0; i < configuration.Length; i++) {
                next[configuration[i].guid] = configuration[i];
            }

            foreach (KeyValuePair<Guid, Runner> pair in running) {
                if (next.TryGetValue(pair.Key, out TrapListener listener)
                    && listener.enabled
                    && IsSameEndpoint(pair.Value.config, listener)) {
                    pair.Value.Apply(listener, profiles);
                    continue;
                }

                StopListener(pair.Key);
            }

            listeners.Clear();
            foreach (TrapListener listener in next.Values) {
                listeners[listener.guid] = listener;
            }

            foreach (Guid guid in errors.Keys) {
                if (!next.TryGetValue(guid, out TrapListener listener) || !listener.enabled) {
                    errors.TryRemove(guid, out _);
                }
            }

            foreach (TrapListener listener in next.Values) {
                if (listener.enabled && !running.ContainsKey(listener.guid)) {
                    StartListener(listener, profiles);
                }
            }
        }
    }

    private static bool IsSameEndpoint(TrapListener a, TrapListener b) {
        return a.port == b.port
            && a.bindAddress == b.bindAddress;
    }

    //called by Reconcile, while holding the mutex
    private static bool StartListener(TrapListener listener, SnmpProfiles.Profile[] profiles) {
        if (running.ContainsKey(listener.guid)) return true;

        Runner runner = new Runner(listener, profiles);

        try {
            IPAddress address = IPAddress.Parse(listener.bindAddress);
            IPEndPoint endpoint = new IPEndPoint(address, listener.port);

            runner.udp = new UdpClient(address.AddressFamily);
            if (address.Equals(IPAddress.IPv6Any)) runner.udp.Client.DualMode = true;
            runner.udp.Client.ReceiveBufferSize = 4 * 1024 * 1024;
            runner.udp.Client.Bind(endpoint);
            _ = Task.Run(() => UdpLoop(runner));

            running[listener.guid] = runner;
            errors.TryRemove(listener.guid, out _);
            return true;
        }
        catch (Exception ex) {
            runner.Dispose();
            errors[listener.guid] = ex.Message;
            Logger.Error($"Failed to start SNMP traps listener {listener.bindAddress}:{listener.port}: {ex.Message}");
            return false;
        }
    }

    //called by Reconcile, while holding the mutex
    private static void StopListener(Guid guid) {
        if (running.TryRemove(guid, out Runner runner)) {
            runner.Dispose();
        }
    }

    private static Credentials BuildCredentials(TrapListener config, SnmpProfiles.Profile[] profiles) {
        Credentials credentials = new Credentials();

        HashSet<Guid> selected = config.credentials is null || config.credentials.Length == 0
            ? null
            : new HashSet<Guid>(config.credentials);

        if (selected is not null) {
            credentials.communities = new HashSet<string>(StringComparer.Ordinal);
        }

        SnmpProfiles.Profile[] candidates = (profiles ?? [])
            .Where(o => o is not null && (selected is null || selected.Contains(o.guid)))
            .OrderBy(o => o.priority)
            .ToArray();

        Dictionary<string, string> owners = new Dictionary<string, string>(StringComparer.Ordinal);
        List<string> warnings = new List<string>();

        for (int i = 0; i < candidates.Length; i++) {
            SnmpProfiles.Profile profile = candidates[i];

            if (profile.version != 3) {
                credentials.communities?.Add(profile.community ?? String.Empty);
                continue;
            }

            string user = profile.username ?? String.Empty;
            if (user.Length == 0) continue;

            //the user registry is keyed by user name, the first profile by priority wins
            if (owners.TryGetValue(user, out string owner)) {
                warnings.Add($"SNMPv3 user \"{user}\" is in more than one profile. Using \"{owner}\", ignoring \"{profile.name}\".");
                continue;
            }

            try {
                (IPrivacyProvider privacy, Levels level) = CreatePrivacy(profile);
                credentials.registry.Add(new OctetString(user), privacy);
                credentials.levels[user] = level;
                owners[user] = profile.name;
            }
            catch (Exception ex) {
                warnings.Add($"Profile \"{profile.name}\": {ex.Message}");
            }
        }

        credentials.warning = warnings.Count == 0 ? null : String.Join("\n", warnings);
        return credentials;
    }

    //the security level is inferred: no authentication password is noAuthNoPriv, no privacy password is authNoPriv
    private static (IPrivacyProvider, Levels) CreatePrivacy(SnmpProfiles.Profile profile) {
        if (String.IsNullOrEmpty(profile.authPassword)) {
            return (DefaultPrivacyProvider.DefaultPair, (Levels)0);
        }

#pragma warning disable CS0618 //warn end user

        OctetString authenticationPassphrase = new OctetString(profile.authPassword);
        IAuthenticationProvider authenticationProvider = profile.authAlgorithm switch {
            SnmpProfiles.AuthenticationAlgorithm.MD5    => new MD5AuthenticationProvider(authenticationPassphrase),
            SnmpProfiles.AuthenticationAlgorithm.SHA1   => new SHA1AuthenticationProvider(authenticationPassphrase),
            SnmpProfiles.AuthenticationAlgorithm.SHA256 => new SHA256AuthenticationProvider(authenticationPassphrase),
            SnmpProfiles.AuthenticationAlgorithm.SHA384 => new SHA384AuthenticationProvider(authenticationPassphrase),
            SnmpProfiles.AuthenticationAlgorithm.SHA512 => new SHA512AuthenticationProvider(authenticationPassphrase),
            _ => new SHA256AuthenticationProvider(authenticationPassphrase),
        };

        if (String.IsNullOrEmpty(profile.privacyPassword)) {
            return (new DefaultPrivacyProvider(authenticationProvider), Levels.Authentication);
        }

        OctetString privacyPassphrase = new OctetString(profile.privacyPassword);
        IPrivacyProvider privacyProvider = profile.privacyAlgorithm switch {
            SnmpProfiles.PrivacyAlgorithm.DES    => new DESPrivacyProvider(privacyPassphrase, authenticationProvider),
            SnmpProfiles.PrivacyAlgorithm.AES128 => new AESPrivacyProvider(privacyPassphrase, authenticationProvider),
            SnmpProfiles.PrivacyAlgorithm.AES192 => new AES192PrivacyProvider(privacyPassphrase, authenticationProvider),
            SnmpProfiles.PrivacyAlgorithm.AES256 => new AES256PrivacyProvider(privacyPassphrase, authenticationProvider),
            _ => new AESPrivacyProvider(privacyPassphrase, authenticationProvider),
        };

#pragma warning restore CS0618

        return (privacyProvider, Levels.Authentication | Levels.Privacy);
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
                Receive(runner, result.RemoteEndPoint, result.Buffer);
            }
            catch (Exception ex) {
                Logger.Error(ex);
            }
        }
    }

    private static string AcceptedDevice(Runner runner, IPAddress remote, string origin) {
        string file = SenderIndex.Resolve(origin) ?? SenderIndex.Resolve(remote);
        if (file is null) {
            WriteUnknownSender(runner, remote, origin);
            return null;
        }
        if (runner.config.accept == AcceptMode.Whitelist && !runner.whitelist.Contains(file)) return null;
        return file;
    }

    private static void WriteUnknownSender(Runner runner, IPAddress remote, string origin) {
        TrapListener config = runner.config;
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

        string text = $"{now.ToString(Data.DATETIME_FORMAT_FILE, CultureInfo.InvariantCulture)}\ttrap   {"Unknown",-13} {remote,-24} {(String.IsNullOrEmpty(origin) || origin == remote.ToString() ? "" : $"origin {origin}, ")}not in the devices database, dropped (UDP {config.port})";

        lock (consoleMutex) {
            try {
                Console.ForegroundColor = ConsoleColor.DarkYellow;
                Console.WriteLine(text);
                Console.ResetColor();
            }
            catch { }
        }
    }

    private static void Receive(Runner runner, IPEndPoint endpoint, byte[] buffer) {
        IPAddress remote = SenderIndex.NormalizeAddress(endpoint.Address);
        Credentials credentials = runner.credentials;

        IList<ISnmpMessage> messages;
        try {
            messages = MessageFactory.ParseMessages(buffer, 0, buffer.Length, credentials.registry);
        }
        catch {
            return;
        }

        for (int i = 0; i < messages.Count; i++) {
            Outcome outcome;
            Trap trap;
            string file;
            try {
                outcome = Decode(runner, credentials, messages[i], endpoint, remote, out trap, out file);
            }
            catch {
                outcome = Outcome.Rejected;
                trap = null;
                file = null;
            }

            if (outcome != Outcome.Accepted) continue;
            Process(runner, file, remote, trap);
        }
    }

    private static Outcome Decode(Runner runner, Credentials credentials, ISnmpMessage message, IPEndPoint endpoint, IPAddress remote, out Trap trap, out string file) {
        trap = null;
        file = null;

        //header, privacy and scope are not supported on v1 traps
        if (message is TrapV1Message v1) {
            if (!IsCommunityAccepted(credentials, v1.Community)) return Outcome.Rejected;

            string oid = V1TrapOid(v1);
            trap = new Trap {
                version   = "1",
                pdu       = "trap",
                oid       = oid,
                uptime    = v1.TimeStamp,
                origin    = v1.AgentAddress?.ToString() ?? String.Empty,
                variables = v1.Variables(),
                severity  = TrapSeverity(oid)
            };

            file = AcceptedDevice(runner, remote, trap.origin);
            return file is null ? Outcome.Rejected : Outcome.Accepted;
        }

        SnmpType type = message.TypeCode();
        string user = String.Empty;

        if (message.Version == VersionCode.V3) {
            //engine discovery, or an inform for a previous engine id: report ours (RFC 3414 3.2.3)
            if (type != SnmpType.TrapV2Pdu
                && (message.Header.SecurityLevel & Levels.Reportable) != 0
                && !IsLocalEngine(message.Parameters.EngineId)) {
                SendReport(runner, message, endpoint);
                return Outcome.Protocol;
            }

            if (type != SnmpType.TrapV2Pdu && type != SnmpType.InformRequestPdu) return Outcome.Rejected;

            user = message.Parameters.UserName.ToString();
            if (!credentials.levels.TryGetValue(user, out Levels required)) return Outcome.Rejected;
            if (message.Parameters.IsInvalid) return Outcome.Rejected;

            //a message below the user's security level would bypass authentication
            if ((message.Header.SecurityLevel & required) != required) return Outcome.Rejected;
        }
        else {
            if (type != SnmpType.TrapV2Pdu && type != SnmpType.InformRequestPdu) return Outcome.Rejected;
            if (!IsCommunityAccepted(credentials, message.Community())) return Outcome.Rejected;
        }

        (ObjectIdentifier enterprise, uint timestamp) = message switch {
            TrapV2Message o         => (o.Enterprise, o.TimeStamp),
            InformRequestMessage o  => (o.Enterprise, o.TimeStamp),
            _                       => (null, 0u)
        };
        if (enterprise is null) return Outcome.Rejected;

        IList<Variable> variables = message.Variables();
        string trapOid = enterprise.ToString();

        trap = new Trap {
            version   = message.Version == VersionCode.V3 ? "3" : "2c",
            pdu       = type == SnmpType.InformRequestPdu ? "inform" : "trap",
            user      = user,
            oid       = trapOid,
            uptime    = timestamp,
            origin    = FindTrapAddress(variables),
            variables = variables,
            severity  = TrapSeverity(trapOid)
        };

        file = AcceptedDevice(runner, remote, trap.origin);
        if (file is null) return Outcome.Rejected;

        if (type == SnmpType.InformRequestPdu) {
            if (message.Version == VersionCode.V3) {
                SendV3Response(runner, message, endpoint);
            }
            else {
                ResponseMessage response = new ResponseMessage(message.RequestId(), message.Version, message.Community(), ErrorCode.NoError, 0, message.Pdu().Variables);
                SendTo(runner, response.ToBytes(), endpoint);
            }
        }

        return Outcome.Accepted;
    }

    private static bool IsCommunityAccepted(Credentials credentials, OctetString community) {
        return credentials.communities is null || credentials.communities.Contains(community?.ToString() ?? String.Empty);
    }

    private static bool IsLocalEngine(OctetString id) {
        return id is not null && id.GetRaw().AsSpan().SequenceEqual(engineId);
    }

    //RFC 3584 3.1
    private static string V1TrapOid(TrapV1Message trap) {
        if (trap.Generic != GenericCode.EnterpriseSpecific) {
            return $"{OID_SNMP_TRAPS}{(int)trap.Generic + 1}";
        }
        return $"{trap.Enterprise}.0.{trap.Specific}";
    }

    //the original sender, when a trap is forwarded (RFC 3584 3.1)
    private static string FindTrapAddress(IList<Variable> variables) {
        for (int i = 0; i < variables.Count; i++) {
            if (variables[i].Id.ToString() == OID_SNMP_TRAP_ADDRESS) return variables[i].Data.ToString();
        }
        return String.Empty;
    }

    //fixed for the standard traps, the severity of any other trap is not known
    private static byte TrapSeverity(string oid) => oid switch {
        "1.3.6.1.6.3.1.1.5.3" => (byte)Severity.Major,   //linkDown
        "1.3.6.1.6.3.1.1.5.6" => (byte)Severity.Major,   //egpNeighborLoss
        "1.3.6.1.6.3.1.1.5.1" => (byte)Severity.Warning, //coldStart
        "1.3.6.1.6.3.1.1.5.2" => (byte)Severity.Warning, //warmStart
        "1.3.6.1.6.3.1.1.5.5" => (byte)Severity.Warning, //authenticationFailure
        "1.3.6.1.6.3.1.1.5.4" => (byte)Severity.Cleared, //linkUp, clears linkDown
        _ => (byte)Severity.Indeterminate
    };

    private static void SendReport(Runner runner, ISnmpMessage request, IPEndPoint endpoint) {
        int requestId;
        try {
            requestId = request.RequestId();
        }
        catch {
            requestId = 0; //encrypted with keys of another engine
        }

        OctetString id = new OctetString(engineId);
        ReportMessage report = new ReportMessage(
            VersionCode.V3,
            new Header(new Integer32(request.MessageId()), new Integer32(Messenger.MaxMessageSize), (Levels)0),
            new SecurityParameters(id, new Integer32(engineBoots), new Integer32(EngineTime), OctetString.Empty, OctetString.Empty, OctetString.Empty),
            new Scope(id, OctetString.Empty, new ReportPdu(requestId, ErrorCode.NoError, 0, new List<Variable>(1) {
                new Variable(new ObjectIdentifier(OID_USM_UNKNOWN_ENGINE_ID), new Counter32((uint)Interlocked.Increment(ref unknownEngineIds)))
            })),
            DefaultPrivacyProvider.DefaultPair,
            null);

        SendTo(runner, report.ToBytes(), endpoint);
    }

    private static void SendV3Response(Runner runner, ISnmpMessage request, IPEndPoint endpoint) {
        Levels level = request.Header.SecurityLevel & ~Levels.Reportable;
        OctetString id = new OctetString(engineId);

        ResponseMessage response = new ResponseMessage(
            VersionCode.V3,
            new Header(new Integer32(request.MessageId()), new Integer32(Messenger.MaxMessageSize), level),
            new SecurityParameters(
                id,
                new Integer32(engineBoots),
                new Integer32(EngineTime),
                request.Parameters.UserName,
                request.Privacy.AuthenticationProvider.CleanDigest,
                request.Privacy.Salt),
            new Scope(id, request.Scope.ContextName, new ResponsePdu(request.RequestId(), ErrorCode.NoError, 0, request.Pdu().Variables)),
            request.Privacy,
            (level & Levels.Authentication) != 0,
            null);

        SendTo(runner, response.ToBytes(), endpoint);
    }

    private static void SendTo(Runner runner, byte[] bytes, IPEndPoint endpoint) {
        try {
            runner.udp.Send(bytes, bytes.Length, endpoint);
        }
        catch (Exception ex) {
            Logger.Error(ex);
        }
    }

    private static void Process(Runner runner, string file, IPAddress remote, Trap trap) {
        TrapListener config = runner.config;

        int severity = trap.severity;
        bool toConsole = severity <= config.console;
        bool toDisk    = severity <= config.disk;
        bool toEmail   = severity <= config.email;
        bool toLive    = severity <= config.live;

        if (!toConsole && !toDisk && !toEmail && !toLive) return;

        DateTime now = DateTime.UtcNow;

        if (toDisk || toLive) {
            string line = FormatLine(now, trap, remote);

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
            WriteConsole(now, trap, remote);
        }

        if (toEmail) {
            if (Interlocked.Increment(ref runner.emailCount) <= MAX_EMAIL_LINES) {
                runner.emailQueue.Enqueue(new EmailItem(now, file, remote, trap));
            }
            else {
                Interlocked.Decrement(ref runner.emailCount);
                Interlocked.Increment(ref runner.emailOverflow);
            }
        }
    }

    private static string FormatLine(DateTime time, Trap trap, IPAddress remote) {
        StringBuilder builder = new StringBuilder(256);
        builder.Append(time.ToString(TIMESTAMP_FORMAT, CultureInfo.InvariantCulture)).Append('\t');
        builder.Append((char)('0' + trap.severity)).Append('\t');
        builder.Append(trap.version).Append('\t');
        builder.Append(remote).Append('\t');
        builder.Append(trap.pdu).Append('\t');
        AppendEscaped(builder, trap.user).Append('\t');
        builder.Append(trap.oid).Append('\t');
        builder.Append(trap.uptime).Append('\t');
        AppendEscaped(builder, trap.origin).Append('\t');
        builder.Append(VariablesToJson(trap.variables));
        return builder.ToString();
    }

    private static string VariablesToJson(IList<Variable> variables) {
        using MemoryStream ms = new MemoryStream();
        using (Utf8JsonWriter writer = new Utf8JsonWriter(ms, jsonWriterOptions)) {
            writer.WriteStartArray();
            int count = Math.Min(variables?.Count ?? 0, MAX_VARIABLES);
            for (int i = 0; i < count; i++) {
                (string type, string value) = FormatValue(variables[i].Data);
                writer.WriteStartArray();
                writer.WriteStringValue(variables[i].Id.ToString());
                writer.WriteStringValue(type);
                writer.WriteStringValue(value);
                writer.WriteEndArray();
            }
            writer.WriteEndArray();
        }
        return Encoding.UTF8.GetString(ms.ToArray());
    }

    private static (string, string) FormatValue(ISnmpData data) {
        string type;
        string value;

        switch (data.TypeCode) {
        case SnmpType.Null:
        case SnmpType.NoSuchObject:
        case SnmpType.NoSuchInstance:
        case SnmpType.EndOfMibView:
            type = data.TypeCode.ToString();
            value = String.Empty;
            break;

        case SnmpType.OctetString:
            byte[] raw = ((OctetString)data).GetRaw();
            if (IsPrintable(raw)) {
                type = "OctetString";
                value = Encoding.UTF8.GetString(raw);
            }
            else {
                type = "Hex";
                value = Convert.ToHexString(raw, 0, Math.Min(raw.Length, MAX_VALUE_LENGTH / 2));
            }
            break;

        case SnmpType.TimeTicks:
            type = "TimeTicks";
            value = ((TimeTicks)data).ToUInt32().ToString(CultureInfo.InvariantCulture);
            break;

        default:
            type = data.TypeCode.ToString();
            value = data.ToString();
            break;
        }

        if (value.Length > MAX_VALUE_LENGTH) value = value[..MAX_VALUE_LENGTH];
        return (type, value);
    }

    private static bool IsPrintable(byte[] raw) {
        string text;
        try {
            text = new UTF8Encoding(false, true).GetString(raw);
        }
        catch (DecoderFallbackException) {
            return false;
        }

        for (int i = 0; i < text.Length; i++) {
            char c = text[i];
            if (c < 0x20 && c != '\t' && c != '\r' && c != '\n') return false;
            if (c == 0x7f) return false;
        }
        return true;
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

    private static string TrapName(string oid) {
        return STANDARD_TRAPS.TryGetValue(oid, out string name) ? name : oid;
    }

    private static string VariablesToText(IList<Variable> variables, string separator) {
        if (variables is null || variables.Count == 0) return String.Empty;

        StringBuilder builder = new StringBuilder();
        int count = Math.Min(variables.Count, MAX_VARIABLES);
        for (int i = 0; i < count; i++) {
            if (i > 0) builder.Append(separator);
            (_, string value) = FormatValue(variables[i].Data);
            builder.Append(variables[i].Id).Append(" = ");

            //keep each trap on one line
            for (int j = 0; j < value.Length; j++) {
                char c = value[j];
                builder.Append(c < 0x20 || c == 0x7f ? ' ' : c);
            }
        }
        return builder.ToString();
    }

    private static void WriteConsole(DateTime time, Trap trap, IPAddress remote) {
        ConsoleColor color = (Severity)trap.severity switch {
            Severity.Critical      => ConsoleColor.Red,
            Severity.Major         => ConsoleColor.DarkYellow,
            Severity.Minor         => ConsoleColor.Yellow,
            Severity.Warning       => ConsoleColor.Cyan,
            Severity.Indeterminate => ConsoleColor.Magenta,
            Severity.Cleared       => ConsoleColor.Green,
            _                      => ConsoleColor.Gray
        };

        string variables = VariablesToText(trap.variables, ", ");
        string text = $"{time.ToString(Data.DATETIME_FORMAT_FILE, CultureInfo.InvariantCulture)}\ttrap   {(Severity)trap.severity,-13} {remote,-24} {TrapName(trap.oid)}{(variables.Length > 0 ? ": " : "")}{variables}";

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

        string directory = Path.Join(Data.DIR_SNMP_TRAPS, entry.file);
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
                writer.WriteString("action", "snmptraps");
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

            KeepAlive.Broadcast(ms.ToArray(), "/snmptraps");
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
            TrapListener config = runner.config;

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
                Logger.Error("SNMP traps: SMTP profile not found");
                return;
            }

            int total = items.Count + overflow;
            string listenerName = String.IsNullOrEmpty(config.name) ? $"UDP {config.port}" : config.name;
            string subject = $"SNMP trap notification - {listenerName} - {total} trap{(total == 1 ? "" : "s")} - {DateTime.Now.ToString(Data.DATETIME_FORMAT_TIMEZONE)}";

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
        body.Append($"<tr><td style=\"height:40px;color:#202020;font-size:20px;text-align:center\"><b>SNMP traps - {Encode(listenerName)}</b></td></tr>");

        body.Append("<tr><td style=\"padding:10px\">");
        body.Append("<table width=\"100%\" cellpadding=\"4\" cellspacing=\"0\" style=\"font-family:monospace;font-size:13px;color:#202020\">");
        body.Append("<tr style=\"background-color:#c0c0c0\"><th align=\"left\">Time</th><th align=\"left\">Device</th><th align=\"left\">Severity</th><th align=\"left\">Trap</th><th align=\"left\">Variables</th></tr>");

        for (int i = 0; i < items.Count; i++) {
            EmailItem item = items[i];
            string color = (Severity)item.trap.severity switch {
                Severity.Critical => "#c00000",
                Severity.Major    => "#e06000",
                Severity.Minor    => "#a08000",
                Severity.Warning  => "#1070a0",
                _                 => "#202020"
            };

            body.Append($"<tr style=\"color:{color};vertical-align:top\">");
            body.Append($"<td style=\"white-space:nowrap\">{item.time.ToLocalTime().ToString(Data.DATETIME_FORMAT_FILE, CultureInfo.InvariantCulture)}</td>");
            body.Append($"<td>{Encode(GetDeviceName(item.file, item.remote))}</td>");
            body.Append($"<td>{(Severity)item.trap.severity}</td>");
            body.Append($"<td>{Encode(TrapName(item.trap.oid))}</td>");
            body.Append($"<td>{Encode(VariablesToText(item.trap.variables, "\n")).Replace("\n", "<br>")}</td>");
            body.Append("</tr>");
        }

        body.Append("</table>");
        body.Append("</td></tr>");

        if (overflow > 0) {
            body.Append($"<tr><td style=\"padding:10px;color:#606060\">and {overflow} more trap{(overflow == 1 ? "" : "s")} not included.</td></tr>");
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
            DirectoryInfo dir = new DirectoryInfo(Data.DIR_SNMP_TRAPS);
            string[] files = dir.Exists
                ? dir.GetDirectories().Select(o => o.Name).Order(StringComparer.Ordinal).ToArray()
                : Array.Empty<string>();
            return JsonSerializer.SerializeToUtf8Bytes(files, SnmpTrapsJsonContext.Default.StringArray);
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
        const int MAX_SEVERITY = (int)Severity.Cleared;
        int levelMask = (1 << (MAX_SEVERITY + 1)) - 1;
        if (parameters.TryGetValue("levels", out string levelsString)) {
            levelMask = 0;
            for (int i = 0; i < levelsString.Length; i++) {
                if (levelsString[i] >= '0' && levelsString[i] <= '0' + MAX_SEVERITY) levelMask |= 1 << (levelsString[i] - '0');
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

            DirectoryInfo root = new DirectoryInfo(Data.DIR_SNMP_TRAPS);
            DirectoryInfo[] directories = !root.Exists ? Array.Empty<DirectoryInfo>()
                : device is null ? root.GetDirectories()
                : Directory.Exists(Path.Join(Data.DIR_SNMP_TRAPS, device)) ? [new DirectoryInfo(Path.Join(Data.DIR_SNMP_TRAPS, device))]
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

    private static bool IsDigits(string value) {
        for (int i = 0; i < value.Length; i++) {
            if (!char.IsAsciiDigit(value[i])) return false;
        }
        return true;
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
                if (severity < 0 || severity > (int)Severity.Cleared || (levelMask & (1 << severity)) == 0) continue;

                if (before is not null && String.CompareOrdinal(line, 0, before, 0, TIMESTAMP_LENGTH) > 0) continue;
                if (to is not null && String.CompareOrdinal(line, 0, to, 0, TIMESTAMP_LENGTH) >= 0) continue;
                if (from is not null && String.CompareOrdinal(line, 0, from, 0, TIMESTAMP_LENGTH) < 0) continue;

                if (query is not null) {
                    //match on source, pdu, user, trap oid, uptime, origin and variables
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
            DirectoryInfo root = new DirectoryInfo(Data.DIR_SNMP_TRAPS);
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
[JsonSerializable(typeof(Traps.TrapListener[]))]
[JsonSerializable(typeof(Traps.EngineState))]
[JsonSerializable(typeof(string[]))]
internal partial class SnmpTrapsJsonContext : JsonSerializerContext {}

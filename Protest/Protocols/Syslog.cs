using System.Collections.Concurrent;
using System.IO;
using System.Net;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Text;

namespace Protest.Protocols;

internal static class Syslog {
    private static readonly Lock mutex;

    private static readonly string DEFAULT = """
    [{
        "enabled"    : false,
        "guid"       : "00000000-0000-0000-0000-000000000001",
        "protocol"   : 3,
        "bindAddress": "0.0.0.0",
        "port"       : 6514
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

    internal sealed class SyslogListener {
        public bool enabled;
        public Guid guid;
        public TransportProtocol protocol;
        public IPAddress bindAddress = IPAddress.Any;
        public ushort port;
    }

    internal static ConcurrentDictionary<Guid, SyslogListener> listeners = new ConcurrentDictionary<Guid, SyslogListener>();

    static Syslog() {
        mutex = new Lock();

        SyslogListener[] loaded = Load();

        foreach (SyslogListener listener in loaded) {
            if (!listeners.TryAdd(listener.guid, listener)) continue;

            if (listener.enabled) {
                StartListener(listener);
            }
        }
    }

    internal static SyslogListener[] Load() {
        if (!File.Exists(Data.FILE_SYSLOG_LISTENERS)) {
            SyslogListener[] Listeners = JsonSerializer.Deserialize<SyslogListener[]>(DEFAULT);
            return Listeners;
        }

        try {
            byte[] bytes;
            lock (mutex) {
                bytes = File.ReadAllBytes(Data.FILE_SYSLOG_LISTENERS);
            }

            byte[] plain = Cryptography.Decrypt(bytes, Configuration.DB_KEY, Configuration.DB_KEY_IV);

            SyslogListener[] listeners = JsonSerializer.Deserialize<SyslogListener[]>(plain, SyslogJsonContext.Default.SyslogListenerArray);
            
            if (listeners is null) return Array.Empty<SyslogListener>();
            return listeners;
        }
        catch {
            return Array.Empty<SyslogListener>();
        }
    }

    internal static byte[] List() {
        if (!File.Exists(Data.FILE_SYSLOG_LISTENERS)) {
            return Encoding.UTF8.GetBytes(DEFAULT);
        }

        try {
            byte[] bytes;
            lock (mutex) {
                bytes = File.ReadAllBytes(Data.FILE_SYSLOG_LISTENERS);
            }

            byte[] plain = Cryptography.Decrypt(bytes, Configuration.DB_KEY, Configuration.DB_KEY_IV);
            return plain;
        }
        catch {
            return "[]"u8.ToArray();
        }
    }

    internal static byte[] Save(HttpListenerContext ctx, string origin) {
        using StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding);
        string payload = reader.ReadToEnd();

        try {
            SyslogListener[] listeners = JsonSerializer.Deserialize<SyslogListener[]>(payload, SyslogJsonContext.Default.SyslogListenerArray);
            if (listeners is null) return "[]"u8.ToArray();

            for (int i = 0; i < listeners.Length; i++) {
                if (listeners[i].guid == Guid.Empty) {
                    listeners[i].guid = Guid.NewGuid();
                }
            }

            byte[] plain = JsonSerializer.SerializeToUtf8Bytes(listeners, SyslogJsonContext.Default.SyslogListenerArray);
            byte[] cipher = Cryptography.Encrypt(plain, Configuration.DB_KEY, Configuration.DB_KEY_IV);
            lock (mutex) {
                File.WriteAllBytes(Data.FILE_SYSLOG_LISTENERS, cipher);
            }

            Logger.Action(origin, "Environment", "Modify SysLog configuration");
        }
        catch (JsonException) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }
        catch (Exception) {
            return Data.CODE_FAILED.Array;
        }

        return Data.CODE_OK.Array;
    }

    internal static bool AddListener(SyslogListener listener) {
        if (listener.port == 0) {
            throw new ArgumentOutOfRangeException(nameof(listener), "Port must be greater than zero.");
        }

        return listeners.TryAdd(listener.guid, listener);
    }

    internal static bool RemoveListener(Guid guid) {
        return listeners.TryRemove(guid, out _);
    }

    internal static bool StartListener(SyslogListener listener) {
        return false;
    }

    internal static bool StopListener(SyslogListener listener) {
        return false;
    }
}

[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase, IncludeFields = true)]
[JsonSerializable(typeof(Syslog.SyslogListener[]))]
internal partial class SyslogJsonContext : JsonSerializerContext {}
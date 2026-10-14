using System.Collections.Generic;
using System.Net;
using System.Threading;

namespace Protest.Protocols;

internal static class SenderIndex {
    private sealed class Index {
        public readonly Dictionary<IPAddress, string> ip = new Dictionary<IPAddress, string>();
        public readonly Dictionary<string, string> fqdn = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        public readonly Dictionary<string, string> label = new Dictionary<string, string>(StringComparer.Ordinal);
    }

    private static readonly string[] NAME_ATTRIBUTES = ["hostname", "name"];

    private static readonly Lock mutex = new Lock();
    private static long indexVersion = long.MinValue;
    private static Index index = new Index();

    internal static IPAddress NormalizeAddress(IPAddress address) {
        return address.IsIPv4MappedToIPv6 ? address.MapToIPv4() : address;
    }

    internal static string Resolve(IPAddress address) {
        if (address is null) return null;
        Index current = Current();
        if (current is null) return null;
        return current.ip.TryGetValue(NormalizeAddress(address), out string file) ? file : null;
    }

    //an ip literal, as reported inside a packet
    internal static string Resolve(string address) {
        if (String.IsNullOrEmpty(address)) return null;
        if (!IPAddress.TryParse(address, out IPAddress ip)) return null;
        return Resolve(ip);
    }

    //an ip literal, a fully qualified or a short host name
    internal static string ResolveHost(string host) {
        if (String.IsNullOrEmpty(host)) return null;
        if (IPAddress.TryParse(host, out IPAddress ip)) return Resolve(ip);
        if (IsGeneric(host)) return null;

        Index current = Current();
        if (current is null) return null;

        int dot = host.IndexOf('.');
        if (dot > 0 && current.fqdn.TryGetValue(host, out string file)) return file;

        string label = Simplify(dot < 0 ? host : host[..dot]);
        if (label.Length == 0) return null;
        return current.label.TryGetValue(label, out file) ? file : null;
    }

    private static string Simplify(ReadOnlySpan<char> name) {
        Span<char> buffer = name.Length <= 256 ? stackalloc char[name.Length] : new char[name.Length];
        int length = 0;
        foreach (char c in name) {
            if (char.IsLetterOrDigit(c)) buffer[length++] = char.ToLowerInvariant(c);
        }
        return new string(buffer[..length]);
    }

    private static bool IsGeneric(string host) {
        return host.Equals("localhost", StringComparison.OrdinalIgnoreCase)
            || host.StartsWith("localhost.", StringComparison.OrdinalIgnoreCase)
            || host == "-";
    }

    private static Index Current() {
        Database db = DatabaseInstances.devices;
        if (db is null) return null;

        long version = Interlocked.Read(ref db.version);
        if (version == Interlocked.Read(ref indexVersion)) return Volatile.Read(ref index);

        lock (mutex) {
            if (version != Interlocked.Read(ref indexVersion)) {
                Volatile.Write(ref index, Build(db));
                Interlocked.Exchange(ref indexVersion, version);
            }
            return index;
        }
    }

    private static Index Build(Database db) {
        Index next = new Index();

        foreach (KeyValuePair<string, Database.Entry> pair in db.dictionary) {
            if (pair.Value.attributes.TryGetValue("ip", out Database.Attribute ip) && !String.IsNullOrEmpty(ip?.value)) {
                foreach (string value in Split(ip.value)) {
                    if (IPAddress.TryParse(value, out IPAddress address)) {
                        next.ip.TryAdd(NormalizeAddress(address), pair.Key);
                    }
                }
            }

            foreach (string attribute in NAME_ATTRIBUTES) {
                if (!pair.Value.attributes.TryGetValue(attribute, out Database.Attribute name) || String.IsNullOrEmpty(name?.value)) continue;

                foreach (string value in Split(name.value)) {
                    if (IPAddress.TryParse(value, out _) || IsGeneric(value)) continue;

                    //a display name, as a whole
                    if (value.Contains(' ')) {
                        AddName(next.label, Simplify(value), pair.Key);
                        continue;
                    }

                    int dot = value.IndexOf('.');
                    if (dot > 0) AddName(next.fqdn, value, pair.Key);
                    AddName(next.label, Simplify(dot < 0 ? value : value[..dot]), pair.Key);
                }
            }
        }

        return next;
    }

    private static string[] Split(string value) {
        return value.Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
    }

    private static void AddName(Dictionary<string, string> names, string name, string file) {
        if (name.Length == 0) return;
        if (names.TryGetValue(name, out string existing)) {
            if (existing != file) names[name] = null; //ambiguous, never resolves
            return;
        }
        names.Add(name, file);
    }
}

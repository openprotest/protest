using System.Buffers.Binary;
using System.Collections.Generic;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Threading;
using System.Threading.Tasks;

namespace Protest.Protocols;

internal static partial class Rtsp {

    //What a stream may use, and the hooks the tests replace.
    internal sealed class Settings {
        public DestinationPolicy policy;
        public SessionLimits limits;
        public Func<string, CancellationToken, Task<IPAddress[]>> resolve = System.Net.Dns.GetHostAddressesAsync;
        public int handshakeTimeout = 20_000;      //resolving, connecting, TLS and the RTSP setup together
        public int idleTimeout = 30_000;           //without video from the camera
        public int sendTimeout = 30_000;           //for a single message to the browser
        public int authorizationInterval = 5_000;

        public static Settings FromConfiguration() => new Settings {
            policy = DestinationPolicy.FromConfiguration(),
            limits = SessionLimits.shared
        };
    }

    //The authenticated principal behind a WebSocket, and how its rights are checked again while it streams.
    internal sealed class Client {
        public string origin;
        public Func<bool> isAuthorized;
        public Func<Guid, string, CredentialLookup> lookupCredential;
        public Action<string> audit;
    }

    internal sealed class CredentialLookup {
        public bool found;
        public bool allowed;
        public string username;
        public string password;
    }

    internal sealed class DestinationException : Exception {
        public readonly string detail; //for the server log only

        public DestinationException(string message, string detail) : base(message) {
            this.detail = detail;
        }
    }

    //Which camera addresses the gateway connects to. Loopback, unspecified, link-local (with the cloud metadata service at
    //169.254.169.254), multicast and broadcast addresses are refused. rtsp_allow excepts addresses from that, rtsp_deny
    //refuses more and takes precedence. A name is resolved once and every address it resolves to has to be allowed,
    //the connection then goes to those addresses only, so a second lookup can't lead it elsewhere.
    internal sealed class DestinationPolicy {
        private static readonly (IPNetwork network, string description)[] PROHIBITED = {
            (IPNetwork.Parse("0.0.0.0/8"),          "an unspecified address"),
            (IPNetwork.Parse("127.0.0.0/8"),        "a loopback address"),
            (IPNetwork.Parse("169.254.0.0/16"),     "a link-local address"),
            (IPNetwork.Parse("224.0.0.0/4"),        "a multicast address"),
            (IPNetwork.Parse("240.0.0.0/4"),        "a reserved or broadcast address"),
            (IPNetwork.Parse("100.100.100.200/32"), "a cloud metadata address"),
            (IPNetwork.Parse("::/96"),              "an unspecified, loopback or IPv4-compatible address"),
            (IPNetwork.Parse("fe80::/10"),          "a link-local address"),
            (IPNetwork.Parse("ff00::/8"),           "a multicast address"),
            (IPNetwork.Parse("fd00:ec2::254/128"),  "a cloud metadata address")
        };

        private static readonly IPNetwork NAT64 = IPNetwork.Parse("64:ff9b::/96");
        private static readonly IPNetwork SIX_TO_FOUR = IPNetwork.Parse("2002::/16");

        private readonly IPNetwork[] allow;
        private readonly IPNetwork[] deny;
        private readonly Func<IEnumerable<IPAddress>> broadcasts;

        public DestinationPolicy(IEnumerable<IPNetwork> allow, IEnumerable<IPNetwork> deny, Func<IEnumerable<IPAddress>> broadcasts = null) {
            this.allow = allow?.ToArray() ?? Array.Empty<IPNetwork>();
            this.deny = deny?.ToArray() ?? Array.Empty<IPNetwork>();
            this.broadcasts = broadcasts;
        }

        public static DestinationPolicy FromConfiguration() =>
            new DestinationPolicy(Configuration.rtspAllow, Configuration.rtspDeny, LocalBroadcasts);

        public bool IsAllowed(IPAddress address, out string reason) {
            address = Normalize(address);
            IPAddress embedded = EmbeddedIPv4(address);

            if (Matches(deny, address) || embedded is not null && Matches(deny, embedded)) {
                reason = "listed in rtsp_deny";
                return false;
            }

            if (Matches(allow, address)) {
                reason = null;
                return true;
            }

            foreach ((IPNetwork network, string description) in PROHIBITED) {
                if (network.Contains(address)) {
                    reason = description;
                    return false;
                }
            }

            //NAT64 and 6to4 carry an IPv4 address, which has to be allowed too
            if (embedded is not null && !Matches(allow, embedded) && !IsAllowed(embedded, out reason)) {
                return false;
            }

            if (address.AddressFamily == AddressFamily.InterNetwork && broadcasts is not null && broadcasts().Contains(address)) {
                reason = "a broadcast address";
                return false;
            }

            reason = null;
            return true;
        }

        //every address must be allowed, a name resolving to an allowed and a refused address is refused as a whole
        public async Task<IPAddress[]> ResolveAsync(string host, Func<string, CancellationToken, Task<IPAddress[]>> resolve, CancellationToken token) {
            IPAddress[] addresses;

            if (IPAddress.TryParse(host, out IPAddress literal)) {
                addresses = new[] { literal };
            }
            else {
                try {
                    addresses = await resolve(host, token);
                }
                catch (SocketException ex) {
                    throw new DestinationException("Host not found", ex.SocketErrorCode.ToString());
                }
            }

            if (addresses is null || addresses.Length == 0) throw new DestinationException("Host not found", "no address");

            foreach (IPAddress address in addresses) {
                if (!IsAllowed(address, out string reason)) {
                    throw new DestinationException(DESTINATION_REFUSED, $"{Normalize(address)} is {reason}");
                }
            }

            return addresses.Select(Normalize).Distinct().ToArray();
        }

        internal static IPAddress Normalize(IPAddress address) {
            if (address.IsIPv4MappedToIPv6) return address.MapToIPv4();
            if (address.AddressFamily == AddressFamily.InterNetworkV6 && address.ScopeId != 0) return new IPAddress(address.GetAddressBytes());
            return address;
        }

        private static IPAddress EmbeddedIPv4(IPAddress address) {
            if (address.AddressFamily != AddressFamily.InterNetworkV6) return null;
            byte[] bytes = address.GetAddressBytes();
            if (NAT64.Contains(address)) return new IPAddress(bytes.AsSpan(12, 4));
            if (SIX_TO_FOUR.Contains(address)) return new IPAddress(bytes.AsSpan(2, 4));
            return null;
        }

        private static bool Matches(IPNetwork[] networks, IPAddress address) {
            foreach (IPNetwork network in networks) {
                if (network.Contains(address)) return true;
            }
            return false;
        }

        //the directed broadcast addresses of this host's IPv4 networks
        private static IEnumerable<IPAddress> LocalBroadcasts() {
            List<IPAddress> addresses = new List<IPAddress>();
            try {
                foreach (NetworkInterface nic in NetworkInterface.GetAllNetworkInterfaces()) {
                    foreach (UnicastIPAddressInformation unicast in nic.GetIPProperties().UnicastAddresses) {
                        if (unicast.Address.AddressFamily != AddressFamily.InterNetwork || unicast.PrefixLength is <= 0 or >= 31) continue;

                        uint ip = BinaryPrimitives.ReadUInt32BigEndian(unicast.Address.GetAddressBytes());
                        uint host = uint.MaxValue >> unicast.PrefixLength;
                        byte[] broadcast = new byte[4];
                        BinaryPrimitives.WriteUInt32BigEndian(broadcast, ip | host);
                        addresses.Add(new IPAddress(broadcast));
                    }
                }
            }
            catch (NetworkInformationException) { }
            catch (PlatformNotSupportedException) { }
            return addresses;
        }

        //addresses or ranges, separated by commas, as protest.cfg lists them
        internal static bool TryParseNetworks(string value, List<IPNetwork> networks) {
            bool valid = true;
            foreach (string item in value.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)) {
                if (IPNetwork.TryParse(item, out IPNetwork network)) {
                    networks.Add(network);
                }
                else if (IPAddress.TryParse(item, out IPAddress address)) {
                    address = Normalize(address);
                    networks.Add(new IPNetwork(address, address.AddressFamily == AddressFamily.InterNetwork ? 32 : 128));
                }
                else {
                    valid = false;
                }
            }
            return valid;
        }
    }

    //Concurrent streams per user and in total, and connection attempts per user and minute.
    internal sealed class SessionLimits {
        public static readonly SessionLimits shared = new SessionLimits(() => Configuration.rtspMaxSessions, () => Configuration.rtspMaxUserSessions, () => 60);

        private readonly object sync = new object();
        private readonly Dictionary<string, int> sessions = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        private readonly Dictionary<string, Queue<long>> attempts = new Dictionary<string, Queue<long>>(StringComparer.OrdinalIgnoreCase);
        private readonly Func<int> maxSessions, maxUserSessions, maxAttemptsPerMinute;
        private int total;

        public SessionLimits(Func<int> maxSessions, Func<int> maxUserSessions, Func<int> maxAttemptsPerMinute) {
            this.maxSessions = maxSessions;
            this.maxUserSessions = maxUserSessions;
            this.maxAttemptsPerMinute = maxAttemptsPerMinute;
        }

        public int Total {
            get { lock (sync) return total; }
        }

        //a lease to release once the stream ends, null when a limit is reached
        public Lease TryAcquire(string user, out string error) {
            long now = Environment.TickCount64;

            lock (sync) {
                if (!attempts.TryGetValue(user, out Queue<long> recent)) {
                    attempts[user] = recent = new Queue<long>();
                }
                while (recent.Count > 0 && now - recent.Peek() > 60_000) recent.Dequeue();

                if (recent.Count >= maxAttemptsPerMinute()) {
                    error = "Too many connection attempts, try again in a minute";
                    return null;
                }
                recent.Enqueue(now);

                sessions.TryGetValue(user, out int count);
                if (count >= maxUserSessions()) {
                    error = "Too many open camera streams";
                    return null;
                }
                if (total >= maxSessions()) {
                    error = "The server has reached its limit of camera streams";
                    return null;
                }

                sessions[user] = count + 1;
                total++;
            }

            error = null;
            return new Lease(this, user);
        }

        private void Release(string user) {
            lock (sync) {
                total--;
                if (sessions.TryGetValue(user, out int count)) {
                    if (count <= 1) sessions.Remove(user);
                    else sessions[user] = count - 1;
                }
            }
        }

        internal sealed class Lease : IDisposable {
            private readonly SessionLimits limits;
            private readonly string user;
            private int released;

            public Lease(SessionLimits limits, string user) {
                this.limits = limits;
                this.user = user;
            }

            public void Dispose() {
                if (Interlocked.Exchange(ref released, 1) == 0) limits.Release(user);
            }
        }
    }

    //The syntax every value has to have before it goes into a request, and the sanitizing of what goes to logs and the UI.
    internal static class Syntax {
        //RFC 7230 tchar
        public static bool IsToken(string value) {
            if (String.IsNullOrEmpty(value) || value.Length > 64) return false;
            foreach (char c in value) {
                if (c is >= 'a' and <= 'z' or >= 'A' and <= 'Z' or >= '0' and <= '9') continue;
                if ("!#$%&'*+-.^_`|~".IndexOf(c) >= 0) continue;
                return false;
            }
            return true;
        }

        //any visible character, spaces and tabs, no control characters
        public static bool IsHeaderValue(string value) {
            if (value is null || value.Length > MAX_HEADER_VALUE_LENGTH) return false;
            foreach (char c in value) {
                if (c < ' ' && c != '\t' || c == 0x7f) return false;
            }
            return true;
        }

        //a request target, an absolute rtsp or rtsps URL in printable ASCII
        public static bool IsRequestTarget(string value) {
            if (String.IsNullOrEmpty(value) || value.Length > MAX_URL_LENGTH) return false;
            foreach (char c in value) {
                if (c <= ' ' || c >= 0x7f) return false;
            }
            return Uri.TryCreate(value, UriKind.Absolute, out Uri uri)
                && (uri.Scheme.Equals("rtsp", StringComparison.OrdinalIgnoreCase) || uri.Scheme.Equals("rtsps", StringComparison.OrdinalIgnoreCase))
                && uri.UserInfo.Length == 0;
        }

        //RFC 7826, 1 to 256 of ALPHA, DIGIT and $-_.+
        public static bool IsSessionId(string value) {
            if (String.IsNullOrEmpty(value) || value.Length > 256) return false;
            foreach (char c in value) {
                if (c is >= 'a' and <= 'z' or >= 'A' and <= 'Z' or >= '0' and <= '9') continue;
                if ("$-_.+".IndexOf(c) >= 0) continue;
                return false;
            }
            return true;
        }

        //the content of a quoted string, any visible character, spaces and tabs
        public static bool IsQuotable(string value, int maxLength = 1_024) {
            if (value is null || value.Length > maxLength) return false;
            foreach (char c in value) {
                if (c < ' ' && c != '\t' || c == 0x7f) return false;
            }
            return true;
        }

        public static bool IsCredential(string value) =>
            value is null || IsQuotable(value, MAX_CREDENTIAL_LENGTH);

        //printable and short, for logs and the stream information
        public static string Sanitize(string value, int maxLength = 256) {
            if (value is null) return null;
            Span<char> buffer = stackalloc char[Math.Min(value.Length, maxLength)];
            for (int i = 0; i < buffer.Length; i++) {
                char c = value[i];
                buffer[i] = c < ' ' || c == 0x7f ? ' ' : c;
            }
            return value.Length > maxLength ? $"{new string(buffer)}..." : new string(buffer);
        }
    }
}

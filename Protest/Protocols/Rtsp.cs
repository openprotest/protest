using System.Buffers.Binary;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Security;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Security.Authentication;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Channels;
using System.Threading.Tasks;
using Protest.Http;

namespace Protest.Protocols;

//RTSP and RTSPS client for the camera viewer. The gateway sets up the session with the camera, takes the RTP stream
//interleaved on the RTSP connection, reassembles the video frames and forwards each frame as a single WebSocket message.
//The browser decodes H.264 and H.265 with WebCodecs, and MJPEG as images.
internal static partial class Rtsp {

    private const string RESOURCE = "/ws/rtsp";
    private const int DEFAULT_PORT = 554;
    private const int DEFAULT_SECURE_PORT = 322;
    private const int CLOSE_TIMEOUT = 2_000;
    private const int MAX_REQUEST_LENGTH = 8_192;
    private const int MAX_URL_LENGTH = 2_048;
    private const int MAX_CREDENTIAL_LENGTH = 256;
    private const int MAX_HEADER_LENGTH = 16_384;
    private const int MAX_HEADER_COUNT = 64;
    private const int MAX_HEADER_VALUE_LENGTH = 4_096;
    private const int MAX_BODY_LENGTH = 65_536;
    private const int MAX_SDP_LINE_LENGTH = 4_096;
    private const int MAX_SDP_MEDIA = 16;
    private const int MAX_SDP_ATTRIBUTES = 1_024;
    private const int MAX_QUEUED_FRAMES = 32;  //this far behind, the browser can't keep up and frames are dropped up to the next key frame
    private const int MAX_QUEUED_TEXT = 4;
    private const long MAX_QUEUED_BYTES = 64L * 1024 * 1024;
    private const int MIN_SESSION_TIMEOUT = 4;
    private const int MAX_SESSION_TIMEOUT = 3_600;
    private const int DEFAULT_SESSION_TIMEOUT = 60;
    private const int MAX_AUTHENTICATION_ATTEMPTS = 3;
    private const int RTCP_INTERVAL = 5_000;
    private const string USER_AGENT = "Pro-test";

    //what the browser is told, details go to the server log
    private const string INVALID_RESPONSE = "The camera sent an invalid response";
    private const string INVALID_STREAM = "The camera described an invalid stream";
    private const string DESTINATION_REFUSED = "Connections to this address aren't allowed";
    private const string SRTP_UNSUPPORTED = "The camera encrypts the stream with SRTP, which isn't supported. Ask for it without SRTP, or over RTSPS";
    private const string BASIC_REFUSED = "The camera asks for the password in clear text (Basic authentication), it's only sent over RTSPS with a valid certificate";
    private const string AUTHENTICATION_UNSUPPORTED = "The camera offered an invalid or unsupported authentication method";

    private static readonly HashSet<string> SINGLE_HEADERS = new HashSet<string>(StringComparer.OrdinalIgnoreCase) {
        "CSeq", "Content-Length", "Content-Base", "Content-Location", "Content-Type", "Session", "Transport"
    };

    private const byte MESSAGE_FRAME = 1;
    private const byte FLAG_KEY_FRAME = 0x01;
    private const int FRAME_HEADER_LENGTH = 10;

    internal sealed class ConnectRequest {
        public string url;
        public string username;
        public string password;
        public string credential;
    }

    internal sealed class Target {
        public bool secure;
        public string host;
        public int port;
        public string url; //without the credentials
        public string username;
        public string password;
    }

    internal sealed class Track {
        public string codec; //H264, H265 or JPEG
        public string encoding;
        public int payloadType;
        public int clockRate;
        public string control;
        public string protocol;
        public Dictionary<string, string> fmtp;
        public int width;
        public int height;
        public bool encrypted; //SRTP
    }

    internal sealed class SessionDescription {
        public string control;
        public bool keyManagement;
        public readonly List<MediaDescription> media = new List<MediaDescription>();
    }

    internal sealed class MediaDescription {
        public string type;
        public string protocol;
        public string control;
        public bool keyManagement;
        public int width;
        public int height;
        public readonly List<int> formats = new List<int>();
        public readonly Dictionary<int, string> rtpmap = new Dictionary<int, string>();
        public readonly Dictionary<int, string> fmtp = new Dictionary<int, string>();
    }

    public static async Task WebSocketHandler(HttpListenerContext ctx) {
        if (!Auth.IsAuthenticatedAndAuthorized(ctx, RESOURCE)) {
            ctx.Response.Close();
            return;
        }

        //The principal is the session's user. "loopback", which vault access lists let through, is only for a loopback
        //request the backdoor admitted without a session, a user signed in on the server itself keeps their own rights.
        string sessionId = ctx.Request.Cookies["sessionid"]?.Value;
        string origin = Auth.GetUsername(sessionId);
        if (origin is null) {
            if (!Configuration.backdoor || !IPAddress.IsLoopback(ctx.Request.RemoteEndPoint.Address)) {
                ctx.Response.StatusCode = 403;
                ctx.Response.Close();
                return;
            }
            sessionId = null;
            origin = "loopback";
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

        Client client = new Client {
            origin = origin,
            //the same resource, and the same user behind the same session, for as long as the stream runs
            isAuthorized = () => Auth.IsAuthenticatedAndAuthorized(ctx, RESOURCE)
                && (sessionId is null || String.Equals(Auth.GetUsername(sessionId), origin, StringComparison.Ordinal)),
            lookupCredential = LookupVaultCredential,
            audit = action => Logger.Action(origin, "Remote-access", action)
        };

        await RunAsync(ws, client, Settings.FromConfiguration(), CancellationToken.None);
    }

    private static CredentialLookup LookupVaultCredential(Guid guid, string origin) {
        if (!Vault.FromGuid(guid, out Vault.CredentialEntry credential)) return new CredentialLookup { found = false };
        return new CredentialLookup {
            found    = true,
            allowed  = Vault.IsAllowed(credential, origin),
            username = credential.username ?? String.Empty,
            password = credential.password ?? String.Empty
        };
    }

    //One connection request per WebSocket, then the stream until either side ends it or the user loses access.
    internal static async Task RunAsync(WebSocket ws, Client client, Settings settings, CancellationToken token) {
        //cancels the handshake once the browser leaves, and finally the browser's receive loop
        using CancellationTokenSource cts = CancellationTokenSource.CreateLinkedTokenSource(token);
        Task clientTask = null;
        Session session = null;
        Target target = null;
        SessionLimits.Lease lease = null;
        bool established = false;
        string endReason = null;

        try {
            string json;
            using (CancellationTokenSource requestCts = CancellationTokenSource.CreateLinkedTokenSource(cts.Token)) {
                requestCts.CancelAfter(settings.handshakeTimeout);
                json = await ReceiveRequest(ws, requestCts.Token);
            }

            ConnectRequest request = ParseConnectRequest(json, out string requestError);
            if (request is null) {
                await SendError(ws, requestError, false);
                return;
            }

            target = ParseUrl(request.url);
            if (target is null) {
                await SendError(ws, "Invalid RTSP address", false);
                return;
            }

            //with a vault credential, the gateway authenticates on the browser's behalf and the password never reaches it
            string username = target.username;
            string password = target.password;
            Guid? credentialGuid = null;

            if (request.credential is not null) {
                Guid guid = Guid.Parse(request.credential); //validated with the request
                CredentialLookup credential = client.lookupCredential(guid, client.origin);

                if (!credential.found) {
                    await SendError(ws, "Credentials don't exist", false);
                    return;
                }

                if (!credential.allowed) {
                    client.audit($"RTSP connection to {target.host}:{target.port} refused: access denied for the credential");
                    await SendError(ws, "Access denied for this credential", false);
                    return;
                }

                username = credential.username;
                password = credential.password;
                credentialGuid = guid;
            }
            else if (!String.IsNullOrEmpty(request.username)) {
                username = request.username;
                password = request.password ?? String.Empty;
            }

            if (!Syntax.IsCredential(username) || !Syntax.IsCredential(password)) {
                await SendError(ws, "The credentials contain characters that can't be sent", false);
                return;
            }

            lease = settings.limits.TryAcquire(client.origin, out string limitError);
            if (lease is null) {
                client.audit($"RTSP connection to {target.host}:{target.port} refused: {limitError}");
                await SendError(ws, limitError, false);
                return;
            }

            clientTask = ReceiveFromClient(ws, cts);

            using CancellationTokenSource handshakeCts = CancellationTokenSource.CreateLinkedTokenSource(cts.Token);
            handshakeCts.CancelAfter(settings.handshakeTimeout);

            session = new Session(target, username, password, settings);

            string error;
            try {
                error = await session.StartAsync(handshakeCts.Token);
            }
            catch (OperationCanceledException) {
                if (cts.IsCancellationRequested) return; //the browser left
                error = "The camera did not respond in time";
            }
            catch (DestinationException ex) {
                session.failureDetail = ex.detail;
                error = ex.Message;
            }
            catch (InvalidDataException ex) {
                error = ex.Message;
            }
            catch (IOException ex) {
                session.failureDetail = ex.Message;
                error = "The connection to the camera was lost";
            }

            if (session.certificateThumbprint is not null) {
                client.audit($"RTSP host {target.host}:{target.port} presented certificate {Syntax.Sanitize(session.certificateSubject)} ({session.certificateThumbprint}){(session.certificateVerified ? "" : ", not verified")}");
            }

            if (error is not null) {
                string detail = session.failureDetail is null ? String.Empty : $" ({Syntax.Sanitize(session.failureDetail)})";
                client.audit($"RTSP connection to {target.host}:{target.port} failed: {error}{detail}");
                await SendError(ws, error, session.authenticationFailed);
                return;
            }

            client.audit($"Establish RTSP stream from {target.host}:{target.port}");
            established = true;

            await SendText(ws, EncodeStreamInfo(session), cts.Token);
            endReason = await StreamAsync(ws, session, client, credentialGuid, settings, clientTask, cts.Token);
        }
        catch (OperationCanceledException) { }
        catch (WebSocketException) { }
        catch (IOException) { }
        catch (Exception ex) {
            Logger.Error(ex);
        }
        finally {
            if (established) {
                client.audit($"Close RTSP stream from {target.host}:{target.port}{(endReason is null ? "" : $": {endReason}")}");
            }

            await CloseClient(ws, clientTask, cts);

            if (session is not null) {
                await session.DisposeAsync();
            }

            lease?.Dispose();
        }
    }

    private static async Task<string> ReceiveRequest(WebSocket ws, CancellationToken token) {
        byte[] buffer = new byte[MAX_REQUEST_LENGTH];
        int count = 0;

        while (true) {
            WebSocketReceiveResult result = await ws.ReceiveAsync(new ArraySegment<byte>(buffer, count, buffer.Length - count), token);
            if (result.MessageType != WebSocketMessageType.Text) return null;

            count += result.Count;
            if (result.EndOfMessage) return Encoding.UTF8.GetString(buffer, 0, count);
            if (count == buffer.Length) return null; //too long
        }
    }

    //{"url":"...", and either "username" and "password", or "credential"}, nothing else
    internal static ConnectRequest ParseConnectRequest(string json, out string error) {
        error = "Invalid request";
        if (String.IsNullOrEmpty(json)) return null;

        ConnectRequest request = new ConnectRequest();
        HashSet<string> seen = new HashSet<string>(StringComparer.Ordinal);

        try {
            using JsonDocument document = JsonDocument.Parse(json, new JsonDocumentOptions { MaxDepth = 2 });
            JsonElement root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object) return null;

            foreach (JsonProperty property in root.EnumerateObject()) {
                if (!seen.Add(property.Name)) return null; //duplicates are ambiguous

                string value = property.Value.ValueKind switch {
                    JsonValueKind.String => property.Value.GetString(),
                    JsonValueKind.Null   => null,
                    _                    => throw new JsonException()
                };

                switch (property.Name) {
                case "url"       : request.url = value;        break;
                case "username"  : request.username = value;   break;
                case "password"  : request.password = value;   break;
                case "credential": request.credential = value; break;
                default: return null;
                }
            }
        }
        catch (JsonException) {
            return null;
        }

        if (String.IsNullOrEmpty(request.url) || request.url.Length > MAX_URL_LENGTH) return null;

        if (request.credential is not null) {
            if (!Guid.TryParse(request.credential, out _)) return null;
            if (!String.IsNullOrEmpty(request.username) || !String.IsNullOrEmpty(request.password)) return null; //one or the other
        }

        if (!Syntax.IsCredential(request.username) || !Syntax.IsCredential(request.password)) {
            error = "The credentials contain characters that can't be sent";
            return null;
        }

        error = null;
        return request;
    }

    //rtsp://[user:password@]host[:port]/path, or rtsps:// for RTSP over TLS. Anything ambiguous is refused.
    internal static Target ParseUrl(string value) {
        if (String.IsNullOrWhiteSpace(value)) return null;
        value = value.Trim();
        if (value.Length > MAX_URL_LENGTH) return null;

        //no whitespace, control characters or backslashes, which parsers read differently
        foreach (char c in value) {
            if (c <= ' ' || c == 0x7f || c == '\\') return null;
        }

        //no percent-encoding in the host, which Uri would decode, the credentials before an @ may have it
        int authorityStart = value.IndexOf("://", StringComparison.Ordinal);
        if (authorityStart < 0) return null;
        authorityStart += 3;
        int authorityEnd = value.IndexOfAny(new[] { '/', '?', '#' }, authorityStart);
        string authority = authorityEnd < 0 ? value[authorityStart..] : value[authorityStart..authorityEnd];
        if (authority[(authority.LastIndexOf('@') + 1)..].Contains('%')) return null;

        if (!Uri.TryCreate(value, UriKind.Absolute, out Uri uri)) return null;

        bool secure;
        switch (uri.Scheme.ToLowerInvariant()) {
        case "rtsp" : secure = false; break;
        case "rtsps": secure = true;  break;
        default: return null;
        }

        if (uri.HostNameType is not (UriHostNameType.Dns or UriHostNameType.IPv4 or UriHostNameType.IPv6)) return null;

        string host = uri.DnsSafeHost;
        if (String.IsNullOrEmpty(host) || host.Contains('%')) return null; //percent-encoded names and IPv6 zones

        int port;
        if (uri.Port == -1) port = secure ? DEFAULT_SECURE_PORT : DEFAULT_PORT;
        else if (uri.Port is > 0 and <= 65535) port = uri.Port;
        else return null;

        string url = uri.GetComponents(UriComponents.HttpRequestUrl, UriFormat.UriEscaped);
        if (!Syntax.IsRequestTarget(url)) return null;

        //if (secure) url = RemoveQueryParameter(url, "enableSrtp");

        Target target = new Target {
            secure   = secure,
            host     = host,
            port     = port,
            url      = url,
            username = String.Empty,
            password = String.Empty
        };

        if (uri.UserInfo.Length > 0) {
            int colon = uri.UserInfo.IndexOf(':');
            target.username = Uri.UnescapeDataString(colon < 0 ? uri.UserInfo : uri.UserInfo[..colon]);
            target.password = colon < 0 ? String.Empty : Uri.UnescapeDataString(uri.UserInfo[(colon + 1)..]);
            if (!Syntax.IsCredential(target.username) || !Syntax.IsCredential(target.password)) return null;
        }

        return target;
    }

    internal static string RemoveQueryParameter(string url, string name) {
        int question = url.IndexOf('?');
        if (question < 0) return url;

        string[] parameters = url[(question + 1)..].Split('&')
            .Where(o => !o.Split('=')[0].Equals(name, StringComparison.OrdinalIgnoreCase))
            .ToArray();

        return parameters.Length == 0 ? url[..question] : $"{url[..question]}?{String.Join('&', parameters)}";
    }

    //an absolute rtsp or rtsps URL without credentials, null for anything else
    internal static string StripCredentials(string url) {
        if (!Uri.TryCreate(url, UriKind.Absolute, out Uri uri)) return null;
        if (!uri.Scheme.Equals("rtsp", StringComparison.OrdinalIgnoreCase) && !uri.Scheme.Equals("rtsps", StringComparison.OrdinalIgnoreCase)) return null;
        string stripped = uri.UserInfo.Length == 0 ? url : uri.GetComponents(UriComponents.HttpRequestUrl, UriFormat.UriEscaped);
        return Syntax.IsRequestTarget(stripped) ? stripped : null;
    }

    //Most servers expect the control attribute appended to the base, rather than resolved as a relative reference.
    //The result only names the stream in a request on the connection that is already open, nothing connects to it,
    //so a control URL naming another host can't lead the gateway anywhere. It has to be an absolute rtsp or rtsps URL.
    internal static string ResolveControl(string baseUrl, string control) {
        string resolved;
        if (String.IsNullOrEmpty(control) || control == "*") {
            resolved = baseUrl;
        }
        else if (HasScheme(control)) { //absolute, and rtsp or rtsps or nothing
            resolved = control;
        }
        else if (baseUrl.EndsWith('/')) {
            resolved = baseUrl + control.TrimStart('/');
        }
        else {
            resolved = control.StartsWith('/') ? baseUrl + control : $"{baseUrl}/{control}";
        }

        return StripCredentials(resolved);
    }

    //scheme ":" as RFC 3986 starts an absolute URI
    private static bool HasScheme(string value) {
        int colon = value.IndexOf(':');
        if (colon <= 0 || !Char.IsAsciiLetter(value[0])) return false;
        for (int i = 1; i < colon; i++) {
            char c = value[i];
            if (!Char.IsAsciiLetterOrDigit(c) && c is not ('+' or '-' or '.')) return false;
        }
        return true;
    }

    //null when the description is too big to be a camera's
    internal static SessionDescription ParseSdp(string text) {
        SessionDescription sdp = new SessionDescription();
        MediaDescription media = null;
        int attributes = 0;

        foreach (string rawLine in text.Split('\n')) {
            if (rawLine.Length > MAX_SDP_LINE_LENGTH) return null;

            string line = rawLine.Trim();
            if (line.Length < 2 || line[1] != '=') continue;

            string value = line[2..];

            if (line[0] == 'm') {
                if (sdp.media.Count >= MAX_SDP_MEDIA) return null;

                string[] parts = value.Split(' ', StringSplitOptions.RemoveEmptyEntries);
                media = new MediaDescription {
                    type     = parts.Length > 0 ? parts[0].ToLowerInvariant() : String.Empty,
                    protocol = parts.Length > 2 ? parts[2] : String.Empty
                };

                for (int i = 3; i < parts.Length && i < 64; i++) {
                    if (int.TryParse(parts[i], out int format) && format is >= 0 and <= 127) media.formats.Add(format);
                }

                sdp.media.Add(media);
                continue;
            }

            if (line[0] != 'a') continue;
            if (++attributes > MAX_SDP_ATTRIBUTES) return null;

            int colon = value.IndexOf(':');
            string name = colon < 0 ? value : value[..colon];
            string attribute = colon < 0 ? String.Empty : value[(colon + 1)..].Trim();

            switch (name.ToLowerInvariant()) {
            case "control":
                if (media is null) sdp.control = attribute;
                else media.control = attribute;
                break;

            case "crypto":   //SDES keys
            case "key-mgmt": //MIKEY
                if (media is null) sdp.keyManagement = true;
                else media.keyManagement = true;
                break;

            case "rtpmap":
            case "fmtp": {
                if (media is null) break;
                int space = attribute.IndexOf(' ');
                if (space < 0 || !int.TryParse(attribute[..space], out int format)) break;
                Dictionary<int, string> map = name.Equals("rtpmap", StringComparison.OrdinalIgnoreCase) ? media.rtpmap : media.fmtp;
                map[format] = attribute[(space + 1)..].Trim();
                break;
            }

            case "x-dimensions": { //width,height
                if (media is null) break;
                string[] size = attribute.Split(',');
                if (size.Length == 2 && TryParseDimension(size[0], out int width) && TryParseDimension(size[1], out int height)) {
                    media.width = width;
                    media.height = height;
                }
                break;
            }

            case "framesize": { //format width-height
                if (media is null) break;
                int space = attribute.IndexOf(' ');
                string[] size = (space < 0 ? attribute : attribute[(space + 1)..]).Split('-');
                if (size.Length == 2 && TryParseDimension(size[0], out int width) && TryParseDimension(size[1], out int height)) {
                    media.width = width;
                    media.height = height;
                }
                break;
            }
            }
        }

        return sdp;
    }

    private static bool TryParseDimension(string value, out int dimension) =>
        int.TryParse(value, out dimension) && dimension is > 0 and <= 65_535;

    internal static Dictionary<string, string> ParseFmtp(string fmtp) {
        Dictionary<string, string> parameters = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (String.IsNullOrEmpty(fmtp)) return parameters;

        foreach (string pair in fmtp.Split(';')) {
            int equals = pair.IndexOf('=');
            if (equals <= 0) continue;
            parameters[pair[..equals].Trim()] = pair[(equals + 1)..].Trim();
        }

        return parameters;
    }

    //The first video stream in a format the viewer decodes. Audio isn't played, it's only described.
    internal static Track SelectVideoTrack(SessionDescription sdp, string baseUrl, out string audio, out string unsupported) {
        audio = null;
        unsupported = null;
        Track selected = null;

        foreach (MediaDescription media in sdp.media) {
            if (media.type == "audio") {
                if (audio is null && media.formats.Count > 0) {
                    int format = media.formats[0];
                    audio = media.rtpmap.TryGetValue(format, out string map) ? map : StaticEncoding(format) ?? $"payload type {format}";
                }
                continue;
            }

            if (media.type != "video" || selected is not null) continue;

            foreach (int format in media.formats) {
                string encoding = media.rtpmap.TryGetValue(format, out string map) ? map : StaticEncoding(format);
                if (encoding is null) continue;

                string[] parts = encoding.Split('/');
                string name = parts[0].Trim().ToUpperInvariant();
                int clockRate = parts.Length > 1 && int.TryParse(parts[1], out int rate) && rate is > 0 and <= 10_000_000 ? rate : 90_000;

                string codec = name switch {
                    "H264"           => "H264",
                    "H265" or "HEVC" => "H265",
                    "JPEG"           => "JPEG",
                    _                => null
                };

                if (codec is null) {
                    unsupported ??= Syntax.Sanitize(name, 32);
                    continue;
                }

                selected = new Track {
                    codec       = codec,
                    encoding    = $"{name}/{clockRate}",
                    payloadType = format,
                    clockRate   = clockRate,
                    control     = ResolveControl(baseUrl, media.control),
                    protocol    = media.protocol,
                    fmtp        = ParseFmtp(media.fmtp.TryGetValue(format, out string parameters) ? parameters : null),
                    width       = media.width,
                    height      = media.height,
                    encrypted   = media.protocol.Contains("SAVP", StringComparison.OrdinalIgnoreCase) || media.keyManagement || sdp.keyManagement
                };
                break;
            }
        }

        return selected;
    }

    private static string StaticEncoding(int payloadType) => payloadType switch {
        0  => "PCMU/8000",
        8  => "PCMA/8000",
        14 => "MPA/90000",
        26 => "JPEG/90000",
        32 => "MPV/90000",
        _  => null
    };

    //RTP/AVP/TCP;unicast;interleaved=0-1, one transport with two distinct channels
    internal static bool TryParseTransport(string transport, out int rtpChannel, out int rtcpChannel) {
        rtpChannel = -1;
        rtcpChannel = -1;
        if (String.IsNullOrEmpty(transport) || transport.Contains(',')) return false;

        string[] parameters = transport.Split(';', StringSplitOptions.TrimEntries);
        if (!parameters[0].Equals("RTP/AVP/TCP", StringComparison.OrdinalIgnoreCase)) return false;

        bool found = false;
        for (int i = 1; i < parameters.Length; i++) {
            string parameter = parameters[i];

            if (parameter.Equals("multicast", StringComparison.OrdinalIgnoreCase)) return false;
            if (!parameter.StartsWith("interleaved=", StringComparison.OrdinalIgnoreCase)) continue;
            if (found) return false; //twice is ambiguous

            string[] channels = parameter[12..].Split('-');
            if (channels.Length > 2 || !TryParseChannel(channels[0], out int rtp)) return false;

            int rtcp;
            if (channels.Length == 2) {
                if (!TryParseChannel(channels[1], out rtcp)) return false;
            }
            else {
                rtcp = rtp + 1;
            }

            if (rtcp == rtp || rtcp > 255) return false;

            rtpChannel = rtp;
            rtcpChannel = rtcp;
            found = true;
        }

        return found;
    }

    private static bool TryParseChannel(string value, out int channel) {
        channel = -1;
        if (value.Length is 0 or > 3) return false;
        foreach (char c in value) {
            if (c is < '0' or > '9') return false;
        }
        channel = int.Parse(value);
        return channel <= 255;
    }

    //Session: id;timeout=60, the timeout kept within bounds
    internal static bool TryParseSessionHeader(string header, out string id, out int timeout) {
        id = null;
        timeout = DEFAULT_SESSION_TIMEOUT;
        if (String.IsNullOrEmpty(header)) return false;

        string[] parts = header.Split(';', StringSplitOptions.TrimEntries);
        if (!Syntax.IsSessionId(parts[0])) return false;
        id = parts[0];

        for (int i = 1; i < parts.Length; i++) {
            if (!parts[i].StartsWith("timeout=", StringComparison.OrdinalIgnoreCase)) continue;
            if (int.TryParse(parts[i][8..], out int seconds)) {
                timeout = Math.Clamp(seconds, MIN_SESSION_TIMEOUT, MAX_SESSION_TIMEOUT);
            }
        }

        return true;
    }

    internal static string DescribeStatus(Message response) => response.status switch {
        401 => "Authentication failed",
        403 => "Access denied",
        404 => "Stream not found, check the path",
        454 => "The camera ended the session",
        461 => "The camera doesn't support streaming over TCP",
        503 => "The camera is unavailable, it may have reached its limit of streams",
        _   => $"The camera responded with status {response.status}"
    };

    private static string DescribeSocketError(SocketException ex) => ex.SocketErrorCode switch {
        SocketError.ConnectionRefused  => "The camera refused the connection",
        SocketError.TimedOut           => "The camera did not respond",
        SocketError.HostUnreachable    => "The camera is unreachable",
        SocketError.NetworkUnreachable => "The camera is unreachable",
        _                              => "Failed to connect to the camera"
    };

    private static byte[] EncodeStreamInfo(Session session) {
        using MemoryStream ms = new MemoryStream();
        using (Utf8JsonWriter writer = new Utf8JsonWriter(ms)) {
            writer.WriteStartObject();
            writer.WriteStartObject("stream");
            writer.WriteString("codec", session.track.codec switch { "H264" => "H.264", "H265" => "H.265", _ => "Motion JPEG" });
            writer.WriteString("encoding", session.track.encoding);
            writer.WriteString("address", session.remoteAddress);
            writer.WriteBoolean("secure", session.target.secure);
            if (session.server is not null) writer.WriteString("server", Syntax.Sanitize(session.server, 128));
            if (session.audio is not null) writer.WriteString("audio", Syntax.Sanitize(session.audio, 64));
            if (session.certificateThumbprint is not null) {
                writer.WriteString("certificate", Syntax.Sanitize(session.certificateSubject));
                writer.WriteString("thumbprint", session.certificateThumbprint);
                writer.WriteBoolean("verified", session.certificateVerified);
            }
            writer.WriteEndObject();
            writer.WriteEndObject();
        }
        return ms.ToArray();
    }

    private static byte[] EncodeJson(string name, string value, bool authentication = false) {
        using MemoryStream ms = new MemoryStream();
        using (Utf8JsonWriter writer = new Utf8JsonWriter(ms)) {
            writer.WriteStartObject();
            writer.WriteString(name, value);
            if (authentication) writer.WriteBoolean("authentication", true);
            writer.WriteEndObject();
        }
        return ms.ToArray();
    }

    private static Task SendText(WebSocket ws, byte[] json, CancellationToken token) =>
        ws.SendAsync(new ArraySegment<byte>(json), WebSocketMessageType.Text, true, token);

    private static async Task SendError(WebSocket ws, string error, bool authentication) {
        if (ws.State != WebSocketState.Open) return;
        try {
            using CancellationTokenSource cts = new CancellationTokenSource(CLOSE_TIMEOUT);
            await SendText(ws, EncodeJson("error", error, authentication), cts.Token);
        }
        catch (Exception ex) {
            Logger.Debug(ex);
        }
    }

    //After its one request the browser only closes. Anything else ends the stream.
    private static async Task ReceiveFromClient(WebSocket ws, CancellationTokenSource cts) {
        byte[] buffer = new byte[1024];
        try {
            if (ws.State == WebSocketState.Open) {
                await ws.ReceiveAsync(new ArraySegment<byte>(buffer), cts.Token);
            }
        }
        catch (OperationCanceledException) { }
        catch (WebSocketException) { }
        finally {
            cts.Cancel();
        }
    }

    //Every message is out by now, so the close is clean and nothing the browser hasn't read is reset away.
    //Canceling a pending receive aborts the WebSocket, it's canceled only after the close handshake.
    private static async Task CloseClient(WebSocket ws, Task clientTask, CancellationTokenSource cts) {
        try {
            using CancellationTokenSource closeCts = new CancellationTokenSource(CLOSE_TIMEOUT);

            if (ws.State == WebSocketState.Open && clientTask is null) { //nothing is receiving, the close waits for the answer itself
                await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, closeCts.Token);
            }
            else if (ws.State == WebSocketState.Open || ws.State == WebSocketState.CloseReceived) {
                await ws.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, String.Empty, closeCts.Token);
            }

            if (clientTask is not null) {
                await Task.WhenAny(clientTask, Task.Delay(CLOSE_TIMEOUT));
            }
        }
        catch (Exception ex) {
            Logger.Debug(ex);
        }
        finally {
            cts.Cancel();
        }
    }

    //the reason the stream ended, for the audit log
    private static async Task<string> StreamAsync(WebSocket ws, Session session, Client client, Guid? credentialGuid, Settings settings, Task clientTask, CancellationToken token) {
        //stops the camera side and the sender, the browser's receive loop is left to the close handshake
        using CancellationTokenSource streamCts = CancellationTokenSource.CreateLinkedTokenSource(token);

        FrameQueue queue = new FrameQueue(session.track.clockRate);

        Task sendTask = SendToClient(ws, queue, streamCts.Token);
        Task<string> receiveTask = ReceiveFromCamera(session, queue, streamCts.Token);
        Task<string> watchTask = Watch(session, client, credentialGuid, settings, queue, streamCts);

        //the sender finishes once the stream has ended and its last message went out
        await Task.WhenAny(sendTask, clientTask);
        streamCts.Cancel();
        await Task.WhenAll(sendTask, receiveTask, watchTask);

        return watchTask.Result ?? receiveTask.Result ?? (clientTask.IsCompleted ? "the browser closed the stream" : null);
    }

    private static async Task SendToClient(WebSocket ws, FrameQueue queue, CancellationToken token) {
        try {
            await foreach (OutgoingMessage message in queue.Reader.ReadAllAsync(token)) {
                queue.SendStarted();
                await ws.SendAsync(new ArraySegment<byte>(message.data), message.isText ? WebSocketMessageType.Text : WebSocketMessageType.Binary, true, token);
                queue.Sent(message);
            }
        }
        catch (OperationCanceledException) { }
        catch (WebSocketException) { }
    }

    private static async Task<string> ReceiveFromCamera(Session session, FrameQueue queue, CancellationToken token) {
        string reason = null;
        try {
            reason = await session.ReceiveAsync(queue.Enqueue, token);
        }
        catch (OperationCanceledException) { }
        catch (ObjectDisposedException) { }
        catch (IOException) {
            reason = "The connection to the camera was lost";
        }
        catch (InvalidDataException ex) {
            reason = ex.Message;
        }
        catch (Exception ex) {
            Logger.Error(ex);
            reason = "The stream failed";
        }
        finally {
            if (reason is not null && !token.IsCancellationRequested) queue.Error(reason);
            queue.Complete();
        }
        return reason;
    }

    //Keep-alives for the camera, statistics for the browser, and the checks that end a stream: the user's access,
    //the credential's access list, video that stopped and a browser that stopped reading.
    private static async Task<string> Watch(Session session, Client client, Guid? credentialGuid, Settings settings, FrameQueue queue, CancellationTokenSource streamCts) {
        CancellationToken token = streamCts.Token;
        long now = Environment.TickCount64;
        long nextAuthorization = now + settings.authorizationInterval;
        long nextReport = now + RTCP_INTERVAL;
        long keepAliveInterval = Math.Clamp(session.sessionTimeout / 2, 2, 30) * 1000L;
        long nextKeepAlive = now + keepAliveInterval;
        long reportedLost = 0, reportedDropped = 0;
        int tick = Math.Clamp(settings.authorizationInterval / 4, 50, 1000);

        string Stop(string reason, string audit) {
            queue.Error(reason);
            queue.Complete();
            return audit;
        }

        try {
            while (!token.IsCancellationRequested) {
                await Task.Delay(tick, token);
                now = Environment.TickCount64;

                long lost = session.depacketizer.LostPackets;
                long dropped = session.depacketizer.DroppedFrames + queue.DroppedFrames;
                if ((lost != reportedLost || dropped != reportedDropped) && queue.Statistics(lost, dropped)) {
                    reportedLost = lost;
                    reportedDropped = dropped;
                }

                if (now >= nextAuthorization) {
                    if (!client.isAuthorized()) {
                        return Stop("Access denied", "the user's access was revoked or expired");
                    }
                    if (credentialGuid is Guid guid && !client.lookupCredential(guid, client.origin).allowed) {
                        return Stop("Access denied for this credential", "access to the credential was revoked");
                    }
                    nextAuthorization = now + settings.authorizationInterval;
                }

                if (now - session.LastPacket > settings.idleTimeout) {
                    return Stop("The camera stopped sending video", "the camera stopped sending video");
                }

                if (queue.SendingSince is long since && now - since > settings.sendTimeout) {
                    streamCts.Cancel(); //the sender is stuck in a send, only canceling it gets it out
                    return "the browser stopped reading";
                }

                if (now >= nextReport) {
                    await session.SendReceiverReportAsync(token);
                    nextReport = now + RTCP_INTERVAL;
                }

                if (now >= nextKeepAlive) {
                    await session.SendKeepAliveAsync(token);
                    nextKeepAlive = now + keepAliveInterval;
                }
            }
        }
        catch (OperationCanceledException) { }
        catch (ObjectDisposedException) { }
        catch (IOException) { }

        return null;
    }

    internal sealed class OutgoingMessage {
        public byte[] data;
        public bool isText;
        public bool isFrame;
        public bool isReserved; //the closing error, in the slot kept for it
    }

    //Hands messages to the sender, within a bound on frames, bytes and text messages. While the browser has fallen behind
    //frames are dropped, and since a delta frame decodes only on top of the ones before it, once one is dropped every
    //frame is dropped up to the next key frame. A slot is kept for the error that ends a stream.
    internal sealed class FrameQueue {
        private readonly Channel<OutgoingMessage> channel;
        private readonly double clockRate;
        private int queuedFrames;
        private int queuedText;
        private long queuedBytes;
        private long droppedFrames;
        private long sendingSince;
        private int errorQueued;
        private bool skipping;
        private string codec;
        private bool hasTimestamp;
        private uint lastTimestamp;
        private long extendedTimestamp;

        public FrameQueue(int clockRate) {
            channel = Channel.CreateBounded<OutgoingMessage>(new BoundedChannelOptions(MAX_QUEUED_FRAMES + MAX_QUEUED_TEXT + 1) {
                SingleReader = true,
                FullMode = BoundedChannelFullMode.Wait //TryWrite fails instead of waiting
            });
            this.clockRate = clockRate > 0 ? clockRate : 90_000;
        }

        public ChannelReader<OutgoingMessage> Reader => channel.Reader;
        public int QueuedFrames => Volatile.Read(ref queuedFrames);
        public long QueuedBytes => Interlocked.Read(ref queuedBytes);
        public long DroppedFrames => Interlocked.Read(ref droppedFrames);
        public long? SendingSince => Interlocked.Read(ref sendingSince) is long since && since != 0 ? since : null;

        //called by the camera's receive loop only
        public void Enqueue(Frame frame) {
            //RTP timestamps wrap around, in presentation order, so they step back for B-frames
            if (hasTimestamp) {
                extendedTimestamp += (int)(frame.timestamp - lastTimestamp);
            }
            lastTimestamp = frame.timestamp;
            hasTimestamp = true;

            long size = FRAME_HEADER_LENGTH + frame.data.Length;
            bool full = QueuedFrames >= MAX_QUEUED_FRAMES || QueuedBytes + size > MAX_QUEUED_BYTES;

            if (full) skipping = true;
            if (skipping) {
                if (!frame.key || full) {
                    Interlocked.Increment(ref droppedFrames);
                    return;
                }
                skipping = false;
            }

            if (frame.key && frame.codec is not null && frame.codec != codec) {
                //without its configuration the key frame can't be decoded, it waits for the next one
                if (!TryWriteText(EncodeJson("codec", frame.codec))) {
                    skipping = true;
                    Interlocked.Increment(ref droppedFrames);
                    return;
                }
                codec = frame.codec;
            }

            byte[] data = new byte[size];
            data[0] = MESSAGE_FRAME;
            data[1] = frame.key ? FLAG_KEY_FRAME : (byte)0;
            BinaryPrimitives.WriteDoubleBigEndian(data.AsSpan(2), extendedTimestamp * 1_000_000d / clockRate); //microseconds
            frame.data.CopyTo(data, FRAME_HEADER_LENGTH);

            Interlocked.Increment(ref queuedFrames);
            Interlocked.Add(ref queuedBytes, size);
            if (!channel.Writer.TryWrite(new OutgoingMessage { data = data, isFrame = true })) {
                Interlocked.Decrement(ref queuedFrames);
                Interlocked.Add(ref queuedBytes, -size);
                Interlocked.Increment(ref droppedFrames);
                skipping = true;
            }
        }

        private bool TryWriteText(byte[] json) {
            if (Interlocked.Increment(ref queuedText) > MAX_QUEUED_TEXT) {
                Interlocked.Decrement(ref queuedText);
                return false;
            }
            if (!channel.Writer.TryWrite(new OutgoingMessage { data = json, isText = true })) {
                Interlocked.Decrement(ref queuedText);
                return false;
            }
            return true;
        }

        public void SendStarted() => Interlocked.Exchange(ref sendingSince, Math.Max(1, Environment.TickCount64));

        public void Sent(OutgoingMessage message) {
            Interlocked.Exchange(ref sendingSince, 0);
            if (message.isFrame) {
                Interlocked.Decrement(ref queuedFrames);
                Interlocked.Add(ref queuedBytes, -message.data.Length);
            }
            else if (!message.isReserved) {
                Interlocked.Decrement(ref queuedText);
            }
        }

        //only the first error, in the slot kept for it, which the bounds on frames and text leave free
        public void Error(string reason) {
            if (Interlocked.Exchange(ref errorQueued, 1) != 0) return;
            channel.Writer.TryWrite(new OutgoingMessage { data = EncodeJson("error", reason), isText = true, isReserved = true });
        }

        //packets the camera never delivered, and frames that never reached the browser, false when there was no room
        public bool Statistics(long lostPackets, long droppedFrames) {
            using MemoryStream ms = new MemoryStream();
            using (Utf8JsonWriter writer = new Utf8JsonWriter(ms)) {
                writer.WriteStartObject();
                writer.WriteStartObject("stats");
                writer.WriteNumber("lost", lostPackets);
                writer.WriteNumber("dropped", droppedFrames);
                writer.WriteEndObject();
                writer.WriteEndObject();
            }
            return TryWriteText(ms.ToArray());
        }

        public void Complete() => channel.Writer.TryComplete();
    }

    internal enum MessageKind : byte {
        Interleaved,
        Response,
        Request
    }

    internal sealed class Message {
        public MessageKind kind;
        public int channel;
        public ArraySegment<byte> payload; //valid until the next read
        public int status;
        public string reason;
        public string method;
        public Dictionary<string, List<string>> headers;
        public byte[] body;

        public string Header(string name) =>
            headers is not null && headers.TryGetValue(name, out List<string> values) && values.Count > 0 ? values[0] : null;

        public IEnumerable<string> Headers(string name) =>
            headers is not null && headers.TryGetValue(name, out List<string> values) ? values : Array.Empty<string>();

        public int CSeq => int.TryParse(Header("CSeq"), out int cseq) ? cseq : -1;
    }

    //Reads RTSP messages and the interleaved RTP and RTCP packets in between, and serializes writes.
    //Anything that isn't one of them ends the stream, rather than being skipped and read again from the wrong place.
    internal sealed class Connection : IDisposable {
        private const int BUFFER_SIZE = 4 + 65_535 + MAX_HEADER_LENGTH + MAX_BODY_LENGTH;
        private const int MAX_LINE_BREAKS = 16;

        private readonly Stream stream;
        private readonly byte[] buffer = new byte[BUFFER_SIZE];
        private readonly SemaphoreSlim writeLock = new SemaphoreSlim(1, 1);
        private int offset, count;
        private int cseq;

        public Connection(Stream stream) {
            this.stream = stream;
        }

        public int NextCSeq() => Interlocked.Increment(ref cseq);

        public async Task WriteAsync(byte[] data, CancellationToken token) {
            await writeLock.WaitAsync(token);
            try {
                await stream.WriteAsync(data, token);
                await stream.FlushAsync(token);
            }
            finally {
                writeLock.Release();
            }
        }

        //null at the end of the stream
        public async Task<Message> ReadAsync(CancellationToken token) {
            int lineBreaks = 0;

            while (true) {
                if (!await FillAsync(1, token)) return null;

                byte first = buffer[offset];

                if (first == (byte)'$') {
                    if (!await FillAsync(4, token)) return null;

                    int channel = buffer[offset + 1];
                    int packetLength = buffer[offset + 2] << 8 | buffer[offset + 3];
                    if (!await FillAsync(4 + packetLength, token)) return null;

                    Message packet = new Message {
                        kind    = MessageKind.Interleaved,
                        channel = channel,
                        payload = new ArraySegment<byte>(buffer, offset + 4, packetLength)
                    };
                    Consume(4 + packetLength);
                    return packet;
                }

                //a few servers end a message with an extra line break
                if (first is (byte)'\r' or (byte)'\n') {
                    if (++lineBreaks > MAX_LINE_BREAKS) throw new InvalidDataException(INVALID_RESPONSE);
                    Consume(1);
                    continue;
                }

                if (first is < (byte)'A' or > (byte)'Z') throw new InvalidDataException(INVALID_RESPONSE);

                int headerLength = await FindHeaderEndAsync(token);
                if (headerLength < 0) return null;

                Message message = ParseHeader(Encoding.UTF8.GetString(buffer, offset, headerLength))
                    ?? throw new InvalidDataException(INVALID_RESPONSE);

                int bodyLength = 0;
                string contentLength = message.Header("Content-Length");
                if (contentLength is not null && !TryParseContentLength(contentLength, out bodyLength)) {
                    throw new InvalidDataException(INVALID_RESPONSE);
                }

                if (!await FillAsync(headerLength + bodyLength, token)) return null;
                message.body = buffer.AsSpan(offset + headerLength, bodyLength).ToArray();
                Consume(headerLength + bodyLength);
                return message;
            }
        }

        private static bool TryParseContentLength(string value, out int length) {
            length = 0;
            if (value.Length is 0 or > 6) return false;
            foreach (char c in value) {
                if (c is < '0' or > '9') return false;
            }
            length = int.Parse(value);
            return length <= MAX_BODY_LENGTH;
        }

        private async Task<bool> FillAsync(int needed, CancellationToken token) {
            while (count < needed) {
                if (offset + needed > buffer.Length) {
                    Buffer.BlockCopy(buffer, offset, buffer, 0, count);
                    offset = 0;
                }

                int read = await stream.ReadAsync(buffer.AsMemory(offset + count, buffer.Length - offset - count), token);
                if (read == 0) return false;
                count += read;
            }
            return true;
        }

        private void Consume(int length) {
            offset += length;
            count -= length;
            if (count == 0) offset = 0;
        }

        //the length up to and including the empty line, -1 at the end of the stream
        private async Task<int> FindHeaderEndAsync(CancellationToken token) {
            int scanned = 0;
            while (true) {
                int limit = Math.Min(count, MAX_HEADER_LENGTH);
                for (int i = scanned; i < limit; i++) {
                    if (buffer[offset + i] != '\n') continue;
                    if (i + 1 < count && buffer[offset + i + 1] == '\n') return i + 2;
                    if (i + 2 < count && buffer[offset + i + 1] == '\r' && buffer[offset + i + 2] == '\n') return i + 3;
                }

                scanned = Math.Max(0, limit - 2);
                if (count >= MAX_HEADER_LENGTH) throw new InvalidDataException(INVALID_RESPONSE);
                if (!await FillAsync(count + 1, token)) return -1;
            }
        }

        //a status or request line and header fields, null for anything malformed
        internal static Message ParseHeader(string text) {
            string[] lines = text.Split('\n');
            for (int i = 0; i < lines.Length; i++) {
                if (lines[i].EndsWith('\r')) lines[i] = lines[i][..^1];
            }

            string startLine = lines[0];
            if (!Syntax.IsHeaderValue(startLine) || startLine.Contains('\t')) return null;

            Message message = new Message {
                headers = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase)
            };

            string[] parts = startLine.Split(' ', 3);

            if (parts[0] is "RTSP/1.0" or "RTSP/2.0") {
                if (parts.Length < 2 || parts[1].Length != 3 || !int.TryParse(parts[1], out int status) || status is < 100 or > 599) return null;
                message.kind = MessageKind.Response;
                message.status = status;
                message.reason = parts.Length > 2 ? parts[2] : String.Empty;
            }
            else if (parts.Length == 3 && Syntax.IsToken(parts[0]) && parts[1].Length > 0 && parts[2] == "RTSP/1.0") {
                message.kind = MessageKind.Request;
                message.method = parts[0];
            }
            else {
                return null;
            }

            int fields = 0;
            for (int i = 1; i < lines.Length; i++) {
                string line = lines[i];
                if (line.Length == 0) continue; //the empty lines that end the header

                if (++fields > MAX_HEADER_COUNT) return null;
                if (line[0] is ' ' or '\t') return null; //folded lines are obsolete and ambiguous

                int colon = line.IndexOf(':');
                if (colon <= 0) return null;

                string name = line[..colon];
                string value = line[(colon + 1)..].Trim(' ', '\t');
                if (!Syntax.IsToken(name) || !Syntax.IsHeaderValue(value)) return null;

                if (!message.headers.TryGetValue(name, out List<string> values)) {
                    message.headers[name] = values = new List<string>(1);
                }
                else if (SINGLE_HEADERS.Contains(name)) {
                    return null; //twice, and which one counts is ambiguous
                }
                values.Add(value);
            }

            //every response answers a numbered request
            string cseq = message.Header("CSeq");
            if (cseq is not null && (cseq.Length is 0 or > 9 || cseq.Any(c => c is < '0' or > '9'))) return null;
            if (message.kind == MessageKind.Response && cseq is null) return null;

            return message;
        }

        public void Dispose() {
            stream.Dispose();
            writeLock.Dispose();
        }
    }

    //An RTSP session with a single video track, received over TCP.
    internal sealed class Session : IAsyncDisposable {
        public readonly Target target;
        private readonly Settings settings;
        private readonly Authenticator authenticator;
        private readonly uint ssrc = (uint)RandomNumberGenerator.GetInt32(int.MaxValue);
        private Socket socket;
        private Connection connection;
        private bool getParameter;
        private string sessionId;
        private string playUrl;
        private bool playing;
        private bool closedByCamera;
        private int rtpChannel, rtcpChannel;
        private long lastPacket;

        public Track track;
        public Depacketizer depacketizer;
        public int sessionTimeout = DEFAULT_SESSION_TIMEOUT;
        public string server;
        public string audio;
        public string remoteAddress;
        public string certificateSubject;
        public string certificateThumbprint;
        public bool certificateVerified;
        public bool authenticationFailed;
        public string failureDetail; //for the server log only

        public Session(Target target, string username, string password, Settings settings) {
            this.target = target;
            this.settings = settings;
            authenticator = new Authenticator(username, password);
        }

        public long LastPacket => Interlocked.Read(ref lastPacket);

        //the reason it failed, or null once the stream is playing
        public async Task<string> StartAsync(CancellationToken token) {
            IPAddress[] addresses = await settings.policy.ResolveAsync(target.host, settings.resolve, token);

            //only the addresses that passed the policy, in order, never the name again
            SocketException lastError = null;
            foreach (IPAddress address in addresses) {
                Socket candidate = new Socket(address.AddressFamily, SocketType.Stream, ProtocolType.Tcp) {
                    NoDelay = true,
                    ReceiveBufferSize = 1 << 20 //a key frame arrives as a burst
                };

                try {
                    await candidate.ConnectAsync(new IPEndPoint(address, target.port), token);
                    socket = candidate;
                    break;
                }
                catch (SocketException ex) {
                    candidate.Dispose();
                    lastError = ex;
                }
                catch {
                    candidate.Dispose();
                    throw;
                }
            }

            if (socket is null) {
                failureDetail = lastError?.Message;
                return lastError is null ? "Failed to connect to the camera" : DescribeSocketError(lastError);
            }

            remoteAddress = socket.RemoteEndPoint is IPEndPoint endpoint
                ? new IPEndPoint(DestinationPolicy.Normalize(endpoint.Address), endpoint.Port).ToString()
                : $"{target.host}:{target.port}";

            Stream stream = new NetworkStream(socket, ownsSocket: false);

            if (target.secure) {
                SslStream ssl = new SslStream(stream, false);
                stream = ssl;

                //Cameras present self-signed certificates most of the time. The certificate is reported rather than enforced,
                //and passwords go out in clear text (Basic) only behind a certificate that validated.
                SslClientAuthenticationOptions sslOptions = new SslClientAuthenticationOptions {
                    TargetHost = target.host, //the name, not the address connected to, for SNI and the name check
                    CertificateRevocationCheckMode = X509RevocationMode.NoCheck,
                    RemoteCertificateValidationCallback = (sender, certificate, chain, errors) => {
                        if (certificate is null) return false;
                        certificateSubject = certificate.Subject;
                        certificateThumbprint = certificate.GetCertHashString();
                        certificateVerified = errors == SslPolicyErrors.None;
                        return true;
                    }
                };

                try {
                    await ssl.AuthenticateAsClientAsync(sslOptions, token);
                }
                catch (AuthenticationException ex) {
                    stream.Dispose();
                    failureDetail = ex.Message;
                    return "The TLS handshake with the camera failed";
                }
            }

            connection = new Connection(stream);

            //OPTIONS is optional, some cameras refuse it to anonymous clients but serve the stream, DESCRIBE has the final word
            (Message options, string optionsError) = await RequestAsync("OPTIONS", target.url, null, token);
            if (optionsError is not null) return optionsError;
            if (options is null) return "The camera closed the connection";

            server = options.Header("Server");
            if (options.status == 200) {
                getParameter = options.Header("Public")?.Contains("GET_PARAMETER", StringComparison.OrdinalIgnoreCase) ?? false;
            }
            authenticationFailed = false;

            (Message describe, string describeError) = await RequestAsync("DESCRIBE", target.url, new[] { ("Accept", "application/sdp") }, token);
            if (describeError is not null) return describeError;
            if (describe is null) return "The camera closed the connection";
            if (describe.status != 200) return DescribeStatus(describe);

            server ??= describe.Header("Server");

            //the base names the stream in later requests, a malformed one falls back to the address the user gave
            string baseUrl = StripCredentials(describe.Header("Content-Base") ?? describe.Header("Content-Location") ?? target.url) ?? target.url;

            SessionDescription sdp = ParseSdp(Encoding.UTF8.GetString(describe.body ?? Array.Empty<byte>()));
            if (sdp is null) return INVALID_STREAM;

            track = SelectVideoTrack(sdp, baseUrl, out audio, out string unsupported);
            if (track is null) return unsupported is null ? "The stream has no video" : $"The video codec isn't supported: {unsupported}";
            if (track.control is null) return INVALID_STREAM;
            if (track.encrypted) return SRTP_UNSUPPORTED;

            depacketizer = Depacketizer.Create(track);

            (Message setup, string setupError) = await RequestAsync("SETUP", track.control, new[] { ("Transport", "RTP/AVP/TCP;unicast;interleaved=0-1") }, token);
            if (setupError is not null) return setupError;
            if (setup is null) return "The camera closed the connection";
            if (setup.status != 200) return DescribeStatus(setup);

            string transport = setup.Header("Transport");
            if (transport?.Contains("SAVP", StringComparison.OrdinalIgnoreCase) ?? false) return SRTP_UNSUPPORTED;
            if (!TryParseTransport(transport, out rtpChannel, out rtcpChannel)) {
                failureDetail = $"transport {Syntax.Sanitize(transport, 128)}";
                return INVALID_RESPONSE;
            }

            if (!TryParseSessionHeader(setup.Header("Session"), out sessionId, out sessionTimeout)) {
                failureDetail = "invalid session header";
                return INVALID_RESPONSE;
            }

            playUrl = ResolveControl(baseUrl, sdp.control) ?? baseUrl;

            (Message play, string playError) = await RequestAsync("PLAY", playUrl, new[] { ("Range", "npt=0.000-") }, token);
            if (playError is not null) return playError;
            if (play is null) return "The camera closed the connection";
            if (play.status != 200) return DescribeStatus(play);

            Interlocked.Exchange(ref lastPacket, Environment.TickCount64);
            playing = true;
            return null;
        }

        //the response, or the reason authentication can't go on
        private async Task<(Message, string)> RequestAsync(string method, string url, (string name, string value)[] headers, CancellationToken token) {
            Message response = null;

            for (int attempt = 0; attempt < MAX_AUTHENTICATION_ATTEMPTS; attempt++) {
                bool authorized = authenticator.CanAuthorize;
                int cseq = await SendRequestAsync(method, url, headers, token);
                response = await ReadResponseAsync(cseq, token);

                if (response is null || response.status != 401) return (response, null);
                if (!authenticator.HasCredentials) break;

                //Basic only behind a verified certificate, never in place of a digest
                Authenticator.ChallengeResult result = authenticator.SetChallenge(response.Headers("WWW-Authenticate"), target.secure && certificateVerified);
                switch (result) {
                case Authenticator.ChallengeResult.Insecure:
                    failureDetail = "the camera asked for Basic authentication without a verified TLS connection";
                    return (response, BASIC_REFUSED);

                case Authenticator.ChallengeResult.Unsupported:
                    failureDetail = "unsupported or malformed authentication challenge";
                    return (response, AUTHENTICATION_UNSUPPORTED);
                }

                //a digest nonce may expire, then the request is retried with the new one
                if (authorized && result != Authenticator.ChallengeResult.Stale) break;
            }

            authenticationFailed = true;
            return (response, null);
        }

        //every part of the request is checked as it's written, nothing reaches the camera unchecked
        private async Task<int> SendRequestAsync(string method, string url, (string name, string value)[] headers, CancellationToken token) {
            if (!Syntax.IsToken(method) || !Syntax.IsRequestTarget(url)) throw new InvalidDataException("Refused to send an invalid request");

            int cseq = connection.NextCSeq();

            StringBuilder builder = new StringBuilder();
            builder.Append(method).Append(' ').Append(url).Append(" RTSP/1.0\r\n");
            AppendHeader(builder, "CSeq", cseq.ToString());
            AppendHeader(builder, "User-Agent", USER_AGENT);

            string authorization = authenticator.GetAuthorization(method, url);
            if (authorization is not null) AppendHeader(builder, "Authorization", authorization);

            if (sessionId is not null) AppendHeader(builder, "Session", sessionId);

            if (headers is not null) {
                foreach ((string name, string value) in headers) {
                    AppendHeader(builder, name, value);
                }
            }

            builder.Append("\r\n");

            await connection.WriteAsync(Encoding.UTF8.GetBytes(builder.ToString()), token);
            return cseq;
        }

        internal static void AppendHeader(StringBuilder builder, string name, string value) {
            if (!Syntax.IsToken(name) || !Syntax.IsHeaderValue(value)) throw new InvalidDataException("Refused to send an invalid request");
            builder.Append(name).Append(": ").Append(value).Append("\r\n");
        }

        //Only the response numbered for this request answers it. A late answer to an earlier request is passed over,
        //an answer to one that was never sent ends the session.
        private async Task<Message> ReadResponseAsync(int cseq, CancellationToken token) {
            while (true) {
                Message message = await connection.ReadAsync(token);
                if (message is null) return null;

                switch (message.kind) {
                case MessageKind.Response:
                    int responseCSeq = message.CSeq;
                    if (responseCSeq == cseq) return message;
                    if (responseCSeq > cseq) throw new InvalidDataException(INVALID_RESPONSE);
                    break;

                case MessageKind.Request:
                    await ReplyAsync(message, token);
                    break;
                }
            }
        }

        //A few servers ask the client for keep-alives too.
        private Task ReplyAsync(Message request, CancellationToken token) {
            string status = request.method is "OPTIONS" or "GET_PARAMETER" or "SET_PARAMETER" ? "200 OK" : "501 Not Implemented";
            int cseq = Math.Max(request.CSeq, 0);
            return connection.WriteAsync(Encoding.ASCII.GetBytes($"RTSP/1.0 {status}\r\nCSeq: {cseq}\r\nUser-Agent: {USER_AGENT}\r\n\r\n"), token);
        }

        //the reason the stream ended
        public async Task<string> ReceiveAsync(Action<Frame> onFrame, CancellationToken token) {
            List<Frame> frames = new List<Frame>();

            while (true) {
                Message message;
                try {
                    message = await connection.ReadAsync(token);
                }
                catch (IOException) {
                    closedByCamera = true;
                    throw;
                }

                if (message is null) {
                    closedByCamera = true;
                    return "The camera closed the connection";
                }

                switch (message.kind) {
                case MessageKind.Interleaved:
                    if (message.channel != rtpChannel) break;
                    if (!RtpPacket.TryParse(message.payload, out RtpPacket packet) || packet.payloadType != track.payloadType) break;

                    Interlocked.Exchange(ref lastPacket, Environment.TickCount64);
                    depacketizer.Push(packet, frames);
                    foreach (Frame frame in frames) {
                        onFrame(frame);
                    }
                    frames.Clear();
                    break;

                case MessageKind.Request:
                    await ReplyAsync(message, token);
                    break;

                case MessageKind.Response: //to keep-alives
                    if (message.status == 454) return DescribeStatus(message);
                    break;
                }
            }
        }

        public async Task SendKeepAliveAsync(CancellationToken token) {
            await SendRequestAsync(getParameter ? "GET_PARAMETER" : "OPTIONS", getParameter ? playUrl : target.url, null, token);
        }

        //An empty receiver report, some servers drop a session that never reports.
        public Task SendReceiverReportAsync(CancellationToken token) {
            byte[] cname = "protest"u8.ToArray();
            int sdesLength = (4 + 4 + 2 + cname.Length + 1 + 3) & ~3; //header, ssrc, cname item, end of items, aligned to 32 bits

            byte[] packet = new byte[4 + 8 + sdesLength];
            packet[0] = (byte)'$';
            packet[1] = (byte)rtcpChannel;
            BinaryPrimitives.WriteUInt16BigEndian(packet.AsSpan(2), (ushort)(8 + sdesLength));

            packet[4] = 0x80; //version 2, no report blocks
            packet[5] = 201;  //receiver report
            BinaryPrimitives.WriteUInt16BigEndian(packet.AsSpan(6), 1);
            BinaryPrimitives.WriteUInt32BigEndian(packet.AsSpan(8), ssrc);

            packet[12] = 0x81; //version 2, one chunk
            packet[13] = 202;  //source description
            BinaryPrimitives.WriteUInt16BigEndian(packet.AsSpan(14), (ushort)(sdesLength / 4 - 1));
            BinaryPrimitives.WriteUInt32BigEndian(packet.AsSpan(16), ssrc);
            packet[20] = 1; //cname
            packet[21] = (byte)cname.Length;
            cname.CopyTo(packet, 22);

            return connection.WriteAsync(packet, token);
        }

        public async ValueTask DisposeAsync() {
            if (playing && !closedByCamera && connection is not null) {
                try {
                    using CancellationTokenSource cts = new CancellationTokenSource(CLOSE_TIMEOUT);
                    await SendRequestAsync("TEARDOWN", playUrl, null, cts.Token);
                }
                catch (Exception ex) when (ex is IOException or OperationCanceledException or ObjectDisposedException) { } //the camera is gone already
                catch (Exception ex) {
                    Logger.Debug(ex);
                }
            }

            connection?.Dispose();
            socket?.Dispose();
        }
    }

    //Basic and digest authentication, RFC 7617 and RFC 7616. Digest is preferred, SHA-256 over MD5. Basic is used only
    //when the camera offers no digest at all, never after a digest in the same session, and only where the caller
    //vouches for the transport. Malformed challenges are refused rather than guessed at.
    internal sealed class Authenticator {
        internal enum ChallengeResult {
            Accepted,
            Stale,       //a fresh nonce for a digest that was right
            Unsupported, //no usable challenge, nothing is sent
            Insecure     //only Basic, over a transport that isn't verified
        }

        private sealed class Challenge {
            public string scheme;
            public string realm;
            public string nonce;
            public string opaque;
            public string algorithm; //as sent back, null when the camera left it out (MD5)
            public string qop;
        }

        private static readonly string[] ALGORITHMS = { "SHA-256", "SHA-256-sess", "MD5", "MD5-sess" };

        private readonly string username;
        private readonly string password;
        private Challenge challenge;
        private bool usedDigest;
        private int nonceCount;

        public Authenticator(string username, string password) {
            this.username = username ?? String.Empty;
            this.password = password ?? String.Empty;
            if (!Syntax.IsCredential(this.username) || !Syntax.IsCredential(this.password)) {
                throw new ArgumentException("The credentials contain characters that can't be sent");
            }
        }

        public bool HasCredentials => username.Length > 0;
        public bool CanAuthorize => Volatile.Read(ref challenge) is not null && HasCredentials;

        public bool SetChallenge(IEnumerable<string> challenges, out bool stale) {
            ChallengeResult result = SetChallenge(challenges, true);
            stale = result == ChallengeResult.Stale;
            return result is ChallengeResult.Accepted or ChallengeResult.Stale;
        }

        public ChallengeResult SetChallenge(IEnumerable<string> challenges, bool secureTransport) {
            Challenge bestDigest = null;
            int bestRank = 0;
            bool sawDigest = false, sawBasic = false, stale = false;

            foreach (string header in challenges) {
                string trimmed = header.Trim();
                int space = trimmed.IndexOf(' ');
                string scheme = space < 0 ? trimmed : trimmed[..space];
                Dictionary<string, string> parameters = ParseParameters(space < 0 ? String.Empty : trimmed[(space + 1)..]);

                if (scheme.Equals("Basic", StringComparison.OrdinalIgnoreCase)) {
                    sawBasic |= parameters is not null;
                    continue;
                }

                if (!scheme.Equals("Digest", StringComparison.OrdinalIgnoreCase)) continue;
                sawDigest = true;

                Challenge digest = ParseDigest(parameters, out int rank, out bool isStale);
                if (digest is not null && rank > bestRank) {
                    bestDigest = digest;
                    bestRank = rank;
                    stale = isStale;
                }
            }

            if (bestDigest is not null) {
                bool wasDigest = Volatile.Read(ref challenge)?.scheme == "Digest";
                Volatile.Write(ref challenge, bestDigest);
                Interlocked.Exchange(ref nonceCount, 0);
                usedDigest = true;
                return stale && wasDigest ? ChallengeResult.Stale : ChallengeResult.Accepted;
            }

            //no fallback from a digest the gateway can't answer, and no downgrade after one
            if (sawDigest || usedDigest || !sawBasic) return ChallengeResult.Unsupported;
            if (!secureTransport) return ChallengeResult.Insecure;
            if (username.Contains(':')) return ChallengeResult.Unsupported; //Basic can't carry it

            Volatile.Write(ref challenge, new Challenge { scheme = "Basic" });
            return ChallengeResult.Accepted;
        }

        //a challenge with a realm and nonce, a supported algorithm and qop, or null
        private static Challenge ParseDigest(Dictionary<string, string> parameters, out int rank, out bool stale) {
            rank = 0;
            stale = false;
            if (parameters is null) return null;

            if (!parameters.TryGetValue("realm", out string realm) || !Syntax.IsQuotable(realm)) return null;
            if (!parameters.TryGetValue("nonce", out string nonce) || nonce.Length == 0 || !Syntax.IsQuotable(nonce)) return null;

            string opaque = null;
            if (parameters.TryGetValue("opaque", out string opaqueValue)) {
                if (!Syntax.IsQuotable(opaqueValue)) return null;
                opaque = opaqueValue;
            }

            string algorithm = null;
            if (parameters.TryGetValue("algorithm", out string algorithmValue)) {
                algorithm = ALGORITHMS.FirstOrDefault(o => o.Equals(algorithmValue, StringComparison.OrdinalIgnoreCase));
                if (algorithm is null) return null;
            }

            string qop = null;
            if (parameters.TryGetValue("qop", out string qopValue)) {
                string[] options = qopValue.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
                if (options.Contains("auth", StringComparer.OrdinalIgnoreCase)) qop = "auth";
                else if (options.Contains("auth-int", StringComparer.OrdinalIgnoreCase)) qop = "auth-int";
                else return null;
            }

            if (parameters.TryGetValue("stale", out string staleValue)) {
                if (staleValue.Equals("true", StringComparison.OrdinalIgnoreCase)) stale = true;
                else if (!staleValue.Equals("false", StringComparison.OrdinalIgnoreCase)) return null;
            }

            rank = algorithm is not null && algorithm.StartsWith("SHA-256", StringComparison.Ordinal) ? 2 : 1;
            return new Challenge { scheme = "Digest", realm = realm, nonce = nonce, opaque = opaque, algorithm = algorithm, qop = qop };
        }

        //for this request's method and target, safe to call from the keep-alive loop and the session alike
        public string GetAuthorization(string method, string uri) {
            Challenge current = Volatile.Read(ref challenge);
            if (current is null || !HasCredentials) return null;

            if (current.scheme == "Basic") {
                return $"Basic {Convert.ToBase64String(Encoding.UTF8.GetBytes($"{username}:{password}"))}";
            }

            string nc = null, cnonce = null;
            if (current.qop is not null) {
                nc = Interlocked.Increment(ref nonceCount).ToString("x8");
                cnonce = Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(8));
            }

            string response = DigestResponse(current.algorithm, username, current.realm, password, method, uri, current.nonce, nc, cnonce, current.qop);

            StringBuilder builder = new StringBuilder("Digest ");
            builder.Append($"username=\"{Quote(username)}\", realm=\"{Quote(current.realm)}\", nonce=\"{Quote(current.nonce)}\", uri=\"{Quote(uri)}\", response=\"{response}\"");
            if (current.algorithm is not null) builder.Append($", algorithm={current.algorithm}");
            if (current.opaque is not null) builder.Append($", opaque=\"{Quote(current.opaque)}\"");
            if (current.qop is not null) builder.Append($", qop={current.qop}, nc={nc}, cnonce=\"{cnonce}\"");
            return builder.ToString();
        }

        internal static string DigestResponse(string algorithm, string username, string realm, string password, string method, string uri, string nonce, string nc, string cnonce, string qop) {
            bool sha256 = algorithm is not null && algorithm.StartsWith("SHA-256", StringComparison.OrdinalIgnoreCase);
            bool session = algorithm is not null && algorithm.EndsWith("-sess", StringComparison.OrdinalIgnoreCase);

            string ha1 = Hash($"{username}:{realm}:{password}", sha256);
            if (session) ha1 = Hash($"{ha1}:{nonce}:{cnonce}", sha256);

            //requests carry no body, auth-int hashes an empty one
            string ha2 = qop == "auth-int" ? Hash($"{method}:{uri}:{Hash(String.Empty, sha256)}", sha256) : Hash($"{method}:{uri}", sha256);

            return qop is null
                ? Hash($"{ha1}:{nonce}:{ha2}", sha256)
                : Hash($"{ha1}:{nonce}:{nc}:{cnonce}:{qop}:{ha2}", sha256);
        }

        //digest authentication is defined over MD5, cameras rarely offer anything else
        private static string Hash(string text, bool sha256) {
            byte[] bytes = Encoding.UTF8.GetBytes(text);
            return Convert.ToHexStringLower(sha256 ? SHA256.HashData(bytes) : MD5.HashData(bytes));
        }

        //A quoted string, RFC 7230. Control characters can't be quoted, they're refused here as a last line of defense.
        internal static string Quote(string value) {
            if (!Syntax.IsQuotable(value, MAX_URL_LENGTH)) throw new InvalidDataException("Refused to send an invalid request");
            return value.Replace("\\", "\\\\").Replace("\"", "\\\"");
        }

        //key=token and key="quoted string" pairs, separated by commas. Null for anything malformed or a key given twice.
        internal static Dictionary<string, string> ParseParameters(string text) {
            Dictionary<string, string> parameters = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            int i = 0;

            while (i < text.Length) {
                while (i < text.Length && (text[i] == ',' || text[i] is ' ' or '\t')) i++;
                if (i == text.Length) break;

                int keyStart = i;
                while (i < text.Length && text[i] != '=' && text[i] != ',' && text[i] is not (' ' or '\t')) i++;
                string key = text[keyStart..i];
                if (!Syntax.IsToken(key)) return null;

                while (i < text.Length && text[i] is ' ' or '\t') i++;
                if (i == text.Length || text[i] != '=') return null;
                i++;
                while (i < text.Length && text[i] is ' ' or '\t') i++;

                string value;
                if (i < text.Length && text[i] == '"') {
                    i++;
                    StringBuilder builder = new StringBuilder();
                    bool closed = false;
                    while (i < text.Length) {
                        char c = text[i++];
                        if (c == '"') {
                            closed = true;
                            break;
                        }
                        if (c == '\\') {
                            if (i == text.Length) return null;
                            c = text[i++];
                        }
                        builder.Append(c);
                    }
                    if (!closed) return null;
                    value = builder.ToString();
                    if (!Syntax.IsQuotable(value)) return null;
                }
                else {
                    int valueStart = i;
                    while (i < text.Length && text[i] != ',' && text[i] is not (' ' or '\t')) i++;
                    value = text[valueStart..i];
                    if (!Syntax.IsToken(value)) return null;
                }

                while (i < text.Length && text[i] is ' ' or '\t') i++;
                if (i < text.Length && text[i] != ',') return null;

                if (!parameters.TryAdd(key, value)) return null;
            }

            return parameters;
        }
    }
}

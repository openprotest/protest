using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading;

namespace Protest.Http;

internal static partial class Chat {

    private readonly struct Message {
        public readonly long Timestamp {init; internal get;}
        public readonly byte[] Json {init; internal get;}
    }

    private const int MAX_HISTORY_ENTRIES = 1000;
    private const int MAX_HISTORY_SIZE = 32 * 1024 * 1024; //images make entries uneven, so the history is capped in bytes too
    private const int MAX_TEXT_LENGTH = 8192;
    private const string DEFAULT_COLOR = "#606060";

    private static readonly List<Message> history = new List<Message>(32);
    private static int historySize = 0; //bytes of json in the history, guarded by mutex
    private static readonly Lock mutex = new Lock();

    //emoji and command icons are loaded as css url() by every reader, a path to an api route would run it with the reader's session
    [GeneratedRegex(@"^mono/[a-z0-9]+\.svg\z")]
    private static partial Regex IconPathRegex();

    //base64 has no ( ) quotes or spaces, so an image src can't break out of a css url() into a second one
    [GeneratedRegex(@"^data:image/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+={0,2}\z")]
    private static partial Regex ImageDataUrlRegex();

    private static bool TryGetSender(string origin, out string username, out string alias, out string color) {
        if (!Auth.rbac.TryGetValue(origin, out Auth.AccessControl access) && origin != "loopback") {
            username = alias = color = null;
            return false;
        }

        username = access?.username ?? "loopback";
        alias    = !String.IsNullOrEmpty(access?.alias) ? access.alias : username;
        color    = access?.color ?? DEFAULT_COLOR;
        return true;
    }

    private static void Publish(byte[] json, long timestamp) {
        lock (mutex) {
            history.Add(new Message { Timestamp = timestamp, Json = json });
            historySize += json.Length;

            while (history.Count > MAX_HISTORY_ENTRIES || historySize > MAX_HISTORY_SIZE) {
                historySize -= history[0].Json.Length;
                history.RemoveAt(0);
            }
        }

        //stored before it is sent, so a chat window that opens on this message finds it in the history
        KeepAlive.Broadcast(json, "/chat/read");
    }

    public static void TextHandler(ConcurrentDictionary<string, string> dictionary, string origin) {
        if (!TryGetSender(origin, out string username, out string alias, out string color)) return;
        if (!dictionary.TryGetValue("text", out string text) || String.IsNullOrWhiteSpace(text) || text.Length > MAX_TEXT_LENGTH) return;

        dictionary.TryGetValue("id", out string id);
        long now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        byte[] json = JsonSerializer.SerializeToUtf8Bytes(new {
            action = "chat-text",
            id     = id,
            time   = now,
            sender = username,
            alias  = alias,
            color  = color,
            text   = text
        });

        Publish(json, now);
    }

    public static void ImageHandler(ConcurrentDictionary<string, string> dictionary, string origin) {
        if (!TryGetSender(origin, out string username, out string alias, out string color)) return;
        if (!dictionary.TryGetValue("src", out string src) || !ImageDataUrlRegex().IsMatch(src)) return;

        dictionary.TryGetValue("id", out string id);
        long now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        byte[] json = JsonSerializer.SerializeToUtf8Bytes(new {
            action = "chat-image",
            id     = id,
            time   = now,
            sender = username,
            alias  = alias,
            color  = color,
            src    = src
        });

        Publish(json, now);
    }

    public static void EmojiHandler(ConcurrentDictionary<string, string> dictionary, string origin) {
        if (!TryGetSender(origin, out string username, out string alias, out string color)) return;
        if (!dictionary.TryGetValue("url", out string url) || !IconPathRegex().IsMatch(url)) return;

        dictionary.TryGetValue("id", out string id);
        long now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        byte[] json = JsonSerializer.SerializeToUtf8Bytes(new {
            action = "chat-emoji",
            id     = id,
            time   = now,
            sender = username,
            alias  = alias,
            color  = color,
            url    = url
        });

        Publish(json, now);
    }

    public static void CommandHandler(ConcurrentDictionary<string, string> dictionary, string origin) {
        if (!TryGetSender(origin, out string username, out string alias, out string color)) return;
        if (!dictionary.TryGetValue("command", out string command)) return;
        if (!dictionary.TryGetValue("args", out string args)) return;
        if (!dictionary.TryGetValue("icon", out string icon) || !IconPathRegex().IsMatch(icon)) return;
        if (!dictionary.TryGetValue("title", out string title)) return;

        dictionary.TryGetValue("id", out string id);
        long now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        byte[] json = JsonSerializer.SerializeToUtf8Bytes(new {
            action  = "chat-command",
            id      = id,
            time    = now,
            sender  = username,
            alias   = alias,
            color   = color,
            command = command,
            args    = args,
            icon    = icon,
            title   = title,
        });

        Publish(json, now);
    }

    public static void SdpHandler(ConcurrentDictionary<string, string> dictionary, string origin) {
        if (!TryGetSender(origin, out string username, out string alias, out string color)) return;
        if (!dictionary.TryGetValue("type", out string type)) return;
        if (!dictionary.TryGetValue("peerId", out string peerId)) return;
        if (!dictionary.TryGetValue("target", out string target)) return;

        string sdp;
        string action;
        if (type == "chat-sdp-offer") {
            if (!dictionary.TryGetValue("offer", out sdp)) return;
            action = "chat-offer";
        }
        else if (type == "chat-sdp-answer") {
            if (!dictionary.TryGetValue("answer", out sdp)) return;
            action = "chat-answer";
        }
        else {
            return;
        }

        byte[] json = JsonSerializer.SerializeToUtf8Bytes(new {
            action  = action,
            peerId  = peerId,
            target  = target,
            time    = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            sender  = username,
            alias   = alias,
            color   = color,
            sdp     = sdp
        });

        KeepAlive.UnicastChatPeer(target, json, "/chat/read");
    }

    public static void IceHandler(ConcurrentDictionary<string, string> dictionary, string origin) {
        if (!TryGetSender(origin, out string username, out string alias, out string color)) return;
        if (!dictionary.TryGetValue("candidate", out string candidate)) return;
        if (!dictionary.TryGetValue("peerId", out string peerId)) return;
        if (!dictionary.TryGetValue("target", out string target)) return;

        byte[] json = JsonSerializer.SerializeToUtf8Bytes(new {
            action    = "chat-ice",
            peerId    = peerId,
            target    = target,
            time      = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            sender    = username,
            alias     = alias,
            color     = color,
            candidate = candidate
        });

        KeepAlive.UnicastChatPeer(target, json, "/chat/read");
    }

    public static void JoinHandler(ConcurrentDictionary<string, string> dictionary, string origin) {
        if (!TryGetSender(origin, out string username, out string alias, out string color)) return;
        if (!dictionary.TryGetValue("peerId", out string peerId)) return;

        byte[] json = JsonSerializer.SerializeToUtf8Bytes(new {
            action = "chat-join",
            peerId = peerId,
            time   = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            sender = username,
            alias  = alias,
            color  = color,
        });

        KeepAlive.Broadcast(json, "/chat/read");
    }

    public static void PresenceHandler(ConcurrentDictionary<string, string> dictionary, string origin) {
        if (!TryGetSender(origin, out string username, out string alias, out string color)) return;
        if (!dictionary.TryGetValue("peerId", out string peerId)) return;
        if (!dictionary.TryGetValue("target", out string target)) return;

        byte[] json = JsonSerializer.SerializeToUtf8Bytes(new {
            action = "chat-presence",
            peerId = peerId,
            target = target,
            time   = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            sender = username,
            alias  = alias,
            color  = color,
        });

        KeepAlive.UnicastChatPeer(target, json, "/chat/read");
    }

    public static void LeaveHandler(string peerId, string origin) {
        if (String.IsNullOrEmpty(peerId)) return;

        //a user removed from rbac mid-call still has to leave
        if (!TryGetSender(origin, out string username, out string alias, out string color)) {
            username = alias = origin;
            color = DEFAULT_COLOR;
        }

        byte[] json = JsonSerializer.SerializeToUtf8Bytes(new {
            action = "chat-leave",
            peerId = peerId,
            time   = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            sender = username,
            alias  = alias,
            color  = color,
        });

        KeepAlive.Broadcast(json, "/chat/read");
    }

    public static byte[] GetHistory() {
        long yesterday = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - 86_400_000;

        lock (mutex) {
            int expiredCount = 0;
            while (expiredCount < history.Count && history[expiredCount].Timestamp < yesterday) {
                historySize -= history[expiredCount].Json.Length;
                expiredCount++;
            }

            if (expiredCount > 0) {
                history.RemoveRange(0, expiredCount);
            }

            if (history.Count == 0) { return "[]"u8.ToArray(); }

            int totalSize = 2; //[ and ]
            if (history.Count > 1) {
                totalSize += history.Count - 1; //commas
            }

            foreach (Message msg in history) {
                totalSize += msg.Json.Length;
            }

            byte[] result = new byte[totalSize];
            int pos = 0;
            result[pos++] = (byte)'[';

            for (int i = 0; i < history.Count; i++) {
                if (i > 0) {
                    result[pos++] = (byte)',';
                }
                byte[] json = history[i].Json;
                Buffer.BlockCopy(json, 0, result, pos, json.Length);
                pos += json.Length;
            }

            result[pos] = (byte)']';
            return result;
        }
    }
}

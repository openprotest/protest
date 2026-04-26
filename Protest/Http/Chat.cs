using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading;

namespace Protest.Http;

internal static class Chat {

    private struct Message {
        public string sender;
        public long timestamp;
        public byte[] json;
    }

    private const int MAX_HISTORY_ENTRIES = 1000;
    private const string DEFAULT_COLOR = "#606060";

    private static readonly List<Message> history = new List<Message>(32);
    private static readonly Lock mutex = new Lock();

    private static void PushMessage(Message message) {
        lock(mutex) {
            history.Add(message);

            if (history.Count > MAX_HISTORY_ENTRIES) {
                history.RemoveRange(0, history.Count - MAX_HISTORY_ENTRIES);
            }
        }
    }

    public static void TextHandler(ConcurrentDictionary<string, string> dictionary, string origin) {
        if (!Auth.rbac.TryGetValue(origin, out Auth.AccessControl rbac) && origin != "loopback") return;
        if (!dictionary.TryGetValue("text", out string text)) return;

        dictionary.TryGetValue("id", out string id);

        string username = rbac?.username ?? "loopback";
        string alias = !String.IsNullOrEmpty(rbac?.alias) ? rbac.alias : username;
        long now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        byte[] json = JsonSerializer.SerializeToUtf8Bytes(new {
            action = "chat-text",
            id     = id,
            time   = now,
            sender = username,
            alias  = alias,
            color  = rbac?.color ?? DEFAULT_COLOR,
            text   = text
        });

        KeepAlive.Broadcast(json, "/chat/read");

        Message message = new Message {
            sender    = rbac?.username ?? "loopback",
            timestamp = now,
            json      = json
        };

        PushMessage(message);
    }

    public static void ImageHandler(ConcurrentDictionary<string, string> dictionary, string origin) {
        if (!Auth.rbac.TryGetValue(origin, out Auth.AccessControl rbac) && origin != "loopback") return;
        if (!dictionary.TryGetValue("src", out string src)) return;

        if (!src.StartsWith("data:image/")) return;

        dictionary.TryGetValue("id", out string id);

        string username = rbac?.username ?? "loopback";
        string alias = !String.IsNullOrEmpty(rbac?.alias) ? rbac.alias : username;

        long now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        byte[] json = JsonSerializer.SerializeToUtf8Bytes(new {
            action = "chat-image",
            id     = id,
            time   = now,
            sender = username,
            alias  = alias,
            color  = rbac?.color ?? DEFAULT_COLOR,
            src    = src
        });

        KeepAlive.Broadcast(json, "/chat/read");

        Message message = new Message {
            sender    = rbac?.username ?? "loopback",
            timestamp = now,
            json      = json
        };

        PushMessage(message);
    }

    public static void EmojiHandler(ConcurrentDictionary<string, string> dictionary, string origin) {
        if (!Auth.rbac.TryGetValue(origin, out Auth.AccessControl access) && origin != "loopback") return;
        if (!dictionary.TryGetValue("url", out string url)) return;

        dictionary.TryGetValue("id", out string id);

        string username = access?.username ?? "loopback";
        string alias = !String.IsNullOrEmpty(access?.alias) ? access.alias : username;
        long now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        byte[] json = JsonSerializer.SerializeToUtf8Bytes(new {
            action = "chat-emoji",
            id     = id,
            time   = now,
            sender = username,
            alias  = alias,
            color  = access?.color ?? DEFAULT_COLOR,
            url    = url
        });

        KeepAlive.Broadcast(json, "/chat/read");

        Message message = new Message {
            sender    = access?.username ?? "loopback",
            timestamp = now,
            json      = json
        };

        PushMessage(message);
    }

    public static void CommandHandler(ConcurrentDictionary<string, string> dictionary, string origin) {
        if (!Auth.rbac.TryGetValue(origin, out Auth.AccessControl access) && origin != "loopback") return;
        if (!dictionary.TryGetValue("command", out string command)) return;
        if (!dictionary.TryGetValue("args", out string args)) return;
        if (!dictionary.TryGetValue("icon", out string icon)) return;
        if (!dictionary.TryGetValue("title", out string title)) return;

        dictionary.TryGetValue("id", out string id);

        string username = access?.username ?? "loopback";
        string alias = !String.IsNullOrEmpty(access?.alias) ? access.alias : username;
        long now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        byte[] json = JsonSerializer.SerializeToUtf8Bytes(new {
            action  = "chat-command",
            id      = id,
            time    = now,
            sender  = username,
            alias   = alias,
            color   = access?.color ?? DEFAULT_COLOR,
            command = command,
            args    = args,
            icon    = icon,
            title   = title,
        });

        KeepAlive.Broadcast(json, "/chat/read");

        Message message = new Message {
            sender    = access?.username ?? "loopback",
            timestamp = now,
            json      = json
        };

        PushMessage(message);
    }

    public static void SdpHandler(ConcurrentDictionary<string, string> dictionary, string origin) {
        if (!Auth.rbac.TryGetValue(origin, out Auth.AccessControl access) && origin != "loopback") return;
        if (!dictionary.TryGetValue("type", out string type)) return;
        if (!dictionary.TryGetValue("uuid", out string uuid)) return;

        string username = access?.username ?? "loopback";
        string alias = !String.IsNullOrEmpty(access?.alias) ? access.alias : username;

        string sdp = null;
        string action = null;
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
            uuid    = uuid,
            time    = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            sender  = username,
            alias   = alias,
            color   = access?.color ?? DEFAULT_COLOR,
            sdp     = sdp
        });

        KeepAlive.Broadcast(json, "/chat/read", false, origin);
    }

    public static void IceHandler(ConcurrentDictionary<string, string> dictionary, string origin) {
        if (!Auth.rbac.TryGetValue(origin, out Auth.AccessControl access) && origin != "loopback") return;
        if (!dictionary.TryGetValue("candidate", out string candidate)) return;
        if (!dictionary.TryGetValue("uuid", out string uuid)) return;

        string username = access?.username ?? "loopback";
        string alias = !String.IsNullOrEmpty(access?.alias) ? access.alias : username;

        byte[] json = JsonSerializer.SerializeToUtf8Bytes(new {
            action    = "chat-ice",
            uuid      = uuid,
            time      = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            sender    = username,
            alias     = alias,
            color     = access?.color ?? DEFAULT_COLOR,
            candidate = candidate
        });

        KeepAlive.Broadcast(json, "/chat/read", false, origin);
    }

    public static void JoinHandler(string origin) {
        if (!Auth.rbac.TryGetValue(origin, out Auth.AccessControl access) && origin != "loopback") return;

        string username = access?.username ?? "loopback";
        string alias = !String.IsNullOrEmpty(access?.alias) ? access.alias : username;

        byte[] json = JsonSerializer.SerializeToUtf8Bytes(new {
            action = "chat-join",
            time   = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            sender = username,
            alias  = alias,
            color  = access?.color ?? DEFAULT_COLOR,
        });

        KeepAlive.Broadcast(json, "/chat/read");
    }

    public static void StreamHandler(ConcurrentDictionary<string, string> dictionary, string origin) {
        if (!Auth.rbac.TryGetValue(origin, out Auth.AccessControl access) && origin != "loopback") return;
        if (!dictionary.TryGetValue("uuid", out string uuid)) return;

        string username = access?.username ?? "loopback";
        string alias = !String.IsNullOrEmpty(access?.alias) ? access.alias : username;
        long now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        byte[] json = JsonSerializer.SerializeToUtf8Bytes(new {
            action = "chat-stream",
            uuid   = uuid,
            time   = now,
            sender = username,
            alias  = alias,
            color  = access?.color ?? DEFAULT_COLOR,
        });

        KeepAlive.Broadcast(json, "/chat/read");

        Message message = new Message {
            sender    = access?.username ?? "loopback",
            timestamp = now,
            json      = json
        };

        PushMessage(message);
    }

    public static byte[] GetHistory() {
        long yesterday = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - 86_400_000;

        lock (mutex) {
            int expiredCount = 0;
            while (expiredCount < history.Count && history[expiredCount].timestamp < yesterday) {
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

            foreach (var msg in history) {
                totalSize += msg.json.Length;
            }

            byte[] result = new byte[totalSize];
            int pos = 0;
            result[pos++] = (byte)'[';

            for (int i = 0; i < history.Count; i++) {
                if (i > 0) {
                    result[pos++] = (byte)',';
                }
                var json = history[i].json;
                Buffer.BlockCopy(json, 0, result, pos, json.Length);
                pos += json.Length;
            }

            result[pos] = (byte)']';
            return result;
        }
    }
}

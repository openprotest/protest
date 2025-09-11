using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.Text;
using System.Text.Json;
using System.Threading;
using static Protest.Tools.Monitor;

namespace Protest.Http;

internal static class Chat {

    private struct Message {
        public string sender;
        public long timestamp;
        public byte[] json;
    }

    private static readonly List<Message> history = new List<Message>(32);
    private static readonly Lock mutex = new Lock();

    public static void TextHandler(ConcurrentDictionary<string, string> dictionary, string origin) {
        if (!Auth.rbac.TryGetValue(origin, out Auth.AccessControl rbac) && origin != "loopback") { return; }
        if (!dictionary.TryGetValue("text", out string text)) { return; }

        dictionary.TryGetValue("id", out string id);

        string username = rbac?.username ?? "loopback";
        string alias = !String.IsNullOrEmpty(rbac?.alias) ? rbac.alias : username;

        byte[] json = JsonSerializer.SerializeToUtf8Bytes(new {
            action = "chat-text",
            id     = id,
            time   = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            sender = username,
            alias  = alias,
            color  = rbac?.color ?? "#A0A0A0",
            text   = text
        });

        KeepAlive.Broadcast(json, "/chat/read");

        Message message = new Message {
            sender = rbac?.username ?? "loopback",
            timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            json = json
        };

        lock(mutex) {
            history.Add(message);
        }
    }

    public static void EmojiHandler(ConcurrentDictionary<string, string> dictionary, string origin) {
        if (!Auth.rbac.TryGetValue(origin, out Auth.AccessControl access) && origin != "loopback") { return; }
        if (!dictionary.TryGetValue("url", out string url)) { return; }

        dictionary.TryGetValue("id", out string id);

        string username = access?.username ?? "loopback";
        string alias = !String.IsNullOrEmpty(access?.alias) ? access.alias : username;

        byte[] json = JsonSerializer.SerializeToUtf8Bytes(new {
            action = "chat-emoji",
            id     = id,
            time   = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            sender = username,
            alias  = alias,
            color  = access?.color ?? "#A0A0A0",
            url    = url
        });

        KeepAlive.Broadcast(json, "/chat/read");

        Message message = new Message {
            sender = access?.username ?? "loopback",
            timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            json = json
        };

        lock (mutex) {
            history.Add(message);
        }
    }

    public static void CommandHandler(ConcurrentDictionary<string, string> dictionary, string origin) {
        if (!Auth.rbac.TryGetValue(origin, out Auth.AccessControl access) && origin != "loopback") { return; }
        if (!dictionary.TryGetValue("command", out string command)) { return; }
        if (!dictionary.TryGetValue("args", out string args)) { return; }
        if (!dictionary.TryGetValue("icon", out string icon)) { return; }
        if (!dictionary.TryGetValue("title", out string title)) { return; }

        dictionary.TryGetValue("id", out string id);

        string username = access?.username ?? "loopback";
        string alias = !String.IsNullOrEmpty(access?.alias) ? access.alias : username;

        byte[] json = JsonSerializer.SerializeToUtf8Bytes(new {
            action  = "chat-command",
            id      = id,
            time    = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            sender  = username,
            alias   = alias,
            color   = access?.color ?? "#A0A0A0",
            command = command,
            args    = args,
            icon    = icon,
            title   = title,
        });

        KeepAlive.Broadcast(json, "/chat/read");

        Message message = new Message {
            sender = access?.username ?? "loopback",
            timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            json = json
        };

        lock (mutex) {
            history.Add(message);
        }
    }

    public static void SdpHandler(ConcurrentDictionary<string, string> dictionary, string origin) {
        if (!Auth.rbac.TryGetValue(origin, out Auth.AccessControl access) && origin != "loopback") { return; }
        if (!dictionary.TryGetValue("type", out string type)) { return; }
        if (!dictionary.TryGetValue("uuid", out string uuid)) { return; }

        string username = access?.username ?? "loopback";
        string alias = !String.IsNullOrEmpty(access?.alias) ? access.alias : username;

        string sdp = null;
        string action = null;
        if (type == "chat-sdp-offer") {
            if (!dictionary.TryGetValue("offer", out sdp)) { return; }
            action = "chat-offer";
        }
        else if (type == "chat-sdp-answer") {
            if (!dictionary.TryGetValue("answer", out sdp)) { return; }
            action = "chat-answer";
        }

        byte[] json = JsonSerializer.SerializeToUtf8Bytes(new {
            action  = action,
            uuid    = uuid,
            time    = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            sender  = username,
            alias   = alias,
            color   = access?.color ?? "#A0A0A0",
            sdp     = sdp
        });

        KeepAlive.Broadcast(json, "/chat/read", false, origin);
    }

    public static void IceHandler(ConcurrentDictionary<string, string> dictionary, string origin) {
        if (!Auth.rbac.TryGetValue(origin, out Auth.AccessControl access) && origin != "loopback") { return; }
        if (!dictionary.TryGetValue("candidate", out string candidate)) { return; }
        if (!dictionary.TryGetValue("uuid", out string uuid)) { return; }

        string username = access?.username ?? "loopback";
        string alias = !String.IsNullOrEmpty(access?.alias) ? access.alias : username;

        byte[] json = JsonSerializer.SerializeToUtf8Bytes(new {
            action    = "chat-ice",
            uuid      = uuid,
            time      = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            sender    = username,
            alias     = alias,
            color     = access?.color ?? "#A0A0A0",
            candidate = candidate
        });

        KeepAlive.Broadcast(json, "/chat/read", false, origin);
    }

    public static void JoinHandler(string origin) {
        if (!Auth.rbac.TryGetValue(origin, out Auth.AccessControl access) && origin != "loopback") { return; }

        string username = access?.username ?? "loopback";
        string alias = !String.IsNullOrEmpty(access?.alias) ? access.alias : username;

        byte[] json = JsonSerializer.SerializeToUtf8Bytes(new {
            action = "chat-join",
            time   = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            sender = username,
            alias  = alias,
            color  = access?.color ?? "#A0A0A0",
        });

        KeepAlive.Broadcast(json, "/chat/read");
    }

    public static void StreamHandler(ConcurrentDictionary<string, string> dictionary, string origin) {
        if (!Auth.rbac.TryGetValue(origin, out Auth.AccessControl access) && origin != "loopback") { return; }
        if (!dictionary.TryGetValue("uuid", out string uuid)) { return; }

        string username = access?.username ?? "loopback";
        string alias = !String.IsNullOrEmpty(access?.alias) ? access.alias : username;

        byte[] json = JsonSerializer.SerializeToUtf8Bytes(new {
            action = "chat-stream",
            uuid   = uuid,
            time   = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            sender = username,
            alias  = alias,
            color  = access?.color ?? "#A0A0A0",
        });

        KeepAlive.Broadcast(json, "/chat/read");

        Message message = new Message {
            sender = access?.username ?? "loopback",
            timestamp =DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            json = json
        };

        lock (mutex) {
            history.Add(message);
        }
    }

    public static byte[] GetHistory() {
        long yesterday = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - 86_400_000;

        lock (mutex) {
            while (history.Count > 0 && history[0].timestamp < yesterday) {
                history.RemoveAt(0);
            }

            if (history.Count == 0) { return "[]"u8.ToArray(); }

            int totalSize = 2; //[ and ]
            if (history.Count > 1) {
                totalSize += history.Count - 1; // commas
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

            result[pos++] = (byte)']';
            return result;
        }
    }
}

﻿using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Text;
using System.Threading;

namespace Protest.Http;

internal static class Chat {

    private struct Message {
        public string sender;
        public long timestamp;
        public string json;
    }

    private static readonly List<Message> history = new List<Message>();
    private static readonly Lock mutex = new Lock();

    public static void TextHandler(ConcurrentDictionary<string, string> dictionary, string origin) {
        if (!Auth.rbac.TryGetValue(origin, out Auth.AccessControl rbac) && origin != "loopback") { return; }
        if (!dictionary.TryGetValue("text", out string text)) { return; }

        dictionary.TryGetValue("id", out string id);

        string username = rbac?.username ?? "loopback";
        string alias = !String.IsNullOrEmpty(rbac?.alias) ? rbac.alias : username;
        string sanitised = Data.EscapeJsonText(text);

        StringBuilder builder = new StringBuilder();
        builder.Append('{');
        builder.Append($"\"action\":\"chat-text\",");
        builder.Append($"\"id\":\"{id}\",");
        builder.Append($"\"time\":\"{DateTime.UtcNow.Ticks}\",");
        builder.Append($"\"sender\":\"{username}\",");
        builder.Append($"\"alias\":\"{alias}\",");
        builder.Append($"\"color\":\"{rbac?.color ?? "#A0A0A0"}\",");
        builder.Append($"\"text\":\"{sanitised}\"");
        builder.Append('}');

        string json = builder.ToString();

        KeepAlive.Broadcast(json, "/chat/read");

        Message message = new Message {
            sender = rbac?.username ?? "loopback",
            timestamp = DateTime.UtcNow.Ticks,
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

        StringBuilder builder = new StringBuilder();
        builder.Append('{');
        builder.Append($"\"action\":\"chat-emoji\",");
        builder.Append($"\"id\":\"{id}\",");
        builder.Append($"\"time\":\"{DateTime.UtcNow.Ticks}\",");
        builder.Append($"\"sender\":\"{username}\",");
        builder.Append($"\"alias\":\"{alias}\",");
        builder.Append($"\"color\":\"{access?.color ?? "#A0A0A0"}\",");
        builder.Append($"\"url\":\"{url}\"");
        builder.Append('}');

        string json = builder.ToString();

        KeepAlive.Broadcast(json, "/chat/read");

        Message message = new Message {
            sender = access?.username ?? "loopback",
            timestamp = DateTime.UtcNow.Ticks,
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

        StringBuilder builder = new StringBuilder();
        builder.Append('{');
        builder.Append($"\"action\":\"chat-command\",");
        builder.Append($"\"id\":\"{id}\",");
        builder.Append($"\"time\":\"{DateTime.UtcNow.Ticks}\",");
        builder.Append($"\"sender\":\"{username}\",");
        builder.Append($"\"alias\":\"{alias}\",");
        builder.Append($"\"color\":\"{access?.color ?? "#A0A0A0"}\",");
        builder.Append($"\"command\":\"{command}\",");
        builder.Append($"\"args\":\"{Data.EscapeJsonText(args)}\",");
        builder.Append($"\"icon\":\"{Data.EscapeJsonText(icon)}\",");
        builder.Append($"\"title\":\"{Data.EscapeJsonText(title)}\"");
        builder.Append('}');

        string json = builder.ToString();

        KeepAlive.Broadcast(json, "/chat/read");

        Message message = new Message {
            sender = access?.username ?? "loopback",
            timestamp = DateTime.UtcNow.Ticks,
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

        StringBuilder builder = new StringBuilder();
        builder.Append('{');
        builder.Append($"\"action\":\"{action}\",");
        builder.Append($"\"uuid\":\"{Data.EscapeJsonText(uuid)}\",");
        builder.Append($"\"time\":\"{DateTime.UtcNow.Ticks}\",");
        builder.Append($"\"sender\":\"{username}\",");
        builder.Append($"\"alias\":\"{alias}\",");
        builder.Append($"\"color\":\"{access?.color ?? "#A0A0A0"}\",");
        builder.Append($"\"sdp\":\"{Data.EscapeJsonText(sdp)}\"");
        builder.Append('}');

        string json = builder.ToString();

        KeepAlive.Broadcast(json, "/chat/read", false, origin);
    }

    public static void IceHandler(ConcurrentDictionary<string, string> dictionary, string origin) {
        if (!Auth.rbac.TryGetValue(origin, out Auth.AccessControl access) && origin != "loopback") { return; }
        if (!dictionary.TryGetValue("candidate", out string candidate)) { return; }
        if (!dictionary.TryGetValue("uuid", out string uuid)) { return; }

        string username = access?.username ?? "loopback";
        string alias = !String.IsNullOrEmpty(access?.alias) ? access.alias : username;

        StringBuilder builder = new StringBuilder();
        builder.Append('{');
        builder.Append($"\"action\":\"chat-ice\",");
        builder.Append($"\"uuid\":\"{Data.EscapeJsonText(uuid)}\",");
        builder.Append($"\"time\":\"{DateTime.UtcNow.Ticks}\",");
        builder.Append($"\"sender\":\"{username}\",");
        builder.Append($"\"alias\":\"{alias}\",");
        builder.Append($"\"color\":\"{access?.color ?? "#A0A0A0"}\",");
        builder.Append($"\"candidate\":\"{Data.EscapeJsonText(candidate)}\"");
        builder.Append('}');

        string json = builder.ToString();

        KeepAlive.Broadcast(json, "/chat/read", false, origin);
    }

    public static void JoinHandler(string origin) {
        if (!Auth.rbac.TryGetValue(origin, out Auth.AccessControl access) && origin != "loopback") { return; }

        string username = access?.username ?? "loopback";
        string alias = !String.IsNullOrEmpty(access?.alias) ? access.alias : username;

        StringBuilder builder = new StringBuilder();
        builder.Append('{');
        builder.Append($"\"action\":\"chat-join\",");
        builder.Append($"\"time\":\"{DateTime.UtcNow.Ticks}\",");
        builder.Append($"\"sender\":\"{username}\",");
        builder.Append($"\"alias\":\"{alias}\",");
        builder.Append($"\"color\":\"{access?.color ?? "#A0A0A0"}\"");
        builder.Append('}');

        string json = builder.ToString();

        KeepAlive.Broadcast(json, "/chat/read");
    }

    public static void StreamHandler(ConcurrentDictionary<string, string> dictionary, string origin) {
        if (!Auth.rbac.TryGetValue(origin, out Auth.AccessControl access) && origin != "loopback") { return; }
        if (!dictionary.TryGetValue("uuid", out string uuid)) { return; }

        string username = access?.username ?? "loopback";
        string alias = !String.IsNullOrEmpty(access?.alias) ? access.alias : username;

        StringBuilder builder = new StringBuilder();
        builder.Append('{');
        builder.Append($"\"action\":\"chat-stream\",");
        builder.Append($"\"uuid\":\"{Data.EscapeJsonText(uuid)}\",");
        builder.Append($"\"time\":\"{DateTime.UtcNow.Ticks}\",");
        builder.Append($"\"sender\":\"{username}\",");
        builder.Append($"\"alias\":\"{alias}\",");
        builder.Append($"\"color\":\"{access?.color ?? "#A0A0A0"}\"");
        builder.Append('}');

        string json = builder.ToString();

        KeepAlive.Broadcast(json, "/chat/read");

        Message message = new Message {
            sender = access?.username ?? "loopback",
            timestamp = DateTime.UtcNow.Ticks,
            json = json
        };

        lock (mutex) {
            history.Add(message);
        }
    }

    public static byte[] GetHistory() {
        long yesterday = DateTime.UtcNow.Ticks - 864_000_000_000;

        lock (mutex) {
            while (history.Count > 0 && history[0].timestamp < yesterday) {
                history.RemoveAt(0);
            }
        }

        if (history.Count == 0) { return "[]"u8.ToArray(); }

        StringBuilder builder = new StringBuilder();
        builder.Append('[');
        bool first = true;
        lock (mutex) {
            for (int i = 0; i < history.Count; i++) {
                if (!first) { builder.Append(','); }
                builder.Append(history[i].json);
                first = false;
            }
        }
        builder.Append(']');

        return Encoding.UTF8.GetBytes(builder.ToString());
    }
}

using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Reflection.Metadata;
using System.Text;

namespace Protest.Http;

internal static class Chat {

    private struct Message {
        public string sender;
        public long timestamp;
        public string json;
    }

    private static readonly List<Message> history = new List<Message>();
    private static readonly object syncLock = new object();

    public static void TextHandler(ConcurrentDictionary<string, string> dictionary, string origin) {
        if (!Auth.acl.TryGetValue(origin, out Auth.AccessControl acl) && origin != "loopback") { return; }
        if (!dictionary.TryGetValue("text", out string text)) { return; }

        dictionary.TryGetValue("id", out string id);

        string username = acl?.username ?? "loopback";
        string alias = !String.IsNullOrEmpty(acl?.alias) ? acl.alias : username;
        string sanitised = Data.EscapeJsonText(text);

        string json = BuildTextMessage(
            id,
            username,
            alias,
            acl?.color ?? "#A0A0A0",
            sanitised
            );

        Message message = new Message {
            sender = acl?.username ?? "loopback",
            timestamp = DateTime.UtcNow.Ticks,
            json = json
        };

        lock(syncLock) {
            history.Add(message);
        }

        KeepAlive.Broadcast(json, "/chat/read");
    }

    public static void CommandHandler(ConcurrentDictionary<string, string> dictionary, string origin) {
        if (!Auth.acl.TryGetValue(origin, out Auth.AccessControl acl) && origin != "loopback") { return; }
        if (!dictionary.TryGetValue("command", out string command)) { return; }
        if (!dictionary.TryGetValue("params", out string param)) { return; }
        if (!dictionary.TryGetValue("icon", out string icon)) { return; }
        if (!dictionary.TryGetValue("title", out string title)) { return; }

        dictionary.TryGetValue("id", out string id);

        string username = acl?.username ?? "loopback";
        string alias = !String.IsNullOrEmpty(acl?.alias) ? acl.alias : username;

        string json = BuildCommandMessage(
            id,
            username,
            alias,
            acl?.color ?? "#A0A0A0",
            Data.EscapeJsonText(command),
            param,
            Data.EscapeJsonText(icon),
            Data.EscapeJsonText(title)
            );

        Message message = new Message {
            sender = acl?.username ?? "loopback",
            timestamp = DateTime.UtcNow.Ticks,
            json = json
        };

        lock (syncLock) {
            history.Add(message);
        }

        KeepAlive.Broadcast(json, "/chat/read");
    }

    private static string BuildTextMessage(string id, string sender, string alias, string color, string text) {
        StringBuilder builder = new StringBuilder();
        builder.Append('{');
        builder.Append($"\"action\":\"chattext\",");
        builder.Append($"\"id\":\"{id}\",");
        builder.Append($"\"time\":\"{DateTime.UtcNow.Ticks}\",");
        builder.Append($"\"sender\":\"{sender}\",");
        builder.Append($"\"alias\":\"{alias}\",");
        builder.Append($"\"color\":\"{color}\",");
        builder.Append($"\"text\":\"{text}\"");
        builder.Append('}');

        return builder.ToString();
    }

    private static string BuildCommandMessage(string id, string sender, string alias, string color, string command, String param, string icon, string title) {
        StringBuilder builder = new StringBuilder();
        builder.Append('{');
        builder.Append($"\"action\":\"chatcommand\",");
        builder.Append($"\"id\":\"{id}\",");
        builder.Append($"\"time\":\"{DateTime.UtcNow.Ticks}\",");
        builder.Append($"\"sender\":\"{sender}\",");
        builder.Append($"\"alias\":\"{alias}\",");
        builder.Append($"\"color\":\"{color}\",");
        builder.Append($"\"command\":\"{command}\",");
        builder.Append($"\"params\":\"{Data.EscapeJsonText(param)}\",");
        builder.Append($"\"icon\":\"{Data.EscapeJsonText(icon)}\",");
        builder.Append($"\"title\":\"{Data.EscapeJsonText(title)}\"");
        builder.Append('}');

        return builder.ToString();
    }

    public static byte[] GetHistory() {
        long yesterday = DateTime.UtcNow.Ticks - 864_000_000_000;

        lock (syncLock) {
            while (history.Count > 0 && history[0].timestamp < yesterday) {
                history.RemoveAt(0);
            }
        }

        if (history.Count == 0) { return "[]"u8.ToArray(); }

        StringBuilder builder = new StringBuilder();
        builder.Append('[');
        bool first = true;
        lock (syncLock) {
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

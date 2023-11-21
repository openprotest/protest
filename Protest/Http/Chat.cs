using System.Collections.Concurrent;
using System.Text;

namespace Protest.Http;

internal static class Chat {

    private struct Message {
        public string content;
        public string sender;
        public long timestamp;
    }

    private static readonly ConcurrentBag<Message> history = new ConcurrentBag<Message>();

    public static void MessageHandler(ConcurrentDictionary<string, string> dictionary, string origin) {
        if (!Auth.acl.TryGetValue(origin, out Auth.AccessControl acl) && origin != "loopback") { return; }
        if (!dictionary.TryGetValue("text", out string text)) { return; }

        dictionary.TryGetValue("id", out string id);

        string sanitised = Data.EscapeJsonText(text);

        Message message = new Message {
            content = sanitised,
            sender = acl?.username ?? "loopback",
            timestamp = DateTime.UtcNow.Ticks
        };

        history.Add(message);

        StringBuilder builder = new StringBuilder();
        builder.Append('{');
        builder.Append($"\"action\":\"chattext\",");
        builder.Append($"\"id\":\"{id}\",");
        builder.Append($"\"time\":\"{DateTime.UtcNow.Ticks}\",");
        builder.Append($"\"sender\":\"{(String.IsNullOrEmpty(acl?.alias ?? null) ? acl?.username ?? "loopback" : acl.alias)}\",");
        builder.Append($"\"color\":\"{acl?.color ?? "#A0A0A0"}\",");
        builder.Append($"\"text\":\"{sanitised}\"");
        builder.Append('}');

        KeepAlive.Broadcast(builder.ToString(), "/chat/read");
    }

    public static void CommandHandler(ConcurrentDictionary<string, string> dictionary, string origin) {
        if (!Auth.acl.TryGetValue(origin, out Auth.AccessControl acl) && origin != "loopback") { return; }
        if (!dictionary.TryGetValue("command", out string command)) { return; }
        if (!dictionary.TryGetValue("params", out string param)) { return; }
        if (!dictionary.TryGetValue("icon", out string icon)) { return; }
        if (!dictionary.TryGetValue("title", out string title)) { return; }

        dictionary.TryGetValue("id", out string id);

        StringBuilder builder = new StringBuilder();
        builder.Append('{');
        builder.Append($"\"action\":\"chatcommand\",");
        builder.Append($"\"id\":\"{id}\",");
        builder.Append($"\"time\":\"{DateTime.UtcNow.Ticks}\",");
        builder.Append($"\"sender\":\"{(String.IsNullOrEmpty(acl?.alias ?? null) ? acl?.username ?? "loopback" : acl.alias)}\",");
        builder.Append($"\"color\":\"{acl?.color ?? "#A0A0A0"}\",");
        builder.Append($"\"command\":\"{command}\",");
        builder.Append($"\"params\":\"{Data.EscapeJsonText(param)}\",");
        builder.Append($"\"icon\":\"{Data.EscapeJsonText(icon)}\",");
        builder.Append($"\"title\":\"{Data.EscapeJsonText(title)}\"");
        builder.Append('}');

        KeepAlive.Broadcast(builder.ToString(), "/chat/read");
    }

    public static byte[] GetHistory() {
        history.ToArray();
        //TODO:
        return null;
    }
}

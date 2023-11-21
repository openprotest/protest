using System.Collections.Concurrent;
using System.Diagnostics.CodeAnalysis;
using System.Text;

namespace Protest.Http;

internal static class Chat {

    private struct Message {
        public string content;
        public string sender;
        public long timestamp;
    }

    private static readonly ConcurrentBag<Message> history = new ConcurrentBag<Message>();

    public static void HandlerText(ConcurrentDictionary<string, string> dictionary, string origin) {
        if (!Auth.acl.TryGetValue(origin, out Auth.AccessControl acl)) { return; }
        if (!dictionary.TryGetValue("text", out string text)) { return; }

        dictionary.TryGetValue("id", out string id);

        string sanitised = Data.EscapeJsonText(text);

        Message message = new Message {
            content = sanitised,
            sender = acl.username,
            timestamp = DateTime.UtcNow.Ticks
        };

        history.Add(message);

        StringBuilder builder = new StringBuilder();
        builder.Append('{');
        builder.Append("\"action\":\"chattext\",");
        builder.Append($"\"id\":\"{id}\",");
        builder.Append($"\"time\":\"{DateTime.UtcNow.Ticks}\",");
        builder.Append($"\"sender\":\"{(String.IsNullOrEmpty(acl.alias) ? acl.username : acl.alias)}\",");
        builder.Append($"\"color\":\"{acl.color}\",");
        builder.Append($"\"content\":\"{sanitised}\"");
        builder.Append('}');

        KeepAlive.Broadcast(builder.ToString(), "/chat/read");
    }

    public static byte[] GetHistory() {
        history.ToArray();
        //TODO:
        return null;
    }
}

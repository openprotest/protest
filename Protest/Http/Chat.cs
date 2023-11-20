using System.Collections.Concurrent;
using static System.Net.Mime.MediaTypeNames;

namespace Protest.Http;

internal static class Chat {

    private struct Message {
        public string text;
        public string sender;
        public long timestamp;
    }

    private static readonly ConcurrentBag<Message> history = new ConcurrentBag<Message>();

    public static void Handler(string payload) {
        string text = null;
        string sender = null;
        long timestamp = 0;

        //TODO:
        Console.WriteLine(payload);

        Handler(text, sender, timestamp);
    }

    public static void Handler(string text, string sender, long timestamp) {
        Message message = new Message {
            text = text,
            sender = sender,
            timestamp = timestamp
        };

        history.Add(message);
    }

    public static byte[] GetHistory() {
        history.ToArray();
        return null;
    }
}

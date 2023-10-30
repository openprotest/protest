using System.Net;

namespace Protest.Tools;

internal static class Lifeline {
    public static void Initialize() {
        foreach (Database.Entry entry in DatabaseInstances.devices.dictionary.Values) {
            string[] remoteEndPoint;

            if (entry.attributes.TryGetValue("ip", out Database.Attribute ipAttr)) {
                remoteEndPoint = ipAttr.value.Split(';');
            }
            else if (entry.attributes.TryGetValue("hostname", out Database.Attribute hostnameAttr)) {
                remoteEndPoint = hostnameAttr.value.Split(';');
            }
            else {
                continue;
            }

            string os = entry.attributes.TryGetValue("operating system", out Database.Attribute osAttr) ?
                osAttr.value.ToLower() :
                null;

            for (int i = 0; i < remoteEndPoint.Length; i++) {
                Ping(remoteEndPoint[i]);

                if (os.Contains("windows")) {
                    Memory(remoteEndPoint[i]);
                    Disk(remoteEndPoint[i]);
                }
            }

        }
    }

    private static void Ping(string host) {
        try {

        }
        catch { }
    }

    private static void Memory(string host) {
        try {

        }
        catch { }
    }

    private static void Disk(string host) {
        try {

        }
        catch { }
    }

    public static async void WebSocketHandler(HttpListenerContext ctx) {

    }

}
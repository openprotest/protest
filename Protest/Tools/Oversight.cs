using System.Net.WebSockets;
using System.Net;
using System.Text;
using System.Threading;

namespace Protest.Tools;

internal class Oversight {
    private static async void WsWriteText(WebSocket ws, string text, object sendLock = null) {
        if (sendLock is null) {
            await ws.SendAsync(new ArraySegment<byte>(Encoding.UTF8.GetBytes(text), 0, text.Length), WebSocketMessageType.Text, true, CancellationToken.None);
        }
        else {
            lock (sendLock) {
                ws.SendAsync(new ArraySegment<byte>(Encoding.UTF8.GetBytes(text), 0, text.Length), WebSocketMessageType.Text, true, CancellationToken.None);
            }
        }
    }
    private static async void WsWriteText(WebSocket ws, byte[] bytes, object sendLock = null) {
        if (sendLock is null) {
            await ws.SendAsync(new ArraySegment<byte>(bytes, 0, bytes.Length), WebSocketMessageType.Text, true, CancellationToken.None);
        }
        else {
            lock (sendLock) {
                ws.SendAsync(new ArraySegment<byte>(bytes, 0, bytes.Length), WebSocketMessageType.Text, true, CancellationToken.None);
            }
        }
    }

    public static async void WebSocketHandler(HttpListenerContext ctx) {
        WebSocketContext wsc;
        WebSocket ws;

        try {
            wsc = await ctx.AcceptWebSocketAsync(null);
            ws = wsc.WebSocket;
        }
        catch (WebSocketException ex) {
            ctx.Response.Close();
            Logger.Error(ex);
            return;
        }

        try {
            byte[] buff = new byte[2048];
            WebSocketReceiveResult receiveResult = await ws.ReceiveAsync(new ArraySegment<byte>(buff), CancellationToken.None);
            string file = Encoding.Default.GetString(buff, 0, receiveResult.Count);

            if (!DatabaseInstances.devices.dictionary.TryGetValue(file, out Database.Entry entry) ||
                !entry.attributes.TryGetValue("ip", out Database.Attribute ipAttribute) ||
                !entry.attributes.TryGetValue("hostname", out Database.Attribute hostnameAttribute)) {
                await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, CancellationToken.None);
                return;
            }

            int interval = 3000;
            while (ws.State == WebSocketState.Open) {



                Thread.Sleep(interval);
            }

        }
        catch (Exception ex) {
            Logger.Error(ex);
        }
        finally {
            if (ws.State == WebSocketState.Open) {
                await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, CancellationToken.None);
            }
        }
    }

}

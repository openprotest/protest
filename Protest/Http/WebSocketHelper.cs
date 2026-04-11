using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace Protest.Http;

internal static class WebSocketHelper {
    internal static async Task WsWriteText(WebSocket ws, string data) {
        if (ws.State != WebSocketState.Open) return;
        byte[] bytes = Encoding.UTF8.GetBytes(data);
        await ws.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, CancellationToken.None);
    }

    internal static async Task WsWriteText(WebSocket ws, byte[] data) {
        if (ws.State != WebSocketState.Open) return;
        await ws.SendAsync(new ArraySegment<byte>(data), WebSocketMessageType.Text, true, CancellationToken.None);
    }

    internal static async Task<string> WsReadText(WebSocket ws, CancellationToken token, int bufferSize = 2048) {
        byte[] buffer = new byte[bufferSize];
        WebSocketReceiveResult result = await ws.ReceiveAsync(new ArraySegment<byte>(buffer), token);

        if (result.MessageType == WebSocketMessageType.Close) {
            await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, result.CloseStatusDescription, token);
            return null;
        }

        if (result.EndOfMessage) return Encoding.UTF8.GetString(buffer, 0, result.Count);

        StringBuilder builder = new StringBuilder();
        builder.Append(Encoding.UTF8.GetString(buffer, 0, result.Count));

        while (true) {
            result = await ws.ReceiveAsync(new ArraySegment<byte>(buffer), token);

            if (result.MessageType == WebSocketMessageType.Close) {
                await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, result.CloseStatusDescription, token);
                return null;
            }

            builder.Append(Encoding.UTF8.GetString(buffer, 0, result.Count));

            if (result.EndOfMessage) return builder.ToString();
        }
    }
}
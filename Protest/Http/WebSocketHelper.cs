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
}
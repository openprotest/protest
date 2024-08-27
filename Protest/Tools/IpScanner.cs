using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Net;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Protest.Http;

namespace Protest.Tools;

internal static class IpScanner {
    private struct Entry {
        public IPAddress ip;
        public string mac;
        public string manufacturer;
        public string[] protocols;
        public long timestamp;

        public Entry() {
            timestamp = DateTime.UtcNow.Ticks;
        }
    }

    private static async Task WsWriteText(WebSocket ws, string data) {
        if (ws.State == WebSocketState.Open) {
            await ws.SendAsync(new ArraySegment<byte>(Encoding.ASCII.GetBytes(data), 0, data.Length), WebSocketMessageType.Text, true, CancellationToken.None);
        }
    }
    private static async Task WsWriteText(WebSocket ws, byte[] data) {
        if (ws.State == WebSocketState.Open) {
            await ws.SendAsync(new ArraySegment<byte>(data, 0, data.Length), WebSocketMessageType.Text, true, CancellationToken.None);
        }
    }

    public static async void WebSocketHandler(HttpListenerContext ctx) {
        WebSocket ws;
        try {
            WebSocketContext wsc = await ctx.AcceptWebSocketAsync(null);
            ws = wsc.WebSocket;
        }
        catch (WebSocketException ex) {
            ctx.Response.Close();
            Logger.Error(ex);
            return;
        }

        if (!Auth.IsAuthenticatedAndAuthorized(ctx, ctx.Request.Url.AbsolutePath)) {
            await ws.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, null, CancellationToken.None);
            return;
        }

        long lastTimestamp = -1;
        ConcurrentDictionary<IPAddress, Entry> hosts = new ConcurrentDictionary<IPAddress, Entry>();
        using CancellationTokenSource tokenSource = new CancellationTokenSource();

        Thread[] threads = new Thread[] {
            new Thread(()=> CheckDhcp(hosts, tokenSource.Token)),
            new Thread(()=> CheckIcmp(hosts, tokenSource.Token)),
            new Thread(()=> CheckDnsSd(hosts, tokenSource.Token)),
        };


        try {
            for (int i = 0; i < threads.Length; i++) {
                threads[i].Start();
            }

            await Task.Delay(50);

            while (ws.State == WebSocketState.Open) {
                if (!Auth.IsAuthenticatedAndAuthorized(ctx, ctx.Request.Url.AbsolutePath)) {
                    ctx.Response.Close();
                    break;
                }

                if (threads.All(o=> !o.IsAlive)) {
                    break;
                }

                IEnumerable<Entry> filtered = hosts.Where(o => o.Value.timestamp > lastTimestamp).Select(o=>o.Value);

                if (filtered.Any()) {
                    byte[] bytes = JsonSerializer.SerializeToUtf8Bytes(filtered.Select(o => new {
                        ip           = o.ip,
                        mac          = o.mac,
                        manufacturer = o.manufacturer,
                        protocols    = o.protocols,
                    }));

                    await WsWriteText(ws, bytes);

                    lastTimestamp = filtered.Max(o => o.timestamp);
                }

                await Task.Delay(750);
            }

            Console.WriteLine("over");

            if (threads.Any(o=>o.IsAlive)) {
                tokenSource.Cancel();
            }
        }
        catch { }
        finally {
            if (ws?.State == WebSocketState.Open) {
                try {
                    await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, null, CancellationToken.None);
                }
                catch { }
            }
        }
    }
    private static void CheckIcmp(ConcurrentDictionary<IPAddress, Entry> hosts, CancellationToken token) {

        hosts.AddOrUpdate(
            IPAddress.None,

            new Entry {
                ip           = IPAddress.None,
                mac          = String.Empty,
                manufacturer = String.Empty,
                protocols    = Array.Empty<string>(),
                timestamp    = DateTime.UtcNow.Ticks
            },

            (IPAddress ip, Entry e) => {
                //TODO:
                e.timestamp = DateTime.UtcNow.Ticks;
                return e;
            }
        );

    }

    private static void CheckDhcp(ConcurrentDictionary<IPAddress, Entry> hosts, CancellationToken token) {

    }

    private static void CheckDnsSd(ConcurrentDictionary<IPAddress, Entry> hosts, CancellationToken token) {

    }

}

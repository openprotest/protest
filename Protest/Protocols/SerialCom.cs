using System.IO;
using System.IO.Ports;
using System.Net;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Protest.Http;

namespace Protest.Protocols;

internal static class SerialCom {

    public static byte[] ListPorts() {
        string[] ports;
        try {
            ports = SerialPort.GetPortNames();
        }
        catch (Exception ex) {
            Logger.Debug(ex);
            ports = Array.Empty<string>();
        }

        Array.Sort(ports, StringComparer.OrdinalIgnoreCase);
        return JsonSerializer.SerializeToUtf8Bytes(ports);
    }

    public static async Task WebSocketHandler(HttpListenerContext ctx) {
        if (!Auth.IsAuthenticatedAndAuthorized(ctx, ctx.Request.Url.AbsolutePath)) {
            ctx.Response.Close();
            return;
        }

        WebSocket ws;
        try {
            HttpListenerWebSocketContext wsc = await ctx.AcceptWebSocketAsync(null);
            ws = wsc.WebSocket;
        }
        catch (Exception ex) {
            ctx.Response.Close();
            Logger.Error(ex);
            return;
        }

        if (ws is null) return;

        string sessionId = ctx.Request.Cookies["sessionid"]?.Value;
        string origin = IPAddress.IsLoopback(ctx.Request.RemoteEndPoint.Address) ? "loopback" : Auth.GetUsername(sessionId);

        string portName = String.Empty;
        int baudRate = 9600;
        SerialPort port = null;

        try {
            byte[] handshakeBuf = new byte[512];
            WebSocketReceiveResult handshake = await ws.ReceiveAsync(handshakeBuf, CancellationToken.None);

            if (handshake.MessageType == WebSocketMessageType.Close) {
                await Tools.Terminal.CloseWebSocket(ws);
                return;
            }

            string json = Encoding.UTF8.GetString(handshakeBuf, 0, handshake.Count);
            using JsonDocument document = JsonDocument.Parse(json);
            JsonElement root = document.RootElement;

            portName = root.TryGetProperty("port", out JsonElement portEl) ? portEl.GetString() : null;
            baudRate = root.TryGetProperty("baudRate", out JsonElement baudEl) ? baudEl.GetInt32() : 9600;
            int dataBits = root.TryGetProperty("dataBits", out JsonElement dataBitsEl) ? dataBitsEl.GetInt32() : 8;

            Parity parity = Parity.None;
            if (root.TryGetProperty("parity", out JsonElement parityEl)) {
                parity = parityEl.GetString()?.ToLowerInvariant() switch {
                    "odd"   => Parity.Odd,
                    "even"  => Parity.Even,
                    "mark"  => Parity.Mark,
                    "space" => Parity.Space,
                    _       => Parity.None
                };
            }

            StopBits stopBits = StopBits.One;
            if (root.TryGetProperty("stopBits", out JsonElement stopBitsEl) && stopBitsEl.ValueKind == JsonValueKind.Number && stopBitsEl.GetInt32() == 2) {
                stopBits = StopBits.Two;
            }

            Handshake flowControl = Handshake.None;
            if (root.TryGetProperty("flowControl", out JsonElement flowEl) && flowEl.GetString() == "hardware") {
                flowControl = Handshake.RequestToSend;
            }

            if (String.IsNullOrWhiteSpace(portName)) {
                await WebSocketHelper.WsWriteText(ws, "{\"error\":\"No serial port specified\"}"u8.ToArray());
                await Tools.Terminal.CloseWebSocket(ws);
                return;
            }

            port = new SerialPort(portName, baudRate, parity, dataBits, stopBits) {
                Handshake = flowControl,
                WriteTimeout = 5000
            };

            port.Open();

            Logger.Action(origin, "Remote-access", $"Open serial port {portName} ({baudRate},{dataBits}{parity.ToString()[0]}{(stopBits == StopBits.Two ? 2 : 1)})");
            await WebSocketHelper.WsWriteText(ws, "{\"connected\":true}"u8.ToArray());

            using CancellationTokenSource cts = new();

            Task readTask = Tools.Terminal.PumpStreamToWebSocket(ctx, ws, port.BaseStream, cts.Token);
            Task writeTask = PumpWebSocketToSerial(ctx, ws, port, cts.Token);

            await Task.WhenAny(readTask, writeTask);
            cts.Cancel();

            try {
                if (port.IsOpen) port.Close();
            }
            catch (Exception ex) {
                Logger.Debug(ex);
            }

            try {
                await Task.WhenAll(readTask, writeTask);
            }
            catch (OperationCanceledException) { }
            catch (WebSocketException) { }
            catch (ObjectDisposedException) { }
            catch (IOException) { }
            catch (UnauthorizedAccessException) { }
        }
        catch (UnauthorizedAccessException ex) { //port already open elsewhere, or access denied
            await WebSocketHelper.WsWriteText(ws, $"{{\"error\":\"{Protest.Data.EscapeJsonText(ex.Message)}\"}}");
        }
        catch (IOException ex) { //port does not exist / device removed
            await WebSocketHelper.WsWriteText(ws, $"{{\"error\":\"{Protest.Data.EscapeJsonText(ex.Message)}\"}}");
        }
        catch (ArgumentException ex) { //invalid port name or settings
            await WebSocketHelper.WsWriteText(ws, $"{{\"error\":\"{Protest.Data.EscapeJsonText(ex.Message)}\"}}");
        }
        catch (Exception ex) {
            Logger.Error(ex);
        }
        finally {
            Logger.Action(origin, "Remote-access", $"Close serial port {portName}");

            if (port is not null) {
                try {
                    if (port.IsOpen) port.Close();
                }
                catch (Exception ex) {
                    Logger.Debug(ex);
                }
                port.Dispose();
            }

            await Tools.Terminal.CloseWebSocket(ws);
        }
    }

    private static async Task PumpWebSocketToSerial(HttpListenerContext ctx, WebSocket ws, SerialPort port, CancellationToken token) {
        byte[] buffer = new byte[4096];

        while (!token.IsCancellationRequested && ws.State == WebSocketState.Open) {
            WebSocketReceiveResult result = await ws.ReceiveAsync(buffer, token);

            if (result.MessageType == WebSocketMessageType.Close) break;
            if (!Auth.IsAuthenticatedAndAuthorized(ctx, "/ws/serial")) break;

            await port.BaseStream.WriteAsync(buffer.AsMemory(0, result.Count), token);
            await port.BaseStream.FlushAsync(token);
        }
    }
}

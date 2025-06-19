using System.Collections.Generic;
using System.Net;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Protest.Protocols.Snmp;
using Lextm.SharpSnmpLib;
using Protest.Http;

namespace Protest.Tools;

internal static class Topology {

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

    internal static async void WebSocketHandler(HttpListenerContext ctx) {
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

        string sessionId = ctx.Request.Cookies["sessionid"]?.Value ?? null;
        string origin = IPAddress.IsLoopback(ctx.Request.RemoteEndPoint.Address) ? "loopback" : Auth.GetUsername(sessionId);

        byte[] buffer = new byte[1024];
        WebSocketReceiveResult targetResult = await ws.ReceiveAsync(new ArraySegment<byte>(buffer), CancellationToken.None);
        string[] options = Encoding.Default.GetString(buffer, 0, targetResult.Count).ToLower().Split(';');

        List<Database.Entry> candidates = new List<Database.Entry>();

        foreach (KeyValuePair<string, Database.Entry> pair in DatabaseInstances.devices.dictionary) {
            Database.Entry device = pair.Value;

            if (!device.attributes.TryGetValue("type", out Database.Attribute typeAttr)) continue;
            string type = typeAttr.value.ToLower();
            if (!options.Contains(type)) continue;

            if (!device.attributes.TryGetValue("ip", out Database.Attribute ipAttr)) continue;
            if (!device.attributes.TryGetValue("snmp profile", out Database.Attribute profileAttr)) continue;
            if (!SnmpProfiles.FromGuid(profileAttr.value, out SnmpProfiles.Profile snmpProfile) || snmpProfile is null) continue;

            string ipString = ipAttr.value.Split(";")[0].Trim();
            if (!IPAddress.TryParse(ipString, out IPAddress ipAddress)) continue;

            candidates.Add(device);
        }

        try {
            byte[] message = JsonSerializer.SerializeToUtf8Bytes(new {
                initial = candidates.Select(device => new {
                    file     = device.filename,
                    type     = device.attributes.TryGetValue("type", out Database.Attribute typeAttr) ? typeAttr.value : "N/A",
                    ip       = device.attributes.TryGetValue("ip", out Database.Attribute ipAttr) ? ipAttr.value : "N/A",
                    hostname = device.attributes.TryGetValue("hostname", out Database.Attribute hostnameAttr) ? hostnameAttr.value : "N/A",
                    //location = device.attributes.TryGetValue("location", out Database.Attribute locationAttr) ? locationAttr.value : "N/A",
                })
            });

            await WsWriteText(ws, message);

            for (int i = 0; i < candidates.Count; i++) {
                if (!candidates[i].attributes.TryGetValue("ip", out Database.Attribute ipAttr)) continue;
                if (!candidates[i].attributes.TryGetValue("snmp profile", out Database.Attribute profileAttr)) continue;
                if (!SnmpProfiles.FromGuid(profileAttr.value, out SnmpProfiles.Profile snmpProfile) || snmpProfile is null) continue;

                string ipString = ipAttr.value.Split(";")[0].Trim();
                if (IPAddress.TryParse(ipString, out IPAddress ipAddress)) {
                    await WsWriteText(ws, System.Text.Encoding.UTF8.GetBytes($"{{\"retrieve\":\"{candidates[i].filename}\"}}"));

                    Dictionary<string, string> local = Polling.ParseResponse(
                        Polling.SnmpQuery(ipAddress, snmpProfile, [Oid.LLDP_LOCAL_SYS_DATA], Polling.SnmpOperation.Walk)
                    );

                    Dictionary<string, string> remote = Polling.ParseResponse(
                        Polling.SnmpQuery(ipAddress, snmpProfile, [Oid.LLDP_REMOTE_SYS_DATA], Polling.SnmpOperation.Walk)
                    );

                    if (local is null || local.Count == 0 || remote is null || remote.Count == 0) {
                        await WsWriteText(ws, System.Text.Encoding.UTF8.GetBytes($"{{\"nosnmp\":\"{candidates[i].filename}\"}}"));
                    }
                    else {
                        byte[] response = ComputeSnmpResponse(candidates[i].filename, local, remote);
                        await WsWriteText(ws, response);
                    }
                }
            }

            await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, CancellationToken.None);
        }
        catch (WebSocketException ex) when (ex.WebSocketErrorCode == WebSocketError.ConnectionClosedPrematurely) {
            return;
        }
        catch (WebSocketException ex) when (ex.WebSocketErrorCode != WebSocketError.ConnectionClosedPrematurely) {
            //do nothing
        }
        catch (Exception ex) {
            Logger.Error(ex);
        }
    }

    private static byte[] ComputeSnmpResponse(string file, Dictionary<string, string> local, Dictionary<string, string> remote) {
        local.TryGetValue("1.0.8802.1.1.2.1.3.1.0", out string idSuptype);
        local.TryGetValue("1.0.8802.1.1.2.1.3.2.0", out string id);
        local.TryGetValue("1.0.8802.1.1.2.1.3.3.0", out string hostname);
        local.TryGetValue("1.0.8802.1.1.2.1.3.4.0", out string description);

        List<(int, string)> localPortIdSuptype = new List<(int, string)>();
        List<(int, string)> localPortId        = new List<(int, string)>();

        List<(int, string)> remoteChassisIdSuptype = new List<(int, string)>();
        List<(int, string)> remoteChassisId        = new List<(int, string)>();
        List<(int, string)> remotePortIdSuptype    = new List<(int, string)>();
        List<(int, string)> remotePortId           = new List<(int, string)>();
        List<(int, string)> remoteSystemName       = new List<(int, string)>();

        foreach (KeyValuePair<string, string> pair in local) {
            if (!int.TryParse(pair.Key.Split('.')[^1], out int index)) continue;

            if (pair.Key.StartsWith("1.0.8802.1.1.2.1.3.7.1.2")) {
                localPortIdSuptype.Add((index, pair.Value));
            }
            else if (pair.Key.StartsWith("1.0.8802.1.1.2.1.3.7.1.3")) {
                localPortId.Add((index, pair.Value));
            }
        }

        foreach (KeyValuePair<string, string> pair in remote) {
            if (!int.TryParse(pair.Key.Split('.')[^2], out int index)) continue;

            if (pair.Key.StartsWith("1.0.8802.1.1.2.1.4.1.1.4")) {
                remoteChassisIdSuptype.Add((index, pair.Value));
            }
            else if (pair.Key.StartsWith("1.0.8802.1.1.2.1.4.1.1.5")) {
                remoteChassisId.Add((index, pair.Value));
            }
            if (pair.Key.StartsWith("1.0.8802.1.1.2.1.4.1.1.6")) {
                remotePortIdSuptype.Add((index, pair.Value));
            }
            else if (pair.Key.StartsWith("1.0.8802.1.1.2.1.4.1.1.7")) {
                remotePortId.Add((index, pair.Value));
            }
            else if (pair.Key.StartsWith("1.0.8802.1.1.2.1.4.1.1.9")) {
                remoteSystemName.Add((index, pair.Value));
            }
        }

        //TODO:
        return System.Text.Encoding.UTF8.GetBytes($"{{\"snmp\":\"{file}\"}}");
    }

}
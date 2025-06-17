using System.Collections.Generic;
using System.Net;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Lextm.SharpSnmpLib;
using Protest.Http;
using Protest.Protocols.Snmp;

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

        foreach (KeyValuePair<string, Database.Entry> pair in DatabaseInstances.devices.dictionary) {
            Database.Entry device = pair.Value;

            if (!device.attributes.TryGetValue("type", out Database.Attribute typeAttr)) continue;
            string type = typeAttr.value.ToLower();
            if (!options.Contains(type)) continue;

            if (!device.attributes.TryGetValue("ip", out Database.Attribute ipAttr)) continue;

            if (!device.attributes.TryGetValue("snmp profile", out Database.Attribute profileAttr)) continue;

            if (!SnmpProfiles.FromGuid(profileAttr.value, out SnmpProfiles.Profile snmpProfile)
                || snmpProfile is null) {
                continue;
            }

            string ipString = ipAttr.value.Split(";")[0].Trim();
            if (IPAddress.TryParse(ipString, out IPAddress ipAddress)) {
                SnmpRequest(ipAddress, snmpProfile);
            }
        }
    }

    private static void SnmpRequest(System.Net.IPAddress target, SnmpProfiles.Profile snmpProfile) {
        IList<Variable> list = Polling.SnmpQuery(target, snmpProfile, Oid.TOPOLOGY_SWITCH_OID, Polling.SnmpOperation.Walk);
        Dictionary<string, string> parsed = Polling.ParseResponse(list);

        if (parsed is null) return;

        //TODO:
    }

}
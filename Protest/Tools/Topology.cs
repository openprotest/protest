using System.Collections.Generic;
using System.Net;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Protest.Http;
using Protest.Protocols.Snmp;
using Lextm.SharpSnmpLib;

namespace Protest.Tools;

internal static class Topology {

    private static bool Push(this Dictionary<int, List<string>> dic, int key, string value) {
        if (dic.TryGetValue(key, out List<string> list)) {
            list.Add(value);
        }
        else {
            dic.Add(key, new List<string> { value });
        }
        return true;
    }

    private static bool Push(this Dictionary<int, List<int>> dic, int key, int value) {
        if (dic.TryGetValue(key, out List<int> list)) {
            list.Add(value);
        }
        else {
            dic.Add(key, new List<int> { value });
        }
        return true;
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

                    IList<Variable> rawLocal = Polling.SnmpQuery(ipAddress, snmpProfile, [Oid.LLDP_LOCAL_SYS_DATA], Polling.SnmpOperation.Walk);
                    //Dictionary<string, string> local = Polling.ParseResponse(rawLocal, true);

                    IList<Variable> rawRemote = Polling.SnmpQuery(ipAddress, snmpProfile, [Oid.LLDP_REMOTE_SYS_DATA], Polling.SnmpOperation.Walk);
                    //Dictionary<string, string> remote = Polling.ParseResponse(rawRemote, true);

                    if (rawLocal is null || rawLocal.Count == 0 || rawRemote is null || rawRemote.Count == 0) {
                        await WsWriteText(ws, System.Text.Encoding.UTF8.GetBytes($"{{\"nolldp\":\"{candidates[i].filename}\"}}"));
                    }
                    else {
                        byte[] response = ComputeSnmpResponse(candidates[i].filename, rawLocal, rawRemote);
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

    private static byte[] ComputeSnmpResponse(string file, IList<Variable> rawLocal, IList<Variable> rawRemote) {

        Dictionary<string, Variable> local = new Dictionary<string, Variable>();
        for (int i = 0; i < rawLocal.Count; i++) {
            local.Add(rawLocal[i].Id.ToString(), rawLocal[i]);
        }

        Dictionary<string, Variable> remote = new Dictionary<string, Variable>();
        for (int i = 0; i < rawRemote.Count; i++) {
            remote.Add(rawRemote[i].Id.ToString(), rawRemote[i]);
        }

        local.TryGetValue("1.0.8802.1.1.2.1.3.1.0", out Variable localChassisIdSubtype);
        local.TryGetValue("1.0.8802.1.1.2.1.3.2.0", out Variable localChassisId);
        local.TryGetValue("1.0.8802.1.1.2.1.3.3.0", out Variable localHostname);
        //local.TryGetValue("1.0.8802.1.1.2.1.3.4.0", out Variable localDescription);

        List<(int, string)> localPortIdSubtype = new List<(int, string)>();
        List<(int, string)> localPortId        = new List<(int, string)>();
        List<(int, string)> localPortName      = new List<(int, string)>();

        Dictionary<int, List<int>> remoteChassisIdSubtype = new Dictionary<int, List<int>>();
        Dictionary<int, List<string>> remoteChassisId     = new Dictionary<int, List<string>>();
        Dictionary<int, List<int>> remotePortIdSubtype    = new Dictionary<int, List<int>>();
        Dictionary<int, List<string>> remotePortId        = new Dictionary<int, List<string>>();
        Dictionary<int, List<string>> remoteSystemName    = new Dictionary<int, List<string>>();

        foreach (KeyValuePair<string, Variable> pair in local) {
            if (!int.TryParse(pair.Key.Split('.')[^1], out int index)) continue;

            if (pair.Key.StartsWith("1.0.8802.1.1.2.1.3.7.1.2")) {
                localPortIdSubtype.Add((index, pair.Value.Data.ToString()));
            }
            else if (pair.Key.StartsWith("1.0.8802.1.1.2.1.3.7.1.3")) {
                string typeString = pair.Key.Replace("1.0.8802.1.1.2.1.3.7.1.3", "1.0.8802.1.1.2.1.3.7.1.2");
                if (local.TryGetValue(typeString, out Variable typeValue)) {
                    localPortId.Add((index, GetPortId(typeValue.Data.ToString(), pair.Value.Data)));
                }
                else {
                    localPortId.Add((index, pair.Value.Data.ToString()));
                }
            }
            else if (pair.Key.StartsWith("1.0.8802.1.1.2.1.3.7.1.4")) {
                localPortName.Add((index, pair.Value.Data.ToString()));
            }
        }

        foreach (KeyValuePair<string, Variable> pair in remote) {
            if (!int.TryParse(pair.Key.Split('.')[^2], out int index)) continue;

            if (pair.Key.StartsWith("1.0.8802.1.1.2.1.4.1.1.4")) {
                remoteChassisIdSubtype.Push(index - 1, int.TryParse(pair.Value.Data.ToString(), out int subtype) ? subtype : -1);
            }
            else if (pair.Key.StartsWith("1.0.8802.1.1.2.1.4.1.1.5")) {
                string typeString = pair.Key.Replace("1.0.8802.1.1.2.1.4.1.1.5", "1.0.8802.1.1.2.1.4.1.1.4");
                if (remote.TryGetValue(typeString, out Variable typeValue)) {
                    remoteChassisId.Push(index - 1, GetChassisId(typeValue.Data.ToString(), pair.Value.Data));
                }
                else {
                    remoteChassisId.Push(index - 1, pair.Value.Data.ToString());
                }
            }
            if (pair.Key.StartsWith("1.0.8802.1.1.2.1.4.1.1.6")) {
                remotePortIdSubtype.Push(index - 1, int.TryParse(pair.Value.Data.ToString(), out int subtype) ? subtype : -1);
            }
            else if (pair.Key.StartsWith("1.0.8802.1.1.2.1.4.1.1.7")) {
                string typeString = pair.Key.Replace("1.0.8802.1.1.2.1.4.1.1.7", "1.0.8802.1.1.2.1.4.1.1.6");
                if (remote.TryGetValue(typeString, out Variable typeValue)) {
                    remotePortId.Push(index - 1, GetPortId(typeValue.Data.ToString(), pair.Value.Data));
                }
                else {
                    remotePortId.Push(index - 1, pair.Value.Data.ToString());
                }
            }
            else if (pair.Key.StartsWith("1.0.8802.1.1.2.1.4.1.1.9")) {
                remoteSystemName.Push(index - 1, pair.Value.Data.ToString());
            }
        }

        byte[] payload = JsonSerializer.SerializeToUtf8Bytes(new {
            lldp = new {
                file = file,

                localChassisIdSubtype = int.TryParse(localChassisIdSubtype.Data.ToString(), out int localChassisIdSubtypeInt) ? localChassisIdSubtypeInt : -1,
                localChassisId        = GetChassisId(localChassisIdSubtype.Data.ToString(), localChassisId.Data),
                localHostname         = localHostname.Data.ToString(),
                //localDescription      = localDescription.Data.ToString(),

                localPortIdSubtype = localPortIdSubtype.Select(o=>int.TryParse(o.Item2, out int localPortIdSubtypeInt) ? localPortIdSubtypeInt : -1),
                localPortId        = localPortId.Select(o=>o.Item2),
                localPortName      = localPortName.Select(o=>o.Item2),

                remoteChassisIdSubtype = remoteChassisIdSubtype,
                remoteChassisId        = remoteChassisId,
                remotePortIdSubtype    = remotePortIdSubtype,
                remotePortId           = remotePortId,
                remoteSystemName       = remoteSystemName,
            }
        });

        return payload;
    }

    private static string GetChassisId(string subtype, ISnmpData value) {
        byte[] bytes = value.ToBytes();

        switch (subtype) {
        case "4": //mac address
            if (bytes.Length - 2 == 6) {
                return $"{(bytes[2]).ToString("x2")}{(bytes[3]).ToString("x2")}{(bytes[4]).ToString("x2")}{(bytes[5]).ToString("x2")}{(bytes[6]).ToString("x2")}{(bytes[7]).ToString("x2")}";
            }
            return value.ToString();

        case "5": //network address
            if (bytes.Length - 3 == 4) {
                return $"{bytes[3]}.{bytes[4]}.{bytes[5]}.{bytes[6]}";
            }
            else if (bytes.Length - 3 == 16) {
                return $"""
                {bytes[3].ToString("x2")}){bytes[4].ToString("x2")}:
                {bytes[5].ToString("x2")}){bytes[6].ToString("x2")}:
                {bytes[7].ToString("x2")}){bytes[8].ToString("x2")}:
                {bytes[9].ToString("x2")}){bytes[10].ToString("x2")}:
                {bytes[11].ToString("x2")}){bytes[12].ToString("x2")}:
                {bytes[13].ToString("x2")}){bytes[14].ToString("x2")}:
                {bytes[15].ToString("x2")}){bytes[16].ToString("x2")}:
                {bytes[17].ToString("x2")}){bytes[18].ToString("x2")}
                """;
            }
            return value.ToString();

        default: return value.ToString();
        }
    }

    private static string GetPortId(string subtype, ISnmpData value) {
        byte[] bytes = value.ToBytes();

        switch (subtype) {
        case "3": // mac address
            if (bytes.Length - 2 == 6) {
                return $"{(bytes[2]).ToString("x2")}{(bytes[3]).ToString("x2")}{(bytes[4]).ToString("x2")}{(bytes[5]).ToString("x2")}{(bytes[6]).ToString("x2")}{(bytes[7]).ToString("x2")}";
            }
            return value.ToString();

        case "4": //network address
            if (bytes.Length - 3 == 4) {
                return $"{bytes[3]}.{bytes[4]}.{bytes[5]}.{bytes[6]}";
            }
            else if (bytes.Length - 3 == 16) {
                return $"""
                {bytes[3].ToString("x2")}){bytes[4].ToString("x2")}:
                {bytes[5].ToString("x2")}){bytes[6].ToString("x2")}:
                {bytes[7].ToString("x2")}){bytes[8].ToString("x2")}:
                {bytes[9].ToString("x2")}){bytes[10].ToString("x2")}:
                {bytes[11].ToString("x2")}){bytes[12].ToString("x2")}:
                {bytes[13].ToString("x2")}){bytes[14].ToString("x2")}:
                {bytes[15].ToString("x2")}){bytes[16].ToString("x2")}:
                {bytes[17].ToString("x2")}){bytes[18].ToString("x2")}
                """;
            }
            return value.ToString();

        default:
            return value.ToString();
        }
    }

}
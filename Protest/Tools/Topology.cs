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

    private static void WsWriteText(WebSocket ws, string text, Lock mutex) {
        lock (mutex) {
            WsWriteText(ws, Encoding.UTF8.GetBytes(text), mutex);
        }
    }
    private static void WsWriteText(WebSocket ws, byte[] bytes, Lock mutex) {
        lock (mutex) {
            ws.SendAsync(new ArraySegment<byte>(bytes, 0, bytes.Length), WebSocketMessageType.Text, true, CancellationToken.None);
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

        string[] types = ["firewall", "router", "switch"]; //"access point"

        foreach (KeyValuePair<string, Database.Entry> pair in DatabaseInstances.devices.dictionary) {
            Database.Entry device = pair.Value;

            if (!device.attributes.TryGetValue("type", out Database.Attribute typeAttr)) continue;
            string type = typeAttr.value.ToLower();
            if (!types.Contains(type)) continue;

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
                    location = device.attributes.TryGetValue("location", out Database.Attribute locationAttr) ? locationAttr.value : "N/A",
                })
            });

            await WsWriteText(ws, message);

            Lock mutex = new Lock();

            IEnumerable<Task> tasks = candidates.Select(async candidate => {
                if (!candidate.attributes.TryGetValue("ip", out Database.Attribute ipAttr)) return;
                if (!candidate.attributes.TryGetValue("snmp profile", out Database.Attribute profileAttr)) return;
                if (!SnmpProfiles.FromGuid(profileAttr.value, out SnmpProfiles.Profile snmpProfile) || snmpProfile is null) return;

                string ipString = ipAttr.value.Split(";")[0].Trim();
                if (!IPAddress.TryParse(ipString, out IPAddress ipAddress)) return;

                await Task.Delay(1);

                try {
                    WsWriteText(ws, Encoding.UTF8.GetBytes($"{{\"retrieve\":\"{candidate.filename}\"}}"), mutex);

                    IList<Variable> lldpLocal = Polling.SnmpQuery(ipAddress, snmpProfile, [Oid.LLDP_LOCAL_SYS_DATA], Polling.SnmpOperation.Walk);
                    IList<Variable> lldpRemote = Polling.SnmpQuery(ipAddress, snmpProfile, [Oid.LLDP_REMOTE_SYS_DATA], Polling.SnmpOperation.Walk);

                    if (lldpLocal is null || lldpRemote is null) {
                        WsWriteText(ws, Encoding.UTF8.GetBytes($"{{\"nosnmp\":\"{candidate.filename}\"}}"), mutex);
                        return;
                    }
                    else {
                        byte[] response = ComputeLldpResponse(candidate.filename, lldpLocal, lldpRemote);
                        WsWriteText(ws, response, mutex);
                    }

                    if (options.Contains("mac")) {
                        IList<Variable> dot1TpFdb = Polling.SnmpQuery(ipAddress, snmpProfile, [Oid.INT_1D_TP_FDB], Polling.SnmpOperation.Walk);
                        if (dot1TpFdb is not null && dot1TpFdb.Count > 0) {
                            byte[] response = ComputeDot1TpFdpResponse(candidate.filename, dot1TpFdb);
                            WsWriteText(ws, response, mutex);
                        }
                    }

                    if (options.Contains("vlan")) {
                        IList<Variable> dot1q = Polling.SnmpQuery(ipAddress, snmpProfile, Oid.TOPOLOGY_DOT1Q, Polling.SnmpOperation.Walk);
                        if (dot1q is not null && dot1q.Count > 0) {
                            byte[] response = ComputeDotQ1Response(candidate.filename, dot1q);
                            WsWriteText(ws, response, mutex);
                        }
                    }

                    if (options.Contains("traffic")) {
                        IList<Variable> traffic = Polling.SnmpQuery(ipAddress, snmpProfile, Oid.TOPOLOGY_TRAFFIC, Polling.SnmpOperation.Walk);
                        if (traffic is not null && traffic.Count > 0) {
                            byte[] response = ComputeTrafficResponse(candidate.filename, traffic);
                            WsWriteText(ws, response, mutex);
                        }
                    }

                    if (options.Contains("error")) {
                        IList<Variable> error = Polling.SnmpQuery(ipAddress, snmpProfile, Oid.TOPOLOGY_ERROR, Polling.SnmpOperation.Walk);
                        if (error is not null && error.Count > 0) {
                            byte[] response = ComputeErrorResponse(candidate.filename, error);
                            WsWriteText(ws, response, mutex);
                        }
                    }

                }
                catch (Exception ex) {
                    Logger.Error(ex);
                }
            });

            await Task.WhenAll(tasks);

            await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, CancellationToken.None);
        }
        catch (WebSocketException) {
            return;
        }
        catch (Exception ex) {
            Logger.Error(ex);
        }
    }

    private static byte[] ComputeLldpResponse(string file, IList<Variable> rawLocal, IList<Variable> rawRemote) {
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

        Dictionary<int, int>          localPortIdSubtype     = new Dictionary<int, int>();
        Dictionary<int, string>       localPortId            = new Dictionary<int, string>();
        Dictionary<int, string>       localPortName          = new Dictionary<int, string>();

        Dictionary<int, List<int>>    remoteChassisIdSubtype = new Dictionary<int, List<int>>();
        Dictionary<int, List<string>> remoteChassisId        = new Dictionary<int, List<string>>();
        Dictionary<int, List<int>>    remotePortIdSubtype    = new Dictionary<int, List<int>>();
        Dictionary<int, List<string>> remotePortId           = new Dictionary<int, List<string>>();
        Dictionary<int, List<string>> remoteSystemName       = new Dictionary<int, List<string>>();

        Dictionary<int, List<string>> databaseEntry          = new Dictionary<int, List<string>>();

        foreach (KeyValuePair<string, Variable> pair in local) {
            if (!int.TryParse(pair.Key.Split('.')[^1], out int index)) continue;

            if (pair.Key.StartsWith("1.0.8802.1.1.2.1.3.7.1.2")) {
                localPortIdSubtype.Add(index, int.TryParse(pair.Value.Data.ToString(), out int portIdSubtype) ? portIdSubtype : -1);
            }
            else if (pair.Key.StartsWith("1.0.8802.1.1.2.1.3.7.1.3")) {
                string typeString = pair.Key.Replace("1.0.8802.1.1.2.1.3.7.1.3", "1.0.8802.1.1.2.1.3.7.1.2");
                if (local.TryGetValue(typeString, out Variable typeValue)) {
                    localPortId.Add(index, GetPortId(typeValue.Data.ToString(), pair.Value.Data));
                }
                else {
                    localPortId.Add(index, pair.Value.Data.ToString());
                }
            }
            else if (pair.Key.StartsWith("1.0.8802.1.1.2.1.3.7.1.4")) {
                localPortName.Add(index, pair.Value.Data.ToString());
            }
        }

        foreach (KeyValuePair<string, Variable> pair in remote) {
            if (!int.TryParse(pair.Key.Split('.')[^2], out int index)) continue;

            if (pair.Key.StartsWith("1.0.8802.1.1.2.1.4.1.1.4")) {
                remoteChassisIdSubtype.Push(index, int.TryParse(pair.Value.Data.ToString(), out int subtype) ? subtype : -1);
            }
            else if (pair.Key.StartsWith("1.0.8802.1.1.2.1.4.1.1.5")) {
                string typeString = pair.Key.Replace("1.0.8802.1.1.2.1.4.1.1.5", "1.0.8802.1.1.2.1.4.1.1.4");
                if (remote.TryGetValue(typeString, out Variable typeValue)) {
                    remoteChassisId.Push(index, GetChassisId(typeValue.Data.ToString(), pair.Value.Data));
                }
                else {
                    remoteChassisId.Push(index, pair.Value.Data.ToString());
                }
            }
            else if (pair.Key.StartsWith("1.0.8802.1.1.2.1.4.1.1.6")) {
                remotePortIdSubtype.Push(index, int.TryParse(pair.Value.Data.ToString(), out int subtype) ? subtype : -1);
            }
            else if (pair.Key.StartsWith("1.0.8802.1.1.2.1.4.1.1.7")) {
                string typeString = pair.Key.Replace("1.0.8802.1.1.2.1.4.1.1.7", "1.0.8802.1.1.2.1.4.1.1.6");
                if (remote.TryGetValue(typeString, out Variable typeValue)) {
                    remotePortId.Push(index, GetPortId(typeValue.Data.ToString(), pair.Value.Data));
                }
                else {
                    remotePortId.Push(index, pair.Value.Data.ToString());
                }
            }
            else if (pair.Key.StartsWith("1.0.8802.1.1.2.1.4.1.1.9")) {
                remoteSystemName.Push(index, pair.Value.Data.ToString());
            }
        }

        foreach (KeyValuePair<int, List<int>> pair in remoteChassisIdSubtype) {
            int index = pair.Key;
            if (!remoteChassisIdSubtype.TryGetValue(index, out List<int> chassisIdSubtype)) continue;
            if (!remoteChassisId.TryGetValue(index, out List<string> chassisId)) continue;
            if (!remotePortIdSubtype.TryGetValue(index, out List<int> portIdSubtype)) continue;
            if (!remotePortId.TryGetValue(index, out List<string> portId)) continue;
            if (!remoteSystemName.TryGetValue(index, out List<string> systemName)) continue;

            for (int i = 0; i < chassisIdSubtype.Count; i++) {
                if (chassisId.Count != chassisIdSubtype.Count) continue;
                if (portIdSubtype.Count != chassisIdSubtype.Count) continue;
                if (portId.Count != chassisIdSubtype.Count) continue;
                if (systemName.Count != chassisIdSubtype.Count) continue;

                string match = GetDatabaseEntry(
                    chassisIdSubtype[i],
                    chassisId[i].ToLower(),
                    portIdSubtype[i],
                    portId[i].ToLower(),
                    systemName[i].ToLower()
                );

                databaseEntry.Push(index, match);
            }
        }

        byte[] payload = JsonSerializer.SerializeToUtf8Bytes(new {
            lldp = new {
                file = file,

                localChassisIdSubtype   = int.TryParse(localChassisIdSubtype.Data?.ToString(), out int localChassisIdSubtypeInt) ? localChassisIdSubtypeInt : -1,
                localChassisId          = GetChassisId(localChassisIdSubtype.Data?.ToString(), localChassisId.Data),
                localHostname           = localHostname?.Data.ToString(),
                //localDescription        = localDescription.Data.ToString(),

                localPortCount         = localPortIdSubtype.Count,
                localPortIdSubtype     = localPortIdSubtype,
                localPortId            = localPortId,
                localPortName          = localPortName,

                remoteChassisIdSubtype = remoteChassisIdSubtype,
                remoteChassisId        = remoteChassisId,
                remotePortIdSubtype    = remotePortIdSubtype,
                remotePortId           = remotePortId,
                remoteSystemName       = remoteSystemName,

                entry                  = databaseEntry,
            }
        });

        return payload;
    }

    private static byte[] ComputeDot1TpFdpResponse(string file, IList<Variable> dot1TpFdb) {
        Dictionary<string, string> parsedResult = Protocols.Snmp.Polling.ParseResponse(dot1TpFdb);

        Dictionary<int, List<string>> macTable = new Dictionary<int, List<string>>();
        foreach (KeyValuePair<string, string> pair in parsedResult) {
            if (!pair.Key.StartsWith(Oid.INT_1D_TP_FDB)) continue;
            if (!int.TryParse(pair.Value, out int port)) continue;

            string mac = String.Join(String.Empty, pair.Key.Split('.').TakeLast(6).Select(o=>int.Parse(o).ToString("x2")));

            if (macTable.ContainsKey(port)) {
                macTable[port].Add(mac);
            }
            else {
                macTable[port] = new List<string>() { mac };
            }
        }

        byte[] payload = JsonSerializer.SerializeToUtf8Bytes(new {
            dot1TpFdb = new {
                file = file,
                table = macTable
            }
        });

        return payload;
    }

    private static byte[] ComputeDotQ1Response(string file, IList<Variable> dot1q) {
        Dictionary<int, string> names = new Dictionary<int, string>();
        Dictionary<int, string> egress = new Dictionary<int, string>();
        Dictionary<int, string> untagged = new Dictionary<int, string>();

        Dictionary<string, Variable> vlans = new Dictionary<string, Variable>();
        for (int i = 0; i < dot1q.Count; i++) {
            string oid = dot1q[i].Id.ToString();
            if (!int.TryParse(oid.Split('.')[^1], out int vlan)) continue;

            if (oid.StartsWith(Protocols.Snmp.Oid.INT_1Q_STATIC_NAME)) {
                names.Add(vlan, dot1q[i].Data.ToString());
            }
            else if (oid.StartsWith(Protocols.Snmp.Oid.INT_1Q_VLAN_ENGRESS) || oid.StartsWith(Protocols.Snmp.Oid.INT_1Q_VLAN_UNTAGGED)) {
                byte[] raw = dot1q[i].Data.ToBytes();

                int startIndex = GetPortBitmapStart(raw);
                if (startIndex == -1) continue;
                
                int maxIndex = Math.Min(raw.Length, startIndex + Topology.GetPortBitmapLength(raw, startIndex));
                
                for (int j = maxIndex - 1; j >= 1; j--) {
                    if (raw[j] != 0) break;
                    maxIndex = j;
                }

                string hex = PortsToHex(raw, startIndex, maxIndex);

                if (oid.StartsWith(Protocols.Snmp.Oid.INT_1Q_VLAN_ENGRESS)) {
                    egress.Add(vlan, hex);
                }
                else if (oid.StartsWith(Protocols.Snmp.Oid.INT_1Q_VLAN_UNTAGGED)) {
                    untagged.Add(vlan, hex);
                }
            }
        }

        byte[] payload = JsonSerializer.SerializeToUtf8Bytes(new {
            dot1q = new {
                file     = file,
                names    = names,
                egress   = egress,
                untagged = untagged,
            }
        });

        return payload;
    }

    private static byte[] ComputeTrafficResponse(string file, IList<Variable> traffic) {
        Dictionary<string, long> parsedResult = Protocols.Snmp.Polling.ParseLongResponse(traffic);

        Dictionary<int, long> bytesIn             = new Dictionary<int, long>();
        Dictionary<int, long> packetsInUnicast    = new Dictionary<int, long>();
        Dictionary<int, long> packetsInMulticast  = new Dictionary<int, long>();
        Dictionary<int, long> packetsInBroadcast  = new Dictionary<int, long>();
        Dictionary<int, long> bytesOut            = new Dictionary<int, long>();
        Dictionary<int, long> packetsOutUnicast   = new Dictionary<int, long>();
        Dictionary<int, long> packetsOutMulticast = new Dictionary<int, long>();
        Dictionary<int, long> packetsOutBroadcast = new Dictionary<int, long>();

        foreach (KeyValuePair<string, long> pair in parsedResult) {
            if (!int.TryParse(pair.Key.Split('.')[^1], out int index)) continue;

            if (pair.Key.StartsWith(Protocols.Snmp.Oid.INT_TRAFFIC_BYTES_IN)) {
                bytesIn.Add(index, pair.Value);
            }
            else if (pair.Key.StartsWith(Protocols.Snmp.Oid.INT_TRAFFIC_PKTS_IN_UCAST)) {
                packetsInUnicast.Add(index, pair.Value);
            }
            else if (pair.Key.StartsWith(Protocols.Snmp.Oid.INT_TRAFFIC_PKTS_IN_MCAST)) {
                packetsInMulticast.Add(index, pair.Value);
            }
            else if (pair.Key.StartsWith(Protocols.Snmp.Oid.INT_TRAFFIC_PKTS_IN_BCAST)) {
                packetsInBroadcast.Add(index, pair.Value);
            }
            else if (pair.Key.StartsWith(Protocols.Snmp.Oid.INT_TRAFFIC_BYTES_OUT)) {
                bytesOut.Add(index, pair.Value);
            }
            else if (pair.Key.StartsWith(Protocols.Snmp.Oid.INT_TRAFFIC_PKTS_OUT_UCAST)) {
                packetsOutUnicast.Add(index, pair.Value);
            }
            else if (pair.Key.StartsWith(Protocols.Snmp.Oid.INT_TRAFFIC_PKTS_OUT_MCAST)) {
                packetsOutMulticast.Add(index, pair.Value);
            }
            else if (pair.Key.StartsWith(Protocols.Snmp.Oid.INT_TRAFFIC_PKTS_OUT_BCAST)) {
                packetsOutBroadcast.Add(index, pair.Value);
            }
        }

        byte[] payload = JsonSerializer.SerializeToUtf8Bytes(new {
            traffic = new {
                file     = file,
                bytesin  = bytesIn,
                pktsinu  = packetsInUnicast,
                pktsinm  = packetsInMulticast,
                pktsinb  = packetsInBroadcast,
                bytesout = bytesIn,
                pktsoutu = packetsOutUnicast,
                pktsoutm = packetsOutMulticast,
                pktsoutb = packetsOutBroadcast,
            }
        });

        return payload;
    }

    private static byte[] ComputeErrorResponse(string file, IList<Variable> error) {
        Dictionary<string, string> parsedResult = Protocols.Snmp.Polling.ParseResponse(error);

        Dictionary<int, int> errIn = new Dictionary<int, int>();
        Dictionary<int, int> errOut = new Dictionary<int, int>();

        foreach (KeyValuePair<string, string> pair in parsedResult) {
            if (!int.TryParse(pair.Key.Split('.')[^1], out int index)) continue;

            if (pair.Key.StartsWith(Protocols.Snmp.Oid.INT_ERROR_IN)) {
                errIn.Add(index, int.TryParse(pair.Value, out int bytes) ? bytes : 0);
            }
            else if (pair.Key.StartsWith(Protocols.Snmp.Oid.INT_ERROR_OUT)) {
                errOut.Add(index, int.TryParse(pair.Value, out int pkts) ? pkts : 0);
            }
        }

        byte[] payload = JsonSerializer.SerializeToUtf8Bytes(new {
            error = new {
                file = file,
                @in  = errIn,
                @out = errOut
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

    private static string GetDatabaseEntry(int chassisIdSubtype, string chassisId, int portIdSubtype, string portId, string systemName) {
        switch (chassisIdSubtype) {
        case 4: { //mac
            foreach (KeyValuePair<string, Database.Entry> device in DatabaseInstances.devices.dictionary) {
                if (MatchDatabaseAttribute(device.Value, "mac address", chassisId)) return device.Key;
            }
            break;
        }
        case 5: { //ip address
            foreach (KeyValuePair<string, Database.Entry> device in DatabaseInstances.devices.dictionary) {
                if (MatchDatabaseAttribute(device.Value, "ip", chassisId)) return device.Key;
            }
            break;
        }
        case 7: { //local
            foreach (KeyValuePair<string, Database.Entry> device in DatabaseInstances.devices.dictionary) {
                if (MatchDatabaseAttribute(device.Value, "hostname", chassisId)) return device.Key;
            }
            break;
        }
        }

        switch (portIdSubtype) {
        case 3: { //mac
            foreach (KeyValuePair<string, Database.Entry> device in DatabaseInstances.devices.dictionary) {
                if (MatchDatabaseAttribute(device.Value, "mac address", portId)) return device.Key;
            }
            break;
        }
        case 4: { //ip address
            foreach (KeyValuePair<string, Database.Entry> device in DatabaseInstances.devices.dictionary) {
                if (MatchDatabaseAttribute(device.Value, "ip", portId)) return device.Key;
            }
            break;
        }
        }

        foreach (KeyValuePair<string, Database.Entry> device in DatabaseInstances.devices.dictionary) {
            if (MatchDatabaseAttribute(device.Value, "hostname", systemName)) return device.Key;
        }

        return null;
    }

    private static bool MatchDatabaseAttribute(Database.Entry entry, string attributeName, string compare) {
        if (!entry.attributes.TryGetValue(attributeName, out Database.Attribute attribute)) return false;
        
        string value = attribute.value.ToLower();
        if (String.IsNullOrEmpty(value)) return false;

        string[] split = attributeName == "mac address"
            ? value.Split(';').Select(o => o.Trim().Replace(":", String.Empty).Replace("-", String.Empty).Replace(".", String.Empty)).ToArray()
            : value.Split(';').Select(o => o.Trim()).ToArray();

        return split.Contains(compare);
    }

    internal static int GetPortBitmapStart(byte[] raw) {
        if (raw.Length > 4
            && raw[0] == 0x04
            && raw[2] == 0x02
            && raw[3] == 0x02) {
            return 4;
        }

        return raw.Length >= 3 ? 2 : 0;
    }

    internal static int GetPortBitmapLength(byte[] raw, int startIndex) {
        if (raw.Length > 1 && raw[0] == 0x04) return raw[1];
        return raw.Length - startIndex;
    }

    internal static string PortsToHex(byte[] raw, int startIndex, int maxIndex) {
        int size = maxIndex - startIndex;
        Span<char> hex = stackalloc char[size * 2];

        for (int i = 0; i < size; i++) {
            string a = raw[startIndex + i].ToString("x2");
            hex[i * 2] = a.Length == 1 ? '0' : a[0];
            hex[i * 2 + 1] = a.Length == 1 ? a[0] : a[1];
        }

        return hex.ToString();
    }

    private static byte[] HexToBytes(string hex) {
        if (string.IsNullOrEmpty(hex)) return Array.Empty<byte>();

        int length = hex.Length / 2;
        byte[] bytes = new byte[length];
        ReadOnlySpan<char> span = hex.AsSpan();

        for (int i = 0; i < length; i++) {
            int hi = FromHexChar(span[i * 2]);
            int lo = FromHexChar(span[i * 2 + 1]);
            bytes[i] = (byte)((hi << 4) | lo);
        }

        return bytes;
    }

    private static int FromHexChar(char c) {
        if (c >= '0' && c <= '9') return c - '0';
        if (c >= 'a' && c <= 'f') return c - 'a' + 10;
        if (c >= 'A' && c <= 'F') return c - 'A' + 10;
        return '0';
    }

}
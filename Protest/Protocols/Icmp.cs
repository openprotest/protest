using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Protest.Http;

namespace Protest.Protocols;

internal static class Icmp {
    public static readonly byte[] ICMP_PAYLOAD = "----pro-test----"u8.ToArray();

    private enum Method {
        ICMP = 0,
        ARP  = 1
    }

    public static bool Ping(string host, int timeout = 1000, int retries = 1) {
        try {
            using Ping p = new Ping();
            for (int i = 0; i < retries; i++) {
                PingReply reply = p.Send(host, timeout, ICMP_PAYLOAD);
                if (reply.Status == IPStatus.Success) return true;
            }
            return false;
        }
        catch (Exception) {
            return false;
        }
    }

    public static byte[] BulkPing(HttpListenerContext ctx) {
        Dictionary<string, string> parameters = Listener.ParseQuery(ctx);

        if (parameters is null) { return null; }

        parameters.TryGetValue("query", out string query);
        if (String.IsNullOrEmpty(query)) { return null; }

        if (!parameters.TryGetValue("timeout", out string timeoutString) || !Int32.TryParse(timeoutString, out int timeout)) {
            timeout = 1000;
        }

        if (timeout < 50) { timeout = 50; }

        string[] queryArray = query.Split(';');

        List<Task<int>> tasks = new List<Task<int>>(queryArray.Length);
        foreach (string host in queryArray) {
            tasks.Add(Task.Run(async ()=> {
                using Ping p = new Ping();
                try {
                    PingReply reply = await p.SendPingAsync(host, timeout, ICMP_PAYLOAD);
                    return reply.Status == IPStatus.Success ? (int)reply.RoundtripTime : -1;
                }
                catch {
                    return -2;
                }
            }));
        }

        int[] result = Task.WhenAll(tasks).GetAwaiter().GetResult();
        byte[] json = JsonSerializer.SerializeToUtf8Bytes(result);

        return json;
    }

    public static async Task WebSocketHandler(HttpListenerContext ctx) {
        if (!Auth.IsAuthenticatedAndAuthorized(ctx, ctx.Request.Url.AbsolutePath)) {
            ctx.Response.Close();
            return;
        }

        HttpListenerWebSocketContext wsc;
        try {
            wsc = await ctx.AcceptWebSocketAsync(null);
        }
        catch (WebSocketException ex) {
            ctx.Response.Close();
            Logger.Error(ex);
            return;
        }

        using WebSocket ws = wsc.WebSocket;
        if (ws is null) return;

        Dictionary<string, string> hostsById = new Dictionary<string, string>();
        ConcurrentDictionary<string, Ping> pings = new ConcurrentDictionary<string, Ping>();

        byte[] buffer = new byte[2048];
        Task<WebSocketReceiveResult> receiveTask = null;
        Task<string> pingRound = null;
        Method method = Method.ICMP;
        int timeout = 1000;

        Task SendAsync(ArraySegment<byte> payload) =>
            ws.SendAsync(payload, WebSocketMessageType.Text, true, CancellationToken.None);

        async Task SendRoundAsync(Task<string> round) {
            string result = await round;
            if (ws.State == WebSocketState.Open) {
                await SendAsync(new ArraySegment<byte>(Encoding.ASCII.GetBytes(result)));
            }
        }

        try {
            while (ws.State == WebSocketState.Open || receiveTask is not null) {
                receiveTask ??= ws.ReceiveAsync(new ArraySegment<byte>(buffer), CancellationToken.None);

                //keep receiving commands during probes and send all replies from this loop.
                if (pingRound is not null &&
                    (pingRound.IsCompleted || await Task.WhenAny(receiveTask, pingRound) == pingRound)) {
                    await SendRoundAsync(pingRound);
                    pingRound = null;
                    if (!receiveTask.IsCompleted) continue;
                }

                WebSocketReceiveResult receiveResult = await receiveTask;
                receiveTask = null;

                if (!Auth.IsAuthenticatedAndAuthorized(ctx, ctx.Request.Url.AbsolutePath)) {
                    await ws.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, null, CancellationToken.None);
                    return;
                }

                if (receiveResult.MessageType == WebSocketMessageType.Close) {
                    await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, CancellationToken.None);
                    break;
                }

                string[] msg = Encoding.UTF8.GetString(buffer, 0, receiveResult.Count).Split('=');
                if (msg.Length < 2) continue;

                switch (msg[0]) {
                case "add": {
                    string[] entries = msg[1].Split(';');
                    if (entries.Length < 2) {
                        await SendAsync(Data.CODE_INVALID_ARGUMENT);
                        break;
                    }

                    for (int i = 0; i < entries.Length - 1; i += 2) {
                        string id = entries[i].Trim();
                        string hostname = entries[i + 1].Trim();
                        if (id.Length == 0 || hostname.Length == 0 || !hostsById.TryAdd(id, hostname)) {
                            await SendAsync(Data.CODE_INVALID_ARGUMENT);
                        }
                    }
                    await SendAsync(Data.CODE_ACK);
                    break;
                }

                case "remove": {
                    if (!hostsById.Remove(msg[1].Trim(), out string hostname)) {
                        await SendAsync(Data.CODE_INVALID_ARGUMENT);
                        break;
                    }

                    if (!hostsById.ContainsValue(hostname) && pings.TryRemove(hostname, out Ping removed)) {
                        removed.Dispose();
                    }
                    await SendAsync(Data.CODE_ACK);
                    break;
                }

                case "timeout":
                    _ = int.TryParse(msg[1], out timeout);
                    break;

                case "method":
                    method = msg[1] == "arp" ? Method.ARP : Method.ICMP;
                    break;

                case "ping":
                    //finish an overlapping request before reusing its Ping instances.
                    if (pingRound is not null) await SendRoundAsync(pingRound);
                    if (method == Method.ICMP) {
                        pingRound = PingHostsAsync(hostsById, pings, timeout);
                    }
                    else {
                        KeyValuePair<string, string>[] hosts = hostsById.ToArray();
                        pingRound = Task.Run(() => ArpPingHostsAsync(hosts));
                    }
                    break;
                }
            }
        }
        catch (WebSocketException) { }
        catch (Exception ex) {
            Logger.Error(ex);
        }
        finally {
            foreach (Ping ping in pings.Values) {
                ping.Dispose();
            }

            if (receiveTask is not null) {
                ws.Abort();
                await ((Task)receiveTask).ConfigureAwait(ConfigureAwaitOptions.SuppressThrowing);
            }
        }

        if (ws.State == WebSocketState.Open) {
            try {
                await ws.CloseOutputAsync(WebSocketCloseStatus.InternalServerError, null, CancellationToken.None);
            }
            catch (Exception ex) {
                Logger.Debug(ex);
            }
        }
    }

    private static async Task<string> PingHostsAsync(Dictionary<string, string> hostsById, ConcurrentDictionary<string, Ping> pings, int timeout) {
        IEnumerable<Task<string>> probes = hostsById.GroupBy(entry => entry.Value)
            .Select(rows => PingHostAsync(pings.GetOrAdd(rows.Key, static _ => new Ping()), rows, timeout));
        return String.Join((char)127, await Task.WhenAll(probes));
    }

    private static async Task<string> PingHostAsync(Ping ping, IGrouping<string, KeyValuePair<string, string>> rows, int timeout) {
        string status;
        try {
            PingReply reply = await ping.SendPingAsync(rows.Key, timeout, ICMP_PAYLOAD);

            status = (int)reply.Status switch {
                (int)IPStatus.DestinationUnreachable or
                (int)IPStatus.DestinationHostUnreachable or
                (int)IPStatus.DestinationNetworkUnreachable => "Unreachable",

                (int)IPStatus.Success  => reply.RoundtripTime.ToString(),
                (int)IPStatus.TimedOut => "Timed out",
                11050                  => "General failure",
                _                      => reply.Status.ToString(),
            };
        }
        catch (ArgumentException) {
            status = "Invalid address";
        }
        catch (PingException) {
            status = "Ping error";
        }
        catch (Exception) {
            status = "Unknown error";
        }

        return String.Join((char)127, rows.Select(row => row.Key + (char)127 + status));
    }

    private static async Task<string> ArpPingHostsAsync(KeyValuePair<string, string>[] hosts) {
        List<Task<string>> tasks = new List<Task<string>>(hosts.Length);
        foreach ((string id, string hostname) in hosts) {
            tasks.Add(ArpPingAsync(hostname, id));
        }
        string[] result = await Task.WhenAll(tasks);
        return String.Join((char)127, result);
    }

    private static async Task<string> ArpPingAsync(string name, string id) {
        try {
            IPAddress[] ips = await System.Net.Dns.GetHostAddressesAsync(name);
            if (ips.Length == 0) return id + (char)127 + "Unknown host";

            IPAddress ip = ips.First(o => o.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork);
            if (!ips[0].OnSameBroadcastDomain()) return id + (char)127 + "Unknown net.";

            string response = Arp.ArpRequest(ip.ToString());

            if (response is not null && response.Length > 0) {
                return id + (char)127 + "0";
            }

            return id + (char)127 + "Unreachable";
        }
        catch (Exception) {
            return id + (char)127 + "Unknown error";
        }
    }
}

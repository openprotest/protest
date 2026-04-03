using System.Collections;
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

    public static byte[] BulkPing(Dictionary<string, string> parameters) {
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
        WebSocket ws;
        try {
            HttpListenerWebSocketContext wsc = await ctx.AcceptWebSocketAsync(null);
            ws = wsc.WebSocket;
        }
        catch (WebSocketException ex) {
            ctx.Response.Close();
            Logger.Error(ex);
            return;
        }

        if (ws is null) return;

        Hashtable hostnames = new Hashtable();
        Lock mutex = new Lock();
        Method method = Method.ICMP;
        int timeout = 1000;
        //int interval = 1000;

        try {
            while (ws.State == WebSocketState.Open) {
                byte[] buff = new byte[2048];
                WebSocketReceiveResult receiveResult = await ws.ReceiveAsync(new ArraySegment<byte>(buff), CancellationToken.None);

                if (!Auth.IsAuthenticatedAndAuthorized(ctx, ctx.Request.Url.AbsolutePath)) {
                    await ws.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, null, CancellationToken.None);
                    return;
                }

                if (receiveResult.MessageType == WebSocketMessageType.Close) {
                    await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, CancellationToken.None);
                    break;
                }

                string[] msg = Encoding.Default.GetString(buff, 0, receiveResult.Count).Split('=');
                if (msg.Length < 2) continue;

                switch (msg[0]) {
                case "add":
                    string[] h = msg[1].Split(';');
                    if (h.Length > 1) {
                        for (int i = 0; i < h.Length - 1; i += 2) {
                            h[i] = h[i].Trim();
                            h[i + 1] = h[i + 1].Trim();
                            if (h[i].Length > 0 && h[i + 1].Length > 0 && !hostnames.ContainsKey(h[i]))
                                hostnames.Add(h[i], h[i + 1]);
                            else
                                await ws.SendAsync(Data.CODE_INVALID_ARGUMENT, WebSocketMessageType.Text, true, CancellationToken.None);
                        }
                        await ws.SendAsync(Data.CODE_ACK, WebSocketMessageType.Text, true, CancellationToken.None);
                    }
                    else {
                        await ws.SendAsync(Data.CODE_INVALID_ARGUMENT, WebSocketMessageType.Text, true, CancellationToken.None);
                    }
                    break;

                case "remove":
                    string value = msg[1].Trim();
                    if (hostnames.Contains(value)) {
                        hostnames.Remove(value);
                        await ws.SendAsync(Data.CODE_ACK, WebSocketMessageType.Text, true, CancellationToken.None);
                    }
                    else {
                        await ws.SendAsync(Data.CODE_INVALID_ARGUMENT, WebSocketMessageType.Text, true, CancellationToken.None);
                    }

                    break;

                case "timeout":
                    _ = int.TryParse(msg[1], out timeout);
                    break;

                /*case "interval":
                    _ = int.TryParse(msg[1], out interval);
                    break;*/

                case "method":
                    method = msg[1] == "arp" ? Method.ARP : Method.ICMP;
                    break;

                case "ping":
                    new Thread(() => {
                        int i = 0;
                        string[] name = new string[hostnames.Count];
                        string[] id = new string[hostnames.Count];

                        foreach (DictionaryEntry o in hostnames) {
                            id[i] = o.Key.ToString();
                            name[i] = o.Value.ToString();
                            i++;
                        }

                        Task<string> s = method == Method.ICMP ? PingArrayAsync(name, id, timeout) : ArpPingArrayAsync(name, id);
                        s.Wait();

                        lock (mutex) { //one send per socket
                            ws.SendAsync(new ArraySegment<byte>(Encoding.ASCII.GetBytes(s.Result), 0, s.Result.Length), WebSocketMessageType.Text, true, CancellationToken.None);
                        }
                    }).Start();
                    break;
                }
            }
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

        if (ws.State == WebSocketState.Open) {
            try {
                await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, CancellationToken.None);
            }
#if DEBUG
            catch (Exception ex) {
                Logger.Error(ex);
            }
#else
            catch { }
#endif
        }
    }
    private static async Task<string> PingArrayAsync(string[] name, string[] id, int timeout) {
        List<Task<string>> tasks = new List<Task<string>>(name.Length);
        for (int i = 0; i < name.Length; i++) tasks.Add(PingAsync(name[i], id[i], timeout));
        string[] result = await Task.WhenAll(tasks);
        return String.Join((char)127, result);
    }
    private static async Task<string> PingAsync(string hostname, string id, int timeout) {
        using Ping p = new Ping();

        try {
            PingReply reply = await p.SendPingAsync(hostname, timeout, ICMP_PAYLOAD);

            return (int)reply.Status switch {
                (int)IPStatus.DestinationUnreachable or
                (int)IPStatus.DestinationHostUnreachable or
                (int)IPStatus.DestinationNetworkUnreachable => id + ((char)127) + "Unreachable",

                (int)IPStatus.Success  => id + ((char)127) + reply.RoundtripTime,
                (int)IPStatus.TimedOut => id + ((char)127) + "Timed out",
                11050                  => id + ((char)127) + "General failure",
                _                      => id + ((char)127) + reply.Status,
            };
        }
        catch (ArgumentException) {
            return id + ((char)127) + "Invalid address";
        }
        catch (PingException) {
            return id + ((char)127) + "Ping error";
        }
        catch (Exception) {
            return id + ((char)127) + "Unknown error";
        }
    }

    private static async Task<string> ArpPingArrayAsync(string[] name, string[] id) {
        List<Task<string>> tasks = new List<Task<string>>(name.Length);
        for (int i = 0; i < name.Length; i++) tasks.Add(ArpPingAsync(name[i], id[i]));
        string[] result = await Task.WhenAll(tasks);
        return String.Join(((char)127), result);
    }

    private static async Task<string> ArpPingAsync(string name, string id) {
        try {
            IPAddress[] ips = await System.Net.Dns.GetHostAddressesAsync(name);
            if (ips.Length == 0) return id + ((char)127) + "Unknown host";

            IPAddress ip = ips.First(o => o.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork);
            if (!ips[0].OnSameBroadcastDomain()) return id + ((char)127) + "Unknown net.";

            string response = Arp.ArpRequest(ip.ToString());

            if (response is not null && response.Length > 0) {
                return id + ((char)127) + "0";
            }

            return id + ((char)127) + "Unreachable";
        }
        catch (Exception) {
            return id + ((char)127) + "Unknown error";
        }
    }
}
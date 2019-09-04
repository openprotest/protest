using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.Collections;
using System.Collections.Generic;
using System.DirectoryServices;
using System.Net;
using System.Net.WebSockets;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.IO;
using System.Text;
using System.Management;
using System.Diagnostics;
using System.Net.Http;

static class Tools {
    [System.Runtime.InteropServices.DllImport("iphlpapi.dll", ExactSpelling = true)] public static extern int SendARP(uint DestIP, uint SrcIP, byte[] pMacAddr, ref int PhyAddrLen);

    public static string Arp(string ip) {
        string[] split = ip.Split('.');
        if (split.Length < 4) return "";

        try {
            IPAddress ipAddress = new IPAddress(new byte[] {
            Byte.Parse(split[0]),
            Byte.Parse(split[1]),
            Byte.Parse(split[2]),
            Byte.Parse(split[3])});
            return Arp(ipAddress);
        } catch {
            return "";
        }
    }

    public static string Arp(IPAddress ip) {
        try {
            if (!OnSameNetwork(ip)) return "";

            new Ping().Send(ip, 2000);

            int len = 6;
            byte[] mac = new byte[len];
            byte[] byte_ip = ip.GetAddressBytes();
            uint long_ip = (uint)(byte_ip[3] * 16777216 + byte_ip[2] * 65536 + byte_ip[1] * 256 + byte_ip[0]);
            SendARP(long_ip, 0, mac, ref len);

            return BitConverter.ToString(mac, 0, len).Replace("-", ":");

        } catch (SocketException) {
            return "";
        } catch {
            return "";
        }
    }

    public static readonly string MAC_BIN_FILE = $"{Directory.GetCurrentDirectory()}\\knowlage\\mac.bin";
    public static readonly string IP_BIN_DIR = $"{Directory.GetCurrentDirectory()}\\knowlage\\ip\\";

    public static readonly ArraySegment<byte> OK = new ArraySegment<byte>(Encoding.UTF8.GetBytes("ok"));
    public static readonly ArraySegment<byte> ACK = new ArraySegment<byte>(Encoding.UTF8.GetBytes("acknowledge"));
    public static readonly ArraySegment<byte> INF = new ArraySegment<byte>(Encoding.UTF8.GetBytes("not enough information"));
    public static readonly ArraySegment<byte> INV = new ArraySegment<byte>(Encoding.UTF8.GetBytes("invalid argument"));
    public static readonly ArraySegment<byte> FAI = new ArraySegment<byte>(Encoding.UTF8.GetBytes("failed"));
    public static readonly ArraySegment<byte> FLE = new ArraySegment<byte>(Encoding.UTF8.GetBytes("no such file"));
    public static readonly ArraySegment<byte> NHO = new ArraySegment<byte>(Encoding.UTF8.GetBytes("no such host is known"));
    public static readonly ArraySegment<byte> UNA = new ArraySegment<byte>(Encoding.UTF8.GetBytes("service is unavailable"));
    public static readonly ArraySegment<byte> UNR = new ArraySegment<byte>(Encoding.UTF8.GetBytes("host is unreachable"));
    public static readonly ArraySegment<byte> TCP = new ArraySegment<byte>(Encoding.UTF8.GetBytes("TCP connection failure"));

    public static byte[] XhrPing(string[] para) {
        string ip = null;
        for (int i = 1; i < para.Length; i++)
            if (para[i].StartsWith("ip=")) ip = para[i].Substring(3);
        
        if (ip is null) return Encoding.UTF8.GetBytes("Invalid address");

        Task<string> t = PingAsync(ip, "", 1001);
        return Encoding.UTF8.GetBytes(t.Result.Replace(((char)127).ToString(), ""));
    }
    public static async void WsPing(HttpListenerContext ctx, string remoteIp) {
        WebSocketContext wsc = null;
        WebSocket ws = null;

        try {
            wsc = await ctx.AcceptWebSocketAsync(null);
            ws = wsc.WebSocket;
        } catch (WebSocketException ex) {
            ctx.Response.Close();
            ErrorLog.Err(ex);
            return;
        }

        string sessionId = Session.GetSessionId(ctx);

        if (sessionId is null) {
            ctx.Response.Close();
            return;
        }

        Hashtable hostnames = new Hashtable();
        object send_lock = new object();

        try {
            while (ws.State == WebSocketState.Open) {
                byte[] buff = new byte[2048];
                WebSocketReceiveResult receiveResult = await ws.ReceiveAsync(new ArraySegment<byte>(buff), CancellationToken.None);

                if (!Session.CheckAccess(sessionId, remoteIp)) { //check session
                    ctx.Response.Close();
                    return;
                }

                if (receiveResult.MessageType == WebSocketMessageType.Close) {
                    await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None);
                    break;
                }

                string[] msg = Encoding.Default.GetString(buff, 0, receiveResult.Count).Split(':');

                if (msg.Length < 2) {
                    await ws.SendAsync(INV, receiveResult.MessageType, receiveResult.EndOfMessage, CancellationToken.None);
                    continue;
                }

                switch (msg[0]) {
                    case "add":
                    string[] h = msg[1].Split(';');
                    if (h.Length > 1) {
                        for (int i = 0; i < h.Length - 1; i += 2) {
                            h[i] = h[i].Trim();
                            h[i+1] = h[i+1].Trim();
                            if (h[i].Length > 0 && h[i+1].Length > 0 && !hostnames.ContainsKey(h[i]))
                                hostnames.Add(h[i], h[i + 1]);
                             else
                                await ws.SendAsync(INV, WebSocketMessageType.Text, true, CancellationToken.None);
                        }
                        await ws.SendAsync(ACK, WebSocketMessageType.Text, true, CancellationToken.None);
                    } else 
                        await ws.SendAsync(INV, WebSocketMessageType.Text, true, CancellationToken.None);
                    break;

                    case "remove":
                    string value = msg[1].Trim();
                    if (hostnames.Contains(value)) {
                        hostnames.Remove(value);
                        await ws.SendAsync(ACK, WebSocketMessageType.Text, true, CancellationToken.None);
                    } else
                        await ws.SendAsync(INV, WebSocketMessageType.Text, true, CancellationToken.None);             
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

                        Task<string> s = PingArrayAsync(name, id, 1001);
                        s.Wait();

                        lock(send_lock) { //one send per socket
                           ws.SendAsync(new ArraySegment<byte>(Encoding.ASCII.GetBytes(s.Result), 0, s.Result.Length), WebSocketMessageType.Text, true, CancellationToken.None);
                        }
                    }).Start();
                    break;
                }
            }

        } catch (Exception ex) {
            ErrorLog.Err(ex);
        } /*finally {
            ctx.Response.Close();
        }*/

    }
    public static async Task<string> PingArrayAsync(string[] name, string[] id, int timeout) {
        List<Task<string>> tasks = new List<Task<string>>();
        for (int i=0; i<name.Length; i++) tasks.Add(PingAsync(name[i], id[i], timeout));
        string[] result = await Task.WhenAll(tasks);
        return String.Join (((char)127).ToString(), result);
    }
    public static async Task<string> PingAsync(string hostname, string id, int timeout) {
        Ping p = new Ping();

        try {
            PingReply reply = await p.SendPingAsync(hostname, timeout);
            if (reply.Status == IPStatus.Success)
                return id + ((char)127).ToString() + reply.RoundtripTime.ToString();

            else if (reply.Status == IPStatus.DestinationHostUnreachable || reply.Status == IPStatus.DestinationNetworkUnreachable)
                return id + ((char)127).ToString() + "Unreachable";

            else {
                //https://docs.microsoft.com/en-us/windows/desktop/api/ipexport/ns-ipexport-icmp_echo_reply32
                string r = reply.Status.ToString();
                if (r == "11050")
                    return id + ((char)127).ToString() + "General failure";
                else
                    return id + ((char)127).ToString() + reply.Status.ToString();
            }

        } catch (ArgumentException) {
            return id + ((char)127).ToString() + "Invalid address";

        } catch (PingException) {
            return id + ((char)127).ToString() + "Ping error";

        } catch (Exception) {
            return id + ((char)127).ToString() + "Unkown error";

        } finally {
            p.Dispose();
        }
    }

    public static async void WsTraceRoute(HttpListenerContext ctx, string remoteIp) {
        WebSocketContext wsc = null;
        WebSocket ws = null;

        try {
            wsc = await ctx.AcceptWebSocketAsync(null);
            ws = wsc.WebSocket;
        } catch (WebSocketException ex) {
            ctx.Response.Close();
            ErrorLog.Err(ex);
            return;
        }

        string sessionId = Session.GetSessionId(ctx);

        if (sessionId is null) {
            ctx.Response.Close();
            return;
        }

        object send_lock = new object();

        try { 
            while (ws.State == WebSocketState.Open) {
                byte[] buff = new byte[2048];
                WebSocketReceiveResult receiveResult = await ws.ReceiveAsync(new ArraySegment<byte>(buff), CancellationToken.None);

                if (!Session.CheckAccess(sessionId, remoteIp)) { //check session
                    ctx.Response.Close();
                    return;
                }

                if (receiveResult.MessageType == WebSocketMessageType.Close) {
                    await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None);
                    break;
                }

                string hostname = Encoding.Default.GetString(buff, 0, receiveResult.Count);
                hostname = hostname.Trim();
                if (hostname.Length == 0) {
                    await ws.SendAsync(INV, WebSocketMessageType.Text, true, CancellationToken.None);
                    continue;
                }

                byte[] buffer = Encoding.ASCII.GetBytes("0000000000000000000000000000000");
                short timeout = 3000; //3s
                short ttl = 30;

                List<string> list = new List<string>();

                new Thread(async () => {
                    List<IPAddress> ipList = new List<IPAddress>();
                    string lastAddress = "";

                    for (int i=1; i<ttl; i++) {
                        if (ws.State != WebSocketState.Open) break;

                        string result = $"{hostname}{(char)127}";
                        using (Ping p = new Ping()) {
                            try {
                                PingReply reply = p.Send(hostname, timeout, buffer, new PingOptions(i, true));
                                if (reply.Status == IPStatus.Success || reply.Status == IPStatus.TtlExpired) {
                                    if (lastAddress == reply.Address.ToString())
                                        break;
                                    else
                                        lastAddress = reply.Address.ToString();
                                        
                                    result += reply.Address.ToString();
                                    ipList.Add(reply.Address);

                                } else if (reply.Status == IPStatus.TimedOut)
                                    result += "Timed Out";

                                else
                                    break;

                            } catch (Exception ex) {
                                ErrorLog.Err(ex);
                                break;
                            }
                            
                            lock (send_lock) //once send per socket
                                ws.SendAsync(new ArraySegment<byte>(Encoding.UTF8.GetBytes(result), 0, result.Length), WebSocketMessageType.Text, true, CancellationToken.None);
                        }
                    }

                    List<Task<string>> tasks = new List<Task<string>>();
                    for (int j = 0; j < ipList.Count; j++) tasks.Add(DnsLookupAsync(ipList[j]));
                    string[] hostnameArray = await Task.WhenAll(tasks);

                    string hostnames = $"[hostnames]{(char)127}{hostname}{(char)127}";
                    for (int i = 0; i < hostnameArray.Length; i++)
                        if (hostnameArray[i].Length > 0 && hostnameArray[i] != ipList[i].ToString())
                            hostnames += $"{ipList[i]}{(char)127}{hostnameArray[i]}{(char)127}";
                    if (hostnames.EndsWith(((char)127).ToString())) hostnames = hostnames.Substring(0, hostnames.Length - 1);

                    lock (send_lock) {
                        ws.SendAsync(new ArraySegment<byte>(Encoding.UTF8.GetBytes(hostnames), 0, hostnames.Length), WebSocketMessageType.Text, true, CancellationToken.None);
                        
                        string over = "over" + ((char)127).ToString() + hostname;
                        ws.SendAsync(new ArraySegment<byte>(Encoding.UTF8.GetBytes(over), 0, over.Length), WebSocketMessageType.Text, true, CancellationToken.None);
                    }

                }).Start();
            }

        } catch (Exception ex) {
            ErrorLog.Err(ex);
        }
    }
    
    public static async void WsPortScan(HttpListenerContext ctx, string remoteIp) {
        WebSocketContext wsc;
        WebSocket ws;

        try {
            wsc = await ctx.AcceptWebSocketAsync(null);
            ws = wsc.WebSocket;
        } catch (WebSocketException ex) {
            ctx.Response.Close();
            ErrorLog.Err(ex);
            return;
        }

        string sessionId = Session.GetSessionId(ctx);

        if (sessionId is null) {
            ctx.Response.Close();
            return;
        }

        object send_lock = new object();

        try {
            while (ws.State == WebSocketState.Open) {
                byte[] buff = new byte[2048];
                WebSocketReceiveResult receiveResult = await ws.ReceiveAsync(new ArraySegment<byte>(buff), CancellationToken.None);

                if (!Session.CheckAccess(sessionId, remoteIp)) { //check session
                    ctx.Response.Close();
                    return;
                }

                if (receiveResult.MessageType == WebSocketMessageType.Close) {
                    await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None);
                    break;
                }

                string[] message = Encoding.Default.GetString(buff, 0, receiveResult.Count).Trim().Split(';');

                string hostname = message[0].Trim();
                if (hostname.Length == 0) {
                    await ws.SendAsync(INV, WebSocketMessageType.Text, true, CancellationToken.None);
                    continue;
                }

                int rangeFrom = 1;
                int rangeTo = 1023;
                if (message.Length > 2) {
                    rangeFrom = int.Parse(message[1]);
                    rangeTo = int.Parse(message[2]);
                }

                if (rangeFrom > rangeTo) {
                    int temp = rangeFrom;
                    rangeFrom = rangeTo;
                    rangeTo = temp;
                }

                /*bool reachable = false;
                try {
                    Ping p = new Ping();
                    PingReply reply = await p.SendPingAsync(hostname, 2500);
                    reachable = reply.Status == IPStatus.Success;
                } catch { }*/
                /*if (!reachable) {
                    string unreachable = "unreachable" + ((char)127).ToString() + hostname;
                    await ws.SendAsync(new ArraySegment<byte>(Encoding.UTF8.GetBytes(unreachable), 0, unreachable.Length), WebSocketMessageType.Text, true, CancellationToken.None);
                }*/

                new Thread(() => {
                    for (int i=rangeFrom; i<rangeTo; i+= 256) {
                        if (ws.State != WebSocketState.Open) return;

                        string result = "";

                        int from = i;
                        int to = Math.Min(i+255, rangeTo);

                        Task<bool[]> s = PortsScanAsync(hostname, from, to);
                        s.Wait();

                        for (int port = 0; port < s.Result.Length; port++)
                            if (s.Result[port])
                                result += (port + from) + ((char)127).ToString();

                        if (result.Length > 0) {
                            result = hostname + ((char)127).ToString() + result;
                            lock (send_lock) { //once send per socket
                                ws.SendAsync(new ArraySegment<byte>(Encoding.UTF8.GetBytes(result), 0, result.Length), WebSocketMessageType.Text, true, CancellationToken.None);
                            }
                        }
                    }

                    string over = "over" + ((char)127).ToString() + hostname;
                    ws.SendAsync(new ArraySegment<byte>(Encoding.UTF8.GetBytes(over), 0, over.Length), WebSocketMessageType.Text, true, CancellationToken.None);
                }).Start();
                
            }
        } catch (Exception ex) {
            ErrorLog.Err(ex);
        } /*finally {
            ctx.Response.Close();
        }*/
    }
    public static async Task<bool[]> PortsScanAsync(string hostname, int from, int to) {
        int[] q = QPortScan(hostname);
        if ((!(q is null))) {
            bool[] p = new bool[to - from];
            for (int i = 0; i < p.Length; i++) 
                p[i] = q.Contains(i + from);
            return p;
        }

        List<Task<bool>> tasks = new List<Task<bool>>();
        for (int port=from; port<to; port++) tasks.Add(PortScanAsync(hostname, port)); 
        bool[] result = await Task.WhenAll(tasks);
        return result;
    }
    public static async Task<bool[]> PortsScanAsync(string hostname, short[] ports) {
        int[] q = QPortScan(hostname);
        if (!(q is null)) {
            bool[] p = new bool[ports.Length];
            for (int i = 0; i < p.Length; i++)
                p[i] = q.Contains(ports[i]);
            return p;
        }

        List<Task<bool>> tasks = new List<Task<bool>>();
        for (int i=0; i< ports.Length; i++) tasks.Add(PortScanAsync(hostname, ports[i]));
        bool[] result = await Task.WhenAll(tasks);
        return result;
    }
    public static async Task<bool> PortScanAsync(string hostname, int port) {
        try {
            TcpClient client = new TcpClient();
            await client.ConnectAsync(hostname, port);
            bool status = client.Connected;
            client.Close();
            client.Dispose();
            return status;
        } catch {
            return false;
        }
    }

    public static int[] QPortScan(string hostname) {
        try {
            ProcessStartInfo info = new ProcessStartInfo {
                FileName = "psexec",
                Arguments = $"\\\\{hostname} netstat -nq", //-u ...\\administrator -p [pass]
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            };

            Process p = new Process();
            p.StartInfo = info;
            p.Start();

            Thread.Sleep(50);

            StreamReader output = p.StandardOutput;
            List<int> ports = new List<int>();

            int ok_count = 0;
            string line;
            while ((line = output.ReadLine()) != null) {
                string[] split = line.Split(new char[]{' '}, StringSplitOptions.RemoveEmptyEntries);

                if (split.Length < 4) continue;
                if (split[3] == "CLOSED" || split[3] == "CLOSE_WAIT" || split[3] == "BOUND") continue;
                if (split[0] != "TCP") continue; //only tcp
                ok_count++;

                if (!int.TryParse(split[1].Split(':').Last(), out int port)) continue;
                if (port >= 49152) continue; //public ports

                if (!ports.Contains(port)) ports.Add(port);
            }

            ports.Sort();
            if (ok_count == 0) return null;
            return ports.ToArray();
        } catch {
            return null;
        }
    }

    public static byte[] DnsLookup(string[] para) {
        if (para.Length < 2) return null;
        return DnsLookup(para[1]);
    }
    public static byte[] DnsLookup(string hostname) {
        try {
            string ips = "";
            foreach (IPAddress ip in Dns.GetHostAddresses(hostname))
                ips += ip.ToString() + ((char)127).ToString();

            return Encoding.UTF8.GetBytes(ips);
        } catch { }

        return null;
    }
    public static async Task<string> DnsLookupAsync(IPAddress ip) {
        try {
            return (await Dns.GetHostEntryAsync(ip)).HostName;
        } catch {
            return "";
        }
    }

    //https://regauth.standards.ieee.org/standards-ra-web/pub/view.html#registries
    public static byte[] MacLookup(string[] para) {
        if (para.Length < 2) return null;
        string mac = para[1];
        return MacLookup(mac);
    }
    public static byte[] MacLookup(string mac) {
        mac = mac.Replace("-", "");
        mac = mac.Replace(":", "");
        mac = mac.Replace(" ", "");
        if (mac.Length < 6) return null;

        byte[] t = new byte[4];
        try {
            t[3] = 0;
            t[2] = byte.Parse(mac.Substring(0, 2), System.Globalization.NumberStyles.HexNumber);
            t[1] = byte.Parse(mac.Substring(2, 2), System.Globalization.NumberStyles.HexNumber);
            t[0] = byte.Parse(mac.Substring(4, 2), System.Globalization.NumberStyles.HexNumber);
        } catch {
            return Encoding.UTF8.GetBytes("not found");
        }

        uint target = BitConverter.ToUInt32(t, 0);

        try {
            FileInfo file = new FileInfo(MAC_BIN_FILE);
            if (!file.Exists) return null;

            FileStream stream = new FileStream(file.FullName, FileMode.Open, FileAccess.Read);

            uint dictionaryStart = BitConverter.ToUInt32(new byte[] {
                (byte)stream.ReadByte(),
                (byte)stream.ReadByte(),
                (byte)stream.ReadByte(),
                (byte)stream.ReadByte()
            }, 0);

            uint current;
            uint pivot;
            uint low = 4;
            uint high = dictionaryStart;

            do { //binary search
                pivot = (low + high) / 2;
                pivot = 4 + pivot - pivot % 7;
                stream.Position = pivot;

                byte[] buff = new byte[4];
                buff[3] = 0;
                buff[2] = (byte)stream.ReadByte();
                buff[1] = (byte)stream.ReadByte();
                buff[0] = (byte)stream.ReadByte();

                current = BitConverter.ToUInt32(buff, 0);

                if (current == target) break; //found

                if (target < current) high = pivot;
                if (target > current) low = pivot;
            } while (high - low > 7);

            if (current == target) { //### found ###
                int name_index = BitConverter.ToInt32(new byte[] {
                        (byte)stream.ReadByte(),
                        (byte)stream.ReadByte(),
                        (byte)stream.ReadByte(),
                        (byte)stream.ReadByte()
                    }, 0);

                stream.Position = dictionaryStart + name_index;
                string name = "";
                while (true) {
                    int b = stream.ReadByte();
                    if (b == 0) break;
                    name += (char)b;
                }

                stream.Close();
                return Encoding.UTF8.GetBytes(name);
            } //### end found ###
                       
            stream.Close();
            return Encoding.UTF8.GetBytes("not found");
        } catch {
            return null;
        }
    }

    public static byte[] LocateIp(string[] para) {
        if (para.Length < 2) return null;
        string ip = para[1];
        return LocateIp(ip);
    }
    public static byte[] LocateIp(string ip) {
        string[] split = ip.Split('.');

        if (split.Length != 4) { //if not an ip, do a dns resolve
            byte[] dnsresponse = DnsLookup(ip);
            if (dnsresponse is null) return null;
            split = Encoding.UTF8.GetString(dnsresponse).Split((char)127)[0].Split('.');
        }

        if (split.Length != 4) return null;

        try {
            byte msb = byte.Parse(split[0]); //most significant bit

            uint target = BitConverter.ToUInt32(new byte[] {
                byte.Parse(split[3]),
                byte.Parse(split[2]),
                byte.Parse(split[1]),
                msb
            }, 0);

            FileInfo file = new FileInfo($"{IP_BIN_DIR}{split[0]}.bin");
            if (!file.Exists) return Encoding.UTF8.GetBytes("not found");

            FileStream stream = new FileStream(file.FullName, FileMode.Open, FileAccess.Read);

            uint dictionaryStart = BitConverter.ToUInt32(new byte[] {
                (byte)stream.ReadByte(),
                (byte)stream.ReadByte(),
                (byte)stream.ReadByte(),
                (byte)stream.ReadByte()
            }, 0);


            uint from, to;
            uint pivot;
            uint low = 4;
            uint high = dictionaryStart;

            do { //binary search
                pivot = (low + high) / 2;
                pivot = 4 + pivot - pivot % 26;
                stream.Position = pivot;

                from = BitConverter.ToUInt32(new byte[] {
                    0,
                    (byte)stream.ReadByte(),
                    (byte)stream.ReadByte(),
                    msb,
                }, 0);

                to = BitConverter.ToUInt32(new byte[] {
                    255,
                    (byte)stream.ReadByte(),
                    (byte)stream.ReadByte(),
                    msb,
                }, 0);
                
                if (target >= from && target <= to) break; //found

                if (target < from && target < to) high = pivot;
                if (target > from && target > to) low = pivot;
            } while (high - low >= 26);

            if (target >= from && target <= to) { //### found ###
                string fl = Encoding.UTF8.GetString(new byte[] { (byte)stream.ReadByte(), (byte)stream.ReadByte() });

                byte[] bytes = new byte[4];

                for (sbyte i = 0; i < 4; i++) bytes[i] = (byte)stream.ReadByte();
                uint ptr1 = BitConverter.ToUInt32(bytes, 0);

                for (sbyte i = 0; i < 4; i++) bytes[i] = (byte)stream.ReadByte();
                uint ptr2 = BitConverter.ToUInt32(bytes, 0);

                for (sbyte i = 0; i < 4; i++) bytes[i] = (byte)stream.ReadByte();
                uint ptr3 = BitConverter.ToUInt32(bytes, 0);

                for (sbyte i = 0; i < 4; i++) bytes[i] = (byte)stream.ReadByte();
                Single lon = BitConverter.ToSingle(bytes, 0);

                for (sbyte i = 0; i < 4; i++) bytes[i] = (byte)stream.ReadByte();
                Single lat = BitConverter.ToSingle(bytes, 0);

                stream.Position = (long)(dictionaryStart + ptr1);
                string s1 = "";
                while (true) {
                    int b = stream.ReadByte();
                    if (b == 0) break;
                    s1 += (char)b;
                }

                stream.Position = (long)(dictionaryStart + ptr2);
                string s2 = "";
                while (true) {
                    int b = stream.ReadByte();
                    if (b == 0) break;
                    s2 += (char)b;
                }

                stream.Position = (long)(dictionaryStart + ptr3);
                string s3 = "";
                while (true) {
                    int b = stream.ReadByte();
                    if (b == 0) break;
                    s3 += (char)b;
                }

                stream.Close();
                return Encoding.UTF8.GetBytes(
                    fl + ";" +
                    s1 + ";" +
                    s2 + ";" +
                    s3 + ";" +
                    lon + "," + lat
                );
            } //### end found ###

            stream.Close();
            return Encoding.UTF8.GetBytes("not found");
        } catch {
            return null;
        }
    }

    public static async void WsSpeedTest(HttpListenerContext ctx, string remoteIp) {
        WebSocketContext wsc; WebSocket ws;

        try {
            wsc = await ctx.AcceptWebSocketAsync(null);
            ws = wsc.WebSocket;
        } catch (WebSocketException ex) {
            ctx.Response.Close();
            ErrorLog.Err(ex);
            return;
        }

        string sessionId = Session.GetSessionId(ctx);

        if (sessionId is null) {
            ctx.Response.Close();
            return;
        }

        if (!Session.CheckAccess(sessionId, remoteIp)) { //check session
            ctx.Response.Close();
            return;
        }

        byte[] small = new byte[2048];
        byte[] big = new byte[32768];

        Random random = new Random();
        random.NextBytes(small);
        random.NextBytes(big);

        ArraySegment<byte> small_segment = new ArraySegment<byte>(small, 0, small.Length);
        ArraySegment<byte> big_segment = new ArraySegment<byte>(big, 0, big.Length);

        try {

            byte[] buff = new byte[64];
            WebSocketReceiveResult receiveResult = await ws.ReceiveAsync(new ArraySegment<byte>(buff), CancellationToken.None);
            string type = Encoding.Default.GetString(buff, 0, receiveResult.Count);

            long mark = DateTime.Now.Ticks + 50000000;

            /*if (buff[0] == 70) */
            { //Full-dublex

                Console.WriteLine("start downstream");

                while (DateTime.Now.Ticks < mark) { //for 5 seconds
                    await ws.SendAsync(small_segment, WebSocketMessageType.Binary, true, CancellationToken.None);
                }
                await ws.SendAsync(Tools.OK, WebSocketMessageType.Binary, true, CancellationToken.None);
                Console.WriteLine("end downstream");

                await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None);
                Console.WriteLine("DONE!!");
                Console.WriteLine();

                /*Thread downstream = new Thread(async () => {

                });
                downstream.Start();

                new Thread( () => { //watcher
                    Thread.Sleep(5500);
                    downstream.Abort();
                }).Start();*/

            }

        } catch (Exception ex) {
            ErrorLog.Err(ex);
        }
    }

    public static async void WsWebCheck(HttpListenerContext ctx, string remoteIp) {
        WebSocketContext wsc; WebSocket ws;

        try {
            wsc = await ctx.AcceptWebSocketAsync(null);
            ws = wsc.WebSocket;
        } catch (WebSocketException ex) {
            ctx.Response.Close();
            ErrorLog.Err(ex);
            return;
        }

        string sessionId = Session.GetSessionId(ctx);

        if (sessionId is null) {
            ctx.Response.Close();
            return;
        }

        if (!Session.CheckAccess(sessionId, remoteIp)) { //check session
            ctx.Response.Close();
            return;
        }

        try {
            string result;
            byte[] buff = new byte[4096];
            WebSocketReceiveResult receiveResult = await ws.ReceiveAsync(new ArraySegment<byte>(buff), CancellationToken.None);
            string uri = Encoding.Default.GetString(buff, 0, receiveResult.Count);

            string protocol = "";
            string domain = "";
            int port = 0;

            int colon = uri.IndexOf("://");
            if (colon > 0) {
                protocol = uri.Substring(0,colon).ToLower();

                string keep = uri.Substring(colon+3);
                keep = keep.Replace("\\", "/");
                keep = keep.Split('/')[0];

                if (keep.Contains(":")) {
                    string[] split = keep.Split(':');
                    string sPort = split[1];
                    keep = split[0];
                    port = int.Parse(sPort);

                } else 
                    switch(protocol) {
                        case "http": port = 80; break;
                        case "https": port = 443; break;
                        default: port = 80; break;
                    }

                domain = keep;
            }

            try { //DNS check
                string ips = "";
                foreach (IPAddress ip in Dns.GetHostAddresses(domain))
                    ips += (ips.Length>0? ", " : "") + ip.ToString();

                ips = "DNS resolve: " + ips;

                await ws.SendAsync(new ArraySegment<byte>(Encoding.UTF8.GetBytes(ips + "\n"), 0, ips.Length + 1), WebSocketMessageType.Text, true, CancellationToken.None);
            } catch (Exception ex) {
                await ws.SendAsync(new ArraySegment<byte>(Encoding.UTF8.GetBytes(ex.Message + "\n"), 0, ex.Message.Length + 1), WebSocketMessageType.Text, true, CancellationToken.None);
            }

            
            try { //TCP check
                TcpClient client = new TcpClient();
                await client.ConnectAsync(domain, port);
                string tcp = (client.Connected)? "TCP connection: OK\n" : "TCP: Failed\n";
                await ws.SendAsync(new ArraySegment<byte>(Encoding.UTF8.GetBytes(tcp), 0, tcp.Length), WebSocketMessageType.Text, true, CancellationToken.None);
                
                client.Close();
                client.Dispose();
            } catch (Exception ex) {
                await ws.SendAsync(new ArraySegment<byte>(Encoding.UTF8.GetBytes(ex.Message + "\n"), 0, ex.Message.Length + 1), WebSocketMessageType.Text, true, CancellationToken.None);
            }

            try { //HTTP check
                HttpResponseMessage get = await new HttpClient().GetAsync(uri);

                string http = $"HTTP response: {((int)get.StatusCode).ToString()} {get.StatusCode.ToString()}";
                await ws.SendAsync(new ArraySegment<byte>(Encoding.UTF8.GetBytes(http + "\n"), 0, http.Length + 1), WebSocketMessageType.Text, true, CancellationToken.None);

                result = $"HTTP/{get.Version} {((int)get.StatusCode).ToString()} {get.StatusCode.ToString()}";
                result += "\n";
                result += get.Headers.ToString();

            } catch (ArgumentException) {
                result = "invalid request URI";

            } catch (HttpRequestException) {
                result = "HTTP request failed";

            } catch (Exception ex) {
                result = ex.Message;
            }

            await ws.SendAsync(new ArraySegment<byte>(Encoding.UTF8.GetBytes(result), 0, result.Length), WebSocketMessageType.Text, true, CancellationToken.None);
            await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None);

        } catch (Exception ex) {
            ErrorLog.Err(ex);
            await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None);
        }

    }

    public static byte[] PrintTestPage(string[] para) {
        string target = "";
        for (int i = 1; i < para.Length; i++)
            if (para[i].StartsWith("target=")) {
                target = para[i].Substring(7);
                break;
            }
        
        if (target.Length == 0) return INV.Array;

        return PrintTestPage(target);
    }

    public static byte[] PrintTestPage(string target) {
        string msg = "\r\n\r\n" +
            @"  _______        _     _____" + "\r\n" +
            @" |__   __|      | |   |  __ \" + "\r\n" +
            @"    | | ___  ___| |_  | |__) |_ _  __ _  ___" + "\r\n" +
            @"    | |/ _ \/ __| __| |  ___/ _` |/ _` |/ _ \" + "\r\n" +
            @"    | |  __/\__ \ |_  | |  | (_| | (_| |  __/" + "\r\n" +
            @"    |_|\___||___/\__| |_|   \__,_|\__, |\___|" + "\r\n" +
            @"                                   __/ |" + "\r\n" +
            @"                                  |___/" + "\r\n" +
            "\r\n" + 
            "---------------------------------------------\r\n" +
            "  " + DateTime.Now.ToLongTimeString() + "\r\n" +
            "  " + DateTime.Now.ToLongDateString() + "\r\n" +
            "---------------------------------------------\r\n" +
            "\n\n\n\n\n\n\n\n" +
            "\x1Bm\0\0"; //cut

        byte[] data = Encoding.ASCII.GetBytes(msg);

        try {
            TcpClient client = new TcpClient();
            client.Connect(target, 9100);

            NetworkStream stream = client.GetStream();
            stream.Write(data, 0, data.Length);

            stream.Flush();
            stream.Close();
            client.Close();

        } catch (ArgumentNullException) {
            return INV.Array;
        } catch (SocketException) {
            return TCP.Array;
        } catch {
            return FAI.Array;
        }

        return OK.Array;
    }

    public static byte[] GetCurrentNetworkInfo() {
        foreach (NetworkInterface nic in NetworkInterface.GetAllNetworkInterfaces()) 
            foreach (UnicastIPAddressInformation ip in nic.GetIPProperties().UnicastAddresses) {
                try {
                    if (IPAddress.IsLoopback(ip.Address)) continue;
                    if (ip.Address.AddressFamily != AddressFamily.InterNetwork) continue;

                    IPAddress subnet = GetNetworkAddress(ip.Address, ip.IPv4Mask);
                    IPAddress broadcast = GetBroadcastAddress(ip.Address, ip.IPv4Mask);

                    string bits = "";
                    int prefix = 0;
                    for (int i = 0; i < 4; i++) {
                        byte b = ip.IPv4Mask.GetAddressBytes()[i];
                        bits += Convert.ToString(b, 2).PadLeft(8, '0');
                    }
                    for (int i=0; i < bits.Length; i++) {
                        if (bits[i] == '0') break;
                        prefix++;
                    }

                    string firstAddress = $"{subnet.GetAddressBytes()[0]}.{subnet.GetAddressBytes()[1]}.{subnet.GetAddressBytes()[2]}.{subnet.GetAddressBytes()[3]+1}";
                    string lastAddress = $"{broadcast.GetAddressBytes()[0]}.{broadcast.GetAddressBytes()[1]}.{broadcast.GetAddressBytes()[2]}.{broadcast.GetAddressBytes()[3]-1}";
                    string result = $"{firstAddress.ToString()}{(char)127}{lastAddress.ToString()}{(char)127}{IPGlobalProperties.GetIPGlobalProperties().DomainName}";
                    return Encoding.UTF8.GetBytes(result);
                } catch {}
            }

        return null;
    }

    public static bool OnSameNetwork(IPAddress host) {
        foreach (NetworkInterface adapter in NetworkInterface.GetAllNetworkInterfaces()) {
            IPInterfaceProperties properties = adapter.GetIPProperties();
            
            for (int i=0; i<properties.UnicastAddresses.Count; i++) {
                if (properties.UnicastAddresses[i].Address.AddressFamily != AddressFamily.InterNetwork) continue;

                IPAddress local = properties.UnicastAddresses[i].Address;
                IPAddress mask = properties.UnicastAddresses[i].IPv4Mask;

                IPAddress localNetwork = GetNetworkAddress(local, mask);
                IPAddress hostNetwork = GetNetworkAddress(host, mask);

                if (localNetwork.Equals(hostNetwork)) return true;
            }
        }

        return false;
    }

    public static IPAddress GetNetworkAddress(IPAddress ip, IPAddress mask) {
        byte[] bIp = ip.GetAddressBytes();
        byte[] bMask = mask.GetAddressBytes();
        byte[] bNetwork = new byte[4];

        for (int i = 0; i < 4; i++)
            bNetwork[i] = (byte)(bIp[i] & bMask[i]);

        return new IPAddress(bNetwork);
    }

    public static IPAddress GetBroadcastAddress(IPAddress ip, IPAddress mask) {
        byte[] bIp = ip.GetAddressBytes();
        byte[] bMask = mask.GetAddressBytes();
        byte[] bBroadcast = new byte[4];

        for (int i = 0; i < 4; i++)
            bBroadcast[i] = (byte)(bIp[i] | ~bMask[i]);

        return new IPAddress(bBroadcast);
    }

    public static Hashtable ptConnections = new Hashtable();
    public static object pt_lock = new object();

    public static bool PublicTransportationSessionSearchAndDestroy(string sessionId) {
        //lock (pt_lock) {}
        if (sessionId is null) return false;
        if (!ptConnections.ContainsKey(sessionId)) return false;

        try {
            WebSocket ws = (WebSocket)ptConnections[sessionId];
            ws.Abort();
        } catch { }

        ptConnections.Remove(sessionId);        
        return true;
    }

    public static async void WsPublicTransportationAsync(HttpListenerContext ctx, string remoteIp) {
        WebSocketContext wsc;
        WebSocket ws;

        try {
            wsc = await ctx.AcceptWebSocketAsync(null);
            ws = wsc.WebSocket;
        } catch (WebSocketException ex) {
            ctx.Response.Close();
            ErrorLog.Err(ex);
            return;
        }

        string sessionId = Session.GetSessionId(ctx);

        if (sessionId is null) {
            ctx.Response.Close();
            return;
        } else {
            lock (pt_lock) {
                PublicTransportationSessionSearchAndDestroy(sessionId);
                ptConnections.Add(sessionId, ws);
            }
        }

        try {
            //send session expiration date            
            byte[] life = Encoding.UTF8.GetBytes($"life{(char)127}{Session.GetSessionLife(sessionId).ToString()}");
            await ws.SendAsync(new ArraySegment<byte>(life, 0, life.Length), WebSocketMessageType.Text, true, CancellationToken.None);
            
            while (ws.State == WebSocketState.Open) {
                byte[] buff = new byte[2048];
                WebSocketReceiveResult receiveResult = await ws.ReceiveAsync(new ArraySegment<byte>(buff), CancellationToken.None);

                if (!Session.CheckAccess(sessionId, remoteIp)) { //check session
                    ctx.Response.Close();
                    return;
                }

                string[] queue = Encoding.Default.GetString(buff, 0, receiveResult.Count).Split(':');

                if (queue.Length < 2) {
                    await ws.SendAsync(INV, WebSocketMessageType.Text, true, CancellationToken.None);
                    continue;
                }

                object send_lock = new object();

                new Thread(async() => {
                    string[] result = null;

                    if (queue[0] == "equip_info") {
                        string[] filenames = queue[1].Split((char)127);
                        List<Task<string>> tasks = new List<Task<string>>();
                        foreach (string o in filenames) tasks.Add(InstantInfoEquipAsync(o));
                        result = await Task.WhenAll(tasks);

                    } else if (queue[0] == "user_info") {
                        string[] filenames = queue[1].Split((char)127);
                        List<Task<string>> tasks = new List<Task<string>>();
                        foreach (string o in filenames) tasks.Add(InstantInfoUserAsync(o));
                        result = await Task.WhenAll(tasks);
                    }

                    if (result is null || result.Length == 0) return;
                    string response = String.Join(((char)127).ToString(), result);

                    lock (send_lock)
                        ws.SendAsync(new ArraySegment<byte>(Encoding.ASCII.GetBytes(response), 0, response.Length), WebSocketMessageType.Text, true, CancellationToken.None);
                    
                }).Start();
            }

        } catch /*(Exception ex)*/ {
            //ErrorLog.Err(ex);

        } finally {
            lock (pt_lock)
                PublicTransportationSessionSearchAndDestroy(sessionId);
        }
    }

    public static async Task<string> InstantInfoEquipAsync(string filename) {
        if (!NoSQL.equip.ContainsKey(filename)) return "";

        string ip = null;
        string lastseen = "";
        string ping = "";

        string result = $"{filename};";

        try {
            NoSQL.DbEntry equip = (NoSQL.DbEntry) NoSQL.equip[filename];
            if (equip.hash.ContainsKey("IP"))
                ip = ((string[])equip.hash["IP"])[0];

            else if (equip.hash.ContainsKey("HOSTNAME"))
                ip = ((string[])equip.hash["HOSTNAME"])[0];

            if (ip is null) return "";
            if (ip.Length == 0) return "";
            if (ip.Contains(";")) ip = ip.Substring(0, ip.IndexOf(";")).Trim();
            
            lastseen = Encoding.UTF8.GetString(LastSeen.HasBeenSeen(ip)); 

            if (lastseen == "Just now") {
                ping = await Task.Run(()=> PingAsync(ip, "0", 1001));
                if (ping.Contains(((char)127).ToString())) ping = ping.Split ((char)127)[1];
            } else
                ping = "Timed out";

        } catch (Exception ex) {
            ErrorLog.Err(ex);
        }

        result += lastseen.Length > 0 ? $"Last seen;{lastseen};" : "";
        result += ping.Length > 0 ? $"Ping;{ping};" : "";

        if (lastseen == "Just now") {
            ManagementScope scope = Wmi.WmiScope(ip);
            if (scope != null) {
                string starttime = Wmi.WmiGet(scope, "Win32_LogonSession", "StartTime", false, new Wmi.FormatMethodPtr(Wmi.DateTimeToString));
                if (starttime.Length > 0) result += $"Start time;{starttime};";

                string username = Wmi.WmiGet(scope, "Win32_ComputerSystem", "UserName", false, null);
                if (username.Length > 0) result += $"Logged in user;{username};";
            }
        }

        return result;
    }

    public static async Task<string> InstantInfoUserAsync(string filename) {
        if (!NoSQL.users.ContainsKey(filename)) return "";

        string username = "";
        
        NoSQL.DbEntry user = (NoSQL.DbEntry)NoSQL.users[filename];
        if (user.hash.ContainsKey("USERNAME"))
            username = ((string[])user.hash["USERNAME"])[0];
        else
            return "";

        SearchResult sr = ActiveDir.GetUser(username);
        string result = $"{filename};";
        if (sr is null) return result;

        if (sr.Properties["lastLogon"].Count > 0)
            result += $"Last logon;{ActiveDir.FileTimeString(sr.Properties["lastLogon"][0].ToString())};";

        if (sr.Properties["lastLogoff"].Count > 0)
            result += $"Last logoff;{ActiveDir.FileTimeString(sr.Properties["lastLogoff"][0].ToString())};";

        if (sr.Properties["lockoutTime"].Count > 0 && sr.Properties["lockoutTime"][0].ToString().Length > 0)
            result += $"Lockout time;{ActiveDir.FileTimeString(sr.Properties["lockoutTime"][0].ToString())};";
        
        string userAccountControl = Convert.ToString((int) sr.Properties["userAccountControl"][0], 2);
        string flag_disable = userAccountControl[userAccountControl.Length - 2].ToString();
        if (flag_disable == "1")
            result += $"Disabled;True;";

        return result;
    }

}
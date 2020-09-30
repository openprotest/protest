using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

public static class PortScan {
    public static short[] basic_ports = {
        21, 22, 23, 25, 53, 67, 80, 110, 135, 139, 170, 239, 389, 443, 445, 515, 631, 636, 853, 990, 992, 993, 995, 3389, 5900, 6789, 7442, 7550, 8080, 8443, 9100, 10001
    };

    public static Hashtable protocol = new Hashtable() {
        {1,    "TCPMUX, TCP Port Service Multiplexer"},
        {5,    "RJE, Remote Job Entry"},
        {7,    "Echo"},
        {13,   "Daytime Protocol"},
        {17,   "QOTD, Quote of the Day"},
        {18,   "MSP, Message Send Protocol"},
        {19,   "CHARGEN, Character Generator Protocol"},
        {20,   "FTP, File Transfer Protocol - data"},
        {21,   "FTP, File Transfer Protocol - control"},
        {22,   "SSH, Secure Shell"},
        {23,   "Telnet"},
        {25,   "SMTP, Simple Message Transfer Protocol"},
        {26,   "RSFTP"},
        {37,   "Time Protocol"},
        {38,   "RAP, Route Access Protocol"},
        {39,   "RLP, Resource Location Protocol"},
        {42,   "WINS, Windows Internet Name Service"},
        {43,   "WHOIS, Who Is Protocol"},
        {49,   "TACACS, Terminal Access Controller Access-Control System"},
        {53,   "DNS, Domain Name Server"},
        {57,   "MTP, Mail Transfet Protocol"},
        {67,   "DHCP, Dynamic Host Configuration Protocol"},
        {70,   "Gopher, Gopher Protocol"},
        {71,   "NETRJS, Remote Job Entry"},
        {72,   "NETRJS, Remote Job Entry"},
        {73,   "NETRJS, Remote Job Entry"},
        {74,   "NETRJS, Remote Job Entry"},
        {79,   "Finger"},
        {80,   "HTTP, Hypertext Transfer Protocol"},
        {81,   "TOR, The Onion Router"},
        {88,   "Kerberos, Kerberos authentication system"},
        {92,   "NPP, Network Printing Protocol"},
        {109,  "POP2, Post Office Protocol"},
        {110,  "POP3, Post Office Protocol"},
        {111,  "ONC, RPC Open Network Computing Remote Procedure Call"},
        {118,  "SQL, Structured Query Language Services"},
        {119,  "NNTP, Network News Transfer Protocol"},
        {123,  "NTP, Network Time Protocol"},
        {135,  "RPC, Remote Procedure Call"},
        {137,  "NetBIOS, Name Service"},
        {139,  "NetBIOS, Session Service"},
        {143,  "IMAP, Internet Message Access Protocol"},
        {153,  "SGMP, Simple Gateway Monitoring Protocol"},
        {156,  "SQL, Structured Query Language Service"},
        {158,  "DMSP, Distributed Mail Service Protocol"},
        {170,  "Print server"},
        {194,  "IRC, Internet Relay Chat"},
        {213,  "IPX, Internetwork Packet Exchange"},
        {218,  "MPP, Message posting protocol"},
        {220,  "IMAP, Internet Message Access Protocol"},
        {259,  "ESRO, Efficient Short Remote Operations"},
        {264,  "BGMP, Border Gateway Multicast Protocol"},
        {318,  "TSP, Time Stamp Protocol"},
        {387,  "AURP, AppleTalk Update-based Routing Protocol"},
        {389,  "LDAP, Lightweight Directory Access Protocol"},
        {401,  "UPS, Uninterruptible Power Supply"},
        {427,  "SLP, Service Location Protocol"},
        {443,  "HTTP over SSL/TSL"},
        {444,  "SNPP, Simple Network Paging Protocol"},
        {445,  "SMB, Server Message Block"},
        {515,  "LPD, Line Printer Daemon"},
        {524,  "NCP"},
        {540,  "UUCP, Unix-to-Unix Copy Protocol"},
        {547,  "DHCPv6"},
        {548,  "AFP, Apple Filing Protocol"},
        {554,  "RTSP, Real Time Streaming Protocol"},
        {563,  "NNTP protocol over TLS/SSL"},
        {587,  "MSA, Message Aubmission Agent"},
        {625,  "ODProxy, Open Directory Proxy"},
        {631,  "IPP, Internet Printing Protocol"},
        {636,  "LDAP over SSL/TSL"},
        {639,  "MSDP, Multicast Source Discovery Protocol"},
        {646,  "LDP, Label Distribution Protocol"},
        {647,  "DHCP Failover Protocol"},
        {648,  "RRP, Registry Registrar Protocol"},
        {652,  "DTCP, Dynamic Tunnel Configuration Protocol"},
        {674,  "ACAP, Application Configuration Access Protocol"},
        {691,  "MS Exchange Routing"},
        {695,  "IEEE-MMS-SSL"},
        {698,  "OLSR, Optimized Link State Routing"},
        {699,  "Access Network"},
        {700,  "EPP, Extensible Provisioning Protocol"},
        {701,  "LMP, Link Management Protocol"},
        {702,  "IRIS over BEEP" },
        {706,  "SILC, Secure Internet Live Conferencing"},
        {711,  "TDP, Tag Distribution Protocol"},
        {712,  "TBRPF, Topology Broadcast based on Reverse-Path Forwarding"},
        {720,  "SMQP, Simple Message Queue Protocol"},
        {829,  "CMP, Certificate Management Protocol"},
        {853,  "DNS over SSL/TSL"},
        {901,  "SWAT, Samba Web Administration Tool"},
        {902,  "VMware Server"},
        {989,  "FTPS over SSL/TSL, File Transfer Protocol - data"},
        {990,  "FTPS over SSL/TSL, File Transfer Protocol - control"},
        {991,  "NAS, Netnews Admin System"},
        {992,  "Telnet over SSL/TSL"},
        {993,  "IMAP over SSL/TSL"},
        {995,  "POP3 over SSL/TSL"},
        {1433, "MS-SQL, Microsoft SQL server"},
        {3269, "LDAP over SSL"},
        {3389, "RDP, Remote Desktop Protocol"},
        {5500, "VNC, Virtual Network Computer"},
        {5656, "UniFi AP-EDU broadcasting"},
        {5657, "UniFi AP-EDU broadcasting"},
        {5658, "UniFi AP-EDU broadcasting"},
        {5659, "UniFi AP-EDU broadcasting"},
        {5800, "VNC, Virtual Network Computer"},
        {5801, "VNC, Virtual Network Computer"},
        {5900, "uVNC, Virtual Network Computer"},
        {5901, "uVNC, Virtual Network Computer"},
        {5902, "uVNC, Virtual Network Computer"},
        {5903, "uVNC, Virtual Network Computer"},
        {6666, "UniFi Camera Stream Listenner"},
        {6789, "UniFi Mobile Speed Test"},
        {6969, "BitTorrent tracker"},
        {7004, "UniFi UVC-Micro Talkback"},
        {7442, "UniFi Camera Management"},
        {7447, "UniFi RTSP, Real Time Streaming Protocol"},
        {7680, "WUDO, Windows Update Delivery Optimization"},
        {8080, "HTTP alternate, Hypertext Transfer Protocol"},
        {8291, "Mikrotik RouterOS Winbox"},
        {8443, "HTTP over SSL/TSL alternate"},
        {8728, "Mikrotik RouterOS API"},
        {8729, "Mikrotik RouterOS API over SSL/TSL"},
        {9100, "Print Server"},
        {10000,"NDMP, Network Data Management Protocol"},
        {10001,"UniFi Discovery Service"}
    };

    public static async void WsPortScan(HttpListenerContext ctx, string remoteIp) {
        WebSocketContext wsc;
        WebSocket ws;

        try {
            wsc = await ctx.AcceptWebSocketAsync(null);
            ws = wsc.WebSocket;
        } catch (WebSocketException ex) {
            ctx.Response.Close();
            Logging.Err(ex);
            return;
        }

        string sessionId = ctx.Request.Cookies["sessionid"]?.Value ?? null;

        if (sessionId is null) {
            ctx.Response.Close();
            return;
        }

        object send_lock = new object();

#if !DEBUG
        try {
#endif
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

                string host = message[0].Trim();
                if (host.Length == 0) {
                    await ws.SendAsync(Strings.INV, WebSocketMessageType.Text, true, CancellationToken.None);
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
                    PingReply reply = await p.SendPingAsync(host, 2500);
                    reachable = reply.Status == IPStatus.Success;
                } catch { }*/
                /*if (!reachable) {
                    string unreachable = "unreachable" + ((char)127).ToString() + host;
                    await ws.SendAsync(new ArraySegment<byte>(Encoding.UTF8.GetBytes(unreachable), 0, unreachable.Length), WebSocketMessageType.Text, true, CancellationToken.None);
                }*/

                new Thread(() => {
                    for (int i = rangeFrom; i < rangeTo; i += 256) {
                        if (ws.State != WebSocketState.Open) return;

                        string result = "";

                        int from = i;
                        int to = Math.Min(i + 255, rangeTo);

                        Task<bool[]> s = PortsScanAsync(host, from, to);
                        s.Wait();

                        for (int port = 0; port < s.Result.Length; port++)
                            if (s.Result[port])
                                result += (port + from) + ((char)127).ToString();

                        if (result.Length > 0) {
                            result = host + ((char)127).ToString() + result;
                            lock (send_lock) { //once send per socket
                                ws.SendAsync(new ArraySegment<byte>(Encoding.UTF8.GetBytes(result), 0, result.Length), WebSocketMessageType.Text, true, CancellationToken.None);
                            }
                        }
                    }

                    string over = "over" + ((char)127).ToString() + host;
                    ws.SendAsync(new ArraySegment<byte>(Encoding.UTF8.GetBytes(over), 0, over.Length), WebSocketMessageType.Text, true, CancellationToken.None);
                }).Start();

            }
#if !DEBUG
        } catch (WebSocketException ex) {
            Logging.Err(ex);

        } catch (Exception ex) {
            Logging.Err(ex);

        } /*finally {
            ctx.Response.Close();
        }*/
#endif
    }
    public static async Task<bool[]> PortsScanAsync(string host, int from, int to) {
        int[] q = Netstat(host);
        if (!(q is null)) {
            bool[] p = new bool[to - from];
            for (int i = 0; i < p.Length; i++)
                p[i] = q.Contains(i + from);
            return p;
        }

        List<Task<bool>> tasks = new List<Task<bool>>();
        for (int port = from; port < to; port++) tasks.Add(PortScanAsync(host, port));
        bool[] result = await Task.WhenAll(tasks);
        return result;
    }
    public static async Task<bool[]> PortsScanAsync(string host, short[] ports) {
        int[] q = Netstat(host);
        if (!(q is null)) {
            bool[] p = new bool[ports.Length];
            for (int i = 0; i < p.Length; i++)
                p[i] = q.Contains(ports[i]);
            return p;
        }

        List<Task<bool>> tasks = new List<Task<bool>>();
        for (int i = 0; i < ports.Length; i++) tasks.Add(PortScanAsync(host, ports[i]));
        bool[] result = await Task.WhenAll(tasks);
        return result;
    }

    public static async Task<bool> PortScanAsync(string host, int port) {
        try {
            TcpClient client = new TcpClient();
            await client.ConnectAsync(host, port);
            bool result = client.Connected;
            client.Close();
            client.Dispose();
            return result;

            /*TcpClient client = new TcpClient();
            IAsyncResult result = client.BeginConnect(host, port, null, null);
            bool success = result.AsyncWaitHandle.WaitOne(500);            
            client.EndConnect(result);
            return success;*/
        } catch {
            return false;
        }
    }

    public static bool SinglePortscan(string host, int port) {
        try {
            TcpClient client = new TcpClient();
            client.Connect(host, port);
            bool result = client.Connected;
            client.Close();
            client.Dispose();
            return result;
        } catch {
            return false;
        }
    }

    public static int[] Netstat(string host) {
        try {
            ProcessStartInfo info = new ProcessStartInfo {
                FileName = "psexec",
                Arguments = $"\\\\{host} netstat -nq -p TCP",
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            };

            using Process p = new Process {
                StartInfo = info
            };
            p.Start();

            Thread.Sleep(50);

            StreamReader output = p.StandardOutput;
            List<int> ports = new List<int>();

            string line;
            while ((line = output.ReadLine()) != null) {
                string[] split = line.Split(new char[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);

                if (split.Length < 4) continue;
                if (split[3] == "CLOSED" || split[3] == "CLOSE_WAIT" || split[3] == "BOUND") continue;
                //if (split[0] != "TCP") continue; //only tcp

                if (!int.TryParse(split[1].Split(':').Last(), out int port)) continue;
                if (port >= 49152) continue; //public ports

                if (!ports.Contains(port)) ports.Add(port);
            }

            if (ports.Count == 0) return null;
            ports.Sort();
            return ports.ToArray();
        } catch {
            return null;
        }
    }

}

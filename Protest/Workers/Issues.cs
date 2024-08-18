using System;
using System.Collections.Generic;
using System.Net;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Lextm.SharpSnmpLib;

using Protest.Http;
using Protest.Tools;
using static Protest.Tools.DebitNotes;

namespace Protest.Workers;

internal static class Issues {
    private const int WEAK_PASSWORD_ENTROPY_THRESHOLD = 28;

    public enum IssueLevel { info, warning, error, critical }

    public struct Issue {
        public IssueLevel level;
        public string message;
        public string source;
    }

    public static byte[] ToJsonBytes(this Issue issue) => JsonSerializer.SerializeToUtf8Bytes(new Dictionary<string, string> {
        { issue.level.ToString(), issue.message },
        { "source", issue.source },
    });

    public static TaskWrapper task;

    public static byte[] List() {
        //TODO:
        return null;
    }

    public static byte[] Start(string origin) {
        if (task is not null) return Data.CODE_OTHER_TASK_IN_PROGRESS.Array;

        Thread thread = new Thread(() => Scan());

        task = new TaskWrapper("Issues")
        {
            thread = thread,
            origin = origin,
            TotalSteps = 0,
            CompletedSteps = 0
        };

        task.thread.Start();

        return "{\"status\":\"running\"}"u8.ToArray(); ;
    }

    public static byte[] Stop(string origin) {
        if (task is null) return "{\"error\":\"Scanning task is not running\"}"u8.ToArray();
        task.RequestCancel(origin);
        return "{\"status\":\"stopped\"}"u8.ToArray();
    }

    public static byte[] Status() {
        if (task is null) {
            return "{\"status\":\"running\"}"u8.ToArray();
        }
        else {
            return "{\"status\":\"stopped\"}"u8.ToArray();
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

        try {
            while (ws.State == WebSocketState.Open) {
                if (!Auth.IsAuthenticatedAndAuthorized(ctx, "/ws/issues")) {
                    ctx.Response.Close();
                    return;
                }

                await WsWriteText(ws, "{\"test\":\"test\"}"u8.ToArray());
                await Task.Delay(10_000);
            }
        }
        catch {
        }

        if (ws?.State == WebSocketState.Open) {
            try {
                await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, String.Empty, CancellationToken.None);
            }
            catch { }
        }
    }

    private static void Scan() {
        ScanUsers();
        ScanDevices();
    }

    private static void ScanUsers() {
        foreach (KeyValuePair<string, Database.Entry> user in DatabaseInstances.users.dictionary) {
            user.Value.attributes.TryGetValue("type", out Database.Attribute typeAttribute);

        }
    }

    private static void ScanDevices() {
        foreach (KeyValuePair<string, Database.Entry> device in DatabaseInstances.devices.dictionary) {
            device.Value.attributes.TryGetValue("type", out Database.Attribute typeAttribute);
            device.Value.attributes.TryGetValue("ip", out Database.Attribute ipAttribute);

            if (Data.PRINTER_TYPES.Contains(typeAttribute.value)) {

            }
            else if (Data.SWITCH_TYPES.Contains(typeAttribute.value)) {

            }
        }
    }

    public static bool CheckPasswordStrength(Database.Entry entry, out Issue? issue) {
        if (entry.attributes.TryGetValue("password", out Database.Attribute password)) {
            string value = password.value;
            if (value.Length > 0 && PasswordStrength.Entropy(value) < WEAK_PASSWORD_ENTROPY_THRESHOLD) {
                issue = new Issues.Issue {
                    level = Issues.IssueLevel.critical,
                    message = "Weak password",
                    source = "Internal check"
                };
                return true;
            }
        }

        issue = null;
        return false;
    }

    public static bool CheckDiskCapacity(double percent, string diskCaption, out Issue? issue) {
        if (percent <= 1) {
            issue = new Issues.Issue {
                level = IssueLevel.critical,
                message = $"{percent}% free space on disk {Data.EscapeJsonText(diskCaption)}",
                source = "WMI"
            };
            return true;
        }
        
        if (percent <= 5) {
            issue = new Issues.Issue {
                level = IssueLevel.error,
                message = $"{percent}% free space on disk {Data.EscapeJsonText(diskCaption)}",
                source = "WMI"
            };
            return true;
        }
        
        if (percent < 15) {
            issue = new Issues.Issue {
                level = IssueLevel.warning,
                message = $"{percent}% free space on disk {Data.EscapeJsonText(diskCaption)}",
                source = "WMI"
            };
            return true;
        }

        issue = null;
        return false;
    }

    public static bool CheckPrinterComponent(IPAddress ipAddress, SnmpProfiles.Profile profile, out Issue[] issues) {
        Dictionary<string, string> componentName    = Protocols.Snmp.Polling.ParseResponse(Protocols.Snmp.Polling.SnmpQuery(ipAddress, profile, new string[] { Protocols.Snmp.Oid.PRINTER_TONERS }, Protocols.Snmp.Polling.SnmpOperation.Walk));
        Dictionary<string, string> componentMax     = Protocols.Snmp.Polling.ParseResponse(Protocols.Snmp.Polling.SnmpQuery(ipAddress, profile, new string[] { Protocols.Snmp.Oid.PRINTER_TONERS_MAX }, Protocols.Snmp.Polling.SnmpOperation.Walk));
        Dictionary<string, string> componentCurrent = Protocols.Snmp.Polling.ParseResponse(Protocols.Snmp.Polling.SnmpQuery(ipAddress, profile, new string[] { Protocols.Snmp.Oid.PRINTER_TONER_CURRENT }, Protocols.Snmp.Polling.SnmpOperation.Walk));

        if (componentName is not null && componentCurrent is not null && componentMax is not null &&
            componentName.Count == componentCurrent.Count && componentCurrent.Count == componentMax.Count) {

            string[][] componentNameArray    = componentName.Select(pair=> new string[] { pair.Key, pair.Value }).ToArray();
            string[][] componentMaxArray     = componentMax.Select(pair=> new string[] { pair.Key, pair.Value }).ToArray();
            string[][] componentCurrentArray = componentCurrent.Select(pair=> new string[] { pair.Key, pair.Value }).ToArray();

            Array.Sort(componentNameArray, (x, y) => string.Compare(x[0], y[0]));
            Array.Sort(componentMaxArray, (x, y) => string.Compare(x[0], y[0]));
            Array.Sort(componentCurrentArray, (x, y) => string.Compare(x[0], y[0]));

            List<Issue> arrays = new List<Issue>();

            for (int i = 0; i < componentNameArray.Length; i++) {
                if (!int.TryParse(componentMaxArray[i][1], out int max)) { continue; }
                if (!int.TryParse(componentCurrentArray[i][1], out int current)) { continue; }

                if (current == -2 || max == -2) { continue; } //undefined
                if (current == -3) { current = max; } //full

                componentNameArray[i][1] = componentNameArray[i][1].TrimStart(' ', '!', '\"', '#', '$', '%', '&', '\'', '(', ')', '*', '+', ',', '-', '.', '/', ':', ';', '<', '=', '>', '?', '@', '[', '\\', ']', '^', '_', '{', '|', '}', '~');

                int used = 100 * current / max;
                if (used < 5) {
                    arrays.Add(new Issues.Issue {
                        level = IssueLevel.error,
                        message = $"{used}% {componentNameArray[i][1]}",
                        source = "SNMP"
                    });
                }
                else if (used < 15) {
                    arrays.Add(new Issues.Issue {
                        level = IssueLevel.warning,
                        message = $"{used}% {componentNameArray[i][1]}",
                        source = "SNMP"
                    });
                }
            }

            if (arrays.Count > 0) {
                issues = arrays.ToArray();
                return true;
            }
        }

        issues = null;
        return false;
    }
}

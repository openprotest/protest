using SnmpSharpNet;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Text;

namespace Protest.Protocols.Snmp;

internal static class Polling {
    public const string OID_SYSTEM_DESCRIPTOR = "1.3.6.1.2.1.1.1.0";
    public const string OID_SYSTEM_OBJECT_ID  = "1.3.6.1.2.1.1.2.0";
    public const string OID_SYSTEM_UPTIME     = "1.3.6.1.2.1.1.3.0";
    public const string OID_SYSTEM_CONTACT    = "1.3.6.1.2.1.1.4.0";
    public const string OID_SYSTEM_NAME       = "1.3.6.1.2.1.1.5.0";
    public const string OID_SYSTEM_LOCATION   = "1.3.6.1.2.1.1.6.0";
    public const string OID_SYSTEM_SERVICES   = "1.3.6.1.2.1.1.7.0";

    public const string OID_INTERFACE_TOTAL       = "1.3.6.1.2.1.2.1.0";
    public const string OID_INTERFACE_DESCRIPTOR  = "1.3.6.1.2.1.2.2.1.2.i";
    public const string OID_INTERFACE_SPEED       = "1.3.6.1.2.1.2.2.1.5.i";
    public const string OID_INTERFACE_STATUS      = "1.3.6.1.2.1.2.2.1.8.i";
    public const string OID_INTERFACE_ERROR_IN    = "1.3.6.1.2.1.2.2.1.14.i";
    public const string OID_INTERFACE_TRAFFIC_IN  = "1.3.6.1.2.1.2.2.1.10.i";
    public const string OID_INTERFACE_TRAFFIC_OUT = "1.3.6.1.2.1.2.2.1.16.i";
    public const string OID_INTERFACE_ERROR_OUT   = "1.3.6.1.2.1.2.2.1.20.i";

    public const string OID_INTERFACE_TRAFFIC_IN_64  = "1.3.6.1.2.1.31.1.1.1.6.i";
    public const string OID_INTERFACE_TRAFFIC_OUT_64 = "1.3.6.1.2.1.31.1.1.1.10.i";

    public const string OID_INTERFACE_MAC = "1.3.6.1.2.1.2.2.1.6.i";
    public const string OID_INTERFACE_IP  = "1.3.6.1.2.1.4.20.1.1.i";
    public const string OID_ROUTING_TABLE = "1.3.6.1.2.1.4.21";
    public const string OID_ARP_TABLE     = "1.3.6.1.2.1.4.22.1";

    public const string OID_TCP_CONNECTIONS = "1.3.6.1.2.1.6.9.0";
    public const string OID_UDP_RECEIVED    = "1.3.6.1.2.1.7.1.0";
    public const string OID_UDP_SENT        = "1.3.6.1.2.1.7.4.0";

    public const string OID_SYSTEM_TEMPERATURE      = "1.3.6.1.2.1.25.1.8.0";
    public const string OID_DISK_TOTAL              = "1.3.6.1.2.1.25.2.3.1.5";
    public const string OID_DISK_USED               = "1.3.6.1.2.1.25.2.3.1.6";
    public const string OID_DISK_FREE               = "1.3.6.1.2.1.25.2.3.1.7";
    public const string OID_SYSTEM_RUNNING_SERVICES = "1.3.6.1.2.1.25.4.2.1.2";
    public const string OID_MEMORY_TOTAL            = "1.3.6.1.4.1.2021.4.5.0";
    public const string OID_MEMORY_FREE             = "1.3.6.1.4.1.2021.4.11.0";
    public const string OID_PROCESSOR_LOAD          = "1.3.6.1.4.1.2021.10.1.3.1";

    public const string OID_SECURITY_MODEL          = "1.3.6.1.6.3.10.2.1.1.0";
    public const string OID_AUTHENTICATION_PROTOCOL = "1.3.6.1.6.3.10.1.1.1.0";
    public const string OID_PRIVACY_PROTOCOL        = "1.3.6.1.6.3.10.1.2.1.0";

    public static byte[] GetHandler(HttpListenerContext ctx, Dictionary<string, string> parameters) {
        if (parameters is null) { return Data.CODE_INVALID_ARGUMENT.Array; }

        parameters.TryGetValue("target",      out string target);
        parameters.TryGetValue("community",   out string community);
        parameters.TryGetValue("credentials", out string credentialsString);
        parameters.TryGetValue("version",     out string versionString);
        parameters.TryGetValue("timeout",     out string timeoutString);

        SnmpVersion version = versionString switch {
            "1" => SnmpVersion.Ver1,
            "3" => SnmpVersion.Ver3,
            _ => SnmpVersion.Ver2,
        };

        if (String.IsNullOrEmpty(community)) { community = "public"; }

        int timeout = 5000;
        Int32.TryParse(timeoutString, out timeout);

        using StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding);
        string payload = reader.ReadToEnd().Trim();

        string[] oidArray = payload.Split(new char[] { ' ', ',', ';', '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries);
        if (oidArray.Length == 0) return "{\"error\":\"Invalid request\"}"u8.ToArray();

        try {
            SimpleSnmp snmp = new SimpleSnmp(target, 161, community, timeout, 1);
            if (!snmp.Valid) return "{\"error\":\"Invalid request\"}"u8.ToArray();

            Dictionary<Oid, AsnType> result = snmp.Get(version, oidArray);

            return ParseResponse(result);
        }
        catch (OperationCanceledException) {
            return "{\"error\":\"Operation timed out\"}"u8.ToArray();
        }
        catch (Exception ex) {
            return Encoding.UTF8.GetBytes($"{{\"error\":\"{ex.Message}\"}}");
        }
    }

    public static byte[] SetHandler(HttpListenerContext ctx, Dictionary<string, string> parameters) {
        if (parameters is null) { return Data.CODE_INVALID_ARGUMENT.Array; }

        parameters.TryGetValue("target",      out string target);
        parameters.TryGetValue("community",   out string community);
        parameters.TryGetValue("credentials", out string credentialsString);
        parameters.TryGetValue("version",     out string versionString);
        parameters.TryGetValue("timeout",     out string timeoutString);
        parameters.TryGetValue("value",       out string valueString);
        
        if (valueString is null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        OctetString data = new OctetString(valueString);

        SnmpVersion version = versionString switch {
            "1" => SnmpVersion.Ver1,
            "3" => SnmpVersion.Ver3,
            _ => SnmpVersion.Ver2,
        };

        if (String.IsNullOrEmpty(community)) { community = "public"; }

        int timeout = 5000;
        Int32.TryParse(timeoutString, out timeout);

        using StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding);
        string payload = reader.ReadToEnd().Trim();

        string[] oidArray = payload.Split(new char[] { ' ', ',', ';', '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries);
        if (oidArray.Length == 0) return "{\"error\":\"Invalid request\"}"u8.ToArray();

        VbCollection oidCollection = new VbCollection();
        for (int i = 0; i < oidArray.Length; i++) {
            Vb oid = new Vb(new Oid(oidArray[i]), new OctetString(valueString));
            oidCollection.Add(oid);
        }

        try {
            SimpleSnmp snmp = new SimpleSnmp(target, 161, community, timeout, 1);
            if (!snmp.Valid) return "{\"error\":\"Invalid request\"}"u8.ToArray();

            Dictionary<Oid, AsnType> result = snmp.Set(version, oidCollection.ToArray());

            return ParseResponse(result);
        }
        catch (OperationCanceledException) {
            return "{\"error\":\"Operation timed out\"}"u8.ToArray();
        }
        catch (Exception ex) {
            return Encoding.UTF8.GetBytes($"{{\"error\":\"{ex.Message}\"}}");
        }
    }

    public static byte[] WalkHandler(HttpListenerContext ctx, Dictionary<string, string> parameters) {
        if (parameters is null) { return Data.CODE_INVALID_ARGUMENT.Array; }

        parameters.TryGetValue("target", out string target);
        parameters.TryGetValue("community", out string community);
        parameters.TryGetValue("credentials", out string credentialsString);
        parameters.TryGetValue("version", out string versionString);
        parameters.TryGetValue("timeout", out string timeoutString);

        SnmpVersion version = versionString switch {
            "1" => SnmpVersion.Ver1,
            "3" => SnmpVersion.Ver3,
            _ => SnmpVersion.Ver2,
        };

        if (String.IsNullOrEmpty(community)) { community = "public"; }

        int timeout = 5000;
        Int32.TryParse(timeoutString, out timeout);

        using StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding);
        string payload = reader.ReadToEnd().Trim();

        string[] oidArray = payload.Split(new char[] { ' ', ',', ';', '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries);
        if (oidArray.Length == 0) return "{\"error\":\"Invalid request\"}"u8.ToArray();

        try {
            SimpleSnmp snmp = new SimpleSnmp(target, 161, community, timeout, 1);
            if (!snmp.Valid) return "{\"error\":\"Invalid request\"}"u8.ToArray();

            Dictionary<Oid, AsnType> result = snmp.Walk(version, oidArray[0]);

            return ParseResponse(result);
        }
        catch (OperationCanceledException) {
            return "{\"error\":\"Operation timed out\"}"u8.ToArray();
        }
        catch (Exception ex) {
            return Encoding.UTF8.GetBytes($"{{\"error\":\"{ex.Message}\"}}");
        }
    }

    private static byte[] ParseResponse(Dictionary<Oid, AsnType> result) {
        if (result is null || result.Count == 0) { return "[]"u8.ToArray(); }

        StringBuilder builder = new StringBuilder();
        builder.Append('[');

        bool first = true;
        foreach (KeyValuePair<Oid, AsnType> pair in result) {
            string type = pair.Value.Type switch {
                (byte)0x00 => "primitive",
                (byte)0x01 => "boolean",
                (byte)0x02 => "integer",
                (byte)0x03 => "bit-string",
                (byte)0x04 => "octet-string",
                (byte)0x05 => "null",
                (byte)0x06 => "object",
                (byte)0x10 => "sequence",
                (byte)0x11 => "set",
                (byte)0x1F => "extension id",
                (byte)0x20 => "constructor",
                (byte)0x40 => "application",
                (byte)0x80 => "context",
                _ => "unknown"
            };

            if (!first) { builder.Append(','); }
            builder.Append('[');
            builder.Append($"\"{Data.EscapeJsonText(pair.Key.ToString())}\",");
            builder.Append($"\"{type}\",");
            builder.Append($"\"{Data.EscapeJsonText(pair.Value.ToString())}\"");
            builder.Append(']');
            first = false;
        }

        builder.Append(']');
        return Encoding.UTF8.GetBytes(builder.ToString());
    }
}
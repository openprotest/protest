using Lextm.SharpSnmpLib;
using Lextm.SharpSnmpLib.Messaging;
using Lextm.SharpSnmpLib.Security;

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
        parameters.TryGetValue("community",   out string communityString);
        parameters.TryGetValue("credentials", out string credentialsString);
        parameters.TryGetValue("version",     out string versionString);
        parameters.TryGetValue("timeout",     out string timeoutString);

        if (!IPAddress.TryParse(target, out IPAddress targetIp)) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }
        IPEndPoint endPoint = new IPEndPoint(targetIp, 161);

        if (String.IsNullOrEmpty(communityString)) { communityString = "public"; }

        VersionCode version = versionString switch {
            "1" => VersionCode.V1,
            "3" => VersionCode.V3,
            _   => VersionCode.V2
        };

        int timeout = 5000;
        Int32.TryParse(timeoutString, out timeout);

        using StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding);
        string payload = reader.ReadToEnd().Trim();

        OctetString community = new OctetString(communityString);

        IList<Variable> oidList = payload
            .Split(new char[] { ' ', ',', ';', '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries)
            .Select(o=> new Variable(new ObjectIdentifier(o.Trim())))
            .ToList();

        if (oidList.Count == 0) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        try {
            IList<Variable> result = Messenger.Get(version, endPoint, community, oidList, timeout);
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
        parameters.TryGetValue("community",   out string communityString);
        parameters.TryGetValue("credentials", out string credentialsString);
        parameters.TryGetValue("version",     out string versionString);
        parameters.TryGetValue("timeout",     out string timeoutString);
        parameters.TryGetValue("value",       out string valueString);
        
        if (valueString is null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        if (!IPAddress.TryParse(target, out IPAddress targetIp)) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }
        IPEndPoint endPoint = new IPEndPoint(targetIp, 161);

        if (String.IsNullOrEmpty(communityString)) { communityString = "public"; }

        VersionCode version = versionString switch {
            "1" => VersionCode.V1,
            "3" => VersionCode.V3,
            _   => VersionCode.V2
        };

        int timeout = 5000;
        Int32.TryParse(timeoutString, out timeout);

        using StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding);
        string payload = reader.ReadToEnd().Trim();

        OctetString data = new OctetString(valueString);
        OctetString community = new OctetString(communityString);

        IList<Variable> oidList = payload
            .Split(new char[] { ' ', ',', ';', '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries)
            .Select(o=> new Variable(new ObjectIdentifier(o.Trim()), data))
            .ToList();

        if (oidList.Count == 0) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        try {
            IList<Variable> result = Messenger.Set(version, endPoint, community, oidList, timeout);
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
        parameters.TryGetValue("community", out string communityString);
        parameters.TryGetValue("credentials", out string credentialsString);
        parameters.TryGetValue("version", out string versionString);
        parameters.TryGetValue("timeout", out string timeoutString);

        if (!IPAddress.TryParse(target, out IPAddress targetIp)) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }
        IPEndPoint endpoint = new IPEndPoint(targetIp, 161);

        if (String.IsNullOrEmpty(communityString)) { communityString = "public"; }

        VersionCode version = versionString switch {
            "1" => VersionCode.V1,
            "3" => VersionCode.V3,
            _   => VersionCode.V2
        };

        int timeout = 5000;
        Int32.TryParse(timeoutString, out timeout);

        using StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding);
        string payload = reader.ReadToEnd().Trim();

        string[] oidArray = payload.Split(new char[] { ' ', ',', ';', '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries);

        if (oidArray.Length == 0) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        OctetString community = new OctetString(communityString);
        ObjectIdentifier oid = new ObjectIdentifier(oidArray[0]);

        List<Variable> result = new List<Variable>();

        try {
            //TODO:
            int count = Messenger.Walk(version, endpoint, community, oid, result, timeout, WalkMode.WithinSubtree);
            return ParseResponse(result);
        }
        catch (OperationCanceledException) {
            return "{\"error\":\"Operation timed out\"}"u8.ToArray();
        }
        catch (Exception ex) {
            return Encoding.UTF8.GetBytes($"{{\"error\":\"{ex.Message}\"}}");
        }
    }

    private static byte[] ParseResponse(IList<Variable> result) {
        if (result is null || result.Count == 0) { return "[]"u8.ToArray(); }

        StringBuilder builder = new StringBuilder();
        builder.Append('[');

        for (int i = 0; i < result.Count; i++) {
            if (i>0) { builder.Append(','); }
            builder.Append('[');
            builder.Append($"\"{Data.EscapeJsonText(result[i].Id.ToString())}\",");
            builder.Append($"\"{Data.EscapeJsonText(result[i].Data.ToString())}\"");
            builder.Append(']');
        }

        builder.Append(']');
        return Encoding.UTF8.GetBytes(builder.ToString());
    }
}
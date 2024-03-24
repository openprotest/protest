using Lextm.SharpSnmpLib;
using Lextm.SharpSnmpLib.Messaging;
using Lextm.SharpSnmpLib.Security;
using Renci.SshNet.Messages;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.WebSockets;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace Protest.Protocols.Snmp;

//https://help.sharpsnmp.com/html/G_Lextm_SharpSnmpLib.htm
//TODO: https://docs.lextudio.com/sharpsnmplib/tutorials/v3-operations
//TODO: https://docs.lextudio.com/sharpsnmplib/tutorials/device-discovery

internal static class Polling {
    public const string SYSTEM_DESCRIPTOR = "1.3.6.1.2.1.1.1.0";
    public const string SYSTEM_OBJECT_ID  = "1.3.6.1.2.1.1.2.0";
    public const string SYSTEM_UPTIME     = "1.3.6.1.2.1.1.3.0";
    public const string SYSTEM_CONTACT    = "1.3.6.1.2.1.1.4.0";
    public const string SYSTEM_NAME       = "1.3.6.1.2.1.1.5.0";
    public const string SYSTEM_LOCATION   = "1.3.6.1.2.1.1.6.0";
    public const string SYSTEM_SERVICES   = "1.3.6.1.2.1.1.7.0";

    public const string INTERFACE_TOTAL       = "1.3.6.1.2.1.2.1.0";
    public const string INTERFACE_DESCRIPTOR  = "1.3.6.1.2.1.2.2.1.2.i";
    public const string INTERFACE_SPEED       = "1.3.6.1.2.1.2.2.1.5.i";
    public const string INTERFACE_STATUS      = "1.3.6.1.2.1.2.2.1.8.i";
    public const string INTERFACE_ERROR_IN    = "1.3.6.1.2.1.2.2.1.14.i";
    public const string INTERFACE_TRAFFIC_IN  = "1.3.6.1.2.1.2.2.1.10.i";
    public const string INTERFACE_TRAFFIC_OUT = "1.3.6.1.2.1.2.2.1.16.i";
    public const string INTERFACE_ERROR_OUT   = "1.3.6.1.2.1.2.2.1.20.i";

    public const string INTERFACE_TRAFFIC_IN_64  = "1.3.6.1.2.1.31.1.1.1.6.i";
    public const string INTERFACE_TRAFFIC_OUT_64 = "1.3.6.1.2.1.31.1.1.1.10.i";

    public const string INTERFACE_MAC = "1.3.6.1.2.1.2.2.1.6.i";
    public const string INTERFACE_IP  = "1.3.6.1.2.1.4.20.1.1.i";
    public const string ROUTING_TABLE = "1.3.6.1.2.1.4.21";
    public const string ARP_TABLE     = "1.3.6.1.2.1.4.22.1";

    public const string TCP_CONNECTIONS = "1.3.6.1.2.1.6.9.0";
    public const string UDP_RECEIVED    = "1.3.6.1.2.1.7.1.0";
    public const string UDP_SENT        = "1.3.6.1.2.1.7.4.0";

    public const string SYSTEM_TEMPERATURE      = "1.3.6.1.2.1.25.1.8.0";
    public const string DISK_TOTAL              = "1.3.6.1.2.1.25.2.3.1.5";
    public const string DISK_USED               = "1.3.6.1.2.1.25.2.3.1.6";
    public const string DISK_FREE               = "1.3.6.1.2.1.25.2.3.1.7";
    public const string SYSTEM_RUNNING_SERVICES = "1.3.6.1.2.1.25.4.2.1.2";
    public const string MEMORY_TOTAL            = "1.3.6.1.4.1.2021.4.5.0";
    public const string MEMORY_FREE             = "1.3.6.1.4.1.2021.4.11.0";
    public const string PROCESSOR_LOAD          = "1.3.6.1.4.1.2021.10.1.3.1";

    public static void GetV3Test() {
        int timeout = 5000;
        string username = "protest";
        string authenticationPassphrase = "authenticationPassphrase";
        string privacyPassphrase = "privacyPassphrase";
        IPEndPoint endPoint = new IPEndPoint(IPAddress.Parse("127.0.0.1"), 161);

        List<Variable> oids = new List<Variable>() {
            new Variable(new ObjectIdentifier(SYSTEM_NAME))
        };

        IAuthenticationProvider authenticationProvider;
        IPrivacyProvider privacyProvider;

#pragma warning disable CS0618
        //authenticationProvider = new MD5AuthenticationProvider(new OctetString(authenticationPassphrase));
        authenticationProvider = new SHA1AuthenticationProvider(new OctetString(authenticationPassphrase));
        privacyProvider = new DESPrivacyProvider(new OctetString(privacyPassphrase), authenticationProvider);
#pragma warning restore CS0618

        //authenticationProvider = new SHA256AuthenticationProvider(new OctetString(authenticationPassphrase));
        //privacyProvider = new AES256PrivacyProvider(new OctetString(privacyPassphrase), authenticationProvider);

        Discovery discovery = Messenger.GetNextDiscovery(SnmpType.GetRequestPdu);
        ReportMessage report = discovery.GetResponse(timeout, endPoint);

        SetRequestMessage request = new SetRequestMessage(
                    VersionCode.V3,
                    Messenger.NextMessageId,
                    Messenger.NextRequestId,
                    new OctetString(username),
                    new OctetString("dev"),
                    oids,
                    privacyProvider,
                    Messenger.MaxMessageSize,
                    report
                );

        ISnmpMessage reply = request.GetResponse(timeout, endPoint);

        for (int i = 0; i < reply.Pdu().Variables.Count; i++) {
            Console.WriteLine(reply.Pdu().Variables[i]);
            Console.WriteLine($"{reply.Pdu().Variables[i].Id.ToString()}:\t{reply.Pdu().Variables[i].Data}");
        }

        if (reply.Pdu().ErrorStatus.ToInt32() != 0) { //NoError
            throw ErrorException.Create(
                "error in response",
                endPoint.Address,
                reply);
        }

    }

    public static byte[] GetHandler(HttpListenerContext ctx, Dictionary<string, string> parameters) {
        if (parameters is null) { return Data.CODE_INVALID_ARGUMENT.Array; }

        parameters.TryGetValue("target",      out string target);
        parameters.TryGetValue("community",   out string community);
        parameters.TryGetValue("credentials", out string credentialsString);
        parameters.TryGetValue("version",     out string versionString);
        parameters.TryGetValue("timeout",     out string timeoutString);

        if (!IPAddress.TryParse(target, out IPAddress targetIp)) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        IPEndPoint endPoint = new IPEndPoint(targetIp, 161);

        VersionCode version = versionString switch {
            "1" => VersionCode.V1,
            "3" => VersionCode.V3,
            _ => VersionCode.V2,
        };

        if (String.IsNullOrEmpty(community)) { community = "public"; }

        int timeout = 5000;
        Int32.TryParse(timeoutString, out timeout);

        using StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding);
        string payload = reader.ReadToEnd().Trim();

        IList<Variable> oids = payload
            .Split(new char[] { ' ', ',', ';', '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries)
            .Select(o=> new Variable(new ObjectIdentifier(o.Trim())))
            .ToList();

        try {

            StringBuilder builder = new StringBuilder();
            builder.Append('[');

            IList<Variable> result = Messenger.Get(
                version,
                endPoint,
                new OctetString(community),
                oids,
                timeout
            );

            if (result is null || result.Count == 0) { return "[]"u8.ToArray(); }

            for (int i = 0; i < result.Count; i++) {
                if (i > 0) { builder.Append(','); }
                builder.Append('[');
                builder.Append($"\"{Data.EscapeJsonText(result[i].Id.ToString())}\",");
                builder.Append($"\"{Data.EscapeJsonText(result[i].Data.ToString())}\"");
                builder.Append(']');
            }

            builder.Append(']');
            return Encoding.UTF8.GetBytes(builder.ToString());
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

        parameters.TryGetValue("target", out string target);
        parameters.TryGetValue("community", out string community);
        parameters.TryGetValue("credentials", out string credentialsString);
        parameters.TryGetValue("version", out string versionString);
        parameters.TryGetValue("timeout", out string timeoutString);
        parameters.TryGetValue("value", out string valueString);

        if (!IPAddress.TryParse(target, out IPAddress targetIp)) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        VersionCode version = versionString switch {
            "1" => VersionCode.V1,
            "3" => VersionCode.V3,
            _ => VersionCode.V2,
        };

        if (valueString is null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        if (String.IsNullOrEmpty(community)) { community = "public"; }

        int timeout = 5000;
        Int32.TryParse(timeoutString, out timeout);

        OctetString data = new OctetString(valueString);

        using StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding);
        string payload = reader.ReadToEnd().Trim();

        IList<Variable> oids = payload
            .Split(new char[] { ' ', ',', ';', '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries)
            .Select(o=> new Variable(new ObjectIdentifier(o.Trim()), data))
            .ToList();

        try {
            StringBuilder builder = new StringBuilder();
            builder.Append('[');

            IList<Variable> result = Messenger.Set(
                version,
                new IPEndPoint(targetIp, 161),
                new OctetString(community),
                oids,
                timeout
            );

            if (result is null || result.Count == 0) { return "[]"u8.ToArray(); }

            for (int i = 0; i < result.Count; i++) {
                if (i > 0) { builder.Append(','); }
                builder.Append('[');
                builder.Append($"\"{Data.EscapeJsonText(result[i].Id.ToString())}\",");
                builder.Append($"\"{Data.EscapeJsonText(result[i].Data.ToString())}\"");
                builder.Append(']');
            }

            builder.Append(']');
            return Encoding.UTF8.GetBytes(builder.ToString());
        }
        catch (OperationCanceledException) {
            return "{\"error\":\"Operation timed out\"}"u8.ToArray();
        }
        catch (Exception ex) {
            return Encoding.UTF8.GetBytes($"{{\"error\":\"{ex.Message}\"}}");
        }
    }
}
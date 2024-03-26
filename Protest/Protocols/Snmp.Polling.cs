using Lextm.SharpSnmpLib;
using Lextm.SharpSnmpLib.Messaging;
using Lextm.SharpSnmpLib.Security;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Text;

namespace Protest.Protocols.Snmp;

internal static class Polling {

    public static byte[] GetHandler(HttpListenerContext ctx, Dictionary<string, string> parameters) {
        if (parameters is null) { return Data.CODE_INVALID_ARGUMENT.Array; }
        parameters.TryGetValue("target",      out string target);
        parameters.TryGetValue("community",   out string communityString);
        parameters.TryGetValue("cred",        out string credentialsString);
        parameters.TryGetValue("ver",         out string versionString);
        parameters.TryGetValue("timeout",     out string timeoutString);

        //TODO: handle hostname

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

        if (Int32.TryParse(timeoutString, out int timeout) || timeout == 0) {
            timeout = 5000;
        }

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
            if (version == VersionCode.V3) {
                OctetString username = new OctetString(String.Empty);
                OctetString context = new OctetString(String.Empty);
                string authenticationPassphrase = "authPassphrase";
                string privacyPassphrase = "privacyPassphrase";

                IAuthenticationProvider authenticationProvider;
                //authenticationProvider = new SHA1AuthenticationProvider(new OctetString(authenticationPassphrase));
                authenticationProvider = new SHA256AuthenticationProvider(new OctetString(authenticationPassphrase));

                IPrivacyProvider privacyProvider;
                //privacyProvider = new DESPrivacyProvider(new OctetString(privacyPassphrase), authenticationProvider);
                privacyProvider = new AES256PrivacyProvider(new OctetString(privacyPassphrase), authenticationProvider);

                Discovery discovery = Messenger.GetNextDiscovery(SnmpType.GetRequestPdu);
                ReportMessage report = discovery.GetResponse(timeout, endpoint);

                ISnmpMessage request = new GetRequestMessage(version, Messenger.NextMessageId, Messenger.NextRequestId, username, context, oidList, privacyProvider, Messenger.MaxMessageSize, report);
                return ParseResponse(request.Variables());
            }
            else {
                IList<Variable> result = Messenger.Get(version, endpoint, community, oidList, timeout);
                return ParseResponse(result);
            }
        }
        catch (Exception ex) {
            return Encoding.UTF8.GetBytes($"{{\"error\":\"{ex.Message}\"}}");
        }
    }

    public static byte[] SetHandler(HttpListenerContext ctx, Dictionary<string, string> parameters) {
        if (parameters is null) { return Data.CODE_INVALID_ARGUMENT.Array; }
        parameters.TryGetValue("target",      out string target);
        parameters.TryGetValue("community",   out string communityString);
        parameters.TryGetValue("cred",        out string credentialsString);
        parameters.TryGetValue("ver",         out string versionString);
        parameters.TryGetValue("timeout",     out string timeoutString);
        parameters.TryGetValue("value",       out string valueString);
        
        if (valueString is null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

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

        if (Int32.TryParse(timeoutString, out int timeout) || timeout == 0) {
            timeout = 5000;
        }

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
            if (version == VersionCode.V3) {
                //TODO:
                return null;
            }
            else {
                IList<Variable> result = Messenger.Set(version, endpoint, community, oidList, timeout);
                return ParseResponse(result);
            }

        }
        catch (Exception ex) {
            return Encoding.UTF8.GetBytes($"{{\"error\":\"{ex.Message}\"}}");
        }
    }

    public static byte[] WalkHandler(HttpListenerContext ctx, Dictionary<string, string> parameters) {
        if (parameters is null) { return Data.CODE_INVALID_ARGUMENT.Array; }
        parameters.TryGetValue("target",    out string target);
        parameters.TryGetValue("community", out string communityString);
        parameters.TryGetValue("cred",      out string credentialsString);
        parameters.TryGetValue("ver",       out string versionString);
        parameters.TryGetValue("timeout",   out string timeoutString);

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

        if (Int32.TryParse(timeoutString, out int timeout) || timeout == 0) {
            timeout = 5000;
        }

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
            if (version == VersionCode.V3) {
                //TODO:
                return null;
            }
            else {
                //TODO:
                int count = Messenger.Walk(version, endpoint, community, oid, result, timeout, WalkMode.WithinSubtree);
                return ParseResponse(result);
            }
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
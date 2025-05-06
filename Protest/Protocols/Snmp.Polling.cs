using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Text;
using Lextm.SharpSnmpLib;
using Lextm.SharpSnmpLib.Messaging;
using Lextm.SharpSnmpLib.Security;
using Protest.Tools;

namespace Protest.Protocols.Snmp;

internal static partial class Polling {

    public enum SnmpOperation : byte {
        Get, Set, Walk
    }

    public static byte[] GetHandler(HttpListenerContext ctx, Dictionary<string, string> parameters)
        => SnmpHandler(ctx, parameters, SnmpOperation.Get);

    public static byte[] SetHandler(HttpListenerContext ctx, Dictionary<string, string> parameters)
        => SnmpHandler(ctx, parameters, SnmpOperation.Set);

    public static byte[] WalkHandler(HttpListenerContext ctx, Dictionary<string, string> parameters)
        => SnmpHandler(ctx, parameters, SnmpOperation.Walk);

    private static byte[] SnmpHandler(HttpListenerContext ctx, Dictionary<string, string> parameters, SnmpOperation operation) {
        if (parameters is null) { return Data.CODE_INVALID_ARGUMENT.Array; }

        parameters.TryGetValue("target",    out string target);
        parameters.TryGetValue("ver",       out string versionString);
        parameters.TryGetValue("community", out string communityString);
        parameters.TryGetValue("timeout",   out string timeoutString);

        IPAddress targetIp;

        if (!IPAddress.TryParse(target, out targetIp)) {
            try {
                targetIp = System.Net.Dns.GetHostEntry(target).AddressList[0];
            }
            catch {
                return "{\"error\":\"No such host is known\"}"u8.ToArray();
            }
        }

        VersionCode version = versionString switch {
            "1" => VersionCode.V1,
            "3" => VersionCode.V3,
            _   => VersionCode.V2
        };

        if (String.IsNullOrEmpty(communityString)) { communityString = "public"; }
        OctetString community = new OctetString(communityString);

        if (!Int32.TryParse(timeoutString, out int timeout) || timeout == 0) {
            timeout = 5000;
        }

        using StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding);
        string payload = reader.ReadToEnd().Trim();

        string[] oidArray = payload.Split(new char[] { ' ', ',', ';', '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries);
        if (oidArray.Length == 0) { return Data.CODE_INVALID_ARGUMENT.Array; }

        try {
            if (version == VersionCode.V3) {
                parameters.TryGetValue("cred", out string credentialsString);
                if (String.IsNullOrEmpty(credentialsString)) {
                    return Data.CODE_INVALID_ARGUMENT.Array;
                }

                Tools.SnmpProfiles.Profile[] profiles = Tools.SnmpProfiles.Load();
                Tools.SnmpProfiles.Profile profile = profiles.First(o=> o.guid.ToString() == credentialsString);

                if (operation == SnmpOperation.Set) {
                    parameters.TryGetValue("value", out string valueString);
                    if (valueString is null) { return Data.CODE_INVALID_ARGUMENT.Array; }
                    OctetString data = new OctetString(valueString);

                    IList<Variable> result = SnmpRequestV3(targetIp, timeout, profile, oidArray, operation, data);
                    return ParseResponseToBytes(result);
                }
                else {
                    IList<Variable> result = SnmpRequestV3(targetIp, timeout, profile, oidArray, operation);
                    return ParseResponseToBytes(result);
                }
            }
            else {
                if (operation == SnmpOperation.Set) {
                    parameters.TryGetValue("value", out string valueString);
                    if (valueString is null) { return Data.CODE_INVALID_ARGUMENT.Array; }
                    OctetString data = new OctetString(valueString);

                    IList<Variable> result = SnmpRequestV1V2(targetIp, version, timeout, community, oidArray, operation, data);
                    return ParseResponseToBytes(result);
                }
                else {
                    IList<Variable> result = SnmpRequestV1V2(targetIp, version, timeout, community, oidArray, operation);
                    return ParseResponseToBytes(result);
                }
            }
        }
        catch (Exception ex) {
            return Encoding.UTF8.GetBytes($"{{\"error\":\"{ex.Message}\"}}");
        }
    }

    public static IList<Variable> SnmpRequestV1V2(IPAddress ipAddress, VersionCode version, int timeout, string communityString, string[] oidArray, SnmpOperation operation, string dataString = null) {
        IPEndPoint endpoint = new IPEndPoint(ipAddress, 161);
        OctetString community = new OctetString(communityString);
        OctetString data = dataString is null ? null : new OctetString(dataString);
        return SnmpRequestV1V2(endpoint, version, timeout, community, oidArray, operation, data);
    }

    public static IList<Variable> SnmpRequestV1V2(IPAddress ipAddress, VersionCode version, int timeout, OctetString community, string[] oidArray, SnmpOperation operation, OctetString data = null) {
        IPEndPoint endpoint = new IPEndPoint(ipAddress, 161);
        return SnmpRequestV1V2(endpoint, version, timeout, community, oidArray, operation, data);
    }

    public static IList<Variable> SnmpRequestV1V2(IPEndPoint endpoint, VersionCode version, int timeout, OctetString community, string[] oidArray, SnmpOperation operation, OctetString data = null) {
        if (operation == SnmpOperation.Get) {
            IList<Variable> oidList = oidArray
                        .Select(o=> new Variable(new ObjectIdentifier(o.Trim())))
                        .ToList();

            IList<Variable> result = Messenger.Get(version, endpoint, community, oidList, timeout);
            return result;
        }
        else if (operation == SnmpOperation.Set) {
            IList<Variable> oidList = oidArray
                        .Select(o=> new Variable(new ObjectIdentifier(o.Trim()), data))
                        .ToList();

            IList<Variable> result = Messenger.Set(version, endpoint, community, oidList, timeout);
            return result;
        }
        else if (operation == SnmpOperation.Walk) {
            ObjectIdentifier oid = new ObjectIdentifier(oidArray[0]);

            List<Variable> result = new List<Variable>();
            int count = Messenger.Walk(version, endpoint, community, oid, result, timeout, WalkMode.WithinSubtree);
            return result;
        }
        else {
            throw new Exception("Invalid operation");
        }
    }

    public static IList<Variable> SnmpRequestV3(IPAddress ipAddress, int timeout, Tools.SnmpProfiles.Profile profile, string[] oidArray, SnmpOperation operation, OctetString data = null) {
        IPEndPoint endpoint = new IPEndPoint(ipAddress, 161);
        return SnmpRequestV3(endpoint, timeout, profile, oidArray, operation, data);
    }

    public static IList<Variable> SnmpRequestV3(IPEndPoint endpoint, int timeout, Tools.SnmpProfiles.Profile profile, string[] oidArray, SnmpOperation operation, OctetString data = null) {
        OctetString username            = new OctetString(profile.username);
        OctetString context             = new OctetString(profile.context);
        string authenticationPassphrase = profile.authPassword;
        string privacyPassphrase        = profile.privacyPassword;

#pragma warning disable CS0618 //warn end user

        IAuthenticationProvider authenticationProvider = profile.authAlgorithm switch {
            Tools.SnmpProfiles.AuthenticationAlgorithm.MD5    => new MD5AuthenticationProvider(new OctetString(authenticationPassphrase)),
            Tools.SnmpProfiles.AuthenticationAlgorithm.SHA1   => new SHA1AuthenticationProvider(new OctetString(authenticationPassphrase)),
            Tools.SnmpProfiles.AuthenticationAlgorithm.SHA256 => new SHA256AuthenticationProvider(new OctetString(authenticationPassphrase)),
            Tools.SnmpProfiles.AuthenticationAlgorithm.SHA384 => new SHA384AuthenticationProvider(new OctetString(authenticationPassphrase)),
            Tools.SnmpProfiles.AuthenticationAlgorithm.SHA512 => new SHA512AuthenticationProvider(new OctetString(authenticationPassphrase)),
            _ => new SHA256AuthenticationProvider(new OctetString(authenticationPassphrase)),
        };

        IPrivacyProvider privacyProvider = profile.privacyAlgorithm switch {
            Tools.SnmpProfiles.PrivacyAlgorithm.DES    => new DESPrivacyProvider(new OctetString(privacyPassphrase), authenticationProvider),
            Tools.SnmpProfiles.PrivacyAlgorithm.AES128 => new AESPrivacyProvider(new OctetString(privacyPassphrase), authenticationProvider),
            Tools.SnmpProfiles.PrivacyAlgorithm.AES192 => new AES192PrivacyProvider(new OctetString(privacyPassphrase), authenticationProvider),
            Tools.SnmpProfiles.PrivacyAlgorithm.AES256 => new AES256PrivacyProvider(new OctetString(privacyPassphrase), authenticationProvider),
            _ => new AESPrivacyProvider(new OctetString(privacyPassphrase), authenticationProvider),
        };

#pragma warning restore CS0618

        Discovery discovery = Messenger.GetNextDiscovery(SnmpType.GetRequestPdu);
        ReportMessage report = discovery.GetResponse(timeout, endpoint);

        if (operation == SnmpOperation.Get) {
            GetRequestMessage request = new GetRequestMessage(
                VersionCode.V3,
                Messenger.NextMessageId,
                Messenger.NextRequestId,
                username,
                context,
                oidArray.Select(o=> new Variable(new ObjectIdentifier(o.Trim()))).ToList(),
                privacyProvider,
                Messenger.MaxMessageSize,
                report);

            ISnmpMessage response = request.GetResponse(timeout, endpoint);
            return response.Variables();

        }
        else if (operation == SnmpOperation.Set) {
            SetRequestMessage request = new SetRequestMessage(
                VersionCode.V3,
                Messenger.NextMessageId,
                Messenger.NextRequestId,
                username,
                context,
                oidArray.Select(o=> new Variable(new ObjectIdentifier(o.Trim()), data)).ToList(),
                privacyProvider,
                Messenger.MaxMessageSize,
                report);

            ISnmpMessage response = request.GetResponse(timeout, endpoint);
            return response.Variables();

        }
        else if (operation == SnmpOperation.Walk) {
            List<Variable> result = new List<Variable>();

            foreach (string baseOid in oidArray) {
                ObjectIdentifier rootOid = new ObjectIdentifier(baseOid.Trim());
                ObjectIdentifier currentOid = rootOid;

                while (true) {
                    GetNextRequestMessage request = new GetNextRequestMessage(
                VersionCode.V3,
                Messenger.NextMessageId,
                Messenger.NextRequestId,
                username,
                context,
                new List<Variable> { new Variable(currentOid) },
                privacyProvider,
                Messenger.MaxMessageSize,
                report);

                    ISnmpMessage response = request.GetResponse(timeout, endpoint);
                    Variable nextVar = response.Variables().FirstOrDefault();

                    if (nextVar == null || !nextVar.Id.ToString().StartsWith(rootOid.ToString())) break;
                    

                    result.Add(nextVar);
                    currentOid = nextVar.Id;
                }
            }

            return result;
        }
        else {
            throw new Exception("Invalid operation");
        }
    }

    public static Dictionary<string, string> ParseResponse(IList<Variable> result) {
        if (result is null || result.Count == 0) {
            return null;
        }

        Dictionary<string, string> data = new Dictionary<string, string>();

        for (int i = 0; i < result.Count; i++) {

            string value;
            if (result[i].Data.TypeCode == SnmpType.Null ||
                result[i].Data.TypeCode == SnmpType.NoSuchObject ||
                result[i].Data.TypeCode == SnmpType.NoSuchInstance) {
                continue;
            }
            else if (result[i].Data.TypeCode == SnmpType.OctetString) {
                byte[] bytes = result[i].Data.ToBytes();
                for (int j = 0; j < bytes.Length; j++) {
                    if (bytes[j] < 32) { bytes[j] = (byte)' '; }
                    else if (bytes[j] > 126) { bytes[j] = (byte)' '; }
                }

                value = Encoding.UTF8.GetString(bytes).Trim();
            }
            else {
                value = result[i].Data.ToString().Trim();
            }

            if (String.IsNullOrEmpty(value)) { continue; }

            data.Add(result[i].Id.ToString(), value);
        }

        return data;
    }

    private static byte[] ParseResponseToBytes(IList<Variable> result) {
        if (result is null || result.Count == 0) {
            return "[]"u8.ToArray();
        }

        StringBuilder builder = new StringBuilder();
        builder.Append('[');

        for (int i = 0; i < result.Count; i++) {
            if (i > 0) { builder.Append(','); }

            string type = result[i].Data.TypeCode switch {
                SnmpType.EndMarker         => "end marker",
                SnmpType.Integer32         => "integer",
                SnmpType.OctetString       => "octet-string",
                SnmpType.Null              => "null",
                SnmpType.ObjectIdentifier  => "object id",
                SnmpType.Sequence          => "sequence",
                SnmpType.IPAddress         => "ip address",
                SnmpType.Counter32         => "counter 32",
                SnmpType.Gauge32           => "gauge 32",
                SnmpType.TimeTicks         => "time ticks",
                SnmpType.Opaque            => "opaque",
                SnmpType.NetAddress        => "net address",
                SnmpType.Counter64         => "counter 64",
                SnmpType.Unsigned32        => "unsigned 32",
                SnmpType.NoSuchObject      => "no such object",
                SnmpType.NoSuchInstance    => "no such instance",
                SnmpType.EndOfMibView      => "end of MIB view",
                SnmpType.GetRequestPdu     => "get request PDU",
                SnmpType.GetNextRequestPdu => "get next request PDU",
                SnmpType.ResponsePdu       => "response PDU",
                SnmpType.SetRequestPdu     => "set request PDU",
                SnmpType.TrapV1Pdu         => "trap v1 PDU",
                SnmpType.GetBulkRequestPdu => "get bulk request PDU",
                SnmpType.InformRequestPdu  => "inform request PDU",
                SnmpType.TrapV2Pdu         => "trap v2 PDU",
                SnmpType.ReportPdu         => "report PDU",
                _=> "unknown"
            };

            builder.Append('[');

            //oid
            builder.Append($"\"{Data.EscapeJsonText(result[i].Id.ToString())}\",");
            
            //type
            builder.Append($"\"{type}\",");
            
            //value
            if (result[i].Data.TypeCode == SnmpType.Null ||
                result[i].Data.TypeCode == SnmpType.NoSuchObject ||
                result[i].Data.TypeCode == SnmpType.NoSuchInstance) {
                builder.Append("\"--\"");
            }
            else if (result[i].Data.TypeCode == SnmpType.OctetString) {
                byte[] bytes = result[i].Data.ToBytes();
                for (int j = 0; j < bytes.Length; j++) {
                    if (bytes[j] < 32) { bytes[j] = (byte)' '; }
                    else if (bytes[j] > 126) { bytes[j] = (byte)' '; }
                }
                builder.Append($"\"{Data.EscapeJsonText(Encoding.UTF8.GetString(bytes).Trim())}\"");
            }
            else {
                builder.Append($"\"{Data.EscapeJsonText(result[i].Data.ToString())}\"");
            }
            builder.Append(']');
        }

        builder.Append(']');
        return Encoding.UTF8.GetBytes(builder.ToString());
    }

    public static (IList<Variable>, SnmpProfiles.Profile) SnmpQueryTrialAndError(IPAddress target, SnmpProfiles.Profile[] snmpProfiles, string[] oids) {
        for (int i = 0; i < snmpProfiles.Length; i++) {
            IList<Variable> result = SnmpQuery(target, snmpProfiles[i], oids, Polling.SnmpOperation.Get);

            if (result is not null) {
                return (result, snmpProfiles[i]);
            }
        }

        return (null, null);
    }

    public static IList<Variable> SnmpQuery(IPAddress target, SnmpProfiles.Profile profile, string[] oids, SnmpOperation operation) {
        if (profile is null) return null;

        if (profile.version == 3) {
            try {
                IList<Variable> result = result = Protocols.Snmp.Polling.SnmpRequestV3(
                    target,
                    3000,
                    profile,
                    oids,
                    operation
                );
                return result;
            }
            catch {
                return null;
            }
        }
        else {
            VersionCode version = profile.version switch {
                1 => VersionCode.V1,
                _ => VersionCode.V2
            };

            List<Variable> result = new List<Variable>();

            for (int i = 0; i < oids.Length; i++) {
                try {
                    IList<Variable> single = Protocols.Snmp.Polling.SnmpRequestV1V2(
                        target,
                        version,
                        3000,
                        profile.community,
                        new string[] { oids[i] },
                        operation
                    );

                    for (int j = 0; j < single.Count; j++) {
                        result.Add(single[j]);
                    }
                }
                catch { }
            }

            return result.Count > 0 ? result : null;
        }
    }

}
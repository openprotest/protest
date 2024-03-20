using Lextm.SharpSnmpLib;
using Lextm.SharpSnmpLib.Messaging;
using Lextm.SharpSnmpLib.Security;

using System.Collections.Generic;
using System.Net;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace Protest.Protocols.Snmp;

internal static class Polling {

    public static byte[] Poll(IPAddress target, string community, string oid, int timeout) {
        byte[] bytes = null;
        
        Task.Run(async () => {
            try {
                IList<Variable> result = await PollAsync(target, community, oid, timeout);
                bytes = Encoding.UTF8.GetBytes(result[0].Data.ToString());
            }
            catch (Exception ex) {
                bytes = Encoding.UTF8.GetBytes(ex.Message);
            }
        }).GetAwaiter().GetResult();

        return bytes;
    }

    private static async Task<IList<Variable>> PollAsync(IPAddress target, string communityString, string oidString, int timeout) {
        VersionCode version = VersionCode.V2;
        IPEndPoint endpoint = new IPEndPoint(target, 161);
        OctetString community = new OctetString(communityString);

        ObjectIdentifier oid = new ObjectIdentifier(oidString);
        List<Variable>  variables = new List<Variable> { new Variable(oid) };

        CancellationTokenSource cancellationTokenSource = new CancellationTokenSource(timeout);
        CancellationToken cancellationToken = cancellationTokenSource.Token;

        IList<Variable> result;
        try {
            result = await Messenger.GetAsync(version, endpoint, community, variables, cancellationToken);
        }
        catch (OperationCanceledException) {
            throw new Exception("Operation timed out");
        }
        catch (Exception) {
            throw;
        }

        if (result is null) {
            throw new Exception("No data received");
        }
        if (result.Count == 0) {
            throw new Exception("No result received");
        }

        return result;
    }

}
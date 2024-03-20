using Lextm.SharpSnmpLib;
using Lextm.SharpSnmpLib.Messaging;
using System.Collections.Generic;
using System.Net;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace Protest.Protocols.Snmp;

internal static class Polling {

    public const string SYSTEM_DESCRIPTOR      = "1.3.6.1.2.1.1.1.0";
    public const string SYSTEM_UPTIME          = "1.3.6.1.2.1.1.3.0";
    public const string SYSTEM_NAME            = "1.3.6.1.2.1.1.5.0";
    public const string SYSTEM_LOCATION        = "1.3.6.1.2.1.1.6.0";
    public const string SYSTEM_SERVICES        = "1.3.6.1.2.1.1.7.0";

    public const string TOTAL_INTERFACES      = "1.3.6.1.2.1.2.1.0";
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
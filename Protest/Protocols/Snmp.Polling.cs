using Lextm.SharpSnmpLib;
using Lextm.SharpSnmpLib.Messaging;
using System.Collections.Generic;
using System.Net;
using System.Threading.Tasks;

namespace Protest.Protocols.Snmp;

internal static class Polling {
    public static async Task PollAsync(IPAddress target, string communityString, string oidString) {
        VersionCode version = VersionCode.V3;
        IPEndPoint endpoint = new IPEndPoint(target, 161);
        OctetString community = new OctetString(communityString);

        ObjectIdentifier oid = new ObjectIdentifier(oidString);
        List<Variable>  variables = new List<Variable> { new Variable(oid) };

        IList<Variable> result = await Messenger.GetAsync(version, endpoint, community, variables);

        if (result is null) {
            Console.WriteLine("No data received.");
            return;
        }

        if (result.Count == 0) {
            Console.WriteLine("No result received.");
            return;
        }

        Console.WriteLine("The value of OID {0} is {1}", oid, result[0].Data.ToString());
    }

    public static async void Test() {
        await PollAsync(IPAddress.Parse("127.0.0.1"), "public", "");
    }
}
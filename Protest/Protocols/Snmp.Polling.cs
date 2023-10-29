using Lextm.SharpSnmpLib;
using Lextm.SharpSnmpLib.Messaging;
using System.Collections.Generic;
using System.Net;

namespace Protest.Protocols.Snmp;

internal static class Polling {
    public static void Poll(IPAddress target, string communityString, string oidString) {
        IPEndPoint endpoint = new IPEndPoint(target, 161);
        OctetString community = new OctetString(communityString);

        ObjectIdentifier oid = new ObjectIdentifier(oidString);

        IList<Variable> result = Messenger.Get(VersionCode.V2, endpoint, community, new List<Variable> { new Variable(oid) }, 60000);

        if (result != null) {
            Console.WriteLine("No data received.");
            return;
        }

        if (result.Count == 0) {
            Console.WriteLine("No result received.");
            return;
        }

        Console.WriteLine("The value of OID {0} is {1}", oid, result[0].Data.ToString());
    }

    public static void Test() {
        Poll(IPAddress.Parse("127.0.0.1"), "public", "");
    }

}
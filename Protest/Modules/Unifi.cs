using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading.Tasks;


public static class Unifi {

    public static byte[] CamInfo(string filename) {
        if (!Database.equip.ContainsKey(filename))
            return Strings.FLE.Array;

        Database.DbEntry equip = (Database.DbEntry)Database.equip[filename];

        if (!equip.hash.ContainsKey("IP"))
            return Strings.INF.Array;

        if (!equip.hash.ContainsKey("USERNAME") || !equip.hash.ContainsKey("PASSWORD"))
            return Strings.INF.Array;

        string username = ((string[])equip.hash["USERNAME"])[0];
        string password = ((string[])equip.hash["PASSWORD"])[0];

        //todo:

        return null;
    }

    public static byte[] ApInfo(string filename) {
        if (!Database.equip.ContainsKey(filename))
            return Strings.FLE.Array;

        Database.DbEntry equip = (Database.DbEntry)Database.equip[filename];

        if (!equip.hash.ContainsKey("IP"))
            return Strings.INF.Array;

        if (!equip.hash.ContainsKey("USERNAME") || !equip.hash.ContainsKey("PASSWORD"))
            return Strings.INF.Array;

        string username = ((string[])equip.hash["USERNAME"])[0];
        string password = ((string[])equip.hash["PASSWORD"])[0];

        //todo:

        return null;
    }

}
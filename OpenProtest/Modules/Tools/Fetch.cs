using System;
using System.IO;
using System.Linq;
using System.Net;

public static class Fetch {

    public static byte[] ImportDatabase(HttpListenerContext ctx) {
        string ip = "127.0.0.1";
        int port = 443;
        string protocol = "https";
        string username = "";
        string password = "";
        bool importEquip = true;
        bool importUsers = true;

        using (StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding)) {
            string[] para = reader.ReadToEnd().Split('&');
            for (int i = 0; i < para.Length; i++) {
                if (para[i].StartsWith("ip=")) ip = para[i].Substring(7);
                if (para[i].StartsWith("port=")) port = int.Parse(para[i].Substring(5));
                if (para[i].StartsWith("protocol=")) protocol = para[i].Substring(9);
                if (para[i].StartsWith("username=")) username = para[i].Substring(7);
                if (para[i].StartsWith("password=")) password = para[i].Substring(7);
                if (para[i].StartsWith("equip=")) importEquip = para[i].Substring(6) == "true";
                if (para[i].StartsWith("users=")) importUsers = para[i].Substring(6) == "true";
            }
        }

        return null;
    }

}

using System;
using System.Collections;
using System.Collections.Generic;
using System.Net;
using System.Text;

class HttpAddressBookListener : Http {
    public HttpAddressBookListener(string ip, ushort port, string path) : base(ip, port, path) { }

    public override void Serve(in HttpListenerContext ctx) {
        string url = ctx.Request.Url.AbsolutePath;
        string[] para = url.Split('&');
        if (para[0].StartsWith("/")) para[0] = para[0].Substring(1);

        ctx.Response.ContentEncoding = Encoding.UTF8;

        bool isModified = (ctx.Request.Headers.Get("If-Modified-Since") != cache.birthdate);
        bool acceptGzip = ctx.Request.Headers.Get("Accept-Encoding")?.ToLower().Contains("gzip") ?? false;

        if (!isModified) {
            ctx.Response.StatusCode = (int)HttpStatusCode.NotModified;
            ctx.Response.AddHeader("Length", "0");
            ctx.Response.OutputStream.Write(new byte[0], 0, 0);
            ctx.Response.Close();
            return;
        }

        bool acceptWebP = false;
        if (ctx.Request.AcceptTypes != null)
            for (int i = 0; i < ctx.Request.AcceptTypes.Length; i++)
                if (ctx.Request.AcceptTypes[i].Contains("image/webp")) {
                    acceptWebP = true;
                    break;
                }

        byte[] buffer;

        if (cache.hash.ContainsKey(para[0])) { //get from cache
            ctx.Response.AddHeader("Last-Modified", cache.birthdate);
            ctx.Response.StatusCode = (int)HttpStatusCode.OK;

            Cache.CacheEntry entity = (Cache.CacheEntry)cache.hash[para[0]];

            if (acceptWebP && entity.webp != null) { //webp
                buffer = entity.webp;
                ctx.Response.ContentType = "image/webp";
            } else if (acceptGzip && entity.gzip != null) { //GZip
                buffer = entity.gzip;
                ctx.Response.ContentType = entity.contentType;
                ctx.Response.AddHeader("Content-Encoding", "gzip");
            } else { //raw
                buffer = entity.bytes;
                ctx.Response.ContentType = entity.contentType;
                if (para[0].EndsWith("svgz")) ctx.Response.AddHeader("Content-Encoding", "gzip");
            }

        } else { //dynamic
            switch (para[0]) {
                case "getaddressbook": buffer = GetAddressBook(); break;

                default: //not found
                    ctx.Response.StatusCode = (int)HttpStatusCode.NotFound;
                    buffer = null;
                    break;
            }
        }

        ctx.Response.AddHeader("Length", buffer?.Length.ToString() ?? "0"); //if buffer is null return 0

        try {
            if (buffer != null) ctx.Response.OutputStream.Write(buffer, 0, buffer.Length);
            ctx.Response.Close();
        } catch { }
    }

    private DateTime lastAddressBookBirthdate = new DateTime(0);
    private byte[] lastAddressBook;

    private byte[] GetAddressBook(bool force_update = false) {

        if (force_update && DateTime.Now.Ticks - lastAddressBookBirthdate.Ticks < 600000000) //less than a minute
            return lastAddressBook;

        StringBuilder sb = new StringBuilder();

        foreach (KeyValuePair<string, Database.DbEntry> o in Database.users) {
            Database.DbEntry entry = (Database.DbEntry)o.Value;

            string title = Encoding.UTF8.GetString(Database.GetValue(entry, "TITLE")).Trim();
            string fname = Encoding.UTF8.GetString(Database.GetValue(entry, "FIRST NAME")).Trim();
            string lname = Encoding.UTF8.GetString(Database.GetValue(entry, "LAST NAME")).Trim();
            string depar = Encoding.UTF8.GetString(Database.GetValue(entry, "DEPARTMENT")).Trim();
            string email = Encoding.UTF8.GetString(Database.GetValue(entry, "E-MAIL")).Trim();
            string telep = Encoding.UTF8.GetString(Database.GetValue(entry, "TELEPHONE NUMBER")).Trim();
            string mobno = Encoding.UTF8.GetString(Database.GetValue(entry, "MOBILE NUMBER")).Trim();
            string mobex = Encoding.UTF8.GetString(Database.GetValue(entry, "MOBILE EXTENTION")).Trim();

            if (telep.Length == 0 &&
                mobno.Length == 0 &&
                mobex.Length == 0) continue;

            sb.Append(title + ((char)127).ToString());
            sb.Append(fname + ((char)127).ToString());
            sb.Append(lname + ((char)127).ToString());
            sb.Append(depar + ((char)127).ToString());
            sb.Append(email + ((char)127).ToString());
            sb.Append(telep.Replace(" ", "") + ((char)127).ToString());
            sb.Append(mobno.Replace(" ", "") + ((char)127).ToString());
            sb.Append(mobex.Replace(" ", "") + ((char)127).ToString());
        }

        lastAddressBookBirthdate = DateTime.Now;
        lastAddressBook = Encoding.UTF8.GetBytes(sb.ToString());
        return lastAddressBook;
    }

    public override string ToString() {
        return $"Address book listening on {this.ip}:{this.port}";
    }
}

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Text;

public static class DebitNotes {
    static readonly object DEBITNOTE_LOCK = new object();

    public static byte[] GetDebitNotes(string[] para) {
        string from = String.Empty;
        string to = String.Empty;
        string keywords = String.Empty;
        string filters = String.Empty;
        string last = String.Empty;
        for (int i = 0; i < para.Length; i++) {
            if (para[i].StartsWith("from="))         from = para[i].Substring(5);
            if (para[i].StartsWith("to="))             to = para[i].Substring(3);
            if (para[i].StartsWith("keywords=")) keywords = para[i].Substring(9);
            if (para[i].StartsWith("filters="))   filters = Strings.EscapeUrl(para[i].Substring(8));
            if (para[i].StartsWith("last="))         last = para[i].Substring(5);
        }

        DirectoryInfo dir = new DirectoryInfo(Strings.DIR_DEBIT);
        if (!dir.Exists) return Strings.FLE.Array;

        StringBuilder sb = new StringBuilder();
        DirectoryInfo[] dirList;
        //TODO:
        //Array.Sort(dirList, (a, b) => String.Compare(b.Name, a.Name));

        lock (DEBITNOTE_LOCK) {
        
        }
        
        return null;
    }

    public static byte[] GetDebitNoteTemplate() {

        return null;
    }

    public static byte[] CreateDebitNote(in HttpListenerContext ctx) {
        string firstname = "", lastname = "", title = "", department = "", it = "", equip = "";
        int template = 0;
        bool isLongPending = false;

        using (StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding)) {
            string[] para = reader.ReadToEnd().Split('&');
            for (int i = 0; i < para.Length; i++) {
                if (para[i].StartsWith("fn=")) firstname = para[i].Substring(3);
                if (para[i].StartsWith("ln=")) lastname = para[i].Substring(3);
                if (para[i].StartsWith("tl=")) title = para[i].Substring(3);
                if (para[i].StartsWith("dp=")) department = para[i].Substring(3);
                if (para[i].StartsWith("it=")) it = para[i].Substring(3);
                if (para[i].StartsWith("tt=")) template = Int32.Parse(para[i].Substring(3));
                if (para[i].StartsWith("eq=")) equip = para[i].Substring(3);
                if (para[i].StartsWith("lg=") ) isLongPending = para[i].Substring(3) == "true";
            }
        }

        DateTime now = DateTime.Now;
        string name = DateTime.Now.Ticks.ToString();

        string[] templateList = Encoding.UTF8.GetString(GetDebitNoteTemplate()).Split((char)127);

        string data = "";
        data += $"{firstname}{(char)127}";
        data += $"{lastname}{(char)127}";
        data += $"{title}{(char)127}";
        data += $"{department}{(char)127}";
        data += $"{now:dd-MM-yyyy}{(char)127}";
        data += $"{it}{(char)127}";
        data += ((template * 2 + 1 > templateList.Length) ? "" : templateList[template * 2 + 1]) + (char)127;
        data += $"{equip}{(char)127}";
        data += $"{isLongPending.ToString().ToLower()}";

        try {

            lock (DEBITNOTE_LOCK) {
                DirectoryInfo dir = new DirectoryInfo(Strings.DIR_DEBIT);
                if (!dir.Exists) dir.Create();

                if (isLongPending) {
                    DirectoryInfo dirLong = new DirectoryInfo(Strings.DIR_DEBIT_LONG);
                    if (!dirLong.Exists) dirLong.Create();
                    File.WriteAllText($"{dirLong}\\{name}", data, Encoding.UTF8);
                } else {
                    DirectoryInfo dirShort = new DirectoryInfo(Strings.DIR_DEBIT_SHORT);
                    if (!dirShort.Exists) dirShort.Create();
                    File.WriteAllText($"{dirShort}\\{name}", data, Encoding.UTF8);
                }
            }

        } catch (Exception ex) {
            Logging.Err(ex);
            return Strings.FAI.Array;
        }

        return Encoding.UTF8.GetBytes(name);
    }

    public static byte[] MarkDebitNote(string[] para) {

        return null;
    }

    public static byte[] DeleteDebitNote(string[] para) {

        return null;
    }

}

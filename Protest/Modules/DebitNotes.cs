using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Text;

public static class DebitNotes {
    static readonly object DEBIT_LOCK = new object();

    public static byte[] GetDebitNotes(in string[] para) {
        DirectoryInfo dir = new DirectoryInfo(Strings.DIR_DEBIT);
        if (!dir.Exists) return Strings.FLE.Array;

        string from = String.Empty;
        string to = String.Empty;
        string[] keywords = null;
        string filters = String.Empty;
        string last = String.Empty;
        for (int i = 0; i < para.Length; i++) {
            if (para[i].StartsWith("from="))         from = para[i].Substring(5);
            if (para[i].StartsWith("to="))             to = para[i].Substring(3);
            if (para[i].StartsWith("keywords=")) keywords = Strings.EscapeUrl(para[i].Substring(9)).Split(' ');
            if (para[i].StartsWith("filters="))   filters = para[i].Substring(8);
            if (para[i].StartsWith("last="))         last = para[i].Substring(5);
        }

        bool shortterm = false, longterm = false, returned = false;
        if (filters.Length > 0) {
            shortterm = filters[0] == '1';
            longterm = filters[1] == '1';
            returned = filters[2] == '1';
        }

        DateTime dateFrom = new DateTime(0);
        if (from.Length == 10) {
            string[] split = from.Split('-');
            if (split.Length == 3) 
                dateFrom = new DateTime(Int32.Parse(split[0]), Int32.Parse(split[1]), Int32.Parse(split[2]));
        }

        DateTime dateTo = DateTime.Now;
        if (to.Length == 10) {
            string[] split = to.Split('-');
            if (split.Length == 3) {
                dateTo = new DateTime(Int32.Parse(split[0]), Int32.Parse(split[1]), Int32.Parse(split[2]));
                dateTo = dateTo.AddDays(1);
            }
        }

        List<FileInfo> files = new List<FileInfo>();

        if (shortterm) {
            DirectoryInfo dirShort = new DirectoryInfo(Strings.DIR_DEBIT_SHORT);
            if (dirShort.Exists) files.AddRange(dirShort.GetFiles());
        }

        if (longterm) {
            DirectoryInfo dirLong = new DirectoryInfo(Strings.DIR_DEBIT_LONG);
            if (dirLong.Exists) files.AddRange(dirLong.GetFiles());
        }

        if (returned) {
            DirectoryInfo dirReturned = new DirectoryInfo(Strings.DIR_DEBIT_RETURNED);
            if (dirReturned.Exists) files.AddRange(dirReturned.GetFiles());
        }

        files.Sort((a, b) => String.Compare(b.Name, a.Name));

        StringBuilder sb = new StringBuilder();

        lock (DEBIT_LOCK)
            for (int i = 0; i < files.Count; i++)
                try {
                    string data = File.ReadAllText(files[i].FullName);
                    if (data.Length == 0) break;

                    bool found = true;
                    if (!(keywords is null) && keywords.Length > 0) //search content
                        for (int j = 0; j < keywords.Length; j++)
                            if (data.IndexOf(keywords[j], StringComparison.InvariantCultureIgnoreCase) == -1) {
                                found = false;
                                break;
                            }

                    if (!found) //match filename
                        found = (keywords.Length == 1 && files[i].Name == keywords[0]);

                    if (!found) continue;

                    //check date
                    string sDate = files[i].Name.IndexOf("-") > -1 ? files[i].Name.Split('-')[1] : files[i].Name;
                    if (sDate.Length > 0) {
                        if (long.TryParse(sDate, out long lDate))
                            if (lDate < dateFrom.Ticks || lDate > dateTo.Ticks) continue;
                    }

                    //if (sb.Length > 0) sb.Append(((char)127).ToString());
                    sb.Append($"{files[i].Name}{(char)127}{data}");

                    if (data.Length > 0 && data[data.Length-1] != (char)127) sb.Append((char)127);
                    
                    if (files[i].FullName.StartsWith(Strings.DIR_DEBIT_SHORT))
                        sb.Append($"short{(char)127}");
                    else if (files[i].FullName.StartsWith(Strings.DIR_DEBIT_LONG))
                        sb.Append($"long{(char)127}");
                    else 
                        sb.Append($"returned{(char)127}");

                } catch  { }

        return Encoding.UTF8.GetBytes(sb.ToString());
    }

    public static byte[] GetDebitNoteTemplate() {
        DirectoryInfo dir = new DirectoryInfo(Strings.DIR_DEBIT_TEMPLATE);
        if (!dir.Exists) return Strings.FLE.Array;

        StringBuilder sb = new StringBuilder();

        FileInfo[] files = dir.GetFiles();
        foreach (FileInfo f in files)
            try {
                string text = File.ReadAllText(f.FullName).Replace("\n", "<br>");
                sb.Append((f.Name.EndsWith(".txt", true, System.Globalization.CultureInfo.DefaultThreadCurrentCulture) ? f.Name.Substring(0, f.Name.Length - f.Extension.Length) : f.Name) + ((char)127).ToString());
                sb.Append(text + ((char)127).ToString());
            } catch { }

        return Encoding.UTF8.GetBytes(sb.ToString());
    }

    public static byte[] CreateDebitNote(in HttpListenerContext ctx, string performer) {
        string firstname = "", lastname = "", title = "", department = "", it = "", equip = "";
        int template = 0;
        bool isShortPending = false;

        using (StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding)) {
            string[] para = reader.ReadToEnd().Split('&');
            for (int i = 0; i < para.Length; i++) {
                if (para[i].StartsWith("fn=")) firstname = para[i].Substring(3);
                if (para[i].StartsWith("ln=")) lastname = para[i].Substring(3);
                if (para[i].StartsWith("tl=")) title = para[i].Substring(3);
                if (para[i].StartsWith("dp=")) department = para[i].Substring(3);
                if (para[i].StartsWith("it=")) it = para[i].Substring(3);
                if (para[i].StartsWith("eq=")) equip = para[i].Substring(3);
                if (para[i].StartsWith("sh=")) isShortPending = para[i].Substring(3) == "true";
                if (para[i].StartsWith("tt=") && para[i].Length > 3) template = Int32.Parse(para[i].Substring(3));
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
        //data += $"{isShortPending.ToString().ToLower()}";

        try {

            lock (DEBIT_LOCK) {
                DirectoryInfo dir = new DirectoryInfo(Strings.DIR_DEBIT);
                if (!dir.Exists) dir.Create();

                if (isShortPending) {
                    DirectoryInfo dirShort = new DirectoryInfo(Strings.DIR_DEBIT_SHORT);
                    if (!dirShort.Exists) dirShort.Create();
                    File.WriteAllText($"{dirShort}\\{name}", data, Encoding.UTF8);
                } else {
                    DirectoryInfo dirLong = new DirectoryInfo(Strings.DIR_DEBIT_LONG);
                    if (!dirLong.Exists) dirLong.Create();
                    File.WriteAllText($"{dirLong}\\{name}", data, Encoding.UTF8);
                }
            }

        } catch (Exception ex) {
            Logging.Err(ex);
            return Strings.FAI.Array;
        }

        Logging.Action(performer, $"Create a debit note: {name}");

        return Encoding.UTF8.GetBytes(name);
    }

    public static byte[] MarkDebitNote(in string[] para, in string performer) {
        string code = String.Empty;
        string type = String.Empty;
        for (int i = 0; i < para.Length; i++) {
            if (para[i].StartsWith("code=")) code = para[i].Substring(5);
            if (para[i].StartsWith("type=")) type = para[i].Substring(5);
        }

        if (code.Length == 0 || type.Length == 0) return Strings.INF.Array;

        FileInfo file = new FileInfo($"{(type == "short" ? Strings.DIR_DEBIT_SHORT : Strings.DIR_DEBIT_LONG)}\\{code}");
        if (!file.Exists) return Strings.FLE.Array;

        DirectoryInfo dirReturned = new DirectoryInfo(Strings.DIR_DEBIT_RETURNED);
        if (!dirReturned.Exists) dirReturned.Create();

        lock (DEBIT_LOCK) file.MoveTo(dirReturned.FullName + "\\" + code);

        Logging.Action(performer, $"Mark a debit note as returned: {code}");

        return Strings.OK.Array;
    }

    public static byte[] DeleteDebitNote(in string[] para, in string performer) {
        string code = String.Empty;
        string type = String.Empty;
        for (int i = 0; i < para.Length; i++) {
            if (para[i].StartsWith("code=")) code = para[i].Substring(5);
            if (para[i].StartsWith("type=")) type = para[i].Substring(5);
        }

        if (code.Length == 0 || type.Length == 0) return Strings.INF.Array;

        FileInfo file = new FileInfo($"{(type=="short" ? Strings.DIR_DEBIT_SHORT : Strings.DIR_DEBIT_LONG)}\\{code}");
        if (!file.Exists) return Strings.FLE.Array;
        lock (DEBIT_LOCK) file.Delete();

        Logging.Action(performer, $"Delete debit note: {code}");

        return Strings.OK.Array;
    }

}

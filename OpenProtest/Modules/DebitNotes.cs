using System;
using System.Linq;
using System.Text;
using System.IO;
using System.Globalization;
using System.Security.Cryptography;

class DebitNotes {
    static readonly object DEBITNOTE_LOCK = new object();

    static readonly string DIR_DEBITNOTE = $"{Directory.GetCurrentDirectory()}\\protest_data\\debitnotes";
    static readonly string DIR_DEBITNOTE_PENDING = $"{Directory.GetCurrentDirectory()}\\protest_data\\debitnotes\\pending";
    static readonly string DIR_DEBITNOTE_TEMPLATE = $"{Directory.GetCurrentDirectory()}\\protest_data\\debitnotes\\%templates";
    
    public static byte[] GetDebitNotes(string[] para) {
        string date = "";
        string filter = "";
        string pending = "";
        for (int i = 0; i < para.Length; i++) {
            if (para[i].StartsWith("date=")) date = para[i].Substring(5);
            if (para[i].StartsWith("filter=")) filter = NoSQL.UrlDecode(para[i].Substring(7));
            if (para[i].StartsWith("pending=")) pending = para[i].Substring(8);
        }
                
        DirectoryInfo dir = new DirectoryInfo(DIR_DEBITNOTE);
        if (!dir.Exists) return Tools.FLE.Array;

        StringBuilder sb = new StringBuilder();
        DirectoryInfo[] dirList;

        if (pending.Length > 0)
            dirList = new DirectoryInfo[] { new DirectoryInfo(DIR_DEBITNOTE_PENDING) };

        else if (date.Length > 0) {
            DirectoryInfo targerDate = new DirectoryInfo(DIR_DEBITNOTE + "\\" + date);
            if (targerDate.Exists) 
                dirList = new DirectoryInfo[] { targerDate };
            else
                return null;

        } else
            dirList = dir.GetDirectories();
        
        Array.Sort(dirList, (a, b) => String.Compare(b.Name, a.Name));

        lock (DEBITNOTE_LOCK) {
            string[] words = filter.Split(' ');

            foreach (DirectoryInfo d in dirList) {
                if (d.Name.StartsWith("%")) continue;

                FileInfo[] fileList = d.GetFiles();
                Array.Sort(fileList, (a, b) => String.Compare(b.Name, a.Name));

                foreach (FileInfo f in fileList)
                    try {
                        string data = File.ReadAllText(f.FullName);
                        if (data.Length == 0) break;

                        bool found = true;
                        if (filter.Length > 0) {
                            for (int i = 0; i < words.Length; i++) {
                                if (data.IndexOf(words[i], StringComparison.InvariantCultureIgnoreCase) == -1) {
                                    found = false;
                                    break;
                                }
                            }
                        }

                        if (!found) continue;

                        if (sb.Length > 0) sb.Append(((char)127).ToString());
                        sb.Append(f.Name + ((char)127).ToString() + data + ((char)127).ToString());
                        sb.Append((d.Name == "pending") ? "false" : "true");
                    } catch { }
            }
        }

        return Encoding.UTF8.GetBytes(sb.ToString());
    }

    public static byte[] GetDebitNoteTemplate() {
        DirectoryInfo dir = new DirectoryInfo(DIR_DEBITNOTE_TEMPLATE);
        if (!dir.Exists) return Tools.FLE.Array;

        StringBuilder sb = new StringBuilder();

        FileInfo[] files = dir.GetFiles();
        foreach (FileInfo f in files)
            try {
                string text = File.ReadAllText(f.FullName).Replace("\n", "<br>");
                sb.Append((f.Name.EndsWith(".txt", true, CultureInfo.DefaultThreadCurrentCulture)? f.Name.Substring(0, f.Name.Length- f.Extension.Length) : f.Name) + ((char)127).ToString());
                sb.Append(text + ((char)127).ToString());
            } catch {}
        
        return Encoding.UTF8.GetBytes(sb.ToString());
    }

    public static byte[] CreateDebitNote(string[] para) {
        string firstname = "";
        string lastname = "";
        string title = "";
        string department = "";
        string it = "";
        int template = 0;
        string equip = "";

        for (int i=1; i<para.Length; i++) {
            if (para[i].StartsWith("fn=")) firstname = NoSQL.UrlDecode(para[i].Substring(3));
            if (para[i].StartsWith("ln=")) lastname = NoSQL.UrlDecode(para[i].Substring(3));
            if (para[i].StartsWith("tl=")) title = NoSQL.UrlDecode(para[i].Substring(3));
            if (para[i].StartsWith("dp=")) department = NoSQL.UrlDecode(para[i].Substring(3));
            if (para[i].StartsWith("it=")) it = NoSQL.UrlDecode(para[i].Substring(3));
            if (para[i].StartsWith("tt=")) template = Int32.Parse(para[i].Substring(3));
            if (para[i].StartsWith("eq=")) equip = NoSQL.UrlDecode(para[i].Substring(3));
        }


        DateTime now = DateTime.Now;
        string name = DateTime.Now.Ticks.ToString();
        
        if (equip.EndsWith(";")) equip = equip.Substring(0, equip.Length - 1);

        string[] templateList = Encoding.UTF8.GetString(GetDebitNoteTemplate()).Split((char)127);

        string data = "";
        data += $"{firstname}{(char)127}";
        data += $"{lastname}{(char)127}";
        data += $"{title}{(char)127}";
        data += $"{department}{(char)127}";
        data += $"{now.ToString("dd-MM-yyyy")}{(char)127}";
        data += $"{it}{(char)127}";
        data += ((template * 2 + 1 > templateList.Length) ? "" : templateList[template * 2 + 1]) + (char)127;
        data += $"{equip}";

        try {
            lock (DEBITNOTE_LOCK) {
                DirectoryInfo dir = new DirectoryInfo(DIR_DEBITNOTE);
                if (!dir.Exists) dir.Create();

                DirectoryInfo dirSub = new DirectoryInfo(DIR_DEBITNOTE + "\\pending");
                if (!dirSub.Exists) dirSub.Create();

                File.WriteAllText(dirSub.FullName + "\\" + name, data, Encoding.UTF8);
            }
        } catch (Exception ex){
            ErrorLog.Err(ex);
            return Tools.FAI.Array;
        }

        return Encoding.UTF8.GetBytes(name);
    }

    private const string SALT = "Vs&(D-i=DtyFpE\"^";
    public static byte[] MarkDebitNote(string[] para) {
        if (para.Length < 2) return Tools.FAI.Array;
        string code = para[1];
       
        TripleDESCryptoServiceProvider triDES = new TripleDESCryptoServiceProvider() {
            Key = new MD5CryptoServiceProvider().ComputeHash(Encoding.UTF8.GetBytes($"{code}{SALT}")),
            Mode = CipherMode.ECB
        };

        byte[] codeBytes = Encoding.UTF8.GetBytes(code);
        byte[] hash = triDES.CreateEncryptor().TransformFinalBlock(codeBytes, 0, codeBytes.Length);

        string dirName = DateTime.Now.ToString("yyyyMMdd");
        string fileName = BitConverter.ToString(hash, 7, 4).Replace("-", "") + "-" + code;
               
        try {
            FileInfo file = new FileInfo(DIR_DEBITNOTE + "\\pending\\" + code);
            if (!file.Exists) return Tools.FAI.Array;

            lock (DEBITNOTE_LOCK) {
                DirectoryInfo dirSub = new DirectoryInfo(DIR_DEBITNOTE + "\\" + dirName);
                if (!dirSub.Exists) dirSub.Create();
                file.MoveTo(dirSub.FullName + "\\" + fileName);
            }
        } catch (Exception ex) {
            ErrorLog.Err(ex);
            return Tools.FAI.Array;
        }

        return Encoding.UTF8.GetBytes(fileName);
    }

    public static byte[] DeleteDebitNote(string[] para) {
        if (para.Length < 2) return Tools.FAI.Array;
        string code = para[1];

        try {
            FileInfo file = new FileInfo(DIR_DEBITNOTE + "\\pending\\" + code);
            if (!file.Exists) return Tools.FAI.Array;
            lock (DEBITNOTE_LOCK) file.Delete();            
        } catch (Exception ex) {
            ErrorLog.Err(ex);
            return Tools.FAI.Array;
        }

        return Tools.OK.Array;
    }

}
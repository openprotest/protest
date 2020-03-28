using System;
using System.Collections;
using System.Collections.Concurrent;
using System.Text;

class Database {

    public struct DbEntry {
        public string name; //filename
        public bool isUser;
        public Hashtable hash;
        public object write_lock; //lock obj
    }

    public enum SaveMethod { //if dublicate
        Ignore = 0,
        CreateNew = 1,
        Overwrite = 2,
        Append = 3,
        Merge = 4
    }

    public static long equip_version = 0;
    public static long users_version = 0;

    public static ConcurrentDictionary<string, DbEntry> equip = new ConcurrentDictionary<string, DbEntry>();
    public static ConcurrentDictionary<string, DbEntry> users = new ConcurrentDictionary<string, DbEntry>();

    public static byte[] GetValue(Hashtable table, string[] para) {
        string filename = "", property = "";
        for (int i = 1; i < para.Length; i++) {
            if (para[i].StartsWith("file=")) filename = para[i].Substring(5);
            if (para[i].StartsWith("property=")) property = para[i].Substring(9);
        }
        return GetValue(table, filename, property);
    }
    public static byte[] GetValue(Hashtable table, in string filename, string property) {
        if (filename.Length == 0) return null;
        if (property.Length == 0) return null;

        property = Strings.UrlDecode(property);

        if (!table.ContainsKey(filename)) return null;
        DbEntry entry = (DbEntry)table[filename];

        return GetValue(entry, property);
    }
    public static byte[] GetValue(DbEntry entry, string property) {
#if DEBUG
        return Encoding.UTF8.GetBytes("(debug mode)");
#endif

        if (!entry.hash.ContainsKey(property)) return new byte[] { };
        string[] value = (string[])entry.hash[property];

        return Encoding.UTF8.GetBytes(value[0]);
    }

}
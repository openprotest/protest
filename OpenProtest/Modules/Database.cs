using System;
using System.Collections;
using System.Collections.Concurrent;
using System.IO;
using System.Linq;
using System.Text;

class Database {

    public struct DbEntry {
        public string    filename;   //filename
        public bool      isUser;  
        public Hashtable hash;       //[value, performer, date, source, placeholder]
        public object    write_lock; //lock obj
    }

    public enum SaveMethod {
        KeepOld = 0,
        CreateNew = 1,
        Overwrite = 2,
        Append = 3,
        Merge = 4
    }

    public static long equip_version = 0;
    public static long users_version = 0;
    public static ConcurrentDictionary<string, DbEntry> equip = new ConcurrentDictionary<string, DbEntry>();
    public static ConcurrentDictionary<string, DbEntry> users = new ConcurrentDictionary<string, DbEntry>();


    public static void LoadEquip() {
        DirectoryInfo dir = new DirectoryInfo(Strings.DIR_EQUIP);
        if (!dir.Exists) return;

        foreach (FileInfo f in dir.GetFiles()) {
            DbEntry entry = Read(f, false);
            if (entry.hash == null) continue;

            bool success = equip.TryAdd(f.Name, entry);
            if (!success) Logging.Err($"Unable to add equip: {f.Name}"); //TODO: 
        }

        equip_version = DateTime.Now.Ticks;
    }

    public static void LoadUsers() {
        DirectoryInfo dir = new DirectoryInfo(Strings.DIR_USERS);
        if (!dir.Exists) return;

        foreach (FileInfo f in dir.GetFiles()) {
            DbEntry entry = Read(f, true);
            if (entry.hash == null) continue;
            
            bool success = users.TryAdd(f.Name, entry);
            if (!success) Logging.Err($"Unable to add equip: {f.Name}"); //TODO: 
        }

        users_version = DateTime.Now.Ticks;
    }

    public static DbEntry Read(FileInfo f, bool isUser) {
        DbEntry entry = new DbEntry() {
            filename = f.Name,
            hash = new Hashtable(),
            isUser = isUser,
            write_lock = new object()
        };



        return entry;
    }

    public static bool Write(DbEntry e, in string performer) {

        return true;
    }




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

        property = Strings.ValitateUrl(property);

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
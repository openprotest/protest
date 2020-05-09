using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Text;
using System.Threading;

class Database {
    public struct DbEntry {
        public string    filename;
        public bool      isUser;
        public Hashtable hash;       //[value, performer/date, source]
        public object    write_lock;
    }

    public enum SaveMethod {
        Discard   = 0,
        CreateNew = 1,
        Overwrite = 2,
        Append    = 3,
    }

    public static long equipVer = 0;
    public static long usersVer = 0;
    public static Hashtable equip = Hashtable.Synchronized(new Hashtable());
    public static Hashtable users = Hashtable.Synchronized(new Hashtable());

    public static long lastCachedEquipVer = -1;
    public static long lastCachedUsersVer = -1;
    public static long lastCachedEquipTimestamp = 0;
    public static long lastCachedUsersTimestamp = 0;
    public static byte[] lastCachedEquip = null;
    public static byte[] lastCachedUsers = null;

    public static void LoadEquip() {
        DirectoryInfo dir = new DirectoryInfo(Strings.DIR_EQUIP);
        if (!dir.Exists) return;

        foreach (FileInfo f in dir.GetFiles()) {
            DbEntry entry = Read(f, false);
            if (entry.hash == null) continue;
            equip.Add(f.Name, entry);
        }

        equipVer = DateTime.Now.Ticks;
    }

    public static void LoadUsers() {
        DirectoryInfo dir = new DirectoryInfo(Strings.DIR_USERS);
        if (!dir.Exists) return;

        foreach (FileInfo f in dir.GetFiles()) {
            DbEntry entry = Read(f, true);
            if (entry.hash == null) continue;            
            users.Add(f.Name, entry);
        }

        usersVer = DateTime.Now.Ticks;
    }

    public static DbEntry Read(FileInfo f, bool isUser) {
        DbEntry entry = new DbEntry() {
            filename = f.Name,
            hash = new Hashtable(),
            isUser = isUser,
            write_lock = new object()
        };

        try {
            if (f.Length < 2) throw new Exception("null file: " + f.FullName);
            byte[] bytes = File.ReadAllBytes(f.FullName);

            string plain = Encoding.UTF8.GetString(CryptoAes.Decrypt(bytes, Program.DB_KEY_A, Program.DB_KEY_B));
            string[] split = plain.Split((char)127);

            entry.hash.Add(".FILENAME", new string[] { f.Name, "", "" });

            for (int i = 0; i < split.Length - 3; i += 4)
                if (!entry.hash.ContainsKey(split[i]))
                    entry.hash.Add(split[i], new string[] { split[i + 1], split[i + 2], split[i + 3] });

        } catch (IOException ex) {
            entry.hash = null;
            Logging.Err(ex);

        } catch (Exception ex) {
            entry.hash = null;
            Logging.Err(ex);
        }

        return entry;
    }

    public static bool Write(DbEntry e, in string performer) {
        if (!e.hash.ContainsKey(".FILENAME")) return false;
        string filename = ((string[])e.hash[".FILENAME"])[0];

        byte[] plain = GetEntryPayload(e);
        byte[] cipher = CryptoAes.Encrypt(plain, Program.DB_KEY_A, Program.DB_KEY_B);

        byte[] bytes = new byte[cipher.Length];
        Array.Copy(cipher, 0, bytes, 0, cipher.Length);

        try {
            lock (e.write_lock)
                File.WriteAllBytes($"{(e.isUser ? Strings.DIR_USERS : Strings.DIR_EQUIP)}\\{filename}", bytes);
        } catch (Exception ex) {
            Logging.Err(ex);
            return false;
        }

        if (!(performer is null)) Logging.Action(in performer, $"DB write: {(e.isUser ? "user" : "equip")} {filename}");

        return true;
    }

    public static byte[] GetEquipPayload(string[] para) {
        if (para.Length < 2) return null;
        if (!equip.ContainsKey(para[1])) return null;
        DbEntry entry = (DbEntry)equip[para[1]];
        return GetEntryPayload(entry);
    }
    public static byte[] GetUserPayload(string[] para) {
        if (para.Length < 2) return null;
        if (!users.ContainsKey(para[1])) return null;
        DbEntry entry = (DbEntry)users[para[1]];
        return GetEntryPayload(entry);
    }
    public static byte[] GetEntryPayload(in DbEntry entry) {
        StringBuilder payload = new StringBuilder();

        foreach (DictionaryEntry o in entry.hash) {
            string key = o.Key.ToString();
            if (key.Length == 0) continue;
            string[] value = (string[])o.Value;
            payload.Append($"{key}{(char)127}{value[0]}{(char)127}{value[1]}{(char)127}{value[2]}{(char)127}"); //[property name] [value] [performer] [placeholder]
        }

        return Encoding.UTF8.GetBytes(payload.ToString());
    }

    public static byte[] GetTable(Hashtable table, long version) {
        StringBuilder sb = new StringBuilder($"{version}{(char)127}");

        foreach (DictionaryEntry o in table) {
            DbEntry entry = (DbEntry)o.Value;

            string line = "";
            int entry_count = 0;

            foreach (DictionaryEntry c in entry.hash) {
                string k = c.Key.ToString();
                string[] v = (string[])c.Value;

                if (k.Contains("PASSWORD")) //filter out the passwords
                    line += k + (char)127 + (char)127 + v[1] + (char)127 + v[2] + (char)127;
                else
                    line += k + (char)127 + v[0] + (char)127 + v[1] + (char)127 + v[2] + (char)127;

                entry_count++;
            }
            sb.Append(entry_count.ToString() + (char)127 + line);
        }

        return Encoding.Default.GetBytes(sb.ToString());
    }

    public static byte[] GetEquipTable() {
        if (lastCachedEquipVer < equipVer) {
            lastCachedEquip = GetTable(equip, equipVer);
            lastCachedEquipVer = equipVer;
        }

        return lastCachedEquip;
    }
    public static byte[] GetUsersTable() {
        if (lastCachedUsersVer < usersVer) {
            lastCachedUsers = GetTable(users, usersVer);
            lastCachedUsersVer = usersVer;
        }

        return lastCachedUsers;
    }

    public static bool SaveEntry(string[] array, string filename, SaveMethod method, in string performer, bool isUser) {
        Hashtable hash = new Hashtable();
        for (int i = 0; i < array.Length - 1; i += 2) { //copy from array to hash
            array[i] = array[i].ToUpper();
            if (hash.ContainsKey(array[i])) continue;
            if (filename.Length == 0 && array[i] == ".FILENAME") filename = array[i + 1];
            hash.Add(array[i], new string[] { array[i + 1], $"{performer}, { DateTime.Now.ToString(Strings.DATE_FORMAT)}", "" });
        }

        if (filename.Length == 0) filename = DateTime.Now.Ticks.ToString();
        bool exists = isUser ? users.ContainsKey(filename) : equip.ContainsKey(filename);


        DbEntry entry;
        if (exists)
            entry = isUser ? (DbEntry)users[filename] : (DbEntry)equip[filename];
        else
            entry = new DbEntry() {
                filename = DateTime.Now.Ticks.ToString(),
                hash = hash,
                isUser = isUser,
                write_lock = new object()
            };


        if (!exists) { //if don't exists, add to db
            if (isUser) {
                users.Add(filename, entry);
                usersVer = DateTime.Now.Ticks;
            } else {
                equip.Add(filename, entry);
                equipVer = DateTime.Now.Ticks;
            }

            if (!entry.hash.ContainsKey(".FILENAME"))
                entry.hash.Add(".FILENAME", new string[] { filename, "", "" });

            Write(entry, in performer);
            return true;
        }


        switch (method) { //if do exists
            case SaveMethod.Discard: //Ignore            
                return true;

            case SaveMethod.CreateNew: { //keep the old one and create new
                filename = new DateTime().Ticks.ToString();
                entry.hash[".FILENAME"] = new string[] { filename, "", "" };
                Write(entry, in performer);
                break;
            }

            case SaveMethod.Overwrite: { //overwrite the old file
                List<string> removed = new List<string>();
                foreach (DictionaryEntry o in entry.hash) if (!hash.ContainsKey(o.Key)) removed.Add(o.Key.ToString()); //list properties that have been removed

                lock (entry.write_lock) {
                    foreach (string o in removed) entry.hash.Remove(o); //remove deleted properties

                    foreach (DictionaryEntry o in hash)
                        if (entry.hash.ContainsKey(o.Key)) {
                            string[] old = (string[])entry.hash[o.Key];
                            entry.hash[o.Key] = (old[0] == ((string[])hash[o.Key])[0]) ? old : new string[] { ((string[])o.Value)[0], $"{performer}, {DateTime.Now.ToString(Strings.DATE_FORMAT)}", "" };
                        } else
                            entry.hash.Add(o.Key, new string[] { ((string[])o.Value)[0], $"{performer}, {DateTime.Now.ToString(Strings.DATE_FORMAT)}", "" });
                }
                Write(entry, in performer); //Write uses its own lock

                removed.Clear();
                break;
            }

            case SaveMethod.Append: { 
                lock (entry.write_lock) {
                    foreach (DictionaryEntry o in hash) {
                        if (entry.hash.ContainsKey(o.Key)) {
                            string[] old = (string[])entry.hash[o.Key];
                            entry.hash[o.Key] = (old[0] == ((string[])hash[o.Key])[0]) ? old : new string[] { ((string[])o.Value)[0], $"{performer}, {DateTime.Now.ToString(Strings.DATE_FORMAT)}", "" };
                        } else
                            entry.hash.Add(o.Key, new string[] { ((string[])o.Value)[0], $"{performer}, {DateTime.Now.ToString(Strings.DATE_FORMAT)}", "" });
                    }
                }
                Write(entry, in performer); //Write uses its own lock
                break;
            }
        }

        if (isUser)
            usersVer = DateTime.Now.Ticks;
        else
            equipVer = DateTime.Now.Ticks;

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

    public static byte[] SaveEquip(HttpListenerContext ctx, in string performer) {
        string payload;
        using (StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding))
            payload = reader.ReadToEnd();

        if (payload.Length == 0) return Strings.INV.Array;

        string[] split = payload.Split((char)127);
        if (split.Length < 4) return Strings.INF.Array; //not enough information

        Hashtable payloadHash = new Hashtable(); //payload as string

        string filename = "";
        for (int i = 0; i < split.Length - 1; i += 2) {
            split[i] = split[i].ToUpper();
            if (split[i] == ".FILENAME") filename = split[i + 1];

            //if (payloadHash.ContainsKey(split[i])) //if property exists append on it
            //    payloadHash[split[i]] = $"{payloadHash[split[i]]}; {split[i+1]}";
            //else
            //    payloadHash.Add(split[i], split[i+1]);

            payloadHash.Add(split[i], split[i + 1]);
        }

        if (filename.Length == 0) filename = DateTime.Now.Ticks.ToString();

        DbEntry entry;
        if (equip.ContainsKey(filename)) //existing entry
            entry = (DbEntry)equip[filename];

        else { //new entry
            entry = new DbEntry() {
                filename = DateTime.Now.Ticks.ToString(),
                hash = new Hashtable(),
                isUser = false,
                write_lock = new object()
            };

            foreach (DictionaryEntry o in payloadHash)
                entry.hash.Add(o.Key, new string[] { o.Value.ToString(), $"{performer}, {DateTime.Now.ToString(Strings.DATE_FORMAT)}", "" });

            equip.Add(filename, entry);
        }

        List<string> removed = new List<string>();
        foreach (DictionaryEntry o in entry.hash) if (!payloadHash.ContainsKey(o.Key)) removed.Add(o.Key.ToString());
        foreach (string o in removed) entry.hash.Remove(o);
        removed.Clear();

        lock (entry.write_lock) {
            foreach (DictionaryEntry o in payloadHash) {
                if (entry.hash.ContainsKey(o.Key)) { //overwrite property
                    string key = (string)o.Key;
                    string[] current = (string[])entry.hash[key];
                    if (key.Contains("PASSWORD")) {
                        if (o.Value.ToString().Length > 0) entry.hash[o.Key] = (current[0] == (string)payloadHash[o.Key]) ? current : new string[] { o.Value.ToString(), $"{performer}, {DateTime.Now.ToString(Strings.DATE_FORMAT)}", "" };
                    } else
                        entry.hash[o.Key] = (current[0] == (string)payloadHash[o.Key]) ? current : new string[] { o.Value.ToString(), $"{performer}, {DateTime.Now.ToString(Strings.DATE_FORMAT)}", "" };

                } else //new property
                    entry.hash.Add(o.Key, new string[] { o.Value.ToString(), $"{performer}, {DateTime.Now.ToString(Strings.DATE_FORMAT)}", "" });
            }

            //if hash don't have ".FILENAME" property, create it
            if (!entry.hash.ContainsKey(".FILENAME")) entry.hash.Add(".FILENAME", new string[] { filename, "", "" });
        }

        Write(entry, in performer); //Write uses its own lock

        equipVer = DateTime.Now.Ticks;
        BroadcastMessage("");
        return Encoding.UTF8.GetBytes($"ok{(char)127}{equipVer}");
    }

    public static byte[] DeleteEquip(string[] para, in string performer) {
        string filename;
        if (para.Length > 1)
            filename = para[1];
        else
            return Strings.INV.Array;

        if (equip.ContainsKey(filename)) {
            DbEntry entry = (DbEntry)equip[filename];

            lock (entry.write_lock) {
                try {
                    string fullpath = $"{Strings.DIR_EQUIP}_del";
                    DirectoryInfo dir = new DirectoryInfo(fullpath);
                    if (!dir.Exists) dir.Create();

                    File.Move($"{Strings.DIR_EQUIP}\\{filename}", $"{fullpath}\\{filename}");
                    equip.Remove(filename);

                } catch (Exception ex) {
                    Logging.Err(ex);
                }
            }

            Logging.Action(in performer, $"Delete equip: {filename}");

            equipVer = DateTime.Now.Ticks;
            BroadcastMessage("");
            return Encoding.UTF8.GetBytes($"ok{(char)127}{equipVer}");
        } else
            return Strings.FLE.Array;
    }

    public static byte[] SaveUser(HttpListenerContext ctx, in string performer) {
        string payload;
        using (StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding))
            payload = reader.ReadToEnd();

        if (payload.Length == 0) return Strings.INV.Array;

        string[] split = payload.Split((char)127);
        if (split.Length < 4) return Strings.INF.Array; //not enough information

        Hashtable payloadHash = new Hashtable(); //payload as string

        string filename = "";
        for (int i = 0; i < split.Length - 1; i += 2) {
            split[i] = split[i].ToUpper();
            if (split[i] == ".FILENAME") filename = split[i + 1];

            if (payloadHash.ContainsKey(split[i])) //if property exists append on it
                payloadHash[split[i]] = $"{payloadHash[split[i]]}; {split[i + 1]}";
            else
                payloadHash.Add(split[i], split[i + 1]);
        }

        if (filename.Length == 0) filename = DateTime.Now.Ticks.ToString();

        DbEntry entry;
        if (users.ContainsKey(filename)) //existing entry
            entry = (DbEntry)users[filename];
        else {
            entry = new DbEntry() { //new entry
                filename = DateTime.Now.Ticks.ToString(),
                hash = new Hashtable(),
                isUser = true,
                write_lock = new object()
            };

            foreach (DictionaryEntry o in payloadHash)
                entry.hash.Add(o.Key, new string[] { o.Value.ToString(), $"{performer}, {DateTime.Now.ToString(Strings.DATE_FORMAT)}", "" });

            users.Add(filename, entry);
        }

        List<string> removed = new List<string>();
        foreach (DictionaryEntry o in entry.hash) if (!payloadHash.ContainsKey(o.Key)) removed.Add(o.Key.ToString());
        foreach (string o in removed) entry.hash.Remove(o);
        removed.Clear();

        lock (entry.write_lock) {
            foreach (DictionaryEntry o in payloadHash) {
                if (entry.hash.ContainsKey(o.Key)) { //overwrite property
                    string key = (string)o.Key;
                    string[] current = (string[])entry.hash[key];
                    if (key.Contains("PASSWORD")) {
                        if (o.Value.ToString().Length > 0) entry.hash[o.Key] = (current[0] == (string)payloadHash[o.Key]) ? current : new string[] { o.Value.ToString(), $"{performer}, {DateTime.Now.ToString(Strings.DATE_FORMAT)}", "" };
                    } else
                        entry.hash[o.Key] = (current[0] == (string)payloadHash[o.Key]) ? current : new string[] { o.Value.ToString(), $"{performer}, {DateTime.Now.ToString(Strings.DATE_FORMAT)}", "" };
                } else //new property
                    entry.hash.Add(o.Key, new string[] { o.Value.ToString(), $"{performer}, {DateTime.Now.ToString(Strings.DATE_FORMAT)}", "" });
            }

            //if hash don't have ".FILENAME" property, create it
            if (!entry.hash.ContainsKey(".FILENAME")) entry.hash.Add(".FILENAME", new string[] { filename, "", "" });
        }

        Write(entry, in performer); //Write uses its own lock

        usersVer = DateTime.Now.Ticks;
        BroadcastMessage("");
        return Encoding.UTF8.GetBytes($"ok{(char)127}{usersVer}");
    }

    public static byte[] DeleteUser(string[] para, in string performer) {
        string filename;
        if (para.Length > 1)
            filename = para[1];
        else
            return Strings.INV.Array;

        if (users.ContainsKey(filename)) {
            DbEntry entry = (DbEntry)users[filename];

            lock (entry.write_lock) {
                try {
                    string fullpath = $"{Strings.DIR_USERS}_del";
                    DirectoryInfo dir = new DirectoryInfo(fullpath);
                    if (!dir.Exists) dir.Create();

                    File.Move($"{Strings.DIR_USERS}\\{filename}", $"{fullpath}\\{filename}");
                    users.Remove(filename);

                } catch (Exception ex) {
                    Logging.Err(ex);
                }
            }

            Logging.Action(in performer, $"Delete user: {filename}");

            usersVer = DateTime.Now.Ticks;
            BroadcastMessage("");
            return Encoding.UTF8.GetBytes($"ok{(char)127}{usersVer}");
        } else
            return Strings.FLE.Array;
    }

    public static void BroadcastMessage(string message) {
        new Thread(() => {
            //TODO: 
        }).Start();
    }

}
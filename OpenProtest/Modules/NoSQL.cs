using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.WebSockets;
using System.Text;
using System.Threading;

static class NoSQL {
    public const string DATE_FORMAT = "dd-MM-yyyy";
    public const string DATETIME_FORMAT = "ddd, dd MMM yyyy HH:mm:ss";
    public const string DATETIME_FORMAT_LONG = "dddd dd MMM yyyy HH:mm:ss";

    static readonly string DIR_EQUIP = $"{Directory.GetCurrentDirectory()}\\protest_data\\equip";
    static readonly string DIR_USERS = $"{Directory.GetCurrentDirectory()}\\protest_data\\users";

    public struct DbEntry {
        public string name;       //filename
        public bool isUser;
        //public string content;
        public Hashtable hash;
        public object write_lock; //lock obj
    }

    public enum SaveMethod { //if dublicate
        Ignore    = 0,
        CreateNew = 1,
        Overwrite = 2,
        Append    = 3,
        Merge     = 4
    }

    public static long equip_version = 0;
    public static long users_version = 0;

    public static Hashtable equip = new Hashtable();
    public static Hashtable users = new Hashtable();

    public static void InitDirs() {
        try {
            DirectoryInfo dirLastSeen = new DirectoryInfo($"{Directory.GetCurrentDirectory()}\\lastseen\\");
            DirectoryInfo dirData = new DirectoryInfo($"{Directory.GetCurrentDirectory()}\\protest_data\\");
            DirectoryInfo dirEquip = new DirectoryInfo(DIR_EQUIP);
            DirectoryInfo dirUsers = new DirectoryInfo(DIR_USERS);
            
            if (!dirLastSeen.Exists) dirLastSeen.Create();
            if (!dirData.Exists) dirData.Create();
            if (!dirEquip.Exists) dirEquip.Create();
            if (!dirUsers.Exists) dirUsers.Create();

        }  catch (Exception ex) {
            ErrorLog.Err(ex);
        } 
    }

    public static void LoadEquip() {
        equip_version = DateTime.Now.Ticks;

        DirectoryInfo dir = new DirectoryInfo(DIR_EQUIP);
        if (!dir.Exists) return;

        foreach (FileInfo f in dir.GetFiles()) {
            DbEntry entry = Read(f, false);
            if (entry.hash == null) continue;
            equip.Add(f.Name, entry);
        }
    }

    public static void LoadUsers() {
        users_version = DateTime.Now.Ticks;

        DirectoryInfo dir = new DirectoryInfo(DIR_USERS);
        if (!dir.Exists) return;

        foreach (FileInfo f in dir.GetFiles()) {
            DbEntry entry = Read(f, true);
            if (entry.hash == null) continue;
            users.Add(f.Name, entry);
        }
    }

    public static DbEntry Read(FileInfo f, bool isUser) {
        DbEntry entry = new DbEntry() {
            name = f.Name,
            hash = new Hashtable(),
            isUser = isUser,
            write_lock = new object()
        };

        try {
            if (f.Length < 2) throw new Exception("null file: " + f.FullName);
            byte[] bytes = File.ReadAllBytes(f.FullName);

            string content;
            if (bytes[0] == 127 && bytes[1] == 127) //encrypted
                content = Encoding.UTF8.GetString(Crypto.Decrypt(bytes.Skip(2).ToArray(), Program.DB_KEY));
            else //raw
                content = Encoding.UTF8.GetString(bytes);

            //entry.content = content;
            string[] split = content.Split((char)127);

            entry.hash.Add(".FILENAME", new string[] { f.Name, "", "" });

            for (int i = 0; i < split.Length - 3; i += 4)
                if (!entry.hash.ContainsKey(split[i]))
                    entry.hash.Add(split[i], new string[] { split[i + 1], split[i + 2], split[i + 3] });

        } catch (IOException ex) {
            entry.hash = null;
            ErrorLog.Err(ex);

        } catch (Exception ex) {
            entry.hash = null;
            ErrorLog.Err(ex);
        }

        return entry;
    }

    public static bool Write(DbEntry e, in string performer) {
        if (!e.hash.ContainsKey(".FILENAME")) return false;
        string filename = ((string[])e.hash[".FILENAME"])[0];
        
        byte[] raw = GetTargetEntry(e);
        byte[] encrypted = Crypto.Encrypt(raw, Program.DB_KEY);

        byte[] bytes = new byte[encrypted.Length + 2];
        Array.Copy(encrypted, 0, bytes, 2, encrypted.Length);
        bytes[0] = 127;
        bytes[1] = 127;

        try {
            lock (e.write_lock) 
                File.WriteAllBytes($"{(e.isUser ? DIR_USERS : DIR_EQUIP)}\\{filename}", bytes);            
        } catch (Exception ex) {
            ErrorLog.Err(ex);
            return false;
        }

        //para[i] = para[i].Replace("%7F", ""); //remove asc127 before unescape, to prevent data corruption and unwanted insertion (VERY IMPORTAND!)

        ActionLog.Action(in performer, $"DB write: {(e.isUser? "user" : "equip")} {filename}");

        return true;
    }

    public static byte[] GetTable(Hashtable table, in long version) { //serialize and send (hash of DbEntry)
        StringBuilder sb = new StringBuilder($"{version}{(char)127}");

        foreach (DictionaryEntry o in table) {
            DbEntry entry = (DbEntry)o.Value;
                        
            string line = "";
            int entry_count = 0;

            foreach (DictionaryEntry c in entry.hash) {
                string k = c.Key.ToString();
                string[] v = (string[]) c.Value;

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

    public static byte[] GetTargetEquip(string[] para) {
        if (para.Length < 2) return null;
        if (!equip.ContainsKey(para[1])) return null;

        DbEntry entry = (DbEntry)equip[para[1]];
        return GetTargetEntry(entry);
    }

    public static byte[] GetTargetUser(string[] para) {
        if (para.Length < 2) return null;
        if (!users.ContainsKey(para[1])) return null;

        DbEntry entry = (DbEntry)users[para[1]];
        return GetTargetEntry(entry);
    }

    public static byte[] GetTargetEntry(DbEntry entry) {
        StringBuilder payload = new StringBuilder();

        foreach (DictionaryEntry o in entry.hash) {
            string key = o.Key.ToString();
            if (key.Length == 0) continue;
            string[] value = (string[])o.Value;
            payload.Append($"{key}{(char)127}{value[0]}{(char)127}{value[1]}{(char)127}{value[2]}{(char)127}"); //[property name] [value] [performer] [placeholder]
        }
        return Encoding.UTF8.GetBytes(payload.ToString());
    }

    public static bool SaveEntry(string[] array, string filename, SaveMethod method, in string performer, bool isUser) {
        Hashtable hash = new Hashtable();
        for (int i = 0; i < array.Length - 1; i += 2) { //copy from array to hash
            array[i] = array[i].ToUpper();
            if (hash.ContainsKey(array[i])) continue;
            if (filename.Length == 0 && array[i] == ".FILENAME") filename = array[i + 1];
            hash.Add(array[i], new string[] { array[i + 1], $"{performer}, {DateTime.Now.ToString(DATE_FORMAT)}", "" });
        }
        
        if (filename.Length == 0) filename = DateTime.Now.Ticks.ToString();
        bool exists = isUser? users.ContainsKey(filename) : equip.ContainsKey(filename);

        DbEntry entry;
        if (exists)
            entry = isUser? (DbEntry)users[filename] : (DbEntry)equip[filename];
        else
            entry = new DbEntry() {
                name = DateTime.Now.Ticks.ToString(),
                hash = hash,
                isUser = isUser,
                write_lock = new object()
            };

        if (!exists) { //if don't exists, add to db
            if (isUser) {
                users.Add(filename, entry);
                users_version = DateTime.Now.Ticks;
            } else {
                equip.Add(filename, entry);
                equip_version = DateTime.Now.Ticks;
            }

            if (!entry.hash.ContainsKey(".FILENAME"))
                entry.hash.Add(".FILENAME", new string[]{ filename, "", ""});

            Write(entry, in performer);
            return true;
        }

        //exists
        switch (method) {
            case SaveMethod.Ignore: //Ignore            
            return true;

            case SaveMethod.CreateNew: { //CreateNew
                    filename = new DateTime().Ticks.ToString();
                    entry.hash[".FILENAME"] = new string[] { filename, "", "" };
                    Write(entry, in performer);
                    return true;
                }

            case SaveMethod.Overwrite: { //Overwrite
                    List<string> removed = new List<string>();
                    foreach (DictionaryEntry o in entry.hash) if (!hash.ContainsKey(o.Key)) removed.Add(o.Key.ToString()); //list properties that have been removed

                    lock (entry.write_lock) {
                        foreach (string o in removed) entry.hash.Remove(o); //remove deleted properties

                        foreach (DictionaryEntry o in hash) //append
                            if (entry.hash.ContainsKey(o.Key)) {
                                string[] current = (string[])entry.hash[o.Key];
                                entry.hash[o.Key] = (current[0] == ((string[])hash[o.Key])[0]) ? current : new string[] { ((string[])o.Value)[0], $"{performer}, {DateTime.Now.ToString(DATE_FORMAT)}", "" };
                            } else
                                entry.hash.Add(o.Key, new string[] { ((string[])o.Value)[0], $"{performer}, {DateTime.Now.ToString(DATE_FORMAT)}", "" });
                    }
                    Write(entry, in performer); //Write uses its own lock

                    removed.Clear();
                    return true;
                }

            case SaveMethod.Append: { //Append
                    lock (entry.write_lock) {
                        foreach (DictionaryEntry o in hash) {
                            if (entry.hash.ContainsKey(o.Key)) {
                                string[] current = (string[])entry.hash[o.Key];
                                entry.hash[o.Key] = (current[0] == ((string[])hash[o.Key])[0]) ? current : new string[] { ((string[])o.Value)[0], $"{performer}, {DateTime.Now.ToString(DATE_FORMAT)}", "" };
                            } else
                                entry.hash.Add(o.Key, new string[] { ((string[])o.Value)[0], $"{performer}, {DateTime.Now.ToString(DATE_FORMAT)}", "" });
                        }
                    }
                    Write(entry, in performer); //Write uses its own lock
                    return true;
                }
        }

        if (isUser) 
            users_version = DateTime.Now.Ticks;
        else 
            equip_version = DateTime.Now.Ticks;
               
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

        property = UrlDecode(property);

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

        if (payload.Length == 0) return Tools.INV.Array;

        string[] split = payload.Split((char)127);
        if (split.Length < 4) return Tools.INF.Array; //not enough information

        Hashtable payloadHash = new Hashtable(); //payload as string

        string filename = "";
        for (int i = 0; i < split.Length - 1; i += 2) {
            split[i] = split[i].ToUpper();
            if (split[i] == ".FILENAME") filename = split[i + 1];

            if (payloadHash.ContainsKey(split[i])) //if property exists append on it
                payloadHash[split[i]] = $"{payloadHash[split[i]]}; {split[i+1]}";
            else
                payloadHash.Add(split[i], split[i + 1]);
        }

        if (filename.Length == 0) filename = DateTime.Now.Ticks.ToString();

        DbEntry entry;
        if (equip.ContainsKey(filename)) //existing entry
            entry = (DbEntry)equip[filename];

        else { //new entry
            entry = new DbEntry() {
                name = DateTime.Now.Ticks.ToString(),
                hash = new Hashtable(),
                isUser = false,
                write_lock = new object()
            };

            foreach (DictionaryEntry o in payloadHash)
                entry.hash.Add(o.Key, new string[] { o.Value.ToString(), $"{performer}, {DateTime.Now.ToString(DATE_FORMAT)}", "" });

            NoSQL.equip.Add(filename, entry);
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
                        if (o.Value.ToString().Length > 0) entry.hash[o.Key] = (current[0] == (string)payloadHash[o.Key]) ? current : new string[] { o.Value.ToString(), $"{performer}, {DateTime.Now.ToString(DATE_FORMAT)}", "" };
                    } else
                        entry.hash[o.Key] = (current[0] == (string)payloadHash[o.Key]) ? current : new string[] { o.Value.ToString(), $"{performer}, {DateTime.Now.ToString(DATE_FORMAT)}", "" };

                } else //new property
                    entry.hash.Add(o.Key, new string[] { o.Value.ToString(), $"{performer}, {DateTime.Now.ToString(DATE_FORMAT)}", "" });
            }

            //if hash don't have ".FILENAME" property, create it
            if (!entry.hash.ContainsKey(".FILENAME")) entry.hash.Add(".FILENAME", new string[] {filename, "", ""});
        }

        Write(entry, in performer); //Write uses its own lock

        equip_version = DateTime.Now.Ticks;
        BroadcastMessage($"modifye{(char)127}{equip_version}{(char)127}{filename}");
        return GetTable(new Hashtable() { { filename, entry } }, equip_version);
    }

    public static byte[] DeleteEquip(string[] para, in string performer) {
        string filename = null;
        if (para.Length > 1) 
            filename = para[1];
        else 
            return Tools.INV.Array;

        if (NoSQL.equip.ContainsKey(filename)) {
            DbEntry entry = (DbEntry)NoSQL.equip[filename];

            lock(entry.write_lock) {
                try {
                    string fullpath = $"{DIR_EQUIP}_del";
                    DirectoryInfo dir = new DirectoryInfo(fullpath);
                    if (!dir.Exists) dir.Create();

                    File.Move($"{DIR_EQUIP}\\{filename}", $"{fullpath}\\{filename}");
                    NoSQL.equip.Remove(filename);

                } catch (Exception ex) {
                    ErrorLog.Err(ex);
                }
            }

            ActionLog.Action(in performer, $"Delete equip: {filename}");

            equip_version = DateTime.Now.Ticks;
            BroadcastMessage($"dele{(char)127}{equip_version}{(char)127}{filename}");
            return Encoding.UTF8.GetBytes($"ok{(char)127}{equip_version}");
        } else
            return Tools.FLE.Array;
    }

    public static byte[] SaveUser(HttpListenerContext ctx, in string performer) {
        string payload;
        using (StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding))
            payload = reader.ReadToEnd();

        if (payload.Length == 0) return Tools.INV.Array;

        string[] split = payload.Split((char)127);
        if (split.Length < 4) return Tools.INF.Array; //not enough information

        Hashtable payloadHash = new Hashtable(); //payload as string

        string filename = "";
        for (int i = 0; i < split.Length - 1; i += 2) {
            split[i] = split[i].ToUpper();
            if (split[i] == ".FILENAME") filename = split[i + 1];

            if (payloadHash.ContainsKey(split[i])) //if property exists append on it
                payloadHash[split[i]] = $"{payloadHash[split[i]]}; {split[i+1]}";
            else
                payloadHash.Add(split[i], split[i+1]);
        }

        if (filename.Length == 0) filename = DateTime.Now.Ticks.ToString();

        DbEntry entry;
        if (users.ContainsKey(filename)) //existing entry
            entry = (DbEntry)users[filename];
        else {
            entry = new DbEntry() { //new entry
                name = DateTime.Now.Ticks.ToString(),
                hash = new Hashtable(),
                isUser = true,
                write_lock = new object()
            };

            foreach (DictionaryEntry o in payloadHash) 
                entry.hash.Add(o.Key, new string[] { o.Value.ToString(), $"{performer}, {DateTime.Now.ToString(DATE_FORMAT)}", "" });

            NoSQL.users.Add(filename, entry);
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
                        if (o.Value.ToString().Length > 0) entry.hash[o.Key] = (current[0] == (string)payloadHash[o.Key]) ? current : new string[] { o.Value.ToString(), $"{performer}, {DateTime.Now.ToString(DATE_FORMAT)}", "" };
                    } else
                        entry.hash[o.Key] = (current[0] == (string)payloadHash[o.Key]) ? current : new string[] { o.Value.ToString(), $"{performer}, {DateTime.Now.ToString(DATE_FORMAT)}", "" };
                } else //new property
                    entry.hash.Add(o.Key, new string[] { o.Value.ToString(), $"{performer}, {DateTime.Now.ToString(DATE_FORMAT)}", "" });
            }

            //if hash don't have ".FILENAME" property, create it
            if (!entry.hash.ContainsKey(".FILENAME")) entry.hash.Add(".FILENAME", new string[] { filename, "", "" });    
        }

        Write(entry, in performer); //Write uses its own lock

        users_version = DateTime.Now.Ticks;
        BroadcastMessage($"modifyu{(char)127}{users_version}{(char)127}{filename}");
        return GetTable(new Hashtable() { { filename, entry } }, users_version);
    }

    public static byte[] DeleteUser(string[] para, in string performer) {
        string filename = null;
        if (para.Length > 1)
            filename = para[1];
        else
            return Tools.INV.Array;

        if (NoSQL.users.ContainsKey(filename)) {
            DbEntry entry = (DbEntry)NoSQL.users[filename];

            lock (entry.write_lock) {
                try {
                    string fullpath = $"{DIR_USERS}_del";
                    DirectoryInfo dir = new DirectoryInfo(fullpath);
                    if (!dir.Exists) dir.Create();

                    File.Move($"{DIR_USERS}\\{filename}", $"{fullpath}\\{filename}");
                    NoSQL.users.Remove(filename);

                } catch (Exception ex) {
                    ErrorLog.Err(ex);
                }
            }

            ActionLog.Action(in performer, $"Delete user: {filename}");

            users_version = DateTime.Now.Ticks;
            BroadcastMessage($"delu{(char)127}{users_version}{(char)127}{filename}");
            return Encoding.UTF8.GetBytes($"ok{(char)127}{users_version}");
        } else
            return Tools.FLE.Array;
    }
           
    public static void BroadcastMessage(string message) {
        new Thread(()=> {
            ArraySegment<byte> array = new ArraySegment<byte>(Encoding.UTF8.GetBytes(message));
            Thread.Sleep(1000);
            lock (Tools.pt_lock) {
                foreach (DictionaryEntry o in Tools.ptConnections)
                    try {
                        WebSocket ws = (WebSocket)o.Value;
                        if (ws.State != WebSocketState.Open) continue;
                        ws.SendAsync(array, WebSocketMessageType.Text, true, CancellationToken.None);
                    } catch { }
            }
        }).Start();
    }


    public static string UrlDecode(string url) {
        string s = url;

        s = s.Replace("%0D%0A", "\n");
        //s = s.Replace("%0A", "\n");
        //s = s.Replace("%0D", "\n");

        //s = s.Replace("+", " ");
        s = s.Replace("%20", " ");
        s = s.Replace("%21", "!");
        s = s.Replace("%22", "\"");
        s = s.Replace("%23", "#");
        s = s.Replace("%24", "$");
        s = s.Replace("%25", "%");
        s = s.Replace("%26", "&");
        s = s.Replace("%27", "'");
        s = s.Replace("%28", "(");
        s = s.Replace("%29", ")");
        s = s.Replace("%2A", "*");
        s = s.Replace("%2B", "+");
        s = s.Replace("%2C", ",");
        s = s.Replace("%2D", "-");
        s = s.Replace("%2E", ".");
        s = s.Replace("%2F", "/");

        s = s.Replace("%3A", ":");
        s = s.Replace("%3B", ";");
        s = s.Replace("%3C", "<");
        s = s.Replace("%3D", "=");
        s = s.Replace("%3E", ">");
        s = s.Replace("%3F", "?");
        s = s.Replace("%40", "@");

        s = s.Replace("%5B", "[");
        s = s.Replace("%5C", "\\");
        s = s.Replace("%5D", "]");
        s = s.Replace("%5E", "^");
        s = s.Replace("%5F", "_");
        s = s.Replace("%60", "`");

        s = s.Replace("%7B", "{");
        s = s.Replace("%7C", "|");
        s = s.Replace("%7D", "}");
        s = s.Replace("%7E", "~");

        s = s.Replace("%7F", ((char)127).ToString());

        //s = s.Replace("%99", "™");
        //s = s.Replace("%A9", "©");
        //s = s.Replace("%AE", "®");

        return s;
    }
    
    public static void FindDuplicates(Hashtable table, string uniqueKey) {

        List<string> keys = new List<string>();
        foreach (DictionaryEntry o in table) {
            DbEntry entry = (DbEntry)o.Value;
            if (!entry.hash.ContainsKey(uniqueKey)) continue;
            if (((string[])entry.hash[uniqueKey])[0].Length == 0) continue;
            keys.Add(((string[])entry.hash[".FILENAME"])[0]);
        }

        Console.ForegroundColor = ConsoleColor.Yellow;

        for (int i = 0; i < keys.Count; i++) {
            DbEntry entry = (DbEntry)table[keys[i]];
            string uid = ((string[])entry.hash[uniqueKey])[0];

            for (int j = i+1; j < keys.Count; j++) {
                DbEntry e2 = (DbEntry)table[keys[j]];

                if (((string[])e2.hash[uniqueKey])[0] == uid && uid != "(DHCP)")
                    Console.WriteLine($"Duplicate record : {uniqueKey} : {uid.PadRight(20)} {keys[i]} {keys[j]}");
            }
        }
        
        Console.ResetColor();
    }
}
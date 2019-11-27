using System;
using System.Collections;
using System.Linq;
using System.Text;
using System.Collections.Generic;

class PasswordStrength {
    static readonly string[] BLACKLIST = new string[] {
            "123456789",
            "12345678",
            "1234567",
            "123456",
            "12345",
            "1234",
            "123",
            "987654321",
            "87654321",
            "7654321",
            "654321",
            "54321",
            "4321",
            "321",
            "666",
            "abc",
            "qwerty",
            "!@#$%^&*",
            "!\"#$%^&*",
            "pass",
            "pa55",
            "word",
            "w0rd",
            "admin",
            "root",
            "public",
            "welcome",
            "login",
            "master",
            "hello",
            "letmein",
            "sunshine",
            "love",
            "princess",
            "monkey",
            "donald",
            "football",
            "whatever",
            "asshole",
            "dragon"
    };

    public static double Entropy(string password, string[] related = null) {

        for (int i = 0; i < BLACKLIST.Length; i++)
            if (password.IndexOf(BLACKLIST[i], StringComparison.InvariantCultureIgnoreCase) > -1) password = password.Replace(BLACKLIST[i], "");

        if (related != null)
        for (int i = 0; i < related.Length; i++)
            if (related[i].Length !=0)
                if (password.IndexOf(related[i], StringComparison.InvariantCultureIgnoreCase) > -1) password = password.Replace(related[i], "");

        bool hasNumbers = false;
        bool hasUppercase = false;
        bool hasLowercase = false;
        bool hasSymbols = false;

        int len = password.Length;

        for (int i=0; i<len; i++) {
            byte b = (byte) password[i];

            if (b > 47 && b < 58) hasNumbers= true;
            else if(b > 64 && b < 91) hasUppercase = true;
            else if (b > 96 && b < 123) hasLowercase = true;
            else hasSymbols = true;
        }

        int pool = 0;
        if (hasNumbers) pool += 10;
        if (hasUppercase) pool += 26;
        if (hasLowercase) pool += 26;
        if (hasSymbols) pool += 32;

        double entropy = Math.Log(Math.Pow(pool, len), 2);
        return entropy;
    }
        
    public static byte[] GetEntropy() {
        StringBuilder sb = new StringBuilder();

        foreach (DictionaryEntry o in NoSQL.users) {
            NoSQL.DbEntry entry = (NoSQL.DbEntry)o.Value;
            List<string> words = new List<string>();

            foreach (DictionaryEntry p in entry.hash) {
                if (p.Key.ToString().Contains("PASSWORD")) continue;
                
                string[] w = ((string[])p.Value)[0].ToString().ToLower().Split(' ');
                for (int i = 0; i < w.Length; i++) 
                    if (w[i].Length > 2 && !words.Contains(w[i])) words.Add(w[i]);                
            }

            string filename = ((string[])entry.hash[".FILENAME"])[0];

            foreach (DictionaryEntry p in entry.hash) {
                if (!p.Key.ToString().Contains("PASSWORD")) continue;
                string[] value = (string[])p.Value;               

                string password = value[0];
                if (password.Length == 0) continue;
                string modified = value[1];
                int entropy = (int)Entropy(password, words.ToArray());
                string name = "";

                if (entry.hash.ContainsKey("E-MAIL"))
                    if (name.Length == 0) name = ((string[])entry.hash["E-MAIL"])[0];

                if (entry.hash.ContainsKey("USERNAME")) 
                    if (name.Length == 0) name = ((string[])entry.hash["USERNAME"])[0];
                
                if (entry.hash.ContainsKey("DISPLAY NAME")) 
                    if (name.Length == 0) name = ((string[])entry.hash["DISPLAY NAME"])[0];

                sb.Append($"u{(char)127}{filename}{(char)127}{name}{(char)127}{entropy}{(char)127}{modified}{(char)127}");
            }
        }
        
        foreach (DictionaryEntry o in NoSQL.equip) {
            NoSQL.DbEntry entry = (NoSQL.DbEntry)o.Value;
            List<string> words = new List<string>();

            foreach (DictionaryEntry p in entry.hash) {
                if (p.Key.ToString().Contains("PASSWORD")) continue;

                string[] w = ((string[])p.Value)[0].ToString().ToLower().Split(' ');
                for (int i = 0; i < w.Length; i++)
                    if (w[i].Length > 2 && !words.Contains(w[i])) words.Add(w[i]);
            }

            string filename = ((string[])entry.hash[".FILENAME"])[0];

            foreach (DictionaryEntry p in entry.hash) {
                if (!p.Key.ToString().Contains("PASSWORD")) continue;
                string[] value = (string[])p.Value;

                string password = value[0];
                if (password.Length == 0) continue;
                string modified = value[1];
                int entropy = (int)Entropy(password, words.ToArray());
                string name = "";

                if (entry.hash.ContainsKey("NAME"))
                    if (name.Length == 0) name = ((string[])entry.hash["NAME"])[0];

                if (entry.hash.ContainsKey("HOSTNAME")) 
                    if (name.Length == 0) name = ((string[])entry.hash["HOSTNAME"])[0];                

                if (entry.hash.ContainsKey("IP")) 
                    if (name.Length == 0) name = ((string[])entry.hash["IP"])[0];                

                sb.Append($"e{(char)127}{filename}{(char)127}{name}{(char)127}{entropy}{(char)127}{modified}{(char)127}");
            }
        }

        return Encoding.UTF8.GetBytes(sb.ToString());
    }

}
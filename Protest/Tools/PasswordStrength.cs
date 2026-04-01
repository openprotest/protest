using System.Text;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Mail;
using System.Threading;
using System.Numerics;
using System.Text.Json;

namespace Protest.Tools;

internal static class PasswordStrength {
    static private readonly string[] COMMON = new string[] {
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

    static private readonly JsonSerializerOptions emailProfilesSerializerOptions;

    static PasswordStrength() {
        emailProfilesSerializerOptions = new JsonSerializerOptions();
        emailProfilesSerializerOptions.Converters.Add(new SmtpProfilesJsonConverter(false));
    }

    public static double Entropy(string password, string[] related = null) {
        return Entropy(password, out _, out _, related);
    }

    public static double Entropy(string password, out int length, out int pool, string[] related = null) {
        for (int i = 0; i < COMMON.Length; i++) {
            if (password.IndexOf(COMMON[i], StringComparison.InvariantCultureIgnoreCase) > -1) {
                password = password.Replace(COMMON[i], String.Empty);
            }
        }

        if (related != null) {
            for (int i = 0; i < related.Length; i++) {
                if (related[i].Length != 0 && password.IndexOf(related[i], StringComparison.InvariantCultureIgnoreCase) > -1) {
                    password = password.Replace(related[i], String.Empty);
                }
            }
        }

        bool hasNumbers = false, hasUppercase = false, hasLowercase = false, hasSymbols = false;
        int len = password.Length;

        for (int i = 0; i < len; i++) {
            byte b = (byte)password[i];
            if (b > 47 && b < 58) {
                hasNumbers = true;
            }
            else if (b > 64 && b < 91) {
                hasUppercase = true;
            }
            else if (b > 96 && b < 123) {
                hasLowercase = true;
            }
            else {
                hasSymbols = true;
            }
        }

        length = password.Length;

        pool = 0;
        if (hasNumbers)   pool += 10;
        if (hasUppercase) pool += 26;
        if (hasLowercase) pool += 26;
        if (hasSymbols)   pool += 30;

        double entropy = Math.Log(Math.Pow(pool, len), 2);
        //same as:       Math.Log(pool, 2) * len

        return entropy;
    }

    public static byte[] GetEntropy() {
        StringBuilder builder = new StringBuilder();
        builder.Append('[');

        bool first = true;
        foreach (Database.Entry entry in DatabaseInstances.users.dictionary.Values) {
            List<string> words = new List<string>();
            foreach (KeyValuePair<string, Database.Attribute> pair in entry.attributes) {
                if (pair.Key.Contains("password")) continue;

                string[] w = pair.Value.value.ToLower().Split(' ');
                for (int i = 0; i < w.Length; i++) {
                    if (w[i].Length > 2 && !words.Contains(w[i])) {
                        words.Add(w[i]);
                    }
                }
            }

            foreach (KeyValuePair<string, Database.Attribute> pair in entry.attributes) {
                if (!pair.Key.Contains("password")) continue;

                string password = pair.Value.value;
                if (String.IsNullOrEmpty(password)) continue;

                int entropy   = (int)Entropy(password, out int length, out int pool, words.ToArray());
                string ttc    = CalculateTtc(length, pool);
                long modified = pair.Value.date;
                string name   = String.Empty;
                //string mail   = String.Empty;

                if (entry.attributes.TryGetValue("username", out Database.Attribute _username)) {
                    name = _username.value;
                }

                //if (entry.attributes.TryGetValue("e-mail", out Database.Attribute _mail)) {
                //    mail = _mail.value;
                //}

                if (!first) {
                    builder.Append(',');
                }

                builder.Append("{\"type\":\"user\",");
                builder.Append($"\"file\":\"{Data.EscapeJsonText(entry.filename)}\",");
                builder.Append($"\"name\":\"{Data.EscapeJsonText(name)}\",");
                //sb.Append($"\"mail\":\"{mail}\",");
                builder.Append($"\"entropy\":{entropy},");
                builder.Append($"\"attr\":\"{Data.EscapeJsonText(pair.Key)}\",");
                builder.Append($"\"date\":{modified},");
                builder.Append($"\"ttc\":\"{ttc}\"");
                builder.Append('}');

                first = false;
            }
        }

        foreach (Database.Entry entry in DatabaseInstances.devices.dictionary.Values) {
            List<string> words = new List<string>();
            foreach (KeyValuePair<string, Database.Attribute> pair in entry.attributes) {
                if (pair.Key.Contains("password")) continue;

                string[] w = pair.Value.value.ToLower().Split(' ');
                for (int i = 0; i < w.Length; i++) {
                    if (w[i].Length > 2 && !words.Contains(w[i])) {
                        words.Add(w[i]);
                    }
                }
            }

            foreach (KeyValuePair<string, Database.Attribute> pair in entry.attributes) {
                if (!pair.Key.Contains("password")) continue;

                string password = pair.Value.value;
                if (String.IsNullOrEmpty(password)) continue;

                int entropy = (int)Entropy(password, out int length, out int pool, words.ToArray());
                string ttc = CalculateTtc(length, pool);
                long modified = pair.Value.date;
                string name = String.Empty;

                if (entry.attributes.TryGetValue("name", out Database.Attribute _name)) {
                    if (name.Length == 0) {
                        name = _name.value;
                    }
                }

                if (entry.attributes.TryGetValue("hostname", out Database.Attribute _hostname)) {
                    if (name.Length == 0) {
                        name = _hostname.value;
                    }
                }

                if (entry.attributes.TryGetValue("ip", out Database.Attribute _ip)) {
                    if (name.Length == 0) {
                        name = _ip.value;
                    }
                }

                if (!first) {
                    builder.Append(',');
                }

                builder.Append("{\"type\":\"device\",");
                builder.Append($"\"file\":\"{entry.filename}\",");
                builder.Append($"\"name\":\"{name}\",");
                builder.Append($"\"entropy\":{entropy},");
                //sb.Append($"\"attr\":\"{pair.Key}\",");
                builder.Append($"\"date\":{modified},");
                builder.Append($"\"ttc\":\"{ttc}\"");
                builder.Append('}');

                first = false;
            }
        }

        builder.Append(']');

        return Encoding.UTF8.GetBytes(builder.ToString());
    }

    public static string CalculateTtc(int length, int pool) {
        try {
            BigInteger gps = 500_000_000_000; //guesses per seconds
            BigInteger combinations = BigInteger.Pow(pool, length);
            BigInteger stc = combinations / gps; //seconds to crack

            BigInteger EON = 365 * 24 * 3600;
            EON *= 1_000_000_000;
            BigInteger MILLENNIUM = 365 * 24 * 3600;
            MILLENNIUM *= 1000;

            BigInteger eons = stc / EON;
            stc -= eons * EON;

            if (eons > 1) {
                return "Eons";
            }

            BigInteger millenniums = stc / MILLENNIUM;
            stc -= millenniums * MILLENNIUM;

            BigInteger years = stc / (365 * 24 * 3600);
            stc -= years * (365 * 24 * 3600);

            BigInteger days = stc / (24 * 3600);
            stc -= days * (24 * 3600);

            BigInteger hours = stc / 3600;
            stc -= hours * 3600;

            BigInteger minutes = stc / 60;
            stc -= minutes * 60;

            BigInteger seconds = stc;


            string ttc = String.Empty;
            if (eons != 0)        ttc = eons == 1 ? $"1 eon, " : $"{eons} eons, ";
            if (millenniums != 0) ttc += millenniums == 1 ? $"1 millennium, " : $"{millenniums} millenniums, ";
            if (years != 0)       ttc += years == 1 ? $"1 year, " : $"{years} years, ";
            if (days != 0)        ttc += days == 1 ? $"1 day, " : $"{days} days, ";
            if (hours != 0)       ttc += hours == 1 ? $"1 hour, " : $"{hours} hours, ";
            if (minutes != 0)     ttc += minutes == 1 ? $"1 minute, " : $"{minutes} minutes, ";

            if (seconds != 0) {
                if (ttc.Length == 0) {
                    ttc += seconds == 1 ? $"a second" : $"{seconds} seconds";
                }
                else {
                    ttc += seconds == 1 ? $"and 1 second" : $"and {seconds} seconds";
                }
            }

            if (ttc.EndsWith(", ")) {
                ttc = ttc[..^2];
            }

            if (ttc.Length == 0) {
                ttc = "less than a second";
            }

            return ttc;
        }
        catch {
            return null;
        }
    }
}
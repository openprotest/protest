using System.Text;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Mail;
using System.Threading;
using System.Numerics;
using System.Text.Json;

namespace Protest.Tools;

public static class PasswordStrength {
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
        for (int i = 0; i < COMMON.Length; i++)
            if (password.IndexOf(COMMON[i], StringComparison.InvariantCultureIgnoreCase) > -1)
                password = password.Replace(COMMON[i], String.Empty);

        if (related != null)
            for (int i = 0; i < related.Length; i++)
                if (related[i].Length != 0)
                    if (password.IndexOf(related[i], StringComparison.InvariantCultureIgnoreCase) > -1)
                        password = password.Replace(related[i], String.Empty);

        bool hasNumbers = false, hasUppercase = false, hasLowercase = false, hasSymbols = false;
        int len = password.Length;

        for (int i = 0; i < len; i++) {
            byte b = (byte)password[i];
            if (b > 47 && b < 58)
                hasNumbers = true;
            else if (b > 64 && b < 91)
                hasUppercase = true;
            else if (b > 96 && b < 123)
                hasLowercase = true;
            else
                hasSymbols = true;
        }

        length = password.Length;

        pool = 0;
        if (hasNumbers)
            pool += 10;
        if (hasUppercase)
            pool += 26;
        if (hasLowercase)
            pool += 26;
        if (hasSymbols)
            pool += 30;

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
                if (pair.Key.Contains("password"))
                    continue;

                string[] w = pair.Value.value.ToLower().Split(' ');
                for (int i = 0; i < w.Length; i++) {
                    if (w[i].Length > 2 && !words.Contains(w[i]))
                        words.Add(w[i]);
                }
            }

            foreach (KeyValuePair<string, Database.Attribute> pair in entry.attributes) {
                if (!pair.Key.Contains("password"))
                    continue;

                string password = pair.Value.value;
                if (String.IsNullOrEmpty(password)) continue;

                int entropy   = (int)Entropy(password, out int length, out int pool, words.ToArray());
                string ttc    = CalculateTtc(length, pool);
                long modified = pair.Value.date;
                string name   = String.Empty;
                string mail   = String.Empty;

                if (entry.attributes.TryGetValue("username", out Database.Attribute _username)) {
                    name = _username.value;
                }

                if (entry.attributes.TryGetValue("e-mail", out Database.Attribute _mail)) {
                    mail = _mail.value;
                }

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
                if (pair.Key.Contains("password"))
                    continue;

                string[] w = pair.Value.value.ToLower().Split(' ');
                for (int i = 0; i < w.Length; i++) {
                    if (w[i].Length > 2 && !words.Contains(w[i]))
                        words.Add(w[i]);
                }
            }

            foreach (KeyValuePair<string, Database.Attribute> pair in entry.attributes) {
                if (!pair.Key.Contains("password"))
                    continue;

                string password = pair.Value.value;
                if (String.IsNullOrEmpty(password))
                    continue;

                int entropy = (int)Entropy(password, out int length, out int pool, words.ToArray());
                string ttc = CalculateTtc(length, pool);
                long modified = pair.Value.date;
                string name = String.Empty;

                if (entry.attributes.TryGetValue("name", out Database.Attribute _name)) {
                    if (name.Length == 0)
                        name = _name.value;
                }

                if (entry.attributes.TryGetValue("hostname", out Database.Attribute _hostname)) {
                    if (name.Length == 0)
                        name = _hostname.value;
                }

                if (entry.attributes.TryGetValue("ip", out Database.Attribute _ip)) {
                    if (name.Length == 0)
                        name = _ip.value;
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
            if (eons != 0)
                ttc = eons == 1 ? $"1 eon, " : $"{eons} eons, ";
            if (millenniums != 0)
                ttc += millenniums == 1 ? $"1 millennium, " : $"{millenniums} millenniums, ";
            if (years != 0)
                ttc += years == 1 ? $"1 year, " : $"{years} years, ";
            if (days != 0)
                ttc += days == 1 ? $"1 day, " : $"{days} days, ";
            if (hours != 0)
                ttc += hours == 1 ? $"1 hour, " : $"{hours} hours, ";
            if (minutes != 0)
                ttc += minutes == 1 ? $"1 minute, " : $"{minutes} minutes, ";

            if (seconds != 0) {
                if (ttc.Length == 0) {
                    ttc += seconds == 1 ? $"a second" : $"{seconds} seconds";
                }
                else {
                    ttc += seconds == 1 ? $"and 1 second" : $"and {seconds} seconds";
                }
            }

            if (ttc.EndsWith(", "))
                ttc = ttc[..^2];

            if (ttc.Length == 0)
                ttc = "less then a second";

            return ttc;
        }
        catch {
            return null;
        }
    }

    public static byte[] GandalfThreadWrapper(HttpListenerContext ctx, string origin) {
        string payload;
        using (StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding))
            payload = reader.ReadToEnd();

        string[] split = payload.Split((char)127);
        if (split.Length < 4)
            return Data.CODE_INVALID_ARGUMENT.Array;

        Thread thread = new Thread(() => GandalfRequest(split)) {
            Priority = ThreadPriority.BelowNormal
        };
        thread.Start();

        Logger.Action(origin, $"Send email notification to users with weak passwords");

        return Data.CODE_OK.Array;
    }

    private static void GandalfRequest(string[] split) {
        _ = double.TryParse(split[0], out double threshold);
        Guid smtpGuid = new Guid(split[1]);

        string server = null;
        int port = 587;
        string sender = null;
        string username = null;
        string password = null;
        bool ssl = true;

        if (!File.Exists(Data.SMTP_PROFILES)) return;
        try {
            byte[] json = File.ReadAllBytes(Data.SMTP_PROFILES);

            SmtpProfiles.Profile[] profiles = JsonSerializer.Deserialize<SmtpProfiles.Profile[]>(json, emailProfilesSerializerOptions);

            for (int i=0; i<profiles.Length; i++) {
                if (profiles[i].guid == smtpGuid) {
                    server   = profiles[i].server;
                    port     = profiles[i].port;
                    sender   = profiles[i].sender;
                    username = profiles[i].username;
                    password = profiles[i].password;
                    ssl      = profiles[i].ssl;
                    break;
                }
            }

        }
        catch {
            return;
        }

        if (server is null) return;
        if (sender is null) return;
        if (username is null) return;
        if (password is null) return;

        List<string> include = new List<string> {
            "password"
        };
        for (int i = 2; i < split.Length; i++)
            include.Add(split[i]);

        using SmtpClient smtp = new SmtpClient(server) {
            Port = port,
            EnableSsl = ssl,
            Credentials = new NetworkCredential(username, password)
        };

        foreach (KeyValuePair<string, Database.Entry> entry in DatabaseInstances.users.dictionary) {
            if (!entry.Value.attributes.TryGetValue("e-mail", out Database.Attribute email)) {
                continue; //no e-mail
            }

            double minEntropy = double.MaxValue;
            string ttc = String.Empty; //time to crack

            foreach (KeyValuePair<string, Database.Attribute> attribute in entry.Value.attributes) {
                if (!include.Contains(attribute.Key)) {
                    continue;
                }

                double entropy = Entropy(attribute.Value.value, out int length, out int pool);
                minEntropy = Math.Min(minEntropy, entropy);
                ttc = CalculateTtc(length, pool);
            }

            if (minEntropy == double.MaxValue)
                continue;

            string name = String.Empty;
            if (entry.Value.attributes.TryGetValue("first name", out Database.Attribute _firstname)) {
                name = _firstname.value;
            }
            else if (entry.Value.attributes.TryGetValue("title", out Database.Attribute _title)) {
                name = _title.value;
            }
            else if (email.value.Length > 0) {
                name = email.value.Split('@')[0];
            }
            if (minEntropy < threshold && email.value.Length > 0) {
                string[] mailSplit = email.value.Split(';');
                SendGandalfMail(smtp, sender, mailSplit, name, ttc);
            }
        }
    }

    public static void SendGandalfMail(SmtpClient smtp, string sender, string[] recipients, string name, string ttc) {
        try {
            StringBuilder body = new StringBuilder();
            body.Append("<html>");
            body.Append("<table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\">");
            body.Append("<tr><td>&nbsp;</td></tr>");

            body.Append("<tr><td align=\"center\">");

            body.Append("<p align=\"center\"0 style=\"color:#808080\">This is an automated e-mail from the IT Department.</p>");
            body.Append("<br>");

            body.Append("<table width=\"640\" bgcolor=\"#e0e0e0\">");
            body.Append("<tr><td style=\"padding:40px; font-size:18px\">");

            body.Append($"<p>Dear {(name.Length > 0 ? name.Trim() : "colleague")},</p>");

            body.Append("<p><b>");
            body.Append("Our records indicate that you're using a weak password. ");
            body.Append("To enhance the security of your account, please reach out to your IT team and upgrade to a more robust and secure password.");
            body.Append("</b></p>");

            body.Append("<p>");
            body.Append("As technology advance and computers are getting faster over time, passwords are getting weaker. ");
            body.Append("In 1982, it took four years to crack an eight characters password. Today, such passwords can be compromised in less than a day.");
            body.Append("</p>");

            if (ttc is not null && ttc.Length > 0) {
                body.Append("<p>");
                body.Append($"Your password can be cracked in {ttc}.");
                body.Append("</p>");
            }

            body.Append("<p>");
            body.Append("<u>Here are some guidelines on selecting a strong password:</u>");
            body.Append("<ul>");
            body.Append("<li><b>Go Big: </b> Opt for a minimum of twelve characters. Longer passwords significantly enhance resistance to cracking attempts.</li>");
            body.Append("<li><b>Mix Things Up: </b> Combine upper-case and lower-case letters, numbers, and symbols to add complexity.</li>");
            body.Append("<li><b>Be Unpredictable: </b> Avoid easily guessable elements such as common words, your name, favorite movie, or pet names. For example, if your email address is info@domain.com, refrain from including the term \"info\" in your password.</li>");
            body.Append("<li><b>Make It Random: </b> Use a random password generator. It can generate a sequence that is impossible to guess. (<a href=\"https://openprotest.github.io/#passgen\">link</a>)</li>");
            body.Append("</ul>");
            body.Append("</p>");

            body.Append("<br>");

            string[] quotes = new string[] {
                "Sticky notes are not a secure means of storing passwords.",
                "Sticky notes aren't exactly the Fort Knox of password storage.",
                "Sticking your password on a note is like leaving the front door wide open.",
                "Using sticky notes for your password is like sharing your secrets on a bulletin board.",
                "Sticky notes are for grocery lists, not for guarding the keys to your digital kingdom. Upgrade your security game!",
                "Posting passwords on sticky notes is like leaving your house key under the welcome mat – convenient, but not the smartest move for security.",
                "Sticky notes are great for reminders, terrible for passwords. Let's trade convenience for cybersecurity, shall we?",
                "Your passwords deserve better than the sticky note treatment. Think of them as VIPs – keep them exclusive, hidden, and away from prying eyes!",

                "In the game of passwords, predictability is the opponent, and randomness is your secret weapon. Keep 'em guessing!",
                "A password is like a toothbrush – choose a good one, change it regularly, and never share it with strangers!",
                "Passwords are like spices in a digital kitchen – the right blend adds flavor, but too little or too much can ruin the dish. Find your perfect recipe!",
            };

            Random rnd = new Random((int)DateTime.Now.Ticks);
            body.Append($"<p>P.S. <i>{rnd.Next(0, quotes.Length-1)}</i></p>");

            body.Append("<p>Sincerely,<br>The IT Department</p>");

            body.Append("</td></tr>");
            body.Append("</table>");

            body.Append("</td></tr>");

            body.Append("<tr><td>&nbsp;</td></tr>");
            body.Append("<tr><td align=\"center\" style=\"color:#808080\">Sent from <a href=\"https://github.com/openprotest/protest\" style=\"color:#e67624\">Pro-test</a></td></tr>");
            body.Append("<tr><td>&nbsp;</td></tr>");

            body.Append("</td></tr>");
            body.Append("</table>");

            body.Append("</html>");

            using MailMessage mail = new MailMessage {
                From = new MailAddress(sender, "Pro-test"),
                Subject = "Upgrade your password",
                IsBodyHtml = true
            };

            AlternateView view = AlternateView.CreateAlternateViewFromString(body.ToString(), null, "text/html");
            mail.AlternateViews.Add(view);

            for (int i = 0; i < recipients.Length; i++) {
                mail.To.Add(recipients[i].Trim());
            }

            smtp.Send(mail);
        }

        catch (SmtpFailedRecipientException ex) { Logger.Error(ex); }
        catch (SmtpException ex)                { Logger.Error(ex); }
        catch (Exception ex)                    { Logger.Error(ex); }
    }
}
using System;
using System.Collections;
using System.Linq;
using System.Text;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Mail;
using System.Threading;
using System.Numerics;

public static class PasswordStrength {
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

    public static double Entropy(string password, in string[] related = null) {
        return Entropy(password, out _, out _, related);
    }

    public static double Entropy(string password, out int length, out int pool, in string[] related = null) {
        for (int i = 0; i < BLACKLIST.Length; i++)
            if (password.IndexOf(BLACKLIST[i], StringComparison.InvariantCultureIgnoreCase) > -1) password = password.Replace(BLACKLIST[i], "");

        if (related != null)
            for (int i = 0; i < related.Length; i++)
                if (related[i].Length != 0)
                    if (password.IndexOf(related[i], StringComparison.InvariantCultureIgnoreCase) > -1) password = password.Replace(related[i], "");

        bool hasNumbers = false;
        bool hasUppercase = false;
        bool hasLowercase = false;
        bool hasSymbols = false;

        int len = password.Length;

        for (int i = 0; i < len; i++) {
            byte b = (byte)password[i];
            if (b > 47 && b < 58) hasNumbers = true;
            else if (b > 64 && b < 91) hasUppercase = true;
            else if (b > 96 && b < 123) hasLowercase = true;
            else hasSymbols = true;
        }

        length = password.Length;

        pool = 0;
        if (hasNumbers) pool += 10;
        if (hasUppercase) pool += 26;
        if (hasLowercase) pool += 26;
        if (hasSymbols) pool += 30;

        double entropy = Math.Log(Math.Pow(pool, len), 2);
        return entropy;
    }


    public static byte[] GetEntropy() {
        StringBuilder sb = new StringBuilder();

        foreach (DictionaryEntry o in Database.users) {
            Database.DbEntry entry = (Database.DbEntry)o.Value;
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

                int entropy = (int)Entropy(password, words.ToArray());
                string mail = String.Empty;
                string name = String.Empty;
                string modified = value[1];

                if (entry.hash.ContainsKey("E-MAIL")) {
                    mail = ((string[])entry.hash["E-MAIL"])[0];
                    if (name.Length == 0) name = mail;
                }

                if (entry.hash.ContainsKey("USERNAME"))
                    if (name.Length == 0) name = ((string[])entry.hash["USERNAME"])[0];

                if (entry.hash.ContainsKey("DISPLAY NAME"))
                    if (name.Length == 0) name = ((string[])entry.hash["DISPLAY NAME"])[0];

                sb.Append($"u{(char)127}{filename}{(char)127}{name}{(char)127}{mail}{(char)127}{entropy}{(char)127}{p.Key}{(char)127}{modified}{(char)127}");
            }
        }

        foreach (DictionaryEntry o in Database.equip) {
            Database.DbEntry entry = (Database.DbEntry)o.Value;
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

                sb.Append($"e{(char)127}{filename}{(char)127}{name}{(char)127}{(char)127}{entropy}{(char)127}{p.Key}{(char)127}{modified}{(char)127}");
            }
        }

        return Encoding.UTF8.GetBytes(sb.ToString());
    }


    public static byte[] GandalfThreadWrapper(in HttpListenerContext ctx, in string performer) {
        string payload;
        using (StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding))
            payload = reader.ReadToEnd();

        string[] split = payload.Split((char)127);
        if (split.Length < 4) return Strings.INF.Array;

        Thread thread = new Thread(() =>  GandalfRequest(split));
        thread.Priority = ThreadPriority.BelowNormal;
        thread.Start();

        Logging.Action(in performer, $"Send email notification to users with weak passwords");

        return Strings.OK.Array;
    }

    private static void GandalfRequest(in string[] split) {
        double.TryParse(split[0], out double threshold);
        string server    = split[1];
        int.TryParse(split[2], out int port);
        string sender    = split[3];
        string username  = split[4];
        string password  = split[5];
        bool ssl         = split[6] == "true";

        Hashtable include = new Hashtable();
        include.Add("PASSWORD", null);
        for (int i = 7; i < split.Length; i++)
            include.Add(split[i], null);

        SmtpClient smtp = new SmtpClient(server) {
            Port = port,
            EnableSsl = ssl,
            Credentials = new NetworkCredential(username, password)
        };

        foreach (DictionaryEntry e in Database.users) {
            Database.DbEntry entry = (Database.DbEntry)e.Value;
            if (!entry.hash.ContainsKey("E-MAIL")) continue; //no e-mail

            double minEntropy = double.MaxValue;
            string etc = String.Empty; //Estimated Time to Crack

            foreach (DictionaryEntry p in entry.hash) {
                if (!include.ContainsKey(p.Key)) continue;

                double entropy = Entropy(((string[])p.Value)[0], out int length, out int pool);
                minEntropy = Math.Min(minEntropy, entropy);

                try {
                    BigInteger combinations = BigInteger.Pow(pool, length);
                    BigInteger ttc = combinations / 500_000_000_000; //time to crack in seconds

                    BigInteger MILLENNIUM = 365 * 24 * 3600; MILLENNIUM *= 1000;

                    BigInteger millenniums = ttc / MILLENNIUM;
                    ttc -= millenniums * MILLENNIUM;

                    BigInteger years = ttc / (365 * 24 * 3600);
                    ttc -= years * (365 * 24 * 3600);

                    BigInteger days = ttc / (24 * 3600);
                    ttc -= days * (24 * 3600);

                    BigInteger hours = ttc / 3600;
                    ttc -= hours * 3600;

                    BigInteger minutes = ttc / 60;
                    ttc -= minutes * 60;

                    BigInteger seconds = ttc;                                     

                    if (millenniums != 0) etc  = millenniums == 1 ? $"1 millennium, ": $"{millenniums} millenniums, ";
                    if (years != 0)       etc += years == 1       ? $"1 year, "      : $"{years} years, ";
                    if (days != 0)        etc += days == 1        ? $"1 day, "       : $"{days} days, ";
                    if (hours != 0)       etc += hours == 1       ? $"1 hour, "      : $"{hours} hours, ";
                    if (minutes != 0)     etc += minutes == 1     ? $"1 minute, "    : $"{minutes} minutes, ";

                    if (seconds != 0) {
                        if (etc.Length == 0) {
                            etc += seconds == 1 ? $"a second" : $"{seconds} seconds";
                        } else {
                            etc += seconds == 1 ? $"and 1 second" : $"and {seconds} seconds";
                        }
                    }

                    if (etc.Length == 0) etc = "less then a second";
                
                } catch {}
            }

            if (minEntropy == double.MaxValue) continue;

            string name;
            if (entry.hash.ContainsKey("FIRST NAME") && ((string[])entry.hash["FIRST NAME"])[0].Length > 0)
                name = ((string[])entry.hash["FIRST NAME"])[0];
            else if (entry.hash.ContainsKey("TITLE") && ((string[])entry.hash["TITLE"])[0].Length > 0)
                name = ((string[])entry.hash["TITLE"])[0];
            else 
                name = ((string[])entry.hash["E-MAIL"])[0].Split('@')[0];

            if (minEntropy < threshold) {
                string[] mailSplit = ((string[])entry.hash["E-MAIL"])[0].Split(';');
                SendGandalfMail(smtp, sender, mailSplit, name, etc);
            }
        }

        smtp.Dispose();
    }

    public static void SendGandalfMail(in SmtpClient smtp, in string sender, in string[] recipients, in string name, in string etc) {
#if !DEBUG
    try {
#endif

        StringBuilder body = new StringBuilder();
        body.Append("<html>");
        body.Append("<table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\">");
        body.Append("<tr><td>&nbsp;</td></tr>");

        body.Append("<tr><td align=\"center\">");

        body.Append("<p align=\"center\"0 style=\"color:#808080\">This is an automated e-mail from the IT Department.</p>");
        body.Append("<br>");

        body.Append("<table width=\"640\" bgcolor=\"#e0e0e0\"");
        body.Append("<tr><td style=\"padding:40px; font-size:18px\">");

        body.Append($"<p>Dear {(name.Length > 0 ? name.Trim() : "colleague")},</p>");

        body.Append("<p><b>");
        body.Append("Our record shows that you're using a weak password. ");
        body.Append("Please contact your IT team and ask to upgrade to a secure one.");
        body.Append("</b></p>");

        body.Append("<p>");
        body.Append("As technology advance and computers are getting faster over time, passwords are getting weaker. ");
        body.Append("In 1982, it took four years to crack an eight characters password. Today it can be cracked in less than a day.");
        body.Append("</p>");

        body.Append("<p>");
        body.Append($"Your password can be cracked in {etc}.");
        body.Append("</b>");

        body.Append("<p>");
        body.Append("<u>How to choose a strong password:</u>");
        body.Append("<ul>");
        body.Append("<li><b>Size matters.</b> Choose at least ten characters. Longer passwords are harder to crack.</li>");
        body.Append("<li><b>Use mixed characters.</b> Use upper-case and lower-case, numbers, and symbols to add complexity.</li>");
        body.Append("<li><b>Be unpredictable</b> Avoid words that can be guessed. If your email address is info@domain.com, don't include the word \"info\" in your password. Don't use your name, favorite movie, pet name, etc</li>");
        body.Append("<li><b>Make it random.</b> Use a random password generator. It can generate a sequence that is impossible to guess. (<a href=\"https://veniware.github.io/#passgen\">link</a>)</li>");
        body.Append("</ul>");
        body.Append("</p>");

        body.Append("<br>");

        body.Append("<p>P.S. <i>Sticky notes are not designed to store a password securely.</i></p>");

        body.Append("<p>Sincerely,<br>The IT Department</p>");

        body.Append("</td></tr>");
        body.Append("</table>");

        body.Append("<tr><td>&nbsp;</td></tr>");
        body.Append("<tr><td align=\"center\" style=\"color:#808080\">Sent from <a href=\"https://github.com/veniware/OpenProtest\" style=\"color:#e67624\">Pro-test</a></td></tr>");
        body.Append("<tr><td>&nbsp;</td></tr>");

        body.Append("</td></tr>");
        body.Append("</table>");
        body.Append("</html>");

        MailMessage mail = new MailMessage {
            From = new MailAddress(sender, "Pro-test"),
            Subject = "Upgrade your password",
            IsBodyHtml = true
        };

        AlternateView view = AlternateView.CreateAlternateViewFromString(body.ToString(), null, "text/html");
        //view.LinkedResources.Add(null);
        mail.AlternateViews.Add(view);

        for (int i = 0; i < recipients.Length; i++)
            mail.To.Add(recipients[i].Trim());

        smtp.Send(mail);
        mail.Dispose();

#if !DEBUG
    } catch (SmtpFailedRecipientException ex) { Logging.Err(ex);
    } catch (SmtpException ex)                { Logging.Err(ex);
    } catch (Exception ex)                    { Logging.Err(ex);
    }
#endif
    }

}
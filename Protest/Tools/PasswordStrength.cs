using System.Numerics;

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
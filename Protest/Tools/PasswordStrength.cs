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
            password = password.Replace(COMMON[i], String.Empty, StringComparison.InvariantCultureIgnoreCase);
        }

        if (related != null) {
            for (int i = 0; i < related.Length; i++) {
                if (related[i].Length == 0) continue;
                password = password.Replace(related[i], String.Empty, StringComparison.InvariantCultureIgnoreCase);
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
        if (hasSymbols)   pool += 32;

        double entropy = Math.Log(Math.Pow(pool, len), 2);
        return entropy;
    }
}

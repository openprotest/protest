using System.IO;
using System.Reflection;
using System.Text;

namespace Protest;

public static class Data {
    public const string GUID = "72f5bca3-7752-45e8-8027-2060ebbda456"; //from Protest.csproj

#if OS_LINUX || OS_MAC
    public const char DELIMITER = "/";
#else //OS_WINDOWS
    public const string DELIMITER = "\\";
#endif

    public const string TIME_FORMAT = "HH:mm:ss";
    public const string TIME_FORMAT_MILLI = "HH:mm:ss:fff";
    public const string DATE_FORMAT = "dd-MM-yyyy";
    public const string DATE_FORMAT_FILE = "yyyyMMdd";
    public const string DATETIME_FORMAT = "ddd, dd MMM yyyy HH:mm:ss";
    public const string DATETIME_FORMAT_TIMEZONE = "ddd, dd MMM yyyy HH:mm:ss zzz";
    public const string DATETIME_FORMAT_LONG = "dddd dd MMM yyyy HH:mm:ss";
    public const string DATETIME_FORMAT_FILE = "yyyy-MM-dd HH:mm:ss";

    //pre-baked json responses:
    public static readonly ArraySegment<byte> CODE_OK  = new ArraySegment<byte>("{\"status\":\"ok\"}"u8.ToArray());
    public static readonly ArraySegment<byte> CODE_ACK = new ArraySegment<byte>("{\"status\":\"acknowledge\"}"u8.ToArray());

    public static readonly ArraySegment<byte> CODE_FAILED                 = new ArraySegment<byte>("{\"error\":\"failed\"}"u8.ToArray());
    public static readonly ArraySegment<byte> CODE_UNAUTHORIZED           = new ArraySegment<byte>("{\"error\":\"unauthorized\"}"u8.ToArray());
    public static readonly ArraySegment<byte> CODE_INVALID_ARGUMENT       = new ArraySegment<byte>("{\"error\":\"invalid argument\"}"u8.ToArray());
    public static readonly ArraySegment<byte> CODE_INVALID_CREDENTIALS    = new ArraySegment<byte>("{\"error\":\"invalid credentials\"}"u8.ToArray());
    public static readonly ArraySegment<byte> CODE_NOT_FOUND              = new ArraySegment<byte>("{\"error\":\"not found\"}"u8.ToArray());
    public static readonly ArraySegment<byte> CODE_FILE_NOT_FOUND         = new ArraySegment<byte>("{\"error\":\"file not found\"}"u8.ToArray());
    public static readonly ArraySegment<byte> CODE_NOT_ENOUGH_INFO        = new ArraySegment<byte>("{\"error\":\"not enough information\"}"u8.ToArray());
    public static readonly ArraySegment<byte> CODE_HOST_UNKNOWN           = new ArraySegment<byte>("{\"error\":\"no such host is known\"}"u8.ToArray());
    public static readonly ArraySegment<byte> CODE_HOST_UNREACHABLE       = new ArraySegment<byte>("{\"error\":\"host is unreachable\"}"u8.ToArray());
    public static readonly ArraySegment<byte> CODE_TCP_CONN_FAILURE       = new ArraySegment<byte>("{\"error\":\"tcp connection failure\"}"u8.ToArray());
    public static readonly ArraySegment<byte> CODE_OTHER_TASK_IN_PROGRESS = new ArraySegment<byte>("{\"error\":\"another task is already in progress\"}"u8.ToArray());
    public static readonly ArraySegment<byte> CODE_TASK_DONT_EXITSTS      = new ArraySegment<byte>("{\"error\":\"this task no longer exists\"}"u8.ToArray());

    public static readonly string DIR_ROOT      = Directory.GetCurrentDirectory();
    public static readonly string DIR_KNOWLADGE = $"{DIR_ROOT}{DELIMITER}knowledge";
    public static readonly string DIR_ACL       = $"{DIR_ROOT}{DELIMITER}acl";
    public static readonly string DIR_LOG       = $"{DIR_ROOT}{DELIMITER}log";
    public static readonly string DIR_BACKUP    = $"{DIR_ROOT}{DELIMITER}backup";

    public static readonly string DIR_DATA    = $"{DIR_ROOT}{DELIMITER}data";
    public static readonly string DIR_DEVICES = $"{DIR_DATA}{DELIMITER}devices";
    public static readonly string DIR_USERS   = $"{DIR_DATA}{DELIMITER}users";

    public static readonly string DIR_CONFIG         = $"{DIR_DATA}{DELIMITER}configuration";
    public static readonly string DIR_DOCUMENTATION  = $"{DIR_DATA}{DELIMITER}documentation";
    public static readonly string DIR_LASTSEEN       = $"{DIR_DATA}{DELIMITER}lastseen";
    public static readonly string DIR_LIFELINE       = $"{DIR_DATA}{DELIMITER}lifeline";
    public static readonly string DIR_WATCHDOG       = $"{DIR_DATA}{DELIMITER}watchdog";
    public static readonly string DIR_SCRIPTS        = $"{DIR_DATA}{DELIMITER}scripts";
    public static readonly string DIR_DEBIT          = $"{DIR_DATA}{DELIMITER}debit";
    public static readonly string DIR_DEBIT_SHORT    = $"{DIR_DATA}{DELIMITER}debit{DELIMITER}short";
    public static readonly string DIR_DEBIT_LONG     = $"{DIR_DATA}{DELIMITER}debit{DELIMITER}long";
    public static readonly string DIR_DEBIT_RETURNED = $"{DIR_DATA}{DELIMITER}debit{DELIMITER}returned";
    public static readonly string DIR_DEBIT_TEMPLATE = $"{DIR_DATA}{DELIMITER}debit{DELIMITER}templates";

    public static readonly string DIR_IP_LOCATION   = $"{DIR_KNOWLADGE}\\ip";
    public static readonly string DIR_PROXY         = $"{DIR_KNOWLADGE}\\proxy";
    public static readonly string FILE_TOR          = $"{DIR_KNOWLADGE}\\tor.bin";
    public static readonly string FILE_MAC          = $"{DIR_KNOWLADGE}\\mac.bin";

    public static readonly string FILE_ZONES          = $"{DIR_DATA}{DELIMITER}zones.json";
    public static readonly string FILE_EMAIL_PROFILES = $"{DIR_DATA}{DELIMITER}smtpprofiles.json";
    public static readonly string FILE_NOTIFICATIONS  = $"{DIR_DATA}{DELIMITER}notifications.json";

    public static readonly string FILE_CONFIG = $"{DIR_ROOT}{DELIMITER}protest.cfg";

    public static void InitializeDirectories() {
        DirectoryInfo[] dirs = new DirectoryInfo[] {
            new DirectoryInfo(DIR_KNOWLADGE),
            new DirectoryInfo(DIR_LOG),
            new DirectoryInfo(DIR_LASTSEEN),
            new DirectoryInfo(DIR_LIFELINE),
            new DirectoryInfo(DIR_WATCHDOG),
            new DirectoryInfo(DIR_DOCUMENTATION),
            new DirectoryInfo(DIR_DEBIT),
            new DirectoryInfo(DIR_DEBIT_SHORT),
            new DirectoryInfo(DIR_DEBIT_LONG),
            new DirectoryInfo(DIR_DEBIT_RETURNED),
            new DirectoryInfo(DIR_DEBIT_TEMPLATE),
            new DirectoryInfo(DIR_CONFIG),
            new DirectoryInfo(DIR_ACL),
            new DirectoryInfo(DIR_DATA),
            new DirectoryInfo(DIR_DEVICES),
            new DirectoryInfo(DIR_USERS)
        };

        for (int i = 0; i < dirs.Length; i++) {
            try {
                if (!dirs[i].Exists)
                    dirs[i].Create();
            }
            catch (Exception ex) {
                Logger.Error(ex);
            }
        }
    }

    public static string SizeToString(long size) {
        if (size < 8_192) return $"{size} Bytes";
        if (size < 8_192 * 1024) return $"{Math.Floor(size / 1024f)} KB";
        if (size < 8_192 * Math.Pow(1024, 2)) return $"{Math.Floor(size / Math.Pow(1024, 2))} MB";
        if (size < 8_192 * Math.Pow(1024, 3)) return $"{Math.Floor(size / Math.Pow(1024, 3))} GB";
        if (size < 8_192 * Math.Pow(1024, 4)) return $"{Math.Floor(size / Math.Pow(1024, 4))} TB";
        if (size < 8_192 * Math.Pow(1024, 5)) return $"{Math.Floor(size / Math.Pow(1024, 5))} EB"; //Exabyte
        if (size < 8_192 * Math.Pow(1024, 6)) return $"{Math.Floor(size / Math.Pow(1024, 6))} ZB"; //Zettabyte
        if (size < 8_192 * Math.Pow(1024, 7)) return $"{Math.Floor(size / Math.Pow(1024, 7))} YB"; //Yottabyte
        if (size < 8_192 * Math.Pow(1024, 8)) return $"{Math.Floor(size / Math.Pow(1024, 8))} BB"; //Brontobyte
        return size.ToString();
    }

    public static byte[] VersionToJson() {
        Version ver = Assembly.GetExecutingAssembly().GetName().Version;
        StringBuilder result = new StringBuilder();

        result.Append('{');
        result.Append($"\"name\":\"{Assembly.GetExecutingAssembly().GetName().Name}\",");
        result.Append($"\"string\":\"{ver}\",");
        result.Append($"\"major\":{ver?.Major ?? 0},");
        result.Append($"\"minor\":{ver?.Minor ?? 0},");
        result.Append($"\"build\":{ver?.Build ?? 0},");
        result.Append($"\"revision\":{ver?.Revision ?? 0}");
        result.Append('}');

        return Encoding.UTF8.GetBytes(result.ToString());
    }

    public static string VersionToString() {
        Version ver = Assembly.GetExecutingAssembly().GetName()?.Version;
        return $"{ver?.Major ?? 0}.{ver?.Minor ?? 0}.{ver?.Build ?? 0}.{ver?.Revision ?? 0}";
    }

    public static string EscapeJsonText(string text) {
        if (String.IsNullOrEmpty(text)) return String.Empty;

        if (text.Length <= 256) {
            int count = 0;
            foreach (char c in text) {
                switch (c) {
                case '\\':
                case '\"':
                case '\b':
                case '\f':
                case '\n':
                case '\r':
                case '\t':
                    count += 2;
                    break;

                default:
                    count++;
                    break;
                }
            }

            Span<char> result = stackalloc char[count];
            count = 0;
            foreach (char c in text) {
                switch (c) {
                case '\\':
                case '\"':
                    result[count++] = '\\';
                    result[count++] = c;
                    break;

                case '\b':
                    result[count++] = '\\';
                    result[count++] = 'b';
                    break;

                case '\f':
                    result[count++] = '\\';
                    result[count++] = 'f';
                    break;

                case '\t':
                    result[count++] = '\\';
                    result[count++] = 't';
                    break;

                case '\n':
                    result[count++] = '\\';
                    result[count++] = 'n';
                    break;

                case '\r':
                    result[count++] = '\\';
                    result[count++] = 'r';
                    break;

                default:
                    result[count++] = c;
                    break;
                }
            }

            return result.ToString();
        }

        StringBuilder builder = new StringBuilder();
        foreach (char c in text) {
            switch (c) {
            case '\\': builder.Append("\\\\"); break;
            case '\"': builder.Append("\\\""); break;
            case '\b': builder.Append("\\b"); break;
            case '\f': builder.Append("\\f"); break;
            case '\n': builder.Append("\\n"); break;
            case '\r': builder.Append("\\r"); break;
            case '\t': builder.Append("\\t"); break;
            default: builder.Append(c); break;
            }
        }
        return builder.ToString();
    }

    public static string EscapeJsonTextWithUnicodeCharacters(string text) {
        if (String.IsNullOrEmpty(text)) return String.Empty;

        StringBuilder builder = new StringBuilder();
        foreach (char c in text) {
            switch (c) {
            case '\\': builder.Append("\\\\"); break;
            case '\"': builder.Append("\\\""); break;
            case '\b': builder.Append("\\b"); break;
            case '\f': builder.Append("\\f"); break;
            case '\n': builder.Append("\\n"); break;
            case '\r': builder.Append("\\r"); break;
            case '\t': builder.Append("\\t"); break;

            //currency codes:
            case '\u0024': builder.Append("\\u0024"); break;
            case '\u20AC': builder.Append("\\u20AC"); break;
            case '\u00A3': builder.Append("\\u00A3"); break;
            case '\u00A5': builder.Append("\\u00A5"); break;
            case '\u00A2': builder.Append("\\u00A2"); break;
            case '\u20B9': builder.Append("\\u20B9"); break;
            case '\u20A8': builder.Append("\\u20A8"); break;
            case '\u20B1': builder.Append("\\u0024"); break;
            case '\u20A9': builder.Append("\\u20A9"); break;
            case '\u0E3F': builder.Append("\\u0E3F"); break;
            case '\u20AB': builder.Append("\\u20AB"); break;
            case '\u20AA': builder.Append("\\u20AA"); break;

            //intellectual property codes:
            case '\u00A9': builder.Append("\\u00A9"); break;
            case '\u00AE': builder.Append("\\u00AE"); break;
            case '\u2117': builder.Append("\\u2117"); break;
            case '\u2120': builder.Append("\\u2120"); break;
            case '\u2122': builder.Append("\\u2122"); break;

            //greek alphabet codes:
            case '\u0391': builder.Append("\\u0391"); break; //Alpha
            case '\u0392': builder.Append("\\u0392"); break; //Beta
            case '\u0393': builder.Append("\\u0393"); break; //Gamma
            case '\u0394': builder.Append("\\u0394"); break; //Delta
            case '\u0395': builder.Append("\\u0395"); break; //Epsilon
            case '\u0396': builder.Append("\\u0396"); break; //Zeta
            case '\u0397': builder.Append("\\u0397"); break; //Eta
            case '\u0398': builder.Append("\\u0398"); break; //Theta
            case '\u0399': builder.Append("\\u0399"); break; //Iota
            case '\u039A': builder.Append("\\u039A"); break; //Kappa
            case '\u039B': builder.Append("\\u039B"); break; //Lambda
            case '\u039C': builder.Append("\\u039C"); break; //Mu
            case '\u039D': builder.Append("\\u039D"); break; //Nu
            case '\u039E': builder.Append("\\u039E"); break; //Xi
            case '\u039F': builder.Append("\\u039F"); break; //Omicron
            case '\u03A0': builder.Append("\\u03A0"); break; //Pi
            case '\u03A1': builder.Append("\\u03A1"); break; //Rho
            case '\u03A3': builder.Append("\\u03A3"); break; //Sigma
            case '\u03A4': builder.Append("\\u03A4"); break; //Tau
            case '\u03A5': builder.Append("\\u03A5"); break; //Upsilon
            case '\u03A6': builder.Append("\\u03A6"); break; //Phi
            case '\u03A7': builder.Append("\\u03A7"); break; //Chi
            case '\u03A8': builder.Append("\\u03A8"); break; //Psi
            case '\u03A9': builder.Append("\\u03A9"); break; //Omega

            case '\u03B1': builder.Append("\\u03B1"); break; //alpha
            case '\u03B2': builder.Append("\\u03B2"); break; //beta
            case '\u03B3': builder.Append("\\u03B3"); break; //gamma
            case '\u03B4': builder.Append("\\u03B4"); break; //delta
            case '\u03B5': builder.Append("\\u03B5"); break; //epsilon
            case '\u03B6': builder.Append("\\u03B6"); break; //zeta
            case '\u03B7': builder.Append("\\u03B7"); break; //eta
            case '\u03B8': builder.Append("\\u03B8"); break; //theta
            case '\u03B9': builder.Append("\\u03B9"); break; //iota
            case '\u03BA': builder.Append("\\u03BA"); break; //kappa
            case '\u03BB': builder.Append("\\u03BB"); break; //lambda
            case '\u03BC': builder.Append("\\u03BC"); break; //mu
            case '\u03BD': builder.Append("\\u03BD"); break; //nu
            case '\u03BE': builder.Append("\\u03BE"); break; //xi
            case '\u03BF': builder.Append("\\u03BF"); break; //omicron
            case '\u03C0': builder.Append("\\u03C0"); break; //pi
            case '\u03C1': builder.Append("\\u03C1"); break; //rho
            case '\u03C2': builder.Append("\\u03C2"); break; //sigma (final form)
            case '\u03C3': builder.Append("\\u03C3"); break; //sigma (normal form)
            case '\u03C4': builder.Append("\\u03C4"); break; //tau
            case '\u03C5': builder.Append("\\u03C5"); break; //upsilon
            case '\u03C6': builder.Append("\\u03C6"); break; //phi
            case '\u03C7': builder.Append("\\u03C7"); break; //chi
            case '\u03C8': builder.Append("\\u03C8"); break; //psi
            case '\u03C9': builder.Append("\\u03C9"); break; //omega

            //greek alphabet codes with tonos:
            case '\u0386': builder.Append("\\u0386"); break;
            case '\u0388': builder.Append("\\u0388"); break;
            case '\u0389': builder.Append("\\u0389"); break;
            case '\u038A': builder.Append("\\u038A"); break;
            case '\u038C': builder.Append("\\u038C"); break;
            case '\u038E': builder.Append("\\u038E"); break;
            case '\u038F': builder.Append("\\u038F"); break;
            case '\u03AC': builder.Append("\\u03AC"); break;
            case '\u03AD': builder.Append("\\u03AD"); break;
            case '\u03AE': builder.Append("\\u03AE"); break;
            case '\u03AF': builder.Append("\\u03AF"); break;
            case '\u03CC': builder.Append("\\u03CC"); break;
            case '\u03CD': builder.Append("\\u03CD"); break;
            case '\u03CE': builder.Append("\\u03CE"); break;

            default: builder.Append(c); break;
            }
        }
        return builder.ToString();
    }

    public static bool ContainsBytesSequence(byte[] source, byte[] target) {
        for (int i = 0; i <= source.Length - target.Length; i++) {
            bool found = true;
            for (int j = 0; j < target.Length; j++) {
                if (source[i + j] != target[j]) {
                    found = false;
                    break;
                }
            }
            if (found)
                return true;
        }
        return false;
    }

    public static void ReplaceAllBytesSequence(byte[] source, byte[] target, byte[] replacement) {
        for (int i = 0; i <= source.Length - target.Length; i++) {
            bool found = true;
            for (int j = 0; j < target.Length; j++) {
                if (source[i + j] != target[j]) {
                    found = false;
                    break;
                }
            }
            if (found) {
                for (int j = 0; j < target.Length; j++) {
                    source[i + j] = replacement[j];
                }
                //return;
            }
        }
    }

}
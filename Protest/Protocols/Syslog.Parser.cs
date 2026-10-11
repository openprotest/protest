namespace Protest.Protocols;

internal static partial class Syslog {
    internal struct Message {
        public byte   facility;
        public byte   severity;
        public string hostname;
        public string app;
        public string procid;
        public string msgid;
        public string structuredData;
        public string text;
    }

    private static readonly string[] MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    //auto-detects RFC 5424 and RFC 3164 (BSD), including the common vendor deviations
    internal static Message Parse(ReadOnlySpan<char> span) {
        Message message = new Message {
            facility       = 1, //user-level, RFC 3164 4.3.3
            severity       = (byte)Severity.Notice,
            hostname       = String.Empty,
            app            = String.Empty,
            procid         = String.Empty,
            msgid          = String.Empty,
            structuredData = String.Empty,
            text           = String.Empty
        };

        span = span.TrimStart(" \t\r\n\0\uFEFF");

        if (TryParsePri(span, out int pri, out int priLength)) {
            message.facility = (byte)(pri >> 3);
            message.severity = (byte)(pri & 7);
            span = span[priLength..];
        }

        if (span.Length >= 2 && span[0] == '1' && span[1] == ' ' && TryParse5424(span[2..], ref message)) {
            return message;
        }

        Parse3164(span, ref message);
        return message;
    }

    private static bool TryParsePri(ReadOnlySpan<char> span, out int pri, out int length) {
        pri = 0;
        length = 0;

        if (span.Length < 3 || span[0] != '<') return false;

        int i = 1;
        while (i < span.Length && i <= 4 && char.IsAsciiDigit(span[i])) {
            pri = pri * 10 + (span[i] - '0');
            i++;
        }

        if (i == 1 || i > 4 || i >= span.Length || span[i] != '>') return false;
        if (pri > 191) return false;

        length = i + 1;
        return true;
    }

    private static bool TryParse5424(ReadOnlySpan<char> span, ref Message message) {
        ReadOnlySpan<char> rest = span;

        ReadOnlySpan<char> timestamp = NextToken(ref rest);
        ReadOnlySpan<char> hostname  = NextToken(ref rest);
        ReadOnlySpan<char> app       = NextToken(ref rest);
        ReadOnlySpan<char> procid    = NextToken(ref rest);
        ReadOnlySpan<char> msgid     = NextToken(ref rest);

        if (msgid.IsEmpty) return false;
        if (!timestamp.SequenceEqual("-") && (timestamp.Length < 10 || !char.IsAsciiDigit(timestamp[0]))) return false;

        string structuredData = String.Empty;
        if (rest.StartsWith("-")) {
            rest = rest[1..];
        }
        else if (rest.StartsWith("[")) {
            int end = ScanStructuredData(rest);
            if (end < 0) return false;
            structuredData = rest[..end].ToString();
            rest = rest[end..];
        }
        else if (!rest.IsEmpty) {
            return false;
        }

        if (!rest.IsEmpty && rest[0] == ' ') rest = rest[1..];
        if (!rest.IsEmpty && rest[0] == '\uFEFF') rest = rest[1..];

        message.hostname       = NilToEmpty(hostname);
        message.app            = NilToEmpty(app);
        message.procid         = NilToEmpty(procid);
        message.msgid          = NilToEmpty(msgid);
        message.structuredData = structuredData;
        message.text           = rest.TrimEnd(" \t\r\n\0").ToString();
        return true;
    }

    private static ReadOnlySpan<char> NextToken(ref ReadOnlySpan<char> rest) {
        int space = rest.IndexOf(' ');
        ReadOnlySpan<char> token;
        if (space < 0) {
            token = rest;
            rest = ReadOnlySpan<char>.Empty;
        }
        else {
            token = rest[..space];
            rest = rest[(space + 1)..];
        }
        return token;
    }

    private static string NilToEmpty(ReadOnlySpan<char> token) {
        return token.SequenceEqual("-") ? String.Empty : token.ToString();
    }

    private static int ScanStructuredData(ReadOnlySpan<char> span) {
        int i = 0;
        while (i < span.Length && span[i] == '[') {
            i++;
            bool quoted = false;
            while (i < span.Length) {
                char c = span[i];
                if (quoted) {
                    if (c == '\\' && i + 1 < span.Length) {
                        i += 2;
                        continue;
                    }
                    if (c == '"') quoted = false;
                }
                else if (c == '"') {
                    quoted = true;
                }
                else if (c == ']') {
                    break;
                }
                i++;
            }

            if (i >= span.Length) return -1;
            i++; //skip ']'
        }
        return i;
    }

    private static void Parse3164(ReadOnlySpan<char> span, ref Message message) {
        ReadOnlySpan<char> rest = span;

        //cisco sequence number, "000123: "
        int digits = 0;
        while (digits < rest.Length && char.IsAsciiDigit(rest[digits])) digits++;
        if (digits > 0 && digits + 1 < rest.Length && rest[digits] == ':' && rest[digits + 1] == ' ') {
            rest = rest[(digits + 2)..];
        }

        //cisco clock-sync markers
        if (rest.Length > 1 && (rest[0] == '*' || rest[0] == '.') && char.IsAsciiLetterUpper(rest[1])) {
            rest = rest[1..];
        }

        if (SkipTimestamp(ref rest)) {
            int space = rest.IndexOf(' ');
            ReadOnlySpan<char> token = space < 0 ? rest : rest[..space];
            if (token.Length > 0 && !IsTagToken(token)) {
                message.hostname = token.ToString();
                rest = space < 0 ? ReadOnlySpan<char>.Empty : rest[(space + 1)..];
            }
        }

        ParseTag(ref rest, ref message);
        message.text = rest.Trim(" \t\r\n\0").ToString();
    }

    private static bool SkipTimestamp(ref ReadOnlySpan<char> rest) {
        //ISO 8601, e.g. rsyslog high-precision template
        if (rest.Length >= 19 && char.IsAsciiDigit(rest[0]) && rest[4] == '-' && rest[7] == '-' && rest[10] == 'T') {
            int space = rest.IndexOf(' ');
            rest = space < 0 ? ReadOnlySpan<char>.Empty : rest[(space + 1)..];
            return true;
        }

        //Mmm dd hh:mm:ss
        if (rest.Length < 14 || rest[3] != ' ') return false;
        if (!IsMonth(rest[..3])) return false;

        int i = 4;
        if (rest[i] == ' ') i++;

        int dayStart = i;
        while (i < rest.Length && i - dayStart < 2 && char.IsAsciiDigit(rest[i])) i++;
        if (i == dayStart || i >= rest.Length || rest[i] != ' ') return false;
        i++;

        //optional year before the time (cisco "service timestamps log datetime year")
        if (i + 5 <= rest.Length && IsDigits(rest.Slice(i, 4)) && rest[i + 4] == ' ') {
            i += 5;
        }

        if (i + 8 > rest.Length || !IsTime(rest.Slice(i, 8))) return false;
        i += 8;

        //optional fraction
        if (i < rest.Length && rest[i] == '.') {
            i++;
            while (i < rest.Length && char.IsAsciiDigit(rest[i])) i++;
        }

        //optional trailing year
        if (i + 5 <= rest.Length && rest[i] == ' ' && IsDigits(rest.Slice(i + 1, 4)) && (i + 5 == rest.Length || rest[i + 5] == ' ' || rest[i + 5] == ':')) {
            i += 5;
        }

        //optional time-zone, only when followed by a colon (cisco "UTC:")
        if (i < rest.Length && rest[i] == ' ') {
            int j = i + 1;
            while (j < rest.Length && j - i <= 5 && char.IsAsciiLetterUpper(rest[j])) j++;
            if (j - i >= 4 && j < rest.Length && rest[j] == ':') {
                i = j;
            }
        }

        if (i < rest.Length && rest[i] == ':') i++;
        while (i < rest.Length && rest[i] == ' ') i++;

        rest = rest[i..];
        return true;
    }

    private static bool IsMonth(ReadOnlySpan<char> span) {
        for (int i = 0; i < MONTHS.Length; i++) {
            if (span.SequenceEqual(MONTHS[i])) return true;
        }
        return false;
    }

    private static bool IsDigits(ReadOnlySpan<char> span) {
        for (int i = 0; i < span.Length; i++) {
            if (!char.IsAsciiDigit(span[i])) return false;
        }
        return true;
    }

    private static bool IsTime(ReadOnlySpan<char> span) {
        return char.IsAsciiDigit(span[0]) && char.IsAsciiDigit(span[1]) && span[2] == ':'
            && char.IsAsciiDigit(span[3]) && char.IsAsciiDigit(span[4]) && span[5] == ':'
            && char.IsAsciiDigit(span[6]) && char.IsAsciiDigit(span[7]);
    }

    private static bool IsTagToken(ReadOnlySpan<char> token) {
        return token[^1] == ':' || token.Contains('[') || token[0] == '%';
    }

    //TAG[pid]: or TAG:
    private static void ParseTag(ref ReadOnlySpan<char> rest, ref Message message) {
        int i = 0;
        while (i < rest.Length && i < 64 && rest[i] != ':' && rest[i] != '[' && rest[i] != ' ') i++;
        if (i == 0 || i >= rest.Length) return;

        ReadOnlySpan<char> name = rest[..i];
        ReadOnlySpan<char> pid = ReadOnlySpan<char>.Empty;
        int j = i;

        if (rest[j] == '[') {
            int close = rest[j..].IndexOf(']');
            if (close < 0) return;
            pid = rest[(j + 1)..(j + close)];
            j += close + 1;
        }

        if (j < rest.Length && rest[j] == ':') {
            j++;
        }
        else if (pid.IsEmpty) {
            return;
        }

        message.app = name.ToString();
        message.procid = pid.ToString();
        rest = rest[j..];
    }
}

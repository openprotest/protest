using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

public static class Strings {
    public const string TIME_FORMAT_MILLI = "HH:mm:ss:fff";
    public const string Time_FORMAT = "HH:mm:ss";
    public const string DATE_FORMAT = "dd-MM-yyyy";
    public const string DATETIME_FORMAT = "ddd, dd MMM yyyy HH:mm:ss";
    public const string DATETIME_FORMAT_LONG = "dddd dd MMM yyyy HH:mm:ss";
    public const string DATETIME_FORMAT_FILE = "yyyy-MM-dd HH:mm:ss";

    public static readonly string DIR_PROTEST     = $"{Directory.GetCurrentDirectory()}\\protest";
    public static readonly string DIR_FRONTEND    = $"{Directory.GetCurrentDirectory()}\\protest\\front";
    public static readonly string DIR_ADDRESSBOOK = $"{Directory.GetCurrentDirectory()}\\protest\\addressbook";
    public static readonly string DIR_DATE        = $"{Directory.GetCurrentDirectory()}\\protest\\data";
    public static readonly string DIR_EQUIP       = $"{Directory.GetCurrentDirectory()}\\protest\\data\\equip";
    public static readonly string DIR_USERS       = $"{Directory.GetCurrentDirectory()}\\protest\\data\\users";
    public static readonly string DIR_KNOWLAGE    = $"{Directory.GetCurrentDirectory()}\\protest\\knowlage";
    public static readonly string DIR_SCRIPTS     = $"{Directory.GetCurrentDirectory()}\\protest\\scripts";
    public static readonly string DIR_LASTSEEN    = $"{Directory.GetCurrentDirectory()}\\protest\\lastseen";
    public static readonly string DIR_METRICS     = $"{Directory.GetCurrentDirectory()}\\protest\\metrics";

    public static readonly string FILE_CONFIG       = $"{Directory.GetCurrentDirectory()}\\protest\\config.txt";
    public static readonly string FILE_ACTION_LOG   = $"{Directory.GetCurrentDirectory()}\\protest\\action.log";
    public static readonly string FILE_ERROR_LOG    = $"{Directory.GetCurrentDirectory()}\\protest\\error.log";

    public static readonly string FILE_CONTENT_TYPE = $"{DIR_KNOWLAGE}\\content_type.txt";
    public static readonly string FILE_MAC          = $"{DIR_KNOWLAGE}\\mac.bin";
    public static readonly string DIR_IP_LOCATION   = $"{DIR_KNOWLAGE}\\ip";
    public static readonly string DIR_PROXY         = $"{DIR_KNOWLAGE}\\proxy";

    public static readonly string DIR_SCRIPTS_SCRIPTS = $"{DIR_SCRIPTS}\\scripts";
    public static readonly string DIR_SCRIPTS_REPORTS = $"{DIR_SCRIPTS}\\reports";

    public static readonly ArraySegment<byte> OK = new ArraySegment<byte>(Encoding.UTF8.GetBytes("ok"));
    public static readonly ArraySegment<byte> ACK = new ArraySegment<byte>(Encoding.UTF8.GetBytes("acknowledge"));
    public static readonly ArraySegment<byte> INF = new ArraySegment<byte>(Encoding.UTF8.GetBytes("not enough information"));
    public static readonly ArraySegment<byte> INV = new ArraySegment<byte>(Encoding.UTF8.GetBytes("invalid argument"));
    public static readonly ArraySegment<byte> FAI = new ArraySegment<byte>(Encoding.UTF8.GetBytes("failed"));
    public static readonly ArraySegment<byte> FLE = new ArraySegment<byte>(Encoding.UTF8.GetBytes("no such file"));
    public static readonly ArraySegment<byte> EXS = new ArraySegment<byte>(Encoding.UTF8.GetBytes("file already exists"));
    public static readonly ArraySegment<byte> NHO = new ArraySegment<byte>(Encoding.UTF8.GetBytes("no such host is known"));
    public static readonly ArraySegment<byte> UNA = new ArraySegment<byte>(Encoding.UTF8.GetBytes("service is unavailable"));
    public static readonly ArraySegment<byte> UNR = new ArraySegment<byte>(Encoding.UTF8.GetBytes("host is unreachable"));
    public static readonly ArraySegment<byte> TCP = new ArraySegment<byte>(Encoding.UTF8.GetBytes("tcp connection failure"));
    public static readonly ArraySegment<byte> TSK = new ArraySegment<byte>(Encoding.UTF8.GetBytes("another task is already in progress"));

    public static readonly ArraySegment<byte> WMI_ACC = new ArraySegment<byte>(Encoding.UTF8.GetBytes("access denied"));
    public static readonly ArraySegment<byte> WMI_PRI = new ArraySegment<byte>(Encoding.UTF8.GetBytes("insufficient privilege"));
    public static readonly ArraySegment<byte> WMI_UNK = new ArraySegment<byte>(Encoding.UTF8.GetBytes("unknown failure"));
    public static readonly ArraySegment<byte> WMI_PAT = new ArraySegment<byte>(Encoding.UTF8.GetBytes("path not found"));
    public static readonly ArraySegment<byte> WMI_PAR = new ArraySegment<byte>(Encoding.UTF8.GetBytes("invalid parameter"));
    public static readonly ArraySegment<byte> WMI_RES = new ArraySegment<byte>(Encoding.UTF8.GetBytes("invalid parameter"));

    public static void InitDirs() {
        try {
            DirectoryInfo dirProtest  = new DirectoryInfo(DIR_PROTEST);
            DirectoryInfo dirLastSeen = new DirectoryInfo(DIR_LASTSEEN);
            DirectoryInfo dirMetrics  = new DirectoryInfo(DIR_METRICS);
            DirectoryInfo dirData     = new DirectoryInfo(DIR_DATE);
            DirectoryInfo dirEquip    = new DirectoryInfo(DIR_EQUIP);
            DirectoryInfo dirUsers    = new DirectoryInfo(DIR_USERS);

            if (!dirProtest.Exists)  dirProtest.Create();
            if (!dirLastSeen.Exists) dirLastSeen.Create();
            if (!dirMetrics.Exists)  dirMetrics.Create();
            if (!dirData.Exists)     dirData.Create();
            if (!dirEquip.Exists)    dirEquip.Create();
            if (!dirUsers.Exists)    dirUsers.Create();

        } catch (Exception ex) {
            Logging.Err(ex);
        }
    }

    public static string EscapeUrl(string url) {
        string s = url;

        //s = s.Replace("+", " ");

        s = s.Replace("%0D%0A", "\n");
        //s = s.Replace("%0A", "\n");
        //s = s.Replace("%0D", "\n");

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

        return s;
    }

    public static string EscapeJson(string json) {
        string s = json;

        s = s.Replace("\\", "\\\\");
        s = s.Replace("\"", "\\\"");
        s = s.Replace("\b", "\\\b");
        s = s.Replace("\f", "\\\f");
        s = s.Replace("\n", "\\\n");
        s = s.Replace("\r", "\\\r");
        s = s.Replace("\t", "\\\t");

        return s;
    }

    public static byte[] Version() {
        Version ver = System.Reflection.Assembly.GetExecutingAssembly().GetName().Version;

        string result = "{";
        result += $"\"name\":\"{System.Reflection.Assembly.GetExecutingAssembly().GetName().Name}\",";
        result += $"\"string\":\"{ver.ToString()}\",";
        result += $"\"major\":\"{ver.Major}\",";
        result += $"\"minor\":\"{ver.Minor}\",";
        result += $"\"build\":\"{ver.Build}\",";
        result += $"\"revision\":\"{ver.Revision}\"";
        result += "}";


        return Encoding.UTF8.GetBytes(result);
    }
}

namespace Protest.Protocols.Snmp;

internal static class Oid {

    public static string[] GENERIC_OID = new string[] {
        SYSTEM_DESCRIPTOR,
        SYSTEM_NAME,
        SYSTEM_LOCATION,
        SYSTEM_CONTACT,
    };

    public static string[] PRINTERS_OID = new string[] {
        PRINTER_MODEL,
        PRINTER_SERIAL_NO,
    };

    public static string[] SWITCH_OID = new string[] {
        INT_TYPE,
        INT_DESCRIPTOR,
        INT_ALIAS,
        INT_SPEED,
        INT_1Q_VLAN,
        INT_1Q_VLAN_ENGRESS,
        INT_1D_TP_FDB,
    };

    public static string[] LIVEVIEW_SWITCH_OID = new string[] {
        INT_TYPE,
        INT_SPEED,
        INT_1Q_VLAN,
        INT_1Q_VLAN_ENGRESS,
        INT_STATUS,
        INT_TRAFFIC_BYTES_IN,
        INT_TRAFFIC_BYTES_OUT,
        INT_ERROR_IN,
        INT_ERROR_OUT,
        INT_1D_TP_FDB,
    };

    public static string[] LIVESTATS_OID = new string[] {
        SYSTEM_UPTIME,
        SYSTEM_TEMPERATURE,
    };

    public static string[] LIVESTATS_PRINTER_OID = new string[] {
        PRINTER_STATUS,
        PRINTER_DISPLAY_MESSAGE,
        PRINTER_JOBS,
        PRINTER_MARKER_COUNTER_LIFE,
    };

    public static string[] LIFELINE_PRINTER_OID = new string[] {
        PRINTER_MARKER_COUNTER_LIFE,
        PRINTER_MARKER_COUNTER_PRINTS,
        PRINTER_MARKER_COUNTER_MARKERS,
        PRINTER_MARKER_COUNTER_MONO,
        PRINTER_MARKER_COUNTER_COLOR,
    };

    public static string[] LIFELINE_SWITCH_OID = new string[] {
        INT_TYPE,
        INT_TRAFFIC_BYTES_IN,
        INT_TRAFFIC_BYTES_OUT,
        INT_ERROR_IN,
        INT_ERROR_OUT,
    };

    public static string[] TOPOLOGY_DOT1Q = new string[] {
        INT_1Q_STATIC_NAME,
        INT_1Q_VLAN_ENGRESS,
        INT_1Q_VLAN_UNTAGGED,
    };

    public static string[] TOPOLOGY_TRAFFIC = new string[] {
        INT_TRAFFIC_BYTES_IN,
        INT_TRAFFIC_PKTS_IN_UCAST,
        INT_TRAFFIC_PKTS_IN_MCAST,
        INT_TRAFFIC_PKTS_IN_BCAST,
        INT_TRAFFIC_BYTES_OUT,
        INT_TRAFFIC_PKTS_OUT_UCAST,
        INT_TRAFFIC_PKTS_OUT_MCAST,
        INT_TRAFFIC_PKTS_OUT_BCAST,
    };

    public static string[] TOPOLOGY_ERROR = new string[] {
        INT_ERROR_IN,
        INT_ERROR_OUT,
    };


    public const string LLDP_LOCAL_SYS_DATA  = "1.0.8802.1.1.2.1.3";
    public const string LLDP_REMOTE_SYS_DATA = "1.0.8802.1.1.2.1.4";

    public const string SYSTEM_DESCRIPTOR = "1.3.6.1.2.1.1.1.0";
    public const string SYSTEM_OBJECT_ID  = "1.3.6.1.2.1.1.2.0";
    public const string SYSTEM_UPTIME     = "1.3.6.1.2.1.1.3.0";
    public const string SYSTEM_CONTACT    = "1.3.6.1.2.1.1.4.0";
    public const string SYSTEM_NAME       = "1.3.6.1.2.1.1.5.0";
    public const string SYSTEM_LOCATION   = "1.3.6.1.2.1.1.6.0";
    public const string SYSTEM_SERVICES   = "1.3.6.1.2.1.1.7.0";

    public const string INT_TOTAL       = "1.3.6.1.2.1.2.1.0";
    public const string INT_DESCRIPTOR  = "1.3.6.1.2.1.2.2.1.2";
    public const string INT_TYPE        = "1.3.6.1.2.1.2.2.1.3";
    //public const string INT_SPEED     = "1.3.6.1.2.1.2.2.1.5";
    public const string INT_SPEED       = "1.3.6.1.2.1.31.1.1.1.15";
    public const string INT_ENABLE      = "1.3.6.1.2.1.2.2.1.7";
    public const string INT_STATUS      = "1.3.6.1.2.1.2.2.1.8";
    //public const string INT_TRAFFIC_IN  = "1.3.6.1.2.1.2.2.1.10";
    public const string INT_ERROR_IN    = "1.3.6.1.2.1.2.2.1.14";
    //public const string INT_TRAFFIC_OUT = "1.3.6.1.2.1.2.2.1.16";
    public const string INT_ERROR_OUT   = "1.3.6.1.2.1.2.2.1.20";

    public const string INT_1D_TP_FDB        = "1.3.6.1.2.1.17.4.3.1.2";

    public const string INT_1Q_VLAN_ENGRESS  = "1.3.6.1.2.1.17.7.1.4.2.1.4";
    public const string INT_1Q_STATIC_NAME   = "1.3.6.1.2.1.17.7.1.4.3.1.1";
    //public const string INT_1Q_BRIDGE        = "1.3.6.1.2.1.17.7.1.4.3.1.2";
    public const string INT_1Q_VLAN_UNTAGGED = "1.3.6.1.2.1.17.7.1.4.3.1.4";
    public const string INT_1Q_VLAN          = "1.3.6.1.2.1.17.7.1.4.5.1.1";
    public const string INT_ALIAS            = "1.3.6.1.2.1.31.1.1.1.18";

    public const string INT_TRAFFIC_BYTES_IN       = "1.3.6.1.2.1.31.1.1.1.6";
    public const string INT_TRAFFIC_PKTS_IN_UCAST  = "1.3.6.1.2.1.31.1.1.1.7";
    public const string INT_TRAFFIC_PKTS_IN_MCAST  = "1.3.6.1.2.1.31.1.1.1.8";
    public const string INT_TRAFFIC_PKTS_IN_BCAST  = "1.3.6.1.2.1.31.1.1.1.9";
    public const string INT_TRAFFIC_BYTES_OUT      = "1.3.6.1.2.1.31.1.1.1.10";
    public const string INT_TRAFFIC_PKTS_OUT_UCAST = "1.3.6.1.2.1.31.1.1.1.11";
    public const string INT_TRAFFIC_PKTS_OUT_MCAST = "1.3.6.1.2.1.31.1.1.1.12";
    public const string INT_TRAFFIC_PKTS_OUT_BCAST = "1.3.6.1.2.1.31.1.1.1.13";


    public const string INT_MAC       = "1.3.6.1.2.1.2.2.1.6";
    public const string INTERFACE_IP  = "1.3.6.1.2.1.4.20.1.1";
    public const string ROUTING_TABLE = "1.3.6.1.2.1.4.21";
    public const string ARP_TABLE     = "1.3.6.1.2.1.4.22.1";

    public const string TCP_CONNECTIONS = "1.3.6.1.2.1.6.9.0";
    public const string UDP_RECEIVED    = "1.3.6.1.2.1.7.1.0";
    public const string UDP_SENT        = "1.3.6.1.2.1.7.4.0";

    public const string SYSTEM_TEMPERATURE      = "1.3.6.1.2.1.25.1.8.0";
    public const string DISK_TOTAL              = "1.3.6.1.2.1.25.2.3.1.5";
    public const string DISK_USED               = "1.3.6.1.2.1.25.2.3.1.6";
    public const string DISK_FREE               = "1.3.6.1.2.1.25.2.3.1.7";
    public const string SYSTEM_RUNNING_SERVICES = "1.3.6.1.2.1.25.4.2.1.2";
    public const string MEMORY_TOTAL            = "1.3.6.1.4.1.2021.4.5.0";
    public const string MEMORY_FREE             = "1.3.6.1.4.1.2021.4.11.0";
    public const string PROCESSOR_LOAD          = "1.3.6.1.4.1.2021.10.1.3.1";

    public const string SECURITY_MODEL          = "1.3.6.1.6.3.10.2.1.1.0";
    public const string AUTHENTICATION_PROTOCOL = "1.3.6.1.6.3.10.1.1.1.0";
    public const string PRIVACY_PROTOCOL        = "1.3.6.1.6.3.10.1.2.1.0";

    public const string PRINTER_STATUS          = "1.3.6.1.2.1.25.3.5.1.1.1";
    public const string PRINTER_MODEL           = "1.3.6.1.2.1.25.3.2.1.3.1";
    public const string PRINTER_SERIAL_NO       = "1.3.6.1.2.1.43.5.1.1.17.1";
    public const string PRINTER_DISPLAY_MESSAGE = "1.3.6.1.2.1.43.16.5";

    public const string PRINTER_MARKER_COUNTER_LIFE    = "1.3.6.1.2.1.43.10.2.1.4.1.1";
    public const string PRINTER_MARKER_COUNTER_PRINTS  = "1.3.6.1.2.1.43.10.2.1.5.1.1";
    public const string PRINTER_MARKER_COUNTER_MARKERS = "1.3.6.1.2.1.43.10.2.1.6.1.1";
    public const string PRINTER_MARKER_COUNTER_MONO    = "1.3.6.1.2.1.43.10.2.1.8.1.1";
    public const string PRINTER_MARKER_COUNTER_COLOR   = "1.3.6.1.2.1.43.10.2.1.9.1.1";
    public const string PRINTER_MARKER_COLORANT_ENTRY  = "1.3.6.1.2.1.43.12.1.1.4";

    public const string PRINTER_TONERS        = "1.3.6.1.2.1.43.11.1.1.6";
    public const string PRINTER_TONERS_MAX    = "1.3.6.1.2.1.43.11.1.1.8";
    public const string PRINTER_TONER_CURRENT = "1.3.6.1.2.1.43.11.1.1.9";

    public const string PRINTER_TRAYS_TYPE   = "1.3.6.1.2.1.43.8.2.1.2";
    public const string PRINTER_TRAYS_LEVEL  = "1.3.6.1.2.1.43.8.2.1.10";
    public const string PRINTER_TRAYS_STATUS = "1.3.6.1.2.1.43.8.2.1.11";
    public const string PRINTER_TRAYS        = "1.3.6.1.2.1.43.8.2.1.18";
    
    public const string PRINTER_JOBS = "1.3.6.1.4.1.11.2.3.9.4.2.1.1.6.5.1";

}
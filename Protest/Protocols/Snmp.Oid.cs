namespace Protest.Protocols.Snmp;

internal static class Oid {

    public static readonly string[] GENERIC_OID = new string[] {
        SYSTEM_DESCRIPTOR,
        SYSTEM_NAME,
        SYSTEM_LOCATION,
        SYSTEM_CONTACT,
    };

    public static readonly string[] PRINTERS_OID = new string[] {
        PRINTER_MODEL,
        PRINTER_SERIAL_NO,
    };

    public static readonly string[] SWITCH_OID = new string[] {
        IF_TYPE,
        IF_DESCRIPTOR,
        IF_ALIAS,
        IF_HC_SPEED,
        DOT_1Q_PVLAN,
        DOT_1Q_VLAN_EGRESS,
        DOT_1D_TP_FDB,
    };

    public static readonly string[] LIVEVIEW_SWITCH_OID = new string[] {
        IF_TYPE,
        IF_HC_SPEED,
        DOT_1Q_PVLAN,
        DOT_1Q_VLAN_EGRESS,
        IF_STATUS,
        IF_HC_IN_OCTETS,
        IF_HC_OUT_OCTETS,
        IF_IN_ERROR,
        IF_OUT_ERROR,
        DOT_1D_TP_FDB,
    };

    public static readonly string[] LIVESTATS_OID = new string[] {
        SYSTEM_UPTIME
    };

    public static readonly string[] LIVESTATS_PRINTER_OID = new string[] {
        PRINTER_STATUS,
        PRINTER_DISPLAY_MESSAGE,
        PRINTER_JOBS,
        PRINTER_MARKER_COUNTER_LIFE,
    };

    public static readonly string[] LIFELINE_PRINTER_OID = new string[] {
        PRINTER_MARKER_COUNTER_LIFE,
        PRINTER_MARKER_COUNTER_PRINTS,
        PRINTER_MARKER_COUNTER_MARKERS,
        PRINTER_MARKER_COUNTER_MONO,
        PRINTER_MARKER_COUNTER_COLOR,
    };

    public static readonly string[] LIFELINE_SWITCH_OID = new string[] {
        IF_TYPE,
        IF_HC_IN_OCTETS,
        IF_HC_OUT_OCTETS,
        IF_IN_ERROR,
        IF_OUT_ERROR,
    };

    public static readonly string[] TOPOLOGY_DOT1Q = new string[] {
        DOT_1Q_VLAN_STATIC_NAME,
        DOT_1Q_VLAN_EGRESS,
        DOT_1Q_VLAN_STATIC_UNTAGGED,
    };

    public static readonly string[] TOPOLOGY_TRAFFIC = new string[] {
        IF_HC_IN_OCTETS,
        IF_HC_IN_UCAST_PKTS,
        IF_HC_IN_MCAST_PKTS,
        IF_HC_IN_BCAST_PKTS,
        IF_HC_OUT_OCTETS,
        IF_HC_OUT_UCAST_PKTS,
        IF_HC_OUT_MCAST_PKTS,
        IF_HC_OUT_BCAST_PKTS,
    };

    public static readonly string[] TOPOLOGY_ERROR = new string[] {
        IF_IN_ERROR,
        IF_OUT_ERROR,
    };


    public const string LLDP_LOCAL_SYS_DATA        = "1.0.8802.1.1.2.1.3";
    public const string LLDP_LOCAL_CHASSIS_ID_TYPE = "1.0.8802.1.1.2.1.3.1.0";
    public const string LLDP_LOCAL_CHASSIS_ID      = "1.0.8802.1.1.2.1.3.2.0";
    public const string LLDP_REMOTE_SYS_DATA       = "1.0.8802.1.1.2.1.4";

    public const string SYSTEM_DESCRIPTOR = "1.3.6.1.2.1.1.1.0";
    public const string SYSTEM_OBJECT_ID  = "1.3.6.1.2.1.1.2.0";
    public const string SYSTEM_UPTIME     = "1.3.6.1.2.1.1.3.0";
    public const string SYSTEM_CONTACT    = "1.3.6.1.2.1.1.4.0";
    public const string SYSTEM_NAME       = "1.3.6.1.2.1.1.5.0";
    public const string SYSTEM_LOCATION   = "1.3.6.1.2.1.1.6.0";
    public const string SYSTEM_SERVICES   = "1.3.6.1.2.1.1.7.0";

    public const string IF_NUMBER      = "1.3.6.1.2.1.2.1.0";
    public const string IF_DESCRIPTOR  = "1.3.6.1.2.1.2.2.1.2";
    public const string IF_TYPE        = "1.3.6.1.2.1.2.2.1.3";
    public const string IF_SPEED       = "1.3.6.1.2.1.2.2.1.5";
    public const string IF_ENABLE      = "1.3.6.1.2.1.2.2.1.7";
    public const string IF_STATUS      = "1.3.6.1.2.1.2.2.1.8";
    //public const string IF_IN_OCTETS   = "1.3.6.1.2.1.2.2.1.10";
    public const string IF_IN_ERROR    = "1.3.6.1.2.1.2.2.1.14";
    //public const string IF_OUT_OCTETS  = "1.3.6.1.2.1.2.2.1.16";
    public const string IF_OUT_ERROR   = "1.3.6.1.2.1.2.2.1.20";

    public const string DOT_1D_TP_FDB               = "1.3.6.1.2.1.17.4.3.1.2";
    public const string DOT_1Q_VLAN_EGRESS          = "1.3.6.1.2.1.17.7.1.4.2.1.4";
    public const string DOT_1Q_VLAN_STATIC_NAME     = "1.3.6.1.2.1.17.7.1.4.3.1.1";
    //public const string DOT_1Q_VLAN_STATIS_EGRESS   = "1.3.6.1.2.1.17.7.1.4.3.1.2";
    public const string DOT_1Q_VLAN_STATIC_UNTAGGED = "1.3.6.1.2.1.17.7.1.4.3.1.4";
    public const string DOT_1Q_PVLAN                = "1.3.6.1.2.1.17.7.1.4.5.1.1";

    public const string IF_HC_IN_OCTETS             = "1.3.6.1.2.1.31.1.1.1.6";
    public const string IF_HC_IN_UCAST_PKTS         = "1.3.6.1.2.1.31.1.1.1.7";
    public const string IF_HC_IN_MCAST_PKTS         = "1.3.6.1.2.1.31.1.1.1.8";
    public const string IF_HC_IN_BCAST_PKTS         = "1.3.6.1.2.1.31.1.1.1.9";
    public const string IF_HC_OUT_OCTETS            = "1.3.6.1.2.1.31.1.1.1.10";
    public const string IF_HC_OUT_UCAST_PKTS        = "1.3.6.1.2.1.31.1.1.1.11";
    public const string IF_HC_OUT_MCAST_PKTS        = "1.3.6.1.2.1.31.1.1.1.12";
    public const string IF_HC_OUT_BCAST_PKTS        = "1.3.6.1.2.1.31.1.1.1.13";
    public const string IF_HC_SPEED                 = "1.3.6.1.2.1.31.1.1.1.15";
    public const string IF_HC_CONNECTOR_PRESENT     = "1.3.6.1.2.1.31.1.1.1.17";
    public const string IF_ALIAS                    = "1.3.6.1.2.1.31.1.1.1.18";

    public const string IF_PHYS_ADDRESS     = "1.3.6.1.2.1.2.2.1.6";
    public const string IF_IP_ADDRESS_ENTRY = "1.3.6.1.2.1.4.20.1.1";

    public const string IP_ROUTING_TABLE      = "1.3.6.1.2.1.4.21";
    public const string IP_NET_TO_MEDIA_TABLE = "1.3.6.1.2.1.4.22";

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
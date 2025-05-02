using System.Collections.Generic;
using System.Net;
using System.Text.Json;
using Protest.Tools;
using Lextm.SharpSnmpLib;

namespace Protest.Protocols.Snmp;

internal static partial class Polling {

    enum InterfaceType : byte {
        other           = 1,
        physicalPort    = 6,
        loopback        = 24,
        virtualPort     = 53,
        multiplexor     = 54,
        gigabitEther    = 117,
        l2vlan          = 135,
        wlan            = 161, //ieee802.11
        linkAggregation = 209, //ieee802.3a
    }

    enum InterfaceStatus : byte {
        up             = 1,
        down           = 2,
        testing        = 3,
        unknown        = 4,
        dormant        = 5,
        notPresent     = 6,
        lowerLayerDown = 7,
    }

    enum InterfaceEnable : byte {
        enabled  = 1,
        disabled = 2,
        testing  = 3,
    }

    public static byte[] SwitchInterface(HttpListenerContext ctx, Dictionary<string, string> parameters) {
        if (parameters is null) { return Data.CODE_INVALID_ARGUMENT.Array; }

        parameters.TryGetValue("file", out string file);
        if (string.IsNullOrEmpty(file)) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        DatabaseInstances.devices.dictionary.TryGetValue(file, out Database.Entry entry);

        if (!entry.attributes.TryGetValue("ip", out Database.Attribute _ip)
            || String.IsNullOrEmpty(_ip.value)) {
            return Data.CODE_NOT_ENOUGH_INFO.Array;
        }

        if (!entry.attributes.TryGetValue("snmp profile", out Database.Attribute _profileGuid)) {
            return Data.CODE_NOT_ENOUGH_INFO.Array;
        }

        if (!SnmpProfiles.FromGuid(_profileGuid.value, out SnmpProfiles.Profile _snmpProfile)
            || _snmpProfile is null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        if (!IPAddress.TryParse(_ip.value, out IPAddress _ipAddress)) { 
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        try {
            Dictionary<string, string> interfaces =
            Polling.ParseResponse(
                Polling.SnmpQuery(_ipAddress, _snmpProfile, Oid.SWITCH_OID, Polling.SnmpOperation.Walk)
            );

            Dictionary<int, string> descriptor = new Dictionary<int, string>();
            Dictionary<int, string> alias      = new Dictionary<int, string>();
            Dictionary<int, string> type       = new Dictionary<int, string>();
            Dictionary<int, string> speed      = new Dictionary<int, string>();
            Dictionary<int, string> vlan       = new Dictionary<int, string>();

            foreach (KeyValuePair<string, string> pair in interfaces) {
                int index = int.Parse(pair.Key.Split('.').Last());

                if (pair.Key.StartsWith(Oid.INTERFACE_DESCRIPTOR)) {
                    descriptor.Add(index, pair.Value);
                }
                else if (pair.Key.StartsWith(Oid.INTERFACE_ALIAS)) {
                    alias.Add(index, pair.Value);
                }
                else if (pair.Key.StartsWith(Oid.INTERFACE_TYPE)) {
                    type.Add(index, pair.Value);
                }
                else if (pair.Key.StartsWith(Oid.INTERFACE_SPEED)) {
                    speed.Add(index, pair.Value);
                }
                else if (pair.Key.StartsWith(Oid.INTERFACE_1Q_VLAN)) {
                    vlan.Add(index, pair.Value);
                }
            }

            return JsonSerializer.SerializeToUtf8Bytes(
                type.Where(o=> o.Value == "6")
                .Select(pair => new {
                    number  = descriptor.GetValueOrDefault(pair.Key, null),
                    port    = speed.GetValueOrDefault(pair.Key, "N/A") switch {
                        "10000"  => "SFP+",
                        "25000"  => "SFP+",
                        "40000"  => "QSFP",
                        "100000" => "QSFP",
                        "200000" => "QSFP",
                        "400000" => "QSFP",
                        "800000" => "QSFP",
                        _        => "Ethernet"
                    },
                    speed   = speed.GetValueOrDefault(pair.Key, "N/A") switch {
                        "10"     => "10 Mbps",
                        "100"    => "100 Mbps",
                        "1000"   => "1 Gbps",
                        "2500"   => "2.5 Gbps",
                        "5000"   => "5 Gbps",
                        "10000"  => "10 Gbps",
                        "25000"  => "25 Gbps",
                        "40000"  => "40 Gbps",
                        "100000" => "100 Gbps",
                        "200000" => "200 Gbps",
                        "400000" => "400 Gbps",
                        "800000" => "800 Gbps",
                        _        => "N/A"
                    },
                    vlan    = vlan.GetValueOrDefault(pair.Key, "1"),
                    comment = alias.GetValueOrDefault(pair.Key, String.Empty)
                })
            );
        }
        catch (Exception ex) {
            return JsonSerializer.SerializeToUtf8Bytes(new { error = ex.Message });
        }
    }

}
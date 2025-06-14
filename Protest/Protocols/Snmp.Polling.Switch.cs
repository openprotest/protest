using System.Collections.Generic;
using System.Net;
using System.Text;
using System.Text.Json;
using Protest.Tools;
using Lextm.SharpSnmpLib;

namespace Protest.Protocols.Snmp;

internal static partial class Polling {

    public static byte[] GetInterfaces(Dictionary<string, string> parameters) {
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
            IList<Variable> list = Polling.SnmpQuery(_ipAddress, _snmpProfile, Oid.SWITCH_OID, Polling.SnmpOperation.Walk);
            Dictionary<string, string> parsed = Polling.ParseResponse(list);
            if (parsed is null) return "{\"error\":\"Failed to fetch interfaces\"}"u8.ToArray();

            Dictionary<int, string>[] dictionaries = ComputeInterface(list, parsed);

            return SwitchInterfaces_LiveStatFormat(
                dictionaries[0],
                dictionaries[1],
                dictionaries[2],
                dictionaries[3],
                dictionaries[4],
                dictionaries[5],
                dictionaries[6]
            );
        }
        catch (Exception ex) {
            return JsonSerializer.SerializeToUtf8Bytes(new { error = ex.Message });
        }
    }

    public static string FetchInterfaces(System.Net.IPAddress target, SnmpProfiles.Profile snmpProfile) {
        try {
            IList<Variable> list = Polling.SnmpQuery(target, snmpProfile, Oid.SWITCH_OID, Polling.SnmpOperation.Walk);
            Dictionary<string, string> parsed = Polling.ParseResponse(list);
            if (parsed is null) return null;

            Dictionary<int, string>[] dictionaries = ComputeInterface(list, parsed);

            return SwitchInterfaces_FetchFormat(
                dictionaries[0],
                dictionaries[1],
                dictionaries[2],
                dictionaries[3],
                dictionaries[4],
                dictionaries[5],
                dictionaries[6]
            );
        }
        catch {
            return null;
        }
    }



    private static Dictionary<int, string>[] ComputeInterface(IList<Variable> list, Dictionary<string, string> parsed) {
        Dictionary<int, string> descriptor = new Dictionary<int, string>();
        Dictionary<int, string> alias      = new Dictionary<int, string>();
        Dictionary<int, string> type       = new Dictionary<int, string>();
        Dictionary<int, string> speed      = new Dictionary<int, string>();
        Dictionary<int, string> untagged   = new Dictionary<int, string>();
        Dictionary<int, string> tagged     = new Dictionary<int, string>();

        Dictionary<short, List<int>> taggedMap = new Dictionary<short, List<int>>();
        for (int i = 0; i < list.Count; i++) {
            string oid = list[i].Id.ToString();
            if (!oid.StartsWith(Oid.INTERFACE_1Q_VLAN_ENGRESS)) continue;

            int dotIndex = oid.LastIndexOf('.');
            if (dotIndex == -1) continue;
            if (!short.TryParse(oid[(dotIndex + 1)..], out short vlanId)) continue;

            byte[] raw = list[i].Data.ToBytes();

            int startIndex = GetPortBitmapStart(raw);
            if (startIndex == -1) continue;

            int maxIndex = Math.Min(raw.Length, startIndex + GetPortBitmapLength(raw, startIndex));

            for (int j = startIndex; j < maxIndex; j++) {
                byte b = raw[j];
                for (int k = 0; k < 8; k++) {
                    if ((b & (1 << (7 - k))) == 0) continue;

                    int portIndex = 8 * (j - startIndex) + (k + 1);
                    if (!taggedMap.TryGetValue(vlanId, out var ports)) {
                        ports = new List<int>();
                    taggedMap[vlanId] = ports;
                        }
                    if (!ports.Contains(portIndex)) {
                        ports.Add(portIndex);
                    }
                }
            }
        }
        foreach (KeyValuePair<short, List<int>> pair in taggedMap) {
            foreach (int port in pair.Value) {
                tagged.TryGetValue(port, out var existing);
                tagged[port] = string.IsNullOrEmpty(existing) ? pair.Key.ToString() : $"{existing},{pair.Key.ToString()}";
            }
        }

        Dictionary<int, string> macTable = new Dictionary<int, string>();
        foreach (KeyValuePair<string, string> pair in parsed) {
            if (!pair.Key.StartsWith(Oid.INTERFACE_1D_TP_FDB)) continue;
            if (!int.TryParse(pair.Value, out int port)) continue;
            string mac = String.Join(String.Empty, pair.Key.Split('.').TakeLast(6).Select(o=>int.Parse(o).ToString("x2")));

            if (macTable.ContainsKey(port)) {
                macTable[port] = null;
            }
            else {
                macTable.Add(port, mac);
            }
        }

        foreach (KeyValuePair<string, string> pair in parsed) {
            int index = int.Parse(pair.Key.Split('.')[^1]);

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
                untagged.Add(index, pair.Value);
            }
        }

        return new Dictionary<int, string>[] {
            type,
            descriptor,
            speed,
            untagged,
            tagged,
            alias,
            macTable
        };
    }

    internal static int GetPortBitmapStart(byte[] raw) {
        if (raw.Length > 4
            && raw[0] == 0x04
            && raw[2] == 0x02
            && raw[3] == 0x02) {
            return 4;
        }
        return raw.Length >= 3 ? 2 : 0;
    }

    internal static int GetPortBitmapLength(byte[] raw, int startIndex) {
        if (raw.Length > 1 && raw[0] == 0x04) return raw[1];
        return raw.Length - startIndex;
    }

    private static byte[] SwitchInterfaces_LiveStatFormat(
        Dictionary<int, string> type,
        Dictionary<int, string> descriptor,
        Dictionary<int, string> speed,
        Dictionary<int, string> untagged,
        Dictionary<int, string> tagged,
        Dictionary<int, string> alias,
        Dictionary<int, string> macTable) {
        
        return JsonSerializer.SerializeToUtf8Bytes(
            type.Where(o => o.Value == "6")
            .Select(pair => new {
                number = descriptor.GetValueOrDefault(pair.Key, null),
                port = speed.GetValueOrDefault(pair.Key, "N/A") switch {
                    "10000"  => "SFP+",
                    "25000"  => "SFP+",
                    "40000"  => "QSFP",
                    "100000" => "QSFP",
                    "200000" => "QSFP",
                    "400000" => "QSFP",
                    "800000" => "QSFP",
                    _ => "Ethernet"
                },
                speed = speed.GetValueOrDefault(pair.Key, "N/A") switch {
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
                    _ => "N/A"
                },
                untagged = untagged.GetValueOrDefault(pair.Key, ""),
                tagged   = tagged.GetValueOrDefault(pair.Key, ""),
                comment  = alias.GetValueOrDefault(pair.Key, String.Empty),
                link     = DatabaseInstances.FindDeviceByMac(macTable.GetValueOrDefault(pair.Key, null)),
            })
        );
    }

    private static string SwitchInterfaces_FetchFormat(
        Dictionary<int, string> type,
        Dictionary<int, string> descriptor,
        Dictionary<int, string> speed,
        Dictionary<int, string> untagged,
        Dictionary<int, string> tagged,
        Dictionary<int, string> alias,
        Dictionary<int, string> macTable) {
        
        return JsonSerializer.Serialize(new {
            i = type.Where(o => o.Value == "6")
            .Select(pair => new {
                n = descriptor.GetValueOrDefault(pair.Key, null),
                i = speed.GetValueOrDefault(pair.Key, "N/A") switch {
                    "10000" => "SFP+",
                    "25000" => "SFP+",
                    "40000" => "QSFP",
                    "100000" => "QSFP",
                    "200000" => "QSFP",
                    "400000" => "QSFP",
                    "800000" => "QSFP",
                    _ => "Ethernet"
                },
                s = speed.GetValueOrDefault(pair.Key, "N/A") switch {
                    "10" => "10 Mbps",
                    "100" => "100 Mbps",
                    "1000" => "1 Gbps",
                    "2500" => "2.5 Gbps",
                    "5000" => "5 Gbps",
                    "10000" => "10 Gbps",
                    "25000" => "25 Gbps",
                    "40000" => "40 Gbps",
                    "100000" => "100 Gbps",
                    "200000" => "200 Gbps",
                    "400000" => "400 Gbps",
                    "800000" => "800 Gbps",
                    _ => "N/A"
                },
                v = untagged.GetValueOrDefault(pair.Key, ""),
                t = tagged.GetValueOrDefault(pair.Key, ""),
                c = alias.GetValueOrDefault(pair.Key, String.Empty),
                l = DatabaseInstances.FindDeviceByMac(macTable.GetValueOrDefault(pair.Key, null)),
            }),
            n = "horizontal"
        });
    }

}
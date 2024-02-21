using System.Collections.Generic;
using System.IO;
using System.Management;
using System.Net;
using System.Runtime.Versioning;
using System.Text;

namespace Protest.Protocols;

//https://msdn.microsoft.com/en-us/library/aa394388(v=vs.85).aspx
//https://docs.microsoft.com/en-us/windows/desktop/wmisdk/swbemsecurity-impersonationlevel
//https://docs.microsoft.com/en-us/windows/desktop/wmisdk/swbemsecurity-authenticationlevel

[SupportedOSPlatform("windows")]
internal static class Wmi {
    //private static readonly ArraySegment<byte> CODE_OK                     = new ArraySegment<byte>("ok"u8.ToArray());
    private static readonly ArraySegment<byte> CODE_ACCESS_DENIED          = new ArraySegment<byte>("access denied"u8.ToArray());
    private static readonly ArraySegment<byte> CODE_INSUFFICIENT_PRIVILEGE = new ArraySegment<byte>("insufficient privilege"u8.ToArray());
    private static readonly ArraySegment<byte> CODE_UNKNOWN                = new ArraySegment<byte>("unknown failure"u8.ToArray());
    private static readonly ArraySegment<byte> CODE_PATH_NOT_FOUND         = new ArraySegment<byte>("path not found"u8.ToArray());
    private static readonly ArraySegment<byte> CODE_AUTHENTICATION_FAILED  = new ArraySegment<byte>("authentication failed"u8.ToArray());
    //private static readonly ArraySegment<byte> CODE_INVALID                = new ArraySegment<byte>("invalid parameter"u8.ToArray());

    /*public static ManagementScope WmiScope(string host, string impersonation, string username, string password) {
        ImpersonationLevel impersonationLevel = impersonation.ToLower() switch {
            "an" => ImpersonationLevel.Anonymous,
            "id" => ImpersonationLevel.Identify,
            "im" => ImpersonationLevel.Impersonate,
            _ => ImpersonationLevel.Default
        };
        return Scope(host, impersonationLevel, username, password);
    }*/
    public static ManagementScope Scope(string host) {
        return Scope(host, ImpersonationLevel.Impersonate, String.Empty, String.Empty);
    }
    public static ManagementScope Scope(string host, ImpersonationLevel impersonation, string username, string password) {
        ConnectionOptions options = new ConnectionOptions();
        if (username?.Length > 0) options.Username = username;
        if (password?.Length > 0) options.Password = password;

        options.Impersonation = impersonation;
        options.Authentication = AuthenticationLevel.PacketPrivacy;

        ManagementScope scope;
        try {
            scope = new ManagementScope($"\\\\{host}\\root\\cimv2", options);
            scope.Connect();
            if (!scope.IsConnected) return null;
            return scope;
        }
        catch (UnauthorizedAccessException) {
            return null;
        }
        catch (ManagementException) {
            return null;
        }
        catch {
            return null;
        }
    }

    public delegate string FormatMethodPtr(string value);

    private static string ManagementObjectToString(ManagementObject obj, string property, FormatMethodPtr format) {
        try {
            string value = FormatProperty(obj.Properties[property], format);
            return value;
        }
        catch { }

        return String.Empty;
    }

    public static string FormatProperty(PropertyData property, FormatMethodPtr format = null) {
        if (property.IsArray) {
            object[] array = (object[])property.Value;

            string value = String.Empty;
            for (int i = 0; i < array?.Length; i++) {
                if (array[i].ToString().Length > 0) {
                    value += (value.Length == 0) ? array[i].ToString() : "; " + array[i].ToString();
                }
            }

            return value;
        }

        if (property.Type.ToString() == "DateTime") {
            return DateTimeToString(property.Value?.ToString() ?? String.Empty);
        }
        else {
            if (format != null && property.Value != null) return format.Invoke(property.Value.ToString());
            return property.Value?.ToString() ?? String.Empty;
        }
    }

    public static string WmiGet(string host, string className, string property, bool isArray, FormatMethodPtr format = null) {
        ManagementScope scope = Scope(host);
        if (scope is null) return String.Empty;
        WmiGet(scope, className, property, isArray, format);
        return String.Empty;
    }
    public static string WmiGet(ManagementScope scope, string className, string property, bool isArray, FormatMethodPtr format = null) {
        try {
            ManagementObjectCollection moc = new ManagementObjectSearcher(scope, new SelectQuery(className)).Get();
            return WmiGet(moc, property, isArray, format);
        }
        catch { }

        return String.Empty;
    }
    public static string WmiGet(ManagementObjectCollection moc, string property, bool isArray, FormatMethodPtr format = null) {
        if (isArray) {

            string value = String.Empty;
            foreach (ManagementObject o in moc.Cast<ManagementObject>()) {
                string v = ManagementObjectToString(o, property, format);

                if (v.Contains(';')) {
                    string[] split = v.Split(';');
                    for (int i = 0; i < split.Length; i++) {
                        split[i] = split[i].Trim();
                        if (format != null) split[i] = format.Invoke(split[i]);
                        if (split[i].Length > 0) value += (value.Length == 0) ? $"{split[i]}" : $"; {split[i]}";
                    }
                }
                else {
                    if (!String.IsNullOrEmpty(v)) value += (value.Length == 0) ? $"{v}" : $"; {v}";
                }

            }
            if (value.Length > 0) return value.Trim();

        }
        else {
            foreach (ManagementObject o in moc.Cast<ManagementObject>()) {
                string value = ManagementObjectToString(o, property, format);
                if (value.Length > 0) return value.Trim();
            }
        }

        return String.Empty;
    }

    private static void ContentBuilderAddValue(ManagementObjectCollection moc, string property, string label, Dictionary<string, string> data, FormatMethodPtr format = null) {
        string value = WmiGet(moc, property, false, format);
        if (value != null && value.Length > 0) data.Add(label, value);
    }
    private static void ContentBuilderAddArray(ManagementObjectCollection moc, string property, string label, Dictionary<string, string> data, FormatMethodPtr format = null) {
        string value = WmiGet(moc, property, true, format);
        if (value != null && value.Length > 0) data.Add(label, value);
    }

    public static Dictionary<string, string> WmiFetch(string host) {
        Dictionary<string, string> data = new Dictionary<string, string>();

        string type = String.Empty;

        ManagementScope scope = Scope(host);
        if (scope is not null) {
            try {
                using ManagementObjectCollection moc = new ManagementObjectSearcher(scope, new SelectQuery("Win32_SystemEnclosure")).Get();
                string chassis = String.Empty;
                foreach (ManagementObject o in moc.Cast<ManagementObject>()) {
                    short chassisTypes = (short)o.GetPropertyValue("ChassisTypes");
                    chassis = ChassisToString(chassisTypes);
                    type = ChassisToType(chassisTypes);

                    if (chassis.Length > 0) {
                        data.Add("chassis type", chassis);
                        break;
                    }
                }
            }
            catch { }

            try {
                using ManagementObjectCollection moc = new ManagementObjectSearcher(scope, new SelectQuery("SELECT * FROM Win32_NetworkAdapterConfiguration WHERE IPEnabled = True")).Get();
                //ContentBuilderAddArray(moc, "IPAddress", "ipv6", hash, new FormatMethodPtr(IPv6Filter));
                ContentBuilderAddArray(moc, "IPAddress", "ip", data, new FormatMethodPtr(IPv4Filter));
                ContentBuilderAddArray(moc, "MACAddress", "mac address", data);
                ContentBuilderAddArray(moc, "IPSubnet", "mask", data, new FormatMethodPtr(IPv4MaskFilter));
                ContentBuilderAddArray(moc, "DHCPEnabled", "dhcp enabled", data);
            }
            catch { }

            try {
                using ManagementObjectCollection moc = new ManagementObjectSearcher(scope, new SelectQuery("SELECT * FROM Win32_NetworkAdapter WHERE PhysicalAdapter = True")).Get();
                ContentBuilderAddArray(moc, "Speed", "network adapter speed", data, new FormatMethodPtr(TransferRateToString));
            }
            catch { }

            try {
                using ManagementObjectCollection moc = new ManagementObjectSearcher(scope, new SelectQuery("Win32_ComputerSystem")).Get();
                ContentBuilderAddValue(moc, "Name", "name", data);
                ContentBuilderAddValue(moc, "DNSHostName", "hostname", data);
                ContentBuilderAddValue(moc, "Manufacturer", "manufacturer", data);
                ContentBuilderAddValue(moc, "UserName", "owner", data);
                ContentBuilderAddValue(moc, "Model", "model", data);

                foreach (ManagementObject o in moc.Cast<ManagementObject>()) {
                    bool isHypervisorPresent = (bool)o.GetPropertyValue("HypervisorPresent");
                    if (isHypervisorPresent) {
                        type = "Hypervisor";
                        break;
                    }
                }
            }
            catch { }

            if (data.TryGetValue("model", out string model) && model.ToLower().Contains("virtual")) {
                type = "Virtual machine";
            }

            try {
                using ManagementObjectCollection moc = new ManagementObjectSearcher(scope, new SelectQuery("Win32_Baseboard")).Get();
                ContentBuilderAddValue(moc, "Manufacturer", "motherboard manufacturer", data);
                ContentBuilderAddValue(moc, "Product", "motherboard", data);
                ContentBuilderAddValue(moc, "SerialNumber", "motherboard serial number", data);
            }
            catch { }

            try {
                using ManagementObjectCollection moc = new ManagementObjectSearcher(scope, new SelectQuery("Win32_BIOS")).Get();
                ContentBuilderAddValue(moc, "Name", "bios", data);
                ContentBuilderAddValue(moc, "SerialNumber", "serial number", data);
            }
            catch { }

            try {
                using ManagementObjectCollection moc = new ManagementObjectSearcher(scope, new SelectQuery("Win32_Processor")).Get();
                ContentBuilderAddArray(moc, "Name", "processor", data, new FormatMethodPtr(ProcessorString));
                ContentBuilderAddValue(moc, "NumberOfCores", "cpu cores", data);
                ContentBuilderAddValue(moc, "CurrentClockSpeed", "cpu frequency", data, new FormatMethodPtr(ToMHz));
                ContentBuilderAddValue(moc, "AddressWidth", "cpu architecture", data, new FormatMethodPtr(ArchitectureString));
            }
            catch { }

            try {
                UInt64 L1 = 0, L2 = 0, L3 = 0;

                using (ManagementObjectCollection moc = new ManagementObjectSearcher(scope, new SelectQuery("SELECT BlockSize, NumberOfBlocks, Purpose FROM Win32_CacheMemory")).Get())
                    foreach (ManagementObject o in moc.Cast<ManagementObject>()) {
                        if (!o.GetPropertyValue("Purpose").ToString().Contains("L1")) continue;
                        UInt64 numberOfBlocks = UInt64.Parse(o.GetPropertyValue("NumberOfBlocks").ToString());
                        UInt64 blockSize = UInt64.Parse(o.GetPropertyValue("BlockSize").ToString());
                        L1 += numberOfBlocks * blockSize;
                    }

                using (ManagementObjectCollection moc = new ManagementObjectSearcher(scope, new SelectQuery("SELECT BlockSize, NumberOfBlocks, Purpose FROM Win32_CacheMemory")).Get())
                    foreach (ManagementObject o in moc.Cast<ManagementObject>()) {
                        if (!o.GetPropertyValue("Purpose").ToString().Contains("L2")) continue;
                        UInt64 numberOfBlocks = UInt64.Parse(o.GetPropertyValue("NumberOfBlocks").ToString());
                        UInt64 blockSize = UInt64.Parse(o.GetPropertyValue("BlockSize").ToString());
                        L2 += numberOfBlocks * blockSize;
                    }

                using (ManagementObjectCollection moc = new ManagementObjectSearcher(scope, new SelectQuery("SELECT BlockSize, NumberOfBlocks, Purpose FROM Win32_CacheMemory")).Get())
                    foreach (ManagementObject o in moc.Cast<ManagementObject>()) {
                        if (!o.GetPropertyValue("Purpose").ToString().Contains("L3")) continue;
                        UInt64 numberOfBlocks = UInt64.Parse(o.GetPropertyValue("NumberOfBlocks").ToString());
                        UInt64 blockSize = UInt64.Parse(o.GetPropertyValue("BlockSize").ToString());
                        L3 += numberOfBlocks * blockSize;
                    }

                if (L1 > 0 || L2 > 0 || L3 > 0) {
                    data.Add("cpu cache", $"{SizeToString(L1.ToString())}/{SizeToString(L2.ToString())}/{SizeToString(L3.ToString())}");
                }
            }
            catch { }

            try {
                using ManagementObjectCollection moc = new ManagementObjectSearcher(scope, new SelectQuery("Win32_PhysicalMemory")).Get();

                ulong totalMemory = 0;
                string memoryType = String.Empty, smbiosType = String.Empty;
                foreach (ManagementObject o in moc.Cast<ManagementObject>()) {
                    if (ulong.TryParse(o.GetPropertyValue("Capacity").ToString(), out ulong capacity)) {
                        totalMemory += capacity;
                    }
                    memoryType = o.GetPropertyValue("MemoryType").ToString();
                    smbiosType = o.GetPropertyValue("SMBIOSMemoryType").ToString();
                }
                data.Add("total memory", SizeToString(totalMemory.ToString()));

                ContentBuilderAddArray(moc, "Capacity", "memory modules", data, new FormatMethodPtr(SizeToString));
                ContentBuilderAddValue(moc, "Speed", "ram speed", data, new FormatMethodPtr(ToMHz));
                //ContentBuilderAddValue(moc, "MemoryType", "ram type", hash, new FormatMethodPtr(RamType));
                ContentBuilderAddValue(moc, "FormFactor", "ram form factor", data, new FormatMethodPtr(RamFormFactor));

                if (smbiosType == "20" || smbiosType == "21" || smbiosType == "22" || smbiosType == "23" || smbiosType == "24" || smbiosType == "25" || smbiosType == "26") {
                    data.Add("ram type", SMBIOSMemoryType(smbiosType));
                }
                else {
                    data.Add("ram type", RamType(memoryType));
                }

            }
            catch { }

            try {
                using ManagementObjectCollection moc = new ManagementObjectSearcher(scope, new SelectQuery("Win32_PhysicalMemoryArray")).Get();
                ContentBuilderAddValue(moc, "MemoryDevices", "ram slot", data);
            }
            catch { }

            try {
                using ManagementObjectCollection moc = new ManagementObjectSearcher(scope, new SelectQuery("SELECT * FROM Win32_DiskDrive WHERE MediaType = \"Fixed hard disk media\"")).Get();
                ContentBuilderAddArray(moc, "Size", "physical disk", data, new FormatMethodPtr(SizeToString));
            }
            catch { }

            try {
                using ManagementObjectCollection moc = new ManagementObjectSearcher(scope, new SelectQuery("SELECT * FROM Win32_LogicalDisk WHERE DriveType = 3")).Get();
                ContentBuilderAddArray(moc, "Size", "logical disk", data, new FormatMethodPtr(SizeToString));
            }
            catch { }

            try {
                using ManagementObjectCollection moc = new ManagementObjectSearcher(scope, new SelectQuery("Win32_VideoController")).Get();
                ContentBuilderAddArray(moc, "Name", "video controller", data);
                ContentBuilderAddArray(moc, "DriverVersion", "video driver", data);
            }
            catch { }

            try {
                using ManagementObjectCollection moc = new ManagementObjectSearcher(scope, new SelectQuery("Win32_OperatingSystem")).Get();
                ContentBuilderAddValue(moc, "Caption", "operating system", data);
                ContentBuilderAddValue(moc, "OSArchitecture", "os architecture", data);
                ContentBuilderAddValue(moc, "Version", "os version", data);
                ContentBuilderAddValue(moc, "BuildNumber", "os build", data);
                ContentBuilderAddValue(moc, "CSDVersion", "service pack", data);
                ContentBuilderAddValue(moc, "InstallDate", "os install date", data, new FormatMethodPtr(DateToString));
                ContentBuilderAddValue(moc, "SerialNumber", "os serial no", data);

                foreach (ManagementObject o in moc.Cast<ManagementObject>()) {
                    string osName = o.GetPropertyValue("Caption").ToString();
                    if (osName.ToLower().IndexOf("server") > -1) {
                        type = "Server";
                        break;
                    }
                }
            }
            catch { }
        }

        if (type.Length > 0) data.Add("type", $"{type}");

        return data;
    }

    public static byte[] Query(HttpListenerContext ctx, Dictionary<string, string> parameters) {
        if (parameters is null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        if (!parameters.TryGetValue("target", out string host)) {
            return null;
        }

        using StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding);
        string query = reader.ReadToEnd().Trim();

        return Query(host, query);
    }

    public static byte[] Query(string host, string query) {
        ManagementScope scope = Scope(host);
        if (scope is null) return null;

        ManagementObjectCollection moc;
        try {
            moc = new ManagementObjectSearcher(scope.Path.ToString(), query).Get();
            if (moc.Count == 0) return null;
        }
        catch {
            return null;
        }

        bool label_once = true;
        StringBuilder builder = new StringBuilder();

        foreach (ManagementObject o in moc.Cast<ManagementObject>()) {
            if (label_once) { //header
                label_once = false;
                builder.Append(o.Properties.Count);
                builder.Append((char)127);

                foreach (PropertyData p in o.Properties) {
                    builder.Append(p.Name.ToString() + (char)127);
                }
            }

            foreach (PropertyData p in o.Properties) { //values
                try {
                    string value = FormatProperty(p);
                    builder.Append(value + (char)127);
                }
                catch {
                    builder.Append((char)127);
                }
            }
        }

        return Encoding.UTF8.GetBytes(builder.ToString());
    }

    public static byte[] WmiKillProcess(Dictionary<string, string> parameters) {
        if (parameters is null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        if (!parameters.TryGetValue("target", out string host)) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        int pid;
        if (parameters.TryGetValue("pid", out string pidString)) {
            pid = int.Parse(pidString);
        }
        else {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }
        if (pid == -1) return Data.CODE_INVALID_ARGUMENT.Array;

        ManagementScope scope = Scope(host);
        if (scope is null) return CODE_UNKNOWN.Array;

        ManagementObjectCollection moc;
        try {
            moc = new ManagementObjectSearcher(scope.Path.ToString(), "SELECT * FROM Win32_Process WHERE ProcessId = " + pid).Get();
            if (moc.Count == 0) return "no such process id"u8.ToArray();
        }
        catch {
            return CODE_UNKNOWN.Array;
        }

        foreach (ManagementObject o in moc.Cast<ManagementObject>()) {
            object exit = o.InvokeMethod("Terminate", null);
            return int.Parse(exit.ToString()) switch {
                0 => Data.CODE_OK.Array,
                2 => CODE_ACCESS_DENIED.Array,
                3 => CODE_INSUFFICIENT_PRIVILEGE.Array,
                8 => CODE_UNKNOWN.Array,
                9 => CODE_PATH_NOT_FOUND.Array,
                21 => Data.CODE_INVALID_ARGUMENT.Array,
                _ => CODE_UNKNOWN.Array,
            };
        }

        return CODE_UNKNOWN.Array;
    }

    //const LogOff          = 0
    //const Shutdown        = 1
    //const Reboot          = 2
    //const ForceLogOff     = 4  <-
    //const ForcedShutdown  = 5
    //const ForceReboot     = 6  <-
    //const PowerOff        = 8
    //const ForcePowerOff   = 12 <-
    public static byte[] Wmi_Win32PowerHandler(Dictionary<string, string> parameters, int flags) {
        if (parameters is null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        parameters.TryGetValue("file", out string file);
        string host = String.Empty;

        if (DatabaseInstances.devices.dictionary.TryGetValue(file, out Database.Entry entry)) {
            if (entry.attributes.TryGetValue("ip", out Database.Attribute ipValue)) {
                host = ipValue.value;
            }
            else if (entry.attributes.TryGetValue("hostname", out Database.Attribute hostnameValue)) {
                host = hostnameValue.value;
            }
        }

        if (host.Length == 0) return Data.CODE_INVALID_ARGUMENT.Array;

        return Wmi_Win32Shutdown(host, flags);
    }

    public static byte[] Wmi_Win32Shutdown(string host, int flags) {
        if (host.Contains(';')) host = host[..host.IndexOf(";")].Trim();

        ManagementScope scope = Scope(host);
        if (scope is null) return Data.CODE_HOST_UNKNOWN.Array;

        using ManagementObjectSearcher searcher = new ManagementObjectSearcher(scope, new SelectQuery("Win32_OperatingSystem"));

        try {
            foreach (ManagementObject o in searcher.Get().Cast<ManagementObject>()) {
                ManagementBaseObject inParams = o.GetMethodParameters("Win32Shutdown");
                inParams["Flags"] = flags;
                o.InvokeMethod("Win32Shutdown", inParams, null);
            }
        }
        catch (ManagementException ex) {
            return Encoding.UTF8.GetBytes($"{{\"error\":\"{Data.EscapeJsonText(ex.Message)}\"}}");
        }
        catch (UnauthorizedAccessException ex) {
            return Encoding.UTF8.GetBytes($"{{\"error\":\"{Data.EscapeJsonText(ex.Message)}\"}}");
        }

        return Data.CODE_OK.Array;
    }

    private static string ChassisToString(short chassisType) {
        return chassisType switch {
            3 => "Desktop;",
            4 => "Low profile desktop",
            5 => "Pizza box",
            6 => "Mini tower",
            7 => "Tower",
            8 => "Portable",
            9 => "Laptop",
            10 => "Notebook",
            11 => "Hand held",
            12 => "Docking station",
            13 => "All in one",
            14 => "Sub notebook",
            15 => "Space-saving",
            16 => "Lunch box",
            17 => "Main system chassis",
            18 => "Expansion chassis",
            19 => "Sub-chassis",
            20 => "Bus expansion chassis",
            21 => "Peripheral chassis",
            22 => "Storage chassis",
            23 => "Rack mount chassis",
            24 => "Sealed-case PC",
            25 => "Multi-system chassis",
            26 => "Compact PCI",
            27 => "Advanced TCA",
            28 => "Blade ",
            29 => "Blade Enclosure",
            30 => "Tablet ",
            31 => "Convertible ",
            32 => "Detachable ",
            33 => "IoT Gateway",
            34 => "Embedded PC",
            35 => "Mini PC",
            36 => "Stick PC",
            _ => String.Empty
        };
    }

    private static string ChassisToType(short chassisType) {
        return chassisType switch {
            //3 => "Workstation",
            //4 => "Workstation",
            //5 => "Workstation",
            //6 => "Workstation",
            //7 => "Workstation",

            8 => "Laptop",
            9 => "Laptop",
            10 => "Laptop",
            11 => "Laptop",

            //12 => "Workstation",
            13 => "All in one",
            14 => "Laptop",
            //15 => "Workstation",

            17 => "Server",
            18 => "Server",
            20 => "Server",
            22 => "Server",
            23 => "Server",

            //24 => "Workstation",

            _ => "Workstation"
        };
    }

    public static string SizeToString(string value) {
        long size = long.Parse(value);
        return Data.SizeToString(size);
    }

    private static string DateToString(string value) {
        if (value.Length == 25) {
            short year = short.Parse(value[..4]);
            short month = short.Parse(value[4..6]);
            short day = short.Parse(value[6..8]);

            return new DateTime(year, month, day).ToString("dddd dd-MMM-yyyy");
        }
        else
            return value;
    }

    public static string DateTimeToString(string value) {
        if (value.Length == 25) {
            short year = short.Parse(value[..4]);
            short month = short.Parse(value[4..6]);
            short day = short.Parse(value[6..8]);

            short hour = short.Parse(value[8..10]);
            short minute = short.Parse(value[10..12]);
            short second = short.Parse(value[12..14]);

            return new DateTime(year, month, day, hour, minute, second).ToString("dddd dd-MMM-yyyy HH:mm:ss");
        }
        else
            return value;
    }

    private static string TransferRateToString(string value) {
        UInt64 v = UInt64.Parse(value);
        if (v < 1000) return $"{v} bps";
        if (v < 1_000_000) return $"{v / 1000} Kbps";
        if (v < 1_000_000_000) return $"{v / 1_000_000} Mbps";
        if (v < 1_000_000_000_000) return $"{v / 1_000_000_000} Gbps";
        if (v < 1_000_000_000_000_000) return $"{v / 1_000_000_000_000} Tbps";
        return $"{v / 1_000_000_000_000_000} Pbps";
    }

    private static string ToMHz(string value) {
        return $"{value} MHz";
    }

    private static string RamType(string value) {
        return value switch {
            "0" => "Unknown",

            "2" => "DRAM",
            "3" => "Synchronous DRAM",
            "4" => "Cache DRAM",
            "5" => "EDO",
            "6" => "EDRAM",
            "7" => "VRAM",
            "8" => "SRAM",
            "9" => "RAM",
            "10" => "ROM",
            "11" => "Flash",
            "12" => "EEPROM",
            "13" => "FEPROM",
            "14" => "EPROM",
            "15" => "CDRAM",
            "16" => "3DRAM",
            "17" => "SDRAM",
            "18" => "SGRAM",
            "19" => "RDRAM",
            "20" => "DDR",
            "21" => "DDR2",
            "22" => "DDR2 FB-DIMM",
            //"23" => String.Empty,
            "24" => "DDR3",
            "25" => "FBD2",
            "26" => "DDR4",
            _ => String.Empty
        };
    }

    private static string RamFormFactor(string value) {
        return value switch {
            "0" => "Unknown",

            "2" => "SIP",
            "3" => "DIP",
            "4" => "ZIP",
            "5" => "SOJ",
            "6" => "Proprietary",
            "7" => "SIMM",
            "8" => "DIMM",
            "9" => "TSOP",
            "10" => "PGA",
            "11" => "RIMM",
            "12" => "SODIMM",
            "13" => "SRIMM",
            "14" => "SMD",
            "15" => "SSMP",
            "16" => "QFP",
            "17" => "TQFP",
            "18" => "SOIC",
            "19" => "LCC",
            "20" => "PLCC",
            "21" => "BGA",
            "22" => "FPBGA",
            "23" => "LGA",
            _ => String.Empty
        };
    }

    private static string SMBIOSMemoryType(string value) {
        return value switch {
            "0" => "Unknown",

            "2" => "DRAM",
            "3" => "Synchronous DRAM",
            "4" => "Cache DRAM",
            "5" => "EDO",
            "6" => "EDRAM",
            "7" => "EDRAM ",
            "8" => "SRAM",
            "9" => "RAM",
            "10" => "ROM",
            "11" => "Flash",
            "12" => "EEPROM",
            "13" => "FEPROM",
            "14" => "EPROM",
            "15" => "CDRAM",
            "16" => "3DRAM",
            "17" => "SDRAM",
            "18" => "SGRAM",
            "19" => "RDRAM",
            "20" => "DDR",
            "21" => "DDR2",
            "22" => "DDR2 FB-DIMM",
            //"23" => String.Empty,
            "24" => "DDR3",
            "25" => "FBD2",
            "26" => "DDR4",
            _ => String.Empty
        };
    }

    private static string ArchitectureString(string value) {
        return value switch {
            "32" => "32-bit",
            "64" => "64-bit",
            _ => value
        };
    }

    private static string ProcessorString(string value) {
        string v = value;

        v = v.Replace("(R)", String.Empty);
        v = v.Replace("(C)", String.Empty);
        v = v.Replace("(TM)", String.Empty);

        v = v.Replace("CPU", String.Empty);

        if (v.Contains('@'))
            v = v.Split('@')[0];

        while (v.Contains("  "))
            v = v.Replace("  ", " ");

        return v.Trim();
    }

    private static string IPv4Filter(string value) {
        if (!value.Contains('.')) return String.Empty;
        return value;
    }

    private static string IPv4MaskFilter(string value) {
        if (!value.Contains('.')) return String.Empty;
        return value;
    }
}

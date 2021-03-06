using System;
using System.Collections;
using System.IO;
using System.Linq;
using System.Management;
using System.Net;
using System.Text;

//http://msdn.microsoft.com/en-us/library/aa394388(v=vs.85).aspx

public static class Wmi {
    //https://docs.microsoft.com/en-us/windows/desktop/wmisdk/swbemsecurity-impersonationlevel
    //https://docs.microsoft.com/en-us/windows/desktop/wmisdk/swbemsecurity-authenticationlevel

    public static ManagementScope WmiScope(in string host) {
        return WmiScope(host, ImpersonationLevel.Impersonate, String.Empty, String.Empty);
    }
    public static ManagementScope WmiScope(in string host, in string impersonation, in string username, in string password) {
        ImpersonationLevel impersonationLevel = ImpersonationLevel.Default;
        switch (impersonation.ToLower()) {
            case "an":
                impersonationLevel = ImpersonationLevel.Anonymous;
                break;

            case "id":
                impersonationLevel = ImpersonationLevel.Identify;
                break;

            case "im":
                impersonationLevel = ImpersonationLevel.Impersonate;
                break;

            case "de":
                impersonationLevel = ImpersonationLevel.Default;
                break;
        }

        return WmiScope(host, impersonationLevel, username, password);
    }
    public static ManagementScope WmiScope(in string host, in ImpersonationLevel impersonation, in string username, in string password) {
        ConnectionOptions options = new ConnectionOptions();
        options.Impersonation = impersonation;
        if (username.Length > 0) options.Username = username;
        if (password.Length > 0) options.Password = password;

        options.Authentication = AuthenticationLevel.PacketPrivacy;

        ManagementScope scope;
        try {
            scope = new ManagementScope($"\\\\{host}\\root\\cimv2", options);
            scope.Connect();
            if (!scope.IsConnected) return null;
            return scope;
        } catch {
            return null;
        }
    }

    public delegate string FormatMethodPtr(string value);

    private static string ManagementObjectToString(ManagementObject obj, string property, FormatMethodPtr format) {
        try {
            string value = FormatProperty(obj.Properties[property], format);
            return value;
        } catch { }

        return String.Empty;
    }

    public static string FormatProperty(PropertyData property, FormatMethodPtr format = null) {
        if (property.IsArray) {
            object[] array = (object[])property.Value;

            string value = String.Empty;
            for (int i = 0; i < array?.Length; i++)
                if (array[i].ToString().Length > 0)
                    value += (value.Length == 0) ? array[i].ToString() : "; " + array[i].ToString();

            return value;
        }

        if (property.Type.ToString() == "DateTime") {
            return DateTimeToString(property.Value?.ToString() ?? String.Empty);
        } else {
            if (format != null && property.Value != null) return format.Invoke(property.Value.ToString());
            return property.Value?.ToString() ?? String.Empty;
        }
    }

    public static string WmiGet(in string host, in string classname, in string property, in bool isArray, FormatMethodPtr format = null) {
        ManagementScope scope = WmiScope(host);
        if (scope is null) return String.Empty;
        WmiGet(scope, classname, property, isArray, format);
        return String.Empty;
    }
    public static string WmiGet(in ManagementScope scope, in string classname, in string property, in bool isArray, FormatMethodPtr format = null) {
        try {
            ManagementObjectCollection moc = new ManagementObjectSearcher(scope, new SelectQuery(classname)).Get();
            return WmiGet(moc, property, isArray, format);
        } catch { }

        return String.Empty;
    }
    public static string WmiGet(in ManagementObjectCollection moc, in string property, in bool isArray, FormatMethodPtr format = null) {
        if (isArray) {

            string value = String.Empty;
            foreach (ManagementObject o in moc) {
                string v = ManagementObjectToString(o, property, format);

                if (v.Contains(";")) {
                    string[] split = v.Split(';');
                    for (int i = 0; i < split.Length; i++) {
                        split[i] = split[i].Trim();
                        if (format != null) split[i] = format.Invoke(split[i]);
                        if (split[i].Length > 0) value += (value.Length == 0) ? $"{split[i]}" : $"; {split[i]}";
                    }
                } else {
                    if (v != null && v.Length > 0) value += (value.Length == 0) ? $"{v}" : $"; {v}";
                }

            }
            if (value.Length > 0) return value.Trim();

        } else {

            foreach (ManagementObject o in moc) {
                string value = ManagementObjectToString(o, property, format);
                if (value.Length > 0) return value.Trim();
            }

        }

        return String.Empty;
    }

    private static void ContentBuilderAddValue(in ManagementObjectCollection moc, in string property, in string label, in Hashtable hash, FormatMethodPtr format = null) {
        string value = WmiGet(moc, property, false, format);
        if (value != null && value.Length > 0) hash.Add(label, value);
    }
    private static void ContentBuilderAddArray(in ManagementObjectCollection moc, in string property, in string label, in Hashtable hash, FormatMethodPtr format = null) {
        string value = WmiGet(moc, property, true, format);
        if (value != null && value.Length > 0) hash.Add(label, value);
    }

    public static Hashtable WmiFetch(string host) {
        Hashtable hash = new Hashtable();

        string type = String.Empty;

        ManagementScope scope = WmiScope(host);
        if (!(scope is null)) {

            try {
                using ManagementObjectCollection moc = new ManagementObjectSearcher(scope, new SelectQuery("Win32_SystemEnclosure")).Get();
                string chassi = String.Empty;
                foreach (ManagementObject o in moc) {
                    short chassisTypes = (short)o.GetPropertyValue("ChassisTypes");
                    chassi = ChassiToString(chassisTypes);
                    type = ChassiToType(chassisTypes);
                    
                    if (chassi.Length > 0) {
                        hash.Add("CHASSI TYPE", chassi);
                        break;
                    }
                }
            } catch { }

            try {
                using ManagementObjectCollection moc = new ManagementObjectSearcher(scope, new SelectQuery("SELECT * FROM Win32_NetworkAdapterConfiguration WHERE IPEnabled = True")).Get();
                //ContentBuilderAddArray(moc, "IPAddress", "IPV6", hash, new FormatMethodPtr(IPv6Filter));
                ContentBuilderAddArray(moc, "IPAddress", "IP", hash, new FormatMethodPtr(IPv4Filter));
                ContentBuilderAddArray(moc, "MACAddress", "MAC ADDRESS", hash);
                ContentBuilderAddArray(moc, "IPSubnet", "MASK", hash, new FormatMethodPtr(IPv4MaskFilter));
                ContentBuilderAddArray(moc, "DHCPEnabled", "DHCP ENABLED", hash);
            } catch { }

            try {
                using ManagementObjectCollection moc = new ManagementObjectSearcher(scope, new SelectQuery("SELECT * FROM Win32_NetworkAdapter WHERE PhysicalAdapter = True")).Get();
                ContentBuilderAddArray(moc, "Speed", "NETWORK ADAPTER SPEED", hash, new FormatMethodPtr(TransferRateToString));
            } catch { }

            try {
                using ManagementObjectCollection moc = new ManagementObjectSearcher(scope, new SelectQuery("Win32_ComputerSystem")).Get();
                ContentBuilderAddValue(moc, "Name", "NAME", hash);
                ContentBuilderAddValue(moc, "DNSHostName", "HOSTNAME", hash);
                ContentBuilderAddValue(moc, "Manufacturer", "MANUFACTURER", hash);
                ContentBuilderAddValue(moc, "UserName", "OWNER", hash);
                ContentBuilderAddValue(moc, "Model", "MODEL", hash);
            } catch { }

            try {
                using ManagementObjectCollection moc = new ManagementObjectSearcher(scope, new SelectQuery("Win32_Baseboard")).Get();
                ContentBuilderAddValue(moc, "Manufacturer", "MOTHERBOARD MANUFACTURER", hash);
                ContentBuilderAddValue(moc, "Product", "MOTHERBOARD", hash);
                ContentBuilderAddValue(moc, "SerialNumber", "MOTHERBOARD SERIAL NUMBER", hash);
            } catch { }

            try {
                using ManagementObjectCollection moc = new ManagementObjectSearcher(scope, new SelectQuery("Win32_BIOS")).Get();
                ContentBuilderAddValue(moc, "Name", "BIOS", hash);
                ContentBuilderAddValue(moc, "SerialNumber", "SERIAL NUMBER", hash);
            } catch { }

            try {
                using ManagementObjectCollection moc = new ManagementObjectSearcher(scope, new SelectQuery("Win32_Processor")).Get();
                ContentBuilderAddArray(moc, "Name", "PROCESSOR", hash, new FormatMethodPtr(ProcessorString));
                ContentBuilderAddValue(moc, "NumberOfCores", "CPU CORES", hash);
                ContentBuilderAddValue(moc, "CurrentClockSpeed", "CPU FREQUENCY", hash, new FormatMethodPtr(ToMHz));
                ContentBuilderAddValue(moc, "AddressWidth", "CPU ARCHITECTURE", hash, new FormatMethodPtr(ArchitechtureString));
            } catch { }

            try {
                UInt64 L1 = 0, L2 = 0, L3 = 0;

                using (ManagementObjectCollection moc = new ManagementObjectSearcher(scope, new SelectQuery("SELECT BlockSize, NumberOfBlocks, Purpose FROM Win32_CacheMemory")).Get())
                    foreach (ManagementObject o in moc) {
                        if (!o.GetPropertyValue("Purpose").ToString().Contains("L1")) continue;
                        UInt64 numberOfBlocks = UInt64.Parse(o.GetPropertyValue("NumberOfBlocks").ToString());
                        UInt64 blockSize = UInt64.Parse(o.GetPropertyValue("BlockSize").ToString());
                        L1 += numberOfBlocks * blockSize;
                    }

                using (ManagementObjectCollection moc = new ManagementObjectSearcher(scope, new SelectQuery("SELECT BlockSize, NumberOfBlocks, Purpose FROM Win32_CacheMemory")).Get())
                    foreach (ManagementObject o in moc) {
                        if (!o.GetPropertyValue("Purpose").ToString().Contains("L2")) continue;
                        UInt64 numberOfBlocks = UInt64.Parse(o.GetPropertyValue("NumberOfBlocks").ToString());
                        UInt64 blockSize = UInt64.Parse(o.GetPropertyValue("BlockSize").ToString());
                        L2 += numberOfBlocks * blockSize;
                    }

                using (ManagementObjectCollection moc = new ManagementObjectSearcher(scope, new SelectQuery("SELECT BlockSize, NumberOfBlocks, Purpose FROM Win32_CacheMemory")).Get())
                    foreach (ManagementObject o in moc) {
                        if (!o.GetPropertyValue("Purpose").ToString().Contains("L3")) continue;
                        UInt64 numberOfBlocks = UInt64.Parse(o.GetPropertyValue("NumberOfBlocks").ToString());
                        UInt64 blockSize = UInt64.Parse(o.GetPropertyValue("BlockSize").ToString());
                        L3 += numberOfBlocks * blockSize;
                    }

                if (L1 > 0 || L2 > 0 || L3 > 0)
                    hash.Add("CPU CACHE", $"{SizeToString(L1.ToString())}/{SizeToString(L2.ToString())}/{SizeToString(L3.ToString())}");
                
            } catch { }

            try {
                using ManagementObjectCollection moc = new ManagementObjectSearcher(scope, new SelectQuery("Win32_PhysicalMemory")).Get();

                ulong totalmemory = 0;
                string memorytype = String.Empty, smbiostype = String.Empty;
                foreach (ManagementObject o in moc) {
                    UInt64.TryParse(o.GetPropertyValue("Capacity").ToString(), out ulong capacity);
                    totalmemory += capacity;
                    memorytype = o.GetPropertyValue("MemoryType").ToString();
                    smbiostype = o.GetPropertyValue("SMBIOSMemoryType").ToString();
                }
                hash.Add("TOTAL MEMORY", SizeToString(totalmemory.ToString()));

                ContentBuilderAddArray(moc, "Capacity", "MEMORY MODULES", hash, new FormatMethodPtr(SizeToString));
                ContentBuilderAddValue(moc, "Speed", "RAM SPEED", hash, new FormatMethodPtr(ToMHz));
                //ContentBuilderAddValue(moc, "MemoryType", "RAM TYPE", hash, new FormatMethodPtr(RamType));
                ContentBuilderAddValue(moc, "FormFactor", "RAM FORM FACTOR", hash, new FormatMethodPtr(RamFormFactor));

                if (smbiostype == "20" || smbiostype == "21" || smbiostype == "22" || smbiostype == "23" || smbiostype == "24" || smbiostype == "25" || smbiostype == "26")
                    hash.Add("RAM TYPE", SMBIOSMemoryType(smbiostype));
                else 
                    hash.Add("RAM TYPE", RamType(memorytype));

            } catch { }

            try {
                using ManagementObjectCollection moc = new ManagementObjectSearcher(scope, new SelectQuery("Win32_PhysicalMemoryArray")).Get();
                ContentBuilderAddValue(moc, "MemoryDevices", "RAM SLOT", hash);
            } catch { }

            try {
                using ManagementObjectCollection moc = new ManagementObjectSearcher(scope, new SelectQuery("SELECT * FROM Win32_DiskDrive WHERE MediaType = \"Fixed hard disk media\"")).Get();
                ContentBuilderAddArray(moc, "Size", "PHYSICAL DISK", hash, new FormatMethodPtr(SizeToString));
            } catch { }

            try {
                using ManagementObjectCollection moc = new ManagementObjectSearcher(scope, new SelectQuery("SELECT * FROM Win32_LogicalDisk WHERE DriveType = 3")).Get();
                string value = String.Empty;
                foreach (ManagementObject o in moc) {
                    string caption = o.GetPropertyValue("Caption").ToString().Replace(":", String.Empty);
                    UInt64 size = (UInt64)o.GetPropertyValue("Size");
                    UInt64 used = size - (UInt64)o.GetPropertyValue("FreeSpace");
                    value += $"{caption}:{Math.Round((double)used / 1024 / 1024 / 1024, 1)}:{Math.Round((double)size / 1024 / 1024 / 1024, 1)}:GB:";
                }
                if (value.EndsWith(":")) value = value.Substring(0, value.Length - 1);
                if (value.Length > 0) hash.Add("LOGICAL DISK", $"bar:{value}");
            } catch { }

            try {
                using ManagementObjectCollection moc = new ManagementObjectSearcher(scope, new SelectQuery("Win32_VideoController")).Get();
                ContentBuilderAddArray(moc, "Name", "VIDEO CONTROLLER", hash);
                ContentBuilderAddArray(moc, "DriverVersion", "VIDEO DRIVER", hash);
            } catch { }

            try {
                using ManagementObjectCollection moc = new ManagementObjectSearcher(scope, new SelectQuery("Win32_OperatingSystem")).Get();
                ContentBuilderAddValue(moc, "Caption", "OPERATING SYSTEM", hash);
                ContentBuilderAddValue(moc, "OSArchitecture", "OS ARCHITECTURE", hash);
                ContentBuilderAddValue(moc, "Version", "OS VERSION", hash);
                ContentBuilderAddValue(moc, "BuildNumber", "OS BUILD", hash);
                ContentBuilderAddValue(moc, "CSDVersion", "SERVICE PACK", hash);
                ContentBuilderAddValue(moc, "InstallDate", "OS INSTALL DATE", hash, new FormatMethodPtr(DateToString));
                ContentBuilderAddValue(moc, "SerialNumber", "OS SERIAL NO", hash);

                foreach (ManagementObject o in moc) {
                    string osName = o.GetPropertyValue("Caption").ToString();
                    if (osName.ToLower().IndexOf("server") > -1) {
                        type = "Server";
                        break;
                    }
                }
            } catch { }
        }

        if (type.Length > 0)  hash.Add("TYPE", $"{type}");

        return hash;
    }

    public static byte[] WmiQuery(in HttpListenerContext ctx, in string[] para) {
        string host = String.Empty;
        string query = String.Empty;
        for (int i = 1; i < para.Length; i++)
            if (para[i].StartsWith("target=")) {
                host = Strings.DecodeUrl(para[i].Substring(7));
                break;
            }

        using (StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding))
            query = reader.ReadToEnd().Trim();

        return WmiQuery(host, query);
    }

    public static byte[] WmiQuery(in string host, in string query) {
        ManagementScope scope = WmiScope(host);
        if (scope is null) return null;

        ManagementObjectCollection moc;
        try {
            moc = new ManagementObjectSearcher(scope.Path.ToString(), query).Get();
            if (moc.Count == 0) return null;
        } catch {
            return null;
        }

        bool label_once = true;
        StringBuilder sb = new StringBuilder();

        foreach (ManagementObject o in moc) {
            if (label_once) { //header
                label_once = false;
                sb.Append(o.Properties.Count);
                sb.Append((char)127);

                foreach (PropertyData p in o.Properties)
                    sb.Append(p.Name.ToString() + (char)127);
            }

            foreach (PropertyData p in o.Properties) { //values
                try {
                    string value = FormatProperty(p);
                    sb.Append(value + (char)127);
                } catch {
                    sb.Append((char)127);
                }
            }
        }

        return Encoding.UTF8.GetBytes(sb.ToString());
    }

    public static byte[] WmiKillProcess(in string[] para) {
        string host = String.Empty;
        int pid = -1;
        for (int i = 1; i < para.Length; i++) {
            if (para[i].StartsWith("target=")) host = Strings.DecodeUrl(para[i].Substring(7));
            if (para[i].StartsWith("pid=")) pid = Int32.Parse(Strings.DecodeUrl(para[i].Substring(4)));
        }

        if (pid == -1) return Strings.WMI_PAR.Array;

        ManagementScope scope = WmiScope(host);
        if (scope is null) return Strings.WMI_UNK.Array;

        ManagementObjectCollection moc;
        try {
            moc = new ManagementObjectSearcher(scope.Path.ToString(), "SELECT * FROM Win32_Process WHERE ProcessId = " + pid).Get();
            if (moc.Count == 0) return Encoding.UTF8.GetBytes("no such process id");
        } catch {
            return Strings.WMI_UNK.Array;
        }

        foreach (ManagementObject o in moc) {
            object exit = o.InvokeMethod("Terminate", null);
            switch (int.Parse(exit.ToString())) {
                case 0: return Strings.OK.Array;
                case 2: return Strings.WMI_ACC.Array;
                case 3: return Strings.WMI_PRI.Array;
                case 8: return Strings.WMI_UNK.Array;
                case 9: return Strings.WMI_PAT.Array;
                case 21: return Strings.WMI_PAR.Array;
            }
        }

        return Strings.WMI_UNK.Array;
    }


    //const LogOff          = 0
    //const Shutdown        = 1
    //const Reboot          = 2
    //const ForceLogOff     = 4  <-
    //const ForcedShutdown  = 5
    //const ForceReboot     = 6  <-
    //const PowerOff        = 8
    //const ForcePowerOff   = 12 <-
    public static string Wmi_Win32Shutdown(string host, in int flags) {
        if (host.Contains(";")) host = host.Substring(0, host.IndexOf(";")).Trim();

        ManagementScope scope = WmiScope(host);
        if (scope is null) return Encoding.UTF8.GetString(Strings.UNA.Array);

        using ManagementObjectSearcher searcher = new ManagementObjectSearcher(scope, new SelectQuery("Win32_OperatingSystem"));

        try {
            foreach (ManagementObject o in searcher.Get()) {
                ManagementBaseObject inParams = o.GetMethodParameters("Win32Shutdown");
                inParams["Flags"] = flags;
                o.InvokeMethod("Win32Shutdown", inParams, null);
            }

        } catch (ManagementException ex) {
            return $"WMI error:\n{ex.Message}";
        } catch (UnauthorizedAccessException ex) {
            return $"Authentication error:\n{ex.Message}";
        }

        return "ok";
    }

    public static string Wmi_Win32Shutdown(in string[] para, in int flags) {
        string host = String.Empty;
        string filename = String.Empty;
        for (int i = 1; i < para.Length; i++) 
            if (para[i].StartsWith("host=")) host = para[i].Substring(5);
            else if (para[i].StartsWith("file=")) filename = para[i].Substring(5);
        

        if (host.Length == 0 && Database.equip.ContainsKey(filename)) {
            Database.DbEntry entry = (Database.DbEntry)Database.equip[filename];
            if (entry.hash.ContainsKey("IP")) host = ((string[])entry.hash["IP"])[0];
            else if (entry.hash.ContainsKey("HOSTNAME")) host = ((string[])entry.hash["HOSTNAME"])[0];
        }

        if (host.Length == 0) return Encoding.UTF8.GetString(Strings.INV.Array);

        return Wmi_Win32Shutdown(host, flags);
    }

    private static string ChassiToString(short chassiType) {
        return chassiType switch {
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

    private static string ChassiToType(short chassiType) {
        return chassiType switch {
            //3 => "PC tower",
            //4 => "PC tower",
            //5 => "PC tower",
            //6 => "PC tower",
            //7 => "PC tower",

            8  => "Laptop",
            9  => "Laptop",
            10 => "Laptop",
            11 => "Laptop",

            //12 => "PC tower",
            13 => "All in one",
            14 => "Laptop",
            //15 => "PC tower",

            17 => "Server",
            18 => "Server",
            20 => "Server",
            22 => "Server",
            23 => "Server",

            //24 => "PC tower",

            _ => "PC tower"
        };
    }

    public static string SizeToString(string value) {
        long size = long.Parse(value);
        return Strings.SizeToString(size);
    }

    private static string DateToString(string value) {
        if (value.Length == 25) {
            short year = short.Parse(value.Substring(0, 4));
            short month = short.Parse(value.Substring(4, 2));
            short day = short.Parse(value.Substring(6, 2));

            return new DateTime(year, month, day).ToString("dddd dd-MMM-yyyy");
        } else
            return value;
    }

    public static string DateTimeToString(string value) {
        if (value.Length == 25) {
            short year = short.Parse(value.Substring(0, 4));
            short month = short.Parse(value.Substring(4, 2));
            short day = short.Parse(value.Substring(6, 2));

            short hour = short.Parse(value.Substring(8, 2));
            short minute = short.Parse(value.Substring(10, 2));
            short second = short.Parse(value.Substring(12, 2));

            return new DateTime(year, month, day, hour, minute, second).ToString("dddd dd-MMM-yyyy HH:mm:ss");
        } else
            return value;
    }

    private static string TransferRateToString(string value) {
        UInt64 v = UInt64.Parse(value);
        if (v < 1000) return $"{ v } bps";
        if (v < 1_000_000) return $"{ v / 1000 } Kbps";
        if (v < 1_000_000_000) return $"{ v / 1_000_000 } Mbps";
        if (v < 1_000_000_000_000) return $"{ v / 1_000_000_000 } Gbps";
        if (v < 1_000_000_000_000_000) return $"{ v / 1_000_000_000_000 } Tbps";
        return $"{ v / 1_000_000_000_000_000 } Pbps";
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

    private static string ArchitechtureString(string value) {
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

        if (v.Contains("@"))
            v = v.Split('@')[0];

        while (v.Contains("  "))
            v = v.Replace("  ", " ");

        return v.Trim();
    }

    private static string IPv4Filter(string value) {
        if (!value.Contains(".")) return String.Empty;
        return value;
    }

    private static string IPv4MaskFilter(string value) {
        if (!value.Contains(".")) return String.Empty;
        return value;
    }
}
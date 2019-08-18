using System;
using System.Collections.Generic;
using System.Linq;
using System.Management;
using System.Net;
using System.Text;

//http://msdn.microsoft.com/en-us/library/aa394388(v=vs.85).aspx

static class Wmi {
    //https://docs.microsoft.com/en-us/windows/desktop/wmisdk/swbemsecurity-impersonationlevel
    //https://docs.microsoft.com/en-us/windows/desktop/wmisdk/swbemsecurity-authenticationlevel

    public static readonly ArraySegment<byte> WMI_OK = new ArraySegment<byte>(Encoding.UTF8.GetBytes("ok"));
    public static readonly ArraySegment<byte> WMI_ACC = new ArraySegment<byte>(Encoding.UTF8.GetBytes("access denied"));
    public static readonly ArraySegment<byte> WMI_PRI = new ArraySegment<byte>(Encoding.UTF8.GetBytes("insufficient privilege"));
    public static readonly ArraySegment<byte> WMI_UNK = new ArraySegment<byte>(Encoding.UTF8.GetBytes("unknown failure"));
    public static readonly ArraySegment<byte> WMI_PAT = new ArraySegment<byte>(Encoding.UTF8.GetBytes("path not found "));
    public static readonly ArraySegment<byte> WMI_PAR = new ArraySegment<byte>(Encoding.UTF8.GetBytes("invalid parameter"));
    public static readonly ArraySegment<byte> WMI_RES = new ArraySegment<byte>(Encoding.UTF8.GetBytes("invalid parameter"));


    public static ManagementScope WmiScope(in string host) {
        return WmiScope(host, ImpersonationLevel.Impersonate, "", "");
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

        ManagementScope scope = null;
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

        return "";
    }

    private static string FormatProperty(PropertyData property, FormatMethodPtr format = null) {
        if (property.IsArray) {
            object[] array = (object[])property.Value;

            string value = "";
            for (int i = 0; i < array.Length; i++) 
                if (array[i].ToString().Length > 0)
                    value += (value.Length == 0) ? array[i].ToString() : "; " + array[i].ToString();
            
            return value;
        }

        if (property.Type.ToString() == "DateTime") {
            return DateTimeToString(property.Value.ToString());
        } else {
            if (format != null) return format.Invoke(property.Value.ToString());
            return property.Value.ToString();
        }
    }

    public static string WmiGet(in string host, in string classname, in string property, in bool isArray, FormatMethodPtr format = null) {
        ManagementScope scope = WmiScope(host);
        if (scope is null) return "";
        WmiGet(scope, classname, property, isArray, format);
        return "";
    }
    public static string WmiGet(in ManagementScope scope, in string classname, in string property, in bool isArray, FormatMethodPtr format = null) {
        try {
            ManagementObjectCollection moc = new ManagementObjectSearcher(scope, new SelectQuery(classname)).Get();
            return WmiGet(moc, property, isArray, format);
        } catch { }

        return "";
    }
    public static string WmiGet(in ManagementObjectCollection moc, in string property, in bool isArray, FormatMethodPtr format = null) {
        if (isArray) {

            string value = "";
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

        return "";
    }

    private static void ContentBuilderAddValue(in ManagementObjectCollection moc, in string property, in string label, in StringBuilder content, FormatMethodPtr format = null) {
        string value = WmiGet(moc, property, false, format);
        if (value != null && value.Length > 0) content.Append($"{label}{(char)127}{value}{(char)127}");
    }
    private static void ContentBuilderAddArray(in ManagementObjectCollection moc, in string property, in string label, in StringBuilder content, FormatMethodPtr format = null) {
        string value = WmiGet(moc, property, true, format);
        if (value != null && value.Length > 0) content.Append($"{label}{(char)127}{value}{(char)127}");
    }

    public static string WmiVerify(in string[] para, bool portscan = false) {
        string filename = "";
        for (int i = 1; i < para.Length; i++)
            if (para[i].StartsWith("file=")) filename = para[i].Substring(5);

        string host = "";
        if (NoSQL.equip.ContainsKey(filename)) {
            NoSQL.DbEntry entry = (NoSQL.DbEntry)NoSQL.equip[filename];
            if (entry.hash.ContainsKey("IP"))            host = ((string[]) entry.hash["IP"])[0];
            else if (entry.hash.ContainsKey("HOSTNAME")) host = ((string[]) entry.hash["HOSTNAME"])[0];
        }

        if (host.Length == 0) return Encoding.UTF8.GetString(Tools.INF.Array);

        return WmiVerify(host, portscan);
    }

    public static string WmiVerify(string host, bool portscan = false) {
        if (host.Contains(";")) host = host.Substring(0, host.IndexOf(";")).Trim();

        StringBuilder content = new StringBuilder();

        string ip = "";
        string name = "";
        string hostname = "";
        string type = "";
        string mac = "";
        string manufacturer = "";

        try { //get hostname from dns
            IPHostEntry hostEntry = Dns.GetHostEntry(host);
            if (hostEntry != null) {
                try {
                    IPAddress checkIp = IPAddress.Parse(host);
                    ip = checkIp.ToString();
                } catch { }

                if (ip.Length == 0) { //if ip parse failed => host is the hostname
                    hostname = host;
                } else { //host is the ip
                    hostname = hostEntry.HostName;
                    if (hostname.Contains(".")) hostname = hostname.Split('.')[0];
                }
            }
        } catch { }

        ManagementScope scope = WmiScope(host);
        if (!(scope is null)) {

            try {
                using (ManagementObjectCollection moc = new ManagementObjectSearcher(scope, new SelectQuery("Win32_SystemEnclosure")).Get()) {
                    string chassi = "";
                    foreach (ManagementObject o in moc) {
                        short chassisTypes = (short)o.GetPropertyValue("ChassisTypes");
                        chassi = ChassiToString(chassisTypes);

                        switch (chassisTypes) {
                            case 8: case 9: case 10: case 14:
                                type = "Laptop";
                                break;

                            case 17: case 18: case 20: case 22: case 23:
                                type = "Server";
                                break;

                            case 3: case 4: case 5: case 6: case 7: case 24:
                                type = "PC Tower";
                                break;

                            case 13:
                                type = "All in one";
                                break;
                        }

                        if (chassi.Length > 0) {
                            content.Append($"CHASSI TYPE{(char)127}{chassi}{(char)127}");
                            break;
                        }
                    }
                }
            } catch { }

            try {
                using (ManagementObjectCollection moc = new ManagementObjectSearcher(scope, new SelectQuery("SELECT * FROM Win32_NetworkAdapterConfiguration WHERE IPEnabled = True")).Get()) {
                    //ContentBuilderAddArray(moc, "IPAddress", "IP", content, new FormatMethodPtr(IPv4Filter));
                    //ContentBuilderAddArray(moc, "IPAddress", "IPV6", content, new FormatMethodPtr(IPv6Filter));
                    //ContentBuilderAddArray(moc, "MACAddress", "MAC ADDRESS", content);
                    ContentBuilderAddArray(moc, "DHCPEnabled", "DHCP ENABLED", content);
                    ContentBuilderAddArray(moc, "IPSubnet", "MASK", content);

                    //if (ip.Length == 0) ip = WmiGet(moc, "IPAddress", true);
                    ip = WmiGet(moc, "IPAddress", true, IPv4Filter); //if wmi is available. overwrite dns value
                    mac = WmiGet(moc, "MACAddress", true);
                }
            } catch { }

            try {
                using (ManagementObjectCollection moc = new ManagementObjectSearcher(scope, new SelectQuery("SELECT * FROM Win32_NetworkAdapter WHERE PhysicalAdapter = True")).Get()) {
                    ContentBuilderAddArray(moc, "Speed", "NETWORK ADAPTER SPEED", content, new FormatMethodPtr(TransferRateToString));
                }
            } catch { }

            try {
                using (ManagementObjectCollection moc = new ManagementObjectSearcher(scope, new SelectQuery("Win32_ComputerSystem")).Get()) {
                    //ContentBuilderAddValue(moc, "Name", "NAME", content);
                    //ContentBuilderAddValue(moc, "UserName", "USERNAME", content);                    
                    //ContentBuilderAddValue(moc, "DNSHostName", "HOSTNAME", content);

                    //ContentBuilderAddValue(moc, "Manufacturer", "MANUFACTURER", content);
                    ContentBuilderAddValue(moc, "Model", "MODEL", content);
                    //ContentBuilderAddValue(moc, "Description", "DESCRIPTION", content);
                    ContentBuilderAddValue(moc, "UserName", "OWNER", content);

                    name = WmiGet(moc, "Name", true);
                    manufacturer = WmiGet(moc, "Manufacturer", true);
                    hostname = WmiGet(moc, "DNSHostName", true);
                }
            } catch { }

            try {
                using (ManagementObjectCollection moc = new ManagementObjectSearcher(scope, new SelectQuery("Win32_Baseboard")).Get()) {
                    ContentBuilderAddValue(moc, "Manufacturer", "MOTHERBOARD MANUFACTURER", content);
                    ContentBuilderAddValue(moc, "Product", "MOTHERBOARD", content);
                    ContentBuilderAddValue(moc, "SerialNumber", "MOTHERBOARD SERIAL NUMBER", content);
                }
            } catch { }

            try {
                using (ManagementObjectCollection moc = new ManagementObjectSearcher(scope, new SelectQuery("Win32_BIOS")).Get()) {
                    ContentBuilderAddValue(moc, "Name", "BIOS", content);
                    ContentBuilderAddValue(moc, "SerialNumber", "SERIAL NUMBER", content);
                }
            } catch { }

            try {
                using (ManagementObjectCollection moc = new ManagementObjectSearcher(scope, new SelectQuery("Win32_Processor")).Get()) {
                    ContentBuilderAddArray(moc, "Name", "PROCESSOR", content, new FormatMethodPtr(ProcessorString));
                    ContentBuilderAddValue(moc, "NumberOfCores", "CPU CORES", content);
                    ContentBuilderAddValue(moc, "CurrentClockSpeed", "CPU FREQUENCY", content, new FormatMethodPtr(ToMHz));
                    ContentBuilderAddValue(moc, "AddressWidth", "CPU ARCHITECTURE", content, new FormatMethodPtr(ArchitechtureString));
                }
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

                if (L1 > 0) content.Append($"L1 CACHE{(char)127}{SizeToString(L1.ToString())}{(char)127}");
                if (L2 > 0) content.Append($"L2 CACHE{(char)127}{SizeToString(L2.ToString())}{(char)127}");
                if (L3 > 0) content.Append($"L3 CACHE{(char)127}{SizeToString(L3.ToString())}{(char)127}");
            } catch { }

            try {
                using (ManagementObjectCollection moc = new ManagementObjectSearcher(scope, new SelectQuery("Win32_PhysicalMemory")).Get()) {
                    ContentBuilderAddArray(moc, "Capacity", "MEMORY", content, new FormatMethodPtr(SizeToString));
                    ContentBuilderAddValue(moc, "Speed", "RAM SPEED", content, new FormatMethodPtr(ToMHz));
                    ContentBuilderAddValue(moc, "MemoryType", "RAM TYPE", content, new FormatMethodPtr(RamType));
                    ContentBuilderAddValue(moc, "FormFactor", "RAM FORM FACTOR", content, new FormatMethodPtr(RamFormFactor));
                }
            } catch { }

            try {
                using (ManagementObjectCollection moc = new ManagementObjectSearcher(scope, new SelectQuery("Win32_PhysicalMemoryArray")).Get())
                    ContentBuilderAddValue(moc, "MemoryDevices", "RAM SLOT", content);
            } catch { }

            try {
                using (ManagementObjectCollection moc = new ManagementObjectSearcher(scope, new SelectQuery("SELECT * FROM Win32_DiskDrive WHERE MediaType = \"Fixed hard disk media\"")).Get())
                    ContentBuilderAddArray(moc, "Size", "PHYSICAL DISK", content, new FormatMethodPtr(SizeToString));
            } catch { }

            try {
                using (ManagementObjectCollection moc = new ManagementObjectSearcher(scope, new SelectQuery("SELECT * FROM Win32_LogicalDisk WHERE DriveType = 3")).Get()) {
                    string value = "";
                    foreach (ManagementObject o in moc) {
                        string caption = o.GetPropertyValue("Caption").ToString().Replace(":", "");
                        UInt64 size = (UInt64)o.GetPropertyValue("Size");
                        UInt64 used = size - (UInt64)o.GetPropertyValue("FreeSpace");
                        value += $"{caption}:{Math.Round((double)used / 1024 / 1024 / 1024, 1)}:{Math.Round((double)size / 1024 / 1024 / 1024, 1)}:GB:";
                    }
                    if (value.EndsWith(":")) value = value.Substring(0, value.Length - 1);
                    if (value.Length > 0) content.Append($"LOGICAL DISK{(char)127}bar:{value}{(char)127}");
                }
            } catch { }

            try {
                using (ManagementObjectCollection moc = new ManagementObjectSearcher(scope, new SelectQuery("Win32_VideoController")).Get()) {
                    ContentBuilderAddArray(moc, "Name", "VIDEO CONTROLLER", content);
                    ContentBuilderAddArray(moc, "DriverVersion", "VIDEO DRIVER", content);
                }
            } catch { }

            try {
                using (ManagementObjectCollection moc = new ManagementObjectSearcher(scope, new SelectQuery("Win32_OperatingSystem")).Get()) {
                    ContentBuilderAddValue(moc, "Caption", "OPERATING SYSTEM", content);
                    ContentBuilderAddValue(moc, "OSArchitecture", "OS ARCHITECTURE", content);
                    ContentBuilderAddValue(moc, "Version", "OS VERSION", content);
                    ContentBuilderAddValue(moc, "BuildNumber", "OS BUILD", content);
                    ContentBuilderAddValue(moc, "CSDVersion", "SERVICE PACK", content);
                    ContentBuilderAddValue(moc, "InstallDate", "OS INSTALL DATE", content, new FormatMethodPtr(DateToString));
                    ContentBuilderAddValue(moc, "SerialNumber", "OS SERIAL NO", content);
                }
            } catch { }
        }

        if (portscan) { //basic port scan
            bool[] result = Tools.PortsScanAsync(host, Knowlage.basic_ports).Result;
            List<int> list = new List<int>();
            string strResult = "";
            for (int i = 0; i < result.Length; i++)
                if (result[i]) {
                    list.Add(Knowlage.basic_ports[i]);
                    strResult += (strResult.Length == 0) ? Knowlage.basic_ports[i].ToString() : $"; {Knowlage.basic_ports[i].ToString()}";
                }

            if (strResult.Length > 0) content.Append($"PORTS{(char)127}{strResult}{(char)127}");

            if (type.Length == 0)
                if (list.Contains(445) && list.Contains(3389) && (list.Contains(53) || list.Contains(67) || list.Contains(389) || list.Contains(636) || list.Contains(853))) //SMB, RDP, DNS, DHCP, LDAP
                    type = "Server";

                else if (list.Contains(445) && list.Contains(3389)) //SMB, RDP
                    type = "PC Tower";

                else if (list.Contains(515) || list.Contains(631) || list.Contains(9100)) //LPD, IPP, Printserver
                    type = "Printer";

                else if (list.Contains(38)) //RAP
                    type = "Router";

                else if (list.Contains(6789) || list.Contains(10001))
                    type = "Access Point";

                else if (list.Contains(7442) || list.Contains(7550))
                    type = "Camera";
        }

        if (mac.Length == 0 && ip.Length > 0) {
            string[] ipSplit = ip.Split(';');
            for (int i = 0; i < ipSplit.Length; i++) {
                string result = Tools.Arp(ipSplit[i].Trim());
                if (result.Length > 0) {
                    mac = result;
                    break;
                }
            }
        }

        if (manufacturer.Length == 0 && mac.Length > 0)
            manufacturer = Encoding.UTF8.GetString(Tools.MacLookup(mac));

        if (ip.Length > 0) content.Append($"IP{(char)127}{ip}{(char)127}");
        if (name.Length > 0) content.Append($"NAME{(char)127}{name}{(char)127}");
        if (type.Length > 0) content.Append($"TYPE{(char)127}{type}{(char)127}");
        if (hostname.Length > 0) content.Append($"HOSTNAME{(char)127}{hostname}{(char)127}");
        if (mac.Length > 0) content.Append($"MAC ADDRESS{(char)127}{mac}{(char)127}");
        if (manufacturer.Length > 0) content.Append($"MANUFACTURER{(char)127}{manufacturer}{(char)127}");

        return content.ToString();
    }

    public static byte[] WmiQuery(string[] para) {
        string host = "";
        string query = "";
        for (int i = 1; i < para.Length; i++) {
            if (para[i].StartsWith("target=")) host = NoSQL.UrlDecode(para[i].Substring(7));
            if (para[i].StartsWith("q=")) query = NoSQL.UrlDecode(para[i].Substring(2));
        }

        ManagementScope scope = WmiScope(host);
        if (scope is null) return null;

        ManagementObjectCollection moc = null;
        try {
            moc = new ManagementObjectSearcher(scope.Path.ToString(), query).Get();
            if (moc.Count == 0) return null;
        } catch {
            return null;
        }

        bool label_once = true;
        StringBuilder sb = new StringBuilder();

        foreach (ManagementObject o in moc) {

            if (label_once) {
                label_once = false;

                sb.Append(o.Properties.Count);
                sb.Append((char)127);

                foreach (PropertyData p in o.Properties)
                    sb.Append(p.Name.ToString() + (char)127);
            }

            foreach (PropertyData p in o.Properties) {
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

    public static byte[] WmiKillProcess(string[] para) {
        string host = "";
        int pid = -1;
        for (int i = 1; i < para.Length; i++) {
            if (para[i].StartsWith("target=")) host = NoSQL.UrlDecode(para[i].Substring(7));
            if (para[i].StartsWith("pid=")) pid = Int32.Parse( NoSQL.UrlDecode(para[i].Substring(4)));
        }

        if (pid == -1) return WMI_PAR.Array;

        ManagementScope scope = WmiScope(host);
        if (scope is null) return WMI_UNK.Array;

        ManagementObjectCollection moc = null;
        try {
            moc = new ManagementObjectSearcher(scope.Path.ToString(), "SELECT * FROM Win32_Process WHERE ProcessId = " + pid).Get();
            if (moc.Count == 0) return Encoding.UTF8.GetBytes("no such process id");
        } catch {
            return WMI_UNK.Array;
        }

        foreach (ManagementObject o in moc) {
            object exit = o.InvokeMethod("Terminate", null);
            switch (int.Parse(exit.ToString())) {
                case 0: return WMI_OK.Array;
                case 2: return WMI_ACC.Array;
                case 3: return WMI_PRI.Array;
                case 8: return WMI_UNK.Array;
                case 9: return WMI_PAT.Array;
                case 21: return WMI_PAR.Array;
            }
        }

        return WMI_UNK.Array;
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
        if (scope is null) return Encoding.UTF8.GetString(Tools.UNA.Array);

        ManagementObjectSearcher searcher = new ManagementObjectSearcher(scope, new SelectQuery("Win32_OperatingSystem"));

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
        string host = "";
        string filename = "";

        for (int i = 1; i < para.Length; i++) {
            if (para[i].StartsWith("host=")) host = para[i].Substring(5);
            if (para[i].StartsWith("file=")) filename = para[i].Substring(5);
        }

        if (host.Length == 0 && NoSQL.equip.ContainsKey(filename)) {
            NoSQL.DbEntry entry = (NoSQL.DbEntry)NoSQL.equip[filename];
            if (entry.hash.ContainsKey("IP")) host = ((string[])entry.hash["IP"])[0];
            else if (entry.hash.ContainsKey("HOSTNAME")) host = ((string[])entry.hash["HOSTNAME"])[0];
        }

        if (host.Length == 0) return Encoding.UTF8.GetString(Tools.INV.Array);

        return Wmi_Win32Shutdown(host, flags);
    }

    public static string ChassiToString(short chassiType) {
        switch (chassiType) {
            case 3:  return "Desktop;";
            case 4:  return "Low profile desktop";
            case 5:  return "Pizza box";
            case 6:  return "Mini tower";
            case 7:  return "Tower";
            case 8:  return "Portable";
            case 9:  return "Laptop";
            case 10: return "Notebook";
            case 11: return "Hand held";
            case 12: return "Docking station";
            case 13: return "All in one";
            case 14: return "Sub notebook";
            case 15: return "Space-saving";
            case 16: return "Lunch box";
            case 17: return "Main system chassis";
            case 18: return "Expansion chassis";
            case 19: return "Sub-chassis";
            case 20: return "Bus expansion chassis";
            case 21: return "Peripheral chassis";
            case 22: return "Storage chassis";
            case 23: return "Rack mount chassis";
            case 24: return "Sealed-case PC";
            case 25: return "Multi-system chassis";
            case 26: return "Compact PCI";
            case 27: return "Advanced TCA";
            case 28: return "Blade ";
            case 29: return "Blade Enclosure";
            case 30: return "Tablet ";
            case 31: return "Convertible ";
            case 32: return "Detachable ";
            case 33: return "IoT Gateway";
            case 34: return "Embedded PC";
            case 35: return "Mini PC";
            case 36: return "Stick PC";
        }

        return "";
    }

    public static string SizeToString(string value) {
        long size = long.Parse(value);

        if (size < 1024) return $"{size.ToString()} Bytes";
        if (size < Math.Pow(1024, 2)) return $"{Math.Round(size / 1024.0).ToString()} KB";
        if (size < Math.Pow(1024, 3)) return $"{Math.Round(size / Math.Pow(1024, 2)).ToString()} MB";
        if (size < Math.Pow(1024, 4)) return $"{Math.Round(size / Math.Pow(1024, 3)).ToString()} GB";
        if (size < Math.Pow(1024, 5)) return $"{Math.Round(size / Math.Pow(1024, 4)).ToString()} TB";
        if (size < Math.Pow(1024, 6)) return $"{Math.Round(size / Math.Pow(1024, 5)).ToString()} EB"; //Exabyte
        if (size < Math.Pow(1024, 7)) return $"{Math.Round(size / Math.Pow(1024, 6)).ToString()} ZB"; //Zettabyte
        if (size < Math.Pow(1024, 8)) return $"{Math.Round(size / Math.Pow(1024, 7)).ToString()} YB"; //Yottabyte
        if (size < Math.Pow(1024, 9)) return $"{Math.Round(size / Math.Pow(1024, 8)).ToString()} BB"; //Brontobyte

        return size.ToString();
    }

    public static string DateToString(string value) {
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

    public static string TransferRateToString(string value) {
        UInt64 v = UInt64.Parse(value);
        if (v < 1000) return $"{ v } bps";
        if (v < 1000000) return $"{ v / 1000 } Kbps";
        if (v < 1000000000) return $"{ v / 1000000 } Mbps";
        if (v < 1000000000000) return $"{ v / 1000000000 } Gbps";
        if (v < 1000000000000000) return $"{ v / 1000000000000 } Tbps";
        return $"{ v / 1000000000000000 } Pbps";
    }

    public static string ToMHz(string value) {
        return $"{value} MHz";
    }

    public static string RamType(string value) {
        switch (value) {
            case "0": return "";

            case "2": return "DRAM";
            case "3": return "Synchronous DRAM";
            case "4": return "Cache DRAM";
            case "5": return "EDO";
            case "6": return "EDRAM";
            case "7": return "VRAM";
            case "8": return "SRAM";
            case "9": return "RAM";
            case "10": return "ROM";
            case "11": return "Flash";
            case "12": return "EEPROM";
            case "13": return "FEPROM";
            case "14": return "EPROM";
            case "15": return "CDRAM";
            case "16": return "3DRAM";
            case "17": return "SDRAM";
            case "18": return "SGRAM";
            case "19": return "RDRAM";
            case "20": return "DDR";
            case "21": return "DDR2";
            case "22": return "DDR2 FB-DIMM";
            case "23": return "";
            case "24": return "DDR3";
            case "25": return "FBD2";

        }
        return "";
    }

    public static string RamFormFactor(string value) {
        switch (value) {
            case "0": return "Unknown";

            case "2": return "SIP";
            case "3": return "DIP";
            case "4": return "ZIP";
            case "5": return "SOJ";
            case "6": return "Proprietary";
            case "7": return "SIMM";
            case "8": return "DIMM";
            case "9": return "TSOP";
            case "10": return "PGA";
            case "11": return "RIMM";
            case "12": return "SODIMM";
            case "13": return "SRIMM";
            case "14": return "SMD";
            case "15": return "SSMP";
            case "16": return "QFP";
            case "17": return "TQFP";
            case "18": return "SOIC";
            case "19": return "LCC";
            case "20": return "PLCC";
            case "21": return "BGA";
            case "22": return "FPBGA";
            case "23": return "LGA";
        }
        return "";
    }

    public static string ArchitechtureString(string value) {
        switch (value) {
            case "32": return "32-bit";
            case "64": return "64-bit";
            default: return value;
        }
    }

    public static string ProcessorString(string value) {
        string v = value;

        v = v.Replace("(R)", "");
        v = v.Replace("(C)", "");
        v = v.Replace("(TM)", "");

        v = v.Replace("CPU", "");

        if (v.Contains("@"))
            v = v.Split('@')[0];

        while (v.Contains("  "))
            v = v.Replace("  ", " ");

        return v.Trim();
    }

    public static string IPv4Filter(string value) {
        if (!value.Contains(".")) return "";
        return value;
    }
}

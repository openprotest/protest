using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;

class Program {
    static readonly string IPFILE = $"{Directory.GetCurrentDirectory()}\\IP2LOCATION-LITE-DB5.CSV";
    static readonly string PROXYFILE = $"{Directory.GetCurrentDirectory()}\\IP2PROXY-LITE-PX1.CSV";
    static readonly string MACFILE = $"{Directory.GetCurrentDirectory()}\\oui.txt";
    static readonly string TORFILE = $"{Directory.GetCurrentDirectory()}\\tor.txt";

    static readonly string IPDIR = $"{Directory.GetCurrentDirectory()}\\ip";
    static readonly string PROXYDIR = $"{Directory.GetCurrentDirectory()}\\proxy";

    struct IpEntry {
        public byte[] from;
        public byte[] to;
        public string code;
        public string country;
        public string region;
        public string city;
        public Single lat;
        public Single lon;
    }

    struct ProxyEntry {
        public byte[] from;
        public byte[] to;
    }

    struct MacEntry {
        public string mac;
        public string vendor;
    }

    static void Main(string[] args) {
        GenIpLocationBin();
        GenProxyBin();
        GenMacLookupBin();
        GenTorServersBin();
        Console.ReadLine();
    }

    static void GenIpLocationBin() {
        List<List<IpEntry>> list = new List<List<IpEntry>>();
        for (int i = 0; i < 256; i++)
            list.Add(new List<IpEntry>());

        Console.WriteLine("Reading...");

        string line;
        StreamReader temp = new StreamReader(IPFILE);
        while ((line = temp.ReadLine()) != null) { //total

            string[] split = line.Split(new string[] { "\",\"" }, StringSplitOptions.None);
            for (int i = 0; i < split.Length; i++) {
                if (split[i].StartsWith("\"")) split[i] = split[i].Substring(1);
                if (split[i].EndsWith("\"")) split[i] = split[i].Substring(0, split[i].Length - 1);
            }

            uint a = UInt32.Parse(split[0]);
            uint b = UInt32.Parse(split[1]);
            byte[] aBytes = BitConverter.GetBytes(a);
            byte[] bBytes = BitConverter.GetBytes(b);
            Array.Reverse(aBytes);
            Array.Reverse(bBytes);

            if (aBytes[0] == bBytes[0]) {
                IpEntry entry = new IpEntry();
                entry.from = aBytes;
                entry.to = bBytes;
                entry.code = split[2].Length < 2 ? "--" : split[2];
                entry.country = split[3];
                entry.region = split[4];
                entry.city = split[5];
                entry.lon = (Single)Double.Parse(split[6]);
                entry.lat = (Single)Double.Parse(split[7]);
                list[aBytes[0]].Add(entry);
            } else {

                for (int i = aBytes[0]; i <= bBytes[0]; i++) {
                    byte[] from;
                    byte[] to;

                    if (i == aBytes[0]) {
                        from = new byte[] { aBytes[0], aBytes[1], aBytes[2], aBytes[3] };
                        to = new byte[] { (byte)i, 255, 255, 255 };

                    } else if (i == bBytes[0]) {
                        from = new byte[] { bBytes[0], 0, 0, 0 };
                        to = new byte[] { bBytes[0], bBytes[1], bBytes[2], bBytes[3] };

                    } else {
                        from = new byte[] { aBytes[0], aBytes[1], aBytes[2], aBytes[3] };
                        to = new byte[] { bBytes[0], bBytes[1], bBytes[2], bBytes[3] };
                    }

                    IpEntry entry = new IpEntry() {
                        from = from,
                        to = to,
                        code = split[2].Length < 2 ? "--" : split[2],
                        country = split[3],
                        region = split[4],
                        city = split[5],
                        lon = (Single)Double.Parse(split[6]),
                        lat = (Single)Double.Parse(split[7])
                    };

                    list[i].Add(entry);
                }
            }
        }

        DirectoryInfo dirIp = new DirectoryInfo(IPDIR);
        if (!dirIp.Exists) dirIp.Create();

        for (int i = 0; i < list.Count; i++) {
            if (list[i].Count == 0) continue;

            Console.Write(i);

            FileStream s = new FileStream($"{IPDIR}\\{i}.bin", FileMode.OpenOrCreate);
            BinaryWriter w = new BinaryWriter(s);

            uint index = 0;
            List<string> dictionary = new List<string>();
            List<uint> position = new List<uint>();

            uint dictStart = (uint)(4 + (2 + 2 + 2 + 4 + 4 + 4 + 4 + 4) * list[i].Count); //26

            w.Write(dictStart);

            for (int j = 0; j < list[i].Count; j++) {
                UInt32 ptr1, ptr2, ptr3;

                if (dictionary.Contains(list[i][j].country)) {
                    ptr1 = position[dictionary.IndexOf(list[i][j].country)];
                } else {
                    ptr1 = index;
                    dictionary.Add(list[i][j].country);
                    position.Add(index);
                    index += (uint)list[i][j].country.Length + 1;
                }

                if (dictionary.Contains(list[i][j].region)) {
                    ptr2 = position[dictionary.IndexOf(list[i][j].region)];
                } else {
                    ptr2 = index;
                    dictionary.Add(list[i][j].region);
                    position.Add(index);
                    index += (uint)list[i][j].region.Length + 1;
                }

                if (dictionary.Contains(list[i][j].city)) {
                    ptr3 = position[dictionary.IndexOf(list[i][j].city)];
                } else {
                    ptr3 = index;
                    dictionary.Add(list[i][j].city);
                    position.Add(index);
                    index += (uint)list[i][j].city.Length + 1;
                }

                w.Write(list[i][j].from[2]);
                w.Write(list[i][j].from[1]);

                w.Write(list[i][j].to[2]);
                w.Write(list[i][j].to[1]);

                w.Write((byte)list[i][j].code[0]);
                w.Write((byte)list[i][j].code[1]);

                w.Write(ptr1);
                w.Write(ptr2);
                w.Write(ptr3);
                w.Write(list[i][j].lon);
                w.Write(list[i][j].lat);
            }

            for (int j = 0; j < dictionary.Count; j++) {
                string v = dictionary[j];
                for (int k = 0; k < v.Length; k++) {
                    byte b = (byte)v[k];
                    w.Write(b);
                }
                w.Write((byte)0); //null termination
            }

            w.Close();
            s.Close();

            Console.WriteLine(": done");
        }
    }

    static void GenProxyBin() {
        List<List<ProxyEntry>> list = new List<List<ProxyEntry>>();
        for (int i = 0; i < 256; i++)
            list.Add(new List<ProxyEntry>());


        Console.WriteLine("Reading...");

        string line;
        StreamReader temp = new StreamReader(PROXYFILE);
        while ((line = temp.ReadLine()) != null) { //total

            string[] split = line.Split(new string[] { "\",\"" }, StringSplitOptions.None);
            for (int i = 0; i < split.Length; i++) {
                if (split[i].StartsWith("\"")) split[i] = split[i].Substring(1);
                if (split[i].EndsWith("\"")) split[i] = split[i].Substring(0, split[i].Length - 1);
            }

            uint a = UInt32.Parse(split[0]);
            uint b = UInt32.Parse(split[1]);
            byte[] aBytes = BitConverter.GetBytes(a);
            byte[] bBytes = BitConverter.GetBytes(b);
            Array.Reverse(aBytes);
            Array.Reverse(bBytes);

            if (aBytes[0] == bBytes[0]) {
                ProxyEntry entry = new ProxyEntry();
                entry.from = aBytes;
                entry.to = bBytes;
                list[aBytes[0]].Add(entry);
            } else {

                for (int i = aBytes[0]; i <= bBytes[0]; i++) {
                    byte[] from;
                    byte[] to;

                    if (i == aBytes[0]) {
                        from = new byte[] { aBytes[0], aBytes[1], aBytes[2], aBytes[3] };
                        to = new byte[] { (byte)i, 255, 255, 255 };

                    } else if (i == bBytes[0]) {
                        from = new byte[] { bBytes[0], 0, 0, 0 };
                        to = new byte[] { bBytes[0], bBytes[1], bBytes[2], bBytes[3] };

                    } else {
                        from = new byte[] { aBytes[0], aBytes[1], aBytes[2], aBytes[3] };
                        to = new byte[] { bBytes[0], bBytes[1], bBytes[2], bBytes[3] };
                    }

                    ProxyEntry entry = new ProxyEntry() {
                        from = from,
                        to = to
                    };

                    list[i].Add(entry);
                }
            }
        }

        DirectoryInfo dirProxy = new DirectoryInfo(PROXYDIR);
        if (!dirProxy.Exists) dirProxy.Create();

        for (int i = 0; i < list.Count; i++) {
            if (list[i].Count == 0) continue;

            Console.Write(i);

            FileStream s = new FileStream($"{PROXYDIR}\\{i}.bin", FileMode.OpenOrCreate);
            BinaryWriter w = new BinaryWriter(s);

            for (int j = 0; j < list[i].Count; j++) {
                w.Write(list[i][j].from[3]);
                w.Write(list[i][j].from[2]);
                w.Write(list[i][j].from[1]);

                w.Write(list[i][j].to[3]);
                w.Write(list[i][j].to[2]);
                w.Write(list[i][j].to[1]);
            }

            w.Close();
            s.Close();

            Console.WriteLine(": done");
        }
    }

    static void GenMacLookupBin() {
        //https://regauth.standards.ieee.org/standards-ra-web/pub/view.html#registries
        Console.WriteLine("Reading...");

        List<MacEntry> list = new List<MacEntry>();

        string line;
        StreamReader temp = new StreamReader(MACFILE);
        while ((line = temp.ReadLine()) != null) {
            if (line.Length < 8) continue;
            if (line[2] != '-' || line[5] != '-') continue;

            string[] split = line.Split(new char[] {'\t'}, StringSplitOptions.RemoveEmptyEntries);
            if (split.Length < 2) continue;

            MacEntry entry = new MacEntry() {
                mac = split[0].Substring(0, 8).Replace("-", ""),
                vendor = split[1].Trim()
            };

            list.Add(entry);
        }

        list.Sort((MacEntry a, MacEntry b) => {
            return string.Compare(a.mac, b.mac);
        });

        Console.WriteLine("Writing...");

        FileStream s = new FileStream($"mac.bin", FileMode.OpenOrCreate);
        BinaryWriter w = new BinaryWriter(s);

        uint index = 0;
        List<string> dictionary = new List<string>();
        List<uint> position = new List<uint>();

        uint dictStart = (uint)(4 + (3 + 4) * list.Count); //7

        w.Write(dictStart);

        for (int i = 0; i < list.Count; i++) {
            UInt32 ptr;

            if (dictionary.Contains(list[i].vendor)) {
                ptr = position[dictionary.IndexOf(list[i].vendor)];
            } else {
                ptr = index;
                dictionary.Add(list[i].vendor);
                position.Add(index);
                index += (uint)list[i].vendor.Length + 1;
            }

            w.Write(byte.Parse(list[i].mac.Substring(0, 2), NumberStyles.HexNumber));
            w.Write(byte.Parse(list[i].mac.Substring(2, 2), NumberStyles.HexNumber));
            w.Write(byte.Parse(list[i].mac.Substring(4, 2), NumberStyles.HexNumber));
            w.Write(ptr);
        }

        for (int i = 0; i < dictionary.Count; i++) {
            string v = dictionary[i];
            for (int j = 0; j < v.Length; j++) {
                byte b = (byte)v[j];

                w.Write(b);
            }
            w.Write((byte)0); //null termination
        }

        Console.WriteLine("Done!");
    }

    static void GenTorServersBin() {

        List<string> list = new List<string>();

        string line;
        StreamReader temp = new StreamReader(TORFILE);
        while ((line = temp.ReadLine()) != null) {
            string[] linesplit = line.Split('.');
            list.Add(linesplit[0].Trim().PadLeft(3, '0') + linesplit[1].Trim().PadLeft(3, '0') + linesplit[2].Trim().PadLeft(3, '0') + linesplit[3].Trim().PadLeft(3, '0'));
        }

        list.Sort((string a, string b) => {
            return string.Compare(a, b);
        });

        FileStream s = new FileStream($"tor.bin", FileMode.OpenOrCreate);
        BinaryWriter w = new BinaryWriter(s);

        for (int i = 0; i < list.Count; i++) {
            w.Write(Byte.Parse(list[i].Substring(9, 3))); //reversed
            w.Write(Byte.Parse(list[i].Substring(6, 3)));
            w.Write(Byte.Parse(list[i].Substring(3, 3)));
            w.Write(Byte.Parse(list[i].Substring(0, 3)));
        }

        Console.WriteLine("Done!");
    }

}
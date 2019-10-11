﻿using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;

class Program {
    static readonly string IPFILE = $"{Directory.GetCurrentDirectory()}\\IP2LOCATION-LITE-DB5.CSV";
    static readonly string PROXYFILE = $"{Directory.GetCurrentDirectory()}\\IP2PROXY-LITE-PX1.CSV";
    static readonly string MACFILE = $"{Directory.GetCurrentDirectory()}\\mac.txt";

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

    static void Main(string[] args) {
        GenIpLocationBin();
        //GenProxyBin();
        //GenMacLookupBin();
    }

    static void GenIpLocationBin() {
        List<List<IpEntry>> list = new List<List<IpEntry>>();
        for (int i=0; i<256; i++) 
            list.Add(new List<IpEntry>());
        
        Console.WriteLine("Reading...");

        StreamReader temp = new StreamReader(IPFILE);
        string line;
        while ((line = temp.ReadLine()) != null) { //total

            string[] split = line.Split(new string[] { "\",\"" }, StringSplitOptions.None);
            for (int i = 0; i < split.Length; i++) {
                if (split[i].StartsWith("\"")) split[i] = split[i].Substring(1);
                if (split[i].EndsWith("\"")) split[i] = split[i].Substring(0, split[i].Length-1);
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
                entry.lon = (Single) Double.Parse(split[6]);
                entry.lat = (Single) Double.Parse(split[7]);
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
                        lon = (Single) Double.Parse(split[6]),
                        lat = (Single) Double.Parse(split[7])
                    };

                    list[i].Add(entry);
                }
            }
        }


        for (int i=0;i<list.Count; i++) {
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

        Console.ReadLine();
    }

    static void GenProxyBin() {
        List<List<ProxyEntry>> list = new List<List<ProxyEntry>>();
        for (int i = 0; i < 256; i++)
            list.Add(new List<ProxyEntry>());

        string line;

        Console.WriteLine("Reading...");

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

        Console.ReadLine();
    }

    static void GenMacLookupBin() {
        Console.WriteLine("Reading...");

        StreamReader temp = new StreamReader(MACFILE);
        string line;
        while ((line = temp.ReadLine()) != null) { //total
            //TODO:
        }

    }

}
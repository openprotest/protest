using Microsoft.VisualBasic.FileIO;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Text;

namespace Protest;
internal static class Update {
    private struct IpEntry {
        public byte[] from;
        public byte[] to;
        public string code;
        public string country;
        public string region;
        public string city;
        public Single lat;
        public Single lon;
    }

    private struct ProxyEntry {
        public byte[] from;
        public byte[] to;
    }

    private struct MacEntry {
        public string mac;
        public string vendor;
    }

    public static byte[] CheckLatestRelease() {
        //TODO: string url = $"https://raw.githubusercontent.com/veniware/OpenProtest/master/RELEASE";
        string url = $"https://raw.githubusercontent.com/veniware/OpenProtestCore/master/RELEASE";

        using HttpClient client = new HttpClient();

        HttpResponseMessage responseMessage = client.GetAsync(url).Result;
        responseMessage.EnsureSuccessStatusCode();

        string data = responseMessage.Content.ReadAsStringAsync().Result;
        string[] split = data.Split('.');
        
        if (split.Length >= 3) {
            //System.Threading.Thread.Sleep(1000);
            return Encoding.UTF8.GetBytes($"{{\"version\":\"{data}\",\"major\":\"{split[0]}\",\"minor\":\"{split[1]}\",\"build\":\"{split[2]}\"}}");
        }
        else {
            return Data.CODE_FAILED.Array;
        }
    }

    public static byte[] LocationFormDataHandler(HttpListenerContext ctx) {
        HttpListenerRequest request = ctx.Request;

        string boundary = request.ContentType.Split('=')[1]; //boundary value
        Stream body = request.InputStream;
        Encoding encoding = request.ContentEncoding;
        StreamReader reader = new StreamReader(body, encoding);

        string formData = reader.ReadToEnd();

        string[] parts = formData.Split(new[] { "--" + boundary }, StringSplitOptions.RemoveEmptyEntries);

        List<List<IpEntry>> list = new List<List<IpEntry>>();
        for (int i = 0; i < 256; i++)
            list.Add(new List<IpEntry>());

        foreach (string part in parts) {
            if (!part.Contains("Content-Disposition")) continue;
            //string file = GetFieldName(part);
            string value = GetFieldValue(part);

            using TextFieldParser parser = new TextFieldParser(new StringReader(value));
            parser.TextFieldType = FieldType.Delimited;
            parser.SetDelimiters(",");

            while (!parser.EndOfData) {
                string[] fields = parser.ReadFields();

                uint a = UInt32.Parse(fields[0]);
                uint b = UInt32.Parse(fields[1]);
                byte[] aBytes = BitConverter.GetBytes(a);
                byte[] bBytes = BitConverter.GetBytes(b);
                Array.Reverse(aBytes);
                Array.Reverse(bBytes);


                if (aBytes[0] == bBytes[0]) {
                    list[aBytes[0]].Add(new IpEntry {
                        from = aBytes,
                        to = bBytes,
                        code = fields[2].Length < 2 ? "--" : fields[2],
                        country = fields[3],
                        region = fields[4],
                        city = fields[5],
                        lon = (Single)Double.Parse(fields[6]),
                        lat = (Single)Double.Parse(fields[7])
                    });
                }
                else {

                    for (int j = aBytes[0]; j <= bBytes[0]; j++) {
                        byte[] from, to;

                        if (j == aBytes[0]) {
                            from = new byte[] { aBytes[0], aBytes[1], aBytes[2], aBytes[3] };
                            to = new byte[] { (byte)j, 255, 255, 255 };
                        }
                        else if (j == bBytes[0]) {
                            from = new byte[] { bBytes[0], 0, 0, 0 };
                            to = new byte[] { bBytes[0], bBytes[1], bBytes[2], bBytes[3] };
                        }
                        else {
                            from = new byte[] { aBytes[0], aBytes[1], aBytes[2], aBytes[3] };
                            to = new byte[] { bBytes[0], bBytes[1], bBytes[2], bBytes[3] };
                        }

                        list[j].Add(new IpEntry() {
                            from = from,
                            to = to,
                            code = fields[2].Length < 2 ? "--" : fields[2],
                            country = fields[3],
                            region = fields[4],
                            city = fields[5],
                            lon = (Single)Double.Parse(fields[6]),
                            lat = (Single)Double.Parse(fields[7])
                        });
                    }
                }

            }
        }

        DirectoryInfo dirIp = new DirectoryInfo(Data.DIR_IP_LOCATION);
        if (!dirIp.Exists) dirIp.Create();

        for (int i = 0; i < list.Count; i++) {
            if (list[i].Count == 0) continue;

            FileStream stream = new FileStream($"{Data.DIR_IP_LOCATION}{Data.DIRECTORY_DELIMITER}{i}.bin", FileMode.OpenOrCreate);
            BinaryWriter writer = new BinaryWriter(stream);

            uint index = 0;
            List<string> dictionary = new List<string>();
            List<uint> position = new List<uint>();

            uint dictStart = (uint)(4 + (2 + 2 + 2 + 4 + 4 + 4 + 4 + 4) * list[i].Count); //26

            writer.Write(dictStart);

            for (int j = 0; j < list[i].Count; j++) {
                UInt32 ptr1, ptr2, ptr3;

                if (dictionary.Contains(list[i][j].country)) {
                    ptr1 = position[dictionary.IndexOf(list[i][j].country)];
                }
                else {
                    ptr1 = index;
                    dictionary.Add(list[i][j].country);
                    position.Add(index);
                    index += (uint)list[i][j].country.Length + 1;
                }

                if (dictionary.Contains(list[i][j].region)) {
                    ptr2 = position[dictionary.IndexOf(list[i][j].region)];
                }
                else {
                    ptr2 = index;
                    dictionary.Add(list[i][j].region);
                    position.Add(index);
                    index += (uint)list[i][j].region.Length + 1;
                }

                if (dictionary.Contains(list[i][j].city)) {
                    ptr3 = position[dictionary.IndexOf(list[i][j].city)];
                }
                else {
                    ptr3 = index;
                    dictionary.Add(list[i][j].city);
                    position.Add(index);
                    index += (uint)list[i][j].city.Length + 1;
                }

                writer.Write(list[i][j].from[2]);
                writer.Write(list[i][j].from[1]);

                writer.Write(list[i][j].to[2]);
                writer.Write(list[i][j].to[1]);

                writer.Write((byte)list[i][j].code[0]);
                writer.Write((byte)list[i][j].code[1]);

                writer.Write(ptr1);
                writer.Write(ptr2);
                writer.Write(ptr3);
                writer.Write(list[i][j].lon);
                writer.Write(list[i][j].lat);
            }

            for (int j = 0; j < dictionary.Count; j++) {
                string v = dictionary[j];
                for (int k = 0; k < v.Length; k++) {
                    byte b = (byte)v[k];
                    writer.Write(b);
                }
                writer.Write((byte)0); //null termination
            }

            writer.Close();
            stream.Close();
        }

        return Data.CODE_OK.Array;
    }

    public static byte[] ProxyFormDataHandler(HttpListenerContext ctx) {
        HttpListenerRequest request = ctx.Request;

        string boundary = request.ContentType.Split('=')[1]; //boundary value
        Stream body = request.InputStream;
        Encoding encoding = request.ContentEncoding;
        StreamReader reader = new StreamReader(body, encoding);

        string formData = reader.ReadToEnd();

        string[] parts = formData.Split(new[] { "--" + boundary }, StringSplitOptions.RemoveEmptyEntries);

        List<List<ProxyEntry>> list = new List<List<ProxyEntry>>();
        for (int i = 0; i < 256; i++)
            list.Add(new List<ProxyEntry>());

        foreach (string part in parts) {
            if (!part.Contains("Content-Disposition")) continue;
            //string file = GetFieldName(part);
            string value = GetFieldValue(part);

            using TextFieldParser parser = new TextFieldParser(new StringReader(value));
            parser.TextFieldType = FieldType.Delimited;
            parser.SetDelimiters(",");

            while (!parser.EndOfData) {
                string[] fields = parser.ReadFields();
                if (fields.Length < 2) continue;

                uint a = UInt32.Parse(fields[0]);
                uint b = UInt32.Parse(fields[1]);
                byte[] aBytes = BitConverter.GetBytes(a);
                byte[] bBytes = BitConverter.GetBytes(b);
                Array.Reverse(aBytes);
                Array.Reverse(bBytes);

                if (aBytes[0] == bBytes[0]) {
                    list[aBytes[0]].Add(new ProxyEntry {
                        from = aBytes,
                        to = bBytes
                    });
                }
                else {
                    for (int j = aBytes[0]; j <= bBytes[0]; j++) {
                        byte[] from;
                        byte[] to;

                        if (j == aBytes[0]) {
                            from = new byte[] { aBytes[0], aBytes[1], aBytes[2], aBytes[3] };
                            to = new byte[] { (byte)j, 255, 255, 255 };
                        }
                        else if (j == bBytes[0]) {
                            from = new byte[] { bBytes[0], 0, 0, 0 };
                            to = new byte[] { bBytes[0], bBytes[1], bBytes[2], bBytes[3] };
                        }
                        else {
                            from = new byte[] { aBytes[0], aBytes[1], aBytes[2], aBytes[3] };
                            to = new byte[] { bBytes[0], bBytes[1], bBytes[2], bBytes[3] };
                        }

                        list[j].Add(new ProxyEntry() {
                            from = from,
                            to = to
                        });
                    }
                }
            }
        }

        DirectoryInfo dirProxy = new DirectoryInfo(Data.DIR_PROXY);
        if (!dirProxy.Exists) dirProxy.Create();

        for (int i = 0; i < list.Count; i++) {
            if (list[i].Count == 0) continue;

            FileStream stream = new FileStream($"{Data.DIR_PROXY}\\{i}.bin", FileMode.OpenOrCreate);
            BinaryWriter writer = new BinaryWriter(stream);

            for (int j = 0; j < list[i].Count; j++) {
                writer.Write(list[i][j].from[3]);
                writer.Write(list[i][j].from[2]);
                writer.Write(list[i][j].from[1]);

                writer.Write(list[i][j].to[3]);
                writer.Write(list[i][j].to[2]);
                writer.Write(list[i][j].to[1]);
            }

            writer.Close();
            stream.Close();
        }

        return Data.CODE_OK.Array;
    }

    public static byte[] MacResolverFormDataHandler(HttpListenerContext ctx) {
        HttpListenerRequest request = ctx.Request;

        string boundary = request.ContentType.Split('=')[1]; //boundary value
        Stream body = request.InputStream;
        Encoding encoding = request.ContentEncoding;
        StreamReader reader = new StreamReader(body, encoding);

        string formData = reader.ReadToEnd();

        string[] parts = formData.Split(new[] { "--" + boundary }, StringSplitOptions.RemoveEmptyEntries);

        List<MacEntry> list = new List<MacEntry>();

        foreach (string part in parts) {
            if (!part.Contains("Content-Disposition")) continue;
            //string file = GetFieldName(part);
            string value = GetFieldValue(part);

            using TextFieldParser parser = new TextFieldParser(new StringReader(value));
            parser.TextFieldType = FieldType.Delimited;
            parser.SetDelimiters(",");

            while (!parser.EndOfData) {
                string[] fields = parser.ReadFields();

                if (fields.Length >= 2) {
                    string mac = fields[1];
                    if (mac.Length != 6) continue;
                    string vendor = fields[2].Trim();
                    list.Add(new MacEntry { mac = mac, vendor = vendor });
                }
            }
        }

        list.Sort((MacEntry a, MacEntry b) => {
            return string.Compare(a.mac, b.mac);
        });

        FileStream stream = new FileStream(Data.FILE_MAC, FileMode.OpenOrCreate);
        BinaryWriter writer = new BinaryWriter(stream);


        uint index = 0;
        List<string> dictionary = new List<string>();
        List<uint> position = new List<uint>();

        uint dictStart = (uint)(4 + (3 + 4) * list.Count); //7

        writer.Write(dictStart);

        for (int i = 0; i < list.Count; i++) {
            uint ptr;

            if (dictionary.Contains(list[i].vendor)) {
                ptr = position[dictionary.IndexOf(list[i].vendor)];
            }
            else {
                ptr = index;
                dictionary.Add(list[i].vendor);
                position.Add(index);
                index += (uint)list[i].vendor.Length + 1;
            }

            writer.Write(byte.Parse(list[i].mac[..2], NumberStyles.HexNumber));
            writer.Write(byte.Parse(list[i].mac[2..4], NumberStyles.HexNumber));
            writer.Write(byte.Parse(list[i].mac[4..6], NumberStyles.HexNumber));
            writer.Write(ptr);
        }

        for (int i = 0; i < dictionary.Count; i++) {
            string v = dictionary[i];
            for (int j = 0; j < v.Length; j++) {
                byte b = (byte)v[j];

                writer.Write(b);
            }
            writer.Write((byte)0); //null termination
        }

        writer.Close();

        return Data.CODE_OK.Array;
    }

    private static string GetFieldName(string part) {
        string fieldName = part[(part.IndexOf("name=\"") + 6)..].Split('"')[0];
        return fieldName;
    }

    private static string GetFieldValue(string part) {
        string fieldValue = part.Split(new[] { "\r\n\r\n" }, StringSplitOptions.RemoveEmptyEntries)[1].Trim();
        return fieldValue;
    }

}
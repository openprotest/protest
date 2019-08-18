using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Threading;

static class NetworkDrive {

    public static byte[] GetNetDrive(string[] para) {
        bool isGlobal = false;
        string group = "";
        string userfile = "";
        string host = "";

        for (int i = 0; i < para.Length; i++) {
            para[i] = NoSQL.UrlDecode(para[i]);
            if (para[i].StartsWith("{global}")) isGlobal = true;
            if (para[i].StartsWith("group=")) group = para[i].Substring(6);
            if (para[i].StartsWith("user=")) userfile = para[i].Substring(5);
            if (para[i].StartsWith("host=")) host = para[i].Substring(5);
        }

        string username = "";
        string password = "";
        if (NoSQL.users.ContainsKey(userfile)) {
            NoSQL.DbEntry entry = (NoSQL.DbEntry)NoSQL.users[userfile];
            if (entry.hash.ContainsKey("USERNAME")) username = ((string[])entry.hash["USERNAME"])[0];
            if (entry.hash.ContainsKey("PASSWORD")) password = ((string[])entry.hash["PASSWORD"])[0];

            Console.WriteLine($"\"{username}\"");
            Console.WriteLine($"\"{password}\"");
        }
               
        if (isGlobal) {
            //TODO:
        } else if (host.Length > 0) 
            return GetNetDrivesFromHost(host, username, password);

         else if (group.Length > 0)
            return GetNetDrivesFromGroup(group);

         else if (userfile.Length > 0)
            return GetNetDrivesFromUser(userfile);

        return null;
    }

    private static byte[] GetNetDrivesFromHost(string host, string username, string password) {

        try {
            ProcessStartInfo info = new ProcessStartInfo {
                FileName = "psexec",
                Arguments = $"\\\\{host} -u {username} -p {password} wmic netuse get localname, remotepath /format:list",
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            };

            Console.WriteLine(info.Arguments);

            Process p = new Process();
            p.StartInfo = info;
            p.Start();

            Thread.Sleep(1000);

            StreamReader output = p.StandardOutput;

            string line;
            while ((line = output.ReadLine()) != null) {
                Thread.Sleep(500);
                Console.WriteLine(line);
            }

            return null;
        } catch {
            return null;
        }

    }

    private static byte[] GetNetDrivesFromGroup(string host) {
        return null;
    }

    private static byte[] GetNetDrivesFromUser(string host) {
        return null;
    }

}
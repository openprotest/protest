using System;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.WebSockets;
using System.Text;
using System.Threading;

public static class SpeedTest {
    public static byte[] TestDownstream(in HttpListenerContext ctx, in string[] para) {
        int timeout = 10;
        int bufferSize = 1004;       //bytes
        for (int i = 1; i < para.Length; i++)
            if (para[i].StartsWith("timeout=")) timeout = Math.Min(int.Parse(para[i].Substring(8)), 30);

        byte[] buffer = Enumerable.Repeat((byte)0, bufferSize).ToArray();
        long tStart = DateTime.Now.Ticks;
        long sendCount = 0;

        while (DateTime.Now.Ticks - tStart < timeout * 10_000_000) {
            ctx.Response.OutputStream.Write(buffer, 0, buffer.Length);
            sendCount += buffer.Length;
        }

        return null;
    }

    public static byte[] TestUpstream(in HttpListenerContext ctx, in string[] para) {
        int timeout = 10;
        for (int i = 1; i < para.Length; i++)
            if (para[i].StartsWith("timeout=")) timeout = Math.Min(int.Parse(para[i].Substring(8)), 60);

        long tStart = DateTime.Now.Ticks;

        char[] buffer = new char[1024];
        long count = 0;
        using (StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding)) {
            while (DateTime.Now.Ticks - tStart < timeout * 10_000_000) {                
                reader.Read(buffer, 0, buffer.Length);
                count += buffer.Length;
            }
        }

        byte[] total = Encoding.UTF8.GetBytes(count.ToString());
        ctx.Response.OutputStream.Write(total, 0, total.Length);

        return null;
    }



}
using System;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.WebSockets;
using System.Text;
using System.Threading;

public static class SpeedTest {
    public static byte[] TestDownstream(in HttpListenerContext ctx, in string[] para) {
        int timeout = 15;
        int size = 16 * 1024 * 1024; //megabytes
        int bufferSize = 1004;       //bytes
        for (int i = 1; i < para.Length; i++) {
            if (para[i].StartsWith("timeout=")) timeout = Math.Min(int.Parse(para[i].Substring(8)), 60);
            if (para[i].StartsWith("size=")) size = Math.Min(int.Parse(para[i].Substring(5)), 512) * 1024 * 1024;
            if (para[i].StartsWith("buffer=")) bufferSize = Math.Min(int.Parse(para[i].Substring(7)), 4096) - 20; // 20: tcp header size
        }

        byte[] buffer = Enumerable.Repeat((byte)0, bufferSize).ToArray();
        long tStart = DateTime.Now.Ticks;
        long sendCount = 0;

        while (DateTime.Now.Ticks - tStart < timeout * 10_000_000 && sendCount <= size) {
            ctx.Response.OutputStream.Write(buffer, 0, buffer.Length);
            sendCount += buffer.Length;
        }
        
        return null;
    }

    public static byte[] TestUpstream(in HttpListenerContext ctx, in string[] para) {
        int timeout = 15;
        int size = 16 * 1024 * 1024; //megabytes
        int bufferSize = 1004;       //bytes
        for (int i = 1; i < para.Length; i++) {
            if (para[i].StartsWith("timeout=")) timeout = Math.Min(int.Parse(para[i].Substring(8)), 60);
            if (para[i].StartsWith("size=")) size = Math.Min(int.Parse(para[i].Substring(5)), 512) * 1024 * 1024;
            if (para[i].StartsWith("buffer=")) bufferSize = Math.Min(int.Parse(para[i].Substring(7)), 4096) - 20; // 20: tcp header size
        }

        byte[] buffer = Enumerable.Repeat((byte)0, bufferSize).ToArray();
        long tStart = DateTime.Now.Ticks;
        long sendCount = 0;

        string payload;
        using (StreamReader reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding)) {
            while (DateTime.Now.Ticks - tStart < timeout * 10_000_000 && sendCount <= size) {
                payload = reader.ReadToEnd();
                //int len = ctx.Request.InputStream.Read(buffer, 0, buffer.Length);
                //Console.WriteLine(len);
                //sendCount += len;
            }
        }

        return null;
    }

    public static async void WsSpeedtest_down(HttpListenerContext ctx, string remoteIp, string[] para) {
        int timeout = 15;
        int size = 16 * 1024 * 1024; //megabytes
        int bufferSize = 1024;       //bytes
        for (int i = 1; i < para.Length; i++) {
            if (para[i].StartsWith("timeout=")) timeout = Math.Min(int.Parse(para[i].Substring(8)), 60);
            if (para[i].StartsWith("size=")) size = Math.Min(int.Parse(para[i].Substring(5)), 512) * 1024 * 1024;
            if (para[i].StartsWith("buffer=")) bufferSize = Math.Min(int.Parse(para[i].Substring(7)), 16777216);
        }        

        WebSocketContext wsc;
        WebSocket ws;
        try {
            wsc = await ctx.AcceptWebSocketAsync(null);
            ws = wsc.WebSocket;
        } catch (WebSocketException ex) {
            ctx.Response.Close();
            Logging.Err(ex);
            return;
        }

        string sessionId = ctx.Request.Cookies["sessionid"]?.Value ?? null;

        if (sessionId is null) {
            ctx.Response.Close();
            return;
        }

        long sendCount = 0;
        ArraySegment<byte> segment = new ArraySegment<byte>(Enumerable.Repeat((byte)0, bufferSize).ToArray());
        long tStart = DateTime.Now.Ticks;

        try {
            while (DateTime.Now.Ticks - tStart < timeout * 10_000_000 && sendCount < size) {
                await ws.SendAsync(segment, WebSocketMessageType.Binary, true, CancellationToken.None);
                sendCount += segment.Array.Length;
            }

            await ws.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, "done", CancellationToken.None);

        } catch (Exception ex) {
            Logging.Err(ex);
        }
    }
    
    public static async void WsSpeedtest_up(HttpListenerContext ctx, string remoteIp, string[] para) {
        int timeout = 15;
        int size = 16 * 1024 * 1024; //megabytes
        int bufferSize = 1024;       //bytes
        for (int i = 1; i < para.Length; i++) {
            if (para[i].StartsWith("timeout=")) timeout = Math.Min(int.Parse(para[i].Substring(8)), 60);
            if (para[i].StartsWith("size=")) size = Math.Min(int.Parse(para[i].Substring(5)), 512) * 1024 * 1024;
            if (para[i].StartsWith("buffer=")) bufferSize = Math.Min(int.Parse(para[i].Substring(7)), 16777216);
        }
        
        WebSocketContext wsc;
        WebSocket ws;
        try {
            wsc = await ctx.AcceptWebSocketAsync(null);
            ws = wsc.WebSocket;
        } catch (WebSocketException ex) {
            ctx.Response.Close();
            Logging.Err(ex);
            return;
        }

        string sessionId = ctx.Request.Cookies["sessionid"]?.Value ?? null;

        if (sessionId is null) {
            ctx.Response.Close();
            return;
        }

        long sendCount = 0;
        ArraySegment<byte> segment = new ArraySegment<byte>(Enumerable.Repeat((byte)0, 1).ToArray());
        ArraySegment<byte> buff = new ArraySegment<byte>(new byte[bufferSize]);
        long tStart = DateTime.Now.Ticks;

        try {
            while (DateTime.Now.Ticks - tStart < timeout * 10_000_000 && sendCount < size) {
                await ws.SendAsync(segment, WebSocketMessageType.Binary, true, CancellationToken.None);
                
                WebSocketReceiveResult result = await ws.ReceiveAsync(buff, CancellationToken.None);
                sendCount += bufferSize;
            }

            await ws.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, "done", CancellationToken.None);

        } catch (Exception ex) {
            Logging.Err(ex);
        }
    }

}
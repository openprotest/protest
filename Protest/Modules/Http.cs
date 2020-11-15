using System;
using System.Linq;
using System.Net;
using System.Threading;

class Http {
    //internal readonly string ip;
    //internal readonly ushort port;
    //internal readonly ushort sslport;

    internal bool isListening = false;

    public HttpListener listener;
    public Cache cache;

    public Http(string ip, ushort port, in string path) {
        Initialize(new string[] { $"http://{ip}:{port}" }, path);
    }

    public Http(in string[] uriPrefixes, in string path) {
        Initialize(uriPrefixes, path);
    }

    private void Initialize(in string[] uriPrefixes, in string path) {
        cache = new Cache(path);

        if (!HttpListener.IsSupported) throw new Exception("Unsupported OS");
        listener = new HttpListener();
        for (int i = 0; i < uriPrefixes.Length; i++)
            listener.Prefixes.Add(uriPrefixes[i]);

        try {
            listener.Start();
        } catch (HttpListenerException ex) {
            Logging.Err(ex);
            return;
        }

        isListening = true;
        Console.WriteLine(this.ToString());

        while (true)
#if !DEBUG
            try
#endif
            {
                HttpListenerContext ctx = listener.GetContext();
                Thread thread = new Thread(() => Serve(ctx));
                thread.Start();
            }
#if !DEBUG
            catch (Exception ex) { Logging.Err(ex); }
#endif
    }

    public virtual void Serve(in HttpListenerContext ctx) {}

    public override string ToString() {
        string s = String.Empty;
        foreach (string prefix in listener.Prefixes) 
            s += (s.Length == 0 ? "" : "\n") + "HTTP listening on " + prefix;
        return s;
    }

    ~Http() {
        if (listener != null && listener.IsListening) listener.Stop();
    }

}

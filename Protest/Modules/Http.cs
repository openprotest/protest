using System;
using System.Net;
using System.Text;
using System.Threading;
using System.Linq;

class Http {
    internal readonly string ip;
    internal readonly ushort port;

    internal bool isListening = false;

    private readonly HttpListener listener;
    public Cache cache;

    public Http(in string ip, in ushort port, in string path) {
        this.ip = ip;
        this.port = port;

        cache = new Cache(path);

        if (!HttpListener.IsSupported) throw new Exception("Unsupported OS");
        listener = new HttpListener();
        listener.Prefixes.Add("http://" + ip + ":" + port + "/");

        try {
            listener.Start();
        } catch (HttpListenerException ex) {
            Logging.Err($"Unable to start http listener ({ip}:{port}).\n{ex}");
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
        return $"HTTP listening on {ip}:{port}";
    }

    ~Http() {
        if (listener != null && listener.IsListening) listener.Stop();
    }

}

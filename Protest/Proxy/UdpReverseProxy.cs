using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Threading;
using System.Threading.Tasks;

namespace Protest.Proxy;
internal sealed class UdpReverseProxy : ReverseProxyAbstract {

    private UdpClient udpListener;
    private IPEndPoint destinationEndPoint;

    public UdpReverseProxy(Guid guid) : base(guid) {}

    public override bool Start(IPEndPoint listener, string destination, string certificate, string password, string origin) {
        try {
            udpListener = new UdpClient(listener);
        }
        catch (SocketException ex) {
            Logger.Error(ex);
            throw;
        }
        catch (Exception ex) {
            Logger.Error(ex);
            throw;
        }

        if (!IPEndPoint.TryParse(destination, out destinationEndPoint)) {
            throw new Exception($"Invalid destination address: {destination}");
        }

        this.thread = new Thread(async () => await ListenForClients());
        this.thread.Start();

        return base.Start(listener, destination, certificate, password, origin);
    }

    private async Task ListenForClients() {
        while (!cancellationToken.IsCancellationRequested) {
            try {
                UdpReceiveResult result = await udpListener.ReceiveAsync();
                _ = Task.Run(() => ServeClient(result));
            }
            catch (Exception) {
                this.errors++;
            }
        }
    }

    private async Task ServeClient(UdpReceiveResult udpResult) {
        try {
            using UdpClient destinationClient = new UdpClient();
            uint clientIp = BitConverter.ToUInt32(udpResult.RemoteEndPoint.Address.GetAddressBytes(), 0);

            bytesRx.AddOrUpdate(clientIp, udpResult.Buffer.Length, (_, oldValue) => oldValue + udpResult.Buffer.Length);

            await destinationClient.SendAsync(udpResult.Buffer, udpResult.Buffer.Length, destinationEndPoint);

            UdpReceiveResult responseResult = await destinationClient.ReceiveAsync();

            bytesTx.AddOrUpdate(clientIp, responseResult.Buffer.Length, (_, oldValue) => oldValue + responseResult.Buffer.Length);

            await udpListener.SendAsync(responseResult.Buffer, responseResult.Buffer.Length, udpResult.RemoteEndPoint);
        }
        catch (Exception) {
            this.errors++;
        }
    }

    public override bool Stop(string origin) {
        cancellationTokenSource.Cancel();
        udpListener?.Close();
        udpListener?.Dispose();
        udpListener = null;
        return base.Stop(origin);
    }
}

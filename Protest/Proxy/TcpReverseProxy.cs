using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Threading;
using System.Threading.Tasks;

namespace Protest.Proxy;
internal sealed class TcpReverseProxy : ReverseProxyAbstract {
    private TcpListener tcpListener;
    private IPEndPoint destinationEndPoint;

    public TcpReverseProxy(Guid guid) : base(guid) {}

    public override bool Start(IPEndPoint listener, string destination, string certificate, string password, string origin) {
        try {
            tcpListener = new TcpListener(listener.Address, listener.Port);
            tcpListener.Start();
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
                TcpClient client = await tcpListener.AcceptTcpClientAsync();
                _ = Task.Run(() => ServeClient(client));
            }
            catch (Exception) {
                this.errors++;
            }
        }
    }

    private async Task ServeClient(TcpClient proxyClient) {
        try {
            using TcpClient destinationClient = new TcpClient();
            await destinationClient.ConnectAsync(destinationEndPoint, cancellationToken);

            uint clientIp = BitConverter.ToUInt32(((IPEndPoint)proxyClient.Client.RemoteEndPoint).Address.GetAddressBytes(), 0);

            //using ProxyStreamWrapper countingClientStream = new ProxyStreamWrapper(proxyClient.GetStream(), clientIp, bytesRx, bytesTx);
            using NetworkStream proxyStream = proxyClient.GetStream();
            using TrafficCountingStreamWrapper destinationStream = new TrafficCountingStreamWrapper(destinationClient.GetStream(), clientIp, bytesRx, bytesTx);

            using Task clientToDestination = proxyStream.CopyToAsync(destinationStream, cancellationToken);
            using Task destinationToClient = destinationStream.CopyToAsync(proxyStream, cancellationToken);

            await Task.WhenAll(clientToDestination, destinationToClient);
        }
        catch (Exception) {
            this.errors++;
        }
        finally {
            proxyClient?.Close();
        }
    }

    public override bool Stop(string origin) {
        cancellationTokenSource.Cancel();
        tcpListener?.Stop();
        tcpListener = null;
        return base.Stop(origin);
    }
}

using System.Net;
using System.Collections.Generic;
using System.Threading;
using System.Net.Sockets;
using System.Threading.Tasks;
using System.Diagnostics.Metrics;
using System.Collections.Concurrent;
using System.IO;

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
        catch (SocketException) {
            throw;
        }
        catch (Exception) {
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
            catch (Exception ex) {
                Console.WriteLine($"Exception: {ex.Message}");
                this.errors++;
            }
        }
    }

    private async Task ServeClient(TcpClient proxyClient) {
        try {
            using TcpClient destinationClient = new TcpClient();
            await destinationClient.ConnectAsync(destinationEndPoint, cancellationToken);

            uint clientIp = BitConverter.ToUInt32(((IPEndPoint)proxyClient.GetStream().Socket.RemoteEndPoint).Address.GetAddressBytes(), 0);

            //using ProxyStreamWrapper countingClientStream = new ProxyStreamWrapper(proxyClient.GetStream(), clientIp, bytesRx, bytesTx);
            using ProxyStreamWrapper countingDestinationStream = new ProxyStreamWrapper(destinationClient.GetStream(), clientIp, bytesRx, bytesTx);

            using Task clientToDestination = proxyClient.GetStream().CopyToAsync(countingDestinationStream, cancellationToken);
            using Task destinationToClient = countingDestinationStream.CopyToAsync(proxyClient.GetStream(), cancellationToken);

            await Task.WhenAll(clientToDestination, destinationToClient);
        }
        catch (Exception ex) {
            Console.WriteLine($"ServeClient Exception: {ex.Message}");
            this.errors++;
        }
        finally {
            proxyClient?.Close();
        }
    }

    public override bool Stop(string origin) {
        cancellationTokenSource.Cancel();
        tcpListener?.Stop();
        tcpListener?.Dispose();
        tcpListener = null;
        return base.Stop(origin);
    }
}

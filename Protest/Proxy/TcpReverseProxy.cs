using Protest.Workers;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace Protest.Proxy;
internal sealed class TcpReverseProxy : ReverseProxy {

    public override bool Start(IPEndPoint listener, string destination, string certificate, string password, string origin) {
        this.totalUpstream = 0;
        this.totalDownstream = 0;

        Thread thread = new Thread(()=> {
            task.status = TaskWrapper.TaskStatus.running;

            return;
        });

        task = new TaskWrapper("TCP reverse proxy") {
            thread = thread,
            origin = origin,
            TotalSteps = 0,
            CompletedSteps = 0
        };

        task.thread.Start();

        return true;
    }

    public override bool Stop(string origin) {
        this.totalUpstream = 0;
        this.totalDownstream = 0;
        return true;
    }
}

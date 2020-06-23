using System;
using System.Collections.Generic;
using System.Linq;
using System.ServiceProcess;
using System.Text;
using System.Threading.Tasks;

namespace Proserv {
    static class Program {
        /// <summary>
        /// The main entry point for the application.
        /// </summary>
        static void Main() {
            ServiceBase[] ServicesToRun = new ServiceBase[] {
                new Wrapper()
            };
            ServiceBase.Run(ServicesToRun);
        }
    }
}

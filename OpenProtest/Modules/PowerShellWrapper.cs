using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Management.Automation;
using System.Management.Automation.Runspaces;
using System.Collections.ObjectModel;

class PowerShellWrapper {

    public static void test() {
        Console.WriteLine("conn..");

        WSManConnectionInfo connectionInfo = new WSManConnectionInfo();
        connectionInfo.ComputerName = "it";
        Runspace runspace = RunspaceFactory.CreateRunspace(connectionInfo);
        runspace.Open();

        Console.WriteLine("exec..");

        using (PowerShell ps = PowerShell.Create()) {
            ps.Runspace = runspace;

            ps.AddCommand("Get-NetworkAdapter");

            Collection<PSObject> pso = ps.Invoke();
            foreach (PSObject o in pso) {
                Console.WriteLine("{0,-20}", o.Members["ProcessName"].Value);

                foreach (PSMemberInfo m in o.Members) {
                    Console.WriteLine($" {m.Name} - {m.Value}");
                }
            }

        }

        runspace.Close();
    }

}

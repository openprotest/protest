using System.IO;
using System.Data;
using System.Net.NetworkInformation;
using System.Data.SqlClient;
//using System.Management.Automation;

namespace Protest.Tools;

internal static class Tools {

    public static TcpConnectionInformation[] GetAllTcpConnections() {
        IPGlobalProperties properties = IPGlobalProperties.GetIPGlobalProperties();
        TcpConnectionInformation[] connections = properties.GetActiveTcpConnections();
        return connections;
    }

    /*public static DataTable ReadFromDatabase(string server, string database, string username, string password, string queryString) {
        string connectionString = $"Server={server};Database={database};User Id={username};Password={password};";

        System.Data.SqlClient.SqlConnection connection = new System.Data.SqlClient.SqlConnection(connectionString);
        SqlCommand command = new SqlCommand(queryString, connection);
        command.Connection.Open();

        SqlDataReader reader = command.ExecuteReader();
        DataTable dataTable = new DataTable();
        dataTable.Load(reader);

        return dataTable;
    }*/

    /*public static void ExecutePowerShellScript(string scriptFilePath) {
        // Create a PowerShell object
        PowerShell ps = PowerShell.Create();

        // Use the AddScript method to add the contents of the script file to the pipeline
        ps.AddScript(File.ReadAllText(scriptFilePath));

        // Invoke the script
        ps.Invoke();
    }*/

}


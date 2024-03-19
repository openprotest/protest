using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace ProtestAgent {
    internal static class Program {

        //[System.Runtime.InteropServices.DllImport("kernel32.dll")]
        //static extern bool AttachConsole(int dwProcessId);

        [STAThread]
        static void Main() {

            string[] arguments = Environment.GetCommandLineArgs();

            if (arguments.Length == 1) {
                ShowUI();
                return;
            }

            //AttachConsole(-1); //attach output to parent

            if (arguments[1].StartsWith("protest://")) arguments[1] = arguments[1].Substring(10);
            if (arguments[1].EndsWith("/")) arguments[1] = arguments[1].Substring(0, arguments[1].Length - 1);

            byte[] data = Convert.FromBase64String(arguments[1]);

            string[] split = Encoding.UTF8.GetString(data).Split((char)127);

            if (split.Length < 3) return;

            Configuration.Load();

            string key = split[0];
            if (key != Configuration.presharedKey) return;

            Mux(split[1], split[2]);
        }

        private static void ShowUI() {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new Main());
        }

        private static void Mux(string command, string value) {
            switch (command) {
            case "settings":
                ShowUI();
                break;

            case "stamp":
                if (!Configuration.stamp.enabled) return;
                Application.Run(new Stamp(value));
                break;

            case "management":
                if (!Configuration.compmgmt.enabled) return;
                try {
                    using (Process p = new Process()) {
                        p.StartInfo.FileName = "compmgmt.msc";
                        p.StartInfo.Arguments = $"/computer=\"{value}\"";
                        p.StartInfo.UseShellExecute = true;
                        p.Start();
                    }
                }
                catch {}
                break;

            case "psremote":
                if (!Configuration.pse.enabled) return;
                try {
                    string filename = Path.GetTempPath() + DateTime.Now.Ticks + ".bat";

                    StringBuilder builder = new StringBuilder();
                    builder.AppendLine("@ECHO OFF");
                    builder.AppendLine();
                    builder.Append($"{Configuration.pse.path} \\\\{value}");
                    if (String.IsNullOrEmpty(Configuration.pse.username)) { builder.Append($" -u {Configuration.pse.username}");}
                    if (String.IsNullOrEmpty(Configuration.pse.password)) { builder.Append($" -p {Configuration.pse.password}"); }
                    builder.Append($" cmd.exe");

                    File.WriteAllText(filename, builder.ToString());

                    using (Process p = new Process()) {
                        p.StartInfo.FileName = "explorer.exe";
                        p.StartInfo.Arguments = filename;
                        p.Start();
                    }
                    new Thread(() => {
                        Thread.Sleep(3000);
                        File.Delete(filename);
                    }).Start();
                }
                catch (Exception ex) { MessageBox.Show(ex.Message, "Exception"); }
                break;

            case "ssh":
                //if (!Configuration.ssh.enabled) return;
                //TODO: handle frontend
                break;

            case "smb":
                if (!Configuration.smb.enabled) return;
                try {
                    using (Process p = new Process()) {
                        p.StartInfo.FileName = "explorer.exe";
                        p.StartInfo.Arguments = value;
                        p.StartInfo.UseShellExecute = true;
                        p.Start();
                    }
                }
                catch (Exception ex) { MessageBox.Show(ex.Message, "Exception"); }
                break;

            case "rdp":
                if (!Configuration.rdp.enabled) return;
                try {
                    using (Process p = new Process()) {
                        p.StartInfo.FileName = "mstsc.exe";
                        p.StartInfo.Arguments = "/v " + value;
                        p.StartInfo.UseShellExecute = true;
                        p.Start();
                    }
                }
                catch (Exception ex) {
                    MessageBox.Show(ex.Message, "Exception");
                }
                break;

            case "uvnc":
                if (!Configuration.uvnc.enabled) return;
                try {
                    Process.Start(
                        Configuration.uvnc.path,
                        Configuration.uvnc.arguments + " -password " + Configuration.uvnc.password + " " + value
                    );
                }
                catch (Exception ex) { MessageBox.Show(ex.Message, "Exception"); }
                break;

            case "anydesk":
                if (!Configuration.anydesk.enabled) return;
                try {
                    Process.Start(
                        Configuration.anydesk.path,
                        Configuration.anydesk.arguments + " \"" + value + "\""
                    );
                }
                catch (Exception ex) { MessageBox.Show(ex.Message, "Exception"); }
                break;

            case "winbox":
                if (!Configuration.winbox.enabled) return;
                try {
                    Process.Start(
                        Configuration.winbox.path,
                        value + " " + Configuration.winbox.arguments
                    );
                }
                catch (Exception ex) { MessageBox.Show(ex.Message, "Exception"); }
                break;
            }
        }

    }
}

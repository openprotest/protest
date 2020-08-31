using System;
using System.Linq;
using System.Threading;
using System.Net;
using System.Net.Sockets;
using System.Windows.Forms;
using System.Diagnostics;
using System.IO;
using System.Collections;

namespace Protest_RA {
    static class Listener {

        public static bool isRunning = false;

        public static TcpListener listener;
        public static Thread listenerThread;
        public static ThreadPriority threadPriority = ThreadPriority.Normal;

        private static IPEndPoint endpoint;
        public static void StartListener(IPEndPoint endpoint) {
            Listener.endpoint = endpoint;
            listenerThread = new Thread(()=> { Listen(endpoint); });
            listenerThread.Priority = threadPriority;
            listenerThread.Start();

            isRunning = true;
        }

        public static void StopListener() {
            isRunning = false;
            listener.Stop();

            try { //close the last pendding
                TcpClient client = new TcpClient(Listener.endpoint);
                client.Close();
            } catch { }

        }

        static void Listen(IPEndPoint endpoint) {
            try {
                listener = new TcpListener(endpoint);
                listener.Start();
            } catch (Exception ex) {
                MessageBox.Show(ex.Message);
                Process.GetCurrentProcess().Kill();
            }

            while (isRunning)
                try {
                    TcpClient client = listener.AcceptTcpClient();
                    Serve(client);

                    /*listenerThread = new Thread(() => { Serve(client); });
                    listenerThread.Priority = threadPriority;
                    listenerThread.Start();*/
                } catch {}
        }

        static void Serve(TcpClient client) {
            byte[] buffer = new byte[client.ReceiveBufferSize];
            int length;

            try {
                length = client.Client.Receive(buffer);
                Array.Resize(ref buffer, length);
            } catch {
                client.Close();
                return; 
            }
            
            byte[] decrypt = CryptoAes.Decrypt(buffer, Main.bKey, Main.bIv);
            if (decrypt is null) {
                client.Close();
                return;
            }

            Action(System.Text.Encoding.UTF8.GetString(decrypt));

            client.Close();
        }

        private static bool Action(string cmd) {
            string[] split = cmd.Split((char)127);
            if (split.Length < 2) return false;

            string method = split[0];
            string targer = split[1];
            string arg = split[2];

            switch (method) {
                case "vnc":
                    if (!Main.srv_uvnc.chkEnable.Checked) break;
                    new Thread(() => {
                        try {
                            Process.Start(
                            Main.srv_uvnc.txtExe.Text,
                            Main.srv_uvnc.txtParam.Text + " -password " + Main.srv_uvnc.txtPassword.Text + " " + targer);
                        } catch (Exception ex) { MessageBox.Show(ex.Message, "Exception"); }
                    }).Start();
                    break;

                case "rdp":
                    if (!Main.srv_rdp.chkEnable.Checked) break;

                    FileInfo file1 = new FileInfo("AxInterop.MSTSCLib.dll");
                    FileInfo file2 = new FileInfo("Interop.MSTSCLib.dll");
                    if (Main.chkOverrideWinRdpClient.Checked && file1.Exists && file2.Exists) { //pro-test client
                        try
                        {
                            Process.Start(
                            Process.GetCurrentProcess().MainModule.FileName,
                            " -r " + targer);
                        }
                        catch (Exception ex) { MessageBox.Show(ex.Message, "Exception"); }
                        break;
                    }

                    new Thread(() => { //native
                        try {
                            Process.Start(
                            Main.srv_rdp.txtExe.Text,
                            Main.srv_rdp.txtParam.Text + " /v " + targer);
                        } catch (Exception ex) { MessageBox.Show(ex.Message, "Exception"); }
                    }).Start();
                    break;

                case "pse":
                    if (!Main.srv_pse.chkEnable.Checked) break;

                    new Thread(() => {
                        try {
                            string filename = Path.GetTempPath() + DateTime.Now.Ticks + ".bat";
                            File.WriteAllText(
                                filename,
                                "@ECHO OFF\n" +
                                Main.srv_pse.txtExe.Text + @" \\" + targer + " -u " + Main.srv_pse.txtUsername.Text + " -p " + Main.srv_pse.txtPassword.Text + " cmd.exe"
                            );

                            using (Process p = new Process()) {
                                p.StartInfo.FileName = "explorer.exe";
                                p.StartInfo.Arguments = filename;
                                p.Start();
                            }

                            new Thread(() => {
                                Thread.Sleep(3000);
                                File.Delete(filename);
                            }).Start();

                        } catch (Exception ex) { MessageBox.Show(ex.Message, "Exception"); }
                    }).Start();
                    break;

                case "smb":
                    new Thread(() => {
                        try {
                            using (Process p = new Process()) {
                                p.StartInfo.FileName = "explorer.exe";
                                p.StartInfo.Arguments = $"\\\\{targer}\\{arg}";
                                p.StartInfo.UseShellExecute = true;
                                p.Start();
                            }
                        } catch (Exception ex) { MessageBox.Show(ex.Message, "Exception"); }
                    }).Start();
                    break;

                case "stp":
                    Main.ShowStamp(arg); //invoke
                    break;

                case "cmg":
                    try {
                        using (Process p = new Process()) {
                            p.StartInfo.FileName = "compmgmt.msc";
                            p.StartInfo.Arguments = $"/computer=\"{targer}\"";
                            p.StartInfo.UseShellExecute = true;
                            p.Start();
                        }
                    } catch { }
                    break;
            }

            return false;
        }

    }

}
using System;
using System.ComponentModel;
using System.Linq;
using System.Windows.Forms;
using System.Net;
using Protest_RA.Properties;
using System.Threading;

namespace Protest_RA {
    public partial class Main : Form {

        public static Service srv_uvnc;
        public static Service srv_rdp;
        public static Service srv_pse;

        public static CheckBox chkOverrideWinRdpClient;

        public static string key = "";
        public static byte[] bKey;
        public static byte[] bIv;

        public static Main self;
        private static Stamp frmStamp = new Stamp();
        private delegate void delShowStamp(string value);
        public static void ShowStamp(string value) {
            if (self.InvokeRequired) 
                self.Invoke(new delShowStamp(ShowStamp), value);
            else 
                frmStamp.setKeystroke(value);
        }
        
        public Main() {
            InitializeComponent();
            this.TrayIcon.Text = this.Text;
            this.TrayIcon.Icon = this.Icon;

            this.lblVersion.Text = System.Reflection.Assembly.GetExecutingAssembly().GetName().Version.ToString();

            self = this;

            Thread.Sleep(1000);

            IPAddress[] ip = Dns.GetHostEntry(Dns.GetHostName()).AddressList;
            for (int i = 0; i < ip.Length; i++)
                if (ip[i].ToString().Split('.').Length == 4) cmbListennerIp.Items.Add(ip[i]);

            if (!cmbListennerIp.Items.Contains("127.0.0.1")) cmbListennerIp.Items.Add("127.0.0.1");

            InitServicesList();
            LoadSettings();

            IPAddress listennerIp;
            bool parseIp = IPAddress.TryParse(cmbListennerIp.Items[cmbListennerIp.SelectedIndex].ToString(), out listennerIp);
            if (!parseIp) listennerIp = IPAddress.Parse("127.0.0.1");
            int listennerPort = (int) txtListennerPort.Value;

            Listener.StartListener(new IPEndPoint(listennerIp, listennerPort));
        }

        public void InitServicesList() {
            srv_pse = new Service("PS excec");
            srv_uvnc = new Service("Ultra VNC");
            srv_rdp = new Service("RDP");

            Service[] array = { srv_pse, srv_uvnc, srv_rdp };
            for (int i = 0; i < array.Length; i++) {
                pnlMain.Controls.Add(array[i]);
                array[i].Top = 88 + i * 108;
            }

            srv_uvnc.txtPassword.Left = srv_uvnc.txtUsername.Left;
            srv_uvnc.lblPassword.Left = srv_uvnc.lblUsername.Left;
            srv_uvnc.lblUsername.Visible = false;
            srv_uvnc.txtUsername.Visible = false;

            srv_pse.chkEnable.Checked = Settings.Default.pse_enable;

            chkOverrideWinRdpClient = new CheckBox();
            chkOverrideWinRdpClient.Text = "Overrite windows native RDP client";
            chkOverrideWinRdpClient.Left = srv_rdp.txtPassword.Left + srv_rdp.txtPassword.Width + 16;
            chkOverrideWinRdpClient.Top = 72;
            chkOverrideWinRdpClient.AutoSize = true;
            srv_rdp.Controls.Add(chkOverrideWinRdpClient);
        }

        public void LoadSettings() {
            int index = Settings.Default.ip_index;
            if (index > -1) cmbListennerIp.SelectedIndex = index;

            txtListennerPort.Value = Settings.Default.port;
            txtKey.Text = Settings.Default.key;

            key = txtKey.Text;
            bKey = key.Length > 0 ? CryptoAes.KeyToBytes(key, 32) : null; //256-bits
            bIv = CryptoAes.KeyToBytes(key, 16); //128-bits

            srv_uvnc.chkEnable.Checked = Settings.Default.uvnc_enable;
            srv_uvnc.txtExe.Text = Settings.Default.uvnc_exe;
            srv_uvnc.txtParam.Text = Settings.Default.uvnc_para;
            srv_uvnc.txtPassword.Text = CryptoAes.DecryptB64(Settings.Default.uvnc_pass, bKey, bIv);

            if (srv_uvnc.txtPassword.Text.Length > 0) //remove salt
                srv_uvnc.txtPassword.Text = srv_uvnc.txtPassword.Text.Substring(1);

            srv_rdp.chkEnable.Checked = Settings.Default.mstsc_enable;
            srv_rdp.txtExe.Text = Settings.Default.mstsc_exe;
            srv_rdp.txtParam.Text = Settings.Default.mstsc_para;
            srv_rdp.txtUsername.Text = Settings.Default.rdp_user;
            srv_rdp.txtPassword.Text = CryptoAes.DecryptB64(Settings.Default.rdp_pass, bKey, bIv);

            if (srv_rdp.txtPassword.Text.Length > 0) //remove salt
                srv_rdp.txtPassword.Text = srv_rdp.txtPassword.Text.Substring(1);

            srv_pse.txtExe.Text = Settings.Default.pse_exe;
            srv_pse.txtParam.Text = Settings.Default.pse_para;
            srv_pse.txtUsername.Text = Settings.Default.pse_user;
            srv_pse.txtPassword.Text = CryptoAes.DecryptB64(Settings.Default.pse_pass, bKey, bIv);

            if (srv_pse.txtPassword.Text.Length > 0) //remove salt
                srv_pse.txtPassword.Text = srv_pse.txtPassword.Text.Substring(1);

            chkOverrideWinRdpClient.Checked = Settings.Default.rdp_native_client;
        }

        public void SaveSettings() {
            Settings.Default.ip_index = cmbListennerIp.SelectedIndex;

            Settings.Default.port = (int)txtListennerPort.Value;
            Settings.Default.key = txtKey.Text;

            key = txtKey.Text;
            bKey = key.Length > 0 ? CryptoAes.KeyToBytes(key, 32) : null; //256-bits
            bIv = CryptoAes.KeyToBytes(key, 16); //128-bits

            Settings.Default.uvnc_enable = srv_uvnc.chkEnable.Checked;
            Settings.Default.uvnc_exe = srv_uvnc.txtExe.Text;
            Settings.Default.uvnc_para = srv_uvnc.txtParam.Text;
            Settings.Default.uvnc_pass = CryptoAes.EncryptB64($"3{srv_uvnc.txtPassword.Text}", bKey, bIv); //add salt

            Settings.Default.mstsc_enable = srv_rdp.chkEnable.Checked;
            Settings.Default.mstsc_exe = srv_rdp.txtExe.Text;
            Settings.Default.mstsc_para = srv_rdp.txtParam.Text;
            Settings.Default.rdp_native_client = chkOverrideWinRdpClient.Checked;
            Settings.Default.rdp_user = srv_rdp.txtUsername.Text;
            Settings.Default.rdp_pass = CryptoAes.EncryptB64($"9{srv_rdp.txtPassword.Text}", bKey, bIv); //add salt

            Settings.Default.pse_enable = srv_pse.chkEnable.Checked;
            Settings.Default.pse_exe = srv_pse.txtExe.Text;
            Settings.Default.pse_para = srv_pse.txtParam.Text;
            Settings.Default.pse_user = srv_pse.txtUsername.Text;
            Settings.Default.pse_pass = CryptoAes.EncryptB64($"6{srv_pse.txtPassword.Text}", bKey, bIv); //add salt

            Settings.Default.Save();
        }

        private void Toogle() {
            this.Visible = !this.Visible;
            if (this.Visible) LoadSettings();
        }

        private void Main_Closing(Object sender, CancelEventArgs e) {
            e.Cancel = true;
            Toogle();
        }

        private void tmrAutoHide_Tick(object sender, EventArgs e) {
            tmrAutoHide.Stop();

            string[] args = Environment.GetCommandLineArgs();
            if (!(args is null) && args.Length > 1)
                if (args[1] == "-v") {
                    this.Visible = true;
                    this.ShowInTaskbar = true;

                    this.Left = Screen.PrimaryScreen.Bounds.Width - this.Width - (Screen.PrimaryScreen.Bounds.Width - Screen.PrimaryScreen.WorkingArea.Right);
                    this.Top = Screen.PrimaryScreen.Bounds.Height - this.Height - (Screen.PrimaryScreen.Bounds.Height - Screen.PrimaryScreen.WorkingArea.Bottom);
                    this.Opacity = 1;

                    return;
                }                
            
            this.Visible = false;
            this.ShowInTaskbar = true;
            this.Opacity = 1;

            this.Left = Screen.PrimaryScreen.Bounds.Width - this.Width - (Screen.PrimaryScreen.Bounds.Width - Screen.PrimaryScreen.WorkingArea.Right);
            this.Top = Screen.PrimaryScreen.Bounds.Height - this.Height - (Screen.PrimaryScreen.Bounds.Height - Screen.PrimaryScreen.WorkingArea.Bottom);
        }

        private void exitToolStripMenuItem_Click(object sender, EventArgs e) {
            this.TrayIcon.Visible = false;
            Listener.StopListener();
            System.Diagnostics.Process.GetCurrentProcess().Kill();
            //Application.Exit();
        }

        private void btnApply_Click(object sender, EventArgs e) {
            SaveSettings();

            this.TrayIcon.Visible = false;
            Listener.StopListener();

            System.Diagnostics.Process.Start(System.Reflection.Assembly.GetEntryAssembly().Location, "-v");

            System.Diagnostics.Process.GetCurrentProcess().Kill();
            //Application.Exit();
        }

        private void btnClose_Click(object sender, EventArgs e) {
            Toogle();
        }
        private void optionsToolStripMenuItem_Click(object sender, EventArgs e) {
            Toogle();
        }
        private void TrayIcon_MouseDoubleClick(object sender, MouseEventArgs e) {
            Toogle();
        }
    }
}

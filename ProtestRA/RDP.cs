using MSTSCLib;
using Protest_RA.Properties;
using System;
using System.Windows.Forms;

public partial class RDP : Form {
    string target;

    public RDP(string target) {
        this.target = target;
        InitializeComponent();

        this.WindowState = FormWindowState.Maximized;
        this.Text = target;
    }

    private void tmrDelayedConnect_Tick(object sender, EventArgs e) {
        this.Connect();
        tmrDelayedConnect.Stop();
    }

    private void mstsc_Disconnect(object sender, AxMSTSCLib.IMsTscAxEvents_OnDisconnectedEvent e) {
        //MessageBox.Show($"Communication with {target} has been lost", "Disconnected", MessageBoxButtons.OK, MessageBoxIcon.Information);
        Application.Exit();
    }

    private void Connect() {
        string key = Settings.Default.key;
        byte[] bKey = key.Length > 0 ? CryptoAes.KeyToBytes(key, 32) : null; //256-bits
        byte[] bIv = CryptoAes.KeyToBytes(key, 16);

        string username = Settings.Default.rdp_user;
        string password = CryptoAes.DecryptB64(Settings.Default.rdp_pass, bKey, bIv).Substring(1);

        mstsc.Server = target;
        mstsc.UserName = username;
        IMsTscNonScriptable sec = (IMsTscNonScriptable)mstsc.GetOcx();
        sec.ClearTextPassword = password;

        mstsc.DesktopWidth = this.ClientSize.Width;
        mstsc.DesktopHeight = this.ClientSize.Height;
        try {
            mstsc.Connect();
        } catch { }
    }

}

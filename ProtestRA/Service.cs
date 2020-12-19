using System;
using System.Windows.Forms;

namespace Protest_RA {
    public partial class Service: UserControl {

        public string name = "Name";

        public Service() {
            InitializeComponent();
        }

        public Service(string name) {
            this.Text = name;
            this.name = name;
            InitializeComponent();
        }

        public void UpdateUi() {
            txtExe.Enabled = chkEnable.Checked;
            btnExe.Enabled = chkEnable.Checked;
            txtParam.Enabled = chkEnable.Checked;
            txtUsername.Enabled = chkEnable.Checked;
            txtPassword.Enabled = chkEnable.Checked;
            //this.BackColor = chkEnable.Checked ? Color.FromArgb(255, 64,64,64) : Color.FromArgb(255, 48,48,48);
        }
        
        public void UpdateUi(string name, bool enable, string exe, string args, string username, string password) {
            chkEnable.Text = name;
            chkEnable.Checked = enable;
            txtExe.Text = exe;
            txtParam.Text = args;
            txtUsername.Text = username;
            txtPassword.Text = password;

            UpdateUi();
        }

        private void chkEnable_CheckedChanged(object sender, EventArgs e) {
            UpdateUi();
        }

        private void btnExe_Click(object sender, EventArgs e) {
            using (OpenFileDialog frmOpenFile = new OpenFileDialog()) {
                frmOpenFile.FileName = txtExe.Text;
                frmOpenFile.Filter = "All executables|*.exe|All files|*.*";
                frmOpenFile.FilterIndex = 0;

                if (frmOpenFile.ShowDialog() == DialogResult.OK) {
                    txtExe.Text = frmOpenFile.FileName;
                }
            };
        }
    }
}

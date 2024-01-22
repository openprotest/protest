using Microsoft.Win32;
using System;
using System.Drawing;
using System.IO;
using System.Text;
using System.Windows.Forms;

namespace ProtestAgent {
    public partial class Main : Form {
        private static readonly Brush backgroundBrush = new SolidBrush(Color.FromArgb(128, 128, 128));
        private static readonly Brush foregroundBrush = new SolidBrush(Color.FromArgb(32, 32, 32));
        private static readonly Brush highlightBrush = new SolidBrush(Color.FromArgb(232,118,0));

        public Main() {
            InitializeComponent();
            tabServices.SetSelection(true);

            listProtocols.Items.Add("Password stamp");
            listProtocols.Items.Add("SMB");
            listProtocols.Items.Add("Computer managment");
            listProtocols.Items.Add("Remote desktop");
            listProtocols.Items.Add("PS remote");
            listProtocols.Items.Add("Ultra VNC");
            listProtocols.Items.Add("Winbox");

            this.tabServices.OnPressed += new EventHandler(this.TabsServices_Press);
            this.tabSetup.OnPressed += new EventHandler(this.TabsSetup_Press);

            txtKey.box.ReadOnly = true;
            this.btnGenerateKey.OnPressed += new EventHandler(this.BtnGenerateKey_Press);
            this.btnCopyKey.OnPressed += new EventHandler(this.BtnCopyKey_Press);

            this.btnSave.OnPressed += new EventHandler(this.BtnSave_Press);
            this.btnRegister.OnPressed += new EventHandler(this.BtnRegister_Press);
            this.btnExport.OnPressed += new EventHandler(this.BtnExport_Press);

            this.btnBrowseExecutable.OnPressed += new EventHandler(this.BtnBrowse_Press);
            this.btnRevert.OnPressed += new EventHandler(this.BtnRevert_Press);
            this.btnApply.OnPressed += new EventHandler(this.BtnApply_Press);

            this.txtExecutable.box.AutoCompleteSource = AutoCompleteSource.FileSystem;
            this.txtExecutable.box.AutoCompleteMode = AutoCompleteMode.SuggestAppend;

            this.txtPassword.box.PasswordChar = '\u25CF';

            Configuration.Load();

            this.txtKey.box.Text = Configuration.presharedKey;
        }
        private void ViewSelected() {
            if (listProtocols.SelectedIndex == -1) return;

            string key = listProtocols.Items[listProtocols.SelectedIndex].ToString();

            switch (key) {
            case "Password stamp":
            case "SMB":
            case "Computer managment":
                txtExecutable.SetEnable(false);
                btnBrowseExecutable.Visible = false;
                txtArgs.SetEnable(false);
                txtUsername.SetEnable(false);
                txtPassword.SetEnable(false);
                break;

            case "Remote desktop":
            case "Winbox":
                txtExecutable.SetEnable(true);
                btnBrowseExecutable.Visible = true;
                txtArgs.SetEnable(true);
                txtUsername.SetEnable(false);
                txtPassword.SetEnable(false);
                break;

            case "PS remote":
                txtExecutable.SetEnable(true);
                btnBrowseExecutable.Visible = true;
                txtArgs.SetEnable(true);
                txtUsername.SetEnable(true);
                txtPassword.SetEnable(true);
                break;

            case "Ultra VNC":
                txtExecutable.SetEnable(true);
                btnBrowseExecutable.Visible = true;
                txtArgs.SetEnable(true);
                txtUsername.SetEnable(false);
                txtPassword.SetEnable(true);
                break;
            }

            Configuration current = null;
            switch (key) {
            case "Password stamp"     : current = Configuration.stamp;    break;
            case "SMB"                : current = Configuration.smb;      break;
            case "Computer managment" : current = Configuration.compmgmt; break;
            case "Remote desktop"     : current = Configuration.rdp;      break;
            case "PS remote"          : current = Configuration.pse;      break;
            case "Ultra VNC"          : current = Configuration.uvnc;     break;
            case "Winbox"             : current = Configuration.winbox;   break;
            }

            if (current is null) return;

            this.chkEnable.Checked      = current.enabled;
            this.txtExecutable.box.Text = current.path;
            this.txtArgs.box.Text       = current.arguments;
            this.txtUsername.box.Text   = current.username;
            this.txtPassword.box.Text   = current.password;

        }

        private void TabsServices_Press(object sender, EventArgs e) {
            tabServices.SetSelection(true);
            tabSetup.SetSelection(false);
            pnlServices.Visible = true;
            pnlSetup.Visible = false;
        }

        private void TabsSetup_Press(object sender, EventArgs e) {
            tabServices.SetSelection(false);
            tabSetup.SetSelection(true);
            pnlServices.Visible = false;
            pnlSetup.Visible = true;
        }

        private void BtnGenerateKey_Press(object sender, EventArgs e) {
            Random rnd = new Random();
            byte[] bytes = new byte[16];
            rnd.NextBytes(bytes);
            Configuration.presharedKey = BitConverter.ToString(bytes).Replace("-", String.Empty);
            txtKey.box.Text = Configuration.presharedKey;
            Configuration.Save();
        }

        private void BtnCopyKey_Press(object sender, EventArgs e) {
            if (txtKey.box.Text.Length == 0) return;
            Clipboard.SetText(txtKey.box.Text);
        }

        private void BtnSave_Press(object sender, EventArgs e) {
            DirectoryInfo dotDirectory = new DirectoryInfo(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile) + "\\.protest");
            if (!dotDirectory.Exists) dotDirectory.Create();

            using (SaveFileDialog frmSave = new SaveFileDialog()) {
                frmSave.Filter = "Executable (*.exe)|*.exe|All files (*.*)|*.*";
                frmSave.FileName = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile) + "\\.protest\\Protest-Agent.exe";

                if (frmSave.ShowDialog() == DialogResult.OK) {
                    try {
                        File.Copy(Application.ExecutablePath, frmSave.FileName, true);
                    }
                    catch (Exception ex) {
                        MessageBox.Show(ex.Message, "Copping error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    }
                }
            }
        }

        private void BtnRegister_Press(object sender, EventArgs e) {
            FileInfo agentFile = new FileInfo(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile) + "\\.protest\\Protest-Agent.exe");
            if (!agentFile.Exists) {
                MessageBox.Show("Agent file not found.\nPlease go to step 1.", "Agent file not found", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            try {
                using (RegistryKey key = Registry.ClassesRoot.CreateSubKey("protest")) {
                     key.SetValue("URL Protocol", String.Empty);

                    using (RegistryKey shellKey = key.CreateSubKey("shell")) {
                        using (RegistryKey openKey = shellKey.CreateSubKey("open")) {
                            using (RegistryKey commandKey = openKey.CreateSubKey("command")) {
                                commandKey.SetValue("", $"\"{agentFile.FullName}\" \"%1\"");
                            }
                        }
                    }
                }

                MessageBox.Show("Registration entries has been successfully added to the registry", "Register", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (Exception ex) {
                MessageBox.Show(ex.Message, "Registry error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void BtnExport_Press(object sender, EventArgs e) {
            using (SaveFileDialog frmSave = new SaveFileDialog()) {
                frmSave.Filter = "Registration Entries (*.reg)|*.reg|All files (*.*)|*.*";

                if (frmSave.ShowDialog() == DialogResult.OK) {
                    try {
                        FileInfo agentFile = new FileInfo(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile) + "\\.protest\\Protest-Agent.exe");

                        StringBuilder builder = new StringBuilder("Windows Registry Editor Version 5.00");
                        builder.AppendLine();
                        builder.AppendLine();

                        builder.AppendLine("[HKEY_CLASSES_ROOT\\protest]");
                        builder.AppendLine("\"URL Protocol\"=\"\"");
                        builder.AppendLine();

                        builder.AppendLine("[HKEY_CLASSES_ROOT\\protest\\shell]");
                        builder.AppendLine();

                        builder.AppendLine("[HKEY_CLASSES_ROOT\\protest\\shell\\open]");
                        builder.AppendLine();

                        builder.AppendLine("[HKEY_CLASSES_ROOT\\protest\\shell\\open\\command]");
                        builder.AppendLine($"@=\"\\\"{agentFile.FullName.Replace("\\", "\\\\")}\" \\\"%1\\\"\"");
                        builder.AppendLine();

                        File.WriteAllText(frmSave.FileName, builder.ToString());
                    }
                    catch (Exception ex) {
                        MessageBox.Show(ex.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    }
                }
            }
        }

        private void ListProtocols_DrawItem(object sender, DrawItemEventArgs e) {
            if (e.Index < 0) return;

            e.Graphics.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAlias;

            if ((e.State & DrawItemState.Selected) == DrawItemState.Selected)
                e.Graphics.FillRectangle(highlightBrush, e.Bounds.X, e.Bounds.Y, e.Bounds.Width, e.Bounds.Height);
            else
                e.Graphics.FillRectangle(backgroundBrush, e.Bounds.X, e.Bounds.Y, e.Bounds.Width, e.Bounds.Height);

            e.Graphics.DrawString(listProtocols.Items[e.Index].ToString(), this.Font, foregroundBrush, e.Bounds.X + 2, e.Bounds.Y + 2);
        }

        private void ListProtocols_SelectedIndexChanged(object sender, EventArgs e) {
            ViewSelected();
        }

        private void BtnBrowse_Press(object sender, EventArgs e) {
            using (OpenFileDialog frmOpenFile = new OpenFileDialog()) {
                frmOpenFile.FileName = txtExecutable.box.Text;
                frmOpenFile.Filter = "All executables|*.exe|All files|*.*";
                frmOpenFile.FilterIndex = 0;

                if (frmOpenFile.ShowDialog() == DialogResult.OK) {
                    txtExecutable.box.Text = frmOpenFile.FileName;
                }
            };
        }

        private void BtnRevert_Press(object sender, EventArgs e) {
            ViewSelected();
        }

        private void BtnApply_Press(object sender, EventArgs e) {
            if (listProtocols.SelectedIndex == -1) return;

            string key = listProtocols.Items[listProtocols.SelectedIndex].ToString();

            Configuration current = null;
            switch (key) {
            case "Password stamp"     : current = Configuration.stamp; break;
            case "SMB"                : current = Configuration.smb; break;
            case "Computer managment" : current = Configuration.compmgmt; break;
            case "Remote desktop"     : current = Configuration.rdp; break;
            case "PS remote"          : current = Configuration.pse; break;
            case "Ultra VNC"          : current = Configuration.uvnc; break;
            case "Winbox"             : current = Configuration.winbox; break;
            }

            if (current is null) return;

            current.enabled    = this.chkEnable.Checked;
            current.path       = this.txtExecutable.box.Text;
            current.arguments  = this.txtArgs.box.Text;
            current.username   = this.txtUsername.box.Text;
            current.password   = this.txtPassword.box.Text;

            Configuration.Save();
        }

    }
}

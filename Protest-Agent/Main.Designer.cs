using System.Drawing;

namespace ProtestAgent {
    partial class Main {
        /// <summary>
        /// Required designer variable.
        /// </summary>
        private System.ComponentModel.IContainer components = null;

        /// <summary>
        /// Clean up any resources being used.
        /// </summary>
        /// <param name="disposing">true if managed resources should be disposed; otherwise, false.</param>
        protected override void Dispose(bool disposing) {
            if (disposing && (components != null)) {
                components.Dispose();
            }
            base.Dispose(disposing);
        }

        #region Windows Form Designer generated code

        /// <summary>
        /// Required method for Designer support - do not modify
        /// the contents of this method with the code editor.
        /// </summary>
        private void InitializeComponent() {
            System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(Main));
            this.pnlTabs = new System.Windows.Forms.Panel();
            this.tabSetup = new ProtestAgent.TabsControl();
            this.tabServices = new ProtestAgent.TabsControl();
            this.pnlServices = new System.Windows.Forms.Panel();
            this.chkEnabled = new ProtestAgent.Checkbox();
            this.btnApply = new ProtestAgent.Button();
            this.btnRevert = new ProtestAgent.Button();
            this.txtPassword = new ProtestAgent.Textbox();
            this.txtUsername = new ProtestAgent.Textbox();
            this.txtArgs = new ProtestAgent.Textbox();
            this.txtExecutable = new ProtestAgent.Textbox();
            this.btnBrowseExecutable = new ProtestAgent.Button();
            this.lblPassword = new System.Windows.Forms.Label();
            this.lblUsername = new System.Windows.Forms.Label();
            this.lblArguments = new System.Windows.Forms.Label();
            this.lblExecutable = new System.Windows.Forms.Label();
            this.listProtocols = new System.Windows.Forms.ListBox();
            this.panel1 = new System.Windows.Forms.Panel();
            this.lblKey = new System.Windows.Forms.Label();
            this.pnlSetup = new System.Windows.Forms.Panel();
            this.lblOr = new System.Windows.Forms.Label();
            this.lblStep3 = new System.Windows.Forms.Label();
            this.label3 = new System.Windows.Forms.Label();
            this.lblStep2 = new System.Windows.Forms.Label();
            this.lblStep1 = new System.Windows.Forms.Label();
            this.label2 = new System.Windows.Forms.Label();
            this.label1 = new System.Windows.Forms.Label();
            this.btnExport = new ProtestAgent.Button();
            this.btnRegister = new ProtestAgent.Button();
            this.btnSave = new ProtestAgent.Button();
            this.btnCopyKey = new ProtestAgent.Button();
            this.btnGenerateKey = new ProtestAgent.Button();
            this.txtKey = new ProtestAgent.Textbox();
            this.pnlTabs.SuspendLayout();
            this.pnlServices.SuspendLayout();
            this.pnlSetup.SuspendLayout();
            this.SuspendLayout();
            // 
            // pnlTabs
            // 
            this.pnlTabs.Anchor = ((System.Windows.Forms.AnchorStyles)(((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Bottom) 
            | System.Windows.Forms.AnchorStyles.Left)));
            this.pnlTabs.Controls.Add(this.tabSetup);
            this.pnlTabs.Controls.Add(this.tabServices);
            this.pnlTabs.Location = new System.Drawing.Point(13, 13);
            this.pnlTabs.Name = "pnlTabs";
            this.pnlTabs.Size = new System.Drawing.Size(160, 455);
            this.pnlTabs.TabIndex = 0;
            // 
            // tabSetup
            // 
            this.tabSetup.Icon = global::ProtestAgent.Properties.Resources.wrench;
            this.tabSetup.Label = "Setup";
            this.tabSetup.Location = new System.Drawing.Point(0, 57);
            this.tabSetup.Margin = new System.Windows.Forms.Padding(4);
            this.tabSetup.Name = "tabSetup";
            this.tabSetup.Size = new System.Drawing.Size(160, 44);
            this.tabSetup.TabIndex = 1;
            // 
            // tabServices
            // 
            this.tabServices.Icon = global::ProtestAgent.Properties.Resources.service;
            this.tabServices.Label = "Services";
            this.tabServices.Location = new System.Drawing.Point(0, 9);
            this.tabServices.Margin = new System.Windows.Forms.Padding(4);
            this.tabServices.Name = "tabServices";
            this.tabServices.Size = new System.Drawing.Size(160, 44);
            this.tabServices.TabIndex = 0;
            // 
            // pnlServices
            // 
            this.pnlServices.Anchor = ((System.Windows.Forms.AnchorStyles)((((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Bottom) 
            | System.Windows.Forms.AnchorStyles.Left) 
            | System.Windows.Forms.AnchorStyles.Right)));
            this.pnlServices.BackColor = System.Drawing.Color.FromArgb(((int)(((byte)(160)))), ((int)(((byte)(160)))), ((int)(((byte)(160)))));
            this.pnlServices.Controls.Add(this.chkEnabled);
            this.pnlServices.Controls.Add(this.btnApply);
            this.pnlServices.Controls.Add(this.btnRevert);
            this.pnlServices.Controls.Add(this.txtPassword);
            this.pnlServices.Controls.Add(this.txtUsername);
            this.pnlServices.Controls.Add(this.txtArgs);
            this.pnlServices.Controls.Add(this.txtExecutable);
            this.pnlServices.Controls.Add(this.btnBrowseExecutable);
            this.pnlServices.Controls.Add(this.lblPassword);
            this.pnlServices.Controls.Add(this.lblUsername);
            this.pnlServices.Controls.Add(this.lblArguments);
            this.pnlServices.Controls.Add(this.lblExecutable);
            this.pnlServices.Controls.Add(this.listProtocols);
            this.pnlServices.ForeColor = System.Drawing.Color.FromArgb(((int)(((byte)(32)))), ((int)(((byte)(32)))), ((int)(((byte)(32)))));
            this.pnlServices.Location = new System.Drawing.Point(171, 13);
            this.pnlServices.Name = "pnlServices";
            this.pnlServices.Size = new System.Drawing.Size(777, 455);
            this.pnlServices.TabIndex = 1;
            // 
            // chkEnabled
            // 
            this.chkEnabled.Label = "Enable";
            this.chkEnabled.Location = new System.Drawing.Point(223, 24);
            this.chkEnabled.Margin = new System.Windows.Forms.Padding(2);
            this.chkEnabled.Name = "chkEnabled";
            this.chkEnabled.Size = new System.Drawing.Size(119, 24);
            this.chkEnabled.TabIndex = 2;
            this.chkEnabled.Value = false;
            // 
            // btnApply
            // 
            this.btnApply.Label = "Apply";
            this.btnApply.Location = new System.Drawing.Point(498, 254);
            this.btnApply.Margin = new System.Windows.Forms.Padding(2, 2, 2, 2);
            this.btnApply.Name = "btnApply";
            this.btnApply.Size = new System.Drawing.Size(96, 32);
            this.btnApply.TabIndex = 12;
            // 
            // btnRevert
            // 
            this.btnRevert.Label = "Revert";
            this.btnRevert.Location = new System.Drawing.Point(388, 254);
            this.btnRevert.Margin = new System.Windows.Forms.Padding(2, 2, 2, 2);
            this.btnRevert.Name = "btnRevert";
            this.btnRevert.Size = new System.Drawing.Size(96, 32);
            this.btnRevert.TabIndex = 11;
            // 
            // txtPassword
            // 
            this.txtPassword.Cursor = System.Windows.Forms.Cursors.IBeam;
            this.txtPassword.Location = new System.Drawing.Point(349, 194);
            this.txtPassword.Margin = new System.Windows.Forms.Padding(4, 5, 4, 5);
            this.txtPassword.Name = "txtPassword";
            this.txtPassword.Padding = new System.Windows.Forms.Padding(7, 5, 7, 5);
            this.txtPassword.Size = new System.Drawing.Size(300, 32);
            this.txtPassword.TabIndex = 10;
            // 
            // txtUsername
            // 
            this.txtUsername.Cursor = System.Windows.Forms.Cursors.IBeam;
            this.txtUsername.Location = new System.Drawing.Point(349, 152);
            this.txtUsername.Margin = new System.Windows.Forms.Padding(4, 5, 4, 5);
            this.txtUsername.Name = "txtUsername";
            this.txtUsername.Padding = new System.Windows.Forms.Padding(7, 5, 7, 5);
            this.txtUsername.Size = new System.Drawing.Size(300, 32);
            this.txtUsername.TabIndex = 9;
            // 
            // txtArgs
            // 
            this.txtArgs.Cursor = System.Windows.Forms.Cursors.IBeam;
            this.txtArgs.Location = new System.Drawing.Point(349, 107);
            this.txtArgs.Margin = new System.Windows.Forms.Padding(4, 5, 4, 5);
            this.txtArgs.Name = "txtArgs";
            this.txtArgs.Padding = new System.Windows.Forms.Padding(7, 5, 7, 5);
            this.txtArgs.Size = new System.Drawing.Size(300, 32);
            this.txtArgs.TabIndex = 8;
            // 
            // txtExecutable
            // 
            this.txtExecutable.Cursor = System.Windows.Forms.Cursors.IBeam;
            this.txtExecutable.Location = new System.Drawing.Point(349, 66);
            this.txtExecutable.Margin = new System.Windows.Forms.Padding(4, 5, 4, 5);
            this.txtExecutable.Name = "txtExecutable";
            this.txtExecutable.Padding = new System.Windows.Forms.Padding(7, 5, 7, 5);
            this.txtExecutable.Size = new System.Drawing.Size(300, 32);
            this.txtExecutable.TabIndex = 6;
            // 
            // btnBrowseExecutable
            // 
            this.btnBrowseExecutable.Label = "...";
            this.btnBrowseExecutable.Location = new System.Drawing.Point(656, 65);
            this.btnBrowseExecutable.Margin = new System.Windows.Forms.Padding(2, 2, 2, 2);
            this.btnBrowseExecutable.Name = "btnBrowseExecutable";
            this.btnBrowseExecutable.Size = new System.Drawing.Size(36, 32);
            this.btnBrowseExecutable.TabIndex = 7;
            // 
            // lblPassword
            // 
            this.lblPassword.AutoSize = true;
            this.lblPassword.Location = new System.Drawing.Point(219, 198);
            this.lblPassword.Name = "lblPassword";
            this.lblPassword.Size = new System.Drawing.Size(123, 20);
            this.lblPassword.TabIndex = 5;
            this.lblPassword.Text = "Global password:";
            // 
            // lblUsername
            // 
            this.lblUsername.AutoSize = true;
            this.lblUsername.Location = new System.Drawing.Point(219, 156);
            this.lblUsername.Name = "lblUsername";
            this.lblUsername.Size = new System.Drawing.Size(78, 20);
            this.lblUsername.TabIndex = 4;
            this.lblUsername.Text = "Username:";
            // 
            // lblArguments
            // 
            this.lblArguments.AutoSize = true;
            this.lblArguments.Location = new System.Drawing.Point(219, 111);
            this.lblArguments.Name = "lblArguments";
            this.lblArguments.Size = new System.Drawing.Size(84, 20);
            this.lblArguments.TabIndex = 3;
            this.lblArguments.Text = "Arguments:";
            // 
            // lblExecutable
            // 
            this.lblExecutable.AutoSize = true;
            this.lblExecutable.Location = new System.Drawing.Point(219, 69);
            this.lblExecutable.Name = "lblExecutable";
            this.lblExecutable.Size = new System.Drawing.Size(84, 20);
            this.lblExecutable.TabIndex = 2;
            this.lblExecutable.Text = "Executable:";
            // 
            // listProtocols
            // 
            this.listProtocols.BackColor = System.Drawing.Color.Gray;
            this.listProtocols.BorderStyle = System.Windows.Forms.BorderStyle.None;
            this.listProtocols.DrawMode = System.Windows.Forms.DrawMode.OwnerDrawVariable;
            this.listProtocols.ForeColor = System.Drawing.Color.FromArgb(((int)(((byte)(32)))), ((int)(((byte)(32)))), ((int)(((byte)(32)))));
            this.listProtocols.FormattingEnabled = true;
            this.listProtocols.ItemHeight = 28;
            this.listProtocols.Location = new System.Drawing.Point(9, 9);
            this.listProtocols.Name = "listProtocols";
            this.listProtocols.Size = new System.Drawing.Size(200, 433);
            this.listProtocols.TabIndex = 0;
            this.listProtocols.DrawItem += new System.Windows.Forms.DrawItemEventHandler(this.ListProtocols_DrawItem);
            this.listProtocols.SelectedIndexChanged += new System.EventHandler(this.ListProtocols_SelectedIndexChanged);
            // 
            // panel1
            // 
            this.panel1.Anchor = ((System.Windows.Forms.AnchorStyles)(((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Left) 
            | System.Windows.Forms.AnchorStyles.Right)));
            this.panel1.BackColor = System.Drawing.Color.FromArgb(((int)(((byte)(96)))), ((int)(((byte)(96)))), ((int)(((byte)(96)))));
            this.panel1.Location = new System.Drawing.Point(11, 80);
            this.panel1.Name = "panel1";
            this.panel1.Size = new System.Drawing.Size(755, 2);
            this.panel1.TabIndex = 4;
            // 
            // lblKey
            // 
            this.lblKey.Font = new System.Drawing.Font("Segoe UI", 12F);
            this.lblKey.Location = new System.Drawing.Point(16, 23);
            this.lblKey.Name = "lblKey";
            this.lblKey.Size = new System.Drawing.Size(160, 30);
            this.lblKey.TabIndex = 0;
            this.lblKey.Text = "Preshared key:";
            this.lblKey.TextAlign = System.Drawing.ContentAlignment.MiddleLeft;
            // 
            // pnlSetup
            // 
            this.pnlSetup.Anchor = ((System.Windows.Forms.AnchorStyles)((((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Bottom) 
            | System.Windows.Forms.AnchorStyles.Left) 
            | System.Windows.Forms.AnchorStyles.Right)));
            this.pnlSetup.BackColor = System.Drawing.Color.FromArgb(((int)(((byte)(160)))), ((int)(((byte)(160)))), ((int)(((byte)(160)))));
            this.pnlSetup.Controls.Add(this.lblOr);
            this.pnlSetup.Controls.Add(this.lblStep3);
            this.pnlSetup.Controls.Add(this.label3);
            this.pnlSetup.Controls.Add(this.lblStep2);
            this.pnlSetup.Controls.Add(this.lblStep1);
            this.pnlSetup.Controls.Add(this.label2);
            this.pnlSetup.Controls.Add(this.label1);
            this.pnlSetup.Controls.Add(this.btnExport);
            this.pnlSetup.Controls.Add(this.btnRegister);
            this.pnlSetup.Controls.Add(this.btnSave);
            this.pnlSetup.Controls.Add(this.panel1);
            this.pnlSetup.Controls.Add(this.btnCopyKey);
            this.pnlSetup.Controls.Add(this.btnGenerateKey);
            this.pnlSetup.Controls.Add(this.txtKey);
            this.pnlSetup.Controls.Add(this.lblKey);
            this.pnlSetup.ForeColor = System.Drawing.Color.FromArgb(((int)(((byte)(32)))), ((int)(((byte)(32)))), ((int)(((byte)(32)))));
            this.pnlSetup.Location = new System.Drawing.Point(171, 13);
            this.pnlSetup.Name = "pnlSetup";
            this.pnlSetup.Size = new System.Drawing.Size(777, 455);
            this.pnlSetup.TabIndex = 2;
            this.pnlSetup.Visible = false;
            // 
            // lblOr
            // 
            this.lblOr.AutoSize = true;
            this.lblOr.Location = new System.Drawing.Point(202, 228);
            this.lblOr.Name = "lblOr";
            this.lblOr.Size = new System.Drawing.Size(23, 20);
            this.lblOr.TabIndex = 15;
            this.lblOr.Text = "or";
            // 
            // lblStep3
            // 
            this.lblStep3.AutoSize = true;
            this.lblStep3.Location = new System.Drawing.Point(46, 283);
            this.lblStep3.Name = "lblStep3";
            this.lblStep3.Size = new System.Drawing.Size(321, 20);
            this.lblStep3.TabIndex = 14;
            this.lblStep3.Text = "Copy the preshared key to the web application.";
            // 
            // label3
            // 
            this.label3.AutoSize = true;
            this.label3.Font = new System.Drawing.Font("Segoe UI", 11.25F, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            this.label3.Location = new System.Drawing.Point(16, 283);
            this.label3.Name = "label3";
            this.label3.Size = new System.Drawing.Size(24, 20);
            this.label3.TabIndex = 13;
            this.label3.Text = "3)";
            // 
            // lblStep2
            // 
            this.lblStep2.AutoSize = true;
            this.lblStep2.Location = new System.Drawing.Point(46, 189);
            this.lblStep2.Name = "lblStep2";
            this.lblStep2.Size = new System.Drawing.Size(249, 20);
            this.lblStep2.TabIndex = 12;
            this.lblStep2.Text = "Register Pro-test as a local protocol.";
            // 
            // lblStep1
            // 
            this.lblStep1.AutoSize = true;
            this.lblStep1.Location = new System.Drawing.Point(46, 101);
            this.lblStep1.Name = "lblStep1";
            this.lblStep1.Size = new System.Drawing.Size(355, 20);
            this.lblStep1.TabIndex = 11;
            this.lblStep1.Text = "Store this executable on the recommended location.";
            // 
            // label2
            // 
            this.label2.AutoSize = true;
            this.label2.Font = new System.Drawing.Font("Segoe UI", 11.25F, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            this.label2.Location = new System.Drawing.Point(16, 189);
            this.label2.Name = "label2";
            this.label2.Size = new System.Drawing.Size(24, 20);
            this.label2.TabIndex = 10;
            this.label2.Text = "2)";
            // 
            // label1
            // 
            this.label1.AutoSize = true;
            this.label1.Font = new System.Drawing.Font("Segoe UI", 11.25F, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            this.label1.Location = new System.Drawing.Point(16, 101);
            this.label1.Name = "label1";
            this.label1.Size = new System.Drawing.Size(24, 20);
            this.label1.TabIndex = 9;
            this.label1.Text = "1)";
            // 
            // btnExport
            // 
            this.btnExport.Label = "Show me the registry file";
            this.btnExport.Location = new System.Drawing.Point(233, 218);
            this.btnExport.Margin = new System.Windows.Forms.Padding(9, 14, 9, 14);
            this.btnExport.Name = "btnExport";
            this.btnExport.Size = new System.Drawing.Size(300, 40);
            this.btnExport.TabIndex = 8;
            // 
            // btnRegister
            // 
            this.btnRegister.Label = "Register";
            this.btnRegister.Location = new System.Drawing.Point(46, 218);
            this.btnRegister.Margin = new System.Windows.Forms.Padding(7, 9, 7, 9);
            this.btnRegister.Name = "btnRegister";
            this.btnRegister.Size = new System.Drawing.Size(150, 40);
            this.btnRegister.TabIndex = 7;
            // 
            // btnSave
            // 
            this.btnSave.Label = "Save";
            this.btnSave.Location = new System.Drawing.Point(46, 127);
            this.btnSave.Margin = new System.Windows.Forms.Padding(5, 6, 5, 6);
            this.btnSave.Name = "btnSave";
            this.btnSave.Size = new System.Drawing.Size(150, 40);
            this.btnSave.TabIndex = 5;
            // 
            // btnCopyKey
            // 
            this.btnCopyKey.Label = "Copy";
            this.btnCopyKey.Location = new System.Drawing.Point(669, 21);
            this.btnCopyKey.Margin = new System.Windows.Forms.Padding(4);
            this.btnCopyKey.Name = "btnCopyKey";
            this.btnCopyKey.Size = new System.Drawing.Size(96, 36);
            this.btnCopyKey.TabIndex = 3;
            // 
            // btnGenerateKey
            // 
            this.btnGenerateKey.Label = "Generate";
            this.btnGenerateKey.Location = new System.Drawing.Point(565, 21);
            this.btnGenerateKey.Margin = new System.Windows.Forms.Padding(4);
            this.btnGenerateKey.Name = "btnGenerateKey";
            this.btnGenerateKey.Size = new System.Drawing.Size(96, 36);
            this.btnGenerateKey.TabIndex = 2;
            // 
            // txtKey
            // 
            this.txtKey.Cursor = System.Windows.Forms.Cursors.IBeam;
            this.txtKey.Location = new System.Drawing.Point(184, 23);
            this.txtKey.Margin = new System.Windows.Forms.Padding(5, 6, 5, 6);
            this.txtKey.Name = "txtKey";
            this.txtKey.Padding = new System.Windows.Forms.Padding(11, 6, 11, 6);
            this.txtKey.Size = new System.Drawing.Size(372, 32);
            this.txtKey.TabIndex = 1;
            // 
            // Main
            // 
            this.AutoScaleDimensions = new System.Drawing.SizeF(8F, 20F);
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            this.BackColor = System.Drawing.Color.FromArgb(((int)(((byte)(64)))), ((int)(((byte)(64)))), ((int)(((byte)(64)))));
            this.ClientSize = new System.Drawing.Size(960, 480);
            this.Controls.Add(this.pnlTabs);
            this.Controls.Add(this.pnlServices);
            this.Controls.Add(this.pnlSetup);
            this.Font = new System.Drawing.Font("Segoe UI", 11F, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            this.ForeColor = System.Drawing.Color.FromArgb(((int)(((byte)(224)))), ((int)(((byte)(224)))), ((int)(((byte)(224)))));
            this.FormBorderStyle = System.Windows.Forms.FormBorderStyle.FixedDialog;
            this.Icon = ((System.Drawing.Icon)(resources.GetObject("$this.Icon")));
            this.Margin = new System.Windows.Forms.Padding(4);
            this.MaximizeBox = false;
            this.Name = "Main";
            this.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen;
            this.Text = "Protest - Agent";
            this.pnlTabs.ResumeLayout(false);
            this.pnlServices.ResumeLayout(false);
            this.pnlServices.PerformLayout();
            this.pnlSetup.ResumeLayout(false);
            this.pnlSetup.PerformLayout();
            this.ResumeLayout(false);

        }

        #endregion

        private System.Windows.Forms.Panel pnlTabs;
        private System.Windows.Forms.Panel pnlServices;
        private TabsControl tabServices;
        private TabsControl tabSetup;
        private System.Windows.Forms.Panel pnlSetup;
        private Button btnCopyKey;
        private Button btnGenerateKey;
        private Textbox txtKey;
        private System.Windows.Forms.Label lblKey;
        private System.Windows.Forms.Panel panel1;
        private Button btnSave;
        private Button btnRegister;
        private Button btnExport;
        private System.Windows.Forms.Label label1;
        private System.Windows.Forms.Label lblStep2;
        public System.Windows.Forms.Label lblStep1;
        private System.Windows.Forms.Label label2;
        private System.Windows.Forms.Label lblStep3;
        private System.Windows.Forms.Label label3;
        private System.Windows.Forms.Label lblOr;
        private System.Windows.Forms.ListBox listProtocols;
        private Textbox txtExecutable;
        private System.Windows.Forms.Label lblPassword;
        private System.Windows.Forms.Label lblUsername;
        private System.Windows.Forms.Label lblArguments;
        private System.Windows.Forms.Label lblExecutable;
        private Button btnBrowseExecutable;
        private Textbox txtArgs;
        private Textbox txtUsername;
        private Textbox txtPassword;
        private Button btnApply;
        private Button btnRevert;
        private Checkbox chkEnabled;
    }
}


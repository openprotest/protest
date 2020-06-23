namespace Protest_RA {
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
            this.components = new System.ComponentModel.Container();
            System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(Main));
            this.pnlMain = new System.Windows.Forms.Panel();
            this.lblKey = new System.Windows.Forms.Label();
            this.txtKey = new System.Windows.Forms.TextBox();
            this.txtListennerPort = new System.Windows.Forms.NumericUpDown();
            this.lblPort = new System.Windows.Forms.Label();
            this.cmbListennerIp = new System.Windows.Forms.ComboBox();
            this.lblListennerIp = new System.Windows.Forms.Label();
            this.btnApply = new System.Windows.Forms.Button();
            this.TrayIcon = new System.Windows.Forms.NotifyIcon(this.components);
            this.TrayMenu = new System.Windows.Forms.ContextMenuStrip(this.components);
            this.recentsToolStripMenuItem = new System.Windows.Forms.ToolStripMenuItem();
            this.toolStripMenuItem1 = new System.Windows.Forms.ToolStripSeparator();
            this.optionsToolStripMenuItem = new System.Windows.Forms.ToolStripMenuItem();
            this.exitToolStripMenuItem = new System.Windows.Forms.ToolStripMenuItem();
            this.tmrAutoHide = new System.Windows.Forms.Timer(this.components);
            this.btnClose = new System.Windows.Forms.Button();
            this.pnlMain.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)(this.txtListennerPort)).BeginInit();
            this.TrayMenu.SuspendLayout();
            this.SuspendLayout();
            // 
            // pnlMain
            // 
            this.pnlMain.Anchor = ((System.Windows.Forms.AnchorStyles)((((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Bottom) 
            | System.Windows.Forms.AnchorStyles.Left) 
            | System.Windows.Forms.AnchorStyles.Right)));
            this.pnlMain.AutoScroll = true;
            this.pnlMain.Controls.Add(this.lblKey);
            this.pnlMain.Controls.Add(this.txtKey);
            this.pnlMain.Controls.Add(this.txtListennerPort);
            this.pnlMain.Controls.Add(this.lblPort);
            this.pnlMain.Controls.Add(this.cmbListennerIp);
            this.pnlMain.Controls.Add(this.lblListennerIp);
            this.pnlMain.Location = new System.Drawing.Point(12, 13);
            this.pnlMain.Margin = new System.Windows.Forms.Padding(3, 4, 3, 4);
            this.pnlMain.Name = "pnlMain";
            this.pnlMain.Size = new System.Drawing.Size(723, 407);
            this.pnlMain.TabIndex = 0;
            // 
            // lblKey
            // 
            this.lblKey.AutoSize = true;
            this.lblKey.Location = new System.Drawing.Point(3, 44);
            this.lblKey.Name = "lblKey";
            this.lblKey.Size = new System.Drawing.Size(98, 17);
            this.lblKey.TabIndex = 4;
            this.lblKey.Text = "Pre-shared key:";
            // 
            // txtKey
            // 
            this.txtKey.BackColor = System.Drawing.Color.FromArgb(((int)(((byte)(224)))), ((int)(((byte)(224)))), ((int)(((byte)(224)))));
            this.txtKey.ForeColor = System.Drawing.Color.FromArgb(((int)(((byte)(32)))), ((int)(((byte)(32)))), ((int)(((byte)(32)))));
            this.txtKey.Location = new System.Drawing.Point(107, 41);
            this.txtKey.Margin = new System.Windows.Forms.Padding(3, 4, 3, 4);
            this.txtKey.Name = "txtKey";
            this.txtKey.Size = new System.Drawing.Size(286, 25);
            this.txtKey.TabIndex = 5;
            this.txtKey.UseSystemPasswordChar = true;
            // 
            // txtListennerPort
            // 
            this.txtListennerPort.BackColor = System.Drawing.Color.FromArgb(((int)(((byte)(224)))), ((int)(((byte)(224)))), ((int)(((byte)(224)))));
            this.txtListennerPort.ForeColor = System.Drawing.Color.FromArgb(((int)(((byte)(32)))), ((int)(((byte)(32)))), ((int)(((byte)(32)))));
            this.txtListennerPort.Location = new System.Drawing.Point(314, 4);
            this.txtListennerPort.Margin = new System.Windows.Forms.Padding(3, 4, 3, 4);
            this.txtListennerPort.Maximum = new decimal(new int[] {
            65534,
            0,
            0,
            0});
            this.txtListennerPort.Minimum = new decimal(new int[] {
            1,
            0,
            0,
            0});
            this.txtListennerPort.Name = "txtListennerPort";
            this.txtListennerPort.Size = new System.Drawing.Size(79, 25);
            this.txtListennerPort.TabIndex = 3;
            this.txtListennerPort.Value = new decimal(new int[] {
            5810,
            0,
            0,
            0});
            // 
            // lblPort
            // 
            this.lblPort.AutoSize = true;
            this.lblPort.Location = new System.Drawing.Point(273, 7);
            this.lblPort.Name = "lblPort";
            this.lblPort.Size = new System.Drawing.Size(35, 17);
            this.lblPort.TabIndex = 2;
            this.lblPort.Text = "Port:";
            // 
            // cmbListennerIp
            // 
            this.cmbListennerIp.BackColor = System.Drawing.Color.FromArgb(((int)(((byte)(224)))), ((int)(((byte)(224)))), ((int)(((byte)(224)))));
            this.cmbListennerIp.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
            this.cmbListennerIp.ForeColor = System.Drawing.Color.FromArgb(((int)(((byte)(32)))), ((int)(((byte)(32)))), ((int)(((byte)(32)))));
            this.cmbListennerIp.FormattingEnabled = true;
            this.cmbListennerIp.Location = new System.Drawing.Point(107, 4);
            this.cmbListennerIp.Margin = new System.Windows.Forms.Padding(3, 4, 3, 4);
            this.cmbListennerIp.Name = "cmbListennerIp";
            this.cmbListennerIp.Size = new System.Drawing.Size(152, 25);
            this.cmbListennerIp.TabIndex = 1;
            // 
            // lblListennerIp
            // 
            this.lblListennerIp.AutoSize = true;
            this.lblListennerIp.Location = new System.Drawing.Point(3, 7);
            this.lblListennerIp.Name = "lblListennerIp";
            this.lblListennerIp.Size = new System.Drawing.Size(77, 17);
            this.lblListennerIp.TabIndex = 0;
            this.lblListennerIp.Text = "Listenner IP:";
            // 
            // btnApply
            // 
            this.btnApply.Anchor = ((System.Windows.Forms.AnchorStyles)((((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Bottom) 
            | System.Windows.Forms.AnchorStyles.Left) 
            | System.Windows.Forms.AnchorStyles.Right)));
            this.btnApply.BackColor = System.Drawing.Color.FromArgb(((int)(((byte)(224)))), ((int)(((byte)(224)))), ((int)(((byte)(224)))));
            this.btnApply.ForeColor = System.Drawing.Color.FromArgb(((int)(((byte)(32)))), ((int)(((byte)(32)))), ((int)(((byte)(32)))));
            this.btnApply.Location = new System.Drawing.Point(576, 428);
            this.btnApply.Margin = new System.Windows.Forms.Padding(3, 4, 3, 4);
            this.btnApply.Name = "btnApply";
            this.btnApply.Size = new System.Drawing.Size(75, 30);
            this.btnApply.TabIndex = 1;
            this.btnApply.Text = "Apply";
            this.btnApply.UseVisualStyleBackColor = false;
            this.btnApply.Click += new System.EventHandler(this.btnApply_Click);
            // 
            // TrayIcon
            // 
            this.TrayIcon.ContextMenuStrip = this.TrayMenu;
            this.TrayIcon.Visible = true;
            this.TrayIcon.MouseDoubleClick += new System.Windows.Forms.MouseEventHandler(this.TrayIcon_MouseDoubleClick);
            // 
            // TrayMenu
            // 
            this.TrayMenu.BackColor = System.Drawing.Color.FromArgb(((int)(((byte)(64)))), ((int)(((byte)(64)))), ((int)(((byte)(64)))));
            this.TrayMenu.ImageScalingSize = new System.Drawing.Size(20, 20);
            this.TrayMenu.Items.AddRange(new System.Windows.Forms.ToolStripItem[] {
            this.recentsToolStripMenuItem,
            this.toolStripMenuItem1,
            this.optionsToolStripMenuItem,
            this.exitToolStripMenuItem});
            this.TrayMenu.Name = "TrayMenu";
            this.TrayMenu.RenderMode = System.Windows.Forms.ToolStripRenderMode.System;
            this.TrayMenu.Size = new System.Drawing.Size(133, 88);
            // 
            // recentsToolStripMenuItem
            // 
            this.recentsToolStripMenuItem.Enabled = false;
            this.recentsToolStripMenuItem.Font = new System.Drawing.Font("Segoe UI", 11.25F);
            this.recentsToolStripMenuItem.ForeColor = System.Drawing.Color.FromArgb(((int)(((byte)(224)))), ((int)(((byte)(224)))), ((int)(((byte)(224)))));
            this.recentsToolStripMenuItem.Image = global::Protest_RA.Properties.Resources.recent24;
            this.recentsToolStripMenuItem.Name = "recentsToolStripMenuItem";
            this.recentsToolStripMenuItem.Size = new System.Drawing.Size(132, 26);
            this.recentsToolStripMenuItem.Text = "Recents";
            // 
            // toolStripMenuItem1
            // 
            this.toolStripMenuItem1.Name = "toolStripMenuItem1";
            this.toolStripMenuItem1.Size = new System.Drawing.Size(129, 6);
            // 
            // optionsToolStripMenuItem
            // 
            this.optionsToolStripMenuItem.Font = new System.Drawing.Font("Segoe UI", 11.25F, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            this.optionsToolStripMenuItem.ForeColor = System.Drawing.Color.FromArgb(((int)(((byte)(224)))), ((int)(((byte)(224)))), ((int)(((byte)(224)))));
            this.optionsToolStripMenuItem.Image = global::Protest_RA.Properties.Resources.icon24;
            this.optionsToolStripMenuItem.Name = "optionsToolStripMenuItem";
            this.optionsToolStripMenuItem.Size = new System.Drawing.Size(132, 26);
            this.optionsToolStripMenuItem.Text = "Options";
            this.optionsToolStripMenuItem.Click += new System.EventHandler(this.optionsToolStripMenuItem_Click);
            // 
            // exitToolStripMenuItem
            // 
            this.exitToolStripMenuItem.Font = new System.Drawing.Font("Segoe UI", 11.25F, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            this.exitToolStripMenuItem.ForeColor = System.Drawing.Color.FromArgb(((int)(((byte)(224)))), ((int)(((byte)(224)))), ((int)(((byte)(224)))));
            this.exitToolStripMenuItem.Image = global::Protest_RA.Properties.Resources.close24;
            this.exitToolStripMenuItem.Name = "exitToolStripMenuItem";
            this.exitToolStripMenuItem.Size = new System.Drawing.Size(132, 26);
            this.exitToolStripMenuItem.Text = "Exit";
            this.exitToolStripMenuItem.Click += new System.EventHandler(this.exitToolStripMenuItem_Click);
            // 
            // tmrAutoHide
            // 
            this.tmrAutoHide.Enabled = true;
            this.tmrAutoHide.Interval = 10;
            this.tmrAutoHide.Tick += new System.EventHandler(this.tmrAutoHide_Tick);
            // 
            // btnClose
            // 
            this.btnClose.Anchor = ((System.Windows.Forms.AnchorStyles)((((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Bottom) 
            | System.Windows.Forms.AnchorStyles.Left) 
            | System.Windows.Forms.AnchorStyles.Right)));
            this.btnClose.BackColor = System.Drawing.Color.FromArgb(((int)(((byte)(224)))), ((int)(((byte)(224)))), ((int)(((byte)(224)))));
            this.btnClose.ForeColor = System.Drawing.Color.FromArgb(((int)(((byte)(32)))), ((int)(((byte)(32)))), ((int)(((byte)(32)))));
            this.btnClose.Location = new System.Drawing.Point(657, 428);
            this.btnClose.Margin = new System.Windows.Forms.Padding(3, 4, 3, 4);
            this.btnClose.Name = "btnClose";
            this.btnClose.Size = new System.Drawing.Size(78, 30);
            this.btnClose.TabIndex = 2;
            this.btnClose.Text = "Close";
            this.btnClose.UseVisualStyleBackColor = false;
            this.btnClose.Click += new System.EventHandler(this.btnClose_Click);
            // 
            // Main
            // 
            this.AutoScaleDimensions = new System.Drawing.SizeF(7F, 17F);
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            this.BackColor = System.Drawing.Color.FromArgb(((int)(((byte)(48)))), ((int)(((byte)(48)))), ((int)(((byte)(48)))));
            this.ClientSize = new System.Drawing.Size(747, 471);
            this.Controls.Add(this.btnClose);
            this.Controls.Add(this.btnApply);
            this.Controls.Add(this.pnlMain);
            this.Font = new System.Drawing.Font("Segoe UI", 9.75F, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            this.ForeColor = System.Drawing.Color.FromArgb(((int)(((byte)(224)))), ((int)(((byte)(224)))), ((int)(((byte)(224)))));
            this.FormBorderStyle = System.Windows.Forms.FormBorderStyle.FixedDialog;
            this.Icon = ((System.Drawing.Icon)(resources.GetObject("$this.Icon")));
            this.Margin = new System.Windows.Forms.Padding(3, 4, 3, 4);
            this.MaximizeBox = false;
            this.Name = "Main";
            this.Opacity = 0D;
            this.ShowInTaskbar = false;
            this.Text = "Pro-test Remote Agent";
            this.FormClosing += new System.Windows.Forms.FormClosingEventHandler(this.Main_Closing);
            this.pnlMain.ResumeLayout(false);
            this.pnlMain.PerformLayout();
            ((System.ComponentModel.ISupportInitialize)(this.txtListennerPort)).EndInit();
            this.TrayMenu.ResumeLayout(false);
            this.ResumeLayout(false);

        }

        #endregion

        private System.Windows.Forms.Panel pnlMain;
        private System.Windows.Forms.Button btnApply;
        public System.Windows.Forms.NotifyIcon TrayIcon;
        private System.Windows.Forms.ContextMenuStrip TrayMenu;
        private System.Windows.Forms.ToolStripMenuItem optionsToolStripMenuItem;
        private System.Windows.Forms.ToolStripMenuItem exitToolStripMenuItem;
        private System.Windows.Forms.Timer tmrAutoHide;
        private System.Windows.Forms.Button btnClose;
        private System.Windows.Forms.Label lblPort;
        private System.Windows.Forms.ComboBox cmbListennerIp;
        private System.Windows.Forms.Label lblListennerIp;
        private System.Windows.Forms.NumericUpDown txtListennerPort;
        private System.Windows.Forms.Label lblKey;
        private System.Windows.Forms.TextBox txtKey;
        public System.Windows.Forms.ToolStripMenuItem recentsToolStripMenuItem;
        private System.Windows.Forms.ToolStripSeparator toolStripMenuItem1;
    }
}


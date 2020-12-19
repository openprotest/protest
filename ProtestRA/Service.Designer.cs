namespace Protest_RA {
    partial class Service {
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

        #region Component Designer generated code

        /// <summary> 
        /// Required method for Designer support - do not modify 
        /// the contents of this method with the code editor.
        /// </summary>
        private void InitializeComponent() {
            this.chkEnable = new System.Windows.Forms.CheckBox();
            this.lblExe = new System.Windows.Forms.Label();
            this.txtExe = new System.Windows.Forms.TextBox();
            this.lblParam = new System.Windows.Forms.Label();
            this.txtParam = new System.Windows.Forms.TextBox();
            this.lblPassword = new System.Windows.Forms.Label();
            this.btnExe = new System.Windows.Forms.Button();
            this.txtPassword = new System.Windows.Forms.TextBox();
            this.txtUsername = new System.Windows.Forms.TextBox();
            this.lblUsername = new System.Windows.Forms.Label();
            this.SuspendLayout();
            // 
            // chkEnable
            // 
            this.chkEnable.AutoSize = true;
            this.chkEnable.Checked = true;
            this.chkEnable.CheckState = System.Windows.Forms.CheckState.Checked;
            this.chkEnable.Location = new System.Drawing.Point(6, 3);
            this.chkEnable.Name = "chkEnable";
            this.chkEnable.Size = new System.Drawing.Size(66, 21);
            this.chkEnable.TabIndex = 0;
            this.chkEnable.Text = "Enable";
            this.chkEnable.UseVisualStyleBackColor = true;
            this.chkEnable.CheckedChanged += new System.EventHandler(this.chkEnable_CheckedChanged);
            // 
            // lblExe
            // 
            this.lblExe.AutoSize = true;
            this.lblExe.Font = new System.Drawing.Font("Segoe UI", 9F, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            this.lblExe.Location = new System.Drawing.Point(3, 36);
            this.lblExe.Name = "lblExe";
            this.lblExe.Size = new System.Drawing.Size(67, 15);
            this.lblExe.TabIndex = 1;
            this.lblExe.Text = "Executable:";
            // 
            // txtExe
            // 
            this.txtExe.Anchor = ((System.Windows.Forms.AnchorStyles)(((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Left) 
            | System.Windows.Forms.AnchorStyles.Right)));
            this.txtExe.AutoCompleteMode = System.Windows.Forms.AutoCompleteMode.SuggestAppend;
            this.txtExe.AutoCompleteSource = System.Windows.Forms.AutoCompleteSource.FileSystem;
            this.txtExe.Location = new System.Drawing.Point(112, 31);
            this.txtExe.Name = "txtExe";
            this.txtExe.Size = new System.Drawing.Size(382, 25);
            this.txtExe.TabIndex = 3;
            // 
            // lblParam
            // 
            this.lblParam.AutoSize = true;
            this.lblParam.Font = new System.Drawing.Font("Segoe UI", 9F, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            this.lblParam.Location = new System.Drawing.Point(3, 67);
            this.lblParam.Name = "lblParam";
            this.lblParam.Size = new System.Drawing.Size(69, 15);
            this.lblParam.TabIndex = 2;
            this.lblParam.Text = "Arguments:";
            // 
            // txtParam
            // 
            this.txtParam.Anchor = ((System.Windows.Forms.AnchorStyles)(((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Left) 
            | System.Windows.Forms.AnchorStyles.Right)));
            this.txtParam.Location = new System.Drawing.Point(112, 62);
            this.txtParam.Name = "txtParam";
            this.txtParam.Size = new System.Drawing.Size(382, 25);
            this.txtParam.TabIndex = 5;
            // 
            // lblPassword
            // 
            this.lblPassword.AutoSize = true;
            this.lblPassword.Font = new System.Drawing.Font("Segoe UI", 9F, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            this.lblPassword.Location = new System.Drawing.Point(3, 129);
            this.lblPassword.Name = "lblPassword";
            this.lblPassword.Size = new System.Drawing.Size(103, 15);
            this.lblPassword.TabIndex = 7;
            this.lblPassword.Text = "General password:";
            // 
            // btnExe
            // 
            this.btnExe.Anchor = ((System.Windows.Forms.AnchorStyles)((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right)));
            this.btnExe.BackColor = System.Drawing.SystemColors.Control;
            this.btnExe.ForeColor = System.Drawing.Color.Black;
            this.btnExe.Location = new System.Drawing.Point(500, 31);
            this.btnExe.Name = "btnExe";
            this.btnExe.Size = new System.Drawing.Size(32, 25);
            this.btnExe.TabIndex = 4;
            this.btnExe.Text = "...";
            this.btnExe.UseVisualStyleBackColor = false;
            this.btnExe.Click += new System.EventHandler(this.btnExe_Click);
            // 
            // txtPassword
            // 
            this.txtPassword.Location = new System.Drawing.Point(112, 124);
            this.txtPassword.Name = "txtPassword";
            this.txtPassword.Size = new System.Drawing.Size(150, 25);
            this.txtPassword.TabIndex = 9;
            this.txtPassword.UseSystemPasswordChar = true;
            // 
            // txtUsername
            // 
            this.txtUsername.Location = new System.Drawing.Point(112, 93);
            this.txtUsername.Name = "txtUsername";
            this.txtUsername.Size = new System.Drawing.Size(150, 25);
            this.txtUsername.TabIndex = 8;
            // 
            // lblUsername
            // 
            this.lblUsername.AutoSize = true;
            this.lblUsername.Font = new System.Drawing.Font("Segoe UI", 9F, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            this.lblUsername.Location = new System.Drawing.Point(3, 98);
            this.lblUsername.Name = "lblUsername";
            this.lblUsername.Size = new System.Drawing.Size(63, 15);
            this.lblUsername.TabIndex = 6;
            this.lblUsername.Text = "Username:";
            // 
            // Service
            // 
            this.AutoScaleDimensions = new System.Drawing.SizeF(7F, 17F);
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            this.Controls.Add(this.txtUsername);
            this.Controls.Add(this.lblUsername);
            this.Controls.Add(this.txtPassword);
            this.Controls.Add(this.btnExe);
            this.Controls.Add(this.lblPassword);
            this.Controls.Add(this.txtParam);
            this.Controls.Add(this.lblParam);
            this.Controls.Add(this.txtExe);
            this.Controls.Add(this.lblExe);
            this.Controls.Add(this.chkEnable);
            this.Font = new System.Drawing.Font("Segoe UI", 9.75F, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            this.Margin = new System.Windows.Forms.Padding(3, 5, 3, 5);
            this.Name = "Service";
            this.Size = new System.Drawing.Size(535, 195);
            this.ResumeLayout(false);
            this.PerformLayout();

        }

        #endregion

        public System.Windows.Forms.CheckBox chkEnable;
        public System.Windows.Forms.Label lblExe;
        public System.Windows.Forms.TextBox txtExe;
        public System.Windows.Forms.Label lblParam;
        public System.Windows.Forms.TextBox txtParam;
        public System.Windows.Forms.Label lblPassword;
        public System.Windows.Forms.Button btnExe;
        public System.Windows.Forms.TextBox txtPassword;
        public System.Windows.Forms.TextBox txtUsername;
        public System.Windows.Forms.Label lblUsername;
    }
}

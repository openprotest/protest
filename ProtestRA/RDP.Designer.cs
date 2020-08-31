using System;

partial class RDP
{
    /// <summary>
    /// Required designer variable.
    /// </summary>
    private System.ComponentModel.IContainer components = null;

    /// <summary>
    /// Clean up any resources being used.
    /// </summary>
    /// <param name="disposing">true if managed resources should be disposed; otherwise, false.</param>
    protected override void Dispose(bool disposing)
    {
        if (disposing && (components != null))
        {
            components.Dispose();
        }
        base.Dispose(disposing);
    }

    #region Windows Form Designer generated code

        /// <summary>
        /// Required method for Designer support - do not modify
        /// the contents of this method with the code editor.
        /// </summary>
        private void InitializeComponent()
        {
            this.components = new System.ComponentModel.Container();
            System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(RDP));
            this.mstsc = new AxMSTSCLib.AxMsTscAxNotSafeForScripting();
            this.tmrDelayedConnect = new System.Windows.Forms.Timer(this.components);
            ((System.ComponentModel.ISupportInitialize)(this.mstsc)).BeginInit();
            this.SuspendLayout();
            // 
            // mstsc
            // 
            this.mstsc.Dock = System.Windows.Forms.DockStyle.Fill;
            this.mstsc.Enabled = true;
            this.mstsc.Location = new System.Drawing.Point(0, 0);
            this.mstsc.Name = "mstsc";
            this.mstsc.OcxState = ((System.Windows.Forms.AxHost.State)(resources.GetObject("mstsc.OcxState")));
            this.mstsc.Size = new System.Drawing.Size(1280, 960);
            this.mstsc.TabIndex = 0;
            this.mstsc.OnDisconnected += new AxMSTSCLib.IMsTscAxEvents_OnDisconnectedEventHandler(this.mstsc_Disconnect);
            // 
            // tmrDelayedConnect
            // 
            this.tmrDelayedConnect.Enabled = true;
            this.tmrDelayedConnect.Tick += new System.EventHandler(this.tmrDelayedConnect_Tick);
            // 
            // RDP
            // 
            this.AutoScaleDimensions = new System.Drawing.SizeF(6F, 13F);
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            this.ClientSize = new System.Drawing.Size(1280, 960);
            this.Controls.Add(this.mstsc);
            this.Icon = ((System.Drawing.Icon)(resources.GetObject("$this.Icon")));
            this.Name = "RDP";
            this.Text = "RDP client";
            ((System.ComponentModel.ISupportInitialize)(this.mstsc)).EndInit();
            this.ResumeLayout(false);

        }

        #endregion

    private AxMSTSCLib.AxMsTscAxNotSafeForScripting mstsc;
    private System.Windows.Forms.Timer tmrDelayedConnect;
}
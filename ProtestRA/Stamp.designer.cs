    partial class Stamp {
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
            this.tmrFollow = new System.Windows.Forms.Timer(this.components);
            this.SuspendLayout();
            // 
            // tmrFollow
            // 
            this.tmrFollow.Enabled = true;
            this.tmrFollow.Interval = 16;
            this.tmrFollow.Tick += new System.EventHandler(this.TmrFollow_Tick);
            // 
            // Stamp
            // 
            this.AutoScaleDimensions = new System.Drawing.SizeF(6F, 13F);
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            this.BackColor = System.Drawing.Color.Fuchsia;
            this.ClientSize = new System.Drawing.Size(192, 40);
            this.ControlBox = false;
            this.Cursor = System.Windows.Forms.Cursors.Cross;
            this.DoubleBuffered = true;
            this.FormBorderStyle = System.Windows.Forms.FormBorderStyle.None;
            this.MaximizeBox = false;
            this.MinimizeBox = false;
            this.Name = "Stamp";
            this.Opacity = 0.8D;
            this.RightToLeftLayout = true;
            this.ShowIcon = false;
            this.ShowInTaskbar = false;
            this.Text = "Stamp";
            this.TopMost = true;
            this.TransparencyKey = System.Drawing.Color.Fuchsia;
            this.MouseUp += new System.Windows.Forms.MouseEventHandler(this.Stamp_MouseUp);
            this.KeyDown += new System.Windows.Forms.KeyEventHandler(this.Stamp_KeyDown);
            this.Paint += new System.Windows.Forms.PaintEventHandler(this.Stamp_Paint);
            this.ResumeLayout(false);
    }

    #endregion

    private System.Windows.Forms.Timer tmrFollow;
}
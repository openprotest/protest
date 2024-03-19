namespace ProtestAgent {
    partial class Checkbox {
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
            this.SuspendLayout();
            // 
            // Button
            // 
            this.AutoScaleDimensions = new System.Drawing.SizeF(9F, 20F);
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            this.DoubleBuffered = true;
            this.Name = "Button";
            this.Size = new System.Drawing.Size(96, 32);
            this.Click += new System.EventHandler(this.Chackbox_Click);
            this.Paint += new System.Windows.Forms.PaintEventHandler(this.Chackbox_Paint);
            this.GotFocus += new System.EventHandler(this.Chackbox_GotFocus);
            this.KeyPress += new System.Windows.Forms.KeyPressEventHandler(this.Chackbox_KeyPress);
            this.LostFocus += new System.EventHandler(this.Chackbox_LostFocus);

            this.ResumeLayout(false);

        }

        #endregion
    }
}

namespace ProtestAgent {
    partial class TabsControl {
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
            // TabsControl
            // 
            this.AutoScaleDimensions = new System.Drawing.SizeF(6F, 13F);
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            this.DoubleBuffered = true;
            this.Margin = new System.Windows.Forms.Padding(2, 2, 2, 2);
            this.Name = "TabsControl";
            this.Size = new System.Drawing.Size(160, 40);
            this.Paint += new System.Windows.Forms.PaintEventHandler(this.TabsControl_Paint);
            this.GotFocus += new System.EventHandler(this.TabsControl_GotFocus);
            this.KeyPress += new System.Windows.Forms.KeyPressEventHandler(this.TabsControl_KeyPress);
            this.LostFocus += new System.EventHandler(this.TabsControl_LostFocus);
            this.MouseClick += new System.Windows.Forms.MouseEventHandler(this.TabsControl_MouseClick);
            this.MouseEnter += new System.EventHandler(this.TabsControl_MouseEnter);
            this.MouseLeave += new System.EventHandler(this.TabsControl_MouseLeave);
            this.ResumeLayout(false);

        }

        #endregion
    }
}

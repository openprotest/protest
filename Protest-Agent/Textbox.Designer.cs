namespace ProtestAgent {
    partial class Textbox {
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
            this.box = new System.Windows.Forms.TextBox();
            this.SuspendLayout();
            // 
            // box
            // 
            this.box.BackColor = System.Drawing.Color.Gray;
            this.box.BorderStyle = System.Windows.Forms.BorderStyle.None;
            this.box.Dock = System.Windows.Forms.DockStyle.Fill;
            this.box.ForeColor = System.Drawing.Color.FromArgb(((int)(((byte)(32)))), ((int)(((byte)(32)))), ((int)(((byte)(32)))));
            this.box.Location = new System.Drawing.Point(5, 3);
            this.box.Margin = new System.Windows.Forms.Padding(2, 2, 2, 2);
            this.box.Name = "box";
            this.box.Size = new System.Drawing.Size(57, 13);
            this.box.TabIndex = 0;
            this.box.GotFocus += new System.EventHandler(this.Box_GotFocus);
            this.box.LostFocus += new System.EventHandler(this.Box_LostFocus);
            // 
            // Textbox
            // 
            this.AutoScaleDimensions = new System.Drawing.SizeF(6F, 13F);
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            this.Controls.Add(this.box);
            this.Cursor = System.Windows.Forms.Cursors.IBeam;
            this.DoubleBuffered = true;
            this.Name = "Textbox";
            this.Padding = new System.Windows.Forms.Padding(5, 3, 5, 3);
            this.Size = new System.Drawing.Size(67, 21);
            this.Paint += new System.Windows.Forms.PaintEventHandler(this.Textbox_Paint);
            this.GotFocus += new System.EventHandler(this.Textbox_GotFocus);
            this.ResumeLayout(false);
            this.PerformLayout();

        }

        #endregion

        public System.Windows.Forms.TextBox box;
    }
}

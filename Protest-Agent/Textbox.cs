using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;

namespace ProtestAgent {
    public partial class Textbox : UserControl {
        private static readonly Pen selectPen = new Pen(Color.FromArgb(255, 102, 0), 2);
        private static readonly Pen outlinePen = new Pen(Color.FromArgb(128, 128, 128), 2);
        private static readonly SolidBrush backgroundBrush = new SolidBrush(Color.FromArgb(128, 128, 128));

        private GraphicsPath path;

        private bool isFocused = false;
        private bool Enable { set; get; } = true;

        public Textbox() {
            InitializeComponent();
        }

        public void SetEnable(bool enable) {
            Enable = enable;
            this.box.BackColor = enable ? Color.FromArgb(128, 128, 128) : Color.FromArgb(160, 160, 160);
            this.box.ForeColor = enable ? Color.FromArgb(32, 32, 32) : Color.FromArgb(160, 160, 160);
            this.box.Enabled = enable;
            this.Invalidate();
        }

        private void Textbox_GotFocus(object sender, System.EventArgs e) {
            box.Focus();
        }

        private void Box_GotFocus(object sender, System.EventArgs e) {
            isFocused = true;
            this.Invalidate();
        }
        private void Box_LostFocus(object sender, System.EventArgs e) {
            isFocused = false;
            this.Invalidate();
        }

        private void Textbox_Paint(object sender, PaintEventArgs e) {
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            e.Graphics.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAlias;

            if (path is null) {
                int radius = 4;
                int x = 2;
                int y = 2;
                int width = this.Width - 4;
                int height = this.Height - 4;

                path = new GraphicsPath();
                path.AddLine(x + radius, y, x + width - radius, y);
                path.AddArc(x + width - 2 * radius, y, 2 * radius, 2 * radius, 270, 90);
                path.AddLine(x + width, y + radius, x + width, y + height - radius);
                path.AddArc(x + width - 2 * radius, y + height - 2 * radius, 2 * radius, 2 * radius, 0, 90);
                path.AddLine(x + width - radius, y + height, x + radius, y + height);
                path.AddArc(x, y + height - 2 * radius, 2 * radius, 2 * radius, 90, 90);
                path.AddLine(x, y + height - radius, x, y + radius);
                path.AddArc(x, y, 2 * radius, 2 * radius, 180, 90);
                path.CloseFigure();
            }

            if (Enable) {
                e.Graphics.FillPath(backgroundBrush, path);
            }
            else {
                e.Graphics.DrawPath(outlinePen, path);
            }

            if (isFocused && Enable) {
                e.Graphics.DrawPath(selectPen, path);
            }
        }

    }
}

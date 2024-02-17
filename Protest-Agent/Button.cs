using System;
using System.Drawing;
using System.Drawing.Drawing2D;

using System.Windows.Forms;

namespace ProtestAgent {
    public partial class Button : UserControl {
        private static readonly Pen selectPen = new Pen(Color.FromArgb(255, 102, 0), 2);
        private static readonly SolidBrush backgroundBrush = new SolidBrush(Color.FromArgb(96, 96, 96));
        private static readonly SolidBrush backgroundHoverBrush = new SolidBrush(Color.FromArgb(112, 112, 112));
        private static readonly SolidBrush backgroundActiveBrush = new SolidBrush(Color.FromArgb(128, 128, 128));
        private static readonly SolidBrush foregroundBrush = new SolidBrush(Color.FromArgb(224, 224, 224));
        private static readonly StringFormat center = new StringFormat {
            Alignment = StringAlignment.Center,
            LineAlignment = StringAlignment.Center
        };

        private static Font font;
        private GraphicsPath path;

        public event EventHandler OnPressed;

        private bool isMouseOver = false;
        private bool isFocused = false;
        private bool isActive = false;

        public string Label { set; get; }

        public Button() {
            InitializeComponent();
            font = new Font(this.Font.FontFamily, 12, FontStyle.Bold);
        }

        private void Button_Click(object sender, EventArgs e) {
            if (OnPressed is null) return;
            OnPressed(sender, e);
        }

        private void Button_KeyPress(object sender, KeyPressEventArgs e) {
            if (OnPressed is null) return;
            if (e.KeyChar == '\r' || e.KeyChar == '\n' || e.KeyChar == ' ') {
                OnPressed(sender, new EventArgs());
            }
        }

        private void Button_MouseEnter(object sender, EventArgs e) {
            isMouseOver = true;
            this.Invalidate();
        }
        private void Button_MouseLeave(object sender, EventArgs e) {
            isMouseOver = false;
            this.Invalidate();
        }

        private void Button_GotFocus(object sender, EventArgs e) {
            isFocused = true;
            this.Invalidate();
        }
        private void Button_LostFocus(object sender, EventArgs e) {
            isFocused = false;
            this.Invalidate();
        }

        private void Button_MouseDown(object sender, MouseEventArgs e) {
            isActive = true;
            this.Invalidate();
        }
        private void Button_MouseUp(object sender, MouseEventArgs e) {
            isActive = false;
            this.Invalidate();
        }
        private void Button_KeyDown(object sender, KeyEventArgs e) {
            if (e.KeyCode == Keys.Enter || e.KeyCode == Keys.Space) {
                isActive = true;
                this.Invalidate();
            }
        }
        private void Button_KeyUp(object sender, KeyEventArgs e) {
            isActive = false;
            this.Invalidate();
        }

        private void Button_Paint(object sender, PaintEventArgs e) {
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

            if (isActive) {
                e.Graphics.FillPath(backgroundActiveBrush, path);
            }
            else if (isMouseOver) {
                e.Graphics.FillPath(backgroundHoverBrush, path);
            }
            else {
                e.Graphics.FillPath(backgroundBrush, path);
            }

            if (isFocused) {
                e.Graphics.DrawPath(selectPen, path);
            }

            e.Graphics.DrawString(this.Label, font, foregroundBrush, new Rectangle(0, 1, this.Width, this.Height), center);
        }
    }

}

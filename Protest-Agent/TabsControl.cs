using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;

namespace ProtestAgent {
    public partial class TabsControl : UserControl {
        private static readonly Pen selectPen = new Pen(Color.FromArgb(255, 102, 0), 2);
        private static readonly SolidBrush backgroundSelectBrush = new SolidBrush(Color.FromArgb(160,160,160));
        private static readonly SolidBrush backgroundDeselectBrush = new SolidBrush(Color.FromArgb(138, 138, 138));
        private static readonly SolidBrush foregroundBrush = new SolidBrush(Color.FromArgb(32,32,32));
        private static readonly LinearGradientBrush highlightGradient = new LinearGradientBrush(
                new Point(0, 0),
                new Point(160, 0),
                Color.FromArgb(64, 255, 255, 255),
                Color.FromArgb(0, 255, 255, 255)
            );

        private static readonly LinearGradientBrush shadowGradient = new LinearGradientBrush(
                new Point(140, 0),
                new Point(160, 0),
                Color.FromArgb(0, 16, 16, 16),
                Color.FromArgb(32, 16, 16, 16)
            );

        private static readonly StringFormat verticallyCenter = new StringFormat {
                Alignment = StringAlignment.Near,
                LineAlignment = StringAlignment.Center
        };
        
        private static Font font;
        private GraphicsPath path;

        public event EventHandler OnPressed;

        private bool isMouseOver = false;
        private bool isFocused = false;

        private bool Selected { set; get; }
        public Image Icon { set; get; }
        public string Label { set; get; }

        public TabsControl() {
            InitializeComponent();
            font = new Font(this.Font.FontFamily, 12, FontStyle.Bold);
        }

        public void SetSelection(bool select) {
            Selected = select;
            this.Invalidate();
        }

        private void TabsControl_MouseClick(object sender, MouseEventArgs e) {
            if (OnPressed is null) return;
            OnPressed(sender, e);
        }
        private void TabsControl_KeyPress(object sender, KeyPressEventArgs e) {
            if (OnPressed is null) return; 
            if (e.KeyChar == '\r' || e.KeyChar == '\n' || e.KeyChar == ' ') {
                OnPressed(sender, new EventArgs());
            }
        }

        private void TabsControl_MouseEnter(object sender, EventArgs e) {
            isMouseOver = true;
            this.Invalidate();
        }
        private void TabsControl_MouseLeave(object sender, EventArgs e) {
            isMouseOver = false;
            this.Invalidate();
        }

        private void TabsControl_GotFocus(object sender, EventArgs e) {
            isFocused = true;
            this.Invalidate();
        }
        private void TabsControl_LostFocus(object sender, EventArgs e) {
            isFocused = false;
            this.Invalidate();
        }

        private void TabsControl_Paint(object sender, PaintEventArgs e) {
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            e.Graphics.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAlias;

            if (path is null) {
                int radius = 8;
                int x = 2;
                int y = 2;
                int width = this.Width + 2;
                int height = this.Height - 4;

                path = new GraphicsPath();
                path.AddLine(x + radius, y, x + width, y);
                path.AddLine(x + width, y, x + width, y + height);
                path.AddLine(x + width, y + height, x + radius, y + height);
                path.AddArc(x, y + height - 2 * radius, 2 * radius, 2 * radius, 90, 90);
                path.AddLine(x, y + height - radius, x, y + radius);
                path.AddArc(x, y, 2 * radius, 2 * radius, 180, 90);
                path.CloseFigure();
            }

            if (Selected) {
                e.Graphics.FillPath(backgroundSelectBrush, path);
            } 
            else {
                e.Graphics.FillPath(backgroundDeselectBrush, path);
                e.Graphics.FillRectangle(shadowGradient, 141, 0, this.Width-20, this.Height);
            }

            if (isMouseOver) {
                e.Graphics.FillPath(highlightGradient, path);
            }

            if (isFocused) {
                e.Graphics.DrawPath(selectPen, path);
            }

            if (!(Icon is null)) {
                e.Graphics.DrawImage(Icon, 8, (this.Height - 32) / 2, 32, 32);
            }

            e.Graphics.DrawString(this.Label, font, foregroundBrush, new Rectangle(48,0, this.Width-48, this.Height), verticallyCenter);
        }
    }
}

using System;
using System.Drawing;
using System.Drawing.Drawing2D;

using System.Windows.Forms;

namespace ProtestAgent {
    public partial class Checkbox : UserControl {
        private static readonly Pen selectPen = new Pen(Color.FromArgb(255, 102, 0), 2);
        private static readonly SolidBrush backgroundBrush = new SolidBrush(Color.FromArgb(128, 128, 128));
        private static readonly SolidBrush foregroundBrush = new SolidBrush(Color.FromArgb(32, 32, 32));
        private static readonly SolidBrush onBrush = new SolidBrush(Color.FromArgb(255, 102, 0));
        private static readonly SolidBrush offBrush = new SolidBrush(Color.FromArgb(88, 88, 88));

        private GraphicsPath path;
        private GraphicsPath pathOn;
        private GraphicsPath pathOff;

        public event EventHandler OnChange;

        private bool isFocused = false;

        public string Label { set; get; }

        private bool _value;

        public bool Value {
            get { return _value; }
            set {
                _value = value;
                Invalidate();
            }
        }

        public Checkbox() {
            if (path is null) {
                int radius = 4;
                int x = 2;
                int y = 2;
                int width = 32;
                int height = 18;

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

            if (pathOn is null) {
                int radius = 4;
                int x = 16;
                int y = 4;
                int width = 16;
                int height = 14;

                pathOn = new GraphicsPath();
                pathOn.AddLine(x + radius, y, x + width - radius, y);
                pathOn.AddArc(x + width - 2 * radius, y, 2 * radius, 2 * radius, 270, 90);
                pathOn.AddLine(x + width, y + radius, x + width, y + height - radius);
                pathOn.AddArc(x + width - 2 * radius, y + height - 2 * radius, 2 * radius, 2 * radius, 0, 90);
                pathOn.AddLine(x + width - radius, y + height, x + radius, y + height);
                pathOn.AddArc(x, y + height - 2 * radius, 2 * radius, 2 * radius, 90, 90);
                pathOn.AddLine(x, y + height - radius, x, y + radius);
                pathOn.AddArc(x, y, 2 * radius, 2 * radius, 180, 90);
                pathOn.CloseFigure();
            }

            if (pathOff is null) {
                int radius = 4;
                int x = 4;
                int y = 4;
                int width = 16;
                int height = 14;

                pathOff = new GraphicsPath();
                pathOff.AddLine(x + radius, y, x + width - radius, y);
                pathOff.AddArc(x + width - 2 * radius, y, 2 * radius, 2 * radius, 270, 90);
                pathOff.AddLine(x + width, y + radius, x + width, y + height - radius);
                pathOff.AddArc(x + width - 2 * radius, y + height - 2 * radius, 2 * radius, 2 * radius, 0, 90);
                pathOff.AddLine(x + width - radius, y + height, x + radius, y + height);
                pathOff.AddArc(x, y + height - 2 * radius, 2 * radius, 2 * radius, 90, 90);
                pathOff.AddLine(x, y + height - radius, x, y + radius);
                pathOff.AddArc(x, y, 2 * radius, 2 * radius, 180, 90);
                pathOff.CloseFigure();
            }

            InitializeComponent();
        }

        private void Chackbox_Click(object sender, EventArgs e) {
            _value = !_value;
            this.Invalidate();

            if (OnChange is null) return;
            OnChange(sender, e);
        }

        private void Chackbox_KeyPress(object sender, KeyPressEventArgs e) {
            if (e.KeyChar == '\r' || e.KeyChar == '\n' || e.KeyChar == ' ') {
                _value = !_value;
                this.Invalidate();

                if (OnChange is null) return;
                OnChange(sender, new EventArgs());
            }
        }

        private void Chackbox_GotFocus(object sender, EventArgs e) {
            isFocused = true;
            this.Invalidate();
        }
        private void Chackbox_LostFocus(object sender, EventArgs e) {
            isFocused = false;
            this.Invalidate();
        }

        private void Chackbox_Paint(object sender, PaintEventArgs e) {
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            e.Graphics.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAlias;

            e.Graphics.FillPath(backgroundBrush, path);

            if (_value) {
                e.Graphics.FillPath(onBrush, pathOn);
            }
            else {
                e.Graphics.FillPath(offBrush, pathOff);
            }

            if (isFocused) {
                e.Graphics.DrawPath(selectPen, path);
            }

            e.Graphics.DrawString(this.Label, this.Font, foregroundBrush, 40, 1);
        }
    }

}

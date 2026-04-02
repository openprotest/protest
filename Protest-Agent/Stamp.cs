using System;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Windows.Forms;

public partial class Stamp : Form {
    static readonly Pen outline = new Pen(Color.FromArgb(232, 118, 0), 4);
    static readonly Pen cross = new Pen(Color.Black, 4);

    private protected string strokes = String.Empty;
    private protected int progress = 0;

    [StructLayout(LayoutKind.Sequential)]
    private struct INPUT {
        public uint type;
        public MOUSEINPUT mi;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MOUSEINPUT {
        public int dx;
        public int dy;
        public uint mouseData;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    private const uint INPUT_MOUSE = 0;
    private const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    private const uint MOUSEEVENTF_LEFTUP = 0x0004;

    [DllImport("user32.dll", SetLastError = true)]

    private static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);


    private static void SimulateLeftClick(int x, int y) {
        INPUT[] inputs = new INPUT[2];
        inputs[0].type = INPUT_MOUSE;
        inputs[0].mi.dx = 0;
        inputs[0].mi.dy = 0;
        inputs[0].mi.mouseData = 0;
        inputs[0].mi.dwFlags = MOUSEEVENTF_LEFTDOWN;
        inputs[0].mi.time = 0;

        inputs[0].mi.dwExtraInfo = IntPtr.Zero;
        inputs[1].type = INPUT_MOUSE;
        inputs[1].mi.dx = 0;
        inputs[1].mi.dy = 0;
        inputs[1].mi.mouseData = 0;
        inputs[1].mi.dwFlags = MOUSEEVENTF_LEFTUP;
        inputs[1].mi.time = 0;
        inputs[1].mi.dwExtraInfo = IntPtr.Zero;

        Cursor.Position = new Point(x, y);
        SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(INPUT)));
    }

    public Stamp(string keystroke) {
        InitializeComponent();
        this.strokes = keystroke;
    }

    private void TmrFollow_Tick(object sender, EventArgs e) {
        this.Left = Cursor.Position.X - 95;
        this.Top = Cursor.Position.Y - 19;
    }

    private void Stamp_MouseUp(object sender, MouseEventArgs e) {
        if (progress > 0) {
            return;
        }

        if (e.Button == MouseButtons.Left) {
            progress = 100;
            this.Refresh();

            int x = Cursor.Position.X;
            int y = Cursor.Position.Y;
            System.Threading.Thread.Sleep(1);
            SimulateLeftClick(x, y);

            System.Threading.Thread.Sleep(50);

            for (int i = 0; i < strokes.Length && strokes.Length > 0; i++) {
                if (char.IsLetterOrDigit(strokes[i])) {
                    SendKeys.SendWait(strokes[i].ToString());
                }
                else if (strokes[i] == ' ') {
                    SendKeys.SendWait(" ");
                }
                else {
                    SendKeys.SendWait("{" + strokes[i] + "}");
                }

                System.Threading.Thread.Sleep(2);
                progress = 1 + (100 - 100 * i / strokes.Length);
                this.Refresh();
            }

            Application.Exit();
        }
    }
    private void Stamp_KeyDown(object sender, KeyEventArgs e) {
        if (e.KeyCode == Keys.Escape) {
            strokes = String.Empty;
            this.Close();
        }
    }

    private void Stamp_Paint(object sender, PaintEventArgs e) {
        if (progress == 0) {
            e.Graphics.DrawRectangle(outline, 4, 6, 184, 28);

            e.Graphics.DrawLine(cross, 96, 6, 96, 34);
            e.Graphics.DrawLine(cross, 82, 20, 110, 20);
            e.Graphics.FillRectangle(Brushes.Black, 91, 15, 10, 10);
        }
        else {
            int w = progress * 2;
            int x = (this.Width - w) / 2;
            e.Graphics.DrawRectangle(outline, x , 36, w, 2);
        }
    }

}

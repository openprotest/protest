using System;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Windows.Forms;

public partial class Stamp : Form {
    static readonly Pen outline = new Pen(Color.FromArgb(232, 118, 0), 4);
    static readonly Pen cross = new Pen(Color.Black, 4);

    private protected string strokes = String.Empty;
    private protected int progress = 0;


    [DllImport("user32.dll", CharSet = CharSet.Auto, CallingConvention = CallingConvention.StdCall)]
    public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint cButtons, uint dwExtraInfo);

    private const int MOUSEEVENTF_LEFTDOWN = 0x02;
    private const int MOUSEEVENTF_LEFTUP = 0x04;

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

            uint x = (uint)Cursor.Position.X;
            uint y = (uint)Cursor.Position.Y;
            System.Threading.Thread.Sleep(1);
            mouse_event(MOUSEEVENTF_LEFTDOWN | MOUSEEVENTF_LEFTUP, x, y, 0, 0);

            System.Threading.Thread.Sleep(50);

            string escaped = String.Empty;
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

            escaped = String.Empty;
            strokes = String.Empty;

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

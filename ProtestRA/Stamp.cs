using System;
using System.Drawing;
using System.Linq;
using System.Runtime.InteropServices;
using System.Windows.Forms;

public partial class Stamp : Form {
    static Pen outline = new Pen(Color.FromArgb(232, 118, 0), 4);
    static Pen cross = new Pen(Color.Black, 4);

    private protected string strokes = "";

    [DllImport("user32.dll", CharSet = CharSet.Auto, CallingConvention = CallingConvention.StdCall)]
    public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint cButtons, uint dwExtraInfo);

    private const int MOUSEEVENTF_LEFTDOWN = 0x02;
    private const int MOUSEEVENTF_LEFTUP = 0x04;

    public Stamp() {
        InitializeComponent();
    }

    public void setKeystroke(string keystroke) {
        this.strokes = keystroke;
        this.Show();
    }

    private void TmrFollow_Tick(object sender, EventArgs e) {
        this.Left = Cursor.Position.X - 96;
        this.Top = Cursor.Position.Y - 20;
    }

    private void Stamp_MouseUp(object sender, MouseEventArgs e) {
        if (e.Button == MouseButtons.Left) {
            this.Hide();

            uint X = (uint)Cursor.Position.X;
            uint Y = (uint)Cursor.Position.Y;
            System.Threading.Thread.Sleep(1);
            mouse_event(MOUSEEVENTF_LEFTDOWN | MOUSEEVENTF_LEFTUP, X, Y, 0, 0);

            System.Threading.Thread.Sleep(1);
            SendKeys.SendWait(strokes);
            strokes = "";
        }
    }
    private void Stamp_KeyDown(object sender, KeyEventArgs e) {
        if (e.KeyCode == Keys.Escape) {
            this.Hide();
            strokes = "";
        }
    }
    
    private void Stamp_Paint(object sender, PaintEventArgs e) {
        e.Graphics.DrawRectangle(outline, 4, 6, 184, 28);
               
        e.Graphics.DrawLine(cross, 96, 6, 96, 34);
        e.Graphics.DrawLine(cross, 82, 20, 110, 20);
        e.Graphics.FillRectangle(Brushes.Black, 91, 15, 10, 10);
    }

}

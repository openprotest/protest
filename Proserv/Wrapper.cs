using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.ServiceProcess;
using System.Text;

namespace Proserv {
    public partial class Wrapper : ServiceBase {

        Process protest = null;
        public static string DIR_PROTEST  = $"{AppDomain.CurrentDomain.BaseDirectory}protest";
        public static string DIR_LOG      = $"{AppDomain.CurrentDomain.BaseDirectory}protest\\log";
        public static string FILE_PROTEST = $"{AppDomain.CurrentDomain.BaseDirectory}protest.exe";
        public static string FILE_LOG     = $"{AppDomain.CurrentDomain.BaseDirectory}protest\\log\\service.log";

        public Wrapper() {
            InitializeComponent();
        }

        protected override void OnStart(string[] args) {
            try {
                DirectoryInfo dirProtest = new DirectoryInfo(DIR_PROTEST);
                DirectoryInfo dirLog = new DirectoryInfo(DIR_LOG);
                if (!dirProtest.Exists) dirProtest.Create();
                if (!dirLog.Exists) dirLog.Create();
            } catch {}

            Log("Service started");

            RunProtest();
            //this.Stop();
        }

        protected override void OnPause() {
            Log("Service paused");
            KillProtest();
            base.OnPause();
        }

        protected override void OnContinue() {
            Log("Service resumed");
            RunProtest();
            base.OnContinue();
        }

        protected override void OnShutdown() {
            Log("System is shutting down");
            KillProtest();
            base.OnShutdown();
        }

        protected override void OnStop() {
            Log("Service stoped");
            KillProtest();
        }


        private void RunProtest() {
            File.WriteAllText("C:\\log.log", DIR_PROTEST);

            try {

                this.protest = Process.Start(FILE_PROTEST);

            } catch (Exception ex) {
                this.protest = null;
                Log(ex.Message);
            }
        }

        private void KillProtest() {
            if (this.protest is null) return;

            try {

                this.protest.Kill();

            } catch (Exception ex) {
                Log(ex.Message);
            } finally {
                this.protest = null;
            }
        }

        private void Log(string action) {
            string msg = $"{DateTime.Now,-24:yyyy-MM-dd HH:mm:ss}{action}";
            try {
                StreamWriter writer = new StreamWriter(FILE_LOG, true, Encoding.UTF8);
                writer.WriteLine(msg);
                writer.Close();
            } catch { }
        }


    }
}

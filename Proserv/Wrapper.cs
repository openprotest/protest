using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Diagnostics;
using System.Linq;
using System.ServiceProcess;
using System.Text;
using System.Threading.Tasks;

namespace Proserv {
    public partial class Wrapper : ServiceBase {
        public Wrapper() {
            InitializeComponent();
        }

        protected override void OnStart(string[] args) {
            //TODO:
            this.Stop();
        }

        protected override void OnPause() {
            base.OnPause();
        }

        protected override void OnContinue() {
            base.OnContinue();
        }

        protected override void OnShutdown() {
            base.OnShutdown();
        }

        protected override void OnStop() {
        }

    }
}

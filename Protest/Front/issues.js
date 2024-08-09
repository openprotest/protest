class Issues extends List {
	constructor() {
		super();

		this.AddCssDependencies("list.css");

		const columns = ["host", "category", "issue", "last update"];
		this.SetupColumns(columns);

		this.columnsOptions.style.display = "none";

		this.SetTitle("Issues");
		this.SetIcon("mono/issues.svg");

		this.LinkData({data:[], length:0 });

		this.SetupToolbar();
		this.reloadButton = this.AddToolbarButton("Reload", "mono/restart.svg?light");
		this.scanButton = this.AddToolbarButton("Scan network", "mono/scannet.svg?light");
		this.toolbar.appendChild(this.AddToolbarSeparator());
		const filterButton = this.SetupFilter();
		this.SetupFind();

		this.scanButton.onclick = () => this.ScanDialog();
	
		this.UpdateAuthorization();
		this.Connect();
	}

	UpdateAuthorization() { //overrides
		this.canWrite = KEEP.authorization.includes("*") || KEEP.authorization.includes("issues:write");
		this.scanButton.disabled = !this.canWrite;
		super.UpdateAuthorization();
	}

	Connect() {
		let server = window.location.href;
		server = server.replace("https://", "");
		server = server.replace("http://", "");
		if (server.indexOf("/") > 0) server = server.substring(0, server.indexOf("/"));

		if (this.ws != null) {
			try {
				this.ws.close();
			}
			catch (ex) {};
		}

		this.ws = new WebSocket((KEEP.isSecure ? "wss://" : "ws://") + server + "/ws/issues");

		this.ws.onopen = ()=> {
			if (this.args.interval) {
				this.ws.send(`interval=${this.args.interval}`);
			}

			if (this.args.select) {
				this.UpdateSelected();
			}

		};

		this.ws.onmessage = event=> {

		};

		this.ws.onclose = ()=> {

		};

		this.ws.onerror = error=> {};
	}

	ScanDialog(entry=null, isRunning=false) {
		const dialog = this.DialogBox("460px");
		if (dialog === null) return;

		const {okButton, innerBox} = dialog;

		okButton.value = "Start";

		innerBox.parentElement.style.maxWidth = "640px";

		innerBox.style.padding = "16px 32px";
		innerBox.style.display = "grid";
		innerBox.style.gridTemplateColumns = "auto 175px 275px auto";
		innerBox.style.gridTemplateRows = "repeat(4, 38px) 16px repeat(2, 38px) 16px repeat(2, 38px) 40px";
		innerBox.style.alignItems = "center";

		okButton.onclick = async ()=> {

			dialog.Close();
		};
	}
}
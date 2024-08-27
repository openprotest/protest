class IpScanner extends List {
	constructor(args) {
		super(args);

		this.args = args ?? {
			find: "",
			filter: "",
			sort: ""
		};
		this.SetTitle("IP scanner");
		this.SetIcon("mono/ipscanner.svg");

		this.AddCssDependencies("list.css");

		const columns = ["ip", "mac address", "manufacturer", "protocols"];
		this.SetupColumns(columns);

		this.LinkData({data:[], length:0 });

		this.SetupToolbar();
		this.startButton = this.AddToolbarButton("Start network scan", "mono/play.svg?light");
		this.stopButton = this.AddToolbarButton("Stop", "mono/stop.svg?light");
		this.AddToolbarSeparator();
		this.SetupFind();

		this.startButton.onclick = ()=> this.Connect();
		this.stopButton.onclick = ()=> this.Stop();

		this.UpdateAuthorization();
	}

	
	UpdateAuthorization() { //overrides
		this.canWrite = KEEP.authorization.includes("*") || KEEP.authorization.includes("network utilities:write");
		this.startButton.disabled = !this.canWrite;
		super.UpdateAuthorization();
	}

	Close() { //overrides
		super.Close();

		if (this.ws != null) {
			try {
				this.ws.close();
			}
			catch (ex) {}
		}
	}

	Connect() {
		let server = window.location.href.replace("https://", "").replace("http://", "");
		if (server.indexOf("/") > 0) server = server.substring(0, server.indexOf("/"));

		if (this.ws != null) {
			try {
				this.ws.close();
			}
			catch (ex) {}
		}

		this.ws = new WebSocket((KEEP.isSecure ? "wss://" : "ws://") + server + "/ws/ipscanner");

		this.ws.onopen = ()=> {
			this.startButton.disabled = true;
			this.stopButton.disabled = false;
		};

		this.ws.onmessage = event=> {

		};

		this.ws.onclose = ()=> {
			this.startButton.disabled = false;
			this.stopButton.disabled = true;
			this.ws = null;
		};

		this.ws.onerror = error=> {};
	}

	Stop() {
		try {
			if (this.ws != null) {
				this.ws.close();
			}
		}
		catch (ex) {}
		finally {
			this.startButton.disabled = false;
			this.stopButton.disabled = true;
			this.ws = null;
		}
	}

}
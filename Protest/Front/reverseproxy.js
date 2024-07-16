class ReverseProxy extends List {
	constructor(args) {
		super(args);

		this.args = args ?? {filter:"", find:"", sort:"", select:null};

		this.AddCssDependencies("list.css");

		this.SetTitle("Reverse proxy");
		this.SetIcon("mono/reverseproxy.svg");

		const columns = ["name", "status"];
		this.SetupColumns(columns);
		this.columnsOptions.style.display = "none";

		this.ws = null;

		this.SetupToolbar();
		this.createButton = this.AddToolbarButton("Create proxy", "mono/add.svg?light");
		this.deleteButton = this.AddToolbarButton("Delete", "mono/delete.svg?light");
		this.AddToolbarSeparator();
		this.startButton = this.AddToolbarButton("Start", "mono/play.svg?light");
		this.stopButton  = this.AddToolbarButton("Stop", "mono/stop.svg?light");

		this.list.style.right = "unset";
		this.list.style.width = "min(40%, 480px)";

		this.listTitle.style.right = "unset";
		this.listTitle.style.width = "min(40%, 480px)";

		this.stats = document.createElement("div");
		this.stats.style.position = "absolute";
		this.stats.style.left = "calc(min(40%, 480px) + 8px)";
		this.stats.style.right = "0";
		this.stats.style.top = "0";
		this.stats.style.bottom = "28px";
		this.stats.style.overflowY = "auto";
		this.content.appendChild(this.stats);

		this.createButton.onclick = () => this.EditDialog();
		this.deleteButton.onclick = () => this.Delete();
		this.startButton.onclick = () => this.Start();
		this.stopButton.onclick = () => this.Stop();
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
			catch (ex) { };
		}

		
		this.ws = new WebSocket((KEEP.isSecure ? "wss://" : "ws://") + server + "/ws/ping");

		this.ws.onopen = ()=> {

		};

		this.ws.onclose = ()=> {

		};

		this.ws.onerror = error=> {
			
		};

	}

	Close() { //overrides
		if (this.ws != null) this.ws.close();
		super.Close();
	}

	async GetCertFiles() {
		try {
			const response = await fetch("config/cert/list");
			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const json = await response.json();
			if (json.error) throw(json.error);

			return json;
		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/error.svg")
			return {data:{}, length:0};
		}
	}

	EditDialog(entry=null) {
		const dialog = this.DialogBox("420px");
		if (dialog === null) return;

		const {okButton, innerBox} = dialog;

		if (entry) {
			okButton.value = "Save";
		}
		else {
			okButton.value = "Create";
		}

		innerBox.parentElement.style.maxWidth = "640px";

		innerBox.style.padding = "16px 32px";
		innerBox.style.display = "grid";
		innerBox.style.gridTemplateColumns = "auto 175px 275px auto";
		innerBox.style.gridTemplateRows = "repeat(7, 38px)";
		innerBox.style.alignItems = "center";

		let counter = 0;
		const AddParameter = (name, tag, type, properties)=> {
			counter++;

			const label = document.createElement("div");
			label.style.gridArea = `${counter} / 2`;
			label.textContent = `${name}:`;

			const input = document.createElement(tag);
			input.style.gridArea = `${counter} / 3`;
			if (type) {
				input.type = type;
			}

			for (let param in properties) {
				input[param] = properties[param];
			}

			innerBox.append(label, input);

			return input;
		};

		const nameInput          = AddParameter("Name", "input", "text");

		const protocolInput = AddParameter("Protocol", "select", null);
		for (const protocol of ["TCP", "UDP", "HTTP", "HTTPS"]) {
			const option = document.createElement("option");
			option.value = protocol.toLowerCase();
			option.text = protocol;
			protocolInput.appendChild(option);
		}
		protocolInput.value = "tcp";

		const certsInput = AddParameter("Certificate", "select", null);
		setTimeout(async()=>{
			const optionNone = document.createElement("option");
			optionNone.value = null;
			optionNone.text = "none";
			certsInput.appendChild(optionNone);

			const certs = await this.GetCertFiles();
			for (let cert in certs.data) {
				const option = document.createElement("option");
				option.value = cert;
				option.text = cert;
				certsInput.appendChild(option);
			}
		}, 0);

		const listenAddressInput      = AddParameter("Listening address", "input", "text", {placeholder: "127.0.0.1"});
		const listenPostInput         = AddParameter("Listening port", "input", "number", {"min":1, "max":65535, value:443});
		const destinationAddressInput = AddParameter("Destination address", "input", "text", {placeholder: "127.0.0.1"});
		const destinationPortInput    = AddParameter("Destination port", "input", "number", {"min":1, "max":65535, value:80});

		setTimeout(()=>nameInput.focus(), 200);

		protocolInput.onchange = ()=> {
			certsInput.disabled = protocolInput.value !== "https";
		};

		protocolInput.onchange();
	}

	Delete() {
		if (this.args.select === null) return;
		this.ConfirmBox("Are you sure you want delete this reverse proxy?").addEventListener("click", async()=> {

		});
	}

	Start() {
		if (this.args.select === null) return;

	}

	Stop() {
		if (this.args.select === null) return;

	}

}
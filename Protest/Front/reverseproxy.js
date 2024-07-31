class ReverseProxy extends List {
	static CANVAS_W = 800;
	static CANVAS_H = 200;
	static GRID = 50;
	static GAP = 5;

	constructor(args) {
		super(args);
		this.args = args ?? {filter:"", find:"", sort:"", select:null};

		this.AddCssDependencies("list.css");

		this.SetTitle("Reverse proxy");
		this.SetIcon("mono/reverseproxy.svg");

		const columns = ["name", "protocol", "proxy", "destination"];
		this.SetupColumns(columns);
		this.columnsOptions.style.display = "none";

		this.columnsElements[1].style.width = "15%";

		this.columnsElements[2].style.left = "40%";
		this.columnsElements[2].style.width = "30%";

		this.columnsElements[3].style.left = "70%";
		this.columnsElements[3].style.width = "30%";

		this.ws = null;

		this.graphCount  = 0;
		this.history = {};
		this.maximum = 8192;

		this.SetupToolbar();
		this.createButton = this.AddToolbarButton("Create proxy", "mono/add.svg?light");
		this.deleteButton = this.AddToolbarButton("Delete", "mono/delete.svg?light");
		this.AddToolbarSeparator();
		this.startButton = this.AddToolbarButton("Start", "mono/play.svg?light");
		this.stopButton  = this.AddToolbarButton("Stop", "mono/stop.svg?light");

		this.deleteButton.disabled = true;
		this.startButton.disabled = true;
		this.stopButton.disabled = true;

		this.list.style.right = "unset";
		this.list.style.width = "min(50%, 640px)";
		this.list.style.overflowY = "auto";

		this.listTitle.style.right = "unset";
		this.listTitle.style.width = "min(50%, 640px)";

		this.stats = document.createElement("div");
		this.stats.style.position = "absolute";
		this.stats.style.left = "calc(min(50%, 640px) + 8px)";
		this.stats.style.right = "4px";
		this.stats.style.top = "0";
		this.stats.style.bottom = "28px";
		this.stats.style.overflowY = "auto";
		this.content.appendChild(this.stats);

		const graph = document.createElement("div");
		graph.style.position = "absolute";
		graph.style.left = "0";
		graph.style.right = "0";
		graph.style.top = "0";
		graph.style.maxWidth = `${ReverseProxy.CANVAS_W + 4}px`;
		graph.style.height = `${ReverseProxy.CANVAS_H + 4}px`;
		graph.style.borderRadius = "4px";
		graph.style.backgroundColor = "color-mix(in hsl shorter hue, var(--clr-dark) 50%, transparent 50%)";
		this.stats.appendChild(graph);

		this.canvas = document.createElement("canvas");
		this.canvas.width = ReverseProxy.CANVAS_W;
		this.canvas.height = ReverseProxy.CANVAS_H;
		this.canvas.style.position = "absolute";
		this.canvas.style.right = "2px"
		this.canvas.style.top = "0";
		this.canvas.style.width = `${ReverseProxy.CANVAS_W}px`;
		this.canvas.style.height = `${ReverseProxy.CANVAS_H}px`;
		graph.appendChild(this.canvas);

		this.ctx = this.canvas.getContext("2d");

		this.createButton.onclick = ()=> this.EditDialog();
		this.deleteButton.onclick = ()=> this.Delete();
		this.startButton.onclick = ()=> this.Start();
		this.stopButton.onclick = ()=> this.Stop();

		this.content.addEventListener("keydown", event=> {
			if (!this.args.select) return;
			if (event.key === "ArrowUp" || event.key === "ArrowDown") {
				const isRunning = this.selected.style.backgroundImage.includes("play");
				this.deleteButton.disabled = false;
				this.startButton.disabled = isRunning;
				this.stopButton.disabled = !isRunning;
			}
		});

		this.GetReverseProxies();
		this.Connect();
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

		this.ws = new WebSocket((KEEP.isSecure ? "wss://" : "ws://") + server + "/ws/reverseproxy");

		this.ws.onopen = ()=> {
			if (this.args.select) {
				this.UpdateSelected(this.args.select);
			}
		};

		this.ws.onmessage = event=> {
			let json = JSON.parse(event.data);

			if (json.running) {
				const nodes = Array.from(this.list.childNodes);

				for (let i=0; i<nodes.length; i++) {
					nodes[i].style.backgroundImage = "url(mono/stop.svg)";
				}
				
				for (let i=0; i<json.running.length; i++) {
					let node = nodes.find(o=>o.id === json.running[i]);
					if (node) {
						node.style.backgroundImage = "url(mono/play.svg)";
					}
				}

				if (this.selected) {
					const isRunning = this.selected.style.backgroundImage.includes("play");
					this.deleteButton.disabled = false;
					this.startButton.disabled = isRunning;
					this.stopButton.disabled = !isRunning;
				}
				else {
					this.deleteButton.disabled = true;
					this.startButton.disabled = true;
					this.stopButton.disabled = true;
				}
			}
			else if (json.traffic) {
				for (let i=0; i<json.traffic.length; i++) {
					if (!this.history[json.traffic[i].guid]) {
						this.history[json.traffic[i].guid] = [];
					}
					this.history[json.traffic[i].guid].push(json.traffic[i]);
					if (this.history[json.traffic[i].guid].length > 100) {
						this.history[json.traffic[i].guid].shift();
					}
				}
				this.DrawGraph();

			}
			else if (json.hosts) {
				//this.DrawGraph(json.hosts);
			}
		};

		this.ws.onclose = ()=> {};

		this.ws.onerror = error=> {};
	}

	DrawGraph() {
		if (!this.args.select || !this.history[this.args.select]) {
			return;
		}

		this.canvas.width = this.canvas.width; //clear canvas

		this.graphCount++;
		const lineOffset = (this.graphCount*ReverseProxy.GAP) % (ReverseProxy.GAP*10)
		this.ctx.lineWidth = 1;
		this.ctx.strokeStyle = "#c0c0c008";
		for (let i = ReverseProxy.CANVAS_W; i >= 0; i -= ReverseProxy.GRID) {
			this.ctx.moveTo(i - lineOffset, 4);
			this.ctx.lineTo(i - lineOffset, ReverseProxy.CANVAS_H);
			this.ctx.stroke();
		}

		const history = this.history[this.args.select];

		this.ctx.lineWidth = 2;
		this.ctx.strokeStyle = "#F00000";
		this.ctx.beginPath();
		for (let i = history.length-1; i >= 1; i--) {
			const delta = history[i].rx - history[i - 1].rx;
			const x = ReverseProxy.CANVAS_W - (history.length - i - 1) * ReverseProxy.GAP;
			const y = ReverseProxy.CANVAS_H - ReverseProxy.CANVAS_H * delta / this.maximum;
			this.ctx.lineTo(x, y);
		}
		this.ctx.stroke();
		this.ctx.closePath();

		this.ctx.strokeStyle = "#00F000";
		this.ctx.beginPath();
		for (let i = history.length-1; i >= 1; i--) {
			const delta = history[i].tx - history[i - 1].tx;
			const x = ReverseProxy.CANVAS_W - (history.length - i - 1) * ReverseProxy.GAP;
			const y = ReverseProxy.CANVAS_H - ReverseProxy.CANVAS_H * delta / this.maximum;
			this.ctx.lineTo(x, y);
		}
		this.ctx.stroke();
		this.ctx.closePath();

	}

	UpdateSelected(guid) {
		if (this.isClosed || this.ws === null || this.ws.readyState !== 1) {
			return;
		}

		this.ws.send(`select=${guid}`);
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

	async GetReverseProxies() {
		try {
			const response = await fetch("rproxy/list");
			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const json = await response.json();
			if (json.error) throw(json.error);

			let length = 0;
			let data = {};

			for (const key in json.data) {
				length++;
				data[key] = {
					status      : {v: "stopped"},
					guid        : {v: json.data[key].guid},
					name        : {v: json.data[key].name},
					protocol    : {v: json.data[key].protocol},
					certificate : {v: json.data[key].certificate},
					password    : {v: ""},
					proxyaddr   : {v: json.data[key].proxyaddr},
					proxyport   : {v: json.data[key].proxyport},
					proxy       : {v: `${json.data[key].proxyaddr}:${json.data[key].proxyport}`},
					destaddr    : {v: json.data[key].destaddr},
					destport    : {v: json.data[key].destport},
					destination : {v: `${json.data[key].destaddr}:${json.data[key].destport}`},
					autostart   : {v: json.data[key].autostart},
				};
			}

			this.link = {data:data, length:length};
			this.ListProxies();

			return json;
		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/error.svg")
			return {data:{}, length:0};
		}
	}

	ListProxies() {
		this.list.textContent = "";

		for (let key in this.link.data) {
			const element =  document.createElement("div");
			element.id = key;
			element.className = "list-element";
			this.list.appendChild(element);

			this.InflateElement(element, this.link.data[key]);

			if (this.args.select && this.args.select === key) {
				this.selected = element;
				element.style.backgroundColor = "var(--clr-select)";
				this.deleteButton.disabled = false;
			}
		}
	}

	EditDialog(entry=null, isRunning=false) {
		const dialog = this.DialogBox("460px");
		if (dialog === null) return;

		const {okButton, innerBox} = dialog;

		okButton.value = entry ? "Save" : "Create";

		innerBox.parentElement.style.maxWidth = "640px";

		innerBox.style.padding = "16px 32px";
		innerBox.style.display = "grid";
		innerBox.style.gridTemplateColumns = "auto 175px 275px auto";
		innerBox.style.gridTemplateRows = "repeat(4, 38px) 16px repeat(2, 38px) 16px repeat(2, 38px) 40px";
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

		const nameInput = AddParameter("Name", "input", "text");

		const protocolInput = AddParameter("Protocol", "select", null);
		for (const protocol of ["TCP", "UDP", "HTTP", "HTTPS"]) {
			const option = document.createElement("option");
			option.value = protocol;
			option.text = protocol;
			protocolInput.appendChild(option);
		}
		protocolInput.value = "TCP";

		const certsInput = AddParameter("Certificate", "select", null);
		setTimeout(async()=> {
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

		const passwordInput = AddParameter("Password", "input", "password", {placeholder: entry ? "unchanged" : ""});

		counter++; //separator

		const proxyAddressInput       = AddParameter("Proxy address", "input", "text", {placeholder: "127.0.0.1"});
		const proxyPostInput          = AddParameter("Proxy port", "input", "number", {"min":1, "max":65535, value:443});
		counter++; //separator
		const destinationAddressInput = AddParameter("Destination address", "input", "text", {placeholder: "127.0.0.1"});
		const destinationPortInput    = AddParameter("Destination port", "input", "number", {"min":1, "max":65535, value:80});

		counter++;
		const autostartBox = document.createElement("div");
		autostartBox.style.gridArea = `${counter} / 2 / ${counter} / 4`;
		innerBox.append(autostartBox);

		const autostartToggle = this.CreateToggle("Autostart", false, autostartBox);

		if (entry) {
			nameInput.value               = entry.name.v;
			protocolInput.value           = entry.protocol.v;
			certsInput.value              = entry.certificate.v;
			passwordInput.value           = "";
			proxyAddressInput.value       = entry.proxyaddr.v;
			proxyPostInput.value          = entry.proxyport.v;
			destinationAddressInput.value = entry.destaddr.v;
			destinationPortInput.value    = entry.destport.v;
			autostartToggle.checkbox.checked = entry.autostart.v;
		}

		setTimeout(()=>nameInput.focus(), 200);

		protocolInput.onchange = ()=> {
			certsInput.disabled = protocolInput.value !== "HTTPS";
			passwordInput.disabled = protocolInput.value !== "HTTPS";
		};

		protocolInput.onchange();

		if (isRunning) {
			dialog.okButton.disabled = true;
		}

		okButton.onclick = async ()=> {
			let requiredFieldMissing = false;
			let requiredFields = [nameInput, proxyAddressInput, proxyPostInput, destinationAddressInput, destinationPortInput];

			for (let i=0; i<requiredFields.length; i++) {
				if (requiredFields[i].value.length === 0) {
					if (!requiredFieldMissing) requiredFields[i].focus();
					requiredFields[i].required = true;
					requiredFieldMissing = true;
					requiredFields[i].style.animationDuration = `${(i+1)*.1}s`;
				}
				else {
					requiredFields[i].required = false;
				}
			}

			if (requiredFieldMissing) return;

			try {
				const response = await fetch("/rproxy/create", {
					method: "POST",
					body: JSON.stringify({
						guid      : entry ? entry.guid.v : null,
						name      : nameInput.value,
						protocol  : protocolInput.value,
						cert      : certsInput.value,
						password  : passwordInput.value,
						proxyaddr : proxyAddressInput.value,
						proxyport : parseInt(proxyPostInput.value),
						destaddr  : destinationAddressInput.value,
						destport  : parseInt(destinationPortInput.value),
						autostart : autostartToggle.checkbox.checked
					})
				});

				if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

				const json = await response.json();
				if (json.error) throw (json.error);

				this.args.select = json.guid;
				this.GetReverseProxies();

				this.startButton.disabled = false;
				this.stopButton.disabled = true;
			}
			catch (ex) {
				setTimeout(()=>this.ConfirmBox(ex, true, "mono/error.svg"), 250);
			}

			dialog.Close();
		};
	}

	async Delete() {
		if (this.args.select === null) return;
		this.ConfirmBox("Are you sure you want delete this reverse proxy?").addEventListener("click", async()=> {
			try {
				const response = await fetch(`/rproxy/delete?guid=${this.args.select}`);
				if (response.status !== 200) LOADER.HttpErrorHandler(response.status);
	
				const json = await response.json();
				if (json.error) throw(json.error);
	
				this.args.select = null;
				this.selected = null;
				this.GetReverseProxies();

				this.deleteButton.disabled = true;
				this.startButton.disabled = true;
				this.stopButton.disabled = true;
			}
			catch (ex) {
				this.ConfirmBox(ex, true, "mono/error.svg")
			}
		});
	}

	async Start() {
		if (this.args.select === null) return;

		const selected = this.selected;
		try {
			const response = await fetch(`/rproxy/start?guid=${this.args.select}`);
			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const json = await response.json();
			if (json.error) throw(json.error);

			if (selected) {
				selected.style.backgroundImage = "url(mono/play.svg)";
				this.deleteButton.disabled = false;
				this.startButton.disabled = true;
				this.stopButton.disabled = false;
			}

			return json;
		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/error.svg")
		}
	}

	async Stop() {
		if (this.args.select === null) return;

		const selected = this.selected;
		try {
			const response = await fetch(`/rproxy/stop?guid=${this.args.select}`);
			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const json = await response.json();
			if (json.error) throw(json.error);

			if (selected) {
				selected.style.backgroundImage = "url(mono/stop.svg)";
				this.deleteButton.disabled = false;
				this.startButton.disabled = false;
				this.stopButton.disabled = true;
			}

			return json;
		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/error.svg")
		}
	}

	InflateElement(element, entry) { //overrides
		element.style.backgroundSize = "20px 20px";
		element.style.backgroundPosition = "6px 6px";
		element.style.backgroundRepeat = "no-repeat";

		element.style.backgroundImage = {
			"running": "url(mono/play.svg)",
			"stopped": "url(mono/stop.svg)"
		}[entry.status.v];

		super.InflateElement(element, entry);

		element.childNodes[0].style.top = "5px";
		element.childNodes[0].style.left = "36px";
		element.childNodes[0].style.width = `calc(${this.columnsElements[0].style.width} - 36px)`;
		element.childNodes[0].style.whiteSpace = "nowrap";
		element.childNodes[0].style.overflow = "hidden";
		element.childNodes[0].style.textOverflow = "ellipsis";

		element.onclick = ()=> {
			if (this.args.select !== entry.guid.v) {
				this.UpdateSelected(entry.guid.v);
			}

			if (this.selected) this.selected.style.backgroundColor = "";
			this.args.select = entry.guid.v;
			this.selected = element;
			element.style.backgroundColor = "var(--clr-select)";

			const isRunning = element.style.backgroundImage.includes("play");
			this.deleteButton.disabled = false;
			this.startButton.disabled = isRunning;
			this.stopButton.disabled = !isRunning;
		};

		element.ondblclick = ()=> {
			let key = entry.guid.v;
			if (key in this.link.data) {
				const isRunning = element.style.backgroundImage.includes("play");
				this.EditDialog(this.link.data[key], isRunning);
			}
		};
	}
}
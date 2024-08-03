class ReverseProxy extends List {
	static CANVAS_W = 800;
	static CANVAS_H = 200;
	static GRID = 60;
	static GAP = 3;
	static RUNNING = [];

	constructor(args) {
		super(args);
		this.args = args ?? {filter:"", find:"", sort:"", select:null, interval:1000};

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

		this.graphCount = 0;
		this.history = {};
		this.maximum = 2560;

		this.InitializeComponents();

		this.GetReverseProxies();
		this.Connect();
	}

	InitializeComponents() {
		this.SetupToolbar();
		this.createButton = this.AddToolbarButton("Create proxy", "mono/add.svg?light");
		this.deleteButton = this.AddToolbarButton("Delete", "mono/delete.svg?light");
		this.AddToolbarSeparator();
		this.startButton = this.AddToolbarButton("Start", "mono/play.svg?light");
		this.stopButton  = this.AddToolbarButton("Stop", "mono/stop.svg?light");
		this.intervalButton = this.AddToolbarButton("Interval", "mono/metronome.svg?light");
		this.reconnectSeparator = this.AddToolbarSeparator();
		this.reconnectButton = this.AddToolbarButton("Reconnect", "mono/connect.svg?light");

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
		graph.style.maxWidth = `${ReverseProxy.CANVAS_W+4}px`;
		graph.style.height = `${ReverseProxy.CANVAS_H+8}px`;
		graph.style.borderRadius = "4px";
		graph.style.backgroundColor = "color-mix(in hsl shorter hue, var(--clr-dark) 50%, transparent 50%)";
		this.stats.appendChild(graph);

		this.canvas = document.createElement("canvas");
		this.canvas.width = ReverseProxy.CANVAS_W;
		this.canvas.height = ReverseProxy.CANVAS_H+4;
		this.canvas.style.position = "absolute";
		this.canvas.style.right = "2px";
		this.canvas.style.top = "0";
		this.canvas.style.width = `${ReverseProxy.CANVAS_W}px`;
		this.canvas.style.height = `${ReverseProxy.CANVAS_H+4}px`;
		graph.appendChild(this.canvas);

		this.ctx = this.canvas.getContext("2d");

		this.disconnectIcon = document.createElement("div");
		this.disconnectIcon.style.position = "absolute";
		this.disconnectIcon.style.left = "8px";
		this.disconnectIcon.style.top = "8px";
		this.disconnectIcon.style.width = "32px";
		this.disconnectIcon.style.height = "32px";
		this.disconnectIcon.style.backgroundImage = "url(mono/disconnect.svg?light)";
		this.disconnectIcon.style.backgroundSize = "32px 32px";
		this.disconnectIcon.style.transition = ".2s";
		graph.appendChild(this.disconnectIcon);

		this.totalRxLabel = document.createElement("div");
		this.totalRxLabel.textContent = "Received:";
		this.totalRxLabel.style.position = "absolute";
		this.totalRxLabel.style.left = "8px";
		this.totalRxLabel.style.top = "220px";
		this.totalRxLabel.style.width = "96px";
		this.totalRxLabel.style.color = "rgb(122,212,43)";
		this.totalRxLabel.style.textAlign = "right";
		this.totalRxLabel.style.lineHeight = "20px";
		
		this.totalTxLabel = document.createElement("div");
		this.totalTxLabel.textContent = "Transmitted:";
		this.totalTxLabel.style.position = "absolute";
		this.totalTxLabel.style.left = "8px";
		this.totalTxLabel.style.top = "245px";
		this.totalTxLabel.style.width = "96px";
		this.totalTxLabel.style.color = "rgb(232,118,0)";
		this.totalTxLabel.style.textAlign = "right";
		this.totalTxLabel.style.lineHeight = "20px";

		this.totalRxValue = document.createElement("div");
		this.totalRxValue.style.position = "absolute";
		this.totalRxValue.style.left = "114px";
		this.totalRxValue.style.top = "220px";
		this.totalRxValue.style.width = "100px";
		this.totalRxValue.style.color = "rgb(122,212,43)";
		this.totalRxValue.style.backgroundColor = "color-mix(in hsl shorter hue, var(--clr-dark) 50%, transparent 50%)";
		this.totalRxValue.style.borderRadius = "4px";
		this.totalRxValue.style.padding = "0 4px";
		this.totalRxValue.style.fontFamily = "monospace";
		this.totalRxValue.style.textAlign = "right";
		this.totalRxValue.style.lineHeight = "20px";

		this.totalTxValue = document.createElement("div");
		this.totalTxValue.style.position = "absolute";
		this.totalTxValue.style.left = "114px";
		this.totalTxValue.style.top = "245px";
		this.totalTxValue.style.width = "100px";
		this.totalTxValue.style.color = "rgb(232,118,0)";
		this.totalTxValue.style.backgroundColor = "color-mix(in hsl shorter hue, var(--clr-dark) 50%, transparent 50%)";
		this.totalTxValue.style.borderRadius = "4px";
		this.totalTxValue.style.padding = "0 4px";
		this.totalTxValue.style.fontFamily = "monospace";
		this.totalTxValue.style.textAlign = "right";
		this.totalTxValue.style.lineHeight = "20px";

		this.stats.append(this.totalRxLabel, this.totalTxLabel, this.totalRxValue, this.totalTxValue);

		this.rxRateLabel = document.createElement("div");
		this.rxRateLabel.textContent = "Rx rate:";
		this.rxRateLabel.style.position = "absolute";
		this.rxRateLabel.style.left = "260px";
		this.rxRateLabel.style.top = "220px";
		this.rxRateLabel.style.width = "80px";
		this.rxRateLabel.style.color = "rgb(122,212,43)";
		this.rxRateLabel.style.textAlign = "right";
		this.rxRateLabel.style.lineHeight = "20px";
		
		this.txRateLabel = document.createElement("div");
		this.txRateLabel.textContent = "Tx rate:";
		this.txRateLabel.style.position = "absolute";
		this.txRateLabel.style.left = "260px";
		this.txRateLabel.style.top = "245px";
		this.txRateLabel.style.width = "80px";
		this.txRateLabel.style.color = "rgb(232,118,0)";
		this.txRateLabel.style.textAlign = "right";
		this.txRateLabel.style.lineHeight = "20px";

		this.rxRateValue = document.createElement("div");
		this.rxRateValue.style.position = "absolute";
		this.rxRateValue.style.left = "350px";
		this.rxRateValue.style.top = "220px";
		this.rxRateValue.style.width = "100px";
		this.rxRateValue.style.color = "rgb(122,212,43)";
		this.rxRateValue.style.backgroundColor = "color-mix(in hsl shorter hue, var(--clr-dark) 50%, transparent 50%)";
		this.rxRateValue.style.borderRadius = "4px";
		this.rxRateValue.style.padding = "0 4px";
		this.rxRateValue.style.fontFamily = "monospace";
		this.rxRateValue.style.textAlign = "right";
		this.rxRateValue.style.lineHeight = "20px";
		
		this.txRateValue = document.createElement("div");
		this.txRateValue.style.position = "absolute";
		this.txRateValue.style.left = "350px";
		this.txRateValue.style.top = "245px";
		this.txRateValue.style.width = "100px";
		this.txRateValue.style.color = "rgb(232,118,0)";
		this.txRateValue.style.backgroundColor = "color-mix(in hsl shorter hue, var(--clr-dark) 50%, transparent 50%)";
		this.txRateValue.style.borderRadius = "4px";
		this.txRateValue.style.padding = "0 4px";
		this.txRateValue.style.fontFamily = "monospace";
		this.txRateValue.style.textAlign = "right";
		this.txRateValue.style.lineHeight = "20px";

		this.stats.append(this.rxRateLabel, this.txRateLabel, this.rxRateValue, this.txRateValue);

		this.clientsList = document.createElement("div");
		this.clientsList.style.position = "absolute";
		this.clientsList.style.left = "0";
		this.clientsList.style.right = "0";
		this.clientsList.style.top = "300px";
		this.clientsList.style.bottom = "0";
		this.clientsList.style.maxWidth = "800px";
		this.clientsList.style.overflowY = "auto";
		this.stats.append(this.clientsList);

		this.createButton.onclick = ()=> this.EditDialog();
		this.deleteButton.onclick = ()=> this.Delete();
		this.startButton.onclick = ()=> this.Start();
		this.stopButton.onclick = ()=> this.Stop();
		this.intervalButton.onclick = ()=> this.SetInterval();
		this.reconnectButton.onclick = ()=> this.Connect();

		this.content.addEventListener("keydown", event=> {
			if (!this.args.select) return;
			if (event.key === "ArrowUp" || event.key === "ArrowDown") {
				const isRunning = this.selected.style.backgroundImage.includes("play");
				this.deleteButton.disabled = false;
				this.startButton.disabled = isRunning;
				this.stopButton.disabled = !isRunning;
				this.UpdateSelected();
			}
		});
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

		this.reconnectSeparator.style.display = "none";
		this.reconnectButton.style.display = "none";

		this.ws = new WebSocket((KEEP.isSecure ? "wss://" : "ws://") + server + "/ws/reverseproxy");

		this.ws.onopen = ()=> {
			if (this.args.interval) {
				this.ws.send(`interval=${this.args.interval}`);
			}

			if (this.args.select) {
				this.UpdateSelected();
			}

			this.reconnectSeparator.style.display = "none";
			this.reconnectButton.style.display = "none";
			this.disconnectIcon.style.visibility = "hidden";
			this.disconnectIcon.style.opacity = "0";
		};

		this.ws.onmessage = event=> {
			let json = JSON.parse(event.data);
			
			if (json.running) {
				ReverseProxy.RUNNING = json.running;

				const nodes = Array.from(this.list.childNodes);

				for (let i=0; i<nodes.length; i++) {
					const isRunning = json.running.includes(nodes[i].id);
					nodes[i].style.backgroundImage = isRunning ? "url(mono/play.svg)" : "url(mono/stop.svg)";
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
					if (this.history[json.traffic[i].guid].length > 248) {
						this.history[json.traffic[i].guid].shift();
					}

					if (json.traffic[i].guid === this.args.select) {
						this.UpdateGraph();
					}
				}
			}
			else if (json.hosts) {
				for (let i=0; i<json.hosts.length; i++) {
					
					if (this.clients[json.hosts[i].ip]) {
						const element = this.clients[json.hosts[i].ip];

						const received = element.children[1];
						received.textContent = UI.SizeToString(json.hosts[i].rx);

						const transmitted = element.children[2];
						transmitted.textContent = UI.SizeToString(json.hosts[i].tx);
					}
					else {
						const element = document.createElement("div");
						element.style.height = "28px";
						element.style.padding = "2px 0";
						element.style.lineHeight = "28px";
						element.style.marginBottom = "2px";
						element.style.borderRadius = "2px";
						element.style.backgroundColor = "color-mix(in hsl shorter hue, var(--clr-dark) 50%, transparent 50%)";
						element.style.animation = "rise-in 0.2s ease-out 1";
						this.clientsList.appendChild(element);

						const name = document.createElement("div");
						name.textContent = json.hosts[i].ip;
						name.style.position = "absolute";
						name.style.left = "0";
						name.style.width = "33%";
						name.style.paddingLeft = "8px";
						name.style.overflow = "hidden";
						name.style.textOverflow = "ellipses";
						name.style.whiteSpace = "nowrap";
						element.appendChild(name);

						const received = document.createElement("div");
						received.textContent = UI.SizeToString(json.hosts[i].rx);
						received.style.color = "rgb(122,212,43)";
						received.style.fontFamily = "monospace";
						received.style.position = "absolute";
						received.style.left = "33%";
						received.style.width = "33%";
						received.style.textAlign = "right";
						received.style.overflow = "hidden";
						received.style.textOverflow = "ellipses";
						received.style.whiteSpace = "nowrap";
						element.appendChild(received);

						const transmitted = document.createElement("div");
						transmitted.textContent = UI.SizeToString(json.hosts[i].tx);
						transmitted.style.color = "rgb(232,118,0)";
						transmitted.style.fontFamily = "monospace";
						transmitted.style.position = "absolute";
						transmitted.style.left = "66%";
						transmitted.style.width = "33%";
						transmitted.style.textAlign = "right";
						transmitted.style.overflow = "hidden";
						transmitted.style.textOverflow = "ellipses";
						transmitted.style.whiteSpace = "nowrap";
						element.appendChild(transmitted);

						this.clients[json.hosts[i].ip] = element;
					}
				}
			}
		};

		this.ws.onclose = ()=> {
			this.reconnectSeparator.style.display = "initial";
			this.reconnectButton.style.display = "initial";
			this.disconnectIcon.style.visibility = "visible";
			this.disconnectIcon.style.opacity = "1";
		};

		this.ws.onerror = error=> {};
	}

	UpdateGraph() {
		this.canvas.width = this.canvas.width; //clear canvas

		if (!this.args.select || !this.history[this.args.select]) {
			this.totalRxValue.textContent = "";
			this.totalTxValue.textContent = "";
			this.rxRateValue.textContent = "";
			this.txRateValue.textContent = "";
			return;
		}

		const lineOffset = (this.graphCount*ReverseProxy.GAP) % (ReverseProxy.GAP*20);
		this.ctx.lineWidth = 1;
		this.ctx.strokeStyle = "#c0c0c020";
		for (let i=ReverseProxy.CANVAS_W; i>=0; i-=ReverseProxy.GRID) {
			this.ctx.beginPath();
			this.ctx.moveTo(i - lineOffset, 4);
			this.ctx.lineTo(i - lineOffset, ReverseProxy.CANVAS_H);
			this.ctx.stroke();
		}

		this.ctx.fillStyle = "#c0c0c080";
		this.ctx.textAlign = "right";
		for (let i=1; i<5; i++) {
			const y = ReverseProxy.CANVAS_H * i / 5;
			this.ctx.beginPath();
			this.ctx.moveTo(0, y);
			this.ctx.lineTo(ReverseProxy.CANVAS_W, y);
			this.ctx.stroke();

			this.ctx.fillText(UI.BytesPerSecToShortString(this.maximum * (5-i) / 5), ReverseProxy.CANVAS_W - 4, y - 6);
		}

		const history = this.history[this.args.select];

		this.totalRxValue.textContent = UI.SizeToString(history[history.length - 1].rx);
		this.totalTxValue.textContent = UI.SizeToString(history[history.length - 1].tx);

		this.ctx.lineWidth = 2;

		if (history.length > 1) {
			const deltaRx = history[history.length - 1].rx - history[history.length - 2].rx;
			const deltaTx = history[history.length - 1].tx - history[history.length - 2].tx;
			const rxRate = Math.max(Math.round(deltaRx / (this.args.interval / 1000)), 0);
			const txRate = Math.max(Math.round(deltaTx / (this.args.interval / 1000)), 0);

			this.rxRateValue.textContent = UI.BytesPerSecToString(rxRate);
			this.txRateValue.textContent = UI.BytesPerSecToString(txRate);

			this.maximum = Math.max(this.maximum, rxRate, txRate);

			this.ctx.fillStyle = "rgb(122,212,43)";
			this.ctx.beginPath();
			this.ctx.arc(ReverseProxy.CANVAS_W - 56, ReverseProxy.CANVAS_H * (1 - rxRate / this.maximum), 3, 0, 2*Math.PI, false);
			this.ctx.closePath();
			this.ctx.fill();
	
			this.ctx.fillStyle = "rgb(232,118,0)";
			this.ctx.beginPath();
			this.ctx.arc(ReverseProxy.CANVAS_W - 56, ReverseProxy.CANVAS_H * (1 - txRate / this.maximum), 3, 0, 2*Math.PI, false);
			this.ctx.closePath();
			this.ctx.fill();
		}

		this.ctx.strokeStyle = "rgb(122,212,43)";
		this.ctx.beginPath();
		for (let i = history.length-1; i >= 1; i--) {
			const delta = history[i].rx - history[i - 1].rx;
			const rate = Math.round(delta / (this.args.interval / 1000));
			const x = ReverseProxy.CANVAS_W - 56 - (history.length - i - 1) * ReverseProxy.GAP - 2;
			const y = ReverseProxy.CANVAS_H * (1 - rate / this.maximum);
			this.ctx.lineTo(x, y);
		}
		this.ctx.stroke();
		this.ctx.closePath();

		this.ctx.strokeStyle = "rgb(232,118,0)";
		this.ctx.beginPath();
		for (let i = history.length-1; i >= 1; i--) {
			const delta = history[i].tx - history[i-1].tx;
			const rate = Math.round(delta / (this.args.interval / 1000));
			const x = ReverseProxy.CANVAS_W - 56 - (history.length - i - 1) * ReverseProxy.GAP - 2;
			const y = ReverseProxy.CANVAS_H * (1 - rate / this.maximum);
			this.ctx.lineTo(x, y);
		}
		this.ctx.stroke();
		this.ctx.closePath();

		if (this.ws !== null && this.ws.readyState === 1) {
			this.graphCount++;
		}
	}

	UpdateSelected() {
		const guid = this.args.select;
		this.maximum = 2560;
		if (this.history[guid] && this.history[guid].length > 1) {
			const history = this.history[guid];
			for (let i=1; i<history.length; i++) {
				const deltaRx = history[i].rx - history[i-1].rx;
				const deltaTx = history[i].tx - history[i-1].tx;
				const rxRate = deltaRx / (this.args.interval / 1000);
				const txRate = deltaTx / (this.args.interval / 1000);
				this.maximum = Math.max(this.maximum, rxRate, txRate);
			}
		}

		if (this._tempSelect !== guid) {
			this.clients = {};
			this.clientsList.textContent = "";
			this._tempSelect = guid;
		}
		
		this.UpdateGraph();

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
			this.ConfirmBox(ex, true, "mono/error.svg");
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

				let destination = json.data[key].protocol === "TCP" || json.data[key].protocol === "UDP"
					? `${json.data[key].destaddr}:${json.data[key].destport}`
					: json.data[key].destaddr;

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
					destination : {v: destination},
					autostart   : {v: json.data[key].autostart},
				};
			}

			this.link = {data:data, length:length};
			this.ListProxies();

			return json;
		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/error.svg");
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

			if (entry) {
				certsInput.value = entry.certificate.v;
			}
		}, 0);

		const passwordInput = AddParameter("Password", "input", "password", {placeholder: entry ? "unchanged" : ""});

		counter++; //separator

		const proxyAddressInput       = AddParameter("Proxy address", "input", "text", {placeholder: "127.0.0.1"});
		const proxyPostInput          = AddParameter("Proxy port", "input", "number", {"min":1, "max":65535, value:443});
		counter++; //separator
		
		const destinationAddressInput = AddParameter("Destination address", "input", "text", {placeholder: "127.0.0.1"});

		counter++;
		const destinationPortLabel = document.createElement("div");
		destinationPortLabel.style.gridArea = `${counter} / 2`;
		destinationPortLabel.textContent = `Destination port:`;

		const destinationPortInput = document.createElement("input");
		destinationPortInput.type = "number";
		destinationPortInput.min = 1;
		destinationPortInput.max = 65535;
		destinationPortInput.value = 80;
		destinationPortInput.style.gridArea = `${counter} / 3`;

		innerBox.append(destinationPortLabel, destinationPortInput);


		counter++;
		const autostartBox = document.createElement("div");
		autostartBox.style.gridArea = `${counter} / 2 / ${counter} / 4`;
		innerBox.append(autostartBox);

		const autostartToggle = this.CreateToggle("Autostart", false, autostartBox);

		if (entry) {
			nameInput.value               = entry.name.v;
			protocolInput.value           = entry.protocol.v;
			passwordInput.value           = "";
			proxyAddressInput.value       = entry.proxyaddr.v;
			proxyPostInput.value          = entry.proxyport.v;
			destinationAddressInput.value = entry.destaddr.v;
			destinationPortInput.value    = entry.destport.v;
			autostartToggle.checkbox.checked = entry.autostart.v;
		}

		protocolInput.onchange = ()=> {
			certsInput.disabled = protocolInput.value !== "HTTPS";
			passwordInput.disabled = protocolInput.value !== "HTTPS";

			const isL3 = protocolInput.value === "TCP" || protocolInput.value === "UDP";
			destinationAddressInput.placeholder = isL3 ? "127.0.0.1" : "https://example.com";

			destinationPortLabel.style.display = isL3 ? "initial" : "none";
			destinationPortInput.style.display = isL3 ? "initial" : "none";
		};

		protocolInput.onchange();

		if (isRunning) {
			nameInput.disabled = true;
			protocolInput.disabled = true;
			certsInput.disabled = true;
			passwordInput.disabled = true;
			proxyAddressInput.disabled = true;
			proxyPostInput.disabled = true;
			destinationAddressInput.disabled = true;
			destinationPortInput.disabled = true;
			autostartToggle.checkbox.disabled = true;

			dialog.okButton.disabled = true;
			dialog.cancelButton.value = "Close";
		
			setTimeout(()=>dialog.cancelButton.focus(), 200);
		}
		else {
			setTimeout(()=>nameInput.focus(), 200);
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
						guid        : entry ? entry.guid.v : null,
						name        : nameInput.value,
						protocol    : protocolInput.value,
						certificate : certsInput.value === null || certsInput.value === "null" ? null : certsInput.value,
						password    : passwordInput.value,
						proxyaddr   : proxyAddressInput.value,
						proxyport   : parseInt(proxyPostInput.value),
						destaddr    : destinationAddressInput.value,
						destport    : parseInt(destinationPortInput.value),
						autostart   : autostartToggle.checkbox.checked
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
				this.ConfirmBox(ex, true, "mono/error.svg");
			}
		});
	}

	async Start() {
		const guid = this.args.select;
		if (guid === null) return;

		const selected = this.selected;
		this.startButton.disabled = true;

		try {
			const response = await fetch(`/rproxy/start?guid=${guid}`);
			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const json = await response.json();
			if (json.error) throw(json.error);

			if (selected) {
				selected.style.backgroundImage = "url(mono/play.svg)";
				this.deleteButton.disabled = false;
				this.startButton.disabled = true;
				this.stopButton.disabled = false;
			}

			ReverseProxy.RUNNING.push(guid);

			return json;
		}
		catch (ex) {
			this.startButton.disabled = false;
			this.ConfirmBox(ex, true, "mono/error.svg");

			if (ex === "This proxy is already running") {
				const index = ReverseProxy.RUNNING.indexOf(guid);
				ReverseProxy.RUNNING.push(guid);

				if (selected) {
					selected.style.backgroundImage = "url(mono/play.svg)";
					this.deleteButton.disabled = false;
					this.startButton.disabled = true;
					this.stopButton.disabled = false;
				}
			}
		}
	}

	async Stop() {
		const guid = this.args.select;
		if (guid === null) return;

		const selected = this.selected;
		this.stopButton.disabled = true;

		try {
			const response = await fetch(`/rproxy/stop?guid=${guid}`);
			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const json = await response.json();
			if (json.error) throw(json.error);

			if (selected) {
				selected.style.backgroundImage = "url(mono/stop.svg)";
				this.deleteButton.disabled = false;
				this.startButton.disabled = false;
				this.stopButton.disabled = true;
			}

			const index = ReverseProxy.RUNNING.indexOf(guid);
			if (index > -1) {
				ReverseProxy.RUNNING.splice(index, 1);
			}

			return json;
		}
		catch (ex) {
			this.stopButton.disabled = false;
			this.ConfirmBox(ex, true, "mono/error.svg");

			if (ex === "This proxy is not running") {
				const index = ReverseProxy.RUNNING.indexOf(guid);
				if (index > -1) {
					ReverseProxy.RUNNING.splice(index, 1);
				}

				if (selected) {
					selected.style.backgroundImage = "url(mono/stop.svg)";
					this.deleteButton.disabled = false;
					this.startButton.disabled = false;
					this.stopButton.disabled = true;
				}
			}
		}
	}

	SetInterval() {
		if (!this.ws) return;

		const dialog = this.DialogBox("120px");
		if (dialog === null) return;

		const {okButton, innerBox} = dialog;

		innerBox.parentElement.style.maxWidth = "400px";
		innerBox.style.padding = "16px 0px 0px 16px";
		innerBox.style.textAlign = "center";

		const intervalLabel = document.createElement("div");
		intervalLabel.textContent = "Interval (ms):";
		intervalLabel.style.display = "inline-block";
		intervalLabel.style.minWidth = "120px";
		innerBox.appendChild(intervalLabel);

		const intervalInput = document.createElement("input");
		intervalInput.type = "number";
		intervalInput.min = 100;
		intervalInput.max = 10_000;
		intervalInput.value = this.args.interval;

		intervalInput.style.width = "100px";
		innerBox.appendChild(intervalInput);

		intervalInput.onkeydown = event=> {
			if (event.key === "Enter") { okButton.click(); }
		};

		okButton.onclick = ()=> {
			let value = parseInt(intervalInput.value);
			if (isNaN(value)) { return; }

			this.args.interval = intervalInput.value;
			this.ws.send(`interval=${value}`);
			this.UpdateSelected();
			dialog.Close();
		};

		intervalInput.focus();
	}

	InflateElement(element, entry) { //overrides
		const isProxyRunning = ReverseProxy.RUNNING.includes(entry.guid.v);
		element.style.backgroundImage = isProxyRunning ? "url(mono/play.svg)" : "url(mono/stop.svg)";
		element.style.backgroundSize = "20px 20px";
		element.style.backgroundPosition = "6px 6px";
		element.style.backgroundRepeat = "no-repeat";

		super.InflateElement(element, entry);

		element.childNodes[0].style.top = "5px";
		element.childNodes[0].style.left = "36px";
		element.childNodes[0].style.width = `calc(${this.columnsElements[0].style.width} - 36px)`;
		element.childNodes[0].style.whiteSpace = "nowrap";
		element.childNodes[0].style.overflow = "hidden";
		element.childNodes[0].style.textOverflow = "ellipsis";

		element.onclick = ()=> {
			if (this.selected) this.selected.style.backgroundColor = "";
			this.args.select = entry.guid.v;
			this.selected = element;
			element.style.backgroundColor = "var(--clr-select)";

			this.UpdateSelected();

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
"use strict";
class ReverseProxy extends List {
	static CANVAS_W = 800;
	static CANVAS_H = 200;
	static GRID = 60;
	static GAP = 3;
	static RUNNING = [];
	static PROTOCOLS = ["TCP", "UDP", "HTTP", "HTTPS"];
	static IP_FILTER_MODES = ["Blacklist", "Whitelist"];

	//defaults come from the server, blank: placeholder for a null value
	//min and max are in bytes, kb: shown and edited in KB
	static HTTP_LIMITS = [
		{section: "Limits"},
		{key: "keepAliveTimeout",                 label: "Keep-alive timeout (sec)",    blank: "infinite"},
		{key: "requestHeadersTimeout",            label: "Headers timeout (sec)",       blank: "infinite"},
		{key: "maxConcurrentConnections",         label: "Max connections",             blank: "unlimited", integer: true, min: 1},
		{key: "maxConcurrentUpgradedConnections", label: "Max upgraded connections",    blank: "unlimited", integer: true, min: 0},
		{key: "maxRequestBodySize",               label: "Max request body (KB)",       blank: "unlimited", integer: true, min: 0, kb: true},
		{key: "maxRequestBufferSize",             label: "Max request buffer (KB)",     blank: "unlimited", integer: true, min: 1, kb: true},
		{key: "maxResponseBufferSize",            label: "Max response buffer (KB)",    blank: "unlimited", integer: true, min: 0, kb: true},
		{key: "maxRequestHeaderCount",            label: "Max header count",            integer: true, min: 1},
		{key: "maxRequestHeadersTotalSize",       label: "Max headers size (KB)",       integer: true, min: 1, kb: true},
		{key: "maxRequestLineSize",               label: "Max request line (KB)",       integer: true, min: 1, kb: true},
		{key: "minRequestBodyDataRate",           label: "Min request rate (KB/s)",     blank: "disabled", min: 0, kb: true},
		{key: "minRequestBodyGracePeriod",        label: "Request grace period (sec)"},
		{key: "minResponseDataRate",              label: "Min response rate (KB/s)",    blank: "disabled", min: 0, kb: true},
		{key: "minResponseGracePeriod",           label: "Response grace period (sec)"},
		{section: "HTTP/2"},
		{key: "http2MaxStreamsPerConnection",     label: "Max streams",                 integer: true, min: 1},
		{key: "http2HeaderTableSize",             label: "Header table size (KB)",      integer: true, min: 0, kb: true},
		{key: "http2MaxFrameSize",                label: "Max frame size (KB)",         integer: true, min: 16_384, max: 16_777_215, kb: true},
		{key: "http2MaxRequestHeaderFieldSize",   label: "Max header field (KB)",       integer: true, min: 1, kb: true},
		{key: "http2InitialConnectionWindowSize", label: "Connection window (KB)",      integer: true, min: 65_535, max: 2_147_483_647, kb: true},
		{key: "http2InitialStreamWindowSize",     label: "Stream window (KB)",          integer: true, min: 65_535, max: 2_147_483_647, kb: true},
		{key: "http2KeepAlivePingDelay",          label: "Ping delay (sec)",            blank: "infinite"},
		{key: "http2KeepAlivePingTimeout",        label: "Ping timeout (sec)"},
		{section: "HTTP/3"},
		{key: "http3MaxRequestHeaderFieldSize",   label: "Max header field (KB)",       integer: true, min: 1, kb: true},
	];

	static IsL3(protocol) {
		return protocol === "TCP" || protocol === "UDP";
	}

	constructor(args) {
		super(args);
		this.args = args ?? {filter:"", find:"", sort:"", select:null, interval:1000};

		Window.AddCssDependencies("list.css");

		this.SetTitle("Reverse proxy");
		this.SetIcon("mono/reverseproxy.svg");

		this.ws = null;

		this.graphCount = 0;
		this.history = Object.create(null);
		this.clientHistory = Object.create(null);
		this.maximum = 2560;

		this.InitializeComponents();
		this.UpdateAuthorization();

		this.GetReverseProxies();
		this.Connect();
	}

	UpdateAuthorization() { //overrides
		this.canWrite = KEEP.authorization.includes("*") || KEEP.authorization.includes("reverse proxy:write");
		this.createButton.disabled = !this.canWrite;
		this.deleteButton.disabled = !this.canWrite || this.args.select === null;
		this.startButton.disabled = !this.canWrite || this.args.select === null;
		this.stopButton.disabled = !this.canWrite || this.args.select === null;
		super.UpdateAuthorization();
	}

	InitializeComponents() {
		const columns = ["name", "protocol", "proxy", "destination"];
		this.SetupColumns(columns);
		this.columnsOptions.style.display = "none";

		this.columnsElements[1].style.width = "15%";

		this.columnsElements[2].style.left = "40%";
		this.columnsElements[2].style.width = "30%";

		this.columnsElements[3].style.left = "70%";
		this.columnsElements[3].style.width = "30%";

		this.SetupToolbar();
		this.createButton = this.AddToolbarButton("Create proxy", "mono/add.svg?light");
		this.deleteButton = this.AddToolbarButton("Delete", "mono/delete.svg?light");
		this.AddToolbarSeparator();
		this.startButton = this.AddToolbarButton("Start", "mono/play.svg?light");
		this.stopButton = this.AddToolbarButton("Stop", "mono/stop.svg?light");
		this.intervalButton = this.AddToolbarButton("Interval", "mono/metronome.svg?light");
		this.reconnectSeparator = this.AddToolbarSeparator();
		this.reconnectButton = this.AddToolbarButton("Reconnect", "mono/connect.svg?light");

		this.list.style.right = "unset";
		this.list.style.width = "min(50%, 640px)";

		this.listTitleOuter.style.right = "unset";
		this.listTitleOuter.style.width = "min(50%, 640px)";

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
		this.disconnectIcon.style.mixBlendMode = "hard-light";
		graph.appendChild(this.disconnectIcon);

		this.totalRxLabel = document.createElement("div");
		this.totalRxLabel.textContent = "Received:";
		this.totalRxLabel.style.position = "absolute";
		this.totalRxLabel.style.left = "8px";
		this.totalRxLabel.style.top = "220px";
		this.totalRxLabel.style.width = "96px";
		this.totalRxLabel.style.color = "light-dark(var(--clr-dark), rgb(122,212,43))";
		this.totalRxLabel.style.textAlign = "right";
		this.totalRxLabel.style.lineHeight = "20px";

		this.totalTxLabel = document.createElement("div");
		this.totalTxLabel.textContent = "Transmitted:";
		this.totalTxLabel.style.position = "absolute";
		this.totalTxLabel.style.left = "8px";
		this.totalTxLabel.style.top = "245px";
		this.totalTxLabel.style.width = "96px";
		this.totalTxLabel.style.color = "light-dark(var(--clr-dark), rgb(255,128,0))";
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
		this.totalRxValue.style.userSelect = "text";

		this.totalTxValue = document.createElement("div");
		this.totalTxValue.style.position = "absolute";
		this.totalTxValue.style.left = "114px";
		this.totalTxValue.style.top = "245px";
		this.totalTxValue.style.width = "100px";
		this.totalTxValue.style.color = "rgb(255,128,0)";
		this.totalTxValue.style.backgroundColor = "color-mix(in hsl shorter hue, var(--clr-dark) 50%, transparent 50%)";
		this.totalTxValue.style.borderRadius = "4px";
		this.totalTxValue.style.padding = "0 4px";
		this.totalTxValue.style.fontFamily = "monospace";
		this.totalTxValue.style.textAlign = "right";
		this.totalTxValue.style.lineHeight = "20px";
		this.totalTxValue.style.userSelect = "text";

		this.stats.append(this.totalRxLabel, this.totalTxLabel, this.totalRxValue, this.totalTxValue);

		this.rxRateLabel = document.createElement("div");
		this.rxRateLabel.textContent = "Rx rate:";
		this.rxRateLabel.style.position = "absolute";
		this.rxRateLabel.style.left = "260px";
		this.rxRateLabel.style.top = "220px";
		this.rxRateLabel.style.width = "80px";
		this.rxRateLabel.style.color = "light-dark(var(--clr-dark), rgb(122,212,43))";
		this.rxRateLabel.style.textAlign = "right";
		this.rxRateLabel.style.lineHeight = "20px";

		this.txRateLabel = document.createElement("div");
		this.txRateLabel.textContent = "Tx rate:";
		this.txRateLabel.style.position = "absolute";
		this.txRateLabel.style.left = "260px";
		this.txRateLabel.style.top = "245px";
		this.txRateLabel.style.width = "80px";
		this.txRateLabel.style.color = "light-dark(var(--clr-dark), rgb(255,128,0))";
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
		this.rxRateValue.style.userSelect = "text";

		this.txRateValue = document.createElement("div");
		this.txRateValue.style.position = "absolute";
		this.txRateValue.style.left = "350px";
		this.txRateValue.style.top = "245px";
		this.txRateValue.style.width = "100px";
		this.txRateValue.style.color = "rgb(255,128,0)";
		this.txRateValue.style.backgroundColor = "color-mix(in hsl shorter hue, var(--clr-dark) 50%, transparent 50%)";
		this.txRateValue.style.borderRadius = "4px";
		this.txRateValue.style.padding = "0 4px";
		this.txRateValue.style.fontFamily = "monospace";
		this.txRateValue.style.textAlign = "right";
		this.txRateValue.style.lineHeight = "20px";
		this.txRateValue.style.userSelect = "text";

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
				this.deleteButton.disabled = !this.canWrite;
				this.startButton.disabled = !this.canWrite || isRunning;
				this.stopButton.disabled = !this.canWrite || !isRunning;
				this.UpdateSelected();
			}
		});
	}

	Connect() {
		if (this.ws != null) {
			try {
				this.ws.close();
			}
			catch {}
		}

		this.reconnectSeparator.style.display = "none";
		this.reconnectButton.style.display = "none";

		this.ws = new WebSocket(`${KEEP.isSecure ? "wss" : "ws"}://${window.location.host}/ws/reverseproxy`);

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
					this.deleteButton.disabled = !this.canWrite;
					this.startButton.disabled = !this.canWrite || isRunning;
					this.stopButton.disabled = !this.canWrite || !isRunning;
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
					const ip = json.hosts[i].ip;

					if (!this.clientHistory[ip]) {
						this.clientHistory[ip] = [];
					}

					this.clientHistory[ip].push({rx: json.hosts[i].rx, tx: json.hosts[i].tx});

					if (this.clientHistory[ip].length > 50) {
						this.clientHistory[ip].shift();
					}

					if (this.clients[ip]) {
						const {element, canvas, ctx} = this.clients[ip];

						element.children[1].textContent = UI.SizeToString(json.hosts[i].rx);
						element.children[2].textContent = UI.SizeToString(json.hosts[i].tx);
						this.DrawClientMiniGraph(ip, canvas, ctx);
					}
					else {
						const element = document.createElement("div");
						element.style.position = "relative";
						element.style.height = "28px";
						element.style.padding = "2px 0";
						element.style.lineHeight = "28px";
						element.style.marginBottom = "2px";
						element.style.borderRadius = "2px";
						element.style.backgroundColor = "color-mix(in hsl shorter hue, var(--clr-dark) 50%, transparent 50%)";
						element.style.animation = "rise-in 0.2s ease-out 1";
						element.style.userSelect = "text";
						this.clientsList.appendChild(element);

						const name = document.createElement("div");
						name.textContent = ip;
						name.style.position = "absolute";
						name.style.color = "var(--clr-light)";
						name.style.left = "0";
						name.style.width = "33%";
						name.style.paddingLeft = "8px";
						name.style.overflow = "hidden";
						name.style.textOverflow = "ellipsis";
						name.style.whiteSpace = "nowrap";
						element.appendChild(name);

						const received = document.createElement("div");
						received.textContent = UI.SizeToString(json.hosts[i].rx);
						received.style.color = "rgb(122,212,43)";
						received.style.fontFamily = "monospace";
						received.style.position = "absolute";
						received.style.left = "33%";
						received.style.width = "20%";
						received.style.textAlign = "right";
						received.style.overflow = "hidden";
						received.style.textOverflow = "ellipsis";
						received.style.whiteSpace = "nowrap";
						element.appendChild(received);

						const transmitted = document.createElement("div");
						transmitted.textContent = UI.SizeToString(json.hosts[i].tx);
						transmitted.style.color = "rgb(255,128,0)";
						transmitted.style.fontFamily = "monospace";
						transmitted.style.position = "absolute";
						transmitted.style.left = "53%";
						transmitted.style.width = "20%";
						transmitted.style.textAlign = "right";
						transmitted.style.overflow = "hidden";
						transmitted.style.textOverflow = "ellipsis";
						transmitted.style.whiteSpace = "nowrap";
						element.appendChild(transmitted);

						const miniGraph = document.createElement("canvas");
						miniGraph.width = 100;
						miniGraph.height = 24;
						miniGraph.style.position = "absolute";
						miniGraph.style.right = "4px";
						miniGraph.style.top = "4px";
						miniGraph.style.width = "100px";
						miniGraph.style.height = "24px";
						element.appendChild(miniGraph);

						const miniCtx = miniGraph.getContext("2d");
						this.clients[ip] = {element, canvas: miniGraph, ctx: miniCtx};
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

	UpdateGraph(isSelect=false) {
		this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

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

			this.ctx.fillStyle = "rgb(255,128,0)";
			this.ctx.beginPath();
			this.ctx.arc(ReverseProxy.CANVAS_W - 56, ReverseProxy.CANVAS_H * (1 - txRate / this.maximum), 3, 0, 2*Math.PI, false);
			this.ctx.closePath();
			this.ctx.fill();

			this.ctx.fillStyle = "rgb(122,212,43)";
			this.ctx.beginPath();
			this.ctx.arc(ReverseProxy.CANVAS_W - 56, ReverseProxy.CANVAS_H * (1 - rxRate / this.maximum), 3, 0, 2*Math.PI, false);
			this.ctx.closePath();
			this.ctx.fill();
		}

		this.ctx.strokeStyle = "rgb(255,128,0)";
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

		this.ctx.strokeStyle = "rgb(122,212,43)";
		this.ctx.beginPath();
		for (let i = history.length-1; i >= 1; i--) {
			const delta = history[i].rx - history[i-1].rx;
			const rate = Math.round(delta / (this.args.interval / 1000));
			const x = ReverseProxy.CANVAS_W - 56 - (history.length - i - 1) * ReverseProxy.GAP - 2;
			const y = ReverseProxy.CANVAS_H * (1 - rate / this.maximum);
			this.ctx.lineTo(x, y);
		}
		this.ctx.stroke();
		this.ctx.closePath();

		if (this.ws !== null && this.ws.readyState === 1 && !isSelect) {
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
			this.clients = Object.create(null);
			this.clientHistory = Object.create(null);
			this.clientsList.textContent = "";
			this._tempSelect = guid;
		}

		this.UpdateGraph(true);

		if (this.isClosed || this.ws === null || this.ws.readyState !== 1) {
			return;
		}

		this.ws.send(`select=${guid}`);
	}

	DrawClientMiniGraph(ip, canvas, ctx) {
		const history = this.clientHistory[ip];
		if (!history || history.length < 2) return;

		canvas.width = canvas.width;

		const W = canvas.width;
		const H = canvas.height;
		const GAP = 2;

		let maxRate = 512;
		for (let i=1; i<history.length; i++) {
			const rxRate = Math.max(history[i].rx - history[i-1].rx, 0) / (this.args.interval / 1000);
			const txRate = Math.max(history[i].tx - history[i-1].tx, 0) / (this.args.interval / 1000);
			maxRate = Math.max(maxRate, rxRate, txRate);
		}

		if (maxRate === 0) return;

		ctx.lineWidth = 2;

		ctx.strokeStyle = "rgb(255,128,0)";
		ctx.beginPath();
		for (let i = history.length-1; i >= 1; i--) {
			const rate = Math.max(history[i].tx - history[i-1].tx, 0) / (this.args.interval / 1000);
			const x = W - (history.length - 1 - i) * GAP;
			const y = H * (1 - rate / maxRate);
			ctx.lineTo(x, y);
		}
		ctx.stroke();

		ctx.strokeStyle = "rgb(122,212,43)";
		ctx.beginPath();
		for (let i=history.length-1; i>=1; i--) {
			const rate = Math.max(history[i].rx - history[i-1].rx, 0) / (this.args.interval / 1000);
			const x = W - (history.length - 1 - i) * GAP;
			const y = H * (1 - rate / maxRate);
			ctx.lineTo(x, y);
		}
		ctx.stroke();
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
			return {data:Object.create(null), length:0};
		}
	}

	async GetReverseProxies() {
		try {
			const response = await fetch("rproxy/list");
			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const json = await response.json();
			if (json.error) throw(json.error);

			let length = 0;
			let data = Object.create(null);

			for (const key in json.data) {
				length++;

				let destination = ReverseProxy.IsL3(json.data[key].protocol)
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
					limits      : {v: json.data[key].limits},
					ipfilter    : {v: json.data[key].ipfilter},
				};
			}

			this.link = {data:data, length:length};
			this.limitsDefaults = json.defaults?.limits;
			this.ListProxies();

			return json;
		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/error.svg");
			return {data:Object.create(null), length:0};
		}
	}

	ListProxies() {
		this.list.textContent = "";

		for (let key in this.link.data) {
			const element = document.createElement("div");
			element.id = key;
			element.className = "list-element";
			this.list.appendChild(element);

			this.InflateElement(element, this.link.data[key]);

			if (this.args.select && this.args.select === key) {
				this.selected = element;
				element.style.backgroundColor = "var(--clr-select)";
				this.deleteButton.disabled = !this.canWrite;
			}
		}
	}

	EditDialog(entry=null, isRunning=false) {
		const dialog = this.DialogBox("480px");
		if (dialog === null) return;

		const {okButton, innerBox} = dialog;

		okButton.value = entry ? "Save" : "Create";

		const dialogBox = innerBox.parentElement;
		dialogBox.style.maxWidth = "640px";
		dialogBox.style.transition = ".2s";

		innerBox.style.padding = "16px 32px";
		innerBox.style.display = "grid";
		innerBox.style.gridTemplateColumns = "auto 200px minmax(50px, 250px ) auto";
		innerBox.style.alignItems = "center";

		const SumRows = rows=> rows.reduce((sum, row)=> sum + parseInt(row), 0);

		//grid rows in order, each a height or a function returning one. UpdateLayout sizes the grid and the dialog from them
		const tracks = [];
		const AddTrack = height=> tracks.push(height);

		const AddRow = (name, element, height="38px")=> {
			const row = AddTrack(height);

			const label = document.createElement("div");
			label.style.gridArea = `${row} / 2`;
			label.textContent = `${name}:`;

			element.style.gridArea = `${row} / 3`;

			innerBox.append(label, element);
		};

		const AddWideRow = (element, height)=> {
			const row = AddTrack(height);
			element.style.gridArea = `${row} / 2 / ${row} / 4`;
			innerBox.appendChild(element);
		};

		const AddParameter = (name, tag, type, properties, height)=> {
			const input = document.createElement(tag);
			if (type) {
				input.type = type;
			}

			for (let param in properties) {
				input[param] = properties[param];
			}

			AddRow(name, input, height);

			return input;
		};

		const autostartBox = document.createElement("div");
		AddWideRow(autostartBox, "40px");
		const autostartToggle = this.CreateToggle("Auto-start", false, autostartBox);

		const nameInput = AddParameter("Name", "input", "text");

		const protocolBox = new FewBox(ReverseProxy.PROTOCOLS);
		AddRow("Protocol", protocolBox.container);
		const IsL3 = ()=> ReverseProxy.IsL3(protocolBox.selected);

		const certsInput = AddParameter("Certificate", "select", null);

		(async ()=> {
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
		})();

		const passwordInput = AddParameter("Password", "input", "password", {placeholder: entry ? "unchanged" : ""});

		AddTrack("16px"); //separator

		const proxyAddressInput = AddParameter("Proxy address", "input", "text", {placeholder: "127.0.0.1"});
		const proxyPortInput = AddParameter("Proxy port", "input", "number", {"min":1, "max":65535, value:443});

		AddTrack("16px"); //separator

		const destinationAddressInput = AddParameter("Destination address", "input", "text", {placeholder: "127.0.0.1"});
		const destinationPortInput = AddParameter("Destination port", "input", "number", {"min":1, "max":65535, value:80}, ()=> IsL3() ? "38px" : "0px");
		const destinationPortLabel = destinationPortInput.previousSibling;

		//ip filtering, applies to all protocols
		const entryFilter = entry?.ipfilter?.v ?? {};
		let ipEntries = [...(entryFilter.entries ?? [])];

		AddTrack("16px"); //separator

		const ipEnableBox = document.createElement("div");
		AddWideRow(ipEnableBox, "40px");
		const ipEnableToggle = this.CreateToggle("IP filtering", entryFilter.enabled === true, ipEnableBox);

		//expands while the filter is enabled
		const ipBoxRows = ["36px", "36px", "160px"]; //mode, add, list
		const ipBox = document.createElement("div");
		ipBox.style.alignSelf = "start";
		ipBox.style.gridTemplateColumns = "72px auto";
		ipBox.style.gridTemplateRows = ipBoxRows.join(" ");
		ipBox.style.alignItems = "center";
		AddWideRow(ipBox, ()=> ipEnableToggle.checkbox.checked ? `${SumRows(ipBoxRows)}px` : "0px");

		const ipModeLabel = document.createElement("div");
		ipModeLabel.style.gridArea = "1 / 1";
		ipModeLabel.textContent = "Mode:";
		const ipModeBox = new FewBox(ReverseProxy.IP_FILTER_MODES);
		ipModeBox.container.style.gridArea = "1 / 2";
		ipModeBox.container.style.maxWidth = "200px";
		ipModeBox.Select(Math.max(ReverseProxy.IP_FILTER_MODES.findIndex(o=> o.toLowerCase() === entryFilter.mode), 0));
		ipBox.append(ipModeLabel, ipModeBox.container);

		const ipAddBox = document.createElement("div");
		ipAddBox.style.gridArea = "2 / 1 / 2 / 3";
		ipAddBox.style.display = "flex";
		ipAddBox.style.alignItems = "center";
		ipBox.appendChild(ipAddBox);

		const ipInput = document.createElement("input");
		ipInput.type = "text";
		ipInput.placeholder = "192.168.0.0/24 or 2001:db8::/32";
		ipInput.style.flex = "1";

		const ipAddButton = document.createElement("input");
		ipAddButton.type = "button";
		ipAddButton.value = "Add";
		ipAddButton.style.minWidth = "64px";
		ipAddBox.append(ipInput, ipAddButton);

		const ipList = document.createElement("div");
		ipList.style.gridArea = "3 / 1 / 3 / 3";
		ipList.style.alignSelf = "stretch";
		ipList.style.margin = "4px";
		ipList.style.border = "rgb(128,128,128) 1px solid";
		ipList.style.borderRadius = "4px";
		ipList.style.overflowY = "auto";
		ipBox.appendChild(ipList);

		const GetIpMode = ()=> ipModeBox.selected.toLowerCase();

		const RenderIpEntries = ()=> {
			ipList.textContent = "";

			if (ipEntries.length === 0) {
				const empty = document.createElement("div");
				empty.textContent = GetIpMode() === "whitelist" ? "No entries, every client is blocked" : "No entries";
				empty.style.padding = "8px";
				empty.style.opacity = ".7";
				empty.style.fontStyle = "italic";
				ipList.appendChild(empty);
				return;
			}

			for (const ipEntry of ipEntries) {
				const row = document.createElement("div");
				row.style.display = "flex";
				row.style.alignItems = "center";
				row.style.height = "32px";
				row.style.paddingLeft = "8px";

				const text = document.createElement("div");
				text.textContent = ipEntry;
				text.style.flex = "1";
				text.style.fontFamily = "monospace";
				text.style.overflow = "hidden";
				text.style.textOverflow = "ellipsis";
				text.style.userSelect = "text";

				const removeButton = document.createElement("input");
				removeButton.type = "button";
				removeButton.value = " ";
				removeButton.title = "Remove";
				removeButton.disabled = isRunning;
				removeButton.style.width = "28px";
				removeButton.style.minWidth = "28px";
				removeButton.style.height = "28px";
				removeButton.style.margin = "2px 4px";
				removeButton.style.backgroundImage = "url(mono/delete.svg?light)";
				removeButton.style.backgroundSize = "20px 20px";
				removeButton.style.backgroundPosition = "center";
				removeButton.style.backgroundRepeat = "no-repeat";
				removeButton.onclick = ()=> {
					ipEntries = ipEntries.filter(o=> o !== ipEntry);
					RenderIpEntries();
				};

				row.append(text, removeButton);
				ipList.appendChild(row);
			}
		};

		//adds the typed entries, comma or space separated. returns false if any is malformed, the server does the strict check
		const AddIpEntries = ()=> {
			const items = ipInput.value.split(/[\s,;]+/).filter(o=> o.length > 0);
			const isValid = items.every(o=> /^[0-9a-fA-F:.]+(\/\d{1,3})?$/.test(o) && /[.:]/.test(o));

			ipInput.required = !isValid;
			if (!isValid) {
				ipInput.focus();
				return false;
			}

			for (const item of items) {
				if (!ipEntries.includes(item)) ipEntries.push(item);
			}

			ipInput.value = "";
			RenderIpEntries();
			return true;
		};

		ipAddButton.onclick = ()=> {
			AddIpEntries();
			ipInput.focus();
		};

		ipInput.onkeydown = event=> {
			if (event.key === "Enter") {
				event.preventDefault();
				AddIpEntries();
			}
		};

		//onchange, not a listener: the toggle's label calls it directly on Enter and Space
		ipEnableToggle.checkbox.onchange = ()=> UpdateLayout();
		ipModeBox.container.onchange = RenderIpEntries;

		RenderIpEntries();

		//http limits, only visible for HTTP and HTTPS, collapsed by default
		const limitsInputs = Object.create(null);
		const entryLimits = entry?.limits?.v ?? this.limitsDefaults ?? {};
		let limitsExpanded = false;

		AddTrack(()=> IsL3() ? "0px" : "8px"); //separator

		const limitsHeader = document.createElement("div");
		limitsHeader.tabIndex = 0;
		limitsHeader.textContent = "Limits";
		limitsHeader.style.position = "relative";
		limitsHeader.style.paddingLeft = "24px";
		limitsHeader.style.fontWeight = "600";
		limitsHeader.style.lineHeight = "28px";
		limitsHeader.style.cursor = "pointer";
		limitsHeader.style.userSelect = "none";
		AddWideRow(limitsHeader, ()=> IsL3() ? "0px" : "32px");

		const limitsArrow = document.createElement("div");
		limitsArrow.style.position = "absolute";
		limitsArrow.style.left = "4px";
		limitsArrow.style.top = "9px";
		limitsArrow.style.border = "solid";
		limitsArrow.style.borderColor = "currentColor transparent";
		limitsArrow.style.borderWidth = "10px 7px 0 7px";
		limitsArrow.style.borderRadius = "2px";
		limitsArrow.style.transition = ".2s";
		limitsHeader.prepend(limitsArrow);

		const limitsRows = [];
		const limitsBox = document.createElement("div");
		limitsBox.style.alignSelf = "start";
		limitsBox.style.gridTemplateColumns = "200px 250px";
		limitsBox.style.alignItems = "center";
		AddWideRow(limitsBox, ()=> !IsL3() && limitsExpanded ? `${SumRows(limitsRows)}px` : "0px");

		limitsHeader.onclick = ()=> {
			limitsExpanded = !limitsExpanded;
			UpdateLayout();
		};

		limitsHeader.onkeydown = event=> {
			if (event.key === "Enter" || event.key === " ") {
				event.preventDefault();
				limitsHeader.onclick();
			}
		};

		//dividing by 1024 is exact, so the KB shown converts back to the same bytes
		const ToDisplayValue = (limit, value)=> {
			if (value === null || value === undefined) return "";
			return limit.kb ? value / 1024 : value;
		};

		const FromDisplayValue = (limit, text)=> {
			const value = parseFloat(text) * (limit.kb ? 1024 : 1);
			return limit.integer ? Math.round(value) : value;
		};

		for (const limit of ReverseProxy.HTTP_LIMITS) {
			if (limit.section) {
				limitsRows.push("32px");

				const section = document.createElement("div");
				section.textContent = limit.section;
				section.style.gridArea = `${limitsRows.length} / 1 / ${limitsRows.length} / 3`;
				section.style.fontWeight = "600";
				section.style.alignSelf = "end";
				limitsBox.appendChild(section);
				continue;
			}

			limitsRows.push("36px");

			const label = document.createElement("div");
			label.style.gridArea = `${limitsRows.length} / 1`;
			label.textContent = `${limit.label}:`;

			const input = document.createElement("input");
			input.type = "number";
			input.style.gridArea = `${limitsRows.length} / 2`;
			input.placeholder = limit.blank ?? "";
			input.value = ToDisplayValue(limit, entryLimits[limit.key]);
			input.step = limit.integer && !limit.kb ? 1 : "any";
			if ("min" in limit) input.min = ToDisplayValue(limit, limit.min);
			if ("max" in limit) input.max = ToDisplayValue(limit, limit.max);

			limitsBox.append(label, input);
			limitsInputs[limit.key] = input;
		}

		limitsBox.style.gridTemplateRows = limitsRows.join(" ");

		if (entry) {
			nameInput.value = entry.name.v;
			passwordInput.value = "";
			proxyAddressInput.value = entry.proxyaddr.v;
			proxyPortInput.value = entry.proxyport.v;
			destinationAddressInput.value = entry.destaddr.v;
			destinationPortInput.value = entry.destport.v;
			autostartToggle.checkbox.checked = entry.autostart.v;
		}

		protocolBox.Select(Math.max(ReverseProxy.PROTOCOLS.indexOf(entry?.protocol.v), 0));

		const UpdateLayout = ()=> {
			const protocol = protocolBox.selected;
			const isL3 = IsL3();

			certsInput.disabled = isRunning || protocol !== "HTTPS";
			passwordInput.disabled = isRunning || protocol !== "HTTPS";

			destinationAddressInput.placeholder = isL3 ? "127.0.0.1" : "https://example.com";

			destinationPortLabel.style.display = isL3 ? "initial" : "none";
			destinationPortInput.style.display = isL3 ? "initial" : "none";

			ipBox.style.display = ipEnableToggle.checkbox.checked ? "grid" : "none";

			limitsHeader.style.display = isL3 ? "none" : "block";
			limitsBox.style.display = isL3 || !limitsExpanded ? "none" : "grid";
			limitsArrow.style.transform = limitsExpanded ? "none" : "rotate(-90deg)";

			const rows = tracks.map(track=> typeof track === "function" ? track() : track);
			innerBox.style.gridTemplateRows = rows.join(" ");

			//rows, inner padding, buttons and dialog padding
			dialogBox.style.maxHeight = `${Math.max(SumRows(rows) + 32 + 52 + 48, 480)}px`;
		};

		protocolBox.container.onchange = UpdateLayout;
		UpdateLayout();

		if (isRunning) {
			nameInput.disabled = true;
			proxyAddressInput.disabled = true;
			proxyPortInput.disabled = true;
			destinationAddressInput.disabled = true;
			destinationPortInput.disabled = true;
			autostartToggle.checkbox.disabled = true;

			ipEnableToggle.checkbox.disabled = true;
			ipInput.disabled = true;
			ipAddButton.disabled = true;

			for (const fewBox of [protocolBox, ipModeBox]) {
				fewBox.container.inert = true;
				fewBox.container.style.opacity = ".6";
			}

			for (const key in limitsInputs) {
				limitsInputs[key].disabled = true;
			}

			dialog.okButton.disabled = true;
			dialog.cancelButton.value = "Close";

			setTimeout(()=>dialog.cancelButton.focus(), 200);
		}
		else {
			setTimeout(()=>nameInput.focus(), 200);
		}

		okButton.onclick = async ()=> {
			let requiredFieldMissing = false;
			let requiredFields = [nameInput, proxyAddressInput, proxyPortInput, destinationAddressInput, destinationPortInput];

			//an address typed but not added yet
			if (ipEnableToggle.checkbox.checked && ipInput.value.trim().length > 0) {
				if (!AddIpEntries()) return;
			}

			//limits don't apply to TCP and UDP, keep the previous ones, or the server uses its defaults
			let limitValues = entry?.limits?.v ?? null;

			if (!IsL3()) {
				limitValues = Object.create(null);

				for (const limit of ReverseProxy.HTTP_LIMITS) {
					if (limit.section) continue;

					const input = limitsInputs[limit.key];
					if (input.value.length === 0) {
						limitValues[limit.key] = null;
						if (!limit.blank) {
							requiredFields.push(input);
							if (!limitsExpanded) limitsHeader.onclick();
						}
					}
					else {
						limitValues[limit.key] = FromDisplayValue(limit, input.value);
					}
				}
			}

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
						protocol    : protocolBox.selected,
						certificate : certsInput.value === null || certsInput.value === "none" ? null : certsInput.value,
						password    : passwordInput.value,
						proxyaddr   : proxyAddressInput.value,
						proxyport   : parseInt(proxyPortInput.value),
						destaddr    : destinationAddressInput.value,
						destport    : parseInt(destinationPortInput.value),
						autostart   : autostartToggle.checkbox.checked,
						limits      : limitValues,
						ipfilter    : {
							enabled : ipEnableToggle.checkbox.checked,
							mode    : GetIpMode(),
							entries : ipEntries
						}
					})
				});

				if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

				const json = await response.json();
				if (json.error) throw (json.error);

				this.args.select = json.guid;
				this.GetReverseProxies();

				this.startButton.disabled = !this.canWrite;
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
				this.deleteButton.disabled = !this.canWrite;
				this.startButton.disabled = true;
				this.stopButton.disabled = !this.canWrite;
			}

			ReverseProxy.RUNNING.push(guid);

			return json;
		}
		catch (ex) {
			this.startButton.disabled = !this.canWrite;
			this.ConfirmBox(ex, true, "mono/error.svg");

			if (ex === "This proxy is already running") {
				ReverseProxy.RUNNING.push(guid);

				if (selected) {
					selected.style.backgroundImage = "url(mono/play.svg)";
					this.deleteButton.disabled = !this.canWrite;
					this.startButton.disabled = true;
					this.stopButton.disabled = !this.canWrite;
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
				this.deleteButton.disabled = !this.canWrite;
				this.startButton.disabled = !this.canWrite;
				this.stopButton.disabled = true;
			}

			const index = ReverseProxy.RUNNING.indexOf(guid);
			if (index > -1) {
				ReverseProxy.RUNNING.splice(index, 1);
			}

			return json;
		}
		catch (ex) {
			this.stopButton.disabled = !this.canWrite;
			this.ConfirmBox(ex, true, "mono/error.svg");

			if (ex === "This proxy is not running") {
				const index = ReverseProxy.RUNNING.indexOf(guid);
				if (index > -1) {
					ReverseProxy.RUNNING.splice(index, 1);
				}

				if (selected) {
					selected.style.backgroundImage = "url(mono/stop.svg)";
					this.deleteButton.disabled = !this.canWrite;
					this.startButton.disabled = !this.canWrite;
					this.stopButton.disabled = true;
				}
			}
		}
	}

	SetInterval() {
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
			if (this.ws !== null && this.ws.readyState === 1) {
				this.ws.send(`interval=${value}`);
			}
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
			this.deleteButton.disabled = !this.canWrite;
			this.startButton.disabled = !this.canWrite || isRunning;
			this.stopButton.disabled = !this.canWrite || !isRunning;
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
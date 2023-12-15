class Oversight extends Window {
	constructor(params) {
		super();
		this.params = params ?? { file: null };

		this.socket = null;
		this.link = LOADER.devices.data[this.params.file];

		this.AddCssDependencies("oversight.css");

		this.SetIcon("mono/oversight.svg");

		
		if (this.link.name && this.link.name.v.length > 0) {
			this.SetTitle(`Oversight - ${this.link.name.v}`);
		}
		else if (this.link.ip && this.link.ip.v.length > 0) {
			this.SetTitle(`Oversight - ${this.link.ip.v}`);
		}
		else {
			this.SetTitle("Oversight");
		}

		this.console = document.createElement("div");
		this.console.className = "oversight-console";
		this.content.appendChild(this.console);

		this.InitializeSubnetEmblem();
		this.InitializeSocketConnection();
	}

	InitializeSubnetEmblem() {
		if (this.emblem) {
			this.task.removeChild(this.emblem);
			this.emblem = null;
		}

		if (!this.link.ip) return;
		
		let colors = [];
		let ips = this.link.ip.v.split(";").map(o=>o.trim());
		
		for (let i=0; i<ips.length; i++) {
			if (!ips[i].match(DeviceView.regexIPv4)) { continue; }
			let split = ips[i].split(".").map(o=>parseInt(o));
			let n = split[0]*256*256*256 + split[1]*256*256 + split[2]*256 + split[3];

			for (let j=0; j<KEEP.zones.length; j++) {
				if (n < KEEP.zones[j].first || n > KEEP.zones[j].last) continue;
				colors.push(KEEP.zones[j].color);
			}
		}
		
		if (colors.length === 0) { return; }
		
		let gradient = "linear-gradient(";
		for (let i=0; i<colors.length; i++) {
			if (i > 0) {
				gradient += colors[i-1];
				gradient += ` ${100 * i / colors.length}%`;
				gradient += ", ";
			}

			gradient += colors[i];
			gradient += ` ${100 * i / colors.length}%`;
			if (i != colors.length - 1) {gradient += ","}
		}
		gradient += `, ${colors[colors.length-1]} 100%`;
		gradient += ")";
		
		this.emblem = document.createElement("div");
		this.emblem.className = "task-icon-emblem";
		this.task.appendChild(this.emblem);

		const emblemInner = document.createElement("div");
		emblemInner.style.background = gradient;
		this.emblem.appendChild(emblemInner);
	}

	InitializeSocketConnection() {
		if (this.socket !== null) return;

		let server = window.location.href.replace("https://", "").replace("http://", "");
		if (server.indexOf("/") > 0) server = server.substring(0, server.indexOf("/"));

		this.socket = new WebSocket((KEEP.isSecure ? "wss://" : "ws://") + server + "/ws/oversight");

		this.socket.onopen = event=> {
			this.ConsoleLog("connection established", "info");
		};

		this.socket.onmessage = event=> {

		};

		this.socket.onclose = event=> {
			this.ConsoleLog("connection closed", "info");
		};

		this.socket.onerror = event=> {
			this.ConsoleLog(`socket error`, "error");
		};
	}

	ConsoleLog(text, level) {
		const line = document.createElement("div");
		line.className = "oversight-console-line";
		line.innerText = text;

		switch (level) {
			case "info"   : line.style.backgroundImage = "url(mono/info.svg?light)"; break;
			case "warning": line.style.backgroundImage = "url(mono/warning.svg?light)"; break;
			case "error"  : line.style.backgroundImage = "url(mono/error.svg?light)"; break;
		}

		this.console.appendChild(line);
	}

}
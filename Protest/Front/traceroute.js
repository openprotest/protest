class TraceRoute extends Console {
	constructor(args) {
		super();

		this.args = args ? args : { entries: [] };

		this.AddCssDependencies("tools.css");

		this.hashtable = {}; //contains all the ping elements
		this.pending = [];   //pending request
		this.ws = null;      //websocket

		this.taskSpinner = document.createElement("div");
		this.taskSpinner.className = "task-spinner";
		this.taskSpinner.style.display = "none";
		this.task.appendChild(this.taskSpinner);

		this.SetTitle("Trace route");
		this.SetIcon("mono/traceroute.svg");

		this.SetupToolbar();
		this.clearButton = this.AddToolbarButton("Clear", "mono/wing.svg?light");
		this.AddSendToChatButton();

		if (this.args.entries) { //restore entries from previous session
			let temp = this.args.entries;
			this.args.entries = [];
			for (let i = 0; i < temp.length; i++)
				this.Push(temp[i]);
		}

		this.clearButton.addEventListener("click", event=> {
			const okButton = this.ConfirmBox("Are you sure you want to clear the list?");
			if (okButton) okButton.addEventListener("click", ()=> {
				this.args.entries = [];
				this.list.textContent = "";
				this.hashtable = {};
				this.pending = [];
			});
		});
	}

	Push(name) { //overrides
		if (!super.Push(name)) return;
		this.Filter(name);
	}

	Close() { //overrides
		super.Close();
		if (this.ws != null) this.ws.close();
	}

	Filter(hostname) {
		if (hostname.indexOf(";", 0) > -1) {
			let ips = hostname.split(";");
			for (let i = 0; i < ips.length; i++) this.Filter(ips[i].trim());
		}
		else if (hostname.indexOf(",", 0) > -1) {
			let ips = hostname.split(",");
			for (let i = 0; i < ips.length; i++) this.Filter(ips[i].trim());
		}
		else if (hostname.indexOf("-", 0) > -1) {
			let split = hostname.split("-");
			let start = split[0].trim().split(".");
			let end = split[1].trim().split(".");

			if (start.length == 4 && end.length == 4 && start.every(o=> !isNaN(o)) && end.every(o=> !isNaN(o))) {
				let istart = (parseInt(start[0]) << 24) + (parseInt(start[1]) << 16) + (parseInt(start[2]) << 8) + (parseInt(start[3]));
				let iend = (parseInt(end[0]) << 24) + (parseInt(end[1]) << 16) + (parseInt(end[2]) << 8) + (parseInt(end[3]));

				if (istart > iend) iend = istart;
				if (iend - istart > 1024) iend = istart + 1024;

				function intToBytes(int) {
					let b = [0, 0, 0, 0];
					let i = 4;
					do {
						b[--i] = int & (255);
						int = int >> 8;
					} while (i);
					return b;
				}
				for (let i = istart; i <= iend; i++)
					this.Add(intToBytes(i).join("."));
			}
			else {
				this.Add(hostname);
			}
		}
		else if (hostname.indexOf("/", 0) > -1) {
			let cidr = parseInt(hostname.split("/")[1].trim());
			if (isNaN(cidr)) return;

			let ip = hostname.split("/")[0].trim();
			let ipBytes = ip.split(".");
			if (ipBytes.length != 4) return;

			ipBytes = ipBytes.map(o=> parseInt(o));

			if (cidr < 16) cidr = 16;
			if (cidr > 32) cidr = 32;

			let bits = "1".repeat(cidr).padEnd(32, "0");
			let mask = [];
			mask.push(parseInt(bits.slice(0, 8), 2));
			mask.push(parseInt(bits.slice(8, 8), 2));
			mask.push(parseInt(bits.slice(16, 8), 2));
			mask.push(parseInt(bits.slice(24, 8), 2));

			let net = [], broadcast = [];
			for (let i = 0; i < 4; i++) {
				net.push(ipBytes[i] & mask[i]);
				broadcast.push(ipBytes[i] | (255 - mask[i]));
			}

			this.Filter(net.join(".") + " - " + broadcast.join("."));
		}
		else {
			this.Add(hostname);
		}
	}

	Add(hostname) {
		if (hostname in this.hashtable) {
			this.list.appendChild(this.hashtable[hostname].element);
			return;
		}

		let element = document.createElement("div");
		element.className = "tool-element";
		this.list.appendChild(element);

		let expandedButton = document.createElement("div");
		expandedButton.className = "tool-button-expanded";
		element.appendChild(expandedButton);

		let name = document.createElement("div");
		name.className = "tool-label";
		name.style.paddingLeft = "24px";
		name.textContent = hostname;
		element.appendChild(name);

		let result = document.createElement("div");
		result.className = "tool-result collapsed";
		result.textContent = "";
		element.appendChild(result);

		let status = document.createElement("div");
		status.className = "tool-status";
		status.textContent = "";
		element.appendChild(status);

		let remove = document.createElement("div");
		remove.className = "tool-remove";
		element.appendChild(remove);

		this.hashtable[hostname] = {
			element: element,
			result: result,
			status: status,
			expanded: false,
			list: []
		};

		remove.onclick = ()=> this.Remove(hostname);

		expandedButton.onclick = ()=> {
			if (this.hashtable[hostname].expanded) {
				this.hashtable[hostname].expanded = false;
				element.style.height = "32px";
				expandedButton.style.transform = "rotate(-90deg)";
				result.className = "tool-result collapsed";
				result.scrollTop = 0;
			}
			else {
				this.hashtable[hostname].expanded = true;
				element.style.height = "auto";
				expandedButton.style.transform = "rotate(0deg)";
				result.className = "tool-result expanded enumerated";
			}
		};

		expandedButton.onclick();

		this.args.entries.push(hostname);

		this.pending.push(hostname);

		if (this.ws != null && this.ws.readyState === 1) { //ready
			this.ws.send(hostname);
		}
		else if (this.ws === null || (this.ws != null && this.ws.readyState != 0)) { //not connecting
			this.Connect();
		}

		this.UpdateTaskSpinner();
	}

	Remove(hostname) {
		if (!(hostname in this.hashtable)) return;
		this.list.removeChild(this.hashtable[hostname].element);
		delete this.hashtable[hostname];

		if (this.pending.includes(hostname)) this.pending.splice(this.pending.indexOf(hostname), 1);

		if (this.pending.length === 0)
			if (this.ws != null && this.ws.readyState === 1) this.ws.close();

		const index = this.args.entries.indexOf(hostname);
		if (index > -1)
			this.args.entries.splice(index, 1);

		this.UpdateTaskSpinner();
	}

	Connect() {
		let server = window.location.href.replace("https://", "").replace("http://", "");
		if (server.indexOf("/") > 0) server = server.substring(0, server.indexOf("/"));

		if (this.ws != null) {
			try {
				this.ws.close();
			}
			catch { };
		}

		this.ws = new WebSocket((KEEP.isSecure ? "wss://" : "ws://") + server + "/ws/traceroute");

		this.ws.onopen = ()=> {
			for (let i = 0; i < this.pending.length; i++)
				this.ws.send(this.pending[i]);

			for (let i = 0; i < this.list.childNodes.length; i++) //remove warnings, if exist
				if (this.list.childNodes[i].id == "self_destruct")
					this.list.removeChild(this.list.childNodes[i]);
		};

		this.ws.onclose = ()=> {
			if (this.pending.length === 0) return;

			const error_message = document.createElement("div");
			error_message.id = "self_destruct";
			error_message.textContent = "Connection is closed. Click to reconnect";
			error_message.style.color = "var(--clr-accent)";
			error_message.style.backgroundColor = "rgb(48,48,48)";
			error_message.style.cursor = "pointer";
			error_message.style.textAlign = "center";
			error_message.style.borderRadius = "4px";
			error_message.style.margin = "8px auto";
			error_message.style.padding = "8px";
			error_message.style.maxWidth = "320px";
			error_message.style.animation = "fade-in .4s 1";
			this.list.appendChild(error_message);
			this.list.scrollTop = this.list.scrollHeight;

			error_message.onclick = ()=> {
				this.list.querySelectorAll("#self_destruct").forEach(o=> this.list.removeChild(o));
				this.Connect();
			};
		};

		this.ws.onerror = error=> console.error(error);

		this.ws.onmessage = event=> {
			let split = event.data.split(String.fromCharCode(127));
			let name = split[0];

			if (name == "over" || name == "unreachable") {
				name = split[1];
				if (name in this.hashtable) {
					this.hashtable[name].status.style.visibility = "hidden";
					if (this.pending.includes(name)) this.pending.splice(this.pending.indexOf(name), 1);
				}
				this.UpdateTaskSpinner();
			}
			else if (name == "[hostnames]") {
				let target = split[1];
				if (target in this.hashtable) {
					for (let i = 2; i < split.length; i += 2)
						for (let j = 0; j < this.hashtable[target].result.childNodes.length; j++)
							if (this.hashtable[target].result.childNodes[j].textContent.trim() === split[i]) {
								this.hashtable[target].result.childNodes[j].className = "tool-after-label";
								this.hashtable[target].result.childNodes[j].setAttribute("after-label", split[i + 1]);
								break;
							}
				}
			}
			else {
				if (name in this.hashtable) {
					const hop = document.createElement("div");
					hop.textContent = split[1];
					this.hashtable[name].result.appendChild(hop);
				}
			}
		};
	}

	UpdateTaskSpinner() {
		this.taskSpinner.style.display = (this.pending.length === 0) ? "none" : "initial";
	}
}
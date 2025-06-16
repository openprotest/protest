class PortScan extends Console {
	static PROTOCOL = {
		1: "TCPMUX	TCP Port Service Multiplexer",
		5: "RJE	Remote Job Entry",
		7: "Echo",
		13: "Daytime	Daytime Protocol",
		17: "QOTD	Quote of the Day",
		18: "MSP	Message Send Protocol",
		19: "CHARGEN	Character Generator Protocol",
		20: "FTP	File Transfer Protocol - data",
		21: "FTP	File Transfer Protocol - control",
		22: "SSH	Secure Shell",
		23: "Telnet",
		25: "SMTP	Simple Message Transfer Protocol",
		26: "RSFTP",
		37: "TimeP	Time Protocol",
		38: "RAP	Route Access Protocol",
		39: "RLP	Resource Location Protocol",
		42: "WINS	Windows Internet Name Service",
		43: "WHOIS	Who Is Protocol",
		49: "TACACS	Terminal Access Controller Access-Control System",
		53: "DNS	Domain Name Server",
		57: "MTP	Mail Transfer Protocol",
		67: "DHCP	Dynamic Host Configuration Protocol",
		69: "TFTP, Trivial File Transfer Protocol",
		70: "Gopher	Gopher Protocol",
		71: "NETRJS	Remote Job Entry",
		72: "NETRJS	Remote Job Entry",
		73: "NETRJS	Remote Job Entry",
		74: "NETRJS	Remote Job Entry",
		79: "Finger",
		80: "HTTP	Hypertext Transfer Protocol",
		81: "TOR	The Onion Router",
		88: "Kerberos	Kerberos authentication system",
		92: "NPP	Network Printing Protocol",
		109: "POP2	Post Office Protocol",
		110: "POP3	Post Office Protocol",
		111: "ONC RPC	Open Network Computing Remote Procedure Call",
		118: "SQL	Structured Query Language Services",
		119: "NNTP	Network News Transfer Protocol",
		123: "NTP	Network Time Protocol",
		135: "RPC	Remote Procedure Call",
		137: "NetBIOS	Name Service",
		139: "NetBIOS	Session Service",
		143: "IMAP	Internet Message Access Protocol",
		153: "SGMP	Simple Gateway Monitoring Protocol",
		156: "SQL	Structured Query Language Service",
		158: "DMSP	Distributed Mail Service Protocol",
		170: "Print server",
		179: "BGP	 Border Gateway Protocol",
		194: "IRC	Internet Relay Chat",
		213: "IPX	Internetwork Packet Exchange",
		218: "MPP	Message posting protoacol",
		220: "IMAP	Internet Message Access Protocol",
		259: "ESRO	Efficient Short Remote Operations",
		264: "BGMP	Border Gateway Multicast Protocol",
		318: "TSP	Time Stamp Protocol",
		387: "AURP	AppleTalk Update-based Routing Protocol",
		389: "LDAP	Lightweight Directory Access Protocol",
		401: "UPS	Uninterruptible Power Supply",
		427: "SLP	Service Location Protocol",
		443: "HTTP over SSL/TSL",
		444: "SNPP	Simple Network Paging Protocol",
		445: "SMB	Server Message Block",
		514: "Syslog",
		515: "LPD	TCP/IP Print Server",
		524: "NCP",
		540: "UUCP	Unix-to-Unix Copy Protocol",
		547: "DHCPv6",
		548: "AFP	Apple Filing Protocol",
		554: "RTSP	Real Time Streaming Protocol",
		563: "NNTP	protocol over TLS/SSL",
		587: "MSA	Message Aubmission Agent",
		625: "ODProxy	Open Directory Proxy",
		631: "IPP	Internet Printing Protocol",
		636: "LDAP over SSL/TSL",
		639: "MSDP	Multicast Source Discovery Protocol",
		646: "LDP	Label Distribution Protocol",
		647: "DHCP	Failover Protocol",
		648: "RRP	Registry Registrar Protocol",
		652: "DTCP	Dynamic Tunnel Configuration Protocol",
		674: "ACAP	Application Configuration Access Protocol",
		691: "MS Exchange Routing",
		695: "IEEE-MMS-SSL",
		698: "OLSR	Optimized Link State Routing",
		699: "Access Network",
		700: "EPP	Extensible Provisioning Protocol",
		701: "LMP	Link Management Protocol",
		702: "IRIS over BEEP",
		706: "SILC	Secure Internet Live Conferencing",
		711: "TDP	Tag Distribution Protocol",
		712: "TBRPF	Topology Broadcast based on Reverse-Path Forwarding",
		720: "SMQP	Simple Message Queue Protocol",
		829: "CMP	Certificate Management Protocol",
		853: "DNS over SSL/TSL",
		901: "SWAT	Samba Web Administration Tool",
		902: "VMware Server",
		989: "FTPS over SSL/TSL	File Transfer Protocol - data",
		990: "FTPS over SSL/TSL	File Transfer Protocol - control",
		992: "Telnet over SSL/TSL",
		993: "IMAP over SSL/TSL",
		995: "POP3 over SSL/TSL",
		1433: "MS-SQL	Microsoft SQL server",
		2049: "NFS	Network File System",
		3260: "iSCSI",
		3269: "LDAP over SSL",
		3306: "MySQL",
		3389: "RDP	Remote Desktop Protocol",
		5432: "PostgreSQL",
		5500: "VNC	Virtual Network Computer",
		5656: "UniFi AP-EDU broadcasting",
		5657: "UniFi AP-EDU broadcasting",
		5658: "UniFi AP-EDU broadcasting",
		5659: "UniFi AP-EDU broadcasting",
		5800: "VNC	Virtual Network Computer",
		5801: "VNC	Virtual Network Computer",
		5900: "VNC	Virtual Network Computer",
		5901: "uVNC	Virtual Network Computer",
		5902: "uVNC	Virtual Network Computer",
		5903: "uVNC	Virtual Network Computer",
		6666: "UniFi Camera Stream Listenner",
		6789: "UniFi Mobile Speed Test",
		6969: "BitTorrent tracker",
		7004: "UniFi UVC-Micro Talkback",
		7442: "UniFi Camera Management",
		7447: "UniFi RTSP, Real Time Streaming Protocol",
		7680: "WUDO	Windows Update Delivery Optimization",
		8080: "HTTP alternate	Hypertext Transfer Protocol",
		8291: "Mikrotik RouterOS Winbox",
		8443: "HTTP over SSL/TSL alternate",
		8530: "WSUS	Windows Server Update Services",
		8531: "WSUS	Windows Server Update Services over SSL/TSL",
		8728: "Mikrotik RouterOS API",
		8729: "Mikrotik RouterOS API over SSL/TSL",
		9100: "Print Server",
		10000: "NDMP	Network Data Management Protocol",
		10001: "UniFi Discovery Service"
	};

	constructor(args) {
		super();

		this.args = args ?? {
			entries: [],
			rangeFrom: 1,
			rangeTo: 1023,
			timeout: 2000,
			useNetstat: false
		};

		this.AddCssDependencies("tools.css");

		this.hashtable = {};  //contains all the ping elements
		this.pending = [];    //pending request
		this.ws = null;       //websocket

		this.taskSpinner = document.createElement("div");
		this.taskSpinner.className = "task-spinner";
		this.taskSpinner.style.display = "none";
		this.task.appendChild(this.taskSpinner);

		this.SetTitle("TCP port scan");
		this.SetIcon("mono/portscan.svg");

		this.SetupToolbar();
		this.rescanButton = this.AddToolbarButton("Re-scan", "mono/restart.svg?light");
		this.clearButton = this.AddToolbarButton("Clear", "mono/wing.svg?light");
		this.optionsButton = this.AddToolbarButton("Options", "mono/wrench.svg?light");
		this.copyButton = this.AddToolbarButton("Copy", "mono/copy.svg?light");
		this.toolbar.appendChild(this.AddToolbarSeparator());
		this.AddSendToChatButton();

		if (this.args.entries) { //restore entries from previous session
			let temp = this.args.entries;
			this.args.entries = [];
			for (let i = 0; i < temp.length; i++) {
				this.Push(temp[i]);
			}
		}

		this.rescanButton.onclick = ()=> this.Rescan();

		this.clearButton.addEventListener("click", ()=> {
			const okButton = this.ConfirmBox("Are you sure you want to clear the list?");
			if (okButton) okButton.addEventListener("click", ()=> this.ClearAll());
		});

		this.optionsButton.onclick = ()=> this.OptionsDialog();

		this.copyButton.addEventListener("click", ()=> {
			const argsCopy = structuredClone(this.args);
			argsCopy.entries = [];
			const copy = new PortScan(argsCopy);
			const dialog = copy.OptionsDialog();

			dialog.okButton.addEventListener("click", ()=> {
				for (let i = 0; i < this.args.entries.length; i++) {
					copy.Add(this.args.entries[i]);
				}
			});

			dialog.cancelButton.addEventListener("click", ()=> {
				copy.Close();
			});
		});
	}

	Close() { //overrides
		super.Close();
		if (this.ws != null) this.ws.close();
	}

	OptionsDialog() {
		const dialog = this.DialogBox("240px");
		if (dialog === null) return;

		const {okButton, innerBox} = dialog;

		innerBox.style.padding = "20px";
		innerBox.style.display = "grid";
		innerBox.style.gridTemplateColumns = "auto 120px 110px 20px 110px auto";
		innerBox.style.gridTemplateRows = "repeat(3, 44px)";
		innerBox.style.alignItems = "center";

		//innerBox.style.textAlign = "center";

		innerBox.parentElement.style.maxWidth = "520px";

		const fromLabel = document.createElement("div");
		fromLabel.textContent = "Port range:";
		fromLabel.style.gridArea = "1 / 2";

		const fromInput = document.createElement("input");
		fromInput.type = "number";
		fromInput.min = 1;
		fromInput.max = 65535;
		fromInput.value = this.args.rangeFrom;
		fromInput.style.gridArea = "1 / 3";

		const toLabel = document.createElement("div");
		toLabel.textContent = " to ";
		toLabel.style.gridArea = "1 / 4";

		const toInput = document.createElement("input");
		toInput.type = "number";
		toInput.min = 1;
		toInput.max = 65535;
		toInput.value = this.args.rangeTo;
		toInput.style.gridArea = "1 / 5";
		innerBox.append(fromLabel, fromInput, toLabel, toInput);

		const timeoutLabel = document.createElement("div");
		timeoutLabel.textContent = "Timeout (ms):";
		timeoutLabel.style.gridArea = "2 / 2";

		const timeoutInput = document.createElement("input");
		timeoutInput.type = "number";
		timeoutInput.value = this.args.timeout;
		timeoutInput.min = 50;
		timeoutInput.max = 30_000;
		timeoutInput.style.gridArea = "2 / 3";

		innerBox.append(timeoutLabel, timeoutInput);

		const remoteNetStatBox = document.createElement("div");
		remoteNetStatBox.style.gridArea = "3 / 6 / 3 / 2";
		innerBox.append(remoteNetStatBox);

		const remoteNetStaToggle = this.CreateToggle("Use remote netstat", this.args.useNetstat, remoteNetStatBox);

		fromInput.onchange = ()=> {
			if (parseInt(fromInput.value) >= parseInt(toInput.value)) {
				toInput.value = parseInt(fromInput.value);
			}
		};

		toInput.onchange = ()=> {
			if (parseInt(fromInput.value) >= parseInt(toInput.value)) {
				fromInput.value = parseInt(toInput.value);
			}
		};

		okButton.onclick = ()=> {
			this.args.rangeFrom = parseInt(fromInput.value);
			this.args.rangeTo = parseInt(toInput.value);
			this.args.timeout = parseInt(timeoutInput.value);
			this.args.useNetstat = remoteNetStaToggle.checkbox.checked;
			dialog.Close();
		};

		setTimeout(()=>fromInput.focus(), 200);

		return dialog;
	}

	Push(name) { //overrides
		if (!super.Push(name)) return;
		this.Filter(name);
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

			if (start.length === 4 && end.length === 4 && start.every(o=> !isNaN(o)) && end.every(o=> !isNaN(o))) {
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
			if (isNaN(cidr) || cidr < 16 || cidr > 32) return;

			let ip = hostname.split("/")[0].trim();
			let ipBytes = ip.split(".");
			if (ipBytes.length != 4) return;

			ipBytes = ipBytes.map(o=> parseInt(o));

			let bits = "1".repeat(cidr).padEnd(32, "0");
			let mask = [];
			mask.push(parseInt(bits.slice(0, 8), 2));
			mask.push(parseInt(bits.slice(8, 16), 2));
			mask.push(parseInt(bits.slice(16, 24), 2));
			mask.push(parseInt(bits.slice(24, 32), 2));

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
		if (hostname === "__proto__") return;

		if (hostname in this.hashtable) {
			this.list.appendChild(this.hashtable[hostname].element);
			return;
		}

		const element = document.createElement("div");
		element.className = "tool-element";
		this.list.appendChild(element);

		const expandedButton = document.createElement("div");
		expandedButton.className = "tool-button-expanded";
		element.appendChild(expandedButton);

		const name = document.createElement("div");
		name.className = "tool-label";
		name.style.paddingLeft = "24px";
		name.textContent = hostname;
		element.appendChild(name);

		const result = document.createElement("div");
		result.className = "tool-result collapsed";
		result.textContent = "";
		element.appendChild(result);

		const status = document.createElement("div");
		status.className = "tool-status";
		status.textContent = "";
		element.appendChild(status);

		const remove = document.createElement("div");
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
				result.className = "tool-result expanded";
			}
		};

		this.args.entries.push(hostname);

		this.pending.push(hostname);

		if (this.ws != null && this.ws.readyState === 1) { //ready
			this.ws.send(`${hostname};${this.args.rangeFrom};${this.args.rangeTo};${this.args.timeout};${this.args.useNetstat}`);
		}
		else if (this.ws === null || (this.ws != null && this.ws.readyState != 0)) { //not connecting
			this.Connect();
		}

		this.UpdateTaskSpinner();
	}

	Remove(hostname) {
		if (hostname === "__proto__") return;

		if (!(hostname in this.hashtable)) return;
		this.list.removeChild(this.hashtable[hostname].element);
		delete this.hashtable[hostname];

		if (this.pending.includes(hostname)) this.pending.splice(this.pending.indexOf(hostname), 1);

		if (this.pending.length === 0 && this.ws != null && this.ws.readyState === 1) {
			this.ws.close();
		}

		const index = this.args.entries.indexOf(hostname);
		if (index > -1)
			this.args.entries.splice(index, 1);

		this.UpdateTaskSpinner();
	}

	ClearAll(){
		this.args.entries = [];
		this.list.textContent = "";
		this.hashtable = {};
		this.pending = [];
		this.UpdateTaskSpinner();
	}

	Rescan() {
		let temp = this.args.entries;
		this.ClearAll();

		if (this.ws != null && this.ws.readyState === 1) {
			this.ws.close();
		}

		setTimeout(()=>{
			for (let i=0; i<temp.length; i++) {
				this.Push(temp[i]);
			}
		}, 250);
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

		this.ws = new WebSocket((KEEP.isSecure ? "wss://" : "ws://") + server + "/ws/portscan");

		this.ws.onopen = ()=> {
			for (let i = 0; i < this.pending.length; i++) {
				this.ws.send(`${this.pending[i]};${this.args.rangeFrom};${this.args.rangeTo};${this.args.timeout};${this.args.useNetstat}`);
			}

			for (let i = 0; i < this.list.childNodes.length; i++) { //remove warnings, if any
				if (this.list.childNodes[i].id === "self_destruct")
					this.list.removeChild(this.list.childNodes[i]);
			}
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

			for (const key in this.hashtable) {
				this.hashtable[key].status.style.visibility = "hidden";
			}

			this.taskSpinner.style.display = "none";

			error_message.onclick = ()=> {
				this.list.querySelectorAll("#self_destruct").forEach(o=> this.list.removeChild(o));
				this.Connect();

				this.UpdateTaskSpinner();
				for (const key in this.hashtable) {
					if (this.pending.includes(key)) {
						this.hashtable[key].status.style.visibility = "visible";
					}
				}
			};
		};

		this.ws.onerror = error=> console.error(error);

		this.ws.onmessage = event=> {
			let split = event.data.split(String.fromCharCode(127));
			let name = split[0];

			if (name === "over") {
				this.ws.close();
			}

			if (name === "unreachable") {
				let msg = document.createElement("div");
				msg.textContent = "Unreachable";
				msg.style.color = "var(--clr-theme)";
				this.hashtable[split[1]].result.appendChild(msg);
			}

			if (name === "done" || name === "unreachable") {
				name = split[1];
				if (name in this.hashtable) {
					this.hashtable[name].status.style.visibility = "hidden";
					if (this.pending.includes(name)) this.pending.splice(this.pending.indexOf(name), 1);
				}

				this.UpdateTaskSpinner();
			}
			else {
				if (name in this.hashtable)
					for (let i = 1; i < split.length; i++) {
						if (split[i].length === 0) continue;

						const port = document.createElement("div");
						port.textContent = split[i];
						this.hashtable[name].result.appendChild(port);
						if (parseInt(split[i]) in PortScan.PROTOCOL) {
							port.className = "tool-after-label";
							port.setAttribute("after-label", PortScan.PROTOCOL[parseInt(split[i])]);
						}

						this.hashtable[name].list.push(split[i]);
					}
			}
		};
	}

	UpdateTaskSpinner() {
		this.taskSpinner.style.display = (this.pending.length === 0) ? "none" : "initial";
	}
}
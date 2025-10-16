class DhcpDiscover extends Window {

	static DEFAULT_OPTIONS = [0x01, 0x03, 0x04, 0x06, 0x0f, 0x1f, 0x21, 0x2a, 0x2b, 0x2c, 0x2e, 0x2f, 0x77, 0x79];

	static OPTION_NAME = {
	1: "Subnet mask",
	2: "Time offset",
	3: "Router",
	4: "Time server",
	5: "Name server",
	6: "Domain server",
	7: "Log server",
	8: "Quotes server",
	9: "LPR server",
	10: "Impress server",
	11: "RLP server",
	12: "Hostname",
	13: "Boot file size",
	14: "Merit dump file",
	15: "Domain name",
	16: "Swap server",
	17: "Root Path",
	18: "Extension file",
	19: "Forward on/off",
	20: "SrcRte on/off",
	21: "Policy filter",
	22: "Max DG assembly",
	23: "Default IP TTL",
	24: "MTU timeout",
	25: "MTU plateau",
	26: "MTU interface",
	27: "MTU subnet",
	28: "Broadcast address",
	29: "Mask discovery",
	30: "Mask supplier",
	31: "Router discovery",
	32: "Router request",
	33: "Static route",
	34: "Trailers",
	35: "ARP timeout",
	36: "Ethernet",
	37: "Default TCP TTL",
	38: "Keepalive time",
	39: "Keepalive data",
	40: "NIS domain",
	41: "NIS servers",
	42: "NTP servers",
	43: "Vendor specific",
	44: "NetBIOS servers",
	45: "NetBIOS over TCP/IP servers",
	46: "NetBIOS node type",
	47: "NetBIOS scope ID",
	48: "X Window font",
	49: "X Window manager",
	50: "Address request",
	51: "Address time",
	52: "Overload",
	53: "DHCP message type",
	54: "DHCP server ID ",
	55: "Parameter list",
	56: "DHCP message",
	57: "DHCP max message size",
	58: "Renewal time",
	59: "Rebinding time",
	60: "Class ID",
	61: "Client ID",
	62: "NetWare/IP domain",
	63: "NetWare/IP option",
	64: "NIS+ domain name",
	65: "NIS+ servers",
	66: "Boot server",
	67: "Boot file",
	68: "Home agent IP",
	69: "SMTP servers",
	70: "POP3 servers",
	71: "NNTP servers",
	72: "WWW servers",
	73: "Finger servers",
	74: "IRC servers",
	75: "StreetTalk servers",
	76: "STDA servers",
	77: "User class",
	78: "Directory agent",
	79: "Service scope",
	80: "Rapid commit",
	81: "Client FQD",
	82: "Relay agent info",
	83: "iSNS",
	85: "NDS servers",
	86: "NDS tree name",
	87: "NDS context",
	88: "BCMCS domain name list",
	89: "BCMCS IPv4 address",
	90: "Authentication",
	91: "client last transaction time",
	92: "associated ip",
	93: "Client system",
	94: "Client NDI",
	95: "LDAP",
	97: "UUID/GUID",
	98: "User Auth",
	99: "GEOCONF CIVIC",
	100: "PCode",
	101: "TCode",
	108: "IPv6 only preferred",
	109: "OPTION_DHCP4O6_S46_SADDR",
	112: "Netinfo address",
	113: "Netinfo tag",
	114: "DHCP captive portal",
	116: "Auto config",
	117: "Name service search",
	118: "Subnet selection",
	119: "Domain search",
	120: "SIP servers DHCP",
	121: "Classless static route",
	122: "CCC",
	123: "GeoConf",
	124: "V-I vendor class",
	125: "V-I vendor specific info",
	};

	constructor(args) {
		super();
		this.SetTitle("DHCP client");
		this.SetIcon("mono/dhcp.svg");

		this.args = args ?? {
			timeout: 5000,
			hostname: "",
			mac: "",
			accept: false,
			options: DhcpDiscover.DEFAULT_OPTIONS
		};

		this.hexRecord = [];

		this.taskSpinner = document.createElement("div");
		this.taskSpinner.className = "task-spinner";
		this.taskSpinner.style.display = "none";
		this.task.appendChild(this.taskSpinner);

		this.content.style.padding = "16px 32px 0 32px";
		this.content.style.overflowY = "auto";
		this.content.style.textAlign = "center";

		const grid = document.createElement("div");
		grid.style.overflow = "auto";
		grid.style.padding = "16px";
		grid.style.display = "grid";
		grid.style.gridTemplateColumns = "auto 200px 200px 150px auto";
		grid.style.gridTemplateRows = "repeat(4, 36px)";
		grid.style.alignItems = "center";
		grid.style.color = "var(--clr-control)";
		this.content.appendChild(grid);

		const timeoutLabel = document.createElement("div");
		timeoutLabel.textContent = "Timeout (ms):";
		timeoutLabel.style.textAlign = "right";
		timeoutLabel.style.gridRow = "1";
		timeoutLabel.style.gridColumn = "2";

		this.timeoutInput = document.createElement("input");
		this.timeoutInput.type = "number";
		this.timeoutInput.min = 100;
		this.timeoutInput.max = 30000;
		this.timeoutInput.value = this.args.timeout;
		this.timeoutInput.style.gridRow = "1";
		this.timeoutInput.style.gridColumn = "3";
		grid.append(timeoutLabel, this.timeoutInput);

		const hostLabel = document.createElement("div");
		hostLabel.textContent = "Spoof hostname:";
		hostLabel.style.textAlign = "right";
		hostLabel.style.gridRow = "2";
		hostLabel.style.gridColumn = "2";

		this.hostnameInput = document.createElement("input");
		this.hostnameInput.type = "text";
		this.hostnameInput.placeholder = "none";
		this.hostnameInput.value = this.args.hostname;
		this.hostnameInput.style.gridRow = "2";
		this.hostnameInput.style.gridColumn = "3";
		grid.append(hostLabel, this.hostnameInput);

		const spoofMacLabel = document.createElement("div");
		spoofMacLabel.textContent = "Spoof MAC address:";
		spoofMacLabel.style.textAlign = "right";
		spoofMacLabel.style.gridRow = "3";
		spoofMacLabel.style.gridColumn = "2";

		this.macInput = document.createElement("input");
		this.macInput.type = "text";
		this.macInput.placeholder = "system default";
		this.macInput.value = this.args.mac;
		this.macInput.style.gridRow = "3";
		this.macInput.style.gridColumn = "3";
		grid.append(spoofMacLabel, this.macInput);

		const acceptLabel = document.createElement("div");
		acceptLabel.textContent = "Accept the offer:";
		acceptLabel.style.textAlign = "right";
		acceptLabel.style.gridRow = "4";
		acceptLabel.style.gridColumn = "2";

		const acceptBox = document.createElement("div");
		acceptBox.style.gridRow = "4";
		acceptBox.style.gridColumn = "3";
		grid.append(acceptLabel, acceptBox);

		this.acceptToggle = this.CreateToggle(".", this.args.accept, acceptBox);
		this.acceptToggle.label.style.paddingLeft = "8px";

		this.optionsButton = document.createElement("input");
		this.optionsButton.type = "button";
		this.optionsButton.value = "Options";
		this.optionsButton.style.width = "96px";
		this.optionsButton.style.margin = "0 16px";
		this.optionsButton.style.gridArea = "1 / 4";
		grid.appendChild(this.optionsButton);

		this.discoverButton = document.createElement("input");
		this.discoverButton.type = "button";
		this.discoverButton.value = "Discover";
		this.discoverButton.style.display = "block-line";
		this.discoverButton.style.width = "96px";
		this.discoverButton.style.height = "48px";
		this.discoverButton.style.margin = "16px";
		this.discoverButton.style.gridArea = "2 / 4 / span 2 / span 1";
		grid.appendChild(this.discoverButton);

		this.spinner = document.createElement("div");
		this.spinner.className = "spinner";
		this.spinner.style.textAlign = "left";
		this.spinner.style.marginBottom = "32px";
		this.spinner.style.visibility = "hidden";
		this.content.appendChild(this.spinner);
		this.spinner.appendChild(document.createElement("div"));

		this.hexButton = document.createElement("input");
		this.hexButton.type = "button";
		this.hexButton.value = "";
		this.hexButton.disabled = true;
		this.hexButton.style.position = "absolute";
		this.hexButton.style.right = "32px";
		this.hexButton.style.top = "200px";
		this.hexButton.style.width = "40px";
		this.hexButton.style.minWidth = "40px";
		this.hexButton.style.minHeight = "40px";
		this.hexButton.style.margin = "2px";
		this.hexButton.style.marginTop = "16px";
		this.hexButton.style.backgroundImage = "url(mono/hexviewer.svg?light)";
		this.hexButton.style.backgroundSize = "32px";
		this.hexButton.style.backgroundPosition = "center";
		this.hexButton.style.backgroundRepeat = "no-repeat";
		this.content.appendChild(this.hexButton);

		const titleBar = document.createElement("div");
		titleBar.style.height = "25px";
		titleBar.style.borderRadius = "4px 4px 0 0";
		titleBar.style.background = "var(--grd-toolbar)";
		this.content.appendChild(titleBar);

		let labels = [];

		const typeLabel = document.createElement("div");
		typeLabel.textContent = "Type";
		labels.push(typeLabel);

		const idLabel = document.createElement("div");
		idLabel.textContent = "ID";
		labels.push(idLabel);

		const macLabel = document.createElement("div");
		macLabel.textContent = "Mac address";
		labels.push(macLabel);

		const serverLabel = document.createElement("div");
		serverLabel.textContent = "Server";
		labels.push(serverLabel);

		const ipLabel = document.createElement("div");
		ipLabel.textContent = "Offer";
		labels.push(ipLabel);

		for (let i = 0; i < labels.length; i++) {
			labels[i].style.display = "inline-block";
			labels[i].style.textAlign = "left";
			labels[i].style.width = "20%";
			labels[i].style.lineHeight = "24px";
			labels[i].style.whiteSpace = "nowrap";
			labels[i].style.overflow = "hidden";
			labels[i].style.textOverflow = "ellipsis";
			labels[i].style.boxSizing = "border-box";
			labels[i].style.paddingLeft = "4px";
			labels[i].style.paddingTop = "1px";
		}

		titleBar.append(typeLabel, idLabel, macLabel, serverLabel, ipLabel);

		this.result = document.createElement("div");
		this.result.style.color = "var(--clr-dark)";
		this.result.style.backgroundColor = "var(--clr-pane)";
		this.result.style.textAlign = "left";
		this.result.style.width = "100%";
		this.result.style.minHeight = "64px";
		this.result.style.marginBottom = "24px";
		this.result.style.userSelect = "text";
		this.content.appendChild(this.result);

		this.optionsButton.onclick = ()=> this.OptionsDialog();

		this.timeoutInput.onchange = ()=> {
			this.args.timeout = this.timeoutInput.value;
		};

		this.hostnameInput.onchange = ()=> {
			this.args.hostname = this.hostnameInput.value;
		};

		this.macInput.onchange = ()=> {
			this.args.mac = this.macInput.value;
		};

		this.acceptToggle.checkbox.onchange = ()=> {
			this.args.accept = this.acceptToggle.checkbox.checked;
		};

		this.discoverButton.onclick = ()=> this.Discover();

		this.hexButton.onclick = ()=> {
			new HexViewer({exchange: this.hexRecord, protocol:"dhcp"});
		};
	}

	Close() { //overrides
		super.Close();
		if (this.ws != null) this.ws.close();
	}

	Discover() {
		let mac = this.macInput.value.replaceAll("-", "").replaceAll(":", "");

		if (mac.length != 0 && mac.length != 12) {
			this.ConfirmBox("Invalid MAC address", true);
			return;
		}

		this.discoverButton.disabled = true;
		this.spinner.style.visibility = "visible";
		this.taskSpinner.style.display = "initial";
		this.hexButton.disabled = true;
		this.hexRecord = [];
		this.result.textContent = "";

		let server = window.location.href.replace("https://", "").replace("http://", "");
		if (server.indexOf("/") > 0) server = server.substring(0, server.indexOf("/"));

		this.ws = new WebSocket((KEEP.isSecure ? "wss://" : "ws://") + server + "/ws/dhcp");

		this.ws.onopen = ()=> this.ws.send(`timeout=${this.timeoutInput.value}&mac=${mac}&hostname=${this.hostnameInput.value}&accept=${this.acceptToggle.checkbox.checked}&options=${this.args.options.join(";")}`);

		this.ws.onmessage = event=> {
			const json = JSON.parse(event.data);
			if (json.over) return;

			if (json.error) {
				this.ConfirmBox(json.error, true, "mono/error.svg");
				return;
			}

			const message = document.createElement("div");
			message.style.height = "32px";
			message.style.borderBottom = "rgb(128,128,128) 1px solid";
			this.result.appendChild(message);

			let labels = [];

			const typeLabel = document.createElement("div");
			typeLabel.textContent = `${json.type} - ${json.typeString}`;
			labels.push(typeLabel);

			const idLabel = document.createElement("div");
			idLabel.textContent = json.id;
			labels.push(idLabel);

			if (json.id !== json.groupId) {
				idLabel.style.color = "var(--clr-error)";
				idLabel.style.fontWeight = "bold";
			}

			const macLabel = document.createElement("div");
			macLabel.textContent = json.mac;
			labels.push(macLabel);

			const serverLabel = document.createElement("div");
			serverLabel.textContent = json.server;
			labels.push(serverLabel);

			const ipLabel = document.createElement("div");
			ipLabel.textContent = json.ip;
			labels.push(ipLabel);

			for (let i = 0; i < labels.length; i++) {
				labels[i].style.display = "inline-block";
				labels[i].style.textAlign = "left";
				labels[i].style.width = "20%";
				labels[i].style.lineHeight = "32px";
				labels[i].style.whiteSpace = "nowrap";
				labels[i].style.overflow = "hidden";
				labels[i].style.textOverflow = "ellipsis";
				labels[i].style.boxSizing = "border-box";
				labels[i].style.paddingLeft = "4px";
			}

			this.hexRecord.push({direction:json.typeString, data:json.data});

			message.append(typeLabel, idLabel, macLabel, serverLabel, ipLabel);
		};

		this.ws.onclose = ()=> {
			this.discoverButton.disabled = false;
			this.spinner.style.visibility = "hidden";
			this.taskSpinner.style.display = "none";

			this.hexButton.disabled = false;
		};

		this.ws.onerror = error=> {
			this.discoverButton.disabled = false;
			this.spinner.style.visibility = "hidden";
			this.taskSpinner.style.display = "none";

			this.ConfirmBox("Server is unreachable", true);
		};
	}

	OptionsDialog() {
		const dialog = this.DialogBox("400px");
		if (dialog === null) return;

		dialog.innerBox.parentElement.style.maxWidth = "400px";

		dialog.innerBox.style.margin = "20px";
		dialog.innerBox.style.overflowY = "auto";

		const options = {};
		for (let i=1; i<255; i++) {
			const element = document.createElement("div");
			element.style.paddingBottom = "4px";
			dialog.innerBox.appendChild(element);

			const checked = this.args.options.includes(i);
			const name    = DhcpDiscover.OPTION_NAME[i];
			options[i] = checked;

			const toggle = this.CreateToggle(`${i} ${(name ? `: ${name}` : "")}`, checked, element);
			toggle.label.style.width = "calc(100% - 48px)";

			toggle.checkbox.onchange = ()=> {
				options[i] = toggle.checkbox.checked;
			};
		}

		const resetButton = document.createElement("input");
		resetButton.type = "button";
		resetButton.value = "Reset";
		resetButton.style.marginLeft = "20px";
		dialog.buttonBox.appendChild(resetButton);

		dialog.okButton.onclick = ()=> {
			const filtered = [];
			for (const key in options) {
				if (options[key]) filtered.push(parseInt(key));
			}
			this.args.options = filtered;
			dialog.Close();
		};

		resetButton.onclick = ()=> {
			this.args.options = DhcpDiscover.DEFAULT_OPTIONS;
			dialog.Close();
		};

	}
}
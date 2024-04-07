class DhcpDiscover extends Window {
	constructor(params) {
		super();
		this.SetTitle("DHCP client");
		this.SetIcon("mono/dhcp.svg");

		this.params = params ?? {
			timeout: 5000,
			hostname: "",
			mac: "",
			accept: false
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
		grid.appendChild(timeoutLabel);

		this.timeoutInput = document.createElement("input");
		this.timeoutInput.type = "number";
		this.timeoutInput.min = 100;
		this.timeoutInput.max = 30000;
		this.timeoutInput.value = this.params.timeout;
		this.timeoutInput.style.gridRow = "1";
		this.timeoutInput.style.gridColumn = "3";
		grid.appendChild(this.timeoutInput);


		const hostLabel = document.createElement("div");
		hostLabel.textContent = "Spoof hostname:";
		hostLabel.style.textAlign = "right";
		hostLabel.style.gridRow = "2";
		hostLabel.style.gridColumn = "2";
		grid.appendChild(hostLabel);

		this.hostnameInput = document.createElement("input");
		this.hostnameInput.type = "text";
		this.hostnameInput.placeholder = "none";
		this.hostnameInput.value = this.params.hostname;
		this.hostnameInput.style.gridRow = "2";
		this.hostnameInput.style.gridColumn = "3";
		grid.appendChild(this.hostnameInput);


		const spoofMacLabel = document.createElement("div");
		spoofMacLabel.textContent = "Spoof MAC address:";
		spoofMacLabel.style.textAlign = "right";
		spoofMacLabel.style.gridRow = "3";
		spoofMacLabel.style.gridColumn = "2";
		grid.appendChild(spoofMacLabel);

		this.macInput = document.createElement("input");
		this.macInput.type = "text";
		this.macInput.placeholder = "system default";
		this.macInput.value = this.params.mac;
		this.macInput.style.gridRow = "3";
		this.macInput.style.gridColumn = "3";
		grid.appendChild(this.macInput);

		const acceptLabel = document.createElement("div");
		acceptLabel.textContent = "Accept the offer:";
		acceptLabel.style.textAlign = "right";
		acceptLabel.style.gridRow = "4";
		acceptLabel.style.gridColumn = "2";
		grid.appendChild(acceptLabel);

		const acceptBox = document.createElement("div");
		acceptBox.style.gridRow = "4";
		acceptBox.style.gridColumn = "3";
		grid.appendChild(acceptBox);

		this.acceptCheckbox = document.createElement("input");
		this.acceptCheckbox.type = "checkbox";
		this.acceptCheckbox.checked = this.params.accept;
		acceptBox.appendChild(this.acceptCheckbox);
		this.AddCheckBoxLabel(acceptBox, this.acceptCheckbox, ".").style.paddingLeft = "8px";

		this.discoverButton = document.createElement("input");
		this.discoverButton.type = "button";
		this.discoverButton.value = "Discover";
		this.discoverButton.style.display = "block-line";
		this.discoverButton.style.width = "96px";
		this.discoverButton.style.height = "48px";
		this.discoverButton.style.margin = "16px";
		this.discoverButton.style.borderRadius = "4px";
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

		this.timeoutInput.onchange = ()=> {
			this.params.timeout = this.timeoutInput.value;
		};

		this.hostnameInput.onchange = ()=> {
			this.params.hostname = this.hostnameInput.value;
		};

		this.macInput.onchange = ()=> {
			this.params.mac = this.macInput.value;
		};

		this.acceptCheckbox.onchange = ()=> {
			this.params.accept = this.acceptCheckbox.checked;
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

		let server = window.location.href;
		server = server.replace("https://", "");
		server = server.replace("http://", "");
		if (server.indexOf("/") > 0) server = server.substring(0, server.indexOf("/"));

		this.ws = new WebSocket((KEEP.isSecure ? "wss://" : "ws://") + server + "/ws/dhcp");

		this.ws.onopen = ()=> this.ws.send(`timeout=${this.timeoutInput.value}&mac=${mac}&hostname=${this.hostnameInput.value}&accept=${this.acceptCheckbox.checked}`);

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
}
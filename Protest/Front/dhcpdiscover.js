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

		const lblTimeout = document.createElement("div");
		lblTimeout.textContent = "Timeout (ms):";
		lblTimeout.style.textAlign = "right";
		lblTimeout.style.gridRow = "1";
		lblTimeout.style.gridColumn = "2";
		grid.appendChild(lblTimeout);

		this.txtTimeout = document.createElement("input");
		this.txtTimeout.type = "number";
		this.txtTimeout.min = 100;
		this.txtTimeout.max = 30000;
		this.txtTimeout.value = this.params.timeout;
		this.txtTimeout.style.gridRow = "1";
		this.txtTimeout.style.gridColumn = "3";
		grid.appendChild(this.txtTimeout);
		

		const lblHostname = document.createElement("div");
		lblHostname.textContent = "Spoof hostname:";
		lblHostname.style.textAlign = "right";
		lblHostname.style.gridRow = "2";
		lblHostname.style.gridColumn = "2";
		grid.appendChild(lblHostname);

		this.txtHostname = document.createElement("input");
		this.txtHostname.type = "text";
		this.txtHostname.placeholder = "none";
		this.txtHostname.value = this.params.hostname;
		this.txtHostname.style.gridRow = "2";
		this.txtHostname.style.gridColumn = "3";
		grid.appendChild(this.txtHostname);


		const lblMacAddress = document.createElement("div");
		lblMacAddress.textContent = "Spoof MAC address:";
		lblMacAddress.style.textAlign = "right";
		lblMacAddress.style.gridRow = "3";
		lblMacAddress.style.gridColumn = "2";
		grid.appendChild(lblMacAddress);

		this.txtMacAddress = document.createElement("input");
		this.txtMacAddress.type = "text";
		this.txtMacAddress.placeholder = "system default";
		this.txtMacAddress.value = this.params.mac;
		this.txtMacAddress.style.gridRow = "3";
		this.txtMacAddress.style.gridColumn = "3";
		grid.appendChild(this.txtMacAddress);

		const lblAccept = document.createElement("div");
		lblAccept.textContent = "Accept the offer:";
		lblAccept.style.textAlign = "right";
		lblAccept.style.gridRow = "4";
		lblAccept.style.gridColumn = "2";
		grid.appendChild(lblAccept);

		const divAccept = document.createElement("div");
		divAccept.style.gridRow = "4";
		divAccept.style.gridColumn = "3";
		grid.appendChild(divAccept);

		this.chkAccept = document.createElement("input");
		this.chkAccept.type = "checkbox";
		this.chkAccept.checked = this.params.accept;
		divAccept.appendChild(this.chkAccept);
		this.AddCheckBoxLabel(divAccept, this.chkAccept, ".").style.paddingLeft = "8px";

		this.btnDiscover = document.createElement("input");
		this.btnDiscover.type = "button";
		this.btnDiscover.value = "Discover";
		this.btnDiscover.style.display = "block-line";
		this.btnDiscover.style.width = "96px";
		this.btnDiscover.style.height = "48px";
		this.btnDiscover.style.margin = "16px";
		this.btnDiscover.style.borderRadius = "4px";
		this.btnDiscover.style.gridArea = "2 / 4 / span 2 / span 1";
		grid.appendChild(this.btnDiscover);

		this.spinner = document.createElement("div");
		this.spinner.className = "spinner";
		this.spinner.style.textAlign = "left";
		this.spinner.style.marginBottom = "32px";
		this.spinner.style.visibility = "hidden";
		this.content.appendChild(this.spinner);
		this.spinner.appendChild(document.createElement("div"));

		
		this.btnHex = document.createElement("input");
		this.btnHex.type = "button";
		this.btnHex.value = "";
		this.btnHex.disabled = true;
		this.btnHex.style.position = "absolute";
		this.btnHex.style.right = "32px";
		this.btnHex.style.top = "200px";
		this.btnHex.style.width = "40px";
		this.btnHex.style.minWidth = "40px";
		this.btnHex.style.minHeight = "40px";
		this.btnHex.style.margin = "2px";
		this.btnHex.style.marginTop = "16px";
		this.btnHex.style.backgroundImage = "url(mono/hexviewer.svg?light)";
		this.btnHex.style.backgroundSize = "32px";
		this.btnHex.style.backgroundPosition = "center";
		this.btnHex.style.backgroundRepeat = "no-repeat";
		this.content.appendChild(this.btnHex);


		const titleBar = document.createElement("div");
		titleBar.style.height = "25px";
		titleBar.style.borderRadius = "4px 4px 0 0";
		titleBar.style.background = "var(--grd-toolbar)";
		this.content.appendChild(titleBar);

		let labels = [];

		const lblType = document.createElement("div");
		lblType.textContent = "Type";
		labels.push(lblType);

		const lblId = document.createElement("div");
		lblId.textContent = "ID";
		labels.push(lblId);

		const lblMac = document.createElement("div");
		lblMac.textContent = "Mac address";
		labels.push(lblMac);

		const lblServer = document.createElement("div");
		lblServer.textContent = "Server";
		labels.push(lblServer);

		const lblIp = document.createElement("div");
		lblIp.textContent = "Offer";
		labels.push(lblIp);

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
		}
		
		titleBar.append(lblType, lblId, lblMac, lblServer, lblIp);

		this.result = document.createElement("div");
		this.result.style.color = "var(--clr-dark)";
		this.result.style.backgroundColor = "var(--clr-pane)";
		this.result.style.textAlign = "left";
		this.result.style.width = "100%";
		this.result.style.minHeight = "64px";
		this.result.style.marginBottom = "24px";
		this.result.style.userSelect = "text";
		this.content.appendChild(this.result);

		this.txtTimeout.onchange = ()=> {
			this.params.timeout = this.txtTimeout.value;
		};

		this.txtHostname.onchange = ()=> {
			this.params.hostname = this.txtHostname.value;
		};

		this.txtMacAddress.onchange = ()=> {
			this.params.mac = this.txtMacAddress.value;
		};

		this.chkAccept.onchange = ()=> {
			this.params.accept = this.chkAccept.checked;
		};

		this.btnDiscover.onclick = ()=> this.Discover();

		this.btnHex.onclick = ()=> {
			new HexViewer({exchange: this.hexRecord, protocol:"dhcp"});
		};
	}

	Close() { //override
		super.Close();
		if (this.ws != null) this.ws.close();
	}

	Discover() {
		let mac = this.txtMacAddress.value.replaceAll("-", "").replaceAll(":", "");

		if (mac.length != 0 && mac.length != 12) {
			this.ConfirmBox("Invalid MAC address", true);
			return;
		}

		this.btnDiscover.disabled = true;
		this.spinner.style.visibility = "visible";
		this.taskSpinner.style.display = "initial";
		this.btnHex.disabled = true;
		this.hexRecord = [];
		this.result.textContent = "";

		let server = window.location.href;
		server = server.replace("https://", "");
		server = server.replace("http://", "");
		if (server.indexOf("/") > 0) server = server.substring(0, server.indexOf("/"));

		this.ws = new WebSocket((KEEP.isSecure ? "wss://" : "ws://") + server + "/ws/dhcp");

		this.ws.onopen = ()=> this.ws.send(`timeout=${this.txtTimeout.value}&mac=${mac}&hostname=${this.txtHostname.value}&accept=${this.chkAccept.checked}`);
		
		this.ws.onmessage = event=> {
			const json = JSON.parse(event.data);
			if (json.over) return;

			if (json.error) {
				this.ConfirmBox(json.error, true);
				return;
			}

			const message = document.createElement("div");
			message.style.height = "32px";
			message.style.borderBottom = "rgb(128,128,128) 1px solid";
			this.result.appendChild(message);

			let labels = [];

			const lblType = document.createElement("div");
			lblType.textContent = `${json.type} - ${json.typeString}`;
			labels.push(lblType);
	
			const lblId = document.createElement("div");
			lblId.textContent = json.id;
			labels.push(lblId);

			if (json.id !== json.groupId) {
				lblId.style.color = "var(--clr-error)";
				lblId.style.fontWeight = "bold";
			}
	
			const lblMac = document.createElement("div");
			lblMac.textContent = json.mac;
			labels.push(lblMac);
	
			const lblServer = document.createElement("div");
			lblServer.textContent = json.server;
			labels.push(lblServer);
	
			const lblIp = document.createElement("div");
			lblIp.textContent = json.ip;
			labels.push(lblIp);
	
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
			
			message.append(lblType, lblId, lblMac, lblServer, lblIp);
		};

		this.ws.onclose = ()=> {
			this.btnDiscover.disabled = false;
			this.spinner.style.visibility = "hidden";
			this.taskSpinner.style.display = "none";
			
			this.btnHex.disabled = false;
		};

		this.ws.onerror = error=> {
			this.btnDiscover.disabled = false;
			this.spinner.style.visibility = "hidden";
			this.taskSpinner.style.display = "none";

			this.ConfirmBox("Server is unreachable", true);
		};
	}

}
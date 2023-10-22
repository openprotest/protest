class Ping extends Console {
	static HISTORY_LIMIT = 32;

	constructor(params) {
		super();

		this.params = params ?? {
			entries: [],
			timeout: 1000,
			interval: 1000,
			method: "icmp",
			rolling: false,
			moveToTop: false,
			status: "play"
		};

		this.AddCssDependencies("tools.css");

		this.count = 0;
		this.hashtable = {};
		this.request = "";
		this.ws = null;

		this.SetTitle(this.params.method === "icmp" ? "Ping" : "ARP ping");
		this.SetIcon("mono/ping.svg");

		this.SetupToolbar();
		this.playButton = this.AddToolbarButton("Start", "mono/play.svg?light");
		this.pauseButton = this.AddToolbarButton("Pause", "mono/pause.svg?light");
		this.toolbar.appendChild(this.AddToolbarSeparator());
		this.clearButton = this.AddToolbarButton("Clear", "mono/wing.svg?light");
		this.cloneButton = this.AddToolbarButton("Clone", "mono/clone.svg?light");
		this.optionsButton = this.AddToolbarButton("Options", "mono/wrench.svg?light");

		this.playButton.disabled = this.params.status === "play";
		this.pauseButton.disabled = this.params.status === "pause";

		if (this.params.entries) { //restore entries from previous session
			let temp = this.params.entries;
			this.params.entries = [];
			for (let i = 0; i < temp.length; i++)
				this.Push(temp[i]);
		}

		this.playButton.addEventListener("click", ()=> {
			if (this.request.length === 0) return;
			this.params.status = "play";
			this.playButton.disabled = true;
			this.pauseButton.disabled = false;

			this.list.querySelectorAll("#self_destruct").forEach(o=> this.list.removeChild(o));
			this.Connect();
		});

		this.pauseButton.addEventListener("click", ()=> {
			this.params.status = "pause";
			this.playButton.disabled = false;
			this.pauseButton.disabled = true;

			if (this.request.length > 0 && !this.isClosed && this.ws != null && this.ws.readyState === 1) {
				this.ws.close();
			}
		});

		this.clearButton.addEventListener("click", ()=> {
			const btnOK = this.ConfirmBox("Are you sure you want to clear the list?");
			if (btnOK) btnOK.addEventListener("click", ()=> {
				this.playButton.disabled = true;
				this.pauseButton.disabled = true;

				let split = this.request.split(";");
				for (let i = 0; i < split.length; i++) {
					if (split[i].length === 0) continue;
					this.Remove(this.hashtable[split[i]].host);
				}
			});
		});

		this.cloneButton.addEventListener("click", ()=> {
			let paramsCopy = structuredClone(this.params);
			paramsCopy.status = "pause";
			const clone = new Ping(paramsCopy);
			if (this.popOutWindow) clone.PopOut();
			const dialog = clone.Options();

			const OriginalCancelClickHandler = dialog.btnCancel.onclick;
			dialog.btnOK.onclick = ()=> {
				clone.params.status = "play";
				clone.Connect();
				OriginalCancelClickHandler();
			};

			dialog.btnCancel.onclick = ()=> {
				clone.Close();
			};
		});

		this.optionsButton.addEventListener("click", ()=> {
			this.Options();
		});

		this.list.onscroll = ()=> this.InvalidateRecyclerList();
	}

	Close() { //override
		if (this.ws != null) this.ws.close();
		super.Close();
	}

	Toggle() { //override
		super.Toggle();
		setTimeout(()=> this.InvalidateRecyclerList(), WIN.ANIME_DURATION);
	}

	Minimize(force) { //override
		super.Minimize(force);
		this.content.style.display = (this.isMinimized) ? "none" : "initial"; //hide content when minimize for faster animation.
	}

	AfterResize() { //override
		this.InvalidateRecyclerList();
	}

	Options() {
		const dialog = this.DialogBox("260px");
		if (dialog === null) return;
		const btnOK = dialog.btnOK;
		const btnCancel = dialog.btnCancel;
		const innerBox = dialog.innerBox;

		innerBox.parentElement.style.maxWidth = "600px";
		innerBox.style.padding = "16px 0px 0px 16px";

		const lblTimeout = document.createElement("div");
		lblTimeout.textContent = "Time out (ms):";
		lblTimeout.style.display = "inline-block";
		lblTimeout.style.minWidth = "120px";
		innerBox.appendChild(lblTimeout);

		const txtTimeout = document.createElement("input");
		txtTimeout.type = "number";
		txtTimeout.min = 1;
		txtTimeout.max = 5000;
		txtTimeout.value = this.params.timeout;
		txtTimeout.style.width = "100px";
		innerBox.appendChild(txtTimeout);

		innerBox.appendChild(document.createElement("br"));


		const lblInterval = document.createElement("div");
		lblInterval.textContent = "Interval (ms):";
		lblInterval.style.display = "inline-block";
		lblInterval.style.minWidth = "120px";
		innerBox.appendChild(lblInterval);

		const txtInterval = document.createElement("input");
		txtInterval.type = "number";
		txtInterval.min = 1;
		txtInterval.max = 5000;
		txtInterval.value = this.params.interval;
		txtInterval.style.width = "100px";
		innerBox.appendChild(txtInterval);

		innerBox.appendChild(document.createElement("br"));

		const lblPingMethod = document.createElement("div");
		lblPingMethod.textContent = "Ping method:";
		lblPingMethod.style.display = "inline-block";
		lblPingMethod.style.minWidth = "120px";
		innerBox.appendChild(lblPingMethod);

		const selPingMethod = document.createElement("select");
		selPingMethod.style.minWidth = "100px";
		innerBox.appendChild(selPingMethod);

		const optICMP = document.createElement("option");
		optICMP.textContent = "ICMP";
		optICMP.value = "icmp";
		selPingMethod.appendChild(optICMP);

		const optARP = document.createElement("option");
		optARP.textContent = "ARP";
		optARP.value = "arp";
		selPingMethod.appendChild(optARP);

		selPingMethod.value = this.params.method;

		innerBox.appendChild(document.createElement("br"));
		innerBox.appendChild(document.createElement("br"));

		const chkRollingPing = document.createElement("input");
		chkRollingPing.type = "checkbox";
		chkRollingPing.checked = this.params.rolling;
		chkRollingPing.disabled = true;

		innerBox.appendChild(chkRollingPing);
		this.AddCheckBoxLabel(innerBox, chkRollingPing, "Rolling ping");


		innerBox.appendChild(document.createElement("br"));
		innerBox.appendChild(document.createElement("br"));

		const chkMoveToTop = document.createElement("input");
		chkMoveToTop.type = "checkbox";
		chkMoveToTop.checked = this.params.moveToTop;
		innerBox.appendChild(chkMoveToTop);
		this.AddCheckBoxLabel(innerBox, chkMoveToTop, "Move to the top on rise or fall");

		innerBox.appendChild(document.createElement("br"));
		innerBox.appendChild(document.createElement("br"));

		if (selPingMethod.value === "arp") {
			txtTimeout.disabled = true;
			chkRollingPing.checked = true;
		}

		{
			const pnlLegend = document.createElement("div");
			pnlLegend.style.width = "300px";
			pnlLegend.style.overflow = "hidden";
			innerBox.appendChild(pnlLegend);

			const tblLegend = document.createElement("table");
			tblLegend.style.color = "#202020";
			tblLegend.style.borderCollapse = "collapse";
			tblLegend.style.margin = "4px";
			pnlLegend.appendChild(tblLegend);

			const tr1 = document.createElement("tr");
			tblLegend.appendChild(tr1);

			const tr2 = document.createElement("tr");
			tblLegend.appendChild(tr2);

			const tr3 = document.createElement("tr");
			tblLegend.appendChild(tr3);

			const tr4 = document.createElement("tr");
			tblLegend.appendChild(tr4);

			const td1a = document.createElement("td");
			td1a.style.borderRadius = "8px 8px 0 0";
			td1a.style.width = "24px";
			td1a.style.height = "24px";
			td1a.style.background = "linear-gradient(to bottom, hsl(96,66%,50%)0%, hsl(146,66%,50%)100%)";
			tr1.appendChild(td1a);
			const td1b = document.createElement("td");
			td1b.style.minWidth = "96px";
			td1b.style.paddingLeft = "8px";
			td1b.textContent = "0ms";
			tr1.appendChild(td1b);

			const td2a = document.createElement("td");
			td2a.style.width = "24px";
			td2a.style.height = "24px";
			td2a.style.background = "linear-gradient(to bottom, hsl(146,66%,50%)0%, hsl(196,66%,50%)100%)";
			tr2.appendChild(td2a);
			const td2b = document.createElement("td");
			td2b.style.paddingLeft = "8px";
			td2b.textContent = "250ms";
			tr2.appendChild(td2b);

			const td3a = document.createElement("td");
			td3a.style.width = "24px";
			td3a.style.height = "24px";
			td3a.style.background = "linear-gradient(to bottom, hsl(196,66%,50%)0%, hsl(246,66%,50%)100%)";
			tr3.appendChild(td3a);
			const td3b = document.createElement("td");
			td3b.style.paddingLeft = "8px";
			td3b.textContent = "500ms";
			tr3.appendChild(td3b);

			const td4a = document.createElement("td");
			td4a.style.borderRadius = "0 0 8px 8px";
			td4a.style.width = "24px";
			td4a.style.height = "24px";
			td4a.style.background = "linear-gradient(to bottom, hsl(246,66%,50%)0%, hsl(345,66%,50%)100%)";
			tr4.appendChild(td4a);
			const td4b = document.createElement("td");
			td4b.style.paddingLeft = "8px";
			td4b.textContent = "750ms";
			tr4.appendChild(td4b);

			const td5a = document.createElement("td");
			td5a.style.borderRadius = "8px";
			td5a.style.width = "24px";
			td5a.style.height = "24px";
			td5a.style.backgroundColor = "rgb(255,0,0)";
			tr1.appendChild(td5a);
			const td5b = document.createElement("td");
			td5b.style.minWidth = "96px";
			td5b.style.paddingLeft = "8px";
			td5b.textContent = "Timed out";
			tr1.appendChild(td5b);

			const td6a = document.createElement("td");
			td6a.style.borderRadius = "8px";
			td6a.style.width = "24px";
			td6a.style.height = "24px";
			td6a.style.backgroundColor = "rgb(255,102,0)";
			tr2.appendChild(td6a);
			const td6b = document.createElement("td");
			td6b.style.paddingLeft = "8px";
			td6b.textContent = "Error";
			tr2.appendChild(td6b);
		}

		const Apply = ()=> {
			this.params.timeout = txtTimeout.value;
			this.params.interval = txtInterval.value;
			this.params.method = selPingMethod.value;
			this.params.rolling = chkRollingPing.checked;
			this.params.moveToTop = chkMoveToTop.checked;

			if (!this.isClosed && this.ws != null && this.ws.readyState === 1) { //ready
				this.ws.send(`timeout:${this.params.timeout}`);
				this.ws.send(`interval:${this.params.interval}`);
				this.ws.send(`method:${this.params.method}`);
				this.ws.send(`rolling:${this.params.rolling}`);
			}

			this.SetTitle(selPingMethod.value === "arp" ? "ARP ping" : "Ping");
			this.InvalidateRecyclerList();
		};

		const OnKeydown = event=>{
			if (event.key === "Enter") {
				Apply();
				dialog.btnOK.onclick();
			}
		};

		txtTimeout.addEventListener("keydown", OnKeydown);
		txtInterval.addEventListener("keydown", OnKeydown);
		selPingMethod.addEventListener("keydown", OnKeydown);

		txtTimeout.onchange = txtTimeout.oninput = ()=> {
			txtInterval.min = txtTimeout.value;
			if (txtInterval.value < txtTimeout.value) txtInterval.value = txtTimeout.value;
		};

		selPingMethod.onchange = ()=> {
			if (selPingMethod.value === "arp") {
				txtTimeout.disabled = true;
				txtInterval.disabled = true;
				chkRollingPing.checked = true;
				//chkRollingPing.disabled = true;
			}
			else if (txtTimeout.disabled) {
				txtTimeout.disabled = false;
				txtInterval.disabled = false;
				//chkRollingPing.disabled = false;
				chkRollingPing.checked = false;
			}
		};

		btnOK.addEventListener("click", ()=> {
			Apply();
		});

		txtTimeout.focus();

		return dialog;
	}

	Push(name) { //override
		if (!super.Push(name)) return;
		this.Filter(name);
	}

	Filter(query) {
		let size0 = this.list.childNodes.length;

		if (query.includes(";")) {
			let ips = query.split(";");
			for (let i = 0; i < ips.length; i++) this.Filter(ips[i].trim());
		}
		else if (query.includes(",")) {
			let ips = query.split(",");
			for (let i = 0; i < ips.length; i++) this.Filter(ips[i].trim());
		}
		else if (query.includes("-")) {
			let split = query.split("-");
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
				this.Add(query);
			}
		}
		else if (query.includes("/")) {
			let cidr = parseInt(query.split("/")[1].trim());
			if (isNaN(cidr)) return;

			let ip = query.split("/")[0].trim();
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
			this.Add(query);
		}

		this.InvalidateRecyclerList();
	}

	Add(host) {
		if (host.length === 0) return;

		for (let key in this.hashtable)
			if (this.hashtable[key].host === host) {
				this.list.appendChild(this.hashtable[key].element);
				return;
			}

		const div = document.createElement("div");
		div.className = "tool-element";
		this.list.appendChild(div);

		const name = document.createElement("div");
		name.className = "tool-label";
		name.textContent = host;
		div.appendChild(name);

		const graph = document.createElement("div");
		graph.className = "tool-graph";
		div.appendChild(graph);

		const msg = document.createElement("div");
		msg.className = "tool-msg";
		div.appendChild(msg);

		const remove = document.createElement("div");
		remove.className = "tool-remove";
		div.appendChild(remove);

		remove.onclick = ()=> { this.Remove(host); };

		let ping = [];
		let ping_e = [];
		for (let i = 0; i < Ping.HISTORY_LIMIT; i++) {
			let p = document.createElement("div");
			p.style.left = 3 * i + "%";
			graph.appendChild(p);
			ping_e.push(p);
			ping.push(-1);
		}

		for (const key in LOADER.devices.data) { //get device
			if (!LOADER.devices.data[key].hasOwnProperty("type") || LOADER.devices.data[key].type.length === 0) continue;

			const target = LOADER.devices.data[key].ip?.v ?? LOADER.devices.data[key].hostname?.v;
			if (!target) continue;

			let type;
			if (target.includes(";")) {
				if (target.split(";").some(o=> o.trim().toLowerCase() === host)) {
					type = LOADER.devices.data[key].type.v.toLowerCase();
				}
			}
			else if (target.trim().toLowerCase() === host) {
				type = LOADER.devices.data[key].type.v.toLowerCase();
			}

			if (type) {
				const icon = document.createElement("div");
				icon.className = "tool-icon";
				icon.style.backgroundImage = `url(${LOADER.deviceIcons.hasOwnProperty(type) ? LOADER.deviceIcons[type] : "mono/gear.svg"}?light)`;
				div.appendChild(icon);

				icon.ondblclick = ()=> {
					for (let i = 0; i < WIN.array.length; i++) {
						if (WIN.array[i] instanceof DeviceView && WIN.array[i].params.file === key) {
							WIN.array[i].Minimize(); //minimize/restore
							return;
						}
					}
					new DeviceView({ file: key });
				};

				break;
			}
		}

		this.hashtable[this.count] = {
			host: host,
			element: div,
			msg: msg,
			graph: graph,
			ping: ping,
			ping_e: ping_e
		};

		this.request += this.count + ";";

		if (this.ws != null && this.ws.readyState === 0) { //connection
			this.count += 1;
		}
		else if (this.ws != null && this.ws.readyState === 1) { //ready
			this.ws.send("add:" + this.count + ";" + host);
			this.count += 1;
		}
		else {
			this.Connect();
			this.count += 1;
		}

		this.params.entries.push(host);
	}

	Remove(host) {
		let index = -1;
		for (let key in this.hashtable)
			if (this.hashtable[key].host === host) index = key;
		if (index === -1) return;

		this.list.removeChild(this.hashtable[index].element);
		delete this.hashtable[index];

		this.request = this.request.replace(index + ";", "");

		if (this.ws.readyState === 1) {
			this.ws.send("remove:" + index);
			if (this.request.length === 0) this.ws.close();
		}

		this.AfterResize();

		index = this.params.entries.indexOf(host);
		if (index > -1)
			this.params.entries.splice(index, 1);

		if (this.params.entries.length === 0) {
			this.playButton.disabled = true;
			this.pauseButton.disabled = true;
		}
	}

	Connect() {
		if (this.params.status !== "play") return;

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
			let split = this.request.split(";");
			let i = 0;

			this.ws.send("timeout:" + this.params.timeout);
			this.ws.send("interval:" + this.params.interval);
			this.ws.send("method:" + this.params.method);
			this.ws.send("rolling:" + this.params.rolling);

			while (i < split.length) {
				let req = "";
				while (req.length < 768 && i < split.length) {
					if (split[i].length > 0) req += split[i] + ";" + this.hashtable[split[i]].host + ";";
					i++;
				}
				this.ws.send("add:" + req);
			}

			for (let i = 0; i < this.list.childNodes.length; i++) //remove warnings, if exist
				if (this.list.childNodes[i].id === "self_destruct")
					this.list.removeChild(this.list.childNodes[i]);

			this.ws.send("ping:*");

			this.playButton.disabled = true;
			this.pauseButton.disabled = false;
		};

		this.ws.onclose = ()=> {
			if (this.request.length === 0) return;
			if (this.params.status === "pause") return;

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

			this.playButton.disabled = false;
			this.pauseButton.disabled = true;

			error_message.onclick = ()=> {
				this.list.querySelectorAll("#self_destruct").forEach(o=> this.list.removeChild(o));
				this.Connect();
			};
		};

		this.ws.onmessage = event=> {
			let payload = event.data.split(String.fromCharCode(127));
			if (payload.length < 2) return; //not valid

			this.InvalidateList(payload);

			setTimeout(()=> {
				if (this.request.length > 0 && !this.isClosed && this.ws != null && this.ws.readyState === 1) {
					this.ws.send("ping:*");
				}
			}, this.params.interval);
		};

		this.ws.onerror = error=> {
			this.playButton.disabled = false;
			this.pauseButton.disabled = true;
			//console.error(error);
		};
	}

	InvalidateList(payload) {
		if (this.ws.readyState != 1) return; //if not connected return

		for (let i = 0; i < payload.length - 1; i += 2) {
			let index = payload[i];
			let value = payload[i + 1];

			if (this.hashtable.hasOwnProperty(index)) {

				for (let j = 0; j < Ping.HISTORY_LIMIT - 1; j++) this.hashtable[index].ping[j] = this.hashtable[index].ping[j + 1];
				this.hashtable[index].ping[Ping.HISTORY_LIMIT - 1] = value;

				if (isNaN(value)) {
					this.hashtable[index].msg.textContent = value;
					this.hashtable[index].msg.style.fontSize = "small";
				}
				else {
					this.hashtable[index].msg.textContent = `${value}ms`;
					this.hashtable[index].msg.style.fontSize = "medium";
				}

				for (let j = 0; j < Ping.HISTORY_LIMIT; j++) {
					this.hashtable[index].ping_e[j].style.backgroundColor = UI.PingColor(this.hashtable[index].ping[j]);
					if (isNaN(this.hashtable[index].ping[j]))
						this.hashtable[index].ping_e[j].setAttribute("tip-below", this.hashtable[index].ping[j]);
					else
						this.hashtable[index].ping_e[j].setAttribute("tip-below", this.hashtable[index].ping[j] < 0 ? "" : this.hashtable[index].ping[j] + "ms");
				}

				if (this.params.moveToTop) {
					let p0 = (isNaN(this.hashtable[index].ping[Ping.HISTORY_LIMIT - 1])) ? 4 : 5;
					let p1 = (isNaN(this.hashtable[index].ping[Ping.HISTORY_LIMIT - 2])) ? 4 : 5;
					if (p0 != p1 && this.hashtable[index].element != this.list.childNodes[this.list.childNodes.length - 1]) {//if status changed and not already last
						this.list.prepend(this.hashtable[index].element);
						this.list.scrollTop = 0;
						this.hashtable[index].graph.style.display = "initial";
					}
				}
			}
		}
	}

	InvalidateRecyclerList() { //override
		for (let key in this.hashtable)
			if (this.hashtable[key].element.offsetTop - this.list.scrollTop < -30 ||
				this.hashtable[key].element.offsetTop - this.list.scrollTop > this.list.clientHeight) {
				this.hashtable[key].graph.style.display = "none";
			}
			else {
				this.hashtable[key].graph.style.display = "initial";
			}
	}
}
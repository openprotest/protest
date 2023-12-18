class Oversight extends Window {
	constructor(params) {
		super();
		this.params = params ?? { file: null};
		
		this.params.stats ??= [];

		this.socket = null;
		this.link = LOADER.devices.data[this.params.file];
		this.autoReconnect = true;
		this.connectRetries = 0;
		this.statsList = [];

		this.AddCssDependencies("oversight.css");
		this.AddCssDependencies("wmi.css");

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

		this.SetupToolbar();
		this.connectButton = this.AddToolbarButton("Connect", "mono/connect.svg?light");
		this.addStatButton = this.AddToolbarButton("Add", "mono/add.svg?light");
		this.AddToolbarSeparator();
		this.startButton = this.AddToolbarButton("Start", "mono/play.svg?light");
		this.pauseButton = this.AddToolbarButton("Pause", "mono/pause.svg?light");

		this.connectButton.disabled = true;
		this.startButton.disabled = true;

		this.scrollable = document.createElement("div");
		this.scrollable.className = "oversight-scrollable";

		this.consoleBox = document.createElement("div");
		this.consoleBox.className = "oversight-console";

		this.content.append(this.scrollable, this.consoleBox);

		this.connectButton.onclick = event=> this.InitializeSocketConnection();
		this.addStatButton.onclick = event=> this.AddStat();
		this.startButton.onclick = event=> this.Start();
		this.pauseButton.onclick = event=> this.Pause();

		this.statsList.push(this.CreateStatBox("ping", 75, { type:"ping", prefix:"RTT", unit:"ms" }));
		this.statsList.push(this.CreateStatBox("cpu", 75, { type:"percent", prefix:"Usage", unit:"%" }));
		this.statsList.push(this.CreateStatBox("cores", 75, { type:"percents", prefix:"Usage", unit:"%" }));

		this.InitializeSubnetEmblem();
		this.InitializeSocketConnection();
	}

	Close() { //override
		this.autoReconnect = false;
		if (this.socket) {
			this.socket.close();
		}

		super.Close();
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
		this.connectButton.disabled = true;

		if (this.socket !== null) return;

		let server = window.location.href.replace("https://", "").replace("http://", "");
		if (server.indexOf("/") > 0) server = server.substring(0, server.indexOf("/"));

		this.socket = new WebSocket((KEEP.isSecure ? "wss://" : "ws://") + server + "/ws/oversight");

		this.socket.onopen = event=> {
			this.connectRetries = 0;
			this.socket.send(this.params.file);
			this.ConsoleLog("Web-socket connection established", "info");

			this.socket.send("ping=true");
			this.socket.send("cpu=true");
			this.socket.send("cores=true");
		};

		this.socket.onmessage = event=> {
			let message = JSON.parse(event.data);

			if (message.loglevel) {
				this.ConsoleLog(message.text, message.loglevel);
				return;
			}

			for (let i=0; i<this.statsList.length; i++) {
				if (this.statsList[i].name !== message.result) { continue; }

				if (this.statsList[i].options.type === "percents") {
					this.statsList[i].Update(message.value);
				}
				else {
					this.statsList[i].Update(parseInt(message.value));
				}
				break;
			}
		};

		this.socket.onclose = event=> {
			this.ConsoleLog("Web-socket connection closed", "error");

			if (this.autoReconnect && this.connectRetries < 3) {
				this.socket = null;
				this.AutoReconnect();
			}
			else {
				this.connectButton.disabled = false;
				this.socket = null;
			}
		};
	}

	AutoReconnect() {
		this.connectRetries++;
		this.ConsoleLog(`Reconnecting web-socket: attempt ${this.connectRetries}/3`, "info");
		this.InitializeSocketConnection();
	}

	async GetWmiClasses() {
		try {
			const response = await fetch("wmiclasses.json");

			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);
			
			const json = await response.json();
			if (json.error) throw(json.error);

			this.wmi_classes = json;
		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/error.svg");
		}
	}

	async AddStat() {
		if (!this.socket) return;
		//TODO:
		//this.socket.send("");

		await this.GetWmiClasses();

		const dialog = this.DialogBox("640px");
		if (dialog === null) return;
		const btnOK = dialog.btnOK;
		const innerBox = dialog.innerBox;

		innerBox.style.margin = "16px";
		innerBox.style.display = "grid";
		innerBox.style.gridTemplateColumns = "50% 16px auto";
		innerBox.style.gridTemplateRows = "32px 8px auto 8px 64px";

		const txtClassFilter = document.createElement("input");
		txtClassFilter.type = "text";
		txtClassFilter.placeholder = "Find..";
		txtClassFilter.style.gridArea = "1 / 1";

		const btnNone = document.createElement("input");
		btnNone.type = "button";
		btnNone.style.position = "absolute";
		btnNone.style.right = "32px";
		btnNone.style.width = "28px";
		btnNone.style.minWidth = "28px";
		btnNone.style.backgroundColor = "transparent";
		btnNone.style.backgroundImage = "url(/mono/selectnone.svg)";
		btnNone.style.backgroundSize = "24px 24px";
		btnNone.style.backgroundPosition = "center";
		btnNone.style.backgroundRepeat = "no-repeat";

		const btnAll = document.createElement("input");
		btnAll.type = "button";
		btnAll.style.position = "absolute";
		btnAll.style.right = "0";
		btnAll.style.width = "28px";
		btnAll.style.minWidth = "28px";
		btnAll.style.backgroundColor = "transparent";
		btnAll.style.backgroundImage = "url(/mono/selectall.svg)";
		btnAll.style.backgroundSize = "24px 24px";
		btnAll.style.backgroundPosition = "center";
		btnAll.style.backgroundRepeat = "no-repeat";

		innerBox.append(txtClassFilter, btnNone, btnAll);

		const lstClasses = document.createElement("div");
		lstClasses.className = "wmi-classes-list";
		lstClasses.style.border = "var(--clr-control) solid 1.5px";
		lstClasses.style.gridArea = "3 / 1";
		lstClasses.style.overflowY = "scroll";

		const lstProperties = document.createElement("div");
		lstProperties.className = "wmi-properties-list";
		lstProperties.style.border = "var(--clr-control) solid 1.5px";
		lstProperties.style.gridArea = "3 / 3";
		lstProperties.style.overflowY = "scroll";

		innerBox.append(lstClasses, lstProperties);

		if (!this.wmi_classes.classes) {
			this.ConfirmBox("Failed to load WMI classes.");
			btnOK.onclick();
			return;
		}

		btnOK.addEventListener("click", ()=> {
			
		});

		txtClassFilter.onkeydown = event=>{
			if (event.code === "Escape") {
				txtClassFilter.value = "";
				txtClassFilter.oninput()
			}
		};

		let selected = null;
		let propertiesList = [];
		let propertyCheckboxes = [];

		txtClassFilter.oninput = ()=> {
			if (!this.wmi_classes.classes) return;
			let filter = txtClassFilter.value.toLowerCase();

			lstClasses.textContent = "";
			lstProperties.textContent = "";

			for (let i = 0; i < this.wmi_classes.classes.length; i++) {
				let matched = false;

				if (this.wmi_classes.classes[i].class.toLowerCase().indexOf(filter) > -1) {
					matched = true;
				}
				else {
					for (let j = 0; j < this.wmi_classes.classes[i].properties.length; j++) {
						if (this.wmi_classes.classes[i].properties[j].toLowerCase().indexOf(filter) > -1) {
							matched = true;
							break;
						}
					}
				}

				if (matched) {
					let newClass = document.createElement("div");
					newClass.textContent = this.wmi_classes.classes[i].class;
					lstClasses.appendChild(newClass);

					newClass.onclick = ()=> {
						if (selected != null) selected.style.backgroundColor = "";

						propertiesList = [];
						propertyCheckboxes = [];

						lstProperties.textContent = "";
						for (let j = 0; j < this.wmi_classes.classes[i].properties.length; j++) {

							const divProperty = document.createElement("div");
							const chkProperty = document.createElement("input");
							chkProperty.type = "checkbox";
							chkProperty.checked = false;
							propertyCheckboxes.push(chkProperty);
							divProperty.appendChild(chkProperty);

							propertiesList.push(false);

							this.AddCheckBoxLabel(divProperty, chkProperty, this.wmi_classes.classes[i].properties[j]);
							lstProperties.appendChild(divProperty);

							if (filter && this.wmi_classes.classes[i].properties[j].toLowerCase().indexOf(filter) > -1) {
								divProperty.scrollIntoView({ behavior: "smooth"});
								setTimeout(()=>{divProperty.style.animation = "highlight .8s 1"}, 500);
							}

							selected = newClass;
							selected.style.backgroundColor = "var(--clr-select)";
						}

					};

				}
			}
		};
		txtClassFilter.oninput();

		btnNone.onclick = ()=> {
			if (propertyCheckboxes.length === 0) return;

			for (let i = 0; i < propertyCheckboxes.length; i++) {
				propertyCheckboxes[i].checked = false;
				propertiesList[i] = false;
			}
			
			//propertyCheckboxes[0].onchange();
		};

		btnAll.onclick = ()=> {
			if (propertyCheckboxes.length === 0) return;

			for (let i = 0; i < propertyCheckboxes.length; i++) {
				propertyCheckboxes[i].checked = true;
				propertiesList[i] = true;
			}

			//propertyCheckboxes[0].onchange();
		};

	}

	Start() {
		if (!this.socket) return;
		this.socket.send("start");
		this.startButton.disabled = true;
		this.pauseButton.disabled = false;
	}

	Pause() {
		if (!this.socket) return;
		this.socket.send("pause");
		this.startButton.disabled = false;
		this.pauseButton.disabled = true;
	}
	
	CreateStatBox(name, height, options) {
		const container = document.createElement("div");
		container.className = "oversight-graph-container";
		this.scrollable.appendChild(container);

		const inner = document.createElement("div");
		inner.className = "oversight-graph-inner";
		inner.style.height = `${height}px`;
		container.appendChild(inner);

		const titleLabel = document.createElement("div");
		titleLabel.className = "oversight-graph-title";
		titleLabel.textContent = name;
		inner.appendChild(titleLabel);

		const valueLabel = document.createElement("div");
		valueLabel.className = "oversight-graph-value";
		container.appendChild(valueLabel);

		switch(options.type) {
		case "ping": return this.CreatePingGraph(inner, valueLabel, name, height, options);
		case "percent": return this.CreatePercentGraph(inner, valueLabel, name, height, options);
		case "percents": return this.CreatePercentsGridGraph(inner, valueLabel, name, height, options);
		}
	}

	CreatePingGraph(inner, valueLabel, name, height, options) {
		const canvas = document.createElement("canvas");
		canvas.width = 750;
		canvas.height = height;
		inner.appendChild(canvas);

		let min = Number.MAX_SAFE_INTEGER;
		let max = Number.MIN_SAFE_INTEGER;
		const list = [];
		const gap = 5;

		const ctx = canvas.getContext("2d");

		const DrawGraph = ()=> {
			ctx.clearRect(0, 0, canvas.width, height);

			ctx.beginPath();
			for (let i=list.length-1; i>=0; i--) {
				let x = canvas.width - (list.length-i-1)*gap;
				let y = list[i] < 0 ? height-10 : 24 + Math.min((height - 24) * list[i] / 1000, height - 10);
				ctx.lineTo(x, y);
			}

			ctx.lineTo(canvas.width - list.length*gap + gap, height);
			ctx.lineTo(canvas.width, height);
			ctx.closePath();
			ctx.fillStyle = "#C0C0C010";
			ctx.fill();

			for (let i=list.length-1; i>=0; i--) {
				let x = canvas.width - (list.length-i-1)*gap;
				let y = list[i] < 0 ? height-10 : 24 + Math.min((height - 24) * list[i] / 1000, height - 10);
				let color;
				if (list[i] < 0) { //unreachable/timed out
					color = "rgb(240,16,16)";
				}
				else { //alive
					color = UI.PingColor(list[i]);
				}

				ctx.beginPath();
				ctx.arc(x, y, 1.5, 0, 2*Math.PI);
				ctx.fillStyle = color;
				ctx.fill();
			}
		};

		const Update = value=> {
			if (list.length * gap > 800) list.shift();
			list.push(value);

			if (value > 0) {
				if (min > value) { min = value; }
				if (max < value) { max = value; }
			}

			if (value < 0) {
				valueLabel.textContent = `${options.prefix}: --`;
			}
			else {
				valueLabel.textContent = `${options.prefix}: ${value}${options.unit}`;
			}

			if (max >= 0) {
				valueLabel.textContent += `\nMin-max: ${min}-${max}${options.unit}`;
			}

			DrawGraph();
		};

		return {
			name: name,
			options: options,
			Update: Update
		};
	}

	CreatePercentGraph(inner, valueLabel, name, height, options) {
		const canvas = document.createElement("canvas");
		canvas.width = 750;
		canvas.height = height;
		inner.appendChild(canvas);

		let min = Number.MAX_SAFE_INTEGER;
		let max = Number.MIN_SAFE_INTEGER;
		const list = [];
		const gap = 5;

		const ctx = canvas.getContext("2d");
		ctx.lineWidth = 2;
		ctx.fillStyle = "#C0C0C020";
		ctx.strokeStyle = "#F0F0F0";

		const DrawGraph = ()=>{
			ctx.clearRect(0, 0, canvas.width, height);

			ctx.beginPath();
			for (let i=list.length-1; i>=0; i--) {
				ctx.lineTo(canvas.width - (list.length-i-1)*gap, height - height * list[i] / 100);
			}
			ctx.stroke();

			ctx.lineTo(canvas.width - list.length*gap + gap, height);
			ctx.lineTo(canvas.width, height);
			ctx.closePath();
			ctx.fill();
		};

		const Update = value=> {
			if (list.length * gap > canvas.width) list.shift();
			list.push(value);
			
			if (min > value) { min = value; }
			if (max < value) { max = value; }

			valueLabel.textContent = `${options.prefix}: ${value}${options.unit}`;
			valueLabel.textContent += `\nMin-max: ${min}-${max}${options.unit}`;

			DrawGraph();
		};

		return {
			name: name,
			options: options,
			Update: Update
		};
	}

	CreatePercentsGridGraph(inner, valueLabel, name, height, options) {
		const canvases = [];
		const ctx = [];
		const list = [];
		let gap = 4;
		let min = Number.MAX_SAFE_INTEGER;
		let max = Number.MIN_SAFE_INTEGER;
		
		const DrawGraph = ()=> {
			for (let j=0; j<ctx.length; j++) {
				ctx[j].clearRect(0, 0, canvases[j].width, height);
				ctx[j].beginPath();

				for (let i=list.length-1; i>=0; i--) {
					ctx[j].lineTo(canvases[j].width - (list.length-i-1)*gap, height - height * list[i][j] / 100);
				}
				ctx[j].stroke();

				ctx[j].lineTo(canvases[j].width - list.length*gap + gap, height);
				ctx[j].lineTo(canvases[j].width, height);
				ctx[j].closePath();
				ctx[j].fill();
			}
		};

		const Update = valuesArray=> {
			if (canvases.length === 0) {
				let normalizedLength = Math.min(valuesArray.length, 4);
				gap = 8 / normalizedLength;
				inner.style.backgroundColor = "transparent";
				inner.style.height = `${(height+6) * Math.ceil(valuesArray.length / normalizedLength)}px`;

				for (let i=0; i<valuesArray.length; i++) {
					const container = document.createElement("div");
					container.className = "oversight-graph-inner";
					container.style.position = "absolute";
					container.style.left = `${100 * (i % normalizedLength) / normalizedLength}%`;
					container.style.top = `${(height + 8) * Math.floor(i / normalizedLength)}px`;
					container.style.zIndex = "-1";
					container.style.width = "calc(25% - 8px)";
					container.style.height = `${height}px`;
					inner.appendChild(container);

					const canvas = document.createElement("canvas");
					canvas.width = 750 / normalizedLength;
					canvas.height = height;
					container.appendChild(canvas);
					canvases.push(canvas);

					ctx.push(canvas.getContext("2d"));
					ctx[i].lineWidth = 2;
					ctx[i].fillStyle = "#C0C0C020";
					ctx[i].strokeStyle = "#F0F0F0";
				}
			}

			if (list.length * gap > 400) list.shift();
			list.push(valuesArray);
			
			for (let i=0; i<valuesArray.length; i++) {
				if (min > valuesArray[i]) { min = valuesArray[i]; }
				if (max < valuesArray[i]) { max = valuesArray[i]; }
			}
			
			valueLabel.textContent = `Min-max: ${min}-${max}${options.unit}`;

			DrawGraph();
		};

		return {
			name: name,
			options: options,
			Update: Update
		};
	}

	ConsoleLog(text, level) {
		const line = document.createElement("div");
		line.className = "oversight-console-line";
		line.innerText = `${new Date().toLocaleTimeString(UI.regionalFormat, {})} - ${text}`;

		switch (level) {
			case "info"   : line.style.backgroundImage = "url(mono/info.svg?light)"; break;
			case "warning": line.style.backgroundImage = "url(mono/warning.svg?light)"; break;
			case "error"  : line.style.backgroundImage = "url(mono/error.svg?light)"; break;
		}

		this.consoleBox.appendChild(line);
		line.scrollIntoView();
	}
}
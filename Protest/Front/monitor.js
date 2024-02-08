class Monitor extends Window {
	constructor(params) {
		super();
		this.params = params ?? { file: null};
		this.params.stats ??= [];
		
		this.SetIcon("mono/resmonitor.svg");

		this.socket = null;
		this.link = LOADER.devices.data[this.params.file];
		this.autoReconnect = true;
		this.connectRetries = 0;
		this.hideConsoleOnce = true;
		this.chartsList = [];
		this.count = 0;

		if (params.file && !this.link) {
			this.SetTitle("Resource monitor - not found");
			this.ConfirmBox("Device no longer exists", true).addEventListener("click", ()=>this.Close());
			return;
		}

		this.AddCssDependencies("monitor.css");
		this.AddCssDependencies("wmi.css");
		
		if (this.link.name && this.link.name.v.length > 0) {
			this.SetTitle(`Resource monitor - ${this.link.name.v}`);
		}
		else if (this.link.ip && this.link.ip.v.length > 0) {
			this.SetTitle(`Resource monitor - ${this.link.ip.v}`);
		}
		else {
			this.SetTitle("Resource monitor");
		}

		this.SetupToolbar();
		this.connectButton = this.AddToolbarButton("Connect", "mono/connect.svg?light");
		this.addStatButton = this.AddToolbarButton("Add chart", "mono/add.svg?light");
		this.AddToolbarSeparator();
		this.startButton = this.AddToolbarButton("Start", "mono/play.svg?light");
		this.pauseButton = this.AddToolbarButton("Pause", "mono/pause.svg?light");

		this.connectButton.disabled = true;
		this.startButton.disabled = true;

		this.scrollable = document.createElement("div");
		this.scrollable.className = "monitor-scrollable";

		this.consoleBox = document.createElement("div");
		this.consoleBox.className = "monitor-console";

		this.toggleConsoleButton = document.createElement("input");
		this.toggleConsoleButton.type = "button";
		this.toggleConsoleButton.className = "monitor-toggle-button";

		this.content.append(this.scrollable, this.consoleBox, this.toggleConsoleButton);

		this.connectButton.onclick = ()=> this.InitializeSocketConnection();
		this.addStatButton.onclick = ()=> this.AddChart();
		this.startButton.onclick = ()=> this.Start();
		this.pauseButton.onclick = ()=> this.Pause();

		this.toggleConsoleButton.onclick = ()=> this.ToggleConsole();

		this.chartsList.push(this.CreateChart("ping", 75, { type:"ping", prefix:"RTT", unit:"ms" }));
		this.chartsList.push(this.CreateChart("cpu", 75, { type:"percent", prefix:"Usage", unit:"%" }));
		this.chartsList.push(this.CreateChart("cores", 75, { type:"percents", prefix:"Usage", unit:"%" }));

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
		this.ConsoleLog("Initializing web-socket connection", "info");

		this.connectButton.disabled = true;

		if (this.socket !== null) return;

		let server = window.location.href.replace("https://", "").replace("http://", "");
		if (server.indexOf("/") > 0) server = server.substring(0, server.indexOf("/"));

		this.socket = new WebSocket((KEEP.isSecure ? "wss://" : "ws://") + server + "/ws/monitor");

		this.socket.onopen = event=> {
			this.connectRetries = 0;
			this.socket.send(this.params.file);
			this.ConsoleLog("Web-socket connection established", "info");

			//this.socket.send("ping=true");
			//this.socket.send("cpu=true");
			//this.socket.send("cores=true");

			if (this.hideConsoleOnce) {
				this.hideConsoleOnce = false;
				setTimeout(()=>this.toggleConsoleButton.onclick(), 400);
			}
		};

		this.socket.onmessage = event=> {
			let message = JSON.parse(event.data);

			if (message.loglevel) {
				this.ConsoleLog(message.text, message.loglevel);
				return;
			}

			for (let i=0; i<this.chartsList.length; i++) {
				if (this.chartsList[i].name !== message.result) { continue; }

				if (this.chartsList[i].options.type === "percents") {
					this.chartsList[i].Update(message.value);
				}
				else {
					this.chartsList[i].Update(parseInt(message.value));
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

	ToggleConsole() {
		if (this.consoleBox.style.visibility === "hidden") {
			this.scrollable.style.bottom = "var(--monitor-console-height)";

			this.consoleBox.style.visibility = "visible";
			this.consoleBox.style.opacity = "1";
			this.consoleBox.style.height = "var(--monitor-console-height)";

			this.toggleConsoleButton.style.bottom = "var(--monitor-console-height)";
			this.toggleConsoleButton.style.transform = "none";
		}
		else {
			this.scrollable.style.bottom = "0";

			this.consoleBox.style.visibility = "hidden";
			this.consoleBox.style.opacity = "0";
			this.consoleBox.style.height = "0";

			this.toggleConsoleButton.style.bottom = "8px";
			this.toggleConsoleButton.style.transform = "rotate(180deg)";
		}
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

			return json;
		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/error.svg");
			return {};
		}
	}

	async AddChart() {
		if (!this.socket) {
			this.ConfirmBox("Web-socket is disconnected.", "mono/resmonitor.svg", true);
			return;
		}

		const dialog = this.DialogBox("calc(100% - 40px)");
		if (dialog === null) return;

		const btnOK = dialog.btnOK;
		const innerBox = dialog.innerBox;

		btnOK.disabled = true;

		const spinner = document.createElement("div");
		spinner.className = "spinner";
		spinner.style.textAlign = "left";
		spinner.style.marginTop = "32px";
		spinner.style.marginBottom = "16px";
		spinner.appendChild(document.createElement("div"));

		const status = document.createElement("div");
		status.textContent = "Fetching WMI classes...";
		status.style.textAlign = "center";
		status.style.fontWeight = "bold";
		status.style.animation = "delayed-fade-in 1.5s ease-in 1";
		dialog.innerBox.append(spinner, status);

		const wmiClasses = await this.GetWmiClasses();
		if (!wmiClasses.classes) {
			btnOK.onclick();
			setTimeout(()=> this.ConfirmBox("Unable to load WMI classes.", true, "mono/resmonitor.svg"), 250);
			return;
		}

		dialog.innerBox.removeChild(spinner);
		dialog.innerBox.removeChild(status);
		btnOK.disabled = false;

		innerBox.style.margin = "16px";
		innerBox.style.display = "grid";
		innerBox.style.gridTemplateColumns = "45% 16px auto";
		innerBox.style.gridTemplateRows = "32px 8px auto 100px 8px 64px 8px 64px";

		const templatesTab = document.createElement("button");
		templatesTab.className = "win-dialog-tab";
		templatesTab.style.top = "16px";
		const templatesIcon = document.createElement("div");
		templatesIcon.style.backgroundImage = "url(mono/chart.svg)";
		templatesTab.appendChild(templatesIcon);

		const wmiTab = document.createElement("button");
		wmiTab.className = "win-dialog-tab";
		wmiTab.style.top = "72px";
		const wmiIcon = document.createElement("div");
		wmiIcon.style.backgroundImage = "url(mono/wmi.svg)";
		wmiTab.appendChild(wmiIcon);

		dialog.innerBox.parentElement.append(templatesTab, wmiTab);

		const formatInput = document.createElement("select");
		formatInput.style.gridArea = "1 / 2 / 2 / 2";
		formatInput.style.maxWidth = "200px";

		const queryInput = document.createElement("textarea");
		queryInput.style.resize = "none";
		queryInput.style.gridArea = "8 / 1 / 9 / 4";
		
		const formatOptionsArray = [
			"Ping",
			"Line chart",
			"Line charts (grid)",
			//"Area chart",
			//"Bar chart",
			"Delta chart",
			"Pie chart",
			"Doughnut chart",
			"Single value",
			"List",
			"Table",
			//"Histogram"
		];

		for (let i=0; i<formatOptionsArray.length; i++) {
			const newOption = document.createElement("option");
			newOption.value = formatOptionsArray[i];
			newOption.text = formatOptionsArray[i];
			formatInput.appendChild(newOption);
		}

		const CreateTemplate = (name, icon, type, query, options) => {
			const template = document.createElement("div");
			template.textContent = name;
			template.style.backgroundImage = `url(${icon})`;
			template.className = "monitor-template";

			template.onclick = ()=> {
				switch (type) {
				case "wmi":
					queryInput.value = query;
					break;

				case "snmp":
					queryInput.value = query;
					break;

				case "icmp":
					break;
				}

				formatInput.value = options.format;

			};

			template.ondblclick = ()=> {
				switch (type) {
				case "wmi":
					wmiTab.onclick();
					break;

				case "snmp":
					break;

				case "icmp":
					break;
				}
			};

			return template;
		};

		templatesTab.onclick = ()=> {
			innerBox.textContent = "";

			const templatesBox = document.createElement("div");
			templatesBox.style.border = "var(--clr-control) solid 1.5px";
			templatesBox.style.gridArea = "1 / 1 / 9 / 4";
			templatesBox.style.overflowY = "scroll";
			innerBox.appendChild(templatesBox);

			templatesTab.style.background = "linear-gradient(90deg, transparent 80%, var(--clr-pane) 100%)";
			templatesTab.style.backgroundColor = "var(--clr-pane)";
			wmiTab.style.background = "";
			wmiTab.style.backgroundColor = "";

			templatesBox.appendChild(CreateTemplate(
				"Boot time",
				"mono/clock.svg",
				"wmi",
				"SELECT LastBootUpTime FROM Win32_OperatingSystem",
				{
					format: "Single value"
				}
			));

			templatesBox.appendChild(CreateTemplate(
				"SAT score",
				"mono/personalize.svg",
				"wmi",
				"SELECT WinSPRLevel FROM Win32_WinSAT",
				{
					format: "Single value"
				}
			));

			templatesBox.appendChild(CreateTemplate(
				"BIOS",
				"mono/chip.svg",
				"wmi",
				"SELECT * FROM Win32_BIOS",
				{
					format: "List"
				}
			));

			templatesBox.appendChild(CreateTemplate(
				"CPU",
				"mono/cpu.svg",
				"wmi",
				"SELECT PercentIdleTime FROM Win32_PerfFormattedData_PerfOS_Processor WHERE Name = '_Total'",
				{
					format: "Line chart"
				}
			));

			templatesBox.appendChild(CreateTemplate(
				"CPU Cores",
				"mono/cpu.svg",
				"wmi",
				"SELECT PercentIdleTime FROM Win32_PerfFormattedData_PerfOS_Processor WHERE Name != '_Total'",
				{
					format: "Line charts (grid)"
				}
			));

			templatesBox.appendChild(CreateTemplate(
				"RAM",
				"mono/ram.svg",
				"wmi",
				"SELECT FreePhysicalMemory, TotalVisibleMemorySize FROM Win32_OperatingSystem",
				{
					format: "Line chart"
				}
			));

			templatesBox.appendChild(CreateTemplate(
				"Disk usage",
				"mono/hdd.svg",
				"wmi",
				"SELECT PercentIdleTime FROM Win32_PerfFormattedData_PerfDisk_PhysicalDisk",
				{
					format: "Line chart"
				}
			));

			templatesBox.appendChild(CreateTemplate(
				"Network usage",
				"mono/portscan.svg",
				"wmi",
				"SELECT BytesReceivedPersec, BytesSentPersec FROM Win32_PerfFormattedData_Tcpip_NetworkInterface",
				{
					format: "Delta chart"
				}
			));
			
			templatesBox.appendChild(CreateTemplate(
				"Ping",
				"mono/ping.svg",
				"icmp",
				"",
				{
					format: "Ping"
				}
			));

			templatesBox.appendChild(CreateTemplate(
				"Processes",
				"mono/console.svg",
				"wmi",
				"SELECT Name, ProcessId FROM Win32_Process",
				{
					format: "Table"
				}
			));

			templatesBox.appendChild(CreateTemplate(
				"Battery",
				"mono/battery.svg",
				"wmi",
				"SELECT * FROM Win32_Battery",
				{
					format: "List"
				}
			));

			templatesBox.appendChild(CreateTemplate(
				"Monitor",
				"mono/monitor.svg",
				"wmi",
				"SELECT * FROM Win32_DesktopMonitor",
				{
					format: "List"
				}
			));

			templatesBox.appendChild(CreateTemplate(
				"User info",
				"mono/user.svg",
				"wmi",
				"SELECT UserName FROM Win32_ComputerSystem",
				{
					format: "List"
				}
			));
		};

		wmiTab.onclick = ()=> {
			innerBox.textContent = "";

			templatesTab.style.background = "";
			templatesTab.style.backgroundColor = "";
			wmiTab.style.background = "linear-gradient(90deg, transparent 80%, var(--clr-pane) 100%)";
			wmiTab.style.backgroundColor = "var(--clr-pane)";

			const txtClassFilter = document.createElement("input");
			txtClassFilter.type = "text";
			txtClassFilter.placeholder = "Find..";
			txtClassFilter.style.gridArea = "1 / 1";

			innerBox.append(txtClassFilter);

			const classesBox = document.createElement("div");
			classesBox.className = "wmi-classes-list";
			classesBox.style.border = "var(--clr-control) solid 1.5px";
			classesBox.style.gridArea = "3 / 1 / 7 / 2";
			classesBox.style.overflowY = "scroll";

			const optionsBox = document.createElement("div");
			optionsBox.style.display = "grid";
			optionsBox.style.gridArea = "2 / 2 / 7 / 4";
			optionsBox.style.margin = "8px 20px";
			optionsBox.style.alignItems = "center";
			optionsBox.style.gridTemplateColumns = "100px auto";
			optionsBox.style.gridTemplateRows = "repeat(6, 32px)";

			innerBox.append(classesBox, optionsBox);

			const formatLabel = document.createElement("div");
			formatLabel.textContent = "Format:";

			optionsBox.append(formatLabel, formatInput);


			const minmaxBox = document.createElement("div");
			minmaxBox.style.gridArea = "2 / 1 / 2 / 3";
			optionsBox.appendChild(minmaxBox);
			const minmaxInput = document.createElement("input");
			minmaxInput.type = "checkbox";
			minmaxBox.appendChild(minmaxInput);
			this.AddCheckBoxLabel(minmaxBox, minmaxInput, "Show min-max");

			const averageBox = document.createElement("div");
			averageBox.style.gridArea = "3 / 1 / 3 / 3";
			optionsBox.appendChild(averageBox);
			const averageInput = document.createElement("input");
			averageInput.type = "checkbox";
			averageBox.appendChild(averageInput);
			this.AddCheckBoxLabel(averageBox, averageInput, "Show average");

			const complementingBox = document.createElement("div");
			complementingBox.style.gridArea = "4 / 1 / 4 / 3";
			optionsBox.appendChild(complementingBox);
			const complementingInput = document.createElement("input");
			complementingInput.type = "checkbox";
			complementingBox.appendChild(complementingInput);
			this.AddCheckBoxLabel(complementingBox, complementingInput, "Complementing mode");

			innerBox.append(queryInput);

			let words = queryInput.value.split(" ");
			let className = null;
			if (wmiClasses.classes) {
				for (let i=0; i<words.length; i++) {
					if (words[i].toUpperCase() === "FROM" && i !== words.length-1) {
						className = words[i+1].toLowerCase();
						break;
					}
				}
			}

			let select_index = queryInput.value.indexOf("select");
			let from_index = queryInput.value.indexOf("from");
			let lastProperties = queryInput.value.substring(select_index + 6, from_index).trim();
			let lastPropertiesArray = lastProperties.split(",").map(o=>o.trim());

			txtClassFilter.onkeydown = event=>{
				if (event.code === "Escape") {
					txtClassFilter.value = "";
					txtClassFilter.oninput();
				}
			};

			let selected = null;
			txtClassFilter.oninput = ()=> {
				if (!wmiClasses.classes) return;
				let filter = txtClassFilter.value.toLowerCase();

				classesBox.textContent = "";

				for (let i=0; i<wmiClasses.classes.length; i++) {
					let matched = false;

					if (wmiClasses.classes[i].class.toLowerCase().indexOf(filter) > -1) {
						matched = true;
					}
					else {
						for (let j = 0; j < wmiClasses.classes[i].properties.length; j++) {
							if (wmiClasses.classes[i].properties[j].toLowerCase().indexOf(filter) > -1) {
								matched = true;
								break;
							}
						}
					}

					if (matched) {
						const newClass = document.createElement("div");
						newClass.textContent = wmiClasses.classes[i].class;
						classesBox.appendChild(newClass);

						if (className && className === wmiClasses.classes[i].class.toLowerCase()) {
							newClass.scrollIntoView({ behavior: "smooth"});
							
							selected = newClass;
							selected.style.backgroundColor = "var(--clr-select)";
						}

						newClass.onclick = ()=> {
							if (selected != null) selected.style.backgroundColor = "";

							selected = newClass;
							selected.style.backgroundColor = "var(--clr-select)";
							queryInput.value = "SELECT * FROM " + wmiClasses.classes[i].class;
						};
					}
				}
			};

			txtClassFilter.oninput();
		};

		templatesTab.onclick();

		btnOK.addEventListener("click", ()=> {
			this.count++;

			const chart = {
				action: "addwmi",
				value: queryInput.value,
				id: this.count
			};

			this.chartsList.push(chart);
			this.socket.send(JSON.stringify(chart));
		});
	}

	Start() {
		if (!this.socket) return;
		this.socket.send("{\"action\":\"start\"}");
		this.startButton.disabled = true;
		this.pauseButton.disabled = false;
	}

	Pause() {
		if (!this.socket) return;
		this.socket.send("{\"action\":\"pause\"}");
		this.startButton.disabled = false;
		this.pauseButton.disabled = true;
	}

	CreateChart(name, height, options) {
		const container = document.createElement("div");
		container.className = "monitor-graph-container";
		this.scrollable.appendChild(container);

		const inner = document.createElement("div");
		inner.className = "monitor-graph-inner";
		inner.style.height = `${height}px`;
		container.appendChild(inner);

		const titleLabel = document.createElement("div");
		titleLabel.className = "monitor-graph-title";
		titleLabel.textContent = name;
		inner.appendChild(titleLabel);

		const valueLabel = document.createElement("div");
		valueLabel.className = "monitor-graph-value";
		container.appendChild(valueLabel);

		switch(options.type) {
		case "ping": return this.CreatePingChart(inner, valueLabel, name, height, options);
		case "percent": return this.CreateLineChart(inner, valueLabel, name, height, options);
		case "percents": return this.CreateGridLineChart(inner, valueLabel, name, height, options);
		}
	}

	CreatePingChart(inner, valueLabel, name, height, options) {
		const canvas = document.createElement("canvas");
		canvas.width = 750;
		canvas.height = height;
		inner.appendChild(canvas);

		const dot = document.createElement("div");
		dot.style.position = "absolute";
		dot.style.right = "192px";
		dot.style.top = "10px";
		dot.style.width = "9px";
		dot.style.height = "9px";
		dot.style.borderRadius = "5px";
		inner.parentElement.appendChild(dot);

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

			dot.style.backgroundColor = (list[list.length-1] < 0) ? "rgb(240,16,16)" : UI.PingColor(list[list.length-1]);
			dot.style.boxShadow = `${dot.style.backgroundColor} 0 0 2px`;

			dot.style.animation = "";
			setTimeout(()=>{ dot.style.animation = "heart-beat .1s ease-out 1"; }, 0);
		};

		return {
			name: name,
			options: options,
			Update: Update
		};
	}

	CreateLineChart(inner, valueLabel, name, height, options) {
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

	CreateGridLineChart(inner, valueLabel, name, height, options) {
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
					container.className = "monitor-graph-inner";
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

	CreateDeltaChart(inner, valueLabel, name, height, options) {
		const canvas = document.createElement("canvas");
		canvas.width = 750;
		canvas.height = height;
		inner.appendChild(canvas);

		const last = null;
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
			if (last === null) {
				last = value;
				return;
			}

			let delta = value - last;

			if (list.length * gap > canvas.width) list.shift();
			list.push(delta);
			
			if (min > delta) { min = delta; }
			if (max < delta) { max = delta; }

			valueLabel.textContent = `${options.prefix}: ${delta}${options.unit}`;
			valueLabel.textContent += `\nMin-max: ${min}-${max}${options.unit}`;

			DrawGraph();

			last = value;
		};

		return {
			name: name,
			options: options,
			Update: Update
		};
	}

	ConsoleLog(text, level) {
		const line = document.createElement("div");
		line.className = "monitor-console-line";
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
class Monitor extends Window {
	constructor(params) {
		super();
		this.params = params ?? { file: null};
		this.params.interval ??= 1000;
		this.params.chart ??= [];

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
		this.intervalButton = this.AddToolbarButton("Interval", "mono/metronome.svg?light");
		this.toolbar.appendChild(this.AddToolbarSeparator());
		this.AddSendToChatButton();

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
		this.addStatButton.onclick = ()=> this.ChartDialog();
		this.startButton.onclick = ()=> this.Start();
		this.pauseButton.onclick = ()=> this.Pause();
		this.intervalButton.onclick = ()=> this.SetInterval();
		this.toggleConsoleButton.onclick = ()=> this.ToggleConsole();

		if (this.params.chart.length === 0) {
			this.AddChart("Ping", "icmp", { protocol:"icmp", format:"Ping chart", prefix:"RTT", unit:"ms" });
		}
		else { //restore charts
			const copy = this.params.chart;
			this.params.chart = [];
			for (let i=0; i<copy.length; i++) {
				this.AddChart(copy[i].name, copy[i].value, copy[i].options);
			}
		}

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

			if (this.hideConsoleOnce) {
				this.hideConsoleOnce = false;
				setTimeout(()=>this.toggleConsoleButton.onclick(), 400);
			}

			this.socket.send(JSON.stringify({
				action: "interval",
				value: this.params.interval.toString()
			}));

			for (let i=0; i<this.params.chart.length; i++) {
				this.socket.send(JSON.stringify({
					action: `add${this.params.chart[i].options.protocol}`,
					value: this.params.chart[i].value,
					index: i
				}));
			}
		};

		this.socket.onmessage = event=> {
			let message = JSON.parse(event.data);

			if (message.loglevel) {
				this.ConsoleLog(message.text, message.loglevel);
				return;
			}

			for (let i=0; i<this.chartsList.length; i++) {
				if (this.chartsList[i].index !== message.index) { continue; }
				this.chartsList[i].Update(message.data);
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

	SetInterval() {
		if (!this.socket) return;

		const dialog = this.DialogBox("120px");
		if (dialog === null) return;

		const okButton = dialog.okButton;
		const innerBox = dialog.innerBox;

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
		intervalInput.value = this.params.interval;
		intervalInput.style.width = "100px";
		innerBox.appendChild(intervalInput);

		intervalInput.onkeydown = event=> {
			if (event.key === "Enter") { okButton.click(); }
		};

		okButton.onclick = ()=> {
			this.params.interval = intervalInput.value;

			this.socket.send(JSON.stringify({
				action: "interval",
				value: intervalInput.value.toString()
			}));
			
			this.startButton.disabled = false;
			this.pauseButton.disabled = true;
			dialog.Close();
		};

		intervalInput.focus();
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

	async ChartDialog() {
		if (!this.socket) {
			this.ConfirmBox("Web-socket is disconnected.", "mono/resmonitor.svg", true);
			return;
		}

		const dialog = this.DialogBox("calc(100% - 40px)");
		if (dialog === null) return;

		dialog.innerBox.parentElement.style.maxWidth = "1024px";

		const okButton = dialog.okButton;
		const innerBox = dialog.innerBox;

		okButton.disabled = true;

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
		innerBox.append(spinner, status);

		const wmiClasses = await this.GetWmiClasses();
		if (!wmiClasses.classes) {
			okButton.onclick();
			setTimeout(()=> this.ConfirmBox("Unable to load WMI classes.", true, "mono/resmonitor.svg"), 250);
			return;
		}

		innerBox.removeChild(spinner);
		innerBox.removeChild(status);
		okButton.disabled = false;

		innerBox.style.margin = "16px";

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

		innerBox.parentElement.append(templatesTab, wmiTab);

		const nameInput = document.createElement("input");
		nameInput.type = "text";
		nameInput.style.gridArea = "1 / 2 / 1 / 2";
		nameInput.style.minWidth = "100px";
		nameInput.style.maxWidth = "160px";

		const formatInput = document.createElement("select");
		formatInput.style.gridArea = "2 / 2 / 2 / 2";
		formatInput.style.minWidth = "100px";
		formatInput.style.maxWidth = "160px";

		const formatOptionsArray = [
			"Line chart", "Grid line chart", "Delta chart", "Single value", "List", "Table"
		];

		for (let i=0; i<formatOptionsArray.length; i++) {
			const option = document.createElement("option");
			option.value = formatOptionsArray[i];
			option.text = formatOptionsArray[i];
			formatInput.appendChild(option);
		}

		const unitInput = document.createElement("input");
		unitInput.type = "text";
		unitInput.style.gridArea = "3 / 2 / 3 / 2";
		unitInput.style.minWidth = "100px";
		unitInput.style.maxWidth = "160px";

		const unitDatalist = document.createElement("datalist");
		unitDatalist.id = "MONITOR_UNIT_OPTIONS";
		unitInput.setAttribute("list", unitDatalist.id);

		const unitOptionsArray = ["", "%", "ms", "bps", "Kbps", "Bps", "KBps"];
		for (let i=0; i<unitOptionsArray.length; i++) {
			const option = document.createElement("option");
			option.value = unitOptionsArray[i];
			option.text = unitOptionsArray[i] === "" ? "none" : unitOptionsArray[i];
			unitDatalist.appendChild(option);
		}

		const valueInput = document.createElement("input");
		valueInput.type = "text";
		valueInput.style.gridArea = "4 / 2 / 4 / 2";
		valueInput.style.minWidth = "100px";
		valueInput.style.maxWidth = "160px";

		const maxInput = document.createElement("input");
		maxInput.type = "text";
		maxInput.style.gridArea = "5 / 2 / 5 / 2";
		maxInput.style.minWidth = "100px";
		maxInput.style.maxWidth = "160px";

		const propertiesDatalistId = "m" + new Date().getTime();
		const propertiesDatalist = document.createElement("datalist");
		propertiesDatalist.id = propertiesDatalistId;

		valueInput.setAttribute("list", propertiesDatalistId);
		maxInput.setAttribute("list", propertiesDatalistId);

		const showPeakInput = document.createElement("input");
		showPeakInput.type = "checkbox";

		const complementingInput = document.createElement("input");
		complementingInput.type = "checkbox";

		const dynamicInput = document.createElement("input");
		dynamicInput.type = "checkbox";

		const queryInput = document.createElement("textarea");
		queryInput.style.resize = "none";
		queryInput.style.gridArea = "8 / 1 / 9 / 4";

		let templateOptions = {};
		let selectedElement = null;
		let isCustomized = false;

		const OnChange = ()=> {
			isCustomized = true;
		};

		nameInput.onchange = OnChange;
		unitInput.onchange = OnChange;
		valueInput.onchange = OnChange;
		maxInput.onchange = OnChange;
		showPeakInput.onchange = OnChange;
		complementingInput.onchange = OnChange;
		dynamicInput.onchange = OnChange;

		formatInput.onchange = ()=> {
			OnChange();

			switch (formatInput.value) {
			case "Line chart":
				unitInput.disabled = false;
				valueInput.disabled = false;
				maxInput.disabled = false;
				showPeakInput.disabled = false;
				complementingInput.disabled = false;
				dynamicInput.disabled = false;
				break;

			case "Grid line chart":
				unitInput.disabled = false;
				valueInput.disabled = false;
				maxInput.disabled = false;
				showPeakInput.disabled = false;
				complementingInput.disabled = false;
				dynamicInput.disabled = false;
				break;

			case "Delta chart":
				unitInput.disabled = false;
				valueInput.disabled = false;
				maxInput.disabled = false;
				showPeakInput.disabled = false;
				complementingInput.disabled = false;
				dynamicInput.disabled = false;
				break;

			case "Single value":
				unitInput.disabled = true;
				valueInput.disabled = false;
				maxInput.disabled = true;
				showPeakInput.disabled = true;
				complementingInput.disabled = true;
				dynamicInput.disabled = true;
				break;

			case "List":
				unitInput.disabled = true;
				valueInput.disabled = true;
				maxInput.disabled = true;
				showPeakInput.disabled = true;
				complementingInput.disabled = true;
				dynamicInput.disabled = true;
				break;

			case "Table":
				unitInput.disabled = true;
				valueInput.disabled = true;
				maxInput.disabled = true;
				showPeakInput.disabled = true;
				complementingInput.disabled = true;
				dynamicInput.disabled = true;
				break;
			}
		};

		const CreateTemplate = (name, icon, protocol, query, options) => {
			const template = document.createElement("div");
			template.textContent = name;
			template.style.backgroundImage = `url(${icon})`;
			template.className = "monitor-template";

			template.onclick = ()=> {
				if (selectedElement) {
					selectedElement.style.backgroundColor = "";
				}

				isCustomized = false;
				selectedElement = template;
				template.style.backgroundColor = "var(--clr-select)";

				nameInput.value   = name;
				formatInput.value = options.format;
				unitInput.value   = "unit"  in options ? options.unit  : "None";
				valueInput.value  = "value" in options ? options.value : "";
				maxInput.value    = "max"  in options ? options.max  : 100;

				showPeakInput.checked = options.showPeak;
				complementingInput.checked = options.isComplement;
				dynamicInput.checked = options.isDynamic;

				templateOptions = options;
				templateOptions.protocol = protocol;

				switch (protocol) {
				case "wmi":
					queryInput.value = query;
					break;

				case "snmp":
					queryInput.value = query;
					break;

				case "icmp":
					break;
				}
			};

			template.ondblclick = ()=> {
				switch (protocol) {
				case "wmi":
					okButton.onclick();
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
			innerBox.style.display = "block";
			innerBox.style.border = "var(--clr-control) solid 1.5px";

			const templatesBox = document.createElement("div");
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
				"System info",
				"mono/workstation.svg",
				"wmi",
				"SELECT * FROM Win32_ComputerSystem",
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
					format: "Line chart",
					prefix: "Utilization",
					unit: "%",
					min: 0,
					max: 100,
					value: "PercentIdleTime".toLowerCase(),
					isComplement: true,
					showPeak: true
				}
			));

			templatesBox.appendChild(CreateTemplate(
				"CPU Cores",
				"mono/cpu.svg",
				"wmi",
				"SELECT PercentIdleTime FROM Win32_PerfFormattedData_PerfOS_Processor WHERE Name != '_Total'",
				{
					format: "Grid line chart",
					prefix: "Utilization",
					unit: "%",
					min: 0,
					max: 100,
					value: "PercentIdleTime".toLowerCase(),
					isComplement: true,
					showPeak: true
				}
			));

			templatesBox.appendChild(CreateTemplate(
				"RAM",
				"mono/ram.svg",
				"wmi",
				"SELECT FreePhysicalMemory, TotalVisibleMemorySize FROM Win32_OperatingSystem",
				{
					format: "Line chart",
					prefix: "In use",
					unit: "KB",
					min: 0,
					max: "TotalVisibleMemorySize".toLowerCase(),
					value: "FreePhysicalMemory".toLowerCase(),
					isComplement: true,
					showPeak: false
				}
			));

			templatesBox.appendChild(CreateTemplate(
				"Disk usage",
				"mono/hdd.svg",
				"wmi",
				"SELECT PercentIdleTime FROM Win32_PerfFormattedData_PerfDisk_PhysicalDisk",
				{
					format: "Line chart",
					prefix: "Activity",
					unit: "%",
					min: 0,
					max: 100,
					value: "PercentIdleTime".toLowerCase(),
					isComplement: true,
					showPeak: true
				}
			));

			templatesBox.appendChild(CreateTemplate(
				"NIC downstream",
				"mono/portscan.svg",
				"wmi",
				"SELECT BytesReceivedPersec FROM Win32_PerfFormattedData_Tcpip_NetworkInterface",
				{
					format: "Line chart",
					prefix: "Receive",
					unit: "Bps",
					min: 0,
					max: 1000,
					value: "BytesReceivedPersec".toLowerCase(),
					isDynamic: true,
					isComplement: false,
					showPeak: true
				}
			));

			templatesBox.appendChild(CreateTemplate(
				"NIC upstream",
				"mono/portscan.svg",
				"wmi",
				"SELECT BytesSentPersec FROM Win32_PerfFormattedData_Tcpip_NetworkInterface",
				{
					format: "Line chart",
					prefix: "Send",
					unit: "Bps",
					min: 0,
					max: 1000,
					value: "BytesSentPersec".toLowerCase(),
					isDynamic: true,
					isComplement: false,
					showPeak: true
				}
			));

			templatesBox.appendChild(CreateTemplate(
				"Ping",
				"mono/ping.svg",
				"icmp",
				"",
				{
					format: "Ping",
					prefix: "RTT",
					unit: "ms",
					showPeak: true
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
				"SELECT TimeOnBattery FROM Win32_Battery",
				{
					format: "Single value",
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
					format: "Single value"
				}
			));
		};

		wmiTab.onclick = ()=> {
			innerBox.textContent = "";
			innerBox.style.border = "none";
			innerBox.style.display = "grid";
			innerBox.style.gridTemplateColumns = "40% 16px auto";
			innerBox.style.gridTemplateRows = "32px 8px auto 96px 8px 64px 8px 64px";

			templatesTab.style.background = "";
			templatesTab.style.backgroundColor = "";
			wmiTab.style.background = "linear-gradient(90deg, transparent 80%, var(--clr-pane) 100%)";
			wmiTab.style.backgroundColor = "var(--clr-pane)";

			const classFilterInput = document.createElement("input");
			classFilterInput.type = "text";
			classFilterInput.placeholder = "Find..";
			classFilterInput.style.gridArea = "1 / 1";
	
			innerBox.append(classFilterInput);

			const classesList = document.createElement("div");
			classesList.className = "wmi-classes-list";
			classesList.style.border = "var(--clr-control) solid 1.5px";
			classesList.style.gridArea = "3 / 1 / 7 / 2";
			classesList.style.overflowY = "scroll";

			const propertiesList = document.createElement("div");
			propertiesList.className = "wmi-properties-list";
			propertiesList.style.border = "var(--clr-control) solid 1.5px";
			propertiesList.style.gridArea = "3 / 4 / 4 / 3";
			propertiesList.style.overflowY = "scroll";

			const optionsBox = document.createElement("div");
			optionsBox.style.display = "grid";
			optionsBox.style.gridArea = "4 / 2 / 7 / 4";
			optionsBox.style.margin = "8px 20px";
			optionsBox.style.alignItems = "center";
			optionsBox.style.gridTemplateColumns = "80px auto 80px auto";
			optionsBox.style.gridTemplateRows = "repeat(6, 32px)";

			optionsBox.appendChild(propertiesDatalist);
			optionsBox.appendChild(unitDatalist);
			
			innerBox.append(classesList, propertiesList, optionsBox);

			const nameLabel = document.createElement("div");
			nameLabel.textContent = "Name:";
			nameLabel.style.gridArea = "1 / 1 / 1 / 2";
			optionsBox.append(nameLabel, nameInput);

			const formatLabel = document.createElement("div");
			formatLabel.textContent = "Format:";
			formatLabel.style.gridArea = "2 / 1 / 2 / 2";
			optionsBox.append(formatLabel, formatInput);

			const unitLabel = document.createElement("div");
			unitLabel.textContent = "Unit:";
			unitLabel.style.gridArea = "3 / 1 / 3 / 2";
			optionsBox.append(unitLabel, unitInput);

			const valueLabel = document.createElement("div");
			valueLabel.textContent = "Value:";
			valueLabel.style.gridArea = "4 / 1 / 4 / 2";
			optionsBox.append(valueLabel, valueInput);

			const peakLabel = document.createElement("div");
			peakLabel.textContent = "Max:";
			peakLabel.style.gridArea = "5 / 1 / 5 / 2";
			optionsBox.append(peakLabel, maxInput);

			const showPeakBox = document.createElement("div");
			showPeakBox.style.gridArea = "1 / 3 / 1 / 5";
			optionsBox.appendChild(showPeakBox);
			showPeakBox.appendChild(showPeakInput);
			this.AddCheckBoxLabel(showPeakBox, showPeakInput, "Show peak value");

			const complementingBox = document.createElement("div");
			complementingBox.style.gridArea = "2 / 3 / 2 / 5";
			optionsBox.appendChild(complementingBox);
			complementingBox.appendChild(complementingInput);
			this.AddCheckBoxLabel(complementingBox, complementingInput, "Complementing mode");

			const dynamicBox = document.createElement("div");
			dynamicBox.style.gridArea = "3 / 3 / 3 / 5";
			optionsBox.appendChild(dynamicBox);
			dynamicBox.appendChild(dynamicInput);
			this.AddCheckBoxLabel(dynamicBox, dynamicInput, "Dynamic limits");

			innerBox.append(queryInput);

			let words = queryInput.value.split(" ");
			let className = null;
			if (wmiClasses.classes) {
				for (let i=0; i<words.length; i++) {
					words[i] = words[i].trim().toUpperCase();
					if (words[i] !== "FROM" || i === words.length-1) continue;
					className = words[i+1].toLowerCase();
					break;
				}
			}

			const query = queryInput.value.toLocaleLowerCase();
			let select_index = query.indexOf("select");
			let from_index = query.indexOf("from");
			let lastProperties = queryInput.value.substring(select_index + 6, from_index).trim();
			let lastPropertiesArray = lastProperties.split(",").map(o=>o.trim().toLowerCase());

			valueInput.textContent = "";
			for (let i=0; i<lastPropertiesArray.length; i++) {
				if (lastPropertiesArray[i] === "*") continue;
				const option = document.createElement("option");
				option.value = lastPropertiesArray[i];
				option.text = lastPropertiesArray[i];
				valueInput.appendChild(option);
			}

			propertiesDatalist.textContent = "";
			for (let i=0; i<lastPropertiesArray.length; i++) {
				const option = document.createElement("option");
				option.value = lastPropertiesArray[i];
				option.text = lastPropertiesArray[i];
				propertiesDatalist.appendChild(option);
			}

			classFilterInput.onkeydown = event=>{
				if (event.code === "Escape") {
					classFilterInput.value = "";
					classFilterInput.oninput();
				}
			};

			let selected = null;
			let properties = [];
			let propertyCheckboxes = [];

			const ListProperties = classObject=> {
				properties = [];
				propertyCheckboxes = [];

				for (let j = 0; j < classObject.properties.length; j++) {
					let value = className && className.toLowerCase() === classObject.class.toLowerCase() && lastPropertiesArray.includes(classObject.properties[j].toLowerCase());

					const propertyBox = document.createElement("div");
					const propertyCheckbox = document.createElement("input");
					propertyCheckbox.type = "checkbox";
					propertyCheckbox.checked = value;
					propertyCheckboxes.push(propertyCheckbox);
					propertyBox.appendChild(propertyCheckbox);

					properties.push(value);

					this.AddCheckBoxLabel(propertyBox, propertyCheckbox, classObject.properties[j]);
					propertiesList.appendChild(propertyBox);
				}

				const OnCheckedChange = ()=> {
					OnChange();

					let selectedList = [];
					propertiesDatalist.textContent = "";

					for (let j=0; j<classObject.properties.length; j++) {
						if (propertyCheckboxes[j].checked) {
							selectedList.push(classObject.properties[j]);

							const option = document.createElement("option");
							option.value = classObject.properties[j];
							option.text = classObject.properties[j];
							propertiesDatalist.appendChild(option);
						}
					}

					let query;
					if (selectedList.length === 0 || selectedList.length === classObject.properties.length) {
						query = `SELECT * FROM ${classObject.class}`;
					}
					else {
						query = `SELECT ${selectedList.join(", ")} FROM ${classObject.class}`;
					}
					queryInput.value = query;
				};

				for (let j=0; j<propertyCheckboxes.length; j++) {
					propertyCheckboxes[j].onchange = OnCheckedChange;
				}
			};

			classFilterInput.oninput = ()=> {
				if (!wmiClasses.classes) return;
				let filter = classFilterInput.value.toLowerCase();

				classesList.textContent = "";
				propertiesList.textContent = "";

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
						classesList.appendChild(newClass);

						newClass.onclick = event=> {
							if (selected != null) selected.style.backgroundColor = "";

							propertiesList.textContent = "";

							ListProperties(wmiClasses.classes[i]);

							selected = newClass;
							selected.style.backgroundColor = "var(--clr-select)";
							if (event) {
								queryInput.value = "SELECT * FROM " + wmiClasses.classes[i].class;
							}
						};

						if (className && className === wmiClasses.classes[i].class.toLowerCase()) {
							newClass.scrollIntoView({ behavior: "smooth"});

							selected = newClass;
							selected.style.backgroundColor = "var(--clr-select)";
							selected.onclick();
						}
					}
				}
			};

			classFilterInput.oninput();
		};

		okButton.onclick = ()=> {
			let options = {
				protocol: templateOptions.protocol,
				prefix  : isCustomized ? "" : `${templateOptions.prefix}:`,
				name    : nameInput.value,
				format  : formatInput.value,
				unit    : unitInput.value,
				value   : valueInput.value.toLocaleLowerCase(),
				min     : 0,
				max     : maxInput.value.toLocaleLowerCase(),
				showPeak     : showPeakInput.checked,
				isComplement : complementingInput.checked,
				isDynamic    : dynamicInput.checked,
			};

			this.AddChart(nameInput.value, queryInput.value, options);

			dialog.Close();
		};

		templatesTab.onclick();
	}

	AddChart(name, value, options) {
		this.params.chart.push({
			name: name,
			value: value,
			options: options
		});

		this.chartsList.push(this.CreateChartElement(name, options));
		
		if (this.socket) {
			this.socket.send(JSON.stringify({
				action: "addwmi",
				value: value,
				index: this.count
			}));
		}

		this.count++;
	}

	CreateChartElement(name, options) {
		const container = document.createElement("div");
		container.className = "monitor-graph-container";
		this.scrollable.appendChild(container);

		const inner = document.createElement("div");
		inner.className = "monitor-graph-inner";
		container.appendChild(inner);

		const titleLabel = document.createElement("div");
		titleLabel.className = "monitor-graph-title";
		titleLabel.textContent = name;
		inner.appendChild(titleLabel);

		const valueLabel = document.createElement("div");
		valueLabel.className = "monitor-graph-value";
		container.appendChild(valueLabel);

		/*if (options.format !== "Ping chart") {
			const removeButton = document.createElement("div");
			removeButton.className = "monitor-remove";
			container.appendChild(removeButton);
	
			removeButton.onclick = ()=> {
				this.scrollable.removeChild(container);

				this.socket.send(JSON.stringify({
					action: "remove",
					index: this.count
				}));
			};
		}*/

		switch(options.format) {
		case "Ping chart"      : return this.CreatePingChart(inner, valueLabel, name, options);
		case "Line chart"      : return this.CreateLineChart(inner, valueLabel, name, options);
		case "Grid line chart" : return this.CreateGridLineChart(inner, valueLabel, name, options);
		case "Delta chart"     : return this.CreateDeltaChart(inner, valueLabel, name, options);
		case "Single value"    : return this.CreateSingleValue(inner, name, options);
		case "List"            : return this.CreateList(inner, valueLabel, name, options);
		case "Table"           : return this.CreateTable(inner, valueLabel, name, options);
		}
	}

	CreatePingChart(inner, valueLabel, name, options) {
		const height = 50;
		inner.style.height = `${height}px`;

		const canvas = document.createElement("canvas");
		canvas.width = 750;
		canvas.height = height;
		inner.appendChild(canvas);

		const dot = document.createElement("div");
		dot.style.position = "absolute";
		dot.style.right = "187px";
		dot.style.top = "9px";
		dot.style.width = "10px";
		dot.style.height = "10px";
		dot.style.borderRadius = "5px";
		inner.parentElement.appendChild(dot);

		let peak = Number.MIN_SAFE_INTEGER;
		let valley = Number.MAX_SAFE_INTEGER;
		const list = [];
		const gap = 5;

		const ctx = canvas.getContext("2d");

		const DrawGraph = ()=> {
			ctx.clearRect(0, 0, canvas.width, height);

			ctx.beginPath();
			for (let i=list.length-1; i>=0; i--) {
				let x = canvas.width - (list.length-i-1)*gap;
				let y = list[i] < 0 ? height-6 : 18 + Math.min((height - 18) * list[i] / 1000, height-6);
				ctx.lineTo(x, y);
			}

			ctx.lineTo(canvas.width - list.length*gap + gap, height);
			ctx.lineTo(canvas.width, height);
			ctx.closePath();
			ctx.fillStyle = "#C0C0C010";
			ctx.fill();

			for (let i=list.length-1; i>=0; i--) {
				let x = canvas.width - (list.length-i-1)*gap;
				let y = list[i] < 0 ? height-6 : 18 + Math.min((height - 18) * list[i] / 1000, height-6);

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

		const Update = data=> {
			if (list.length * gap > 800) list.shift();
			list.push(data);

			if (data > 0) {
				if (valley > data) { valley = data; }
				if (peak < data) { peak = data; }
			}

			if (data < 0) {
				valueLabel.textContent = `${options.prefix} --\n`;
			}
			else {
				valueLabel.textContent = `${options.prefix} ${data}${options.unit}\n`;
			}

			if (options.showPeak && peak >=0 && valley !== peak) {
				valueLabel.textContent += `Peak: ${peak}${options.unit}\n`;
			}

			DrawGraph();

			dot.style.backgroundColor = (list[list.length-1] < 0) ? "rgb(240,16,16)" : UI.PingColor(list[list.length-1]);
			dot.style.boxShadow = `${dot.style.backgroundColor} 0 0 2px`;
			dot.style.animation = "";
			setTimeout(()=>{ dot.style.animation = "heart-beat .1s ease-out 1"; }, 0);
		};

		return {
			index: this.count,
			name: name,
			options: options,
			Update: Update
		};
	}

	CreateLineChart(inner, valueLabel, name, options) {
		const height = 75;
		inner.style.height = `${height}px`;

		const canvas = document.createElement("canvas");
		canvas.width = 750;
		canvas.height = height;
		inner.appendChild(canvas);

		const list = [];
		const gap = 5;
		let valley = Number.MAX_SAFE_INTEGER;
		let peak = Number.MIN_SAFE_INTEGER;
		let min = 0;
		let max = 100;

		const ctx = canvas.getContext("2d");
		ctx.fillStyle = "#C0C0C020";

		const DrawGraph = ()=> {
			ctx.clearRect(0, 0, canvas.width, height);

			let spectrum = Math.abs(min - max);

			if (options.showPeak && peak >=0 && valley !== peak) {
				ctx.lineWidth = 1;
				ctx.strokeStyle = "#C0C0C080";
				ctx.setLineDash([3, 2]);
				
				ctx.beginPath();
				ctx.moveTo(0, height - height * peak / spectrum);
				ctx.lineTo(canvas.width, height - height * peak / spectrum);
				ctx.stroke();
			}

			ctx.lineWidth = 2;
			ctx.strokeStyle = "#F0F0F0";
			ctx.setLineDash([]);

			ctx.beginPath();
			for (let i=list.length-1; i>=0; i--) {
				const x = canvas.width - (list.length-i-1)*gap;
				const y = height - height * list[i] / spectrum;
				ctx.lineTo(x, y);
			}
			ctx.stroke();

			ctx.lineTo(canvas.width - list.length*gap + gap, height);
			ctx.lineTo(canvas.width, height);
			ctx.closePath();
			ctx.fill();
		};

		const Update = obj=> {
			let value = parseFloat(obj[options.value][0]);

			min = isNaN(options.min) ? obj[options.min][0] : options.min;
			max = isNaN(options.max) ? obj[options.max][0] : options.max;

			if (options.isComplement) { value = max - value; }

			if (valley > value) { valley = value; }
			if (peak < value) { peak = value; }

			if (options.isDynamic) {
				min = valley * 1.05;
				max = peak * 1.05;
			}

			if (list.length * gap > canvas.width) list.shift();
			list.push(value);

			valueLabel.textContent = `${options.prefix} ${this.FormatUnits(value, options.unit)}\n`;

			if (options.showPeak && valley !== peak) {
				valueLabel.textContent += `Peak: ${this.FormatUnits(peak, options.unit)}\n`;
			}

			DrawGraph();
		};

		return {
			index: this.count,
			name: name,
			options: options,
			Update: Update
		};
	}

	CreateGridLineChart(inner, valueLabel, name, options) {
		const height = 75;
		inner.style.height = `${height}px`;

		const canvases = [];
		const ctx = [];
		const list = [];
		let gap = 4;
		let valley = Number.MAX_SAFE_INTEGER;
		let peak = Number.MIN_SAFE_INTEGER;
		let min = 0;
		let max = 100;

		const DrawGraph = ()=> {
			let spectrum = Math.abs(min - max);

			for (let j=0; j<ctx.length; j++) {
				ctx[j].clearRect(0, 0, canvases[j].width, height);

				if (options.showPeak && peak >=0 && valley !== peak) {
					ctx[j].lineWidth = 1;
					ctx[j].strokeStyle = "#C0C0C080";
					ctx[j].setLineDash([3, 2]);
					
					ctx[j].beginPath();
					ctx[j].moveTo(0, height - height * peak / spectrum);
					ctx[j].lineTo(canvases[j].width, height - height * peak / spectrum);
					ctx[j].stroke();
				}

				ctx[j].lineWidth = 2;
				ctx[j].strokeStyle = "#F0F0F0";
				ctx[j].setLineDash([]);

				ctx[j].beginPath();

				for (let i=list.length-1; i>=0; i--) {
					const x = canvases[j].width - (list.length-i-1)*gap;
					const y = height - height * list[i][j] / spectrum;
					ctx[j].lineTo(x, y);
				}
				ctx[j].stroke();

				ctx[j].lineTo(canvases[j].width - list.length*gap + gap, height);
				ctx[j].lineTo(canvases[j].width, height);
				ctx[j].closePath();
				ctx[j].fill();
			}
		};

		const Update = obj=> {
			let array = obj[options.value];

			min = isNaN(options.min) ? obj[options.min][0] : options.min;
			max = isNaN(options.max) ? obj[options.max][0] : options.max;
			let spectrum = Math.abs(min - max);

			if (options.isComplement) { array = array.map(v=>max - parseInt(v)); }

			for (let i=0; i<array.length; i++) {
				if (valley > array[i]) { valley = array[i]; }
				if (peak < array[i]) { peak = array[i]; }
			}

			if (options.isDynamic) {
				min = valley * 1.05;
				max = peak * 1.05;
				spectrum = Math.abs(min - max);
			}

			if (canvases.length === 0) {
				let normalizedLength = Math.min(array.length, 4);
				gap = 8 / normalizedLength;
				inner.style.backgroundColor = "transparent";
				inner.style.height = `${(height+6) * Math.ceil(array.length / normalizedLength)}px`;

				for (let i=0; i<array.length; i++) {
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
			list.push(array.map(v=>v * 100 / spectrum));

			if (options.showPeak && valley !== peak) {
				valueLabel.textContent = `Peak: ${this.FormatUnits(peak, options.unit)}\n`;
			}

			DrawGraph();
		};

		return {
			index: this.count,
			name: name,
			options: options,
			Update: Update
		};
	}

	CreateDeltaChart(inner, valueLabel, name, options) {
		const height = 75;
		inner.style.height = `${height}px`;

		const canvas = document.createElement("canvas");
		canvas.width = 750;
		canvas.height = height;
		inner.appendChild(canvas);

		const list = [];
		const gap = 5;
		let valley = Number.MAX_SAFE_INTEGER;
		let peak = Number.MIN_SAFE_INTEGER;
		let min = 0;
		let max = 100;
		let last = null;

		const ctx = canvas.getContext("2d");
		ctx.fillStyle = "#C0C0C020";

		const DrawGraph = ()=>{
			ctx.clearRect(0, 0, canvas.width, height);

			let spectrum = Math.abs(min - max);

			if (options.showPeak && peak >=0 && valley !== peak) {
				ctx.lineWidth = 1;
				ctx.strokeStyle = "#C0C0C080";
				ctx.setLineDash([3, 2]);
				
				ctx.beginPath();
				ctx.moveTo(0, height - height * peak / spectrum);
				ctx.lineTo(canvas.width, height - height * peak / spectrum);
				ctx.stroke();
			}

			ctx.lineWidth = 2;
			ctx.strokeStyle = "#F0F0F0";
			ctx.setLineDash([]);

			ctx.beginPath();
			for (let i=list.length-1; i>=0; i--) {
				const x = canvas.width - (list.length-i-1)*gap;
				const y = height - height * list[i] / spectrum;
				ctx.lineTo(x, y);
			}
			ctx.stroke();

			ctx.lineTo(canvas.width - list.length*gap + gap, height);
			ctx.lineTo(canvas.width, height);
			ctx.closePath();
			ctx.fill();
		};

		const Update = obj=> {
			let value = parseFloat(obj[options.value][0]);

			min = isNaN(options.min) ? obj[options.min][0] : options.min;
			max = isNaN(options.max) ? obj[options.max][0] : options.max;

			if (options.isComplement) { value = max - value; }

			if (valley > delta) { valley = delta; }
			if (peak < delta) { peak = delta; }

			if (options.isDynamic) {
				min = valley * 1.05;
				max = peak * 1.05;
			}

			if (last === null) {
				last = value;
				return;
			}

			let delta = value - last;

			if (list.length * gap > canvas.width) list.shift();
			list.push(delta);

			valueLabel.textContent = `${options.prefix} ${this.FormatUnits(value, options.unit)}\n`;

			DrawGraph();

			last = value;
		};

		return {
			index: this.count,
			name: name,
			options: options,
			Update: Update
		};
	}

	CreateSingleValue(inner, name, options) {
		inner.style.height = `${56}px`;

		const valueBox = document.createElement("div");
		valueBox.style.position = "absolute";
		valueBox.style.left = "20px";
		valueBox.style.right = "20px";
		valueBox.style.top = "24px";
		valueBox.style.fontSize = "20px";
		valueBox.style.fontFamily = "monospace";
		valueBox.style.overflow = "hidden";
		valueBox.style.whiteSpace = "nowrap";
		valueBox.style.userSelect = "text";
		inner.appendChild(valueBox);

		const Update = value=>{
			const values = Object.values(value);

			if (values.length > 0 && values[0].length > 0) {
				valueBox.textContent = values[0][0];
			} else {
				valueBox.textContent = "--";
			}
		};

		return {
			index: this.count,
			name: name,
			options: options,
			Update: Update
		};
	}

	CreateList(inner, valueLabel, name, options) {
		const height = 350;
		inner.style.height = `${height}px`;
		inner.style.overflowX = "auto";
		inner.style.overflowY = "auto";
		inner.style.backgroundColor = "var(--clr-pane)";

		const table = document.createElement("table");
		table.className = "wmi-list";
		table.style.marginTop = "20px";
		inner.appendChild(table);

		const Update = value=>{
			const keys = Object.keys(value);
			const values = Object.values(value);
			const count = keys.length;

			valueLabel.textContent = `Count: ${count}`;
			table.textContent = "";

			for (let i=0; i<keys.length; i++) {
				const tr = document.createElement("tr");
				table.appendChild(tr);

				const td = document.createElement("td");
				td.textContent = keys[i];
				tr.appendChild(td);
				
				for (let j=0; j<values[i].length; j++) {
					const td = document.createElement("td");
					td.textContent = values[i][j];
					tr.appendChild(td);
				}
			}
		};

		return {
			index: this.count,
			name: name,
			options: options,
			Update: Update
		};
	}

	CreateTable(inner, valueLabel, name, options) {
		const height = 350;
		inner.style.height = `${height}px`;
		inner.style.overflowX = "auto";
		inner.style.overflowY = "auto";
		inner.style.backgroundColor = "var(--clr-pane)";

		const table = document.createElement("table");
		table.className = "wmi-table";
		table.style.marginTop = "20px";
		inner.appendChild(table);

		const Update = value=>{
			const keys = Object.keys(value);
			const values = Object.values(value);
			const count = values[0].length;
			
			valueLabel.textContent = `Count: ${count}`;
			table.textContent = "";

			const titleTr = document.createElement("tr");
			table.appendChild(titleTr);

			const whiteSpace = document.createElement("td");
			titleTr.appendChild(whiteSpace);
			for (let i=0; i<keys.length; i++) {
				const td = document.createElement("td");
				td.textContent = keys[i];
				titleTr.appendChild(td);
			}

			for (let i=0; i<count; i++) {
				const tr = document.createElement("tr");
				table.appendChild(tr);

				tr.appendChild(document.createElement("td"));

				for (let j=0; j<values.length; j++) {
					const td = document.createElement("td");
					td.textContent = values[j][i];
					tr.appendChild(td);
				}
			}
		};

		return {
			index: this.count,
			name: name,
			options: options,
			Update: Update
		};
	}

	FormatUnits(value, unit) {
		switch (unit) {
		case "B"    : return UI.SizeToString(value);
		case "KB"   : return UI.SizeToString(value*1024);
		case "Bps"  : return UI.BytesPerSecToString(value);
		case "KBps" : return UI.BytesPerSecToString(value*1000);
		case "bps"  : return UI.BitsPerSecToString(value);
		case "Kbps" : return UI.BitsPerSecToString(value*1000);
		default     : return `${value}${unit}`;
		}
	}
}
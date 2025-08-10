class Topology extends Window {
	static DEVICE_ICON = {
		"firewall"    : "mono/firewall.svg",
		"router"      : "mono/router.svg",
		"switch"      : "mono/switch.svg",
		"access point": "mono/accesspoint.svg",
	};

	constructor(args) {
		super();
		this.args = args ?? {};

		this.AddCssDependencies("topology.css");

		this.SetTitle("Topology");
		this.SetIcon("mono/topology.svg");

		this.x0 = 0;
		this.y0 = 0;
		this.selected = null;
		this.dragging = null;
		this.shiftKey  = false;

		this.selectedInterface = null;

		this.ws = null;

		this.devices = {};
		this.links = {};

		this.InitializeComponents();
		this.InitializeSvg();
		this.StartDialog();
	}

	InitializeComponents() {
		this.SetupToolbar();

		this.startButton = this.AddToolbarButton("Start discovery", "mono/play.svg?light");
		this.stopButton = this.AddToolbarButton("Stop", "mono/stop.svg?light");
		this.stopButton.disabled = true;
		this.AddToolbarSeparator();

		this.sortButton = this.AddToolbarButton("Sort", "mono/sort.svg?light");
		this.findButton = this.AddToolbarButton("Find", "mono/search.svg?light");
		this.AddToolbarSeparator();

		this.trafficButton = this.AddToolbarButton("Visualize traffic", "mono/traffic.svg?light");
		this.errorsButton = this.AddToolbarButton("Visualize errors", "mono/warning.svg?light");
		this.loopDetection = this.AddToolbarButton("Close loop detection", "mono/infinite.svg?light");
		this.AddToolbarSeparator();

		this.workspace = document.createElement("div");
		this.workspace.className = "topology-workspace";
		this.content.appendChild(this.workspace);

		this.sideBar = document.createElement("div");
		this.sideBar.className = "topology-sidebar";
		this.content.appendChild(this.sideBar);

		this.infoBox = document.createElement("div");
		this.infoBox.style.visibility = "hidden";
		this.infoBox.className = "topology-info-box";
		this.content.appendChild(this.infoBox);

		this.workspace.onmousedown = event=> this.Topology_onmousedown(event);
		this.content.onmousemove = event=> this.Topology_onmousemove(event);
		this.content.onmouseup = event=> this.Topology_onmouseup(event);

		this.startButton.onclick = ()=> this.StartDialog();
		this.stopButton.onclick = ()=> this.Stop();
		this.sideBar.onscroll = ()=> this.InfoBoxPosition();
	}

	AfterResize() { //override
		this.AdjustSvgSize();
		this.InfoBoxPosition();
	}

	AdjustSvgSize() {
		let maxX = this.workspace.offsetWidth, maxY = this.workspace.offsetHeight;
		for (const file in this.devices) {
			const x = this.devices[file].element.x + 150, y = this.devices[file].element.y + 195;
			if (x > maxX) maxX = x;
			if (y > maxY) maxY = y;
		}

		this.svg.setAttribute("width", maxX === this.workspace.offsetWidth ? Math.max(maxX - 20, 1) - 20 : maxX - 20);
		this.svg.setAttribute("height", maxY === this.workspace.offsetHeight ? Math.max(maxY - 20, 1) - 20 : maxY - 20);
	}

	Topology_onmousedown(event) {
		event.stopPropagation();
		this.BringToFront();

		this.sideBar.textContent = "";

		this.infoBox.style.opacity = "0";
		this.infoBox.style.visibility = "hidden";
		this.infoBox.textContent = "";

		if (this.selected) {
			this.selected.element.highlight.classList.remove("topology-selected");
			this.selected = null;
		}
	}

	Topology_onmousemove(event) {
		if (!this.dragging) return;
		if (event.buttons !== 1) {
			this.dragging = null;
			this.shiftKey = false;
			return;
		}

		let x = this.offsetX - this.x0 + event.clientX;
		let y = this.offsetY - this.y0 + event.clientY;
		if (event.ctrlKey) {
			x = Math.round(x / 50) * 50;
			y = Math.round(y / 50) * 50;
		}

		this.dragging.element.x = x;
		this.dragging.element.y = y;
		this.dragging.element.root.style.transform = `translate(${x}px,${y}px)`;

		if (this.shiftKey) {
			const dx = event.clientX - this.x0;
			const dy = event.clientY - this.y0;

			for (const key in this.dragging.links) {
				const l = this.dragging.links[key];
				const d = this.devices[l.device];
				if (!d.isUnmanaged) continue;

				d.element.x = d.element.x0 + dx;
				d.element.y = d.element.y0 + dy;
				if (event.ctrlKey) {
					d.element.x = Math.round(d.element.x / 50) * 50;
					d.element.y = Math.round(d.element.y / 50) * 50;
				}
				d.element.root.style.transform = `translate(${d.element.x}px,${d.element.y}px)`;
			}
		}

		for (const port in this.dragging.links) {
			const link = this.links[this.dragging.links[port].key];
			if (link && !link.isEndpoint) {
				const linkPath = this.DrawPath(this.dragging, this.devices[this.dragging.links[port].device]);
				link.element.line.setAttribute("d", linkPath.path);
				link.element.capA.setAttribute("cx", linkPath.primary.x);
				link.element.capA.setAttribute("cy", linkPath.primary.y);
				link.element.capB.setAttribute("cx", linkPath.secondary.x);
				link.element.capB.setAttribute("cy", linkPath.secondary.y);
			}
		}

		this.AdjustSvgSize();
	}

	Topology_onmouseup(event) {
		this.dragging = null;
		this.shiftKey = false;
	}

	Clear() {
		this.devices = {};
		this.links = {};
		this.workspace.textContent = "";
		this.sideBar.textContent = "";

		this.infoBox.style.opacity = "0";
		this.infoBox.style.visibility = "hidden";
		this.infoBox.textContent = "";
	}

	InitializeSvg() {
		this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		this.svg.setAttribute("width", 1);
		this.svg.setAttribute("height", 1);
		this.workspace.appendChild(this.svg);

		const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
		this.svg.appendChild(defs);

		const switchMask = document.createElementNS("http://www.w3.org/2000/svg", "mask");
		switchMask.setAttribute("id", "switchMask");
		switchMask.setAttribute("mask-type", "alpha");
		this.svg.appendChild(switchMask);
		const switchImage = document.createElementNS("http://www.w3.org/2000/svg", "image");
		switchImage.setAttribute("x", 4);
		switchImage.setAttribute("y", 4);
		switchImage.setAttribute("width", 88);
		switchImage.setAttribute("height", 88);
		switchImage.setAttribute("href", "mono/switch.svg?light");
		switchMask.appendChild(switchImage);

		const routerMask = document.createElementNS("http://www.w3.org/2000/svg", "mask");
		routerMask.setAttribute("id", "routerMask");
		routerMask.setAttribute("mask-type", "alpha");
		this.svg.appendChild(routerMask);
		const routerImage = document.createElementNS("http://www.w3.org/2000/svg", "image");
		routerImage.setAttribute("x", 4);
		routerImage.setAttribute("y", 4);
		routerImage.setAttribute("width", 88);
		routerImage.setAttribute("height", 88);
		routerImage.setAttribute("href", "mono/router.svg?light");
		routerMask.appendChild(routerImage);

		const firewallMask = document.createElementNS("http://www.w3.org/2000/svg", "mask");
		firewallMask.setAttribute("id", "firewallMask");
		firewallMask.setAttribute("mask-type", "alpha");
		this.svg.appendChild(firewallMask);
		const firewallImage = document.createElementNS("http://www.w3.org/2000/svg", "image");
		firewallImage.setAttribute("x", 4);
		firewallImage.setAttribute("y", 4);
		firewallImage.setAttribute("width", 88);
		firewallImage.setAttribute("height", 88);
		firewallImage.setAttribute("href", "mono/firewall.svg?light");
		firewallMask.appendChild(firewallImage);

		const l2switchMask = document.createElementNS("http://www.w3.org/2000/svg", "mask");
		l2switchMask.setAttribute("id", "l2switchMask");
		l2switchMask.setAttribute("mask-type", "alpha");
		this.svg.appendChild(l2switchMask);
		const l2switchImage = document.createElementNS("http://www.w3.org/2000/svg", "image");
		l2switchImage.setAttribute("x", 2);
		l2switchImage.setAttribute("y", 2);
		l2switchImage.setAttribute("width", 44);
		l2switchImage.setAttribute("height", 44);
		l2switchImage.setAttribute("href", "mono/switch.svg?light");
		l2switchMask.appendChild(l2switchImage);

		this.linksGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
		this.linksGroup.setAttribute("fill", "none");
		this.linksGroup.setAttribute("stroke", "#c0c0c0");
		this.linksGroup.setAttribute("stroke-width", 3);
		this.svg.appendChild(this.linksGroup);
	}

	StartDialog() {
		const dialog = this.DialogBox("320px");
		if (dialog === null) return;

		const {okButton, innerBox} = dialog;

		innerBox.parentElement.style.maxWidth = "400px";

		okButton.value = "Start";

		innerBox.style.padding = "16px 32px";
		innerBox.style.display = "grid";
		innerBox.style.gridTemplateColumns = "auto 200px 50px auto auto";
		innerBox.style.gridTemplateRows = "repeat(6, 34px)";
		innerBox.style.alignItems = "center";

		let counter = 0;
		const AddParameter = (name, tag, type, properties) => {
			counter++;

			const label = document.createElement("div");
			label.style.gridArea = `${counter} / 2`;
			label.textContent = name;

			let input;
			if (tag === "input" && type === "toggle") {
				const box = document.createElement("div");
				box.style.gridArea = `${counter} / 3 / ${counter+1} / 4`;

				const toggle = this.CreateToggle(".", false, box);
				toggle.label.style.minWidth = "0px";
				toggle.label.style.color = "transparent";
				input = toggle.checkbox;

				innerBox.append(label, box);
			}
			else {
				input = document.createElement(tag);
				input.style.gridArea = `${counter} / 3`;
				if (type) { input.type = type; }

				innerBox.append(label, input);
			}

			for (let param in properties) {
				input[param] = properties[param];
			}

			return [label, input];
		};

		const labelInclude = document.createElement("div");
		labelInclude.textContent = "Include:";
		labelInclude.style.gridArea = `${++counter} / 2`;
		innerBox.append(labelInclude);

		const [firewallLabel, firewallInput] = AddParameter("Firewalls", "input", "toggle");
		firewallLabel.style.lineHeight = "24px";
		firewallLabel.style.paddingLeft = "28px";
		firewallLabel.style.backgroundImage = "url(mono/firewall.svg)";
		firewallLabel.style.backgroundSize = "24px";
		firewallLabel.style.backgroundRepeat = "no-repeat";
		firewallInput.checked = true;
		firewallInput.disabled = true;

		const [routerLabel, routerInput] = AddParameter("Routers", "input", "toggle");
		routerLabel.style.lineHeight = "24px";
		routerLabel.style.paddingLeft = "28px";
		routerLabel.style.backgroundImage = "url(mono/router.svg)";
		routerLabel.style.backgroundSize = "24px";
		routerLabel.style.backgroundRepeat = "no-repeat";
		routerInput.checked = true;
		routerInput.disabled = true;

		const [switchLabel, switchInput] = AddParameter("Switches", "input", "toggle");
		switchLabel.style.lineHeight = "24px";
		switchLabel.style.paddingLeft = "28px";
		switchLabel.style.backgroundImage = "url(mono/switch.svg)";
		switchLabel.style.backgroundSize = "24px";
		switchLabel.style.backgroundRepeat = "no-repeat";
		switchInput.checked = true;
		switchInput.disabled = true;

		const [apLabel, apInput] = AddParameter("Wireless access points", "input", "toggle");
		apLabel.style.lineHeight = "24px";
		apLabel.style.paddingLeft = "28px";
		apLabel.style.backgroundImage = "url(mono/accesspoint.svg)";
		apLabel.style.backgroundSize = "24px";
		apLabel.style.backgroundRepeat = "no-repeat";
		apInput.checked = true;
		apInput.disabled = true;

		const [endpointLabel, endpointInput] = AddParameter("End-point hosts", "input", "toggle");
		endpointLabel.style.lineHeight = "24px";
		endpointLabel.style.paddingLeft = "28px";
		endpointLabel.style.backgroundImage = "url(mono/endpoint.svg)";
		endpointLabel.style.backgroundSize = "24px";
		endpointLabel.style.backgroundRepeat = "no-repeat";
		endpointInput.checked = false;

		setTimeout(()=>okButton.focus(), 200);

		okButton.onclick = async ()=> {
			this.Clear();
			this.InitializeSvg();

			dialog.Close();

			const devices = [];
			if (firewallInput.checked) devices.push("firewall");
			if (routerInput.checked) devices.push("router");
			if (switchInput.checked) devices.push("switch");
			if (apInput.checked) devices.push("ap");
			if (endpointInput.checked) devices.push("endpoint");
			this.Connect(devices);
		};
	}

	Connect(devices) {
		let server = window.location.href.replace("https://", "").replace("http://", "");
		if (server.indexOf("/") > 0) server = server.substring(0, server.indexOf("/"));

		if (this.ws != null) {
			try {
				this.ws.close();
			}
			catch {};
		}

		this.ws = new WebSocket(`${KEEP.isSecure ? "wss://" : "ws://"}${server}/ws/topology`);

		this.ws.onopen = ()=> {
			this.startButton.disabled = true;
			this.stopButton.disabled = false;
			this.ws.send(devices.join(";"));
		};

		this.ws.onclose = ()=> {
			this.startButton.disabled = false;
			this.stopButton.disabled = true;

			this.SortBySnmp();
		};

		this.ws.onmessage = event=> {
			const payload = event.data;
			const json = JSON.parse(payload);

			if (json.initial) {
				let count = 0;
				for (let i=0; i<json.initial.length; i++) {
					if (["__proto__", "constructor", "prototype"].includes(json.initial[i].file)) continue;

					const element = this.CreateDeviceElement({
						file: json.initial[i].file,
						type: json.initial[i].type,
						name: json.initial[i].hostname,
						x: 100 + (count % 8) * 150,
						y: 150 + Math.floor(count / 8) * 250
					});

					this.devices[json.initial[i].file] = {
						element: element,
						initial: json.initial[i],
						links  : {},
					};

					count++;
				}
			}
			else if (json.retrieve && !["__proto__", "constructor", "prototype"].includes(json.retrieve)) {
				const device = this.devices[json.retrieve];
				if (device) {
					device.element.spinner.style.visibility = "visible";
					device.element.spinner.style.opacity = "1";
				}
			}
			else if (json.nosnmp && !["__proto__", "constructor", "prototype"].includes(json.nosnmp)) {
				const device = this.devices[json.nosnmp];
				if (device) {
					device.nosnmp = true;
					device.element.spinner.style.visibility = "hidden";
					device.element.spinner.style.opacity = "0";
					device.element.fill.style.fill = "var(--clr-error)";
				}
			}
			else if (json.lldp && !["__proto__", "constructor", "prototype"].includes(json.lldp.file)) {
				const device = this.devices[json.lldp.file];
				if (device && typeof json.lldp === "object") {
					device.lldp = json.lldp;

					device.element.spinner.style.visibility = "hidden";
					device.element.spinner.style.opacity = "0";
					device.element.fill.style.fill = "rgb(88,166,32)";

					this.ComputeLldpNeighbors(device);

					if (this.selected && this.selected.initial.file === json.lldp.file) {
						this.SelectDevice(json.lldp.file);
					}
				}
			}
		};

		this.ws.onerror = ()=> {
			this.startButton.disabled = false;
			this.stopButton.disabled = true;
		};
	}

	Stop() {
		this.startButton.disabled = false;
		this.stopButton.disabled = true;
	}

	SortBySnmp() {
		let count = 0;
		for (const file in this.devices) {
			if (this.devices[file].nosnmp) {
				const element = this.devices[file].element;
				element.root.style.transition = ".4s";
				setTimeout(()=>{
					element.root.style.transition = "none";
				}, 400);

				let x = 100 + 150 * 8 + (count % 2) * 150;
				let y = 50 + Math.floor(count / 2) * 150;
				element.x = x;
				element.y = y;
				element.root.style.transform = `translate(${x}px,${y}px)`;
				count++;
			}
		}

		this.SortOffset();
		//this.AdjustSvgSize();
	}

	SortOffset() {
		let minX = this.workspace.offsetWidth;
		for (const file in this.devices) {
			minX = Math.min(this.devices[file].element.x, minX);
		}

		for (const file in this.devices) {
			const element = this.devices[file].element;
			element.root.style.transition = ".4s";
			setTimeout(()=>{
				element.root.style.transition = "none";
			}, 400);

			let x = element.x - minX + 100;
			let y = element.y;
			element.x = x;
			element.y = y;
			element.root.style.transform = `translate(${x}px,${y}px)`;
		}

		for (const key in this.links) {
			const link = this.links[key];
			if (link.isEndpoint) continue;

			const element = link.element;
			element.line.style.transition = ".4s";
			element.capA.style.transition = ".4s";
			element.capB.style.transition = ".4s";

			setTimeout(()=>{
				element.line.style.transition = "none";
				element.capA.style.transition = "none";
				element.capB.style.transition = "none";
			}, 400);

			const linkPath = this.DrawPath(this.devices[link.deviceA], this.devices[link.deviceB]);
			element.line.setAttribute("d", linkPath.path);
			element.capA.setAttribute("cx", linkPath.primary.x);
			element.capA.setAttribute("cy", linkPath.primary.y);
			element.capB.setAttribute("cx", linkPath.secondary.x);
			element.capB.setAttribute("cy", linkPath.secondary.y);
		}

		this.AdjustSvgSize();
	}

	ComputeLldpNeighbors(device) {
		
	}

	MatchDevice(device, port, index) {
		for (const file in this.devices) {
			const remoteDevice = this.devices[file];
			if (!remoteDevice.lldp) continue;

			if (remoteDevice.lldp.localChassisIdSubtype, device.lldp.remoteChassisIdSubtype[port][index]
				&& remoteDevice.lldp.localChassisId === device.lldp.remoteChassisId[port][index]) {
				return {
					file           : file,
					remoteDevice   : remoteDevice,
					remotePortIndex: this.GetPortIndex(device, remoteDevice, port)
				};
			}
		}

		return null;
	}
	
	MatchDbEntry(device, port, index) {
		const chassisId        = device.lldp.remoteChassisId[port][index];
		const chassisIdSubtype = device.lldp.remoteChassisIdSubtype[port][index];
		const portId           = device.lldp.remotePortId[port][index];
		const portIdSubtype    = device.lldp.remotePortIdSubtype[port][index];

		const match = (file, attribute, string) => {
			const value = LOADER.devices.data[file][attribute]?.v;
			if (!value) return false;

			const split = value.split(";").map(
				o=>o.trim()
				.toLowerCase()
				.replaceAll(" ", "").replaceAll(":", "").replaceAll(".", "").replaceAll("-", "")
			);

			return split.includes(string);
		};

		switch (chassisIdSubtype) {
		case 4: //mac address
			for (const file in LOADER.devices.data) {
				if (match(file, "mac address", chassisId)) return {file: file};
			}
			break;
		
		case 5: //network address
			for (const file in LOADER.devices.data) {
				if (match(file, "ip address", chassisId)) return {file: file};
			}
			break;

		case 7: //local
			for (const file in LOADER.devices.data) {
				if (match(file, "hostname", chassisId)) return {file: file};
			}
			break;
		}

		switch (portIdSubtype) {
		case 3: //mac address
			for (const file in LOADER.devices.data) {
				if (match(file, "mac address", portId)) return {file: file};
			}
			break;
		
		case 4: //network address
			for (const file in LOADER.devices.data) {
				if (match(file, "ip address", portId)) return {file: file};
			}
			break;
		}

		const sysName = device.lldp.remoteSystemName[port][index];
		for (const file in LOADER.devices.data) {
			if (match(file, "hostname", sysName)) return {file: file};
		}

		return null;
	}

	CreateUnmanagedSwitchEntry(parentDevice, parentPort, options) {
		const file = UI.GenerateUuid();
		const element = this.CreateUnmanagedSwitchElement(options, file);

		const device = {
			isUnmanaged: true,
			element    : element,
			initial    : {file: file, type: "switch"},
			links      : [],
		};

		this.devices[file] = device;

		return device;
	}

	Link(deviceA, portIndexA, deviceB, portIndexB) {
		const fileA = deviceA.initial.file;
		const fileB = deviceB.initial.file;
		const key = fileA > fileB
			? `${fileA}-${portIndexA}-${fileB}-${portIndexB}`
			: `${fileB}-${portIndexB}-${fileA}-${portIndexA}`;

		const element = this.CreateLinkElement(deviceA, portIndexA, deviceB, portIndexB);

		//const portNameA = this.GetPortName(deviceA, portA, deviceB);
		//const portNameB = this.GetPortName(deviceB, portB, deviceA);

		const entry = {
			key       : key,
			element   : element,
			deviceA   : fileA,
			portA     : portIndexA,
			deviceB   : fileB,
			portB     : portIndexB,
			isEndpoint: deviceA.isEndpoint || deviceB.isEndpoint
		};

		this.links[key] = entry;


		if (deviceA.isUnmanaged) {
			deviceA.links.push(key);
		}
		else {
			if (portIndexA in deviceA.links) {
				console.warn("port aldeady in use");
			}
			deviceA.links[portIndexA] = key;
		}

		if (deviceB.isUnmanaged) {
			deviceB.links.push(key);
		}
		else {
			if (portIndexB in deviceB.links) {
				console.warn("port aldeady in use");
			}
			deviceB.links[portIndexB] = key;
		}

		return entry;
	}

	CreateDeviceElement(options) {
		const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
		g.style.transform = `translate(${options.x}px,${options.y}px)`;
		g.setAttribute("file", options.file);
		this.svg.appendChild(g);

		const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
		rect.setAttribute("x", 2);
		rect.setAttribute("y", 2);
		rect.setAttribute("rx", 16);
		rect.setAttribute("ry", 16);
		rect.setAttribute("width", 92);
		rect.setAttribute("height", 92);
		rect.setAttribute("fill", "transparent");
		g.appendChild(rect);

		const fill = document.createElementNS("http://www.w3.org/2000/svg", "rect");
		fill.setAttribute("x", 12);
		fill.setAttribute("y", 12);
		fill.setAttribute("width", 72);
		fill.setAttribute("height", 72);
		fill.setAttribute("fill", "transparent");
		fill.style.transition = "fill .4s";
		g.appendChild(fill);

		const icon = document.createElementNS("http://www.w3.org/2000/svg", "rect");
		icon.setAttribute("x", 4);
		icon.setAttribute("y", 4);
		icon.setAttribute("width", 88);
		icon.setAttribute("height", 88);
		icon.setAttribute("fill", "#c0c0c0");
		icon.setAttribute("mask", "url(#switchMask)");
		icon.style.transition = "fill .8s";
		g.appendChild(icon);

		const spinner = document.createElementNS("http://www.w3.org/2000/svg", "circle");
		spinner.setAttribute("cx", 74);
		spinner.setAttribute("cy", 74);
		spinner.setAttribute("r", 12);
		spinner.setAttribute("fill", "none");
		spinner.setAttribute("stroke", "var(--clr-accent)");
		spinner.setAttribute("stroke-width", 6);
		spinner.setAttribute("stroke-linecap", "round");
		spinner.setAttribute("stroke-dasharray", "8 16.5");
		spinner.style.visibility = "hidden";
		spinner.style.opacity = "0";
		spinner.style.transition = ".4s";
		spinner.style.animation = "topology-spinner-animation 1s linear infinite";
		g.appendChild(spinner);

		const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
		label.textContent = options.name;
		label.setAttribute("y", 106);
		label.setAttribute("x", 48);
		label.setAttribute("font-size", "11");
		label.setAttribute("fill", "#c0c0c0");
		label.setAttribute("font-weight", "800");
		label.setAttribute("dominant-baseline", "middle");
		label.setAttribute("text-anchor", "middle");
		g.appendChild(label);

		let text = options.name;
		while (label.getBBox().width > 100 && text.length > 0) {
			text = text.slice(0, -1);
			label.textContent = text + "..."
		}

		this.AdjustSvgSize();

		g.addEventListener("mousedown", event=> {
			event.stopPropagation();
			const element = this.devices[options.file].element;

			this.offsetX = element.x;
			this.offsetY = element.y;
			this.x0 = event.clientX;
			this.y0 = event.clientY;

			this.svg.appendChild(g);
			this.SelectDevice(options.file);
			this.dragging = this.devices[options.file];
			this.shiftKey = event.shiftKey;

			for (const key in this.dragging.links) {
				const l = this.dragging.links[key];
				const d = this.devices[l.device];
				d.element.x0 = d.element.x;
				d.element.y0 = d.element.y;
			}
		});

		return {
			root     : g,
			highlight: rect,
			fill     : fill,
			icon     : icon,
			spinner  : spinner,
			label    : label,
			x        : options.x,
			y        : options.y
		};
	}

	CreateUnmanagedSwitchElement(options, file) {
		const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
		g.style.transform = `translate(${options.x}px,${options.y}px)`;
		g.setAttribute("file", file);
		this.svg.appendChild(g);

		const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
		circle.setAttribute("cx", 24);
		circle.setAttribute("cy", 24);
		circle.setAttribute("r", 23);
		circle.setAttribute("fill", "transparent");
		g.appendChild(circle);

		const icon = document.createElementNS("http://www.w3.org/2000/svg", "rect");
		icon.setAttribute("x", 4);
		icon.setAttribute("y", 4);
		icon.setAttribute("width", 40);
		icon.setAttribute("height", 40);
		icon.setAttribute("rx", 20);
		icon.setAttribute("ry", 20);
		icon.setAttribute("fill", "#c0c0c0");
		icon.setAttribute("mask", "url(#l2switchMask)");
		icon.style.transition = "fill .8s";
		g.appendChild(icon);

		icon.style.animation = "topology-device-animation .2s ease-in-out";
		setTimeout(()=>{ icon.style.animation = "" }, 200);

		g.addEventListener("mousedown", event=> {
			event.stopPropagation();
			const element = this.devices[file].element;

			this.offsetX = element.x;
			this.offsetY = element.y;
			this.x0 = event.clientX;
			this.y0 = event.clientY;
			this.shiftKey = event.shiftKey;

			this.svg.appendChild(g);
			this.SelectDevice(file);
			this.dragging = this.devices[file];
		});

		this.AdjustSvgSize();

		const element = {
			root: g,
			highlight: circle,
			icon: icon,
			x: options.x,
			y: options.y
		};

		return element;
	}

	CreateEndPointElement(parentDevice, file, offset) {
		const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
		dot.setAttribute("cx", 96);
		dot.setAttribute("cy", 12 + offset);
		dot.setAttribute("r", 2);
		dot.setAttribute("fill", "#c0c0c0");
		parentDevice.element.root.appendChild(dot);

		return {
			dot : dot,
			file: file
		};
	}

	CreateLinkElement(deviceA, portA, deviceB, portB, key) {
		if (key in this.links) {
			return this.links[key];
		}

		const linkPath = this.DrawPath(deviceA, deviceB);

		const line = document.createElementNS("http://www.w3.org/2000/svg", "path");
		line.setAttribute("d", linkPath.path);
		this.linksGroup.appendChild(line);

		const capElementA = document.createElementNS("http://www.w3.org/2000/svg", "circle");
		capElementA.setAttribute("fill", "#c0c0c0");
		capElementA.setAttribute("r", 3);
		capElementA.setAttribute("cx", linkPath.primary.x);
		capElementA.setAttribute("cy", linkPath.primary.y);
		capElementA.setAttribute("stroke","none");
		this.linksGroup.appendChild(capElementA);

		const capElementB = document.createElementNS("http://www.w3.org/2000/svg", "circle");
		capElementB.setAttribute("fill", "#c0c0c0");
		capElementB.setAttribute("r", 3);
		capElementB.setAttribute("cx", linkPath.secondary.x);
		capElementB.setAttribute("cy", linkPath.secondary.y);
		capElementB.setAttribute("stroke","none");
		this.linksGroup.appendChild(capElementB);

		const entry = {
			line: line,
			capA: capElementA,
			capB: capElementB,
		};

		return entry;
	}

	GetPortName(device, port, remoteDevice) {
		if (!device.lldp) return null;

		for (let i=0; i<device.lldp.remotePortIdSubtype[port].length; i++) {
			let portName;

			switch (device.lldp.remotePortIdSubtype[port][i]) {
			//case 3: //mac address
			//	portName = device.lldp.remotePortId[port][i];
			//	break;

			case 5: //interface name
				portName = device.lldp.remotePortId[port][i];
				break;

			case 7: //local name
				const portId = device.lldp.remotePortId[port][i];
				portName = !isNaN(portId) && remoteDevice.lldp
					? remoteDevice.lldp.localPortName[portId - 1]
					: portId;
				break;
			}

			if (portName && portName.length > 0) {
				return portName;
			}
		}

		return null;
	}

	GetPortIndex(localDevice, remoteDevice, port) {
		if (!remoteDevice.lldp) return -1;

		const remotePortId = localDevice.lldp.remotePortId[port];
		if (!remotePortId || remotePortId.length === 0) return -1;

		const portIndex = remoteDevice.lldp.localPortId.indexOf(remotePortId[0]);
		return portIndex;
	}

	DrawPath(a, b) {
		const [p, s] = a.element.x < b.element.x ? [a, b] : [b, a];

		const center = node => (
			node.isUnmanaged
				? {x: node.element.x + 24, y: node.element.y + 24}
				: {x: node.element.x + 48, y: node.element.y + 48}
		);

		const pc = center(p);
		const sc = center(s);

		let px = pc.x, py = pc.y;
		let sx = sc.x, sy = sc.y;

		if (p.isUnmanaged) {
			const angle = Math.atan2(sc.y - pc.y, sc.x - pc.x);
			px = pc.x + 24 * Math.cos(angle);
			py = pc.y + 24 * Math.sin(angle);
		}
		else {
			px += p.element.x > s.element.x ? -48 : 48;
		}

		if (s.isUnmanaged) {
			const angle = Math.atan2(pc.y - sc.y, pc.x - sc.x);
			sx = sc.x + 24 * Math.cos(angle);
			sy = sc.y + 24 * Math.sin(angle);
		}
		else {
			sx += p.element.x > s.element.x ? 48 : -48;
		}

		if (Math.abs(pc.x - sc.x) < 88) {
			if (!p.isUnmanaged) {
				py = pc.y + (pc.y < sc.y ? 48 : -48);
				px = (pc.x + sc.x) / 2;
			}
			if (!s.isUnmanaged) {
				sy = sc.y + (pc.y < sc.y ? -48 : 48);
				sx = (pc.x + sc.x) / 2;
			}
		}

		const minX = Math.min(px, sx);
		const x1 = p.isUnmanaged ? px : minX + (px - minX) * 0.7 + (sx - minX) * 0.3;
		const x2 = s.isUnmanaged ? sx : minX + (px - minX) * 0.3 + (sx - minX) * 0.7;
		return {
			primary  : {x:px, y:py},
			secondary: {x:sx, y:sy},
			path     : `M ${px} ${py} C ${x1} ${py} ${x2} ${sy} ${sx} ${sy}`,
		};
	}

	SelectDevice(file) {
		const device = this.devices[file];

		this.infoBox.style.opacity = "0";
		this.infoBox.style.visibility = "hidden";
		this.infoBox.textContent = "";

		if (this.selected) {
			this.selected.element.highlight.classList.remove("topology-selected");
		}

		device.element.highlight.classList.add("topology-selected");

		this.selected = device;

		this.sideBar.textContent = "";

		const initial = device.initial;

		const grid = document.createElement("div");
		grid.className = "topology-sidebar-grid";
		this.sideBar.appendChild(grid);

		const icon = document.createElement("div");
		icon.style.gridArea = "1 / 1 / 5 / 1";
		icon.style.backgroundImage = `url(${Topology.DEVICE_ICON[initial.type.toLowerCase()]})`;
		icon.style.backgroundSize = "64px 64px";
		icon.style.backgroundPosition = "50% 50%";
		icon.style.backgroundRepeat = "no-repeat";
		grid.appendChild(icon);

		const hostnameLabel = document.createElement("div");
		hostnameLabel.style.gridArea = "2 / 2";
		hostnameLabel.style.fontWeight = "bold";
		hostnameLabel.textContent = device.isUnmanaged ? "unmanaged" : initial.hostname;
		grid.appendChild(hostnameLabel);

		const ipLabel = document.createElement("div");
		ipLabel.style.gridArea = "3 / 2";
		ipLabel.textContent = initial.ip;
		grid.appendChild(ipLabel);

		if (device.nosnmp) {
			const snmpLabel = document.createElement("div");
			snmpLabel.className = "topology-error-message";
			snmpLabel.textContent = "SNMP agent is unreachable";
			snmpLabel.setAttribute("nosnmp", true);
			this.sideBar.appendChild(snmpLabel);
		}
		else if (device.undocumented) {
			const undocumentedLabel = document.createElement("div");
			undocumentedLabel.className = "topology-error-message";
			undocumentedLabel.textContent = "Undocumented";
			undocumentedLabel.setAttribute("undocumented", true);
			this.sideBar.appendChild(undocumentedLabel);
		}

		const interfacesList = document.createElement("div");
		interfacesList.className = "topology-interface-list";
		interfacesList.tabIndex = 0;
		this.sideBar.appendChild(interfacesList);

		interfacesList.onkeydown = event=> { this.InterfaceList_onkeydown(event, interfacesList); };

		if (device.lldp) {
			for (const index in device.lldp.localPortName) {
				this.CreateInterfaceListItem(interfacesList, device, index, device.lldp.localPortName[index]);
			}
		}
	}

	InterfaceList_onkeydown(event, interfacesList) {
		if (this.selectedInterface === null) return;

		if (event.key !== "ArrowUp" && event.key !== "ArrowDown" &&
			event.key !== "PageUp" && event.key !== "PageDown" &&
			event.key !== "Home" && event.key !== "End") {
			return;
		}

		this.selectedInterface.className = "";

		const children = interfacesList.childNodes;
		if (children.length === 0) return;
		const lastIndex = [...children].findIndex(node => node === this.selectedInterface);
		if (lastIndex === -1) return;

		event.preventDefault();

		switch (event.key) {
			case "ArrowUp":
				this.selectedInterface = lastIndex > 0 ? children[lastIndex-1] : children[0];
				break;

			case "ArrowDown":
				this.selectedInterface = lastIndex < children.length-1 ? children[lastIndex+1] : children[children.length-1];
				break;

			case "PageUp":
				this.selectedInterface = children[Math.max(0, lastIndex - Math.floor(this.sideBar.offsetHeight / children[0].offsetHeight))];
				break;

			case "PageDown":
				this.selectedInterface = children[Math.min(children.length-1, lastIndex + Math.floor(this.sideBar.offsetHeight / children[0].offsetHeight))];
				break;

			case "Home":
				this.selectedInterface = children[0];
				break;

			case "End":
				this.selectedInterface = children[children.length-1];
				break;
		}

		this.selectedInterface.click();
		this.selectedInterface.scrollIntoView({block:"nearest", inline:"nearest" });
	}

	CreateInterfaceListItem(listbox, device, index, portName) {
		const interfaceBox = document.createElement("div");
		const localBox = document.createElement("div");
		const remoteBox = document.createElement("div");

		let localPortName = portName;
		if (!localPortName || localPortName.length === 0) {
			localPortName = index;
			localBox.style.color = "#404040";
		}

		let remoteName = "";
		if (index in device.links && device.links[index].device) {
			const remoteDevice = this.devices[device.links[index].device];
			remoteName = remoteDevice.initial.hostname;

			if (remoteDevice.isUnmanaged) {
				remoteName = "unmanaged";
				remoteBox.style.fontStyle = "italic";
			}
		}

		listbox.appendChild(interfaceBox);

		localBox.textContent = localPortName;
		remoteBox.textContent = remoteName;
		interfaceBox.append(localBox, remoteBox);

		if (device.links[index] && device.links[index].remotePortName) {
			const remotePortBox = document.createElement("div");
			remotePortBox.textContent = device.links[index].remotePortName;
			interfaceBox.append(remotePortBox);
		}
		else {
			remoteBox.style.width = "calc(75% - 12px)";
			remoteBox.style.borderRadius = "4px";
		}

		const linkKey = device.links[index]?.key ?? null;

		interfaceBox.onmouseenter = ()=> {
			const link = this.links[linkKey];
			if (!link) return;
			const e = link.element;

			if (e.isEndpoint) {
				e.dot.setAttribute("fill", "var(--clr-accent)");
				e.dot.setAttribute("r", 5);
				device.element.root.appendChild(e.dot);
			}
			else {
				e.line.setAttribute("stroke", "var(--clr-accent)");
				e.line.setAttribute("stroke-width", 5);
				e.capA.setAttribute("r", 5);
				e.capA.setAttribute("fill", "var(--clr-accent)");
				e.capB.setAttribute("r", 5);
				e.capB.setAttribute("fill", "var(--clr-accent)");
				this.linksGroup.appendChild(e.line);
				this.linksGroup.appendChild(e.capA);
				this.linksGroup.appendChild(e.capB);
			}
		};

		interfaceBox.onmouseleave = ()=> {
			const link = this.links[linkKey];
			if (!link) return;
			const e = link.element;

			if (e.isEndpoint) {
				e.dot.setAttribute("fill", "#c0c0c0");
				e.dot.setAttribute("r", 2);
			}
			else {
				e.line.setAttribute("stroke", "#c0c0c0");
				e.line.setAttribute("stroke-width", 3);
				e.capA.setAttribute("r", 3);
				e.capA.setAttribute("fill", "#c0c0c0");
				e.capB.setAttribute("r", 3);
				e.capB.setAttribute("fill", "#c0c0c0");
			}
		};

		interfaceBox.onclick = ()=> {
			if (this.selectedInterface) {
				this.selectedInterface.className = "";
			}

			interfaceBox.className = "topology-interface-list-selected";

			this.selectedInterface = interfaceBox;

			this.infoBox.textContent = "";
			this.infoBox.style.visibility = "visible";
			this.infoBox.style.opacity = "1";

			const nameBox = document.createElement("div");
			nameBox.textContent = localPortName;
			nameBox.style.textAlign = "center";
			nameBox.style.backgroundColor = "var(--clr-accent)";
			nameBox.style.borderRadius = "4px";
			this.infoBox.appendChild(nameBox);

			if (device.lldp.remoteChassisId[index]) {
				for (let i=0; i<device.lldp.remoteChassisId[index].length; i++) {
					const box = document.createElement("div");
					box.style.border = "1px solid var(--clr-dark)";
					box.style.borderRadius = "2px";
					box.style.padding = "0 2px";
					box.style.margin = "2px";
					box.textContent = `${device.lldp.remoteChassisId[index][i]}|${device.lldp.remotePortId[index][i]}|${device.lldp.remoteSystemName[index][i]}`;
					this.infoBox.appendChild(box);
				}
			}

			this.InfoBoxPosition();
		};

		return interfaceBox;
	}

	InfoBoxPosition() {
		if (this.selectedInterface === null) return;
		const y = this.selectedInterface.offsetTop + this.selectedInterface.offsetHeight - this.sideBar.scrollTop - 26;

		if (y < 0) {
			this.infoBox.className = "topology-info-box topology-info-box-over-up";
			this.infoBox.style.top = "8px";
		}
		else if (y > this.sideBar.offsetHeight) {
			this.infoBox.className = "topology-info-box topology-info-box-over-down";
			this.infoBox.style.top = `${this.sideBar.offsetHeight - 100}px`;
		}
		else if (y > this.sideBar.offsetHeight - 100) {
			this.infoBox.className = "topology-info-box topology-info-box-last";
			this.infoBox.style.top = `${Math.min(this.sideBar.offsetHeight - 100, y - 80)}px`;
		}
		else {
			this.infoBox.className = "topology-info-box";
			this.infoBox.style.top = `${Math.max(8, y)}px`;
		}
	}
}
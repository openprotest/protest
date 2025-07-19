class Topology extends Window {
	static DEVICE_ICON = {
		"switch": "mono/switch.svg",
		"router": "mono/router.svg",
		"firewall": "mono/firewall.svg",
	};

	constructor(args) {
		super();
		this.args = args ?? {};

		this.x0 = 0;
		this.y0 = 0;
		this.selected = null;
		this.dragging = null;

		this.ws = null;

		this.devices = {};
		this.links = {};

		this.AddCssDependencies("topology.css");

		this.SetTitle("Topology");
		this.SetIcon("mono/topology.svg");

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

		this.content.style.overflow = "auto";

		this.InitializeSvg();

		this.workspace.onmousedown = event=> this.Topology_onmousedown(event);
		this.content.onmousemove   = event=> this.Topology_onmousemove(event);
		this.content.onmouseup     = event=> this.Topology_onmouseup(event);

		this.startButton.onclick = ()=> this.StartDialog();
		this.stopButton.onclick  = ()=> this.Stop();

		this.StartDialog();
	}

	AfterResize() { //override
		this.AdjustSvgSize();
	}

	AdjustSvgSize() {
		let maxX = this.workspace.offsetWidth, maxY = this.workspace.offsetHeight;
		for (const file in this.devices) {
			if (this.devices[file].element.x + 128 > maxX) maxX = this.devices[file].element.x + 128;
			if (this.devices[file].element.y + 148 > maxY) maxY = this.devices[file].element.y + 148;
		}
		
		this.svg.setAttribute("width", maxX === this.workspace.offsetWidth ? Math.max(maxX - 20, 1) - 20 : maxX - 20);
		this.svg.setAttribute("height", maxY === this.workspace.offsetHeight ? Math.max(maxY - 20, 1) - 20: maxY - 20);
	}

	Topology_onmousedown(event) {
		event.stopPropagation();
		this.BringToFront();

		this.sideBar.textContent = "";
			
		if (this.selected) {
			this.selected.element.highlight.classList.remove("topology-selected");
			this.selected = null;
		}
	}

	Topology_onmousemove(event) {
		if (!this.dragging) return;
		if (event.buttons !== 1) {
			this.dragging = null;
			return;
		}

		//const dx = Math.abs(event.clientX - this.x0);
		//const dy = Math.abs(event.clientY - this.y0);
		//if (Math.sqrt(dx*dx + dy*dy) < 4) return;

		const x = this.offsetX - this.x0 + event.clientX;
		const y = this.offsetY - this.y0 + event.clientY;

		this.dragging.element.root.style.transform = `translate(${x}px,${y}px)`;

		this.dragging.element.x = x;
		this.dragging.element.y = y;

		for (const port in this.dragging.links) {
			const link = this.links[this.dragging.links[port].linkKey];
			if (link && !link.isEndpoint) {
				const linkLine = this.DrawLink(this.dragging, this.devices[this.dragging.links[port].device]);
				link.element.setAttribute("d", linkLine.path);
				link.capElementA.setAttribute("cx", linkLine.primary.x);
				link.capElementA.setAttribute("cy", linkLine.primary.y);
				link.capElementB.setAttribute("cx", linkLine.secondary.x);
				link.capElementB.setAttribute("cy", linkLine.secondary.y);
			}
		}

		this.AdjustSvgSize();
	}

	Topology_onmouseup(event) {
		this.dragging = null;
	}

	Clear() {
		this.devices = {};
		this.links = {};
		this.workspace.textContent = "";
		this.sideBar.textContent = "";
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
		const dialog = this.DialogBox("280px");
		if (dialog === null) return;

		const {okButton, innerBox} = dialog;
		
		innerBox.parentElement.style.maxWidth = "400px";

		okButton.value = "Start";

		innerBox.style.padding = "16px 32px";
		innerBox.style.display = "grid";
		innerBox.style.gridTemplateColumns = "auto 150px 50px auto auto";
		innerBox.style.gridTemplateRows = "repeat(5, 34px)";
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

		const [switchLabel, switchInput] = AddParameter("Switches", "input", "toggle");
		switchLabel.style.lineHeight = "24px";
		switchLabel.style.paddingLeft = "28px";
		switchLabel.style.backgroundImage = "url(mono/switch.svg)";
		switchLabel.style.backgroundSize = "24px";
		switchLabel.style.backgroundRepeat = "no-repeat";
		switchInput.checked = true;
		switchInput.disabled = true;

		const [routerLabel, routerInput] = AddParameter("Routers", "input", "toggle");
		routerLabel.style.lineHeight = "24px";
		routerLabel.style.paddingLeft = "28px";
		routerLabel.style.backgroundImage = "url(mono/router.svg)";
		routerLabel.style.backgroundSize = "24px";
		routerLabel.style.backgroundRepeat = "no-repeat";
		routerInput.checked = true;
		routerInput.disabled = true;

		const [firewallLabel, firewallInput] = AddParameter("Firewalls", "input", "toggle");
		firewallLabel.style.lineHeight = "24px";
		firewallLabel.style.paddingLeft = "28px";
		firewallLabel.style.backgroundImage = "url(mono/firewall.svg)";
		firewallLabel.style.backgroundSize = "24px";
		firewallLabel.style.backgroundRepeat = "no-repeat";
		firewallInput.checked = true;
		firewallInput.disabled = true;

		const [endpointLabel, endpointInput] = AddParameter("End-point Host", "input", "toggle");
		endpointLabel.style.lineHeight = "24px";
		endpointLabel.style.paddingLeft = "28px";
		endpointLabel.style.backgroundImage = "url(mono/gear.svg)";
		endpointLabel.style.backgroundSize = "24px";
		endpointLabel.style.backgroundRepeat = "no-repeat";
		endpointInput.checked = false;

		setTimeout(()=>okButton.focus(), 200);

		okButton.onclick = async ()=> {
			this.Clear();
			this.InitializeSvg();

			dialog.Close();

			const devices = [];
			if (switchInput.checked) devices.push("switch");
			if (routerInput.checked) devices.push("router");
			if (firewallInput.checked) devices.push("firewall");
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
			this.ComputeAllLinks();
		};

		this.ws.onmessage = event=> {
			const payload = event.data;
			const json = JSON.parse(payload);

			if (json.initial) {
				let count = 0;
				for (let i=0; i<json.initial.length; i++) {
					const element = this.CreateDeviceElement({
						file: json.initial[i].file,
						type: json.initial[i].type,
						name: json.initial[i].hostname,
						x: 16 + (count % 10) * 128,
						y: 16 + Math.floor(count / 10) * 128
					});

					this.devices[json.initial[i].file] = {
						element: element,
						initial: json.initial[i]
					};

					count++;
				}
			}
			else if (json.retrieve) {
				const device = this.devices[json.retrieve];
				if (device) {
					device.element.spinner.style.visibility = "visible";
					device.element.spinner.style.opacity = "1";
				}
			}
			else if (json.nolldp) {
				const device = this.devices[json.nolldp];
				if (device) {
					device.nolldp = true;
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
				}
			}
		};

		this.ws.onerror = error=> {
			this.startButton.disabled = false;
			this.stopButton.disabled = true;
		};
	}

	Stop() {
		this.startButton.disabled = false;
		this.stopButton.disabled = true;
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
		label.setAttribute("font-weight", "600");
		label.setAttribute("dominant-baseline", "middle");
		label.setAttribute("text-anchor", "middle");
		label.setAttribute("fill", "#c0c0c0");
		g.appendChild(label);

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

	CreateUnmanagedSwitchElement(options, uuid) {
		const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
		g.style.transform = `translate(${options.x}px,${options.y}px)`;
		g.setAttribute("file", uuid);
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

		g.addEventListener("mousedown", event=> {
			event.stopPropagation();
			const element = this.devices[uuid].element;

			this.offsetX = element.x;
			this.offsetY = element.y;
			this.x0 = event.clientX;
			this.y0 = event.clientY;

			this.svg.appendChild(g);
			this.SelectDevice(uuid);
			this.dragging = this.devices[uuid];
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

	CreateEndPointElement(parentDevice, file) {
		const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
		dot.setAttribute("cx", 96);
		dot.setAttribute("cy", 12);
		dot.setAttribute("r", 2);
		dot.setAttribute("fill", "#c0c0c0");
		parentDevice.element.root.appendChild(dot);

		return {
			dot : dot,
			file: file,
			x   : 0,
			y   : 0
		};
	}

	CreateLinkElement(deviceA, portA, deviceB, portB) {
		const fileA = deviceA.initial.file;
		const fileB = deviceB.initial.file;
		const key = fileA > fileB ? `${fileA}-${fileB}` : `${fileB}-${fileA}`;

		if (key in this.links) {
			return this.links[key];
		}

		const linkLine = this.DrawLink(deviceA, deviceB);

		const linkElement = document.createElementNS("http://www.w3.org/2000/svg", "path");
		linkElement.setAttribute("d", linkLine.path);
		this.linksGroup.appendChild(linkElement);

		const capElementA = document.createElementNS("http://www.w3.org/2000/svg", "circle");
		capElementA.setAttribute("fill", "#c0c0c0");
		capElementA.setAttribute("r", 3);
		capElementA.setAttribute("cx", linkLine.primary.x);
		capElementA.setAttribute("cy", linkLine.primary.y);
		capElementA.setAttribute("stroke","none");
		this.linksGroup.appendChild(capElementA);

		const capElementB = document.createElementNS("http://www.w3.org/2000/svg", "circle");
		capElementB.setAttribute("fill", "#c0c0c0");
		capElementB.setAttribute("r", 3);
		capElementB.setAttribute("cx", linkLine.secondary.x);
		capElementB.setAttribute("cy", linkLine.secondary.y);
		capElementB.setAttribute("stroke","none");
		this.linksGroup.appendChild(capElementB);

		const element = {
			key        : key,
			element    : linkElement,
			capElementA: capElementA,
			capElementB: capElementB,
			deviceA    : fileA,
			deviceB    : fileB
		};

		this.links[key] = element;

		return element;
	}

	ComputeAllLinks() {
		for (const file in this.devices) {
			const device = this.devices[file];
			if (!device.lldp) continue;
			
			device.links = {};

			for (const port in device.lldp.remoteChassisIdSubtype) {
				this.ComputePortLink(device, port);
			}
		}
	}

	ComputePortLink(device, port) {
		const remoteInfo = device.lldp.remoteChassisIdSubtype[port];
		if (!remoteInfo || remoteInfo.length === 0) return;

		let link, remoteDevice;
		if (remoteInfo.length === 1) {
			link = this.GetNeighborLink(device, port, 0) || this.GetNeighborLinkOnDatabase(device, port, 0);
			remoteDevice = link?.remoteDevice ?? null;

			if (!link || !link.remoteDevice) return;
		}
		else { //multiple LLDP entries, treat as unmanaged switch
			const remoteDeviceFile = UI.GenerateUuid();
			const element = this.CreateUnmanagedSwitchElement({x:device.element.x + port*4, y:device.element.y + 100}, remoteDeviceFile);

			remoteDevice = {
				unmanaged: true,
				element: element,
				initial: {file: remoteDeviceFile, type: "switch"}
			};

			this.devices[remoteDeviceFile] = remoteDevice;

			link = {
				remoteDevice: remoteDevice,
				remotePortIndex: -1
			};

			for (let i=0; i<remoteInfo.length; i++) {
				const link = this.GetNeighborLink(device, port, i) || this.GetNeighborLinkOnDatabase(device, port, i);
				if (link === null) continue;
			}

			this.ComputeUnmanagedPortLinks(remoteDevice, port, device.lldp);
		}

		if (remoteDevice.isEndpoint) {
			this.LinkEndpoint(device, port, remoteDevice, link);
		}
		else {
			this.LinkDevices(device, port, remoteDevice, link);
		}
	}

	LinkDevices(deviceA, portA, deviceB, link) {
		const linkElement = this.CreateLinkElement(deviceA, -1, deviceB, -1);
		const remotePortName = this.ComputePortName(deviceA, portA, deviceB);

		deviceA.links[portA] = {
			linkKey   : linkElement.key,
			device    : deviceB.initial.file,
			localPort : deviceA.lldp.localPortName[portA],
			remotePort: remotePortName,
			portIndex : link?.remotePortIndex ?? -1
		};

		if (!link.remoteDevice.lldp) { //handle links if remote device is unmanaged
			if (!link.remoteDevice.links) {
				link.remoteDevice.links = [];
			}

			link.remoteDevice.links.push({
				linkKey   : linkElement.key,
				device    : deviceA.initial.file,
				localPort : remotePortName,
				remotePort: deviceA.lldp.localPortName[portA],
				portIndex: -1
			});

			link.remoteDevice.links = link.remoteDevice.links.sort((a, b) => a.localPort.localeCompare(b.localPort));
		}
	}

	LinkEndpoint(device, port, endpoint, link) {
		const fileA = device.initial.file;
		const fileB = endpoint.initial.file;
		const key = fileA > fileB ? `${fileA}-${fileB}` : `${fileB}-${fileA}`;

		const remotePortName = this.ComputePortName(device, port, endpoint);

		device.links[port] = {
			linkKey   : key,
			device    : endpoint.initial.file,
			localPort : device.lldp.localPortName[port],
			remotePort: remotePortName,
			portIndex : link?.remotePortIndex ?? -1
		};

		const element = {
			isEndpoint: true,
			key       : key,
			dot       : link.remoteDevice.element.dot,
			deviceA   : fileA,
			deviceB   : fileB
		};

		this.links[key] = element;

		if (!link.remoteDevice.lldp) { //handle links if remote device is unmanaged
			if (!link.remoteDevice.links) {
				link.remoteDevice.links = [];
			}

			link.remoteDevice.links.push({
				linkKey   : key,
				device    : device.initial.file,
				localPort : remotePortName,
				remotePort: device.lldp.localPortName[port],
				portIndex: -1
			});

			link.remoteDevice.links = link.remoteDevice.links.sort((a, b) => a.localPort.localeCompare(b.localPort));
		}
	}

	ComputeUnmanagedPortLinks(device, parentPort, parentLldp) {
		for (const i in parentLldp.remoteChassisIdSubtype[parentPort]) {
			switch (parentLldp.remoteChassisIdSubtype[parentPort][i]) {
			case 1: //interface alias
			case 2: //port component
			case 3: //mac address
			case 4: //network name
			case 5: //int name
			case 6: //agent circuit ID
			case 7: //local
				//device.links.push({});
				break;

			default: //unknown
				return null;
			}
		}
	}

	ComputePortName(device, port, remoteDevice) {
		for (let i=0; i<device.lldp.remotePortIdSubtype[port].length; i++) {
			let portName;

			switch (device.lldp.remotePortIdSubtype[port][i]) {
			case 5:
				portName = device.lldp.remotePortId[port][i];
				break;

			case 7:
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

	GetNeighborLink(device, port, i) {
		for (const file in this.devices) {
			const remoteDevice = this.devices[file];
			if (!remoteDevice.lldp) continue;

			if (remoteDevice.lldp.localChassisIdSubtype, device.lldp.remoteChassisIdSubtype[port][i]
				&& remoteDevice.lldp.localChassisId === device.lldp.remoteChassisId[port][i]) {
				return {
					remoteDevice   : remoteDevice,
					remotePortIndex: this.GetPortIndex(device, remoteDevice, port)
				};
			}
		}

		//if not in the topology, but has a remote port ID subtype of 5 (interface name),
		//meaning it is a remote switch
		if (device.lldp.remotePortIdSubtype[port][i] === 5) {
			const remoteHostname = device.lldp.remoteSystemName[port][i];

			for (const file in this.devices) {
				const remoteDevice = this.devices[file];
				if (remoteDevice.initial.hostname === remoteHostname) {
					return {
						remoteDevice   : remoteDevice,
						remotePortIndex: this.GetPortIndex(device, remoteDevice, port),
					};
				}
			}

			//const remoteFileB = this.GetNeighborLinkOnDatabase(device, port, i);

			let remoteFile = Object.entries(LOADER.devices.data)
				.find(([file, data]) => (data.hostname?.v || null) === remoteHostname)?.[0];

			remoteFile ??= UI.GenerateUuid();
			
			const remoteType = LOADER.devices.data[remoteFile]?.type?.v || "switch";
			const newDeviceElement = this.CreateDeviceElement({
				file: remoteFile,
				type: remoteType,
				name: remoteHostname,
				x   : 300,
				y   : 300
			});

			newDeviceElement.fill.style.fill = "rgb(32,112,166)";

			const remoteDevice = {
				undocumented: true,
				element: newDeviceElement,
				initial: {
					file    : remoteFile,
					type    : remoteType,
					hostname: remoteHostname
				}
			};

			this.devices[remoteFile] = remoteDevice;

			return {
				remoteDevice   : remoteDevice,
				remotePortIndex: this.GetPortIndex(device, remoteDevice, port),
			};
		}
		else {
			//console.log(device, port, device.lldp.remotePortIdSubtype[port].length);
			//console.log(device.lldp.remoteSystemName[port][i]);
			//console.log(device.lldp.remoteChassisIdSubtype[port][i], device.lldp.remoteChassisId[port][i]);
			//console.log(device.lldp.remotePortIdSubtype[port][i], device.lldp.remotePortId[port][i]);
		}

		if (device.lldp.remotePortIdSubtype[port][i] === 3) { //mac address
			//TODO:
		}

		return null;
	}

	GetNeighborLinkOnDatabase(device, port, i) {
		const remoteFile = this.GetNeighborDeviceOnDatabase(device, port, i);
		if (!remoteFile) return null;

		const dbEntry = LOADER.devices.data[remoteFile];
		const remoteType = dbEntry?.type?.v || "switch";

		const remoteHostname = device.lldp.remoteSystemName[port][i] || dbEntry?.hostname?.v;

		const newEndpointElement = this.CreateEndPointElement(device, remoteFile);

		const remoteDevice = {
			isEndpoint  : true,
			element     : newEndpointElement,
			initial: {
				file    : remoteFile,
				type    : remoteType,
				hostname: remoteHostname
			}
		};

		this.devices[remoteFile] = remoteDevice;

		return {
			remoteDevice   : remoteDevice,
			remotePortIndex: this.GetPortIndex(device, remoteDevice, port),
		};
	}

	GetNeighborDeviceOnDatabase(device, port, i) {
		const chassisId        = device.lldp.remoteChassisId[port][i];
		const chassisIdSubtype = device.lldp.remoteChassisIdSubtype[port][i];
		const portId           = device.lldp.remotePortId[port][i];
		const portIdSubtype    = device.lldp.remotePortIdSubtype[port][i];

		const match = (file, attribute, string) => {
			const value = LOADER.devices.data[file][attribute]?.v;
			if (!value) return false;

			const split = value.split(";").map(
				o=>o.trim()
				.toLowerCase()
				.replaceAll(" ", "")
				.replaceAll(":", "")
				.replaceAll(".", "")
				.replaceAll("-", "")
			);

			return split.includes(string);
		};

		switch (chassisIdSubtype) {
		case 4: //mac address
			for (const file in LOADER.devices.data) {
				if (match(file, "mac address", chassisId)) return file;
			}
			break;
		
		case 5: //network address
			for (const file in LOADER.devices.data) {
				if (match(file, "ip address", chassisId)) return file;
			}
			break;

		case 7: //local
			for (const file in LOADER.devices.data) {
				if (match(file, "hostname", chassisId)) return file;
			}
			break;
		}

		switch (portIdSubtype) {
		case 3: //mac address
			for (const file in LOADER.devices.data) {
				if (match(file, "mac address", portId)) return file;
			}
			break;
		
		case 4: //network address
			for (const file in LOADER.devices.data) {
				if (match(file, "ip address", portId)) return file;
			}
			break;
		}

		const sysName = device.lldp.remoteSystemName[port][i];
		for (const file in LOADER.devices.data) {
			if (match(file, "hostname", sysName)) return file;
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

	DrawLink(a, b) {
		const [p, s] = a.element.x < b.element.x ? [a, b] : [b, a];

		const center = node => (
			node.unmanaged
			? { x: node.element.x + 24, y: node.element.y + 24 }
			: { x: node.element.x + 48, y: node.element.y + 48 }
		);

		const pc = center(p);
		const sc = center(s);

		let px = pc.x, py = pc.y;
		let sx = sc.x, sy = sc.y;

		if (p.unmanaged) {
			const angle = Math.atan2(sc.y - pc.y, sc.x - pc.x);
			px = pc.x + 24 * Math.cos(angle);
			py = pc.y + 24 * Math.sin(angle);
		}
		else {
			px += p.element.x > s.element.x ? -48 : 48;
		}

		if (s.unmanaged) {
			const angle = Math.atan2(pc.y - sc.y, pc.x - sc.x);
			sx = sc.x + 24 * Math.cos(angle);
			sy = sc.y + 24 * Math.sin(angle);
		}
		else {
			sx += p.element.x > s.element.x ? 48 : -48;
		}

		if (Math.abs(pc.x - sc.x) < 88) {
			if (!p.unmanaged) {
				py = pc.y + (pc.y < sc.y ? 48 : -48);
				px = (pc.x + sc.x) / 2;
			}
			if (!s.unmanaged) {
				sy = sc.y + (pc.y < sc.y ? -48 : 48);
				sx = (pc.x + sc.x) / 2;
			}
		}

		const minX = Math.min(px, sx);
		const x1 = p.unmanaged ? px : minX + (px - minX) * 0.7 + (sx - minX) * 0.3;
		const x2 = s.unmanaged ? sx : minX + (px - minX) * 0.3 + (sx - minX) * 0.7;
		return {
			primary  : {x:px, y:py},
			secondary: {x:sx, y:sy},
			path     : `M ${px} ${py} C ${x1} ${py} ${x2} ${sy} ${sx} ${sy}`,
		};
	}

	SelectDevice(file) {
		const device = this.devices[file];

		if (this.selected) {
			if (device.isEndpoint) {

			}
			else {
				this.selected.element.highlight.classList.remove("topology-selected");
			}
		}

		if (device.isEndpoint) {

		}
		else {
			device.element.highlight.classList.add("topology-selected");
		}

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
		hostnameLabel.textContent = device.unmanaged ? "unmanaged" : initial.hostname;
		grid.appendChild(hostnameLabel);

		const ipLabel = document.createElement("div");
		ipLabel.style.gridArea = "3 / 2";
		ipLabel.textContent = initial.ip;
		grid.appendChild(ipLabel);

		if (device.nolldp) {
			const snmpLabel = document.createElement("div");
			snmpLabel.className = "topology-error-message";
			snmpLabel.textContent = "SNMP again is unreachable";
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

		if (device.links && Array.isArray(device.links)) {
			const intList = document.createElement("div");
			intList.className = "topology-interface-list";
			this.sideBar.appendChild(intList);

			for (let i=0; i<device.links.length; i++) {
				this.CreateInterfaceListItem(intList, device, i, device.links[i].localPort);
			}
		}
		else if (device.lldp) {
			const id = device.lldp.localChassisId;
			const idLabel = document.createElement("div");
			if (id && initial.hostname != id && initial.ip != id) {
				idLabel.style.gridArea = "4 / 2";
				idLabel.textContent = id;
				grid.appendChild(idLabel);
			}

			const systemName = device.lldp.localHostname;
			if (systemName) {
				hostnameLabel.textContent = systemName;
				hostnameLabel.style.gridArea = "1 / 2";
				ipLabel.style.gridArea = "2 / 2";
				idLabel.style.gridArea = "3 / 2";
			}

			const intList = document.createElement("div");
			intList.className = "topology-interface-list";
			this.sideBar.appendChild(intList);

			if (!device.links) return;

			for (let i=0; i<device.lldp.localPortName.length; i++) {
				this.CreateInterfaceListItem(intList, device, i, device.lldp.localPortName[i]);
			}
		}
	}

	CreateInterfaceListItem(listbox, device, i, portName) {
		const interfaceBox = document.createElement("div");
		const localBox = document.createElement("div");
		const remoteBox = document.createElement("div");

		let localPortName = portName;
		if (!localPortName || localPortName.length === 0) {
			localPortName = i + 1;
			localBox.style.color = "#404040";
		}

		let remoteName = "";
		if (i in device.links && device.links[i].device) {
			const remoteDevice = this.devices[device.links[i].device];
			remoteName = remoteDevice.initial.hostname;

			if (remoteDevice.unmanaged) {
				remoteName = "unmanaged";
				remoteBox.style.fontStyle = "italic";
			}
		}

		listbox.appendChild(interfaceBox);

		localBox.textContent = localPortName;
		remoteBox.textContent = remoteName;
		interfaceBox.append(localBox, remoteBox);

		if (device.links[i] && device.links[i].remotePort) {
			const remotePortBox = document.createElement("div");
			remotePortBox.textContent = device.links[i].remotePort;
			interfaceBox.append(remotePortBox);
		}
		else {
			remoteBox.style.width = "calc(75% - 12px)";
			remoteBox.style.borderRadius = "4px";
		}

		const linkKey = device.links[i]?.linkKey ?? null;

		interfaceBox.onmouseenter = ()=> {
			const e = this.links[linkKey];
			if (!e) return;
			if (e.isEndpoint) {
				e.dot.setAttribute("fill", "var(--clr-accent)");
				e.dot.setAttribute("r", 5);
				device.element.root.appendChild(e.dot);
			}
			else {
				e.element.setAttribute("stroke", "var(--clr-accent)");
				e.element.setAttribute("stroke-width", 5);
				e.capElementA.setAttribute("r", 5);
				e.capElementA.setAttribute("fill", "var(--clr-accent)");
				e.capElementB.setAttribute("r", 5);
				e.capElementB.setAttribute("fill", "var(--clr-accent)");
				this.linksGroup.appendChild(e.element);
				this.linksGroup.appendChild(e.capElementA);
				this.linksGroup.appendChild(e.capElementB);
			}
		};

		interfaceBox.onmouseleave = ()=> {
			const e = this.links[linkKey];
			if (!e) return;
			if (e.isEndpoint) {
				e.dot.setAttribute("fill", "#c0c0c0");
				e.dot.setAttribute("r", 2);
			}
			else {
				e.element.setAttribute("stroke", "#c0c0c0");
				e.element.setAttribute("stroke-width", 3);
				e.capElementA.setAttribute("r", 3);
				e.capElementA.setAttribute("fill", "#c0c0c0");
				e.capElementB.setAttribute("r", 3);
				e.capElementB.setAttribute("fill", "#c0c0c0");
			}
		};

		return interfaceBox;
	}
}
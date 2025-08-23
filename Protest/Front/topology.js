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
		this.shiftKey = false;
		this.selectedInterface = null;

		this.ws = null;
		this.devices = {};
		this.links = {};

		this.documentedCount = 0;
		this.undocumentedCount = 0;

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

		this.sideBar = document.createElement("div");
		this.sideBar.className = "topology-sidebar";

		this.infoBox = document.createElement("div");
		this.infoBox.style.visibility = "hidden";
		this.infoBox.className = "topology-info-box";

		this.content.append(this.workspace, this.sideBar, this.infoBox);

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
				const file = this.dragging.links[key];
				const link = this.links[file];
				if (link.isEndpoint) continue;

				const remoteDevice = this.dragging.initial.file === link.deviceA
					? this.devices[link.deviceB]
					: this.devices[link.deviceA];

				if (!remoteDevice.isUnmanaged) continue;

				remoteDevice.element.x = remoteDevice.element.x0 + dx;
				remoteDevice.element.y = remoteDevice.element.y0 + dy;

				if (event.ctrlKey) {
					remoteDevice.element.x = Math.round(remoteDevice.element.x / 50) * 50;
					remoteDevice.element.y = Math.round(remoteDevice.element.y / 50) * 50;
				}

				remoteDevice.element.root.style.transform = `translate(${remoteDevice.element.x}px,${remoteDevice.element.y}px)`;
			}
		}

		for (const key in this.dragging.links) {
			const file = this.dragging.links[key];
			const link = this.links[file];

			if (link && !link.isEndpoint) {
				const linkPath = this.DrawPath(this.devices[link.deviceA], this.devices[link.deviceB]);
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

		this.documentedCount = 0;
		this.undocumentedCount = 0;

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
		l2switchImage.setAttribute("x", 0);
		l2switchImage.setAttribute("y", 0);
		l2switchImage.setAttribute("width", 44);
		l2switchImage.setAttribute("height", 44);
		l2switchImage.setAttribute("href", "mono/switch.svg?light");
		l2switchMask.appendChild(l2switchImage);

		this.linesLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
		this.linesLayer.setAttribute("fill", "none");
		this.linesLayer.setAttribute("stroke", "#c0c0c0");
		this.linesLayer.setAttribute("stroke-width", 3);
		this.svg.appendChild(this.linesLayer);
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
				this.documentedCount = json.initial.length;

				for (let i=0; i<json.initial.length; i++) {
					if (["__proto__", "constructor", "prototype"].includes(json.initial[i].file)) continue;

					const element = this.CreateDeviceElement({
						file: json.initial[i].file,
						type: json.initial[i].type,
						name: json.initial[i].hostname,
						x: 100 + (i % 8) * 150,
						y: 150 + Math.floor(i / 8) * 250
					});

					this.devices[json.initial[i].file] = {
						element: element,
						initial: json.initial[i],
						links  : {},
					};
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
			else if (json.dot1q && !["__proto__", "constructor", "prototype"].includes(json.dot1q.file)) {
				const device = this.devices[json.dot1q.file];
				device.dot1q = json.dot1q;

				if (this.selected && this.selected.initial.file === json.dot1q.file) {
					this.SelectDevice(json.dot1q.file);
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
		const unmanagedSwitches = {};

		for (const port in device.lldp.remotePortId) {
			const remotePortInfo = device.lldp.remotePortId[port];
			if (!remotePortInfo || remotePortInfo.length === 0) continue;

			if (remotePortInfo.length === 1) {
				const match = this.MatchDevice(device, port, 0) ?? this.MatchDbEntry(device, port, 0);

				if (match in this.devices) {
					const remoteDevice    = this.devices[match];
					const remotePort      = this.ComputeRemotePort(device, port, 0, remoteDevice);
					let   remotePortIndex = remotePort?.index ?? -1;

					if (remoteDevice.isUndocumented) {
						remotePortIndex = remoteDevice.links.length;
						this.SynthesizePseudoLldp(device, port, 0, remoteDevice, remotePortIndex);
					}

					if (remotePortIndex > -1) {
						this.Link(device, port, remoteDevice, remotePortIndex);
					}
					else {
						//TODO:
					}
				}
				else {
					this.LinkEndpoint(device, port, match);
				}
			}
			else { //multiple LLDP entries, treat as unmanaged switch
				const matches = [];
				const ambiguousIndexes = {};
				let   nonAmbiguousCount = 0;

				for (let i=0; i<remotePortInfo.length; i++) {
					let match = this.MatchDevice(device, port, i);

					if (match) {
						nonAmbiguousCount++;
					}
					else {
						ambiguousIndexes[i] = true;
					}

					match ??= this.MatchDbEntry(device, port, i);
					matches.push(match);
				}

				const nonNullMatches = matches.filter(o=> o !== null);
				const isSingle = nonNullMatches.length > 1 && nonNullMatches.every(o=> o === matches[0]);

				if (nonAmbiguousCount === 1 && !isSingle) {
					if (!device.lldp.ambiguous) device.lldp.ambiguous = {}
					device.lldp.ambiguous[port] = ambiguousIndexes;
					//console.info("port skipped due to ambiguity", device, port);
					continue;
				}

				if (isSingle) {
					const remoteDevice  = this.devices[matches[0]];
					let remotePort      = this.ComputeRemotePort(device, port, 0, remoteDevice);
					let remotePortIndex = remotePort?.index ?? -1;

					this.SynthesizePseudoLldp(device, port, 0, remoteDevice, remotePortIndex);
					this.Link(device, port, remoteDevice, remotePortIndex);
				}
				else {
					unmanagedSwitches[port] = {
						length                : remotePortInfo.length,
						matches               : matches,
						remoteChassisIdSubtype: device.lldp.remoteChassisIdSubtype[port],
						remoteChassisId       : device.lldp.remoteChassisId[port],
						remotePortIdSubtype   : device.lldp.remotePortIdSubtype[port],
						remotePortId          : device.lldp.remotePortId[port],
						remoteSystemName      : device.lldp.remoteSystemName[port]
					};
				}
			}
		}

		let count = 0;
		const total = Object.keys(unmanagedSwitches).length;
		const totalWidth = total * 36;
		for (const parentPort in unmanagedSwitches) {
			const x = device.element.x - totalWidth / 2 + count * 36 + 42;
			const y = device.element.y - 100 + (count % 2 === 0 ? 0 : 30);
			count++;

			const options = {x:x, y:y};

			const unmanagedSwitch = this.CreateUnmanagedSwitchEntry(device, parentPort, options);
			const length = unmanagedSwitches[parentPort].length;

			const pseudoLldp = {
				file: unmanagedSwitch.initial.file,
				localPortCount        : length + 1,
				localPortName         : Object.assign({}, new Array(length + 1).fill("--")),
				localPortIdSubtype    : Object.assign({}, new Array(length + 1).fill(0)),
				localPortId           : Object.assign({}, new Array(length + 1).fill("")),
				remoteChassisIdSubtype: {0:[device.lldp.localChassisIdSubtype]},
				remoteChassisId       : {0:[device.lldp.localChassisId]},
				remotePortIdSubtype   : {0:[device.lldp.localPortIdSubtype[parentPort]]},
				remotePortId          : {0:[device.lldp.localPortId[parentPort]]},
				remoteSystemName      : {0:[device.lldp.localHostname]}
			};

			for (let i=0; i<unmanagedSwitches[parentPort].remotePortId.length; i++) {
				pseudoLldp.remoteChassisIdSubtype[i+1] = [unmanagedSwitches[parentPort].remoteChassisIdSubtype[i]];
				pseudoLldp.remoteChassisId[i+1]        = [unmanagedSwitches[parentPort].remoteChassisId[i]];
				pseudoLldp.remotePortIdSubtype[i+1]    = [unmanagedSwitches[parentPort].remotePortIdSubtype[i]];
				pseudoLldp.remotePortId[i+1]           = [unmanagedSwitches[parentPort].remotePortId[i]];
				pseudoLldp.remoteSystemName[i+1]       = [unmanagedSwitches[parentPort].remoteSystemName[i]];
			}

			unmanagedSwitch.lldp = pseudoLldp;

			if (!(parentPort in device.links)) {
				//TODO: handle floating switches
				this.Link(device, parentPort, unmanagedSwitch, 0);
			}

			for (let i=0; i<unmanagedSwitches[parentPort].matches.length; i++) {
				const match = unmanagedSwitches[parentPort].matches[i];
				if (!match) continue;

				if (match in this.devices) {

				}
				else {
					this.LinkEndpoint(unmanagedSwitch, i + 1, match);
				}
			}
		}
	}

	ComputeRemotePort(device, port, index, remoteDevice) {
		const remoteLldp = remoteDevice.lldp || {};

		const findPortIndex = name=> {
			for (const i in remoteLldp.localPortName) {
				if (remoteLldp.localPortId[i] === name) return i;
				if (remoteLldp.localPortName[i] === name) return i;
			}
			return -1;
		};

		if (device.lldp.remoteChassisIdSubtype[port][index] === 6) { //interface name
			const interfaceName = device.lldp.remoteChassisId[port][index];
			return {
				name: interfaceName,
				index: findPortIndex(interfaceName)
			};
		}

		if (device.lldp.remotePortIdSubtype[port][index] === 5) { //interface name
			const interfaceName = device.lldp.remotePortId[port][index];
			return {
				name: interfaceName,
				index: findPortIndex(interfaceName)
			};
		}

		if (device.lldp.remotePortIdSubtype[port][index] === 7) { //local name
			const portId = device.lldp.remotePortId[port][index];
			const interfaceName = !isNaN(portId) && remoteLldp.localPortName
				? remoteLldp.localPortName[portId]
				: portId;
			return {
				name: interfaceName,
				index: portId
			};
		}

		return null;
	}

	SynthesizePseudoLldp(device, port, portIndex, remoteDevice, remotePortIndex) {
		remoteDevice.lldp.localPortCount                      = remotePortIndex;
		remoteDevice.lldp.localPortName[remotePortIndex]      = device.lldp.remotePortId[port][portIndex];
		remoteDevice.lldp.localChassisIdSubtype               = device.lldp.remoteChassisIdSubtype[port][portIndex];
		remoteDevice.lldp.localChassisId                      = device.lldp.remoteChassisId[port][portIndex];
		remoteDevice.lldp.localPortIdSubtype[remotePortIndex] = device.lldp.remoteChassisIdSubtype[port][portIndex];
		remoteDevice.lldp.localPortId[remotePortIndex]        = device.lldp.remoteChassisId[port][portIndex];

		if (!remoteDevice.lldp.remoteChassisIdSubtype) {
			remoteDevice.lldp.remoteChassisIdSubtype = {};
			remoteDevice.lldp.remoteChassisId        = {};
			remoteDevice.lldp.remotePortIdSubtype    = {};
			remoteDevice.lldp.remotePortId           = {};
			remoteDevice.lldp.remoteSystemName       = {};
		}

		remoteDevice.lldp.remoteChassisIdSubtype[remotePortIndex] = [device.lldp.localChassisIdSubtype];
		remoteDevice.lldp.remoteChassisId[remotePortIndex]        = [device.lldp.localChassisId];
		remoteDevice.lldp.remotePortIdSubtype[remotePortIndex]    = [device.lldp.localPortIdSubtype[port]];
		remoteDevice.lldp.remotePortId[remotePortIndex]           = [device.lldp.localPortId[port]];
		remoteDevice.lldp.remoteSystemName[remotePortIndex]       = [device.lldp.localHostname];
	}

	MatchDevice(device, port, index) {
		for (const file in this.devices) {
			const candidate = this.devices[file];
			if (!candidate.lldp) continue;

			if (candidate.lldp.localChassisIdSubtype === device.lldp.remoteChassisIdSubtype[port][index]
				&& candidate.lldp.localChassisId === device.lldp.remoteChassisId[port][index]) {
				return file;
			}
		}

		const targetName = device.lldp.remoteSystemName[port][index]?.toUpperCase();
		if (targetName && targetName.length > 0) {
			for (const file in this.devices) {
				const candidate = this.devices[file];
				if ((candidate.initial.hostname?.toUpperCase() ?? "") === targetName) return file;
			}
		}

		if (device.lldp.remotePortIdSubtype[port][index] === 5) { //remote port is interface
			const entry = this.CreateUndocumentedEntry(device, port, index);
			return entry.initial.file;
		}

		return null;
	}

	MatchDbEntry(device, port, index) {
		const chassisId        = device.lldp.remoteChassisId[port][index].toLowerCase();
		const chassisIdSubtype = device.lldp.remoteChassisIdSubtype[port][index];
		const portId           = device.lldp.remotePortId[port][index].toLowerCase();
		const portIdSubtype    = device.lldp.remotePortIdSubtype[port][index];

		const match = (file, attribute, string)=> {
			const value = LOADER.devices.data[file][attribute]?.v.toLowerCase();
			if (!value) return false;

			let split;
			if (attribute === "ip") {
				split = value.split(";").map(o=>o.trim());
			}
			else if (attribute === "mac address") {
					split = value.split(";").map(
					o=>o.trim()
					.replaceAll(" ", "").replaceAll(":", "").replaceAll("-", "").replaceAll(".", "")
				);
			}
			else {
				split = value.split(";").map(o=>o.trim());
			}

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
				if (match(file, "ip", chassisId)) return file;
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
				if (match(file, "ip", portId)) return file;
			}
			break;
		}

		const sysName = device.lldp.remoteSystemName[port][index].toLowerCase();
		for (const file in LOADER.devices.data) {
			if (match(file, "hostname", sysName)) return file;
		}

		return null;
	}

	CreateUnmanagedSwitchEntry(parentDevice, parentPort, options) {
		const file = UI.GenerateUuid();
		const element = this.CreateUnmanagedSwitchElement(options, file);

		const entry = {
			isUnmanaged: true,
			element    : element,
			initial    : {file: file, type: "switch"},
			links      : []
		};

		this.devices[file] = entry;

		return entry;
	}

	CreateUndocumentedEntry(device, port, index) {
		const dbFile = this.MatchDbEntry(device, port, index);

		let deviceType     = null;
		let deviceIp       = null;
		let deviceMac      = null;
		let deviceLocation = null;
		if (dbFile) {
			deviceType     = LOADER.devices.data[dbFile]?.type.v.toLowerCase() ?? null;
			deviceIp       = LOADER.devices.data[dbFile]?.ip.v ?? null;
			deviceMac      = LOADER.devices.data[dbFile]["mac address"]?.v ?? null;
			deviceLocation = LOADER.devices.data[dbFile]?.location?.v.toLowerCase() ?? null;
		}

		deviceType ??= "switch";
		const isRouter = deviceType === "router";

		const file = dbFile ?? UI.GenerateUuid();
		const hostname = device.lldp.remoteSystemName[port][index];

		const count = this.documentedCount + this.undocumentedCount;
		const x = 100 + (count % 8) * 150;
		const y = 150 + Math.floor(count / 8) * 250;

		const element = this.CreateDeviceElement({
			isRouter: isRouter,
			file    : file,
			type    : deviceType,
			name    : hostname,
			x       : x,
			y       : y
		});

		element.fill.setAttribute("fill", "rgb(232,118,0)");

		const lldp = {
			localPortCount       : 0,
			localChassisIdSubtype: deviceMac ? 4 : null,
			localChassisId       : deviceMac ? deviceMac : null,
			localPortIdSubtype   : {},
			localPortId          : {},
			localHostname        : hostname,
			localPortName        : {}
		};

		const entry = {
			isUndocumented: true,
			isRouter      : isRouter,
			element       : element,
			lldp          : lldp,
			links         : [],
			initial: {
				file: file,
				hostname: hostname,
				ip: deviceIp,
				location: deviceLocation,
				type: deviceType
			}
		};

		this.devices[file] = entry;

		this.undocumentedCount++;

		return entry;
	}

	Link(deviceA, portIndexA, deviceB, portIndexB) {
		if (portIndexA in deviceA.links) {
			console.info("port already in use: ", deviceA, portIndexA);
			return null;
		}

		if (portIndexB in deviceB.links) {
			console.info("port already in use: ", deviceB, portIndexB);
			return null;
		}

		const fileA = deviceA.initial.file;
		const fileB = deviceB.initial.file;
		const key = fileA > fileB
			? `${fileA}-${portIndexA}-${fileB}-${portIndexB}`
			: `${fileB}-${portIndexB}-${fileA}-${portIndexA}`;

		const element = this.CreateLinkElement(deviceA, portIndexA, deviceB, portIndexB, key);

		const entry = {
			key       : key,
			element   : element,
			deviceA   : fileA,
			portIndexA: portIndexA,
			deviceB   : fileB,
			portIndexB: portIndexB,
			isEndpoint: false
		};

		this.links[key] = entry;

		if (deviceA.isUnmanaged) {
			deviceA.links.push(key);
		}
		else {
			deviceA.links[portIndexA] = key;
		}

		if (deviceB.isUnmanaged) {
			deviceB.links.push(key);
		}
		else {
			deviceB.links[portIndexB] = key;
		}

		return entry;
	}

	Unlink(deviceA, portIndexA, deviceB, portIndexB) {
		const fileA = deviceA.initial.file;
		const fileB = deviceB.initial.file;
		const key = fileA > fileB
			? `${fileA}-${portIndexA}-${fileB}-${portIndexB}`
			: `${fileB}-${portIndexB}-${fileA}-${portIndexA}`;

		const entry = this.links[key];
		if (!entry) return;

		this.linesLayer.removeChild(entry.element.line);
		this.linesLayer.removeChild(entry.element.capA);
		this.linesLayer.removeChild(entry.element.capB);

		if (deviceA.isUnmanaged) {
			const index = deviceA.links.indexOf(key);
			if (index > -1) deviceA.links.splice(index, 1);
		}
		else {
			delete deviceA.links[portIndexA];
		}

		if (deviceB.isUnmanaged) {
			const index = deviceB.links.indexOf(key);
			if (index > -1) deviceB.links.splice(index, 1);
		}
		else {
			delete  deviceB.links[portIndexB];
		}

		delete this.links[key];
	}

	LinkEndpoint(device, portIndex, endpoint) {
		const deviceFile = device.initial.file;
		const key = `${deviceFile}-${portIndex}-${endpoint}-e`;

		const element = this.CreateEndPointElement(device, endpoint);

		if (device.isUnmanaged) {
			const angle = (portIndex - 1) / -Math.PI;

			element.dot.setAttribute("cx", 24 + 28 * Math.cos(angle));
			element.dot.setAttribute("cy", 24 + 28 * Math.sin(angle));
		}
		else {
			const offset = 72 * portIndex / device.lldp.localPortCount;
			element.dot.setAttribute("cx", 100);
			element.dot.setAttribute("cy", 12 + offset);
		}

		const entry = {
			key       : key,
			element   : element,
			deviceA   : deviceFile,
			portIndexA: portIndex,
			deviceB   : endpoint,
			portIndexB: 0,
			isEndpoint: true
		};

		this.links[key] = entry;

		if (device.isUnmanaged) {
			device.links.push(key);
		}
		else {
			if (portIndex in device.links) { 
				console.info("port already in use", device, portIndex);
			}
			device.links[portIndex] = key;
		}

		return entry;
	}

	CreateDeviceElement(options) {
		const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
		g.style.transform = `translate(${options.x}px,${options.y}px)`;
		g.setAttribute("file", options.file);
		this.svg.appendChild(g);

		const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
		rect.setAttribute("x", options.isRouter ? 0 : 2);
		rect.setAttribute("y", options.isRouter ? 0 : 2);
		rect.setAttribute("rx", options.isRouter ? 48 : 16);
		rect.setAttribute("ry", options.isRouter ? 48 : 16);
		rect.setAttribute("width", options.isRouter ? 96 : 92);
		rect.setAttribute("height", options.isRouter ? 96 : 92);
		rect.setAttribute("fill", "transparent");
		g.appendChild(rect);

		const fill = document.createElementNS("http://www.w3.org/2000/svg", "rect");
		fill.setAttribute("x", 10);
		fill.setAttribute("y", 8);
		fill.setAttribute("rx", options.isRouter ? 38 : 8);
		fill.setAttribute("ry", options.isRouter ? 38 : 8);
		fill.setAttribute("width", 76);
		fill.setAttribute("height", 80);
		fill.setAttribute("fill", "transparent");
		fill.style.transition = "fill .4s";
		g.appendChild(fill);

		const icon = document.createElementNS("http://www.w3.org/2000/svg", "rect");
		icon.setAttribute("x", 4);
		icon.setAttribute("y", 4);
		icon.setAttribute("width", 88);
		icon.setAttribute("height", 88);
		icon.setAttribute("fill", "#c0c0c0");
		icon.style.transition = "fill .8s";
		g.appendChild(icon);

		icon.setAttribute("mask", `url(#${{
			"firewall"    : "firewallMask",
			"router"      : "routerMask",
			"switch"      : "switchMask",
			"access point": ""
		}[options.type.toLowerCase()]})`);

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
				const file = this.dragging.links[key];
				const link = this.links[file];
				if (link.isEndpoint) continue;

				const remoteDevice = options.file === link.deviceA
					? this.devices[link.deviceB]
					: this.devices[link.deviceA];

				remoteDevice.element.x0 = remoteDevice.element.x;
				remoteDevice.element.y0 = remoteDevice.element.y;
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
		circle.setAttribute("cx", 22);
		circle.setAttribute("cy", 22);
		circle.setAttribute("r", 23);
		circle.setAttribute("fill", "transparent");
		g.appendChild(circle);

		const icon = document.createElementNS("http://www.w3.org/2000/svg", "rect");
		icon.setAttribute("x", 2);
		icon.setAttribute("y", 2);
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

	CreateEndPointElement(parentDevice, file) {
		const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
		dot.setAttribute("r", 4);
		dot.setAttribute("fill", "var(--clr-accent)");
		dot.style.display = "none";
		parentDevice.element.root.appendChild(dot);

		return {
			isEndpoint: true,
			dot       : dot,
			file      : file
		};
	}

	CreateLinkElement(deviceA, portIndexA, deviceB, portIndexB, key) {
		if (key in this.links) {
			return this.links[key];
		}

		const linkPath = this.DrawPath(deviceA, deviceB);

		const line = document.createElementNS("http://www.w3.org/2000/svg", "path");
		line.setAttribute("d", linkPath.path);
		this.linesLayer.appendChild(line);

		const capElementA = document.createElementNS("http://www.w3.org/2000/svg", "circle");
		capElementA.setAttribute("fill", "#c0c0c0");
		capElementA.setAttribute("r", 3);
		capElementA.setAttribute("cx", linkPath.primary.x);
		capElementA.setAttribute("cy", linkPath.primary.y);
		capElementA.setAttribute("stroke","none");
		this.linesLayer.appendChild(capElementA);

		const capElementB = document.createElementNS("http://www.w3.org/2000/svg", "circle");
		capElementB.setAttribute("fill", "#c0c0c0");
		capElementB.setAttribute("r", 3);
		capElementB.setAttribute("cx", linkPath.secondary.x);
		capElementB.setAttribute("cy", linkPath.secondary.y);
		capElementB.setAttribute("stroke","none");
		this.linesLayer.appendChild(capElementB);

		const entry = {
			line: line,
			capA: capElementA,
			capB: capElementB,
		};

		return entry;
	}

	DrawPath(a, b) {
		const [p, s] = a.element.x < b.element.x ? [a, b] : [b, a];

		const pc = p.isUnmanaged
			? {x: p.element.x + 22, y: p.element.y + 22}
			: {x: p.element.x + 48, y: p.element.y + 48};

		const sc = s.isUnmanaged
			? {x: s.element.x + 22, y: s.element.y + 22}
			: {x: s.element.x + 48, y: s.element.y + 48};

		let px = pc.x, py = pc.y;
		let sx = sc.x, sy = sc.y;

		if (p.isRouter) {
			const angle = Math.atan2(sc.y - pc.y, sc.x - pc.x);
			px = pc.x + 50 * Math.cos(angle);
			py = pc.y + 50 * Math.sin(angle);
		}
		else if (p.isUnmanaged) {
			const angle = Math.atan2(sc.y - pc.y, sc.x - pc.x);
			px = pc.x + 28 * Math.cos(angle);
			py = pc.y + 28 * Math.sin(angle);
		}
		else {
			px += p.element.x < s.element.x ? 50 : -50;
		}

		if (s.isRouter) {
			const angle = Math.atan2(pc.y - sc.y, pc.x - sc.x);
			sx = sc.x + 50 * Math.cos(angle);
			sy = sc.y + 50 * Math.sin(angle);
		}
		else if (s.isUnmanaged) {
			const angle = Math.atan2(pc.y - sc.y, pc.x - sc.x);
			sx = sc.x + 28 * Math.cos(angle);
			sy = sc.y + 28 * Math.sin(angle);
		}
		else {
			sx += p.element.x > s.element.x ? 50 : -50;
		}

		if (Math.abs(pc.x - sc.x) < 88) {
			if (!p.isUnmanaged && !p.isRouter) {
				py = pc.y + (pc.y < sc.y ? 50 : -50);
				px = (pc.x + sc.x) / 2;
			}
			if (!s.isUnmanaged && !s.isRouter) {
				sy = sc.y + (pc.y > sc.y ? 50 : -50);
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
		hostnameLabel.style.overflow = "hidden";
		hostnameLabel.style.textOverflow = "ellipsis";
		hostnameLabel.style.gridArea = "1 / 2";
		hostnameLabel.style.fontWeight = "bold";
		hostnameLabel.style.lineHeight = "18px";
		hostnameLabel.textContent = device.isUnmanaged ? "unmanaged" : initial.hostname;
		grid.appendChild(hostnameLabel);

		const ipLabel = document.createElement("div");
		ipLabel.style.overflow = "hidden";
		ipLabel.style.textOverflow = "ellipsis";
		ipLabel.style.gridArea = "2 / 2";
		ipLabel.style.lineHeight = "18px";
		ipLabel.textContent = initial.ip;
		grid.appendChild(ipLabel);

		const locationLabel = document.createElement("div");
		locationLabel.style.overflow = "hidden";
		locationLabel.style.textOverflow = "ellipsis";
		locationLabel.style.gridArea = "3 / 2";
		locationLabel.style.lineHeight = "18px";
		locationLabel.textContent = initial.location;
		grid.appendChild(locationLabel);

		const chassisIdLabel = document.createElement("div");
		chassisIdLabel.style.overflow = "hidden";
		chassisIdLabel.style.textOverflow = "ellipsis";
		chassisIdLabel.style.gridArea = "4 / 2";
		chassisIdLabel.style.lineHeight = "18px";
		chassisIdLabel.textContent = this.devices[file]?.lldp?.localChassisId ?? "";
		grid.appendChild(chassisIdLabel);

		if (device.nosnmp) {
			const snmpLabel = document.createElement("div");
			snmpLabel.className = "topology-error-message";
			snmpLabel.textContent = "SNMP agent is unreachable";
			snmpLabel.setAttribute("nosnmp", true);
			this.sideBar.appendChild(snmpLabel);
		}
		else if (device.isUndocumented) {
			const undocumentedLabel = document.createElement("div");
			undocumentedLabel.className = "topology-error-message";
			undocumentedLabel.textContent = "Undocumented";
			undocumentedLabel.setAttribute("undocumented", true);
			this.sideBar.appendChild(undocumentedLabel);
		}

		if (device.dot1q) {
			const vlanList = document.createElement("details");
			vlanList.className = "topology-vlan-list";
			this.sideBar.appendChild(vlanList);

			if (this.vlanToggle) {
				vlanList.setAttribute("open", true);
			}

			const vlanTitle = document.createElement("summary");
			vlanTitle.textContent = "VLANs"
			vlanList.appendChild(vlanTitle);

			vlanList.ontoggle = ()=> {
				this.vlanToggle = vlanList.open;
			};

			vlanList.onclick = ()=> {
				this.infoBox.style.opacity = "0";
				this.infoBox.style.visibility = "hidden";
				this.infoBox.textContent = "";
			};

			this.PopulateVlanStaticNames(vlanList, device.dot1q.names);
		}

		if (device.lldp) {
			const interfacesList = document.createElement("details");
			interfacesList.className = "topology-interface-list";
			interfacesList.tabIndex = 0;
			interfacesList.setAttribute("open", true);

			this.sideBar.appendChild(interfacesList);

			const interfacesTitle = document.createElement("summary");
			interfacesTitle.textContent = "Interfaces"
			interfacesList.appendChild(interfacesTitle);

			interfacesList.onkeydown = event=> this.InterfaceList_onkeydown(event, interfacesList);

			if (device.isUndocumented) {
				const entries = Object.entries(device.lldp.localPortName)
					.sort(([, a], [, b]) => a.localeCompare(b));

				for (const [portIndex, name] of entries) {
					this.CreateInterfaceListItem(interfacesList, device, portIndex, name);
				}
			}
			else {
				for (const portIndex in device.lldp.localPortName) {
					this.CreateInterfaceListItem(interfacesList, device, portIndex, device.lldp.localPortName[portIndex]);
				}
			}

			interfacesList.ontoggle = ()=> {
				if (!interfacesList.open) {
					this.infoBox.textContent = "";
					this.infoBox.style.visibility = "hidden";
					this.infoBox.style.opacity = "0";
				}
			};
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

		const children = Array.from(interfacesList.childNodes).filter(o=> o.tagName === "DIV");
		if (children.length === 0) return;
		const lastIndex = children.indexOf(this.selectedInterface);
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

	PopulateVlanStaticNames(vlanList, names) {
		for (const vlan in names) {
			const container = document.createElement("div");
			vlanList.appendChild(container);

			const idBox = document.createElement("div");
			idBox.textContent = vlan;

			const valueBox = document.createElement("div");

			const color = document.createElement("div");
			color.style.display = "inline-block";
			color.style.width = "10px";
			color.style.height = "10px";
			color.style.marginRight = "4px";
			color.style.border = "1px solid var(--clr-dark)";
			color.style.borderRadius = "2px";
			color.style.backgroundColor = this.GetVlanColor(vlan);

			const name = document.createElement("div");
			name.style.display = "inline-block";
			name.textContent = names[vlan];

			valueBox.append(color, name);

			container.append(idBox, valueBox);
		}
	}

	GetVlanColor(vlan) {
		if (!vlan || vlan == "") return null;
		for (let i=0; i<KEEP.zones.length; i++) {
			if (KEEP.zones[i].vlan == vlan) {
				return KEEP.zones[i].color;
			}
		}
		return null;
	}

	CreateInterfaceListItem(listbox, device, portIndex, portName) {
		const interfaceBox = document.createElement("div");
		const localBox = document.createElement("div");
		const remoteBox = document.createElement("div");

		listbox.appendChild(interfaceBox);
		interfaceBox.append(localBox, remoteBox);

		let localPortName = portName;
		if (!portName || portName.length === 0) {
			localPortName = portIndex;
			localBox.style.color = "#404040";
		}
		else if (portName === "--") {
			localPortName = "--";
			localBox.style.color = "#404040";
		}

		localBox.textContent = localPortName;

		const link = this.links[device.links[portIndex]];

		if (device?.lldp?.ambiguous?.[portIndex]) {
			remoteBox.className = "snmp-ambiguous";
		}

		if (link) {
			const remoteDeviceFile = device.initial.file === link.deviceA ? link.deviceB : link.deviceA;

			if (remoteDeviceFile in this.devices) {
				const remoteDevice = this.devices[remoteDeviceFile];
				const remotePortIndex = device.initial.file === link.deviceA ? link.portIndexB : link.portIndexA;

				let remotePortName;
				if  (remoteDevice.lldp && remoteDevice.lldp.localPortName && remoteDevice.lldp.localPortName[remotePortIndex].length > 0) {
					remotePortName = remoteDevice.lldp.localPortName[remotePortIndex];
				}
				else {
					remotePortName = remotePortIndex;
				}

				remoteBox.textContent = remoteDevice.isUnmanaged ? "unmanaged" : remoteDevice.initial.hostname;
				remoteBox.style.width = "calc(50% - 12px)";
				remoteBox.style.borderRadius = "4px 0 0 4px";

				const remotePortBox = document.createElement("div");
				remotePortBox.textContent = remotePortName;
				interfaceBox.append(remotePortBox);
			}
			else if (remoteDeviceFile in LOADER.devices.data) {
				const dbEntry = LOADER.devices.data[remoteDeviceFile];

				if ("hostname" in dbEntry && dbEntry.hostname.v.length > 0) {
					remoteBox.textContent = dbEntry.hostname.v;
				}
				else if ("name" in dbEntry && dbEntry.name.v.length > 0) {
					remoteBox.textContent = dbEntry.name.v;
				}
				else if ("ip" in dbEntry && dbEntry.ip.v.length > 0) {
					remoteBox.textContent = dbEntry.ip.ip;
				}
			}
			else {

			}
		}
		else if (device.lldp && device.lldp.remoteSystemName[portIndex]?.length === 1) {
			remoteBox.className = "snmp-undocumented";
			if (device.lldp.remoteSystemName[portIndex][0].length > 0) {
				remoteBox.textContent = device.lldp.remoteSystemName[portIndex][0];
			}
			else if (device.lldp.​remoteChassisIdSubtype[portIndex][0] === 4
				|| device.lldp.​remoteChassisIdSubtype[portIndex][0] === 5
				|| device.lldp.​remoteChassisIdSubtype[portIndex][0] === 7) {
				remoteBox.textContent = device.lldp.remoteChassisId[portIndex][0];
			}
			else if (device.lldp.remotePortIdSubtype​[portIndex][0] === 3
				|| device.lldp.remotePortIdSubtype​[portIndex][0] === 4) {
				remoteBox.textContent = device.lldp.remotePortId​[portIndex][0];
			}
		}

		interfaceBox.onmouseenter = ()=> {
			if (!link) return;
			const e = link.element;

			if (e.isEndpoint) {
				e.dot.style.display = "initial";
				device.element.root.appendChild(e.dot);
			}
			else {
				e.line.setAttribute("stroke", "var(--clr-accent)");
				e.line.setAttribute("stroke-width", 5);
				e.capA.setAttribute("r", 4);
				e.capA.setAttribute("fill", "var(--clr-accent)");
				e.capB.setAttribute("r", 4);
				e.capB.setAttribute("fill", "var(--clr-accent)");
				this.linesLayer.appendChild(e.line);
				this.linesLayer.appendChild(e.capA);
				this.linesLayer.appendChild(e.capB);
			}
		};

		interfaceBox.onmouseleave = ()=> {
			if (!link) return;
			const e = link.element;

			if (e.isEndpoint) {
				e.dot.style.display = "none";
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
			if (!device.lldp.remoteChassisId) {
				this.infoBox.style.visibility = "hidden";
				this.infoBox.style.opacity = "0";
				return;
			}

			if (this.selectedInterface) {
				this.selectedInterface.className = "";
			}

			interfaceBox.className = "topology-interface-list-selected";

			this.selectedInterface = interfaceBox;

			this.infoBox.textContent = "";
			this.infoBox.style.visibility = "visible";
			this.infoBox.style.opacity = "1";

			if (device.dot1q) {
				const vlanTitle = document.createElement("div");
				vlanTitle.textContent ="VLAN";
				vlanTitle.style.textAlign = "center";
				vlanTitle.style.backgroundColor = "var(--clr-select)";
				vlanTitle.style.borderRadius = "4px";
				this.infoBox.appendChild(vlanTitle);

				let untaggedString = "";
				for (const vlan in device.dot1q.untagged) {
					if (!(vlan in device.dot1q.untagged) || device.dot1q.untagged[vlan].length === 0) continue;
					const hexMap = device.dot1q.untagged[vlan];
					const binMap = parseInt(hexMap, 16).toString(2).padStart(hexMap.length * 4, "0");

					if (binMap[parseInt(portIndex) - 1] == 1) {
						untaggedString = vlan;
					}
				}

				let taggedString = [];
				for (const vlan in device.dot1q.egress) {
					if (!(vlan in device.dot1q.egress) || device.dot1q.egress[vlan].length === 0) continue;
					const hexMap = device.dot1q.egress[vlan];
					const binMap = parseInt(hexMap, 16).toString(2).padStart(hexMap.length * 4, "0");

					if (binMap[parseInt(portIndex) - 1] == 1) {
						taggedString.push(vlan);
					}
				}

				const untaggedBox = document.createElement("div");
				untaggedBox.textContent = `Untagged: ${untaggedString}`;
				this.infoBox.appendChild(untaggedBox);

				const taggedBox = document.createElement("div");
				taggedBox.textContent = `Tagged: ${taggedString}`;
				this.infoBox.appendChild(taggedBox);
			}

			const lldpTitle = document.createElement("div");
			lldpTitle.textContent ="LLDP";
			lldpTitle.style.textAlign = "center";
			lldpTitle.style.backgroundColor = "var(--clr-select)";
			lldpTitle.style.borderRadius = "4px";
			this.infoBox.appendChild(lldpTitle);

			if (device.lldp.remoteChassisId[portIndex]) {
				for (let i=0; i<device.lldp.remoteChassisId[portIndex].length; i++) {
					const box = document.createElement("div");
					box.style.border = "1px solid var(--clr-dark)";
					box.style.borderRadius = "2px";
					box.style.padding = "0 2px";
					box.style.margin = "2px";
					box.textContent = `${device.lldp.remoteChassisIdSubtype[portIndex][i]}:${device.lldp.remoteChassisId[portIndex][i]}|${device.lldp.remotePortIdSubtype[portIndex][i]}:${device.lldp.remotePortId[portIndex][i]}|${device.lldp.remoteSystemName[portIndex][i]}`;
					this.infoBox.appendChild(box);

					if (device?.lldp?.ambiguous?.[portIndex]?.[i]) {
						box.className = "snmp-ambiguous";
					}
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
			this.infoBox.style.top = `${this.sideBar.offsetHeight - 150}px`;
		}
		else if (y > this.sideBar.offsetHeight - 150) {
			this.infoBox.className = "topology-info-box topology-info-box-last";
			this.infoBox.style.top = `${Math.min(this.sideBar.offsetHeight - 150, y - 130)}px`;
		}
		else {
			this.infoBox.className = "topology-info-box";
			this.infoBox.style.top = `${Math.max(8, y)}px`;
		}
	}
}
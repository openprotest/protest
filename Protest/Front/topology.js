class Topology extends Window {
	static deviceIcons = {
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

		const dx = Math.abs(event.clientX - this.x0);
		const dy = Math.abs(event.clientY - this.y0);
		if (Math.sqrt(dx*dx + dy*dy) < 4) return;

		const x = this.offsetX - this.x0 + event.clientX;
		const y = this.offsetY - this.y0 + event.clientY;

		this.dragging.element.root.style.transform = `translate(${x}px,${y}px)`;

		this.dragging.element.x = x;
		this.dragging.element.y = y;

		for (const port in this.dragging.links) {
			const link = this.links[this.dragging.links[port].linkKey];
			if (link) {
				const path = this.DrawLink(this.dragging, this.devices[this.dragging.links[port].device]);
				link.element.setAttribute("d", path);
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

		const [routerLabel, routerInput] = AddParameter("Routers", "input", "toggle");
		routerLabel.style.lineHeight = "24px";
		routerLabel.style.paddingLeft = "28px";
		routerLabel.style.backgroundImage = "url(mono/router.svg)";
		routerLabel.style.backgroundSize = "24px";
		routerLabel.style.backgroundRepeat = "no-repeat";
		routerInput.checked = true;

		const [firewallLabel, firewallInput] = AddParameter("Firewalls", "input", "toggle");
		firewallLabel.style.lineHeight = "24px";
		firewallLabel.style.paddingLeft = "28px";
		firewallLabel.style.backgroundImage = "url(mono/firewall.svg)";
		firewallLabel.style.backgroundSize = "24px";
		firewallLabel.style.backgroundRepeat = "no-repeat";
		firewallInput.checked = true;

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
		rect.setAttribute("rx", 16);
		rect.setAttribute("ry", 16);
		rect.setAttribute("width", 96);
		rect.setAttribute("height", 96);
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

		g.addEventListener("mousedown", event=> {
			event.stopPropagation();
			const element = this.devices[options.file].element;

			this.offsetX = element.x;
			this.offsetY = element.y;
			this.x0 = event.clientX;
			this.y0 = event.clientY;

			this.svg.appendChild(g);
			this.SelectDevice(options.file);
		});

		this.AdjustSvgSize();

		return {
			root: g,
			highlight: rect,
			fill: fill,
			icon: icon,
			spinner: spinner,
			label: label,
			x: options.x,
			y: options.y
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
		circle.setAttribute("r", 24);
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

	ComputeAllLinks() {
		for (const file in this.devices) {
			const device = this.devices[file];
			if (!device.lldp) continue;
			
			device.links = {};

			for (const port in device.lldp.remoteChassisIdSubtype) {
				this.ComputePortLinks(device, port);
			}
		}
	}

	ComputePortLinks(device, port) {
		const remoteInfo = device.lldp.remoteChassisIdSubtype[port];
		if (!remoteInfo || remoteInfo.length === 0) return;

		let remoteDeviceFile, link, linkElement;

		if (remoteInfo.length === 1) {
			link = this.GetRemoteDevice(device, port) || this.GetRemoteDeviceOnDatabase(device, port);
			remoteDeviceFile = link?.remoteDevice?.initial?.file ?? null;

			if (!link || !link.remoteDevice) return;
		}
		else { //multiple LLDP entries — treat as unmanaged switch
			const uuid = UI.GenerateUuid();
			const unmanagedDevice = this.CreateUnmanagedSwitchElement({ x: 100, y: 100 }, uuid);
			remoteDeviceFile = unmanagedDevice.root.getAttribute("file");

			this.devices[uuid] = {
				element: unmanagedDevice,
				initial: { file: uuid, type: "switch", unmanaged: true }
			};

			link = {
				remoteDevice: this.devices[uuid],
				remotePort: -1
			};
		}

		const localFile = device.initial.file;

		const linkKey = localFile > remoteDeviceFile
			? `${localFile}-${remoteDeviceFile}`
			: `${remoteDeviceFile}-${localFile}`;

		if (linkKey in this.links) {
			linkElement = this.links[linkKey].element;
		}
		else {
			linkElement = document.createElementNS("http://www.w3.org/2000/svg", "path");
			linkElement.setAttribute("d", this.DrawLink(device, link.remoteDevice));
			this.linksGroup.appendChild(linkElement);

			this.links[linkKey] = {
				element: linkElement,
				deviceA: localFile,
				deviceB: remoteDeviceFile
			};
		}

		device.links[port] = {
			linkKey  : linkKey,
			device   : remoteDeviceFile,
			portIndex: link?.remotePort ?? -1
		};

		if (!link.remoteDevice.lldp) {
			if (!link.remoteDevice.links) {
				link.remoteDevice.links = [];
			}

			link.remoteDevice.links.push({
				linkKey  : linkKey,
				device   : device.initial.file,
				portIndex: -1
			});
		}
	}

	DrawLink(a, b) {
		const p = a.element.x < b.element.x ? a : b;
		const s = a.element.x < b.element.x ? b : a;

		let pox, poy, sox, soy;

		if (p.initial.unmanaged) {
			pox = 24;
			poy = 24;
		}
		else {
			pox = p.element.x > s.element.x + 44 ? 0 : 96;
			poy = 16;
		}

		if (s.initial.unmanaged) {
			sox = 24;
			soy = 24;
		}
		else {
			sox = p.element.x > s.element.x + 44 ? 96 : 0;
			soy = 16;
		}

		const x1 = p.element.x + pox;
		const y1 = p.element.y + poy;
		const x4 = s.element.x + sox;
		const y4 = s.element.y + soy;

		let minX = Math.min(x1, x4);
		const x2 = minX + (x1-minX)*.7 + (x4-minX)*.3;
		const x3 = minX + (x1-minX)*.3 + (x4-minX)*.7;

		return `M ${x1} ${y1} C ${x2} ${y1} ${x3} ${y4} ${x4} ${y4}`;
	}

	GetPortIndex(localDevice, remoteDevice, port) {
		if (!remoteDevice.lldp) return null;

		const remotePortId = localDevice.lldp.remotePortId[port];
		if (!remotePortId || remotePortId.length === 0) return null;

		const portIndex = remoteDevice.lldp.localPortId.indexOf(remotePortId[0]);
		return portIndex;

/*		switch (remoteDevice.lldp.remotePortIdSubtype[port][i]) {
		case 1: //interface alias
		case 2: //port component
		case 3: //mac address
		case 4: //network name
		case 5: //int name
		case 6: //agent circuit ID
		case 7: //local
		default: //unknown
			return null;
		}*/
	}

	GetRemoteDevice(device, port) {
		for (const file in this.devices) {
			const remoteDevice = this.devices[file];
			if (!remoteDevice.lldp) continue;

			if (remoteDevice.lldp.localChassisId === device.lldp.remoteChassisId[port][0]) {
				return {
					remoteDevice: remoteDevice,
					remotePort  : this.GetPortIndex(device, remoteDevice, port)
				};
			}
		}

		//if not in the topology, but has a remote port ID subtype of 5 (interface name),
		//meaning it is a remote switch
		if (device.lldp.remotePortIdSubtype[port][0] === 5) {
			const remoteHostname = device.lldp.remoteSystemName[port][0];

			for (const file in this.devices) {
				const remoteDevice = this.devices[file];
				if (remoteDevice.initial.hostname === remoteHostname) {
					return {
						remoteDevice: remoteDevice,
						remotePort  : this.GetPortIndex(device, remoteDevice, port),
					};
				}
			}

			const remoteFile = Object.entries(LOADER.devices.data)
				.find(([, data]) => (data.hostname?.v || null) === remoteHostname)?.[0];

			if (remoteFile) {
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
					element: newDeviceElement,
					initial: {
						file    : remoteFile,
						type    : remoteType,
						hostname: remoteHostname
					}
				};

				this.devices[remoteFile] = remoteDevice;

				return {
					remoteDevice: remoteDevice,
					remotePort  : this.GetPortIndex(device, remoteDevice, port),
				};
			}
		}

		if (device.lldp.remotePortIdSubtype[port][0] === 3) { //mac address
			//TODO:
		}

		return null;
	}

	GetRemoteDeviceOnDatabase(device, port) {
		for (const file in LOADER.devices.data) {
			const data = LOADER.devices.data[file];
			
			const mac      = data["mac address"]?.v || null;
			const ip       = data["ip"]?.v          || null;
			const hostname = data["hostname"]?.v    || null;
			//TODO:
		}

		return null;
	}

	SelectDevice(file) {
		if (this.selected) {
			this.selected.element.highlight.classList.remove("topology-selected");
		}

		const device = this.devices[file];

		device.element.highlight.classList.add("topology-selected");

		this.selected = device;
		this.dragging = device;

		this.sideBar.textContent = "";

		const initial = device.initial;

		const grid = document.createElement("div");
		grid.className = "topology-sidebar-grid";
		this.sideBar.appendChild(grid);

		const icon = document.createElement("div");
		icon.style.gridArea = "1 / 1 / 5 / 1";
		icon.style.backgroundImage = `url(${Topology.deviceIcons[initial.type.toLowerCase()]})`;
		icon.style.backgroundSize = "64px 64px";
		icon.style.backgroundPosition = "50% 50%";
		icon.style.backgroundRepeat = "no-repeat";
		grid.appendChild(icon);

		const hostnameLabel = document.createElement("div");
		hostnameLabel.style.gridArea = "2 / 2";
		hostnameLabel.style.fontWeight = "bold";
		hostnameLabel.textContent = device.initial.unmanaged ? "unmanaged" : initial.hostname;
		grid.appendChild(hostnameLabel);

		const ipLabel = document.createElement("div");
		ipLabel.style.gridArea = "3 / 2";
		ipLabel.textContent = initial.ip;
		grid.appendChild(ipLabel);

		if (device.links && Array.isArray(device.links)) {
			const intList = document.createElement("div");
			intList.className = "topology-interface-list";
			this.sideBar.appendChild(intList);

			for (let i=0; i<device.links.length; i++) {
				this.CreateInterfaceListItem(intList, device, i, "");
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
		const localPort = document.createElement("div");
		const remotePort = document.createElement("div");

		let localPortName = portName;
		if (!localPortName || localPortName.length === 0) {
			localPortName = i;
			localPort.style.color = "#404040";
			localPort.style.fontStyle = "italic";
		}

		let remotePortName = "";
		if (i in device.links && device.links[i].device) {
			const remoteDevice = this.devices[device.links[i].device];
			remotePortName = remoteDevice.initial.hostname;
			//const remotePortIndex = device.links[i].portIndex;
			//remotePortName = remoteDevice.initial.hostname + "/" + remotePortIndex;
		}

		listbox.appendChild(interfaceBox);

		localPort.textContent = localPortName;
		remotePort.textContent = remotePortName;
		interfaceBox.append(localPort, remotePort);
	}
}
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
		this.content.style.overflow = "auto";

		this.InitializeSvg();

		this.workspace.onmousedown = event=> {
			event.stopPropagation();
			this.BringToFront();

			this.sideBar.textContent = "";
			
			if (this.selected) {
				this.selected.element.highlight.classList.remove("topology-selected");
				this.selected = null;
			}
		};

		this.content.onmousemove = event=> {
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

			this.AdjustSvgSize();
		};

		this.content.onmouseup = ()=> {
			this.dragging = null;
		};

		this.startButton.onclick = ()=> this.StartDialog();
		this.stopButton.onclick = ()=> this.Stop();
	}

	AfterResize() { //override
		this.AdjustSvgSize();
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
		this.linksGroup.setAttribute("stroke", "#c0c0c0");
		this.linksGroup.setAttribute("stroke-width", 3);
		this.svg.appendChild(this.linksGroup);
	}

	Clear() {
		this.devices = {};
		this.workspace.textContent = "";
		this.sideBar.textContent = "";
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
			else if (json.lldp) {
				const device = this.devices[json.lldp.file];
				if (device) {
					device.lldp = json.lldp;

					device.element.spinner.style.visibility = "hidden";
					device.element.spinner.style.opacity = "0";
					device.element.fill.style.fill = "rgb(88,166,32)";
					setTimeout(()=>{
					}, 10);
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
		spinner.setAttribute("stroke", "rgb(88,166,32)");
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
		label.innerHTML = options.name;
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

	CreateUnmanagedSwitchElement(options) {
		const uuid = UI.GenerateUuid();
		
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

		//TODO:
		this.devices[uuid] = {
			element: element,
			initial: {file: uuid, type: "switch", unmanaged: true}
		};

		return element;
	}

	ComputeAllLinks() {
		for (const file in this.devices) {
			const device = this.devices[file];
			if (!device.lldp) continue;
			this.ComputeLinks(device);
		}
	}

	ComputeLinks(device) {
		if (!device.lldp) return;

		device.links = {};

		//console.log(device.initial.hostname);

		for (const key in device.lldp.remoteChassisIdSubtype) {

			if (device.lldp.remoteChassisIdSubtype[key].length === 1) {
				/*
				console.log(
				key,
				device.lldp.remoteSystemName[key][0],
				device.lldp.remotePortIdSubtype[key][0],
				device.lldp.remotePortId[key][0],
				device.lldp.remoteChassisIdSubtype[key][0],
				device.lldp.remoteChassisId[key][0]);
				*/

				const remoteDevice = null;
				for (const file in this.devices) {
					//TODO: find remote device in devices
					
				}

				const remoteDeviceFile = remoteDevice?.initial?.file ?? null;
				device.links[key] = {device:remoteDeviceFile, port:null};
			}
			else if (device.lldp.remoteChassisIdSubtype[key].length > 1) {
				const unmanagedDevice = this.CreateUnmanagedSwitchElement({x:100, y:100});
				const remoteDeviceFile = unmanagedDevice.root.getAttribute("file");
				device.links[key] = {device:remoteDeviceFile, port:null};
			}

			for (let i=0; i<device.lldp.remoteChassisIdSubtype[key].length; i++) {
				switch (device.lldp.remoteChassisIdSubtype[key][i]) {
				case 1: //chassis component
				case 2: //interface alias
				case 3: //port name
				case 4: //mac address
				case 5: //network name
				case 6: //int name
				case 7: //local
				}
			}

			for (let i=0; i<device.lldp.remotePortIdSubtype[key].length; i++) {
				switch (device.lldp.remotePortIdSubtype[key][i]) {
				case 1: //interface alias
				case 2: //port component
				case 3: //mac address
				case 4: //network name
				case 5: //int name
				case 6: //agent circuit ID
				case 7: //local
				}
			}

		}
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

		if (file in this.devices && device.lldp) {
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
				const interfaceBox = document.createElement("div");
				const localPort = document.createElement("div");
				const remotePort = document.createElement("div");

				let localPortName = device.lldp.localPortName[i];
				if (!localPortName || localPortName.length === 0) {
					localPortName = `(${i+1})`;
					localPort.style.color = "#404040";
					localPort.style.fontStyle = "italic";
				}

				let remotePortName = "";

				if (i in device.links && device.links[i].device) {
					const remote = this.devices[device.links[i].device];
					remotePortName = remote.initial.hostname;
				}

				intList.appendChild(interfaceBox);

				localPort.textContent = localPortName;
				interfaceBox.appendChild(localPort);

				remotePort.textContent = remotePortName;
				interfaceBox.appendChild(remotePort);
			}
		}
	}

	AdjustSvgSize() {
		let maxX = this.workspace.offsetWidth, maxY = this.workspace.offsetHeight;
		for (const file in this.devices) {
			if (this.devices[file].element.x + 100 > maxX) maxX = this.devices[file].element.x + 100;
			if (this.devices[file].element.y + 128 > maxY) maxY = this.devices[file].element.y + 128;
		}
		
		this.svg.setAttribute("width", maxX === this.workspace.offsetWidth ? Math.max(maxX - 20, 1) : maxX);
		this.svg.setAttribute("height", maxY === this.workspace.offsetHeight ? Math.max(maxY - 20, 1) : maxY);
	}
}
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
		this.links = [];

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
				this.selected.element.root.classList.remove("topology-selected");
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

		const loadGradient = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
		loadGradient.setAttribute("id", "loadGradient");
		loadGradient.setAttribute("x1", "0");
		loadGradient.setAttribute("y1", "0");
		loadGradient.setAttribute("x2", "1");
		loadGradient.setAttribute("y2", "1");
		defs.appendChild(loadGradient);

		const loadingStop1 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
		loadingStop1.setAttribute("offset", ".15");
		loadingStop1.setAttribute("stop-color", "#c0c0c060");
		loadGradient.appendChild(loadingStop1);

		const loadingStop2 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
		loadingStop2.setAttribute("offset", ".45");
		loadingStop2.setAttribute("stop-color", "#c0c0c0");
		loadGradient.appendChild(loadingStop2);

		const loadingStop3 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
		loadingStop3.setAttribute("offset", ".55");
		loadingStop3.setAttribute("stop-color", "#c0c0c0");
		loadGradient.appendChild(loadingStop3);

		const loadingStop4 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
		loadingStop4.setAttribute("offset", ".85");
		loadingStop4.setAttribute("stop-color", "#c0c0c060");
		loadGradient.appendChild(loadingStop4);

		const animateTransform = document.createElementNS("http://www.w3.org/2000/svg", "animateTransform");
		animateTransform.setAttribute("attributeName", "gradientTransform");
		animateTransform.setAttribute("type", "rotate");
		animateTransform.setAttribute("from", "0 .5 .5");
		animateTransform.setAttribute("to", "360 .5 .5");
		animateTransform.setAttribute("dur", "2s");
		animateTransform.setAttribute("repeatCount", "indefinite");
		loadGradient.appendChild(animateTransform);

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

		this.linksGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
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
		};

		this.ws.onmessage = event=> {
			const payload = event.data;
			const json = JSON.parse(payload);

			if (json.initial) {
				let count = 0;
				for (let i=0; i<json.initial.length; i++) {
					const element = this.CreateDevice({
						file: json.initial[i].file,
						type: json.initial[i].type,
						name: json.initial[i].hostname,
						x: 16 + (count % 10) * 128,
						y: 16 + Math.floor(count / 10) * 128
					});

					element.icon.style.fill = "#c0c0c080";

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
					device.element.icon.classList.add("topology-loading");
				}
			}
			else if (json.nosnmp) {
				const device = this.devices[json.nosnmp];
				if (device) {
					device.element.icon.classList.remove("topology-loading");
					setTimeout(()=>{
						device.element.icon.style.fill = "var(--clr-error)";
					}, 10);
				}
			}
			else if (json.snmp) {
				const device = this.devices[json.snmp];
				if (device) {
					device.element.icon.classList.remove("topology-loading");
					setTimeout(()=>{
						device.element.icon.style.fill = "#c0c0c0";
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

	CreateDevice(options) {
		const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
		g.style.transform = `translate(${options.x}px,${options.y}px)`;
		g.setAttribute("file", options.file);
		this.svg.appendChild(g);

		const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
		rect.setAttribute("rx", 8);
		rect.setAttribute("ry", 8);
		rect.setAttribute("width", 96);
		rect.setAttribute("height", 96);
		rect.setAttribute("fill", "transparent");
		g.appendChild(rect);

		const icon = document.createElementNS("http://www.w3.org/2000/svg", "rect");
		icon.setAttribute("x", 4);
		icon.setAttribute("y", 4);
		icon.setAttribute("width", 88);
		icon.setAttribute("height", 88);
		icon.setAttribute("fill", "#c0c0c0");
		icon.setAttribute("mask", "url(#switchMask)");
		icon.style.transition = "fill .8s";
		g.appendChild(icon);

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
			rect: rect,
			icon: icon,
			label: label,
			x: options.x,
			y: options.y
		};
	}

	SelectDevice(file) {
		if (this.selected) {
			this.selected.element.root.classList.remove("topology-selected");
		}

		this.devices[file].element.root.classList.add("topology-selected");

		this.selected = this.devices[file];
		this.dragging = this.devices[file];

		this.sideBar.textContent = "";

		const initial = this.devices[file].initial;

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
		hostnameLabel.textContent = initial.hostname;
		grid.appendChild(hostnameLabel);

		const ipLabel = document.createElement("div");
		ipLabel.style.gridArea = "3 / 2";
		ipLabel.textContent = initial.ip;
		grid.appendChild(ipLabel);
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
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

		this.workspace.onmousedown = event=> {
			event.stopPropagation();
			this.BringToFront();

			this.sideBar.textContent = "";
			
			if (this.selected) {
				this.selected.classList.remove("topology-selected");
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
			this.dragging.style.left = `${Math.max(x,0)}px`;
			this.dragging.style.top = `${Math.max(y,0)}px`;
		};

		this.content.onmouseup = ()=> {
			this.dragging = null;
		};

		this.startButton.onclick = ()=> this.StartDialog();
		this.stopButton.onclick = ()=> this.Stop();
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
						left: 16 + (count % 10) * 112,
						top: 16 + Math.floor(count / 10) * 112
					});

					element.icon.classList.add("topology-pending");

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
					device.element.icon.classList.remove("topology-pending");
					device.element.icon.classList.remove("topology-loading");
					device.element.icon.style.backgroundColor = "var(--clr-error)";
				}
			}
			else if (json.snmp) {
				const device = this.devices[json.snmp];
				if (device) {
					device.element.icon.classList.remove("topology-pending");
					device.element.icon.classList.remove("topology-loading");
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
		const device = document.createElement("div");
		device.className = "topology-device";
		device.style.left = options.left + "px";
		device.style.top = options.top + "px";
		device.setAttribute("file", options.file);
		this.workspace.appendChild(device);

		const icon = document.createElement("div");
		icon.className = "topology-device-icon";
		icon.style.maskImage = `url(${Topology.deviceIcons[options.type.toLowerCase()]}?light)`;
		device.appendChild(icon);

		const label = document.createElement("div");
		label.className = "topology-device-label";
		label.textContent = options.name;
		device.appendChild(label);

		device.onmousedown = event=> {
			event.stopPropagation();

			this.offsetX = device.offsetLeft;
			this.offsetY = device.offsetTop;
			this.x0 = event.clientX;
			this.y0 = event.clientY;

			this.SelectDevice(device, options.file);
		};

		return {
			root: device,
			icon: icon,
			label: label
		};
	}

	SelectDevice(element, file) {
		if (this.selected) {
			this.selected.classList.remove("topology-selected");
		}

		element.classList.add("topology-selected");

		this.selected = element;
		this.dragging = element;

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

}
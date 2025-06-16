class Topology extends Window{
	constructor(args) {
		super();
		this.args = args ?? {};

		this.x0 = 0;
		this.y0 = 0;
		this.selected = null;
		this.dragging = null;

		this.AddCssDependencies("topology.css");

		this.SetTitle("Topology");
		this.SetIcon("mono/topology.svg");

		this.SetupToolbar();

		this.content.style.overflow = "auto";

		this.startButton = this.AddToolbarButton("Start discovery", "mono/play.svg?light");
		this.stopButton = this.AddToolbarButton("Stop", "mono/stop.svg?light");
		this.AddToolbarSeparator();

		this.content.onmousedown = event => {
			if (this.selected) {
				this.selected.classList.remove("topology-selected");
			}
		};

		this.content.onmousemove = event => {
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
			this.dragging.style.top =  `${Math.max(y,0)}px`;
		};

		this.content.onmouseup = ()=> {
			this.dragging = null;
		};

		this.startButton.onclick = ()=> this.StartDialog();
		this.stopButton.onclick = ()=> this.Stop();

		this.InitializeMap();
	}

	InitializeMap() {
		let count = 0;
		for (const device in LOADER.devices.data) {
			if (!LOADER.devices.data[device].type) continue;
			const type = LOADER.devices.data[device].type.v.toLowerCase();
			if (type !== "switch") continue;
			
			if (!LOADER.devices.data[device].ip) continue;
			const ip = LOADER.devices.data[device].ip.v;

			if (!LOADER.devices.data[device]["snmp profile"]) continue;
			const profile = LOADER.devices.data[device]["snmp profile"].v;

			this.CreateDevice({
				file: device,
				name: ip,
				left: 16 + count * 96,
				top: 16
			});

			count++;
		}
	}

	CreateDevice(options) {
		const device = document.createElement("div");
		device.className = "topology-device";
		device.style.left = options.left + "px";
		device.style.top = options.top + "px";
		device.setAttribute("file", options.file);
		this.content.appendChild(device);

		const icon = document.createElement("div");
		icon.className = "topology-device-icon";
		icon.style.maskImage = "url(mono/switch.svg?light)";
		device.appendChild(icon);

		const label = document.createElement("div");
		label.className = "topology-device-label";
		label.textContent = options.name;
		device.appendChild(label);

		device.onmousedown = event=> {
			event.stopPropagation();

			if (this.selected) {
				this.selected.classList.remove("topology-selected");
			}

			device.classList.add("topology-selected");

			this.selected = device;
			this.dragging = device;

			this.offsetX = device.offsetLeft;
			this.offsetY = device.offsetTop;
			this.x0 = event.clientX;
			this.y0 = event.clientY;
		};
	}

	StartDialog() {

	}

	Stop() {

	}
}
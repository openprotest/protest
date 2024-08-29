class IpDiscovery extends List {

	static PROTOCOL_TO_ICON = {
		"SSH"      : "mono/ssh.svg",
		"TELNET"   : "mono/telnet.svg",
		"DNS"      : "mono/dns.svg",
		"DHCP"     : "mono/dhcp.svg",
		"HTTP"     : "mono/websitecheck.svg",
		"HTTPS"    : "mono/websitecheck.svg",
		"SMB"      : "mono/shared.svg",
		"RDP"      : "mono/rdp.svg",
		"uVNC"     : "mono/uvnc.svg",
		"Alt-HTTP" : "mono/websitecheck.svg",
		"Print service" : "mono/printer.svg",
		"Scan service"  : "mono/scanner.svg",
	};

	constructor(args) {
		super(args);

		this.args = args ?? {
			find: "",
			filter: "",
			sort: ""
		};

		this.SetTitle("IP discovery");
		this.SetIcon("mono/ipdiscovery.svg");

		this.AddCssDependencies("list.css");

		const columns = ["name", "ip", "ipv6", "mac", "manufacturer", "services"];
		this.SetupColumns(columns);
		this.columnsOptions.style.display = "none";

		this.LinkData({data:[], length:0 });

		this.SetupToolbar();
		this.startButton = this.AddToolbarButton("Start network scan", "mono/play.svg?light");
		this.stopButton = this.AddToolbarButton("Stop", "mono/stop.svg?light");
		this.AddToolbarSeparator();
		this.SetupFind();

		this.stopButton.disabled = true;

		this.startButton.onclick = ()=> this.StartDialog();
		this.stopButton.onclick = ()=> this.Stop();

		this.UpdateAuthorization();
	}

	UpdateAuthorization() { //overrides
		this.canWrite = KEEP.authorization.includes("*") || KEEP.authorization.includes("network utilities:write");
		this.startButton.disabled = !this.canWrite;
		super.UpdateAuthorization();
	}

	Close() { //overrides
		super.Close();

		if (this.ws != null) {
			try {
				this.ws.close();
			}
			catch {}
		}
	}

	async StartDialog() {
		const dialog = this.DialogBox("400px");
		if (dialog === null) return;

		const {okButton, innerBox} = dialog;

		okButton.value = "Start";
		okButton.disabled = true;
		
		innerBox.style.margin = "16px 32px";
		innerBox.parentElement.style.maxWidth = "640px";
		innerBox.style.border = "var(--clr-control) solid 1.5px";
		innerBox.style.overflowY = "auto";

		let selectedNic = null;

		try {
			const response = await fetch("/tools/nics/list");

			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const json = await response.json();
			if (json.error) throw (json.error);

			for (let i=0; i<json.length; i++) {
				const newNic = document.createElement("div");
				newNic.className = "list-element";
				innerBox.appendChild(newNic);

				const icon = document.createElement("div");
				icon.style.left = "2px";
				icon.style.top = "2px";
				icon.style.width = "28px";
				icon.style.height = "28px";
				icon.style.backgroundImage = "url(mono/portscan.svg)";
				icon.style.backgroundSize = "contain";
				icon.style.backgroundPosition = "center";
				icon.style.backgroundRepeat = "no-repeat";
				newNic.append(icon);

				const name = document.createElement("div");
				name.style.left = "28px";
				name.style.width = "calc(50% - 28px)";
				name.style.overflow = "hidden";
				name.style.whiteSpace = "nowrap";
				name.style.textOverflow = "ellipses";
				name.textContent = json[i].name;

				const ip = document.createElement("div");
				ip.style.left = "50%";
				ip.style.width = "50%";
				ip.style.overflow = "hidden";
				ip.style.whiteSpace = "nowrap";
				ip.style.textOverflow = "ellipses";
				ip.textContent = `${json[i].ip}/${json[i].cidr}`;

				newNic.append(icon, name, ip);

				newNic.onclick = ()=> {
					selectedNic = json[i].id;
					okButton.disabled = false;
					
					for (let i=0; i<innerBox.children.length; i++) {
						innerBox.children[i].style.backgroundColor = "";
					}
					newNic.style.backgroundColor = "var(--clr-select)";
				};

				newNic.ondblclick = ()=> okButton.onclick();
			}
		}
		catch {}

		okButton.onclick = ()=> {
			this.Connect(selectedNic);
			dialog.Close();
		};
	}

	Connect(id) {
		if (id === null) return;

		let server = window.location.href.replace("https://", "").replace("http://", "");
		if (server.indexOf("/") > 0) server = server.substring(0, server.indexOf("/"));

		if (this.ws != null) {
			try {
				this.ws.close();
			}
			catch {}
		}

		this.ws = new WebSocket((KEEP.isSecure ? "wss://" : "ws://") + server + "/ws/ipdiscovery");

		this.ws.onopen = ()=> {
			this.ws.send(id);
			this.startButton.disabled = true;
			this.stopButton.disabled = false;
		};

		this.ws.onmessage = event=> {
			const json = JSON.parse(event.data);
			const key = json.ip;
			
			if (key in this.link.data) {
				let oldHost = this.link.data[key];

				if (true) {}
			}
			else {
				let services = Array.from(new Set(json.services.split(",")));

				const element =  document.createElement("div");
				element.id = key;
				element.className = "list-element";
				this.list.appendChild(element);

				const newHost = {
					key          : {v:key},
					name         : {v:json.name},
					ip           : {v:json.ip},
					mac          : {v:json.mac},
					manufacturer : {v:json.manufacturer},
					services     : {v:services}
				};

				this.link.data[key] = newHost;
				this.link.length++;

				this.InflateElement(element, this.link.data[key]);
			}
		};

		this.ws.onclose = ()=> {
			this.startButton.disabled = false;
			this.stopButton.disabled = true;
			this.ws = null;
		};

		this.ws.onerror = error=> {};
	}

	Stop() {
		try {
			if (this.ws != null) {
				this.ws.close();
			}
		}
		catch {}
		finally {
			this.startButton.disabled = false;
			this.stopButton.disabled = true;
			this.ws = null;
		}
	}

	InflateElement(element, host) { //overrides
		const icon = document.createElement("div");
		icon.className = "list-element-icon";
		element.appendChild(icon);

		for (let i=0; i<this.columnsElements.length; i++) {
			const attribute = this.columnsElements[i].textContent;
			if (!(attribute in host)) continue;

			const value = host[attribute].v;
			if (value === null || value.length === 0) continue;

			const newAttr = document.createElement("div");

			if (attribute === "services" && host.services.v.length > 0) {
				newAttr.style.top = "2px";
				newAttr.style.bottom = "2px";
				newAttr.style.overflow = "visible";

				host.services.v.sort();

				for (let j=0; j<host.services.v.length; j++) {
					const service = host.services.v[j];
					if (service.length === 0) continue;

					const image = IpDiscovery.PROTOCOL_TO_ICON[service] ?? "mono/gear.svg";

					const proto = document.createElement("div");
					proto.className = "list-inner-icon";
					proto.setAttribute("tip", service);
					proto.style.backgroundImage = `url(${image})`;
					newAttr.appendChild(proto);
				}
			}
			else {
				newAttr.textContent = value;
			}

			element.appendChild(newAttr);

			newAttr.style.left = this.columnsElements[i].style.left;
			newAttr.style.width = this.columnsElements[i].style.width;
		}

		element.onclick = ()=> {
			if (this.selected) {
				this.selected.style.backgroundColor = "";
			}
			this.args.select = host.key.v;
			this.selected = element;
			element.style.backgroundColor = "var(--clr-select)";
		};

		element.ondblclick = event=> {};
	}
}
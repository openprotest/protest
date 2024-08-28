class IpScanner extends List {

	static PORT_TO_ICON = {
		22   : "mono/ssh.svg",
		23   : "mono/telnet.svg",
		53   : "mono/dns.svg",
		67   : "mono/dhcp.svg",
		80   : "mono/earth.svg",
		443  : "mono/earth.svg",
		445  : "mono/shared.svg",
		3389 : "mono/rdp.svg",
		5100 : "mono/uvnc.svg",
		8080 : "mono/earth.svg",
		9100 : "mono/printer.svg",
	};

	constructor(args) {
		super(args);

		this.args = args ?? {
			find: "",
			filter: "",
			sort: ""
		};

		this.SetTitle("IP scanner");
		this.SetIcon("mono/ipscanner.svg");

		this.AddCssDependencies("list.css");

		const columns = ["hostname", "ip", "mac", "manufacturer", "services"];
		this.SetupColumns(columns);
		this.columnsOptions.style.display = "none";

		this.LinkData({data:[], length:0 });

		this.SetupToolbar();
		this.startButton = this.AddToolbarButton("Start network scan", "mono/play.svg?light");
		this.stopButton = this.AddToolbarButton("Stop", "mono/stop.svg?light");
		this.AddToolbarSeparator();
		this.SetupFind();

		this.stopButton.disabled = true;

		this.startButton.onclick = ()=> this.Connect();
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

	Connect() {
		let server = window.location.href.replace("https://", "").replace("http://", "");
		if (server.indexOf("/") > 0) server = server.substring(0, server.indexOf("/"));

		if (this.ws != null) {
			try {
				this.ws.close();
			}
			catch {}
		}

		this.ws = new WebSocket((KEEP.isSecure ? "wss://" : "ws://") + server + "/ws/ipscanner");

		this.ws.onopen = ()=> {
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
					hostname     : {v:json.hostname},
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
		element.style.overflow = "visible";

		const icon = document.createElement("div");
		icon.className = "list-element-icon";
		element.appendChild(icon);

		for (let i=0; i<this.columnsElements.length; i++) {
			const attribute = this.columnsElements[i].textContent;
			if (!(attribute in host)) continue;

			const value = host[attribute].v;
			if (value.length === 0) continue;

			const newAttr = document.createElement("div");

			if (attribute === "services" && host.services.v.length > 0) {
				newAttr.style.overflow = "visible";
				newAttr.style.top = "2px";
				newAttr.style.bottom = "2px";

				for (let j=0; j<host.services.v.length; j++) {
					const service = host.services.v[j];
					if (service.length === 0) continue;

					const image = IpScanner.PORT_TO_ICON[service] ?? "mono/gear.svg";

					const proto = document.createElement("div");
					proto.style.position = "relative";
					proto.style.display = "inline-block";
					proto.style.width = "28px";
					proto.style.height = "28px";
					proto.style.backgroundSize = "24px 24px";
					proto.style.backgroundPosition = "center";
					proto.style.backgroundRepeat = "no-repeat";
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
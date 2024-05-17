class DevicesList extends List {
	constructor(params) {
		super(params);

		this.SetTitle("Devices");
		this.SetIcon("mono/devices.svg");

		this.defaultColumns = ["name", "type", "ip", "hostname", "mac address", "serial number"];

		const columns = localStorage.getItem(`${this.constructor.name.toLowerCase()}_columns`) ?
			JSON.parse(localStorage.getItem(`${this.constructor.name.toLowerCase()}_columns`)) :
			this.defaultColumns;

		this.SetupColumns(columns);
		this.SetupToolbar();
		this.LinkData(LOADER.devices);

		this.addButton     = this.AddToolbarButton("Add", "mono/add.svg?light");
		this.deleteButton  = this.AddToolbarButton("Delete", "mono/delete.svg?light");
		const filterButton = this.SetupFilter();
		const findInput    = this.SetupFind();
		this.toolbar.appendChild(this.AddToolbarSeparator());
		this.utilitiesDropDown = this.AddToolbarDropdown("mono/hammer.svg?light");
		this.sentChatButton = this.AddSendToChatButton();

		this.utilitiesDropDown.menu.style.height = "168px";

		const optionPing = document.createElement("div");
		optionPing.style.backgroundImage = "url(mono/ping.svg)";
		optionPing.textContent = "Ping";
		this.utilitiesDropDown.list.append(optionPing);

		const optionDnsLookup = document.createElement("div");
		optionDnsLookup.style.backgroundImage = "url(mono/dns.svg)";
		optionDnsLookup.textContent = "DNS Lookup";
		this.utilitiesDropDown.list.append(optionDnsLookup);

		const optionTraceRoute = document.createElement("div");
		optionTraceRoute.style.backgroundImage = "url(mono/traceroute.svg)";
		optionTraceRoute.textContent = "Trace Router";
		this.utilitiesDropDown.list.append(optionTraceRoute);

		const optionLocateIp = document.createElement("div");
		optionLocateIp.style.backgroundImage = "url(mono/locate.svg)";
		optionLocateIp.textContent = "Locate IP";
		this.utilitiesDropDown.list.append(optionLocateIp);

		const optionMacLookup = document.createElement("div");
		optionMacLookup.style.backgroundImage = "url(mono/maclookup.svg)";
		optionMacLookup.textContent = "MAC Lookup";
		this.utilitiesDropDown.list.append(optionMacLookup);

		if (this.params.find && this.params.find.length > 0) {
			findInput.value = this.params.find;
			findInput.parentElement.style.borderBottom = findInput.value.length === 0 ? "none" : "#c0c0c0 solid 2px";
			findInput.parentElement.style.width = "200px";
		}

		this.RefreshList();

		this.addButton.onclick = ()=> this.Add();
		this.deleteButton.onclick = ()=> this.Delete();

		optionPing.onclick=()=> {
			let entries = [];
			for (let i=0; i<this.list.childNodes.length; i++) {
				const id = this.list.childNodes[i].getAttribute("id");
				if ("ip" in LOADER.devices.data[id]) {
					LOADER.devices.data[id]["ip"].v.split(";").map(o => o.trim()).forEach(o => entries.push(o));
				}
				else if ("hostname" in LOADER.devices.data[id]) {
					LOADER.devices.data[id]["hostname"].v.split(";").map(o => o.trim()).forEach(o => entries.push(o));
				}
			}

			new Ping({
				entries: entries,
				timeout: 1000,
				interval: 1000,
				method: "icmp",
				rolling: false,
				moveToTop: false,
				status: "play"
			});
		};

		optionDnsLookup.onclick=()=> {
			let entries = [];
			for (let i=0; i<this.list.childNodes.length; i++) {
				const id = this.list.childNodes[i].getAttribute("id");
				if ("hostname" in LOADER.devices.data[id]) {
					LOADER.devices.data[id]["hostname"].v.split(";").map(o => o.trim()).forEach(o => entries.push(`A,${o}`));
				}
			}

			new DnsLookup({
				entries: entries,
				server       : "",
				type         : "A",
				timeout      : 2000,
				transport    : "Auto",
				isStandard   : false,
				isInverse    : false,
				serverStatus : false,
				isTruncated  : false,
				isRecursive  : true
			});
		};

		optionTraceRoute.onclick=()=> {
			let entries = [];
			for (let i=0; i<this.list.childNodes.length; i++) {
				const id = this.list.childNodes[i].getAttribute("id");
				if ("ip" in LOADER.devices.data[id]) {
					LOADER.devices.data[id]["ip"].v.split(";").map(o => o.trim()).forEach(o => entries.push(o));
				}
				else if ("hostname" in LOADER.devices.data[id]) {
					LOADER.devices.data[id]["hostname"].v.split(";").map(o => o.trim()).forEach(o => entries.push(o));
				}
			}

			new TraceRoute({entries: entries});
		};

		optionLocateIp.onclick=()=> {
			let entries = [];
			for (let i=0; i<this.list.childNodes.length; i++) {
				const id = this.list.childNodes[i].getAttribute("id");
				if ("ip" in LOADER.devices.data[id]) {
					LOADER.devices.data[id]["ip"].v.split(";").map(o => o.trim()).forEach(o => entries.push(o));
				}
				else if ("hostname" in LOADER.devices.data[id]) {
					LOADER.devices.data[id]["hostname"].v.split(";").map(o => o.trim()).forEach(o => entries.push(o));
				}
			}

			new LocateIp({entries: entries});
		};

		optionMacLookup.onclick=()=> {
			let entries = [];
			for (let i=0; i<this.list.childNodes.length; i++) {
				const id = this.list.childNodes[i].getAttribute("id");
				if ("mac address" in LOADER.devices.data[id]) {
					LOADER.devices.data[id]["mac address"].v.split(";").map(o => o.trim()).forEach(o => entries.push(o));
				}
			}

			new MacLookup({entries: entries});
		};

		this.UpdateAuthorization();

		this.content.addEventListener("keydown", event=>{
			if (event.key === "Delete") {
				this.Delete();
			}
			else if (event.key === "Insert") {
				this.Add();
			}
		});
	}

	UpdateAuthorization() { //overrides
		super.UpdateAuthorization();
		this.addButton.disabled = !KEEP.authorization.includes("*") && !KEEP.authorization.includes("devices:write");
		this.deleteButton.disabled = !KEEP.authorization.includes("*") && !KEEP.authorization.includes("devices:write");
		this.utilitiesDropDown.button.disabled = !KEEP.authorization.includes("*") && !KEEP.authorization.includes("network utilities:write");
	}

	InflateElement(element, entry, type) { //overrides
		const icon = document.createElement("div");
		icon.className = "list-element-icon";
		icon.style.backgroundImage = `url(${type in LOADER.deviceIcons ? LOADER.deviceIcons[type] : "mono/gear.svg"})`;
		element.appendChild(icon);

		super.InflateElement(element, entry, type);

		if (!element.ondblclick) {
			element.ondblclick = event=> {
				event.stopPropagation();

				const file = element.getAttribute("id");
				LOADER.OpenDeviceByFile(file);
			};
		}
	}

	Add() {
		new DeviceView({file: null});
	}

	Delete() {
		this.ConfirmBox("Are you sure you want to delete this device?", false, "mono/delete.svg").addEventListener("click", async ()=> {
			if (this.params.select === null) return;

			let file = this.params.select;

			try {
				const response = await fetch(`db/device/delete?file=${file}`);

				if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

				const json = await response.json();
				if (json.error) throw(json.error);

				delete LOADER.devices.data[file];
				LOADER.devices.length--;

				for (let i = 0; i < WIN.array.length; i++) {
					if (WIN.array[i] instanceof DevicesList) {
						let element = Array.from(WIN.array[i].list.childNodes).filter(o=>o.getAttribute("id") === file);
						element.forEach(o=> WIN.array[i].list.removeChild(o));
						WIN.array[i].UpdateViewport(true);
					}
					else if (WIN.array[i] instanceof DeviceView && WIN.array[i].params.file === file) {
						WIN.array[i].Close();
					}
				}

				this.params.select = null;
			}
			catch (ex) {
				console.error(ex);
			}
		});
	}
}
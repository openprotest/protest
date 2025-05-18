class DeviceView extends View {
	static DAY_TICKS = 3_600_000 * 24;

	static DEVICES_GROUP_SCHEMA = [
		"type", "name",

		["mono/portscan.svg", "network"],
		"ip", "ipv6", "mask", "hostname", "mac address", "dhcp enabled", "ports", "network adapter speed", "overwriteprotocol",

		[".", "device"],
		"manufacturer", "model", "serial number", "chasse type", "description",

		["mono/motherboard.svg", "motherboard"],
		"motherboard", "motherboard manufacturer", "motherboard serial number", "bios",

		["mono/cpu.svg", "processor"],
		"processor", "cpu cores", "cpu frequency", "cpu architecture", "cpu cache",

		["mono/ram.svg", "memory"],
		"memory", "total memory", "memory modules", "ram slot", "ram speed", "ram slot used", "ram type", "ram form factor",

		["mono/diskdrive.svg", "disk drive"],
		"disk drive", "physical disk", "logical disk",

		["mono/videocard.svg", "video card"],
		"video controller", "video driver",

		["mono/os.svg", "operating system"],
		"operating system", "os architecture", "os version", "os build", "service pack", "os serial no", "os install date",

		["mono/user.svg", "owner"],
		"owner", "owner name", "location",

		["mono/directory.svg", "Domain information"],
		"object guid", "distinguished name", "dns hostname", "created on dc", "fqdn",

		["mono/credential.svg", "credentials"],
		"domain", "username", "password", "ssh username", "ssh password", "uvnc password", "anydesk id", "anydesk password"
	];

	static PRINTER_TYPES = ["fax", "multiprinter", "ticket printer", "printer"];
	static IPv4_REGEX = /^(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)){3}$/gm;

	constructor(args) {
		super();
		this.args = args ?? {file: null};

		this.switchInfo = {success: false};

		this.SetIcon("mono/gear.svg");

		this.liveStatsWebSockets = null;
		this.link = LOADER.devices.data[this.args.file];
		this.order = "group";
		this.groupSchema = DeviceView.DEVICES_GROUP_SCHEMA;
		this.dbTarget = "device";
		this.pingIndicators = [];

		if (args.file && !this.link) {
			this.SetTitle("not found");
			this.ConfirmBox("Device no longer exists", true).addEventListener("click", ()=>this.Close());
			return;
		}

		if (args.file) {
			this.InitializePreview();
			setTimeout(()=>this.InitializeSubnetEmblem(), 200);

			if (this.link && this.link.ip) {
				this.InitializeGraphs();
			}
		}
		else if (args.copy) {
			const origin = LOADER.devices.data[args.copy];
			this.SetTitle(origin.name ? `Copy of ${origin.name.v}` : "Copy");
			this.Edit(true);

			for (const key in origin) {
				this.attributes.appendChild(
					this.CreateAttribute(key, origin[key].v, null, null, true)
				);
			}
		}
		else {
			this.SetTitle("New device");
			this.Edit(true);

			let origin = KEEP.username;
			let date = new Date();

			this.attributes.appendChild(this.CreateAttribute("type",         "", origin, date, true));

			this.attributes.appendChild(this.CreateAttribute("name",         "", origin, date, true));
			this.attributes.appendChild(this.CreateAttribute("ip",           "", origin, date, true));
			this.attributes.appendChild(this.CreateAttribute("hostname",     "", origin, date, true));
			this.attributes.appendChild(this.CreateAttribute("mac address",  "", origin, date, true));
			this.attributes.appendChild(this.CreateAttribute("manufacturer", "", origin, date, true));
			this.attributes.appendChild(this.CreateAttribute("model",        "", origin, date, true));
			this.attributes.appendChild(this.CreateAttribute("location",     "", origin, date, true));
			this.attributes.appendChild(this.CreateAttribute("owner",        "", origin, date, true));
		}

		this.AutoUpdateIndicators();

		setTimeout(()=>this.AfterResize(), WIN.ANIME_DURATION);
	}

	InitializeComponents() {
		super.InitializeComponents();

		this.utilitiesDropDown = this.AddToolbarDropdown("mono/hammer.svg?light");
		this.bar.insertBefore(this.utilitiesDropDown.button, this.sendChatButton);

		this.utilitiesDropDown.menu.style.height = "200px";

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

		const optionPortScan = document.createElement("div");
		optionPortScan.style.backgroundImage = "url(mono/portscan.svg)";
		optionPortScan.textContent = "Port scan";
		this.utilitiesDropDown.list.append(optionPortScan);

		const optionLocateIp = document.createElement("div");
		optionLocateIp.style.backgroundImage = "url(mono/locate.svg)";
		optionLocateIp.textContent = "Locate IP";
		this.utilitiesDropDown.list.append(optionLocateIp);

		const optionMacLookup = document.createElement("div");
		optionMacLookup.style.backgroundImage = "url(mono/maclookup.svg)";
		optionMacLookup.textContent = "MAC Lookup";
		this.utilitiesDropDown.list.append(optionMacLookup);

		this.refreshLiveStatsButton = this.AddToolbarButton("", "mono/restart.svg?light");
		this.refreshLiveStatsButton.style.float = "right";
		this.refreshLiveStatsButton.style.marginRight = "7px";
		this.refreshLiveStatsButton.onclick = ()=> this.InitializeLiveStats();
		this.bar.appendChild(this.refreshLiveStatsButton);

		optionPing.onclick=()=> {
			let target;
			if ("ip" in this.link) {
				target = this.link.ip.v;
			}
			else if ("hostname" in this.link) {
				target = this.link.hostname.v;
			}
			else {
				this.ConfirmBox("No IP or Hostname", true);
			}

			for (let i=0; i<WIN.array.length; i++) {
				if (!(WIN.array[i] instanceof Ping)) continue;
				WIN.array[i].Filter(target);
				WIN.array[i].BringToFront();
				return;
			}

			new Ping().Filter(target);
		};

		optionDnsLookup.onclick=()=> {
			let target, type;
			if ("ip" in this.link) {
				target = this.link.ip.v;
				type = "PTR";
			}
			else if ("hostname" in this.link) {
				target = this.link.hostname.v;
				type = "A";
			}
			else {
				this.ConfirmBox("No IP or Hostname", true);
			}

			for (let i=0; i<WIN.array.length; i++) {
				if (!(WIN.array[i] instanceof DnsLookup)) continue;

				const previousType = WIN.array[i].args.type;
				WIN.array[i].args.type = type;
				WIN.array[i].Filter(target);
				WIN.array[i].args.type = previousType;
				WIN.array[i].BringToFront();
				return;
			}

			const newDNS = new DnsLookup();
			newDNS.args.type = type;
			newDNS.Filter(target);
		};

		optionTraceRoute.onclick=()=> {
			let target;
			if ("ip" in this.link) {
				target = this.link.ip.v;
			}
			else if ("hostname" in this.link) {
				target = this.link.hostname.v;
			}
			else {
				this.ConfirmBox("No IP or Hostname", true);
			}

			for (let i=0; i<WIN.array.length; i++) {
				if (!(WIN.array[i] instanceof TraceRoute)) continue;
				WIN.array[i].Filter(target);
				WIN.array[i].BringToFront();
				return;
			}

			new TraceRoute().Filter(target);
		};

		optionPortScan.onclick=()=> {
			let target;
			if ("ip" in this.link) {
				target = this.link.ip.v;
			}
			else if ("hostname" in this.link) {
				target = this.link.hostname.v;
			}
			else {
				this.ConfirmBox("No IP or Hostname", true);
			}

			for (let i=0; i<WIN.array.length; i++) {
				if (!(WIN.array[i] instanceof PortScan)) continue;
				WIN.array[i].Filter(target);
				WIN.array[i].BringToFront();
				return;
			}

			new PortScan().Filter(target);
		};

		optionLocateIp.onclick=()=> {
			let target;
			if ("ip" in this.link) {
				target = this.link.ip.v;
			}
			else if ("hostname" in this.link) {
				target = this.link.hostname.v;
			}
			else {
				this.ConfirmBox("No IP or Hostname", true);
			}

			for (let i=0; i<WIN.array.length; i++) {
				if (!(WIN.array[i] instanceof LocateIp)) continue;
				WIN.array[i].Filter(target);
				WIN.array[i].BringToFront();
				return;
			}

			new LocateIp().Filter(target);
		};

		optionMacLookup.onclick=()=> {
			let mac;
			if ("mac address" in this.link) {
				mac = this.link["mac address"].v;
			}
			else {
				this.ConfirmBox("No MAC address", true);
			}

			for (let i=0; i<WIN.array.length; i++) {
				if (!(WIN.array[i] instanceof MacLookup)) continue;
				WIN.array[i].Filter(mac);
				WIN.array[i].BringToFront();
				return;
			}

			new MacLookup().Filter(mac);
		};
	}

	UpdateAuthorization() { //overrides
		super.UpdateAuthorization();
		this.utilitiesDropDown.button.disabled = !KEEP.authorization.includes("*") && !KEEP.authorization.includes("network utilities:write");
	}

	AutoUpdateIndicators() {
		setTimeout(async ()=>{
			if (this.isClosed) return;

			const query = this.pingIndicators.map(indicator => indicator.target).join(";");

			try {
				const response = await fetch(`tools/bulkping?query=${query}`);

				if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

				const json = await response.json();
				if (json.error) return;
				for (let i = 0; i < json.length; i++) {
					if (json[i] === -1) {
						this.pingIndicators[i].dot.style.borderBottomColor = "var(--clr-error)";
						this.pingIndicators[i].dot.style.transform = "rotate(180deg)";
						this.pingIndicators[i].button.secondary.style.color = "var(--clr-error)";
						this.pingIndicators[i].button.secondary.textContent = "Timed out";
					}
					else if (json[i] === -2) {
						this.pingIndicators[i].dot.style.borderBottomColor = "var(--clr-orange);";
						this.pingIndicators[i].dot.style.transform = "rotate(180deg)";
						this.pingIndicators[i].button.secondary.style.color = "var(--clr-orange);";
						this.pingIndicators[i].button.secondary.textContent = "Error";
					}
					else if (json[i] > -1) {
						const color = UI.PingColor(json[i]);
						this.pingIndicators[i].dot.style.borderBottomColor = color;
						this.pingIndicators[i].dot.style.transform = "none";
						this.pingIndicators[i].button.secondary.style.color = color;
						this.pingIndicators[i].button.secondary.textContent = `${json[i]}ms`;
					}
				}
			}
			catch {}

			this.AutoUpdateIndicators();
		}, 180_000);
	}

	InitializePreview() { //overrides
		let type = this.link.type ? this.link.type.v.toLowerCase() : "";

		if (this.link.name && this.link.name.v.length > 0) {
			this.SetTitle(this.link.name.v);
		}
		else if (this.link.ip && this.link.ip.v.length > 0) {
			this.SetTitle(this.link.ip.v);
		}
		else {
			this.SetTitle("");
		}

		this.SetIcon(type in LOADER.deviceIcons ? LOADER.deviceIcons[type] : "mono/gear.svg");
		super.InitializePreview();
		this.InitializeLiveStats();
		this.InitializeInterfaces();
	}

	InitializeSubnetEmblem() {
		if (this.emblem) {
			this.task.removeChild(this.emblem);
			this.emblem = null;
		}

		if (!this.link.ip) return;

		let colors = [];
		let ips = this.link.ip.v.split(";").map(o=>o.trim());

		for (let i=0; i<ips.length; i++) {
			if (!ips[i].match(DeviceView.IPv4_REGEX)) continue;
			let split = ips[i].split(".").map(o=>parseInt(o));
			let n = split[0]*256*256*256 + split[1]*256*256 + split[2]*256 + split[3];

			for (let j=0; j<KEEP.zones.length; j++) {
				if (n < KEEP.zones[j].first || n > KEEP.zones[j].last) continue;
				colors.push(KEEP.zones[j].color);
			}
		}

		if (colors.length === 0) { return; }

		let gradient = "linear-gradient(";
		for (let i=0; i<colors.length; i++) {
			if (i > 0) {
				gradient += colors[i-1];
				gradient += ` ${100 * i / colors.length}%`;
				gradient += ", ";
			}

			gradient += colors[i];
			gradient += ` ${100 * i / colors.length}%`;
			if (i != colors.length - 1) {gradient += ","}
		}
		gradient += `, ${colors[colors.length-1]} 100%`;
		gradient += ")";

		this.emblem = document.createElement("div");
		this.emblem.className = "task-icon-emblem";
		this.task.appendChild(this.emblem);

		const emblemInner = document.createElement("div");
		emblemInner.style.background = gradient;
		this.emblem.appendChild(emblemInner);
	}

	InitializeSideTools() { //overrides
		super.InitializeSideTools();
		this.sideTools.textContent = "";

		let host = null;
		if (this.link.ip) {
			host = this.link.ip.v.split(";")[0].trim();
		}
		else if (this.link.hostname) {
			host = this.link.hostname.v.split(";")[0].trim();
		}

		const overwriteProtocol = {};
		if (".overwriteprotocol" in this.link) {
			this.link[".overwriteprotocol"].v.split(";").map(o=> o.trim()).forEach(o=> {
				let split = o.split(":");
				if (split.length === 2) overwriteProtocol[split[0]] = split[1];
			});
		}
		if ("overwriteprotocol" in this.link) {
			this.link["overwriteprotocol"].v.split(";").map(o=> o.trim()).forEach(o=> {
				let split = o.split(":");
				if (split.length === 2) overwriteProtocol[split[0]] = split[1];
			});
		}

		if ("mac address" in this.link) {
			const wolButton = this.CreateSideButton("mono/wol.svg", "Wake on LAN");
			wolButton.onclick = async ()=> {
				if (wolButton.hasAttribute("busy")) return;
				try {
					wolButton.setAttribute("busy", true);
					const response = await fetch(`manage/device/wol?file=${this.args.file}`);
					const json = await response.json();
					if (json.error) throw(json.error);

					this.ConfirmBox("Magic packet has been sent successfully.", true, "mono/wol.svg");
				}
				catch (ex) { this.ConfirmBox(ex, true, "mono/wol.svg"); }
				wolButton.removeAttribute("busy");
			};
		}

		if (this.link.ports) {
			let ports = this.link.ports.v.split(";").map(o=> parseInt(o.trim()));

			if (ports.includes(445) && "operating system" in this.link) { //wmi service 445

				const powerOffButton = this.CreateSideButton("mono/turnoff.svg", "Power off");
				powerOffButton.onclick = ()=> {
					this.ConfirmBox("Are you sure you want to power off this device?", false, "mono/turnoff.svg").addEventListener("click", async ()=> {
						if (powerOffButton.hasAttribute("busy")) return;
						try {
							powerOffButton.setAttribute("busy", true);
							const response = await fetch(`manage/device/shutdown?file=${this.args.file}`);
							const json = await response.json();
							if (json.error) throw(json.error);
						}
						catch (ex) { this.ConfirmBox(ex, true, "mono/turnoff.svg"); }
						powerOffButton.removeAttribute("busy");
					});
				};

				const rebootButton = this.CreateSideButton("mono/restart.svg", "Reboot");
				rebootButton.onclick = ()=> {
					this.ConfirmBox("Are you sure you want to reboot this device?", false, "mono/restart.svg").addEventListener("click", async ()=> {
						if (rebootButton.hasAttribute("busy")) return;
						try {
							rebootButton.setAttribute("busy", true);
							const response = await fetch(`manage/device/reboot?file=${this.args.file}`);
							const json = await response.json();
							if (json.error) throw(json.error);
						}
						catch (ex) { this.ConfirmBox(ex, true, "mono/restart.svg"); }
						rebootButton.removeAttribute("busy");
					});
				};

				const logOffButton = this.CreateSideButton("mono/logoff.svg", "Log off");
				logOffButton.onclick = ()=> {
					this.ConfirmBox("Are you sure you want to log off this device?", false, "mono/logoff.svg").addEventListener("click", async ()=> {
						if (logOffButton.hasAttribute("busy")) return;
						try {
							logOffButton.setAttribute("busy", true);
							const response = await fetch(`manage/device/logoff?file=${this.args.file}`);
							const json = await response.json();
							if (json.error) throw(json.error);
						}
						catch (ex) { this.ConfirmBox(ex, true, "mono/logoff.svg"); }
						logOffButton.removeAttribute("busy");
					});
				};

				const processesButton = this.CreateSideButton("mono/console.svg", "Processes");
				processesButton.onclick = ()=> {
					const wmi = new Wmi({target:host, query:"SELECT CreationDate, ExecutablePath, Name, ProcessId \nFROM Win32_Process", hideInput:true});
					wmi.SetIcon("mono/console.svg");
					if (!this.link.name || this.link.name.v.length == 0) {
						wmi.SetTitle("[untitled] - Processes");
					}
					else {
						wmi.SetTitle(this.link.name.v + " - Processes");
					}
				};

				const servicesButton = this.CreateSideButton("mono/service.svg", "Services");
				servicesButton.onclick = ()=> {
					const wmi = new Wmi({target: host, query:"SELECT DisplayName, Name, ProcessId, State \nFROM Win32_Service", hideInput:true});
					wmi.SetIcon("mono/service.svg");
					if (!this.link.name || this.link.name.v.length==0) {
						wmi.SetTitle("[untitled] - Processes");
					}
					else {
						wmi.SetTitle(this.link.name.v + " - Services");
					}
				};

				const monitorButton = this.CreateSideButton("mono/resmonitor.svg", "Resource monitor");
				monitorButton.onclick = ()=> new Monitor({file: this.args.file});

				const computerMngButton = this.CreateSideButton("mono/computermanage.svg", "Management");
				computerMngButton.onclick = ()=> UI.PromptAgent(this, "management", host);

				const psRemoteButton = this.CreateSideButton("mono/psremote.svg", "PS remote"); //psexec
				psRemoteButton.onclick = ()=> UI.PromptAgent(this, "psremote", host);

				if (ports.includes(445)) { //smb
					const smbButton = this.CreateSideButton("mono/shared.svg", "SMB");
					smbButton.onclick = ()=> UI.PromptAgent(this, "smb", `\\\\${host}\\`);
				}
			}

			if (overwriteProtocol.telnet) { //telnet
				const telnetButton = this.CreateSideButton("mono/telnet.svg", "Telnet");
				telnetButton.onclick = ()=> new Telnet({host: host + ":" + overwriteProtocol.telnet});
			}
			else if (ports.includes(23)) {
				const telnetButton = this.CreateSideButton("mono/telnet.svg", "Telnet");
				telnetButton.onclick = ()=> new Telnet({host: host});
			}

			if (overwriteProtocol.ssh || ports.includes(22)) {
				let sshHost = null;
				if (overwriteProtocol.ssh) {
					sshHost = `${host}:${overwriteProtocol.ssh}`;
				}
				else if (ports.includes(22)) {
					sshHost = host;
				}

				let username = null;
				if ("ssh username" in this.link) {
					username = this.link["ssh username"].v;
				}
				else if ("username" in this.link) {
					username = this.link.username.v;
				}

				let file = null;
				if ("ssh password" in this.link || "password" in this.link) {
					file = this.args.file;
				}

				const sshButton = this.CreateSideButton("mono/ssh.svg", "Secure shell");
				sshButton.onclick = ()=> new Ssh({host:sshHost,  username:username, file:file});
			}

			if (ports.includes(53)) {
				const dnsButton = this.CreateSideButton("mono/dns.svg", "DNS lookup");
				dnsButton.onclick = ()=> new DnsLookup({entries:[], server:host, type:"A", timeout:2000, transport:"Auto", isRecursive:true});
			}

			if (overwriteProtocol.http) { //http
				const actionButton = this.CreateSideButton("mono/earth.svg", "HTTP");
				actionButton.onclick = ()=> {
					const link = document.createElement("a");
					link.href = "http://" + host + ":" + overwriteProtocol.http;
					link.target = "_blank";
					link.click();
				};
			}
			else if (ports.includes(80)) {
				const actionButton = this.CreateSideButton("mono/earth.svg", "HTTP");
				actionButton.onclick = ()=> {
					const link = document.createElement("a");
					link.href = "http://" + host;
					link.target = "_blank";
					link.click();
				};
			}

			if (overwriteProtocol.https) { //https
				const actionButton = this.CreateSideButton("mono/earth.svg", "HTTPS");
				actionButton.onclick = ()=> {
					const link = document.createElement("a");
					link.href = "https://" + host + ":" + overwriteProtocol.https;
					link.target = "_blank";
					link.click();
				};
			}
			else if (ports.includes(443)) { //https
				const actionButton = this.CreateSideButton("mono/earth.svg", "HTTPS");
				actionButton.onclick = ()=> {
					const link = document.createElement("a");
					link.href = "https://" + host;
					link.target = "_blank";
					link.click();
				};
			}

			if (overwriteProtocol.ftp) { //ftp
				const actionButton = this.CreateSideButton("mono/shared.svg", "FTP");
				actionButton.onclick = ()=> {
					const link = document.createElement("a");
					link.href = "ftp://" + host + ":" + overwriteProtocol.ftp;
					link.target = "_blank";
					link.click();
				};
			}
			else if (ports.includes(21)) {
				const actionButton = this.CreateSideButton("mono/shared.svg", "FTP");
				actionButton.onclick = ()=> {
					const link = document.createElement("a");
					link.href = "ftp://" + host;
					link.target = "_blank";
					link.click();
				};
			}

			if (overwriteProtocol.ftps) { //ftps
				const actionButton = this.CreateSideButton("mono/shared.svg", "FTP");
				actionButton.onclick = ()=> {
					const link = document.createElement("a");
					link.href = "ftps://" + host + ":" + overwriteProtocol.ftp;
					link.target = "_blank";
					link.click();
				};
			}
			else if (ports.includes(989)) {
				const actionButton = this.CreateSideButton("mono/shared.svg", "FTPs");
				actionButton.onclick = ()=> {
					const link = document.createElement("a");
					link.href = "ftps://" + host;
					link.target = "_blank";
					link.click();
				};
			}

			if (overwriteProtocol.rdp) { //rdp
				const actionButton = this.CreateSideButton("mono/rdp.svg", "Remote desktop");
				actionButton.onclick = ()=> {
					if (localStorage.getItem("prefer_rdp_file") === "true") {
						this.DownloadRdp(host, overwriteProtocol.rdp);
					}
					else {
						UI.PromptAgent(this, "rdp", `${host}:${overwriteProtocol.rdp}`);
					}
				}
			}
			else if (ports.includes(3389)) {
				const actionButton = this.CreateSideButton("mono/rdp.svg", "Remote desktop");
				actionButton.onclick = ()=> {
					if (localStorage.getItem("prefer_rdp_file") === "true") {
						this.DownloadRdp(host, 3389);
					}
					else {
						UI.PromptAgent(this, "rdp", host);
					}
				}
			}

			if (overwriteProtocol.uvnc) { //uvnc
				const actionButton = this.CreateSideButton("mono/uvnc.svg", "uVNC");
				actionButton.onclick = async ()=> {
					if (localStorage.getItem("prefer_rdp_file") === "true") {
						this.DownloadVnc(host, overwriteProtocol.uvnc);
					}
					else {
						let uvncPassword = null;
						if ("uvnc password" in this.link) {
							const response = await fetch(`/db/${this.dbTarget}/attribute?file=${this.args.file}&attribute=uvnc password`);
							if (response.status !== 200) LOADER.HttpErrorHandler(response.status);
							uvncPassword = await response.text();
							if (uvncPassword.length === 0) uvncPassword = null;
						}
						UI.PromptAgent(this, "uvnc", `${host}:${overwriteProtocol.uvnc}`, uvncPassword);
					}
				}
			}
			else if (ports.includes(5900)) {
				const actionButton = this.CreateSideButton("mono/uvnc.svg", "uVNC");
				actionButton.onclick = async ()=> {
					if (localStorage.getItem("prefer_rdp_file") === "true") {
						this.DownloadVnc(host, 5900);
					}
					else {
						let uvncPassword = null;
						if ("uvnc password" in this.link) {
							const response = await fetch(`/db/${this.dbTarget}/attribute?file=${this.args.file}&attribute=uvnc password`);
							if (response.status !== 200) LOADER.HttpErrorHandler(response.status);
							uvncPassword = await response.text();
							if (uvncPassword.length === 0) uvncPassword = null;
						}
						UI.PromptAgent(this, "uvnc", host, uvncPassword);
					}
				}
			}

			if (overwriteProtocol.winbox) { //winbox
				const actionButton = this.CreateSideButton("mono/mikrotik.svg", "Winbox");
				actionButton.onclick = ()=> UI.PromptAgent(this, "winbox", `${host}:${overwriteProtocol.winbox}`);
			}
			else if (ports.includes(8291)) {
				const actionButton = this.CreateSideButton("mono/mikrotik.svg", "Winbox");
				actionButton.onclick = ()=> UI.PromptAgent(this, "winbox", host);
			}

			if (ports.includes(9100)) { //print test
				const printTestButton = this.CreateSideButton("mono/printer.svg", "Print test");
				printTestButton.onclick = async ()=> {
					if (printTestButton.hasAttribute("busy")) return;
					try {
						printTestButton.setAttribute("busy", true);
						const response = await fetch(`manage/device/printtest?host=${host}`);
						const json = await response.json();
						if (json.error) throw (json.error);
					}
					catch (ex) { this.ConfirmBox(ex, true, "mono/printer.svg"); }
					printTestButton.removeAttribute("busy");
				};
			}
		}

		if ("anydesk id" in this.link && this.link["anydesk id"].v.length > 0) { //anydesk
			const actionButton = this.CreateSideButton("mono/anydesk.svg", "AnyDesk");
			actionButton.onclick = ()=> UI.PromptAgent(this, "anydesk", this.link["anydesk id"].v);
		}

		if (this.link.type) {
			const type = this.link.type.v.toLowerCase();
			if (type === "router" || type === "switch") {
				const configButton = this.CreateSideButton("mono/configfile.svg", "Configuration");
				configButton.onclick = ()=> this.DeviceConfiguration();
				configButton.style.marginTop = "16px";

				const interfacesButton = this.CreateSideButton("mono/interfaces.svg", "Interfaces");
				interfacesButton.onclick = ()=> this.EditInterfaces();
			}
		}
	}

	InitializeInterfaces() {
		this.liveC.textContent = "";

		if (!(".interfaces" in this.link)) return;
		let obj;

		try {
			obj = JSON.parse(this.link[".interfaces"].v);
		}
		catch {
			return;
		}

		if (obj === null) return;

		const frame = document.createElement("div");
		frame.className = "view-interfaces-frame";
		this.liveC.appendChild(frame);

		let numbering = obj.n ? obj.n : "vertical";
		let list = [];

		if (!this.switchInfo.success) {
			this.CreateWarning("SNMP fetch failed. Currently displaying local data", "SNMP");
		}

		for (let i=0; i<obj.i.length; i++) {
			const frontElement = document.createElement("div");
			frontElement.className = "view-interface-port";
			frame.appendChild(frontElement);

			const iconElement = document.createElement("div");
			iconElement.backgroundColor = "var(--clr-dark)";
			iconElement.style.transitionDelay = `${i*.005}s`;
			switch (obj.i[i].i) {
			case "Ethernet": iconElement.style.maskImage = "url(mono/ethernetport.svg)"; break;
			case "SFP"     : iconElement.style.maskImage = "url(mono/sfpport.svg)"; break;
			case "SFP+"    : iconElement.style.maskImage = "url(mono/sfpport.svg)"; break;
			case "QSFP"    : iconElement.style.maskImage = "url(mono/qsfpport.svg)"; break;
			case "USB"     : iconElement.style.maskImage = "url(mono/usbport.svg)"; break;
			case "Serial"  : iconElement.style.maskImage = "url(mono/serialport.svg)"; break;
			}
			frontElement.appendChild(iconElement);

			const numElement = document.createElement("div");
			numElement.textContent = obj.i[i].n ? obj.i[i].n : frame.childNodes.length;
			frontElement.appendChild(numElement);

			const ledElement = document.createElement("div");
			if (this.switchInfo.success && i<this.switchInfo.status.length && this.switchInfo.status[i]==1) {
				ledElement.style.animation = "led-blink .4s linear infinite";
			}
			frontElement.appendChild(ledElement);

			list.push({
				frontElement : frontElement,
				iconElement  : iconElement,
				numberElement: numElement,
				number       : obj.i[i].n,
				port         : obj.i[i].i,
				speed        : obj.i[i].s,
				untagged     : obj.i[i].v,
				tagged       : obj.i[i].t,
				link         : obj.i[i].l,
				comment      : obj.i[i].c
			});

			frontElement.onmouseenter = ()=> {
				this.floating.textContent = "";

				const speedColorBox = document.createElement("div");
				speedColorBox.style.display = "inline-block";
				speedColorBox.style.width = "8px";
				speedColorBox.style.height = "8px";
				speedColorBox.style.borderRadius = "2px";
				speedColorBox.style.marginLeft = "4px";
				speedColorBox.style.marginRight = "4px";
				speedColorBox.style.backgroundColor = this.GetSpeedColor(list[i].speed);
				this.floating.appendChild(speedColorBox);

				if (obj.i[i].s !== "") {
					const speedLabel = document.createElement("div");
					speedLabel.style.display = "inline-block";
					speedLabel.style.fontSize = "small";
					speedLabel.textContent = `${obj.i[i].s} ${obj.i[i].i}`;
					this.floating.appendChild(speedLabel);
				}

				this.floating.appendChild(document.createElement("br"));

				const vlanColorBox = document.createElement("div");
				vlanColorBox.style.display = "inline-block";
				vlanColorBox.style.width = "8px";
				vlanColorBox.style.height = "8px";
				vlanColorBox.style.borderRadius = "2px";
				vlanColorBox.style.marginLeft = "4px";
				vlanColorBox.style.marginRight = "4px";
				vlanColorBox.style.backgroundColor = this.GetVlanColor(list[i].vlan);
				this.floating.appendChild(vlanColorBox);

				if (obj.i[i].v && obj.i[i].v.toString().length) {
					const vlanLabel = document.createElement("div");
					vlanLabel.style.display = "inline-block";
					vlanLabel.style.fontSize = "small";
					vlanLabel.textContent = `Untagged VLAN ${obj.i[i].v}`;
					this.floating.appendChild(vlanLabel);
				}

				
				if (obj.i[i].t && obj.i[i].t.toString().length) {
					const vlanLabel = document.createElement("div");
					vlanLabel.style.display = "inline-block";
					vlanLabel.style.fontSize = "small";
					vlanLabel.style.marginLeft = "18px";
					vlanLabel.textContent = `Tagged VLAN ${obj.i[i].t}`;
					this.floating.appendChild(vlanLabel);
				}

				if (this.switchInfo.success && i < this.switchInfo.data.length) {
					const trafficLabel = document.createElement("div");
					trafficLabel.style.display = "block";
					trafficLabel.style.fontSize = "small";
					trafficLabel.style.marginLeft = "18px";
					trafficLabel.textContent = UI.SizeToString(this.switchInfo.data[i]);
					this.floating.appendChild(trafficLabel);
				}

				if (this.switchInfo.success && i < this.switchInfo.error.length) {
					const errorLabel = document.createElement("div");
					errorLabel.style.display = "block";
					errorLabel.style.fontSize = "small";
					errorLabel.style.marginLeft = "18px";
					errorLabel.textContent = this.switchInfo.error[i]==1 ? "1 error" : `${this.switchInfo.error[i]} errors`;
					this.floating.appendChild(errorLabel);
				}

				if (list[i].link && list[i].link in LOADER.devices.data) {
					let file = list[i].link;
					let type = LOADER.devices.data[file].type ? LOADER.devices.data[file].type.v.toLowerCase() : "";
					const icon = LOADER.deviceIcons[type] ? LOADER.deviceIcons[type] : "mono/gear.svg";

					const linkIcon = document.createElement("div");
					linkIcon.style.backgroundImage = `url(${icon})`;
					linkIcon.style.backgroundRepeat = "no-repeat";
					linkIcon.style.backgroundPosition = "0 center";
					linkIcon.style.backgroundSize = "32px 32px";
					linkIcon.style.height = "40px";
					linkIcon.style.lineHeight = "40px";
					linkIcon.style.margin = "4px";
					linkIcon.style.paddingLeft = "36px";
					this.floating.appendChild(linkIcon);

					if (LOADER.devices.data[file].name) {
						linkIcon.textContent = LOADER.devices.data[file].name.v;
					}
					else if (LOADER.devices.data[file].hostname) {
						linkIcon.textContent = file.hostname.v;
					}
					else if (LOADER.devices.data[file].ip) {
						linkIcon.textContent = LOADER.devices.data[file].ip.v;
					}

					this.floating.style.maxHeight = "150px";

					list[i].frontElement.ondblclick = ()=> {
						LOADER.OpenDeviceByFile(file);
					};
				}

				let x = frontElement.getBoundingClientRect().x - this.win.getBoundingClientRect().x;
				if (x > this.content.getBoundingClientRect().width - this.floating.getBoundingClientRect().width - 8) {
					x = this.content.getBoundingClientRect().width - this.floating.getBoundingClientRect().width - 8;
				}

				this.floating.style.left = `${x}px`;
				this.floating.style.top = `${frontElement.getBoundingClientRect().y - this.win.getBoundingClientRect().y + 20}px`;
				this.floating.style.opacity = "1";
				this.floating.style.visibility = "visible";
			};

			frontElement.onmouseleave = ()=> {
				this.floating.style.opacity = "0";
				this.floating.style.visibility = "hidden";
			};

			frame.onmouseenter = ()=> {this.floating.style.display = "initial";};
			frame.onmouseleave = ()=> {this.floating.style.display = "none";};
		}

		const gridSize = this.InitInterfaceComponents(frame, numbering, list);

		const modeBox = document.createElement("div");
		modeBox.tabIndex = 0;
		modeBox.className = "view-interfaces-mode-box";
		modeBox.style.gridArea = `${gridSize.rows+1} / 1`;
		frame.appendChild(modeBox);

		const modeButton = document.createElement("div");
		modeButton.className = "view-interfaces-mode-button";
		modeBox.appendChild(modeButton);

		const modeMenu = document.createElement("div");
		modeMenu.className = "view-interfaces-mode-menu";
		modeBox.appendChild(modeMenu);

		const modesLocal = ["Speed", "Untagged VLAN ID"];
		const modesLive = ["Speed", "VLAN ID", "Traffic", "Errors"];

		const ModeToggle = event=> {
			if (this.switchInfo.success) {
				switch (event.target.textContent) {
				case "Speed":
					for (let i=0; i<list.length && i<this.switchInfo.speed.length; i++) {
						list[i].iconElement.style.backgroundColor = this.GetSpeedColor(this.switchInfo.speed[i] ?? null);
					}
					break;

				case "VLAN ID":
					for (let i=0; i<list.length && i<this.switchInfo.untagged.length; i++) {
						list[i].iconElement.style.backgroundColor = this.GetVlanColor(this.switchInfo.untagged[i] ?? null);
					}
					break;

				case "Traffic":
					const maxTraffic = this.switchInfo.data.reduce((a, b)=> Math.max(a, b), 1);
					for (let i=0; i<list.length && i<this.switchInfo.data.length; i++) {
						list[i].iconElement.style.backgroundColor = this.switchInfo.data[i] === 0 ? "rgb(32,32,32)" : `rgb(32,${63+192*this.switchInfo.data[i]/maxTraffic},32)`;
					}
					break;

				case "Errors":
					const maxError = this.switchInfo.error.reduce((a, b)=> Math.max(a, b), 1);
					for (let i=0; i<list.length && i<this.switchInfo.error.length; i++) {
						list[i].iconElement.style.backgroundColor = this.switchInfo.error[i] === 0 ? "rgb(32,32,32)" : `rgb(${63+192*this.switchInfo.error[i]/maxError},32,32)`;
					}
					break;
				}
			}
			else {
				switch (event.target.textContent) {
				case "Speed"  : list.forEach(o=> o.iconElement.style.backgroundColor = this.GetSpeedColor(o.speed)); break;
				case "VLAN ID"   : list.forEach(o=> o.iconElement.style.backgroundColor = this.GetVlanColor(o.untagged)); break;
				}
			}
		};

		modeBox.onclick = ()=> {
			modeMenu.textContent = "";

			const modes = this.switchInfo.success ? modesLive : modesLocal;
			for (let i=0; i<modes.length; i++) {
				const option = document.createElement("div");
				option.textContent = modes[i];
				option.onclick = ModeToggle;
				modeMenu.appendChild(option);
			}
			modeButton.focus();
		};
	}

	async InitializeLiveStats() {
		if (this.liveStatsWebSockets !== null) return;

		let server = window.location.href.replace("https://", "").replace("http://", "");
		if (server.indexOf("/") > 0) server = server.substring(0, server.indexOf("/"));

		this.liveStatsWebSockets = new WebSocket((KEEP.isSecure ? "wss://" : "ws://") + server + "/ws/livestats/device");

		let dotPingCounter = 0;
		let liveButtons = [];
		let spinnerBox = null;
		this.pingIndicators = [];

		this.liveStatsWebSockets.onopen = ()=> {
			this.refreshLiveStatsButton.disabled = true;
			this.refreshLiveStatsButton.style.animation = "spin 1.5s linear infinite reverse";

			dotPingCounter = 0;

			this.AfterResize();
			const icon = this.task.querySelector(".icon");
			this.task.textContent = "";
			this.task.appendChild(icon);

			if (this.emblem) {
				this.task.appendChild(this.emblem);
			}

			this.liveA.textContent = "";
			this.liveB.textContent = "";
			//this.liveD.textContent = "";

			spinnerBox = document.createElement("div");
			spinnerBox.style.height = "0";
			spinnerBox.style.transition = ".2s";
			this.liveB.appendChild(spinnerBox);

			const spinner = document.createElement("div");
			spinner.className = "spinner";
			spinner.style.textAlign = "left";
			spinner.style.marginTop = "8px";
			spinner.style.marginBottom = "8px";
			spinner.style.transform = "scale(.85)";
			spinner.style.animation = "delayed-fade-in .66s ease-in 1";
			spinner.appendChild(document.createElement("div"));

			const status = document.createElement("div");
			status.textContent = "Retrieving device metrics...";
			status.style.textAlign = "center";
			status.style.fontWeight = "bold";
			status.style.animation = "delayed-fade-in 1s ease-in 1";

			spinnerBox.append(spinner, status);

			this.liveStatsWebSockets.send(this.args.file);

			setTimeout(()=> {
				if (this.liveStatsWebSockets && !this.liveStatsWebSockets.isClosed) {
					spinnerBox.style.height = "88px";
				}
			}, 400);
		};

		this.liveStatsWebSockets.onmessage = async event=> {
			const json = await JSON.parse(event.data);

			if (json.info) {
				this.CreateInfo(json.info, json.source);
			}
			else if (json.warning) {
				this.CreateWarning(json.warning, json.source);
			}
			else if (json.error) {
				this.CreateError(json.error, json.source);
			}
			else if (json.critical) {
				this.CreateCritical(json.critical, json.source);
			}
			else if (json.echoReply) {
				let dot = null;
				if (this.task.childNodes.length < 5) {
					dot = document.createElement("div");
					dot.className = "task-icon-dots";
					dot.style.left = `${1 + dotPingCounter*13}px`;
					dot.style.borderBottomColor = UI.PingColor(json.echoReply);
					this.task.appendChild(dot);

					if (isNaN(json.echoReply)) {
						dot.style.transform = "rotate(180deg)";
					}
				}

				dotPingCounter++;

				const pingButton = this.CreateInfoButton(json.for, "/mono/ping.svg");
				liveButtons.push(pingButton);
				pingButton.secondary.textContent = isNaN(json.echoReply) ? json.echoReply : `${json.echoReply}ms`;
				pingButton.secondary.style.display = "inline-block";
				pingButton.secondary.style.color = UI.PingColor(json.echoReply);
				pingButton.secondary.style.backgroundColor = "var(--clr-dark)";
				pingButton.secondary.style.padding = "0 4px";
				pingButton.secondary.style.borderRadius = "4px";

				pingButton.button.onclick = ()=> {
					for (let i=0; i<WIN.array.length; i++) {
						if (!(WIN.array[i] instanceof Ping)) continue;
						WIN.array[i].Filter(json.for);
						WIN.array[i].BringToFront();
						return;
					}
					new Ping().Filter(json.for);
				};

				this.pingIndicators.push({target:json.for, dot:dot, button:pingButton});
			}
			else if (json.drive) {
				const driveButton = this.CreateInfoButton(json.drive, "/mono/hdd.svg");
				liveButtons.push(driveButton);
				driveButton.secondary.style.display = "inline-block";
				driveButton.secondary.style.width = "64px";
				driveButton.secondary.style.height = "10px";
				driveButton.secondary.style.border = "2px solid var(--clr-dark)";
				driveButton.secondary.style.borderRadius = "2px";
				driveButton.secondary.style.transition = ".4s";

				const percent = 100 - (100 * json.used / json.total).toFixed(1);
				if (percent <= 1) {
					driveButton.button.style.backgroundColor = "var(--clr-critical)";
				}
				else if (percent <= 5) {
					driveButton.button.style.backgroundColor = "var(--clr-error)";
				}
				else if (percent < 15) {
					driveButton.button.style.backgroundColor = "var(--clr-warning)";
				}

				driveButton.secondary.style.boxShadow = `var(--clr-dark) 0px 0 0 inset`;

				setTimeout(()=>{
					driveButton.secondary.style.boxShadow = `var(--clr-dark) ${json.used * 64 / json.total}px 0 0 inset`;
				}, WIN.ANIME_DURATION);

				driveButton.button.onclick = ()=> UI.PromptAgent(this, "smb", json.path);
			}
			else if (json.activeUser) {
				const userButton = this.CreateInfoButton(json.activeUser, "/mono/user.svg");
				liveButtons.push(userButton);
				userButton.secondary.textContent = "Logged in";
				userButton.secondary.style.display = "inline-block";
				userButton.secondary.style.verticalAlign = "top";
				userButton.secondary.style.height = "12px";

				userButton.button.onclick = ()=> {
					let usersList = [json.activeUser];
					if (json.activeUser.indexOf("\\") > 0) usersList.push(json.activeUser.split("\\")[1]);
					let found = null;
					for (let file in LOADER.users.data) {
						if (!LOADER.users.data[file].username) continue;
						if (usersList.includes(LOADER.users.data[file].username.v)) {
							found = file;
							break;
						}
					}

					if (found) {
						LOADER.OpenUserByFile(found);
					}
					else {
						this.ConfirmBox("User don't exist in users list", true, "mono/user.svg");
					}
				};
			}
			else if (json.switchInfo) {
				this.switchInfo = json.switchInfo;
				this.InitializeInterfaces();
			}
		};

		this.liveStatsWebSockets.onclose = ()=> {
			this.refreshLiveStatsButton.disabled = false;
			this.refreshLiveStatsButton.style.animation = "none";

			if (spinnerBox) {
				spinnerBox.style.height = "0";
				spinnerBox.style.opacity = "0";
				this.liveB.removeChild(spinnerBox);
			}

			const loggedIn = liveButtons.find(o=> o.secondary.textContent === "Logged in");
			if (!loggedIn && this.link.owner) {
				const split = this.link.owner.v.split(";").map(o=>o.trim());

				for (let i=0; i<split.length; i++) {
					if (split[i].length === 0) continue;
					const userButton = this.CreateInfoButton(split[i], "/mono/user.svg");
					liveButtons.push(userButton);
					userButton.secondary.textContent = "Owner";
					userButton.secondary.style.display = "inline-block";
					userButton.secondary.style.verticalAlign = "top";
					userButton.secondary.style.height = "12px";

					userButton.button.onclick = ()=> {
						let usersList = [split[i]];
						if (split[i].indexOf("\\") > 0) usersList.push(split[i].split("\\")[1]);
						let found = null;
						for (let file in LOADER.users.data) {
							if (!LOADER.users.data[file].username) continue;
							if (usersList.includes(LOADER.users.data[file].username.v)) {
								found = file;
								break;
							}
						}

						if (found) {
							for (let k=0; k<WIN.array.length; k++) {
								if (WIN.array[k] instanceof UserView && WIN.array[k].args.file === found) {
									WIN.array[k].Minimize();
									return;
								}
							}
							new UserView({file: found});
						}
					};
				}
			}

			this.liveStatsWebSockets = null;
		};
	}

	async InitializeGraphs() {
		let host;
		if (this.link.ip && this.link.ip.v.length > 0) {
			host = this.link.ip.v.split(";")[0];
		}
		else if (this.link.hostname && this.link.hostname.v.length > 0) {
			host = this.link.hostname.v.split(";")[0];
		}

		let [pingArray, cpuArray, memoryArray, diskSpaceArray, diskIoArray, printCounterArray] = await Promise.all([
			(async ()=> {
				const response = await fetch(`lifeline/ping/view?host=${host}`);
				const buffer = await response.arrayBuffer();
				return new Uint8Array(buffer);
			})(),

			(async ()=> {
				const response = await fetch(`lifeline/cpu/view?file=${this.args.file}`);
				const buffer = await response.arrayBuffer();
				return new Uint8Array(buffer);
			})(),

			(async ()=> {
				const response = await fetch(`lifeline/memory/view?file=${this.args.file}`);
				const buffer = await response.arrayBuffer();
				return new Uint8Array(buffer);
			})(),

			(async ()=> {
				const response = await fetch(`lifeline/disk/view?file=${this.args.file}`);
				const buffer = await response.arrayBuffer();
				return new Uint8Array(buffer);
			})(),

			(async ()=> {
				const response = await fetch(`lifeline/diskio/view?file=${this.args.file}`);
				const buffer = await response.arrayBuffer();
				return new Uint8Array(buffer);
			})(),

			(async ()=> {
				if (this.link.type && DeviceView.PRINTER_TYPES.includes(this.link.type.v.toLowerCase())) {
					const response = await fetch(`lifeline/printcount/view?file=${this.args.file}`);
					const buffer = await response.arrayBuffer();
					return new Uint8Array(buffer);
				}
				else {
					return new Uint8Array([]);
				}
			})()
		]);

		const firstInstantBuffer = new Uint8Array(pingArray.slice(0, 8)).buffer;
		let firstDateInstant = 0;
		if (firstInstantBuffer.byteLength >= 8) {
			firstDateInstant = Number(new DataView(firstInstantBuffer).getBigInt64(0, true));
		}

		if (firstDateInstant > Date.now() - DeviceView.DAY_TICKS * 28) {
			let oYear = new Date().getFullYear();
			let oMonth = new Date().getMonth() - 1;

			if (oMonth === -1) {
				oYear--;
				oMonth = 11;
			}

			oMonth = (oMonth+1).toString().padStart(2,0);

			const [oldPingArray, oldCpuArray, oldMemoryArray, oldDiskSpaceArray, oldDiskIoArray, oldPrintCounterArray] = await Promise.all([
				(async ()=> {
					const response = await fetch(`lifeline/ping/view?host=${host}&date=${oYear}${oMonth}`);
					const buffer = await response.arrayBuffer();
					return new Uint8Array(buffer);
				})(),

				(async ()=> {
					const response = await fetch(`lifeline/cpu/view?file=${this.args.file}&date=${oYear}${oMonth}`);
					const buffer = await response.arrayBuffer();
					return new Uint8Array(buffer);
				})(),

				(async ()=> {
					const response = await fetch(`lifeline/memory/view?file=${this.args.file}&date=${oYear}${oMonth}`);
					const buffer = await response.arrayBuffer();
					return new Uint8Array(buffer);
				})(),

				(async ()=> {
					const response = await fetch(`lifeline/disk/view?file=${this.args.file}&date=${oYear}${oMonth}`);
					const buffer = await response.arrayBuffer();
					return new Uint8Array(buffer);
				})(),

				(async ()=> {
					const response = await fetch(`lifeline/diskio/view?file=${this.args.file}&date=${oYear}${oMonth}`);
					const buffer = await response.arrayBuffer();
					return new Uint8Array(buffer);
				})(),

				(async ()=> {
					if (this.link.type && DeviceView.PRINTER_TYPES.includes(this.link.type.v.toLowerCase())) {
						const response = await fetch(`lifeline/printcount/view?file=${this.args.file}&date=${oYear}${oMonth}`);
						const buffer = await response.arrayBuffer();
						return new Uint8Array(buffer);
					}
					else {
						return new Uint8Array([]);
					}
				})()
			]);

			if (oldPingArray.length > 0) pingArray = [...oldPingArray, ...pingArray];
			if (oldCpuArray.length > 0) cpuArray = [...oldCpuArray, ...cpuArray];
			if (oldMemoryArray.length > 0) memoryArray = [...oldMemoryArray, ...memoryArray];
			if (oldDiskSpaceArray.length > 0) diskSpaceArray = [...oldDiskSpaceArray, ...diskSpaceArray];
			if (oldDiskIoArray.length > 0) diskIoArray = [...oldDiskIoArray, ...diskIoArray];
			if (oldPrintCounterArray.length > 0) printCounterArray = [...oldPrintCounterArray, ...printCounterArray];
		}

		const DAY_WIDTH = 64;
		const GRAPH_WIDTH = DAY_WIDTH * 32;
		let xOffset = 0;
		let graphSvgs = [];

		const GenerateTimeline = ()=> {
			const graphBox = document.createElement("div");
			graphBox.className = "view-lifeline-graph";
			graphBox.style.height = `${28}px`;
			this.liveD.appendChild(graphBox);

			const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
			svg.style.transition = ".2s";
			svg.setAttribute("width", GRAPH_WIDTH + DAY_WIDTH);
			svg.setAttribute("height", `${28}px`);
			graphBox.appendChild(svg);

			graphSvgs.push(svg);

			const today = new Date(Date.now() - Date.now() % DeviceView.DAY_TICKS);

			for (let i=0; i<32; i++) {
				let x = GRAPH_WIDTH - i*DAY_WIDTH;

				const timeLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
				timeLabel.textContent = new Date(today.getTime() - i*DeviceView.DAY_TICKS).toLocaleDateString(UI.regionalFormat, {month:"short", day:"numeric"});
				timeLabel.setAttribute("x", x);
				timeLabel.setAttribute("y", 16);
				timeLabel.setAttribute("fill", "var(--clr-light)");
				timeLabel.setAttribute("text-anchor", "middle");
				timeLabel.setAttribute("font-size", "10px");
				svg.appendChild(timeLabel);

				const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
				dot.setAttribute("cx", x);
				dot.setAttribute("cy", 24);
				dot.setAttribute("r", 1);
				dot.setAttribute("fill", "var(--clr-light)");
				svg.appendChild(dot);

				const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
				line.setAttribute("x1", x);
				line.setAttribute("y1", 24);
				line.setAttribute("x2", x);
				line.setAttribute("y2", 44);
				line.setAttribute("stroke", "color-mix(in hsl, var(--clr-light) 25%, transparent)");
				svg.appendChild(line);
			}
		};

		const GenerateGraph = (data, label, type, icon, opt={})=> {
			const height = 64;

			const graphBox = document.createElement("div");
			graphBox.className = "view-lifeline-graph";
			graphBox.style.height = `${height + 28}px`;
			this.liveD.appendChild(graphBox);

			const labelBox = document.createElement("div");
			labelBox.className = "view-lifeline-label";
			labelBox.textContent = label.toUpperCase();
			graphBox.appendChild(labelBox);

			const iconBox = document.createElement("div");
			iconBox.className = "view-lifeline-icon";
			iconBox.style.backgroundImage = `url(${icon}?light)`;
			graphBox.appendChild(iconBox);

			const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
			svg.style.transition = ".2s";
			svg.setAttribute("width", GRAPH_WIDTH + DAY_WIDTH);
			svg.setAttribute("height", `${height + 28}px`);
			graphBox.appendChild(svg);

			graphSvgs.push(svg);

			const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
			svg.appendChild(defs);

			const gradient = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
			gradient.setAttribute("id", "view-graph-gradient");
			gradient.setAttribute("x1", "0%");
			gradient.setAttribute("x2", "0%");
			gradient.setAttribute("y1", "0%");
			gradient.setAttribute("y2", "100%");
			defs.appendChild(gradient);

			const gradientStop1 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
			gradientStop1.setAttribute("stop-color", "rgba(192,192,192,0)");
			gradientStop1.setAttribute("offset", "0%");

			const gradientStop2 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
			gradientStop2.setAttribute("stop-color", "rgba(192,192,192,.3)");
			gradientStop2.setAttribute("offset", "100%");

			gradient.append(gradientStop1, gradientStop2);

			const dayHighlight = document.createElementNS("http://www.w3.org/2000/svg", "rect");
			dayHighlight.style.transition = ".15s";
			dayHighlight.setAttribute("x", 0);
			dayHighlight.setAttribute("y", 5);
			dayHighlight.setAttribute("width", DAY_WIDTH);
			dayHighlight.setAttribute("height", height);
			dayHighlight.setAttribute("fill", "url(#view-graph-gradient)");
			svg.appendChild(dayHighlight);

			const line = document.createElementNS("http://www.w3.org/2000/svg", "rect");
			line.setAttribute("x", 0);
			line.setAttribute("y", height + 5);
			line.setAttribute("width", GRAPH_WIDTH + DAY_WIDTH);
			line.setAttribute("height", 1);
			line.setAttribute("fill", "color-mix(in hsl, var(--clr-light) 25%, transparent)");
			svg.appendChild(line);

			const today = new Date(Date.now() - Date.now() % DeviceView.DAY_TICKS);

			for (let i=0; i<32; i++) {
				let x = GRAPH_WIDTH - i * DAY_WIDTH;
				const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
				line.setAttribute("x1", x);
				line.setAttribute("y1", 0);
				line.setAttribute("x2", x);
				line.setAttribute("y2", height + 32);
				line.setAttribute("stroke", "color-mix(in hsl, var(--clr-light) 25%, transparent)");
				svg.appendChild(line);
			}

			const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
			path.setAttribute("fill", "rgba(192,192,192,.3)");
			svg.appendChild(path);

			let d = `M ${GRAPH_WIDTH - (today.getTime() - data[0].d) / DeviceView.DAY_TICKS * DAY_WIDTH} ${height + 5} `;

			let lastX = -8, lastY = -8;

			if (type === "ping") {
				for (let i=0; i<data.length; i++) {
					let x = GRAPH_WIDTH - Math.round((today.getTime() - data[i].d) / DeviceView.DAY_TICKS * DAY_WIDTH);
					let y = 3 + Math.round(data[i].v < 0 ? height : 24 + Math.min((height - 24) * data[i].v / 1000, height - 10));
					d += `L ${x} ${y} `;

					if (x - lastX < 8 && Math.abs(lastY - y) <= 4) continue;

					const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
					dot.setAttribute("cx", x);
					dot.setAttribute("cy", y);
					dot.setAttribute("r", 3);
					dot.setAttribute("fill", this.RttToColor(data[i].v));
					svg.appendChild(dot);

					if (x < -DAY_WIDTH) continue;
					lastX = x, lastY = y;
				}
			}
			else if (type === "line") {
				for (let i=0; i<data.length; i++) {
					let x = GRAPH_WIDTH - Math.round((today.getTime() - data[i].d) / DeviceView.DAY_TICKS * DAY_WIDTH);
					let y = 3 + Math.round(data[i].v < 0 ? height : Math.min(data[i].v / 10, height - 10));
					d += `L ${x} ${y} `;

					if (x - lastX < 8 && Math.abs(lastY - y) <= 4) continue;

					const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
					dot.setAttribute("cx", x);
					dot.setAttribute("cy", y);
					dot.setAttribute("r", 3);
					dot.setAttribute("fill", "var(--clr-dark)");
					svg.appendChild(dot);

					if (x < -DAY_WIDTH) continue;
					lastX = x, lastY = y;
				}
			}
			else if (type === "vol") {
				for (let i=0; i<data.length; i++) {
					if (data[i].t === 0) continue;
					let x = GRAPH_WIDTH - Math.round((today.getTime() - data[i].d) / DeviceView.DAY_TICKS * DAY_WIDTH);
					let y = (height + 4) - Math.round(height * data[i].v / data[i].t);

					d += `L ${x} ${y} `;

					if (x - lastX < 8 && Math.abs(lastY - y) <= 4) continue;

					const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
					dot.setAttribute("cx", x);
					dot.setAttribute("cy", y);
					dot.setAttribute("r", 3);
					dot.setAttribute("fill", this.VolumeToColor(data[i].v, data[i].t));
					svg.appendChild(dot);

					if (x < -DAY_WIDTH) continue;
					lastX = x, lastY = y;
				}
			}
			else if (type === "percent") {
				for (let i=0; i<data.length; i++) {
					let x = GRAPH_WIDTH - Math.round((today.getTime() - data[i].d) / DeviceView.DAY_TICKS * DAY_WIDTH);
					let y = (height + 4) - Math.round(height * data[i].v / 100);

					d += `L ${x} ${y} `;

					if (x - lastX < 8 && Math.abs(lastY - y) <= 4) continue;

					const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
					dot.setAttribute("cx", x);
					dot.setAttribute("cy", y);
					dot.setAttribute("r", 3);
					dot.setAttribute("fill", this.PercentToColor(data[i].v, 100));
					svg.appendChild(dot);

					if (x < -DAY_WIDTH) continue;
					lastX = x, lastY = y;
				}
			}
			else if (type === "delta") {
				if (data.length > 0) {
					data[0].delta = 0;
				}

				let max = 50;
				for (let i=1; i<data.length; i++) {
					let delta = data[i].v - data[i - 1].v;
					data[i].delta = Math.max(delta, 0);
					if (delta > max) max = delta;
				}

				for (let i=1; i<data.length; i++) {
					let x = GRAPH_WIDTH - Math.round((today.getTime() - data[i].d) / DeviceView.DAY_TICKS * DAY_WIDTH);
					let y = (height + 4) - Math.round(height * data[i].delta / max);

					d += `L ${x} ${y} `;

					if (x - lastX < 8 && Math.abs(lastY - y) <= 4) continue;

					const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
					dot.setAttribute("cx", x);
					dot.setAttribute("cy", y);
					dot.setAttribute("r", 3);
					dot.setAttribute("fill", "hsl(92,66%,50%)");
					svg.appendChild(dot);

					if (x < -DAY_WIDTH) continue;
					lastX = x, lastY = y;
				}
			}

			d += `L ${GRAPH_WIDTH - (today.getTime() - data[data.length - 1].d) / DeviceView.DAY_TICKS * DAY_WIDTH} ${height + 5} Z`;
			path.setAttribute("d", d);

			const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
			circle.setAttribute("cx", 0);
			circle.setAttribute("cy", height + 5);
			circle.setAttribute("r", 3.5);
			circle.setAttribute("stroke", "#fff");
			circle.setAttribute("stroke-width", 2);
			circle.setAttribute("fill", "none");
			circle.style.opacity = "0";
			circle.style.transition = ".2s cx, .2s cy, .1s opacity";
			svg.appendChild(circle);

			const valueLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
			valueLabel.setAttribute("x", 0);
			valueLabel.setAttribute("y", 0);
			valueLabel.setAttribute("fill", "#fff");
			valueLabel.setAttribute("text-anchor", "end");
			valueLabel.style.fontSize = "12px";
			valueLabel.style.fontWeight = "700";
			svg.appendChild(valueLabel);

			const currentTimeLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
			currentTimeLabel.setAttribute("x", 0);
			currentTimeLabel.setAttribute("y", 0);
			currentTimeLabel.setAttribute("fill", "#fff");
			currentTimeLabel.setAttribute("text-anchor", "middle");
			currentTimeLabel.style.fontSize = "10px";
			svg.appendChild(currentTimeLabel);

			const timeLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
			timeLine.setAttribute("x1", 0);
			timeLine.setAttribute("y1", 0);
			timeLine.setAttribute("x2", 0);
			timeLine.setAttribute("y2", height + 5);
			timeLine.setAttribute("stroke", "#fff");
			timeLine.setAttribute("stroke-width", 1);
			timeLine.style.transition = ".2s";
			svg.appendChild(timeLine);

			const timeDot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
			timeDot.setAttribute("r", 2);
			timeDot.setAttribute("fill", "#fff");
			timeDot.style.opacity = "0";
			timeDot.style.transition = ".2s cx, .2s cy, .1s opacity";
			svg.appendChild(timeDot);

			graphBox.onmouseenter = ()=>{
				circle.style.opacity = "1";
				valueLabel.style.opacity = "1";
				currentTimeLabel.style.opacity = "1";
				timeLine.style.opacity = "1";
				timeDot.style.opacity = "1";
				dayHighlight.style.opacity = "1";
			};

			graphBox.onmouseleave = ()=>{
				circle.style.opacity = "0";
				valueLabel.style.opacity = "0";
				currentTimeLabel.style.opacity = "0";
				timeLine.style.opacity = "0";
				timeDot.style.opacity = "0";
				dayHighlight.style.opacity = "0";
			};

			graphBox.onmousemove = event=>{
				let closestX = GRAPH_WIDTH - Math.round((today.getTime() - data[0].d) / DeviceView.DAY_TICKS * DAY_WIDTH);
				let closestIndex = 0;
				for (let i=0; i<data.length; i++) {
					let currentX = GRAPH_WIDTH - Math.round((today.getTime() - data[i].d) / DeviceView.DAY_TICKS * DAY_WIDTH);
					if (Math.abs(currentX - event.offsetX) < Math.abs(closestX - event.offsetX)) {
						closestX = currentX;
						closestIndex = i;
					}
				}

				let cx, cy;
				cx = closestX;

				dayHighlight.setAttribute("x", cx - cx % DAY_WIDTH);

				if (type === "ping") {
					valueLabel.textContent = data[closestIndex].v < 0 ? "Timed out" : `${data[closestIndex].v} ms`;
					cy = 3 + Math.round(data[closestIndex].v < 0 ? height : 24 + Math.min((height - 24) * data[closestIndex].v / 1000, height - 10))
				}
				else if (type === "line") {
					valueLabel.textContent = data[closestIndex].v;
					cy = 3 + Math.round(data[closestIndex].v < 0 ? height : Math.min(data[closestIndex].v / 10, height - 10));
				}
				else if (type === "vol") {
					let percent = data[closestIndex].t > 0? Math.round(1000 * data[closestIndex].v / data[closestIndex].t) / 10 : 0;
					valueLabel.textContent = `${UI.SizeToGB(data[closestIndex].v)} / ${UI.SizeToGB(data[closestIndex].t)} GB (${percent}%)`;
					cy = height + 4 - Math.round(height * data[closestIndex].v / data[closestIndex].t);
				}
				else if (type === "percent") {
					valueLabel.textContent = `${data[closestIndex].v}%`;
					cy = height + 4 - Math.round(height * data[closestIndex].v / 100);
				}
				else if (type === "delta") {
					let max = Math.max(...data.map(d=>d.delta), 50);
					valueLabel.textContent = data[closestIndex].delta;
					cy = height + 4 - Math.round(height * data[closestIndex].delta / max);
				}

				circle.setAttribute("cx", cx);
				circle.setAttribute("cy", Math.max(cy, 4.5));

				valueLabel.style.transform = `translate(${cx - 8}px,${Math.max(cy - 4, 10)}px)`;
				currentTimeLabel.style.transform = `translate(${cx}px,${height + 20}px)`;

				timeLine.setAttribute("y1", cy + 4);
				timeLine.setAttribute("y2", height + 6);
				timeLine.style.transform = `translateX(${cx}px)`;

				timeDot.setAttribute("cx", cx);
				timeDot.setAttribute("cy", height + 6);
				timeDot.setAttribute("fill", cy < height - 4 ? "#fff" : "transparent");

				const time = new Date(data[closestIndex].d);
				const timeString = time.toLocaleTimeString(UI.regionalFormat, {hour12:false, hour:"2-digit", minute:"2-digit"});
				currentTimeLabel.textContent = timeString;
			};

			return svg;
		};

		this.liveD.onwheel = event=>{
			xOffset += event.deltaY > 0 ? DAY_WIDTH : -DAY_WIDTH;

			if (xOffset < 0) {
				xOffset = 0;
			}
			else if (xOffset > GRAPH_WIDTH - 800) {
				xOffset = GRAPH_WIDTH - 800;
			}
			else {
				event.preventDefault();
			}

			for (let i=0; i<graphSvgs.length; i++) {
				graphSvgs[i].style.transform = `translateX(${xOffset}px)`;
			}
		};

		if (pingArray.length > 0 || cpuArray.length > 0 || memoryArray.length > 0 || diskSpaceArray.length > 0 || diskIoArray.length > 0) {
			GenerateTimeline();
		}

		if (pingArray.length > 0) {
			let data = [];
			for (let i=0; i<pingArray.length-9; i+=10) {
				const dateBuffer = new Uint8Array(pingArray.slice(i, i+8)).buffer;
				const date = Number(new DataView(dateBuffer).getBigInt64(0, true));

				let rtt = (pingArray[i+9] << 8) | pingArray[i+8];
				if (rtt >= 32768) { //negative number
					rtt = -(65536 - rtt);
				}

				data.push({d:date, v:rtt});
			}

			GenerateGraph(data, "Roundtrip time", "ping", "mono/ping.svg");
		}

		if (cpuArray.length > 0) {
			let data = [];
			for (let i=0; i<cpuArray.length-8; i+=9) {
				const dateBuffer = new Uint8Array(cpuArray.slice(i, i+8)).buffer;
				const date = Number(new DataView(dateBuffer).getBigInt64(0, true));
				const usage = cpuArray[i+8];
				data.push({d:date, v:usage});
			}

			GenerateGraph(data, "CPU usage", "percent", "mono/cpu.svg");
		}

		if (memoryArray.length > 0) {
			let data = [];
			for (let i=0; i<memoryArray.length-23; i+=24) {
				const dateBuffer = new Uint8Array(memoryArray.slice(i, i+8)).buffer;
				const date = Number(new DataView(dateBuffer).getBigInt64(0, true));

				const usedBuffer = new Uint8Array(memoryArray.slice(i+8, i+16)).buffer;
				const used = Number(new DataView(usedBuffer).getBigInt64(0, true));

				const totalBuffer = new Uint8Array(memoryArray.slice(i+16, i+24)).buffer;
				const total = Number(new DataView(totalBuffer).getBigInt64(0, true));

				data.push({d:date, v:used*1024, t:total*1024});
			}

			GenerateGraph(data, "Memory", "vol", "mono/ram.svg");
		}

		if (diskSpaceArray.length > 0) {
			const data = new Map();
			let index = 0;
			while (index < diskSpaceArray.length) {
				const dateBuffer = new Uint8Array(diskSpaceArray.slice(index, index+8)).buffer;
				const date = Number(new DataView(dateBuffer).getBigInt64(0, true));

				const count = (diskSpaceArray[index+9] << 8) | diskSpaceArray[index+8]; // | (diskSpaceArray[index+11] << 24) | (diskSpaceArray[index+10] << 16)

				index += 12;

				for (let j=0; j<count; j++) {
					const caption = String.fromCharCode(diskSpaceArray[index + j*17]);

					const usedBuffer = new Uint8Array(diskSpaceArray.slice(index + j*17+1, index + j*17+9)).buffer;
					const used = Number(new DataView(usedBuffer).getBigInt64(0, true));

					const totalBuffer = new Uint8Array(diskSpaceArray.slice(index + j*17+9, index + j*17+17)).buffer;
					const total = Number(new DataView(totalBuffer).getBigInt64(0, true));

					if (!data.has(caption)) { data.set(caption, []); }

					data.get(caption).push({d:date, v:used, t:total, c:caption});
				}
				index += 17 * count;
			}

			data.forEach ((value, key)=> GenerateGraph(value, `Disk space (${key})`, "vol", "mono/hdd.svg"));
		}

		if (diskIoArray.length > 0) {
			let data = [];
			for (let i=0; i<diskIoArray.length-8; i+=9) {
				const dateBuffer = new Uint8Array(diskIoArray.slice(i, i+8)).buffer;
				const date = Number(new DataView(dateBuffer).getBigInt64(0, true));
				const io = diskIoArray[i+8];
				data.push({d:date, v:io});
			}

			GenerateGraph(data, "Disk I/O", "percent", "mono/hdd.svg");
		}

		if (printCounterArray.length > 0) {
			let data = [];
			for (let i=0; i<printCounterArray.length-11; i+=12) {
				const dateBuffer = new Uint8Array(printCounterArray.slice(i, i+8)).buffer;
				const date = Number(new DataView(dateBuffer).getBigInt64(0, true));

				const counterBuffer = new Uint8Array(printCounterArray.slice(i+8, i+12)).buffer;
				const counter = Number(new DataView(counterBuffer).getUint32(0, true));
				data.push({d:date, v:counter});
			}

			GenerateGraph(data, "Print counter", "delta", "mono/printer.svg");
		}
	}

	RttToColor(rtt) {
		if (rtt < 0) { //unreachable/timed out
			return "var(--clr-error)";
		}
		else { //alive
			return UI.PingColor(rtt);
		}
	}

	VolumeToColor(value, total) {
		let p = value / total;
		if (p > .98) return "var(--clr-critical)";
		if (p > .9) return "var(--clr-error)";
		if (p > .85) return "var(--clr-orange)";
		if (p > .8) return "var(--clr-warning)";
		return "hsl(92,66%,50%)";
	}

	PercentToColor(value, total) {
		let p = value / total;
		if (p > .98) return "var(--clr-critical)";
		if (p > .9) return "var(--clr-error)";
		if (p > .75) return "var(--clr-orange)";
		if (p > .6) return "var(--clr-warning)";
		return "hsl(92,66%,50%)";
	}

	Edit(isNew=false) { //overrides
		const fetchButton = document.createElement("button");
		if (isNew && !this.args.copy) {
			fetchButton.className = "view-fetch-floating-button";
			fetchButton.setAttribute("tip-below", "Fetch");
			this.content.appendChild(fetchButton);

			fetchButton.onclick = ()=> {
				const dialog = this.DialogBox("108px");
				if (dialog === null) return;

				dialog.innerBox.parentElement.style.maxWidth = "400px";
				dialog.innerBox.style.textAlign = "center";

				const fetchHostInput = document.createElement("input");
				fetchHostInput.type = "text";
				fetchHostInput.placeholder = "ip or hostname";
				fetchHostInput.style.marginTop = "20px";
				fetchHostInput.style.width = "min(calc(100% - 8px), 200px)";
				dialog.innerBox.appendChild(fetchHostInput);

				fetchHostInput.focus();

				dialog.okButton.onclick = ()=> {
					if (fetchHostInput.value.length === 0) return;
					dialog.cancelButton.onclick();
					setTimeout(()=>this.Fetch(true, fetchHostInput.value), 250);
				};

				fetchHostInput.onkeydown = event=> {
					if (event.key === "Enter") {
						dialog.okButton.click();
					}
				};
			};
		}

		const saveButton = super.Edit(isNew);

		saveButton.addEventListener("click", async ()=> {
			let obj = {};
			for (let i=0; i<this.attributes.childNodes.length; i++) {
				if (this.attributes.childNodes[i].childNodes.length < 2) continue;
				let name = this.attributes.childNodes[i].childNodes[0].value.toLowerCase();
				let value = this.attributes.childNodes[i].childNodes[1].firstChild.value;
				obj[name] = {v:value};
			}

			try {
				const response = await fetch(this.args.file ? `db/device/save?file=${this.args.file}` : "db/device/save", {
					method: "POST",
					body: JSON.stringify(obj)
				});

				if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

				const origin = KEEP.username;
				const date = UI.UnixDateToTicks(new Date().getTime());

				for (let key in obj) {
					if (!isNew && key in this.link && this.link[key].v === obj[key].v) {
						obj[key].o = this.link[key].o;
						obj[key].d = this.link[key].d;
					}
					else {
						obj[key].o = origin;
						obj[key].d = date;
					}
				}

				const json = await response.json();
				if (json.error) throw(json.error);

				this.args.file = json.filename;
				this.link = obj;
				LOADER.devices.data[json.filename] = obj;

				this.InitializePreview();
				this.InitializeSubnetEmblem();
			}
			catch (ex) {
				this.ConfirmBox(ex, true, "mono/error.svg").addEventListener("click", ()=>{
					this.Close();
				});
			}
			finally {
				if (isNew && fetchButton.parentElement) this.content.removeChild(fetchButton);
			}
		});
	}

	async DeviceConfiguration() {
		const dialog = this.DialogBox("calc(100% - 40px)");
		if (dialog === null) return;

		const {okButton, cancelButton, buttonBox, innerBox} = dialog;

		okButton.value = "Close";

		buttonBox.style.maxHeight = "40px";
		buttonBox.style.overflow = "hidden";

		buttonBox.removeChild(cancelButton);

		const fetchButton = document.createElement("input");
		fetchButton.type = "button";
		fetchButton.value = "Fetch";
		fetchButton.className = "with-icon";
		fetchButton.style.backgroundImage = "url(mono/ball.svg?light)";
		fetchButton.style.float = "left";
		buttonBox.appendChild(fetchButton);

		const editButton = document.createElement("input");
		editButton.type = "button";
		editButton.value = "Edit";
		editButton.className = "with-icon";
		editButton.style.backgroundImage = "url(mono/edit.svg?light)";
		editButton.style.float = "left";
		buttonBox.appendChild(editButton);

		innerBox.classList.add("view-config-code-box");
		innerBox.style.margin = "8px";

		innerBox.parentElement.style.maxWidth = "unset";
		innerBox.parentElement.style.left = "40px";
		innerBox.parentElement.style.right = "40px";
		innerBox.style.padding = "20px";

		innerBox.parentElement.style.backgroundColor = "#202020";

		let hasCredentials = this.link.username && this.link.password;
		if (!hasCredentials) {
			hasCredentials = "ssh username" in this.link && "ssh password" in this.link;
		}

		const fetchBox = document.createElement("div");
		fetchBox.style.position = "absolute";
		fetchBox.style.visibility = "hidden";
		fetchBox.style.left = "30%";
		fetchBox.style.top = "28px";
		fetchBox.style.width = "40%";
		fetchBox.style.maxWidth = "400px";
		fetchBox.style.minWidth = "220px";
		fetchBox.style.borderRadius = "8px";
		fetchBox.style.boxShadow = "rgba(0,0,0,.4) 0 0 8px";
		fetchBox.style.backgroundColor = "var(--clr-pane)";
		fetchBox.style.padding = "16px 8px";
		fetchBox.style.overflow = "hidden";
		fetchBox.style.textAlign = "center";
		dialog.innerBox.parentElement.parentElement.appendChild(fetchBox);

		const fetchUsernameLabel = document.createElement("div");
		fetchUsernameLabel.style.display = "inline-block";
		fetchUsernameLabel.style.minWidth = "96px";
		fetchUsernameLabel.textContent = "Username:";

		const fetchUsernameInput = document.createElement("input");
		fetchUsernameInput.type = "text";

		const fetchPasswordLabel = document.createElement("div");
		fetchPasswordLabel.style.display = "inline-block";
		fetchPasswordLabel.style.minWidth = "96px";
		fetchPasswordLabel.textContent = "Password:";

		const fetchPasswordInput = document.createElement("input");
		fetchPasswordInput.type = "password";

		const fetchOkButton = document.createElement("input");
		fetchOkButton.type = "button";
		fetchOkButton.value = "Fetch";

		const fetchCancelButton = document.createElement("input");
		fetchCancelButton.type = "button";
		fetchCancelButton.value = "Cancel";

		if (hasCredentials) {
			const messageLabel = document.createElement("div");
			messageLabel.style.display = "inline-block";
			messageLabel.textContent = "Are you sure you want to fetch data from this device using SSH?";
			fetchBox.appendChild(messageLabel);
		}
		else {
			fetchBox.appendChild(fetchUsernameLabel);
			fetchBox.appendChild(fetchUsernameInput);
			fetchBox.appendChild(document.createElement("br"));
			fetchBox.appendChild(fetchPasswordLabel);
			fetchBox.appendChild(fetchPasswordInput);
		}

		fetchBox.appendChild(document.createElement("br"));
		fetchBox.appendChild(document.createElement("br"));
		fetchBox.appendChild(fetchOkButton);
		fetchBox.appendChild(fetchCancelButton);


		const DisplayScript = lines=> {
			innerBox.textContent = "";
			for (let i=0; i<lines.length; i++) {
				lines[i] = lines[i].replaceAll("\\\"", "\\&quot;");

				const lineElement = document.createElement("div");

				if (lines[i].startsWith("#") || lines[i].startsWith("!")) { //comment
					lineElement.textContent = lines[i];
					lineElement.style.color = "#9C6";
					lineElement.style.fontStyle = "italic";
					innerBox.appendChild(lineElement);
				}
				else if (lines[i].startsWith("/")) { //location
					lineElement.textContent = lines[i];
					lineElement.style.color = "#8FD";
					lineElement.style.paddingTop = ".5em";
					innerBox.appendChild(lineElement);
				}
				else {
					const line = [];

					let temp = lines[i].split("\"");
					for (let j=0; j<temp.length; j++) {
						if (j % 2 === 0) {
							line.push(temp[j]);
						}
						else {
							line.push(`\"${temp[j]}\"`);
						}
					}

					for (let j=0; j<line.length; j++) {
						if (line[j].length === 0) continue;

						if (line[j].startsWith("\"") && line[j].length > 2) { //quot
							const newSpan = document.createElement("span");
							newSpan.textContent = line[j];
							newSpan.style.color = "#D98";
							lineElement.appendChild(newSpan);
						}
						else {
							let p = 0;

							/*if (j == 0) { //verb
								while (line[0].substring(0, p).trim().length === 0 && p < line[0].length) {p++; }
								p = line[0].indexOf(" ", p);

								const span = document.createElement("span");
								span.textContent = line[0].substring(0, p);
								span.style.color = "#A8F";
								lineElement.appendChild(span);
							}*/

							while (p < line[j].length) {
								let ep = line[j].indexOf("=", p); //equal position
								if (ep < 0) break;

								let sp = line[j].lastIndexOf(" ", ep); //space position
								if (sp < 0) break;

								if (p != sp) {
									const spanA = document.createElement("span");
									spanA.textContent = j == 0 ? line[j].substring(p, sp): line[j].substring(p, sp);
									lineElement.appendChild(spanA);
								}

								const spanB = document.createElement("span");
								spanB.textContent = j == 0 ? line[j].substring(sp, ep + 1) : line[j].substring(sp, ep + 1);
								spanB.style.color = "#5BE";
								lineElement.appendChild(spanB);

								p = ep + 1;
							}

							if (p < line[j].length) {
								const spanC = document.createElement("span");
								spanC.textContent = j == 0 ? line[j].substring(p): line[j].substring(p);
								lineElement.appendChild(spanC);
							}
						}
					}

					innerBox.appendChild(lineElement);
				}
			}
		};

		let fetchToggle = false;
		const FetchToggle = ()=> {
			dialog.innerBox.parentElement.style.transition = ".2s";
			dialog.innerBox.parentElement.style.transform = fetchToggle ? "none" : "translateY(-25%)";
			dialog.innerBox.parentElement.style.filter = fetchToggle ? "none" : "opacity(0)";
			dialog.innerBox.parentElement.style.visibility = fetchToggle ? "visible" : "hidden";

			fetchBox.style.transition = ".2s";
			fetchBox.style.filter = fetchToggle ? "opacity(0)" : "none";
			fetchBox.style.transform = fetchToggle ? "translateY(-25%)" : "none";
			fetchBox.style.visibility = fetchToggle ? "hidden" : "visible";

			fetchToggle = !fetchToggle;
		};

		const response = await fetch(`db/config/view?file=${this.args.file}`);
		if (response.status !== 200) LOADER.HttpErrorHandler(response.status);
		const text = await response.text();

		if (text.length > 0) {
			DisplayScript(text.split("\n"));
		}


		fetchButton.onclick = ()=> FetchToggle();

		fetchOkButton.onclick = async ()=> {
			fetchBox.style.filter = "opacity(0)";
			fetchBox.style.transform = "translateY(-25%)";
			fetchBox.style.visibility = "hidden";

			const spinner = document.createElement("div");
			spinner.className = "spinner";
			spinner.style.textAlign = "left";
			spinner.style.marginTop = "32px";
			spinner.style.marginBottom = "16px";
			spinner.appendChild(document.createElement("div"));
			dialog.innerBox.parentElement.parentElement.appendChild(spinner);

			const status = document.createElement("div");
			status.textContent = "Fetching...";
			status.style.color = "var(--clr-light)";
			status.style.textAlign = "center";
			status.style.fontWeight = "bold";
			status.style.animation = "delayed-fade-in 1.5s ease-in 1";
			dialog.innerBox.parentElement.parentElement.appendChild(status);

			try {
				const response = await fetch(`db/config/fetch?file=${this.args.file}`, {
					method: "POST",
					body: hasCredentials ? "" : `${fetchUsernameInput.value}${String.fromCharCode(127)}${fetchPasswordInput.value}`
				});

				if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

				const text = await response.text();
				DisplayScript(text.split("\n"));

			}
			catch {
				dialog.innerBox.textContent = "";
			}
			finally {
				dialog.innerBox.parentElement.parentElement.removeChild(spinner);
				dialog.innerBox.parentElement.parentElement.removeChild(status);

				dialog.innerBox.parentElement.style.transition = ".2s";
				dialog.innerBox.parentElement.style.transform = "none";
				dialog.innerBox.parentElement.style.filter = "none";
				dialog.innerBox.parentElement.style.visibility = "visible";
			}

		};

		fetchCancelButton.onclick = ()=>  fetchButton.onclick();

		editButton.onclick = ()=> {
			innerBox.contentEditable = true;

			const saveButton = document.createElement("input");
			saveButton.type = "button";
			saveButton.value = "Save";

			buttonBox.removeChild(editButton);
			buttonBox.removeChild(okButton);

			buttonBox.appendChild(saveButton);
			buttonBox.appendChild(cancelButton);

			saveButton.onclick = async ()=>{
				const saveResponse = await fetch(`db/config/save?file=${this.args.file}`, {
					method: "POST",
					body: innerBox.innerText
				});

				if (saveResponse.status !== 200) LOADER.HttpErrorHandler(saveResponse.status);
				const saveJson = await saveResponse.json();

				if (saveJson.error) {
					cancelButton.onclick();
					this.ConfirmBox(saveJson.error, true);
				}
				else {
					innerBox.contentEditable = false;
					buttonBox.appendChild(editButton);
					buttonBox.appendChild(okButton);
					buttonBox.removeChild(saveButton);
					buttonBox.removeChild(cancelButton);

					DisplayScript(innerBox.innerText.split("\n"));
				}
			};
		};

		okButton.onclick = ()=> {
			innerBox.textContent = "";
			dialog.Close();
		};
	}

	EditInterfaces() {
		const dialog = this.DialogBox("calc(100% - 40px)");
		if (dialog === null) return;

		const {okButton, innerBox, buttonBox} = dialog;

		innerBox.parentElement.style.maxWidth = "1110px";
		innerBox.parentElement.style.left = "40px";
		innerBox.parentElement.style.right = "40px";
		innerBox.style.padding = "20px";

		buttonBox.style.maxHeight = "40px";
		//buttonBox.style.overflow = "hidden";

		const fetchDropdownButton = document.createElement("button");
		fetchDropdownButton.className = "with-icon view-fetch-dropdown";
		fetchDropdownButton.value = "Add interfaces";
		buttonBox.insertBefore(fetchDropdownButton, buttonBox.firstChild);

		const fetchDropdownButtonMenu = document.createElement("div");
		fetchDropdownButton.appendChild(fetchDropdownButtonMenu);

		const addBulkButton = document.createElement("input");
		addBulkButton.type = "button";
		addBulkButton.value = "Bulk";
		addBulkButton.className = "with-icon";
		addBulkButton.style.backgroundImage = "url(mono/add.svg?light)";
		fetchDropdownButtonMenu.appendChild(addBulkButton);

		const snmpButton = document.createElement("input");
		snmpButton.type = "button";
		snmpButton.value = "From SNMP";
		snmpButton.className = "with-icon";
		snmpButton.style.backgroundImage = "url(mono/snmp.svg?light)";
		fetchDropdownButtonMenu.appendChild(snmpButton);

		const extractButton = document.createElement("input");
		extractButton.type = "button";
		extractButton.value = "From configuration";
		extractButton.className = "with-icon";
		extractButton.style.backgroundImage = "url(mono/configfile.svg?light)";
		fetchDropdownButtonMenu.appendChild(extractButton);

		const frame = document.createElement("div");
		frame.style.backgroundColor = "var(--clr-control)";
		frame.style.border = "2px solid var(--clr-dark)";
		frame.className = "view-interfaces-frame";
		innerBox.appendChild(frame);

		const numberingBox = document.createElement("div");
		numberingBox.style.marginTop = "8px";
		numberingBox.style.whiteSpace = "nowrap";
		innerBox.appendChild(numberingBox);

		const numberingLabel = document.createElement("div");
		numberingLabel.textContent = "Numbering: ";
		numberingLabel.style.display = "inline-block";
		numberingLabel.style.width = "108px";
		numberingBox.appendChild(numberingLabel);

		const numberingInput = document.createElement("select");
		numberingInput.style.width = "120px";
		numberingBox.appendChild(numberingInput);
		let numbering = ["Vertical", "Horizontal"];
		for (let i=0; i<numbering.length; i++) {
			const numberingOption = document.createElement("option");
			numberingOption.value = numbering[i].toLowerCase();
			numberingOption.textContent = numbering[i];
			numberingInput.appendChild(numberingOption);
		}

		const bulkBox = document.createElement("div");
		bulkBox.style.marginTop = "8px";
		bulkBox.style.whiteSpace = "nowrap";
		innerBox.appendChild(bulkBox);

		const portInput = document.createElement("select");
		portInput.style.minWidth = "120px";
		bulkBox.appendChild(portInput);
		let portsArray = ["Ethernet", "SFP", "SFP+", "QSFP", "USB", "Serial"];
		for (let i=0; i<portsArray.length; i++) {
			const portOption = document.createElement("option");
			portOption.value = portsArray[i];
			portOption.textContent = portsArray[i];
			portInput.appendChild(portOption);
		}

		const speedInput = document.createElement("select");
		speedInput.style.minWidth = "120px";
		bulkBox.appendChild(speedInput);
		let speedArray = [
			"N/A",
			"10 Mbps", "100 Mbps", "1 Gbps", "2.5 Gbps","5 Gbps", "10 Gbps",
			"25 Gbps", "40 Gbps", "100 Gbps", "200 Gbps", "400 Gbps", "800 Gbps"
		];
		for (let i=0; i<speedArray.length; i++) {
			const speedOption = document.createElement("option");
			speedOption.value = speedArray[i];
			speedOption.textContent = speedArray[i];
			speedInput.appendChild(speedOption);
		}
		speedInput.value = "1 Gbps";

		const xLabel = document.createElement("div");
		xLabel.textContent = " x ";
		xLabel.style.display = "inline-block";
		xLabel.style.marginLeft = "4px";
		xLabel.style.marginRight = "4px";
		bulkBox.appendChild(xLabel);

		const addBulkInput = document.createElement("input");
		addBulkInput.type = "number";
		addBulkInput.min = 1;
		addBulkInput.max = 48;
		addBulkInput.value = 1;
		addBulkInput.style.width = "50px";
		bulkBox.appendChild(addBulkInput);

		const titleBar = document.createElement("div");
		titleBar.style.position = "absolute";
		titleBar.style.whiteSpace = "nowrap";
		titleBar.style.overflow = "hidden";
		titleBar.style.left = "16px";
		titleBar.style.right = "16px";
		titleBar.style.height = "24px";
		titleBar.className = "view-interfaces-edit-title";
		innerBox.appendChild(titleBar);

		let titleArray = ["No.", "Type", "Speed", "Untagged", "Tagged", "Link"];
		for (let i=0; i<titleArray.length; i++) {
			const newLabel = document.createElement("div");
			newLabel.textContent = titleArray[i];
			titleBar.appendChild(newLabel);
		}

		const listBox = document.createElement("div");
		listBox.style.position = "absolute";
		listBox.style.left = "16px";
		listBox.style.right = "0";
		listBox.style.bottom = "4px";
		listBox.style.overflowX = "hidden";
		listBox.style.overflowY = "scroll";
		innerBox.appendChild(listBox);

		const extractBox = document.createElement("div");
		extractBox.style.position = "absolute";
		extractBox.style.visibility = "hidden";
		extractBox.style.left = "30%";
		extractBox.style.top = "28px";
		extractBox.style.width = "40%";
		extractBox.style.maxWidth = "400px";
		extractBox.style.minWidth = "220px";
		extractBox.style.borderRadius = "8px";
		extractBox.style.boxShadow = "rgba(0,0,0,.4) 0 0 8px";
		extractBox.style.backgroundColor = "var(--clr-pane)";
		extractBox.style.padding = "16px 8px";
		extractBox.style.overflow = "hidden";
		extractBox.style.textAlign = "center";
		dialog.innerBox.parentElement.parentElement.appendChild(extractBox);

		const extractOkButton = document.createElement("input");
		extractOkButton.type = "button";
		extractOkButton.value = "Extract";

		const extractCancelButton = document.createElement("input");
		extractCancelButton.type = "button";
		extractCancelButton.value = "Cancel";

		const extractMessageLabel = document.createElement("div");
		extractMessageLabel.style.display = "inline-block";
		extractMessageLabel.textContent = "Are you sure you want to populate the interfaces from the device configuration?";
		extractBox.appendChild(extractMessageLabel);

		extractBox.appendChild(document.createElement("br"));
		extractBox.appendChild(document.createElement("br"));
		extractBox.appendChild(extractOkButton);
		extractBox.appendChild(extractCancelButton);


		const snmpBox = document.createElement("div");
		snmpBox.style.position = "absolute";
		snmpBox.style.visibility = "hidden";
		snmpBox.style.left = "30%";
		snmpBox.style.top = "28px";
		snmpBox.style.width = "40%";
		snmpBox.style.maxWidth = "400px";
		snmpBox.style.minWidth = "220px";
		snmpBox.style.borderRadius = "8px";
		snmpBox.style.boxShadow = "rgba(0,0,0,.4) 0 0 8px";
		snmpBox.style.backgroundColor = "var(--clr-pane)";
		snmpBox.style.padding = "16px 8px";
		snmpBox.style.overflow = "hidden";
		snmpBox.style.textAlign = "center";
		dialog.innerBox.parentElement.parentElement.appendChild(snmpBox);

		const snmpOkButton = document.createElement("input");
		snmpOkButton.type = "button";
		snmpOkButton.value = "Fetch";

		const snmpCancelButton = document.createElement("input");
		snmpCancelButton.type = "button";
		snmpCancelButton.value = "Cancel";

		const snmpMessageLabel = document.createElement("div");
		snmpMessageLabel.style.display = "inline-block";
		snmpMessageLabel.textContent = "Are you sure you want to fetch the interfaces using SNMP?";
		snmpBox.appendChild(snmpMessageLabel);

		snmpBox.appendChild(document.createElement("br"));
		snmpBox.appendChild(document.createElement("br"));
		snmpBox.appendChild(snmpOkButton);
		snmpBox.appendChild(snmpCancelButton);


		const addBulkBox = document.createElement("div");
		addBulkBox.style.position = "absolute";
		addBulkBox.style.visibility = "hidden";
		addBulkBox.style.left = "30%";
		addBulkBox.style.top = "28px";
		addBulkBox.style.width = "40%";
		addBulkBox.style.maxWidth = "480px";
		addBulkBox.style.minWidth = "220px";
		addBulkBox.style.borderRadius = "8px";
		addBulkBox.style.boxShadow = "rgba(0,0,0,.4) 0 0 8px";
		addBulkBox.style.backgroundColor = "var(--clr-pane)";
		addBulkBox.style.padding = "16px 8px";
		addBulkBox.style.overflow = "hidden";
		addBulkBox.style.textAlign = "center";
		dialog.innerBox.parentElement.parentElement.appendChild(addBulkBox);

		const addBulkCancelButton = document.createElement("input");
		addBulkCancelButton.type = "button";
		addBulkCancelButton.value = "Cancel";

		const addBulkOkButton = document.createElement("input");
		addBulkOkButton.type = "button";
		addBulkOkButton.value = "Add";

		addBulkBox.appendChild(bulkBox);
		addBulkBox.appendChild(document.createElement("br"));
		addBulkBox.appendChild(addBulkOkButton);
		addBulkBox.appendChild(addBulkCancelButton);

		let list = [];

		let fetchToggle = false;
		const FetchToggle = ()=> {
			dialog.innerBox.parentElement.style.transition = ".2s";
			dialog.innerBox.parentElement.style.transform = fetchToggle ? "none" : "translateY(-25%)";
			dialog.innerBox.parentElement.style.filter = fetchToggle ? "none" : "opacity(0)";
			dialog.innerBox.parentElement.style.visibility = fetchToggle ? "visible" : "hidden";

			extractBox.style.transition = ".2s";
			extractBox.style.filter = fetchToggle ? "opacity(0)" : "none";
			extractBox.style.transform = fetchToggle ? "translateY(-25%)" : "none";
			extractBox.style.visibility = fetchToggle ? "hidden" : "visible";

			if (!fetchToggle) {
				setTimeout(()=>extractOkButton.focus(), 200);
			}

			fetchToggle = !fetchToggle;
		};

		let snmpToggle = false;
		const SnmpToggle = ()=> {
			dialog.innerBox.parentElement.style.transition = ".2s";
			dialog.innerBox.parentElement.style.transform = snmpToggle ? "none" : "translateY(-25%)";
			dialog.innerBox.parentElement.style.filter = snmpToggle ? "none" : "opacity(0)";
			dialog.innerBox.parentElement.style.visibility = snmpToggle ? "visible" : "hidden";

			snmpBox.style.transition = ".2s";
			snmpBox.style.filter = snmpToggle ? "opacity(0)" : "none";
			snmpBox.style.transform = snmpToggle ? "translateY(-25%)" : "none";
			snmpBox.style.visibility = snmpToggle ? "hidden" : "visible";
			
			if (!snmpToggle) {
				setTimeout(()=>snmpOkButton.focus(), 200);
			}

			snmpToggle = !snmpToggle;
		};

		let bulkToggle = false;
		const BulkToggle = ()=> {
			dialog.innerBox.parentElement.style.transition = ".2s";
			dialog.innerBox.parentElement.style.transform = bulkToggle ? "none" : "translateY(-25%)";
			dialog.innerBox.parentElement.style.filter = bulkToggle ? "none" : "opacity(0)";
			dialog.innerBox.parentElement.style.visibility = bulkToggle ? "visible" : "hidden";

			addBulkBox.style.transition = ".2s";
			addBulkBox.style.filter = bulkToggle ? "opacity(0)" : "none";
			addBulkBox.style.transform = bulkToggle ? "translateY(-25%)" : "none";
			addBulkBox.style.visibility = bulkToggle ? "hidden" : "visible";

			if (!bulkToggle) {
				setTimeout(()=> portInput.focus(), 200);
			}

			bulkToggle = !bulkToggle;
		};

		extractBox.onkeydown = event => {
			if (event.key === "Escape") {
				FetchToggle();
			}
		};

		snmpBox.onkeydown = event => {
			if (event.key === "Escape") {
				SnmpToggle();
			}
		};
		
		addBulkBox.onkeydown = event => {
			if (event.key === "Escape") {
				BulkToggle();
			}
		};

		portInput.onkeydown = speedInput.onkeydown = addBulkInput.onkeydown = event => {
			if (event.key === "Enter") {
				addBulkOkButton.onclick();
			}
		};

		numberingInput.onchange = ()=> this.InitInterfaceComponents(frame, numberingInput.value, list);

		addBulkButton.onclick = ()=> BulkToggle();

		let lastSelect = null;
		let lastMouseY = 0;
		let lastElementY = 0;

		const AddInterface = (number, port, speed, untagged, tagged, link, comment) => {
			const frontElement = document.createElement("div");
			frontElement.className = "view-interface-port";
			frontElement.style.gridArea = `1 / ${frame.childNodes.length+1}`;
			frame.appendChild(frontElement);

			const icon = document.createElement("div");
			frontElement.appendChild(icon);

			const numElement = document.createElement("div");
			numElement.textContent = number ? number : frame.childNodes.length;
			frontElement.appendChild(numElement);

			const listElement = document.createElement("div");
			listElement.className = "view-interfaces-edit-list-element";
			listElement.style.top = `${listBox.childNodes.length * 36}px`;
			listBox.appendChild(listElement);

			const dragAndDropElement = document.createElement("div");
			listElement.appendChild(dragAndDropElement);

			const txtN = document.createElement("input");
			txtN.type = "text";
			txtN.value = number ? number : "";
			txtN.placeholder = frame.childNodes.length;
			listElement.appendChild(txtN);

			const txtP = document.createElement("select");
			listElement.appendChild(txtP);
			for (let i=0; i<portsArray.length; i++) {
				const portOption = document.createElement("option");
				portOption.value = portsArray[i];
				portOption.textContent = portsArray[i];
				txtP.appendChild(portOption);
			}

			const txtS = document.createElement("select");
			listElement.appendChild(txtS);
			for (let i=0; i<speedArray.length; i++) {
				const speedOption = document.createElement("option");
				speedOption.value = speedArray[i];
				speedOption.textContent = speedArray[i];
				txtS.appendChild(speedOption);
			}

			const txtV = document.createElement("input");
			txtV.type = "text";
			txtV.value = untagged;
			txtV.placeholder = "--";
			listElement.appendChild(txtV);

			const txtT = document.createElement("input");
			txtT.type = "text";
			txtT.value = tagged;
			txtT.placeholder = "--";
			listElement.appendChild(txtT);

			const txtL = document.createElement("input");
			txtL.type = "text";
			txtL.setAttribute("readonly", true);
			listElement.appendChild(txtL);

			if (link && link.length > 0) {
				const device = LOADER.devices.data[link];
				if (device) {
					let value;
					if (device.name && device.name.v.length > 0) {
						value = device.name.v;
					}
					else if (device.hostname && device.hostname.v.length > 0) {
						value = device.hostname.v;
					}
					else if (device.ip && device.ip.v.length > 0) {
						value = device.ip.v;
					}

					txtL.value = value;
					const type = device.type ? device.type.v.toLowerCase() : null;
					const icon = type in LOADER.deviceIcons ? LOADER.deviceIcons[type] : "mono/gear.svg";

					txtL.style.backgroundImage = `url(${icon})`;
				}
			}

			const txtC = document.createElement("input");
			txtC.type = "text";
			txtC.placeholder = "description";
			txtC.value= comment;
			listElement.appendChild(txtC);

			const remove = document.createElement("input");
			remove.type = "button";
			remove.setAttribute("aria-label", "Remove interface");
			listElement.appendChild(remove);

			let obj = {
				number        : number,
				frontElement  : frontElement,
				listElement   : listElement,
				numberElement : numElement,
				numberInput   : txtN,
				portInput     : txtP,
				speedInput    : txtS,
				untaggedInput : txtV,
				taggedInput   : txtT,
				commInput     : txtC,
				link          : link
			};
			list.push(obj);

			frontElement.onclick = ()=> listElement.scrollIntoView({ behavior: "smooth", block: "center" });
			frontElement.onmouseover = ()=> listElement.style.backgroundColor = "var(--clr-select)";
			frontElement.onmouseleave = ()=> listElement.style.backgroundColor = "";

			dragAndDropElement.onmousedown = event => {
				if (event.buttons !== 1) return;
				lastSelect = obj;
				lastMouseY = event.clientY;
				lastElementY = parseInt(lastSelect.listElement.style.top.replace("px", ""));

				lastSelect.listElement.style.zIndex = "1";
				lastSelect.listElement.style.backgroundColor = "var(--clr-pane)";
				lastSelect.listElement.style.transition = "transition .2s";
				lastSelect.frontElement.style.backgroundColor = "var(--clr-select)";
				lastSelect.frontElement.style.boxShadow = "0 0 0 2px var(--clr-select)";
				lastSelect.listElement.style.backgroundColor = "var(--clr-select)";
			};

			innerBox.parentElement.onmouseup = event => {
				if (lastSelect === null) return;
				lastSelect.listElement.style.zIndex = "0";
				lastSelect.listElement.style.transform = "none";
				lastSelect.listElement.style.boxShadow = "none";
				lastSelect.listElement.style.transition = ".2s";
				lastSelect.frontElement.style.backgroundColor = "";
				lastSelect.frontElement.style.boxShadow = "";
				lastSelect.listElement.style.backgroundColor = "";

				lastSelect = null;
				SortList();
				this.InitInterfaceComponents(frame, numberingInput.value, list);
			};

			innerBox.parentElement.onmousemove = event => {
				if (lastSelect === null) return;
				if (event.buttons !== 1) return;
				let pos = lastElementY - (lastMouseY - event.clientY);
				if (pos < 0) pos = 0;
				lastSelect.listElement.style.transform = "scale(1.05)";
				lastSelect.listElement.style.boxShadow = "0 0 4px rgba(0,0,0,.5)";
				lastSelect.listElement.style.top = `${pos}px`;
				SortList();
				this.InitInterfaceComponents(frame, numberingInput.value, list);
			};

			txtN.onchange = ()=> {
				numElement.textContent = txtN.value ? txtN.value : list.indexOf(obj) + 1;
				obj.number = txtN.value;
			};

			txtP.onchange = ()=> {
				switch (txtP.value) {
				case "Ethernet": icon.style.maskImage = "url(mono/ethernetport.svg)"; break;
				case "SFP"     : icon.style.maskImage = "url(mono/sfpport.svg)"; break;
				case "SFP+"    : icon.style.maskImage = "url(mono/sfpport.svg)"; break;
				case "QSFP"    : icon.style.maskImage = "url(mono/qsfpport.svg)"; break;
				case "USB"     : icon.style.maskImage = "url(mono/usbport.svg)"; break;
				case "Serial"  : icon.style.maskImage = "url(mono/serialport.svg)"; break;
				}
				this.InitInterfaceComponents(frame, numberingInput.value, list);
			};

			txtS.onchange =
			txtV.onchange = ()=> {
				this.InitInterfaceComponents(frame, numberingInput.value, list);
			};

			txtL.ondblclick = ()=> {
				if (obj.link.length > 0) {
					obj.link = "";
					txtL.value = "";
					txtL.style.backgroundImage = "url(mono/gear.svg)";
				}
			};

			txtL.onclick = ()=> {
				if (obj.link !== null && obj.link.length > 0) return;

				this.AddCssDependencies("list.css");

				const dim = document.createElement("div");
				dim.style.top = "0";
				dim.className = "win-dim";
				innerBox.parentElement.appendChild(dim);

				const frame = document.createElement("div");
				frame.style.position = "absolute";
				frame.style.overflow = "hidden";
				frame.style.width = "100%";
				frame.style.maxWidth = "1000px";
				frame.style.height = "calc(100% - 80px)";
				frame.style.left = " max(calc(50% - 516px), 0px)";
				frame.style.top = "40px";
				frame.style.padding = "8px";
				frame.style.boxSizing = "border-box";
				frame.style.borderRadius = "8px";
				frame.style.backgroundColor = "var(--clr-pane)";
				frame.style.boxShadow = "rgba(0,0,0,.2) 0 12px 16px";
				dim.appendChild(frame);

				const findInput = document.createElement("input");
				findInput.type = "text";
				findInput.placeholder = "Search";
				frame.appendChild(findInput);

				const devicesList = document.createElement("div");
				devicesList.className = "no-results";
				devicesList.style.position = "absolute";
				devicesList.style.left = devicesList.style.right = "0";
				devicesList.style.top = "48px";
				devicesList.style.bottom = "52px";
				devicesList.style.overflowY = "auto";
				frame.appendChild(devicesList);

				const closeLinkButton = document.createElement("input");
				closeLinkButton.type = "button";
				closeLinkButton.value = "Close";
				closeLinkButton.style.position = "absolute";
				closeLinkButton.style.width = "72px";
				closeLinkButton.style.left = "calc(50% - 30px)";
				closeLinkButton.style.bottom = "8px";
				frame.appendChild(closeLinkButton);

				closeLinkButton.onclick = ()=> {
					closeLinkButton.onclick = ()=> { };
					dim.style.filter = "opacity(0)";
					setTimeout(()=> innerBox.parentElement.removeChild(dim), 200);
				};

				findInput.onchange = findInput.oninput = ()=> {
					devicesList.textContent = "";

					let keywords = [];
					if (findInput.value.trim().length > 0)
						keywords = findInput.value.trim().toLowerCase().split(" ");

					let EQUIP_LIST_ORDER;
					if (localStorage.deviceslist_columns) {
						EQUIP_LIST_ORDER = JSON.parse(localStorage.getItem("deviceslist_columns"));
					}
					else {
						EQUIP_LIST_ORDER = ["name", "type", "hostname", "ip", "manufacturer", "model"];
					}

					for (let file in LOADER.devices.data) {
						let match = true;

						for (let j=0; j<keywords.length; j++) {
							let flag = false;
							for (let k in LOADER.devices.data[file]) {
								if (k.startsWith(".")) continue;
								if (LOADER.devices.data[file][k].v.toLowerCase().indexOf(keywords[j]) > -1) {
									flag = true;
								}
							}
							if (!flag) {
								match = false;
								continue;
							}
						}

						if (!match) continue;

						const element = document.createElement("div");
						element.className = "list-element";
						devicesList.appendChild(element);

						const type = LOADER.devices.data[file].type ? LOADER.devices.data[file].type.v.toLowerCase() : null;

						const icon = document.createElement("div");
						icon.className = "list-element-icon";
						icon.style.backgroundImage = `url(${type in LOADER.deviceIcons ? LOADER.deviceIcons[type] : "mono/gear.svg"})`;
						element.appendChild(icon);

						for (let j=0; j<6; j++) {
							if (!(EQUIP_LIST_ORDER[j] in LOADER.devices.data[file])) continue;
							if (LOADER.devices.data[file][EQUIP_LIST_ORDER[j]].v.length === 0) continue;
							const newLabel = document.createElement("div");
							newLabel.style.left = j === 0 ? `calc(32px + ${100 * j / 6}%)` : `${100 * j / 6}%`;
							newLabel.style.width = j === 0 ? `calc(${100 / 6}% - 32px)` : `${100 / 6}%`;
							newLabel.textContent = LOADER.devices.data[file][EQUIP_LIST_ORDER[j]].v;
							element.appendChild(newLabel);
						}

						element.ondblclick = ()=> {
							let value;
							if (LOADER.devices.data[file].name && LOADER.devices.data[file].name.v.length > 0) {
								value = LOADER.devices.data[file].name.v;
							}
							else if (LOADER.devices.data[file].hostname && LOADER.devices.data[file].hostname.v.length > 0) {
								value = LOADER.devices.data[file].hostname.v;
							}
							else if (LOADER.devices.data[file].ip && LOADER.devices.data[file].ip.v.length > 0) {
								value = LOADER.devices.data[file].ip.v;
							}

							obj.link = file;
							txtL.value = value;
							txtL.style.backgroundImage = icon.style.backgroundImage;
							closeLinkButton.onclick();
						};
					}
				};

				findInput.focus();

				setTimeout(()=> findInput.onchange(), 1);
			};

			remove.onclick = ()=> {
				listBox.removeChild(listElement);
				frame.removeChild(frontElement);
				list.splice(list.indexOf(obj), 1);
				SortList();
				this.InitInterfaceComponents(frame, numberingInput.value, list);

				titleBar.style.top = `${frame.clientHeight + 72}px`;
				listBox.style.top = `${frame.clientHeight + 96}px`;
			};

			txtP.value = port;
			txtS.value = speed;
			txtP.onchange();

			SortList();
			this.InitInterfaceComponents(frame, numberingInput.value, list);
			titleBar.style.top = `${frame.clientHeight + 72}px`;
			listBox.style.top = `${frame.clientHeight + 96}px`;
		};

		const SortList = ()=> {
			list.sort((a, b)=> {
				return a.listElement.getBoundingClientRect().top - b.listElement.getBoundingClientRect().top;
			});

			for (let i=0; i<list.length; i++) {
				list[i].numberElement.textContent = list[i].number ? list[i].number : i + 1;
				list[i].numberInput.placeholder = i + 1;

				if (lastSelect === null || list[i].listElement !== lastSelect.listElement)
					list[i].listElement.style.top = `${i * 36}px`;
			}
		};

		this.InitInterfaceComponents(frame, numberingInput.value, list);
		titleBar.style.top = `${frame.clientHeight + 72}px`;
		listBox.style.top = `${frame.clientHeight + 96}px`;

		extractButton.onclick = ()=> FetchToggle();

		extractOkButton.onclick = async ()=> {
			extractBox.style.filter = "opacity(0)";
			extractBox.style.transform = "translateY(-25%)";
			extractBox.style.visibility = "hidden";

			const spinner = document.createElement("div");
			spinner.className = "spinner";
			spinner.style.textAlign = "left";
			spinner.style.marginTop = "32px";
			spinner.style.marginBottom = "16px";
			spinner.appendChild(document.createElement("div"));
			dialog.innerBox.parentElement.parentElement.appendChild(spinner);

			const status = document.createElement("div");
			status.textContent = "Fetching...";
			status.style.color = "var(--clr-light)";
			status.style.textAlign = "center";
			status.style.fontWeight = "bold";
			status.style.animation = "delayed-fade-in 1.5s ease-in 1";
			dialog.innerBox.parentElement.parentElement.appendChild(status);

			try {
				const response = await fetch(`db/config/extract?file=${this.args.file}`);

				if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

				const json = await response.json();

				if (json.error) {
					dialog.Close();
					setTimeout(()=>this.ConfirmBox(json.error, true, "mono/error.svg"), 250);
				}
				else if (json instanceof Array) {
					listBox.textContent = "";
					frame.textContent = "";
					list = [];

					for (let i=0; i<json.length; i++) {
						AddInterface(null, json[i].port, json[i].speed, json[i].untagged, json.tagged, null, json[i].comment);
					}

					SortList();
					this.InitInterfaceComponents(frame, numberingInput.value, list);

					titleBar.style.top = `${frame.clientHeight + 72}px`;
					listBox.style.top = `${frame.clientHeight + 96}px`;

					fetchButton.onclick();
				}
			}
			catch {}
			finally {
				dialog.innerBox.parentElement.parentElement.removeChild(spinner);
				dialog.innerBox.parentElement.parentElement.removeChild(status);

				dialog.innerBox.parentElement.style.transition = ".2s";
				dialog.innerBox.parentElement.style.transform = "none";
				dialog.innerBox.parentElement.style.filter = "none";
				dialog.innerBox.parentElement.style.visibility = "visible";
			}
		};

		extractCancelButton.onclick = ()=> FetchToggle();

		snmpButton.onclick = ()=> SnmpToggle();

		snmpOkButton.onclick = async ()=> {
			snmpBox.style.filter = "opacity(0)";
			snmpBox.style.transform = "translateY(-25%)";
			snmpBox.style.visibility = "hidden";

			const spinner = document.createElement("div");
			spinner.className = "spinner";
			spinner.style.textAlign = "left";
			spinner.style.marginTop = "32px";
			spinner.style.marginBottom = "16px";
			spinner.appendChild(document.createElement("div"));
			dialog.innerBox.parentElement.parentElement.appendChild(spinner);

			const status = document.createElement("div");
			status.textContent = "Fetching...";
			status.style.color = "var(--clr-light)";
			status.style.textAlign = "center";
			status.style.fontWeight = "bold";
			status.style.animation = "delayed-fade-in 1.5s ease-in 1";
			dialog.innerBox.parentElement.parentElement.appendChild(status);

			try {
				const response = await fetch(`snmp/switchinterface?file=${this.args.file}`);

				if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

				const json = await response.json();

				if (json.error) {
					dialog.Close();
					setTimeout(()=>this.ConfirmBox(json.error, true, "mono/error.svg"), 250);
				}
				else if (json instanceof Array) {
					listBox.textContent = "";
					frame.textContent = "";
					list = [];

					for (let i=0; i<json.length; i++) {
						AddInterface(json[i].number, json[i].port, json[i].speed, json[i].untagged, json[i].tagged, null, json[i].comment);
					}

					SortList();
					this.InitInterfaceComponents(frame, numberingInput.value, list);

					titleBar.style.top = `${frame.clientHeight + 72}px`;
					listBox.style.top = `${frame.clientHeight + 96}px`;
				}
			}
			catch {}
			finally {
				dialog.innerBox.parentElement.parentElement.removeChild(spinner);
				dialog.innerBox.parentElement.parentElement.removeChild(status);

				dialog.innerBox.parentElement.style.transition = ".2s";
				dialog.innerBox.parentElement.style.transform = "none";
				dialog.innerBox.parentElement.style.filter = "none";
				dialog.innerBox.parentElement.style.visibility = "visible";
			}
		};

		snmpCancelButton.onclick = ()=> SnmpToggle();

		addBulkCancelButton.onclick = ()=> BulkToggle();

		addBulkOkButton.onclick = async ()=> {
			for (let i=0; i<addBulkInput.value; i++)
				AddInterface(null, portInput.value, speedInput.value, 1, "", null, "");
			BulkToggle();
		};

		if (".interfaces" in this.link && this.link[".interfaces"].v) {
			numberingInput.value = JSON.parse(this.link[".interfaces"].v).n;
			let obj = JSON.parse(this.link[".interfaces"].v);
			for (let i=0; i<obj.i.length; i++)
				AddInterface(obj.i[i].n, obj.i[i].i, obj.i[i].s, obj.i[i].v, obj.i[i].t, obj.i[i].l, obj.i[i].c);
		}
		else {
			for (let i=0; i<4; i++)
				AddInterface(null, "Ethernet", "1 Gbps", 1, "", null, "");
		}

		okButton.addEventListener("click", async ()=> {
			let interfaces = { i: [], n: numberingInput.value };

			for (let i=0; i<list.length; i++) {
				interfaces.i.push({
					n: list[i].numberInput.value,
					i: list[i].portInput.value,
					s: list[i].speedInput.value,
					v: list[i].untaggedInput.value,
					t: list[i].taggedInput.value,
					l: list[i].link,
					c: list[i].commInput.value
				});
			}

			let obj = {};
			for (let i=0; i<this.attributes.childNodes.length; i++) {
				if (this.attributes.childNodes[i].childNodes.length < 2) continue;
				let name = this.attributes.childNodes[i].childNodes[0].value;
				let value = this.attributes.childNodes[i].childNodes[1].firstChild.value;
				obj[name] = {v:value};
			}

			obj[".interfaces"] = {v:JSON.stringify(interfaces)};

			try {
				const response = await fetch(this.args.file ? `db/device/save?file=${this.args.file}` : "db/device/save", {
					method: "POST",
					body: JSON.stringify(obj)
				});

				if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

				const json = await response.json();
				if (json.error) throw(json.error);

				this.args.file = json.filename;
				LOADER.devices.data[json.filename] = obj;

				this.InitializePreview();
			}
			catch (ex) {
				setTimeout(()=>{this.ConfirmBox(ex, true, "mono/error.svg")}, 250);
			}
		});
	}

	InitInterfaceComponents(frame, numbering, list) {
		let rows = 1, columns = 4;
		if (list.length > 0) {
			if (list.length % 48 === 0) {
				columns = 24;
				rows = Math.ceil(list.length / columns);
			}
			else if (list.length % 52 === 0) {
				columns = 26;
				rows = Math.ceil(list.length / columns);
			}
			else if (list.length < 16) {
				rows = 1;
				columns = list.length;
			}
			else if (list.length <= 52) {
				rows = 2;
				columns = Math.ceil(list.length / 2);
			}
			else {
				rows = Math.ceil(list.length / 26);
				columns = Math.ceil(list.length / rows);
			}
		}

		for (let i=0; i<list.length; i++) {
			let row, column;
			if (numbering === "vertical") {
				if (rows > 2) {
					const pairIndex = Math.floor(i / 2);
					const stack = Math.floor(pairIndex / columns);
					row = (i % 2 === 0 ? 1 : 2) + stack * 2;
					column = pairIndex % columns + 1;
					list[i].frontElement.style.gridArea = `${row} / ${column}`;
				} else {
					row = i % rows + 1;
					column = Math.floor(i / rows) + 1;
					list[i].frontElement.style.gridArea = `${row} / ${column}`;
				}
			}
			else {
				row =  Math.floor(i / columns) + 1;
				column = i % columns + 1;
				list[i].frontElement.style.gridArea = `${row} / ${column}`;
			}

			if (row % 2 === 1 && rows !== 1) {
				list[i].frontElement.childNodes[0].style.transform = "rotateX(180deg)";
				list[i].frontElement.childNodes[1].style.top = "-34px"
			}
			else {
				list[i].frontElement.childNodes[0].style.transform = "none";
				list[i].frontElement.childNodes[1].style.top = "-16px";
			}
		}

		const size = 32;
		frame.style.maxWidth = `${columns * size + 22}px`;
		frame.style.gridTemplateColumns = `repeat(${columns}, ${size}px)`;
		frame.style.gridTemplateRows = `repeat(${rows}, 44px)`;

		return {rows:rows, columns:columns};
	}

	GetSpeedColor(speed) {
		switch (speed) {
		case "10 Mbps" : return "hsl(20,85%,50%)";
		case "100 Mbps": return "hsl(40,85%,50%)";
		case "1 Gbps"  : return "hsl(60,85%,50%)";
		case "2.5 Gbps": return "hsl(70,85%,50%)";
		case "5 Gbps"  : return "hsl(80,85%,50%)";
		case "10 Gbps" : return "hsl(130,85%,50%)";
		case "25 Gbps" : return "hsl(150,85%,50%)";
		case "40 Gbps" : return "hsl(170,85%,50%)";
		case "100 Gbps": return "hsl(190,85%,50%)";
		case "200 Gbps": return "hsl(210,85%,50%)";
		case "400 Gbps": return "hsl(275,85%,50%)";
		case "800 Gbps": return "hsl(295,85%,50%)";
		default: return null;
		}
	}

	GetVlanColor(vlan) {
		for (let i=0; i<KEEP.zones.length; i++) {
			if (KEEP.zones[i].vlan == vlan) {
				return KEEP.zones[i].color;
			}
		}
		return null;
	}

	Fetch(isNew=false, forceTarget=null) { //overrides
		let target = null;
		if (isNew) {
			target = forceTarget;
		}
		else if (this.link.ip && this.link.ip.v.length > 0) {
			target = this.link.ip.v;
		}
		else if (this.link.hostname && this.link.hostname.v.length > 0) {
			target = this.link.hostname.v;
		}

		if (target === null) {
			this.ConfirmBox("No IP or hostname found", true);
			return;
		}

		const dialog = this.DialogBox("280px");
		if (dialog === null) return;

		const grid = document.createElement("div");
		grid.style.display = "grid";
		grid.style.paddingTop = "20px";
		grid.style.gridTemplateColumns = "auto minmax(100px, 200px) 150px auto";
		grid.style.gridTemplateRows = "repeat(4, 34px)";
		grid.style.alignItems = "center";
		dialog.innerBox.appendChild(grid);

		const dnsToggle = this.CreateToggle("DNS", true, grid);
		dnsToggle.label.style.gridArea = "1 / 2";
		dnsToggle.checkbox.disabled = true;

		const snmpToggle = this.CreateToggle("SNMP", false, grid);
		snmpToggle.label.style.gridArea = "2 / 2";
		snmpToggle.checkbox.disabled = true;

		const snmpInput = document.createElement("select");
		snmpInput.style.marginLeft = "0";
		snmpInput.style.width = "200px";
		snmpInput.style.gridArea = "2 / 3";
		snmpInput.disabled = true;
		grid.appendChild(snmpInput);

		const wmiToggle = this.CreateToggle("WMI", true, grid);
		wmiToggle.label.style.gridArea = "3 / 2";

		const ldapToggle = this.CreateToggle("LDAP", true, grid);
		ldapToggle.label.style.gridArea = "4 / 2";

		const portScanToggle = this.CreateToggle("Port Scan", true, grid);
		portScanToggle.label.style.gridArea = "5 / 2";

		const portScanInput = document.createElement("select");
		portScanInput.style.marginLeft = "0";
		portScanInput.style.width = "200px";
		portScanInput.style.gridArea = "5 / 3";
		grid.appendChild(portScanInput);

		const basicOption = document.createElement("option");
		basicOption.value = "basic";
		basicOption.text = "Basic";
		portScanInput.appendChild(basicOption);

		const wellKnownOption = document.createElement("option");
		wellKnownOption.value = "wellknown";
		wellKnownOption.text = "Well known ports (1-1023)";
		portScanInput.appendChild(wellKnownOption);

		const extendedOption = document.createElement("option");
		extendedOption.value = "extended";
		extendedOption.text = "Extended (1-8191)";
		portScanInput.appendChild(extendedOption);

		setTimeout(async ()=>{
			const snmpProfiles = await this.GetSnmpProfiles();
			if (snmpProfiles === null || snmpProfiles.length === 0) return;

			snmpToggle.checkbox.disabled = false;

			for (let i = 0; i < snmpProfiles.length; i++) {
				const option = document.createElement("option");
				option.value = snmpProfiles[i].guid;
				option.text = snmpProfiles[i].name;
				snmpInput.appendChild(option);
			}

			if (this.link && "snmp profile" in this.link) {
				wmiToggle.checkbox.checked = false;
				snmpToggle.checkbox.checked = true;
				snmpInput.disabled = false;
				snmpInput.value = this.link["snmp profile"].v;
			}
			else if (this.link && ".snmp profile" in this.link) {
				snmpToggle.checkbox.checked = true;
				snmpInput.disabled = false;
				snmpInput.value = this.link[".snmp profile"].v;
			}
		}, 0);

		snmpToggle.checkbox.onchange = ()=> {
			snmpInput.disabled = !snmpToggle.checkbox.checked;
		};

		portScanToggle.checkbox.onchange = ()=> {
			portScanInput.disabled = !portScanToggle.checkbox.checked;
		};

		dialog.okButton.onclick = async ()=> {
			dialog.innerBox.textContent = "";
			dialog.okButton.style.display = "none";

			const spinner = document.createElement("div");
			spinner.className = "spinner";
			spinner.style.textAlign = "left";
			spinner.style.marginTop = "32px";
			spinner.style.marginBottom = "16px";
			spinner.appendChild(document.createElement("div"));
			dialog.innerBox.appendChild(spinner);

			const status = document.createElement("div");
			status.textContent = "Fetching...";
			status.style.textAlign = "center";
			status.style.fontWeight = "bold";
			status.style.animation = "delayed-fade-in 1.5s ease-in 1";
			dialog.innerBox.appendChild(status);

			dialog.innerBox.parentElement.style.transition = ".4s";
			dialog.innerBox.parentElement.style.height = "180px";

			let isCanceled = false;
			dialog.cancelButton.addEventListener("click", ()=>{
				isCanceled = true;
			});

			try {
				let url = `fetch/singledevice?target=${target}`;
				if (wmiToggle.checkbox.checked)      url += `&wmi=true`;
				if (snmpToggle.checkbox.checked)     url += `&snmp=${snmpInput.value}`;
				if (ldapToggle.checkbox.checked)     url += `&ldap=true`;
				if (portScanToggle.checkbox.checked) url += `&portscan=${portScanInput.value}`;

				const response = await fetch(url);

				if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

				const json = await response.json();
				if (json.error) {
					throw new Error(json.error);
				}

				dialog.cancelButton.onclick();

				if (isCanceled) return;

				if (isNew) {
					this.attributes.textContent = "";
				}
				else {
					this.Edit(false);
				}

				let attrElements = Array.from(this.attributes.childNodes).filter(o=>o.className != "view-attributes-group");
				let hasType = !!attrElements.find(o=>o.firstChild.value === "type" && o.childNodes[1].firstChild.value.length > 0);

				for (let attr in json) {
					if (hasType && attr === "type") continue;

					let element = attrElements.find(o=>o.firstChild.value === attr);

					if (element) {
						element.setAttribute("source", json[attr][1]);

						if (element.childNodes[1].firstChild.value === json[attr][0]) {
							if (!isNew) {
								element.childNodes[1].firstChild.style.backgroundImage = "url(mono/checked.svg)";
								element.childNodes[1].firstChild.style.paddingLeft = "32px";
							}
						}
						else {
							if (element.childNodes[1].firstChild.value.length > 0) {
								element.childNodes[1].setAttribute("previous", element.childNodes[1].firstChild.value);
							}
							if (!isNew) {
								element.childNodes[1].firstChild.style.backgroundImage = "url(mono/edit.svg)";
								element.childNodes[1].firstChild.style.paddingLeft = "32px";
							}
							element.childNodes[1].firstChild.value = json[attr][0];
						}
					}
					else {
						const newElement = this.attributes.appendChild(this.CreateAttribute(attr, json[attr][0], KEEP.username, new Date(), true));
						newElement.setAttribute("source", json[attr][1]);
						if (!isNew) {
							newElement.childNodes[1].firstChild.style.backgroundImage = "url(mono/add.svg)";
							newElement.childNodes[1].firstChild.style.paddingLeft = "32px";
						}
					}
				}
			}
			catch (ex) {
				dialog.innerBox.parentElement.style.transition = ".4s";
				dialog.innerBox.parentElement.style.height = "120px";
				dialog.innerBox.textContent = "";
				dialog.cancelButton.value = "Close";

				const errorBox = document.createElement("div");
				errorBox.textContent = ex;
				errorBox.style.textAlign = "center";
				errorBox.style.fontWeight = "600";
				errorBox.style.padding = "20px";
				dialog.innerBox.appendChild(errorBox);
			}
		};

		dialog.okButton.focus();
	}

	async GetSnmpProfiles() {
		try {
			const response = await fetch("config/snmpprofiles/list");

			if (response.status !== 200) return null;

			const json = await response.json();
			if (json.error) throw(json.error);

			return json;
		}
		catch (ex) {
			return null;
		}
	}

	Copy() { //overrides
		new DeviceView({copy: this.args.file});
	}

	Delete() { //overrides
		this.ConfirmBox("Are you sure you want to delete this device?", false, "mono/delete.svg").addEventListener("click", async ()=> {
			try {
				const response = await fetch(`db/device/delete?file=${this.args.file}`);

				if (response.status !== 200) LOADER.HttpErrorHandler(response.status);
				const json = await response.json();

				if (json.error) throw(json.error);

				delete LOADER.devices.data[this.args.file];
				LOADER.devices.length--;

				for (let i=0; i<WIN.array.length; i++) {
					if (WIN.array[i] instanceof DevicesList) {
						let element = Array.from(WIN.array[i].list.childNodes).filter(o=>o.getAttribute("id") === this.args.file);
						element.forEach(o=> WIN.array[i].list.removeChild(o));
						WIN.array[i].UpdateViewport(true);
					}
				}

				this.Close();
			}
			catch (ex) {
				console.error(ex);
			}
		});
	}

	DownloadRdp(host, port) {
		const NL = String.fromCharCode(13) + String.fromCharCode(10);

		let text = "";

		if (port) {
			text = `full address:s:${host}:${port}${NL}`;
		}
		else {
			text = `full address:s:${host}${NL}`;
		}

		text += "session bpp:i:15" + NL;
		text += "compression:i:1" + NL;
		text += "keyboardhook:i:2" + NL;
		text += "videoplaybackmode:i:1" + NL;
		text += "networkautodetect:i:1" + NL;
		text += "bandwidthautodetect:i:1" + NL;
		text += "displayconnectionbar:i:1" + NL;
		text += "disable wallpaper:i:1" + NL;
		text += "bitmapcachepersistenable:i:1" + NL;
		text += "audiomode:i:1" + NL;
		text += "redirectprinters:i:0" + NL;
		text += "redirectlocation:i:0" + NL;
		text += "redirectcomports:i:0" + NL;
		text += "redirectsmartcards:i:1" + NL;
		text += "redirectwebauthn:i:1" + NL;
		text += "redirectclipboard:i:1" + NL;
		text += "redirectposdevices:i:0" + NL;
		text += "autoreconnection enabled:i:1" + NL;
		text += "authentication level:i:2" + NL;
		text += "prompt for credentials:i:1" + NL;
		text += "negotiate security layer:i:1" + NL;
		text += "gatewayusagemethod:i:4" + NL;
		text += "gatewaycredentialssource:i:4" + NL;
		text += "smart sizing:i:1" + NL;

		const pseudo = document.createElement("a");
		pseudo.style.display = "none";
		this.win.appendChild(pseudo);

		pseudo.setAttribute("href", "data:text/plain;base64," + btoa(text));
		pseudo.setAttribute("download", `${host}.rdp`);

		pseudo.click(null);
	}

	DownloadVnc(host, port) {
		const NL = String.fromCharCode(13) + String.fromCharCode(10);

		let text = "[connection]" + NL;
		text += `host=${host}` + NL;
		text += `port=${port===null ? 5900 : port}` + NL;

		const pseudo = document.createElement("a");
		pseudo.style.display = "none";
		this.win.appendChild(pseudo);

		pseudo.setAttribute("href", "data:text/plain;base64," + btoa(text));
		pseudo.setAttribute("download", `${host}.vnc`);

		pseudo.click(null);
	}
}
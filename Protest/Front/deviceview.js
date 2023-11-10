class DeviceView extends View {
	static DAY_TICKS  = 3_600_000 * 24;

	static DEVICES_GROUP_SCHEMA = [
		"type", "name",
	
		["mono/portscan.svg", "network"],
		"ip", "ipv6", "mask", "hostname", "mac address", "dhcp enabled", "ports", "network adapter speed",
		"overwriteprotocol",
	
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
		"guid", "distinguished name", "dns hostname", "created on dc", "fqdn",
	
		["mono/credential.svg", "credentials"],
		"domain", "username", "password", "la password", "ssh username", "ssh password"
	];

	constructor(params) {
		super();
		this.params = params ?? { file: null };

		this.SetIcon("mono/gear.svg");

		this.liveStatsWebSockets = null;
		this.link = LOADER.devices.data[this.params.file];
		this.order = "group";
		this.groupSchema = DeviceView.DEVICES_GROUP_SCHEMA;
		this.dbTarget = "device";

		if (params.file && !this.link) {
			this.SetTitle("not found");
			this.ConfirmBox("Device no longer exists", true).addEventListener("click", ()=>this.Close());
			return;
		}

		if (params.file) {
			this.SetTitle(this.link.name ? this.link.name.v : "");
			this.InitializePreview();

		}
		else if (params.clone) {
			const origin = LOADER.devices.data[params.clone];
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

			let initiator = KEEP.username;
			let date = new Date();

			this.attributes.appendChild(this.CreateAttribute("type",         "", initiator, date, true));

			this.attributes.appendChild(this.CreateAttribute("name",         "", initiator, date, true));
			this.attributes.appendChild(this.CreateAttribute("ip",           "", initiator, date, true));
			this.attributes.appendChild(this.CreateAttribute("hostname",     "", initiator, date, true));
			this.attributes.appendChild(this.CreateAttribute("mac address",  "", initiator, date, true));
			this.attributes.appendChild(this.CreateAttribute("manufacturer", "", initiator, date, true));
			this.attributes.appendChild(this.CreateAttribute("model",        "", initiator, date, true));
			this.attributes.appendChild(this.CreateAttribute("location",     "", initiator, date, true));
			this.attributes.appendChild(this.CreateAttribute("owner",        "", initiator, date, true));
		}
	}

	InitializePreview() { //override
		let type = this.link.type ? this.link.type.v.toLowerCase() : "";

		this.SetTitle(this.link.name ? this.link.name.v : "untitled");
		this.SetIcon(LOADER.deviceIcons.hasOwnProperty(type) ? LOADER.deviceIcons[type] : "mono/gear.svg");
		super.InitializePreview();
		this.InitializeLiveStats();
		this.InitializeInterfaces();
	}

	InitializeSideTools() { //override
		super.InitializeSideTools();
		this.sideTools.textContent = "";

		let host = null;
		if (this.link.ip) {
			host = this.link.ip.v
		}
		else if (this.link.hostname) {
			host = this.link.hostname.v
		}

		const overwriteProtocol = {};
		if (this.link.hasOwnProperty(".overwriteprotocol")) {
			this.link[".overwriteprotocol"].v.split(";").map(o=> o.trim()).forEach(o=> {
				let split = o.split(":");
				if (split.length === 2) overwriteProtocol[split[0]] = split[1];
			});
		}
		if (this.link.hasOwnProperty("overwriteprotocol")) {
			this.link["overwriteprotocol"].v.split(";").map(o=> o.trim()).forEach(o=> {
				let split = o.split(":");
				if (split.length === 2) overwriteProtocol[split[0]] = split[1];
			});
		}

		if (this.link.hasOwnProperty("mac address")) {
			const btnWoL = this.CreateSideButton("mono/wol.svg", "Wake on LAN");
			btnWoL.onclick = async ()=> {
				if (btnWoL.hasAttribute("busy")) return;
				try {
					btnWoL.setAttribute("busy", true);
					const response = await fetch(`manage/device/wol?file=${this.params.file}`);
					const json = await response.json();
					if (json.error) throw(json.error);
				}
				catch (ex) { this.ConfirmBox(ex, true, "mono/error.svg"); }
				btnWoL.removeAttribute("busy");
			};
		}

		if (this.link.hasOwnProperty("ports")) {
			let ports = this.link["ports"].v.split(";").map(o=> parseInt(o.trim()));

			if (ports.includes(445) && this.link.hasOwnProperty("operating system")) { //wmi service 445

				const btnPowerOff = this.CreateSideButton("mono/turnoff.svg", "Power off");
				btnPowerOff.onclick = ()=> {
					this.ConfirmBox("Are you sure you want to power off this device?", false, "mono/turnoff.svg").addEventListener("click", async ()=> {
						if (btnPowerOff.hasAttribute("busy")) return;
						try {
							btnPowerOff.setAttribute("busy", true);
							const response = await fetch(`manage/device/shutdown?file=${this.params.file}`);
							const json = await response.json();
							if (json.error) throw(json.error);
						}
						catch (ex) { this.ConfirmBox(ex, true, "mono/error.svg"); }
						btnPowerOff.removeAttribute("busy");
					});
				};

				const btnReboot = this.CreateSideButton("mono/restart.svg", "Reboot");
				btnReboot.onclick = ()=> {
					this.ConfirmBox("Are you sure you want to reboot this device?", false, "mono/restart.svg").addEventListener("click", async ()=> {
						if (btnReboot.hasAttribute("busy")) return;
						try {
							btnReboot.setAttribute("busy", true);
							const response = await fetch(`manage/device/reboot?file=${this.params.file}`);
							const json = await response.json();
							if (json.error) throw(json.error);
						}
						catch (ex) { this.ConfirmBox(ex, true, "mono/error.svg"); }
						btnReboot.removeAttribute("busy");
					});
				};

				const btnLogOff = this.CreateSideButton("mono/logoff.svg", "Log off");
				btnLogOff.onclick = ()=> {
					this.ConfirmBox("Are you sure you want to log off this device?", false, "mono/logoff.svg").addEventListener("click", async ()=> {
						if (btnLogOff.hasAttribute("busy")) return;
						try {
							btnLogOff.setAttribute("busy", true);
							const response = await fetch(`manage/device/logoff?file=${this.params.file}`);
							const json = await response.json();
							if (json.error) throw(json.error);
						}
						catch (ex) { this.ConfirmBox(ex, true, "mono/error.svg"); }
						btnLogOff.removeAttribute("busy");
					});
				};

				const btnProcesses = this.CreateSideButton("mono/console.svg", "Processes");
				btnProcesses.onclick = ()=> {
					const wmi = new Wmi({ target:host.split(";")[0].trim(), query:"SELECT CreationDate, ExecutablePath, Name, ProcessId \nFROM Win32_Process"});
					wmi.SetIcon("mono/console.svg");
					if (!this.link.hasOwnProperty("name") || this.link["name"].v.length == 0)
						wmi.SetTitle("[untitled] - Processes");
					else
						wmi.SetTitle(this.link["name"].v + " - Processes");
				};
				
				const btnServices = this.CreateSideButton("mono/service.svg", "Services");
				btnServices.onclick = ()=> {
					const wmi = new Wmi({target: host.split(";")[0].trim(), query:"SELECT DisplayName, Name, ProcessId, State \nFROM Win32_Service"});
					wmi.SetIcon("mono/service.svg");
					if (!this.link.hasOwnProperty("name") || this.link["name"].v.length == 0)
						wmi.SetTitle("[untitled] - Processes");
					else
						wmi.SetTitle(this.link["name"].v + " - Services");
				};

				const btnComputerMng = this.CreateSideButton("mono/computermanage.svg", "Management");
				btnComputerMng.onclick = ()=> UI.PromptAgent(this, "management", host);

				const btnPSRemote = this.CreateSideButton("mono/psremote.svg", "PS remote"); //psexec
				btnPSRemote.onclick = ()=> UI.PromptAgent(this, "psremote", host);

				if (ports.includes(445)) { //smb
					const btnSmb = this.CreateSideButton("mono/shared.svg", "SMB");
					btnSmb.onclick = ()=> UI.PromptAgent(this, "smb", `\\\\${host}\\`);
				}
			}

			if (overwriteProtocol.telnet) { //tenet
				const btnTelnet = this.CreateSideButton("mono/telnet.svg", "Telnet");
				btnTelnet.onclick = ()=> new Telnet(host.split(";")[0].trim() + ":" + overwriteProtocol.telnet);
			}
			else if (ports.includes(23)) {
				const btnTelnet = this.CreateSideButton("mono/telnet.svg", "Telnet");
				btnTelnet.onclick = ()=> new Telnet(host.split(";")[0].trim());
			}

			if (overwriteProtocol.ssh) { //ssh
				const btnSsh = this.CreateSideButton("mono/ssh.svg", "Secure shell");
				btnSsh.onclick = ()=> UI.PromptAgent(this, "ssh", `${host}:${overwriteProtocol.ssh}`);
			}
			else if (ports.includes(22)) {
				const btnSsh = this.CreateSideButton("mono/ssh.svg", "Secure shell");
				btnSsh.onclick = ()=> UI.PromptAgent(this, "ssh", host);
			}

			if (overwriteProtocol.http) { //http
				const btnAction = this.CreateSideButton("mono/earth.svg", "HTTP");
				btnAction.onclick = ()=> window.open("http://" + host.split(";")[0].trim() + ":" + overwriteProtocol.http, "");
			}
			else if (ports.includes(80)) {
				const btnAction = this.CreateSideButton("mono/earth.svg", "HTTP");
				btnAction.onclick = ()=> window.open("http://" + host.split(";")[0].trim());
			}

			if (overwriteProtocol.https) { //https
				const btnAction = this.CreateSideButton("mono/earth.svg", "HTTPS");
				btnAction.onclick = ()=> window.open("https://" + host.split(";")[0].trim() + ":" + overwriteProtocol.https);
			}
			else if (ports.includes(443)) { //https
				const btnAction = this.CreateSideButton("mono/earth.svg", "HTTPS");
				btnAction.onclick = ()=> window.open("https://" + host.split(";")[0].trim());
			}

			if (overwriteProtocol.ftp) { //ftp
				const btnAction = this.CreateSideButton("mono/shared.svg", "FTP");
				btnAction.onclick = ()=> window.open("ftp://" + host.split(";")[0].trim() + ":" + overwriteProtocol.ftp, "", "width=200,height=100").close();
			}
			else if (ports.includes(21)) {
				const btnAction = this.CreateSideButton("mono/shared.svg", "FTP");
				btnAction.onclick = ()=> window.open("ftp://" + host.split(";")[0].trim(), "", "width=200,height=100").close();
			}

			if (overwriteProtocol.ftps) { //ftps
				const btnAction = this.CreateSideButton("mono/shared.svg", "FTP");
				btnAction.onclick = ()=> window.open("ftps://" + host.split(";")[0].trim() + ":" + overwriteProtocol.ftps, "", "width=200,height=100").close();
			}
			else if (ports.includes(989)) {
				const btnAction = this.CreateSideButton("mono/shared.svg", "FTPs");
				btnAction.onclick = ()=> window.open("ftps://" + host.split(";")[0].trim(), "", "width=200,height=100").close();
			}

			if (overwriteProtocol.rdp) { //rdp
				const btnAction = this.CreateSideButton("mono/rdp.svg", "Remote desktop");
				btnAction.onclick = ()=> UI.PromptAgent(this, "rdp", `${host}:${overwriteProtocol.rdp}`);

			}
			else if (ports.includes(3389)) {
				const btnAction = this.CreateSideButton("mono/rdp.svg", "Remote desktop");
				btnAction.onclick = ()=> UI.PromptAgent(this, "rdp", host);
			}

			if (overwriteProtocol.uvnc) { //uvnc
				const btnAction = this.CreateSideButton("mono/uvnc.svg", "uVNC");
				btnAction.onclick = ()=> UI.PromptAgent(this, "uvnc", `${host}:${overwriteProtocol.uvnc}`);
			}
			else if (ports.includes(5900)) {
				const btnAction = this.CreateSideButton("mono/uvnc.svg", "uVNC");
				btnAction.onclick = ()=> UI.PromptAgent(this, "uvnc", host);
			}

			if (overwriteProtocol.winbox) { //winbox
				const btnAction = this.CreateSideButton("mono/mikrotik.svg", "Winbox");
				btnAction.onclick = ()=> UI.PromptAgent(this, "winbox", `${host}:${overwriteProtocol.winbox}`);
			}
			else if (ports.includes(8291)) {
				const btnAction = this.CreateSideButton("mono/mikrotik.svg", "Winbox");
				btnAction.onclick = ()=> UI.PromptAgent(this, "winbox", host);
			}

			if (ports.includes(9100)) { //print test
				const btnPrintTest = this.CreateSideButton("mono/printer.svg", "Print test");
				btnPrintTest.onclick = async ()=> {
					if (btnPrintTest.hasAttribute("busy")) return;
					try {
						btnPrintTest.setAttribute("busy", true);
						const response = await fetch(`manage/device/printtest?file=${this.params.file}`);
						const json = await response.json();
						if (json.error) throw (json.error);
					}
					catch (ex) { this.ConfirmBox(ex, true, "mono/error.svg"); }
					btnPrintTest.removeAttribute("busy");
				};
			}
		}

		if (this.link.hasOwnProperty("type")) {
			const type = this.link["type"].v.toLowerCase();
			if (type === "router" || type === "switch") {
				const btnConfig = this.CreateSideButton("mono/configfile.svg", "Configuration");
				btnConfig.style.marginTop = "16px";
				btnConfig.onclick = () => this.DeviceConfiguration();

				const btnInterfaces = this.CreateSideButton("mono/interfaces.svg", "Interfaces");
				btnInterfaces.onclick = ()=> this.EditInterfaces();
			}
		}
	}

	InitializeInterfaces() {
		this.liveC.textContent = "";

		if (!this.link.hasOwnProperty(".interfaces")) return;
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

		this.liveC.style.overflowX = "auto";

		let numbering = obj.n ? obj.n : "vertical";
		let list = [];

		for (let i = 0; i < obj.i.length; i++) {
			const front = document.createElement("div");
			front.className = "view-interface-port";
			frame.appendChild(front);

			const icon = document.createElement("div");
			switch (obj.i[i].i) {
			case "Ethernet": icon.style.backgroundImage = "url(mono/ethernetport.svg)"; break;
			case "SFP"     : icon.style.backgroundImage = "url(mono/sfpport.svg)"; break;
			case "QSFP"    : icon.style.backgroundImage = "url(mono/qsfpport.svg)"; break;
			case "USB"     : icon.style.backgroundImage = "url(mono/usbport.svg)"; break;
			case "Serial"  : icon.style.backgroundImage = "url(mono/serialport.svg)"; break;
			}
			front.appendChild(icon);

			if (obj.i[i].i === "Ethernet" || obj.i[i].i === "SFP") {
				icon.appendChild(document.createElement("div")); //led1
				icon.appendChild(document.createElement("div")); //led2
			}

			const num = document.createElement("div");
			num.textContent = frame.childNodes.length;
			front.appendChild(num);

			list.push({
				frontElement: front,
				number  : num,
				port    : obj.i[i].i,
				speed   : obj.i[i].s,
				vlan    : obj.i[i].v,
				comment : obj.i[i].c,
				link    : obj.i[i].l
			});

			LOADER.devices

			front.onmouseenter = ()=> {
				this.floating.textContent = "";

				const divSpeedColor = document.createElement("div");
				divSpeedColor.style.display = "inline-block";
				divSpeedColor.style.width = "8px";
				divSpeedColor.style.height = "8px";
				divSpeedColor.style.borderRadius = "2px";
				divSpeedColor.style.marginLeft = "4px";
				divSpeedColor.style.marginRight = "4px";
				divSpeedColor.style.backgroundColor = list[i].speedColor;
				divSpeedColor.style.boxShadow = `0 0 4px ${list[i].speedColor}`;
				this.floating.appendChild(divSpeedColor);

				if (obj.i[i].s !== "N/A") {
					const divSpeed = document.createElement("div");
					divSpeed.style.display = "inline-block";
					divSpeed.textContent = `${obj.i[i].s} ${obj.i[i].i}`;
					this.floating.appendChild(divSpeed);
				}

				this.floating.appendChild(document.createElement("br"));

				const divVlanColor = document.createElement("div");
				divVlanColor.style.display = "inline-block";
				divVlanColor.style.width = "8px";
				divVlanColor.style.height = "8px";
				divVlanColor.style.borderRadius = "2px";
				divVlanColor.style.marginLeft = "4px";
				divVlanColor.style.marginRight = "4px";
				divVlanColor.style.backgroundColor = list[i].vlanColor ? list[i].vlanColor : "transparent";
				divVlanColor.style.boxShadow = `0 0 4px ${list[i].vlanColor}`;
				this.floating.appendChild(divVlanColor);

				if (obj.i[i].v && obj.i[i].v.toString().length) {
					const divVlan = document.createElement("div");
					divVlan.style.display = "inline-block";
					divVlan.textContent = `VLAN ${obj.i[i].v}`;
					this.floating.appendChild(divVlan);
				}

				if (list[i].link && LOADER.devices.data.hasOwnProperty(list[i].link)) {
					let file = list[i].link;
					let type = LOADER.devices.data[file].hasOwnProperty("type") ? LOADER.devices.data[file]["type"].v : null;
					const icon = LOADER.deviceIcons.hasOwnProperty(type) ? LOADER.deviceIcons[type] : "mono/gear.svg";
					
					this.floating.appendChild(document.createElement("br"));

					const linkIcon = document.createElement("div");
					linkIcon.style.backgroundImage = `url(${icon})`;
					linkIcon.style.backgroundRepeat = "no-repeat";
					linkIcon.style.backgroundPosition = "0 center";
					linkIcon.style.backgroundSize = "32px 32px";
					linkIcon.style.width = "100%";
					linkIcon.style.height = "40px";
					linkIcon.style.lineHeight = "40px";
					linkIcon.style.margin = "4px";
					linkIcon.style.paddingLeft = "36px";
					this.floating.appendChild(linkIcon);

					if (LOADER.devices.data[file].hasOwnProperty("name")) {
						linkIcon.textContent = LOADER.devices.data[file]["name"].v;
					}
					else if (LOADER.devices.data[file].hasOwnProperty("hostname") && LOADER.devices.data[file]["hostname"].v !== name) {
						linkIcon.textContent= file["hostname"].v;
					}
					else if (LOADER.devices.data[file].hasOwnProperty("IP")) {
						linkIcon.textContent = LOADER.devices.data[file]["ip"].v;
					}

					list[i].frontElement.ondblclick = ()=> {
						for (let i = 0; i < WIN.array.length; i++) {							
							if (WIN.array[i] instanceof DeviceView && WIN.array[i].params.file === file) {
								WIN.array[i].Minimize(); //minimize/restore
								return;
							}
						}
						new DeviceView({file: file});
					};
				}

				let x = front.getBoundingClientRect().x - this.win.getBoundingClientRect().x;
				if (x > this.content.getBoundingClientRect().width - this.floating.getBoundingClientRect().width - 8)
					x = this.content.getBoundingClientRect().width - this.floating.getBoundingClientRect().width - 8;

				this.floating.style.left = `${x}px`;
				this.floating.style.top = `${front.getBoundingClientRect().y - this.win.getBoundingClientRect().y + 20}px`;
				this.floating.style.visibility = "visible";
				this.floating.style.opacity = "1";
			};

			front.onmouseleave = ()=> {
				this.floating.style.opacity = "0";
				this.floating.style.visibility = "hidden";
			};

			frame.onmouseenter = ()=> { this.floating.style.display = "initial"; };
			frame.onmouseleave = ()=> { this.floating.style.display = "none"; };
		}

		this.InitInterfaceComponents(frame, numbering, list, false);
	}

	async InitializeLiveStats() {
		if (this.liveStatsWebSockets !== null) return;

		let server = window.location.href.replace("https://", "").replace("http://", "");
		if (server.indexOf("/") > 0) server = server.substring(0, server.indexOf("/"));

		this.liveStatsWebSockets = new WebSocket((KEEP.isSecure ? "wss://" : "ws://") + server + "/ws/livestats/device");

		this.liveStatsWebSockets.onopen = ()=> {
			this.AfterResize();
			const icon = this.task.querySelector(".icon");
			this.task.textContent = "";
			this.task.appendChild(icon);

			this.liveA.textContent = "";
			this.liveB.textContent = "";
			this.liveD.textContent = "";

			this.liveStatsWebSockets.send(this.params.file);
		};
		
		this.liveStatsWebSockets.onmessage = event=> {
			const json = JSON.parse(event.data);
		
			if (json.info) {
				this.CreateInfo(json.info);
			}
			else if (json.warning) {
				this.CreateWarning(json.warning);
			}
			else if (json.echoReply) {
				if (this.task.childNodes.length < 6) {
					this.dot = document.createElement("div");
					this.dot.className = "task-icon-dots";
					this.dot.style.backgroundColor = UI.PingColor(json.echoReply);
					this.task.appendChild(this.dot);
				}

				const pingButton = this.CreateInfoButton(json.for, "/mono/ping.svg");
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
			}
			else if (json.drive) {
				const driveButton = this.CreateInfoButton(json.drive, "/mono/hdd.svg");
				driveButton.secondary.style.display = "inline-block";
				driveButton.secondary.style.width = "64px";
				driveButton.secondary.style.height = "10px";
				driveButton.secondary.style.border = "2px solid var(--clr-dark)";
				driveButton.secondary.style.borderRadius = "2px";
				driveButton.secondary.style.boxShadow = `var(--clr-dark) ${json.used * 64 / json.total}px 0 0 inset`;
				if (json.used / json.total >= .85) driveButton.button.style.backgroundColor = "var(--clr-warning)";

				driveButton.button.onclick = ()=> UI.PromptAgent(this, "smb", json.path);
			}
			else if (json.activeUser) {
				const userButton = this.CreateInfoButton(json.activeUser, "/mono/user.svg");
				userButton.secondary.style.display = "inline-block";
				userButton.button.onclick = ()=> {
					let usersList = [json.activeUser];
					if (json.activeUser.indexOf("\\") > 0) usersList.push(json.activeUser.split("\\")[1]);
					let found = null;
					for (let file in LOADER.users.data) {
						if (!LOADER.users.data[file].hasOwnProperty("username")) continue;
						if (usersList.includes(LOADER.users.data[file].username.v)) {
							found = file;
							break;
						}
					}

					if (found) {
						for (let k = 0; k < WIN.array.length; k++) {
							if (WIN.array[k] instanceof UserView && WIN.array[k].params.file === found) {
								WIN.array[k].Minimize();
								return;
							}
						}
						new UserView({file: found});
					}

				};
			}
		};
		
		this.liveStatsWebSockets.onclose = ()=> {
			this.liveStatsWebSockets = null;
			this.InitializeGraphs();
		};

		//this.liveStatsWebSockets.onerror = error=> {};
	}

	async InitializeGraphs() {
		let host;
		if (this.link.ip && this.link.ip.v.length > 0) {
			host = this.link.ip.v.split(";")[0];
		}
		else if (this.link.hostname && this.link.hostname.v.length > 0) {
			host = this.link.hostname.v.split(";")[0];
		}
		
		const [pingArray, memoryArray, diskArray] = await Promise.all([
			(async ()=> {
				const response = await fetch(`lifeline/ping/view?host=${host}`);
				const buffer = await response.arrayBuffer();
				return new Uint8Array(buffer);
			})(),

			(async ()=> {
				const response = await fetch(`lifeline/memory/view?host=${host}`);
				const buffer = await response.arrayBuffer();
				return new Uint8Array(buffer);
			})(),

			(async ()=> {
				const response = await fetch(`lifeline/disk/view?host=${host}`);
				const buffer = await response.arrayBuffer();
				return new Uint8Array(buffer);
			})()
		]);

		const GenerateGraph = (data, label, type)=> {
			const graphBox = document.createElement("div");
			graphBox.className = "view-lifeline-graph";
			this.liveD.appendChild(graphBox);

			const labelBox = document.createElement("div");
			labelBox.style.position = "absolute";
			labelBox.style.left = "-2px";
			labelBox.style.top = "100px";
			labelBox.style.width = "100px";
			labelBox.style.height = "14px";
			labelBox.style.transformOrigin = "0 0";
			labelBox.style.transform = "rotate(-90deg)";
			labelBox.style.textAlign = "center";
			labelBox.style.fontSize = "13px";
			labelBox.style.color = "var(--clr-light)";
			labelBox.textContent = label;
			graphBox.appendChild(labelBox);

			const infoBox = document.createElement("div");
			infoBox.style.position = "absolute";
			infoBox.style.bottom = "32px";
			infoBox.style.zIndex = "2";
			infoBox.style.minWidth = "64px";
			infoBox.style.minHeight = "20px";
			infoBox.style.padding = "0 4px";
			infoBox.style.color = "var(--clr-dark)";
			infoBox.style.backgroundColor = "var(--clr-pane)";
			infoBox.style.borderRadius = "2px";
			infoBox.style.boxShadow = "rgba(32,32,32,.5) 0 0 4px";
			infoBox.style.opacity = "0";
			infoBox.style.pointerEvents = "none";
			infoBox.style.transition = ".2s";
			graphBox.appendChild(infoBox);

			const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
			svg.setAttribute("width", 800);
			svg.setAttribute("height", 128);
			svg.style.outline = "none";
			graphBox.appendChild(svg);

			const line = document.createElementNS("http://www.w3.org/2000/svg", "rect");
			line.setAttribute("x", 0);
			line.setAttribute("y", 105);
			line.setAttribute("width", 800);
			line.setAttribute("height", 1);
			line.setAttribute("fill", "color-mix(in hsl, var(--clr-light) 25%, transparent)");
			svg.appendChild(line);

			const today = new Date(Date.now() - Date.now() % DeviceView.DAY_TICKS);

			for (let i=0; i<14; i++) {
				let x = 750 - i*50;

				const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
				dot.setAttribute("cx", x);
				dot.setAttribute("cy", 110);
				dot.setAttribute("r", 1.5);
				dot.setAttribute("fill", "var(--clr-light)");
				svg.appendChild(dot);

				const lblTime = document.createElementNS("http://www.w3.org/2000/svg", "text");
				lblTime.textContent = new Date(today.getTime() - i*DeviceView.DAY_TICKS).toLocaleDateString(UI.regionalFormat, {month:"short",day:"numeric"});
				lblTime.setAttribute("x", x);
				lblTime.setAttribute("y", 120);
				lblTime.setAttribute("fill", "var(--clr-light)");
				lblTime.setAttribute("text-anchor", "middle");
				lblTime.setAttribute("font-size", "10px");
				svg.appendChild(lblTime);
			}

			const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
			path.setAttribute("fill", "rgba(224,224,224,.4)");
			svg.appendChild(path);

			let d = `M ${750 - (today.getTime() - data[0].d) / DeviceView.DAY_TICKS * 50} 105 `;
			
			let lastX = -8, lastY = -8;

			if (type === "line") {
				for (let i = 0; i < data.length; i++) {
					let x = 750 - Math.round((today.getTime() - data[i].d) / DeviceView.DAY_TICKS * 50);
					let y = 3 + Math.round(data[i].v < 0 ? 100 : Math.min(data[i].v / 10, 90));
					d += `L ${x} ${y} `;
	
					if (x - lastX < 8 && Math.abs(lastY - y) <= 4) continue;
	
					const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
					dot.setAttribute("cx", x);
					dot.setAttribute("cy", y);
					dot.setAttribute("r", 3);
					dot.setAttribute("fill", this.RttToColor(data[i].v));
					svg.appendChild(dot);
	
					lastX = x;
					lastY = y;
				}
			}
			else if (type === "vol") {
				for (let i = 0; i < data.length; i++) {
					if (data[i].t === 0) continue;
					
					let x = 750 - Math.round((today.getTime() - data[i].d) / DeviceView.DAY_TICKS * 50);
					let y = 104 - Math.round(100 * data[i].v / data[i].t);
					
					d += `L ${x} ${y} `;
	
					if (x - lastX < 8 && Math.abs(lastY - y) <= 4) continue;

					const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
					dot.setAttribute("cx", x);
					dot.setAttribute("cy", y);
					dot.setAttribute("r", 3);
					dot.setAttribute("fill", this.VolumeToColor(data[i].v, data[i].t));
					svg.appendChild(dot);
	
					lastX = x;
					lastY = y;
				}
			}

			d += `L ${750 - (today.getTime() - data[data.length - 1].d) / DeviceView.DAY_TICKS * 50} 105 Z`;
			path.setAttribute("d", d);


			graphBox.onmouseenter = ()=>{
				infoBox.style.opacity = "1";
			};
			
			graphBox.onmouseleave = ()=>{
				infoBox.style.opacity = "0";
			};

			graphBox.onmousemove = event=>{
				if (event.layerX < 800 - graphBox.clientWidth + 100) {
					infoBox.style.left = "";
					infoBox.style.right = "16px";
				}
				else {
					infoBox.style.left = "16px";
					infoBox.style.right = "";
				}

				let closestX = 750 - Math.round((today.getTime() - data[0].d) / DeviceView.DAY_TICKS * 50);
				let closestIndex = 0;
				for (let i = 0; i < data.length; i++) {
					let currentX = 750 - Math.round((today.getTime() - data[i].d) / DeviceView.DAY_TICKS * 50);
					if (Math.abs(currentX - event.layerX) < Math.abs(closestX - event.layerX)) {
						closestX = currentX;
						closestIndex = i;
					}
				}

				if (type === "line") {
					infoBox.textContent = data[closestIndex].v < 0 ? "Timed out" : `${data[closestIndex].v} ms`;
				}
				else if (type === "vol") {
					let percent = data[closestIndex].t > 0? Math.round(1000 * data[closestIndex].v / data[closestIndex].t) / 10 : 0;
					infoBox.textContent = `${UI.SizeToString(data[closestIndex].v * 1024)} / ${UI.SizeToString(data[closestIndex].t * 1024)} (${percent})%`;
				}
			};

			return svg;
		};

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

			GenerateGraph(data, "Roundtrip time", "line");
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
	
				data.push({d:date, v:used, t:total});
			}

			GenerateGraph(data, "Memory", "vol");
		}

		if (diskArray.length > 0) {
			const data = new Map();
			let index = 0;
			while (index < diskArray.length) {
				const dateBuffer = new Uint8Array(diskArray.slice(index,index+8)).buffer;
				const date = Number(new DataView(dateBuffer).getBigInt64(0, true));
				
				const count = (diskArray[index+9] << 8) | diskArray[index+8]; // | (diskArray[index+11] << 24) | (diskArray[index+10] << 16)

				index += 12;

				for (let j=0; j<count; j++) {
					const caption = String.fromCharCode(diskArray[index + j*17]);

					const usedBuffer = new Uint8Array(diskArray.slice(index + j*17+1, index + j*17+9)).buffer;
					const used = Number(new DataView(usedBuffer).getBigInt64(0, true));

					const totalBuffer = new Uint8Array(diskArray.slice(index + j*17+9, index + j*17+17)).buffer;
					const total = Number(new DataView(totalBuffer).getBigInt64(0, true));

					if (!data.has(caption)) {
						data.set(caption, []);
					}

					data.get(caption).push({d:date, v:used, t:total, c:caption});
				}
				index += 17 * count;
			}

			data.forEach ((value, key)=> {
				GenerateGraph(value, `Disk capacity (${key})`, "vol");
			});
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
		if (p > .9) return "var(--clr-error)";
		if (p > .85) return "var(--clr-orange)";
		if (p > .80) return "var(--clr-warning)";
		return "hsl(92, 66%, 50%)";
	}
	
	Edit(isNew=false) { //override
		const btnFetch = document.createElement("input");
		if (isNew && !this.params.clone) {
			btnFetch.type = "button";
			btnFetch.className = "view-fetch-floating-button";
			this.content.appendChild(btnFetch);
	
			btnFetch.onclick = ()=> {
				const dialog = this.DialogBox("108px");
				dialog.innerBox.parentElement.style.maxWidth = "400px";
				dialog.innerBox.style.textAlign = "center";

				const txtFetchHost = document.createElement("input");
				txtFetchHost.type = "text";
				txtFetchHost.placeholder = "ip or hostname";
				txtFetchHost.style.marginTop = "20px";
				txtFetchHost.style.width = "min(calc(100% - 8px), 200px)";
				dialog.innerBox.appendChild(txtFetchHost);

				txtFetchHost.focus();

				dialog.btnOK.onclick = ()=> {
					if (txtFetchHost.value.length === 0) return;
					dialog.btnCancel.onclick();
					setTimeout(()=>this.Fetch(true, txtFetchHost.value), 250);
				};

				txtFetchHost.onkeydown = event=> {
					if (event.key === "Enter") {
						dialog.btnOK.click();
					}
				};
			};
		}

		const btnSave = super.Edit(isNew);
		btnSave.addEventListener("click", async ()=> {
			let obj = {};
			for (let i = 0; i < this.attributes.childNodes.length; i++) {
				if (this.attributes.childNodes[i].childNodes.length < 2) continue;
				let name  = this.attributes.childNodes[i].childNodes[0].value;
				let value = this.attributes.childNodes[i].childNodes[1].firstChild.value;
				obj[name] = {v:value};
			}

			try {
				const response = await fetch(this.params.file ? `db/device/save?file=${this.params.file}` : "db/device/save", {
					method: "POST",
					body: JSON.stringify(obj)
				});

				if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

				const json = await response.json();
				if (json.error) throw(json.error);

				this.params.file = json.filename;
				this.link = obj;
				LOADER.devices.data[json.filename] = obj;

				this.InitializePreview();
			}
			catch (ex) {
				this.ConfirmBox(ex, true, "mono/error.svg").addEventListener("click", ()=>{
					this.Close();
				});
			}
			finally {
				if (isNew) this.content.removeChild(btnFetch);
			}
		});
	}

	async DeviceConfiguration() {
		const dialog = this.DialogBox("calc(100% - 34px)");
		if (dialog === null) return;

		const btnOK     = dialog.btnOK;
		const btnCancel = dialog.btnCancel;
		const buttonBox = dialog.buttonBox;
		const innerBox  = dialog.innerBox;

		btnOK.value = "Close";

		buttonBox.removeChild(btnCancel);

		const btnEdit = document.createElement("input");
		btnEdit.type = "button";
		btnEdit.value = "Edit";
		btnEdit.style.float = "left";
		buttonBox.appendChild(btnEdit);

		innerBox.classList.add("view-config-code-box");
		innerBox.style.margin = "8px";

		innerBox.parentElement.style.maxWidth = "1200px";
		innerBox.parentElement.style.left = "40px";
		innerBox.parentElement.style.right = "40px";
		innerBox.style.padding = "20px";

		innerBox.parentElement.style.backgroundColor = "#202020";

		const DisplayScript = lines=> {
			innerBox.textContent = "";
			for (let i = 0; i < lines.length; i++) {
				lines[i] = lines[i].replaceAll("\\\"", "\\&quot;");

				const divLine = document.createElement("div");

				if (lines[i].startsWith("#") || lines[i].startsWith("!")) { //comment
					divLine.textContent = lines[i];
					divLine.style.color = "#9C6";
					divLine.style.fontStyle = "italic";
					innerBox.appendChild(divLine);
				}
				else if (lines[i].startsWith("/")) { //location
					divLine.textContent = lines[i];
					divLine.style.color = "#8FD";
					divLine.style.paddingTop = ".5em";
					innerBox.appendChild(divLine);
				}
				else {
					let line = [];

					let temp = lines[i].split("\"");
					for (let j = 0; j < temp.length; j++)
						if (j % 2 === 0)
							line.push(temp[j]);
						else
							line.push(`\"${temp[j]}\"`);

					for (let j = 0; j < line.length; j++) {
						if (line[j].length === 0) continue;

						if (line[j].startsWith("\"") && line[j].length > 2) { //quot
							const newSpan = document.createElement("span");
							newSpan.textContent = line[j];
							newSpan.style.color = "#D98";
							divLine.appendChild(newSpan);
						}
						else {
							let p = 0;

							/*if (j == 0) { //verb
								while (line[0].substring(0, p).trim().length === 0 && p < line[0].length)
									p++;
								p = line[0].indexOf(" ", p);

								const span = document.createElement("span");
								span.textContent = line[0].substring(0, p);
								span.style.color = "#A8F";
								divLine.appendChild(span);
							}*/

							while (p < line[j].length) {
								let ep = line[j].indexOf("=", p); //equal position
								if (ep < 0) break;

								let sp = line[j].lastIndexOf(" ", ep); //space position
								if (sp < 0) break;

								if (p != sp) {
									const spanA = document.createElement("span");
									spanA.textContent = j == 0 ? line[j].substring(p, sp): line[j].substring(p, sp);
									divLine.appendChild(spanA);
								}

								const spanB = document.createElement("span");
								spanB.textContent = j == 0 ? line[j].substring(sp, ep + 1) : line[j].substring(sp, ep + 1);
								spanB.style.color = "#5BE";
								divLine.appendChild(spanB);

								p = ep + 1;
							}

							if (p < line[j].length) {
								const spanC = document.createElement("span");
								spanC.textContent = j == 0 ? line[j].substring(p): line[j].substring(p);
								divLine.appendChild(spanC);
							}
						}
					}

					innerBox.appendChild(divLine);
				}
			}
		};


		const response = await fetch(`db/config/view?file=${this.params.file}`);
		if (response.status !== 200) LOADER.HttpErrorHandler(response.status);
		const text = await response.text();

		if (text.length > 0) {
			DisplayScript(text.split("\n"));
		}
		
		btnOK.onclick = ()=> {
			innerBox.textContent = "";
			dialog.Close();
		};

		btnEdit.onclick = () => {
			innerBox.contentEditable = true;

			const btnSave = document.createElement("input");
			btnSave.type = "button";
			btnSave.value = "Save";

			buttonBox.removeChild(btnEdit);
			buttonBox.removeChild(btnOK);

			buttonBox.appendChild(btnSave);
			buttonBox.appendChild(btnCancel);

			btnSave.onclick = async ()=>{
				const saveResponse = await fetch(`db/config/save?file=${this.params.file}`, {
					method: "POST",
					body: innerBox.innerText
				});
	
				if (saveResponse.status !== 200) LOADER.HttpErrorHandler(saveResponse.status);
				const saveJson = await saveResponse.json();
	
				if (saveJson.error) {
					btnCancel.onclick();
					this.ConfirmBox(saveJson.error, true);
				}
				else {
					innerBox.contentEditable = false;
					buttonBox.appendChild(btnEdit);
					buttonBox.appendChild(btnOK);
					buttonBox.removeChild(btnSave);
					buttonBox.removeChild(btnCancel);
	
					DisplayScript(innerBox.innerText.split("\n"));
				}
			};
		};

	}

	EditInterfaces() {
		const dialog = this.DialogBox("calc(100% - 40px)");
		if (dialog === null) return;

		const btnOK    = dialog.btnOK;
		const innerBox = dialog.innerBox;

		innerBox.parentElement.style.maxWidth = "1110px";
		innerBox.parentElement.style.left = "40px";
		innerBox.parentElement.style.right = "40px";
		innerBox.style.padding = "20px";

		const frame = document.createElement("div");
		frame.style.backgroundColor = "var(--clr-control)";
		frame.style.border = "2px solid var(--clr-dark)";
		frame.className = "view-interfaces-frame";
		innerBox.appendChild(frame);

		const divNumbering = document.createElement("div");
		divNumbering.style.marginTop = "24px";
		divNumbering.style.whiteSpace = "nowrap";
		innerBox.appendChild(divNumbering);

		const lblNumbering = document.createElement("div");
		lblNumbering.textContent = "Numbering: ";
		lblNumbering.style.display = "inline-block";
		lblNumbering.style.width = "120px";
		divNumbering.appendChild(lblNumbering);

		const txtNumbering = document.createElement("select");
		txtNumbering.style.width = "120px";
		divNumbering.appendChild(txtNumbering);
		let numbering = ["Vertical", "Horizontal"];
		for (let i = 0; i < numbering.length; i++) {
			const optNumbering = document.createElement("option");
			optNumbering.value = numbering[i].toLowerCase();
			optNumbering.textContent = numbering[i];
			txtNumbering.appendChild(optNumbering);
		}

		const divAdd = document.createElement("div");
		divAdd.style.marginTop = "8px";
		divAdd.style.whiteSpace = "nowrap";
		innerBox.appendChild(divAdd);

		const lblAdd = document.createElement("div");
		lblAdd.textContent = "Add interface: ";
		lblAdd.style.display = "inline-block";
		lblAdd.style.width = "120px";
		divAdd.appendChild(lblAdd);

		const txtPort = document.createElement("select");
		txtPort.style.minWidth = "120px";
		divAdd.appendChild(txtPort);
		let portsArray = ["Ethernet", "SFP", "QSFP", "USB", "Serial"];
		for (let i = 0; i < portsArray.length; i++) {
			const optPort = document.createElement("option");
			optPort.value = portsArray[i];
			optPort.textContent = portsArray[i];
			txtPort.appendChild(optPort);
		}

		const txtSpeed = document.createElement("select");
		txtSpeed.style.minWidth = "120px";
		divAdd.appendChild(txtSpeed);
		let speedArray = [
			"N/A",
			"10 Mbps", "100 Mbps", "1 Gbps", "2.5 Gbps","5 Gbps", "10 Gbps",
			"25 Gbps", "40 Gbps", "100 Gbps", "200 Gbps", "400 Gbps", "800 Gbps"
		];
		for (let i = 0; i < speedArray.length; i++) {
			const optSpeed = document.createElement("option");
			optSpeed.value = speedArray[i];
			optSpeed.textContent = speedArray[i];
			txtSpeed.appendChild(optSpeed);
		}
		txtSpeed.value = "1 Gbps";

		const lblX = document.createElement("div");
		lblX.textContent = " x ";
		lblX.style.display = "inline-block";
		lblX.style.marginLeft = "8px";
		divAdd.appendChild(lblX);

		const txtMulti = document.createElement("input");
		txtMulti.type = "number";
		txtMulti.min = 1;
		txtMulti.max = 48;
		txtMulti.value = 1;
		txtMulti.style.width = "50px";
		divAdd.appendChild(txtMulti);

		const btnAdd = document.createElement("input");
		btnAdd.type = "button";
		btnAdd.value = "Add";
		divAdd.appendChild(btnAdd);

		const divTitle = document.createElement("div");
		divTitle.style.position = "absolute";
		divTitle.style.whiteSpace = "nowrap";
		divTitle.style.overflow = "hidden";
		divTitle.style.left = "16px";
		divTitle.style.right = "16px";
		divTitle.style.top = "248px";
		divTitle.style.height = "20px";
		divTitle.className = "view-interfaces-edit-title";
		innerBox.appendChild(divTitle);

		let titleArray = ["Interface", "Speed", "VLAN", "Link"];
		for (let i = 0; i < titleArray.length; i++) {
			const newLabel = document.createElement("div");
			newLabel.textContent = titleArray[i];
			divTitle.appendChild(newLabel);
		}

		const divList = document.createElement("div");
		divList.style.position = "absolute";
		divList.style.left = "16px";
		divList.style.right = "0";
		divList.style.top = "278px";
		divList.style.bottom = "16px";
		divList.style.overflowX = "hidden";
		divList.style.overflowY = "scroll";
		innerBox.appendChild(divList);
 
		let list = [];

		txtNumbering.onchange = ()=> this.InitInterfaceComponents(frame, txtNumbering.value, list, true);

		btnAdd.onclick = ()=> {
			if (list.length + parseInt(txtMulti.value) > 52) return;
			for (let i = 0; i < txtMulti.value; i++) {
				AddInterface(txtPort.value, txtSpeed.value, 1, null, "");
			}
		};

		let lastSelect = null;
		let lastMouseY = 0;
		let lastElementY = 0;

		const AddInterface = (port, speed, vlan, link, comment) => {
			const front = document.createElement("div");
			front.className = "view-interface-port";
			front.style.gridArea = `1 / ${frame.childNodes.length+1}`;
			frame.appendChild(front);

			const icon = document.createElement("div");
			front.appendChild(icon);

			const num = document.createElement("div");
			num.textContent = frame.childNodes.length;
			front.appendChild(num);

			icon.appendChild(document.createElement("div")); //led1
			icon.appendChild(document.createElement("div")); //led2

			const listElement = document.createElement("div");
			listElement.className = "view-interfaces-edit-list-element";
			listElement.style.top = `${divList.childNodes.length * 36}px`;
			divList.appendChild(listElement);

			const divMove = document.createElement("div");
			divMove.style.display = "inline-block";
			listElement.appendChild(divMove);

			const txtP = document.createElement("select");
			listElement.appendChild(txtP);
			for (let i = 0; i < portsArray.length; i++) {
				const optPort = document.createElement("option");
				optPort.value = portsArray[i];
				optPort.textContent = portsArray[i];
				txtP.appendChild(optPort);
			}

			const txtS = document.createElement("select");
			listElement.appendChild(txtS);
			for (let i = 0; i < speedArray.length; i++) {
				const optSpeed = document.createElement("option");
				optSpeed.value = speedArray[i];
				optSpeed.textContent = speedArray[i];
				txtS.appendChild(optSpeed);
			}

			const txtV = document.createElement("input");
			txtV.type = "text";
			txtV.value = vlan;
			listElement.appendChild(txtV);

			const txtL = document.createElement("input");
			txtL.type = "text";
			txtL.setAttribute("readonly", true);
			listElement.appendChild(txtL);

			if (link && link.length > 0) {
				const device = LOADER.devices.data.hasOwnProperty(link);
				if (device) {
					let value;
					if (device.hasOwnProperty("name") && device["name"].v.length > 0) {
						value = device["name"].v;
					}
					else if (device.hasOwnProperty("hostname") && device["hostname"].v.length > 0) {
						value = device["hostname"].v;
					}
					else if (device.hasOwnProperty("ip") && device["ip"].v.length > 0) {
						value = device["ip"].v;
					}

					txtL.value = value;
					const icon = LOADER.deviceIcons.hasOwnProperty(type) ? LOADER.deviceIcons[type] : "mono/gear.svg";
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
				frontElement  : front,
				listElement   : listElement,
				numberElement : num,
				txtPort  : txtP,
				txtSpeed : txtS,
				txtVlan  : txtV,
				txtComm  : txtC,
				link: link
			};
			list.push(obj);

			front.onclick = () => listElement.scrollIntoView({ behavior: "smooth", block: "center" });
			front.onmouseover = () => divMove.style.backgroundColor = "var(--clr-select)";
			front.onmouseleave = () => divMove.style.backgroundColor = "";

			divMove.onmousedown = event => {
				if (event.buttons !== 1) return;
				lastSelect = obj;
				lastMouseY = event.clientY;
				lastElementY = parseInt(lastSelect.listElement.style.top.replace("px", ""));

				lastSelect.listElement.style.zIndex = "1";
				lastSelect.listElement.style.backgroundColor = "var(--clr-pane)";
				lastSelect.listElement.style.transition = "transition .2s";
				lastSelect.frontElement.style.backgroundColor = "var(--clr-select)";
				lastSelect.frontElement.style.boxShadow = "0 -3px 0px 3px var(--clr-select)";
				lastSelect.listElement.childNodes[0].style.backgroundColor = "var(--clr-select)";
			};

			innerBox.parentElement.onmouseup = event => {
				if (lastSelect === null) return;
				lastSelect.listElement.style.zIndex = "0";
				lastSelect.listElement.style.transform = "none";
				lastSelect.listElement.style.boxShadow = "none";
				lastSelect.listElement.style.transition = ".2s";
				lastSelect.frontElement.style.backgroundColor = "";
				lastSelect.frontElement.style.boxShadow = "";
				lastSelect.listElement.childNodes[0].style.backgroundColor = "";

				lastSelect = null;
				SortList();
				this.InitInterfaceComponents(frame, txtNumbering.value, list, true);
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
				this.InitInterfaceComponents(frame, txtNumbering.value, list, true);
			};

			txtP.onchange = () => {
				switch (txtP.value) {
				case "Ethernet": icon.style.backgroundImage = "url(mono/ethernetport.svg)"; break;
				case "SFP"     : icon.style.backgroundImage = "url(mono/sfpport.svg)"; break;
				case "QSFP"     : icon.style.backgroundImage = "url(mono/qsfpport.svg)"; break;
				case "USB"     : icon.style.backgroundImage = "url(mono/usbport.svg)"; break;
				case "Serial"  : icon.style.backgroundImage = "url(mono/serialport.svg)"; break;
				}
				this.InitInterfaceComponents(frame, txtNumbering.value, list, true);
			};

			txtS.onchange =
			txtV.onchange = () => {
				this.InitInterfaceComponents(frame, txtNumbering.value, list, true);
			};

			txtL.ondblclick = () => {
				if (obj.link.length > 0) {
					obj.link = "";
					txtL.value = "";
					txtL.style.backgroundImage = "url(mono/gear.svg)";
				}
			};

			txtL.onclick = () => {
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

				const txtFind = document.createElement("input");
				txtFind.type = "text";
				txtFind.placeholder = "Search";
				frame.appendChild(txtFind);

				const divEquip = document.createElement("div");
				divEquip.className = "no-results";
				divEquip.style.position = "absolute";
				divEquip.style.left = divEquip.style.right = "0";
				divEquip.style.top = "48px";
				divEquip.style.bottom = "52px";
				divEquip.style.overflowY = "auto";
				frame.appendChild(divEquip);

				const btnCloseLink = document.createElement("input");
				btnCloseLink.type = "button";
				btnCloseLink.value = "Close";
				btnCloseLink.style.position = "absolute";
				btnCloseLink.style.width = "72px";
				btnCloseLink.style.left = "calc(50% - 30px)";
				btnCloseLink.style.bottom = "8px";
				frame.appendChild(btnCloseLink);

				btnCloseLink.onclick = () => {
					btnCloseLink.onclick = () => { };
					dim.style.filter = "opacity(0)";
					setTimeout(() => { innerBox.parentElement.removeChild(dim); }, 200);
				};

				txtFind.onchange = txtFind.oninput = () => {
					divEquip.textContent = "";

					let keywords = [];
					if (txtFind.value.trim().length > 0)
						keywords = txtFind.value.trim().toLowerCase().split(" ");

					let EQUIP_LIST_ORDER;
					if (localStorage.hasOwnProperty("deviceslist_columns"))
						EQUIP_LIST_ORDER = JSON.parse(localStorage.getItem("deviceslist_columns"));
					else
						EQUIP_LIST_ORDER = ["name", "type", "hostname", "ip", "manufacturer", "model"];

					for (let file in LOADER.devices.data) {
						let match = true;

						for (let j = 0; j < keywords.length; j++) {
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
						divEquip.appendChild(element);

						const type = LOADER.devices.data[file].hasOwnProperty("type") ? LOADER.devices.data[file]["type"].v : null;

						const icon = document.createElement("div");
						icon.className = "list-element-icon";
						icon.style.backgroundImage = `url(${LOADER.deviceIcons.hasOwnProperty(type) ? LOADER.deviceIcons[type] : "mono/gear.svg"})`;
						element.appendChild(icon);

						for (let j=0; j<6; j++) {
							if (!LOADER.devices.data[file].hasOwnProperty(EQUIP_LIST_ORDER[j])) continue;
							if (LOADER.devices.data[file][EQUIP_LIST_ORDER[j]].v.length === 0) continue;
							const newLabel = document.createElement("div");
							newLabel.style.left = j === 0 ? `calc(32px + ${100 * j / 6}%)` : `${100 * j / 6}%`;
							newLabel.style.width = j === 0 ? `calc(${100 / 6}% - 32px)` : `${100 / 6}%`;
							newLabel.textContent = LOADER.devices.data[file][EQUIP_LIST_ORDER[j]].v;
							element.appendChild(newLabel);
						}

						element.ondblclick = ()=> {
							let value;
							if (LOADER.devices.data[file].hasOwnProperty("name") && LOADER.devices.data[file]["name"].v.length > 0) {
								value = LOADER.devices.data[file]["name"].v;
							}
							else if (LOADER.devices.data[file].hasOwnProperty("hostname") && LOADER.devices.data[file]["hostname"].v.length > 0) {
								value = LOADER.devices.data[file]["hostname"].v;
							}
							else if (LOADER.devices.data[file].hasOwnProperty("ip") && LOADER.devices.data[file]["ip"].v.length > 0) {
								value = LOADER.devices.data[file]["ip"].v;
							}

							obj.link = file;
							txtL.value = value;
							txtL.style.backgroundImage = icon.style.backgroundImage;
							btnCloseLink.onclick();
						};
					}
				};

				txtFind.focus();

				setTimeout(() => { txtFind.onchange(); }, 1);
			};
			
			remove.onclick = () => {
				divList.removeChild(listElement);
				frame.removeChild(front);
				list.splice(list.indexOf(obj), 1);
				SortList();
				this.InitInterfaceComponents(frame, txtNumbering.value, list, true);
			};

			txtP.value = port;
			txtS.value = speed;
			txtP.onchange();

			SortList();
			this.InitInterfaceComponents(frame, txtNumbering.value, list, true);
		};

		const SortList = ()=> {
			list.sort((a, b)=> {
				return a.listElement.getBoundingClientRect().top - b.listElement.getBoundingClientRect().top;
			});

			for (let i=0; i<list.length; i++) {
				list[i].numberElement.textContent = i+1;
				if (lastSelect === null || list[i].listElement !== lastSelect.listElement)
					list[i].listElement.style.top = `${i * 36}px`;
			}
		};

		this.InitInterfaceComponents(frame, txtNumbering.value, list, true);

		if (this.link.hasOwnProperty(".interfaces") && this.link[".interfaces"].v) {
			let obj = JSON.parse(this.link[".interfaces"].v);
			for (let i=0; i<obj.i.length; i++)
				AddInterface(obj.i[i].i, obj.i[i].s, obj.i[i].v, obj.i[i].l, obj.i[i].c);
		}
		else {
			for (let i=0; i<4; i++){
				AddInterface("Ethernet", "1 Gbps", 1, null, "");
			}
		}
		
		btnOK.addEventListener("click", async () => {	
				let interfaces = {
					i: [],
					n: txtNumbering.value
				};
	
				for (let i = 0; i < list.length; i++) {
					interfaces.i.push({
						i: list[i].txtPort.value,
						s: list[i].txtSpeed.value,
						v: list[i].txtVlan.value,
						c: list[i].txtComm.value,
						l: list[i].link
					});
				}

				let obj = {};
				for (let i = 0; i < this.attributes.childNodes.length; i++) {
					if (this.attributes.childNodes[i].childNodes.length < 2) continue;
					let name  = this.attributes.childNodes[i].childNodes[0].value;
					let value = this.attributes.childNodes[i].childNodes[1].firstChild.value;
					obj[name] = {v:value};
				}

				obj[".interfaces"] = {v:JSON.stringify(interfaces)};

				try {
					const response = await fetch(this.params.file ? `db/device/save?file=${this.params.file}` : "db/device/save", {
						method: "POST",
						body: JSON.stringify(obj)
					});
	
					if (response.status !== 200) LOADER.HttpErrorHandler(response.status);
	
					const json = await response.json();
					if (json.error) throw(json.error);
	
					this.params.file = json.filename;
					LOADER.devices.data[json.filename] = obj;
	
					this.InitializePreview();
				}
				catch (ex) {
					setTimeout(()=>{this.ConfirmBox(ex, true, "mono/error.svg")}, 250);
				}
		});
		
	}

	InitInterfaceComponents(frame, numbering, list, editMode) {
		let isMixedInterface = editMode ?
			!list.every(o => o.txtPort.value === list[0].txtPort.value) :
			!list.every(o => o.port === list[0].port);

		let rows = 1, columns = 4;
		if (list.length > 0)
			if (list.length < 16 || list.length < 20 && isMixedInterface) {
				rows = 1;
				columns = list.length;
			}
			else if (list.length <= 52) {
				rows = 2;
				columns = Math.ceil(list.length / 2);
			}
			else {
				rows = Math.ceil(list.length / 24);
				columns = Math.ceil(list.length / rows);
			}

		if (numbering === "vertical") {
			for (let i = 0; i < list.length; i++) {
				list[i].frontElement.style.gridArea = `${i % rows + 1} / ${Math.floor(i / rows) + 1}`;
			}
		}
		else {
			for (let i = 0; i < list.length; i++) {
				list[i].frontElement.style.gridArea = `${Math.floor(i / columns) + 1} / ${(i % columns) + 1}`;
			}
		}
		let size = columns <= 12 ? 50 : 40;

		if (size === 50) {
			for (let i = 0; i < list.length; i++) {
				list[i].frontElement.childNodes[0].style.gridTemplateColumns = "8% 7px auto 7px 8%";
				list[i].frontElement.childNodes[0].style.gridTemplateRows = "auto 4px 16%";
			}
		}
		else {
			for (let i = 0; i < list.length; i++) {
				list[i].frontElement.childNodes[0].style.gridTemplateColumns = "8% 5px auto 5px 8%";
				list[i].frontElement.childNodes[0].style.gridTemplateRows = "auto 3px 24%";
			}
		}

		let vlans = [];
		for (let i = 0; i < list.length; i++) {
			let v = editMode ? list[i].txtVlan.value : list[i].vlan;
			if (v.length === 0) continue;
			if (v === "TRUNK") continue;
			if (!vlans.includes(v)) vlans.push(v);
		}

		for (let i = 0; i < list.length; i++) {
			let led1 = list[i].frontElement.childNodes[0].childNodes[0];
			let led2 = list[i].frontElement.childNodes[0].childNodes[1];

			if (led1) {
				list[i].speedColor = this.GetSpeedColor(editMode ? list[i].txtSpeed.value : list[i].speed);
				led1.style.backgroundColor = list[i].speedColor;
				led1.style.boxShadow = `0 0 4px ${list[i].speedColor}`;
			}

			if (led2) {
				list[i].vlanColor = this.GetVlanColor(editMode ? list[i].txtVlan.value : list[i].vlan, vlans);
				led2.style.backgroundColor = list[i].vlanColor;
				led2.style.boxShadow = `0 0 4px ${list[i].vlanColor}`;
			}

			list[i].frontElement.style.width = `${size - 2}px`;
		}

		frame.style.width = `${columns * size + 28}px`;
		frame.style.gridTemplateColumns = `repeat(${columns}, ${size}px)`;
		frame.style.gridTemplateRows = `repeat(${rows}, $50px)`;
	}
	
	GetSpeedColor(speed) {
		switch (speed) {
		case "10 Mbps" : return "hsl(20,95%,60%)";
		case "100 Mbps": return "hsl(40,95%,60%)";
		case "1 Gbps"  : return "hsl(60,95%,60%)";
		case "2.5 Gbps": return "hsl(70,95%,60%)";
		case "5 Gbps"  : return "hsl(80,95%,60%)";
		case "10 Gbps" : return "hsl(130,95%,60%)";
		case "25 Gbps" : return "hsl(150,95%,60%)";
		case "40 Gbps" : return "hsl(170,95%,60%)";
		case "100 Gbps": return "hsl(190,95%,60%)";
		case "200 Gbps": return "hsl(210,95%,60%)";
		case "400 Gbps": return "hsl(275,95%,60%)";
		case "800 Gbps": return "hsl(295,95%,60%)";
		default: return "transparent";
		}
	}

	GetVlanColor(vlan, array) {
		if (vlan === null || vlan.length === 0) return "transparent";
		if (vlan === "TRUNK") return "#FFFFFF";
		if (array.length < 2) return "transparent";
		let index = array.indexOf(vlan);
		if (index === -1) return "transparent";
		return `hsl(${(240 + index * 1.61803398875 * 360) % 360},95%,60%)`;
	}
	
	Fetch(isNew=false, forceTarget=null) { //override
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

		const grid = document.createElement("div");
		grid.style.display = "grid";
		grid.style.paddingTop = "20px";
		grid.style.gridTemplateColumns = "auto minmax(100px, 200px) 150px auto";
		grid.style.gridTemplateRows = "repeat(4, 34px)";
		grid.style.alignItems = "center";
		dialog.innerBox.appendChild(grid);

		const chkDns = document.createElement("input");
		chkDns.type = "checkbox";
		chkDns.checked = true;
		chkDns.disabled = true;
		grid.appendChild(chkDns);
		const dns = this.AddCheckBoxLabel(grid, chkDns, "DNS");
		dns.style.gridArea = "1 / 2";

		const chkWmi = document.createElement("input");
		chkWmi.type = "checkbox";
		chkWmi.checked = true;
		grid.appendChild(chkWmi);
		const wmi = this.AddCheckBoxLabel(grid, chkWmi, "WMI");
		wmi.style.gridArea = "2 / 2";

		const chkSnmp = document.createElement("input");
		chkSnmp.type = "checkbox";
		chkSnmp.checked = false;
		chkSnmp.disabled = true; //TODO:
		grid.appendChild(chkSnmp);
		const snmp = this.AddCheckBoxLabel(grid, chkSnmp, "SNMP");
		snmp.style.gridArea = "3 / 2";

		const txtSnmp = document.createElement("select");
		txtSnmp.style.marginLeft = "0";
		txtSnmp.style.width = "160px";
		txtSnmp.style.gridArea = "3 / 3";
		txtSnmp.disabled = true;
		grid.appendChild(txtSnmp);

		const optVer2 = document.createElement("option");
		optVer2.value = "2";
		optVer2.text = "Version 2";
		txtSnmp.appendChild(optVer2);

		const optVer3 = document.createElement("option");
		optVer3.value = "3";
		optVer3.text = "Version 3";
		txtSnmp.appendChild(optVer3);

		txtSnmp.value = "3";

		const chkKerberos = document.createElement("input");
		chkKerberos.type = "checkbox";
		chkKerberos.checked = true;
		grid.appendChild(chkKerberos);
		const kerberos = this.AddCheckBoxLabel(grid, chkKerberos, "Kerberos");
		kerberos.style.gridArea = "4 / 2";

		const chkPortScan = document.createElement("input");
		chkPortScan.type = "checkbox";
		chkPortScan.checked = true;
		grid.appendChild(chkPortScan);
		const portScan = this.AddCheckBoxLabel(grid, chkPortScan, "Port scan");
		portScan.style.gridArea = "5 / 2";

		const txtPortScan = document.createElement("select");
		txtPortScan.style.marginLeft = "0";
		txtPortScan.style.width = "160px";
		txtPortScan.style.gridArea = "5 / 3";
		grid.appendChild(txtPortScan);

		const optBasic = document.createElement("option");
		optBasic.value = "basic";
		optBasic.text = "Basic";
		txtPortScan.appendChild(optBasic);

		const optWellKnown = document.createElement("option");
		optWellKnown.value = "wellknown";
		optWellKnown.text = "Well known ports (1-1023)";
		txtPortScan.appendChild(optWellKnown);

		const optExtended = document.createElement("option");
		optExtended.value = "extended";
		optExtended.text = "Extended (1-8191)";
		txtPortScan.appendChild(optExtended);

		chkSnmp.onchange = ()=> {
			if (chkSnmp.checked) {
				txtSnmp.disabled = false;
			}
			else {
				txtSnmp.disabled = true;
			}
		};
		
		chkPortScan.onchange = ()=> {
			if (chkPortScan.checked) {
				txtPortScan.disabled = false;
			}
			else {
				txtPortScan.disabled = true;
			}
		};
		
		dialog.btnOK.onclick = async ()=> {
			dialog.innerBox.textContent = "";
			dialog.btnOK.style.display = "none";

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
			dialog.btnCancel.addEventListener("click", ()=>{
				isCanceled = true;
			});

			try {
				let url = `fetch/singledevice?target=${target}`;
				if (chkWmi.checked)      url += `&wmi=true`;
				if (chkSnmp.checked)     url += `&snmp=${txtSnmp.value}`;
				if (chkKerberos.checked) url += `&kerberos=true`;
				if (chkPortScan.checked) url += `&portscan=${txtPortScan.value}`;

				const response = await fetch(url);
	
				if (response.status !== 200) LOADER.HttpErrorHandler(response.status);
				
				const json = await response.json();
				if (json.error) {
					throw new Error(json.error);
				}
	
				dialog.btnCancel.onclick();

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
				dialog.btnCancel.value = "Close";

				const errorBox = document.createElement("div");
				errorBox.textContent = ex;
				errorBox.style.textAlign = "center";
				errorBox.style.fontWeight = "600";
				errorBox.style.padding = "20px";
				dialog.innerBox.appendChild(errorBox);
			}
		};

		dialog.btnOK.focus();
	}

	Clone() { //override
		new DeviceView({clone: this.params.file});
	}
	
	Delete() { //override
		this.ConfirmBox("Are you sure you want to delete this device?", false, "mono/delete.svg").addEventListener("click", async ()=> {
			try {
				const response = await fetch(`db/device/delete?file=${this.params.file}`);

				if (response.status !== 200) LOADER.HttpErrorHandler(response.status);
				const json = await response.json();

				if (json.error) throw(json.error);
	
				delete LOADER.devices.data[this.params.file];
				LOADER.devices.length--;
	
				for (let i = 0; i < WIN.array.length; i++) {
					if (WIN.array[i] instanceof DevicesList) {
						let element = Array.from(WIN.array[i].list.childNodes).filter(o=>o.getAttribute("id") === this.params.file);
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
}
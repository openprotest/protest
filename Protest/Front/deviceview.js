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
			let date      = new Date();

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

		if ((this.link.hasOwnProperty("ports"))) {
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
			this.liveC.textContent = "";

			this.liveStatsWebSockets.send(this.params.file)
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
							if (WIN.array[k] instanceof User && WIN.array[k].params.file === found) {
								WIN.array[k].Minimize();
								return;
							}
						}
						new User(found);
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

		const GenerateGraph = (data, type)=> {
			const graphBox = document.createElement("div");
			graphBox.className = "view-lifeline-graph";
			this.liveC.appendChild(graphBox);

			const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
			svg.setAttribute("width", 800);
			svg.setAttribute("height", 128);
			svg.style.outline = "none";
			graphBox.appendChild(svg);

			console.log(type);

			if (type === "ping") {
				for (let i=0; i<data.length; i++) {
					const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
					dot.setAttribute("cx", 760 - (Date.now() - data[i].d) / DeviceView.DAY_TICKS * 50);
					dot.setAttribute("cy", 100 - data[i].v * 10);
					dot.setAttribute("r", 4);
					dot.setAttribute("fill", this.StatusToColor(data[i].v));
					svg.appendChild(dot);
				}
			}
			else {

			}

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

			GenerateGraph(data, "ping");
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

			GenerateGraph(data, "vol");
		}

		if (diskArray.length > 0) {
			let data = [];
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

					data.push({d:date, v:used, t:total, c:caption});
				}
				index += 17*count;
			}

			GenerateGraph(data, "vol");
		}
	}

	StatusToColor(status) {
		if (status === -1) { //unreachable
			return "var(--clr-error)";
		}
		else if (status === -2) { //expired
			return "var(--clr-orange)";
		}
		else if (status === -3) { //warning
			return "var(--clr-warning)";
		}
		else if (status === -4) { //tls not yet valid
			return "rgb(0,162,232)";
		}
		else if (status >=0) { //alive
			return UI.PingColor(status);
		}
		else { //other
			return "rgb(128,128,128)";
		}
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
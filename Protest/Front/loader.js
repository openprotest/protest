console.log("%cWarning:", "color:#FFBA00; font-weight:bold; font-size:20px");
console.log("%c Don't copy-paste any code into this console. Unauthorized code execution may compromise your data. Always ensure the source and legitimacy of any code you execute. ", "background:#FFBA00; color:#202020; font-weight:bold");

const LOADER = {
	devices: {},
	users: {},

	deviceIcons : {
		"access point"        : "mono/accesspoint.svg",
		"antenna"             : "mono/antenna.svg",
		"camera"              : "mono/camera.svg",
		"copy machine"        : "mono/copymachine.svg",
		"credit card machine" : "mono/creditcardmachine.svg",
		"fax"                 : "mono/fax.svg",
		"firewall"            : "mono/firewall.svg",
		"hypervisor"          : "mono/hypervisor.svg",
		"ip phone"            : "mono/ipphone.svg",
		"lamp"                : "mono/lamp.svg",
		"laptop"              : "mono/laptop.svg",
		"nas"                 : "mono/server.svg",
		"media player"        : "mono/mediaplayer.svg",
		"music player"        : "mono/mediaplayer.svg",
		"multiprinter"        : "mono/multiprinter.svg",
		"mobile phone"        : "mono/mobilephone.svg",
		"telephone"           : "mono/phone.svg",
		"printer"             : "mono/printer.svg",
		"point of sale"       : "mono/pos.svg",
		"pos"                 : "mono/pos.svg",
		"ticket printer"      : "mono/ticketprinter.svg",
		"router"              : "mono/router.svg",
		"scanner"             : "mono/scanner.svg",
		"serial converter"    : "mono/serialconverter.svg",
		"server"              : "mono/server.svg",
		"switch"              : "mono/switch.svg",
		"tablet"              : "mono/tablet.svg",
		"tv"                  : "mono/tv.svg",
		"ups"                 : "mono/ups.svg",
		"virtual machine"     : "mono/virtualmachine.svg",
		"workstation"         : "mono/workstation.svg"
	},

	userIcons : {
		"domain user"  : "mono/domainuser.svg",
		"address book" : "mono/contact.svg",
		"hidden"       : "mono/hiddenuser.svg",
		"credentials"  : "mono/credential.svg"
	},

	baseStyles: [
		"window.css",
		"ui.css",
		"tip.css",
		"button.css",
		"textbox.css",
		"checkbox.css",
		"radio.css",
		"range.css"
	],

	baseScripts: [
		"ui.js",
		"window.js"
	],

	primaryScripts: [
		"keepalive.js",
		"list.js"
	],

	secondaryScripts: [
		"tabs.js",
		"view.js",
		"grid.js",
		"console.js",
		"terminal.js",
		"ipbox.js"
	],

	tertiaryScripts: [
		"about.js",
		"addressbook.js",
		"chat.js",
		"documentation.js",
		"debitnotes.js",
		"watchdog.js",
		"personalize.js",
		"settings.js",
		"rbac.js",
		"deviceslist.js",
		"userslist.js",
		"deviceview.js",
		"userview.js",
		"devicesgrid.js",
		"usersgrid.js",
		"monitor.js",
		"fetch.js",
		"hexviewer.js",
		"issues.js",
		"ping.js",
		"dnslookup.js",
		"mdns.js",
		"traceroute.js",
		"portscan.js",
		"locateip.js",
		"maclookup.js",
		"dhcpdiscover.js",
		"ntpclient.js",
		"telnet.js",
		"ssh.js",
		"wmi.js",
		"snmp.js",
		"speedtest.js",
		"sitecheck.js",
		"reverseproxy.js",
		"passwordgen.js",
		"passwordstrength.js",
		"gandalf.js",
		"encoder.js",
		"netcalc.js",
		"keyboardtester.js",
		"mictester.js",
		"cameratester.js",
		"screencapture.js",
		"automation.js",
		"certificates.js",
		"backup.js",
		"log.js"
	],

	Initialize: ()=> {
		const device_type_autofill = document.createElement("datalist"); //autofill type
		device_type_autofill.id = "device_type_autofill";
		document.body.appendChild(device_type_autofill);
		for (let o in LOADER.deviceIcons) {
			const option = document.createElement("option");
			option.value = o.charAt(0).toUpperCase() + o.substring(1);
			device_type_autofill.appendChild(option);
		}

		const user_type_autofill = document.createElement("datalist"); //autofill type
		user_type_autofill.id = "user_type_autofill";
		document.body.appendChild(user_type_autofill);
		for (let o in LOADER.userIcons) {
			const option = document.createElement("option");
			option.value = o.charAt(0).toUpperCase() + o.substring(1);
			user_type_autofill.appendChild(option);
		}

		let count = 0;
		const total = LOADER.baseStyles.length + LOADER.baseScripts.length + LOADER.primaryScripts.length + LOADER.secondaryScripts.length + LOADER.tertiaryScripts.length + 2;

		const callbackHandle = (status, filename)=> {
			loadingbar.style.width = 100 * ++count / total + "%";

			if (LOADER.baseStyles.length + LOADER.baseScripts.length === count) { //load primary
				for (let i = 0; i < LOADER.primaryScripts.length; i++) {
					LOADER.LoadScript(LOADER.primaryScripts[i], callbackHandle);
				}
			}
			else if (LOADER.baseStyles.length + LOADER.baseScripts.length + LOADER.primaryScripts.length === count) { //load secondary
				UI.Initialize();
				for (let i = 0; i < LOADER.secondaryScripts.length; i++) {
					LOADER.LoadScript(LOADER.secondaryScripts[i], callbackHandle);
				}
			}
			else if (LOADER.baseStyles.length + LOADER.baseScripts.length + LOADER.primaryScripts.length + LOADER.secondaryScripts.length === count) { //load tertiary
				for (let i = 0; i < LOADER.tertiaryScripts.length; i++)
					LOADER.LoadScript(LOADER.tertiaryScripts[i], callbackHandle);
			}
			else if (count === total - 2) { //js is done, load db
				LOADER.LoadDevices(callbackHandle);
				LOADER.LoadUsers(callbackHandle);
			}
			else if (count === total) { //all done
				KEEP.Initialize();

				setTimeout(()=> {
					loadingcontainer.style.filter = "opacity(0)";
					setTimeout(()=> container.removeChild(loadingcontainer), 200);
					setTimeout(()=> LOADER.RestoreSession(), 250); //restore previous session
				}, 200);
			}
		};

		for (let i = 0; i < LOADER.baseStyles.length; i++) {
			LOADER.LoadStyle(LOADER.baseStyles[i], callbackHandle);
		}

		for (let i = 0; i < LOADER.baseScripts.length; i++) {
			LOADER.LoadScript(LOADER.baseScripts[i], callbackHandle);
		}
	},

	LoadStyle: (filename, callback)=> {
		if (document.head.querySelectorAll(`link[href$='${filename}']`).length > 0) {
			callback("exists", filename);
			return;
		}

		const cssLink = document.createElement("link");
		cssLink.rel = "stylesheet";
		cssLink.href = filename;
		document.head.appendChild(cssLink);

		cssLink.onload = ()=> callback("ok", filename);
		cssLink.onerror = ()=> callback("error", filename);
	},

	LoadScript: (filename, callback)=> {
		if (document.head.querySelectorAll(`script[src$='${filename}']`).length > 0) {
			callback("exists", filename);
			return;
		}

		const script = document.createElement("script");
		script.setAttribute("defer", true);
		script.src = filename;
		document.body.appendChild(script);

		script.onload = ()=> callback("ok", filename);
		script.onerror = ()=> callback("error", filename);
	},

	LoadDevices: async callback=> {
		try {
			const response = await fetch("db/device/list");
			LOADER.devices = await response.json();
			callback("ok", "devices");
		}
		catch (ex) {
			LOADER.devices = {version: 0, length: 0, data: {}};
			callback(ex, "devices");
		}
	},

	LoadUsers: async callback=> {
		try {
			const response = await fetch("db/user/list");
			LOADER.users = await response.json();
			callback("ok", "users");
		}
		catch (ex) {
			LOADER.users = {version: 0, length: 0, data: {}};
			callback(ex, "users");
		}
	},

	StoreSession: ()=> {
		let session = [];

		if (localStorage.getItem("restore_session") === "true")
			for (let i = 0; i < WIN.array.length; i++)
				session.push({
					class: WIN.array[i].constructor.name,
					args: WIN.array[i].args,
					isMaximized: WIN.array[i].isMaximized,
					isMinimized: WIN.array[i].isMinimized,
					position: WIN.array[i].position,
					left: WIN.array[i].win.style.left,
					top: WIN.array[i].win.style.top,
					width: WIN.array[i].win.style.width,
					height: WIN.array[i].win.style.height
				});

		localStorage.setItem("session", JSON.stringify(session));

		return session;
	},

	RestoreSession: ()=> {
		let session = localStorage.getItem("session") ? JSON.parse(localStorage.getItem("session")) : {};
		if (localStorage.getItem("restore_session") != "true") return;
		if (session == null || session.length == 0) return;

		for (let i = 0; i < session.length; i++) {
			let win = LOADER.Invoke(session[i]);

			if (win) {
				if (session[i].isMaximized) win.Toggle();
				if (session[i].isMinimized) win.Minimize();
				win.position = session[i].position;

				if (!WIN.alwaysMaxed) {
					win.win.style.left = session[i].left;
					win.win.style.top = session[i].top;
					win.win.style.width = session[i].width;
					win.win.style.height = session[i].height;
				}
			}
		}
	},

	Invoke: (command)=> {
		switch (command.class) {
		case "DeviceView": return LOADER.OpenDeviceByFile(command.args.file);
		case "UserView"  : return LOADER.OpenUserByFile(command.args.file);

		case "DevicesList"      : return new DevicesList(command.args);
		case "UsersList"        : return new UsersList(command.args);
		case "DevicesGrid"      : return new DevicesGrid(command.args);
		case "UsersGrid"        : return new UsersGrid(command.args);
		case "PasswordStrength" : return new PasswordStrength(command.args);
		case "Gandalf"          : return new Gandalf(command.args);
		case "Fetch"            : return new Fetch(command.args);
		case "Monitor"          : return new Monitor(command.args);

		case "AddressBook"   : return new AddressBook(command.args);
		case "Chat"          : return new Chat(command.args);
		case "Documentation" : return new Documentation(command.args);
		case "DebitNotes"    : return new DebitNotes(command.args);
		case "Watchdog"      : return new Watchdog(command.args);

		case "Issues"    : return new Issues(command.args);

		case "HexViewer" : return new HexViewer(command.args);

		case "Ping"         : return new Ping(command.args);
		case "DnsLookup"    : return new DnsLookup(command.args);
		case "Mdns"    : return new Mdns(command.args);
		case "TraceRoute"   : return new TraceRoute(command.args);
		case "SpeedTest"    : return new SpeedTest(command.args);
		case "PortScan"     : return new PortScan(command.args);
		case "MacLookup"    : return new MacLookup(command.args);
		case "LocateIp"     : return new LocateIp(command.args);
		case "DhcpDiscover" : return new DhcpDiscover(command.args);
		case "NtpClient"    : return new NtpClient(command.args);
		case "SiteCheck"    : return new SiteCheck(command.args);
		case "ReverseProxy" : return new ReverseProxy(command.args);
		case "Telnet"       : return new Telnet(command.args);
		case "Ssh"          : return new Ssh(command.args);
		case "Wmi"          : return new Wmi(command.args);
		case "Snmp"         : return new Snmp(command.args);

		case "PassGen"        : return new PassGen(command.args);
		case "Encoder"        : return new Encoder(command.args);
		case "NetCalc"        : return new NetCalc(command.args);
		case "KeyboardTester" : return new KeyboardTester(command.args);
		case "MicTester"      : return new MicTester(command.args);
		case "CameraTester"   : return new CameraTester(command.args);
		case "ScreenCapture"  : return new ScreenCapture(command.args);

		case "About"        : return new About(command.args);
		case "Settings"     : return new Settings(command.args);
		case "Personalize"  : return new Personalize(command.args);
		case "AccessControl": return new AccessControl(command.args);
		case "Automation"   : return new Automation(command.args);
		case "Certificates" : return new Certificates(command.args);
		case "Backup"       : return new Backup(command.args);
		case "Log"          : return new Log(command.args);
		}
	},

	OpenDeviceByFile: file=> {
		for (let i=0; i<WIN.array.length; i++) {
			if (WIN.array[i] instanceof DeviceView && WIN.array[i].args.file === file) {
				WIN.array[i].Pop(); //minimize/restore
				return WIN.array[i];
			}
		}

		return new DeviceView({ file: file });
	},

	OpenUserByFile: file=> {
		for (let i=0; i<WIN.array.length; i++) {
			if (WIN.array[i] instanceof UserView && WIN.array[i].args.file === file) {
				WIN.array[i].Pop(); //minimize/restore
				return WIN.array[i];
			}
		}

		return new UserView({ file: file });
	},

	HttpErrorHandler: statusCode=> {
		switch (statusCode) {
		case 401: throw new Error("Unauthorized user or authorization expired");
		case 403: throw new Error("Insufficient permissions");
		default: throw new Error(`Server responded with: ${statusCode}`);
		}
	}
};

LOADER.Initialize();
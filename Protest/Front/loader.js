console.log("%cWarning:", "color:#FFBA00; font-weight:bold; font-size:20px");
console.log("%c For security reasons, don't copy-paste any code into this console. Unauthorized code execution may compromise your data. Always ensure the source and legitimacy of any code you execute. ", "background:#FFBA00; color:#202020; font-weight:bold");

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
		"acl.js",
		"deviceslist.js",
		"userslist.js",
		"deviceview.js",
		"userview.js",
		"devicesgrid.js",
		"usersgrid.js",
		"fetch.js",
		"hexviewer.js",
		"ping.js",
		"dnslookup.js",
		"traceroute.js",
		"portscan.js",
		"locateip.js",
		"maclookup.js",
		"dhcpdiscover.js",
		"ntpclient.js",
		"telnet.js",
		"wmi.js",
		"speedtest.js",
		"sitecheck.js",
		"passwordgen.js",
		"passwordstrength.js",
		"gandalf.js",
		"encoder.js",
		"netcalc.js",
		"keyboardtester.js",
		"mictester.js",
		"webcamtester.js",
		"screencapture.js",
		"automation.js",
		"log.js"
	],

	Initialize: ()=> {
		const device_type_autofill = document.createElement("datalist"); //autofill type
		device_type_autofill.id = "device_type_autofill";
		document.body.appendChild(device_type_autofill);
		for (let o in LOADER.deviceIcons) {
			const opt = document.createElement("option");
			opt.value = o.charAt(0).toUpperCase() + o.substring(1);
			device_type_autofill.appendChild(opt);
		}

		const user_type_autofill = document.createElement("datalist"); //autofill type
		user_type_autofill.id = "user_type_autofill";
		document.body.appendChild(user_type_autofill);
		for (let o in LOADER.userIcons) {
			const opt = document.createElement("option");
			opt.value = o.charAt(0).toUpperCase() + o.substring(1);
			user_type_autofill.appendChild(opt);
		}
		
		
		let count = 0;
		const total = LOADER.baseStyles.length + LOADER.baseScripts.length + LOADER.primaryScripts.length + LOADER.secondaryScripts.length + LOADER.tertiaryScripts.length + 2;

		const callbackHandle = (status, filename)=> {
			loadingbar.style.width = 100 * ++count / total + "%";

			if (LOADER.baseStyles.length + LOADER.baseScripts.length === count) { //load primary
				for (let i = 0; i < LOADER.primaryScripts.length; i++)
					LOADER.LoadScript(LOADER.primaryScripts[i], callbackHandle);
			}
			else if (LOADER.baseStyles.length + LOADER.baseScripts.length + LOADER.primaryScripts.length === count) { //load secondary
				UI.Initialize();
				for (let i = 0; i < LOADER.secondaryScripts.length; i++)
					LOADER.LoadScript(LOADER.secondaryScripts[i], callbackHandle);
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

		for (let i = 0; i < LOADER.baseStyles.length; i++)
			LOADER.LoadStyle(LOADER.baseStyles[i], callbackHandle);

		for (let i = 0; i < LOADER.baseScripts.length; i++)
			LOADER.LoadScript(LOADER.baseScripts[i], callbackHandle);
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
					params: WIN.array[i].params,
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
	
				if (!WIN.always_maxed) {
					win.win.style.left = session[i].left;
					win.win.style.top = session[i].top;
					win.win.style.width = session[i].width;
					win.win.style.height = session[i].height;
				}
			}
		}
	},

	Invoke: (session)=> {
		let win;

		switch (session.class) {
		case "About"       : win = new About(session.params); break;
		case "Settings"    : win = new Settings(session.params); break;
		case "Personalize" : win = new Personalize(session.params); break;
		case "Acl"         : win = new Acl(session.params); break;
			
		case "DevicesList"      : win = new DevicesList(session.params); break;
		case "UsersList"        : win = new UsersList(session.params); break;
		case "DeviceView"       : win = new DeviceView(session.params); break;
		case "UserView"         : win = new UserView(session.params); break;
		case "DevicesGrid"      : win = new DevicesGrid(session.params); break;
		case "UsersGrid"        : win = new UsersGrid(session.params); break;
		case "PasswordStrength" : win = new PasswordStrength(session.params); break;
		case "Gandalf"          : win = new Gandalf(session.params); break;
		case "Fetch"            : win = new Fetch(session.params); break;

		case "AddressBook"   : win = new AddressBook(session.params); break;
		case "Chat"          : win = new Chat(session.params); break;
		case "Documentation" : win = new Documentation(session.params); break;
		case "DebitNotes"    : win = new DebitNotes(session.params); break;
		case "Watchdog"      : win = new Watchdog(session.params); break;

		case "HexViewer" : win = new HexViewer(session.params); break;
			
		case "Ping"         : win = new Ping(session.params); break;
		case "DnsLookup"    : win = new DnsLookup(session.params); break;
		case "TraceRoute"   : win = new TraceRoute(session.params); break;
		case "SpeedTest"    : win = new SpeedTest(session.params); break;
		case "PortScan"     : win = new PortScan(session.params); break;
		case "MacLookup"    : win = new MacLookup(session.params); break;
		case "LocateIp"     : win = new LocateIp(session.params); break;
		case "DhcpDiscover" : win = new DhcpDiscover(session.params); break;
		case "NtpClient"    : win = new NtpClient(session.params); break;
		case "SiteCheck"     : win = new SiteCheck(session.params); break;

		case "Telnet" : win = new Telnet(session.params); break;
		case "Wmi"    : win = new Wmi(session.params); break;

		case "PassGen"        : win = new PassGen(session.params); break;
		case "Encoder"        : win = new Encoder(session.params); break;
		case "NetCalc"        : win = new NetCalc(session.params); break;
		case "KeyboardTester" : win = new KeyboardTester(session.params); break;
		case "MicTester" : win = new MicTester(session.params); break;
		case "WebcamTester" : win = new WebcamTester(session.params); break;
		case "ScreenCapture" : win = new ScreenCapture(session.params); break;

		case "Automation" : win = new Automation(session.params); break;
		case "Log"        : win = new Log(session.params); break;
		}

		return win;
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
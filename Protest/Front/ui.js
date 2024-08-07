const UNIX_BASE_TICKS = 62135596800000; //divided by 10000

const UI = {
	lastActivity: Date.now(),
	lastUpdateFilter: "",
	regionalFormat: "sys",
	onMobile: (/Android|webOS|iPhone|iPad|iPod|Opera Mini/i.test(navigator.userAgent)),
	taskbarPosition: "bottom",

	Initialize: ()=> {
		for (let i=0; i<12; i++) { //clock dots
			const newDot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
			newDot.setAttribute("r", i % 3 == 0 ? 2.5 : 1.5);
			newDot.setAttribute("cx", 48 + Math.sin(i * 30 / 57.29577951) * 36);
			newDot.setAttribute("cy", 48 - Math.cos(i * 30 / 57.29577951) * 36);
			newDot.setAttribute("fill", "#000");
			analog_clock_mask.appendChild(newDot);
		}

		//automatically disable animations if prefers-reduced-motion
		if (window.matchMedia('(prefers-reduced-motion)').matches && localStorage.getItem("animations") === null) {
			localStorage.setItem("animations", "false");
		}

		WIN.alwaysMaxed = localStorage.getItem("w_always_maxed") === "true";
		taskbar.className = localStorage.getItem("w_tasktooltip") === "false" ? "no-tooltip" : "";
		document.body.className = localStorage.getItem("animations") !== "false" ? "" : "disable-animations";

		analog_clock.style.visibility = date_calendar.style.visibility = localStorage.getItem("desk_datetime") !== "false" ? "visible" : "hidden";
		analog_clock.style.opacity    = date_calendar.style.opacity    = localStorage.getItem("desk_datetime") !== "false" ? "1" : "0";

		container.className = "";
		if (localStorage.getItem("w_popout") !== "true") container.classList.add("no-popout");
		if (localStorage.getItem("w_dropshadow") === "false") container.classList.add("disable-window-dropshadows");
		if (localStorage.getItem("glass") === "true") container.classList.add("glass");

		let accentColor;
		try {
			accentColor = localStorage.getItem("accent_color") ?
				JSON.parse(localStorage.getItem("accent_color")) : [255, 102, 0];
		}
		catch {
			localStorage.removeItem("accent_color");
			accentColor = [];
		}

		let accentSaturation = localStorage.getItem("accent_saturation") ?
			localStorage.getItem("accent_saturation") : 100;

		if (accentSaturation !== 100) {
			UI.SetAccentColor(accentColor, accentSaturation / 100);
		}

		let scrollBarStyle = localStorage.getItem("scrollbar_style") ?
		localStorage.getItem("scrollbar_style") : "thin";
		container.classList.add(`scrollbar-${scrollBarStyle}`);

		UI.SetTaskbarPosition(localStorage.getItem("taskbar_position") ?? "bottom");

		UI.regionalFormat = localStorage.getItem("regional_format") ?
			localStorage.getItem("regional_format") : "sys";

		MENU.isAttached = localStorage.getItem("menu_attached") !== "false" ?? true;

		if (MENU.isAttached) {
			MENU.Attach();
		}
		else {
			MENU.Detach();
		}

		const pos = JSON.parse(localStorage.getItem("menu_button_pos"));
		if (pos) {
			menubutton.style.borderRadius = pos.borderRadius;
			menubutton.style.left = pos.left;
			menubutton.style.top = pos.top;
			menubutton.style.width = pos.width;
			menubutton.style.height = pos.height;

			const logo = menubutton.children[0];
			logo.style.left = pos.l_left;
			logo.style.top = pos.l_top;
			logo.style.width = pos.l_width;
			logo.style.height = pos.l_height;

			MENU.UpdatePosition();
		}
	},

	PromptAgent: (parent, command, value)=>{
		let key = localStorage.getItem("agent_key");

		if (!key) {
			const okButton = parent.ConfirmBox("Agent is not configured", false, "mono/agent.svg");
			okButton.value = "Configure";
			okButton.addEventListener("click", ()=>{new Personalize("agent")});
			return;
		}

		let url = btoa(`${key}${String.fromCharCode(127)}${command}${String.fromCharCode(127)}${value}`);
		const iframe = document.createElement("iframe");
		iframe.src = `protest://${url}`;
		iframe.style.border = "none";
		parent.win.appendChild(iframe);
		setTimeout(()=>{ parent.win.removeChild(iframe); }, 200);
	},

	SetAccentColor: (accent, saturation)=> {
		let hsl = UI.RgbToHsl(accent);

		let step1 = `hsl(${hsl[0] - 4},${hsl[1] * saturation}%,${hsl[2] * .78}%)`;
		let step2 = `hsl(${hsl[0] + 7},${hsl[1] * saturation}%,${hsl[2] * .9}%)`; //--clr-select
		let step3 = `hsl(${hsl[0] - 4},${hsl[1] * saturation}%,${hsl[2] * .8}%)`;
		let gradient = `linear-gradient(to bottom, ${step1}0%, ${step2}92%, ${step3}100%)`;

		let root = document.documentElement;
		root.style.setProperty("--clr-accent", `hsl(${hsl[0]},${hsl[1] * saturation}%,${hsl[2]}%)`);
		root.style.setProperty("--clr-select", step2);
		root.style.setProperty("--clr-transparent", `hsla(${hsl[0]},${hsl[1] * saturation}%,${hsl[2]}%,.6)`);
		root.style.setProperty("--grd-taskbar", gradient);
		root.style.setProperty("--grd-taskbar-rev", `linear-gradient(to bottom, ${step3}0%, ${step2}2%, ${step1}100%)`);

		let ico = "<svg version=\"1.1\" xmlns=\"http://www.w3.org/2000/svg\" x=\"0px\" y=\"0px\" width=\"48px\" height=\"48px\" viewBox=\"0 0 48 48\">" +
			"<g fill=\"" + step2 + "\">" +
			"<path d=\"M26.935,0.837h7.491l0.624,14.984l-8.24,1.873L26.935,0.837z\"/>" +
			"<path d=\"M38.172,19.068l-3.871,8.866l-22.974,9.489l0.125-8.44l13.412-2.299V15.821L1.712,20.566l1.998,26.221 l42.579,0.375l-0.249-30.466L38.172,19.068z\"/>" +
			"<path d=\"M4.459,0.837l0.374,16.857l8.741-1.873l-0.5-14.984H4.459z\"/>" +
			"<path d=\"M15.821,0.837h7.304L24,13.2l-8.054,1.498L15.821,0.837z\"/>" +
			"<path d=\"M37.672,0.837h7.367l1.249,12.986l-8.491,1.998L37.672,0.837z\"/>" +
			"</g></svg>";

		favicon.href = "data:image/svg+xml;base64," + btoa(ico);
	},

	SetTaskbarPosition: position=> {
		UI.taskbarPosition = position;
		WIN.AlignIcon();
		UI.RearrangeWorkspace(position);
		MENU.UpdatePosition();
	},

	RearrangeWorkspace: position=> {
		const padding = 0;

		taskbar.classList.remove("taskbar-top", "taskbar-left", "taskbar-right", "taskbar-bottom");
		taskbar.classList.add(`taskbar-${position}`);

		switch (position) {
		case "top":
			taskbar.style.width = "unset";
			taskbar.style.height = `${WIN.iconSize}px`;
			container.style.inset = `${WIN.iconSize + padding}px ${padding}px ${padding}px ${padding}px`;
			break;

		case "left":
			taskbar.style.width = `${WIN.iconSize}px`;
			taskbar.style.height = "unset";
			container.style.inset = `${padding}px ${padding}px ${padding}px ${WIN.iconSize + padding}px`;
			break;

		case "right":
			taskbar.style.width = `${WIN.iconSize}px`;
			taskbar.style.height = "unset";
			container.style.inset = `${padding}px ${WIN.iconSize + padding}px ${padding}px ${padding}px`;
			break;

		default: //bottom
			taskbar.style.width = "unset";
			taskbar.style.height = `${WIN.iconSize}px`;
			container.style.inset = `${padding}px ${padding}px ${WIN.iconSize + padding}px ${padding}px`;
			break;
		}
	},

	RgbToHsl: color=> {
		let r = color[0] / 255;
		let g = color[1] / 255;
		let b = color[2] / 255;

		let min = Math.min(r, g, b);
		let max = Math.max(r, g, b);
		let delta = max - min;

		let h, s, l;

		if (delta == 0) h = 0;
		else if (max == r) h = ((g - b) / delta) % 6;
		else if (max == g) h = (b - r) / delta + 2;
		else h = (r - g) / delta + 4;

		h = Math.round(h * 60);

		if (h < 0) h += 360;

		l = (max + min) / 2;
		s = delta == 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
		s = +(s * 100).toFixed(1);
		l = +(l * 100).toFixed(1);

		return [h, s, l];
	},

	PingColor(pingResult, lightness=50) {
		if (isNaN(pingResult)) {
			return (pingResult === "Timed out") ? "var(--clr-error)" : "var(--clr-orange)";
		}

		if (pingResult === -1) {
			return "rgb(192,192,192)";
		}

		if (pingResult > 500) {
			pingResult = 500;
		}

		let calculatedLightness =
			pingResult > 260 && pingResult <= 400
			? lightness + (70 - Math.abs(pingResult - 330)) / 3
			: lightness;

		let calculatedSaturation =
			pingResult > 260 && pingResult <= 400
			? 66 + (70 - Math.abs(pingResult - 330)) / 2
			: 66;

		return `hsl(${Math.round(92 + pingResult / 2.2)},${calculatedSaturation}%,${calculatedLightness}%)`;
	},

	TicksToUnixDate: ticks=> {
		ticks = ticks.toString();
		ticks = parseInt(ticks.substring(0, ticks.length - 4));
		return ticks - UNIX_BASE_TICKS;
	},

	UnixDateToTicks: long=> {
		return (long + UNIX_BASE_TICKS) * 10000;
	},

	SizeToString: size=> {
		if (size < 8_192) return `${size} bytes`;
		if (size < 8_192 * 1024) return `${(size / 1024).toFixed(2)} KB`;
		if (size < 8_192 * Math.pow(1024,2)) return `${(size / Math.pow(1024,2)).toFixed(2)} MB`;
		if (size < 8_192 * Math.pow(1024,3)) return `${(size / Math.pow(1024,3)).toFixed(2)} GB`;
		if (size < 8_192 * Math.pow(1024,4)) return `${(size / Math.pow(1024,4)).toFixed(2)} TB`;
		if (size < 8_192 * Math.pow(1024,5)) return `${(size / Math.pow(1024,5)).toFixed(2)} EB`;
		if (size < 8_192 * Math.pow(1024,6)) return `${(size / Math.pow(1024,6)).toFixed(2)} ZB`;
		if (size < 8_192 * Math.pow(1024,7)) return `${(size / Math.pow(1024,7)).toFixed(2)} YB`;
		if (size < 8_192 * Math.pow(1024,8)) return `${(size / Math.pow(1024,8)).toFixed(2)} BB`;
	},

	SizeToGB: size=> {
		return (size / Math.pow(1024,3)).toFixed(2);
	},

	BytesPerSecToString: bps=> {
		if (bps < 8_192) return `${bps} Bps`;
		if (bps < 8_192 * 1024) return `${(bps / 1024).toFixed(2)} KBps`;
		if (bps < 8_192 * Math.pow(1024,2)) return `${(bps / Math.pow(1024,2)).toFixed(2)} MBps`;
		if (bps < 8_192 * Math.pow(1024,3)) return `${(bps / Math.pow(1024,3)).toFixed(2)} GBps`;
		if (bps < 8_192 * Math.pow(1024,4)) return `${(bps / Math.pow(1024,4)).toFixed(2)} TBps`;
		if (bps < 8_192 * Math.pow(1024,5)) return `${(bps / Math.pow(1024,5)).toFixed(2)} EBps`;
		if (bps < 8_192 * Math.pow(1024,6)) return `${(bps / Math.pow(1024,6)).toFixed(2)} ZBps`;
		if (bps < 8_192 * Math.pow(1024,7)) return `${(bps / Math.pow(1024,7)).toFixed(2)} YBps`;
		if (bps < 8_192 * Math.pow(1024,8)) return `${(bps / Math.pow(1024,8)).toFixed(2)} BBps`;
	},

	BytesPerSecToShortString: bps=> {
		if (bps < 8_192) return `${Math.round(bps)} Bps`;
		if (bps < 8_192 * 1024) return `${Math.round(bps / 1024)} KBps`;
		if (bps < 8_192 * Math.pow(1024,2)) return `${Math.round(bps / Math.pow(1024,2))} MBps`;
		if (bps < 8_192 * Math.pow(1024,3)) return `${Math.round(bps / Math.pow(1024,3))} GBps`;
		if (bps < 8_192 * Math.pow(1024,4)) return `${Math.round(bps / Math.pow(1024,4))} TBps`;
		if (bps < 8_192 * Math.pow(1024,5)) return `${Math.round(bps / Math.pow(1024,5))} EBps`;
		if (bps < 8_192 * Math.pow(1024,6)) return `${Math.round(bps / Math.pow(1024,6))} ZBps`;
		if (bps < 8_192 * Math.pow(1024,7)) return `${Math.round(bps / Math.pow(1024,7))} YBps`;
		if (bps < 8_192 * Math.pow(1024,8)) return `${Math.round(bps / Math.pow(1024,8))} BBps`;
	},

	BitsPerSecToString: bps=> {
		if (bps < 8_000) return `${bps} bps`;
		if (bps < 8_000 * 1000) return `${Math.floor(bps / 1000)} Kbps`;
		if (bps < 8_000 * Math.pow(1000,2)) return `${(bps / Math.pow(1000,2)).toFixed(2)} Mbps`;
		if (bps < 8_000 * Math.pow(1000,3)) return `${(bps / Math.pow(1000,3)).toFixed(2)} Gbps`;
		if (bps < 8_000 * Math.pow(1000,4)) return `${(bps / Math.pow(1000,4)).toFixed(2)} Tbps`;
		if (bps < 8_000 * Math.pow(1000,5)) return `${(bps / Math.pow(1000,5)).toFixed(2)} Ebps`;
		if (bps < 8_000 * Math.pow(1000,6)) return `${(bps / Math.pow(1000,6)).toFixed(2)} Zbps`;
		if (bps < 8_000 * Math.pow(1000,7)) return `${(bps / Math.pow(1000,7)).toFixed(2)} Ybps`;
		if (bps < 8_000 * Math.pow(1000,8)) return `${(bps / Math.pow(1000,8)).toFixed(2)} Bbps`;
	},

	GenerateUuid: prefix=> {
		if (prefix) {
			return `${prefix}-${"xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx".replace(/[x]/g, ()=>(window.crypto.getRandomValues(new Uint8Array(1))[0] & 0b00001111).toString(16))}`;
		}
		return "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx".replace(/[x]/g, ()=>(window.crypto.getRandomValues(new Uint8Array(1))[0] & 0b00001111).toString(16));
	}
};

const MENU = {
	items: [
		{ t:"Devices",                      i:"mono/devices.svg?light",     g:"inventory", h:false, f:()=> new DevicesList() },
		{ t:"Users",                        i:"mono/users.svg?light",       g:"inventory", h:false, f:()=> new UsersList() },
		{ t:"Devices grid",                 i:"mono/griddevices.svg?light", g:"inventory", h:true,  f:()=> new DevicesGrid() },
		{ t:"Users grid",                   i:"mono/gridusers.svg?light",   g:"inventory", h:true,  f:()=> new UsersGrid() },
		{ t:"New device",                   i:"mono/newdevice.svg?light",   g:"inventory", h:true,  f:()=> new DeviceView({file:null}) },
		{ t:"New user",                     i:"mono/newuser.svg?light",     g:"inventory", h:true,  f:()=> new UserView({file:null}) },
		{ t:"Fetch",                        i:"mono/fetch.svg?light",       g:"inventory", h:false, f:()=> new Fetch() },
		{ t:"Fetch devices",                i:"mono/fetch.svg?light",       g:"inventory", h:true,  f:()=> new Fetch("devices") },
		{ t:"Fetch users",                  i:"mono/fetch.svg?light",       g:"inventory", h:true,  f:()=> new Fetch("users") },
		{ t:"Import from another Pro-test", i:"mono/fetch.svg?light",       g:"inventory", h:true,  f:()=> new Fetch("protest") },
		{ t:"Password strength",            i:"mono/strength.svg?light",    g:"inventory", h:false, f:()=> new PasswordStrength() },

		{ t:"Documentation", i:"mono/documentation.svg?light", g:"documentation", h:false, f:()=> new Documentation(), k:"" },
		{ t:"Debit notes",   i:"mono/notes.svg?light",         g:"documentation", h:false, f:()=> new DebitNotes(),    k:"" },
		{ t:"Address book",  i:"mono/addressbook.svg?light",   g:"documentation", h:false, f:()=> new AddressBook(),   k:"phone email" },
		{ t:"Team chat",     i:"mono/chat.svg?light",          g:"documentation", h:false, f:()=> new Chat(),          k:"messages" },

		{ t:"Watchdog",        i:"mono/watchdog.svg?light",     g:"tools", h:false, f:()=> new Watchdog(), k:"" },
		{ t:"Gandalf",         i:"mono/gandalf.svg?light",      g:"tools", h:false, f:()=> new Gandalf() },
		{ t:"Reverse proxy",   i:"mono/reverseproxy.svg?light", g:"tools", h:false, f:args=> new ReverseProxy(args), k:"man in the middle" },
		{ t:"Issues",          i:"mono/issues.svg?light",   g:"tools", h:false, f:()=> new Issues() },
		//{ t:"Scripts",         i:"mono/scripts.svg?light",       g:"tools", h:false, f:args=> {} },
		//{ t:"Script reports",  i:"mono/reportfile.svg?light",    g:"tools", h:true,  f:args=> {} },
		//{ t:"Ongoing scripts", i:"mono/ongoingscript.svg?light", g:"tools", h:true,  f:args=> {} },
		
		{ t:"Ping",               i:"mono/ping.svg?light",          g:"utilities", h:false, f:args=> new Ping(args),         k:"roundtrip rtt icmp echo reply" },
		{ t:"ARP ping",           i:"mono/ping.svg?light",          g:"utilities", h:true,  f:args=> new Ping({entries:[], timeout:500, method:"arp", interval:1000, moveToBottom:false, status:"play"}) },
		{ t:"DNS lookup",         i:"mono/dns.svg?light",           g:"utilities", h:false, f:args=> new DnsLookup(args),    k:"resolve resolution" },
		{ t:"DNS-SD",             i:"mono/dns.svg?light",           g:"utilities", h:true,  f:args=> new DnsSD(args),        k:"mdns service discovery multicast lookup resolve resolution" },
		{ t:"Trace route",        i:"mono/traceroute.svg?light",    g:"utilities", h:false, f:args=> new TraceRoute(args),   k:"path" },
		{ t:"TCP port scan",      i:"mono/portscan.svg?light",      g:"utilities", h:false, f:args=> new PortScan(args),     k:"portscan" },
		{ t:"Locate IP",          i:"mono/locate.svg?light",        g:"utilities", h:false, f:args=> new LocateIp(args),     k:"location" },
		{ t:"MAC lookup",         i:"mono/maclookup.svg?light",     g:"utilities", h:false, f:args=> new MacLookup(args),    k:"physical address vendor resolver" },
		{ t:"DHCP client",        i:"mono/dhcp.svg?light",          g:"utilities", h:false, f:args=> new DhcpDiscover(args), k:"discover" },
		{ t:"NTP client",         i:"mono/clock.svg?light",         g:"utilities", h:false, f:args=> new NtpClient(args),    k:"network time" },
		{ t:"Site check",         i:"mono/websitecheck.svg?light",  g:"utilities", h:false, f:args=> new SiteCheck(args),    k:"www website" },
		//{ t:"Speed test",        i:"mono/speedtest.svg?light",     g:"utilities",  h:false, f:args=> new SpeedTest(args) },
		//{ t:"SNMP traps",        i:"mono/trap.svg?light",          g:"utilities", h:false, f:args=> new Snmp(args) },
		{ t:"SNMP polling",       i:"mono/snmp.svg?light",          g:"utilities", h:false, f:args=> new Snmp(args) },
		{ t:"WMI client",         i:"mono/wmi.svg?light",           g:"utilities", h:false, f:args=> new Wmi(args),        k:"windows management instrumentation viewer" },
		{ t:"Secure shell",       i:"mono/ssh.svg?light",           g:"utilities", h:false, f:()=> new Ssh({host:""}),     k:"ssh terminal" },
		{ t:"Telnet",             i:"mono/telnet.svg?light",        g:"utilities", h:true,  f:()=> new Telnet({host:""}),  k:"terminal" },
		//{ t:"RS-232",             i:"mono/serialconsole.svg?light", g:"utilities", h:true,  f:()=>{}, k:"rs 232 serial terminal console" },
		{ t:"Encoder",            i:"mono/encoder.svg?light",       g:"utilities", h:true,  f:args=> new Encoder(args),    k:"binary hex base64 url html decode" },
		{ t:"Network calculator", i:"mono/netcalc.svg?light",       g:"utilities", h:true,  f:args=> new NetCalc(args),    k:"subnet" },
		{ t:"Password generator", i:"mono/passgen.svg?light",       g:"utilities", h:false, f:()=> new PassGen(),  k:"code" },
		{ t:"Screen capture",     i:"mono/screenrecord.svg?light",  g:"utilities", h:true,  f:args=> new ScreenCapture(),  k:"recorder shot" },
		{ t:"Camera tester",      i:"mono/webcam.svg?light",        g:"utilities", h:true,  f:args=> new CameraTester(),   k:"webcam" },
		{ t:"Microphone tester",  i:"mono/mic.svg?light",           g:"utilities", h:true,  f:args=> new MicTester(),      k:"audio input" },
		{ t:"Keyboard tester",    i:"mono/keyboard.svg?light",      g:"utilities", h:true,  f:args=> new KeyboardTester(), k:"keys" },
		{ t:"Gamepad tester",     i:"mono/gamepad.svg?light",       g:"utilities", h:true,  f:args=> new KeyboardTester("gamepad"), k:"joystick" },

		{ t:"Settings",      i:"mono/wrench.svg?light",      g:"manage", h:false, f:()=> new Settings(), },
		{ t:"Zones",         i:"mono/router.svg?light",      g:"manage", h:true,  f:()=> new Settings("zones"), },
		{ t:"SMTP settings", i:"mono/email.svg?light",       g:"manage", h:true,  f:()=> new Settings("smtp") },
		{ t:"SNMP settings", i:"mono/snmp.svg?light",        g:"manage", h:true,  f:()=> new Settings("snmp") },

		{ t:"Personalize",    i:"mono/personalize.svg?light", g:"manage", h:false, f:()=> new Personalize() },
		{ t:"Appearance",     i:"mono/tv.svg?light",          g:"manage", h:true,  f:()=> new Personalize("appearance") },
		{ t:"Reginal format", i:"mono/earth.svg?light",       g:"manage", h:true,  f:()=> new Personalize("region") },
		{ t:"Session",        i:"mono/hourglass.svg?light",   g:"manage", h:true,  f:()=> new Personalize("session") },
		{ t:"Agent",          i:"mono/agent.svg?light",       g:"manage", h:true,  f:()=> new Personalize("agent") },

		{ t:"RBAC",           i:"mono/rbac.svg?light",        g:"manage", h:false, f:()=> new AccessControl("rbac"),     k:"rbac acl role based users access control list permissions" },
		{ t:"Open sessions",  i:"mono/hourglass.svg?light",   g:"manage", h:true,  f:()=> new AccessControl("sessions"), k:"alive connections" },

		{ t:"Automation",     i:"mono/automation.svg?light",  g:"manage", h:false, f:()=> new Automation(), k:"" },
		{ t:"Certificates",   i:"mono/certificate.svg?light", g:"manage", h:false, f:()=> new Certificates(), k: "ssl tls" },
		{ t:"Backup",         i:"mono/backup.svg?light",      g:"manage", h:false, f:()=> new Backup() },
		{ t:"Log",            i:"mono/log.svg?light",         g:"manage", h:false, f:()=> new Log() },
		
		{ t:"Update",         i:"mono/update.svg?light",      g:"manage", h:true,  f:()=> new About("update") },
		{ t:"Update modules", i:"mono/department.svg?light",  g:"manage", h:true,  f:()=> new About("updatemod") },
		{ t:"About",          i:"mono/logo.svg?light",        g:"manage", h:false, f:()=> new About("about") },
		{ t:"Legal",          i:"mono/law.svg?light",         g:"manage", h:true,  f:()=> new About("legal") },

		{ t:"Logout", i:"mono/logoff.svg?light", g:"manage", h:true, f:()=> logoutButton.onclick(), },
	],

	isOpen: false,
	isDragging: false,
	isMoved: false,
	isDetached: true,
	position: [0, 0],
	index: -1,
	list: [],
	history: [],
	cache: {},
	lastAltPress: 0,
	filterIndex: -1,
	lastSearchValue: "",

	Clear: ()=> {
		if (searchinput.value.length > 0) {
			searchinput.value = "";
			MENU.Update();
		}
		else {
			MENU.Close();
		}
	},

	Open: ()=> {
		if (MENU.filterIndex === 1) { //recent
			searchinput.value = "";
		}

		MENU.Update();

		MENU.isOpen = true;
		MENU.UpdatePosition();

		setTimeout(()=> searchinput.focus(), 150);
	},

	Close: ()=> {
		MENU.isOpen = false;
		MENU.UpdatePosition();

		searchinput.value = "";
		MENU.Update();
	},

	Toggle: ()=> {
		if (MENU.filterIndex === 1) { //recent
			searchinput.value = "";
		}

		MENU.Update("");

		MENU.isOpen = !MENU.isOpen;
		MENU.UpdatePosition();

		if (MENU.isOpen) {
			setTimeout(()=> searchinput.focus(), 150);
		}
	},

	Attach: ()=> {
		const logo = menubutton.children[0];

		menubutton.style.visibility = "hidden";

		attachedmenubutton.style.transform = "none";
		attachedmenubutton.style.boxShadow = "#202020 0 0 0 3px inset";

		switch (UI.taskbarPosition) {
		case "top":
			logo.style.top = "-24px";
			menubutton.style.transformOrigin = "0% 0%";
			menubutton.style.transform = "scaleY(0)";
			attachedmenubutton.style.transformOrigin = "100% 100%";
			break;

		case "left":
			logo.style.left = "-24px";
			menubutton.style.transformOrigin = "0% 0%";
			menubutton.style.transform = "scaleX(0)";
			attachedmenubutton.style.transformOrigin = "100% 100%";
			break;

		case "right":
			logo.style.left = "48px";
			menubutton.style.transformOrigin = "100% 100%";
			menubutton.style.transform = "scaleX(0)";
			attachedmenubutton.style.transformOrigin = "0% 0%";
			break;

		default: //bottom
			logo.style.top = "48px";
			menubutton.style.transformOrigin = "100% 100%";
			menubutton.style.transform = "scaleY(0)";
			attachedmenubutton.style.transformOrigin = "0% 0%";
			break;
		}

		if (!MENU.isAttached) {
			MENU.isAttached = true;
			WIN.AlignIcon();
		}
		localStorage.setItem("menu_attached", true);
	},

	Detach: ()=> {
		menubutton.style.visibility = "visible";
		menubutton.style.transform = "none";

		switch (UI.taskbarPosition) {
		case "top": attachedmenubutton.style.transform = "scaleY(0)"; break;
		case "left": attachedmenubutton.style.transform = "scaleX(0)"; break;
		case "right": attachedmenubutton.style.transform = "scaleX(0)"; break;
		default: attachedmenubutton.style.transform = "scaleY(0)"; break;
		}

		attachedmenubutton.style.boxShadow = "none";

		if (MENU.isAttached) {
			MENU.isAttached = false;
			WIN.AlignIcon();
		}
		localStorage.setItem("menu_attached", false);
	},

	Update: filter=> {
		menulist.textContent = "";
		MENU.list = [];
		MENU.index = -1;

		const normalizedFilter = filter ? filter.trim() : "";
		const keywords = normalizedFilter.toLowerCase().split(" ").filter(o=> o.length > 0);

		const isGrid = normalizedFilter.length === 0;
		const showHidden = MENU.filterIndex > -1 || keywords.length > 0;

		if (MENU.filterIndex === 1) { //recent
			if (WIN.array.length > 0) {
				const groupOpen = document.createElement("div");
				groupOpen.className = "menu-group";
				groupOpen.textContent = "Open";
				menulist.appendChild(groupOpen);
			}

			for (let i = 0; i < WIN.array.length; i++) {
				const match = keywords.every(keyword=> WIN.array[i].header.textContent.toLowerCase().includes(keyword));
				if (!match) continue;

				const newItem = document.createElement("div");
				newItem.className = "menu-grid-item";
				newItem.style.backgroundImage = WIN.array[i].icon.style.backgroundImage.replace(".svg", ".svg?light");

				newItem.textContent = WIN.array[i].header.textContent;
				MENU.list.push(newItem);
				menulist.appendChild(newItem);

				MENU.ItemEvent(newItem, ()=>{
					if (!WIN.array[i].isMaximized) WIN.array[i].win.style.animation = "focus-pop .2s";
					WIN.array[i].BringToFront();
					setTimeout(()=> { WIN.array[i].win.style.animation = "none" }, 200);
				});
			}

			if (MENU.history.length > 0) {
				const groupClosed = document.createElement("div");
				groupClosed.className = "menu-group";
				groupClosed.textContent = "Recently closed";
				menulist.appendChild(groupClosed);
			}

			for (let i = MENU.history.length-1; i >= Math.max(MENU.history.length-32, 0) ; i--) {
				const match = keywords.every(keyword=> MENU.history[i].title.toLowerCase().includes(keyword));
				if (!match) continue;

				const newItem = document.createElement("div");
				newItem.className = "menu-list-item";
				newItem.textContent = MENU.history[i].title;
				newItem.style.backgroundImage = MENU.history[i].icon.replace(".svg", ".svg?light");
				MENU.list.push(newItem);
				menulist.appendChild(newItem);

				MENU.ItemEvent(newItem, ()=>{
					if (MENU.history[i].class === "DeviceView") {
						let file = MENU.history[i].args.file;
						LOADER.OpenDeviceByFile(file);
					}
					else if (MENU.history[i].class === "UserView") {
						let file = MENU.history[i].args.file;
						LOADER.OpenUserByFile(file);
					}
					else {
						LOADER.Invoke(MENU.history[i]);
					}
				});
			}

			return;
		}

		const cache = {};

		let lastGroup = null;
		for (let i = 0; i < MENU.items.length; i++) { //menu items
			if (MENU.items[i].h && !showHidden) continue;

			const match = keywords.every(
				keyword=> MENU.items[i].t.toLowerCase().includes(keyword) || MENU.items[i].g.includes(keyword) || (MENU.items[i].k && MENU.items[i].k.includes(keyword))
			);

			if (!match) continue;

			if (MENU.filterIndex > -1) {
				if (MENU.filterIndex === 2 && MENU.items[i].g !== "inventory") continue;
				if (MENU.filterIndex === 3 && MENU.items[i].g !== "documentation") continue;
				if (MENU.filterIndex === 4 && MENU.items[i].g !== "tools" && MENU.items[i].g !== "utilities") continue;
			}

			if (isGrid && lastGroup !== MENU.items[i].g) { //group label
				const newGroup = document.createElement("div");
				newGroup.className = "menu-group";
				newGroup.textContent = MENU.items[i].g;
				menulist.appendChild(newGroup);
				lastGroup = MENU.items[i].g;
			}

			let item;
			if (MENU.items[i].t in MENU.cache && !isGrid) {
				item = MENU.cache[MENU.items[i].t];
				item.style.backgroundColor = "";
				item.style.animation = "unset";
				cache[MENU.items[i].t] = item;
				MENU.list.push(item);
				menulist.appendChild(item);
			}
			else {
				item = document.createElement("div");
				item.className = isGrid ? "menu-grid-item" : "menu-list-item";
				item.textContent = MENU.items[i].t;
				item.style.backgroundImage = `url(${MENU.items[i].i})`;
				menulist.appendChild(item);

				MENU.list.push(item);
				MENU.ItemEvent(item, MENU.items[i].f);

				if (!isGrid) {
					cache[MENU.items[i].t] = item;
				}
			}
		}

		if (keywords.length > 0) { //inventory
			let count = 0;
			exactMatchDevices = [];

			for (const file in LOADER.devices.data) {
				const match = keywords.every(
					keyword=> Object.values(LOADER.devices.data[file]).some(
						attr=> attr.v.toLowerCase().includes(keyword)
					)
				);
				if (!match) continue;

				const exactMatch = keywords.some(
					keyword=> Object.values(LOADER.devices.data[file]).some(
						attr=> attr.v.toLowerCase() === keyword
					)
				);

				let type = LOADER.devices.data[file].type ? LOADER.devices.data[file].type.v.toLowerCase() : null;

				let title = LOADER.devices.data[file].name ? LOADER.devices.data[file].name.v : null;
				title ??= LOADER.devices.data[file].hostname ? LOADER.devices.data[file].hostname.v : null;
				title ??= LOADER.devices.data[file].fqdn ? LOADER.devices.data[file].fqdn.v : null;

				let item;
				if (file in MENU.cache) {
					item = MENU.cache[file];
					item.style.backgroundColor = "";
					item.style.animation = "unset";
					cache[file] = item;
				}
				else {
					item = document.createElement("div");
					item.className = "menu-list-item";
					item.style.backgroundImage = `url(${type in LOADER.deviceIcons ? LOADER.deviceIcons[type] : "mono/gear.svg"}?light)`;
					item.textContent = title;

					if (LOADER.devices.data[file].ip && LOADER.devices.data[file].ip.v.length > 0) {
						item.style.lineHeight = "26px";
						const info = document.createElement("div");
						info.textContent = LOADER.devices.data[file].ip.v;
						info.style.lineHeight = "16px";
						info.style.fontWeight = "400";
						item.appendChild(info);
					}

					MENU.ItemEvent(item, ()=> {
						LOADER.OpenDeviceByFile(file);
					});

					if (!isGrid) {
						cache[file] = item;
					}
				}

				if (exactMatch) {
					//MENU.list.unshift(item);
					//menulist.prepend(item);
					exactMatchDevices.push(item);
				}
				else {
					MENU.list.push(item);
					menulist.appendChild(item);
				}

				if (++count > 32) break;
			}

			count = 0;
			exactMatchUsers = [];

			for (const file in LOADER.users.data) {
				const match = keywords.every(
					keyword=> Object.values(LOADER.users.data[file]).some(
						attr=> attr.v.toLowerCase().includes(keyword)
					)
				);
				if (!match) continue;

				const exactMatch = keywords.some(
					keyword=> Object.values(LOADER.users.data[file]).some(
						attr=> attr.v.toLowerCase() === keyword
					)
				);

				let type = LOADER.users.data[file].type ? LOADER.users.data[file].type.v.toLowerCase()  : null;

				let title = LOADER.users.data[file]["display name"] ? LOADER.users.data[file]["display name"].v : null;
				title ??= LOADER.users.data[file].title ? LOADER.users.data[file].title.v : null;
				title ??= LOADER.users.data[file]["e-mail"] ? LOADER.users.data[file]["e-mail"].v : null;

				let item;
				if (file in MENU.cache && !isGrid) {
					item = MENU.cache[file];
					item.style.backgroundColor = "";
					item.style.animation = "unset";
					cache[file] = item;
				}
				else {
					item = document.createElement("div");
					item.className = "menu-list-item";
					item.style.backgroundImage = `url(${type in LOADER.userIcons ? LOADER.userIcons[type] : "mono/user.svg"}?light)`;
					item.textContent = title;

					if (LOADER.users.data[file].username && LOADER.users.data[file].username.v.length > 0) {
						item.style.lineHeight = "26px";
						const info = document.createElement("div");
						info.textContent = LOADER.users.data[file].username.v;
						info.style.lineHeight = "16px";
						info.style.fontWeight = "400";
						item.appendChild(info);
					}

					MENU.ItemEvent(item, ()=> {
						LOADER.OpenUserByFile(file);
					});

					if (!isGrid) {
						cache[file] = item;
					}
				}

				if (exactMatch) {
					//MENU.list.unshift(item);
					//menulist.prepend(item);
					exactMatchUsers.push(item);
				}
				else {
					MENU.list.push(item);
					menulist.appendChild(item);
				}

				if (++count > 32) break;
			}

			for (let i=exactMatchUsers.length-1; i >= 0; i--) {
				MENU.list.unshift(exactMatchUsers[i]);
				menulist.prepend(exactMatchUsers[i]);
			}

			for (let i=exactMatchDevices.length-1; i >= 0; i--) {
				MENU.list.unshift(exactMatchDevices[i]);
				menulist.prepend(exactMatchDevices[i]);
			}

			if (MENU.list.length > 0) {
				MENU.index = 0;
				MENU.list[0].style.backgroundColor = "var(--clr-transparent)";
			}
		}

		MENU.cache = cache;
	},

	ItemEvent: (element, func)=> {
		element.onclick = event=> {
			if (event.ctrlKey) return;
			event.stopPropagation();
			MENU.Close();
			func();
		};

		element.onmousedown = event=> {
			if (event.button !== 1 && (event.button !== 0 || !event.ctrlKey)) return;
			if (event.preventDefault) event.preventDefault();
			func();
			WIN.GridWindows();
		};
	},

	Filter: index=> {
		//if (index < -1) { index = 4; }

		if (index === MENU.filterIndex || index < 0) {
			menufilterdot.style.transform = "scale(0)";
			menufilterdot.style.width = "8px";
			menufilterdot.style.height = "8px";
			menufilterdot.style.left = `${menufilter.offsetLeft + Math.max(index, 0) * 40 + 12 + 1}px`;
			MENU.filterIndex = -1;
		}
		else {
			menufilterdot.style.transform = "scale(1)";
			menufilterdot.style.width = "32px";
			menufilterdot.style.height = "4px";
			menufilterdot.style.left = `${menufilter.offsetLeft + Math.max(index, 0)  * 40 + 1}px`;
			MENU.filterIndex = index;
		}

		MENU.Update(searchinput.value);
	},

	UpdatePosition: ()=> {
		menubox.style.visibility = MENU.isOpen ? "visible" : "hidden";
		cap.style.visibility = MENU.isOpen ? "visible" : "hidden";

		let left;
		if (MENU.isAttached) {
			left = UI.taskbarPosition === "right" ? 91 : 0
		}
		else {
			left = menubutton.style.left ? parseInt(menubutton.style.left) : 0;
		}

		if (left < 10) {
			menubox.style.left = "20px";
			menubox.style.top = "20px";
			menubox.style.bottom = "20px";
			menubox.style.transform = MENU.isOpen ? "none" : "translateX(calc(-100% - 24px))";
		}
		else if (menubutton.style.left == "calc(100% - 48px)" || left > 90) {
			menubox.style.left = "calc(100% - var(--sidemenu-width) - 20px)";
			menubox.style.top = "20px";
			menubox.style.bottom = "20px";
			menubox.style.transform = MENU.isOpen ? "none" : "translateX(100%)";
		}
		else {
			menubox.style.left = `max(20px, min(calc(${left}% - var(--sidemenu-width) / 2) + 32px, calc(100% - var(--sidemenu-width) - 20px)))`;

			if (menubutton.style.top == "0px") {
				menubox.style.top = "20px";
				menubox.style.bottom = window.innerHeight > 640 ? "25%" : "20px";
				menubox.style.transform = MENU.isOpen ? "none" : "translateY(-100%)";
			}
			else {
				menubox.style.top = window.innerHeight > 640 ? "25%" : "20px";
				menubox.style.bottom = "20px";
				menubox.style.transform = MENU.isOpen ? "none" : "translateY(100%)";
			}
		}
	},

	StorePosition: ()=> {
		const logo = menubutton.children[0];
		localStorage.setItem("menu_button_pos", JSON.stringify({
			borderRadius: menubutton.style.borderRadius,
			left: menubutton.style.left,
			top: menubutton.style.top,
			width: menubutton.style.width,
			height: menubutton.style.height,
			l_left: logo.style.left,
			l_top: logo.style.top,
			l_width: logo.style.width,
			l_height: logo.style.height
		}));
	}
};

window.addEventListener("mousedown", ()=> {
	UI.lastActivity = Date.now();
});

window.addEventListener("keydown", ()=> {
	UI.lastActivity = Date.now();
});

window.addEventListener("resize", ()=> {
	if (UI.onMobile) return;
	MENU.UpdatePosition();
});

document.body.addEventListener("mousemove", event=> {
	if (event.buttons != 1) {
		if (MENU.isDragging) MENU.StorePosition();
		MENU.isDragging = false;
	}

	if (!MENU.isDragging) return;

	//ignore if move is less than 2px
	if (Math.abs(MENU.position[0] - event.clientX) > 2 || Math.abs(MENU.position[1] - event.clientY) > 2) {
		MENU.isMoved = true;
	}

	const logo = menubutton.children[0];

	let ex = UI.taskbarPosition === "left" ? event.x - taskbar.clientWidth : event.x;
	let ey = UI.taskbarPosition === "top" ? event.y - taskbar.clientHeight : event.y;
	let px = ex / container.clientWidth;
	let py = ey / container.clientHeight;

	if (ex < 56 && ey < 56) { //top left
		menubutton.style.borderRadius = "4px 8px 48px 8px";
		menubutton.style.left = "0px";
		menubutton.style.top = "0px";
		menubutton.style.width = "48px";
		menubutton.style.height = "48px";

		logo.style.left = "8px";
		logo.style.top = "6px";
		logo.style.width = "26px";
		logo.style.height = "26px";
	}
	else if (ex < 56 && ey > container.clientHeight - 48) { //bottom left
		menubutton.style.borderRadius = "8px 48px 8px 4px";
		menubutton.style.left = "0px";
		menubutton.style.top = "calc(100% - 48px)";
		menubutton.style.width = "48px";
		menubutton.style.height = "48px";

		logo.style.left = "8px";
		logo.style.top = "16px";
		logo.style.width = "26px";
		logo.style.height = "26px";
	}
	else if (ex > container.clientWidth - 48 && ey < 56) { //top right
		menubutton.style.borderRadius = "8px 4px 8px 64px";
		menubutton.style.left = "calc(100% - 48px)";
		menubutton.style.top = "0px";
		menubutton.style.width = "48px";
		menubutton.style.height = "48px";

		logo.style.left = "16px";
		logo.style.top = "6px";
		logo.style.width = "26px";
		logo.style.height = "26px";
	}
	else if (ex > container.clientWidth - 48 && ey > container.clientHeight - 48) { //bottom right
		menubutton.style.borderRadius = "64px 8px 4px 8px";
		menubutton.style.left = "calc(100% - 48px)";
		menubutton.style.top = "calc(100% - 48px)";
		menubutton.style.width = "48px";
		menubutton.style.height = "48px";

		logo.style.left = "16px";
		logo.style.top = "16px";
		logo.style.width = "26px";
		logo.style.height = "26px";
	}
	else if (px < py && 1 - px > py) { //left
		let y = 100 * ((UI.taskbarPosition === "top" ? event.y - taskbar.clientHeight : event.y) - 32) / container.clientHeight;

		menubutton.style.borderRadius = "14px 40px 40px 14px";
		menubutton.style.left = "0px";
		menubutton.style.top = `${y}%`;
		menubutton.style.width = "48px";
		menubutton.style.height = "64px";

		logo.style.left = "8px";
		logo.style.top = "18px";
		logo.style.width = "28px";
		logo.style.height = "28px";
	}
	else if (px > py && 1 - px > py) { //top
		let x = 100 * ((UI.taskbarPosition === "left" ? event.x - taskbar.clientWidth : event.x) - 32) / container.clientWidth;

		menubutton.style.borderRadius = "14px 14px 40px 40px";
		menubutton.style.left = `${x}%`;
		menubutton.style.top = "0px";
		menubutton.style.width = "64px";
		menubutton.style.height = "48px";

		logo.style.left = "19px";
		logo.style.top = "6px";
		logo.style.width = "28px";
		logo.style.height = "28px";
	}
	else if (px < py && 1 - px < py) { //bottom
		let x = 100 * ((UI.taskbarPosition === "left" ? event.x - taskbar.clientWidth : event.x) - 32) / container.clientWidth;

		menubutton.style.borderRadius = "40px 40px 14px 14px";
		menubutton.style.left = `${x}%`;
		menubutton.style.top = "calc(100% - 48px)";
		menubutton.style.width = "64px";
		menubutton.style.height = "48px";

		logo.style.left = "19px";
		logo.style.top = "16px";
		logo.style.width = "28px";
		logo.style.height = "28px";
	}
	else if (px > py && 1 - px < py) { //right
		let y = 100 * ((UI.taskbarPosition === "top" ? event.y - taskbar.clientHeight : event.y) - 32) / container.clientHeight;

		menubutton.style.borderRadius = "40px 14px 14px 40px";
		menubutton.style.left = "calc(100% - 48px)";
		menubutton.style.top = `${y}%`;
		menubutton.style.width = "48px";
		menubutton.style.height = "64px";

		logo.style.left = "14px";
		logo.style.top = "18px";
		logo.style.width = "28px";
		logo.style.height = "28px";
	}

	if (UI.taskbarPosition === "top" && event.x < 56 && event.y < 48 && event.y > 2 ||
	UI.taskbarPosition === "bottom" && event.x < 56 && event.y > container.clientHeight - 48 && container.clientHeight - event.y < 2 ||
	UI.taskbarPosition === "left" && event.y < 56 && event.x < 48 && event.x > 2 ||
	UI.taskbarPosition === "right" && event.y < 56 && event.x > container.clientWidth - 48 && container.clientWidth - event.x < 2) {
		MENU.Attach();
	}
	else {
		MENU.Detach();
	}

	menubutton.style.visibility = MENU.isAttached ? "hidden" : "visible";

	MENU.UpdatePosition();
});

document.body.addEventListener("mouseup", event=> {
	if (MENU.isMoved) {
		MENU.StorePosition();
	}

	MENU.isDragging = false;
	setTimeout(()=> {
		MENU.isMoved = false;
	}, 0);
});

document.body.addEventListener("keyup", event=> {
	if (event.code == "AltLeft") {
		event.preventDefault();

		if (Date.now() - MENU.lastAltPress < 250) {
			MENU.lastAltPress = 0;
			MENU.Toggle();
		}
		else {
			MENU.lastAltPress = Date.now();
		}
	}
	else {
		MENU.lastAltPress = 0;
	}
});

menubutton.onclick = event=> {
	if (MENU.isMoved) return;
	if (event.button == 0) MENU.Toggle();
};

attachedmenubutton.onclick = event=> {
	if (MENU.isMoved) return;
	if (event.button == 0) MENU.Toggle();
};

menubutton.onmousedown = event=> {
	MENU.position = [event.clientX, event.clientY];
	MENU.isDragging = true;
	event.stopPropagation();
};

attachedmenubutton.onmousedown = event=> {
	MENU.position = [event.clientX, event.clientY];
	MENU.isDragging = true;
	event.stopPropagation();
};

menubox.onclick = ()=> searchinput.focus();

searchinput.onchange = searchinput.oninput = event=> {
	if (MENU.lastSearchValue === searchinput.value.trim()) return;
	let current = searchinput.value;
	MENU.lastSearchValue = current.trim();

	setTimeout(()=> {
		if (current !== searchinput.value) return;
		MENU.Update(current);
	}, 100);
};

searchinput.onclick = event=> event.stopPropagation();

searchinput.onkeydown = event=> {
keyMux:
	switch (event.key) {
	case "Escape":
		event.stopPropagation();
		MENU.Clear();
		break;

	case "Enter":
		if (event.ctrlKey) {
			MENU.list[MENU.index].onmousedown({ button: 1 });
			searchinput.focus();
			setTimeout(searchinput.focus(), 10);
		}
		else {
			if (MENU.index > -1) {
				MENU.list[MENU.index].onclick(event);
			}
		}
		break;

	case "ArrowUp":
		event.preventDefault();
		if (MENU.list.length === 0) break;

		if (MENU.index > -1) MENU.list[MENU.index].style.backgroundColor = "";

		if (MENU.index === -1 || MENU.list[MENU.index].className === "menu-list-item") { //navigate list items
			MENU.index--;
			if (MENU.index < 0) MENU.index = MENU.list.length - 1;
			if (MENU.index > -1) MENU.list[MENU.index].style.backgroundColor = "var(--clr-transparent)";
		}
		else { //navigate grid items
			for (let i=MENU.index-1; i >= 0; i--) {
				if (MENU.list[i].className === "menu-list-item" || MENU.list[i].offsetLeft === MENU.list[MENU.index].offsetLeft) {
					MENU.index = i;
					MENU.list[i].style.backgroundColor = "var(--clr-transparent)";
					break keyMux;
				}
			}
			MENU.index = -1;
		}
		break;

	case "ArrowDown":
		event.preventDefault();
		if (MENU.list.length === 0) break;

		if (MENU.index > -1) MENU.list[MENU.index].style.backgroundColor = "";

		if (MENU.index === -1 || MENU.list[MENU.index].className === "menu-list-item") { //navigate list items
			MENU.index++;
			if (MENU.index >= MENU.list.length) MENU.index = 0;
			MENU.list[MENU.index].style.backgroundColor = "var(--clr-transparent)";
		}
		else { //navigate grid items
			for (let i=MENU.index+1; i < MENU.list.length; i++) {
				if (MENU.list[i].className === "menu-list-item" || MENU.list[i].offsetLeft === MENU.list[MENU.index].offsetLeft) {
					MENU.index = i;
					MENU.list[i].style.backgroundColor = "var(--clr-transparent)";
					break keyMux;
				}
			}
			MENU.index = 0;
			MENU.list[MENU.index].style.backgroundColor = "var(--clr-transparent)";
		}
		break;

	case "ArrowLeft":
		if (searchinput.value.length !== 0) break;
		event.preventDefault();

		if (searchinput.value.length === 0 && MENU.index === -1) { //navigate filters
			let index = (MENU.filterIndex - 1) % 5;
			MENU.Filter(index);
		}
		else { //navigate menu
			if (MENU.index > -1) MENU.list[MENU.index].style.backgroundColor = "";
			MENU.index--;
			if (MENU.index < 0) MENU.index = MENU.list.length - 1;
			if (MENU.index > -1) MENU.list[MENU.index].style.backgroundColor = "var(--clr-transparent)";
		}
		break;

	case "ArrowRight":
		if (searchinput.value.length !== 0) break;
		event.preventDefault();

		if (MENU.index === -1) { //navigate filters
			let index = (MENU.filterIndex + 1) % 5;
			MENU.Filter(index);
		}
		else { //navigate menu
			if (MENU.index > -1) MENU.list[MENU.index].style.backgroundColor = "";
			MENU.index++;
			if (MENU.index >= MENU.list.length) MENU.index = 0;
			MENU.list[MENU.index].style.backgroundColor = "var(--clr-transparent)";
		}
		break;
	}

	if (MENU.list.length > 0
		&& MENU.index > -1
		&& (event.key==="ArrowUp" || event.key==="ArrowDown" || event.key==="ArrowLeft" || event.key==="ArrowRight")) { //scroll into view
		MENU.list[MENU.index].scrollIntoView({ behavior:"smooth", block:"center" });
	}
};

clearmenusearch.onclick = event=> {
	event.stopPropagation();
	MENU.Clear();
};

cap.onclick = ()=> MENU.Close();

username.onclick = event=> event.stopPropagation();
usernameLabel.onclick = event=> event.stopPropagation();

logoutButton.onclick = async event=> {
	event?.stopPropagation();

	MENU.Close();

	try {
		const response = await fetch("/logout");
		if (response.status === 200) {
			location.reload();
		}
		else {
			console.error(await response.text());
		}
	}
	catch (ex) {
		console.error(ex);
	}
};

personalizeButton.onclick = ()=> {
	MENU.Close();
	new Personalize();
};

taskbar.onmouseup = event=> {
	if (WIN.array.length === 0) return;
	if (event.button !== 2) return;

	contextmenu.textContent = "";

	const grid = WIN.CreateContextMenuItem("Grid", "controls/grid.svg");
	grid.onclick = ()=> WIN.GridWindows();

	const minimizeAll = WIN.CreateContextMenuItem("Minimize all", "controls/minimize.svg");
	minimizeAll.onclick = ()=> {
		for (let i = 0; i < WIN.array.length; i++) {
			if (WIN.array[i].isMinimized) continue;
			WIN.array[i].Minimize(true);
		}
	};

	const closeAll = WIN.CreateContextMenuItem("Close all", "controls/close.svg");
	closeAll.onclick = ()=> {
		let copy = WIN.array.filter(()=> true);
		for (let i = 0; i < copy.length; i++) {
			copy[i].Close();
		}
	};

	switch (UI.taskbarPosition) {
	case "left":
		contextmenu.style.left   = "8px";
		contextmenu.style.right  = "unset";
		contextmenu.style.top    = `${event.y}px`;
		contextmenu.style.bottom = "unset";
		break;

	case "right":
		contextmenu.style.left   = "unset";
		contextmenu.style.right  = "8px";
		contextmenu.style.top    = `${event.y}px`;
		contextmenu.style.bottom = "unset";
		break;

	case "top":
		contextmenu.style.left   = `${event.x}px`;
		contextmenu.style.right  = "unset";
		contextmenu.style.top    = "8px";
		contextmenu.style.bottom = "unset";
		break;

	default: //bottom
		contextmenu.style.left   = `${event.x}px`;
		contextmenu.style.right  = "unset";
		contextmenu.style.top    = "unset";
		contextmenu.style.bottom = "8px";
		break;
	}

	contextmenu.style.display = "block";
	contextmenu.focus();

	if (UI.taskbarPosition === "left" || UI.taskbarPosition === "right") {
		if (contextmenu.offsetTop + contextmenu.offsetHeight > container.offsetHeight) {
			contextmenu.style.top = `${container.offsetHeight - contextmenu.offsetHeight - 8}px`;
		}
		else if (contextmenu.offsetTop < 8) {
			contextmenu.style.top = "8px";
		}
	}
	else {
		if (contextmenu.offsetLeft + contextmenu.offsetWidth > container.offsetWidth) {
			contextmenu.style.left = `${container.offsetWidth - contextmenu.offsetWidth - 8}px`;
		}
		else if (contextmenu.offsetLeft < 8) {
			contextmenu.style.left = "8px";
		}
	}
};

contextmenu.onclick = ()=> {
	contextmenu.style.display = "none";
};

contextmenu.onblur = ()=> {
	contextmenu.style.display = "none";
};

(function minuteLoop() {
	//check session
	const timeMapping = { 1: 15, 2: 30, 3: 60, 4: 2 * 60, 5: 4 * 60, 6: 8 * 60, 7: 24 * 60, 8: Infinity };
	const index = localStorage.getItem("session_timeout") == null ? 1 : parseInt(localStorage.getItem("session_timeout"));

	if ((Date.now() - UI.lastActivity) > 60 * 1000 * timeMapping[index]) {
		fetch("/logout")
			.then(response=> { if (response.status === 200) location.reload(); });
	}

	//update clock
	const now = new Date();
	const m = now.getMinutes();
	const h = (now.getHours() % 12) + m / 60;

	analog_clock_m.style.transform = "rotate(" + m * 6 + "deg)";
	analog_clock_h.style.transform = "rotate(" + h * 30 + "deg)";

	regionalFormat = localStorage.getItem("regional_format") ? localStorage.getItem("regional_format") : "sys";

	date_month.textContent = now.toLocaleDateString(regionalFormat, { month: "short" }).toUpperCase();
	date_date.textContent = now.getDate();
	date_day.textContent = now.toLocaleDateString(regionalFormat, { weekday: "long" });

	setTimeout(()=> minuteLoop(), 60000);
})();
"use strict";
class Syslog extends Window {
	static SEVERITY       = ["Emergency", "Alert", "Critical", "Error", "Warning", "Notice", "Info", "Debug"];
	static SEVERITY_COLOR = ["rgb(232,0,0)", "rgb(232,0,0)", "rgb(232,0,0)", "rgb(240,80,24)", "rgb(255,186,0)", "rgb(32,128,232)", "rgb(144,144,144)", "rgb(96,96,96)"];
	static FACILITY       = ["kern", "user", "mail", "daemon", "auth", "syslog", "lpr", "news", "uucp", "cron", "authpriv", "ftp", "ntp", "audit", "alert", "clock", "local0", "local1", "local2", "local3", "local4", "local5", "local6", "local7"];
	static PROTOCOL       = {1:"UDP", 2:"TCP", 3:"TLS"};
	static DEFAULT_PORT   = {1:514, 2:514, 3:6514};
	static EMPTY_GUID     = "00000000-0000-0000-0000-000000000000";
	static MAX_ROWS       = 20_000;
	static PAGE_SIZE      = 1_000;

	static SEVERITY_FILTERS = [
		{key:"critFilter",  tip:"Emergency, alert and critical", icon:"mono/critical.svg", color:"var(--clr-critical)", levels:[0, 1, 2]},
		{key:"errorFilter", tip:"Error",                         icon:"mono/error.svg",    color:"var(--clr-error)",    levels:[3]},
		{key:"warnFilter",  tip:"Warning",                       icon:"mono/warning.svg",  color:"var(--clr-warning)",  levels:[4]},
		{key:"infoFilter",  tip:"Notice and informational",      icon:"mono/info.svg",     color:"rgb(32,148,240)",     levels:[5, 6]},
		{key:"debugFilter", tip:"Debug",                         icon:"mono/code.svg",     color:"rgb(128,128,128)",    levels:[7]},
	];

	constructor(args) {
		super();

		this.args = {
			autoScroll : true,
			device     : "",
			find       : "",
			critFilter : true,
			errorFilter: true,
			warnFilter : true,
			infoFilter : true,
			debugFilter: true,
			...args
		};

		this.listeners = [];
		this.listenersView = null;
		this.knownDevices = new Set();

		this.filter = null;
		this.cursor = null;
		this.hasEnded = false;
		this.isLoading = false;
		this.isInitialLoading = false;
		this.pendingLive = [];
		this.loadToken = 0;

		Window.AddCssDependencies("list.css");
		Window.AddCssDependencies("syslog.css");

		this.SetTitle("Syslog");
		this.SetIcon("mono/syslog.svg");

		this.SetupToolbar();
		this.listenersButton = this.AddToolbarButton("Listeners", "mono/listener.svg?light");
		this.reloadButton = this.AddToolbarButton("Reload", "mono/update.svg?light");
		this.AddToolbarSeparator();
		this.SetupDeviceFilter();
		this.SetupFind();
		this.AddToolbarSeparator();

		this.severityButtons = Syslog.SEVERITY_FILTERS.map(o=> {
			const button = this.AddToolbarButton(o.tip, `${o.icon}?light`);
			button.classList.add("syslog-toggle-button");
			button.onclick = ()=> {
				this.args[o.key] = !this.args[o.key];
				this.UpdateFiltersUI();
				this.Reload();
			};
			return button;
		});

		this.listenersButton.onclick = ()=> this.ListenersDialog();
		this.reloadButton.onclick = ()=> {
			this.ListDevices();
			this.Reload();
		};

		this.content.addEventListener("keydown", event=> {
			if (event.code === "KeyF" && event.ctrlKey) {
				event.preventDefault();
				this.findInput.focus();
			}
		});

		this.InitializeLog();
		this.UpdateFiltersUI();
		this.UpdateAuthorization();

		this.ListDevices();
		this.Reload();
	}

	UpdateAuthorization() { //overrides
		this.canWrite = KEEP.authorization.includes("*") || KEEP.authorization.includes("syslog:write");
		this.listenersButton.disabled = !this.canWrite;
		super.UpdateAuthorization();
	}

	AfterResize() { //overrides
		this.listBox.FinalizeColumns();
	}

	SetupDeviceFilter() {
		const filterButton = this.AddToolbarButton(null, "mono/filter.svg?light");

		const filterMenu = document.createElement("div");
		filterMenu.className = "win-toolbar-submenu";
		filterButton.appendChild(filterMenu);

		const filterInput = document.createElement("input");
		filterInput.type = "text";
		filterInput.placeholder = "Find";
		filterMenu.appendChild(filterInput);

		const filtersList = document.createElement("div");
		filtersList.className = "no-results-small";
		filterMenu.appendChild(filtersList);

		let index = -1;

		const ClearSelection = ()=> filtersList.childNodes.forEach(o=> o.style.backgroundColor = "");

		const Refresh = ()=> {
			const keyword = filterInput.value.toLowerCase();

			const files = new Set(this.knownDevices);
			if (this.args.device) files.add(this.args.device);

			const devices = [...files]
				.map(file=> ({file:file, name:Syslog.DeviceName(file), type:LOADER.devices.data[file]?.type?.v?.toLowerCase()}))
				.filter(o=> o.name.toLowerCase().includes(keyword))
				.sort((a, b)=> a.name.localeCompare(b.name));

			index = -1;
			filtersList.textContent = "";
			filterMenu.style.height = `${32 + devices.length * 33}px`;
			filterButton.style.borderBottom = this.args.device ? "#c0c0c0 solid 3px" : "";

			for (let i=0; i<devices.length; i++) {
				const device = devices[i];

				const newDevice = document.createElement("div");
				newDevice.textContent = device.name;
				newDevice.style.textTransform = "none";
				newDevice.style.backgroundImage = `url(${LOADER.deviceIcons[device.type] ?? "mono/gear.svg"})`;
				filtersList.appendChild(newDevice);

				if (device.file === this.args.device) {
					newDevice.style.backgroundColor = "var(--clr-select)";
				}

				newDevice.onclick = ()=> {
					ClearSelection();

					if (this.args.device === device.file) {
						this.args.device = "";
						filterButton.style.borderBottom = "";
					}
					else {
						this.args.device = device.file;
						filterButton.style.borderBottom = "#c0c0c0 solid 3px";
						newDevice.style.backgroundColor = "var(--clr-select)";
					}

					this.Reload();
				};
			}
		};

		filterInput.onchange = filterInput.oninput = ()=> Refresh();

		filterInput.onkeydown = event=> {
			if (event.key === "Escape") {
				if (filterInput.value === "") {
					this.listBox.list.focus();
				}
				else {
					filterInput.value = "";
					filterInput.onchange();
				}
			}
			else if (event.key === "Enter") {
				const devices = Array.from(filtersList.childNodes);
				if (index > -1) {
					devices[index]?.onclick();
				}
			}
			else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
				const devices = Array.from(filtersList.childNodes);
				if (devices.length === 0) return;

				if (index > -1) {
					devices[index].style.backgroundColor = "";
				}

				index = event.key === "ArrowUp" ? Math.max(index - 1, 0) : Math.min(index + 1, devices.length - 1);

				devices[index].style.backgroundColor = "var(--clr-select)";
				devices[index].scrollIntoView({block:"nearest"});
			}
		};

		filterButton.onclick = ()=> filterInput.focus();

		filterButton.ondblclick = ()=> {
			this.args.device = "";
			filterButton.style.borderBottom = "";
			ClearSelection();
			this.Reload();
		};

		filterButton.onfocus = ()=> {
			Refresh();

			if (this.popOutWindow) {
				filterButton.firstChild.style.maxHeight = this.content.clientHeight - 32 + "px";
			}
			else {
				filterButton.firstChild.style.maxHeight = container.clientHeight - this.win.offsetTop - 96 + "px";
			}
		};

		filterMenu.onclick = filterMenu.ondblclick = event=> event.stopPropagation();

		this.RefreshDeviceFilter = Refresh;
		Refresh();

		return filterButton;
	}

	SetupFind() {
		const findButton = this.AddToolbarButton(null, "mono/search.svg?light");
		findButton.tabIndex = "-1";
		findButton.style.overflow = "hidden";
		findButton.style.backgroundPosition = "2px center";

		const findInput = document.createElement("input");
		findInput.type = "text";
		findButton.appendChild(findInput);

		this.findInput = findInput;

		findButton.onfocus = ()=> {
			findInput.focus();
		};

		findInput.onfocus = ()=> {
			findButton.style.width = "200px";
		};

		findInput.onblur = ()=> {
			if (findInput.value.length === 0) findButton.style.width = "36px";
		};

		findInput.onchange = ()=> {
			findButton.style.borderBottom = findInput.value.length === 0 ? "none" : "#c0c0c0 solid 2px";
			if (this.args.find === findInput.value) return;
			this.args.find = findInput.value;
			this.Reload();
		};

		findInput.ondblclick = event=> {
			if (event.layerX > 36) return;
			findInput.value = "";
			findInput.onchange();
		};

		findInput.onkeydown = event=> {
			if (event.key === "Escape") {
				findInput.value = "";
				findInput.onchange();
			}
			else if (event.code === "KeyF" && event.ctrlKey) {
				event.preventDefault();
			}
		};

		if (this.args.find.length > 0) {
			findInput.value = this.args.find;
			findButton.style.borderBottom = "#c0c0c0 solid 2px";
			findButton.style.width = "200px";
		}

		return findInput;
	}

	UpdateFiltersUI() {
		for (let i=0; i<Syslog.SEVERITY_FILTERS.length; i++) {
			const filter = Syslog.SEVERITY_FILTERS[i];
			const isOn = this.args[filter.key] !== false;
			this.severityButtons[i].style.backgroundImage = isOn ? `url(${filter.icon})` : `url(${filter.icon}?light)`;
			this.severityButtons[i].style.backgroundColor = isOn ? filter.color : "";
		}
	}

	InitializeLog() {
		this.listBox = new ListBox({
			firstColumnOffset: "28px",
			onSelect     : (id, element)=> this.ShowDetails(element._data),
			onDoubleClick: data=> {
				if (data?.file && LOADER.devices.data[data.file]) LOADER.OpenDeviceByFile(data.file);
			},
			inflate      : (element, entry, type)=> this.InflateRow(element, entry, type),
		});

		this.listBox.SetupTitleBar();
		this.listBox.list.classList.add("syslog-list");
		this.listBox.list.style.bottom = "126px";
		this.listBox.Attach(this.content);

		this.listBox.SetupColumns([
			{label:"time",     value:d=> Syslog.LocalTime(d.time).substring(0, 19)},
			{label:"severity", value:d=> Syslog.SEVERITY[d.severity]},
			{label:"device",   value:d=> Syslog.DeviceName(d.file, d.ip)},
			{label:"host",     value:d=> d.host},
			{label:"app",      value:d=> d.procid ? `${d.app}[${d.procid}]` : d.app},
			{label:"message",  value:d=> d.msg}
		]);

		const widths = [17, 8, 13, 10, 10, 42];
		let left = 0;
		for (let i=0; i<widths.length; i++) {
			this.listBox.columnsElements[i].style.left = `${left}%`;
			this.listBox.columnsElements[i].style.width = `${widths[i]}%`;
			left += widths[i];
		}

		this.defaultElement = this.listBox.list;

		this.listBox.list.addEventListener("keydown", event=> this.listBox.Keydown(event));
		this.listBox.list.addEventListener("scroll", ()=> this.List_onscroll());
		this.listBox.list.addEventListener("wheel", event=> this.List_onwheel(event));
		this.win.addEventListener("mouseup", event=> this.listBox.HandleMouseUp(event));
		this.win.addEventListener("mousemove", event=> this.listBox.HandleMouseMove(event));

		//keep the newest line in view while the list resizes
		this.isAtBottom = true;
		new ResizeObserver(()=> {
			if (this.args.autoScroll && this.isAtBottom) this.listBox.list.scrollTop = this.listBox.list.scrollHeight;
		}).observe(this.listBox.list);

		this.details = document.createElement("div");
		this.details.className = "syslog-details";

		this.options = document.createElement("div");
		this.options.className = "syslog-options";

		const autoScrollBox = document.createElement("div");
		this.options.appendChild(autoScrollBox);
		this.autoScrollToggle = this.CreateToggle("Auto-scroll", this.args.autoScroll, autoScrollBox);
		this.autoScrollToggle.checkbox.onchange = ()=> {
			this.args.autoScroll = this.autoScrollToggle.checkbox.checked;
			if (this.args.autoScroll) this.listBox.list.scrollTop = this.listBox.list.scrollHeight;
		};

		this.statusLabel = document.createElement("div");
		this.statusLabel.className = "syslog-status";
		this.options.appendChild(this.statusLabel);

		this.content.append(this.details, this.options);
	}

	static ThresholdLabel(value) {
		if (value < 0) return "Off";
		if (value >= 7) return "All";
		if (value === 0) return "Emergency only";
		return `${Syslog.SEVERITY[value]} and up`;
	}

	static LocalTime(utc) {
		const date = new Date(`${utc.replace(" ", "T")}Z`);
		if (isNaN(date.getTime())) return utc;

		const Pad = (n, l=2)=> n.toString().padStart(l, "0");
		return `${date.getFullYear()}-${Pad(date.getMonth()+1)}-${Pad(date.getDate())} ${Pad(date.getHours())}:${Pad(date.getMinutes())}:${Pad(date.getSeconds())}.${Pad(date.getMilliseconds(), 3)}`;
	}

	static DeviceName(file, fallback) {
		const entry = LOADER.devices.data[file];
		if (!entry) return fallback || file;
		return entry.name?.v || entry.hostname?.v || entry.ip?.v || fallback || file;
	}

	static Unescape(value) {
		if (value.indexOf("\\") < 0) return value;
		return value.replace(/\\(.)/g, (_, c)=> c === "t" ? "\t" : c === "n" ? "\n" : c === "r" ? "\r" : c);
	}

	//file \t time \t severity \t facility \t source \t hostname \t app \t procid \t msgid \t structured-data \t message
	static ParseLine(line) {
		const split = line.split("\t");
		if (split.length < 11) return null;

		const severity = parseInt(split[2]);
		if (isNaN(severity)) return null;

		return {
			file    : split[0],
			time    : split[1],
			severity: severity,
			facility: parseInt(split[3]),
			ip      : split[4],
			host    : Syslog.Unescape(split[5]),
			app     : Syslog.Unescape(split[6]),
			procid  : Syslog.Unescape(split[7]),
			msgid   : Syslog.Unescape(split[8]),
			sd      : Syslog.Unescape(split[9]),
			msg     : Syslog.Unescape(split.slice(10).join("\t"))
		};
	}

	GetFilter() {
		let levels = 0;
		for (const filter of Syslog.SEVERITY_FILTERS) {
			if (this.args[filter.key] === false) continue;
			for (const level of filter.levels) levels |= 1 << level;
		}

		const find = this.args.find.trim();

		return {
			device   : this.args.device || null,
			levels   : levels,
			find     : find || null,
			findLower: find.toLowerCase() || null
		};
	}

	BuildQuery(filter, cursor) {
		const query = [`limit=${Syslog.PAGE_SIZE}`];
		if (cursor?.before) query.push(`before=${encodeURIComponent(cursor.before)}`, `skip=${cursor.skip}`);
		if (filter.device)  query.push(`device=${encodeURIComponent(filter.device)}`);
		if (filter.find)    query.push(`q=${encodeURIComponent(filter.find)}`);

		if (filter.levels !== 0xff) {
			let levels = "";
			for (let i=0; i<8; i++) {
				if (filter.levels & (1 << i)) levels += i;
			}
			query.push(`levels=${levels}`);
		}

		return query.join("&");
	}

	MatchLive(line, filter) {
		const t1 = line.indexOf("\t");
		if (t1 < 0 || line.length < t1 + 28) return false;

		if (filter.device && line.substring(0, t1) !== filter.device) return false;

		const severity = line.charCodeAt(t1 + 25) - 48;
		if (severity < 0 || severity > 7 || !(filter.levels & (1 << severity))) return false;

		if (filter.findLower) {
			const start = line.indexOf("\t", t1 + 27); //after facility
			if (start < 0 || !line.substring(start + 1).toLowerCase().includes(filter.findLower)) return false;
		}

		return true;
	}

	async Reload() {
		const token = ++this.loadToken;

		this.listBox.SetItems([]);
		this.ShowDetails(null);
		this.filter = this.GetFilter();
		this.cursor = null;
		this.hasEnded = false;
		this.isLoading = true;
		this.isInitialLoading = true;
		this.pendingLive = [];
		this.UpdateStatus();

		try {
			const response = await fetch(`syslog/list?${this.BuildQuery(this.filter, null)}`);
			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const json = await response.json();
			if (json.error) throw json.error;
			if (token !== this.loadToken) return;

			const entries = json.lines.map(o=> Syslog.ParseLine(o)).filter(o=> o);

			//live lines that arrived while loading, and are not already on disk
			const newest = entries.length > 0 ? entries[entries.length - 1].time : null;
			const pending = newest ? this.pendingLive.filter(o=> o.time > newest) : this.pendingLive;

			if (json.end) entries.unshift({marker:true});
			this.listBox.AddItems(entries.concat(pending));

			this.cursor = json.end ? null : {before:json.before, skip:json.skip};
			this.hasEnded = json.end;

			this.listBox.list.scrollTop = this.listBox.list.scrollHeight;
		}
		catch (ex) {
			if (token === this.loadToken) this.ConfirmBox(ex, true, "mono/error.svg");
		}
		finally {
			if (token === this.loadToken) {
				this.isLoading = false;
				this.isInitialLoading = false;
				this.pendingLive = [];
				this.UpdateStatus();
				this.FillViewport();
			}
		}
	}

	async LoadOlder() {
		if (this.isLoading || this.hasEnded || !this.cursor?.before) return;

		const token = this.loadToken;
		this.isLoading = true;

		try {
			const response = await fetch(`syslog/list?${this.BuildQuery(this.filter, this.cursor)}`);
			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const json = await response.json();
			if (json.error) throw json.error;
			if (token !== this.loadToken) return;

			const entries = json.lines.map(o=> Syslog.ParseLine(o)).filter(o=> o);
			if (json.end) entries.unshift({marker:true});

			const list = this.listBox.list;
			const oldHeight = list.scrollHeight;
			const oldTop = list.scrollTop;

			this.listBox.AddItems(entries, true);
			list.scrollTop = oldTop + list.scrollHeight - oldHeight;
			this.listBox.UpdateViewport();

			this.cursor = json.end ? null : {before:json.before, skip:json.skip};
			this.hasEnded = json.end;
		}
		catch (ex) {
			if (token === this.loadToken) this.ConfirmBox(ex, true, "mono/error.svg");
		}
		finally {
			if (token === this.loadToken) {
				this.isLoading = false;
				this.UpdateStatus();
				this.FillViewport();
			}
		}
	}

	//keep loading until the list is scrollable
	FillViewport() {
		const list = this.listBox.list;
		if (this.hasEnded || this.isLoading || list.clientHeight === 0) return;
		if (list.scrollHeight > list.clientHeight + 4) return;
		setTimeout(()=> this.LoadOlder(), 0);
	}

	List_onscroll() {
		const list = this.listBox.list;
		this.isAtBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 32;

		if (this.hasEnded || this.isLoading) return;
		if (list.scrollTop < 2) this.LoadOlder();
	}

	List_onwheel(event) {
		if (this.hasEnded || this.isLoading) return;
		if (event.deltaY > -1) return;
		if (this.listBox.list.scrollTop === 0) this.LoadOlder();
	}

	AddLive(lines) {
		if (!Array.isArray(lines) || lines.length === 0 || !this.filter) return;

		let newDevice = false;
		const entries = [];
		for (let i=0; i<lines.length; i++) {
			const file = lines[i].substring(0, lines[i].indexOf("\t"));
			if (file.length > 0 && !this.knownDevices.has(file)) {
				this.knownDevices.add(file);
				newDevice = true;
			}

			if (!this.MatchLive(lines[i], this.filter)) continue;
			const entry = Syslog.ParseLine(lines[i]);
			if (entry) entries.push(entry);
		}

		if (newDevice) this.RefreshDeviceFilter();
		if (entries.length === 0) return;

		if (this.isInitialLoading) {
			this.pendingLive.push(...entries);
			return;
		}

		const list = this.listBox.list;
		const wasAtBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 32;

		this.listBox.AddItems(entries);

		const overflow = list.childNodes.length - Syslog.MAX_ROWS;
		if (overflow > 0) this.TrimTop(overflow);

		if (this.args.autoScroll && wasAtBottom) {
			list.scrollTop = list.scrollHeight;
		}

		this.UpdateStatus();
	}

	TrimTop(count) {
		const list = this.listBox.list;
		const oldHeight = list.scrollHeight;
		const oldTop = list.scrollTop;

		this.listBox.RemoveItems(count, true);
		list.scrollTop = Math.max(0, oldTop - (oldHeight - list.scrollHeight));

		//resume paging from the oldest remaining line
		const items = this.listBox.items;
		const first = items.findIndex(o=> !o.marker);
		if (first < 0) return;

		const before = items[first].time;
		let skip = 0;
		while (first + skip < items.length && items[first + skip].time === before) skip++;

		this.cursor = {before:before, skip:skip};
		this.hasEnded = false;
	}

	UpdateStatus() {
		const count = this.listBox.items.filter(o=> !o.marker).length;
		this.statusLabel.textContent = this.isLoading && count === 0
			? "Loading..."
			: `${count} ${count === 1 ? "entry" : "entries"}`;
	}

	InflateRow(element, entry, type) {
		if (entry.marker) {
			element.classList.add("syslog-marker");
			element.textContent = "- END -";
			return;
		}

		const dot = document.createElement("div");
		dot.className = "syslog-severity-dot";
		dot.style.backgroundColor = Syslog.SEVERITY_COLOR[entry.severity];
		element.appendChild(dot);

		this.listBox.InflateElement(element, entry, type);

		if (entry.severity <= 3) {
			element.style.color = `color-mix(in srgb, ${Syslog.SEVERITY_COLOR[entry.severity]} 60%, var(--clr-dark))`;
		}
	}

	ShowDetails(entry) {
		this.details.textContent = "";
		if (!entry || entry.marker) return;

		const meta = document.createElement("div");
		meta.className = "syslog-details-meta";
		this.details.appendChild(meta);

		const AddMeta = (label, value)=> {
			if (value === undefined || value === null || value === "") return;
			const span = document.createElement("span");
			const b = document.createElement("b");
			b.textContent = `${label}:`;
			span.append(b, document.createTextNode(value));
			meta.appendChild(span);
		};

		AddMeta("Time",     Syslog.LocalTime(entry.time));
		AddMeta("Severity", Syslog.SEVERITY[entry.severity]);
		AddMeta("Facility", Syslog.FACILITY[entry.facility] ?? entry.facility);
		AddMeta("Device",   Syslog.DeviceName(entry.file, entry.ip));
		AddMeta("Source",   entry.ip);
		AddMeta("Host",     entry.host);
		AddMeta("App",      entry.app);
		AddMeta("PID",      entry.procid);
		AddMeta("Msg ID",   entry.msgid);

		const message = document.createElement("div");
		message.className = "syslog-details-message";
		message.textContent = entry.msg;
		this.details.appendChild(message);

		if (entry.sd) {
			const sd = document.createElement("div");
			sd.className = "syslog-details-sd";
			sd.textContent = entry.sd;
			this.details.appendChild(sd);
		}
	}

	async ListDevices() {
		try {
			const response = await fetch("syslog/devices");
			if (response.status !== 200) return;

			const json = await response.json();
			if (!Array.isArray(json)) return;

			for (let i=0; i<json.length; i++) this.knownDevices.add(json[i]);
			this.RefreshDeviceFilter();
		}
		catch {}
	}

	//returns false on failure
	async ListListeners() {
		if (!this.canWrite) return false;

		try {
			const response = await fetch("syslog/listeners/list");
			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const json = await response.json();
			if (json.error) throw json.error;

			this.listeners = json;

			//refresh the open listeners dialog, unless an entry is being edited
			if (this.listenersView?.isList && this.listenersView.innerBox.isConnected) {
				this.listenersView.ShowList(this.listenersView.message);
			}

			return true;
		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/error.svg");
			return false;
		}
	}

	ListenersChanged() { //keep-alive
		if (this.listenersView?.innerBox.isConnected) this.ListListeners();
	}

	//returns an error message, or null on success
	async SaveListeners(list, changedGuid=null) {
		const payload = list.map(o=> ({
			enabled    : o.enabled,
			guid       : o.guid || Syslog.EMPTY_GUID,
			name       : o.name ?? "",
			protocol   : o.protocol,
			bindAddress: o.bindAddress || "0.0.0.0",
			port       : o.port,
			certificate: o.certificate || null,
			password   : o.password ?? "",
			console    : o.console,
			disk       : o.disk,
			email      : o.email,
			live       : o.live,
			smtpProfile: o.smtpProfile || Syslog.EMPTY_GUID,
			recipients : o.recipients ?? [],
			accept     : o.accept,
			devices    : o.devices ?? []
		}));

		try {
			const response = await fetch("syslog/listeners/save", {
				method: "POST",
				body  : JSON.stringify(payload)
			});

			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const json = await response.json();
			if (json.error) throw json.error;

			const before = new Set(this.listeners.map(o=> o.guid));
			this.listeners = json;

			const failed = json.find(o=> o.enabled && !o.running && (o.guid === changedGuid || !before.has(o.guid)));
			if (failed) {
				return `Failed to start ${failed.name || "listener"} on ${Syslog.PROTOCOL[failed.protocol]} port ${failed.port}: ${failed.error ?? "unknown error"}`;
			}

			return null;
		}
		catch (ex) {
			await this.ListListeners();
			return `${ex}`;
		}
	}

	async ListenersDialog() {
		if (!await this.ListListeners()) return;

		const dialog = this.DialogBox("480px");
		if (dialog === null) return;

		const {okButton, cancelButton, innerBox, buttonBox} = dialog;
		const dialogBox = innerBox.parentElement;

		const addButton = document.createElement("input");
		addButton.type = "button";
		addButton.value = "Add";
		addButton.className = "with-icon";
		addButton.style.float = "left";
		addButton.style.marginLeft = "8px";
		addButton.style.backgroundImage = "url(mono/add.svg?light)";
		addButton.onclick = ()=> ShowEditor(null);
		buttonBox.prepend(addButton);

		const view = {innerBox:innerBox, isList:false, message:null};
		this.listenersView = view;

		let selectedGuid = null;

		const ResetView = (maxWidth, maxHeight)=> {
			innerBox.textContent = "";
			innerBox.style.cssText = "position:absolute; left:0; right:0; top:0; bottom:52px; overflow-y:auto; box-sizing:border-box;";
			dialogBox.style.maxWidth = maxWidth;
			dialogBox.style.maxHeight = maxHeight;
			okButton.disabled = false;
			addButton.style.display = "none";
			view.isList = false;
		};

		const ShowList = (message=null)=> {
			ResetView("640px", "480px");
			view.isList = true;
			view.message = message;

			innerBox.className = "syslog-listeners-view";

			okButton.value = "Close";
			okButton.onclick = ()=> dialog.Close();
			addButton.style.display = "";
			cancelButton.style.display = "none";
			cancelButton.onclick = ()=> dialog.Close();

			const list = document.createElement("div");
			list.className = "syslog-listeners";
			innerBox.appendChild(list);

			if (message) {
				const messageBox = document.createElement("div");
				messageBox.className = "syslog-listeners-message";
				messageBox.textContent = message;
				innerBox.appendChild(messageBox);
			}

			if (this.listeners.length === 0) {
				const empty = document.createElement("div");
				empty.className = "syslog-listeners-empty";
				empty.textContent = "No listeners";
				list.appendChild(empty);
			}

			for (let i=0; i<this.listeners.length; i++) {
				const listener = this.listeners[i];

				const element = document.createElement("div");
				element.className = "syslog-listener";
				if (listener.guid === selectedGuid) element.classList.add("selected");
				list.appendChild(element);

				const toggleBox = document.createElement("div");
				toggleBox.className = "syslog-listener-toggle";
				element.appendChild(toggleBox);

				const toggle = this.CreateToggle("", listener.enabled, toggleBox);
				toggle.label.onclick = event=> event.stopPropagation();
				toggle.label.ondblclick = event=> event.stopPropagation();
				toggle.checkbox.onchange = async ()=> {
					toggle.checkbox.disabled = true;
					const updated = this.listeners.map(o=> o.guid === listener.guid ? {...o, enabled:toggle.checkbox.checked} : o);
					const error = await this.SaveListeners(updated, listener.guid);
					if (innerBox.isConnected) ShowList(error);
				};

				const name = document.createElement("div");
				name.className = "syslog-listener-name";
				name.textContent = listener.name || `Syslog ${Syslog.PROTOCOL[listener.protocol]}`;

				const endpoint = document.createElement("div");
				endpoint.className = "syslog-listener-endpoint";
				const address = listener.bindAddress.includes(":") ? `[${listener.bindAddress}]` : listener.bindAddress;
				endpoint.textContent = `${Syslog.PROTOCOL[listener.protocol]} ${address}:${listener.port}`;

				const deleteButton = document.createElement("button");
				deleteButton.className = "syslog-listener-delete";
				deleteButton.setAttribute("aria-label", "Delete");
				deleteButton.onclick = event=> {
					event.stopPropagation();
					ShowDelete(listener);
				};
				deleteButton.ondblclick = event=> event.stopPropagation();

				element.append(name, endpoint, deleteButton);

				element.onclick = ()=> {
					for (const child of list.childNodes) child.classList.remove("selected");
					element.classList.add("selected");
					selectedGuid = listener.guid;
				};

				element.ondblclick = ()=> ShowEditor(listener);
			}
		};

		const ShowDelete = listener=> {
			ResetView("480px", "180px");

			innerBox.className = "syslog-listeners-delete";
			innerBox.textContent = `Are you sure you want to delete ${listener.name || "this listener"}?`;

			okButton.value = "Delete";
			cancelButton.value = "Back";
			cancelButton.style.display = "";
			cancelButton.onclick = ()=> ShowList();

			okButton.onclick = async ()=> {
				okButton.disabled = true;
				const error = await this.SaveListeners(this.listeners.filter(o=> o.guid !== listener.guid));
				selectedGuid = null;
				if (innerBox.isConnected) ShowList(error);
			};

			setTimeout(()=> cancelButton.focus(), 100);
		};

		const ShowEditor = listener=> {
			ResetView("1000px", "640px");

			innerBox.className = "";
			innerBox.style.padding = "16px 24px";
			innerBox.style.display = "grid";
			innerBox.style.gridTemplateColumns = "112px minmax(200px, 320px) minmax(240px, 1fr)";
			innerBox.style.gridAutoRows = "36px";
			innerBox.style.alignItems = "center";
			innerBox.style.columnGap = "8px";

			okButton.value = listener ? "Save" : "Create";
			cancelButton.value = "Back";
			cancelButton.style.display = "";
			cancelButton.onclick = ()=> ShowList();

			let row = 0;
			const AddRow = (label, element)=> {
				row++;
				const labelElement = document.createElement("div");
				labelElement.textContent = `${label}:`;
				labelElement.style.gridArea = `${row} / 1`;
				element.style.gridArea = `${row} / 2`;
				innerBox.append(labelElement, element);
			};

			const AddSection = text=> {
				row++;
				const section = document.createElement("div");
				section.textContent = text;
				section.style.gridArea = `${row} / 1 / ${row} / 3`;
				section.style.fontWeight = "600";
				section.style.alignSelf = "end";
				innerBox.appendChild(section);
			};

			const AddRange = (label, value)=> {
				const box = document.createElement("div");
				box.className = "syslog-range";

				const range = document.createElement("input");
				range.type = "range";
				range.min = -1;
				range.max = 7;
				range.step = 1;
				range.value = value;

				const valueLabel = document.createElement("div");
				valueLabel.textContent = Syslog.ThresholdLabel(value);

				range.oninput = ()=> {
					valueLabel.textContent = Syslog.ThresholdLabel(parseInt(range.value));
					range.onchange?.();
				};

				box.append(range, valueLabel);
				AddRow(label, box);
				return range;
			};

			const nameInput = document.createElement("input");
			nameInput.type = "text";
			nameInput.placeholder = "Syslog";
			AddRow("Name", nameInput);

			const protocolBox = new FewBox(Object.values(Syslog.PROTOCOL));
			protocolBox.container.style.margin = "2px 4px";
			protocolBox.container.style.maxWidth = "none";
			AddRow("Protocol", protocolBox.container);

			const GetProtocol = ()=> parseInt(Object.keys(Syslog.PROTOCOL)[protocolBox.index] ?? 1);

			const bindInput = document.createElement("input");
			bindInput.type = "text";
			bindInput.placeholder = "0.0.0.0";
			AddRow("Bind address", bindInput);

			const portInput = document.createElement("input");
			portInput.type = "number";
			portInput.min = 1;
			portInput.max = 65535;
			AddRow("Port", portInput);

			const certInput = document.createElement("select");
			AddRow("Certificate", certInput);

			const passwordInput = document.createElement("input");
			passwordInput.type = "password";
			passwordInput.placeholder = listener?.hasPassword ? "unchanged" : "";
			AddRow("Password", passwordInput);

			AddSection("Actions, by minimum severity");

			const consoleRange = AddRange("Console",       listener?.console ?? -1);
			const diskRange    = AddRange("Write to disk", listener?.disk    ?? 7);
			const liveRange    = AddRange("Live view",     listener?.live    ?? 7);
			const emailRange   = AddRange("Email",         listener?.email   ?? -1);

			const smtpInput = document.createElement("select");
			AddRow("SMTP profile", smtpInput);

			const recipientsInput = document.createElement("input");
			recipientsInput.type = "text";
			recipientsInput.placeholder = "user@example.com; ...";
			AddRow("Recipients", recipientsInput);

			//whitelist panel
			const whitelistPanel = document.createElement("div");
			whitelistPanel.className = "syslog-whitelist";
			whitelistPanel.style.gridArea = `1 / 3 / ${row + 1} / 4`;
			innerBox.appendChild(whitelistPanel);

			const acceptBox = new FewBox(["All devices", "Whitelist"]);
			acceptBox.container.style.margin = "0";
			acceptBox.container.style.maxWidth = "none";
			acceptBox.Select(listener?.accept === 1 ? 1 : 0);
			whitelistPanel.appendChild(acceptBox.container);

			const hint = document.createElement("div");
			hint.className = "syslog-whitelist-hint";
			whitelistPanel.appendChild(hint);

			const findDeviceInput = document.createElement("input");
			findDeviceInput.type = "search";
			findDeviceInput.placeholder = "Find";
			findDeviceInput.style.margin = "2px 0";
			whitelistPanel.appendChild(findDeviceInput);

			const whitelistContainer = document.createElement("div");
			whitelistContainer.className = "syslog-whitelist-container";
			whitelistPanel.appendChild(whitelistContainer);

			const selectedDevices = new Set(listener?.devices ?? []);

			const devicesListBox = new ListBox({firstColumnOffset:"48px"});
			devicesListBox.SetupTitleBar();
			devicesListBox.SetupBuiltInSort();
			devicesListBox.list.style.border = "rgb(82,82,82) solid 2px";
			devicesListBox.list.addEventListener("keydown", event=> devicesListBox.Keydown(event));
			whitelistContainer.append(devicesListBox.listTitleOuter, devicesListBox.list);

			devicesListBox.inflate = (element, entry, type)=> {
				const box = document.createElement("div");
				box.style.left = "4px";
				box.style.height = "22px";
				const toggle = this.CreateToggle("", selectedDevices.has(entry.file), box);
				toggle.label.style.transform = "translateY(-14px)";
				toggle.checkbox.onchange = ()=> {
					if (toggle.checkbox.checked) {
						selectedDevices.add(entry.file);
					}
					else {
						selectedDevices.delete(entry.file);
					}
				};
				element.appendChild(box);
				devicesListBox.InflateElement(element, entry, type);
			};

			devicesListBox.SetupColumns([
				{label:"name", value:d=> d.name},
				{label:"IP",   value:d=> d.ip}
			]);

			const allDevices = Object.keys(LOADER.devices.data).map(file=> {
				const entry = LOADER.devices.data[file];
				return {
					file: file,
					name: entry.name?.v || entry.hostname?.v || entry.ip?.v || file,
					ip  : entry.ip?.v ?? ""
				};
			}).sort((a, b)=> {
				//selected first
				const sa = selectedDevices.has(a.file), sb = selectedDevices.has(b.file);
				if (sa !== sb) return sa ? -1 : 1;
				return a.name.localeCompare(b.name);
			});

			const RefreshDevices = ()=> {
				const keywords = findDeviceInput.value.trim().toLowerCase().split(" ").filter(o=> o.length > 0);
				const filtered = keywords.length === 0
					? allDevices
					: allDevices.filter(d=> keywords.every(k=> d.name.toLowerCase().includes(k) || d.ip.toLowerCase().includes(k)));
				devicesListBox.SetItems(filtered);
			};

			findDeviceInput.oninput = ()=> RefreshDevices();

			acceptBox.container.onchange = ()=> {
				const isWhitelist = acceptBox.index === 1;
				hint.textContent = isWhitelist
					? "Accept messages only from the selected devices."
					: "Accept messages from any device in the database. Senders are matched by the device's IP address.";
				findDeviceInput.style.display = isWhitelist ? "" : "none";
				whitelistContainer.style.display = isWhitelist ? "" : "none";
				if (isWhitelist) setTimeout(()=> devicesListBox.FinalizeColumns(), 0);
			};

			acceptBox.container.onchange();
			RefreshDevices();

			//values
			if (listener) {
				nameInput.value = listener.name;
				protocolBox.Select(Math.max(Object.keys(Syslog.PROTOCOL).indexOf(`${listener.protocol}`), 0));
				bindInput.value = listener.bindAddress;
				portInput.value = listener.port;
				recipientsInput.value = (listener.recipients ?? []).join("; ");
			}
			else {
				protocolBox.Select(0);
				bindInput.value = "0.0.0.0";
				portInput.value = Syslog.DEFAULT_PORT[1];
			}

			let lastProtocol = GetProtocol();
			const Protocol_onchange = ()=> {
				const protocol = GetProtocol();
				if (parseInt(portInput.value) === Syslog.DEFAULT_PORT[lastProtocol] || portInput.value.length === 0) {
					portInput.value = Syslog.DEFAULT_PORT[protocol];
				}
				lastProtocol = protocol;

				certInput.disabled = protocol !== 3;
				passwordInput.disabled = protocol !== 3;
			};
			protocolBox.container.onchange = ()=> Protocol_onchange();
			Protocol_onchange();

			emailRange.onchange = ()=> {
				const isOff = parseInt(emailRange.value) < 0;
				smtpInput.disabled = isOff;
				recipientsInput.disabled = isOff;
			};
			emailRange.onchange();

			(async ()=> {
				try {
					const response = await fetch("config/cert/list");
					if (response.status !== 200) return;
					const json = await response.json();

					const none = document.createElement("option");
					none.value = "";
					none.text = "none";
					certInput.appendChild(none);

					for (const cert in json.data) {
						const option = document.createElement("option");
						option.value = cert;
						option.text = cert;
						certInput.appendChild(option);
					}

					certInput.value = listener?.certificate ?? "";
				}
				catch {}
			})();

			(async ()=> {
				try {
					const response = await fetch("config/smtpprofiles/list");
					if (response.status !== 200) return;
					const json = await response.json();
					if (!Array.isArray(json)) return;

					const none = document.createElement("option");
					none.value = Syslog.EMPTY_GUID;
					none.text = "none";
					smtpInput.appendChild(none);

					for (let i=0; i<json.length; i++) {
						const option = document.createElement("option");
						option.value = json[i].guid;
						option.text = json[i].sender || json[i].username || json[i].server;
						smtpInput.appendChild(option);
					}

					smtpInput.value = listener?.smtpProfile ?? Syslog.EMPTY_GUID;
					if (smtpInput.selectedIndex < 0) smtpInput.value = Syslog.EMPTY_GUID;
				}
				catch {}
			})();

			setTimeout(()=> nameInput.focus(), 200);

			okButton.onclick = async ()=> {
				const protocol = GetProtocol();
				const port = parseInt(portInput.value);
				const email = parseInt(emailRange.value);

				const required = [];
				if (isNaN(port) || port < 1 || port > 65535) required.push(portInput);
				if (protocol === 3 && !certInput.value) required.push(certInput);
				if (email >= 0 && recipientsInput.value.trim().length === 0) required.push(recipientsInput);

				for (const input of [portInput, certInput, recipientsInput]) {
					input.required = required.includes(input);
				}

				if (required.length > 0) {
					required[0].focus();
					return;
				}

				const updated = {
					enabled    : listener ? listener.enabled : true,
					guid       : listener ? listener.guid : Syslog.EMPTY_GUID,
					name       : nameInput.value.trim(),
					protocol   : protocol,
					bindAddress: bindInput.value.trim() || "0.0.0.0",
					port       : port,
					certificate: protocol === 3 ? certInput.value : null,
					password   : protocol === 3 ? passwordInput.value : "",
					console    : parseInt(consoleRange.value),
					disk       : parseInt(diskRange.value),
					email      : email,
					live       : parseInt(liveRange.value),
					smtpProfile: smtpInput.value || Syslog.EMPTY_GUID,
					recipients : recipientsInput.value.split(/[;,\s]+/).map(o=> o.trim()).filter(o=> o.length > 0),
					accept     : acceptBox.index === 1 ? 1 : 0,
					devices    : [...selectedDevices]
				};

				const list = listener
					? this.listeners.map(o=> o.guid === listener.guid ? updated : o)
					: [...this.listeners, updated];

				okButton.disabled = true;
				const knownGuids = new Set(this.listeners.map(o=> o.guid));
				const error = await this.SaveListeners(list, listener?.guid ?? null);

				if (listener) {
					selectedGuid = listener.guid;
				}
				else {
					selectedGuid = this.listeners.find(o=> !knownGuids.has(o.guid))?.guid ?? null;
				}

				if (innerBox.isConnected) ShowList(error);
			};
		};

		view.ShowList = ShowList;
		ShowList();
	}
}

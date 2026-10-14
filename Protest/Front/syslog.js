"use strict";
class Syslog extends Window {
	static SEVERITY       = ["Emergency", "Alert", "Critical", "Error", "Warning", "Notice", "Info", "Debug"];
	static SEVERITY_COLOR = ["rgb(208,32,168)", "var(--clr-critical)", "var(--clr-error)", "var(--clr-orange)", "var(--clr-warning)", "rgb(38,186,158)", "rgb(32,148,240)", "rgb(128,148,168)"];
	static SEVERITY_ICON  = ["mono/emergency.svg", "mono/bell.svg", "mono/critical.svg", "mono/error.svg", "mono/warning.svg", "mono/notice.svg", "mono/info.svg", "mono/bug.svg"];
	static FACILITY       = ["kern", "user", "mail", "daemon", "auth", "syslog", "lpr", "news", "uucp", "cron", "authpriv", "ftp", "ntp", "audit", "alert", "clock", "local0", "local1", "local2", "local3", "local4", "local5", "local6", "local7"];
	static PROTOCOL       = {1:"UDP", 2:"TCP", 3:"TLS"};
	static DEFAULT_PORT   = {1:514, 2:601, 3:6514};
	static EMPTY_GUID     = "00000000-0000-0000-0000-000000000000";
	static MAX_ROWS       = 20_000;
	static PAGE_SIZE      = 1_000;
	static UNMATCHED      = ":unmatched"; //device filter for senders not in the devices database, never a file name

	static SEVERITY_FILTERS = [
		{key:"emergFilter", tip:"Emergency",     icon:"mono/emergency.svg", color:Syslog.SEVERITY_COLOR[0], levels:[0]},
		{key:"alertFilter", tip:"Alert",         icon:"mono/bell.svg",      color:Syslog.SEVERITY_COLOR[1], levels:[1]},
		{key:"critFilter",  tip:"Critical",      icon:"mono/critical.svg",  color:Syslog.SEVERITY_COLOR[2], levels:[2]},
		{key:"errorFilter", tip:"Error",         icon:"mono/error.svg",     color:Syslog.SEVERITY_COLOR[3], levels:[3]},
		{key:"warnFilter",  tip:"Warning",       icon:"mono/warning.svg",   color:Syslog.SEVERITY_COLOR[4], levels:[4]},
		{key:"noticeFilter",tip:"Notice",        icon:"mono/notice.svg",    color:Syslog.SEVERITY_COLOR[5], levels:[5]},
		{key:"infoFilter",  tip:"Informational", icon:"mono/info.svg",      color:Syslog.SEVERITY_COLOR[6], levels:[6]},
		{key:"debugFilter", tip:"Debug",         icon:"mono/bug.svg",       color:Syslog.SEVERITY_COLOR[7], levels:[7]},
	];

	constructor(args) {
		super();

		this.args = {
			autoScroll  : true,
			device      : "",
			find        : "",
			emergFilter : true,
			alertFilter : true,
			critFilter  : true,
			errorFilter : true,
			warnFilter  : true,
			noticeFilter: false,
			infoFilter  : false,
			debugFilter : false,
			...args
		};

		this.listeners = [];
		this.listenersView = null;
		this.knownDevices = new Set();
		this.hasUnmatched = false;

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

			const isUnmatched = this.args.device === Syslog.UNMATCHED;

			const files = new Set(this.knownDevices);
			if (this.args.device && !isUnmatched) files.add(this.args.device);

			const devices = [...files]
				.map(file=> ({file:file, name:Syslog.DeviceName(file), type:LOADER.devices.data[file]?.type?.v?.toLowerCase()}))
				.sort((a, b)=> a.name.localeCompare(b.name));

			//live only, listed once an unmatched sender is seen
			if (this.hasUnmatched || isUnmatched) {
				devices.unshift({file:Syslog.UNMATCHED, name:"Unmatched", icon:"mono/question.svg"});
			}

			const filtered = devices.filter(o=> o.name.toLowerCase().includes(keyword));

			index = -1;
			filtersList.textContent = "";
			filterMenu.style.height = `${32 + filtered.length * 33}px`;
			filterButton.style.borderBottom = this.args.device ? "#c0c0c0 solid 3px" : "";

			for (let i=0; i<filtered.length; i++) {
				const device = filtered[i];

				const newDevice = document.createElement("div");
				newDevice.textContent = device.name;
				newDevice.style.textTransform = "none";
				newDevice.style.backgroundImage = `url(${device.icon ?? LOADER.deviceIcons[device.type] ?? "mono/gear.svg"})`;
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
		this.listBox.SetupCounter(()=> this.EntryCount());
		this.listBox.list.classList.add("syslog-list");
		this.listBox.list.style.bottom = "126px";
		this.listBox.Attach(this.content);

		this.listBox.SetupColumns([
			{label:"severity", render:d=> Syslog.SeverityCell(d.severity)},
			{label:"time",     value:d=> Syslog.LocalTime(d.time).substring(0, 19)},
			{label:"device",   render:d=> Syslog.DeviceCell(d)},
			{label:"source",   value:d=> d.source},
			{label:"hostname", value:d=> d.hostname},
			{label:"message",  value:d=> d.msg}
		]);

		const widths = [10, 13, 13, 10, 10, 44];
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

		this.isAtBottom = true;
		new ResizeObserver(()=> {
			if (this.args.autoScroll && this.isAtBottom) this.listBox.list.scrollTop = this.listBox.list.scrollHeight;
		}).observe(this.listBox.list);

		this.details = document.createElement("div");
		this.details.className = "syslog-details";

		this.options = document.createElement("div");
		this.options.className = "syslog-options";

		this.options.appendChild(this.listBox.counter);

		const autoScrollBox = document.createElement("div");
		autoScrollBox.style.paddingLeft = "16px";
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

	//the addresses in the RFC 5424 [origin ip="..."] element, as the sender reports them
	static OriginIp(entry) {
		const element = /\[origin ([^\]]*)\]/.exec(entry.sd)?.[1];
		if (!element) return "--";
		const ips = [...element.matchAll(/\bip="([^"]*)"/g)].map(o=> o[1]).filter(o=> o.length > 0 && o !== "0.0.0.0");
		return ips.length > 0 ? ips.join("; ") : "--";
	}

	static DeviceCell(entry) {
		const cell = document.createElement("div");
		if (entry.file) {
			cell.textContent = Syslog.DeviceName(entry.file, entry.source);
		}
		else {
			cell.textContent = "Unmatched";
			cell.className = "syslog-unmatched";
		}
		return cell;
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
			source  : split[4],
			hostname: Syslog.Unescape(split[5]),
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

		if (filter.device && line.substring(0, t1) !== (filter.device === Syslog.UNMATCHED ? "" : filter.device)) return false;

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
			//unmatched lines are never stored, only the live view has them
			if (this.filter.device === Syslog.UNMATCHED) {
				this.hasEnded = true;
				return;
			}

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
		if (this.filter?.device === Syslog.UNMATCHED) return;

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
			else if (file.length === 0 && !this.hasUnmatched) {
				this.hasUnmatched = true;
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

	//the end marker is always the first item
	EntryCount() {
		const items = this.listBox.items;
		return items.length - (items[0]?.marker ? 1 : 0);
	}

	UpdateStatus() {
		const count = this.EntryCount();
		this.listBox.counter.textContent = count;
		this.statusLabel.textContent = this.isLoading && count === 0 ? "Loading..."
			: this.filter?.device === Syslog.UNMATCHED ? "Live view only, unmatched entries are not saved"
			: "";
	}

	static SeverityCell(severity) {
		const cell = document.createElement("div");
		cell.textContent = Syslog.SEVERITY[severity];
		cell.style.color = `color-mix(in srgb, ${Syslog.SEVERITY_COLOR[severity]} 40%, black)`;
		return cell;
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

		AddMeta("Severity", Syslog.SEVERITY[entry.severity]);
		AddMeta("Time",     Syslog.LocalTime(entry.time));
		AddMeta("Facility", Syslog.FACILITY[entry.facility] ?? entry.facility);
		AddMeta("Device",   entry.file ? Syslog.DeviceName(entry.file, entry.source) : "Not in the devices database");
		AddMeta("Origin",   Syslog.OriginIp(entry));
		AddMeta("Source",   entry.source);
		AddMeta("Hostname", entry.hostname);
		AddMeta("App",      entry.app);
		AddMeta("PID",      entry.procid);
		AddMeta("Msg ID",   entry.msgid);

		if (!entry.file) {
			const note = document.createElement("div");
			note.className = "syslog-details-unmatched";
			note.textContent = "Live view only, this entry is not saved and does not trigger emails.";
			this.details.appendChild(note);
		}

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

			//refresh the open listeners dialog, the editor is left untouched
			if (this.listenersView?.innerBox.isConnected) this.listenersView.Refresh();

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

	//saved is false when nothing was stored, error is the message to show, or null
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
			devices    : o.devices ?? [],
			unmatched  : o.unmatched === true
		}));

		//taken before the request, a keep-alive refresh can land while it is pending
		const before = new Set(this.listeners.map(o=> o.guid));

		try {
			const response = await fetch("syslog/listeners/save", {
				method: "POST",
				body  : JSON.stringify(payload)
			});

			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const json = await response.json();
			if (json.error) throw json.error;

			this.listeners = json;

			const failed = json.find(o=> o.enabled && !o.running && (o.guid === changedGuid || !before.has(o.guid)));
			if (failed) {
				return {saved:true, error:`Failed to start ${failed.name || "listener"} on ${Syslog.PROTOCOL[failed.protocol]} port ${failed.port}: ${failed.error ?? "unknown error"}`};
			}

			return {saved:true, error:null};
		}
		catch (ex) {
			await this.ListListeners();
			return {saved:false, error:`${ex}`};
		}
	}

	async ListenersDialog() {
		if (!await this.ListListeners()) return;

		const dialog = this.DialogBox("640px");
		if (dialog === null) return;

		const {okButton, cancelButton, innerBox, buttonBox} = dialog;
		innerBox.parentElement.style.left = "40px";
		innerBox.parentElement.style.width = "calc(100% - 80px)";
		innerBox.parentElement.style.maxWidth = "calc(100% - 80px)";
		innerBox.className = "syslog-listeners-view";
		innerBox.style.overflowY = "hidden";

		const addButton = document.createElement("input");
		addButton.type = "button";
		addButton.value = "Add";
		addButton.className = "with-icon";
		addButton.style.float = "left";
		addButton.style.marginLeft = "8px";
		addButton.style.backgroundImage = "url(mono/add.svg?light)";
		buttonBox.prepend(addButton);

		const side = document.createElement("div");
		side.className = "syslog-listeners-side";

		const list = document.createElement("div");
		list.className = "syslog-listeners";

		const messageBox = document.createElement("div");
		messageBox.className = "syslog-listeners-message";

		side.append(list, messageBox);

		const editorPane = document.createElement("div");
		editorPane.className = "syslog-listeners-editor";

		innerBox.append(side, editorPane);

		const form = document.createElement("div");
		form.className = "syslog-listeners-form";

		const placeholder = document.createElement("div");
		placeholder.className = "syslog-listeners-placeholder";

		const confirmBox = document.createElement("div");
		confirmBox.className = "syslog-listeners-delete";

		editorPane.append(form, placeholder);

		let selectedGuid = this.listeners[0]?.guid ?? null;
		let isDraft = false; //a new, unsaved listener is selected
		let editing = null;  //the listener loaded in the editor, null when it is a new one

		const SetMessage = text=> {
			messageBox.textContent = text ?? "";
			messageBox.style.display = text ? "" : "none";
		};

		//listeners list
		const CreateItem = (name, endpoint)=> {
			const element = document.createElement("div");
			element.className = "syslog-listener";
			list.appendChild(element);

			const nameBox = document.createElement("div");
			nameBox.className = "syslog-listener-name";
			nameBox.textContent = name;

			const endpointBox = document.createElement("div");
			endpointBox.className = "syslog-listener-endpoint";
			endpointBox.textContent = endpoint;

			const deleteButton = document.createElement("button");
			deleteButton.className = "syslog-listener-delete";
			deleteButton.setAttribute("aria-label", "Delete");

			element.append(nameBox, endpointBox, deleteButton);
			return {element, deleteButton};
		};

		const RenderList = ()=> {
			list.textContent = "";

			if (this.listeners.length === 0 && !isDraft) {
				const empty = document.createElement("div");
				empty.className = "syslog-listeners-empty";
				empty.textContent = "No listeners";
				list.appendChild(empty);
			}

			for (let i=0; i<this.listeners.length; i++) {
				const listener = this.listeners[i];
				const address = listener.bindAddress.includes(":") ? `[${listener.bindAddress}]` : listener.bindAddress;

				const {element, deleteButton} = CreateItem(
					listener.name || `Syslog ${Syslog.PROTOCOL[listener.protocol]}`,
					`${Syslog.PROTOCOL[listener.protocol]} ${address}:${listener.port}`
				);

				if (!isDraft && listener.guid === selectedGuid) element.classList.add("selected");
				element.onclick = ()=> Select(listener.guid);

				deleteButton.onclick = event=> {
					event.stopPropagation();
					ConfirmDelete(listener);
				};

				const toggleBox = document.createElement("div");
				toggleBox.className = "syslog-listener-toggle";
				element.prepend(toggleBox);

				const toggle = this.CreateToggle("", listener.enabled, toggleBox);
				toggle.label.onclick = event=> event.stopPropagation();
				toggle.checkbox.onchange = async ()=> {
					toggle.checkbox.disabled = true;
					const updated = this.listeners.map(o=> o.guid === listener.guid ? {...o, enabled:toggle.checkbox.checked} : o);
					const {error} = await this.SaveListeners(updated, listener.guid);
					if (!innerBox.isConnected) return;
					RenderList();
					SetMessage(error);
				};
			}

			if (isDraft) {
				const {element, deleteButton} = CreateItem("New listener", "not saved");
				element.classList.add("selected");
				deleteButton.onclick = event=> {
					event.stopPropagation();
					Select(this.listeners[0]?.guid ?? null);
				};
			}
		};

		//editor, built once, selecting a listener only loads its values
		let row = 0;
		const AddRow = (label, element)=> {
			row++;
			const labelElement = document.createElement("div");
			labelElement.textContent = `${label}:`;
			labelElement.style.gridArea = `${row} / 1`;
			element.style.gridArea = `${row} / 2`;
			form.append(labelElement, element);
		};

		const AddSection = text=> {
			row++;
			const section = document.createElement("div");
			section.textContent = text;
			section.style.gridArea = `${row} / 1 / ${row} / 3`;
			section.style.fontWeight = "600";
			section.style.alignSelf = "end";
			form.appendChild(section);
		};

		const AddRange = (label, max=7)=> {
			const box = document.createElement("div");
			box.className = "syslog-range";

			const range = document.createElement("input");
			range.type = "range";
			range.min = -1;
			range.max = max;
			range.step = 1;
			range.style.maxWidth = "100px";

			const valueLabel = document.createElement("div");

			range.oninput = ()=> {
				valueLabel.textContent = range.value == -1 ? "Off" : "";

				for (let i=0; i<parseInt(range.value)+1; i++) {
					const severityIcon = document.createElement("div");
					severityIcon.setAttribute("tip", Syslog.SEVERITY[i]);
					severityIcon.className = "syslog-action-icon";
					valueLabel.appendChild(severityIcon);

					const severityIconInner = document.createElement("div");
					severityIconInner.style.backgroundColor = Syslog.SEVERITY_COLOR[i];
					severityIconInner.style.maskImage = `url(${Syslog.SEVERITY_ICON[i]})`;
					severityIcon.appendChild(severityIconInner);
				}

				range.onchange?.();
			};

			box.append(range, valueLabel);
			AddRow(label, box);
			return range;
		};

		const SetRange = (range, value)=> {
			range.value = value;
			range.oninput();
		};

		const nameInput = document.createElement("input");
		nameInput.type = "text";
		nameInput.placeholder = "Syslog";
		AddRow("Name", nameInput);

		const protocolBox = new FewBox(Object.values(Syslog.PROTOCOL));
		protocolBox.container.style.margin = "2px 4px";
		AddRow("Protocol", protocolBox.container);

		//senders not in the devices database, never saved or emailed
		const unmatchedBox = document.createElement("div");
		AddRow("Unmatched", unmatchedBox);
		const unmatchedToggle = this.CreateToggle("Console and live view", false, unmatchedBox);

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
		AddRow("Password", passwordInput);

		AddSection("Actions, by minimum severity");

		const consoleRange = AddRange("Console");
		const diskRange    = AddRange("Disk");
		const liveRange    = AddRange("Live view");
		const emailRange   = AddRange("Email", 4); //up to warning, no emails for notice, info and debug

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
		form.appendChild(whitelistPanel);

		const acceptRow = document.createElement("div");
		acceptRow.className = "syslog-whitelist-accept";
		whitelistPanel.appendChild(acceptRow);

		const acceptLabel = document.createElement("div");
		acceptLabel.textContent = "Accept from:";

		const acceptBox = new FewBox(["All devices", "Whitelist"]);
		acceptBox.container.style.margin = "2px 4px";
		acceptRow.append(acceptLabel, acceptBox.container);

		const findRow = document.createElement("div");
		findRow.className = "syslog-whitelist-find";
		whitelistPanel.appendChild(findRow);

		const findLabel = document.createElement("div");
		findLabel.textContent = "Find:";

		const findDeviceInput = document.createElement("input");
		findDeviceInput.type = "search";
		findDeviceInput.style.margin = "2px 4px";
		findRow.append(findLabel, findDeviceInput);

		const whitelistContainer = document.createElement("div");
		whitelistContainer.className = "syslog-whitelist-container";
		whitelistPanel.appendChild(whitelistContainer);

		const selectedDevices = new Set();

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
		});

		const RefreshDevices = ()=> {
			const keywords = findDeviceInput.value.trim().toLowerCase().split(" ").filter(o=> o.length > 0);
			const filtered = keywords.length === 0
				? allDevices
				: allDevices.filter(d=> keywords.every(k=> d.name.toLowerCase().includes(k) || d.ip.toLowerCase().includes(k)));
			devicesListBox.SetItems(filtered);
		};

		findDeviceInput.oninput = ()=> RefreshDevices();

		const UpdateAccept = ()=> {
			const isWhitelist = acceptBox.index === 1;
			unmatchedToggle.checkbox.disabled = isWhitelist; //whitelist listeners always drop them
			findRow.style.display = isWhitelist ? "" : "none";
			whitelistContainer.style.display = isWhitelist ? "" : "none";
			whitelistPanel.classList.toggle("collapsed", !isWhitelist);
			if (isWhitelist) setTimeout(()=> devicesListBox.FinalizeColumns(), 0);
		};
		acceptBox.container.onchange = ()=> UpdateAccept();

		const UpdateTlsFields = ()=> {
			const isTls = GetProtocol() === 3;
			certInput.disabled = !isTls;
			passwordInput.disabled = !isTls;
		};

		let lastProtocol = 1;
		protocolBox.container.onchange = ()=> {
			const protocol = GetProtocol();
			if (parseInt(portInput.value) === Syslog.DEFAULT_PORT[lastProtocol] || portInput.value.length === 0) {
				portInput.value = Syslog.DEFAULT_PORT[protocol];
			}
			lastProtocol = protocol;
			UpdateTlsFields();
		};

		emailRange.onchange = ()=> {
			const isOff = parseInt(emailRange.value) < 0;
			smtpInput.disabled = isOff;
			recipientsInput.disabled = isOff;
		};

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

				certInput.value = editing?.certificate ?? "";
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

				smtpInput.value = editing?.smtpProfile ?? Syslog.EMPTY_GUID;
				if (smtpInput.selectedIndex < 0) smtpInput.value = Syslog.EMPTY_GUID;
			}
			catch {}
		})();

		const Save = async ()=> {
			const listener = editing;
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
				//the list toggle can change it while the editor is open
				enabled    : listener ? this.listeners.find(o=> o.guid === listener.guid)?.enabled ?? listener.enabled : true,
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
				devices    : [...selectedDevices],
				unmatched  : acceptBox.index === 0 && unmatchedToggle.checkbox.checked
			};

			const list = listener
				? this.listeners.map(o=> o.guid === listener.guid ? updated : o)
				: [...this.listeners, updated];

			okButton.disabled = true;
			const knownGuids = new Set(this.listeners.map(o=> o.guid));
			const {saved, error} = await this.SaveListeners(list, listener?.guid ?? null);
			if (!innerBox.isConnected) return;

			if (!saved) { //nothing was stored, keep the unsaved changes
				okButton.disabled = false;
				SetMessage(error);
				return;
			}

			if (!listener) {
				isDraft = false;
				selectedGuid = this.listeners.find(o=> !knownGuids.has(o.guid))?.guid ?? null;
			}

			RenderList();
			LoadEditor();
			SetMessage(error);
		};

		const SetEditorButtons = ()=> {
			const isEmpty = !isDraft && !editing;
			addButton.style.display = "";
			okButton.value = isDraft ? "Create" : "Save";
			okButton.disabled = isEmpty;
			okButton.onclick = isEmpty ? null : Save;
			cancelButton.value = "Close";
			cancelButton.onclick = ()=> dialog.Close();
		};

		const LoadEditor = ()=> {
			confirmBox.remove();
			editing = isDraft ? null : this.listeners.find(o=> o.guid === selectedGuid) ?? null;

			const isEmpty = !isDraft && !editing;
			form.style.display = isEmpty ? "none" : "";
			placeholder.style.display = isEmpty ? "" : "none";
			placeholder.textContent = this.listeners.length === 0 ? "Add a listener to start receiving syslog messages." : "Select a listener to edit it.";

			SetEditorButtons();
			if (isEmpty) return;

			//protocol goes first, its onchange adjusts the port
			const protocol = editing?.protocol ?? 1;
			protocolBox.Select(Math.max(Object.keys(Syslog.PROTOCOL).indexOf(`${protocol}`), 0));
			nameInput.value = editing?.name ?? "";
			bindInput.value = editing?.bindAddress ?? "0.0.0.0";
			portInput.value = editing?.port ?? Syslog.DEFAULT_PORT[protocol];
			lastProtocol = GetProtocol();
			UpdateTlsFields();

			certInput.value = editing?.certificate ?? "";
			passwordInput.value = "";
			passwordInput.placeholder = editing?.hasPassword ? "unchanged" : "";

			SetRange(consoleRange, editing?.console ?? -1);
			SetRange(diskRange,    editing?.disk    ?? 7);
			SetRange(liveRange,    editing?.live    ?? 7);
			SetRange(emailRange,   editing?.email   ?? -1);

			smtpInput.value = editing?.smtpProfile ?? Syslog.EMPTY_GUID;
			if (smtpInput.selectedIndex < 0) smtpInput.value = Syslog.EMPTY_GUID;
			recipientsInput.value = (editing?.recipients ?? []).join("; ");

			for (const input of [portInput, certInput, recipientsInput]) {
				input.required = false;
			}

			acceptBox.Select(editing?.accept === 1 ? 1 : 0);
			unmatchedToggle.checkbox.checked = editing ? editing.unmatched === true : true;
			selectedDevices.clear();
			for (const file of editing?.devices ?? []) selectedDevices.add(file);

			allDevices.sort((a, b)=> {
				//selected first
				const sa = selectedDevices.has(a.file), sb = selectedDevices.has(b.file);
				if (sa !== sb) return sa ? -1 : 1;
				return a.name.localeCompare(b.name);
			});

			findDeviceInput.value = "";
			UpdateAccept();
			RefreshDevices();

			editorPane.scrollTop = 0;
			if (isDraft) setTimeout(()=> nameInput.focus(), 200);
		};

		const Select = guid=> {
			if (!isDraft && guid === selectedGuid) {
				//keep the unsaved changes, close the delete confirmation if open
				if (confirmBox.isConnected) cancelButton.onclick();
				return;
			}

			isDraft = false;
			selectedGuid = guid;
			SetMessage(null);
			RenderList();
			LoadEditor();
		};

		const ConfirmDelete = listener=> {
			Select(listener.guid);
			if (confirmBox.isConnected) return;

			form.style.display = "none";
			confirmBox.textContent = `Are you sure you want to delete ${listener.name || "this listener"}?`;
			editorPane.appendChild(confirmBox);

			addButton.style.display = "none";
			okButton.value = "Delete";
			okButton.disabled = false;
			cancelButton.value = "Cancel";

			cancelButton.onclick = ()=> {
				confirmBox.remove();
				form.style.display = "";
				SetEditorButtons();
			};

			okButton.onclick = async ()=> {
				okButton.disabled = true;
				const {error} = await this.SaveListeners(this.listeners.filter(o=> o.guid !== listener.guid));
				if (!innerBox.isConnected) return;

				if (!this.listeners.some(o=> o.guid === selectedGuid)) {
					selectedGuid = this.listeners[0]?.guid ?? null;
				}
				RenderList();
				LoadEditor();
				SetMessage(error);
			};

			setTimeout(()=> cancelButton.focus(), 100);
		};

		addButton.onclick = ()=> {
			if (!isDraft) {
				isDraft = true;
				selectedGuid = null;
				SetMessage(null);
				RenderList();
				LoadEditor();
			}
			list.lastElementChild?.scrollIntoView({block:"nearest"});
		};

		this.listenersView = {
			innerBox: innerBox,
			Refresh : ()=> {
				//the selected listener was removed elsewhere, or there was none to select
				if (!isDraft && !this.listeners.some(o=> o.guid === selectedGuid)) {
					selectedGuid = this.listeners[0]?.guid ?? null;
					LoadEditor();
				}
				RenderList();
			}
		};

		RenderList();
		LoadEditor();
		SetMessage(null);
	}
}

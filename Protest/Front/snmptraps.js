"use strict";
class SnmpTraps extends Window {
	static SEVERITY       = ["Critical", "Major", "Minor", "Warning", "Indeterminate", "Cleared"];
	static SEVERITY_COLOR = ["var(--clr-critical)", "var(--clr-error)", "var(--clr-orange)", "var(--clr-warning)", "rgb(32,148,240)", "rgb(112,192,48)"];
	static SEVERITY_ICON  = ["mono/critical.svg", "mono/error.svg", "mono/error.svg", "mono/warning.svg", "mono/indeterminate.svg", "mono/checked.svg"];
	static VERSION_LABEL  = {"1":"v1", "2c":"v2c", "3":"v3"};
	static DEFAULT_PORT   = 162;
	static EMPTY_GUID     = "00000000-0000-0000-0000-000000000000";
	static MAX_ROWS       = 20_000;
	static PAGE_SIZE      = 1_000;
	static UNMATCHED      = ":unmatched"; //device filter for senders not in the devices database, never a file name

	//not covered by the mib files
	static KNOWN_OIDS = {
		"1.3.6.1.6.3.1.1.5.1"  : "coldStart",
		"1.3.6.1.6.3.1.1.5.2"  : "warmStart",
		"1.3.6.1.6.3.1.1.5.3"  : "linkDown",
		"1.3.6.1.6.3.1.1.5.4"  : "linkUp",
		"1.3.6.1.6.3.1.1.5.5"  : "authenticationFailure",
		"1.3.6.1.6.3.1.1.5.6"  : "egpNeighborLoss",
		"1.3.6.1.6.3.1.1.4.1.0": "snmpTrapOID.0",
		"1.3.6.1.6.3.1.1.4.3.0": "snmpTrapEnterprise.0",
		"1.3.6.1.6.3.18.1.3.0" : "snmpTrapAddress.0",
		"1.3.6.1.6.3.18.1.4.0" : "snmpTrapCommunity.0",
		"1.3.6.1.2.1.1.3.0"    : "sysUpTime.0"
	};

	static MIB_REQUESTS = new Map();

	static SEVERITY_FILTERS = [
		{key:"criticalFilter",      tip:"Critical",      icon:SnmpTraps.SEVERITY_ICON[0], color:SnmpTraps.SEVERITY_COLOR[0], levels:[0]},
		{key:"majorFilter",         tip:"Major",         icon:SnmpTraps.SEVERITY_ICON[1], color:SnmpTraps.SEVERITY_COLOR[1], levels:[1]},
		{key:"minorFilter",         tip:"Minor",         icon:SnmpTraps.SEVERITY_ICON[2], color:SnmpTraps.SEVERITY_COLOR[2], levels:[2]},
		{key:"warningFilter",       tip:"Warning",       icon:SnmpTraps.SEVERITY_ICON[3], color:SnmpTraps.SEVERITY_COLOR[3], levels:[3]},
		{key:"indeterminateFilter", tip:"Indeterminate", icon:SnmpTraps.SEVERITY_ICON[4], color:SnmpTraps.SEVERITY_COLOR[4], levels:[4]},
		{key:"clearedFilter",       tip:"Cleared",       icon:SnmpTraps.SEVERITY_ICON[5], color:SnmpTraps.SEVERITY_COLOR[5], levels:[5]},
	];

	static ALL_LEVELS = (1 << SnmpTraps.SEVERITY.length) - 1;

	constructor(args) {
		super();

		this.args = {
			autoScroll         : true,
			device             : "",
			find               : "",
			criticalFilter     : true,
			majorFilter        : true,
			minorFilter        : true,
			warningFilter      : true,
			indeterminateFilter: true,
			clearedFilter      : true,
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
		Window.AddCssDependencies("snmptraps.css");

		this.SetTitle("SNMP traps");
		this.SetIcon("mono/trap.svg");

		this.SetupToolbar();
		this.listenersButton = this.AddToolbarButton("Listeners", "mono/listener.svg?light");
		this.reloadButton = this.AddToolbarButton("Reload", "mono/update.svg?light");
		this.AddToolbarSeparator();
		this.SetupDeviceFilter();
		this.SetupFind();
		this.AddToolbarSeparator();

		this.content.style.overflow = "hidden";

		this.severityButtons = SnmpTraps.SEVERITY_FILTERS.map(o=> {
			const button = this.AddToolbarButton(o.tip, `${o.icon}?light`);
			button.classList.add("snmptraps-toggle-button");
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
		this.canWrite = KEEP.authorization.includes("*") || KEEP.authorization.includes("snmp traps:write");
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

			const isUnmatched = this.args.device === SnmpTraps.UNMATCHED;

			const files = new Set(this.knownDevices);
			if (this.args.device && !isUnmatched) files.add(this.args.device);

			const devices = [...files]
				.map(file=> ({file:file, name:SnmpTraps.DeviceName(file), type:LOADER.devices.data[file]?.type?.v?.toLowerCase()}))
				.sort((a, b)=> a.name.localeCompare(b.name));

			//live only, listed once an unmatched sender is seen
			if (this.hasUnmatched || isUnmatched) {
				devices.unshift({file:SnmpTraps.UNMATCHED, name:"Unmatched", icon:"mono/question.svg"});
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
		for (let i=0; i<SnmpTraps.SEVERITY_FILTERS.length; i++) {
			const filter = SnmpTraps.SEVERITY_FILTERS[i];
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
		this.listBox.list.classList.add("snmptraps-list");
		this.listBox.list.style.bottom = "170px";
		this.listBox.Attach(this.content);

		this.listBox.SetupColumns([
			{label:"severity",  render:d=> SnmpTraps.SeverityCell(d.severity)},
			{label:"time",      value:d=> SnmpTraps.LocalTime(d.time).substring(0, 19)},
			{label:"device",    render:d=> SnmpTraps.DeviceCell(d)},
			{label:"source",    value:d=> d.source},
			{label:"version",   value:d=> SnmpTraps.VERSION_LABEL[d.version] ?? d.version},
			{label:"trap",      value:d=> SnmpTraps.OidName(d.oid)},
			{label:"variables", value:d=> SnmpTraps.VariablesSummary(d.variables)}
		]);

		const widths = [10, 13, 13, 10, 5, 13, 36];
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
		this.details.className = "snmptraps-details";

		this.options = document.createElement("div");
		this.options.className = "snmptraps-options";

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
		this.statusLabel.className = "snmptraps-status";
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

	//the agent address in the trap (v1 agent-addr, v2c/v3 snmpTrapAddress.0), as the sender reports it
	static OriginIp(entry) {
		return !entry.origin || entry.origin === "0.0.0.0" ? "--" : entry.origin;
	}

	static DeviceCell(entry) {
		const cell = document.createElement("div");
		if (entry.file) {
			cell.textContent = SnmpTraps.DeviceName(entry.file, entry.source);
		}
		else {
			cell.textContent = "Unmatched";
			cell.className = "snmptraps-unmatched";
		}
		return cell;
	}

	static Unescape(value) {
		if (value.indexOf("\\") < 0) return value;
		return value.replace(/\\(.)/g, (_, c)=> c === "t" ? "\t" : c === "n" ? "\n" : c === "r" ? "\r" : c);
	}

	//hundredths of a second
	static FormatTicks(ticks) {
		let seconds = Math.floor(ticks / 100);
		const days = Math.floor(seconds / 86400);
		seconds %= 86400;
		const hours = Math.floor(seconds / 3600);
		seconds %= 3600;
		const minutes = Math.floor(seconds / 60);
		seconds %= 60;
		return days > 0 ? `${days}d ${hours}h ${minutes}m ${seconds}s` : `${hours}h ${minutes}m ${seconds}s`;
	}

	//the mib file that defines an oid, as named in Snmp.OID_CACHE
	static MibFile(oid) {
		if (!oid || typeof Snmp === "undefined") return null;
		if (oid.startsWith(".")) oid = oid.substring(1);

		const Match = (prefix, numbers)=> {
			if (!oid.startsWith(prefix)) return null;
			const number = parseInt(oid.substring(prefix.length).split(".")[0]);
			return numbers.includes(number) ? `${prefix}${number}` : null;
		};

		return Match("1.0.8802.", Snmp.OID_MAP_1_0_8802)
			?? Match("1.3.6.1.2.1.", Snmp.OID_MAP_1_3_6_1_2_1)
			?? Match("1.3.6.1.4.1.", Snmp.OID_MAP_1_3_6_1_4_1);
	}

	//loads the mib files for the given oids into the shared cache, returns true when any was added
	static async LoadMibs(oids) {
		if (typeof Snmp === "undefined") return false;

		const files = new Set();
		for (const oid of oids) {
			const file = SnmpTraps.MibFile(oid);
			if (file && !(file in Snmp.OID_CACHE)) files.add(file);
		}
		if (files.size === 0) return false;

		const results = await Promise.all([...files].map(file=> {
			if (!SnmpTraps.MIB_REQUESTS.has(file)) {
				SnmpTraps.MIB_REQUESTS.set(file, (async ()=> {
					try {
						const response = await fetch(`snmp/${file}.json`);
						if (response.status !== 200) return false;
						const json = await response.json();
						if (json.error) return false;
						for (const key in json) {
							Snmp.OID_CACHE[`${file}${key}`] = json[key];
						}
						return true;
					}
					catch {
						return false;
					}
				})());
			}
			return SnmpTraps.MIB_REQUESTS.get(file);
		}));

		return results.some(o=> o);
	}

	//the nearest named ancestor in the mib cache, with the remaining instance
	static MibEntry(oid) {
		if (!oid || typeof Snmp === "undefined") return null;
		if (oid.startsWith(".")) oid = oid.substring(1);

		let prefix = oid;
		let suffix = "";
		while (prefix.length > 0) {
			const entry = Snmp.OID_CACHE[prefix];
			if (entry && isNaN(entry[0])) return {entry:entry, suffix:suffix};

			const dot = prefix.lastIndexOf(".");
			if (dot < 0) break;
			suffix = prefix.substring(dot) + suffix;
			prefix = prefix.substring(0, dot);
		}

		return null;
	}

	static OidName(oid) {
		if (!oid) return "";
		if (oid in SnmpTraps.KNOWN_OIDS) return SnmpTraps.KNOWN_OIDS[oid];

		const found = SnmpTraps.MibEntry(oid);
		return found ? `${found.entry[0]}${found.suffix}` : oid;
	}

	//[oid, type, value] to readable text
	static FormatValue(variable) {
		const [oid, type, value] = variable;

		switch (type) {
		case "TimeTicks": {
			const ticks = parseInt(value);
			return isNaN(ticks) ? value : SnmpTraps.FormatTicks(ticks);
		}

		case "Hex":
			return value.match(/.{1,2}/g)?.join(" ") ?? "";

		case "ObjectIdentifier":
			return SnmpTraps.OidName(value);

		default: {
			//enumerated values, e.g. ifOperStatus
			const found = SnmpTraps.MibEntry(oid);
			const label = found?.entry[1]?.[value];
			return label ? `${label} (${value})` : value;
		}
		}
	}

	static VariablesSummary(variables) {
		if (!variables || variables.length === 0) return "";
		return variables.map(o=> `${SnmpTraps.OidName(o[0])}=${SnmpTraps.FormatValue(o)}`).join(", ");
	}

	//file \t time \t severity \t version \t source \t pdu \t user \t trap oid \t uptime \t origin \t variables
	static ParseLine(line) {
		const split = line.split("\t");
		if (split.length < 11) return null;

		const severity = parseInt(split[2]);
		if (isNaN(severity) || severity < 0 || severity >= SnmpTraps.SEVERITY.length) return null;

		let variables;
		try {
			variables = JSON.parse(split.slice(10).join("\t"));
			if (!Array.isArray(variables)) variables = [];
		}
		catch {
			variables = [];
		}

		return {
			file     : split[0],
			time     : split[1],
			severity : severity,
			version  : split[3],
			source   : split[4],
			pdu      : split[5],
			user     : SnmpTraps.Unescape(split[6]),
			oid      : split[7],
			uptime   : parseInt(split[8]),
			origin   : SnmpTraps.Unescape(split[9]),
			variables: variables
		};
	}

	//load the mib names of new entries, then render again
	async ResolveNames(entries) {
		const oids = [];
		for (const entry of entries) {
			if (entry.marker) continue;
			oids.push(entry.oid);
			for (const variable of entry.variables) {
				oids.push(variable[0]);
				if (variable[1] === "ObjectIdentifier") oids.push(variable[2]);
			}
		}

		if (!await SnmpTraps.LoadMibs(oids)) return;

		this.listBox.UpdateViewport(true);
		if (this.listBox.selected?._data) this.ShowDetails(this.listBox.selected._data);
	}

	GetFilter() {
		let levels = 0;
		for (const filter of SnmpTraps.SEVERITY_FILTERS) {
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
		const query = [`limit=${SnmpTraps.PAGE_SIZE}`];
		if (cursor?.before) query.push(`before=${encodeURIComponent(cursor.before)}`, `skip=${cursor.skip}`);
		if (filter.device)  query.push(`device=${encodeURIComponent(filter.device)}`);
		if (filter.find)    query.push(`q=${encodeURIComponent(filter.find)}`);

		if (filter.levels !== SnmpTraps.ALL_LEVELS) {
			let levels = "";
			for (let i=0; i<SnmpTraps.SEVERITY.length; i++) {
				if (filter.levels & (1 << i)) levels += i;
			}
			query.push(`levels=${levels}`);
		}

		return query.join("&");
	}

	MatchLive(line, filter) {
		const t1 = line.indexOf("\t");
		if (t1 < 0 || line.length < t1 + 28) return false;

		if (filter.device && line.substring(0, t1) !== (filter.device === SnmpTraps.UNMATCHED ? "" : filter.device)) return false;

		const severity = line.charCodeAt(t1 + 25) - 48;
		if (severity < 0 || severity >= SnmpTraps.SEVERITY.length || !(filter.levels & (1 << severity))) return false;

		if (filter.findLower) {
			const start = line.indexOf("\t", t1 + 27); //after version
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
			if (this.filter.device === SnmpTraps.UNMATCHED) {
				this.hasEnded = true;
				return;
			}

			const response = await fetch(`snmptraps/list?${this.BuildQuery(this.filter, null)}`);
			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const json = await response.json();
			if (json.error) throw json.error;
			if (token !== this.loadToken) return;

			const entries = json.lines.map(o=> SnmpTraps.ParseLine(o)).filter(o=> o);

			//live lines that arrived while loading, and are not already on disk
			const newest = entries.length > 0 ? entries[entries.length - 1].time : null;
			const pending = newest ? this.pendingLive.filter(o=> o.time > newest) : this.pendingLive;

			if (json.end) entries.unshift({marker:true});
			const added = entries.concat(pending);
			this.listBox.AddItems(added);
			this.ResolveNames(added);

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
		if (this.filter?.device === SnmpTraps.UNMATCHED) return;

		const token = this.loadToken;
		this.isLoading = true;

		try {
			const response = await fetch(`snmptraps/list?${this.BuildQuery(this.filter, this.cursor)}`);
			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const json = await response.json();
			if (json.error) throw json.error;
			if (token !== this.loadToken) return;

			const entries = json.lines.map(o=> SnmpTraps.ParseLine(o)).filter(o=> o);
			if (json.end) entries.unshift({marker:true});

			const list = this.listBox.list;
			const oldHeight = list.scrollHeight;
			const oldTop = list.scrollTop;

			this.listBox.AddItems(entries, true);
			list.scrollTop = oldTop + list.scrollHeight - oldHeight;
			this.listBox.UpdateViewport();
			this.ResolveNames(entries);

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
			const entry = SnmpTraps.ParseLine(lines[i]);
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
		this.ResolveNames(entries);

		const overflow = list.childNodes.length - SnmpTraps.MAX_ROWS;
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
			: this.filter?.device === SnmpTraps.UNMATCHED ? "Live view only, unmatched entries are not saved"
			: "";
	}

	static SeverityCell(severity) {
		const cell = document.createElement("div");
		cell.textContent = SnmpTraps.SEVERITY[severity];
		cell.style.color = `color-mix(in srgb, ${SnmpTraps.SEVERITY_COLOR[severity]} 40%, black)`;
		return cell;
	}

	InflateRow(element, entry, type) {
		if (entry.marker) {
			element.classList.add("snmptraps-marker");
			element.textContent = "- END -";
			return;
		}

		const dot = document.createElement("div");
		dot.className = "snmptraps-severity-dot";
		dot.style.backgroundColor = SnmpTraps.SEVERITY_COLOR[entry.severity];
		element.appendChild(dot);

		this.listBox.InflateElement(element, entry, type);
	}

	ShowDetails(entry) {
		this.details.textContent = "";
		if (!entry || entry.marker) return;

		const meta = document.createElement("div");
		meta.className = "snmptraps-details-meta";
		this.details.appendChild(meta);

		const AddMeta = (label, value)=> {
			if (value === undefined || value === null || value === "") return;
			const span = document.createElement("span");
			const b = document.createElement("b");
			b.textContent = `${label}:`;
			span.append(b, document.createTextNode(value));
			meta.appendChild(span);
		};

		const trapName = SnmpTraps.OidName(entry.oid);

		AddMeta("Severity", SnmpTraps.SEVERITY[entry.severity]);
		AddMeta("Time",     SnmpTraps.LocalTime(entry.time));
		AddMeta("Device",   entry.file ? SnmpTraps.DeviceName(entry.file, entry.source) : "Not in the devices database");
		AddMeta("Origin",   SnmpTraps.OriginIp(entry));
		AddMeta("Source",   entry.source);
		AddMeta("Version",  SnmpTraps.VERSION_LABEL[entry.version] ?? entry.version);
		AddMeta("PDU",      entry.pdu);
		AddMeta("User",     entry.user);
		AddMeta("Uptime",   isNaN(entry.uptime) ? null : SnmpTraps.FormatTicks(entry.uptime));
		AddMeta("Trap",     trapName === entry.oid ? entry.oid : `${trapName} (${entry.oid})`);

		if (!entry.file) {
			const note = document.createElement("div");
			note.className = "snmptraps-details-unmatched";
			note.textContent = "Live view only, this entry is not saved and does not trigger emails.";
			this.details.appendChild(note);
		}

		if (entry.variables.length === 0) return;

		const variables = document.createElement("div");
		variables.className = "snmptraps-details-vars";
		this.details.appendChild(variables);

		for (const variable of entry.variables) {
			const name = document.createElement("div");
			name.textContent = SnmpTraps.OidName(variable[0]);
			name.title = variable[0];

			const type = document.createElement("div");
			type.textContent = variable[1];

			const value = document.createElement("div");
			value.textContent = SnmpTraps.FormatValue(variable);

			variables.append(name, type, value);
		}
	}

	async ListDevices() {
		try {
			const response = await fetch("snmptraps/devices");
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
			const response = await fetch("snmptraps/listeners/list");
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
			guid       : o.guid || SnmpTraps.EMPTY_GUID,
			name       : o.name ?? "",
			bindAddress: o.bindAddress || "0.0.0.0",
			port       : o.port,
			console    : o.console,
			disk       : o.disk,
			email      : o.email,
			live       : o.live,
			smtpProfile: o.smtpProfile || SnmpTraps.EMPTY_GUID,
			recipients : o.recipients ?? [],
			accept     : o.accept,
			devices    : o.devices ?? [],
			credentials: o.credentials ?? [],
			unmatched  : o.unmatched === true
		}));

		//taken before the request, a keep-alive refresh can land while it is pending
		const before = new Set(this.listeners.map(o=> o.guid));

		try {
			const response = await fetch("snmptraps/listeners/save", {
				method: "POST",
				body  : JSON.stringify(payload)
			});

			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const json = await response.json();
			if (json.error) throw json.error;

			this.listeners = json;

			const failed = json.find(o=> o.enabled && !o.running && (o.guid === changedGuid || !before.has(o.guid)));
			if (failed) {
				return {saved:true, error:`Failed to start ${failed.name || "listener"} on UDP port ${failed.port}: ${failed.error ?? "unknown error"}`};
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

		const dialog = this.DialogBox("688px");
		if (dialog === null) return;

		const {okButton, cancelButton, innerBox, buttonBox} = dialog;
		innerBox.parentElement.style.left = "40px";
		innerBox.parentElement.style.width = "calc(100% - 80px)";
		innerBox.parentElement.style.maxWidth = "calc(100% - 80px)";
		innerBox.className = "snmptraps-listeners-view";
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
		side.className = "snmptraps-listeners-side";

		const list = document.createElement("div");
		list.className = "snmptraps-listeners";

		const messageBox = document.createElement("div");
		messageBox.className = "snmptraps-listeners-message";

		side.append(list, messageBox);

		const editorPane = document.createElement("div");
		editorPane.className = "snmptraps-listeners-editor";

		innerBox.append(side, editorPane);

		const form = document.createElement("div");
		form.className = "snmptraps-listeners-form";

		const placeholder = document.createElement("div");
		placeholder.className = "snmptraps-listeners-placeholder";

		const confirmBox = document.createElement("div");
		confirmBox.className = "snmptraps-listeners-delete";

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
			element.className = "snmptraps-listener";
			list.appendChild(element);

			const nameBox = document.createElement("div");
			nameBox.className = "snmptraps-listener-name";
			nameBox.textContent = name;

			const endpointBox = document.createElement("div");
			endpointBox.className = "snmptraps-listener-endpoint";
			endpointBox.textContent = endpoint;

			const deleteButton = document.createElement("button");
			deleteButton.className = "snmptraps-listener-delete";
			deleteButton.setAttribute("aria-label", "Delete");

			element.append(nameBox, endpointBox, deleteButton);
			return {element, deleteButton};
		};

		const RenderList = ()=> {
			list.textContent = "";

			if (this.listeners.length === 0 && !isDraft) {
				const empty = document.createElement("div");
				empty.className = "snmptraps-listeners-empty";
				empty.textContent = "No listeners";
				list.appendChild(empty);
			}

			for (let i=0; i<this.listeners.length; i++) {
				const listener = this.listeners[i];
				const address = listener.bindAddress.includes(":") ? `[${listener.bindAddress}]` : listener.bindAddress;

				const {element, deleteButton} = CreateItem(
					listener.name || "SNMP traps",
					`UDP ${address}:${listener.port}`
				);

				if (!isDraft && listener.guid === selectedGuid) element.classList.add("selected");
				element.onclick = ()=> Select(listener.guid);

				deleteButton.onclick = event=> {
					event.stopPropagation();
					ConfirmDelete(listener);
				};

				const toggleBox = document.createElement("div");
				toggleBox.className = "snmptraps-listener-toggle";
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

		const AddRange = (label, max=SnmpTraps.SEVERITY.length-1)=> {
			const box = document.createElement("div");
			box.className = "snmptraps-range";

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
					severityIcon.setAttribute("tip", SnmpTraps.SEVERITY[i]);
					severityIcon.className = "snmptraps-action-icon";
					valueLabel.appendChild(severityIcon);

					const severityIconInner = document.createElement("div");
					severityIconInner.style.backgroundColor = SnmpTraps.SEVERITY_COLOR[i];
					severityIconInner.style.maskImage = `url(${SnmpTraps.SEVERITY_ICON[i]})`;
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
		nameInput.placeholder = "SNMP traps";
		AddRow("Name", nameInput);

		//senders not in the devices database, never saved or emailed
		const unmatchedBox = document.createElement("div");
		AddRow("Unmatched", unmatchedBox);
		const unmatchedToggle = this.CreateToggle("Console and live view", false, unmatchedBox);

		const bindInput = document.createElement("input");
		bindInput.type = "text";
		bindInput.placeholder = "0.0.0.0";
		AddRow("Bind address", bindInput);

		const portInput = document.createElement("input");
		portInput.type = "number";
		portInput.min = 1;
		portInput.max = 65535;
		AddRow("Port", portInput);

		const engineInput = document.createElement("input");
		engineInput.type = "text";
		engineInput.readOnly = true;
		engineInput.className = "snmptraps-engine";
		engineInput.title = "The SNMPv3 engine ID of this receiver, for devices that send SNMPv3 informs.";
		AddRow("Engine ID", engineInput);

		AddSection("Credentials");

		//spans three rows
		row++;
		const credentialsLabel = document.createElement("div");
		credentialsLabel.textContent = "SNMP profiles:";
		credentialsLabel.style.gridArea = `${row} / 1`;
		credentialsLabel.style.alignSelf = "start";
		credentialsLabel.style.paddingTop = "8px";

		const credentialsList = document.createElement("div");
		credentialsList.className = "snmptraps-credentials";
		credentialsList.style.gridArea = `${row} / 2 / ${row + 3} / 3`;
		form.append(credentialsLabel, credentialsList);
		row += 2;

		row++;
		const credentialsHint = document.createElement("div");
		credentialsHint.className = "snmptraps-credentials-hint";
		credentialsHint.style.gridArea = `${row} / 2`;
		form.appendChild(credentialsHint);

		AddSection("Actions, by minimum severity");

		const consoleRange = AddRange("Console");
		const diskRange    = AddRange("Disk");
		const liveRange    = AddRange("Live view");
		const emailRange   = AddRange("Email", 3); //up to warning, no emails for indeterminate and cleared

		const smtpInput = document.createElement("select");
		AddRow("SMTP profile", smtpInput);

		const recipientsInput = document.createElement("input");
		recipientsInput.type = "text";
		recipientsInput.placeholder = "user@example.com; ...";
		AddRow("Recipients", recipientsInput);

		//whitelist panel
		const whitelistPanel = document.createElement("div");
		whitelistPanel.className = "snmptraps-whitelist";
		whitelistPanel.style.gridArea = `1 / 3 / ${row + 1} / 4`;
		form.appendChild(whitelistPanel);

		const acceptRow = document.createElement("div");
		acceptRow.className = "snmptraps-whitelist-accept";
		whitelistPanel.appendChild(acceptRow);

		const acceptLabel = document.createElement("div");
		acceptLabel.textContent = "Accept from:";

		const acceptBox = new FewBox(["All devices", "Whitelist"]);
		acceptBox.container.style.margin = "2px 4px";
		acceptRow.append(acceptLabel, acceptBox.container);

		const findRow = document.createElement("div");
		findRow.className = "snmptraps-whitelist-find";
		whitelistPanel.appendChild(findRow);

		const findLabel = document.createElement("div");
		findLabel.textContent = "Find:";

		const findDeviceInput = document.createElement("input");
		findDeviceInput.type = "search";
		findDeviceInput.style.margin = "2px 4px";
		findRow.append(findLabel, findDeviceInput);

		const whitelistContainer = document.createElement("div");
		whitelistContainer.className = "snmptraps-whitelist-container";
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

		//snmp profiles, the selection restricts the accepted communities and snmpv3 users
		let snmpProfiles = [];
		const selectedCredentials = new Set();

		const UpdateCredentialsHint = ()=> {
			const warning = editing?.warning;
			credentialsHint.classList.toggle("warning", !!warning);
			credentialsHint.textContent = warning
				? warning
				: selectedCredentials.size === 0
					? "None selected: any community, every SNMPv3 profile."
					: "Only the selected communities and SNMPv3 users.";
		};

		const RenderCredentials = ()=> {
			credentialsList.textContent = "";

			if (snmpProfiles.length === 0) {
				const empty = document.createElement("div");
				empty.className = "snmptraps-credentials-empty";
				empty.textContent = "No SNMP profiles";
				credentialsList.appendChild(empty);
			}

			for (const profile of snmpProfiles) {
				const box = document.createElement("div");
				credentialsList.appendChild(box);

				const version = profile.version === 3 ? "v3" : profile.version === 1 ? "v1" : "v2c";
				const toggle = this.CreateToggle(`${profile.name || profile.guid} (${version})`, selectedCredentials.has(profile.guid), box);
				toggle.checkbox.onchange = ()=> {
					if (toggle.checkbox.checked) {
						selectedCredentials.add(profile.guid);
					}
					else {
						selectedCredentials.delete(profile.guid);
					}
					UpdateCredentialsHint();
				};
			}

			UpdateCredentialsHint();
		};

		emailRange.onchange = ()=> {
			const isOff = parseInt(emailRange.value) < 0;
			smtpInput.disabled = isOff;
			recipientsInput.disabled = isOff;
		};

		(async ()=> {
			try {
				const response = await fetch("config/snmpprofiles/list");
				if (response.status !== 200) return;
				const json = await response.json();
				if (!Array.isArray(json)) return;

				snmpProfiles = json.filter(o=> o?.guid).sort((a, b)=> a.priority - b.priority);
				RenderCredentials();
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
				none.value = SnmpTraps.EMPTY_GUID;
				none.text = "none";
				smtpInput.appendChild(none);

				for (let i=0; i<json.length; i++) {
					const option = document.createElement("option");
					option.value = json[i].guid;
					option.text = json[i].sender || json[i].username || json[i].server;
					smtpInput.appendChild(option);
				}

				smtpInput.value = editing?.smtpProfile ?? SnmpTraps.EMPTY_GUID;
				if (smtpInput.selectedIndex < 0) smtpInput.value = SnmpTraps.EMPTY_GUID;
			}
			catch {}
		})();

		const Save = async ()=> {
			const listener = editing;
			const port = parseInt(portInput.value);
			const email = parseInt(emailRange.value);

			const required = [];
			if (isNaN(port) || port < 1 || port > 65535) required.push(portInput);
			if (email >= 0 && recipientsInput.value.trim().length === 0) required.push(recipientsInput);

			for (const input of [portInput, recipientsInput]) {
				input.required = required.includes(input);
			}

			if (required.length > 0) {
				required[0].focus();
				return;
			}

			const updated = {
				//the list toggle can change it while the editor is open
				enabled    : listener ? this.listeners.find(o=> o.guid === listener.guid)?.enabled ?? listener.enabled : true,
				guid       : listener ? listener.guid : SnmpTraps.EMPTY_GUID,
				name       : nameInput.value.trim(),
				bindAddress: bindInput.value.trim() || "0.0.0.0",
				port       : port,
				console    : parseInt(consoleRange.value),
				disk       : parseInt(diskRange.value),
				email      : email,
				live       : parseInt(liveRange.value),
				smtpProfile: smtpInput.value || SnmpTraps.EMPTY_GUID,
				recipients : recipientsInput.value.split(/[;,\s]+/).map(o=> o.trim()).filter(o=> o.length > 0),
				accept     : acceptBox.index === 1 ? 1 : 0,
				devices    : [...selectedDevices],
				credentials: [...selectedCredentials],
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
			placeholder.textContent = this.listeners.length === 0 ? "Add a listener to start receiving SNMP traps." : "Select a listener to edit it.";

			SetEditorButtons();
			if (isEmpty) return;

			nameInput.value = editing?.name ?? "";
			bindInput.value = editing?.bindAddress ?? "0.0.0.0";
			portInput.value = editing?.port ?? SnmpTraps.DEFAULT_PORT;
			engineInput.value = editing?.engineId ?? this.listeners[0]?.engineId ?? "";

			SetRange(consoleRange, editing?.console ?? -1);
			SetRange(diskRange,    editing?.disk    ?? SnmpTraps.SEVERITY.length - 1);
			SetRange(liveRange,    editing?.live    ?? SnmpTraps.SEVERITY.length - 1);
			SetRange(emailRange,   editing?.email   ?? -1);

			smtpInput.value = editing?.smtpProfile ?? SnmpTraps.EMPTY_GUID;
			if (smtpInput.selectedIndex < 0) smtpInput.value = SnmpTraps.EMPTY_GUID;
			recipientsInput.value = (editing?.recipients ?? []).join("; ");

			for (const input of [portInput, recipientsInput]) {
				input.required = false;
			}

			selectedCredentials.clear();
			for (const guid of editing?.credentials ?? []) selectedCredentials.add(guid);
			RenderCredentials();

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

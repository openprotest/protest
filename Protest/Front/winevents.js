"use strict";
class WinEvents extends Window {
	static SEVERITY       = ["Critical", "Error", "Warning", "Information", "Verbose"];
	static SEVERITY_COLOR = ["var(--clr-critical)", "var(--clr-error)", "var(--clr-warning)", "rgb(32,148,240)", "rgb(128,148,168)"];
	static SEVERITY_ICON  = ["mono/critical.svg", "mono/error.svg", "mono/warning.svg", "mono/info.svg", "mono/verbose.svg"];
	static PAGE_SIZE      = 1_000;

	static SEVERITY_FILTERS = [
		{key:"criticalFilter", tip:"Critical",    icon:WinEvents.SEVERITY_ICON[0], color:WinEvents.SEVERITY_COLOR[0], levels:[0]},
		{key:"errorFilter",    tip:"Error",       icon:WinEvents.SEVERITY_ICON[1], color:WinEvents.SEVERITY_COLOR[1], levels:[1]},
		{key:"warningFilter",  tip:"Warning",     icon:WinEvents.SEVERITY_ICON[2], color:WinEvents.SEVERITY_COLOR[2], levels:[2]},
		{key:"infoFilter",     tip:"Information", icon:WinEvents.SEVERITY_ICON[3], color:WinEvents.SEVERITY_COLOR[3], levels:[3]},
		{key:"verboseFilter",  tip:"Verbose",     icon:WinEvents.SEVERITY_ICON[4], color:WinEvents.SEVERITY_COLOR[4], levels:[4]},
	];

	static ALL_LEVELS = (1 << WinEvents.SEVERITY.length) - 1;

	constructor(args) {
		super();

		this.args = {
			device        : "",
			find          : "",
			criticalFilter: true,
			errorFilter   : true,
			warningFilter : true,
			infoFilter    : true,
			verboseFilter : true,
			...args
		};

		this.knownDevices = new Set();

		this.filter = null;
		this.cursor = null;
		this.hasEnded = false;
		this.isLoading = false;
		this.isFetching = false;
		this.loadToken = 0;

		Window.AddCssDependencies("list.css");
		Window.AddCssDependencies("winevents.css");

		this.SetTitle("Windows events");
		this.SetIcon("mono/eventlogger.svg");

		this.SetupToolbar();
		this.fetchButton = this.AddToolbarButton("Fetch the latest entries from the selected device", "mono/fetch.svg?light");
		this.reloadButton = this.AddToolbarButton("Reload", "mono/update.svg?light");
		this.AddToolbarSeparator();
		this.SetupDeviceFilter();
		this.SetupFind();
		this.AddToolbarSeparator();

		this.severityButtons = WinEvents.SEVERITY_FILTERS.map(o=> {
			const button = this.AddToolbarButton(o.tip, `${o.icon}?light`);
			button.classList.add("winevents-toggle-button");
			button.onclick = ()=> {
				this.args[o.key] = !this.args[o.key];
				this.UpdateFiltersUI();
				this.Reload();
			};
			return button;
		});

		this.fetchButton.onclick = ()=> this.FetchDevice();
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

		this.ListDevices();
		this.Reload();
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
				.map(file=> ({file:file, name:WinEvents.DeviceName(file), type:LOADER.devices.data[file]?.type?.v?.toLowerCase()}))
				.filter(o=> o.name.toLowerCase().includes(keyword))
				.sort((a, b)=> a.name.localeCompare(b.name));

			index = -1;
			filtersList.textContent = "";
			filterMenu.style.height = `${32 + devices.length * 33}px`;
			filterButton.style.borderBottom = this.args.device ? "#c0c0c0 solid 3px" : "";
			this.fetchButton.disabled = !this.args.device || this.isFetching;

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

					this.fetchButton.disabled = !this.args.device || this.isFetching;
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
			this.fetchButton.disabled = true;
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
		for (let i=0; i<WinEvents.SEVERITY_FILTERS.length; i++) {
			const filter = WinEvents.SEVERITY_FILTERS[i];
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
		this.listBox.list.classList.add("winevents-list");
		this.listBox.list.style.bottom = "184px";
		this.listBox.Attach(this.content);

		this.listBox.SetupColumns([
			{label:"severity", render:d=> WinEvents.SeverityCell(d.severity)},
			{label:"time",     value:d=> WinEvents.LocalTime(d.time).substring(0, 19)},
			{label:"device",   value:d=> WinEvents.DeviceName(d.file)},
			{label:"log",      value:d=> d.log},
			{label:"source",   value:d=> d.source},
			{label:"event id", value:d=> d.eventId},
			{label:"message",  value:d=> d.msg}
		]);

		const widths = [10, 13, 13, 8, 15, 6, 35];
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

		this.details = document.createElement("div");
		this.details.className = "winevents-details";

		this.options = document.createElement("div");
		this.options.className = "winevents-options";
		this.options.appendChild(this.listBox.counter);

		this.statusLabel = document.createElement("div");
		this.statusLabel.className = "winevents-status";
		this.options.appendChild(this.statusLabel);

		this.content.append(this.details, this.options);
	}

	static LocalTime(utc) {
		const date = new Date(`${utc.replace(" ", "T")}Z`);
		if (isNaN(date.getTime())) return utc;

		const Pad = (n, l=2)=> n.toString().padStart(l, "0");
		return `${date.getFullYear()}-${Pad(date.getMonth()+1)}-${Pad(date.getDate())} ${Pad(date.getHours())}:${Pad(date.getMinutes())}:${Pad(date.getSeconds())}.${Pad(date.getMilliseconds(), 3)}`;
	}

	static DeviceName(file) {
		const entry = LOADER.devices.data[file];
		if (!entry) return file;
		return entry.name?.v || entry.hostname?.v || entry.ip?.v || file;
	}

	static Unescape(value) {
		if (value.indexOf("\\") < 0) return value;
		return value.replace(/\\(.)/g, (_, c)=> c === "t" ? "\t" : c === "n" ? "\n" : c === "r" ? "\r" : c);
	}

	//file \t time \t severity \t log \t record \t source \t event id \t task \t message
	static ParseLine(line) {
		const split = line.split("\t");
		if (split.length < 9) return null;

		const severity = parseInt(split[2]);
		if (isNaN(severity) || severity < 0 || severity >= WinEvents.SEVERITY.length) return null;

		return {
			file    : split[0],
			time    : split[1],
			severity: severity,
			log     : WinEvents.Unescape(split[3]),
			record  : split[4],
			source  : WinEvents.Unescape(split[5]),
			eventId : split[6],
			task    : WinEvents.Unescape(split[7]),
			msg     : WinEvents.Unescape(split.slice(8).join("\t"))
		};
	}

	GetFilter() {
		let levels = 0;
		for (const filter of WinEvents.SEVERITY_FILTERS) {
			if (this.args[filter.key] === false) continue;
			for (const level of filter.levels) levels |= 1 << level;
		}

		const find = this.args.find.trim();

		return {
			device: this.args.device || null,
			levels: levels,
			find  : find || null
		};
	}

	BuildQuery(filter, cursor) {
		const query = [`limit=${WinEvents.PAGE_SIZE}`];
		if (cursor?.before) query.push(`before=${encodeURIComponent(cursor.before)}`, `skip=${cursor.skip}`);
		if (filter.device)  query.push(`device=${encodeURIComponent(filter.device)}`);
		if (filter.find)    query.push(`q=${encodeURIComponent(filter.find)}`);

		if (filter.levels !== WinEvents.ALL_LEVELS) {
			let levels = "";
			for (let i=0; i<WinEvents.SEVERITY.length; i++) {
				if (filter.levels & (1 << i)) levels += i;
			}
			query.push(`levels=${levels}`);
		}

		return query.join("&");
	}

	async Reload() {
		const token = ++this.loadToken;

		this.listBox.SetItems([]);
		this.ShowDetails(null);
		this.filter = this.GetFilter();
		this.cursor = null;
		this.hasEnded = false;
		this.isLoading = true;
		this.UpdateStatus();

		try {
			const response = await fetch(`winevents/list?${this.BuildQuery(this.filter, null)}`);
			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const json = await response.json();
			if (json.error) throw json.error;
			if (token !== this.loadToken) return;

			const entries = json.lines.map(o=> WinEvents.ParseLine(o)).filter(o=> o);
			if (json.end) entries.unshift({marker:true});
			this.listBox.AddItems(entries);

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
			const response = await fetch(`winevents/list?${this.BuildQuery(this.filter, this.cursor)}`);
			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const json = await response.json();
			if (json.error) throw json.error;
			if (token !== this.loadToken) return;

			const entries = json.lines.map(o=> WinEvents.ParseLine(o)).filter(o=> o);
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
		if (this.hasEnded || this.isLoading) return;
		if (this.listBox.list.scrollTop < 2) this.LoadOlder();
	}

	List_onwheel(event) {
		if (this.hasEnded || this.isLoading) return;
		if (event.deltaY > -1) return;
		if (this.listBox.list.scrollTop === 0) this.LoadOlder();
	}

	//the latest entries of the selected device, then the list again
	async FetchDevice() {
		const device = this.args.device;
		if (!device || this.isFetching) return;

		this.isFetching = true;
		this.fetchButton.disabled = true;
		this.statusLabel.textContent = "Fetching...";

		try {
			const response = await fetch(`winevents/fetch?device=${encodeURIComponent(device)}`);
			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const json = await response.json();
			if (json.error && !json.status) throw json.error;
			if (json.status === "skipped") throw "This device is not a Windows device, or has no IP address or hostname.";

			this.ListDevices();
			if (this.args.device === device) await this.Reload();

			if (json.status === "pending") {
				this.statusLabel.textContent = "The device is slow to respond, the entries are still being fetched";
			}
			else if (json.error) { //the device failed, the list is what was stored before
				this.statusLabel.textContent = `Showing cached data. ${json.error}`;
				this.statusLabel.title = json.error;
			}
		}
		catch (ex) {
			this.UpdateStatus();
			this.ConfirmBox(ex, true, "mono/error.svg");
		}
		finally {
			this.isFetching = false;
			this.fetchButton.disabled = !this.args.device;
		}
	}

	//the end marker is always the first item
	EntryCount() {
		const items = this.listBox.items;
		return items.length - (items[0]?.marker ? 1 : 0);
	}

	UpdateStatus() {
		const count = this.EntryCount();
		this.listBox.counter.textContent = count;
		this.statusLabel.textContent = this.isLoading && count === 0 ? "Loading..." : "";
		this.statusLabel.title = "";
	}

	static SeverityCell(severity) {
		const cell = document.createElement("div");
		cell.textContent = WinEvents.SEVERITY[severity];
		cell.style.color = `color-mix(in srgb, ${WinEvents.SEVERITY_COLOR[severity]} 40%, black)`;
		return cell;
	}

	InflateRow(element, entry, type) {
		if (entry.marker) {
			element.classList.add("winevents-marker");
			element.textContent = "- END -";
			return;
		}

		const dot = document.createElement("div");
		dot.className = "winevents-severity-dot";
		dot.style.backgroundColor = WinEvents.SEVERITY_COLOR[entry.severity];
		element.appendChild(dot);

		this.listBox.InflateElement(element, entry, type);
	}

	ShowDetails(entry) {
		this.details.textContent = "";
		if (!entry || entry.marker) return;

		const meta = document.createElement("div");
		meta.className = "winevents-details-meta";
		this.details.appendChild(meta);

		const AddMeta = (label, value)=> {
			if (value === undefined || value === null || value === "") return;
			const span = document.createElement("span");
			const b = document.createElement("b");
			b.textContent = `${label}:`;
			span.append(b, document.createTextNode(value));
			meta.appendChild(span);
		};

		AddMeta("Severity",  WinEvents.SEVERITY[entry.severity]);
		AddMeta("Time",      WinEvents.LocalTime(entry.time));
		AddMeta("Device",    WinEvents.DeviceName(entry.file));
		AddMeta("Log",       entry.log);
		AddMeta("Source",    entry.source);
		AddMeta("Event ID",  entry.eventId);
		AddMeta("Task",      entry.task);
		AddMeta("Record ID", entry.record);

		const message = document.createElement("div");
		message.className = "winevents-details-message";
		message.textContent = entry.msg;
		this.details.appendChild(message);
	}

	async ListDevices() {
		try {
			const response = await fetch("winevents/devices");
			if (response.status !== 200) return;

			const json = await response.json();
			if (!Array.isArray(json)) return;

			for (let i=0; i<json.length; i++) this.knownDevices.add(json[i]);
			this.RefreshDeviceFilter();
		}
		catch {}
	}
}

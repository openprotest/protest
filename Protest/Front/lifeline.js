"use strict";
class Lifeline extends Window {
	static HOUR_TICKS     = 3_600_000;
	static DAY_TICKS      = 86_400_000;
	static GRAPH_HEIGHT   = 64;
	static ROW_HEIGHT     = 72;
	static MIN_DAY_PIXELS = 60;
	static MAX_DAY_PIXELS = 1920;
	static MAX_SVG_CACHE  = 400;

	static METRICS = [
		{key:"ping",       label:"Roundtrip time",   icon:"mono/ping.svg",    source:"rtt",              type:"ping"},
		{key:"cpu",        label:"CPU usage",        icon:"mono/cpu.svg",     source:"cpu",              type:"percent"},
		{key:"memory",     label:"Memory",           icon:"mono/ram.svg",     source:"memory",           type:"vol"},
		{key:"disk",       label:"Disk space",       icon:"mono/hdd.svg",     source:"disk",             type:"vol"},
		{key:"diskio",     label:"Disk I/O",         icon:"mono/hdd.svg",     source:"diskio",           type:"percent"},
		{key:"printcount", label:"Print counter",    icon:"mono/printer.svg", source:"printcount",       type:"delta"},
		{key:"traffic",    label:"Traffic",          icon:"mono/traffic.svg", source:"switchcount",      type:"traffic"},
		{key:"errors",     label:"Errors",           icon:"mono/error.svg",   source:"switchcount",      type:"errors"},
		{key:"stp",        label:"Topology changes", icon:"mono/tree.svg",    source:"switchstpchanges", type:"delta"},
	];

	constructor(args) {
		super();

		this.args = {
			devices  : [],
			metrics  : Lifeline.METRICS.map(o=> o.key),
			dayPixels: 120,
			offset   : 0, //milliseconds back from now, at the right edge
			...args
		};

		if (!Array.isArray(this.args.devices)) this.args.devices = [];
		if (!Array.isArray(this.args.metrics)) this.args.metrics = Lifeline.METRICS.map(o=> o.key);
		this.args.metrics = this.args.metrics.filter(o=> Lifeline.METRICS.some(m=> m.key === o));
		//nearest zoom level: 60, 120, 240, 480, 960, 1920
		const level = Math.round(Math.log2(Math.max(this.args.dayPixels || 120, 1) / Lifeline.MIN_DAY_PIXELS));
		this.args.dayPixels = Math.min(Math.max(Lifeline.MIN_DAY_PIXELS * 2 ** level, Lifeline.MIN_DAY_PIXELS), Lifeline.MAX_DAY_PIXELS);
		this.args.offset = Math.max(this.args.offset || 0, 0);

		this.sources = new Map(); //device file to its loaded data
		this.rows = [];
		this.rowsById = new Map();
		this.loadToken = 0;
		this.now = Date.now() + Lifeline.HOUR_TICKS;

		Window.AddCssDependencies("list.css");
		Window.AddCssDependencies("lifeline.css");

		this.SetTitle("Lifeline");
		this.SetIcon("mono/lifeline.svg");

		this.SetupToolbar();
		this.devicesButton = this.AddToolbarButton("Devices", "mono/devices.svg?light");
		this.reloadButton = this.AddToolbarButton("Reload", "mono/update.svg?light");
		this.AddToolbarSeparator();

		this.metricButtons = Lifeline.METRICS.map(metric=> {
			const button = this.AddToolbarButton(metric.label, `${metric.icon}?light`);
			button.classList.add("lifeline-toggle-button");
			button.onclick = ()=> {
				const index = this.args.metrics.indexOf(metric.key);
				if (index < 0) {
					this.args.metrics.push(metric.key);
				}
				else {
					this.args.metrics.splice(index, 1);
				}
				this.UpdateMetricsUI();
				this.BuildRows();
				this.Seek();
			};
			return button;
		});

		this.AddToolbarSeparator();
		this.gotoButton = this.AddToolbarButton("Go to", "mono/skipback.svg?light");
		this.zoomOutButton = this.AddToolbarButton("Zoom out", "mono/zoomout.svg?light");
		this.zoomInButton = this.AddToolbarButton("Zoom in", "mono/zoomin.svg?light");

		this.devicesButton.onclick = ()=> this.DevicesDialog();
		this.reloadButton.onclick = ()=> this.Reload();
		this.gotoButton.onclick = ()=> this.GoTo();
		this.zoomOutButton.onclick = ()=> this.Zoom(.5);
		this.zoomInButton.onclick = ()=> this.Zoom(2);

		this.timeline = document.createElement("div");
		this.timeline.className = "lifeline-timeline";

		this.list = document.createElement("div");
		this.list.className = "lifeline-list";

		this.rangeLabel = document.createElement("div");
		this.rangeLabel.className = "lifeline-range";

		this.content.append(this.rangeLabel, this.timeline, this.list);

		this.tooltip = document.createElement("div");
		this.tooltip.className = "lifeline-tooltip";

		this.marker = document.createElement("div");
		this.marker.className = "lifeline-marker";

		let seeking = false;
		let mouseX0 = 0;
		let offset0 = 0;

		this.timeline.onmousedown = event=> {
			if (event.button !== 0) return;
			seeking = true;
			mouseX0 = event.clientX;
			offset0 = this.args.offset;
			this.timeline.style.cursor = "grabbing";
			this.HideHover();
		};

		this.list.addEventListener("mousedown", event=> {
			if (event.target.closest(".lifeline-graph")) this.timeline.onmousedown(event);
		});

		this.win.addEventListener("mousemove", event=> {
			if (!seeking) return;
			if (event.buttons !== 1) {
				seeking = false;
				this.timeline.style.cursor = "";
				return;
			}

			const offset = Math.max(offset0 + (event.clientX - mouseX0) / this.PixelsPerMs(), 0);
			if (offset === this.args.offset) return;
			this.args.offset = offset;
			this.Seek();
		});

		this.win.addEventListener("mouseup", ()=> {
			seeking = false;
			this.timeline.style.cursor = "";
		});

		this.timeline.ondblclick = ()=> {
			this.args.offset = 0;
			this.Seek();
		};

		this.UpdateMetricsUI();
		this.Reload();
	}

	AfterResize() { //overrides
		this.timeline.style.right = `${4 + this.list.offsetWidth - this.list.clientWidth}px`;
		this.Seek();
	}

	UpdateMetricsUI() {
		for (let i=0; i<Lifeline.METRICS.length; i++) {
			const metric = Lifeline.METRICS[i];
			const isOn = this.args.metrics.includes(metric.key);
			this.metricButtons[i].style.backgroundImage = isOn ? `url(${metric.icon})` : `url(${metric.icon}?light)`;
			this.metricButtons[i].style.backgroundColor = isOn ? "var(--clr-select)" : "";
		}
	}

	PixelsPerMs() {
		return this.args.dayPixels / Lifeline.DAY_TICKS;
	}

	ViewEnd() {
		return this.now - this.args.offset;
	}

	static Midnight(time) {
		const date = new Date(time);
		date.setHours(0, 0, 0, 0);
		return date.getTime();
	}

	static ShiftDays(midnight, days) {
		const date = new Date(midnight);
		date.setDate(date.getDate() + days);
		date.setHours(0, 0, 0, 0);
		return date.getTime();
	}

	//local days that overlap the viewport, newest first
	VisibleDays(width) {
		const viewEnd = this.ViewEnd();
		const viewStart = viewEnd - width / this.PixelsPerMs();
		const days = [];

		for (let dayStart = Lifeline.Midnight(viewEnd); days.length < 4000; dayStart = Lifeline.ShiftDays(dayStart, -1)) {
			const dayEnd = Lifeline.ShiftDays(dayStart, 1);
			if (dayEnd <= viewStart) break;
			days.push([dayStart, dayEnd]);
		}

		return days;
	}

	//utc months, as the lifeline files are named
	static MonthsBetween(start, end) {
		const months = [];
		const first = new Date(start);
		const date = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1));

		while (date.getTime() <= end && months.length < 1200) {
			months.push(`${date.getUTCFullYear()}${`${date.getUTCMonth() + 1}`.padStart(2, "0")}`);
			date.setUTCMonth(date.getUTCMonth() + 1);
		}

		return months;
	}

	static DeviceHost(device) {
		if (device?.ip?.v) return device.ip.v.split(";")[0];
		if (device?.hostname?.v) return device.hostname.v.split(";")[0];
		return null;
	}

	static DeviceName(file) {
		const device = LOADER.devices.data[file];
		if (!device) return file;
		return device.name?.v || device.hostname?.v || device.ip?.v || file;
	}

	async Reload() {
		const token = ++this.loadToken;

		this.now = Date.now() + Lifeline.HOUR_TICKS;
		this.sources.clear();
		for (const row of this.rowsById.values()) {
			row.series = null;
			row.svgCache.clear();
		}

		await Promise.all(this.args.devices.map(file=> this.LoadMonths(file, token)));
		if (token !== this.loadToken) return;

		this.BuildRows();
		this.AfterResize();
	}

	async LoadMonths(file, token) {
		const host = Lifeline.DeviceHost(LOADER.devices.data[file]);
		const source = {file:file, host:host, months:{}, loaded:new Map(), pending:new Set(), records:{}, captions:[], ready:false};

		try {
			const query = [`file=${encodeURIComponent(file)}`];
			if (host) query.push(`host=${encodeURIComponent(host)}`);

			const response = await fetch(`lifeline/months?${query.join("&")}`);
			if (response.status === 200) {
				const json = await response.json();
				for (const type in json) {
					if (Array.isArray(json[type])) source.months[type] = new Set(json[type]);
				}
			}
		}
		catch {}

		source.ready = true;
		if (token === this.loadToken) this.sources.set(file, source);
	}

	GetRow(file, metric, caption) {
		const id = `${file}|${metric.key}|${caption ?? ""}`;
		let row = this.rowsById.get(id);
		if (row) return row;

		const element = document.createElement("div");
		element.className = "lifeline-row";

		const label = document.createElement("div");
		label.className = "lifeline-label";
		label.textContent = caption ? `${metric.label} (${caption})` : metric.label;
		label.style.backgroundImage = `url(${metric.icon})`;

		const graph = document.createElement("div");
		graph.className = "lifeline-graph";

		element.append(label, graph);

		row = {id:id, file:file, metric:metric, caption:caption, element:element, graph:graph, svgCache:new Map(), series:null, max:50, gap:Lifeline.DAY_TICKS};

		graph.onmousemove = event=> this.Hover(row, event);
		graph.onmouseleave = ()=> this.HideHover();

		this.rowsById.set(id, row);
		return row;
	}

	BuildRows() {
		this.list.textContent = "";
		this.rows = [];

		if (this.args.devices.length === 0) {
			const empty = document.createElement("div");
			empty.className = "lifeline-empty";
			empty.textContent = "Select devices to view their lifeline.";
			this.list.appendChild(empty);
			return;
		}

		for (const file of this.args.devices) {
			const source = this.sources.get(file);
			const device = LOADER.devices.data[file];

			const header = document.createElement("div");
			header.className = "lifeline-device";
			header.textContent = Lifeline.DeviceName(file);
			header.style.backgroundImage = `url(${LOADER.deviceIcons[device?.type?.v?.toLowerCase()] ?? "mono/gear.svg"})`;
			header.ondblclick = ()=> {
				if (LOADER.devices.data[file]) LOADER.OpenDeviceByFile(file);
			};
			this.list.appendChild(header);

			let count = 0;
			for (const metric of Lifeline.METRICS) {
				if (!this.args.metrics.includes(metric.key)) continue;
				if (!(source?.months[metric.source]?.size > 0)) continue;

				//disk rows, one per drive, once the drives are known
				const captions = metric.key === "disk" && source.captions.length > 0 ? source.captions : [null];
				for (const caption of captions) {
					const row = this.GetRow(file, metric, caption);
					this.rows.push(row);
					this.list.appendChild(row.element);
				}
				count++;
			}

			if (count === 0) {
				const empty = document.createElement("div");
				empty.className = "lifeline-empty";
				empty.textContent = source?.ready === false || !source ? "Loading..." : "No lifeline data";
				this.list.appendChild(empty);
			}
		}
	}

	//coalesces the calls of the same task
	Seek() {
		if (this.seekPending) return;
		this.seekPending = true;

		queueMicrotask(()=> {
			this.seekPending = false;
			this.DrawTimeline();
			for (const row of this.rows) this.DrawRow(row);
			this.LoadVisible();
		});
	}

	Zoom(factor) {
		const dayPixels = Math.min(Math.max(this.args.dayPixels * factor, Lifeline.MIN_DAY_PIXELS), Lifeline.MAX_DAY_PIXELS);
		if (dayPixels === this.args.dayPixels) return;

		this.args.dayPixels = dayPixels;
		for (const row of this.rowsById.values()) row.svgCache.clear();
		this.HideHover();
		this.Seek();
	}

	GoTo() {
		const dialog = this.DialogBox("120px");
		if (dialog === null) return;

		const {okButton, innerBox} = dialog;

		innerBox.parentElement.style.maxWidth = "300px";
		innerBox.style.textAlign = "center";
		innerBox.style.marginTop = "20px";

		const Pad = n=> `${n}`.padStart(2, "0");
		const ToValue = date=> `${date.getFullYear()}-${Pad(date.getMonth() + 1)}-${Pad(date.getDate())}`;

		const dateInput = document.createElement("input");
		dateInput.style.width = "calc(100% - 80px)";
		dateInput.type = "date";
		dateInput.max = ToValue(new Date());
		dateInput.value = ToValue(new Date(this.ViewEnd() - 1));
		innerBox.appendChild(dateInput);

		dateInput.onkeydown = event=> {
			if (event.key === "Enter") okButton.onclick();
		};

		okButton.onclick = ()=> {
			if (!dateInput.value) return;
			const [year, month, day] = dateInput.value.split("-").map(o=> parseInt(o));
			const end = new Date(year, month - 1, day + 1).getTime(); //the selected day at the right edge
			this.args.offset = Math.max(this.now - end, 0);
			this.Seek();
			dialog.Close();
		};

		dateInput.focus();
	}

	//fetches the months of the visible range that are not loaded yet
	LoadVisible() {
		const width = this.timeline.clientWidth;
		if (width === 0) return;

		const viewEnd = this.ViewEnd();
		const viewStart = viewEnd - width / this.PixelsPerMs() - Lifeline.DAY_TICKS;
		const months = Lifeline.MonthsBetween(viewStart, viewEnd);

		const requested = new Set();
		for (const row of this.rows) {
			const source = this.sources.get(row.file);
			if (!source) continue;

			const type = row.metric.source;
			const available = source.months[type];
			if (!available) continue;

			for (const month of months) {
				const key = `${type}|${month}`;
				if (!available.has(month) || source.loaded.has(key) || source.pending.has(key)) continue;
				if (requested.has(`${row.file}|${key}`)) continue;
				requested.add(`${row.file}|${key}`);
				this.FetchMonth(source, type, month);
			}
		}
	}

	async FetchMonth(source, type, month) {
		const key = `${type}|${month}`;
		const token = this.loadToken;
		source.pending.add(key);

		let records = [];
		try {
			const url = type === "rtt"
				? `lifeline/ping/view?host=${encodeURIComponent(source.host)}&date=${month}`
				: `lifeline/${type}/view?file=${encodeURIComponent(source.file)}&date=${month}`;

			const response = await fetch(url);
			if (response.status === 200) {
				records = Lifeline.Parse(type, new Uint8Array(await response.arrayBuffer()));
			}
		}
		catch {}
		finally {
			source.pending.delete(key);
		}

		if (token !== this.loadToken) return;

		source.loaded.set(key, records);

		//merge the loaded months of this type, oldest first
		const merged = [];
		const keys = [...source.loaded.keys()].filter(o=> o.startsWith(`${type}|`)).sort();
		for (const k of keys) {
			const list = source.loaded.get(k);
			for (let i=0; i<list.length; i++) merged.push(list[i]);
		}
		merged.sort((a, b)=> a.d - b.d);
		source.records[type] = merged;

		if (type === "disk") {
			const captions = [...new Set(merged.flatMap(o=> o.disks.map(d=> d.c)))].sort();
			if (captions.join() !== source.captions.join()) {
				source.captions = captions;
				this.BuildRows();
			}
		}

		for (const row of this.rows) {
			if (row.file !== source.file || row.metric.source !== type) continue;
			row.series = null;
			row.svgCache.clear();
			this.DrawRow(row);
		}
	}

	//binary records, as written by Tasks/Lifeline.cs
	static Parse(type, bytes) {
		const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
		const length = bytes.byteLength;
		const records = [];
		const Time = i=> Number(view.getBigInt64(i, true));

		switch (type) {
		case "rtt":
			for (let i=0; i+10<=length; i+=10) records.push({d:Time(i), v:view.getInt16(i+8, true)});
			break;

		case "cpu":
		case "diskio":
			for (let i=0; i+9<=length; i+=9) records.push({d:Time(i), v:view.getUint8(i+8)});
			break;

		case "memory":
			for (let i=0; i+24<=length; i+=24) {
				records.push({d:Time(i), v:Number(view.getBigInt64(i+8, true)) * 1024, t:Number(view.getBigInt64(i+16, true)) * 1024});
			}
			break;

		case "disk": {
			let i = 0;
			while (i + 12 <= length) {
				const d = Time(i);
				const count = view.getInt32(i+8, true);
				i += 12;

				const disks = [];
				for (let j=0; j<count && i+17<=length; j++) {
					disks.push({c:String.fromCharCode(bytes[i]), v:Number(view.getBigUint64(i+1, true)), t:Number(view.getBigUint64(i+9, true))});
					i += 17;
				}
				records.push({d:d, disks:disks});
			}
			break;
		}

		case "printcount":
			for (let i=0; i+12<=length; i+=12) records.push({d:Time(i), v:view.getUint32(i+8, true)});
			break;

		case "switchcount":
			for (let i=0; i+24<=length; i+=24) {
				records.push({d:Time(i), traffic:Number(view.getBigInt64(i+8, true)), errors:Number(view.getBigInt64(i+16, true))});
			}
			break;

		case "switchstpchanges":
			for (let i=0; i+12<=length; i+=12) records.push({d:Time(i), v:view.getInt32(i+8, true)});
			break;
		}

		return records;
	}

	//counters are drawn as the change between samples
	static Deltas(points) {
		const result = new Array(points.length);
		for (let i=0; i<points.length; i++) {
			result[i] = {d:points[i].d, v:i === 0 ? 0 : Math.max(points[i].v - points[i-1].v, 0)};
		}
		return result;
	}

	//a line breaks where samples are missing, e.g. the device was not monitored
	static GapThreshold(series) {
		if (series.length < 3) return Lifeline.DAY_TICKS;

		const diffs = [];
		for (let i=Math.max(1, series.length - 256); i<series.length; i++) {
			diffs.push(series[i].d - series[i-1].d);
		}
		diffs.sort((a, b)=> a - b);

		return Math.max(diffs[Math.floor(diffs.length * 3 / 4)] * 2.5, 2 * Lifeline.HOUR_TICKS);
	}

	Series(row) {
		if (row.series) return row.series;

		const records = this.sources.get(row.file)?.records[row.metric.source] ?? [];
		let series;

		switch (row.metric.key) {
		case "memory":
			series = records.filter(o=> o.t > 0);
			break;

		case "disk":
			series = [];
			for (const record of records) {
				const disk = record.disks.find(o=> o.c === row.caption) ?? (row.caption === null ? record.disks[0] : null);
				if (disk && disk.t > 0) series.push({d:record.d, v:disk.v, t:disk.t});
			}
			break;

		case "printcount":
		case "stp":
			series = Lifeline.Deltas(records);
			break;

		case "traffic":
			series = Lifeline.Deltas(records.map(o=> ({d:o.d, v:o.traffic})));
			break;

		case "errors":
			series = Lifeline.Deltas(records.map(o=> ({d:o.d, v:o.errors})));
			break;

		default:
			series = records;
			break;
		}

		let max = 50;
		for (let i=0; i<series.length; i++) {
			if (series[i].v > max) max = series[i].v;
		}

		row.series = series;
		row.max = max;
		row.gap = Lifeline.GapThreshold(series);
		return series;
	}

	//first index at or after time
	static LowerBound(series, time) {
		let low = 0, high = series.length;
		while (low < high) {
			const mid = (low + high) >> 1;
			if (series[mid].d < time) low = mid + 1;
			else high = mid;
		}
		return low;
	}

	//same scales as the device view graphs
	Y(row, point) {
		const height = Lifeline.GRAPH_HEIGHT;
		switch (row.metric.type) {
		case "ping"   : return 3 + Math.round(point.v < 0 ? height : 24 + Math.min((height - 24) * point.v / 1000, height - 10));
		case "percent": return height + 4 - Math.round(height * point.v / 100);
		case "vol"    : return height + 4 - Math.round(height * point.v / point.t);
		default       : return height + 4 - Math.round(height * point.v / row.max);
		}
	}

	Color(row, point) {
		switch (row.metric.type) {
		case "ping"   : return point.v < 0 ? "var(--clr-error)" : UI.PingColor(point.v);
		case "percent": return Lifeline.LevelToColor(point.v / 100, .6, .75);
		case "vol"    : return Lifeline.LevelToColor(point.v / point.t, .8, .85);
		case "errors" : return "var(--clr-error)";
		default       : return "hsl(92,66%,50%)";
		}
	}

	static LevelToColor(p, warning, orange) {
		if (p > .98) return "var(--clr-critical)";
		if (p > .9) return "var(--clr-error)";
		if (p > orange) return "var(--clr-orange)";
		if (p > warning) return "var(--clr-warning)";
		return "hsl(92,66%,50%)";
	}

	ValueText(row, point) {
		switch (row.metric.type) {
		case "ping"   : return point.v < 0 ? "Timed out" : `${point.v} ms`;
		case "percent": return `${point.v}%`;
		case "vol"    : return `${UI.SizeToGB(point.v)} / ${UI.SizeToGB(point.t)} GB (${Math.round(1000 * point.v / point.t) / 10}%)`;
		case "traffic": return UI.SizeToString(point.v);
		default       : return `${point.v}`;
		}
	}

	DrawRow(row) {
		row.graph.textContent = "";

		const width = this.timeline.clientWidth;
		if (width === 0) return;

		if (row.svgCache.size > Lifeline.MAX_SVG_CACHE) row.svgCache.clear();

		const pixelsPerMs = this.PixelsPerMs();
		const viewEnd = this.ViewEnd();

		for (const [dayStart, dayEnd] of this.VisibleDays(width)) {
			let svg = row.svgCache.get(dayStart);
			if (!svg) {
				svg = this.GenerateDaySvg(row, dayStart, dayEnd);
				row.svgCache.set(dayStart, svg);
			}
			svg.style.right = `${(viewEnd - dayEnd) * pixelsPerMs}px`;
			row.graph.appendChild(svg);
		}
	}

	GenerateDaySvg(row, dayStart, dayEnd) {
		const pixelsPerMs = this.PixelsPerMs();
		const width = Math.max((dayEnd - dayStart) * pixelsPerMs, 1);
		const height = Lifeline.GRAPH_HEIGHT;
		const base = height + 5;

		const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		svg.setAttribute("width", width);
		svg.setAttribute("height", Lifeline.ROW_HEIGHT);

		const border = document.createElementNS("http://www.w3.org/2000/svg", "line");
		border.setAttribute("x1", 0);
		border.setAttribute("y1", 0);
		border.setAttribute("x2", 0);
		border.setAttribute("y2", Lifeline.ROW_HEIGHT);
		border.setAttribute("stroke", "color-mix(in hsl, var(--clr-light) 25%, transparent)");
		svg.appendChild(border);

		const baseline = document.createElementNS("http://www.w3.org/2000/svg", "rect");
		baseline.setAttribute("x", 0);
		baseline.setAttribute("y", base);
		baseline.setAttribute("width", width);
		baseline.setAttribute("height", 1);
		baseline.setAttribute("fill", "color-mix(in hsl, var(--clr-light) 25%, transparent)");
		svg.appendChild(baseline);

		const series = this.Series(row);
		if (series.length === 0) return svg;

		//one sample on each side, so the line continues into the neighboring days
		const first = Math.max(Lifeline.LowerBound(series, dayStart) - 1, 0);
		const last = Math.min(Lifeline.LowerBound(series, dayEnd), series.length - 1);
		if (first > last) return svg;

		const X = time=> (time - dayStart) * pixelsPerMs;

		const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
		path.setAttribute("fill", "rgba(192,192,192,.3)");
		svg.appendChild(path);

		let d = "";
		let lastX = 0;
		let open = false;
		let dotX = -100, dotY = -100;

		for (let i=first; i<=last; i++) {
			const point = series[i];
			const x = X(point.d);
			const y = this.Y(row, point);

			if (!open || point.d - series[i-1].d > row.gap) {
				if (open) d += `L ${lastX} ${base} Z `;
				d += `M ${x} ${base} L ${x} ${y} `;
				open = true;
			}
			else {
				d += `L ${x} ${y} `;
			}
			lastX = x;

			if (point.d < dayStart || point.d >= dayEnd) continue;
			if (x - dotX < 4 && Math.abs(y - dotY) <= 3) continue;

			const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
			dot.setAttribute("cx", x);
			dot.setAttribute("cy", y);
			dot.setAttribute("r", point.v === 0 ? 1 : 2);
			dot.setAttribute("fill", this.Color(row, point));
			svg.appendChild(dot);

			dotX = x;
			dotY = y;
		}

		if (open) d += `L ${lastX} ${base} Z`;
		path.setAttribute("d", d);

		return svg;
	}

	Hover(row, event) {
		if (event.buttons !== 0) return;

		const series = this.Series(row);
		if (series.length === 0) {
			this.HideHover();
			return;
		}

		const rect = row.graph.getBoundingClientRect();
		const pixelsPerMs = this.PixelsPerMs();
		const viewEnd = this.ViewEnd();
		const time = viewEnd - (rect.right - event.clientX) / pixelsPerMs;

		let index = Lifeline.LowerBound(series, time);
		if (index >= series.length || (index > 0 && time - series[index-1].d < series[index].d - time)) index--;

		const point = series[index];
		const x = rect.width - (viewEnd - point.d) * pixelsPerMs;

		if (Math.abs(x - (event.clientX - rect.left)) > 24) {
			this.HideHover();
			return;
		}

		const date = new Date(point.d);
		const dateString = date.toLocaleDateString(UI.regionalFormat, {year:"numeric", month:"short", day:"numeric"});
		const timeString = date.toLocaleTimeString(UI.regionalFormat, {hour12:false, hour:"2-digit", minute:"2-digit"});

		this.tooltip.textContent = `${this.ValueText(row, point)}  ${dateString} ${timeString}`;
		this.marker.style.left = `${x}px`;

		if (this.marker.parentElement !== row.graph) row.graph.append(this.marker, this.tooltip);

		const tooltipWidth = this.tooltip.offsetWidth;
		this.tooltip.style.left = x + 8 + tooltipWidth < rect.width ? `${x + 8}px` : `${Math.max(x - 8 - tooltipWidth, 0)}px`;
	}

	HideHover() {
		this.marker.remove();
		this.tooltip.remove();
	}

	DrawTimeline() {
		this.timeline.textContent = "";

		const width = this.timeline.clientWidth;
		if (width === 0) return;

		const pixelsPerMs = this.PixelsPerMs();
		const viewEnd = this.ViewEnd();

		//the visible range, the day labels alone do not tell the month and year
		const options = {year:"numeric", month:"short", day:"numeric"};
		const from = new Date(viewEnd - width / pixelsPerMs).toLocaleDateString(UI.regionalFormat, options);
		const to = new Date(Math.min(viewEnd - 1, Date.now())).toLocaleDateString(UI.regionalFormat, options);
		this.rangeLabel.textContent = "";
		this.rangeLabel.append(from, document.createElement("br"), to);

		for (const [dayStart, dayEnd] of this.VisibleDays(width)) {
			const svg = this.GenerateTimelineSvg(dayStart, dayEnd);
			svg.style.top = "0";
			svg.style.right = `${(viewEnd - dayEnd) * pixelsPerMs}px`;
			this.timeline.appendChild(svg);
		}

		const gradientL = document.createElement("div");
		gradientL.style.position = "absolute";
		gradientL.style.background = "linear-gradient(to right, light-dark(rgb(128,128,128), rgb(64,64,64)) ,transparent)";
		gradientL.style.left = gradientL.style.top = "0";
		gradientL.style.width = "20px";
		gradientL.style.height = "40px";
		this.timeline.appendChild(gradientL);

		const gradientR = document.createElement("div");
		gradientR.style.position = "absolute";
		gradientR.style.background = "linear-gradient(to right,transparent, light-dark(rgb(128,128,128), rgb(64,64,64)))";
		gradientR.style.right = gradientR.style.top = "0";
		gradientR.style.width = "20px";
		gradientR.style.height = "40px";
		this.timeline.appendChild(gradientR);
	}

	//same as the watchdog timeline, on local days, the width follows the day length on dst changes
	GenerateTimelineSvg(dayStart, dayEnd) {
		const width = (dayEnd - dayStart) * this.PixelsPerMs();
		const hours = Math.round((dayEnd - dayStart) / Lifeline.HOUR_TICKS);
		const hourPixels = width / hours;

		const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		svg.setAttribute("width", width);
		svg.setAttribute("height", 40);

		for (let i = 0; i <= hours; i++) {
			const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
			dot.setAttribute("cx", i * hourPixels);
			dot.setAttribute("cy", 36);
			dot.setAttribute("r", i % 2 === 0 ? 2 : 1);
			dot.setAttribute("fill", "#C0C0C0");
			svg.appendChild(dot);
		}

		if (this.args.dayPixels >= 120) {
			let lastX = 0;

			for (let i = this.args.dayPixels < 960 ? 2 : 1; i < hours; i++) {
				let x = i * hourPixels;
				if (x - lastX < 40) continue;
				lastX = x;

				const timeLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
				timeLabel.textContent = `${new Date(dayStart + i * Lifeline.HOUR_TICKS).getHours().toString().padStart(2, "0")}:00`;
				timeLabel.setAttribute("x", x);
				timeLabel.setAttribute("y", 26);
				timeLabel.setAttribute("fill", "#C0C0C0");
				timeLabel.setAttribute("text-anchor", "middle");
				timeLabel.setAttribute("font-size", "10px");
				svg.appendChild(timeLabel);
			}
		}

		//each midnight is drawn by both days, each one shows its half
		this.AppendDayMarker(svg, 0, new Date(dayStart));
		this.AppendDayMarker(svg, width, new Date(dayEnd));

		return svg;
	}

	AppendDayMarker(svg, x, date) {
		const line = document.createElementNS("http://www.w3.org/2000/svg", "rect");
		line.setAttribute("x", x - 9);
		line.setAttribute("y", 11);
		line.setAttribute("width", 18);
		line.setAttribute("height", 3);
		line.setAttribute("fill", "#C0C0C0");
		svg.appendChild(line);

		const box = document.createElementNS("http://www.w3.org/2000/svg", "rect");
		box.setAttribute("x", x - 9);
		box.setAttribute("y", 11);
		box.setAttribute("width", 18);
		box.setAttribute("height", 18);
		box.style = "stroke:#C0C0C0;stroke-width:2;fill:rgba(0,0,0,0)";
		svg.appendChild(box);

		const day = document.createElementNS("http://www.w3.org/2000/svg", "text");
		day.textContent = date.getDate();
		day.setAttribute("x", x);
		day.setAttribute("y", 25);
		day.setAttribute("fill", "#C0C0C0");
		day.setAttribute("font-size", "11px");
		day.setAttribute("text-anchor", "middle");
		svg.appendChild(day);

		if (date.getDate() === 1) {
			const month = document.createElementNS("http://www.w3.org/2000/svg", "text");
			month.textContent = date.toLocaleString(UI.regionalFormat, {month:"short"}).toUpperCase();
			month.setAttribute("x", x);
			month.setAttribute("y", 7);
			month.setAttribute("fill", "#C0C0C0");
			month.setAttribute("font-size", "8px");
			month.setAttribute("text-anchor", "middle");
			svg.appendChild(month);
		}
	}

	DevicesDialog() {
		const dialog = this.DialogBox("560px");
		if (dialog === null) return;

		const {okButton, innerBox} = dialog;
		innerBox.parentElement.style.maxWidth = "640px";
		innerBox.className = "lifeline-devices-dialog";

		const findRow = document.createElement("div");
		findRow.className = "lifeline-devices-find";
		innerBox.appendChild(findRow);

		const findLabel = document.createElement("div");
		findLabel.textContent = "Find:";

		const findInput = document.createElement("input");
		findInput.type = "search";
		findRow.append(findLabel, findInput);

		const container = document.createElement("div");
		container.className = "lifeline-devices-container";
		innerBox.appendChild(container);

		const selected = new Set(this.args.devices);

		const listBox = new ListBox({firstColumnOffset:"48px"});
		listBox.SetupTitleBar();
		listBox.SetupBuiltInSort();
		listBox.list.style.border = "rgb(82,82,82) solid 2px";
		listBox.list.addEventListener("keydown", event=> listBox.Keydown(event));
		container.append(listBox.listTitleOuter, listBox.list);

		listBox.inflate = (element, entry, type)=> {
			const box = document.createElement("div");
			box.style.left = "4px";
			box.style.height = "22px";
			const toggle = this.CreateToggle("", selected.has(entry.file), box);
			toggle.label.style.transform = "translateY(-14px)";
			toggle.checkbox.onchange = ()=> {
				if (toggle.checkbox.checked) {
					selected.add(entry.file);
				}
				else {
					selected.delete(entry.file);
				}
			};
			element.appendChild(box);
			listBox.InflateElement(element, entry, type);
		};

		listBox.SetupColumns([
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
			const sa = selected.has(a.file), sb = selected.has(b.file);
			if (sa !== sb) return sa ? -1 : 1;
			return a.name.localeCompare(b.name);
		});

		let available = []; //devices with lifeline data, empty until loaded

		const Refresh = ()=> {
			const keywords = findInput.value.trim().toLowerCase().split(" ").filter(o=> o.length > 0);
			listBox.SetItems(keywords.length === 0
				? available
				: available.filter(d=> keywords.every(k=> d.name.toLowerCase().includes(k) || d.ip.toLowerCase().includes(k))));
		};

		findInput.oninput = ()=> Refresh();
		Refresh();
		setTimeout(()=> listBox.FinalizeColumns(), 0);

		(async ()=> {
			let files = new Set(), hosts = new Set();
			try {
				const response = await fetch("lifeline/devices");
				if (response.status === 200) {
					const json = await response.json();
					files = new Set(json.files ?? []);
					hosts = new Set(json.hosts ?? []);
				}
			}
			catch {}

			//by file, or by the ping host the window would use
			available = allDevices.filter(d=> files.has(d.file) || hosts.has(Lifeline.DeviceHost(LOADER.devices.data[d.file])));

			//selected devices without data would stay selected, hidden
			const availableFiles = new Set(available.map(o=> o.file));
			for (const file of [...selected]) {
				if (!availableFiles.has(file)) selected.delete(file);
			}

			if (!innerBox.isConnected) return;
			Refresh();
			setTimeout(()=> listBox.FinalizeColumns(), 0);
		})();

		okButton.onclick = ()=> {
			//keep the current order, append the new ones
			this.args.devices = [
				...this.args.devices.filter(o=> selected.has(o)),
				...allDevices.map(o=> o.file).filter(o=> selected.has(o) && !this.args.devices.includes(o))
			];
			dialog.Close();
			this.Reload();
		};

		setTimeout(()=> findInput.focus(), 200);
	}
}

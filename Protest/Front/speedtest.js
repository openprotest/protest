"use strict";
class SpeedTest extends Window {
	static CONNECTIONS = [1, 2, 4, 6, 8, 16];
	static DURATIONS   = [10, 15, 30];
	static UPLOAD_SIZE = 32 * 1024 * 1024; //per request, fewer gaps between the requests than 8 MB
	static SCALE       = [0, 1, 5, 10, 50, 100, 250, 500, 1000, 2500, 10000]; //Mbps, an equal angle per step
	static WARMUP      = 1000; //milliseconds at the start of each direction, left out of every measurement
	static SMOOTHING   = 1000; //milliseconds, the speed is averaged over this window
	static HTTP1_LIMIT = 6;    //browser connections per server over http/1.1
	static COLOR       = {down:"rgb(76,134,26)", up:"rgb(204,102,0)"}; //received and transmitted, the reverse proxy hues, darker
	static LABEL       = {down:"Download", up:"Upload"};

	static GAUGE_START = -120; //degrees, clockwise from 12 o'clock
	static GAUGE_SWEEP = 240;

	constructor(args) {
		super();

		this.args = {
			connections: 2,
			mode       : "simplex",
			duration   : 15,
			...args
		};

		if (!SpeedTest.CONNECTIONS.includes(this.args.connections)) this.args.connections = 4;
		if (!SpeedTest.DURATIONS.includes(this.args.duration)) this.args.duration = 15;
		if (this.args.mode !== "duplex") this.args.mode = "simplex";

		this.ws = null;
		this.sessionId = null;
		this.running = false;
		this.controller = null;
		this.phaseEnd = null;
		this.uploadForm = null;

		Window.AddCssDependencies("speedtest.css");

		this.SetTitle("Speed test");
		this.SetIcon("mono/speedtest.svg");

		this.content.classList.add("speedtest-content");

		this.InitializeOptions();
		this.InitializeGauges();

		//between the gauges and the graph
		const actions = document.createElement("div");
		actions.className = "speedtest-actions";
		actions.appendChild(this.startButton);
		this.content.appendChild(actions);

		this.InitializeGraph();

		this.statusLabel = document.createElement("div");
		this.statusLabel.className = "speedtest-status";
		this.content.appendChild(this.statusLabel);

		this.ResetResults();
		this.SetStatus("Ready");
		this.UpdateHint();

		setTimeout(()=>{this.AfterResize()}, WIN.ANIME_DURATION);
	}

	Close() { //overrides
		this.running = false;
		this.EndPhase();
		this.Disconnect();
		super.Close();
	}

	AfterResize() { //overrides
		this.DrawGraph();
	}

	InitializeOptions() {
		const options = document.createElement("div");
		options.className = "speedtest-options";
		this.content.appendChild(options);

		const AddOption = (label, values, selected, onChange)=> {
			const box = document.createElement("div");
			box.className = "speedtest-option";

			const labelElement = document.createElement("div");
			labelElement.textContent = `${label}:`;

			const fewBox = new FewBox(values);
			fewBox.container.style.margin = "2px 4px";
			fewBox.Select(Math.max(values.indexOf(selected), 0));
			fewBox.container.onchange = ()=> onChange(fewBox.index);

			box.append(labelElement, fewBox.container);
			options.appendChild(box);
			return fewBox;
		};

		this.connectionsBox = AddOption("Connections", SpeedTest.CONNECTIONS.map(o=> `${o}`), `${this.args.connections}`, index=> {
			this.args.connections = SpeedTest.CONNECTIONS[index];
			this.UpdateHint();
		});

		this.modeBox = AddOption("Mode", ["Simplex", "Duplex"], this.args.mode === "duplex" ? "Duplex" : "Simplex", index=> {
			this.args.mode = index === 1 ? "duplex" : "simplex";
			this.UpdateHint();
		});

		this.durationBox = AddOption("Duration", SpeedTest.DURATIONS.map(o=> `${o}s`), `${this.args.duration}s`, index=> {
			this.args.duration = SpeedTest.DURATIONS[index];
		});

		this.startButton = document.createElement("input");
		this.startButton.type = "button";
		this.startButton.className = "with-icon speedtest-start";
		this.startButton.onclick = ()=> this.running ? this.Stop() : this.Start();

		this.hint = document.createElement("div");
		this.hint.className = "speedtest-hint";
		this.content.appendChild(this.hint);

		this.UpdateStartButton();
	}

	UpdateStartButton() {
		this.startButton.value = this.running ? "Stop" : "Start";
		this.startButton.style.backgroundImage = this.running ? "url(mono/stop.svg?light)" : "url(mono/play.svg?light)";

		for (const box of [this.connectionsBox, this.modeBox, this.durationBox]) {
			box.container.style.pointerEvents = this.running ? "none" : "";
			box.container.style.opacity = this.running ? ".5" : "";
		}
	}

	//over http/1.1, the requests beyond the browser's limit wait for a free connection
	UpdateHint() {
		const protocol = performance.getEntriesByType("navigation")[0]?.nextHopProtocol ?? "";
		const total = this.args.connections * (this.args.mode === "duplex" ? 2 : 1);

		this.hint.textContent = protocol === "http/1.1" && total > SpeedTest.HTTP1_LIMIT
			? `Over HTTP/1.1 the browser opens up to ${SpeedTest.HTTP1_LIMIT} connections to the server, the other ${total - SpeedTest.HTTP1_LIMIT} wait for a free one.`
			: "";
	}

	InitializeGauges() {
		const gauges = document.createElement("div");
		gauges.className = "speedtest-gauges";
		this.content.appendChild(gauges);

		this.gauges = {
			down: this.CreateGauge(gauges, "down"),
			up  : this.CreateGauge(gauges, "up")
		};
	}

	static Point(angle, radius, cx=120, cy=120) {
		const radians = angle * Math.PI / 180;
		return [cx + radius * Math.sin(radians), cy - radius * Math.cos(radians)];
	}

	static ArcPath(radius) {
		const [x0, y0] = SpeedTest.Point(SpeedTest.GAUGE_START, radius);
		const [x1, y1] = SpeedTest.Point(SpeedTest.GAUGE_START + SpeedTest.GAUGE_SWEEP, radius);
		return `M ${x0} ${y0} A ${radius} ${radius} 0 1 1 ${x1} ${y1}`;
	}

	//0 to 1, along the uneven scale
	static SpeedToFraction(mbps) {
		const scale = SpeedTest.SCALE;
		if (!(mbps > 0)) return 0;
		if (mbps >= scale[scale.length - 1]) return 1;

		let i = 0;
		while (mbps >= scale[i + 1]) i++;
		return (i + (mbps - scale[i]) / (scale[i + 1] - scale[i])) / (scale.length - 1);
	}

	static ScaleLabel(mbps) {
		return mbps >= 1000 ? `${mbps / 1000}G` : `${mbps}`;
	}

	CreateGauge(parent, direction) {
		const NS = "http://www.w3.org/2000/svg";
		const color = SpeedTest.COLOR[direction];

		const box = document.createElement("div");
		box.className = "speedtest-gauge";
		parent.appendChild(box);

		const title = document.createElement("div");
		title.className = "speedtest-gauge-title";
		title.textContent = SpeedTest.LABEL[direction];
		title.style.backgroundImage = `url(mono/${direction === "down" ? "download" : "upload"}.svg)`;
		box.appendChild(title);

		const svg = document.createElementNS(NS, "svg");
		svg.setAttribute("viewBox", "0 0 240 204");
		box.appendChild(svg);

		const track = document.createElementNS(NS, "path");
		track.setAttribute("d", SpeedTest.ArcPath(96));
		track.setAttribute("class", "speedtest-gauge-track");
		svg.appendChild(track);

		const arc = document.createElementNS(NS, "path");
		arc.setAttribute("d", SpeedTest.ArcPath(96));
		arc.setAttribute("pathLength", 1000);
		arc.setAttribute("class", "speedtest-gauge-arc");
		arc.style.stroke = color;
		arc.style.strokeDasharray = "0 1000";
		svg.appendChild(arc);

		//ticks and labels, an equal angle per scale step
		const steps = SpeedTest.SCALE.length - 1;
		for (let i = 0; i <= steps; i++) {
			const angle = SpeedTest.GAUGE_START + i * SpeedTest.GAUGE_SWEEP / steps;

			const [x0, y0] = SpeedTest.Point(angle, 82);
			const [x1, y1] = SpeedTest.Point(angle, 74);
			const tick = document.createElementNS(NS, "line");
			tick.setAttribute("x1", x0);
			tick.setAttribute("y1", y0);
			tick.setAttribute("x2", x1);
			tick.setAttribute("y2", y1);
			tick.setAttribute("class", "speedtest-gauge-tick");
			svg.appendChild(tick);

			const [lx, ly] = SpeedTest.Point(angle, 62);
			const label = document.createElementNS(NS, "text");
			label.textContent = SpeedTest.ScaleLabel(SpeedTest.SCALE[i]);
			label.setAttribute("x", lx);
			label.setAttribute("y", ly + 4);
			label.setAttribute("class", "speedtest-gauge-label");
			svg.appendChild(label);
		}

		const needle = document.createElementNS(NS, "g");
		needle.setAttribute("class", "speedtest-gauge-needle");
		needle.style.transform = `rotate(${SpeedTest.GAUGE_START}deg)`;
		svg.appendChild(needle);

		const needleShape = document.createElementNS(NS, "path");
		needleShape.setAttribute("d", "M 116 120 L 120 44 L 124 120 Z");
		needleShape.style.fill = color;
		needle.appendChild(needleShape);

		const hub = document.createElementNS(NS, "circle");
		hub.setAttribute("cx", 120);
		hub.setAttribute("cy", 120);
		hub.setAttribute("r", 8);
		hub.setAttribute("class", "speedtest-gauge-hub");
		svg.appendChild(hub);

		const value = document.createElementNS(NS, "text");
		value.setAttribute("x", 120);
		value.setAttribute("y", 162);
		value.setAttribute("class", "speedtest-gauge-value");
		value.textContent = "--";
		svg.appendChild(value);

		const unit = document.createElementNS(NS, "text");
		unit.setAttribute("x", 120);
		unit.setAttribute("y", 181);
		unit.setAttribute("class", "speedtest-gauge-unit");
		unit.textContent = "Mbps";
		svg.appendChild(unit);

		const megabytes = document.createElementNS(NS, "text");
		megabytes.setAttribute("x", 120);
		megabytes.setAttribute("y", 198);
		megabytes.setAttribute("class", "speedtest-gauge-megabytes");
		svg.appendChild(megabytes);

		const stats = document.createElement("div");
		stats.className = "speedtest-gauge-stats";
		box.appendChild(stats);

		const AddStat = label=> {
			const element = document.createElement("div");
			const name = document.createElement("div");
			name.textContent = label;
			const number = document.createElement("div");
			number.textContent = "--";
			element.append(name, number);
			stats.appendChild(element);
			return number;
		};

		return {
			arc      : arc,
			needle   : needle,
			value    : value,
			unit     : unit,
			megabytes: megabytes,
			min      : AddStat("Min"),
			max      : AddStat("Max"),
			avg      : AddStat("Average")
		};
	}

	//decimal steps of 1000: whole numbers in the base unit, two decimals in the top one
	static FormatUnits(value, units) {
		let index = 0;
		value = Math.max(value, 0);
		while (index < units.length - 1 && value >= 999.5) { //would round up to 1000
			value /= 1000;
			index++;
		}

		if (index === 0) return {value:value.toFixed(0), unit:units[0]};
		if (index === units.length - 1) return {value:value.toFixed(2), unit:units[index]};
		return {value:value >= 99.95 ? value.toFixed(0) : value.toFixed(1), unit:units[index]};
	}

	static FormatSpeed(mbps) {
		if (mbps === null || mbps === undefined || isNaN(mbps)) return {value:"--", unit:"Mbps"};
		return SpeedTest.FormatUnits(mbps * 1_000_000, ["bps", "Kbps", "Mbps", "Gbps"]);
	}

	//bytes, decimal: 8 Mbps is 1 MB/s
	static BytesText(mbps) {
		if (mbps === null || mbps === undefined || isNaN(mbps)) return "--";
		const {value, unit} = SpeedTest.FormatUnits(mbps * 125_000, ["B/s", "KB/s", "MB/s", "GB/s"]);
		return `${value} ${unit}`;
	}

	static SpeedText(mbps) {
		const {value, unit} = SpeedTest.FormatSpeed(mbps);
		return value === "--" ? value : `${value} ${unit}`;
	}

	//two lines, for the min, max and average
	static SetStat(element, mbps) {
		const speed = SpeedTest.SpeedText(mbps);
		element.textContent = speed;
		if (speed === "--") return;

		const bytes = document.createElement("div");
		bytes.className = "speedtest-gauge-bytes";
		bytes.textContent = SpeedTest.BytesText(mbps);
		element.appendChild(bytes);
	}

	SetGauge(direction, mbps) {
		const gauge = this.gauges[direction];
		const fraction = SpeedTest.SpeedToFraction(mbps ?? 0);

		gauge.arc.style.strokeDasharray = `${fraction * 1000} 1000`;
		gauge.needle.style.transform = `rotate(${SpeedTest.GAUGE_START + fraction * SpeedTest.GAUGE_SWEEP}deg)`;

		const {value, unit} = SpeedTest.FormatSpeed(mbps);
		gauge.value.textContent = value;
		gauge.unit.textContent = unit;
		gauge.megabytes.textContent = value === "--" ? "" : SpeedTest.BytesText(mbps);
	}

	InitializeGraph() {
		this.graph = document.createElement("div");
		this.graph.className = "speedtest-graph";
		this.content.appendChild(this.graph);

		const legend = document.createElement("div");
		legend.className = "speedtest-legend";
		for (const direction of ["down", "up"]) {
			const item = document.createElement("span");
			const swatch = document.createElement("span");
			swatch.style.backgroundColor = SpeedTest.COLOR[direction];
			item.append(swatch, SpeedTest.LABEL[direction]);
			legend.appendChild(item);
		}
		this.graph.appendChild(legend);

		this.graphSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		this.graph.appendChild(this.graphSvg);
	}

	//nice upper bound for the y axis
	static NiceMax(value) {
		const steps = [10, 20, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 50000, 100000];
		return steps.find(o=> o >= value) ?? Math.ceil(value / 10000) * 10000;
	}

	DrawGraph() {
		const NS = "http://www.w3.org/2000/svg";
		const svg = this.graphSvg;
		svg.textContent = "";

		const width = svg.clientWidth;
		const height = svg.clientHeight;
		if (width === 0 || height === 0) return;

		svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

		const left = 52, right = 8, top = 8, bottom = 20;
		const plotWidth = width - left - right;
		const plotHeight = height - top - bottom;

		const totalSeconds = this.args.duration * (this.testMode === "duplex" ? 1 : 2);
		let peak = 0;
		for (const sample of this.samples) {
			if (sample.down > peak) peak = sample.down;
			if (sample.up > peak) peak = sample.up;
		}
		const max = SpeedTest.NiceMax(peak);

		const X = t=> left + Math.min(t / (totalSeconds * 1000), 1) * plotWidth;
		const Y = v=> top + plotHeight - v / max * plotHeight;

		//grid
		for (let i = 0; i <= 4; i++) {
			const v = max * i / 4;
			const y = Y(v);

			const line = document.createElementNS(NS, "line");
			line.setAttribute("x1", left);
			line.setAttribute("x2", width - right);
			line.setAttribute("y1", y);
			line.setAttribute("y2", y);
			line.setAttribute("class", "speedtest-grid");
			svg.appendChild(line);

			const label = document.createElementNS(NS, "text");
			label.textContent = v >= 1000 ? `${v / 1000}G` : `${v}`;
			label.setAttribute("x", left - 6);
			label.setAttribute("y", y + 4);
			label.setAttribute("text-anchor", "end");
			label.setAttribute("class", "speedtest-axis");
			svg.appendChild(label);
		}

		const stepSeconds = totalSeconds > 30 ? 10 : 5;
		for (let s = 0; s <= totalSeconds; s += stepSeconds) {
			const label = document.createElementNS(NS, "text");
			label.textContent = `${s}s`;
			label.setAttribute("x", X(s * 1000));
			label.setAttribute("y", height - 4);
			label.setAttribute("text-anchor", s === 0 ? "start" : s === totalSeconds ? "end" : "middle");
			label.setAttribute("class", "speedtest-axis");
			svg.appendChild(label);
		}

		//one line per direction, broken where the direction is idle
		for (const direction of ["down", "up"]) {
			let d = "";
			let open = false;
			for (const sample of this.samples) {
				const value = sample[direction];
				if (value === null) {
					open = false;
					continue;
				}
				d += `${open ? "L" : "M"} ${X(sample.t)} ${Y(value)} `;
				open = true;
			}
			if (d.length === 0) continue;

			const path = document.createElementNS(NS, "path");
			path.setAttribute("d", d);
			path.setAttribute("class", "speedtest-line");
			path.style.stroke = SpeedTest.COLOR[direction];
			svg.appendChild(path);
		}
	}

	ResetResults() {
		this.samples = [];   //{t, down, up}, Mbps, null when idle
		this.history = [];   //{t, ct, down, up}, cumulative bytes, server and client time
		this.downloaded = 0; //bytes received by this client
		this.testStartT = null;
		this.testMode = this.args.mode;
		this.directions = {
			down: {active:false, phaseT:null, avgT:null, avgBytes:0, lastT:0, lastBytes:0, min:null, max:null, current:null},
			up  : {active:false, phaseT:null, avgT:null, avgBytes:0, lastT:0, lastBytes:0, min:null, max:null, current:null}
		};

		for (const direction of ["down", "up"]) {
			this.SetGauge(direction, null);
			this.gauges[direction].min.textContent = "--";
			this.gauges[direction].max.textContent = "--";
			this.gauges[direction].avg.textContent = "--";
		}

		this.DrawGraph();
	}

	SetStatus(text) {
		this.statusLabel.textContent = text;
	}

	Connect() {
		return new Promise((resolve, reject)=> {
			const ws = new WebSocket(`${KEEP.isSecure ? "wss" : "ws"}://${window.location.host}/ws/speedtest`);
			this.ws = ws;
			let settled = false;

			ws.onmessage = event=> {
				let json;
				try {
					json = JSON.parse(event.data);
				}
				catch {
					return;
				}

				switch (json.action) {
				case "session":
					this.sessionId = json.id;
					settled = true;
					resolve();
					break;

				case "stats":
					this.OnStats(json);
					break;

				case "error":
					if (!settled) {
						settled = true;
						reject(json.error);
					}
					break;
				}
			};

			ws.onclose = ()=> {
				if (!settled) {
					settled = true;
					reject("Failed to connect to the server.");
				}
				else if (this.running) {
					this.SetStatus("The connection to the server was lost.");
					this.running = false;
					this.EndPhase();
					this.UpdateStartButton();
				}
				if (this.ws === ws) this.ws = null;
			};
		});
	}

	Disconnect() {
		try { this.ws?.close(); } catch {}
		this.ws = null;
		this.sessionId = null;
	}

	Send(message) {
		if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message));
	}

	async Start() {
		if (this.running) return;

		this.running = true;
		this.UpdateStartButton();
		this.ResetResults();
		this.SetStatus("Connecting...");

		try {
			await this.Connect();
			if (!this.running) return; //stopped while connecting
			this.Send({action:"reset"});

			if (this.testMode === "duplex") {
				await this.RunPhase(["down", "up"]);
			}
			else {
				await this.RunPhase(["down"]);
				if (this.running) await this.RunPhase(["up"]);
			}

			if (this.running) this.SetStatus(this.Summary());
		}
		catch (ex) {
			this.SetStatus(`${ex}`);
		}
		finally {
			this.running = false;
			this.EndPhase();
			this.Disconnect();
			this.UpdateStartButton();
		}
	}

	Stop() {
		if (!this.running) return;
		this.running = false;
		this.EndPhase();
		this.SetStatus("Stopped");
	}

	Summary() {
		const parts = [];
		for (const direction of ["down", "up"]) {
			const average = this.Average(direction);
			if (average !== null) parts.push(`${SpeedTest.LABEL[direction]} ${SpeedTest.SpeedText(average)} (${SpeedTest.BytesText(average)})`);
		}
		return parts.length > 0 ? `Done. ${parts.join(", ")}` : "Done";
	}

	async RunPhase(directions) {
		if (!this.running) return;

		const controller = new AbortController();
		this.controller = controller;

		for (const direction of directions) {
			Object.assign(this.directions[direction], {active:true, phaseT:null});
		}

		this.phaseLabel = directions.map(o=> SpeedTest.LABEL[o]).join(" and ");
		this.SetStatus(this.phaseLabel);

		//one multipart file, posted over and over
		if (directions.includes("up") && !this.uploadForm) {
			this.uploadForm = new FormData();
			this.uploadForm.append("file", SpeedTest.RandomBlob(SpeedTest.UPLOAD_SIZE), "speedtest.bin");
		}

		for (let i = 0; i < this.args.connections; i++) {
			if (directions.includes("down")) this.DownloadLoop(`d${i}`, controller.signal);
			if (directions.includes("up")) this.UploadLoop(`u${i}`, controller.signal);
		}

		await new Promise(resolve=> {
			const timer = setTimeout(resolve, this.args.duration * 1000);
			this.phaseEnd = ()=> {
				clearTimeout(timer);
				resolve();
			};
		});

		controller.abort();
		this.Send({action:"stop"});

		//the last counters arrive with the next stats
		await new Promise(resolve=> setTimeout(resolve, 400));

		for (const direction of directions) {
			this.directions[direction].active = false;
			this.directions[direction].current = null;
			this.SetGauge(direction, null);
		}
	}

	EndPhase() {
		this.controller?.abort();
		this.phaseEnd?.();
		this.phaseEnd = null;
	}

	//random, so nothing on the way can compress it
	static RandomBlob(size) {
		const bytes = new Uint8Array(size);
		for (let offset = 0; offset < size; offset += 65536) {
			crypto.getRandomValues(bytes.subarray(offset, Math.min(offset + 65536, size)));
		}
		return new Blob([bytes], {type:"application/octet-stream"});
	}

	//counted here, as received: the server's count runs ahead, http.sys completes large writes before they arrive
	async DownloadLoop(id, signal) {
		while (!signal.aborted) {
			try {
				const response = await fetch(`speedtest?session=${this.sessionId}&connection=${id}`, {signal:signal, cache:"no-store"});
				if (!response.ok || !response.body) break;

				const reader = response.body.getReader();
				while (true) {
					const {done, value} = await reader.read();
					if (done) break;
					this.downloaded += value.byteLength;
				}
			}
			catch {
				if (signal.aborted) break;
				await new Promise(resolve=> setTimeout(resolve, 250));
			}
		}
	}

	async UploadLoop(id, signal) {
		while (!signal.aborted) {
			try {
				const response = await fetch(`speedtest?session=${this.sessionId}&connection=${id}`, {method:"POST", body:this.uploadForm, signal:signal, cache:"no-store"});
				if (!response.ok) break;
			}
			catch {
				if (signal.aborted) break;
				await new Promise(resolve=> setTimeout(resolve, 250));
			}
		}
	}

	//each direction is measured where it is received:
	//download by this client, on its clock, upload by the server, on its clock
	OnStats(json) {
		if (!Array.isArray(json.connections)) return;

		let up = 0, active = 0;
		for (const connection of json.connections) {
			if (connection.dir === "up") up += connection.bytes;
			if (connection.active) active++;
		}

		const t = json.t;
		const ct = performance.now();
		const down = this.downloaded;
		if (this.testStartT === null) this.testStartT = t;

		//a reset on the server starts the counters over
		const last = this.history[this.history.length - 1];
		if (last && up < last.up) this.history = [];

		this.history.push({t:t, ct:ct, down:down, up:up});
		while (this.history.length > 2 && t - this.history[1].t >= SpeedTest.SMOOTHING) this.history.shift();

		const first = this.history[0];
		const sample = {t:t - this.testStartT, down:null, up:null};
		let warming = false;

		for (const direction of ["down", "up"]) {
			const state = this.directions[direction];
			if (!state.active) continue;

			const bytes = direction === "down" ? down : up;
			const time = direction === "down" ? ct : t;
			if (state.phaseT === null) state.phaseT = time;

			//the first second is left out, while the connections open and the buffers fill in a burst
			if (time - state.phaseT < SpeedTest.WARMUP) {
				warming = true;
				continue;
			}
			if (state.avgT === null) {
				state.avgT = time;
				state.avgBytes = bytes;
				warming = true;
				continue;
			}

			//over the smoothing window, but never back into the warm-up
			const firstT = direction === "down" ? first.ct : first.t;
			const startT = firstT < state.avgT ? state.avgT : firstT;
			const startBytes = firstT < state.avgT ? state.avgBytes : first[direction];

			const span = time - startT;
			const mbps = span > 0 ? (bytes - startBytes) * 8 / span / 1000 : 0; //bits per ms is kbps, /1000 is Mbps

			state.current = mbps;
			sample[direction] = mbps;
			this.SetGauge(direction, mbps);

			state.lastT = time;
			state.lastBytes = bytes;

			if (state.min === null || mbps < state.min) state.min = mbps;
			if (state.max === null || mbps > state.max) state.max = mbps;

			const gauge = this.gauges[direction];
			SpeedTest.SetStat(gauge.min, state.min);
			SpeedTest.SetStat(gauge.max, state.max);
			SpeedTest.SetStat(gauge.avg, this.Average(direction));
		}

		this.samples.push(sample);
		this.DrawGraph();

		if (this.running && this.phaseLabel) {
			const transferred = UI.SizeToString(down + up);
			this.SetStatus(`${this.phaseLabel}, ${Math.floor(sample.t / 1000)}s, ${warming ? "warming up, " : ""}${active} active connection${active === 1 ? "" : "s"}, ${transferred} transferred`);
		}
	}

	Average(direction) {
		const state = this.directions[direction];
		if (state.avgT === null || state.lastT <= state.avgT) return null;
		return (state.lastBytes - state.avgBytes) * 8 / (state.lastT - state.avgT) / 1000;
	}
}

class Watchdog extends Window {
	static DAY_PIXELS = 480;
	static HOUR_TICKS = 3_600_000;
	static DAY_TICKS  = 3_600_000 * 24;

	constructor() {
		super();

		this.AddCssDependencies("list.css");
		this.AddCssDependencies("watchdog.css");

		this.SetTitle("Watchdog");
		this.SetIcon("mono/watchdog.svg");

		this.SetupToolbar();

		this.newButton    = this.AddToolbarButton("Create watcher", "mono/add.svg?light");
		this.editButton   = this.AddToolbarButton("Edit", "mono/edit.svg?light");
		this.deleteButton = this.AddToolbarButton("Delete", "mono/delete.svg?light");
		
		this.AddToolbarSeparator();

		this.notificationButton = this.AddToolbarButton("Notifications", "mono/notifications.svg?light");
		this.reloadButton       = this.AddToolbarButton("Reload", "mono/restart.svg?light");
		this.gotoButton         = this.AddToolbarButton("Go to", "mono/timeline.svg?light");

		this.newButton.onclick          = ()=> this.WatcherDialog(true);
		this.editButton.onclick         = ()=> this.EditWatcher();
		this.deleteButton.onclick       = ()=> this.DeleteWatcher();
		this.notificationButton.onclick = ()=> this.NotificationsDialog();
		this.reloadButton.onclick       = ()=> this.GetWatchers();
		this.gotoButton.onclick         = ()=> {};

		this.timeline = document.createElement("div");
		this.timeline.className = "watchdog-timeline";

		this.list = document.createElement("div");
		this.list.className = "watchdog-list";

		this.details = document.createElement("div");
		this.details.className = "watchdog-details";

		this.content.append(this.timeline, this.list, this.details);

		this.selected = null;
		this.selectedElement = null;
		this.high = new Date(Date.now() - Date.now() % (Watchdog.DAY_TICKS)).getTime();
		this.offset = 0;
		this.watchers = {};
		this.cache = {};

		let seeking = false;
		let mouseX0;
		let lastOffset = 0;

		this.timeline.onmousedown = event=> {
			this.timeline.style.cursor = "grabbing";
			mouseX0 = event.clientX;
			lastOffset = this.offset;
			seeking = true;
		};

		this.timeline.onmousemove = event=> {
			if (event.buttons !== 1) {
				this.timeline.onmouseup(event);
				return;
			}

			if (!seeking) {
				return;
			}

			let last = this.offset;

			this.offset = lastOffset - (mouseX0 - event.clientX);
			this.offset -= this.offset % 20;
			if (this.offset < 0) this.offset = 0;

			//this.high = new Date(Date.now() - Date.now() % Watchdog.DAY_TICKS).getTime() - this.offset * Watchdog.DAY_TICKS / Watchdog.DAY_PIXELS;

			if (last === this.offset) return;
			this.Seek();
		};

		this.timeline.onmouseup = ()=> {
			this.timeline.style.cursor = "grab";
			seeking = false;
		};

		this.list.addEventListener("mousedown", event=> this.timeline.onmousedown(event));

		this.win.addEventListener("mousemove", event=> this.timeline.onmousemove(event));
		this.win.addEventListener("mouseup", event=> this.timeline.onmouseup(event));
	
		this.UpdateAuthorization();
		setTimeout(()=>this.DrawTimeline(), 200);

		this.GetWatchers();

		setTimeout(()=> { this.AfterResize(); }, 250);
	}
	
	AfterResize() { //override
		if (this.lastWidth && this.lastWidth === this.content.getBoundingClientRect().width) return;

		if (this.content.getBoundingClientRect().width < 720) {
			this.timeline.style.right = "4px";
			this.list.style.right = "4px";
			this.details.style.display = "none";
		}
		else {
			this.timeline.style.right = "200px";
			this.list.style.right = "200px";
			this.details.style.display = "initial";
		}
		
		this.Seek();

		this.lastWidth = this.content.getBoundingClientRect().width;
	}

	UpdateAuthorization() {
		this.newButton.disabled          = !KEEP.authorization.includes("*") && !KEEP.authorization.includes("watchdog:write");
		this.editButton.disabled         = !KEEP.authorization.includes("*") && !KEEP.authorization.includes("watchdog:write");
		this.deleteButton.disabled       = !KEEP.authorization.includes("*") && !KEEP.authorization.includes("watchdog:write");
		this.notificationButton.disabled = !KEEP.authorization.includes("*") && !KEEP.authorization.includes("watchdog:write");
	}

	async GetWatchers() {
		try {
			const response = await fetch("watchdog/list");

			if (response.status !== 200) return;
			
			const json = await response.json();
			if (json.error) throw(json.error);
			
			this.list.textContent = "";
			for (let i=0; i<json.length; i++) {
				this.CreateWatcherElement(json[i]);
				this.watchers[json[i].file] = json[i];
			}
		}
		catch (ex) {
			setTimeout(()=>this.ConfirmBox(ex, true, "mono/error.svg"), 200);
		}
	}

	WatcherDialog(isNew) {
		const dialog = this.DialogBox("350px");
		if (dialog === null) return;

		const innerBox = dialog.innerBox;
		const btnOK = dialog.btnOK;
		const btnCancel = dialog.btnCancel;

		btnOK.value = isNew ? "Create" : "Save";

		innerBox.parentElement.style.transition = ".2s";

		innerBox.style.display = "grid";
		innerBox.style.margin = "20px";
		innerBox.style.gridTemplateColumns = "auto 200px 300px auto";
		innerBox.style.alignItems = "center";

		let types = ["ICMP", "TCP", "DNS", "HTTP", "HTTP keyword", "TLS"];
		let methods = ["GET", "POST", "PUT", "PATCH", "DELETE"];
		let dnsRecordTypes = ["A", "NS", "CNAME", "SOA", "PTR", "MX", "TXT", "AAAA", "SRV"];


		const enableBox = document.createElement("div");
		enableBox.style.gridArea = "1 / 2";

		const enableInput = document.createElement("input");
		enableInput.type = "checkbox";
		enableBox.appendChild(enableInput);
		const label = this.AddCheckBoxLabel(enableBox, enableInput, "Enable");
		label.style.minWidth = "38px";
		label.style.margin = "2px";


		const typeLabel = document.createElement("div");
		typeLabel.style.gridArea = "2 / 2";
		typeLabel.textContent = "Watcher type:";

		const typeInput = document.createElement("select");
		typeInput.style.gridArea = "2 / 3";
		for (let i = 0; i < types.length; i++) {
			const newType = document.createElement("option");
			newType.text = types[i];
			newType.value = types[i];
			typeInput.appendChild(newType);
		}

		const nameLabel = document.createElement("div");
		nameLabel.style.gridArea = "3 / 2";
		nameLabel.textContent = "Name:";

		const nameInput = document.createElement("input");
		nameInput.type = "text";
		nameInput.style.gridArea = "3 / 3";


		const targetLabel = document.createElement("div");
		targetLabel.textContent = "Target:";
		targetLabel.style.gridArea = "4 / 2";

		const targetInput = document.createElement("input");
		targetInput.type = "text";
		targetInput.style.gridArea = "4 / 3";


		const portLabel = document.createElement("div");
		portLabel.textContent = "Port:";

		const portInput = document.createElement("input");
		portInput.type = "number";
		portInput.min = 1;
		portInput.max = 65_535;
		portInput.value = 443;


		const timeoutLabel = document.createElement("div");
		timeoutLabel.textContent = "Timeout (ms):";
		timeoutLabel.style.gridArea = "5 / 2";

		const timeoutInput = document.createElement("input");
		timeoutInput.type = "number";
		timeoutInput.min = 1;
		timeoutInput.max = 10_000;
		timeoutInput.value = 500;
		timeoutInput.style.gridArea = "5 / 3";


		const rrTypeLabel = document.createElement("div");
		rrTypeLabel.textContent = "Resource record type:";

		const rrTypeInput = document.createElement("select");
		for (let i = 0; i < dnsRecordTypes.length; i++) {
			const newType = document.createElement("option");
			newType.text = dnsRecordTypes[i];
			newType.value = dnsRecordTypes[i];
			rrTypeInput.appendChild(newType);
		}


		const queryLabel = document.createElement("div");
		queryLabel.textContent = "Query:";

		const queryInput = document.createElement("input");
		queryInput.type = "text";
		queryInput.placeholder = "one.one.one.one";


		const keywordLabel = document.createElement("div");
		keywordLabel.textContent = "Keyword:";

		const keywordInput = document.createElement("input");
		keywordInput.type = "text";


		const methodLabel = document.createElement("div");
		methodLabel.textContent = "Method:";

		const methodInput = document.createElement("select");
		for (let i = 0; i < methods.length; i++) {
			const newMethod = document.createElement("option");
			newMethod.text = methods[i];
			newMethod.value = methods[i];
			methodInput.appendChild(newMethod);
		}

		const statusCodesLabel = document.createElement("div");
		statusCodesLabel.textContent = "Accepted status codes:";
		const statusCodesBox = document.createElement("div");

		let statusCodes = [];
		for (let i = 1; i < 6; i++) {
			const checkBox = document.createElement("input");
			checkBox.type = "checkbox";
			checkBox.checked = i > 1 && i < 4;
			statusCodesBox.appendChild(checkBox);
			const label = this.AddCheckBoxLabel(statusCodesBox, checkBox, `${i}xx`);
			label.style.minWidth = "38px";
			label.style.margin = "2px";
			statusCodes.push(checkBox);
		}

		const intervalLabel = document.createElement("div");
		intervalLabel.textContent = "Interval (minutes):";

		const intervalInput = document.createElement("input");
		intervalInput.type = "number";
		intervalInput.min = 5;
		intervalInput.max = 1440;
		intervalInput.value = 120;

		const retriesLabel = document.createElement("div");
		retriesLabel.textContent = "Retries:";

		const retriesInput = document.createElement("input");
		retriesInput.type = "number";
		retriesInput.min = 0;
		retriesInput.max = 4;
		retriesInput.value = 1;

		let counter = 6;
		const AppendRow = (label, input) => {
			label.style.gridArea = `${counter} / 2`;
			input.style.gridArea = `${counter} / 3`;
			counter++;
			innerBox.append(label, input);
		};

		if (isNew) {
			enableInput.checked = true;
		}
		else {
			enableInput.checked = this.selected.enable;
			typeInput.value     = this.selected.type;
			nameInput.value     = this.selected.name;
			targetInput.value   = this.selected.target;
			portInput.value     = this.selected.port;
			methodInput.value   = this.selected.method;
			keywordInput.value  = this.selected.keyword;
			queryInput.value    = this.selected.query;
			rrTypeInput.value   = this.selected.rrtype;
			intervalInput.value = this.selected.interval;
			retriesInput.value  = this.selected.retries;

			for (let i=0; i<5; i++) {
				statusCodes[i].checked = this.selected.httpstatus[i];
			}
		}
		
		typeInput.onchange = ()=> {
			innerBox.textContent = "";

			innerBox.append(enableBox);
			innerBox.append(typeLabel, typeInput);
			innerBox.append(nameLabel, nameInput);
			innerBox.append(targetLabel, targetInput);
			innerBox.append(timeoutLabel, timeoutInput);

			typeInput.focus();

			counter = 6;

			switch (typeInput.value) {
			case "ICMP":
				innerBox.style.gridTemplateRows = "repeat(7, 40px) auto";
				targetLabel.textContent = "Host:";
				targetInput.placeholder = "1.1.1.1";
				AppendRow(intervalLabel, intervalInput);
				AppendRow(retriesLabel, retriesInput);
				break;

			case "TCP":
				innerBox.style.gridTemplateRows = "repeat(8, 40px) auto";
				targetLabel.textContent = "Host:";
				targetInput.placeholder = "1.1.1.1";
				AppendRow(portLabel, portInput);
				AppendRow(intervalLabel, intervalInput);
				AppendRow(retriesLabel, retriesInput);
				break;

			case "DNS":
				innerBox.style.gridTemplateRows = "repeat(10, 40px) auto";
				targetLabel.textContent = "DNS server:";
				targetInput.placeholder = "1.1.1.1";
				portInput.value = "53";
				AppendRow(rrTypeLabel, rrTypeInput);
				AppendRow(queryLabel, queryInput);
				AppendRow(intervalLabel, intervalInput);
				AppendRow(retriesLabel, retriesInput);
				break;

			case "HTTP":
				innerBox.style.gridTemplateRows = "repeat(6, 40px) 64px repeat(2, 40px) auto";
				targetLabel.textContent = "URL:";
				targetInput.placeholder = "https://one.one.one.one";
				AppendRow(methodLabel, methodInput);
				AppendRow(statusCodesLabel, statusCodesBox);
				AppendRow(intervalLabel, intervalInput);
				AppendRow(retriesLabel, retriesInput);
				break;

			case "HTTP keyword":
				innerBox.style.gridTemplateRows = "repeat(7, 40px) 64px repeat(2, 40px) auto";
				targetLabel.textContent = "URL:";
				targetInput.placeholder = "https://one.one.one.one";
				AppendRow(methodLabel, methodInput);
				AppendRow(keywordLabel, keywordInput);
				AppendRow(statusCodesLabel, statusCodesBox);
				AppendRow(intervalLabel, intervalInput);
				AppendRow(retriesLabel, retriesInput);
				break;

			case "TLS":
				innerBox.style.gridTemplateRows = "repeat(7, 40px) auto";
				targetLabel.textContent = "URL:";
				targetInput.placeholder = "https://one.one.one.one";
				AppendRow(intervalLabel, intervalInput);
				AppendRow(retriesLabel, retriesInput);
				break;
			}

			innerBox.parentElement.style.maxHeight = `calc(${56 + 44*counter}px)`;
		};

		targetInput.onchange = ()=> {
			nameInput.placeholder = targetInput.value;
		};

		typeInput.onchange();
		
		btnOK.onclick = async ()=> {
			if (!isNew && this.selected === null) return;

			let requiredFilledMissing = false;

			if (targetInput.value.length === 0) {
				if (!requiredFilledMissing) targetInput.focus();
				targetInput.required = true;
				requiredFilledMissing = true;
			}

			if (typeInput.value === "TCP" && portInput.value.length === 0) {
				if (!requiredFilledMissing) portInput.focus();
				portInput.required = true;
				requiredFilledMissing = true;
			}

			if (typeInput.value === "DNS" && portInput.value.length === 0) {
				if (!requiredFilledMissing) portInput.focus();
				portInput.required = true;
				requiredFilledMissing = true;
			}
			if (typeInput.value === "DNS" && queryInput.value.length === 0) {
				if (!requiredFilledMissing) queryInput.focus();
				queryInput.required = true;
				requiredFilledMissing = true;
			}

			if (typeInput.value === "HTTP keyword" && keywordInput.value.length === 0) {
				if (!requiredFilledMissing) keywordInput.focus();
				keywordInput.required = true;
				requiredFilledMissing = true;
			}

			if (requiredFilledMissing) return;

			if (nameInput.value.length === 0) {
				nameInput.value = targetInput.value;
			}

			try {
				const obj = {
					file       : isNew ? null : this.selected.file,
					enable     : enableInput.checked,
					type       : typeInput.value,
					name       : nameInput.value,
					target     : targetInput.value,
					port       : parseInt(portInput.value),
					timeout    : parseInt(timeoutInput.value),
					method     : methodInput.value,
					keyword    : keywordInput.value,
					query      : queryInput.value,
					rrtype     : rrTypeInput.value,
					httpstatus : [statusCodes[0].checked, statusCodes[1].checked, statusCodes[2].checked, statusCodes[3].checked, statusCodes[4].checked],
					interval   : Math.max(parseInt(intervalInput.value), 5),
					retries    : Math.max(parseInt(retriesInput.value), 0)
				};

				let url = isNew ? "watchdog/create" : `watchdog/create?file=${this.selected.file}`;

				const response = await fetch(url, {
					method: "POST",
					body : JSON.stringify(obj)
				});

				if (response.status !== 200) return;
				
				const json = await response.json();
				if (json.error) throw(json.error);

				if (!isNew) {
					this.list.removeChild(this.selectedElement);
				}
				
				this.CreateWatcherElement(json);
				this.watchers[json.file] = json;
			}
			catch (ex) {
				setTimeout(()=>this.ConfirmBox(ex, true, "mono/error.svg"), 200);
			}

			btnCancel.onclick();
		};

		return dialog;
	}

	NotificationsDialog() {
		const dialog = this.DialogBox("520px");
		if (dialog === null) return;

		const innerBox = dialog.innerBox;
		const btnOK = dialog.btnOK;

	}

	CreateWatcherElement(watcher) {
		const element = document.createElement("div");
		element.className = "list-element";
		this.list.appendChild(element);

		const nameLabel = document.createElement("div");
		nameLabel.style.color = watcher.enable ? "var(--clr-dark)" : "color-mix(in hsl, var(--clr-dark), transparent)";
		nameLabel.textContent = watcher.name;

		const protocol = document.createElement("div");
		protocol.style.backgroundColor = watcher.enable ? "var(--clr-dark)" : "color-mix(in hsl, var(--clr-dark), transparent)";
		protocol.textContent = watcher.type === "TCP" ? `TCP${watcher.port}` : watcher.type;

		const timeline = document.createElement("div");

		element.append(nameLabel, protocol, timeline);

		element.onclick = ()=> {
			for (let i=0; i<this.list.childNodes.length; i++) {
				this.list.childNodes[i].style.background = "";
			}
			element.style.background = "linear-gradient(90deg, var(--clr-select) 0, var(--clr-select) 240px, transparent 300px)";
			this.selected = watcher;
			this.selectedElement = element;
		};

		element.ondblclick = ()=> {
			this.selected = watcher;
			this.selectedElement = element;
			this.EditWatcher(watcher);
		};

		return element;
	}

	EditWatcher() {
		if (this.selected === null) return;
		const dialog = this.WatcherDialog(false);
	}

	DeleteWatcher() {
		if (this.selected === null) return;

		this.ConfirmBox("Are you sure you want to delete this watcher?", false, "mono/delete.svg").addEventListener("click", async ()=> {
			try {
				const response = await fetch(`watchdog/delete?file=${this.selected.file}`);
				
				if (response.status !== 200) return;
				
				const json = await response.json();
				if (json.error) throw(json.error);
				
				this.list.removeChild(this.selectedElement);
				delete this.watchers[this.selected.file];
				this.selected = null;
				this.selectedElement = null;
			}
			catch (ex) {
				this.ConfirmBox(ex, true, "mono/error.svg");
			}
		});
	}

	async Seek() {
		this.DrawTimeline();
		for (let i = 0; i < this.timeline.childNodes.length; i++) {
			if (this.timeline.childNodes[i].tagName != "svg") continue;
			this.timeline.childNodes[i].style.transform = `translateX(${this.offset}px)`;
		}

		let daysInViewport = Math.trunc(this.timeline.offsetWidth / Watchdog.DAY_PIXELS);

		for (let file in this.watchers) {
			let date = this.high;
			if (!this.cache.hasOwnProperty(file)) this.cache[file] = {};
			if (this.cache[file].hasOwnProperty(date)) continue;

			this.cache[file][date] = [];

			let response = await fetch(`watchdog/view?file=${file}&date=${date}`);
			this.cache[file][date] = await response.json();
		}

		const low = this.high - (daysInViewport + this.offset / Watchdog.DAY_PIXELS) * Watchdog.DAY_TICKS;
		//console.log(new Date(low).getDate(), new Date(this.high).getDate());

	}

	DrawTimeline() {
		this.timeline.textContent = "";

		let daysInViewport = Math.ceil(this.timeline.offsetWidth / 480) //480px == a day length

		let low = this.high;
		while (low > this.high - (daysInViewport + this.offset / 480) * Watchdog.DAY_TICKS) {
			//this.GetData(new Date(low));

			let right = (this.high - low) / Watchdog.DAY_TICKS * 480;

			if (right - this.offset <= -480) {
				low -= Watchdog.DAY_TICKS;
				continue;
			}

			const svg = this.GenerateDateSvg(new Date(low));
			svg.style.top = "0";
			svg.style.right = `${right}px`;
			this.timeline.appendChild(svg);

			low -= Watchdog.DAY_TICKS;
		}

		const gradientL = document.createElement("div");
		gradientL.style.position = "absolute";
		gradientL.style.background = "linear-gradient(to right,rgb(64,64,64),transparent)";
		gradientL.style.left = gradientL.style.top = "0";
		gradientL.style.width = "20px";
		gradientL.style.height = "40px";
		this.timeline.appendChild(gradientL);
		const gradientR = document.createElement("div");
		gradientR.style.position = "absolute";
		gradientR.style.background = "linear-gradient(to right,transparent,rgb(64,64,64))";
		gradientR.style.right = gradientR.style.top = "0";
		gradientR.style.width = "20px";
		gradientR.style.height = "40px";
		this.timeline.appendChild(gradientR);
	}

	DrawWatcher(date) {
		//console.log(date);
	}

	GenerateDateSvg(date) {
		const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		svg.setAttribute("width", Watchdog.DAY_PIXELS);
		svg.setAttribute("height", 40);
		svg.style.outline = "none";

		for (let i = 0; i < 25; i++) {
			const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
			dot.setAttribute("cx", i * 20);
			dot.setAttribute("cy", 36);
			dot.setAttribute("r", i % 2 === 0 ? 2 : 1);
			dot.setAttribute("fill", "#C0C0C0");
			svg.appendChild(dot);
		}

		for (let i = 2; i < 24; i += 2) {
			const lblTime = document.createElementNS("http://www.w3.org/2000/svg", "text");
			lblTime.textContent = `${i.toString().padStart(2, "0")}:00`;
			lblTime.setAttribute("x", i * 20);
			lblTime.setAttribute("y", 26);
			lblTime.setAttribute("fill", "#C0C0C0");
			lblTime.setAttribute("text-anchor", "middle");
			lblTime.setAttribute("font-size", "10px");
			//lblTime.style.transformOrigin = `${10 + i*20}px 14px`;
			//lblTime.style.transform = "rotate(-60deg)";
			svg.appendChild(lblTime);
		}

		const l0 = document.createElementNS("http://www.w3.org/2000/svg", "rect");
		l0.setAttribute("x", -9);
		l0.setAttribute("y", 11);
		l0.setAttribute("width", 18);
		l0.setAttribute("height", 3);
		l0.setAttribute("fill", "#C0C0C0");
		svg.appendChild(l0);
		const d0 = document.createElementNS("http://www.w3.org/2000/svg", "rect");
		d0.setAttribute("x", -9);
		d0.setAttribute("y", 11);
		d0.setAttribute("width", 18);
		d0.setAttribute("height", 18);
		d0.style = "stroke:#C0C0C0;stroke-width:2;fill:rgba(0,0,0,0)";
		svg.appendChild(d0);
		const n0 = document.createElementNS("http://www.w3.org/2000/svg", "text");
		n0.textContent = date.getDate();
		n0.setAttribute("x", 0);
		n0.setAttribute("y", 25);
		n0.setAttribute("fill", "#C0C0C0");
		n0.setAttribute("font-size", "11px");
		n0.setAttribute("text-anchor", "middle");
		svg.appendChild(n0);

		if (date.getDate() === 1) {
			const m0 = document.createElementNS("http://www.w3.org/2000/svg", "text");
			m0.textContent = date.toLocaleString(UI.regionalFormat, { month: "short" });
			m0.setAttribute("x", 0);
			m0.setAttribute("y", 7);
			m0.setAttribute("fill", "#C0C0C0");
			m0.setAttribute("font-size", "10px");
			m0.setAttribute("text-anchor", "middle");
			svg.appendChild(m0);
		}

		date.setDate(date.getDate() + 1);

		const l1 = document.createElementNS("http://www.w3.org/2000/svg", "rect");
		l1.setAttribute("x", 471);
		l1.setAttribute("y", 11);
		l1.setAttribute("width", 18);
		l1.setAttribute("height", 3);
		l1.setAttribute("fill", "#C0C0C0");
		svg.appendChild(l1);
		const d1 = document.createElementNS("http://www.w3.org/2000/svg", "rect");
		d1.setAttribute("x", 471);
		d1.setAttribute("y", 11);
		d1.setAttribute("width", 18);
		d1.setAttribute("height", 18);
		d1.style = "stroke:#C0C0C0;stroke-width:2;fill:rgba(0,0,0,0)";
		svg.appendChild(d1);
		const n1 = document.createElementNS("http://www.w3.org/2000/svg", "text");
		n1.textContent = date.getDate();
		n1.setAttribute("x", Watchdog.DAY_PIXELS);
		n1.setAttribute("y", 25);
		n1.setAttribute("fill", "#C0C0C0");
		n1.setAttribute("font-size", "11px");
		n1.setAttribute("text-anchor", "middle");
		svg.appendChild(n1);

		if (date.getDate() === 1) {
			const m1 = document.createElementNS("http://www.w3.org/2000/svg", "text");
			m1.textContent = date.toLocaleString(UI.regionalFormat, { month: "short" });
			m1.setAttribute("x", Watchdog.DAY_PIXELS);
			m1.setAttribute("y", 7);
			m1.setAttribute("fill", "#C0C0C0");
			m1.setAttribute("font-size", "10px");
			m1.setAttribute("text-anchor", "middle");
			svg.appendChild(m1);
		}

		return svg;
	}
}
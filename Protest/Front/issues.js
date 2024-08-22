class Issues extends List {
	static SEVERITY_TEXT = {
		1 : "Info",
		2 : "Warning",
		3 : "Error",
		4 : "Critical",
	};

	static CATEGORY_ICON = {
		"Directory"         : "url(mono/directory.svg)",
		"Password"          : "url(mono/lock.svg)",
		"Printer component" : "url(mono/printer.svg)",
		"CPU usage"         : "url(mono/cpu.svg)",
		"Ram usage"         : "url(mono/ram.svg)",
		"Disk capacity"     : "url(mono/ssd.svg)",
		"Disk IO"           : "url(mono/hdd.svg)",
	};

	constructor(args) {
		super(args);

		this.args = args ?? {
			find: "",
			filter: "",
			sort: "",
			critFilter: true,
			errorFilter: true,
			warnFilter: true,
			infoFilter: false,
		};

		this.SetTitle("Issues");
		this.SetIcon("mono/issues.svg");

		this.AddCssDependencies("list.css");
		this.AddCssDependencies("issues.css");

		const columns = ["severity", "issue", "target", "category", "source"];
		this.SetupColumns(columns);

		this.columnsElements[0].style.width = "10%";

		this.columnsElements[1].style.left = "10%";
		this.columnsElements[1].style.width = "45%";

		this.columnsElements[2].style.left = "55%";
		this.columnsElements[2].style.width = "15%";

		this.columnsElements[3].style.left = "70%";
		this.columnsElements[3].style.width = "15%";

		this.columnsElements[4].style.left = "85%";
		this.columnsElements[4].style.width = "15%";

		this.columnsOptions.style.display = "none";

		this.LinkData({data:[], length:0 });

		this.SetupToolbar();
		this.scanButton = this.AddToolbarButton("Scan network", "mono/scannet.svg?light");
		this.toolbar.appendChild(this.AddToolbarSeparator());
		const filterButton = this.SetupFilter();
		this.SetupFind();
		this.toolbar.appendChild(this.AddToolbarSeparator());

		
		this.critButton = this.AddToolbarButton("Critical", "mono/critical.svg?light");
		this.errorButton = this.AddToolbarButton("Error", "mono/error.svg?light");
		this.warnButton = this.AddToolbarButton("Warning", "mono/warning.svg?light");
		this.infoButton = this.AddToolbarButton("Info", "mono/info.svg?light");
		
		const toggleButtons = [this.critButton, this.errorButton, this.warnButton, this.infoButton];

		for (let i=0; i<toggleButtons.length; i++) {
			toggleButtons[i].style.backgroundSize = "22px 22px";
			toggleButtons[i].style.maskImage = "url(mono/stop.svg)";
			toggleButtons[i].style.maskSize = "34px 34px";
			toggleButtons[i].style.maskPosition = "center";
			toggleButtons[i].style.maskRepeat = "no-repeat";
		}

		this.scanButton.onclick = () => this.ScanDialog();

		this.critButton.onclick  = () => this.CriticalFilterToggle();
		this.errorButton.onclick = () => this.ErrorFilterToggle();
		this.warnButton.onclick  = () => this.WarningFilterToggle();
		this.infoButton.onclick  = () => this.InfoFilterToggle();
	
		if (this.args.find && this.args.find.length > 0) {
			this.findInput.value = this.args.find;
			this.findInput.parentElement.style.borderBottom = this.findInput.value.length === 0 ? "none" : "#c0c0c0 solid 2px";
			this.findInput.parentElement.style.width = "200px";
		}

		this.UpdateFiltersUI();

		this.UpdateAuthorization();
		this.Connect();
	}

	CriticalFilterToggle() {
		this.args.critFilter = !this.args.critFilter;
		this.UpdateFiltersUI();
		this.RefreshList();
	}

	ErrorFilterToggle() {
		this.args.errorFilter = !this.args.errorFilter;
		this.UpdateFiltersUI();
		this.RefreshList();
	}

	WarningFilterToggle() {
		this.args.warnFilter = !this.args.warnFilter;
		this.UpdateFiltersUI();
		this.RefreshList();
	}

	InfoFilterToggle() {
		this.args.infoFilter = !this.args.infoFilter;
		this.UpdateFiltersUI();
		this.RefreshList();
	}

	UpdateFiltersUI() {
		this.critButton.style.backgroundImage  = this.args.critFilter ? "url(mono/critical.svg)" : "url(mono/critical.svg?light)";
		this.errorButton.style.backgroundImage = this.args.errorFilter ? "url(mono/error.svg)" : "url(mono/error.svg?light)";
		this.warnButton.style.backgroundImage  = this.args.warnFilter ? "url(mono/warning.svg)" : "url(mono/warning.svg?light)";
		this.infoButton.style.backgroundImage  = this.args.infoFilter ? "url(mono/info.svg)" : "url(mono/info.svg?light)";

		this.critButton.style.backgroundColor  = this.args.critFilter ? "var(--clr-critical)" : "";
		this.errorButton.style.backgroundColor = this.args.errorFilter ? "var(--clr-error)" : "";
		this.warnButton.style.backgroundColor  = this.args.warnFilter ? "var(--clr-warning)" : "";
		this.infoButton.style.backgroundColor  = this.args.infoFilter ? "rgb(32,148,240)" : "";
	}

	UpdateAuthorization() { //overrides
		this.canWrite = KEEP.authorization.includes("*") || KEEP.authorization.includes("issues:write");
		this.scanButton.disabled = !this.canWrite;
		super.UpdateAuthorization();
	}

	Close() { //overrides
		super.Close();

		if (this.ws != null) {
			try {
				this.ws.close();
			}
			catch (ex) {};
		}
	}

	Connect() {
		let server = window.location.href.replace("https://", "").replace("http://", "");
		if (server.indexOf("/") > 0) server = server.substring(0, server.indexOf("/"));

		if (this.ws != null) {
			try {
				this.ws.close();
			}
			catch (ex) {};
		}

		this.ws = new WebSocket((KEEP.isSecure ? "wss://" : "ws://") + server + "/ws/issues");

		this.ws.onopen = ()=> {};

		this.ws.onmessage = event=> {
			const json = JSON.parse(event.data);
			for (let i=0; i<json.length; i++) {
				this.AddIssue(json[i]);
			}

			if (this.link) {
				this.counter.textContent = this.list.childNodes.length === this.link.length
					? this.link.length
					: `${this.list.childNodes.length} / ${this.link.length}`;
			}
			else {
				this.counter.textContent = "0";
			}
		};

		this.ws.onclose = ()=> {
			this.ws = null;
		};

		this.ws.onerror = error=> {};
	}

	RefreshList() { //overrides
		this.list.textContent = "";

		if (this.link === null || this.link.data === null) { return; }

		let filtered = [];
		if (this.args.filter.length === 0) {
			for (const key in this.link.data) {
				filtered.push(key);
			}
		}
		else {
			for (const key in this.link.data) {
				if (!this.link.data[key].type) continue;
				if (this.link.data[key].type.v.toLowerCase() !== this.args.filter.toLowerCase()) continue;
				filtered.push(key);
			}
		}

		let found;
		if (this.args.find.length === 0) {
			found = filtered;
		}
		else {
			found = [];
			const keywords = this.args.find.toLowerCase().split(" ").filter(o=> o.length > 0);

			for (let i=0; i<filtered.length; i++) {
				let matched = true;

				for (let j=0; j<keywords.length; j++) {
					let wordIncluded = false;
					for (const key in this.link.data[filtered[i]]) {
						const value = this.link.data[filtered[i]][key].v;
						if (typeof value === "string" && value.toLowerCase().includes(keywords[j])) {
							wordIncluded = true;
							break;
						}
					}

					if (!wordIncluded) {
						matched = false;
						break;
					}
				}

				if (matched) {
					found.push(filtered[i]);
				}
			}
		}

		if (this.args.sort.length > 0) {
			const attr = this.args.sort;

			if (this.sortDescend) {
				found = found.sort((a, b)=> {
					if (this.link.data[a][attr] == undefined && this.link.data[b][attr] == undefined) return 0;
					if (this.link.data[a][attr] == undefined) return -1;
					if (this.link.data[b][attr] == undefined) return 1;
					if (this.link.data[a][attr].v < this.link.data[b][attr].v) return 1;
					if (this.link.data[a][attr].v > this.link.data[b][attr].v) return -1;
					return 0;
				});
			}
			else {
				found = found.sort((a, b)=> {
					if (this.link.data[a][attr] == undefined && this.link.data[b][attr] == undefined) return 0;
					if (this.link.data[a][attr] == undefined) return 1;
					if (this.link.data[b][attr] == undefined) return -1;
					if (this.link.data[a][attr].v < this.link.data[b][attr].v) return -1;
					if (this.link.data[a][attr].v > this.link.data[b][attr].v) return 1;
					return 0;
				});
			}
		}
		
		for (let i = 0; i < found.length; i++) {
			this.AddIssueElement(this.link.data[found[i]], found[i]);
		}

		if (this.link) {
			this.counter.textContent = this.list.childNodes.length === this.link.length
				? this.link.length
				: `${this.list.childNodes.length} / ${this.link.length}`;
		}
		else {
			this.counter.textContent = "0";
		}

		this.OnUiReady();
	}

	AddIssue(issue) {
		const key =  Date.now() + Math.random() * 1000;

		const entry = {
			key     : {v: key},
			severity: {v: issue.severity},
			issue   : {v: issue.issue},
			target  : {v: issue.target},
			category: {v: issue.category},
			source  : {v: issue.source},
			isUser  : {v: issue.isUser},
			file    : {v: issue.file},
		};

		this.link.data[key] = entry;
		this.link.length++;

		this.AddIssueElement(entry, key);
	}

	AddIssueElement(entry, key) {
		switch (entry.severity.v) {
		case 1: if (!this.args.infoFilter)  { return; } break;
		case 2: if (!this.args.warnFilter) { return; } break;
		case 3: if (!this.args.errorFilter)  { return; } break;
		case 4: if (!this.args.critFilter)  { return; } break;
		}

		if (!this.MatchFilters(entry)) {
			return;
		}
	
		const element =  document.createElement("div");
		element.id = key;
		element.className = "list-element";
		this.list.appendChild(element);
		this.InflateElement(element, this.link.data[key]);
	}

	ScanDialog(entry=null, isRunning=false) {
		const dialog = this.DialogBox("460px");
		if (dialog === null) return;

		const {okButton, innerBox} = dialog;

		okButton.value = "Start";

		innerBox.parentElement.style.maxWidth = "640px";

		innerBox.style.padding = "16px 32px";
		innerBox.style.display = "grid";
		innerBox.style.gridTemplateColumns = "auto 175px 275px auto";
		innerBox.style.gridTemplateRows = "repeat(4, 38px) 16px repeat(2, 38px) 16px repeat(2, 38px) 40px";
		innerBox.style.alignItems = "center";

		okButton.onclick = async ()=> {
			try {
				const response = await fetch("issues/start");
				if (response.status !== 200) LOADER.HttpErrorHandler(response.status);
	
				const json = await response.json();
				if (json.error) throw(json.error);

				if (this.ws === null) {
					this.Connect();
				}
			}
			catch (ex) {
				this.ConfirmBox(ex, true, "mono/error.svg")
			}

			dialog.Close();
		};

		setTimeout(()=> okButton.focus(), 200);
	}

	InflateElement(element, entry) { //overrides

		element.classList.add("issues-" + Issues.SEVERITY_TEXT[entry.severity.v].toLowerCase());

		const icon = document.createElement("div");
		icon.className = "list-element-icon";
		element.appendChild(icon);

		for (let i = 0; i < this.columnsElements.length; i++) {
			if (!(this.columnsElements[i].textContent in entry)) continue;
			const propertyName = this.columnsElements[i].textContent;

			let value;
			if (propertyName === "severity") {
				value = Issues.SEVERITY_TEXT[entry[propertyName].v];
				icon.style.left = this.columnsElements[i].style.left;
			}
			else {
				value = entry[propertyName].v;
			}

			if (value.length === 0) continue;

			const newAttr = document.createElement("div");
			newAttr.textContent = value;
			element.appendChild(newAttr);

			if (propertyName === "severity") {
				newAttr.style.left = `calc(28px + ${this.columnsElements[i].style.left})`;
				newAttr.style.width = `calc(${this.columnsElements[i].style.width} - 28px)`;
			}
			else if (propertyName === "category") {
				newAttr.style.left = this.columnsElements[i].style.left;
				newAttr.style.width = this.columnsElements[i].style.width;

				newAttr.style.paddingLeft = "24px";
				newAttr.style.backgroundImage = Issues.CATEGORY_ICON[value] ?? "none";
				newAttr.style.backgroundSize = "20px 20px";
				newAttr.style.backgroundPosition = "0px 50%";
				newAttr.style.backgroundRepeat = "no-repeat";
			}
			else if (propertyName === "target") {
				newAttr.style.left = this.columnsElements[i].style.left;
				newAttr.style.width = this.columnsElements[i].style.width;

				newAttr.style.paddingLeft = "24px";
				newAttr.style.backgroundImage = entry.isUser.v ? "url(mono/user.svg)" : "url(mono/gear.svg)";
				newAttr.style.backgroundSize = "20px 20px";
				newAttr.style.backgroundPosition = "0px 50%";
				newAttr.style.backgroundRepeat = "no-repeat";
			}
			else {
				newAttr.style.left = this.columnsElements[i].style.left;
				newAttr.style.width = this.columnsElements[i].style.width;
			}
		}

		element.onclick = ()=> {
			if (this.selected) {
				this.selected.style.backgroundColor = "";
				const lastIconElement = this.selected.querySelector(".list-element-icon");
				if (lastIconElement) {
					lastIconElement.style.backgroundColor = "";
				}
			}

			this.args.select = entry.key.v;
			this.selected = element;
			element.style.backgroundColor = "var(--clr-select)";

			const iconElement = element.querySelector(".list-element-icon");
			if (iconElement) {
				iconElement.style.backgroundColor = "var(--clr-dark)";
			}
		};

		element.ondblclick = event=> {
			event.stopPropagation();
			const file = element.getAttribute("id");
			const entry = this.link.data[file];
			if (entry) {
				if (entry.isUser.v) {
					LOADER.OpenUserByFile(entry.file.v);
				}
				else {
					LOADER.OpenDeviceByFile(entry.file.v);
				}
			}
		};
	}
}
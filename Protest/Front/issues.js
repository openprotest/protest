class Issues extends List {
	static SEVERITY_TEXT = {
		1 : "Info",
		2 : "Warning",
		3 : "Error",
		4 : "Critical",
	};

	static CATEGORY_ICON = {
		//"Network"           : "url(mono/earth.svg)",
		"Database"          : "url(mono/database.svg)",
		"Directory"         : "url(mono/directory.svg)",
		"Password"          : "url(mono/lock.svg)",
		"Round-trip time"   : "url(mono/ping.svg)",
		"CPU utilization"   : "url(mono/cpu.svg)",
		"Memory usage"      : "url(mono/ram.svg)",
		"Disk space"        : "url(mono/hdd.svg)",
		"Disk I/O"          : "url(mono/ssd.svg)",
		"Printer component" : "url(mono/printer.svg)",
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

		this.AddCssDependencies("issues.css");
		this.AddCssDependencies("list.css");

		const columns = ["severity", "issue", "name", "identifier", "category", "source"];
		this.SetupColumns(columns);

		this.columnsElements[0].style.width = "10%";

		this.columnsElements[1].style.left = "10%";
		this.columnsElements[1].style.width = "40%";

		this.columnsElements[2].style.left = "50%";
		this.columnsElements[2].style.width = "20%";

		this.columnsElements[3].style.left = "70%";
		this.columnsElements[3].style.width = "10%";

		this.columnsElements[4].style.left = "80%";
		this.columnsElements[4].style.width = "10%";

		this.columnsElements[5].style.left = "90%";
		this.columnsElements[5].style.width = "10%";

		this.columnsOptions.style.display = "none";

		this.LinkData({data:[], length:0 });

		this.SetupToolbar();
		this.scanButton = this.AddToolbarButton("Scan network", "mono/play.svg?light");
		this.AddToolbarSeparator();
		this.filterButton = this.SetupFilter();
		this.SetupFind();
		this.AddToolbarSeparator();

		this.critButton = this.AddToolbarButton("Critical", "mono/critical.svg?light");
		this.errorButton = this.AddToolbarButton("Error", "mono/error.svg?light");
		this.warnButton = this.AddToolbarButton("Warning", "mono/warning.svg?light");
		this.infoButton = this.AddToolbarButton("Info", "mono/info.svg?light");

		const toggleButtons = [this.critButton, this.errorButton, this.warnButton, this.infoButton];
		for (let i=0; i<toggleButtons.length; i++) {
			toggleButtons[i].classList.add("issues-toggle-button");
		}

		this.statusLabel = document.createElement("div");
		this.statusLabel.className = "issues-status-label";
		this.statusLabel.textContent = "";
		this.content.appendChild(this.statusLabel);

		this.scanButton.onclick = ()=> this.ScanDialog();

		this.critButton.onclick = ()=> this.CriticalFilterToggle();
		this.errorButton.onclick = ()=> this.ErrorFilterToggle();
		this.warnButton.onclick = ()=> this.WarningFilterToggle();
		this.infoButton.onclick = ()=> this.InfoFilterToggle();

		if (this.args.find && this.args.find.length > 0) {
			this.findInput.value = this.args.find;
			this.findInput.parentElement.style.borderBottom = this.findInput.value.length === 0 ? "none" : "#c0c0c0 solid 2px";
			this.findInput.parentElement.style.width = "200px";
		}

		this.UpdateFiltersUI();

		this.UpdateAuthorization();
		this.Connect();
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
			catch {}
		}
	}

	RefreshList() { //overrides
		this.list.textContent = "";

		if (this.link === null || this.link.data === null) { return; }

		let filtered = [];
		for (const key in this.link.data) {
			filtered.push(key);
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

	SetupFilter() { //overrides
		if (!this.toolbar) return null;

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

		const ClearSelection = ()=> filtersList.childNodes.forEach(o=> o.style.backgroundColor = "");

		const Refresh = ()=> {
			let types = Object.keys(Issues.CATEGORY_ICON);

			filtersList.textContent = "";
			filterMenu.style.height = `${32 + types.length * 34}px`;

			for (let i = 0; i < types.length; i++) {
				const newType = document.createElement("div");
				newType.style.textTransform = "none";
				newType.textContent = types[i];
				filtersList.appendChild(newType);

				newType.style.backgroundImage = Issues.CATEGORY_ICON[types[i]];

				if (types[i] === this.args.filter) {
					newType.style.backgroundColor = "var(--clr-select)";
					filterButton.style.borderBottom = "#c0c0c0 solid 3px";
				}

				newType.onclick = ()=> {
					ClearSelection();

					if (this.args.filter === types[i]) {
						this.args.filter = "";
						filterButton.style.borderBottom = "";
					}
					else {
						this.args.filter = types[i];
						filterButton.style.borderBottom = "#c0c0c0 solid 3px";
						newType.style.backgroundColor = "var(--clr-select)";
					}

					this.RefreshList();
				};
			}
		};

		filterInput.onchange = filterInput.oninput = ()=> Refresh();

		filterInput.onkeydown = event=> {
			if (event.key === "Escape") {
				filterInput.value = "";
				filterInput.onchange();
			}
		};

		filterButton.onclick = ()=> setTimeout(filterInput.focus(), 200);

		filterButton.ondblclick = ()=> {
			this.args.filter = "";
			filterButton.style.borderBottom = "";
			ClearSelection();
			this.RefreshList();

		};

		filterButton.onfocus = ()=> {
			if (this.popOutWindow) {
				filterButton.firstChild.style.maxHeight = this.content.clientHeight - 32 + "px";
			}
			else {
				filterButton.firstChild.style.maxHeight = container.clientHeight - this.win.offsetTop - 96 + "px";
			}
		};

		filterMenu.onclick = filterMenu.ondblclick = event=> {
			event.stopPropagation();
		};

		Refresh();

		return filterButton;
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
		this.critButton.style.backgroundImage = this.args.critFilter ? "url(mono/critical.svg)" : "url(mono/critical.svg?light)";
		this.errorButton.style.backgroundImage = this.args.errorFilter ? "url(mono/error.svg)" : "url(mono/error.svg?light)";
		this.warnButton.style.backgroundImage = this.args.warnFilter ? "url(mono/warning.svg)" : "url(mono/warning.svg?light)";
		this.infoButton.style.backgroundImage = this.args.infoFilter ? "url(mono/info.svg)" : "url(mono/info.svg?light)";

		this.critButton.style.backgroundColor = this.args.critFilter ? "var(--clr-critical)" : "";
		this.errorButton.style.backgroundColor = this.args.errorFilter ? "var(--clr-error)" : "";
		this.warnButton.style.backgroundColor = this.args.warnFilter ? "var(--clr-warning)" : "";
		this.infoButton.style.backgroundColor = this.args.infoFilter ? "rgb(32,148,240)" : "";
	}

	Connect() {
		let server = window.location.href.replace("https://", "").replace("http://", "");
		if (server.indexOf("/") > 0) server = server.substring(0, server.indexOf("/"));

		if (this.ws != null) {
			try {
				this.ws.close();
			}
			catch {}
		}

		this.ws = new WebSocket((KEEP.isSecure ? "wss://" : "ws://") + server + "/ws/issues");

		this.ws.onopen = ()=> {
			this.scanButton.disabled = true;
			this.statusLabel.textContent = "Scanning...";
			this.statusLabel.classList.add("list-working-spinner");
		};

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
			this.scanButton.disabled = false;
			this.statusLabel.textContent = "";
			this.statusLabel.classList.remove("list-working-spinner");
			this.ws = null;
		};

		this.ws.onerror = error=> {};
	}

	AddIssue(issue) {
		const key = Date.now() + Math.random() * 1000;

		const newIssue = {
			key       : {v:key},
			severity  : {v:issue.severity},
			issue     : {v:issue.issue},
			name      : {v:issue.name},
			identifier: {v:issue.identifier},
			type      : {v:issue.category},
			category  : {v:issue.category},
			source    : {v:issue.source},
			isUser    : {v:issue.isUser},
			file      : {v:issue.file},
		};

		this.link.data[key] = newIssue;
		this.link.length++;

		this.AddIssueElement(newIssue, key);
	}

	AddIssueElement(issue, key) {
		switch (issue.severity.v) {
		case 1: if (!this.args.infoFilter)  { return; } break;
		case 2: if (!this.args.warnFilter) { return; } break;
		case 3: if (!this.args.errorFilter)  { return; } break;
		case 4: if (!this.args.critFilter)  { return; } break;
		}

		if (!this.MatchFilters(issue)) {
			return;
		}

		const element = document.createElement("div");
		element.id = key;
		element.className = "list-element";
		this.list.appendChild(element);
		this.InflateElement(element, this.link.data[key]);
	}

	ScanDialog() {
		const okButton = this.ConfirmBox("Are you sure you want to start scanning for issues?", false, "mono/issues.svg");
		okButton.value = "Start";

		okButton.addEventListener("click", async ()=> {
			try {
				const response = await fetch("issues/start");
				if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

				const json = await response.json();
				if (json.error) throw(json.error);

				if (json.status === "started") {
					this.list.textContent = "";
					this.link.data = [];
					this.link.length = 0;
				}

				if (this.ws === null) {
					this.Connect();
				}
			}
			catch (ex) {
				this.ConfirmBox(ex, true, "mono/error.svg")
			}
		});
	}

	InflateElement(element, issue) { //overrides
		element.classList.add("issues-" + Issues.SEVERITY_TEXT[issue.severity.v].toLowerCase());

		const icon = document.createElement("div");
		icon.className = "list-element-icon";
		element.appendChild(icon);

		for (let i=0; i<this.columnsElements.length; i++) {
			if (!(this.columnsElements[i].textContent in issue)) continue;
			const propertyName = this.columnsElements[i].textContent;

			let value;
			if (propertyName === "severity") {
				value = Issues.SEVERITY_TEXT[issue[propertyName].v];
				icon.style.left = this.columnsElements[i].style.left;
			}
			else {
				value = issue[propertyName].v;
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
			else if (propertyName === "identifier") {
				newAttr.style.left = this.columnsElements[i].style.left;
				newAttr.style.width = this.columnsElements[i].style.width;

				newAttr.style.paddingLeft = "24px";
				newAttr.style.backgroundImage = issue.isUser.v ? "url(mono/user.svg)" : "url(mono/gear.svg)";
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
			}

			this.args.select = issue.key.v;
			this.selected = element;
			element.style.backgroundColor = "var(--clr-select)";
		};

		element.ondblclick = event=> {
			event.stopPropagation();
			const file = element.getAttribute("id");
			const selectedIssue = this.link.data[file];
			if (selectedIssue) {
				if (selectedIssue.isUser.v) {
					LOADER.OpenUserByFile(selectedIssue.file.v);
				}
				else {
					LOADER.OpenDeviceByFile(selectedIssue.file.v);
				}
			}
		};
	}
}

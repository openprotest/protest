class Issues extends List {

	static SEVERITY_TEXT = {
		1 : "Info",
		2 : "Warning",
		3 : "Error",
		4 : "Critical",
	};

	static SEVERITY_ICON = {
		1 : "url(mono/info.svg)",
		2 : "url(mono/warning.svg)",
		3 : "url(mono/error.svg)",
		4 : "url(mono/critical.svg)",
	};

	static SEVERITY_COLOR = {
		1 : "var(--clr-dark)",
		2 : "rgb(240,140,8)",
		3 : "var(--clr-error)",
		4 : "var(--clr-critical)",
	};

	static CATEGORY_ICON = {
		"Password"          : "url(mono/lock.svg)",
		"Printer component" : "url(mono/printer.svg)",
		"CPU usage"         : "url(mono/cpu.svg)",
		"Ram usage"         : "url(mono/ram.svg)",
		"Disk capacity"     : "url(mono/ssd.svg)",
		"Disk IO"           : "url(mono/hdd.svg)",
	};

	constructor() {
		super();

		this.AddCssDependencies("list.css");

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

		this.SetTitle("Issues");
		this.SetIcon("mono/issues.svg");

		this.LinkData({data:[], length:0 });

		this.SetupToolbar();
		this.reloadButton = this.AddToolbarButton("Reload", "mono/restart.svg?light");
		this.scanButton = this.AddToolbarButton("Scan network", "mono/scannet.svg?light");
		this.toolbar.appendChild(this.AddToolbarSeparator());
		const filterButton = this.SetupFilter();
		this.SetupFind();

		this.scanButton.onclick = () => this.ScanDialog();
	
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
		};

		this.ws.onclose = ()=> {
			this.ws = null;
		};

		this.ws.onerror = error=> {};
	}

	AddIssue(issue) {
		const key =  Date.now() + Math.random() * 1000;

		const element =  document.createElement("div");
		element.id = key;
		element.className = "list-element";
		this.list.appendChild(element);

		this.link.data[key] = {
			key: key,
			severity: {v: issue.severity},
			issue   : {v: issue.issue},
			target  : {v: issue.target},
			category: {v: issue.category},
			source  : {v: issue.source},
			isUser  : {v: issue.isUser},
		};

		this.InflateElement(element, this.link.data[key]);
		this.link.length++;

		if (this.link) {
			this.counter.textContent = this.list.childNodes.length === this.link.length
				? this.link.length
				: `${this.list.childNodes.length} / ${this.link.length}`;
		}
		else {
			this.counter.textContent = "0";
		}
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
		const icon = document.createElement("div");
		icon.className = "list-element-icon";
		icon.style.maskSize = "24px 24px";
		icon.style.maskPosition = "center";
		icon.style.maskRepeat = "no-repeat";
		icon.style.maskImage = Issues.SEVERITY_ICON[entry.severity.v] ?? "url(mono/critical.svg)";
		icon.style.backgroundColor = Issues.SEVERITY_COLOR[entry.severity.v] ?? "var(--clr-dark)";
		icon.style.filter = "brightness(0.85)";
		element.appendChild(icon);

		for (let i = 0; i < this.columnsElements.length; i++) {
			if (!(this.columnsElements[i].textContent in entry)) continue;
			const propertyName = this.columnsElements[i].textContent;

			let value;
			if (propertyName === "severity") {
				value = Issues.SEVERITY_TEXT[entry[this.columnsElements[i].textContent].v];
				icon.style.left = this.columnsElements[i].style.left;
			}
			else {
				value = entry[this.columnsElements[i].textContent].v
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
			else {
				newAttr.style.left = this.columnsElements[i].style.left;
				newAttr.style.width = this.columnsElements[i].style.width;
			}
		}

		element.onclick = ()=> {
			if (this.selected) this.selected.style.backgroundColor = "";

			this.args.select = entry.key;

			this.selected = element;
			element.style.backgroundColor = "var(--clr-select)";
		};

		element.ondblclick = ()=> {

		};
	}
}
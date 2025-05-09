class Snmp extends Window {
	constructor(args) {
		super();

		this.AddCssDependencies("snmp.css");

		this.args = args ?? { target: "", community:"", oid: "" };

		this.SetTitle("SNMP pooling");
		this.SetIcon("mono/snmp.svg");

		this.knownOids = {};
		this.GetOIDs();

		this.content.style.overflow = "hidden";

		const snmpInput = document.createElement("div");
		snmpInput.className = "snmp-input";
		this.content.appendChild(snmpInput);

		const targetLabel = document.createElement("div");
		targetLabel.style.lineHeight = "28px";
		targetLabel.style.gridArea = "1 / 1";
		targetLabel.textContent = "Target:";
		snmpInput.appendChild(targetLabel);

		this.targetInput = document.createElement("input");
		this.targetInput.type = "text";
		this.targetInput.placeholder = "hostname or ip";
		this.targetInput.style.gridArea = "1 / 2 / 1 / 4";
		this.targetInput.style.minWidth = "50px";
		this.targetInput.value = this.args.target ?? "";
		snmpInput.appendChild(this.targetInput);

		const authLabel = document.createElement("div");
		authLabel.style.lineHeight = "28px";
		authLabel.style.gridArea = "2 / 1";
		authLabel.textContent = "Community:";
		snmpInput.appendChild(authLabel);

		this.communityInput = document.createElement("input");
		this.communityInput.type = "text";
		this.communityInput.placeholder = "public";
		this.communityInput.style.gridArea = "2 / 2";
		this.communityInput.style.marginRight = "0";
		this.communityInput.style.minWidth = "50px";
		this.communityInput.value = this.args.community;
		snmpInput.appendChild(this.communityInput);

		this.credentialsProfileInput = document.createElement("select");
		this.credentialsProfileInput.style.gridArea = "2 / 2";
		this.credentialsProfileInput.style.marginRight = "0";
		this.credentialsProfileInput.style.minWidth = "50px";
		this.credentialsProfileInput.style.display = "none";
		snmpInput.appendChild(this.credentialsProfileInput);

		this.versionInput = document.createElement("select");
		this.versionInput.style.gridArea = "2 / 3";
		if (this.args.version) this.versionInput.value = this.args.version;
		snmpInput.appendChild(this.versionInput);

		const versionOptions = [1,2,3];
		for (let i=0; i<versionOptions.length; i++) {
			const option = document.createElement("option");
			option.value = versionOptions[i];
			option.textContent = `Version ${versionOptions[i]}`;
			this.versionInput.appendChild(option);
		}

		this.versionInput.value = this.args.version ?? 2;

		const oidLabel = document.createElement("div");
		oidLabel.style.lineHeight = "28px";
		oidLabel.style.gridArea = "3 / 1";
		oidLabel.textContent = "OID:";
		snmpInput.appendChild(oidLabel);

		this.oidInput = document.createElement("textarea");
		this.oidInput.placeholder = "1.3.6.1.2.1.1.1.0";
		this.oidInput.style.gridArea = "3 / 2 / 5 / 4";
		this.oidInput.style.resize = "none";
		this.oidInput.style.minWidth = "50px";
		this.oidInput.value = this.args.oid ?? "";
		snmpInput.appendChild(this.oidInput);

		this.getButton = document.createElement("input");
		this.getButton.type = "button";
		this.getButton.value = "Get";
		this.getButton.style.minWidth = "40px";
		this.getButton.style.height = "auto";
		this.getButton.style.gridArea = "3 / 4 / 5 / 4";
		this.getButton.style.padding = "0";
		snmpInput.appendChild(this.getButton);

		this.setButton = document.createElement("input");
		this.setButton.type = "button";
		this.setButton.value = "Set";
		this.setButton.style.minWidth = "40px";
		this.setButton.style.height = "auto";
		this.setButton.style.gridArea = "3 / 5 / 5 / 5";
		this.setButton.style.padding = "0";
		snmpInput.appendChild(this.setButton);

		this.walkButton = document.createElement("input");
		this.walkButton.type = "button";
		this.walkButton.value = "Walk";
		this.walkButton.style.minWidth = "40px";
		this.walkButton.style.height = "auto";
		this.walkButton.style.gridArea = "3 / 6 / 5 / 6";
		this.walkButton.style.padding = "0";
		snmpInput.appendChild(this.walkButton);

		const toggleButton = document.createElement("input");
		toggleButton.type = "button";
		toggleButton.className = "snmp-toggle-button";
		this.content.appendChild(toggleButton);

		this.plotBox = document.createElement("div");
		this.plotBox.className = "snmp-plot no-results";
		this.content.appendChild(this.plotBox);

		this.targetInput.oninput = ()=> { this.args.target = this.targetInput.value };
		this.communityInput.oninput = ()=> { this.args.community = this.communityInput.value };
		this.credentialsProfileInput.onchange = ()=> { this.args.credentials = this.credentialsProfileInput.value };
		this.oidInput.oninput = ()=> { this.args.oid = this.oidInput.value };

		this.versionInput.onchange = ()=> {
			this.args.version = this.versionInput.value;

			if (this.versionInput.value == 3) {
				authLabel.textContent = "Profile:";
				this.credentialsProfileInput.style.display = "block";
			}
			else {
				authLabel.textContent = "Community:";
				this.credentialsProfileInput.style.display = "none";
			}
		};

		this.getButton.onclick = ()=> { this.GetQuery() };
		this.setButton.onclick = ()=> { this.SetQueryDialog() };
		this.walkButton.onclick = ()=> { this.WalkQuery() };

		toggleButton.onclick = ()=> {
			if (snmpInput.style.visibility === "hidden") {
				toggleButton.style.top = "96px";
				toggleButton.style.transform = "rotate(-180deg)";
				snmpInput.style.visibility = "visible";
				snmpInput.style.opacity = "1";
				snmpInput.style.transform = "none";
				this.plotBox.style.top = "136px";
				this.args.hideInput = false;
			}
			else {
				toggleButton.style.top = "0px";
				toggleButton.style.transform = "rotate(0deg)";
				snmpInput.style.visibility = "hidden";
				snmpInput.style.opacity = "0";
				snmpInput.style.transform = "translateY(-64px)";
				this.plotBox.style.top = "36px";
				this.args.hideInput = true;
			}
		};

		if (this.args.hideInput) {
			toggleButton.onclick();
		}

		this.versionInput.onchange();
		this.GetSnmpProfiles();
	}

	async GetOIDs() {
		try {
			const response = await fetch("snmpoid.json");
			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const json = await response.json();
			if (json.error) throw(json.error);

			this.knownOids = json;
		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/error.svg");
		}
	}
	
	async GetSnmpProfiles() {
		try {
			const response = await fetch("config/snmpprofiles/list");

			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const json = await response.json();
			if (json.error) throw(json.error);

			this.snmpProfiles = json;

			for (let i = 0; i < json.length; i++) {
				if (json[i].version !== 3) continue;
				const option = document.createElement("option");
				option.value = json[i].guid;
				option.textContent = json[i].name;
				this.credentialsProfileInput.appendChild(option);
			}
		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/error.svg");
		}
	}

	async GetQuery() {
		this.oidInput.placeholder = "1.3.6.1.2.1.1.1.0";

		let oid = this.oidInput.value.trim();
		if (oid.length === 0) oid = "1.3.6.1.2.1.1.1.0";

		if (this.targetInput.value.length == 0) {
			this.ConfirmBox("Incomplete query.", true);
			return;
		}

		const spinner = document.createElement("div");
		spinner.className = "spinner";
		spinner.style.textAlign = "left";
		spinner.style.marginTop = "160px";
		spinner.style.marginBottom = "32px";
		spinner.appendChild(document.createElement("div"));
		this.content.appendChild(spinner);

		this.targetInput.value = this.targetInput.value.trim();
		this.getButton.disabled = true;
		this.setButton.disabled = true;
		this.walkButton.disabled = true;
		this.plotBox.style.display = "none";
		this.plotBox.textContent = "";

		try {
			let url;
			if (this.versionInput.value==3) {
				url = `snmp/get?target=${encodeURIComponent(this.targetInput.value)}&ver=3&cred=${this.credentialsProfileInput.value}`;
			}
			else {
				url = `snmp/get?target=${encodeURIComponent(this.targetInput.value)}&ver=${this.versionInput.value}&community=${encodeURIComponent(this.communityInput.value)}`;
			}

			const response = await fetch(url, {
				method: "POST",
				body: oid
			});

			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const json = await response.json();
			if (json.error) throw(json.error);

			if (json instanceof Array) {
				this.PlotTree(json);
			}
		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/error.svg");
		}
		finally {
			this.getButton.disabled = false;
			this.setButton.disabled = false;
			this.walkButton.disabled = false;
			this.plotBox.style.display = "block";
			this.content.removeChild(spinner);
		}
	}

	async SetQuery(value) {
		const spinner = document.createElement("div");
		spinner.className = "spinner";
		spinner.style.textAlign = "left";
		spinner.style.marginTop = "160px";
		spinner.style.marginBottom = "32px";
		spinner.appendChild(document.createElement("div"));
		this.content.appendChild(spinner);

		this.targetInput.value = this.targetInput.value.trim();
		this.getButton.disabled = true;
		this.setButton.disabled = true;
		this.walkButton.disabled = true;
		this.plotBox.style.display = "none";
		this.plotBox.textContent = "";

		try {
			let url;
			if (this.versionInput.value==3) {
				url = `snmp/set?target=${encodeURIComponent(this.targetInput.value)}&ver=3&cred=${this.credentialsProfileInput.value}&value=${encodeURIComponent(value)}`;
			}
			else {
				url = `snmp/set?target=${encodeURIComponent(this.targetInput.value)}&ver=${this.versionInput.value}&community=${encodeURIComponent(this.communityInput.value)}&value=${encodeURIComponent(value)}`;
			}

			const response = await fetch(url, {
				method: "POST",
				body: this.oidInput.value.trim()
			});

			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const json = await response.json();
			if (json.error) throw(json.error);

			if (json instanceof Array) {
				this.PlotTree(json);
			}
		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/error.svg");
		}
		finally {
			this.getButton.disabled = false;
			this.setButton.disabled = false;
			this.walkButton.disabled = false;
			this.plotBox.style.display = "block";
			this.content.removeChild(spinner);
		}
	}

	async SetQueryDialog() {
		if (this.targetInput.value.length == 0 || this.oidInput.value.length == 0) {
			this.ConfirmBox("Incomplete query.", true);
			return;
		}

		const dialog = this.DialogBox("108px");
		if (dialog === null) return;

		dialog.innerBox.parentElement.style.maxWidth = "400px";
		dialog.innerBox.style.textAlign = "center";

		const valueInput = document.createElement("input");
		valueInput.type = "text";
		valueInput.placeholder = "value";
		valueInput.style.marginTop = "20px";
		valueInput.style.width = "min(calc(100% - 8px), 200px)";
		dialog.innerBox.appendChild(valueInput);

		valueInput.focus();
		valueInput.select();

		dialog.okButton.onclick = ()=> {
			dialog.cancelButton.onclick();

			setTimeout(()=> {
				this.SetQuery(valueInput.value);
			}, 400);
		};

		valueInput.onkeydown = event=> {
			if (event.key === "Enter") {
				dialog.okButton.click();
			}
		}
	}

	async WalkQuery() {
		this.oidInput.placeholder = "1.3.6.1.2.1.1";

		let oid = this.oidInput.value.trim();
		if (oid.length === 0) oid = "1.3.6.1.2.1.1";
		
		if (this.targetInput.value.length == 0 || oid.length == 0) {
			this.ConfirmBox("Incomplete query.", true);
			return;
		}

		const spinner = document.createElement("div");
		spinner.className = "spinner";
		spinner.style.textAlign = "left";
		spinner.style.marginTop = "160px";
		spinner.style.marginBottom = "32px";
		spinner.appendChild(document.createElement("div"));
		this.content.appendChild(spinner);

		this.getButton.disabled = true;
		this.setButton.disabled = true;
		this.walkButton.disabled = true;
		this.plotBox.style.display = "none";
		this.plotBox.textContent = "";

		try {
			let url;
			if (this.versionInput.value==3) {
				url = `snmp/walk?target=${encodeURIComponent(this.targetInput.value)}&ver=3&cred=${this.credentialsProfileInput.value}`;
			}
			else {
				url = `snmp/walk?target=${encodeURIComponent(this.targetInput.value)}&ver=${this.versionInput.value}&community=${encodeURIComponent(this.communityInput.value)}`;
			}

			const response = await fetch(url, {
				method: "POST",
				body: oid
			});

			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const json = await response.json();
			if (json.error) throw(json.error);

			if (json instanceof Array) {
				this.PlotTree(json);
			}
		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/error.svg");
		}
		finally {
			this.getButton.disabled = false;
			this.setButton.disabled = false;
			this.walkButton.disabled = false;
			this.plotBox.style.display = "block";
			this.content.removeChild(spinner);
		}
	}

	ComputeCommonPrefix(parts) {
		if (parts.length === 0) return '';
		let prefix = [];
		for (let i=0; i<parts[0].length; i++) {
			const token = parts[0][i];
			if (parts.every(o=> o[i]===token)) {
				prefix.push(token);
			}
			else {
				break;
			}
		}
	
		return prefix.join('.');
	}

	PlotTree(array) {
		this.containerMap = {};

		const parts = array.map(o=> o[0].split(".").map(p=> parseInt(p)));
		const commonPrefix = this.ComputeCommonPrefix(parts);
		const commonPrefixDepth = commonPrefix.split(".").length;

		const root = this.CreateContainer(commonPrefix);
		root.hLine.style.display = "none";
		this.plotBox.appendChild(root.container);
		this.containerMap[commonPrefix] = root;

		this.ToggleContainer(root);

		for (let i=0; i<array.length; i++) {
			const [oid, type, value] = array[i];

			for (let j=commonPrefixDepth; j<parts[i].length; j++) {
				const ancestor = parts[i].slice(0, j).join(".");

				if (!(ancestor in this.containerMap) && ancestor in this.knownOids) {
					const container = this.CreateContainer(ancestor);
					this.containerMap[ancestor] = container;

					const parentOid = parts[i].slice(0, j - 1).join(".");
					const parentContainer = this.containerMap[parentOid] || root;

					parentContainer.subbox.appendChild(container.container);
					parentContainer.counter.textContent = parentContainer.subbox.childNodes.length;
				}
			}

			for (let j=parts[i].length; j>commonPrefixDepth-1; j--) {
				const ancestor = parts[i].slice(0, j).join(".");
				if (ancestor in this.containerMap) {
					const container = this.containerMap[ancestor];
					const item = this.CreateListItem(oid, type, value, ancestor);
					container.subbox.appendChild(item);
					container.counter.textContent = container.subbox.childNodes.length;
					break;
				}
			}
		}

		for (const key in this.containerMap) {
			const container = this.containerMap[key];
			if (container.subbox.childNodes.length === 1) {
				this.ToggleContainer(container);
			}
		}
	}

	CreateListItem(oid, type, value, nearestAncestor) {
		const element = document.createElement("div");
		element.className = "snmp-list-item";
		element.onmousedown = event=> this.ListElement_onclick(event);

		const oidBox = document.createElement("div");
		oidBox.textContent = oid;
		element.appendChild(oidBox);

		const typeBox = document.createElement("div");
		typeBox.textContent = type;
		element.appendChild(typeBox);

		const valueBox = document.createElement("div");
		valueBox.textContent = value;
		element.appendChild(valueBox);

		const hLine = document.createElement("div");
		hLine.className = "snmp-tree-hline";
		element.appendChild(hLine);

		const dot = document.createElement("div");
		dot.className = "snmp-tree-dot";
		element.appendChild(dot);

		if (nearestAncestor in this.knownOids && this.knownOids[nearestAncestor].length > 2 && this.knownOids[nearestAncestor][2][value]) {
			const stringValue = document.createElement("div");
			stringValue.textContent = this.knownOids[nearestAncestor][2][value];
			valueBox.appendChild(stringValue);
		}

		return element;
	}

	CreateContainer(oid) {
		const container = document.createElement("div");
		container.className = "snmp-container";

		const expandButton = document.createElement("div");
		expandButton.className = "snmp-expand";
		container.appendChild(expandButton);

		const item = document.createElement("div");
		item.className = "snmp-container-item";
		container.appendChild(item);

		const oidBox = document.createElement("div")
		oidBox.textContent = oid;
		item.appendChild(oidBox);

		const counter = document.createElement("div");
		counter.textContent = "0";
		oidBox.appendChild(counter);

		if (oid in this.knownOids) {
			const nameBox = document.createElement("div")
			nameBox.textContent = this.knownOids[oid][0];
			item.appendChild(nameBox);
		}

		const subbox = document.createElement("div");
		subbox.className = "snmp-container-sub";
		subbox.style.display = "none";
		container.appendChild(subbox);

		const hLine = document.createElement("div");
		hLine.className = "snmp-tree-hline";
		container.appendChild(hLine);

		const vLine = document.createElement("div");
		vLine.className = "snmp-tree-vline";
		container.appendChild(vLine);

		const object = {
			container: container,
			subbox: subbox,
			counter: counter,
			hLine: hLine,
			vLine: vLine,
		};

		expandButton.onclick = ()=> this.ToggleContainer(object);
		item.ondblclick = ()=> this.ToggleContainer(object);

		return object;
	}

	ToggleContainer(container) {
		if (container.subbox.style.display === "none") {
			container.container.firstChild.style.transform = "translate(8px, 6px) rotate(0deg)";
			container.subbox.style.display = "block";
		}
		else {
			container.container.firstChild.style.transform = "translate(8px, 6px) rotate(-90deg)";
			container.subbox.style.display = "none";
		}
	}

	ListElement_onclick(event) {
		if (this.selected) {
			this.selected.style.backgroundColor = "";
		}

		/*let target = event.target;
		while (target.parentElement != this.plotBox) {
			target = target.parentElement;
		}

		target.style.backgroundColor = "var(--clr-select)";
		this.selected = target;*/
	}
}
class Snmp extends Window {

static OID_CACHE = {};

static OID_MAP_1_0_8802 = [
	"1", "16", "17"
];

static OID_MAP_1_3_6_1_2_1 = [
"1","2","3","4","6","9",
"10","11","12","13","14","15","16","17","18","19",
"20","21","22","23","24","25","26","27","28","29",
"30","31","32","33","34","35","36","37","38","39",
"40","41","42","43","44","45","46","47","48","49",
"50","51","52","53","54","55","56","57","58","59",
"60","61","62","63","64","65","66","67","68","69",
"70","71","72","73","74","75","76","77","78","79",
"80","81","82","83","84","85","86","87","88","89",
"90","91","92","93","94","95","96","97","98","99",
"100","101","102","103","104","105","106","107","108","109",
"110","111","112","113","114","115","116","117","118","119",
"120","121","122","123","124","125","126","127","128","129",
"130","131","132","133","134","135","136","137","138","139",
"140","141","142","143","144","145","146","147","148","149",
"158","159",
"160","161","162","163","164","165","166","167","168","169",
"170","171","172","173","174","175","176","177","178","179",
"180","181","182","183","184","185","186","187","188","189",
"190","191","192","193","194","195","196","197","198","199",
"200","201","202","203","204","205","206","207","208","209",
"210","211","212","213","214","215","216","217","218","219",
"220","221","222","223","224","225","226","227","228","229",
"230","231","232","233","234","235","777",
"999",
"8888","8889",
"9990","9991","9992","9998","9999",
"12345","12346",
"67890",
"22222222"
];

	constructor(args) {
		super();

		this.AddCssDependencies("snmp.css");

		this.args = args ?? { target: "", community:"", oid:"" };

		this.SetTitle("SNMP pooling");
		this.SetIcon("mono/snmp.svg");

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

		this.explorerButton = document.createElement("input");
		this.explorerButton.type = "button";
		this.explorerButton.value = "...";
		this.explorerButton.style.minWidth = "40px";
		this.explorerButton.style.height = "auto";
		this.explorerButton.style.gridArea = "2 / 4";
		this.explorerButton.style.padding = "0";
		//snmpInput.appendChild(this.explorerButton);

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
		this.plotBox.tabIndex = 0;
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

		this.explorerButton.onclick = ()=> this.OidExplorer();
		this.getButton.onclick = ()=> this.GetQuery();
		this.setButton.onclick = ()=> this.SetQueryDialog();
		this.walkButton.onclick = ()=> this.WalkQuery();

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

		this.plotBox.onkeydown = event=> this.PlotBox_onkeypress(event);

		if (this.args.hideInput) {
			toggleButton.onclick();
		}

		this.versionInput.onchange();
		this.GetSnmpProfiles();
	}

	async GetOid(oid) {
		if (oid.startsWith(".")) oid = oid.substring(1);

		if (oid.startsWith("1.0.8802.")) {
			const iso8802 = oid.substring(9).split(".")[0];

			if (!(iso8802 in Snmp.OID_MAP_1_0_8802)) return null;

			const filename = `1.0.8802.${iso8802}`;

			if (!(filename in Snmp.OID_CACHE)) {
				try {
					const response = await fetch(`snmp/1.0.8802.${iso8802}.json`);
					if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

					const json = await response.json();
					if (json.error) throw(json.error);

					for (const key in json) {
						Snmp.OID_CACHE[`${filename}${key}`] = json[key];
					}
				}
				catch (ex) {
					this.ConfirmBox(ex, true, "mono/error.svg");
				}
			}

		}
		else if (oid.startsWith("1.3.6.1.2.1.")) {
			const mib2 = oid.substring(12).split(".")[0];

			if (!(mib2 in Snmp.OID_MAP_1_3_6_1_2_1)) return null;

			const filename = `1.3.6.1.2.1.${mib2}`;
			if (!(filename in Snmp.OID_CACHE)) {
				try {
					const response = await fetch(`snmp/1.3.6.1.2.1.${mib2}.json`);
					if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

					const json = await response.json();
					if (json.error) throw(json.error);

					for (const key in json) {
						Snmp.OID_CACHE[`${filename}${key}`] = json[key];
					}
				}
				catch (ex) {
					this.ConfirmBox(ex, true, "mono/error.svg");
				}
			}
		}

		//return oid in Snmp.OID_CACHE ? Snmp.OID_CACHE[oid] : null;
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

			if (this.args.profile) {
				for (let i = 0; i < json.length; i++) {
					if (json[i].guid != this.args.profile) continue;

					this.communityInput.value = json[i].community;
					this.versionInput.value = json[i].version;
					this.versionInput.onchange();

					if (json[i].version===3) {
						this.credentialsProfileInput.value = json[i].guid;
					}

					break;
				}
			}
		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/error.svg");
		}
	}

	async OidExplorer() {
		const dialog = this.DialogBox("640px");
		if (dialog === null) return;

		const {okButton, innerBox} = dialog;

		okButton.addEventListener("click", ()=> {
			this.oidInput.value = "";
			this.args.oid = "";
		});
	}

	async GetQuery() {
		this.oidInput.placeholder = "1.3.6.1.2.1.1.1.0";

		let oid = this.oidInput.value.trim();
		if (oid.length === 0) oid = "1.3.6.1.2.1.1.1.0";

		if (this.targetInput.value.length === 0) {
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

		await this.GetOid(oid);

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

		await this.GetOid(this.oidInput.value.trim());

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
		if (this.targetInput.value.length === 0 || this.oidInput.value.length === 0) {
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

		if (this.targetInput.value.length === 0 || oid.length === 0) {
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

		await this.GetOid(oid);

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

		for (let i=0; i<array.length; i++) {
			const [oid, type, value] = array[i];

			for (let j=commonPrefixDepth; j<=parts[i].length; j++) {
				const ancestor = parts[i].slice(0, j).join(".");

				if (ancestor in this.containerMap) continue;

				if (ancestor in Snmp.OID_CACHE) {
					const container = this.CreateContainer(ancestor);
					this.containerMap[ancestor] = container;

					const parentOid = parts[i].slice(0, j - 1).join(".");
					const parentContainer = this.containerMap[parentOid] || root;

					parentContainer.supBox.appendChild(container.container);
					parentContainer.counter.textContent = parentContainer.supBox.childNodes.length;
				}
			}

			for (let j=parts[i].length; j>=commonPrefixDepth; j--) {
				const ancestor = parts[i].slice(0, j).join(".");

				if (ancestor in this.containerMap) {
					const container = this.containerMap[ancestor];
					const item = this.CreateListItem(oid, type, value, ancestor);
					container.supBox.appendChild(item);
					container.counter.textContent = container.supBox.childNodes.length;
					break;
				}
			}
		}

		for (const key in this.containerMap) {
			const container = this.containerMap[key];
			if (container.supBox.childNodes.length === 1) {
				this.ToggleContainer(container);
			}
		}

		if (root.supBox.style.display === "none") {
			this.ToggleContainer(root);
		}

		const expandButton = root.container.firstChild;
		expandButton.style.backgroundImage = "";
		expandButton.style.backgroundColor = "var(--clr-dark)";
		expandButton.style.borderRadius = "50%";
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

		if (nearestAncestor in Snmp.OID_CACHE && Snmp.OID_CACHE[nearestAncestor].length > 1 && Snmp.OID_CACHE[nearestAncestor][1][value]) {
			const stringValue = document.createElement("div");
			stringValue.textContent = Snmp.OID_CACHE[nearestAncestor][1][value];
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
		item.setAttribute("oid", oid);
		item.className = "snmp-container-item";
		item.onmousedown = event=> this.ListElement_onclick(event);
		container.appendChild(item);

		const oidBox = document.createElement("div");
		oidBox.textContent = oid;
		item.appendChild(oidBox);

		const counter = document.createElement("div");
		counter.textContent = "0";
		oidBox.appendChild(counter);

		if (oid in Snmp.OID_CACHE) {
			const nameBox = document.createElement("div");
			nameBox.textContent = Snmp.OID_CACHE[oid][0];
			item.appendChild(nameBox);
		}

		const supBox = document.createElement("div");
		supBox.className = "snmp-container-sup";
		supBox.style.display = "none";
		container.appendChild(supBox);

		const hLine = document.createElement("div");
		hLine.className = "snmp-tree-hline";
		container.appendChild(hLine);

		const vLine = document.createElement("div");
		vLine.className = "snmp-tree-vline";
		container.appendChild(vLine);

		const object = {
			container: container,
			supBox: supBox,
			counter: counter,
			hLine: hLine,
			vLine: vLine,
		};

		expandButton.onclick = ()=> this.ToggleContainer(object);
		item.ondblclick = ()=> this.ToggleContainer(object);

		return object;
	}

	ToggleContainer(container) {
		const expandButton = container.container.firstChild;
		if (expandButton.style.backgroundColor === "var(--clr-dark)") return;

		if (container.supBox.style.display === "none") {
			container.container.firstChild.style.transform = "translate(8px, 6px) rotate(0deg)";
			container.supBox.style.display = "block";
		}
		else {
			container.container.firstChild.style.transform = "translate(8px, 6px) rotate(-90deg)";
			container.supBox.style.display = "none";
		}
	}

	ListElement_onclick(event) {
		if (this.selected) {
			this.selected.style.backgroundColor = "";
		}

		let target = event.target;
		while (target.className !== "snmp-list-item" && target.className !== "snmp-container-item") {
			target = target.parentElement;
		}

		target.style.backgroundColor = "var(--clr-select)";
		this.selected = target;
	}

	PlotBox_onkeypress(event) {
		if (!this.selected) return;
		if (event.shiftKey) return;

		if (event.key === "ArrowUp" || event.key === "ArrowDown") {
			event.preventDefault();

			let nextSibling = this.GetNextSibling(this.selected, event.key);
			if (!nextSibling) return;

			this.selected.style.backgroundColor = "";

			if (nextSibling.className === "snmp-container") {
				if (event.key === "ArrowUp") {

					while (true) {
						if (nextSibling.children[2].style.display === "none") {
							break;
						}

						const current = nextSibling.childNodes[2].childNodes;
						if (current[current.length - 1].className === "snmp-list-item") {
							nextSibling = current[current.length - 1];
							break;
						}

						nextSibling = current[current.length - 1];
					}

					if (nextSibling.className === "snmp-container") {
						this.selected = nextSibling.children[1];
					}
					else {
						this.selected = nextSibling;
					}
				}
			}
			else {
				this.selected = nextSibling;
			}

			this.selected.style.backgroundColor = "var(--clr-select)";
			this.selected.scrollIntoView({block:"nearest"});

		}
		else if (event.key === "ArrowLeft") {
			event.preventDefault();

			if (this.selected.className === "snmp-list-item") {
				this.selected.style.backgroundColor = "";

				this.selected = this.selected.parentNode.parentNode.childNodes[1];
				this.selected.style.backgroundColor = "var(--clr-select)";
				this.selected.scrollIntoView({block:"nearest"});
			}
			else if (this.selected.className === "snmp-container-item") {
				const oid = this.selected.getAttribute("oid");
				const container = this.containerMap[oid];

				const isCollapsed = this.selected.parentNode.children[2].style.display === "none";
				if (isCollapsed) {
					this.selected.style.backgroundColor = "";

					const element = this.selected.parentNode.parentNode.parentNode.children[1];
					this.selected = element;
					this.selected.style.backgroundColor = "var(--clr-select)";
					this.selected.scrollIntoView({block:"nearest"});
				}
				else {
					this.ToggleContainer(container);
				}
			}
		}
		else if (event.key === "ArrowRight") {
			event.preventDefault();
			if (this.selected.className !== "snmp-container-item") return;

			const oid = this.selected.getAttribute("oid");
			const container = this.containerMap[oid];

			const isCollapsed = this.selected.parentNode.children[2].style.display === "none";
			if (isCollapsed) {
				this.ToggleContainer(container);
			}
			else {
				this.selected.style.backgroundColor = "";

				const element = this.selected.parentNode.children[2].firstChild;
				if (element.className === "snmp-list-item") {
					this.selected = element;
				}
				else {
					this.selected = element.children[1];
				}
				this.selected.style.backgroundColor = "var(--clr-select)";
				this.selected.scrollIntoView({block:"nearest"});
			}
		}
	}

	GetNextSibling(current, key) {
		const siblings = Array.from(this.selected.parentNode.children);
		const index = siblings.indexOf(current);

		if (current.className === "snmp-list-item") {
			const nextIndex = key === "ArrowUp" ? index - 1 : "ArrowDown" ? index + 1 : index;

			if (nextIndex >= 0 && nextIndex < siblings.length) {
				return siblings[nextIndex];
			}
			else {
				let container = current.parentNode.parentNode;
				switch (key) {
				case "ArrowUp":
					return container.childNodes[1];

				case "ArrowDown":
					while (true) {
						const containerSiblings = Array.from(container.parentNode.children);
						const containerIndex = containerSiblings.indexOf(container);
						const nextContainerIndex = containerIndex + 1;
						const element = containerSiblings[nextContainerIndex]?.childNodes[1];
						if (element) return element;

						container = container.parentNode.parentNode;
						if (container.className !== "snmp-container") return null;
					}
				}
			}

		}
		else if (current.className === "snmp-container-item") {
			const container = current.parentNode;
			const containerSiblings = Array.from(container.parentNode.children);
			const containerIndex = containerSiblings.indexOf(container);

			switch (key) {
			case "ArrowUp": {
				const nextContainerIndex = containerIndex - 1;

				if (nextContainerIndex < 0) {
					const parentNode = container.parentNode;
					if (parentNode === this.plotBox) return this.selected;
					const element = parentNode?.parentNode?.children[1];
					return element ? element : this.selected
				}

				const nextContainer = containerSiblings[nextContainerIndex];
				const supBox = nextContainer.children[2];

				if (supBox.style.display === "none") { //collapsed
					return nextContainer.children[1];
				}
				else { //expand
					return supBox.children[supBox.children.length-1];
				}
			}
			case "ArrowDown": {
				const supBox = container.children[2];

				if (supBox.style.display === "none") { //collapsed
					const nextContainerIndex = containerIndex + 1;
					const nextContainer = containerSiblings[nextContainerIndex];
					const element = nextContainer?.children[1];
					if (element) return element;

					if (container.className === "snmp-container") {
						const oid = container.children[1].getAttribute("oid");
						let flag = false;
						for (key in this.containerMap) {
							if (!flag && key === oid) {
								flag = true;
							}
							else if (flag && !key.startsWith(oid)) {
								return this.containerMap[key].container.children[1];
							}
						}
					}

				}
				else { //expand
					const nextElement = supBox.firstChild;
					if (nextElement.className === "snmp-list-item") {
						return supBox.firstChild;
					}
					else if (nextElement.className === "snmp-container") {
						return nextElement.children[1];
					}
				}
			}
			}
		}
		return this.selected;
	}

}
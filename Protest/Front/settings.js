class Settings extends Tabs {
	constructor(params) {
		super(null);

		this.params = params ?? "";

		this.AddCssDependencies("list.css");

		this.SetTitle("Settings");
		this.SetIcon("mono/wrench.svg");

		this.zones = [];
		this.smtpProfiles = [];
		this.snmpProfiles = [];

		this.tabsPanel.style.padding = "24px";
		this.tabsPanel.style.overflowY = "auto";

		this.zonesTab = this.AddTab("Zones", "mono/router.svg", "Network zones");
		this.adTab    = this.AddTab("Active directory", "mono/directory.svg");
		this.smtpTab  = this.AddTab("SMTP profiles", "mono/email.svg");
		this.snmpTab  = this.AddTab("SNMP", "mono/snmp.svg");
		this.graphTab = this.AddTab("Microsoft Graph", "mono/graph.svg");

		this.zonesTab.onclick = ()=> this.ShowZones();
		this.adTab.onclick    = ()=> this.ShowActiveDirectory();
		this.smtpTab.onclick  = ()=> this.ShowSmtp();
		this.snmpTab.onclick  = ()=> this.ShowSnmp();
		this.graphTab.onclick = ()=> this.ShowGraph();

		//TODO:
		this.graphTab.style.display = "none";

		switch (this.params) {
		case "ad":
			this.adTab.className = "v-tab-selected";
			this.ShowActiveDirectory();
			break;

		case "smtp":
			this.smtpTab.className = "v-tab-selected";
			this.ShowSmtp();
			break;

		case "snmp":
			this.snmpTab.className = "v-tab-selected";
			this.ShowSnmp();
			break;

		case "graph":
			this.graphTab.className = "v-tab-selected";
			this.ShowGraph();
			break;

		default:
			this.zonesTab.className = "v-tab-selected";
			this.ShowZones();
			break;
		}

		setTimeout(()=> this.AfterResize(), 250);
	}

	AfterResize() { //overrides
		super.AfterResize();
		if (this.options) {
			if (this.options.getBoundingClientRect().width < 320) {
				for (let i=0; i<this.options.childNodes.length; i++) {
					this.options.childNodes[i].style.color = "transparent";
					this.options.childNodes[i].style.width = "30px";
					this.options.childNodes[i].style.minWidth = "30px";
					this.options.childNodes[i].style.paddingLeft = "0";
				}
			}
			else {
				for (let i=0; i<this.options.childNodes.length; i++) {
					this.options.childNodes[i].style.color = "";
					this.options.childNodes[i].style.width = "";
					this.options.childNodes[i].style.minWidth = "";
					this.options.childNodes[i].style.paddingLeft = "";
				}
			}
		}
	}

	ShowZones() {
		this.params = "zones";
		this.tabsPanel.textContent = "";

		this.options = document.createElement("div");
		this.options.className = "acl-options";
		this.options.style.position = "absolute";
		this.options.style.left = "20px";
		this.options.style.right = "8px";
		this.options.style.top = "8px";
		this.options.style.overflow = "hidden";
		this.options.style.whiteSpace = "nowrap";
		this.tabsPanel.appendChild(this.options);

		this.zonesNewButton = document.createElement("input");
		this.zonesNewButton.type = "button";
		this.zonesNewButton.value = "New";
		this.zonesNewButton.className = "with-icon";
		this.zonesNewButton.style.backgroundImage = "url(mono/add.svg?light)";

		this.zonesRemoveButton = document.createElement("input");
		this.zonesRemoveButton.type = "button";
		this.zonesRemoveButton.value = "Remove";
		this.zonesRemoveButton.className = "with-icon";
		this.zonesRemoveButton.style.backgroundImage = "url(mono/delete.svg?light)";

		this.options.append(this.zonesNewButton, this.zonesRemoveButton);

		const titleBar = document.createElement("div");
		titleBar.style.position = "absolute";
		titleBar.style.left = "20px";
		titleBar.style.right = "20px";
		titleBar.style.top = "56px";
		titleBar.style.height = "25px";
		titleBar.style.borderRadius = "4px 4px 0 0";
		titleBar.style.background = "var(--grd-toolbar)";
		titleBar.style.color = "var(--clr-light)";
		this.tabsPanel.appendChild(titleBar);

		let labels = [];

		const nameLabel = document.createElement("div");
		nameLabel.textContent = "Name";
		labels.push(nameLabel);

		const networkLabel = document.createElement("div");
		networkLabel.textContent = "Network zone";
		labels.push(networkLabel);

		const colorLabel = document.createElement("div");
		colorLabel.textContent = "Color";
		labels.push(colorLabel);

		for (let i = 0; i < labels.length; i++) {
			labels[i].style.display = "inline-block";
			labels[i].style.textAlign = "left";
			labels[i].style.width = "33%";
			labels[i].style.lineHeight = "24px";
			labels[i].style.whiteSpace = "nowrap";
			labels[i].style.overflow = "hidden";
			labels[i].style.textOverflow = "ellipsis";
			labels[i].style.boxSizing = "border-box";
			labels[i].style.paddingLeft = "4px";
			labels[i].style.paddingTop = "1px";
		}

		titleBar.append(nameLabel, networkLabel, colorLabel);

		this.zonesList = document.createElement("div");
		this.zonesList.className = "no-results";
		this.zonesList.style.position = "absolute";
		this.zonesList.style.overflowY = "auto";
		this.zonesList.style.left = "20px";
		this.zonesList.style.right = "20px";
		this.zonesList.style.top = "80px";
		this.zonesList.style.bottom = "20px";
		this.zonesList.style.border = "rgb(82,82,82) solid 2px";
		this.tabsPanel.appendChild(this.zonesList);

		this.zonesNewButton.onclick = ()=>{
			this.PreviewZone(null);
		};

		this.zonesRemoveButton.onclick = ()=> {
			if (!this.selectedZone) return;

			let index = this.zones.indexOf(this.selectedZone);
			if (index === -1) return;

			this.ConfirmBox("Are you sure you want to remove this zone?", false, "mono/delete.svg").addEventListener("click", ()=>{
				this.zones.splice(index, 1);
				this.SaveZones();
				this.zonesList.removeChild(this.zonesList.childNodes[index]);
			});
		};

		this.GetZones();
		this.AfterResize();
	}

	async ShowActiveDirectory() {
		this.params = "ad";
		this.tabsPanel.textContent = "";

		const domainLabel = document.createElement("div");
		domainLabel.textContent = "Domain:";
		domainLabel.style.display = "inline-block";
		domainLabel.style.paddingRight = "8px";
		this.tabsPanel.append(domainLabel);

		const domainInput = document.createElement("input");
		domainInput.type = "text";
		domainInput.disabled = true;
		domainInput.style.display = "inline-block";
		domainInput.style.width = "250px";
		this.tabsPanel.append(domainInput);

		try {
			const response = await fetch("fetch/networkinfo");

			if (response.status !== 200) return;

			const json = await response.json();
			if (json.error) throw(json.error);

			let domain = json.domain  ? json.domain : "";
			domainInput.value = domain;

			this.tabsPanel.appendChild(document.createElement("br"));

			const warningBox = document.createElement("div");
			warningBox.textContent = "Domain privileges are inherited by the user executing the pro-test.exe executable. To utilize Directory Services, run the executable with the credentials of a Domain Administrator.";
			warningBox.style.fontSize = "small";
			warningBox.style.paddingLeft = "56px";
			warningBox.style.maxWidth = "480px";
			warningBox.style.minHeight = "40px";
			warningBox.style.paddingTop = "20px";
			warningBox.style.paddingBottom = "20px";
			warningBox.style.backgroundImage = "url(mono/warning.svg)";
			warningBox.style.backgroundPosition = "2px center";
			warningBox.style.backgroundSize = "40px 40px";
			warningBox.style.backgroundRepeat = "no-repeat";
			this.tabsPanel.appendChild(warningBox);
		}
		catch {}
	}

	ShowSmtp() {
		this.params = "smtp";
		this.tabsPanel.textContent = "";

		this.options = document.createElement("div");
		this.options.className = "acl-options";
		this.options.style.position = "absolute";
		this.options.style.left = "20px";
		this.options.style.right = "8px";
		this.options.style.top = "8px";
		this.options.style.overflow = "hidden";
		this.options.style.whiteSpace = "nowrap";
		this.tabsPanel.appendChild(this.options);

		this.profilesNewButton = document.createElement("input");
		this.profilesNewButton.type = "button";
		this.profilesNewButton.value = "New";
		this.profilesNewButton.className = "with-icon";
		this.profilesNewButton.style.backgroundImage = "url(mono/add.svg?light)";

		this.profilesRemoveButton = document.createElement("input");
		this.profilesRemoveButton.type = "button";
		this.profilesRemoveButton.value = "Remove";
		this.profilesRemoveButton.className = "with-icon";
		this.profilesRemoveButton.style.backgroundImage = "url(mono/delete.svg?light)";

		this.profilesTestButton = document.createElement("input");
		this.profilesTestButton.type = "button";
		this.profilesTestButton.value = "Send a test";
		this.profilesTestButton.disabled = true;
		this.profilesTestButton.className = "with-icon";
		this.profilesTestButton.style.backgroundImage = "url(mono/checked.svg?light)";

		this.options.append(this.profilesNewButton, this.profilesRemoveButton, this.profilesTestButton);

		const titleBar = document.createElement("div");
		titleBar.style.position = "absolute";
		titleBar.style.left = "20px";
		titleBar.style.right = "20px";
		titleBar.style.top = "56px";
		titleBar.style.height = "25px";
		titleBar.style.borderRadius = "4px 4px 0 0";
		titleBar.style.background = "var(--grd-toolbar)";
		titleBar.style.color = "var(--clr-light)";
		this.tabsPanel.appendChild(titleBar);

		let labels = [];

		const serverLabel = document.createElement("div");
		serverLabel.textContent = "SMTP server";
		labels.push(serverLabel);

		const portLabel = document.createElement("div");
		portLabel.textContent = "Port";
		labels.push(portLabel);

		const usernameLabel = document.createElement("Sender");
		usernameLabel.textContent = "Username";
		labels.push(usernameLabel);

		for (let i = 0; i < labels.length; i++) {
			labels[i].style.display = "inline-block";
			labels[i].style.textAlign = "left";
			labels[i].style.width = "33%";
			labels[i].style.lineHeight = "24px";
			labels[i].style.whiteSpace = "nowrap";
			labels[i].style.overflow = "hidden";
			labels[i].style.textOverflow = "ellipsis";
			labels[i].style.boxSizing = "border-box";
			labels[i].style.paddingLeft = "4px";
			labels[i].style.paddingTop = "1px";
		}

		titleBar.append(serverLabel, portLabel, usernameLabel);

		this.profilesList = document.createElement("div");
		this.profilesList.className = "no-results";
		this.profilesList.style.position = "absolute";
		this.profilesList.style.overflowY = "auto";
		this.profilesList.style.left = "20px";
		this.profilesList.style.right = "20px";
		this.profilesList.style.top = "80px";
		this.profilesList.style.bottom = "20px";
		this.profilesList.style.border = "rgb(82,82,82) solid 2px";
		this.tabsPanel.appendChild(this.profilesList);

		this.profilesNewButton.onclick = ()=>{
			this.PreviewSmtpProfile(null);
		};

		this.profilesRemoveButton.onclick = async ()=>{
			if (!this.selectedSmtpProfile) return;

			let index = this.smtpProfiles.indexOf(this.selectedSmtpProfile);
			if (index === -1) return;

			this.ConfirmBox("Are you sure you want to remove this SMTP profile?", false, "mono/delete.svg").addEventListener("click", ()=>{
				this.smtpProfiles.splice(index, 1);
				this.SaveSmtpProfiles();

				this.profilesList.removeChild(this.profilesList.childNodes[index]);
				this.profilesTestButton.disabled = true;
			});
		};

		this.profilesTestButton.onclick = ()=>{
			const dialog = this.DialogBox("108px");
			if (dialog === null) return;

			dialog.innerBox.parentElement.style.maxWidth = "480px";
			dialog.innerBox.style.textAlign = "center";

			dialog.okButton.value = "Test";

			const recipientInput = document.createElement("input");
			recipientInput.type = "text";
			recipientInput.placeholder = "recipient";
			recipientInput.style.marginTop = "20px";
			recipientInput.style.width = "min(calc(100% - 8px), 300px)";
			dialog.innerBox.appendChild(recipientInput);

			recipientInput.focus();

			dialog.okButton.onclick = async ()=> {
				if (recipientInput.value.length === 0) return;
				dialog.okButton.disabled = true;
				dialog.innerBox.removeChild(recipientInput);
				dialog.innerBox.parentElement.style.maxHeight = "180px";

				const spinner = document.createElement("div");
				spinner.className = "spinner";
				spinner.style.textAlign = "left";
				spinner.style.marginTop = "32px";
				spinner.style.marginBottom = "16px";
				spinner.appendChild(document.createElement("div"));
				dialog.innerBox.appendChild(spinner);

				const status = document.createElement("div");
				status.textContent = "Sending mail test...";
				status.style.textAlign = "center";
				status.style.fontWeight = "bold";
				status.style.animation = "delayed-fade-in 1.5s ease-in 1";
				dialog.innerBox.appendChild(status);

				try {
					const response = await fetch(`config/smtpprofiles/test?guid=${this.selectedSmtpProfile.guid}&recipient=${recipientInput.value}`);
					const json = await response.json();
					if (json.error) throw (json.error);
					dialog.Close();
				}
				catch (ex) {
					dialog.Close();
					setTimeout(()=>{
						this.ConfirmBox(ex, true, "mono/error.svg");
					},250);
				}
			};

			recipientInput.onkeydown = event=> {
				if (event.key === "Enter") {
					dialog.okButton.click();
				}
			}
		};

		this.GetSmtpProfiles();
		this.AfterResize();
	}

	ShowSnmp() {
		this.params = "snmp";
		this.tabsPanel.textContent = "";

		this.options = document.createElement("div");
		this.options.className = "acl-options";
		this.options.style.position = "absolute";
		this.options.style.left = "20px";
		this.options.style.right = "8px";
		this.options.style.top = "8px";
		this.options.style.overflow = "hidden";
		this.options.style.whiteSpace = "nowrap";
		this.tabsPanel.appendChild(this.options);

		this.profilesNewButton = document.createElement("input");
		this.profilesNewButton.type = "button";
		this.profilesNewButton.value = "New";
		this.profilesNewButton.className = "with-icon";
		this.profilesNewButton.style.backgroundImage = "url(mono/add.svg?light)";

		this.profilesRemoveButton = document.createElement("input");
		this.profilesRemoveButton.type = "button";
		this.profilesRemoveButton.value = "Remove";
		this.profilesRemoveButton.className = "with-icon";
		this.profilesRemoveButton.style.backgroundImage = "url(mono/delete.svg?light)";

		this.options.append(this.profilesNewButton, this.profilesRemoveButton);

		const titleBar = document.createElement("div");
		titleBar.style.position = "absolute";
		titleBar.style.left = "20px";
		titleBar.style.right = "20px";
		titleBar.style.top = "56px";
		titleBar.style.height = "25px";
		titleBar.style.borderRadius = "4px 4px 0 0";
		titleBar.style.background = "var(--grd-toolbar)";
		titleBar.style.color = "var(--clr-light)";
		this.tabsPanel.appendChild(titleBar);

		let labels = ["Name", "Context name", "Username"];
		for (let i = 0; i < labels.length; i++) {
			const newLabel = document.createElement("div");
			newLabel.style.display = "inline-block";
			newLabel.style.textAlign = "left";
			newLabel.style.width = `${100/labels.length}%`;
			newLabel.style.lineHeight = "24px";
			newLabel.style.whiteSpace = "nowrap";
			newLabel.style.overflow = "hidden";
			newLabel.style.textOverflow = "ellipsis";
			newLabel.style.boxSizing = "border-box";
			newLabel.style.paddingLeft = "4px";
			newLabel.style.paddingTop = "1px";
			newLabel.textContent = labels[i];
			titleBar.appendChild(newLabel);
		}

		this.profilesList = document.createElement("div");
		this.profilesList.className = "no-results";
		this.profilesList.style.position = "absolute";
		this.profilesList.style.overflowY = "auto";
		this.profilesList.style.left = "20px";
		this.profilesList.style.right = "20px";
		this.profilesList.style.top = "80px";
		this.profilesList.style.bottom = "20px";
		this.profilesList.style.border = "rgb(82,82,82) solid 2px";
		this.tabsPanel.appendChild(this.profilesList);

		this.profilesNewButton.onclick = ()=>{
			this.PreviewSnmpProfile(null);
		};

		this.profilesRemoveButton.onclick = async ()=>{
			if (!this.selectedSnmpProfile) return;

			let index = this.snmpProfiles.indexOf(this.selectedSnmpProfile);
			if (index === -1) return;

			this.ConfirmBox("Are you sure you want to remove this SNMP profile?", false, "mono/delete.svg").addEventListener("click", ()=>{
				this.snmpProfiles.splice(index, 1);
				this.SaveSnmpProfiles();
				this.profilesList.removeChild(this.profilesList.childNodes[index]);
			});
		};

		this.GetSnmpProfiles();
		this.AfterResize();
	}

	ShowGraph() {
		this.params = "graph";
		this.tabsPanel.textContent = "";
	}

	async GetZones() {
		try {
			const response = await fetch("config/zones/list");

			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const json = await response.json();
			if (json.error) throw(json.error);

			this.zones = json;
			this.zonesList.textContent = "";

			for (let i = 0; i < json.length; i++) {
				const element = document.createElement("div");
				element.className = "list-element";
				this.zonesList.appendChild(element);

				const nameLabel = document.createElement("div");
				nameLabel.style.display = "inline-block";
				nameLabel.style.top = "0";
				nameLabel.style.left = "0";
				nameLabel.style.width = "33%";
				nameLabel.style.whiteSpace = "nowrap";
				nameLabel.style.overflow = "hidden";
				nameLabel.style.textOverflow = "ellipsis";
				nameLabel.style.lineHeight = "32px";
				nameLabel.style.paddingLeft = "4px";
				nameLabel.textContent = json[i].name;

				const networkLabel = document.createElement("div");
				networkLabel.style.display = "inline-block";
				networkLabel.style.top = "0";
				networkLabel.style.left = "33%";
				networkLabel.style.width = "33%";
				networkLabel.style.whiteSpace = "nowrap";
				networkLabel.style.overflow = "hidden";
				networkLabel.style.lineHeight = "32px";
				networkLabel.textContent = json[i].network;

				const colorBox = document.createElement("div");
				colorBox.style.display = "inline-block";
				colorBox.style.top = "4px";
				colorBox.style.left = "66%";
				colorBox.style.width = "32px";
				colorBox.style.height = "24px";
				colorBox.style.marginLeft = "8px";
				colorBox.style.borderRadius = "2px";
				colorBox.style.backgroundColor = json[i].color;
				colorBox.style.boxShadow = "var(--clr-dark) 0 0 0 1px inset";

				element.append(nameLabel, networkLabel, colorBox);

				element.onclick = ()=>{
					for (let i=0; i<this.zonesList.childNodes.length; i++) {
						this.zonesList.childNodes[i].style.backgroundColor = "";
					}
					element.style.backgroundColor = "var(--clr-select)";
					this.selectedZone = json[i];
				};

				element.ondblclick = ()=>{
					this.PreviewZone(json[i]);
				};
			}
		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/error.svg");
		}
	}

	async GetSmtpProfiles() {
		try {
			const response = await fetch("config/smtpprofiles/list");

			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const json = await response.json();
			if (json.error) throw(json.error);

			this.smtpProfiles = json;
			this.profilesList.textContent = "";

			for (let i = 0; i < json.length; i++) {
				const element = document.createElement("div");
				element.className = "list-element";
				this.profilesList.appendChild(element);

				let labels = [];

				const serverLabel = document.createElement("div");
				serverLabel.textContent = json[i].server;
				labels.push(serverLabel);

				const portLabel = document.createElement("div");
				portLabel.textContent = json[i].port;
				labels.push(portLabel);

				const usernameLabel = document.createElement("Sender");
				usernameLabel.textContent = json[i].username;
				labels.push(usernameLabel);

				for (let j = 0; j < labels.length; j++) {
					labels[j].style.display = "inline-block";
					labels[j].style.top = "0";
					labels[j].style.left = `${j*100/labels.length}%`;
					labels[j].style.width = "25%";
					labels[j].style.lineHeight = "32px";
					labels[j].style.whiteSpace = "nowrap";
					labels[j].style.overflow = "hidden";
					labels[j].style.textOverflow = "ellipsis";
					labels[j].style.boxSizing = "border-box";
					labels[j].style.paddingLeft = "4px";
				}

				element.append(serverLabel, portLabel, usernameLabel);

				element.onclick = ()=> {
					this.profilesTestButton.disabled = false;
					for (let i=0; i<this.profilesList.childNodes.length; i++) {
						this.profilesList.childNodes[i].style.backgroundColor = "";
					}
					element.style.backgroundColor = "var(--clr-select)";
					this.selectedSmtpProfile = json[i];
				};

				element.ondblclick = ()=> {
					this.PreviewSmtpProfile(json[i]);
				};
			}
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
			this.profilesList.textContent = "";

			for (let i = 0; i < json.length; i++) {
				const element = document.createElement("div");
				element.className = "list-element";
				this.profilesList.appendChild(element);

				let labels = [];

				const nameLabel = document.createElement("div");
				nameLabel.textContent = json[i].name;
				labels.push(nameLabel);

				const contextLabel = document.createElement("div");
				contextLabel.textContent = json[i].context;
				labels.push(contextLabel);

				const usernameLabel = document.createElement("Sender");
				usernameLabel.textContent = json[i].username;
				labels.push(usernameLabel);

				for (let j = 0; j < labels.length; j++) {
					labels[j].style.display = "inline-block";
					labels[j].style.top = "0";
					labels[j].style.left = `${j*100/labels.length}%`;
					labels[j].style.width = "33%";
					labels[j].style.lineHeight = "32px";
					labels[j].style.whiteSpace = "nowrap";
					labels[j].style.overflow = "hidden";
					labels[j].style.textOverflow = "ellipsis";
					labels[j].style.boxSizing = "border-box";
					labels[j].style.paddingLeft = "4px";
				}

				element.append(nameLabel, contextLabel, usernameLabel);

				element.onclick = ()=> {
					for (let i=0; i<this.profilesList.childNodes.length; i++) {
						this.profilesList.childNodes[i].style.backgroundColor = "";
					}
					element.style.backgroundColor = "var(--clr-select)";
					this.selectedSnmpProfile = json[i];
				};

				element.ondblclick = ()=> {
					this.PreviewSnmpProfile(json[i]);
				};
			}
		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/error.svg");
		}
	}

	PreviewZone(object=null) {
		const dialog = this.DialogBox("240px");
		if (dialog === null) return;

		const {okButton, innerBox} = dialog;

		okButton.value = "Save";

		innerBox.style.padding = "16px 32px";
		innerBox.style.display = "grid";
		innerBox.style.gridTemplateColumns = "auto 120px 275px auto";
		innerBox.style.gridTemplateRows = "repeat(3, 38px)";
		innerBox.style.alignItems = "center";

		const nameLabel = document.createElement("div");
		nameLabel.style.gridArea = "1 / 2";
		nameLabel.textContent = "Name:";
		const nameInput = document.createElement("input");
		nameInput.style.gridArea = "1 / 3";
		nameInput.type = "text";
		innerBox.append(nameLabel, nameInput);

		const networkLabel = document.createElement("div");
		networkLabel.style.gridArea = "2 / 2";
		networkLabel.textContent = "Network zone:";
		const networkInput = document.createElement("input");
		networkInput.style.gridArea = "2 / 3";
		networkInput.type = "text";
		networkInput.placeholder = "10.0.0.1/24";
		innerBox.append(networkLabel, networkInput);

		const colorLabel = document.createElement("div");
		colorLabel.style.gridArea = "3 / 2";
		colorLabel.textContent = "Color:";
		const colorInput = document.createElement("input");
		colorInput.style.gridArea = "3 / 3";
		colorInput.type = "color";
		innerBox.append(colorLabel, colorInput);

		const trustedCheckbox = document.createElement("input");
		trustedCheckbox.type = "checkbox";
		trustedCheckbox.checked = false;
		const trustedBox = document.createElement("div");
		trustedBox.style.gridArea = "4 / 2 / 4 / 4";
		trustedBox.appendChild(trustedCheckbox);
		innerBox.append(trustedBox);
		const domainUser = this.AddCheckBoxLabel(trustedBox, trustedCheckbox, "Trusted zone");

		if (object) {
			nameInput.value    = object.name;
			networkInput.value = object.network;
			colorInput.value   = object.color;
			trustedCheckbox.checked = object.isTrusted;
		}

		okButton.addEventListener("click", async ()=>{
			let isNew = object === null;
			let index = this.zones.indexOf(object);

			if (!isNew) {
				if (index === -1) isNew = true;
			}

			const newObject = {
				name     : nameInput.value,
				network  : networkInput.value,
				color    : colorInput.value,
				isTrusted: trustedCheckbox.checked
			};

			if (isNew) {
				this.zones.push(newObject);
			}
			else {
				this.zones[index] = newObject;
			}

			await this.SaveZones();
			this.ShowZones();
		});

		setTimeout(()=>{ nameInput.focus() }, 200);
	}

	async PreviewSmtpProfile(object=null) {
		const dialog = this.DialogBox("320px");
		if (dialog === null) return;

		const okButton = dialog.okButton;
		const innerBox = dialog.innerBox;

		okButton.value = "Save";

		innerBox.style.padding = "16px 32px";
		innerBox.style.display = "grid";
		innerBox.style.gridTemplateColumns = "auto 120px 275px auto";
		innerBox.style.gridTemplateRows = "repeat(6, 38px)";
		innerBox.style.alignItems = "center";

		const serverLabel = document.createElement("div");
		serverLabel.style.gridArea = "1 / 2";
		serverLabel.textContent = "SMTP server:";
		const serverInput = document.createElement("input");
		serverInput.style.gridArea = "1 / 3";
		serverInput.type = "text";
		serverInput.placeholder = "smtp.gmail.com";
		innerBox.append(serverLabel, serverInput);

		const portLabel = document.createElement("div");
		portLabel.style.gridArea = "2 / 2";
		portLabel.textContent = "Port:";
		const portInput = document.createElement("input");
		portInput.style.gridArea = "2 / 3";
		portInput.type = "number";
		portInput.min = 1;
		portInput.max = 65535;
		portInput.value = 587;
		innerBox.append(portLabel, portInput);

		const senderLabel = document.createElement("div");
		senderLabel.style.gridArea = "3 / 2";
		senderLabel.textContent = "Sender:";
		const senderInput = document.createElement("input");
		senderInput.style.gridArea = "3 / 3";
		senderInput.type = "text";
		innerBox.append(senderLabel, senderInput);

		const usernameLabel = document.createElement("div");
		usernameLabel.style.gridArea = "4 / 2";
		usernameLabel.textContent = "Username:";
		const usernameInput = document.createElement("input");
		usernameInput.style.gridArea = "4 / 3";
		usernameInput.type = "text";
		innerBox.append(usernameLabel, usernameInput);

		const passwordLabel = document.createElement("div");
		passwordLabel.style.gridArea = "5 / 2";
		passwordLabel.textContent = "Password:";
		const passwordInput = document.createElement("input");
		passwordInput.style.gridArea = "5 / 3";
		passwordInput.type = "password";
		passwordInput.placeholder = "unchanged";
		innerBox.append(passwordLabel, passwordInput);

		const sslBox = document.createElement("div");
		sslBox.style.gridArea = "6 / 2";
		innerBox.appendChild(sslBox);
		const sslCheckbox = document.createElement("input");
		sslCheckbox.type = "checkbox";
		sslCheckbox.checked = true;
		sslBox.appendChild(sslCheckbox);
		this.AddCheckBoxLabel(sslBox, sslCheckbox, "SSL");

		if (object) {
			serverInput.value = object.server
			portInput.value = object.port;
			senderInput.value = object.sender;
			usernameInput.value = object.username;
			passwordInput.value = object.password;
			sslCheckbox.checked = object.ssl;
		}

		okButton.addEventListener("click", async ()=> {
			let isNew = object === null;
			let index = this.smtpProfiles.indexOf(object);

			if (!isNew) {
				if (index === -1) isNew = true;
			}

			const newObject = {
				server     : serverInput.value,
				port       : parseInt(portInput.value),
				sender     : senderInput.value,
				username   : usernameInput.value,
				password   : passwordInput.value,
				ssl        : sslCheckbox.checked,
			};

			if (object && object.guid) newObject.guid = object.guid;

			if (isNew) {
				this.smtpProfiles.push(newObject);
			}
			else {
				this.smtpProfiles[index] = newObject;
			}

			await this.SaveSmtpProfiles();
			this.ShowSmtp();
		});

		setTimeout(()=>{ serverInput.focus() }, 200);
	}

	async PreviewSnmpProfile(object=null) {
		const dialog = this.DialogBox("420px");
		if (dialog === null) return;

		const {okButton, innerBox} = dialog;

		okButton.value = "Save";

		innerBox.style.padding = "16px 32px";
		innerBox.style.display = "grid";
		innerBox.style.gridTemplateColumns = "auto 200px 200px 100px auto";
		innerBox.style.gridTemplateRows = "repeat(3, 38px) 16px repeat(3, 38px) 16px repeat(2, 38px)";
		innerBox.style.alignItems = "center";

		const nameLabel = document.createElement("div");
		nameLabel.style.gridArea = "1 / 2";
		nameLabel.textContent = "Name:";
		const nameInput = document.createElement("input");
		nameInput.style.gridArea = "1 / 3";
		nameInput.type = "text";
		innerBox.append(nameLabel, nameInput);

		const versionLabel = document.createElement("div");
		versionLabel.style.gridArea = "2 / 2";
		versionLabel.textContent = "Version:";
		const versionInput = document.createElement("select");
		versionInput.style.gridArea = "2 / 3";
		versionInput.disabled = true;
		innerBox.append(versionLabel, versionInput);

		const optionVer = document.createElement("option");
		optionVer.value = 3;
		optionVer.textContent = "Version 3";
		versionInput.appendChild(optionVer);

		const contextLabel = document.createElement("div");
		contextLabel.style.gridArea = "3 / 2";
		contextLabel.textContent = "Context name:";
		const contextInput = document.createElement("input");
		contextInput.style.gridArea = "3 / 3";
		contextInput.type = "text";
		contextInput.placeholder = "optional";
		innerBox.append(contextLabel, contextInput);

		const usernameLabel = document.createElement("div");
		usernameLabel.style.gridArea = "5 / 2";
		usernameLabel.textContent = "Username:";
		const usernameInput = document.createElement("input");
		usernameInput.style.gridArea = "5 / 3";
		usernameInput.type = "text";
		innerBox.append(usernameLabel, usernameInput);

		const authAlgorithmLabel = document.createElement("div");
		authAlgorithmLabel.style.gridArea = "6 / 2";
		authAlgorithmLabel.textContent = "Authentication algorithm:";
		const authAlgorithmInput = document.createElement("select");
		authAlgorithmInput.style.gridArea = "6 / 3";
		innerBox.append(authAlgorithmLabel, authAlgorithmInput);

		const authAlgorithms = ["MD5", "SHA-1", "SHA-256", "SHA-384", "SHA-512"];
		for (let i=0; i<authAlgorithms.length; i++) {
			const option = document.createElement("option");
			option.value = i+1;
			option.textContent = authAlgorithms[i];
			authAlgorithmInput.appendChild(option);
		}

		const authPasswordLabel = document.createElement("div");
		authPasswordLabel.style.gridArea = "7 / 2";
		authPasswordLabel.textContent = "Authentication password:";
		const authPasswordInput = document.createElement("input");
		authPasswordInput.style.gridArea = "7 / 3";
		authPasswordInput.type = "password";
		authPasswordInput.placeholder = "unchanged";
		innerBox.append(authPasswordLabel, authPasswordInput);

		const privacyAlgorithmLabel = document.createElement("div");
		privacyAlgorithmLabel.style.gridArea = "9 / 2";
		privacyAlgorithmLabel.textContent = "Privacy algorithm:";
		const privacyAlgorithmInput = document.createElement("select");
		privacyAlgorithmInput.style.gridArea = "9 / 3";
		innerBox.append(privacyAlgorithmLabel, privacyAlgorithmInput);

		const privacyAlgorithms = ["DES", "AES-128", "AES-192", "AES-256"];
		for (let i=0; i<privacyAlgorithms.length; i++) {
			const option = document.createElement("option");
			option.value = i+1;
			option.textContent = privacyAlgorithms[i];
			privacyAlgorithmInput.appendChild(option);
		}

		const privacyPasswordLabel = document.createElement("div");
		privacyPasswordLabel.style.gridArea = "10 / 2";
		privacyPasswordLabel.textContent = "Privacy password:";
		const privacyPasswordInput = document.createElement("input");
		privacyPasswordInput.style.gridArea = "10 / 3";
		privacyPasswordInput.type = "password";
		privacyPasswordInput.placeholder = "unchanged";
		innerBox.append(privacyPasswordLabel, privacyPasswordInput);

		const authObsoleteBox = document.createElement("div");
		authObsoleteBox.textContent = "Obsolete";
		authObsoleteBox.style.gridArea = "6 / 4";
		authObsoleteBox.style.marginLeft = "4px";
		authObsoleteBox.style.paddingLeft = "24px";
		authObsoleteBox.style.borderRadius = "4px";
		authObsoleteBox.style.border = "1px solid var(--clr-dark)";
		authObsoleteBox.style.backgroundColor = "var(--clr-warning)";
		authObsoleteBox.style.backgroundImage = "url(mono/warning.svg)";
		authObsoleteBox.style.backgroundSize = "16px 16px";
		authObsoleteBox.style.backgroundPosition = "4px center";
		authObsoleteBox.style.backgroundRepeat = "no-repeat";
		authObsoleteBox.style.opacity = "0";
		authObsoleteBox.style.transform = "translateX(-8px)";
		authObsoleteBox.style.transition = ".2s";

		const privacyObsoleteBox = document.createElement("div");
		privacyObsoleteBox.textContent = "Obsolete";
		privacyObsoleteBox.style.gridArea = "9 / 4";
		privacyObsoleteBox.style.marginLeft = "4px";
		privacyObsoleteBox.style.paddingLeft = "24px";
		privacyObsoleteBox.style.border = "1px solid var(--clr-dark)";
		privacyObsoleteBox.style.borderRadius = "4px";
		privacyObsoleteBox.style.backgroundColor = "var(--clr-warning)";
		privacyObsoleteBox.style.backgroundImage = "url(mono/warning.svg)";
		privacyObsoleteBox.style.backgroundSize = "16px 16px";
		privacyObsoleteBox.style.backgroundPosition = "4px center";
		privacyObsoleteBox.style.backgroundRepeat = "no-repeat";
		privacyObsoleteBox.style.opacity = "0";
		privacyObsoleteBox.style.transform = "translateX(-8px)";
		privacyObsoleteBox.style.transition = ".2s";

		innerBox.append(authObsoleteBox, privacyObsoleteBox);

		if (object) {
			nameInput.value = object.name;
			versionInput.value = object.version;
			contextInput.value = object.context;
			usernameInput.value = object.username;
			authAlgorithmInput.value = object.authAlgorithm;
			authPasswordInput.value = "";
			privacyAlgorithmInput.value = object.privacyAlgorithm;
			privacyPasswordInput.value = "";
		}
		else {
			authAlgorithmInput.value = 3;
			privacyAlgorithmInput.value = 2;
		}

		authAlgorithmInput.onchange = () => {
			authObsoleteBox.style.opacity = (authAlgorithmInput.value == 1 || authAlgorithmInput.value == 2) ? "1" : "0";
			authObsoleteBox.style.transform = (authAlgorithmInput.value == 1 || authAlgorithmInput.value == 2) ? "none" : "translateX(-8px)";
		};

		privacyAlgorithmInput.onchange = () => {
			privacyObsoleteBox.style.opacity = (privacyAlgorithmInput.value == 1) ? "1" : "0";
			privacyObsoleteBox.style.transform = (privacyAlgorithmInput.value == 1) ? "none" : "translateX(-8px)";
		};

		okButton.addEventListener("click", async ()=> {
			let isNew = object === null;
			let index = this.snmpProfiles.indexOf(object);

			if (!isNew) {
				if (index === -1) isNew = true;
			}

			const newObject = {
				name             : nameInput.value,
				version          : parseInt(versionInput.value),
				context          : contextInput.value,
				username         : usernameInput.value,
				authAlgorithm    : parseInt(authAlgorithmInput.value),
				authPassword     : authPasswordInput.value,
				privacyAlgorithm : parseInt(privacyAlgorithmInput.value),
				privacyPassword  : privacyPasswordInput.value,
			};

			if (object && object.guid) newObject.guid = object.guid;

			if (isNew) {
				this.snmpProfiles.push(newObject);
			}
			else {
				this.snmpProfiles[index] = newObject;
			}

			await this.SaveSnmpProfiles();
			this.ShowSnmp();
		});

		authAlgorithmInput.onchange();
		privacyAlgorithmInput.onchange();

		setTimeout(()=>{ nameInput.focus() }, 200);
	}

	async SaveZones() {
		try {
			const response = await fetch("config/zones/save", {
				method: "POST",
				body: JSON.stringify(this.zones)
			});

			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const json = await response.json();
			if (json.error) throw(json.error);

		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/error.svg");
		}
	}

	async SaveSmtpProfiles() {
		try {
			const response = await fetch("config/smtpprofiles/save", {
				method: "POST",
				body: JSON.stringify(this.smtpProfiles)
			});

			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const json = await response.json();
			if (json.error) throw(json.error);
		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/error.svg");
		}
	}

	async SaveSnmpProfiles() {
		try {
			const response = await fetch("config/snmpprofiles/save", {
				method: "POST",
				body: JSON.stringify(this.snmpProfiles)
			});

			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const json = await response.json();
			if (json.error) throw(json.error);
		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/error.svg");
		}
	}
}
class Fetch extends Tabs {
	constructor(args) {
		super(null);

		this.args = args ?? "";

		this.SetTitle("Fetch");
		this.SetIcon("mono/fetch.svg");

		this.tabsPanel.style.padding = "20px";
		this.tabsPanel.style.overflow = "auto";
		this.tabsPanel.style.display = "grid";
		this.tabsPanel.style.gridTemplateColumns = "auto 150px 150px 12px 200px 40px minmax(20px, 300px) auto";
		this.tabsPanel.style.alignItems = "center";

		const deviceTab = this.AddTab("Devices", "mono/gear.svg");
		const usersTab = this.AddTab("Users", "mono/user.svg");
		const protestTab = this.AddTab("Import", "mono/logo.svg");
		this.taskTab = this.AddTab("Fetching", "mono/ball.svg");

		this.taskTab.style.position = "absolute";
		this.taskTab.style.left = "0";
		this.taskTab.style.right = "0";
		this.taskTab.style.top = "max(140px, 100% - 44px)";
		this.taskTab.style.visibility = "hidden";

		deviceTab.onclick = ()=> this.ShowDevices();
		usersTab.onclick = ()=> this.ShowUsers();
		protestTab.onclick = ()=> this.ShowImport();
		this.taskTab.onclick = ()=> this.ShowFetching();

		this.InitializeComponents();

		switch (this.args) {
		case "users":
			usersTab.className = "v-tab-selected";
			this.ShowUsers();
			break;

		case "protest":
			protestTab.className = "v-tab-selected";
			this.ShowImport();
			break;

		case "fetching":
			this.taskTab.className = "v-tab-selected";
			this.ShowFetching();
			break;

		default:
			deviceTab.className = "v-tab-selected";
			this.ShowDevices();
		}
	}

	InitializeComponents() {
		this.statusValueLabel = document.createElement("div");
		this.statusValueLabel.style.textTransform = "capitalize";
		this.statusValueLabel.style.fontWeight = "600";

		this.progressValueLabel = document.createElement("div");
		this.progressValueLabel.style.textTransform = "capitalize";
		this.progressValueLabel.style.fontWeight = "600";
		this.progressValueLabel.textContent = "0/0";

		this.etcValueLabel = document.createElement("div");
		this.etcValueLabel.style.fontWeight = "600";
		this.etcValueLabel.textContent = "Calculating";

		this.progressBarInner = document.createElement("div");
		this.progressBarInner.style.backgroundColor = "var(--clr-accent)";
		this.progressBarInner.style.width = "0";
		this.progressBarInner.style.height = "100%";
		this.progressBarInner.style.transition = ".4s";

		const uniqueID = UI.GenerateUuid();

		this.updateRadio = document.createElement("input");
		this.updateRadio.type = "radio";
		this.updateRadio.name = uniqueID;
		this.updateRadio.checked = false;

		this.ipRadio = document.createElement("input");
		this.ipRadio.type = "radio";
		this.ipRadio.name = uniqueID;
		this.ipRadio.checked = true;

		this.ipFrom = new IpBox();
		this.ipTo = new IpBox();

		this.ipFrom.exitElement = this.ipTo.textBoxes[0];
		this.ipTo.enterElement = this.ipFrom.textBoxes[3];

		this.rangeBox = document.createElement("div");
		this.rangeBox.style.gridArea = "2 / 3 / auto / 7";

		this.ipFrom.Attach(this.rangeBox);

		const toLabel = document.createElement("div");
		toLabel.style.display = "inline-block";
		toLabel.style.minWidth = "15px";
		toLabel.style.fontWeight = "bold";
		toLabel.style.textAlign = "center";
		toLabel.style.color = "var(--clr-control)";
		toLabel.textContent = " - ";
		this.rangeBox.appendChild(toLabel);

		this.ipTo.Attach(this.rangeBox);

		this.domainRadio = document.createElement("input");
		this.domainRadio.type = "radio";
		this.domainRadio.name = uniqueID;
		this.domainRadio.checked = false;

		this.domainInput = document.createElement("input");
		this.domainInput.type = "text";
		this.domainInput.disabled = true;
		this.domainInput.style.width = "350px";
		this.domainInput.style.gridArea = "3 / 3";
		this.domainInput.style.marginLeft = "0px";
		this.domainInput.style.marginRight = "0px";

		this.dnsCheckBox = document.createElement("input");
		this.dnsCheckBox.type = "checkbox";
		this.dnsCheckBox.checked = true;

		this.snmp2Checkbox = document.createElement("input");
		this.snmp2Checkbox.type = "checkbox";
		this.snmp2Checkbox.checked = false;

		this.snmp3Checkbox = document.createElement("input");
		this.snmp3Checkbox.type = "checkbox";
		this.snmp3Checkbox.checked = false;

		this.wmiCheckbox = document.createElement("input");
		this.wmiCheckbox.type = "checkbox";
		this.wmiCheckbox.checked = true;

		this.snmp2Button = document.createElement("input");
		this.snmp2Button.type = "button";
		this.snmp2Button.style.width = this.snmp2Button.style.minWidth = "34px";
		this.snmp2Button.style.gridArea = "6 / 5";
		this.snmp2Button.style.backgroundImage = "url(mono/wrench.svg?light)";
		this.snmp2Button.style.backgroundSize = "24px 24px";
		this.snmp2Button.style.backgroundPosition = "center";
		this.snmp2Button.style.backgroundRepeat = "no-repeat";
		this.snmp2Button.style.visibility = "hidden";
		this.snmp2Button.style.opacity = "0";

		this.snmp3Button = document.createElement("input");
		this.snmp3Button.type = "button";
		this.snmp3Button.style.width = this.snmp3Button.style.minWidth = "34px";
		this.snmp3Button.style.gridArea = "7 / 5";
		this.snmp3Button.style.backgroundImage = "url(mono/wrench.svg?light)";
		this.snmp3Button.style.backgroundSize = "24px 24px";
		this.snmp3Button.style.backgroundPosition = "center";
		this.snmp3Button.style.backgroundRepeat = "no-repeat";
		this.snmp3Button.style.visibility = "hidden";
		this.snmp3Button.style.opacity = "0";

		this.ldapCheckbox = document.createElement("input");
		this.ldapCheckbox.type = "checkbox";
		this.ldapCheckbox.checked = true;

		this.portScanCheckbox = document.createElement("input");
		this.portScanCheckbox.type = "checkbox";
		this.portScanCheckbox.checked = true;

		this.portScanInput = document.createElement("select");
		this.portScanInput.style.width = "180px";
		this.portScanInput.style.gridArea = "10 / 5";

		this.portScanCommentLabel = document.createElement("div");
		this.portScanCommentLabel.style.gridArea = "10 / 6 / auto / 8";
		this.portScanCommentLabel.style.fontSize = "small";
		this.portScanCommentLabel.style.lineHeight = "14px";
		this.portScanCommentLabel.style.minWidth = "150px";

		const basicOption = document.createElement("option");
		basicOption.value = "basic";
		basicOption.text = "Basic";
		this.portScanInput.appendChild(basicOption);

		const wellKnownOption = document.createElement("option");
		wellKnownOption.value = "wellknown";
		wellKnownOption.text = "Well known ports";
		this.portScanInput.appendChild(wellKnownOption);

		const extendedOption = document.createElement("option");
		extendedOption.value = "extended";
		extendedOption.text = "Extended";
		this.portScanInput.appendChild(extendedOption);

		const registeredOption = document.createElement("option");
		registeredOption.value = "registered";
		registeredOption.text = "Registered ports";
		this.portScanInput.appendChild(registeredOption);

		const fullOption = document.createElement("option");
		fullOption.value = "full";
		fullOption.text = "Full";
		this.portScanInput.appendChild(fullOption);

		const dynamicOption = document.createElement("option");
		dynamicOption.value = "dynamic";
		dynamicOption.text = "Dynamic ports";
		this.portScanInput.appendChild(dynamicOption);


		this.retriesLabel = document.createElement("div");
		this.retriesLabel.style.gridArea = "12 / 3";
		this.retriesLabel.textContent = "Retries:";

		this.retriesRange = document.createElement("input");
		this.retriesRange.type = "range";
		this.retriesRange.min = 0;
		this.retriesRange.max = 4;
		this.retriesRange.value = 0;
		this.retriesRange.style.gridArea = "12 / 5";
		this.retriesRange.style.width = "180px";

		this.retriesCommentLabel = document.createElement("div");
		this.retriesCommentLabel.style.gridArea = "12 / 6 / auto / 8";
		this.retriesCommentLabel.style.fontSize = "small";
		this.retriesCommentLabel.style.lineHeight = "14px";
		this.retriesCommentLabel.style.minWidth = "150px";

		this.intervalLabel = document.createElement("div");
		this.intervalLabel.style.gridArea = "13 / 3";
		this.intervalLabel.textContent = "Retry interval:";

		this.intervalRange = document.createElement("input");
		this.intervalRange.type = "range";
		this.intervalRange.min = 0;
		this.intervalRange.max = 8;
		this.intervalRange.value = 2;
		this.intervalRange.style.gridArea = "13 / 5";
		this.intervalRange.style.width = "180px";

		this.intervalCommentLabel = document.createElement("div");
		this.intervalCommentLabel.style.gridArea = "13 / 6 / auto / 8";
		this.intervalCommentLabel.style.fontSize = "small";
		this.intervalCommentLabel.style.lineHeight = "14px";
		this.intervalCommentLabel.style.minWidth = "150px";

		this.buttonsBox = document.createElement("div");
		this.buttonsBox.style.gridArea = "15 / 2 / auto / 7";
		this.buttonsBox.style.textAlign = "center";

		const fetchButton = document.createElement("input");
		fetchButton.type = "button";
		fetchButton.value = "Fetch";
		fetchButton.style.minWidth = "96px";

		const cancelButton = document.createElement("input");
		cancelButton.type = "button";
		cancelButton.value = "Close";
		cancelButton.style.minWidth = "96px";

		this.buttonsBox.append(fetchButton, cancelButton);

		this.updateRadio.onchange = this.ipRadio.onchange = this.domainRadio.onchange = ()=> {
			this.ipFrom.SetEnabled(this.ipRadio.checked);
			this.ipTo.SetEnabled(this.ipRadio.checked);
			this.domainInput.disabled = !this.domainRadio.checked;
		};

		this.snmp2Checkbox.onchange = ()=> {
			this.snmp2Button.style.visibility = this.snmp2Checkbox.checked ? "visible" : "hidden";
			this.snmp2Button.style.opacity = this.snmp2Checkbox.checked ? "1" : "0";
		};

		this.snmp3Checkbox.onchange = ()=> {
			this.snmp3Button.style.visibility = this.snmp3Checkbox.checked ? "visible" : "hidden";
			this.snmp3Button.style.opacity = this.snmp3Checkbox.checked ? "1" : "0";
		};

		this.snmp2Button.onclick = async ()=> {
			this.ShowSnmpDialog(2);
		};

		this.snmp3Button.onclick = async ()=> {
			this.ShowSnmpDialog(3);
		};

		this.portScanCheckbox.onchange = ()=> {
			this.portScanInput.disabled = !this.portScanCheckbox.checked;
		};

		this.portScanInput.onchange = ()=> {
			if (this.portScanInput.checked) {
				this.portScanInput.disabled = false;
				this.portScanInput.onchange();
			}
			else {
				this.portScanInput.disabled = true;
				this.portScanCommentLabel.textContent = "";
			}
		};

		this.portScanInput.onchange = ()=> {

			this.portScanCommentLabel.textContent = {
				"basic"      : "Scan only common protocols",
				"wellknown"  : "Scan ports 1 to 1023",
				"extended"   : "Scan ports 1 to 8191",
				"registered" : "Scan ports 1024 to 49151 (slow)",
				"full"       : "Scan ports 1 to 49151 (slow)",
				"dynamic"    : "Scan ports 49152 to 65535 (slow)"
			  } [this.portScanInput.value];
		};

		this.retriesRange.oninput = ()=> {
			if (parseInt(this.retriesRange.value) === 0) {
				this.intervalRange.disabled = true;
				this.intervalCommentLabel.textContent = "";
			}
			else {
				this.intervalRange.disabled = false;
				this.intervalRange.oninput();
			}

			if (parseInt(this.retriesRange.value) === 0) {
				this.retriesCommentLabel.textContent = "Don't try again";
			}
			else if (parseInt(this.retriesRange.value) === 1) {
				this.retriesCommentLabel.textContent = `If unreachable, retry ${this.retriesRange.value} more time`;
			}
			else {
				this.retriesCommentLabel.textContent = `If unreachable, retry up to ${this.retriesRange.value} times`;
			}
		};

		this.intervalRange.oninput = ()=> {
			this.intervalCommentLabel.textContent = {
				0 : "If unreachable, retry after half an hour",
				1 : "If unreachable, retry after an hour",
				2 : "If unreachable, retry after 2 hours",
				3 : "If unreachable, retry after 4 hours",
				4 : "If unreachable, retry after 6 hours",
				5 : "If unreachable, retry after 8 hours",
				6 : "If unreachable, retry after 12 hours",
				7 : "If unreachable, retry after 24 hours",
				8 : "If unreachable, retry after 48 hours"
			} [this.intervalRange.value];
		};

		fetchButton.onclick = async()=> {
			let uri, body;
			if (this.args === "devices") {
				uri = "fetch/devices";
			}
			else if (this.args === "users") {
				uri = "fetch/users";
			}

			if (this.updateRadio.checked) {
				uri += "?update=true";
			}
			else if (this.ipRadio.checked) {
				uri += `?range=${this.ipFrom.GetIpString()}-${this.ipTo.GetIpString()}`;
			}
			else if (this.domainRadio.checked) {
				if (this.domainInput.value.length === 0) {
					this.ConfirmBox("Please enter a domain", true);
					return;
				}
				uri += `?domain=${this.domainInput.value}`;
			}

			if (this.args === "devices") {
				body = "";
				if (this.dnsCheckBox.checked)      body += "dns=true\n";
				if (this.snmp2Checkbox.checked)    body += `snmp2=${this.snmp2Checkbox.checked}\n`;
				if (this.snmp3Checkbox.checked)    body += `snmp3=${this.snmp3Checkbox.checked}\n`;
				if (this.wmiCheckbox.checked)      body += "wmi=true\n";
				if (this.ldapCheckbox.checked)     body += "ldap=true\n";
				if (this.portScanCheckbox.checked) body += `portscan=${this.portScanInput.value}\n`;

				if (this.snmp2Checkbox.checked && this.snmp2Profiles) {
					let profiles = [];
					for (let i=0; i<this.snmp2Profiles.length; i++) {
						if (this.snmp2Profiles[i].checkbox.checked) {
							profiles.push(this.snmp2Profiles[i].profile.guid);
						}
					}

					if (profiles.length > 0) {
						body += `\nsnmp2profiles=${profiles.join(",")}\n`;
					}
				}

				if (this.snmp3Checkbox.checked && this.snmp3Profiles) {
					let profiles = [];
					for (let i=0; i<this.snmp3Profiles.length; i++) {
						if (this.snmp3Profiles[i].checkbox.checked) {
							profiles.push(this.snmp3Profiles[i].profile.guid);
						}
					}

					if (profiles.length > 0) {
						body += `snmp3profiles=${profiles.join(",")}\n`;
					}
				}

				body += `retries=${this.retriesRange.value}\n`;
				body += `interval=${this.intervalRange.value}\n`;
			}
			else if (this.args === "users") {
				body = `fetch/users?domain=${this.domainInput.value}`;
			}

			fetchButton.disabled = cancelButton.disabled = true;

			try {
				const response = await fetch(uri, {
					method: "POST",
					body: body
				});

				if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

				const json = await response.json();
				if (json.error) throw(json.error);

				if (json.status.toLowerCase() === "running" || json.status.toLowerCase() === "idle" || json.status.toLowerCase() === "canceling") {
					this.taskTab.style.visibility = "visible";
					this.taskTab.style.animation = "slide-in .4s 1";

					this.DeselectAllTabs();
					this.taskTab.className = "v-tab-selected";
					this.ShowFetching();
				}
			}
			catch (ex) {
				this.ConfirmBox(ex, true, "mono/error.svg");
			}
			finally {
				fetchButton.disabled = cancelButton.disabled = false;
			}
		};

		cancelButton.onclick = ()=> this.Close();

		this.portScanInput.onchange();
		this.retriesRange.oninput();
		this.intervalRange.oninput();

		this.GetCurrentNetworkInfo();
		this.GetFetchStatus();
	}

	async GetCurrentNetworkInfo() {
		try {
			const response = await fetch("fetch/networkinfo");

			if (response.status !== 200) return;

			const json = await response.json();
			if (json.error) throw(json.error);

			let firstAddress = json.firstIp ? json.firstIp.split(".") : [10,0,0,1];
			let lastAddress = json.lastIp  ? json.lastIp.split(".") : [10,0,0,254];
			let domain = json.domain  ? json.domain : "";

			this.ipFrom.SetIp(firstAddress[0], firstAddress[1], firstAddress[2], firstAddress[3]);
			this.ipTo.SetIp(lastAddress[0], lastAddress[1], lastAddress[2], lastAddress[3]);
			this.domainInput.value = domain;
		}
		catch {}
	}

	async GetFetchStatus() {
		try {
			const response = await fetch("fetch/status");

			if (response.status !== 200) return;

			const json = await response.json();
			if (json.error) throw(json.error);
			this.taskStatus = json;

			if (json.status.toLowerCase() === "running" || json.status.toLowerCase() === "idle" || json.status.toLowerCase() === "canceling") {
				this.taskTab.style.visibility = "visible";
				this.taskTab.style.animation = "slide-in .4s 1";
			}
			else if (json.status.toLowerCase() === "pending") {
				this.taskTab.style.visibility = "visible";
				this.taskTab.style.animation = "slide-in .4s 1";
			}

			if (this.taskTab.style.visibility === "visible" && this.args === "task") {
				this.ShowFetching();
				this.DeselectAllTabs();
				this.taskTab.className = "v-tab-selected";
			}

		}
		catch {}
	}

	async GetSnmpProfiles() {
		try {
			const response = await fetch("config/snmpprofiles/list");

			if (response.status !== 200) return;

			const json = await response.json();
			if (json.error) throw(json.error);

			return json;
		}
		catch (ex) {
			return [];
		}
	}

	async ShowSnmpDialog(version) {
		const dialog = this.DialogBox("360px");
		if (dialog === null) return;

		const {okButton, innerBox} = dialog;

		innerBox.parentElement.style.maxWidth = "480px";

		const title = document.createElement("div");
		title.textContent = version===3 ? "SNMP V3 profiles": "SNMP V1/2 profiles";
		title.style.textAlign = "center";
		title.style.lineHeight = "32px";
		title.style.fontWeight = "800";
		innerBox.appendChild(title);

		const profilesList = document.createElement("div");
		profilesList.className = "no-results";
		profilesList.style.position = "absolute";
		profilesList.style.inset = "32px 20px 8px 20px";
		profilesList.style.overflow = "auto";
		profilesList.style.border = "2px solid var(--clr-control)";
		profilesList.style.borderRadius = "4px";
		innerBox.appendChild(profilesList);

		const attributeElements = [];
		const profiles = await this.GetSnmpProfiles();

		for (let i=0; i<profiles.length; i++) {
			if (profiles[i].version != version) continue;

			const element = document.createElement("div");
			element.className = "list-element";
			profilesList.appendChild(element);

			let checked;
			const snmpProfiles = version===3 ? this.snmp3Profiles : this.snmp2Profiles;
			if (snmpProfiles) {
				let found = snmpProfiles.find(o=> o.profile.guid === profiles[i].guid);
				checked = found ? found.checkbox.checked : false;
			}
			else {
				checked = true;
			}

			const toggle = this.CreateToggle(profiles[i].name, checked, element);
			toggle.label.style.width = "calc(100% - 48px)";
			toggle.label.style.left = "8px";
			toggle.label.style.top = "5px";

			attributeElements.push({
				element: element,
				profile: profiles[i],
				checkbox: toggle.checkbox
			});
		}

		okButton.onclick = ()=> {
			if (version === 3) {
				this.snmp3Profiles = attributeElements;
			}
			else {
				this.snmp2Profiles = attributeElements;
			}
			dialog.Close();
		};

		profilesList.firstChild?.childNodes[1].focus();
	}

	ShowDevices() {
		this.args = "devices";
		this.tabsPanel.textContent = "";
		this.tabsPanel.style.gridTemplateRows = "repeat(3, 40px) repeat(12, 36px)";

		this.tabsPanel.appendChild(this.updateRadio);
		const updateOption = this.AddRadioLabel(this.tabsPanel, this.updateRadio, "Update existing records");
		updateOption.style.gridArea = "1 / 2 / 1 / 6";

		this.ipRadio.disabled = false;
		this.tabsPanel.appendChild(this.ipRadio);
		const ipOption = this.AddRadioLabel(this.tabsPanel, this.ipRadio, "IP range:");
		ipOption.style.gridArea = "2 / 2";

		this.tabsPanel.appendChild(this.rangeBox);
		this.ipFrom.SetEnabled(this.ipRadio.checked);
		this.ipTo.SetEnabled(this.ipRadio.checked);

		this.tabsPanel.appendChild(this.domainRadio);
		const domainOption = this.AddRadioLabel(this.tabsPanel, this.domainRadio, "Domain:");
		domainOption.style.gridArea = "3 / 2";

		this.tabsPanel.appendChild(this.domainInput);

		const protocolsLabel = document.createElement("div");
		protocolsLabel.style.gridArea = "5 / 2";
		protocolsLabel.textContent = "Protocols:";
		this.tabsPanel.appendChild(protocolsLabel);

		this.tabsPanel.appendChild(this.dnsCheckBox);
		const dns = this.AddCheckBoxLabel(this.tabsPanel, this.dnsCheckBox, "DNS");
		dns.style.gridArea = "5 / 3";

		//TODO: SSDP

		this.tabsPanel.appendChild(this.snmp2Checkbox);
		const snmp2 = this.AddCheckBoxLabel(this.tabsPanel, this.snmp2Checkbox, "SNMP V1/2");
		snmp2.style.gridArea = "6 / 3";

		this.tabsPanel.appendChild(this.snmp2Button);

		this.tabsPanel.appendChild(this.snmp3Checkbox);
		const snmp3 = this.AddCheckBoxLabel(this.tabsPanel, this.snmp3Checkbox, "SNMP V3");
		snmp3.style.gridArea = "7 / 3";

		this.tabsPanel.appendChild(this.snmp3Button);

		this.tabsPanel.appendChild(this.wmiCheckbox);
		const wmi = this.AddCheckBoxLabel(this.tabsPanel, this.wmiCheckbox, "WMI");
		wmi.style.gridArea = "8 / 3";

		this.tabsPanel.appendChild(this.ldapCheckbox);
		const ldap = this.AddCheckBoxLabel(this.tabsPanel, this.ldapCheckbox, "LDAP");
		ldap.style.gridArea = "9 / 3";
		this.ldapCheckbox.disabled = false;

		this.tabsPanel.appendChild(this.portScanInput);

		this.tabsPanel.appendChild(this.portScanCheckbox);
		const portScan = this.AddCheckBoxLabel(this.tabsPanel, this.portScanCheckbox, "Port scan");
		portScan.style.gridArea = "10 / 3";

		this.tabsPanel.appendChild(this.portScanInput);
		this.tabsPanel.appendChild(this.portScanCommentLabel);

		this.tabsPanel.append(this.retriesLabel, this.retriesRange, this.retriesCommentLabel);

		this.tabsPanel.append(this.intervalLabel, this.intervalRange, this.intervalCommentLabel);

		this.tabsPanel.appendChild(this.buttonsBox);
		this.buttonsBox.style.gridArea = "15 / 2 / auto / 7";
	}

	ShowUsers() {
		this.args = "users";
		this.tabsPanel.textContent = "";
		this.tabsPanel.style.gridTemplateRows = "repeat(3, 40px) repeat(4, 36px)";

		this.ipRadio.disabled = true;
		this.domainInput.disabled = false;
		if (this.ipRadio.checked) {
			this.domainRadio.checked = true;
		}

		this.tabsPanel.appendChild(this.updateRadio);
		const updateOption = this.AddRadioLabel(this.tabsPanel, this.updateRadio, "Update existing records");
		updateOption.style.gridArea = "1 / 2 / 1 / 6";

		this.tabsPanel.appendChild(this.ipRadio);
		const ipOption = this.AddRadioLabel(this.tabsPanel, this.ipRadio, "IP range:");
		ipOption.style.gridArea = "2 / 2";

		this.tabsPanel.appendChild(this.rangeBox);
		this.ipFrom.SetEnabled(false);
		this.ipTo.SetEnabled(false);

		this.tabsPanel.appendChild(this.domainRadio);
		const domainOption = this.AddRadioLabel(this.tabsPanel, this.domainRadio, "Domain:");
		domainOption.style.gridArea = "3 / 2";

		this.tabsPanel.appendChild(this.domainInput);

		const protocolsLabel = document.createElement("div");
		protocolsLabel.style.gridArea = "5 / 2";
		protocolsLabel.textContent = "Protocols:";
		this.tabsPanel.appendChild(protocolsLabel);

		this.tabsPanel.appendChild(this.ldapCheckbox);
		const ldap = this.AddCheckBoxLabel(this.tabsPanel, this.ldapCheckbox, "LDAP");
		ldap.style.gridArea = "5 / 3";
		this.ldapCheckbox.checked = true;
		this.ldapCheckbox.disabled = true;

		this.tabsPanel.appendChild(this.buttonsBox);
		this.buttonsBox.style.gridArea = "7 / 2 / auto / 7";
	}

	ShowImport() {
		this.args = "protest";
		this.tabsPanel.textContent = "";
		this.tabsPanel.style.gridTemplateRows = "repeat(12, 40px)";

		const protestLabel = document.createElement("div");
		protestLabel.style.gridArea = "1 / 3";
		protestLabel.textContent = "Target's IP:";
		this.tabsPanel.appendChild(protestLabel);
		const targetBox = document.createElement("div");
		targetBox.style.gridArea = "1 / 5";
		this.tabsPanel.appendChild(targetBox);
		const targetInput = new IpBox();
		targetInput.SetIp(127,0,0,1);
		targetInput.Attach(targetBox);

		const portLabel = document.createElement("div");
		portLabel.style.gridArea = "2 / 3";
		portLabel.textContent = "Port:";
		this.tabsPanel.appendChild(portLabel);
		const portInput = document.createElement("input");
		portInput.type = "number";
		portInput.min = "1";
		portInput.max = "65535";
		portInput.value = "443";
		portInput.style.gridArea = "2 / 5";
		portInput.style.marginLeft = "0";
		portInput.style.width = "180px";
		this.tabsPanel.appendChild(portInput);
		targetInput.exitElement = portInput;

		const protocolLabel = document.createElement("div");
		protocolLabel.style.gridArea = "3 / 3";
		protocolLabel.textContent = "Protocol:";
		this.tabsPanel.appendChild(protocolLabel);
		const protocolInput = document.createElement("select");
		protocolInput.style.gridArea = "3 / 5";
		protocolInput.style.marginLeft = "0";
		protocolInput.style.width = "180px";
		protocolInput.style.boxSizing = "initial";
		this.tabsPanel.appendChild(protocolInput);

		const httpOption = document.createElement("option");
		httpOption.text = "HTTP";
		httpOption.value = "http";
		protocolInput.appendChild(httpOption);
		const httpsOption = document.createElement("option");
		httpsOption.text = "HTTPS";
		httpsOption.value = "https";
		protocolInput.appendChild(httpsOption);

		protocolInput.value = "https";

		const usernameLabel = document.createElement("div");
		usernameLabel.style.gridArea = "4 / 3";
		usernameLabel.textContent = "Username:";
		this.tabsPanel.appendChild(usernameLabel);

		const usernameInput = document.createElement("input");
		usernameInput.type = "text";
		usernameInput.placeholder = ".\\administrator";
		usernameInput.disabled = true;
		usernameInput.style.gridArea = "4 / 5";
		usernameInput.style.marginLeft = "0";
		usernameInput.style.width = "180px";
		this.tabsPanel.appendChild(usernameInput);

		const passwordLabel = document.createElement("div");
		passwordLabel.style.gridArea = "5 / 3";
		passwordLabel.textContent = "Password:";
		this.tabsPanel.appendChild(passwordLabel);
		const passwordInput = document.createElement("input");
		passwordInput.type = "password";
		passwordInput.disabled = true;
		passwordInput.style.gridArea = "5 / 5";
		passwordInput.style.marginLeft = "0";
		passwordInput.style.width = "180px";
		this.tabsPanel.appendChild(passwordInput);

		const deviceLabel = document.createElement("div");
		deviceLabel.style.gridArea = "6 / 3";
		deviceLabel.textContent = "Import devices:";
		this.tabsPanel.appendChild(deviceLabel);
		const deviceBox = document.createElement("div");
		deviceBox.style.gridArea = "6 / 5";
		this.tabsPanel.appendChild(deviceBox);

		const deviceToggle = this.CreateToggle(".", true, deviceBox);
		deviceToggle.label.style="width:4px; min-width:4px; padding-left:8px;";

		const usersLabel = document.createElement("div");
		usersLabel.style.gridArea = "7 / 3";
		usersLabel.textContent = "Import users:";
		this.tabsPanel.appendChild(usersLabel);
		const usersBox = document.createElement("div");
		usersBox.style.gridArea = "7 / 5";
		this.tabsPanel.appendChild(usersBox);

		const usersToggle = this.CreateToggle(".", true, usersBox);
		usersToggle.label.style="width:4px; min-width:4px; padding-left:8px;";

		const debitNotesLabel = document.createElement("div");
		debitNotesLabel.style.gridArea = "8 / 3";
		debitNotesLabel.textContent = "Import debit notes:";
		this.tabsPanel.appendChild(debitNotesLabel);
		const debitNotesBox = document.createElement("div");
		debitNotesBox.style.gridArea = "8 / 5";
		this.tabsPanel.appendChild(debitNotesBox);

		const debitNotesToggle = this.CreateToggle(".", false, debitNotesBox);
		debitNotesToggle.label.style="width:4px; min-width:4px; padding-left:8px;";

		const buttonsBox = document.createElement("div");
		buttonsBox.style.gridArea = "10 / 2 / auto / 7";
		buttonsBox.style.textAlign = "center";
		this.tabsPanel.appendChild(buttonsBox);

		const inputButton = document.createElement("input");
		inputButton.type = "button";
		inputButton.value = "Import";
		inputButton.style.minWidth = "96px";
		buttonsBox.appendChild(inputButton);

		const cancelButton = document.createElement("input");
		cancelButton.type = "button";
		cancelButton.value = "Close";
		cancelButton.style.minWidth = "96px";
		buttonsBox.appendChild(cancelButton);

		const warningBox = document.createElement("div");
		warningBox.textContent = "Use this utility to import an inventory from another Pro-test. It's recommended to import on a blank database. Conflicts and duplicate records will not be managed.";
		warningBox.style.gridArea = "12 / 2 / auto / 7";
		warningBox.style.fontSize = "small";
		warningBox.style.paddingLeft = "56px";
		warningBox.style.minHeight = "40px";
		warningBox.style.backgroundImage = "url(mono/warning.svg)";
		warningBox.style.backgroundPosition = "2px center";
		warningBox.style.backgroundSize = "40px 40px";
		warningBox.style.backgroundRepeat = "no-repeat";
		this.tabsPanel.appendChild(warningBox);

		inputButton.onclick = async ()=> {
			const dialog = this.DialogBox("180px");
			if (dialog === null) return;

			try {
				inputButton.disabled = cancelButton.disabled = true;

				dialog.innerBox.parentElement.style.maxWidth = "400px";
				dialog.innerBox.style.textAlign = "center";
				dialog.okButton.value = "Hide";
				dialog.cancelButton.style.display = "none";

				const spinner = document.createElement("div");
				spinner.className = "spinner";
				spinner.style.textAlign = "left";
				spinner.style.marginTop = "32px";
				spinner.style.marginBottom = "16px";
				spinner.appendChild(document.createElement("div"));
				dialog.innerBox.appendChild(spinner);

				const status = document.createElement("div");
				status.textContent = "Importing data...";
				status.style.textAlign = "center";
				status.style.fontWeight = "bold";
				status.style.animation = "delayed-fade-in 1.5s ease-in 1";
				dialog.innerBox.appendChild(status);

				let uri = `fetch/import?ip=${targetInput.GetIpString()}&port=${portInput.value}&protocol=${protocolInput.value}&username=${encodeURIComponent(usernameInput.value)}&password=${encodeURIComponent(passwordInput.value)}&devices=${deviceToggle.checkbox.checked}&users=${usersToggle.checkbox.checked}&debitnotes=${debitNotesToggle.checkbox.checked}`;
				const response = await fetch(uri);

				dialog.Close();

				if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

				const json = await response.json();
				if (json.error) throw(json.error);

				if (json.status === "ok") {
					//TODO:
				}
			}
			catch (ex) {
				dialog.Close();
				setTimeout(()=>this.ConfirmBox(ex, true, "mono/error.svg"), 250);
			}
			finally {
				inputButton.disabled = cancelButton.disabled = false;
			}
		};

		cancelButton.onclick = ()=> this.Close();
	}

	async ShowFetching() {
		this.args = "fetching";
		this.tabsPanel.textContent = "";

		const nameLabel = document.createElement("div");
		nameLabel.style.gridArea = "2 / 7 / auto / 2";
		nameLabel.style.textAlign = "center";
		nameLabel.style.fontWeight = "600";
		nameLabel.style.textDecoration = "underline";
		if (this.taskStatus) nameLabel.textContent = this.taskStatus.name;
		this.tabsPanel.appendChild(nameLabel);

		const statusLabel = document.createElement("div");
		statusLabel.style.gridArea = "4 / 3";
		statusLabel.textContent = "Status:";
		this.tabsPanel.appendChild(statusLabel);
		this.statusValueLabel.style.gridArea = "4 / 5";
		this.tabsPanel.appendChild(this.statusValueLabel);


		const dateLabel = document.createElement("div");
		dateLabel.style.gridArea = "5 / 3";
		dateLabel.textContent = "Started date:";
		this.tabsPanel.appendChild(dateLabel);
		const dateValueLabel = document.createElement("div");
		dateValueLabel.style.gridArea = "5 / 5";
		dateValueLabel.style.fontWeight = "600";
		let startedDate = new Date(UI.TicksToUnixDate(this.taskStatus?.started ?? UNIX_BASE_TICKS));
		dateValueLabel.textContent = `${startedDate.toLocaleDateString(UI.regionalFormat, {})} ${startedDate.toLocaleTimeString(UI.regionalFormat, {})}`;
		this.tabsPanel.appendChild(dateValueLabel);

		const progressLabel = document.createElement("div");
		progressLabel.style.gridArea = "6 / 3";
		progressLabel.textContent = "Progress:";
		this.tabsPanel.appendChild(progressLabel);
		this.progressValueLabel.style.gridArea = "6 / 5";
		if (this.taskStatus) this.progressValueLabel.textContent = `${this.taskStatus.completed}/${this.taskStatus.total}`;
		this.tabsPanel.appendChild(this.progressValueLabel);

		const etcLabel = document.createElement("div");
		etcLabel.style.gridArea = "7 / 3";
		etcLabel.textContent = "Etc:";
		this.tabsPanel.appendChild(etcLabel);
		this.etcValueLabel.style.gridArea = "7 / 5";
		if (this.taskStatus) this.etcValueLabel.textContent = this.taskStatus.etc;
		this.tabsPanel.appendChild(this.etcValueLabel);

		const progressBarOuter = document.createElement("div");
		progressBarOuter.style.gridArea = "8 / 3 / auto / 6";
		progressBarOuter.style.height = "18px";
		progressBarOuter.style.border = "var(--clr-dark) 2px solid";
		progressBarOuter.style.borderRadius = "4px";
		this.tabsPanel.appendChild(progressBarOuter);
		if (this.taskStatus) this.progressBarInner.style.width = `${100 * this.taskStatus.completed / this.taskStatus.total}%`;
		progressBarOuter.appendChild(this.progressBarInner);

		const buttonsBox = document.createElement("div");
		buttonsBox.style.gridArea = "10 / 3 / auto / 6";
		buttonsBox.style.textAlign = "center";
		this.tabsPanel.appendChild(buttonsBox);

		const abortButton = document.createElement("input");
		abortButton.type = "button";
		abortButton.value = "Abort";
		abortButton.style.minWidth = "96px";
		buttonsBox.appendChild(abortButton);

		try {
			const response = await fetch("fetch/status");

			if (response.status !== 200) return;

			const json = await response.json();
			if (json.error) throw(json.error);
			this.taskStatus = json;

			if (json.status.toLowerCase() === "pending") {
				this.ShowPending(json);
			}
			else if (json.status.toLowerCase() === "running" || json.status.toLowerCase() === "idle" || json.status.toLowerCase() === "canceling") {
				nameLabel.textContent = json.name;
				let startedDate = new Date(UI.TicksToUnixDate(json.started));
				dateValueLabel.textContent = `${startedDate.toLocaleDateString(UI.regionalFormat, {})} ${startedDate.toLocaleTimeString(UI.regionalFormat, {})}`;
				this.statusValueLabel.textContent = json.status;
				this.progressValueLabel.textContent = `${json.completed}/${json.total}`;
				this.etcValueLabel.textContent = json.etc;
				this.progressBarInner.style.width = `${(100 * json.completed) / json.total}%`;
			}
			else {
				this.taskTab.style.visibility = "hidden";
				this.taskTab.style.animation = "none";
				this.DeselectAllTabs();
				this.tabsList[0].className = "v-tab-selected";
				this.tabsList[0].onclick();
			}

			if (json.status.toLowerCase() === "canceling") {
				abortButton.disabled = true;
			}
		}
		catch {}

		abortButton.onclick = ()=> {
			this.ConfirmBox("Are you sure you want to abort this task?").addEventListener("click", async()=> {
				try {
					const response = await fetch("fetch/abort");

					if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

					const json = await response.json();
					if (json.error) throw(json.error);

					if (json.status === "ok") {
						this.statusValueLabel.textContent = "canceling";
						abortButton.disabled = true;
					}
				}
				catch (ex) {
					this.ConfirmBox(ex, true, "mono/error.svg");
				}
			});
		};
	}

	ShowPending(json) {
		this.tabsPanel.textContent = "";

		const nameLabel = document.createElement("div");
		nameLabel.style.gridArea = "1 / 7 / auto / 2";
		nameLabel.style.textAlign = "center";
		nameLabel.style.fontWeight = "600";
		nameLabel.style.textDecoration = "underline";
		if (this.taskStatus) nameLabel.textContent = json.name;
		this.tabsPanel.appendChild(nameLabel);

		const startLabel = document.createElement("div");
		startLabel.style.gridArea = "3 / 3";
		startLabel.textContent = "Started date:";
		this.tabsPanel.appendChild(startLabel);
		const startValueLabel = document.createElement("div");
		startValueLabel.style.gridArea = "3 / 5";
		startValueLabel.style.fontWeight = "600";
		let startedDate = new Date(UI.TicksToUnixDate(json.started));
		startValueLabel.textContent = `${startedDate.toLocaleDateString(UI.regionalFormat, {})} ${startedDate.toLocaleTimeString(UI.regionalFormat, {})}`;
		this.tabsPanel.appendChild(startValueLabel);

		const finishLabel = document.createElement("div");
		finishLabel.style.gridArea = "4 / 3";
		finishLabel.textContent = "Finished date:";
		this.tabsPanel.appendChild(finishLabel);
		const finishValueLabel = document.createElement("div");
		finishValueLabel.style.gridArea = "4 / 5";
		finishValueLabel.style.fontWeight = "600";
		let finishedDate = new Date(UI.TicksToUnixDate(json.finished));
		finishValueLabel.textContent = `${finishedDate.toLocaleDateString(UI.regionalFormat, {})} ${finishedDate.toLocaleTimeString(UI.regionalFormat, {})}`;
		this.tabsPanel.appendChild(finishValueLabel);

		const successLabel = document.createElement("div");
		successLabel.style.gridArea = "5 / 3";
		successLabel.textContent = "Successfully fetched:";
		this.tabsPanel.appendChild(successLabel);
		const successValueLabel = document.createElement("div");
		successValueLabel.style.gridArea = "5 / 5";
		successValueLabel.style.fontWeight = "600";
		if (this.taskStatus) successValueLabel.textContent = json.successful;
		this.tabsPanel.appendChild(successValueLabel);

		const unsuccessLabel = document.createElement("div");
		unsuccessLabel.style.gridArea = "6 / 3";
		unsuccessLabel.textContent = "Unsuccessful:";
		this.tabsPanel.appendChild(unsuccessLabel);
		const unsuccessValueLabel = document.createElement("div");
		unsuccessValueLabel.style.gridArea = "6 / 5";
		unsuccessValueLabel.style.fontWeight = "600";
		if (this.taskStatus) unsuccessValueLabel.textContent = json.unsuccessful;
		this.tabsPanel.appendChild(unsuccessValueLabel);


		const conflictConditionLabel = document.createElement("div");
		conflictConditionLabel.style.gridArea = "8 / 3";
		conflictConditionLabel.textContent = "Conflict condition:";
		this.tabsPanel.appendChild(conflictConditionLabel);
		const conflictConditionInput = document.createElement("select");
		conflictConditionInput.style.gridArea = "8 / 5";
		conflictConditionInput.style.marginLeft = "0";
		conflictConditionInput.style.width = "160px";
		this.tabsPanel.appendChild(conflictConditionInput);
		const conflictConditionCommentLabel = document.createElement("div");
		conflictConditionCommentLabel.style.gridArea = "8 / 6 / auto / 8";
		conflictConditionCommentLabel.style.fontSize = "small";
		//conflictConditionCommentLabel.style.width = "240px";
		conflictConditionCommentLabel.textContent = "Trigger a conflict when the condition is met";
		this.tabsPanel.appendChild(conflictConditionCommentLabel);

		if (json.type === "devices") {
			const ipOption = document.createElement("option");
			ipOption.text = "Same IP address";
			ipOption.value = "ip";
			conflictConditionInput.appendChild(ipOption);

			const macOption = document.createElement("option");
			macOption.text = "Same MAC address";
			macOption.value = "mac address";
			conflictConditionInput.appendChild(macOption);

			const hostnameOption = document.createElement("option");
			hostnameOption.text = "Same hostname";
			hostnameOption.value = "hostname";
			conflictConditionInput.appendChild(hostnameOption);

			const guidOption = document.createElement("option");
			guidOption.text = "Same GUID";
			guidOption.value = "object guid";
			conflictConditionInput.appendChild(guidOption);

			conflictConditionInput.value = "ip";
		}
		else if (json.type === "users") {
			const usernameOption = document.createElement("option");
			usernameOption.text = "Same username";
			usernameOption.value = "username";
			conflictConditionInput.appendChild(usernameOption);
			const guidOption = document.createElement("option");
			guidOption.text = "Same GUID";
			guidOption.value = "object guid";
			conflictConditionInput.appendChild(guidOption);

			conflictConditionInput.value = "username";
		}

		const conflictLabel = document.createElement("div");
		conflictLabel.style.gridArea = "9 / 3";
		conflictLabel.textContent = "Conflict action:";
		this.tabsPanel.appendChild(conflictLabel);
		const conflictInput = document.createElement("select");
		conflictInput.style.gridArea = "9 / 5";
		conflictInput.style.marginLeft = "0";
		conflictInput.style.width = "160px";
		this.tabsPanel.appendChild(conflictInput);
		const conflictCommentLabel = document.createElement("div");
		conflictCommentLabel.style.gridArea = "9 / 6 / auto / 8";
		conflictCommentLabel.style.fontSize = "small";
		conflictCommentLabel.style.width = "240px";
		this.tabsPanel.appendChild(conflictCommentLabel);

		const skipOption = document.createElement("option");
		skipOption.text = "Skip";
		skipOption.value = 0;
		conflictInput.appendChild(skipOption);
		const keepBothOption = document.createElement("option");
		keepBothOption.text = "Keep both";
		keepBothOption.value = 1;
		conflictInput.appendChild(keepBothOption);
		const overwriteOption = document.createElement("option");
		overwriteOption.text = "Overwrite";
		overwriteOption.value = 2;
		conflictInput.appendChild(overwriteOption);
		const appendOption = document.createElement("option");
		appendOption.text = "Append";
		appendOption.value = 3;
		conflictInput.appendChild(appendOption);
		const mergeOption = document.createElement("option");
		mergeOption.text = "Merge";
		mergeOption.value = 4;
		conflictInput.appendChild(mergeOption);

		conflictInput.value = 4;

		const buttonsBox = document.createElement("div");
		buttonsBox.style.gridArea = "11 / 2 / auto / 7";
		buttonsBox.style.textAlign = "center";
		this.tabsPanel.appendChild(buttonsBox);

		const approveButton = document.createElement("input");
		approveButton.type = "button";
		approveButton.value = "Approve";
		approveButton.style.minWidth = "96px";
		buttonsBox.appendChild(approveButton);

		const discardButton = document.createElement("input");
		discardButton.type = "button";
		discardButton.value = "Discard";
		discardButton.style.minWidth = "96px";
		buttonsBox.appendChild(discardButton);

		conflictInput.onchange = ()=> {
			switch (parseInt(conflictInput.value)) {
			case 0: conflictCommentLabel.textContent = "Do nothing, keep original record"; break;
			case 1: conflictCommentLabel.textContent = "Create a new record"; break;
			case 2: conflictCommentLabel.textContent = "Replace original record"; break;
			case 3: conflictCommentLabel.textContent = "Append only new properties"; break;
			case 4: conflictCommentLabel.textContent = "Merge with original record"; break;
			}
		};

		approveButton.onclick = ()=> {
			this.ConfirmBox("Are you sure you want to approve the fetched dataset?").addEventListener("click", async()=> {
				try {
					let uri = `fetch/approve?condition=${conflictConditionInput.value}&action=${conflictInput.value}`;

					const response = await fetch(uri);

					if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

					const json = await response.json();
					if (json.error) throw(json.error);

					if (json.status === "ok") {
						this.taskTab.style.visibility = "hidden";
						this.taskTab.style.animation = "none";
						this.DeselectAllTabs();
						this.tabsList[0].className = "v-tab-selected";
						this.tabsList[0].onclick();
					}
				}
				catch (ex) {
					this.ConfirmBox(ex, true, "mono/error.svg");
				}
			});
		};

		discardButton.onclick = ()=> {
			this.ConfirmBox("Are you sure you want to discard the fetched dataset?").addEventListener("click", async()=> {
				try {
					const response = await fetch("fetch/discard");

					if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

					const json = await response.json();
					if (json.error) throw(json.error);

					if (json.status === "ok") {
						this.taskTab.style.visibility = "hidden";
						this.taskTab.style.animation = "none";
						this.DeselectAllTabs();
						this.tabsList[0].className = "v-tab-selected";
						this.tabsList[0].onclick();
					}
				}
				catch (ex) {
					this.ConfirmBox(ex, true, "mono/error.svg");
				}
			});
		};

		conflictInput.onchange();
	}
}
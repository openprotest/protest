"use strict";
class Infrastructure extends Tabs {
	static SMTP_PROVIDERS = ["SMTP server", "Outlook", "Gmail"];

	constructor(args) {
		super();

		this.args = args ?? "";

		Window.AddCssDependencies("list.css");

		this.SetTitle("Infrastructure");
		this.SetIcon("mono/infrastructure.svg");

		this.zones = [];
		this.dhcpRange = [];
		this.smtpProfiles = [];
		this.snmpProfiles = [];
		this.integrations = [];
		this.integrationTypes = null;
		this.selectedIntegration = null;

		this.tabsPanel.style.padding = "24px";
		this.tabsPanel.style.overflowY = "auto";

		this.zonesTab       = this.AddTab("Zones", "mono/router.svg");
		this.dhcpTab        = this.AddTab("DHCP range", "mono/dhcp.svg");
		this.adTab          = this.AddTab("Active directory", "mono/directory.svg");
		this.smtpTab        = this.AddTab("SMTP", "mono/email.svg");
		this.snmpTab        = this.AddTab("SNMP", "mono/snmp.svg");
		this.integrationTab = this.AddTab("Integration", "mono/integration.svg");
		this.dataRetention  = this.AddTab("Data retention", "mono/dataretention.svg");

		this.zonesTab.onclick       = ()=> this.ShowZones();
		this.dhcpTab.onclick        = ()=> this.ShowDhcpRange();
		this.adTab.onclick          = ()=> this.ShowActiveDirectory();
		this.smtpTab.onclick        = ()=> this.ShowSmtp();
		this.snmpTab.onclick        = ()=> this.ShowSnmp();
		this.dataRetention.onclick  = ()=> this.ShowDataRetention();
		this.integrationTab.onclick = ()=> this.ShowIntegration();

		this.activeColumnsListBox = null;
		this.win.addEventListener("mouseup", event=> this.activeColumnsListBox?.HandleMouseUp(event));
		this.win.addEventListener("mousemove", event=> this.activeColumnsListBox?.HandleMouseMove(event));

		switch (this.args) {
		case "dhcp":
			this.dhcpTab.className = "v-tab-selected";
			this.ShowDhcpRange();
			break;

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

		case "integration":
			this.integrationTab.className = "v-tab-selected";
			this.ShowIntegration();
			break;

		case "dataretention":
			this.dataRetention.className = "v-tab-selected";
			this.ShowDataRetention();
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

		this.activeColumnsListBox?.FinalizeColumns();
	}

	ShowDataRetention() {
		this.args = "dataretention";
		this.tabsPanel.textContent = "";

		const deleteContainer = document.createElement("div");
		deleteContainer.style.padding = "20px";
		deleteContainer.style.border = "2px solid var(--clr-control)";
		deleteContainer.style.borderRadius = "8px";
		this.tabsPanel.appendChild(deleteContainer);

		const deleteSectionTitle = document.createElement("div");
		deleteSectionTitle.textContent = "Delete historical data";
		deleteSectionTitle.style.fontWeight = "700";
		deleteSectionTitle.style.fontSize = "1.05em";
		deleteSectionTitle.style.padding = "0 12px 8px";
		deleteContainer.appendChild(deleteSectionTitle);

		const intro = document.createElement("div");
		intro.textContent = "Permanently delete historical data older than a chosen number of days. This cannot be undone.";
		intro.style.padding = "0 12px";
		intro.style.marginBottom = "16px";
		deleteContainer.appendChild(intro);

		const recordingContainer = document.createElement("div");
		recordingContainer.style.display = "grid";
		recordingContainer.style.gridTemplateColumns = "48px 32px 200px 1fr";
		recordingContainer.style.alignItems = "center";
		recordingContainer.style.columnGap = "16px";
		recordingContainer.style.padding = "20px";
		recordingContainer.style.margin = "40px 0 20px 0";
		recordingContainer.style.border = "2px solid var(--clr-control)";
		recordingContainer.style.borderRadius = "8px";
		this.tabsPanel.appendChild(recordingContainer);

		const recordingToggleBox = document.createElement("div");
		recordingToggleBox.style.transform = "translateY(-14px)";
		recordingContainer.appendChild(recordingToggleBox);

		const recordingToggle = this.CreateToggle("", false, recordingToggleBox);
		recordingToggle.checkbox.disabled = true;

		const recordingIcon = document.createElement("div");
		recordingIcon.style.width = "28px";
		recordingIcon.style.height = "28px";
		recordingIcon.style.backgroundImage = "url(mono/screenrecord.svg)";
		recordingIcon.style.backgroundSize = "28px 28px";
		recordingIcon.style.backgroundRepeat = "no-repeat";
		recordingContainer.appendChild(recordingIcon);

		const recordingLabel = document.createElement("div");
		recordingLabel.textContent = "Enable Session recording";
		recordingLabel.style.fontWeight = "600";
		recordingContainer.appendChild(recordingLabel);

		const recordingDescription = document.createElement("div");
		recordingDescription.textContent = "Record VNC, SSH, telnet, remote shell, serial console, and terminal sessions.";
		recordingDescription.style.fontSize = "smaller";
		recordingDescription.style.opacity = "0.8";
		recordingContainer.appendChild(recordingDescription);

		recordingToggle.checkbox.onchange = async ()=> {
			recordingToggle.checkbox.disabled = true;

			try {
				const response = await fetch("config/sessionrecording/save", {
					method: "POST",
					body: JSON.stringify({enable: recordingToggle.checkbox.checked})
				});

				if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

				const json = await response.json();
				if (json.error) throw json.error;
			}
			catch (ex) {
				recordingToggle.checkbox.checked = !recordingToggle.checkbox.checked;
				this.ConfirmBox(ex, true, "mono/error.svg");
			}
			finally {
				recordingToggle.checkbox.disabled = false;
			}
		};

		(async ()=> {
			try {
				const response = await fetch("config/sessionrecording/get");
				if (response.status !== 200) return;

				const json = await response.json();
				if (json.error) return;

				recordingToggle.checkbox.checked = !!json.enable;
			}
			catch {}
			finally {
				recordingToggle.checkbox.disabled = false;
			}
		})();

		const MIN_DAYS = 30;

		const categories = [
			{ key: "devicetimeline", label: "Device timeline",    icon: "mono/timeline.svg",     endpoint: "config/dataretention/devicetimeline", defaultDays: 365, description: "Historical attribute snapshots kept whenever a device changes." },
			{ key: "usertimeline",   label: "User timeline",      icon: "mono/timeline.svg",     endpoint: "config/dataretention/usertimeline",   defaultDays: 365, description: "Historical attribute snapshots kept whenever a user changes." },
			{ key: "lifeline",       label: "Lifeline",           icon: "mono/lifeline.svg",     endpoint: "config/dataretention/lifeline",       defaultDays: 365, description: "Historical ping, CPU, memory, disk, and printer/switch counters." },
			{ key: "lastseen",       label: "Last seen",          icon: "mono/lastseen.svg",     endpoint: "config/dataretention/lastseen",       defaultDays: 365, description: "The most recent time each device responded." },
			{ key: "watchdog",       label: "Watchdog",           icon: "mono/watchdog.svg",     endpoint: "config/dataretention/watchdog",       defaultDays: 90,  description: "Historical uptime results recorded by watchers." },
			{ key: "recordings",     label: "Session recordings", icon: "mono/screenrecord.svg", endpoint: "config/dataretention/recordings",     defaultDays: 30,  description: "Recorded VNC, SSH, telnet, remote shell, serial console, and terminal sessions." },
			{ key: "logs",           label: "Logs",               icon: "mono/log.svg",          endpoint: "config/dataretention/logs",           defaultDays: 90,  description: "Action log files." },
		];

		const rows = [];

		for (const category of categories) {
			const row = document.createElement("div");
			row.style.display = "grid";
			row.style.gridTemplateColumns = "48px 32px 160px 1fr auto";
			row.style.alignItems = "center";
			row.style.columnGap = "16px";
			row.style.padding = "14px 12px";
			row.style.borderBottom = "1px solid var(--clr-control)";
			deleteContainer.appendChild(row);

			const toggleBox = document.createElement("div");
			toggleBox.style.transform = "translateY(-14px)";
			row.appendChild(toggleBox);

			const toggle = this.CreateToggle("", false, toggleBox);
			const checkbox = toggle.checkbox;

			const icon = document.createElement("div");
			icon.style.width = "28px";
			icon.style.height = "28px";
			icon.style.backgroundImage = `url(${category.icon})`;
			icon.style.backgroundSize = "28px 28px";
			icon.style.backgroundRepeat = "no-repeat";
			row.appendChild(icon);

			const label = document.createElement("div");
			label.textContent = category.label;
			label.style.fontWeight = "600";
			row.appendChild(label);

			const description = document.createElement("div");
			description.textContent = category.description;
			description.style.fontSize = "smaller";
			description.style.opacity = "0.8";
			row.appendChild(description);

			const daysBox = document.createElement("div");
			daysBox.style.whiteSpace = "nowrap";
			daysBox.style.textAlign = "right";

			const daysInput = document.createElement("input");
			daysInput.type = "number";
			daysInput.min = MIN_DAYS.toString();
			daysInput.value = Math.max(category.defaultDays, MIN_DAYS);
			daysInput.style.width = "70px";
			daysInput.style.marginRight = "4px";
			daysInput.disabled = true;
			daysBox.appendChild(daysInput);
			daysBox.append(" days");
			row.appendChild(daysBox);

			checkbox.onchange = ()=> { daysInput.disabled = !checkbox.checked; };

			rows.push({ category, checkbox, daysInput });
		}

		const footer = document.createElement("div");
		footer.style.textAlign = "right";
		footer.style.padding = "20px 0 0 0";
		deleteContainer.appendChild(footer);

		const deleteButton = document.createElement("input");
		deleteButton.type = "button";
		deleteButton.value = "Delete selected";
		deleteButton.className = "with-icon";
		deleteButton.style.backgroundImage = "url(mono/delete.svg?light)";
		footer.appendChild(deleteButton);

		deleteButton.onclick = ()=> {
			const selected = rows.filter(r=> r.checkbox.checked);
			if (selected.length === 0) return;

			for (const r of selected) {
				const days = parseInt(r.daysInput.value);
				if (isNaN(days) || days < MIN_DAYS) {
					this.ConfirmBox(`The minimum retention period is ${MIN_DAYS} days.`, true, "mono/warning.svg");
					return;
				}
			}

			const names = selected.map(r=> r.category.label.toLowerCase()).join(", ");

			this.ConfirmBox(`Are you sure you want to delete data older than the selected period for: ${names}? This cannot be undone.`, false, "mono/delete.svg").addEventListener("click", async ()=> {
				deleteButton.disabled = true;

				const results = [];

				for (const r of selected) {
					const days = parseInt(r.daysInput.value);

					try {
						const response = await fetch(`${r.category.endpoint}?days=${days}`);
						if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

						const json = await response.json();
						if (json.error) throw json.error;

						results.push(`${r.category.label}: deleted ${json.deleted} item(s)`);
					}
					catch (ex) {
						results.push(`${r.category.label}: failed (${ex})`);
					}
				}

				deleteButton.disabled = false;
				this.ConfirmBox(results.join("\n"), true, "mono/checked.svg");
			});
		};
	}

	ShowZones() {
		this.args = "zones";
		this.tabsPanel.textContent = "";

		this.options = document.createElement("div");
		this.options.className = "rbac-options";
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

		this.zonesListBox = new ListBox({
			firstColumnOffset: "4px",
			onSelect: (id, element)=> { this.selectedZone = element._data; },
			onDoubleClick: data=> this.ZoneDialog(data)
		});
		this.zonesListBox.SetupTitleBar();
		this.zonesListBox.SetupBuiltInSort();
		this.activeColumnsListBox = this.zonesListBox;

		this.zonesListBox.listTitleOuter.style.left = "20px";
		this.zonesListBox.listTitleOuter.style.right = "20px";
		this.zonesListBox.listTitleOuter.style.top = "50px";
		this.tabsPanel.appendChild(this.zonesListBox.listTitleOuter);

		this.zonesList = this.zonesListBox.list;
		this.zonesList.style.overflowY = "auto";
		this.zonesList.style.left = "20px";
		this.zonesList.style.right = "20px";
		this.zonesList.style.top = "80px";
		this.zonesList.style.bottom = "20px";
		this.zonesList.style.border = "rgb(82,82,82) solid 2px";
		this.zonesList.addEventListener("keydown", event=> this.zonesListBox.Keydown(event));
		this.tabsPanel.appendChild(this.zonesList);

		this.zonesListBox.SetupColumns([
			{label:"Name", value:d=> d.name},
			{label:"Network zone", value:d=> d.network},
			{label:"VLAN ID", value:d=> d.vlan},
			{label:"Color", sortValue:d=> d.color, render:d=> {
				const box = document.createElement("div");
				box.style.top = "4px";
				box.style.width = "40px";
				box.style.maxWidth = "40px";
				box.style.height = "24px";
				box.style.marginLeft = "2px";
				box.style.borderRadius = "4px";
				box.style.backgroundColor = d.color;
				box.style.boxShadow = "var(--clr-dark) 0 0 0 1px inset";
				return box;
			}}
		]);

		this.zonesNewButton.onclick = ()=> this.ZoneDialog(null);

		this.zonesRemoveButton.onclick = ()=> {
			if (!this.selectedZone) return;

			let index = this.zones.indexOf(this.selectedZone);
			if (index === -1) return;

			this.ConfirmBox("Are you sure you want to remove this zone?", false, "mono/delete.svg").addEventListener("click", ()=>{
				this.zones.splice(index, 1);
				this.SaveZones();
				this.selectedZone = null;
				this.zonesListBox.SetItems(this.zones);
			});
		};

		this.GetZones();
		this.AfterResize();
	}

	ShowDhcpRange() {
		this.args = "dhcp";
		this.tabsPanel.textContent = "";

		this.options = document.createElement("div");
		this.options.className = "rbac-options";
		this.options.style.position = "absolute";
		this.options.style.left = "20px";
		this.options.style.right = "8px";
		this.options.style.top = "8px";
		this.options.style.overflow = "hidden";
		this.options.style.whiteSpace = "nowrap";
		this.tabsPanel.appendChild(this.options);

		this.dhcpNewButton = document.createElement("input");
		this.dhcpNewButton.type = "button";
		this.dhcpNewButton.value = "New";
		this.dhcpNewButton.className = "with-icon";
		this.dhcpNewButton.style.backgroundImage = "url(mono/add.svg?light)";

		this.dhcpRemoveButton = document.createElement("input");
		this.dhcpRemoveButton.type = "button";
		this.dhcpRemoveButton.value = "Remove";
		this.dhcpRemoveButton.className = "with-icon";
		this.dhcpRemoveButton.style.backgroundImage = "url(mono/delete.svg?light)";

		this.options.append(this.dhcpNewButton, this.dhcpRemoveButton);

		this.dhcpListBox = new ListBox({
			firstColumnOffset: "4px",
			onSelect: (id, element)=> { this.selectedZone = element._data; },
			onDoubleClick: data=> this.DhcpDialog(data)
		});
		this.dhcpListBox.SetupTitleBar();
		this.dhcpListBox.SetupBuiltInSort();
		this.activeColumnsListBox = this.dhcpListBox;

		this.dhcpListBox.listTitleOuter.style.left = "20px";
		this.dhcpListBox.listTitleOuter.style.right = "20px";
		this.dhcpListBox.listTitleOuter.style.top = "50px";
		this.tabsPanel.appendChild(this.dhcpListBox.listTitleOuter);

		this.dhcpList = this.dhcpListBox.list;
		this.dhcpList.style.overflowY = "auto";
		this.dhcpList.style.left = "20px";
		this.dhcpList.style.right = "20px";
		this.dhcpList.style.top = "80px";
		this.dhcpList.style.bottom = "20px";
		this.dhcpList.style.border = "rgb(82,82,82) solid 2px";
		this.dhcpList.addEventListener("keydown", event=> this.dhcpListBox.Keydown(event));
		this.tabsPanel.appendChild(this.dhcpList);

		this.dhcpListBox.SetupColumns([
			{label:"Name", value:d=> d.name},
			{label:"IP range", value:d=> d.network}
		]);

		this.dhcpNewButton.onclick = ()=> this.DhcpDialog(null);

		this.dhcpRemoveButton.onclick = ()=> {
			if (!this.selectedZone) return;

			let index = this.dhcpRange.indexOf(this.selectedZone);
			if (index === -1) return;

			this.ConfirmBox("Are you sure you want to remove this ip range?", false, "mono/delete.svg").addEventListener("click", ()=>{
				this.dhcpRange.splice(index, 1);
				this.SaveDhcpRange();
				this.selectedZone = null;
				this.dhcpListBox.SetItems(this.dhcpRange);
			});
		};

		this.GetDhcpRange();
		this.AfterResize();
	}

	async ShowActiveDirectory() {
		this.args = "ad";
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

			let domain = json.domain ? json.domain : "";
			domainInput.value = domain;

			this.tabsPanel.appendChild(document.createElement("br"));

			const warningBox = document.createElement("div");
			warningBox.textContent = "Domain privileges are inherited by the user executing the protest.exe executable. To utilize Directory Services, run the executable with a dedicated service account that has only the minimum required Directory Services permissions.";
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
		this.args = "smtp";
		this.tabsPanel.textContent = "";

		this.options = document.createElement("div");
		this.options.className = "rbac-options";
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

		this.smtpProfilesListBox = new ListBox({
			firstColumnOffset: "4px",
			onSelect: (id, element)=> {
				this.selectedSmtpProfile = element._data;
				this.profilesTestButton.disabled = false;
			},
			onDoubleClick: data=> this.SmtpProfileDialog(data)
		});
		this.smtpProfilesListBox.SetupTitleBar();
		this.smtpProfilesListBox.SetupBuiltInSort();
		this.activeColumnsListBox = this.smtpProfilesListBox;

		this.smtpProfilesListBox.listTitleOuter.style.left = "20px";
		this.smtpProfilesListBox.listTitleOuter.style.right = "20px";
		this.smtpProfilesListBox.listTitleOuter.style.top = "50px";
		this.tabsPanel.appendChild(this.smtpProfilesListBox.listTitleOuter);

		this.smtpProfilesList = this.smtpProfilesListBox.list;
		this.smtpProfilesList.style.overflowY = "auto";
		this.smtpProfilesList.style.left = "20px";
		this.smtpProfilesList.style.right = "20px";
		this.smtpProfilesList.style.top = "80px";
		this.smtpProfilesList.style.bottom = "20px";
		this.smtpProfilesList.style.border = "rgb(82,82,82) solid 2px";
		this.smtpProfilesList.addEventListener("keydown", event=> this.smtpProfilesListBox.Keydown(event));
		this.tabsPanel.appendChild(this.smtpProfilesList);

		this.smtpProfilesListBox.SetupColumns([
			{label:"Provider", value:d=> Infrastructure.SMTP_PROVIDERS[d.provider]},
			{label:"SMTP server", value:d=> d.server},
			{label:"Sender", value:d=> d.sender}
		]);

		this.profilesNewButton.onclick = ()=>{
			this.SmtpProfileDialog(null);
		};

		this.profilesRemoveButton.onclick = async ()=>{
			if (!this.selectedSmtpProfile) return;

			let index = this.smtpProfiles.indexOf(this.selectedSmtpProfile);
			if (index === -1) return;

			this.ConfirmBox("Are you sure you want to remove this SMTP profile?", false, "mono/delete.svg").addEventListener("click", async ()=>{
				this.smtpProfiles.splice(index, 1);
				const error = await this.SaveSmtpProfiles();
				if (error) this.ConfirmBox(error, true, "mono/error.svg");
				this.selectedSmtpProfile = null;
				this.profilesTestButton.disabled = true;
				this.smtpProfilesListBox.SetItems(this.smtpProfiles);
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
					const response = await fetch(`config/smtpprofiles/test?guid=${this.selectedSmtpProfile.guid}&recipient=${encodeURIComponent(recipientInput.value)}`);
					if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

					const json = await response.json();
					if (json.error) throw (json.error);
					dialog.Close();

					let message = `${json.server} accepted the test e-mail.`;
					if (json.reply) message += `\nServer reply: ${json.reply}`;
					if (json.warning) message += `\n\n${json.warning}`;
					setTimeout(()=>this.ConfirmBox(message, true, json.warning ? "mono/warning.svg" : "mono/checked.svg"), 250);
				}
				catch (ex) {
					dialog.Close();
					setTimeout(()=>this.ConfirmBox(ex, true, "mono/error.svg"), 250);
				}
			};

			recipientInput.onkeydown = event=> {
				if (event.key === "Enter") {
					dialog.okButton.click();
				}
			};
		};

		this.GetSmtpProfiles();
		this.AfterResize();
	}

	ShowSnmp() {
		this.args = "snmp";
		this.tabsPanel.textContent = "";

		this.options = document.createElement("div");
		this.options.className = "rbac-options";
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

		this.snmpProfilesListBox = new ListBox({
			firstColumnOffset: "4px",
			onSelect: (id, element)=> { this.selectedSnmpProfile = element._data; },
			onDoubleClick: data=> this.SnmpProfileDialog(data)
		});
		this.snmpProfilesListBox.SetupTitleBar();
		this.snmpProfilesListBox.SetupBuiltInSort();
		this.activeColumnsListBox = this.snmpProfilesListBox;

		this.snmpProfilesListBox.listTitleOuter.style.left = "20px";
		this.snmpProfilesListBox.listTitleOuter.style.right = "20px";
		this.snmpProfilesListBox.listTitleOuter.style.top = "50px";
		this.tabsPanel.appendChild(this.snmpProfilesListBox.listTitleOuter);

		this.snmpProfilesList = this.snmpProfilesListBox.list;
		this.snmpProfilesList.style.overflowY = "auto";
		this.snmpProfilesList.style.left = "20px";
		this.snmpProfilesList.style.right = "20px";
		this.snmpProfilesList.style.top = "80px";
		this.snmpProfilesList.style.bottom = "20px";
		this.snmpProfilesList.style.border = "rgb(82,82,82) solid 2px";
		this.snmpProfilesList.addEventListener("keydown", event=> this.snmpProfilesListBox.Keydown(event));
		this.tabsPanel.appendChild(this.snmpProfilesList);

		this.snmpProfilesListBox.SetupColumns([
			{label:"Name", sortValue:d=> d.name, render:d=> {
				const wrap = document.createElement("div");

				const badge = document.createElement("span");
				badge.textContent = `V${d.version}`;
				badge.style.color = "var(--clr-light)";
				badge.style.backgroundColor = "var(--clr-dark)";
				badge.style.fontSize = "smaller";
				badge.style.padding = "0 4px";
				badge.style.marginRight = "6px";
				badge.style.borderRadius = "2px";

				wrap.append(badge, document.createTextNode(d.name));
				return wrap;
			}},
			{label:"Priority", value:d=> d.priority},
			{label:"Community", value:d=> d.version !== 3 ? d.community : ""},
			{label:"Username", value:d=> d.username}
		]);

		this.profilesNewButton.onclick = ()=>{
			this.SnmpProfileDialog(null);
		};

		this.profilesRemoveButton.onclick = async ()=>{
			if (!this.selectedSnmpProfile) return;

			let index = this.snmpProfiles.indexOf(this.selectedSnmpProfile);
			if (index === -1) return;

			this.ConfirmBox("Are you sure you want to remove this SNMP profile?", false, "mono/delete.svg").addEventListener("click", ()=> {
				this.snmpProfiles.splice(index, 1);
				this.SaveSnmpProfiles();
				this.selectedSnmpProfile = null;
				this.snmpProfilesListBox.SetItems(this.snmpProfiles);
			});
		};

		this.GetSnmpProfiles();
		this.AfterResize();
	}

	ShowIntegration() {
		this.args = "integration";
		this.tabsPanel.textContent = "";

		this.selectedIntegration = null;

		this.options = document.createElement("div");
		this.options.className = "rbac-options";
		this.options.style.position = "absolute";
		this.options.style.left = "20px";
		this.options.style.right = "8px";
		this.options.style.top = "8px";
		this.options.style.overflow = "hidden";
		this.options.style.whiteSpace = "nowrap";
		this.tabsPanel.appendChild(this.options);

		this.integrationAddButton = document.createElement("input");
		this.integrationAddButton.type = "button";
		this.integrationAddButton.value = "Add";
		this.integrationAddButton.className = "with-icon";
		this.integrationAddButton.style.backgroundImage = "url(mono/add.svg?light)";

		this.integrationRemoveButton = document.createElement("input");
		this.integrationRemoveButton.type = "button";
		this.integrationRemoveButton.value = "Remove";
		this.integrationRemoveButton.className = "with-icon";
		this.integrationRemoveButton.style.backgroundImage = "url(mono/delete.svg?light)";

		this.integrationTestButton = document.createElement("input");
		this.integrationTestButton.type = "button";
		this.integrationTestButton.value = "Test";
		this.integrationTestButton.disabled = true;
		this.integrationTestButton.className = "with-icon";
		this.integrationTestButton.style.backgroundImage = "url(mono/checked.svg?light)";

		this.options.append(this.integrationAddButton, this.integrationRemoveButton, this.integrationTestButton);

		this.integrationListBox = new ListBox({
			firstColumnOffset: "4px",
			onSelect: (id, element)=> {
				this.selectedIntegration = element._data;
				this.integrationTestButton.disabled = false;
			},
			onDoubleClick: data=> this.IntegrationDialog(data)
		});
		this.integrationListBox.SetupTitleBar();
		this.integrationListBox.SetupBuiltInSort();

		this.activeColumnsListBox = this.integrationListBox;

		this.integrationListBox.listTitleOuter.style.left = "20px";
		this.integrationListBox.listTitleOuter.style.right = "20px";
		this.integrationListBox.listTitleOuter.style.top = "50px";
		this.tabsPanel.appendChild(this.integrationListBox.listTitleOuter);

		this.integrationList = this.integrationListBox.list;
		this.integrationList.style.overflowY = "auto";
		this.integrationList.style.left = "20px";
		this.integrationList.style.right = "20px";
		this.integrationList.style.top = "80px";
		this.integrationList.style.bottom = "20px";
		this.integrationList.style.border = "rgb(82,82,82) solid 2px";
		this.integrationList.addEventListener("keydown", event=> this.integrationListBox.Keydown(event));
		this.tabsPanel.appendChild(this.integrationList);

		this.integrationListBox.SetupColumns([
			{label:"Name",
			 sortValue:d=> d.name,
			 render:d=> {
				const cell = document.createElement("div");
				cell.textContent = d.name;
				cell.style.paddingLeft = "32px";
				cell.style.backgroundImage = d.enabled && !d.error ? "url(mono/connect.svg)" : "url(mono/disconnect.svg)";
				cell.style.backgroundSize = "20px 20px";
				cell.style.backgroundPosition = "4px 50%";
				cell.style.backgroundRepeat = "no-repeat";
				return cell;
			}},
			{label:"Type", value:d=> d.label},
			{label:"Status", value:d=> d.enabled ? (d.error ? d.error : "Enabled") : "Disabled"},
			{label:"Description", value:d=> d.description.replace(/\s+/g, " ")}
		]);

		this.integrationAddButton.onclick = ()=> this.IntegrationTypeDialog();

		this.integrationRemoveButton.onclick = ()=> {
			const target = this.selectedIntegration;
			if (!target) return;

			this.ConfirmBox(`Are you sure you want to remove "${target.name}"?`, false, "mono/delete.svg").addEventListener("click", async ()=> {
				try {
					const response = await fetch(`config/integration/delete?id=${encodeURIComponent(target.id)}`);
					if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

					const json = await response.json();
					if (json.error) throw(json.error);
				}
				catch (ex) {
					this.ConfirmBox(ex, true, "mono/error.svg");
				}

				this.GetIntegrations();
			});
		};

		this.integrationTestButton.onclick = async ()=> {
			const target = this.selectedIntegration;
			if (!target) return;

			this.integrationTestButton.disabled = true;

			try {
				const response = await fetch(`config/integration/test?id=${encodeURIComponent(target.id)}`);
				if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

				const json = await response.json();
				if (json.error) throw(json.error);

				this.ConfirmBox(`Successfully signed in to "${target.name}".`, true, "mono/checked.svg");
			}
			catch (ex) {
				this.ConfirmBox(ex, true, "mono/error.svg");
			}

			this.GetIntegrations();
		};

		this.GetIntegrations();
		this.AfterResize();
	}

	async GetZones() {
		try {
			const response = await fetch("config/zones/list");

			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const json = await response.json();
			if (json.error) throw(json.error);

			this.zones = json;
			this.zonesListBox.SetItems(this.zones);
		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/error.svg");
		}
	}

	async GetDhcpRange() {
		try {
			const response = await fetch("config/dhcprange/list");

			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const json = await response.json();
			if (json.error) throw(json.error);

			this.dhcpRange = json;
			this.dhcpListBox.SetItems(this.dhcpRange);
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
			this.smtpProfilesListBox.SetItems(this.smtpProfiles);
		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/error.svg");
		}
	}

	async GetSnmpProfiles() {
		try {
			const response = await fetch("config/snmpprofiles/list?password=true");

			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const json = await response.json();
			if (json.error) throw(json.error);

			json.sort((a, b)=> a.priority - b.priority);

			this.snmpProfiles = json;
			this.snmpProfilesListBox.SetItems(this.snmpProfiles);
		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/error.svg");
		}
	}

	async GetIntegrations() {
		try {
			const response = await fetch("config/integration/list");

			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const json = await response.json();
			if (json.error) throw(json.error);

			this.integrations = json;
			this.selectedIntegration = null;
			this.integrationTestButton.disabled = true;
			this.integrationListBox.SetItems(this.integrations);
		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/error.svg");
		}
	}

	async GetIntegrationTypes() {
		if (this.integrationTypes) return this.integrationTypes;

		try {
			const response = await fetch("config/integration/types");

			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const json = await response.json();
			if (json.error) throw(json.error);

			this.integrationTypes = json;
			return json;
		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/error.svg");
			return null;
		}
	}

	ZoneDialog(object=null) {
		const dialog = this.DialogBox("250px");
		if (dialog === null) return;

		const {okButton, innerBox} = dialog;

		okButton.value = "Save";

		innerBox.style.padding = "16px 32px";
		innerBox.style.display = "grid";
		innerBox.style.gridTemplateColumns = "auto 120px 275px auto";
		innerBox.style.gridTemplateRows = "repeat(3, 38px) 48px";
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
		networkLabel.textContent = "IP range:";
		const networkInput = document.createElement("input");
		networkInput.style.gridArea = "2 / 3";
		networkInput.type = "text";
		networkInput.placeholder = "10.0.0.1/24";
		innerBox.append(networkLabel, networkInput);

		const vlanLabel = document.createElement("div");
		vlanLabel.style.gridArea = "3 / 2";
		vlanLabel.textContent = "VLAN ID:";
		const vlanInput = document.createElement("input");
		vlanInput.style.gridArea = "3 / 3";
		vlanInput.type = "text";
		innerBox.append(vlanLabel, vlanInput);

		const colorLabel = document.createElement("div");
		colorLabel.style.gridArea = "4 / 2";
		colorLabel.textContent = "Color:";
		const colorInput = document.createElement("input");
		colorInput.style.gridArea = "4 / 3";
		colorInput.type = "color";
		colorInput.value = "#202020";
		innerBox.append(colorLabel, colorInput);

		if (object) {
			nameInput.value    = object.name;
			networkInput.value = object.network;
			vlanInput.value    = object.vlan;
			colorInput.value   = object.color;
		}

		okButton.onclick = async()=> {
			let isNew = object === null;
			let index = this.zones.indexOf(object);

			if (!isNew) {
				if (index === -1) isNew = true;
			}

			let requiredFieldMissing = false;
			let requiredFields = [nameInput, networkInput];

			for (let i=0; i<requiredFields.length; i++) {
				if (requiredFields[i].value.length === 0) {
					if (!requiredFieldMissing) requiredFields[i].focus();
					requiredFields[i].required = true;
					requiredFieldMissing = true;
					requiredFields[i].style.animationDuration = `${(i+1)*.1}s`;
				}
				else {
					requiredFields[i].required = false;
				}
			}

			if (requiredFieldMissing) return;

			const newObject = {
				name      : nameInput.value,
				network   : networkInput.value,
				vlan      : vlanInput.value,
				color     : colorInput.value,
			};

			if (isNew) {
				this.zones.push(newObject);
			}
			else {
				this.zones[index] = newObject;
			}

			await this.SaveZones();
			dialog.Close();
			this.ShowZones();
		};

		setTimeout(()=>{ nameInput.focus() }, 200);
	}

	DhcpDialog(object=null) {
		const dialog = this.DialogBox("160px");
		if (dialog === null) return;

		const {okButton, innerBox} = dialog;

		okButton.value = "Save";

		innerBox.style.padding = "16px 32px";
		innerBox.style.display = "grid";
		innerBox.style.gridTemplateColumns = "auto 120px 275px auto";
		innerBox.style.gridTemplateRows = "repeat(2, 38px)";
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
		networkLabel.textContent = "IP range:";
		const networkInput = document.createElement("input");
		networkInput.style.gridArea = "2 / 3";
		networkInput.type = "text";
		networkInput.placeholder = "10.0.0.1/24";
		innerBox.append(networkLabel, networkInput);

		if (object) {
			nameInput.value = object.name;
			networkInput.value = object.network;
		}

		okButton.onclick = async()=> {
			let isNew = object === null;
			let index = this.dhcpRange.indexOf(object);

			if (!isNew) {
				if (index === -1) isNew = true;
			}

			let requiredFieldMissing = false;
			let requiredFields = [nameInput, networkInput];

			for (let i=0; i<requiredFields.length; i++) {
				if (requiredFields[i].value.length === 0) {
					if (!requiredFieldMissing) requiredFields[i].focus();
					requiredFields[i].required = true;
					requiredFieldMissing = true;
					requiredFields[i].style.animationDuration = `${(i+1)*.1}s`;
				}
				else {
					requiredFields[i].required = false;
				}
			}

			if (requiredFieldMissing) return;

			const newObject = {
				name     : nameInput.value,
				network  : networkInput.value,
			};

			if (isNew) {
				this.dhcpRange.push(newObject);
			}
			else {
				this.dhcpRange[index] = newObject;
			}

			await this.SaveDhcpRange();
			dialog.Close();
			this.ShowDhcpRange();
		};

		setTimeout(()=>{ nameInput.focus() }, 200);
	}

	async SmtpProfileDialog(object=null) {
		const dialog = this.DialogBox("350px");
		if (dialog === null) return;

		const {okButton, innerBox} = dialog;

		okButton.value = "Save";

		innerBox.style.display = "grid";
		innerBox.style.padding = "16px 32px";
		innerBox.style.gridTemplateColumns = "auto 120px 275px auto";
		innerBox.style.alignItems = "center";
		innerBox.parentElement.style.maxWidth = "640px";

		const PRESETS = {
			1: { server: "smtp.office365.com", port: 587 },
			2: { server: "smtp.gmail.com",     port: 587 }
		};

		const CreateField = (label, type="text")=> {
			const labelElement = document.createElement("div");
			labelElement.textContent = label;
			const input = document.createElement("input");
			input.type = type;
			return [labelElement, input];
		};

		const providerLabel = document.createElement("div");
		providerLabel.textContent = "Provider:";
		const providerInput = document.createElement("select");

		for (let i=0; i<Infrastructure.SMTP_PROVIDERS.length; i++) {
			const option = document.createElement("option");
			option.value = i;
			option.textContent = Infrastructure.SMTP_PROVIDERS[i];
			providerInput.append(option);
		}

		const [serverLabel, serverInput] = CreateField("SMTP server:");
		serverInput.placeholder = "smtp.example.com";

		const [portLabel, portInput] = CreateField("Port:", "number");
		portInput.min = 1;
		portInput.max = 65535;
		portInput.value = 587;

		const [senderLabel, senderInput] = CreateField("Sender:");

		const [usernameLabel, usernameInput] = CreateField("Username:");

		const [passwordLabel, passwordInput] = CreateField("Password:", "password");
		passwordInput.placeholder = object?.provider === 0 ? "unchanged" : "";

		const [clientIdLabel, clientIdInput] = CreateField("Client ID:");

		const [clientSecretLabel, clientSecretInput] = CreateField("Client secret:", "password");
		clientSecretInput.placeholder = object?.provider === 2 ? "unchanged" : "";

		const [tenantLabel, tenantInput] = CreateField("Tenant ID:");
		tenantInput.placeholder = "common";

		const accountLabel = document.createElement("div");
		accountLabel.textContent = "Account:";

		const accountBox = document.createElement("div");
		accountBox.style.display = "flex";
		accountBox.style.alignItems = "center";

		const accountStatus = document.createElement("div");
		accountStatus.style.flex = "1";
		accountStatus.style.overflow = "hidden";
		accountStatus.style.textOverflow = "ellipsis";
		accountStatus.style.whiteSpace = "nowrap";

		const signInButton = document.createElement("input");
		signInButton.type = "button";
		signInButton.value = "Sign in";

		accountBox.append(accountStatus, signInButton);

		const sslBox = document.createElement("div");

		const sslToggle = this.CreateToggle("SSL", true, sslBox);

		let session = null;
		let sessionUser = null;
		let signInId = null;

		const SignedInAs = ()=> {
			if (session) return sessionUser;
			if (!object?.signedIn) return null;

			const provider = parseInt(providerInput.value);
			if (object.provider !== provider) return null;
			if (object.clientId !== clientIdInput.value.trim()) return null;
			if (provider === 1 && (object.tenant || "common") !== (tenantInput.value.trim() || "common")) return null;

			return object.username;
		};

		const UpdateAccount = ()=> {
			const username = SignedInAs();
			accountStatus.style.color = "";
			accountStatus.textContent = username ? username : "Not signed in";
			accountStatus.title = username ?? "";
			signInButton.value = username ? "Sign in again" : "Sign in";
		};

		const ShowAccountError = message=> {
			accountStatus.style.color = "var(--clr-error)";
			accountStatus.textContent = message;
			accountStatus.title = message;
		};

		const ResetSession = ()=> {
			session = null;
			sessionUser = null;
			UpdateAccount();
		};

		clientIdInput.oninput = clientSecretInput.oninput = tenantInput.oninput = ResetSession;

		const Layout = rows=> {
			innerBox.textContent = "";
			innerBox.style.gridTemplateRows = `repeat(${rows.length}, 38px)`;
			innerBox.parentElement.style.maxHeight = `${rows.length * 38 + 84}px`;

			for (let i=0; i<rows.length; i++) {
				const [label, input] = rows[i];
				label.style.gridArea = `${i+1} / 2`;
				innerBox.appendChild(label);
				if (input) {
					input.style.gridArea = `${i+1} / 3`;
					innerBox.appendChild(input);
				}
			}
		};

		const ShowForm = ()=> {
			innerBox.parentElement.style.transition = ".2s";
			okButton.disabled = false;
			signInId = null;

			const provider = parseInt(providerInput.value);

			sslToggle.checkbox.disabled = provider !== 0;
			if (provider !== 0) sslToggle.checkbox.checked = true;

			if (provider === 0) {
				Layout([
					[providerLabel, providerInput],
					[serverLabel, serverInput],
					[portLabel, portInput],
					[senderLabel, senderInput],
					[usernameLabel, usernameInput],
					[passwordLabel, passwordInput],
					[sslBox]
				]);
			}
			else {
				Layout([
					[providerLabel, providerInput],
					[serverLabel, serverInput],
					[portLabel, portInput],
					[senderLabel, senderInput],
					[clientIdLabel, clientIdInput],
					provider === 1 ? [tenantLabel, tenantInput] : [clientSecretLabel, clientSecretInput],
					[accountLabel, accountBox],
					[sslBox]
				]);
			}

			senderInput.placeholder = provider === 0 ? "" : "account address";
			UpdateAccount();
		};

		let lastProvider = 0;
		providerInput.onchange = ()=> {
			const provider = parseInt(providerInput.value);
			const isPreset = serverInput.value.length === 0 || Object.values(PRESETS).some(o=> o.server === serverInput.value);

			if (PRESETS[provider] && isPreset) {
				serverInput.value = PRESETS[provider].server;
				portInput.value = PRESETS[provider].port;
				sslToggle.checkbox.checked = true;
			}
			else if (provider === 0 && lastProvider !== 0 && isPreset) {
				serverInput.value = "";
			}

			lastProvider = provider;
			ResetSession();
			ShowForm();
			providerInput.focus();
		};

		const CreatePanel = title=> {
			okButton.disabled = true;
			innerBox.textContent = "";
			innerBox.style.gridTemplateRows = "auto";
			innerBox.parentElement.style.maxHeight = "400px";

			const panel = document.createElement("div");
			panel.style.gridArea = "1 / 2 / 2 / 4";
			panel.style.lineHeight = "1.6";
			innerBox.appendChild(panel);

			const titleLabel = document.createElement("div");
			titleLabel.style.fontWeight = "bold";
			titleLabel.style.marginBottom = "8px";
			titleLabel.textContent = title;
			panel.appendChild(titleLabel);

			const status = document.createElement("div");
			status.style.minHeight = "24px";
			status.style.margin = "8px 0";

			const backButton = document.createElement("input");
			backButton.type = "button";
			backButton.value = "Back";
			backButton.onclick = ShowForm;

			return {panel, status, backButton};
		};

		const ShowStatus = (status, message, isError)=> {
			status.style.color = isError ? "var(--clr-error)" : "";
			status.textContent = message;
		};

		const SignedIn = (id, username)=> {
			session = id;
			sessionUser = username;
			if (senderInput.value.length === 0) senderInput.value = username;
			ShowForm();
		};

		const DeviceCodePanel = json=> {
			const {panel, status, backButton} = CreatePanel("Sign in with Microsoft");

			const description = document.createElement("div");
			description.textContent = "Open the sign-in page and enter this code:";
			panel.appendChild(description);

			const codeBox = document.createElement("div");
			codeBox.style.display = "flex";
			codeBox.style.alignItems = "center";
			codeBox.style.margin = "8px 0";
			panel.appendChild(codeBox);

			const codeLabel = document.createElement("div");
			codeLabel.style.fontFamily = "monospace";
			codeLabel.style.fontSize = "24px";
			codeLabel.style.fontWeight = "bold";
			codeLabel.style.letterSpacing = "2px";
			codeLabel.style.userSelect = "all";
			codeLabel.style.marginRight = "12px";
			codeLabel.textContent = json.userCode;
			codeBox.appendChild(codeLabel);

			if (navigator.clipboard) {
				const copyButton = document.createElement("input");
				copyButton.type = "button";
				copyButton.value = "Copy";
				copyButton.onclick = ()=> navigator.clipboard.writeText(json.userCode).catch(()=>{});
				codeBox.appendChild(copyButton);
			}

			const openButton = document.createElement("input");
			openButton.type = "button";
			openButton.value = "Open sign-in page";
			openButton.style.marginLeft = "0";
			openButton.onclick = ()=> window.open(json.verificationUri, "_blank", "noopener");

			panel.append(openButton, status, backButton);
			ShowStatus(status, "Waiting for you to sign in...", false);
			openButton.focus();

			const id = json.id;
			let interval = Math.max(json.interval || 5, 2);

			const Poll = async ()=> {
				while (innerBox.isConnected && signInId === id) {
					await new Promise(resolve=> setTimeout(resolve, interval * 1000));
					if (!innerBox.isConnected || signInId !== id) return;

					try {
						const response = await fetch(`config/smtpprofiles/oauth/poll?id=${encodeURIComponent(id)}`);
						if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

						const result = await response.json();
						if (result.error) throw result.error;
						if (signInId !== id) return;

						if (result.status === "done") {
							SignedIn(id, result.username);
							return;
						}

						if (result.slowDown) interval += 5;
					}
					catch (ex) {
						if (signInId === id) ShowStatus(status, ex, true);
						return;
					}
				}
			};

			Poll();
		};

		const AuthCodePanel = json=> {
			const {panel, status, backButton} = CreatePanel("Sign in with Google");

			const openButton = document.createElement("input");
			openButton.type = "button";
			openButton.value = "Open sign-in page";
			openButton.style.marginLeft = "0";
			openButton.onclick = ()=> window.open(json.authUrl, "_blank", "noopener");
			panel.appendChild(openButton);

			const description = document.createElement("div");
			description.style.margin = "8px 0";
			description.textContent = "After you allow access, the browser is sent to 127.0.0.1 and shows a \"can't be reached\" page. That is expected. Copy the full address from its address bar and paste it here:";
			panel.appendChild(description);

			const responseBox = document.createElement("div");
			responseBox.style.display = "flex";
			responseBox.style.alignItems = "center";
			panel.appendChild(responseBox);

			const responseInput = document.createElement("input");
			responseInput.type = "text";
			responseInput.placeholder = "http://127.0.0.1:47115/?state=...&code=...";
			responseInput.style.flex = "1";
			responseInput.style.marginLeft = "0";

			const continueButton = document.createElement("input");
			continueButton.type = "button";
			continueButton.value = "Continue";

			responseBox.append(responseInput, continueButton);
			panel.append(status, backButton);
			openButton.focus();

			const id = json.id;

			continueButton.onclick = async ()=> {
				if (responseInput.value.trim().length === 0) {
					responseInput.required = true;
					responseInput.focus();
					return;
				}

				responseInput.required = false;
				continueButton.disabled = true;
				ShowStatus(status, "Signing in...", false);

				try {
					const response = await fetch("config/smtpprofiles/oauth/complete", {
						method: "POST",
						body: JSON.stringify({ id: id, response: responseInput.value.trim() })
					});
					if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

					const result = await response.json();
					if (result.error) throw result.error;
					if (signInId !== id) return;

					SignedIn(id, result.username);
				}
				catch (ex) {
					if (signInId === id) ShowStatus(status, ex, true);
				}
				finally {
					continueButton.disabled = false;
				}
			};

			responseInput.onkeydown = event=> {
				if (event.key === "Enter") continueButton.click();
			};
		};

		signInButton.onclick = async ()=> {
			const provider = parseInt(providerInput.value);
			const clientId = clientIdInput.value.trim();

			if (clientId.length === 0) {
				clientIdInput.required = true;
				clientIdInput.focus();
				return;
			}
			clientIdInput.required = false;

			if (provider === 2 && clientSecretInput.value.length === 0 && !(object?.provider === 2 && object.clientId === clientId)) {
				clientSecretInput.required = true;
				clientSecretInput.focus();
				return;
			}
			clientSecretInput.required = false;

			signInButton.disabled = true;

			try {
				const response = await fetch("config/smtpprofiles/oauth/start", {
					method: "POST",
					body: JSON.stringify({
						provider    : provider,
						clientId    : clientId,
						clientSecret: provider === 2 ? clientSecretInput.value : "",
						tenant      : provider === 1 ? tenantInput.value.trim() : "",
						guid        : object?.guid ?? ""
					})
				});
				if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

				const json = await response.json();
				if (json.error) throw json.error;

				signInId = json.id;
				if (json.mode === "device") {
					DeviceCodePanel(json);
				}
				else {
					AuthCodePanel(json);
				}
			}
			catch (ex) {
				ShowAccountError(ex);
			}
			finally {
				signInButton.disabled = false;
			}
		};

		if (object) {
			providerInput.value = object.provider;
			serverInput.value = object.server;
			portInput.value = object.port;
			senderInput.value = object.sender;
			usernameInput.value = object.provider === 0 ? object.username : "";
			passwordInput.value = object.password;
			clientIdInput.value = object.clientId ?? "";
			tenantInput.value = object.tenant ?? "";
			sslToggle.checkbox.checked = object.ssl;
		}

		if (!providerInput.value) {
			providerInput.value = "0";
		}

		lastProvider = parseInt(providerInput.value);

		okButton.onclick = async ()=>{
			let isNew = object === null;
			let index = this.smtpProfiles.indexOf(object);

			if (!isNew && index === -1) {
				isNew = true;
			}

			const provider = parseInt(providerInput.value);
			const isOAuth = provider !== 0;

			let requiredFieldMissing = false;

			const requiredFields = isOAuth
				? [serverInput, portInput, clientIdInput]
				: isNew || object.provider !== 0
					? [serverInput, portInput, senderInput, usernameInput, passwordInput]
					: [serverInput, portInput, senderInput, usernameInput];

			for (let i=0; i<requiredFields.length; i++) {
				if (requiredFields[i].value.length === 0) {
					if (!requiredFieldMissing) requiredFields[i].focus();
					requiredFields[i].required = true;
					requiredFieldMissing = true;
					requiredFields[i].style.animationDuration = `${(i+1)*.1}s`;
				}
				else {
					requiredFields[i].required = false;
				}
			}

			if (requiredFieldMissing) return;

			const account = SignedInAs();
			if (isOAuth && !account) {
				ShowAccountError("Sign in before saving");
				signInButton.focus();
				return;
			}

			const newObject = {
				provider    : provider,
				server      : serverInput.value,
				port        : parseInt(portInput.value),
				sender      : senderInput.value || (isOAuth ? account : ""),
				username    : isOAuth ? account : usernameInput.value,
				password    : isOAuth ? "" : passwordInput.value,
				ssl         : sslToggle.checkbox.checked,
				clientId    : isOAuth ? clientIdInput.value.trim() : null,
				clientSecret: provider === 2 ? clientSecretInput.value : "",
				tenant      : provider === 1 ? tenantInput.value.trim() : null,
			};

			if (session) newObject.session = session;
			if (object && object.guid) newObject.guid = object.guid;

			if (isNew) {
				this.smtpProfiles.push(newObject);
			}
			else {
				this.smtpProfiles[index] = newObject;
			}

			const error = await this.SaveSmtpProfiles();
			dialog.Close();
			this.ShowSmtp();
			if (error) setTimeout(()=> this.ConfirmBox(error, true, "mono/error.svg"), 250);
		};

		ShowForm();

		setTimeout(()=>{ serverInput.focus() }, 200);
	}

	async SnmpProfileDialog(object=null) {
		const dialog = this.DialogBox("512px");
		if (dialog === null) return;

		const {okButton, innerBox} = dialog;

		let isNew = object === null;

		okButton.value = "Save";

		innerBox.style.padding = "16px 32px";
		innerBox.style.display = "grid";
		innerBox.style.gridTemplateColumns = "auto 200px 200px 100px auto";
		innerBox.style.gridTemplateRows = "repeat(4, 38px) 16px repeat(3, 38px) 16px repeat(2, 38px) 16px 38px";
		innerBox.style.alignItems = "center";

		const nameLabel = document.createElement("div");
		nameLabel.style.gridArea = "1 / 2";
		nameLabel.textContent = "Name:";
		const nameInput = document.createElement("input");
		nameInput.style.gridArea = "1 / 3";
		nameInput.type = "text";
		innerBox.append(nameLabel, nameInput);

		const priorityLabel = document.createElement("div");
		priorityLabel.style.gridArea = "2 / 2";
		priorityLabel.textContent = "Priority:";
		const priorityInput = document.createElement("input");
		priorityInput.style.gridArea = "2 / 3";
		priorityInput.type = "number";
		priorityInput.min = "0";
		priorityInput.max = "9999";
		innerBox.append(priorityLabel, priorityInput);

		const versionLabel = document.createElement("div");
		versionLabel.style.gridArea = "3 / 2";
		versionLabel.textContent = "Version:";
		const versionInput = document.createElement("select");
		versionInput.style.gridArea = "3 / 3";
		innerBox.append(versionLabel, versionInput);

		for (let i=1; i<=3; i++) {
			const option = document.createElement("option");
			option.value = i;
			option.textContent = `Version ${i}`;
			versionInput.appendChild(option);
		}

		const contextLabel = document.createElement("div");
		contextLabel.style.gridArea = "4 / 2";
		contextLabel.textContent = "Context name:";
		const contextInput = document.createElement("input");
		contextInput.style.gridArea = "4 / 3";
		contextInput.type = "text";
		contextInput.placeholder = "optional";
		innerBox.append(contextLabel, contextInput);

		const communityLabel = document.createElement("div");
		communityLabel.style.gridArea = "4 / 2";
		communityLabel.textContent = "Community:";
		const communityInput = document.createElement("input");
		communityInput.style.gridArea = "4 / 3";
		communityInput.type = "text";
		innerBox.append(communityLabel, communityInput);

		const usernameLabel = document.createElement("div");
		usernameLabel.style.gridArea = "6 / 2";
		usernameLabel.textContent = "Username:";
		const usernameInput = document.createElement("input");
		usernameInput.style.gridArea = "6 / 3";
		usernameInput.type = "text";
		innerBox.append(usernameLabel, usernameInput);

		const authAlgorithmLabel = document.createElement("div");
		authAlgorithmLabel.style.gridArea = "7 / 2";
		authAlgorithmLabel.textContent = "Authentication algorithm:";
		const authAlgorithmInput = document.createElement("select");
		authAlgorithmInput.style.gridArea = "7 / 3";
		innerBox.append(authAlgorithmLabel, authAlgorithmInput);

		const authAlgorithms = ["MD5", "SHA-1", "SHA-256", "SHA-384", "SHA-512"];
		for (let i=0; i<authAlgorithms.length; i++) {
			const option = document.createElement("option");
			option.value = i;
			option.textContent = authAlgorithms[i];
			authAlgorithmInput.appendChild(option);
		}

		const authPasswordLabel = document.createElement("div");
		authPasswordLabel.style.gridArea = "8 / 2";
		authPasswordLabel.textContent = "Authentication password:";
		const authPasswordInput = document.createElement("input");
		authPasswordInput.style.gridArea = "8 / 3";
		authPasswordInput.type = "password";
		//authPasswordInput.placeholder = object ? "unchanged" : "";
		innerBox.append(authPasswordLabel, authPasswordInput);


		const authPasswordOptionsBox = document.createElement("div");
		authPasswordOptionsBox.style.gridArea = "8 / 4";
		innerBox.append(authPasswordOptionsBox);

		const authPasswordShowButton = document.createElement("input");
		authPasswordShowButton.type = "button";
		authPasswordShowButton.style.minWidth = "32px";
		authPasswordShowButton.style.backgroundImage = "url(mono/showpassword.svg?light)";
		authPasswordShowButton.style.backgroundSize = "24px 24px";
		authPasswordShowButton.style.backgroundPosition = "center";
		authPasswordShowButton.style.backgroundRepeat = "no-repeat";

		const authPasswordStampButton = document.createElement("input");
		authPasswordStampButton.type = "button";
		authPasswordStampButton.style.minWidth = "32px";
		authPasswordStampButton.style.backgroundImage = "url(mono/stamp.svg?light)";
		authPasswordStampButton.style.backgroundSize = "24px 24px";
		authPasswordStampButton.style.backgroundPosition = "center";
		authPasswordStampButton.style.backgroundRepeat = "no-repeat";

		authPasswordOptionsBox.appendChild(authPasswordShowButton);
		if (!isNew) {
			authPasswordOptionsBox.appendChild(authPasswordStampButton);
		}


		const privacyAlgorithmLabel = document.createElement("div");
		privacyAlgorithmLabel.style.gridArea = "10 / 2";
		privacyAlgorithmLabel.textContent = "Privacy algorithm:";
		const privacyAlgorithmInput = document.createElement("select");
		privacyAlgorithmInput.style.gridArea = "10 / 3";
		innerBox.append(privacyAlgorithmLabel, privacyAlgorithmInput);

		const privacyAlgorithms = ["DES", "AES-128", "AES-192", "AES-256"];
		for (let i=0; i<privacyAlgorithms.length; i++) {
			const option = document.createElement("option");
			option.value = i;
			option.textContent = privacyAlgorithms[i];
			privacyAlgorithmInput.appendChild(option);
		}

		const privacyPasswordLabel = document.createElement("div");
		privacyPasswordLabel.style.gridArea = "11 / 2";
		privacyPasswordLabel.textContent = "Privacy password:";
		const privacyPasswordInput = document.createElement("input");
		privacyPasswordInput.style.gridArea = "11 / 3";
		privacyPasswordInput.type = "password";
		//privacyPasswordInput.placeholder = object ? "unchanged" : "";
		innerBox.append(privacyPasswordLabel, privacyPasswordInput);


		const privacyPasswordOptionsBox = document.createElement("div");
		privacyPasswordOptionsBox.style.gridArea = "11 / 4";
		innerBox.append(privacyPasswordOptionsBox);

		const privacyPasswordShowButton = document.createElement("input");
		privacyPasswordShowButton.type = "button";
		privacyPasswordShowButton.style.minWidth = "32px";
		privacyPasswordShowButton.style.backgroundImage = "url(mono/showpassword.svg?light)";
		privacyPasswordShowButton.style.backgroundSize = "24px 24px";
		privacyPasswordShowButton.style.backgroundPosition = "center";
		privacyPasswordShowButton.style.backgroundRepeat = "no-repeat";

		const privacyPasswordStampButton = document.createElement("input");
		privacyPasswordStampButton.type = "button";
		privacyPasswordStampButton.style.minWidth = "32px";
		privacyPasswordStampButton.style.backgroundImage = "url(mono/stamp.svg?light)";
		privacyPasswordStampButton.style.backgroundSize = "24px 24px";
		privacyPasswordStampButton.style.backgroundPosition = "center";
		privacyPasswordStampButton.style.backgroundRepeat = "no-repeat";

		privacyPasswordOptionsBox.appendChild(privacyPasswordShowButton);

		if (!isNew) {
			privacyPasswordOptionsBox.appendChild(privacyPasswordStampButton);
		}

		const authObsoleteBox = document.createElement("div");
		authObsoleteBox.textContent = "Obsolete";
		authObsoleteBox.style.gridArea = "7 / 4";
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
		privacyObsoleteBox.style.gridArea = "10 / 4";
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

		if (object && object.guid) {
			const guidLabel = document.createElement("div");
			guidLabel.style.gridArea = "13 / 2";
			guidLabel.textContent = "GUID:";

			const guidValue = document.createElement("div");
			guidValue.textContent = object.guid;
			guidValue.style.gridArea = "13 / 3 / 13 / 5";
			guidValue.style.userSelect = "text";
			innerBox.append(guidLabel, guidValue);
		}

		if (!isNew) {
			nameInput.value             = object.name;
			priorityInput.value         = object.priority;
			versionInput.value          = object.version;
			communityInput.value        = object.community;
			contextInput.value          = object.context;
			usernameInput.value         = object.username;
			authAlgorithmInput.value    = object.authAlgorithm;
			authPasswordInput.value     = object.authPassword;
			privacyAlgorithmInput.value = object.privacyAlgorithm;
			privacyPasswordInput.value  = object.privacyPassword;
		}
		else {
			priorityInput.value = 1;
			authAlgorithmInput.value = 2;
			privacyAlgorithmInput.value = 1;
		}

		authAlgorithmInput.onchange = () => {
			authObsoleteBox.style.opacity = (authAlgorithmInput.value < 2) ? "1" : "0";
			authObsoleteBox.style.transform = (authAlgorithmInput.value < 2) ? "none" : "translateX(-8px)";
		};

		privacyAlgorithmInput.onchange = () => {
			privacyObsoleteBox.style.opacity = (privacyAlgorithmInput.value == 0) ? "1" : "0";
			privacyObsoleteBox.style.transform = (privacyAlgorithmInput.value == 0) ? "none" : "translateX(-8px)";
		};

		if (!isNew) {
			versionInput.disabled = true;
		}

		versionInput.onchange = versionInput.oninput = ()=> {
			let isV3 = versionInput.value == 3;

			communityLabel.style.visibility = !isV3 ? "visible" : "hidden";
			communityInput.style.visibility = !isV3 ? "visible" : "hidden";
			contextLabel.style.visibility = isV3 ? "visible" : "hidden";
			contextInput.style.visibility = isV3 ? "visible" : "hidden";

			usernameInput.disabled = !isV3;
			authAlgorithmInput.disabled = !isV3;
			authPasswordInput.disabled = !isV3;
			privacyAlgorithmInput.disabled = !isV3;
			privacyPasswordInput.disabled = !isV3;

			authPasswordOptionsBox.style.visibility = isV3 ? "visible" : "hidden";
			privacyPasswordOptionsBox.style.visibility = isV3 ? "visible" : "hidden";
		};

		authPasswordShowButton.onclick = ()=> {
			authPasswordShowButton.disabled = true;
			authPasswordInput.type = "text";
		};

		authPasswordStampButton.onclick = ()=> {
			if (authPasswordInput.value.length < 1) return;
			UI.PromptRelay(this, "stamp", authPasswordInput.value);

			if (authPasswordStampButton.style.animation === "") {
				authPasswordStampButton.style.animation = "bg-stamp .6s linear";
				setTimeout(()=>authPasswordStampButton.style.animation = "", 600);
			}
		};

		privacyPasswordShowButton.onclick = ()=> {
			privacyPasswordShowButton.disabled = true;
			privacyPasswordInput.type = "text";
		};

		privacyPasswordStampButton.onclick = ()=> {
			if (privacyPasswordInput.value.length < 1) return;
			UI.PromptRelay(this, "stamp", privacyPasswordInput.value);

			if (privacyPasswordStampButton.style.animation === "") {
				privacyPasswordStampButton.style.animation = "bg-stamp .6s linear";
				setTimeout(()=>privacyPasswordStampButton.style.animation = "", 600);
			}
		};

		okButton.onclick = async ()=>{
			let index = this.snmpProfiles.indexOf(object);

			if (!isNew) {
				if (index === -1) isNew = true;
			}

			let isV3 = versionInput.value == 3;

			let requiredFieldMissing = false;

			let requiredFields;

			if (isNew) {
				requiredFields = isV3
				? [nameInput, priorityInput, usernameInput, authPasswordInput, privacyPasswordInput]
				: [nameInput, priorityInput, communityInput];
			}
			else {
				requiredFields = isV3
				? [nameInput, priorityInput, usernameInput]
				: [nameInput, priorityInput, communityInput];
			}

			for (let i=0; i<requiredFields.length; i++) {
				if (requiredFields[i].value.length === 0) {
					if (!requiredFieldMissing) requiredFields[i].focus();
					requiredFields[i].required = true;
					requiredFieldMissing = true;
					requiredFields[i].style.animationDuration = `${(i+1)*.1}s`;
				}
				else {
					requiredFields[i].required = false;
				}
			}

			if (requiredFieldMissing) return;

			const newObject = {
				name             : nameInput.value,
				priority         : parseInt(priorityInput.value),
				version          : parseInt(versionInput.value),
				community        : communityInput.value,
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
			dialog.Close();
			this.ShowSnmp();
		};

		versionInput.onchange();
		authAlgorithmInput.onchange();
		privacyAlgorithmInput.onchange();

		setTimeout(()=>{ nameInput.focus() }, 200);
	}

	async IntegrationTypeDialog() {
		const types = await this.GetIntegrationTypes();
		if (!types || types.length === 0) return;

		const dialog = this.DialogBox("300px");
		if (dialog === null) return;

		const {okButton, innerBox} = dialog;

		const dialogBox = innerBox.parentElement;
		dialogBox.style.maxWidth = "480px";
		
		okButton.value = "Next";
		innerBox.style.padding = "20px";

		const caption = document.createElement("div");
		caption.textContent = "Select integration type:";
		caption.style.paddingBottom = "12px";
		innerBox.appendChild(caption);

		const container = document.createElement("div");
		container.style.position = "relative";
		container.style.height = "160px";
		innerBox.appendChild(container);

		let selectedType = null;

		const Proceed = type=> {
			dialog.Close();
			setTimeout(()=> this.IntegrationDialog(null, type), 250);
		};

		const listBox = new ListBox({ onSelect: (id, element)=> { selectedType = element._data; } });
		listBox.list.style.top = "0";
		listBox.list.style.border = "rgb(82,82,82) solid 2px";
		listBox.list.addEventListener("keydown", event=> listBox.Keydown(event));
		container.appendChild(listBox.list);

		listBox.inflate = (element, entry)=> {
			const label = document.createElement("div");
			label.textContent = entry.label;
			label.style.left = "8px";
			label.style.right = "0";
			element.appendChild(label);

			element.onclick = ()=> listBox.Select(element);
			element.ondblclick = ()=> Proceed(entry);
		};

		listBox.SetItems(types);

		okButton.onclick = ()=> {
			if (selectedType) Proceed(selectedType);
		};

		setTimeout(()=> {
			listBox.UpdateViewport(true);
			listBox.Select(listBox.list.firstChild);
			listBox.list.focus();
		}, 200);
	}

	async IntegrationDialog(object=null, type=null) {
		const types = await this.GetIntegrationTypes();
		if (!types) return;

		const typeInfo = object ? types.find(o=> o.type === object.type) : type;
		if (!typeInfo) return;

		let current = null;
		if (object) {
			try {
				const response = await fetch(`config/integration/get?id=${encodeURIComponent(object.id)}`);
				if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

				current = await response.json();
				if (current.error) throw(current.error);
			}
			catch (ex) {
				this.ConfirmBox(ex, true, "mono/error.svg");
				return;
			}
		}

		const dialog = this.DialogBox(`${340 + typeInfo.fields.length * 40}px`);
		if (dialog === null) return;

		const {okButton, innerBox} = dialog;

		okButton.value = "Save";
		innerBox.style.padding = "20px";
		innerBox.parentElement.style.maxWidth = "560px";

		const CreateRow = (label, control)=> {
			const container = document.createElement("div");
			container.style.padding = "4px 0";
			container.style.whiteSpace = "nowrap";
			innerBox.appendChild(container);

			const labelBox = document.createElement("div");
			labelBox.textContent = `${label}: `;
			labelBox.style.display = "inline-block";
			labelBox.style.verticalAlign = "top";
			labelBox.style.minWidth = "170px";
			container.appendChild(labelBox);

			control.style.width = "calc(100% - 180px)";
			control.style.minWidth = "100px";
			container.appendChild(control);
		};

		const typeInput = document.createElement("input");
		typeInput.type = "text";
		typeInput.value = typeInfo.label;
		typeInput.disabled = true;
		CreateRow("Type", typeInput);

		const nameInput = document.createElement("input");
		nameInput.type = "text";
		nameInput.maxLength = 64;
		CreateRow("Name", nameInput);

		const descriptionInput = document.createElement("textarea");
		descriptionInput.style.boxSizing = "border-box";
		descriptionInput.rows = 3;
		descriptionInput.maxLength = 500;
		descriptionInput.placeholder = "optional";
		descriptionInput.style.resize = "none";
		CreateRow("Description", descriptionInput);

		const enableBox = document.createElement("div");
		enableBox.style.padding = "8px 0 12px 0";
		innerBox.appendChild(enableBox);

		const enableToggle = this.CreateToggle("Enabled", current ? current.enabled : true, enableBox);
		enableToggle.label.style.minWidth = "38px";
		enableToggle.label.style.margin = "2px";

		const fieldInputs = [];

		for (const field of typeInfo.fields) {
			const input = document.createElement("input");
			input.type = field.secret ? "password" : "text";
			input.maxLength = 512;

			if (field.secret && current) {
				input.placeholder = "unchanged";
			}
			else if (field.optional) {
				input.placeholder = "optional";
			}

			if (field.suggestions.length > 0) {
				const datalist = document.createElement("datalist");
				datalist.id = `INTEGRATION_${field.name}_DATALIST`;
				datalist.style.display = "none";
				innerBox.appendChild(datalist);

				for (const suggestion of field.suggestions) {
					const option = document.createElement("option");
					option.value = suggestion;
					datalist.appendChild(option);
				}

				input.setAttribute("list", datalist.id);
			}

			if (current && field.name in current.config) {
				input.value = current.config[field.name];
			}

			CreateRow(field.label, input);
			fieldInputs.push({field, input});
		}

		if (current) {
			nameInput.value = current.name;
			descriptionInput.value = current.description;
		}

		const errorBox = document.createElement("div");
		errorBox.style.minHeight = "20px";
		errorBox.style.paddingTop = "8px";
		errorBox.style.color = "var(--clr-error)";
		innerBox.appendChild(errorBox);

		okButton.onclick = async ()=> {
			errorBox.textContent = "";

			const requiredInputs = [nameInput];
			for (const o of fieldInputs) {
				if (o.field.optional) continue;
				if (!o.field.secret || !current) requiredInputs.push(o.input);
			}

			let requiredFieldMissing = false;

			for (let i=0; i<requiredInputs.length; i++) {
				if (requiredInputs[i].value.trim().length === 0) {
					if (!requiredFieldMissing) requiredInputs[i].focus();
					requiredInputs[i].required = true;
					requiredFieldMissing = true;
					requiredInputs[i].style.animationDuration = `${(i+1)*.1}s`;
				}
				else {
					requiredInputs[i].required = false;
				}
			}

			if (requiredFieldMissing) return;

			const config = {};
			for (const o of fieldInputs) {
				config[o.field.name] = o.input.value;
			}

			okButton.disabled = true;

			try {
				const response = await fetch("config/integration/save", {
					method: "POST",
					body: JSON.stringify({
						id         : current?.id,
						type       : typeInfo.type,
						name       : nameInput.value,
						description: descriptionInput.value,
						enabled    : enableToggle.checkbox.checked,
						config     : config
					})
				});

				if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

				const json = await response.json();
				if (json.error) throw(json.error);

				dialog.Close();
				this.GetIntegrations();
			}
			catch (ex) {
				errorBox.textContent = ex;
				okButton.disabled = false;
			}
		};

		setTimeout(()=> nameInput.focus(), 200);
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

	async SaveDhcpRange() {
		try {
			const response = await fetch("config/dhcprange/save", {
				method: "POST",
				body: JSON.stringify(this.dhcpRange)
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
			return null;
		}
		catch (ex) {
			return ex;
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
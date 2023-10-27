class Fetch extends Tabs {
	constructor(params) {
		super(null);

		this.params = params ?? "";

		this.SetTitle("Fetch");
		this.SetIcon("mono/fetch.svg");

		this.tabsPanel.style.padding = "20px";
		this.tabsPanel.style.overflow = "auto";
		this.tabsPanel.style.display = "grid";
		this.tabsPanel.style.gridTemplateColumns = "auto 150px 150px 12px 200px 40px minmax(20px, 300px) auto";
		this.tabsPanel.style.gridTemplateRows = "repeat(3, 40px) repeat(12, 36px)";
		this.tabsPanel.style.alignItems = "center";

		const tabDevice  = this.AddTab("Devices",  "mono/gear.svg");
		const tabUsers   = this.AddTab("Users",    "mono/user.svg");
		const tabProtest = this.AddTab("Import",   "mono/logo.svg");
		this.tabTask     = this.AddTab("Fetching", "mono/ball.svg");

		this.tabTask.style.position = "absolute";
		this.tabTask.style.left = "0";
		this.tabTask.style.right = "0";
		this.tabTask.style.top = "max(140px, 100% - 44px)";
		this.tabTask.style.visibility = "hidden";

		tabDevice.onclick    = ()=> this.ShowDevices();
		tabUsers.onclick     = ()=> this.ShowUsers();
		tabProtest.onclick   = ()=> this.ShowImport();
		this.tabTask.onclick = ()=> this.ShowFetching();

		this.InitializeComponents();

		switch (this.params) {
		case "users":
			tabUsers.className = "v-tab-selected";
			this.ShowUsers();
			break;

		case "protest":
			tabProtest.className = "v-tab-selected";
			this.ShowImport();
			break;

		case "fetching":
			this.tabTask.className = "v-tab-selected";
			this.ShowFetching();
			break;

		default:
			tabDevice.className = "v-tab-selected";
			this.ShowDevices();
		}
	}

	InitializeComponents() {
		this.lblStatusValue = document.createElement("div");
		this.lblStatusValue.style.textTransform = "capitalize";
		this.lblStatusValue.style.fontWeight = "600";

		this.lblProgressValue = document.createElement("div");
		this.lblProgressValue.style.textTransform = "capitalize";
		this.lblProgressValue.style.fontWeight = "600";
		this.lblProgressValue.textContent = "0/0";

		this.lblEtcValue = document.createElement("div");
		this.lblEtcValue.style.fontWeight = "600";
		this.lblEtcValue.textContent = "Calculating";

		this.divProgress = document.createElement("div");
		this.divProgress.style.backgroundColor = "var(--clr-accent)";
		this.divProgress.style.width = "0";
		this.divProgress.style.height = "100%";
		this.divProgress.style.transition = ".4s";


		this.rdoUpdate = document.createElement("input");
		this.rdoUpdate.type = "radio";
		this.rdoUpdate.name = "option";
		this.rdoUpdate.checked = false;


		this.rdoIP = document.createElement("input");
		this.rdoIP.type = "radio";
		this.rdoIP.name = "option";
		this.rdoIP.checked = true;

		this.ipFrom = new IpBox();
		this.ipTo = new IpBox();

		this.ipFrom.exitElement = this.ipTo.textBoxes[0];
		this.ipTo.enterElement = this.ipFrom.textBoxes[3];

		this.divRange = document.createElement("div");
		this.divRange.style.gridArea = "2 / 3 / auto / 7";

		this.ipFrom.Attach(this.divRange);

		const lblTo = document.createElement("div");
		lblTo.style.display = "inline-block";
		lblTo.style.minWidth = "15px";
		lblTo.style.fontWeight = "bold";
		lblTo.style.textAlign = "center";
		lblTo.style.color = "var(--clr-control)";
		lblTo.textContent = " - ";
		this.divRange.appendChild(lblTo);

		this.ipTo.Attach(this.divRange);


		this.rdoDomain = document.createElement("input");
		this.rdoDomain.type = "radio";
		this.rdoDomain.name = "option";
		this.rdoDomain.checked = false;

		this.txtDomain = document.createElement("input");
		this.txtDomain.type = "text";
		this.txtDomain.disabled = true;
		this.txtDomain.style.width = "350px";
		this.txtDomain.style.gridArea = "3 / 3";
		this.txtDomain.style.marginLeft = "0px";
		this.txtDomain.style.marginRight = "0px";


		this.chkDns = document.createElement("input");
		this.chkDns.type = "checkbox";
		this.chkDns.checked = true;

		this.chkWmi = document.createElement("input");
		this.chkWmi.type = "checkbox";
		this.chkWmi.checked = true;

		this.chkSnmp = document.createElement("input");
		this.chkSnmp.type = "checkbox";
		this.chkSnmp.checked = false;
		this.chkSnmp.disabled = true; //TODO:

		this.txtSnmp = document.createElement("select");
		this.txtSnmp.style.width = "180px";
		this.txtSnmp.style.gridArea = "7 / 5";
		this.txtSnmp.disabled = true;

		const optVer2 = document.createElement("option");
		optVer2.value = "2";
		optVer2.text = "Version 2";
		this.txtSnmp.appendChild(optVer2);

		const optVer3 = document.createElement("option");
		optVer3.value = "3";
		optVer3.text = "Version 3";
		this.txtSnmp.appendChild(optVer3);

		this.txtSnmp.value = "3";

		this.chkKerberos = document.createElement("input");
		this.chkKerberos.type = "checkbox";
		this.chkKerberos.checked = true;

		this.chkPortScan = document.createElement("input");
		this.chkPortScan.type = "checkbox";
		this.chkPortScan.checked = true;

		this.txtPortScan = document.createElement("select");
		this.txtPortScan.style.width = "180px";
		this.txtPortScan.style.gridArea = "9 / 5";

		this.lblPortScanComment = document.createElement("div");
		this.lblPortScanComment.style.gridArea = "9 / 6 / auto / 8";
		this.lblPortScanComment.style.fontSize = "small";
		this.lblPortScanComment.style.lineHeight = "14px";
		this.lblPortScanComment.style.minWidth = "150px";

		const optBasic = document.createElement("option");
		optBasic.value = "basic";
		optBasic.text = "Basic";
		this.txtPortScan.appendChild(optBasic);

		const optWellKnown = document.createElement("option");
		optWellKnown.value = "wellknown";
		optWellKnown.text = "Well known ports";
		this.txtPortScan.appendChild(optWellKnown);

		const optExtended = document.createElement("option");
		optExtended.value = "extended";
		optExtended.text = "Extended";
		this.txtPortScan.appendChild(optExtended);

		const optRegistered = document.createElement("option");
		optRegistered.value = "registered";
		optRegistered.text = "Registered ports";
		this.txtPortScan.appendChild(optRegistered);

		const optFull = document.createElement("option");
		optFull.value = "full";
		optFull.text = "Full";
		this.txtPortScan.appendChild(optFull);

		const optDynamic = document.createElement("option");
		optDynamic.value = "dynamic";
		optDynamic.text = "Dynamic ports";
		this.txtPortScan.appendChild(optDynamic);


		this.lblRetries = document.createElement("div");
		this.lblRetries.style.gridArea = "11 / 3";
		this.lblRetries.textContent = "Retries:";

		this.rngRetries = document.createElement("input");
		this.rngRetries.type = "range";
		this.rngRetries.min = 0;
		this.rngRetries.max = 4;
		this.rngRetries.value = 1;
		this.rngRetries.style.gridArea = "11 / 5";
		this.rngRetries.style.width = "180px";

		this.lblRetriesComment = document.createElement("div");
		this.lblRetriesComment.style.gridArea = "11 / 6 / auto / 8";
		this.lblRetriesComment.style.fontSize = "small";
		this.lblRetriesComment.style.lineHeight = "14px";
		this.lblRetriesComment.style.minWidth = "150px";

		this.lblInterval = document.createElement("div");
		this.lblInterval.style.gridArea = "12 / 3";
		this.lblInterval.textContent = "Retry interval:";

		this.rngInterval = document.createElement("input");
		this.rngInterval.type = "range";
		this.rngInterval.min = 0;
		this.rngInterval.max = 8;
		this.rngInterval.value = 1;
		this.rngInterval.style.gridArea = "12 / 5";
		this.rngInterval.style.width = "180px";

		this.lblIntervalComment = document.createElement("div");
		this.lblIntervalComment.style.gridArea = "12 / 6 / auto / 8";
		this.lblIntervalComment.style.fontSize = "small";
		this.lblIntervalComment.style.lineHeight = "14px";
		this.lblIntervalComment.style.minWidth = "150px";

		this.buttonsContainer = document.createElement("div");
		this.buttonsContainer.style.gridArea = "14 / 2 / auto / 7";
		this.buttonsContainer.style.textAlign = "center";
		
		const btnFetch = document.createElement("input");
		btnFetch.type = "button";
		btnFetch.value = "Fetch";
		btnFetch.style.minWidth = "96px";
		
		const btnCancel = document.createElement("input");
		btnCancel.type = "button";
		btnCancel.value = "Close";
		btnCancel.style.minWidth = "96px";

		this.buttonsContainer.append(btnFetch, btnCancel);

		this.rdoUpdate.onchange = this.rdoIP.onchange = this.rdoDomain.onchange = ()=> {
			this.ipFrom.SetEnabled(this.rdoIP.checked);
			this.ipTo.SetEnabled(this.rdoIP.checked);
			this.txtDomain.disabled = !this.rdoDomain.checked;
		};

		this.chkSnmp.onchange = ()=> {
			if (this.chkSnmp.checked) {
				this.txtSnmp.disabled = false;
			}
			else {
				this.txtSnmp.disabled = true;
			}
		};
		
		this.chkPortScan.onchange = ()=> {
			if (this.chkPortScan.checked) {
				this.txtPortScan.disabled = false;
				this.txtPortScan.onchange();
			}
			else {
				this.txtPortScan.disabled = true;
				this.lblPortScanComment.textContent = "";
			}
		};

		this.txtPortScan.onchange = ()=> {
			switch (this.txtPortScan.value) {
			case "basic"     : this.lblPortScanComment.textContent = "Scan only common protocols"; break;
			case "wellknown" : this.lblPortScanComment.textContent = "Scan ports 1 to 1023"; break;
			case "extended"  : this.lblPortScanComment.textContent = "Scan ports 1 to 8191"; break;
			case "registered": this.lblPortScanComment.textContent = "Scan ports 1024 to 49151 (slow)"; break;
			case "full"      : this.lblPortScanComment.textContent = "Scan ports 1 to 49151 (slow)"; break;
			case "dynamic"   : this.lblPortScanComment.textContent = "Scan ports 49152 to 65535 (slow)"; break;
			}
		};

		this.rngRetries.oninput = ()=> {
			if (parseInt(this.rngRetries.value) === 0) {
				this.rngInterval.disabled = true;
				this.lblIntervalComment.textContent = "";
			}
			else {
				this.rngInterval.disabled = false;
				this.rngInterval.oninput();
			}

			if (parseInt(this.rngRetries.value) === 0)
				this.lblRetriesComment.textContent = "Don't try again";
			else if (parseInt(this.rngRetries.value) === 1)
				this.lblRetriesComment.textContent = `If unreachable, retry ${this.rngRetries.value} more time`;
			else
				this.lblRetriesComment.textContent = `If unreachable, retry up to ${this.rngRetries.value} times`;
		};

		this.rngInterval.oninput = ()=> {
			switch (parseInt(this.rngInterval.value)) {
			case 0: this.lblIntervalComment.textContent = "If unreachable, retry after half an hour"; break;
			case 1: this.lblIntervalComment.textContent = "If unreachable, retry after an hour"; break;
			case 2: this.lblIntervalComment.textContent = "If unreachable, retry after 2 hours"; break;
			case 3: this.lblIntervalComment.textContent = "If unreachable, retry after 4 hours"; break;
			case 4: this.lblIntervalComment.textContent = "If unreachable, retry after 6 hours"; break;
			case 5: this.lblIntervalComment.textContent = "If unreachable, retry after 8 hours"; break;
			case 6: this.lblIntervalComment.textContent = "If unreachable, retry after 12 hours"; break;
			case 7: this.lblIntervalComment.textContent = "If unreachable, retry after 24 hours"; break;
			case 8: this.lblIntervalComment.textContent = "If unreachable, retry after 48 hours"; break;
			}
		};

		btnFetch.onclick = async()=> {
			let uri;
			if (this.params === "devices") {
				uri = "fetch/devices";
			}
			else if (this.params === "users") {
				uri = "fetch/users";
			}

			if (this.rdoUpdate.checked) {
				uri += "?update=true";
			}
			else if (this.rdoIP.checked) {
				uri += `?range=${this.ipFrom.GetIpString()}-${this.ipTo.GetIpString()}`;
			}
			else if (this.rdoDomain.checked) {
				if (this.txtDomain.value.length === 0) {
					this.ConfirmBox("Please enter a domain", true);
					return;
				}
				uri += `?domain=${encodeURIComponent(this.txtDomain.value)}`;
			}

			if (this.params === "devices") {
				if (this.chkDns.checked)      uri += "&dns=true";
				if (this.chkWmi.checked)      uri += "&wmi=true";
				if (this.chkSnmp.checked)     uri += `&snmp=${this.txtSnmp.value}`;
				if (this.chkKerberos.checked) uri += "&kerberos=true";
				if (this.chkPortScan.checked) uri += `&portscan=${this.txtPortScan.value}`;

				uri += `&retries=${this.rngRetries.value}`;
				uri += `&interval=${this.rngInterval.value}`;
			}
			else if (this.params === "users") {
				uri = `fetch/users?domain=${this.txtDomain.value}`;
			}

			btnFetch.disabled = btnCancel.disabled = true;

			try {
				const response = await fetch(uri);
	
				if (response.status !== 200) LOADER.HttpErrorHandler(response.status);
				
				const json = await response.json();
				if (json.error) throw(json.error);
	
				if (json.status === "ok") {
					this.tabTask.style.visibility = "visible";
					this.tabTask.style.animation = "slide-in .4s 1";
					
					this.DeselectAllTabs();
					this.tabTask.className = "v-tab-selected";
					this.ShowFetching();
				}
			}
			catch (ex) {
				this.ConfirmBox(ex, true, "mono/error.svg");
			}
			finally {
				btnFetch.disabled = btnCancel.disabled = false;
			}
		};

		btnCancel.onclick = ()=> this.Close();

		this.txtPortScan.onchange();
		this.rngRetries.oninput();
		this.rngInterval.oninput();

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
			let lastAddress  = json.lastIp  ? json.lastIp.split(".") : [10,0,0,254];
			let domain       = json.domain  ? json.domain : "";

			this.ipFrom.SetIp(firstAddress[0], firstAddress[1], firstAddress[2], firstAddress[3]);
			this.ipTo.SetIp(lastAddress[0], lastAddress[1], lastAddress[2], lastAddress[3]);
			this.txtDomain.value = domain;
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

			if (json.status === "fetching" || json.status === "idle") {
				this.tabTask.style.visibility = "visible";
				this.tabTask.style.animation = "slide-in .4s 1";
			}
			else if (json.status === "pending") {
				this.tabTask.style.visibility = "visible";
				this.tabTask.style.animation = "slide-in .4s 1";
			}

			if (this.tabTask.style.visibility == "visible" && this.args == "task") {
				this.ShowFetching();
				this.DeselectAllTabs();
				this.tabTask.className = "v-tab-selected";
			}
	
		}
		catch {}
	}

	ShowDevices() {
		this.params = "devices";
		this.tabsPanel.textContent = "";


		this.tabsPanel.appendChild(this.rdoUpdate);
		const updateOption = this.AddRadioLabel(this.tabsPanel, this.rdoUpdate, "Update, only existing records");
		updateOption.style.gridArea = "1 / 2 / 1 / 6";

		this.rdoIP.disabled = false;
		this.tabsPanel.appendChild(this.rdoIP);
		const ipOption = this.AddRadioLabel(this.tabsPanel, this.rdoIP, "IP range:");
		ipOption.style.gridArea = "2 / 2";

		this.tabsPanel.appendChild(this.divRange);
		this.ipFrom.SetEnabled(this.rdoIP.checked);
		this.ipTo.SetEnabled(this.rdoIP.checked);
		
		this.tabsPanel.appendChild(this.rdoDomain);
		const domainOption = this.AddRadioLabel(this.tabsPanel, this.rdoDomain, "Domain:");
		domainOption.style.gridArea = "3 / 2";

		this.tabsPanel.appendChild(this.txtDomain);

		const lblProtocols = document.createElement("div");
		lblProtocols.style.gridArea = "5 / 2";
		lblProtocols.textContent = "Protocols:";
		this.tabsPanel.appendChild(lblProtocols);

		this.tabsPanel.appendChild(this.chkDns);
		const dns = this.AddCheckBoxLabel(this.tabsPanel, this.chkDns, "DNS");
		dns.style.gridArea = "5 / 3";
		
		this.tabsPanel.appendChild(this.chkWmi);
		const wmi = this.AddCheckBoxLabel(this.tabsPanel, this.chkWmi, "WMI");
		wmi.style.gridArea = "6 / 3";

		this.tabsPanel.appendChild(this.chkSnmp);
		const snmp = this.AddCheckBoxLabel(this.tabsPanel, this.chkSnmp, "SNMP");
		snmp.style.gridArea = "7 / 3";

		this.tabsPanel.appendChild(this.txtSnmp);

		this.tabsPanel.appendChild(this.chkKerberos);
		const kerberos = this.AddCheckBoxLabel(this.tabsPanel, this.chkKerberos, "Kerberos");
		kerberos.style.gridArea = "8 / 3";
		this.chkKerberos.disabled = false;

		this.tabsPanel.appendChild(this.chkPortScan);
		const portScan = this.AddCheckBoxLabel(this.tabsPanel, this.chkPortScan, "Port scan");
		portScan.style.gridArea = "9 / 3";

		this.tabsPanel.appendChild(this.txtPortScan);
		this.tabsPanel.appendChild(this.lblPortScanComment);

		this.tabsPanel.append(this.lblRetries, this.rngRetries, this.lblRetriesComment);

		this.tabsPanel.append(this.lblInterval, this.rngInterval, this.lblIntervalComment);

		this.tabsPanel.appendChild(this.buttonsContainer);
		this.buttonsContainer.style.gridArea = "14 / 2 / auto / 7";
	}

	ShowUsers() {
		this.params = "users";
		this.tabsPanel.textContent = "";
	

		this.rdoIP.disabled = true;
		this.txtDomain.disabled = false;
		if (this.rdoIP.checked) {
			this.rdoDomain.checked = true;
		}

		this.tabsPanel.appendChild(this.rdoUpdate);
		const updateOption = this.AddRadioLabel(this.tabsPanel, this.rdoUpdate, "Update, only existing records");
		updateOption.style.gridArea = "1 / 2 / 1 / 6";

		this.tabsPanel.appendChild(this.rdoIP);
		const ipOption = this.AddRadioLabel(this.tabsPanel, this.rdoIP, "IP range:");
		ipOption.style.gridArea = "2 / 2";

		this.tabsPanel.appendChild(this.divRange);
		this.ipFrom.SetEnabled(false);
		this.ipTo.SetEnabled(false);

		this.tabsPanel.appendChild(this.rdoDomain);
		const domainOption = this.AddRadioLabel(this.tabsPanel, this.rdoDomain, "Domain:");
		domainOption.style.gridArea = "3 / 2";

		this.tabsPanel.appendChild(this.txtDomain);

		const lblProtocols = document.createElement("div");
		lblProtocols.style.gridArea = "5 / 2";
		lblProtocols.textContent = "Protocols:";
		this.tabsPanel.appendChild(lblProtocols);

		this.tabsPanel.appendChild(this.chkKerberos);
		const kerberos = this.AddCheckBoxLabel(this.tabsPanel, this.chkKerberos, "Kerberos");
		kerberos.style.gridArea = "5 / 3";
		this.chkKerberos.checked = true;
		this.chkKerberos.disabled = true;

		this.tabsPanel.appendChild(this.buttonsContainer);
		this.buttonsContainer.style.gridArea = "7 / 2 / auto / 7";
	}

	ShowImport() {
		this.params = "protest";
		this.tabsPanel.textContent = "";

		const lblProtest = document.createElement("div");
		lblProtest.style.gridArea = "1 / 3";
		lblProtest.textContent = "Targets IP:";
		this.tabsPanel.appendChild(lblProtest);
		const txtTargetContainer = document.createElement("div");
		txtTargetContainer.style.gridArea = "1 / 5";
		this.tabsPanel.appendChild(txtTargetContainer);
		const txtTarget = new IpBox();
		txtTarget.SetIp(127,0,0,1);
		txtTarget.Attach(txtTargetContainer);

		const lblPort = document.createElement("div");
		lblPort.style.gridArea = "2 / 3";
		lblPort.textContent = "Port:";
		this.tabsPanel.appendChild(lblPort);
		const txtPort = document.createElement("input");
		txtPort.type = "number";
		txtPort.min = "1";
		txtPort.max = "65535";
		txtPort.value = "443";
		txtPort.style.gridArea = "2 / 5";
		txtPort.style.marginLeft = "0";
		txtPort.style.width = "180px";
		this.tabsPanel.appendChild(txtPort);
		txtTarget.exitElement = txtPort;

		const lblProtocol = document.createElement("div");
		lblProtocol.style.gridArea = "3 / 3";
		lblProtocol.textContent = "Protocol:";
		this.tabsPanel.appendChild(lblProtocol);
		const txtProtocol = document.createElement("select");
		txtProtocol.style.gridArea = "3 / 5";
		txtProtocol.style.marginLeft = "0";
		txtProtocol.style.width = "180px";
		txtProtocol.style.boxSizing = "initial";
		this.tabsPanel.appendChild(txtProtocol);

		const optHttp = document.createElement("option");
		optHttp.text = "HTTP";
		optHttp.value = "http";
		txtProtocol.appendChild(optHttp);
		const optHttps = document.createElement("option");
		optHttps.text = "HTTPS";
		optHttps.value = "https";
		txtProtocol.appendChild(optHttps);

		txtProtocol.value = "https";

		const lblUsername = document.createElement("div");
		lblUsername.style.gridArea = "4 / 3";
		lblUsername.textContent = "Username:";
		this.tabsPanel.appendChild(lblUsername);

		const txtUsername = document.createElement("input");
		txtUsername.type = "text";
		txtUsername.placeholder = ".\\administrator";
		txtUsername.disabled = true;
		txtUsername.style.gridArea = "4 / 5";
		txtUsername.style.marginLeft = "0";
		txtUsername.style.width = "180px";
		this.tabsPanel.appendChild(txtUsername);

		const lblPassword = document.createElement("div");
		lblPassword.style.gridArea = "5 / 3";
		lblPassword.textContent = "Password:";
		this.tabsPanel.appendChild(lblPassword);
		const txtPassword = document.createElement("input");
		txtPassword.type = "password";
		txtPassword.disabled = true;
		txtPassword.style.gridArea = "5 / 5";
		txtPassword.style.marginLeft = "0";
		txtPassword.style.width = "180px";
		this.tabsPanel.appendChild(txtPassword);

		const lblDevice = document.createElement("div");
		lblDevice.style.gridArea = "6 / 3";
		lblDevice.textContent = "Devices:";
		this.tabsPanel.appendChild(lblDevice);
		const chkDeviceContainer = document.createElement("div");
		chkDeviceContainer.style.gridArea = "6 / 5";
		this.tabsPanel.appendChild(chkDeviceContainer);
		const chkDevice = document.createElement("input");
		chkDevice.type = "checkbox";
		chkDevice.checked = true;
		chkDeviceContainer.appendChild(chkDevice);
		this.AddCheckBoxLabel(chkDeviceContainer, chkDevice, ".").style="width:4px; min-width:4px; padding-left:8px;";

		const lblUsers = document.createElement("div");
		lblUsers.style.gridArea = "7 / 3";
		lblUsers.textContent = "Users:";
		this.tabsPanel.appendChild(lblUsers);
		const chkUsersContainer = document.createElement("div");
		chkUsersContainer.style.gridArea = "7 / 5";
		this.tabsPanel.appendChild(chkUsersContainer);
		const chkUsers = document.createElement("input");
		chkUsers.type = "checkbox";
		chkUsers.checked = true;
		chkUsersContainer.appendChild(chkUsers);
		this.AddCheckBoxLabel(chkUsersContainer, chkUsers, ".").style = "width:4px; min-width:4px; padding-left:8px;";

		const lblDebitNotes = document.createElement("div");
		lblDebitNotes.style.gridArea = "8 / 3";
		lblDebitNotes.textContent = "Debit notes:";
		this.tabsPanel.appendChild(lblDebitNotes);
		const chkDebitNotesContainer = document.createElement("div");
		chkDebitNotesContainer.style.gridArea = "8 / 5";
		this.tabsPanel.appendChild(chkDebitNotesContainer);
		const chkDebitNotes = document.createElement("input");
		chkDebitNotes.type = "checkbox";
		chkDebitNotes.checked = false;
		chkDebitNotesContainer.appendChild(chkDebitNotes);
		this.AddCheckBoxLabel(chkDebitNotesContainer, chkDebitNotes, ".").style = "width:4px; min-width:4px; padding-left:8px;";


		const buttonsContainer = document.createElement("div");
		buttonsContainer.style.gridArea = "10 / 2 / auto / 7";
		buttonsContainer.style.textAlign = "center";
		this.tabsPanel.appendChild(buttonsContainer);

		const btnImport = document.createElement("input");
		btnImport.type = "button";
		btnImport.value = "Import";
		btnImport.style.minWidth = "96px";
		buttonsContainer.appendChild(btnImport);

		const btnCancel = document.createElement("input");
		btnCancel.type = "button";
		btnCancel.value = "Close";
		btnCancel.style.minWidth = "96px";
		buttonsContainer.appendChild(btnCancel);

		const description = document.createElement("div");
		description.textContent = "Use this utility to import an inventory from another Pro-test. It's recommended to import on a blank database. Conflicts and duplicate records will not be managed.";
		description.style.gridArea = "12 / 2 / auto / 7";
		description.style.fontSize = "small";
		this.tabsPanel.appendChild(description);

		btnImport.onclick = async ()=> {
			try {
				btnImport.disabled = btnCancel.disabled = true;
	
				const dialog = this.DialogBox("180px");
				dialog.innerBox.parentElement.style.maxWidth = "400px";
				dialog.innerBox.style.textAlign = "center";
				dialog.btnOK.value = "Hide";
				dialog.btnCancel.style.display = "none";

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

				let uri = `fetch/import?ip=${txtTarget.GetIpString()}&port=${txtPort.value}&protocol=${txtProtocol.value}&username=${encodeURIComponent(txtUsername.value)}&password=${encodeURIComponent(txtPassword.value)}&devices=${chkDevice.checked}&users=${chkUsers.checked}&debitnotes=${chkDebitNotes.checked}`;
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
				btnImport.disabled = btnCancel.disabled = false;
			}
		};

		btnCancel.onclick = ()=> this.Close();
	}

	async ShowFetching() {
		this.params = "fetching";
		this.tabsPanel.textContent = "";

		const lblName = document.createElement("div");
		lblName.style.gridArea = "2 / 7 / auto / 2";
		lblName.style.textAlign = "center";
		lblName.style.fontWeight = "600";
		lblName.style.textDecoration = "underline";
		if (this.taskStatus) lblName.textContent = this.taskStatus.name;
		this.tabsPanel.appendChild(lblName);

		const lblStatus = document.createElement("div");
		lblStatus.style.gridArea = "4 / 3";
		lblStatus.textContent = "Status:";
		this.tabsPanel.appendChild(lblStatus);
		this.lblStatusValue.style.gridArea = "4 / 5";
		this.tabsPanel.appendChild(this.lblStatusValue);


		const lblDate = document.createElement("div");
		lblDate.style.gridArea = "5 / 3";
		lblDate.textContent = "Started date:";
		this.tabsPanel.appendChild(lblDate);
		const lblDateValue = document.createElement("div");
		lblDateValue.style.gridArea = "5 / 5";
		lblDateValue.style.fontWeight = "600";
		let startedDate = new Date(UI.TicksToUnixDate(this.taskStatus?.started ?? UNIX_BASE_TICKS));
		lblDateValue.textContent = `${startedDate.toLocaleDateString(UI.regionalFormat, {})} ${startedDate.toLocaleTimeString(UI.regionalFormat, {})}`;
		this.tabsPanel.appendChild(lblDateValue);

		const lblProgress = document.createElement("div");
		lblProgress.style.gridArea = "6 / 3";
		lblProgress.textContent = "Progress:";
		this.tabsPanel.appendChild(lblProgress);
		this.lblProgressValue.style.gridArea = "6 / 5";
		if (this.taskStatus) this.lblProgressValue.textContent = `${this.taskStatus.completed}/${this.taskStatus.total}`;
		this.tabsPanel.appendChild(this.lblProgressValue);

		const lblEtc = document.createElement("div");
		lblEtc.style.gridArea = "7 / 3";
		lblEtc.textContent = "Etc:";
		this.tabsPanel.appendChild(lblEtc);
		this.lblEtcValue.style.gridArea = "7 / 5";
		if (this.taskStatus) this.lblEtcValue.textContent = this.taskStatus.etc;
		this.tabsPanel.appendChild(this.lblEtcValue);

		const divProgressBar = document.createElement("div");
		divProgressBar.style.gridArea = "8 / 3 / auto / 6";
		divProgressBar.style.height = "18px";
		divProgressBar.style.border = "var(--clr-dark) 2px solid";
		divProgressBar.style.borderRadius = "4px";
		this.tabsPanel.appendChild(divProgressBar);
		if (this.taskStatus) this.divProgress.style.width = `${100 * this.taskStatus.completed / this.taskStatus.total}%`;
		divProgressBar.appendChild(this.divProgress);

		const buttonsContainer = document.createElement("div");
		buttonsContainer.style.gridArea = "10 / 3 / auto / 6";
		buttonsContainer.style.textAlign = "center";
		this.tabsPanel.appendChild(buttonsContainer);

		const btnAbort = document.createElement("input");
		btnAbort.type = "button";
		btnAbort.value = "Abort";
		btnAbort.style.minWidth = "96px";
		buttonsContainer.appendChild(btnAbort);

		try {
			const response = await fetch("fetch/status");
	
			if (response.status !== 200) return;
			
			const json = await response.json();
			if (json.error) throw(json.error);
			this.taskStatus = json;

			if (json.status === "pending") {
				this.ShowPending(json);
			}
			else if (json.status === "fetching" || json.status === "idle") {
				lblName.textContent = json.name;
				let startedDate = new Date(UI.TicksToUnixDate(json.started));
				lblDateValue.textContent = `${startedDate.toLocaleDateString(UI.regionalFormat, {})} ${startedDate.toLocaleTimeString(UI.regionalFormat, {})}`;
				this.lblStatusValue.textContent = json.status;
				this.lblProgressValue.textContent = `${json.completed}/${json.total}`;
				this.lblEtcValue.textContent = json.etc;
				this.divProgress.style.width = `${(100 * json.completed) / json.total}%`;
			}
			else {
				this.tabTask.style.visibility = "hidden";
				this.tabTask.style.animation = "none";
				this.DeselectAllTabs();
				this.tabsList[0].className = "v-tab-selected";
				this.tabsList[0].onclick();
			}
		}
		catch {}

		btnAbort.onclick = ()=> {
			this.ConfirmBox("Are you sure you want to abort this task?").addEventListener("click", async()=> {
				try {
					const response = await fetch("fetch/abort");

					if (response.status !== 200) LOADER.HttpErrorHandler(response.status);
					
					const json = await response.json();
					if (json.error) throw(json.error);
	
					if (json.status === "ok") {
						this.lblStatusValue.textContent = "canceling";
						btnAbort.disabled = true;
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

		const lblName = document.createElement("div");
		lblName.style.gridArea = "1 / 7 / auto / 2";
		lblName.style.textAlign = "center";
		lblName.style.fontWeight = "600";
		lblName.style.textDecoration = "underline";
		if (this.taskStatus) lblName.textContent = json.name;
		this.tabsPanel.appendChild(lblName);

		const lblStart = document.createElement("div");
		lblStart.style.gridArea = "3 / 3";
		lblStart.textContent = "Started date:";
		this.tabsPanel.appendChild(lblStart);
		const lblStartValue = document.createElement("div");
		lblStartValue.style.gridArea = "3 / 5";
		lblStartValue.style.fontWeight = "600";
		let startedDate = new Date(UI.TicksToUnixDate(json.started));
		lblStartValue.textContent = `${startedDate.toLocaleDateString(UI.regionalFormat, {})} ${startedDate.toLocaleTimeString(UI.regionalFormat, {})}`;
		this.tabsPanel.appendChild(lblStartValue);

		const lblFinish = document.createElement("div");
		lblFinish.style.gridArea = "4 / 3";
		lblFinish.textContent = "Finished date:";
		this.tabsPanel.appendChild(lblFinish);
		const lblFinishValue = document.createElement("div");
		lblFinishValue.style.gridArea = "4 / 5";
		lblFinishValue.style.fontWeight = "600";
		let finishedDate = new Date(UI.TicksToUnixDate(json.finished));
		lblFinishValue.textContent = `${finishedDate.toLocaleDateString(UI.regionalFormat, {})} ${finishedDate.toLocaleTimeString(UI.regionalFormat, {})}`;
		this.tabsPanel.appendChild(lblFinishValue);

		const lblSuccess = document.createElement("div");
		lblSuccess.style.gridArea = "5 / 3";
		lblSuccess.textContent = "Successfully fetched:";
		this.tabsPanel.appendChild(lblSuccess);
		const lblSuccessValue = document.createElement("div");
		lblSuccessValue.style.gridArea = "5 / 5";
		lblSuccessValue.style.fontWeight = "600";
		if (this.taskStatus) lblSuccessValue.textContent = json.successful;
		this.tabsPanel.appendChild(lblSuccessValue);

		const lblUnsuccess = document.createElement("div");
		lblUnsuccess.style.gridArea = "6 / 3";
		lblUnsuccess.textContent = "Unsuccessful:";
		this.tabsPanel.appendChild(lblUnsuccess);
		const lblUnsuccessValue = document.createElement("div");
		lblUnsuccessValue.style.gridArea = "6 / 5";
		lblUnsuccessValue.style.fontWeight = "600";
		if (this.taskStatus) lblUnsuccessValue.textContent = json.unsuccessful;
		this.tabsPanel.appendChild(lblUnsuccessValue);


		const lblConflictCondition = document.createElement("div");
		lblConflictCondition.style.gridArea = "8 / 3";
		lblConflictCondition.textContent = "Conflict condition:";
		this.tabsPanel.appendChild(lblConflictCondition);
		const txtConflictCondition = document.createElement("select");
		txtConflictCondition.style.gridArea = "8 / 5";
		txtConflictCondition.style.marginLeft = "0";
		txtConflictCondition.style.width = "160px";
		this.tabsPanel.appendChild(txtConflictCondition);
		const lblConflictConditionComment = document.createElement("div");
		lblConflictConditionComment.style.gridArea = "8 / 6 / auto / 8";
		lblConflictConditionComment.style.fontSize = "small";
		//lblConflictConditionComment.style.width = "240px";
		lblConflictConditionComment.textContent = "Trigger a conflict when the condition is met";
		this.tabsPanel.appendChild(lblConflictConditionComment);

		if (json.type === "devices") {
			const optIP = document.createElement("option");
			optIP.text = "Same IP address";
			optIP.value = "ip";
			txtConflictCondition.appendChild(optIP);
			const optMAC = document.createElement("option");
			optMAC.text = "Same hostname";
			optMAC.value = "hostname";
			txtConflictCondition.appendChild(optMAC);
			const optHostname = document.createElement("option");
			optHostname.text = "Same MAC address";
			optHostname.value = "mac address";
			txtConflictCondition.appendChild(optHostname);
			const optGuid = document.createElement("option");
			optGuid.text = "Same GUID";
			optGuid.value = "guid";
			txtConflictCondition.appendChild(optGuid);
	
			txtConflictCondition.value = "ip";
		}
		else if (json.type === "users") {
			const optUN = document.createElement("option");
			optUN.text = "Same username";
			optUN.value = "username";
			txtConflictCondition.appendChild(optUN);
			const optGuid = document.createElement("option");
			optGuid.text = "Same GUID";
			optGuid.value = "guid";
			txtConflictCondition.appendChild(optGuid);

			txtConflictCondition.value = "username";
		}

		const lblConflict = document.createElement("div");
		lblConflict.style.gridArea = "9 / 3";
		lblConflict.textContent = "Conflict action:";
		this.tabsPanel.appendChild(lblConflict);
		const txtConflict = document.createElement("select");
		txtConflict.style.gridArea = "9 / 5";
		txtConflict.style.marginLeft = "0";
		txtConflict.style.width = "160px";
		this.tabsPanel.appendChild(txtConflict);
		const lblConflictComment = document.createElement("div");
		lblConflictComment.style.gridArea = "9 / 6 / auto / 8";
		lblConflictComment.style.fontSize = "small";
		lblConflictComment.style.width = "240px";
		this.tabsPanel.appendChild(lblConflictComment);

		const optSkip = document.createElement("option");
		optSkip.text = "Skip";
		optSkip.value = 0;
		txtConflict.appendChild(optSkip);
		const optKeepBoth = document.createElement("option");
		optKeepBoth.text = "Keep both";
		optKeepBoth.value = 1;
		txtConflict.appendChild(optKeepBoth);
		const optOverwrite = document.createElement("option");
		optOverwrite.text = "Overwrite";
		optOverwrite.value = 2;
		txtConflict.appendChild(optOverwrite);
		const optAppend = document.createElement("option");
		optAppend.text = "Append";
		optAppend.value = 3;
		txtConflict.appendChild(optAppend);
		const optMerge = document.createElement("option");
		optMerge.text = "Merge";
		optMerge.value = 4;
		txtConflict.appendChild(optMerge);

		txtConflict.value = 4;

		const buttonsContainer = document.createElement("div");
		buttonsContainer.style.gridArea = "11 / 2 / auto / 7";
		buttonsContainer.style.textAlign = "center";
		this.tabsPanel.appendChild(buttonsContainer);

		const btnApprove = document.createElement("input");
		btnApprove.type = "button";
		btnApprove.value = "Approve";
		btnApprove.style.minWidth = "96px";
		buttonsContainer.appendChild(btnApprove);

		const btnDiscard = document.createElement("input");
		btnDiscard.type = "button";
		btnDiscard.value = "Discard";
		btnDiscard.style.minWidth = "96px";
		buttonsContainer.appendChild(btnDiscard);

		txtConflict.onchange = ()=> {
			switch (parseInt(txtConflict.value)) {
			case 0: lblConflictComment.textContent = "Do nothing, keep original record"; break;
			case 1: lblConflictComment.textContent = "Create a new record"; break;
			case 2: lblConflictComment.textContent = "Replace original record"; break;
			case 3: lblConflictComment.textContent = "Append only new properties"; break;
			case 4: lblConflictComment.textContent = "Merge with original record"; break;
			}
		};

		btnApprove.onclick = ()=> {
			this.ConfirmBox("Are you sure you want to approve the fetched dataset?").addEventListener("click", async()=> {
				try {
					let uri = `fetch/approve?condition=${txtConflictCondition.value}&action=${txtConflict.value}`;
					
					const response = await fetch(uri);
	
					if (response.status !== 200) LOADER.HttpErrorHandler(response.status);
					
					const json = await response.json();
					if (json.error) throw(json.error);
	
					if (json.status === "ok") {
						this.tabTask.style.visibility = "hidden";
						this.tabTask.style.animation = "none";
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

		btnDiscard.onclick = ()=> {
			this.ConfirmBox("Are you sure you want to discard the fetched dataset?").addEventListener("click", async()=> {
				try {
					const response = await fetch("fetch/discard");
	
					if (response.status !== 200) LOADER.HttpErrorHandler(response.status);
					
					const json = await response.json();
					if (json.error) throw(json.error);
	
					if (json.status === "ok") {
						this.tabTask.style.visibility = "hidden";
						this.tabTask.style.animation = "none";
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

		txtConflict.onchange();
	}
}
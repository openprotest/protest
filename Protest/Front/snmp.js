class Snmp extends Window {
	constructor(params) {
		super();

		this.AddCssDependencies("snmp.css");

		this.params = params ?? { target: "", oid: "" };

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
		if (this.params.target != null) this.targetInput.value = this.params.target;
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
		snmpInput.appendChild(this.communityInput);

		
		this.credentialsInput = document.createElement("select");
		this.credentialsInput.style.gridArea = "2 / 2";
		this.credentialsInput.style.marginRight = "0";
		this.credentialsInput.style.minWidth = "50px";
		this.credentialsInput.style.display = "none";
		snmpInput.appendChild(this.credentialsInput);

		this.versionInput = document.createElement("select");
		this.versionInput.style.gridArea = "2 / 3";
		if (this.params.oid !== null) this.versionInput.value = this.params.oid;
		snmpInput.appendChild(this.versionInput);

		const versionOptions = [1, 2, 3];
		for (let i=0; i<versionOptions.length; i++) {
			const option = document.createElement("option");
			option.value = versionOptions[i];
			option.textContent = `Version ${versionOptions[i]}`;
			this.versionInput.appendChild(option);
		}

		const oidLabel = document.createElement("div");
		oidLabel.style.lineHeight = "28px";
		oidLabel.style.gridArea = "3 / 1";
		oidLabel.textContent = "OID:";
		snmpInput.appendChild(oidLabel);

		this.oidInput = document.createElement("textarea");
		this.oidInput.placeholder = "1.3.6.1.2.1.1.5.0";
		this.oidInput.style.gridArea = "3 / 2 / 5 / 4";
		this.oidInput.style.resize = "none";
		this.oidInput.style.minWidth = "50px";
		if (this.params.oid !== null) this.oidInput.value = this.params.oid;
		snmpInput.appendChild(this.oidInput);

		this.getButton = document.createElement("input");
		this.getButton.type = "button";
		this.getButton.value = "Get";
		this.getButton.style.minWidth = "40px";
		this.getButton.style.height = "auto";
		this.getButton.style.gridArea = "3 / 4 / 5 / 4";
		snmpInput.appendChild(this.getButton);

		this.setButton = document.createElement("input");
		this.setButton.type = "button";
		this.setButton.value = "Set";
		this.setButton.style.minWidth = "40px";
		this.setButton.style.height = "auto";
		this.setButton.style.gridArea = "3 / 5 / 5 / 5";
		snmpInput.appendChild(this.setButton);
		
		const toggleButton = document.createElement("input");
		toggleButton.type = "button";
		toggleButton.className = "snmp-toggle-button";
		this.content.appendChild(toggleButton);

		this.plotBox = document.createElement("div");
		this.plotBox.className = "snmp-plot no-results";
		this.content.appendChild(this.plotBox);

		this.targetInput.oninput = ()=> { this.params.target = this.targetInput.value };
		this.oidInput.oninput = ()=> { this.params.oid = this.oidInput.value };

		this.versionInput.onchange = ()=> {
			if (this.versionInput.value == 3) {
				authLabel.textContent = "Credentials:";
				this.credentialsInput.style.display = "block";
			}
			else {
				authLabel.textContent = "Community:";
				this.credentialsInput.style.display = "none";
			}
		};

		this.getButton.onclick = ()=> { this.GetQuery() };
		this.setButton.onclick = ()=> { this.SetQuery() };

		toggleButton.onclick = ()=> {
			if (snmpInput.style.visibility === "hidden") {
				toggleButton.style.top = "96px";
				toggleButton.style.transform = "rotate(-180deg)";
				snmpInput.style.visibility = "visible";
				snmpInput.style.opacity = "1";
				snmpInput.style.transform = "none";
				this.plotBox.style.top = "136px";
			}
			else {
				toggleButton.style.top = "0px";
				toggleButton.style.transform = "rotate(0deg)";
				snmpInput.style.visibility = "hidden";
				snmpInput.style.opacity = "0";
				snmpInput.style.transform = "translateY(-64px)";
				this.plotBox.style.top = "36px";
			}
		};

		if (this.params.target.length > 0 && this.params.oid.length > 0) {
			this.getButton.onclick();
			toggleButton.onclick();
		}
	}

	async GetQuery() {
		if (this.targetInput.value.length == 0 || this.oidInput.value.length == 0) {
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
		this.plotBox.style.display = "none";
		this.plotBox.textContent = "";

		console.log(this.versionInput.value);

		try {
			let url;
			if (this.versionInput.value == 3) {
				url = `snmp/get?target=${encodeURIComponent(this.targetInput.value)}&ver=3&cred=${this.credentialsInput.value}`;
			}
			else {
				url = `snmp/get?target=${encodeURIComponent(this.targetInput.value)}&ver=${this.versionInput.value}&community=${encodeURIComponent(this.credentialsInput.value)}`;
			}

			const response = await fetch(url, {
				method: "POST",
				body: this.oidInput.value.trim()
			});

			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const text = await response.text();
			//TODO:

		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/error.svg");
		}
		finally {
			this.getButton.disabled = false;
			this.setButton.disabled = false;
			this.plotBox.style.display = "block";
			this.content.removeChild(spinner);
		}
	}

	async SetQuery() {
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
			//TODO:
		};

		valueInput.onkeydown = event=> {
			if (event.key === "Enter") {
				dialog.okButton.click();
			}
		}
	}
}
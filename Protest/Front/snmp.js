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
		if (this.params.target != null) this.targetInput.value = this.params.target;
		snmpInput.appendChild(this.targetInput);

		const authLabel = document.createElement("div");
		authLabel.style.lineHeight = "28px";
		authLabel.style.gridArea = "2 / 1";
		authLabel.textContent = "Community:";
		snmpInput.appendChild(authLabel);

		this.authInput = document.createElement("input");
		this.authInput.type = "text";
		this.authInput.placeholder = "public";
		this.authInput.style.gridArea = "2 / 2";
		this.authInput.style.marginRight = "0";
		snmpInput.appendChild(this.authInput);

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
		if (this.params.oid !== null) this.oidInput.value = this.params.oid;
		snmpInput.appendChild(this.oidInput);

		this.getButton = document.createElement("input");
		this.getButton.type = "button";
		this.getButton.value = "Get";
		this.getButton.style.width = this.getButton.style.minWidth = "58px";
		this.getButton.style.height = "auto";
		this.getButton.style.gridArea = "3 / 4 / 5 / 4";
		snmpInput.appendChild(this.getButton);

		this.setButton = document.createElement("input");
		this.setButton.type = "button";
		this.setButton.value = "Set";
		this.setButton.style.width = this.setButton.style.minWidth = "58px";
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

		//TODO:
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
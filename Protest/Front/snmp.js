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
		this.targetInput.style.gridArea = "1 / 2";
		if (this.params.target != null) this.targetInput.value = this.params.target;
		snmpInput.appendChild(this.targetInput);

		const oidLabel = document.createElement("div");
		oidLabel.style.lineHeight = "28px";
		oidLabel.style.gridArea = "2 / 1";
		oidLabel.textContent = "OID:";
		snmpInput.appendChild(oidLabel);

		this.oidInput = document.createElement("input");
		this.oidInput.type = "text";
		this.oidInput.style.gridArea = "2 / 2";
		if (this.params.oid != null) this.oidInput.value = this.params.oid;
		snmpInput.appendChild(this.oidInput);

		this.executeButton = document.createElement("input");
		this.executeButton.type = "button";
		this.executeButton.value = "Execute";
		this.executeButton.style.height = "auto";
		this.executeButton.style.gridArea = "1 / 3 / 3 / 3";
		snmpInput.appendChild(this.executeButton);
		
		const toggleButton = document.createElement("input");
		toggleButton.type = "button";
		toggleButton.className = "snmp-toggle-button";
		this.content.appendChild(toggleButton);

		this.plotBox = document.createElement("div");
		this.plotBox.className = "snmp-plot no-results";
		this.content.appendChild(this.plotBox);

		this.targetInput.oninput = ()=> { this.params.target = this.targetInput.value };
		this.oidInput.oninput = ()=> { this.params.oid = this.oidInput.value };

		this.executeButton.onclick = ()=> this.Query();

		toggleButton.onclick =()=> {
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
			this.executeButton.onclick();
			toggleButton.onclick();
		}
	}

	async Query() {

	}
}
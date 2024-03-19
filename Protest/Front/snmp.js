class Snmp extends Window {
	constructor(params) {
		super();

		this.AddCssDependencies("wmi.css");

		this.params = params ?? { target: "", query: "" };

		this.SetTitle("SNMP pooling");
		this.SetIcon("mono/snmp.svg");

		this.content.style.overflow = "hidden";

		const wmiInput = document.createElement("div");
		wmiInput.className = "wmi-input";
		this.content.appendChild(wmiInput);

		const targetLabel = document.createElement("div");
		targetLabel.style.gridArea = "1 / 1";
		targetLabel.textContent = "Target:";
		wmiInput.appendChild(targetLabel);

		this.targetInput = document.createElement("input");
		this.targetInput.type = "text";
		this.targetInput.placeholder = "hostname or ip";
		this.targetInput.style.gridArea = "1 / 2";
		if (this.params.target != null) this.targetInput.value = this.params.target;
		wmiInput.appendChild(this.targetInput);
	}
}
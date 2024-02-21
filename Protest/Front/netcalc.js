class NetCalc extends Window {
	constructor() {
		super();

		this.SetTitle("Network calculator");
		this.SetIcon("mono/netcalc.svg");

		this.content.style.overflow = "auto";
		this.content.style.padding = "16px";
		this.content.style.display = "grid";
		this.content.style.gridTemplateColumns = "auto 192px 72px 192px 96px auto";
		this.content.style.gridTemplateRows = "repeat(12, 32px)";
		this.content.style.alignItems = "end";
		this.content.style.color = "var(--clr-dark)";
		this.content.style.backgroundColor = "var(--clr-pane)";
		this.content.style.borderRadius = "4px";
		this.content.style.margin = "0 auto";
		this.content.style.maxWidth = "600px";
		this.content.style.maxHeight = "400px";


		let addressLabel = document.createElement("div");
		addressLabel.textContent = "IP address:";
		addressLabel.style.gridColumn = "2";
		addressLabel.style.gridRow = "1";
		this.content.appendChild(addressLabel);

		let addressBox = document.createElement("div");
		addressBox.style.gridColumn = "2";
		addressBox.style.gridRow = "2";
		this.content.appendChild(addressBox);
		this.ipAddress = new IpBox();
		this.ipAddress.SetIp(192, 168, 0, 0);
		this.ipAddress.Attach(addressBox);

		this.classLabel = document.createElement("div");
		this.classLabel.textContent = "Class C";
		this.classLabel.style.gridColumn = "3";
		this.classLabel.style.gridRow = "2";
		this.classLabel.style.padding = "10px 0px";
		this.content.appendChild(this.classLabel);

		let maskLabel = document.createElement("div");
		maskLabel.textContent = "Subnet mask:";
		maskLabel.style.gridColumn = "2";
		maskLabel.style.gridRow = "3";
		this.content.appendChild(maskLabel);

		let maskBox = document.createElement("div");
		maskBox.style.gridColumn = "2";
		maskBox.style.gridRow = "4";
		this.content.appendChild(maskBox);
		this.ipMask = new IpBox();
		this.ipMask.SetIp(255,255,255,0);
		this.ipMask.Attach(maskBox);

		let slashLabel = document.createElement("div");
		slashLabel.textContent = "/";
		slashLabel.style.display = "inline-block";
		slashLabel.style.paddingLeft = "4px";
		maskBox.appendChild(slashLabel);

		let cidrLabel = document.createElement("div");
		cidrLabel.textContent = "CIDR:";
		cidrLabel.value = "24";
		cidrLabel.style.gridColumn = "3";
		cidrLabel.style.gridRow = "3";
		this.content.appendChild(cidrLabel);

		this.cidrInput = document.createElement("input");
		this.cidrInput.type = "number";
		this.cidrInput.min = "4";
		this.cidrInput.max = "30";
		this.cidrInput.value = "24";
		this.cidrInput.style.width = "40px";
		this.cidrInput.style.marginLeft = "0px";
		this.cidrInput.style.gridColumn = "3";
		this.cidrInput.style.gridRow = "4";
		this.content.appendChild(this.cidrInput);

		this.cidrRange = document.createElement("input");
		this.cidrRange.type = "range";
		this.cidrRange.min = "4";
		this.cidrRange.max = "30";
		this.cidrRange.value = "24";
		this.cidrRange.style.gridColumn = "4";
		this.cidrRange.style.gridRow = "4";
		this.cidrRange.style.margin = "10px 0";
		this.cidrRange.style.marginLeft = "8px";
		this.content.appendChild(this.cidrRange);


		const wildcardLabel = document.createElement("div");
		wildcardLabel.textContent = "Wildcard:";
		wildcardLabel.value = "24";
		wildcardLabel.style.gridColumn = "2";
		wildcardLabel.style.gridRow = "5";
		this.content.appendChild(wildcardLabel);

		this.wildcardBox = document.createElement("div");
		this.wildcardBox.textContent = "0.0.0.255";
		this.wildcardBox.style.gridArea = "6 / 2";
		this.wildcardBox.style.padding = "4px 8px";
		this.wildcardBox.style.textAlign = "center";
		this.content.appendChild(this.wildcardBox);


		this.mapBox = document.createElement("div");
		this.mapBox.style.gridArea = "9 / 5 / 1 / 2";
		this.mapBox.style.padding = "8px";
		this.mapBox.style.textAlign = "center";
		this.content.appendChild(this.mapBox);

		this.subnetLabel = document.createElement("div");
		this.subnetLabel.textContent = `Subnet:\n192.168.0.0`;
		this.subnetLabel.style.gridArea = "11 / 2 / 1 / 2";
		this.subnetLabel.style.textAlign = "center";
		this.subnetLabel.style.whiteSpace = "pre-wrap";
		this.content.appendChild(this.subnetLabel);

		this.broadcastLabel = document.createElement("div");
		this.broadcastLabel.textContent = `Broadcast:\n192.168.0.255`;
		this.broadcastLabel.style.gridArea = "11 / 4 / 1 / auto";
		this.broadcastLabel.style.textAlign = "center";
		this.broadcastLabel.style.whiteSpace = "pre-wrap";
		this.content.appendChild(this.broadcastLabel);

		this.RangeLabel = document.createElement("div");
		this.RangeLabel.textContent = `Host range:\n192.168.0.1 - 192.168.0.254`;
		this.RangeLabel.style.gridArea = "13 / 2 / 1 / 5";
		this.RangeLabel.style.textAlign = "center";
		this.RangeLabel.style.whiteSpace = "pre-wrap";
		this.content.appendChild(this.RangeLabel);

		this.totalLabel = document.createElement("div");
		this.totalLabel.textContent = `Hosts:\n254`;
		this.totalLabel.style.gridArea = "11 / 5 / 1 / 5";
		this.totalLabel.style.textAlign = "center";
		this.totalLabel.style.marginLeft = "8px";
		this.totalLabel.style.whiteSpace = "pre-wrap";
		this.content.appendChild(this.totalLabel);

		this.wildcardBox.style.border = this.mapBox.style.border = this.subnetLabel.style.border = this.broadcastLabel.style.border = this.RangeLabel.style.border = this.totalLabel.style.border = "var(--clr-dark) 1px solid";
		this.wildcardBox.style.borderRadius = this.mapBox.style.borderRadius = this.subnetLabel.style.borderRadius = this.broadcastLabel.style.borderRadius = this.RangeLabel.style.borderRadius = this.totalLabel.style.borderRadius = "4px";

		this.wildcardBox.style.userSelect = this.subnetLabel.style.userSelect = this.broadcastLabel.style.userSelect = this.RangeLabel.style.userSelect = this.totalLabel.style.userSelect = "text";

		this.cidrInput.oninput = ()=> {
			this.cidrRange.value = this.cidrInput.value;

			let octet = Math.floor(this.cidrInput.value / 8);
			let value = this.cidrInput.value % 8;

			for (let i=0; i<octet; i++) {
				this.ipMask.textBoxes[i].value = 255;
			}

			for (let i=octet+1; i<4; i++) {
				this.ipMask.textBoxes[i].value = 0;
			}

			let v = 0;
			for (let i=0; i<value; i++) {
				v += Math.pow(2, 7 - i);
			}
			this.ipMask.textBoxes[octet].value = v;

			this.Calculate();
		};

		this.cidrRange.oninput = ()=> {
			this.cidrInput.value = this.cidrRange.value;

			let octet = Math.floor(this.cidrRange.value / 8);
			let value = this.cidrRange.value % 8;

			for (let i = 0; i < octet; i++)
				this.ipMask.textBoxes[i].value = 255;

			for (let i = octet + 1; i < 4; i++)
				this.ipMask.textBoxes[i].value = 0;

			let v = 0;
			for (let i = 0; i < value; i++)
				v += Math.pow(2, 7 - i);
			this.ipMask.textBoxes[octet].value = v;

			this.Calculate();
		};

		for (let i = 0; i < 32; i++) {
			let newBit = document.createElement("div");
			newBit.style.display = "inline-block";
			newBit.style.width = "12px";
			newBit.style.height = "14px";
			newBit.style.margin = "0 1px 0 0";
			newBit.style.borderRadius = "1px";
			newBit.style.transition = ".4s";
			if (i % 8 == 0 && 1 > 0) newBit.style.margin = "0 1px 0 4px";
			this.mapBox.appendChild(newBit);
		}

		this.mapBox.childNodes[0].style.borderRadius = "2px 1px 1px 2px";
		this.mapBox.childNodes[7].style.borderRadius = "1px 2px 2px 1px";
		this.mapBox.childNodes[8].style.borderRadius = "2px 1px 1px 2px";
		this.mapBox.childNodes[15].style.borderRadius = "1px 2px 2px 1px";
		this.mapBox.childNodes[16].style.borderRadius = "2px 1px 1px 2px";
		this.mapBox.childNodes[23].style.borderRadius = "1px 2px 2px 1px";
		this.mapBox.childNodes[24].style.borderRadius = "2px 1px 1px 2px";
		this.mapBox.childNodes[31].style.borderRadius = "1px 2px 2px 1px";

		this.ipAddress.textBoxes[0].onkeyup = this.ipAddress.textBoxes[0].oninput =
		this.ipAddress.textBoxes[1].onkeyup = this.ipAddress.textBoxes[1].oninput =
		this.ipAddress.textBoxes[2].onkeyup = this.ipAddress.textBoxes[2].oninput =
		this.ipAddress.textBoxes[3].onkeyup = this.ipAddress.textBoxes[3].oninput = ()=> {
			this.Calculate();
		};

		this.ipMask.textBoxes[0].onkeyup = this.ipMask.textBoxes[0].oninput =
		this.ipMask.textBoxes[1].onkeyup = this.ipMask.textBoxes[1].oninput =
		this.ipMask.textBoxes[2].onkeyup = this.ipMask.textBoxes[2].oninput =
		this.ipMask.textBoxes[3].onkeyup = this.ipMask.textBoxes[3].oninput = ()=> {
			let bits = parseInt(this.ipMask.textBoxes[0].value).toString(2) +
				parseInt(this.ipMask.textBoxes[1].value).toString(2) +
				parseInt(this.ipMask.textBoxes[2].value).toString(2) +
				parseInt(this.ipMask.textBoxes[3].value).toString(2);

			let bitCount = 0;
			for (let i = 0; i < bits; i++) {
				if (bits[i] == "0") break;
				bitCount++;
			}

			this.cidrRange.value = bitCount;
			this.cidrInput.value = bitCount;

			this.Calculate();
		};

		this.Calculate();
	}

	Calculate() {
		let ip = this.ipAddress.GetIpArray();
		let mask = this.ipMask.GetIpArray();

		let octet = parseInt(this.ipAddress.GetIpArray()[0]);
		let octet2 = parseInt(this.ipAddress.GetIpArray()[1]);

		if (octet == 10) this.classLabel.textContent = "Private";
		else if (octet > 0 && octet < 127) this.classLabel.textContent = "Class A";
		else if (octet == 127) this.classLabel.textContent = "Local host";

		else if (octet == 172 && octet2 > 15 && octet2 < 32) this.classLabel.textContent = "Private";
		else if (octet > 127 && octet < 192) this.classLabel.textContent = "Class B";

		else if (octet == 192) this.classLabel.textContent = "Private";
		else if (octet > 192 && octet < 224) this.classLabel.textContent = "Class C";

		else if (octet >= 224 && octet < 240) this.classLabel.textContent = "Class D";
		else this.classLabel.textContent = "";

		let net = [], broadcast = [];
		for (let i = 0; i < 4; i++) {
			net.push(ip[i] & mask[i]);
			broadcast.push(ip[i] | (255 - mask[i]));
		}

		let static_bits = 0;
		if (octet > 0 && octet <= 127) static_bits = 8;
		else if (octet > 127 && octet <= 192) static_bits = 16;
		else static_bits = 24;

		for (let i = 0; i < 32; i++) {
			this.mapBox.childNodes[i].style.backgroundColor = i < this.cidrRange.value ? "rgb(232,96,0)" : "rgb(96,232,23)";
		}

		for (let i = 0; i < static_bits; i++) {
			this.mapBox.childNodes[i].style.backgroundColor = i < this.cidrRange.value ? "rgb(232,0,0)" : "rgb(96,232,32)";
		}

		this.subnetLabel.textContent = `Subnet:\n${net.join(".")}`;
		this.broadcastLabel.textContent = `Broadcast:\n${broadcast.join(".")}`;
		this.RangeLabel.textContent = `Host range:\n` + net[0] + "." + net[1] + "." + net[2] + "." + (net[3] + 1) + " - " +
			broadcast[0] + "." + broadcast[1] + "." + broadcast[2] + "." + (broadcast[3] - 1);

		this.totalLabel.textContent = `Hosts:\n${(Math.pow(2, 32 - this.cidrRange.value) - 2)}`;

		this.wildcardBox.textContent = `${255-mask[0]}.${255-mask[1]}.${255-mask[2]}.${255-mask[3]}`;
	}
}
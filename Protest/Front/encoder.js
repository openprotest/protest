class Encoder extends Window {
	constructor(params) {
		super();

		this.params = params ?? "";

		this.SetTitle("Encoder");
		this.SetIcon("mono/encoder.svg");

		this.content.style.padding = "16px 16px 0 16px";

		const container = document.createElement("div");
		container.style.width = "80%";
		container.style.maxWidth = "800px";
		container.style.height = "calc(100% - 40px)";
		container.style.margin = "8px auto 0 auto";
		container.style.padding = "8px";
		container.style.backgroundColor = "var(--clr-pane)";
		container.style.color = "rgb(16,16,16)";
		container.style.borderRadius = "4px";
		container.style.display = "grid";
		container.style.gridTemplateColumns = "auto";
		container.style.gridTemplateRows = "auto 64px auto";
		this.content.appendChild(container);

		this.txtA = document.createElement("div");
		this.txtA.style.overflowY = "auto";
		this.txtA.style.backgroundColor = "var(--clr-control)";
		this.txtA.style.borderRadius = "4px";
		this.txtA.style.padding = "4px";
		this.txtA.style.gridArea = "1 / 1";
		this.txtA.contentEditable = true;
		container.appendChild(this.txtA);

		const buttons = document.createElement("div");
		buttons.style.gridArea = "2 / 1";
		buttons.style.textAlign = "center";
		buttons.style.padding = "10px";
		container.appendChild(buttons);

		this.txtB = document.createElement("div");
		this.txtB.style.overflowY = "auto";
		this.txtB.style.backgroundColor = "var(--clr-control)";
		this.txtB.style.borderRadius = "4px";
		this.txtB.style.padding = "4px";
		this.txtB.style.gridArea = "3 / 1";
		this.txtB.contentEditable = true;
		container.appendChild(this.txtB);

		this.txtEncoding = document.createElement("select");
		buttons.appendChild(this.txtEncoding);

		this.txtEncoding.appendChild(this.CreateOption("Binary"));
		this.txtEncoding.appendChild(this.CreateOption("Binary 16-bits"));
		this.txtEncoding.appendChild(this.CreateOption("Hex"));
		this.txtEncoding.appendChild(this.CreateOption("Hex 16-bits"));
		this.txtEncoding.appendChild(this.CreateOption("Base-64"));
		this.txtEncoding.appendChild(this.CreateOption("URL"));
		this.txtEncoding.appendChild(this.CreateOption("HTML entity"));

		this.txtEncoding.value = "Base-64";

		this.btnEncode = document.createElement("input");
		this.btnEncode.type = "button";
		this.btnEncode.value = "Encode";
		this.btnEncode.style.height = "32px";
		buttons.appendChild(this.btnEncode);

		this.btnDecode = document.createElement("input");
		this.btnDecode.type = "button";
		this.btnDecode.value = "Decode";
		this.btnDecode.style.height = "32px";
		buttons.appendChild(this.btnDecode);

		this.btnEncode.onclick = () => this.Encode();
		this.btnDecode.onclick = () => this.Decode();
	}

	CreateOption(name) {
		const option = document.createElement("option");
		option.value = name;
		option.textContent = name;
		return option;
	}

	Encode() {
		this.txtA.textContent = this.txtA.textContent.trim();

		switch (this.txtEncoding.value) {
		case "Binary":
			let bin = "";
			for (let i = 0; i < this.txtA.textContent.length; i++)
				bin += this.txtA.textContent.charCodeAt(i).toString(2).padStart(8,"0");
			this.txtB.textContent = bin;
			break;

		case "Binary 16-bits":
			let bin16 = "";
			for (let i = 0; i < this.txtA.textContent.length; i++)
				bin16 += this.txtA.textContent.charCodeAt(i).toString(2).padStart(16, "0");
			this.txtB.textContent = bin16;
			break;

		case "Hex":
			let hex = "";
			for (let i = 0; i < this.txtA.textContent.length; i++)
				hex += this.txtA.textContent.charCodeAt(i).toString(16).padStart(2, "0");
			this.txtB.textContent = hex;
			break;

		case "Hex 16-bits":
			let hex16 = "";
			for (let i = 0; i < this.txtA.textContent.length; i++)
				hex16 += this.txtA.textContent.charCodeAt(i).toString(16).padStart(4, "0");
			this.txtB.textContent = hex16;
			break;

		case "Base-64":
			this.txtB.textContent = btoa(this.txtA.textContent);
			break;

		case "URL":
			this.txtB.textContent = encodeURI(this.txtA.inntextContenterHTML);
			break;

		case "HTML entity":
			let div = document.createElement('div');
			div.appendChild(document.createTextNode(this.txtA.textContent));
			this.txtB.textContent = div.textContent;
			break;
		}
	}

	Decode() {
		this.txtB.textContent = this.txtB.textContent.trim();

		switch (this.txtEncoding.value) {
		case "Binary":
			let bin = this.txtB.textContent;
			this.txtA.textContent = "";
			for (let i = 0; i < bin.length; i += 8)
				this.txtA.textContent += String.fromCharCode(parseInt(bin.substring(i, i + 8), 2));
			break;

		case "Binary 16-bits":
			let bin16 = this.txtB.textContent;
			this.txtA.textContent = "";
			for (let i = 0; i < bin16.length; i += 16)
				this.txtA.textContent += String.fromCharCode(parseInt(bin16.substring(i, i + 16), 2));
			break;

		case "Hex":
			let hex = this.txtB.textContent;
			if (hex.startsWith("0x")) hex = hex.substring(2);
			this.txtA.textContent = "";
			for (let i = 0; i < hex.length; i += 2)
				this.txtA.textContent += String.fromCharCode(parseInt(hex.substring(i, i + 2), 16));
			break;

		case "Hex 16-bits":
			let hex16 = this.txtB.textContent;
			if (hex16.startsWith("0x")) hex16 = hex16.substring(2);
			this.txtA.textContent = "";
			for (let i = 0; i < hex16.length; i += 4)
				this.txtA.textContent += String.fromCharCode(parseInt(hex16.substring(i, i + 4), 16));
			break;

		case "Base-64":
			try {
				this.txtA.textContent = atob(this.txtB.textContent);
			}
			catch (ex) {
				this.ConfirmBox(ex, true, "mono/error.svg");
			}
			break;

		case "URL":
			this.txtA.textContent = decodeURI(this.txtB.textContent);
			break;

		case "HTML entity":
			let txt = document.createElement('textarea');
			txt.textContent = this.txtB.textContent;
			this.txtA.textContent = txt.value;
			break;
		}
	}
}
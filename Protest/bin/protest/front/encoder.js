class Encoder extends Window {
    constructor(args) {
        super();

        this.args = args ? args : "";

        this.SetTitle("Encoder");
        this.SetIcon("res/encoder.svgz");

        this.content.style.padding = "16px 16px 0 16px";

        const container = document.createElement("div");
        container.style.width = "80%";
        container.style.maxWidth = "800px";
        container.style.height = "calc(100% - 40px)";
        container.style.margin = "8px auto 0 auto";
        container.style.padding = "8px";
        container.style.backgroundColor = "var(--pane-color)";
        container.style.color = "rgb(16,16,16)";
        container.style.borderRadius = "4px";
        container.style.display = "grid";
        container.style.gridTemplateColumns = "auto";
        container.style.gridTemplateRows = "auto 64px auto";
        this.content.appendChild(container);

        this.txtA = document.createElement("div");
        this.txtA.style.overflowY = "auto";
        this.txtA.style.backgroundColor = "var(--control-color)";
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
        this.txtB.style.backgroundColor = "var(--control-color)";
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
        option.innerHTML = name;
        return option;
    }

    Encode() {
        this.txtA.innerHTML = this.txtA.innerHTML.trim();

        switch (this.txtEncoding.value) {
            case "Binary":
                let bin = "";
                for (let i = 0; i < this.txtA.innerHTML.length; i++)
                    bin += this.txtA.innerHTML.charCodeAt(i).toString(2).padStart(8,"0");
                this.txtB.innerHTML = bin;
                break;

            case "Binary 16-bits":
                let bin16 = "";
                for (let i = 0; i < this.txtA.innerHTML.length; i++)
                    bin16 += this.txtA.innerHTML.charCodeAt(i).toString(2).padStart(16, "0");
                this.txtB.innerHTML = bin16;
                break;

            case "Hex":
                let hex = "";
                for (let i = 0; i < this.txtA.innerHTML.length; i++)
                    hex += this.txtA.innerHTML.charCodeAt(i).toString(16).padStart(2, "0");
                this.txtB.innerHTML = hex;
                break;

            case "Hex 16-bits":
                let hex16 = "";
                for (let i = 0; i < this.txtA.innerHTML.length; i++)
                    hex16 += this.txtA.innerHTML.charCodeAt(i).toString(16).padStart(4, "0");
                this.txtB.innerHTML = hex16;
                break;

            case "Base-64":
                this.txtB.innerHTML = btoa(this.txtA.innerHTML);
                break;

            case "URL":
                this.txtB.innerHTML = encodeURI(this.txtA.innerHTML);
                break;

            case "HTML entity":
                let div = document.createElement('div');
                div.appendChild(document.createTextNode(this.txtA.innerHTML));
                this.txtB.innerHTML = div.innerHTML;
                break;
        }
    }

    Decode() {
        this.txtB.innerHTML = this.txtB.innerHTML.trim();

        switch (this.txtEncoding.value) {
            case "Binary":
                let bin = this.txtB.innerHTML;
                this.txtA.innerHTML = "";
                for (let i = 0; i < bin.length; i += 8)
                    this.txtA.innerHTML += String.fromCharCode(parseInt(bin.substring(i, i + 8), 2));
                break;

            case "Binary 16-bits":
                let bin16 = this.txtB.innerHTML;
                this.txtA.innerHTML = "";
                for (let i = 0; i < bin16.length; i += 16)
                    this.txtA.innerHTML += String.fromCharCode(parseInt(bin16.substring(i, i + 16), 2));
                break;

            case "Hex":
                let hex = this.txtB.innerHTML;
                if (hex.startsWith("0x")) hex = hex.substring(2);
                this.txtA.innerHTML = "";
                for (let i = 0; i < hex.length; i += 2) 
                    this.txtA.innerHTML += String.fromCharCode(parseInt(hex.substring(i, i + 2), 16));
                break;

            case "Hex 16-bits":
                let hex16 = this.txtB.innerHTML;
                if (hex16.startsWith("0x")) hex16 = hex16.substring(2);
                this.txtA.innerHTML = "";
                for (let i = 0; i < hex16.length; i += 4)
                    this.txtA.innerHTML += String.fromCharCode(parseInt(hex16.substring(i, i + 4), 16));
                break;

            case "Base-64":
                try {
                    this.txtA.innerHTML = atob(this.txtB.innerHTML);
                } catch (ex) {
                    this.ConfirmBox(ex, true);
                }
                break;

            case "URL":
                this.txtA.innerHTML = decodeURI(this.txtB.innerHTML);
                break;

            case "HTML entity":
                let txt = document.createElement('textarea');
                txt.innerHTML = this.txtB.innerHTML;
                this.txtA.innerHTML = txt.value;
                break;
        }
    }

}
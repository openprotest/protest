class SiteCheck extends Window {
	constructor(args) {
		super();

		this.args = args ? args : { value: "" };

		this.SetTitle("Site check");
		this.SetIcon("mono/websitecheck.svg");

		this.content.style.padding = "32px 32px 0 32px";
		this.content.style.overflowY = "auto";
		this.content.style.textAlign = "center";

		this.targetInput = document.createElement("input");
		this.targetInput.placeholder = "URI";
		this.targetInput.type = "text";
		this.targetInput.style.fontSize = "larger";
		this.targetInput.style.width = "60%";
		this.targetInput.style.maxWidth = "720px";
		this.targetInput.style.textAlign = "center";
		this.targetInput.value = this.args.value;
		this.content.appendChild(this.targetInput);

		this.defaultElement = this.targetInput;
		this.targetInput.focus();

		this.checkButton = document.createElement("input");
		this.checkButton.type = "button";
		this.checkButton.value = "Check";
		this.checkButton.style.display = "block-line";
		this.checkButton.style.width = "96px";
		this.checkButton.style.height = "40px";
		this.checkButton.style.margin = "16px";
		this.checkButton.style.borderRadius = "4px";
		this.content.appendChild(this.checkButton);

		this.result = document.createElement("div");
		this.result.style.textAlign = "left";
		this.result.style.width = "100%";
		this.result.style.padding = "8px";
		this.result.style.boxSizing = "border-box";
		this.result.style.overflowX = "hidden";
		this.result.style.userSelect = "text";
		this.content.appendChild(this.result);

		this.spinner = document.createElement("div");
		this.spinner.className = "spinner";
		this.spinner.style.textAlign = "left";
		this.spinner.style.marginBottom = "32px";
		this.spinner.style.visibility = "hidden";
		this.content.appendChild(this.spinner);
		this.spinner.appendChild(document.createElement("div"));

		this.ws = null; //websocket

		this.targetInput.onkeydown = event=> {
			if (event.key === "Enter") this.checkButton.onclick();
		};

		this.targetInput.oninput = event=> {
			this.args.value = this.targetInput.value;
		};

		this.checkButton.onclick = ()=> {
			if (this.targetInput.value.length === 0) {
				this.ConfirmBox("No uri", true);
				return;
			}

			this.targetInput.value = this.targetInput.value.trim();

			if (this.targetInput.value.indexOf("://") === -1) this.targetInput.value = "http://" + this.targetInput.value;

			this.targetInput.disabled = true;
			this.checkButton.disabled = true;
			this.spinner.style.visibility = "visible";
			this.Check();
		};
	}

	Check() {
		let server = window.location.href.replace("https://", "").replace("http://", "");
		if (server.indexOf("/") > 0) server = server.substring(0, server.indexOf("/"));

		this.ws = new WebSocket((KEEP.isSecure ? "wss://" : "ws://") + server + "/ws/sitecheck");

		this.ws.onopen = ()=> {
			this.result.textContent = "";
			this.ws.send(this.targetInput.value);
		};

		this.ws.onmessage = event=> {
			const container = document.createElement("div");
			container.style.backgroundColor = "var(--clr-pane)";
			container.style.color = "#202020";
			container.style.margin = "8px 0";
			container.style.padding = "4px 8px";
			container.style.borderRadius = "2px";
			this.result.appendChild(container);

			const json = JSON.parse(event.data);

			const dot = document.createElement("div");
			dot.style.display = "inline-block";
			dot.style.width = "12px";
			dot.style.height = "12px";
			dot.style.backgroundColor = json.status === "pass" ? "rgb(128,224,0)" : "var(--clr-error)";
			dot.style.border = json.status === "pass" ? "1px solid color-mix(in hsl, rgb(128,224,0), black)" : "1px solid color-mix(in hsl, var(--clr-error), black)";
			dot.style.borderRadius = "14px";
			dot.style.boxSizing = "border-box";
			container.appendChild(dot);

			const title = document.createElement("div");
			title.style.display = "inline";
			title.style.fontWeight = "bold";
			title.style.paddingLeft = "4px";
			title.textContent = json.title;
			container.appendChild(title);


			if (json.status === "pass") {
				for (let i = 0; i < json.result.length; i++) {
					let line = document.createElement("div");
					line.style.overflow = "hidden";
					line.style.textOverflow = "ellipsis";
					line.style.whiteSpace = "nowrap";
					line.textContent = json.result[i];
					container.appendChild(line);
				}
			}
			else {
				const error = document.createElement("div");
				error.textContent = json.error;
				container.appendChild(error);
			}
		};

		this.ws.onclose = ()=> {
			this.targetInput.disabled = false;
			this.checkButton.disabled = false;
			this.spinner.style.visibility = "hidden";
		};

		this.ws.onerror = err=> {
			if (err.eventPhase === 2) {
				this.ConfirmBox("Connection refused", true, "mono/error.svg");
			}
		};
	}

	Close() { //overrides
		super.Close();
		if (this.ws != null) this.ws.close();
	}
}
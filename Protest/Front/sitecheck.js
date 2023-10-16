class SiteCheck extends Window {
	constructor(params) {
		super();

		this.params = params ? params : { value: "" };

		this.SetTitle("Site check");
		this.SetIcon("mono/websitecheck.svg");

		this.content.style.padding = "32px 32px 0 32px";
		this.content.style.overflowY = "auto";
		this.content.style.textAlign = "center";

		this.txtTarget = document.createElement("input");
		this.txtTarget.placeholder = "URI";
		this.txtTarget.type = "text";
		this.txtTarget.maxLength = "64";
		this.txtTarget.style.fontSize = "larger";
		this.txtTarget.style.width = "60%";
		this.txtTarget.style.maxWidth = "720px";
		this.txtTarget.style.textAlign = "center";
		this.txtTarget.value = this.params.value;
		this.content.appendChild(this.txtTarget);

		this.defaultElement = this.txtTarget;
		this.txtTarget.focus();

		this.btnCheck = document.createElement("input");
		this.btnCheck.type = "button";
		this.btnCheck.value = "Check";
		this.btnCheck.style.display = "block-line";
		this.btnCheck.style.width = "96px";
		this.btnCheck.style.height = "40px";
		this.btnCheck.style.margin = "16px";
		this.btnCheck.style.borderRadius = "4px";
		this.content.appendChild(this.btnCheck);

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

		this.txtTarget.onkeydown = event=> {
			if (event.keyCode == 13) this.btnCheck.onclick();
		};

		this.txtTarget.oninput = event=> {
			this.params.value = this.txtTarget.value;
		};

		this.btnCheck.onclick = ()=> {
			if (this.txtTarget.value.length == 0) {
				this.ConfirmBox("No uri", true);
				return;
			}

			this.txtTarget.value = this.txtTarget.value.trim();

			if (this.txtTarget.value.indexOf("://") == -1) this.txtTarget.value = "http://" + this.txtTarget.value;

			this.txtTarget.disabled = true;
			this.btnCheck.disabled = true;
			this.spinner.style.visibility = "visible";
			this.Check();
		};
	}

	Check() {
		let server = window.location.href;
		server = server.replace("https://", "");
		server = server.replace("http://", "");
		if (server.indexOf("/") > 0) server = server.substring(0, server.indexOf("/"));

		this.ws = new WebSocket((KEEP.isSecure ? "wss://" : "ws://") + server + "/ws/sitecheck");

		this.ws.onopen = ()=> {
			this.result.textContent = "";
			this.ws.send(this.txtTarget.value);
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
			this.txtTarget.disabled = false;
			this.btnCheck.disabled = false;
			this.spinner.style.visibility = "hidden";
		};

		this.ws.onerror = err=> {
			if (err.eventPhase === 2) {
				this.ConfirmBox("Connection refused", true, "mono/error.svg");
			}
		};
	}

	Close() { //override
		super.Close();
		if (this.ws != null) this.ws.close();
	}
}
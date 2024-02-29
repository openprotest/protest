class NtpClient extends Window {
	constructor(params) {
		super();

		this.params = params ? params : "";

		this.SetTitle("NTP client");
		this.SetIcon("mono/clock.svg");

		this.id = null;

		this.content.style.padding = "32px 16px 0 16px";
		this.content.style.overflowY = "auto";
		this.content.style.textAlign = "center";

		let serverLabel = document.createElement("div");
		serverLabel.textContent = "Time server:";
		this.content.appendChild(serverLabel);

		this.serverInput = document.createElement("input");
		this.serverInput.type = "text";
		this.serverInput.style.fontSize = "larger";
		this.serverInput.style.width = "60%";
		this.serverInput.style.maxWidth = "480px";
		this.serverInput.placeholder = "time.nist.gov";
		this.serverInput.value = params ?? "";
		this.content.appendChild(this.serverInput);

		const box = document.createElement("div");
		box.style.position = "relative";
		box.style.width = "480px";
		box.style.minHeight = "100px";
		box.style.margin = "40px auto";
		box.style.padding = "16px 24px";
		box.style.backgroundColor = "var(--clr-pane)";
		box.style.color = "var(--clr-dark)";
		box.style.borderRadius = "4px";
		box.style.userSelect = "text";
		this.content.appendChild(box);

		this.hexButton = document.createElement("input");
		this.hexButton.type = "button";
		this.hexButton.value = "";
		this.hexButton.disabled = true;
		this.hexButton.style.position = "absolute";
		this.hexButton.style.right = "20px";
		this.hexButton.style.top = "0";
		this.hexButton.style.width = "40px";
		this.hexButton.style.minWidth = "40px";
		this.hexButton.style.minHeight = "40px";
		this.hexButton.style.margin = "2px";
		this.hexButton.style.marginTop = "16px";
		this.hexButton.style.backgroundImage = "url(mono/hexviewer.svg?light)";
		this.hexButton.style.backgroundSize = "32px";
		this.hexButton.style.backgroundPosition = "center";
		this.hexButton.style.backgroundRepeat = "no-repeat";
		box.appendChild(this.hexButton);

		this.liveLabel = document.createElement("div");
		this.liveLabel.style.color = "#202020";
		this.liveLabel.style.fontFamily = "monospace";
		this.liveLabel.style.fontSize = "72px";
		this.liveLabel.style.fontWeight = "700";
		this.liveLabel.textContent = "00:00:00";
		box.appendChild(this.liveLabel);

		this.responseLabel = document.createElement("div");
		this.responseLabel.style.textAlign = "left";
		box.appendChild(this.responseLabel);

		this.sendButton = document.createElement("input");
		this.sendButton.type = "button";
		this.sendButton.value = "Send request";
		this.sendButton.style.width = "128px";
		this.sendButton.style.minHeight = "40px";
		this.sendButton.style.margin = "2px";
		this.sendButton.style.marginTop = "16px";
		this.sendButton.style.borderRadius = "4px";
		box.appendChild(this.sendButton);

		this.spinner = document.createElement("div");
		this.spinner.className = "spinner";
		this.spinner.style.display = "none";
		this.spinner.style.textAlign = "left";
		this.content.appendChild(this.spinner);

		this.spinner.appendChild(document.createElement("div"));

		this.sendButton.onclick = ()=> this.Request(Date.now());

		this.serverInput.onkeydown = event=> {
			if (event.key === "Enter") this.sendButton.onclick();
		};

		if (params) this.Request(Date.now());
	}

	async Request(id) {
		this.params = this.serverInput.value;
		this.sendButton.disabled = true;

		this.responseLabel.textContent = "";
		this.spinner.style.display = "inherit";

		try {
			const response = await fetch(`tools/ntp?server=${this.serverInput.value.length === 0 ? "time.nist.gov" : encodeURIComponent(this.serverInput.value)}`);

			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			let timestamp = Date.now();

			const json = await response.json();

			if (json.error) {
				this.ConfirmBox(json.error, true, "mono/error.svg");
				return;
			}

			if (json.local && json.transmit) {
				this.id = id;

				const table = document.createElement("table");
				this.responseLabel.appendChild(table);

				const response = [
					["Server", this.serverInput.value.length == 0 ? "time.nist.gov" : this.serverInput.value],
					["Roundtrip", json.roundtrip],
					["Transmitted time", json.transmit],
					["Local time", json.local],
				];

				for (let i = 0; i < response.length; i++) {
					const name = document.createElement("td");
					name.style.paddingRight = "8px";
					name.textContent = `${response[i][0]}: `;

					const value = document.createElement("td");
					value.style.fontWeight = "bold";

					if (response[i][0] === "Roundtrip") {
						value.textContent = `${response[i][1]}ms`;
					}
					else {
						value.textContent = response[i][1];
					}

					const tr = document.createElement("tr");
					tr.append(name, value);
					this.responseLabel.append(tr);
				}

				let split = json.local.split(":").map(o=> parseInt(o));
				setTimeout(()=> {
					let local = new Date(0, 0, 0, split[0], split[1], split[2], split[3]).getTime() + json.roundtrip / 2;
					this.Update(id, timestamp, local);
				}, 1000 - split[3]);

				this.hexButton.disabled = false;
				this.hexButton.onclick = ()=>{
					new HexViewer({exchange:[{direction:"query", data:json.req},{direction:"response", data:json.res}], protocol:"ntp"});
				};

			}
			else {
				this.id = null;
			}
		}
		catch (ex) {
			console.error(ex);
		}
		finally {
			this.sendButton.disabled = false;
			this.spinner.style.display = "none";
		}
	}

	Update(id, timestamp, local) {
		if (this.isClosed) return;
		if (id != this.id) return;

		let now = new Date();
		let def = now - timestamp;
		let d = new Date(local + def);
		this.liveLabel.textContent = `${d.getHours().toString().padStart(2,"0")}:${d.getMinutes().toString().padStart(2,"0")}:${d.getSeconds().toString().padStart(2,"0")}`;

		setTimeout(()=> this.Update(id, timestamp, local), 1000);
	}
}
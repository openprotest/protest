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

		let lblServer = document.createElement("div");
		lblServer.textContent = "Time server:";
		this.content.appendChild(lblServer);

		this.txtServer = document.createElement("input");
		this.txtServer.type = "text";
		this.txtServer.style.fontSize = "larger";
		this.txtServer.style.width = "60%";
		this.txtServer.style.maxWidth = "480px";
		this.txtServer.placeholder = "time.nist.gov";
		this.txtServer.value = params ?? "";
		this.content.appendChild(this.txtServer);

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

		this.btnHex = document.createElement("input");
		this.btnHex.type = "button";
		this.btnHex.value = "";
		this.btnHex.disabled = true;
		this.btnHex.style.position = "absolute";
		this.btnHex.style.right = "20px";
		this.btnHex.style.top = "0";
		this.btnHex.style.width = "40px";
		this.btnHex.style.minWidth = "40px";
		this.btnHex.style.minHeight = "40px";
		this.btnHex.style.margin = "2px";
		this.btnHex.style.marginTop = "16px";
		this.btnHex.style.backgroundImage = "url(mono/hexviewer.svg?light)";
		this.btnHex.style.backgroundSize = "32px";
		this.btnHex.style.backgroundPosition = "center";
		this.btnHex.style.backgroundRepeat = "no-repeat";
		box.appendChild(this.btnHex);
		
		this.lblLive = document.createElement("div");
		this.lblLive.style.color = "#202020";
		this.lblLive.style.fontFamily = "monospace";
		this.lblLive.style.fontSize = "72px";
		this.lblLive.style.fontWeight = "700";
		this.lblLive.textContent = "00:00:00";
		box.appendChild(this.lblLive);

		this.lblResponse = document.createElement("div");
		this.lblResponse.style.textAlign = "left";
		box.appendChild(this.lblResponse);

		this.btnSend = document.createElement("input");
		this.btnSend.type = "button";
		this.btnSend.value = "Send request";
		this.btnSend.style.width = "128px";
		this.btnSend.style.minHeight = "40px";
		this.btnSend.style.margin = "2px";
		this.btnSend.style.marginTop = "16px";
		this.btnSend.style.borderRadius = "4px";
		box.appendChild(this.btnSend);
			
		this.spinner = document.createElement("div");
		this.spinner.className = "spinner";
		this.spinner.style.display = "none";
		this.spinner.style.textAlign = "left";
		this.content.appendChild(this.spinner);

		this.spinner.appendChild(document.createElement("div"));

		this.btnSend.onclick = ()=> this.Request(Date.now());

		this.txtServer.onkeydown = event=> {
			if (event.key === "Enter") this.btnSend.onclick();
		};

		if (params) this.Request(Date.now());
	}

	async Request(id) {
		this.params = this.txtServer.value;
		this.btnSend.disabled = true;

		this.lblResponse.textContent = "";
		this.spinner.style.display = "inherit";

		try {
			const response = await fetch(`tools/ntp?server=${this.txtServer.value.length === 0 ? "time.nist.gov" : encodeURIComponent(this.txtServer.value)}`);

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
				this.lblResponse.appendChild(table);

				const response = [
					["Server", this.txtServer.value.length == 0 ? "time.nist.gov" : this.txtServer.value],
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
					this.lblResponse.append(tr);
				}

				let split = json.local.split(":").map(o=> parseInt(o));
				setTimeout(()=> {
					let local = new Date(0, 0, 0, split[0], split[1], split[2], split[3]).getTime() + json.roundtrip / 2;
					this.Update(id, timestamp, local);
				}, 1000 - split[3]);

				this.btnHex.disabled = false;
				this.btnHex.onclick = ()=>{
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
			this.btnSend.disabled = false;
			this.spinner.style.display = "none";
		}
	}

	Update(id, timestamp, local) {
		if (this.isClosed) return;
		if (id != this.id) return;

		let now = new Date();
		let def = now - timestamp;
		let d = new Date(local + def);
		this.lblLive.textContent = `${d.getHours().toString().padStart(2,"0")}:${d.getMinutes().toString().padStart(2,"0")}:${d.getSeconds().toString().padStart(2,"0")}`;

		setTimeout(()=> this.Update(id, timestamp, local), 1000);
	}
}
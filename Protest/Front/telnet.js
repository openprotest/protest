class Telnet extends Terminal {
	constructor(args) {
		super(args);

		this.SetTitle("Telnet");
		this.SetIcon("mono/telnet.svg");

		this.ConnectDialog(this.args.host, true);
	}

	ConnectDialog(target, isNew=false) { //overrides
		const dialog = this.DialogBox("112px");
		if (dialog === null) return;

		const {okButton, cancelButton, innerBox} = dialog;

		innerBox.parentElement.style.maxWidth = "360px";
		innerBox.parentElement.parentElement.onclick = event=> { event.stopPropagation(); };

		innerBox.style.margin = "20px 8px 0 8px";
		innerBox.style.textAlign = "center";

		const hostLabel = document.createElement("div");
		hostLabel.style.display = "inline-block";
		hostLabel.style.minWidth = "50px";
		hostLabel.textContent = "Host:";

		const hostInput = document.createElement("input");
		hostInput.type = "text";
		hostInput.style.width = "calc(100% - 80px)";
		hostInput.value = target;

		innerBox.append(hostLabel, hostInput);

		okButton.onclick = ()=> {
			dialog.Close();
			this.Connect(hostInput.value.trim());
		};

		cancelButton.onclick = ()=> {
			dialog.Close();
		};

		if (isNew) {
			cancelButton.value = "Close";
			cancelButton.onclick = ()=> {
				dialog.Close();
				this.Close();
			};
		}

		hostInput.onkeydown = event=> {
			if (dialog.okButton.disabled) return;
			if (event.key === "Enter") {
				dialog.okButton.click();
			}
		};

		hostInput.onchange = hostInput.oninput = ()=>{
			okButton.disabled = hostInput.value.trim().length === 0;
		};

		hostInput.oninput();

		setTimeout(()=> hostInput.focus(), 200);
	}

	Connect(target) {
		this.args.host = target;

		this.statusBox.style.display = "initial";
		this.statusBox.style.backgroundImage = "url(mono/connect.svg)";
		this.statusBox.textContent = "Connecting...";
		this.content.appendChild(this.statusBox);

		let server = window.location.href.replace("https://", "").replace("http://", "");
		if (server.indexOf("/") > 0) server = server.substring(0, server.indexOf("/"));

		if (this.ws != null) {
			try {
				this.ws.close();
			}
			catch {}
		}

		try {
			this.ws = new WebSocket((KEEP.isSecure ? "wss://" : "ws://") + server + "/ws/telnet");
		}
		catch {}

		this.ws.onopen = ()=> {
			this.connectButton.disabled = true;
			this.ws.send(target);
		};

		this.ws.onclose = ()=> {
			this.statusBox.style.display = "initial";
			this.statusBox.style.backgroundImage = "url(mono/disconnect.svg)";
			this.statusBox.textContent = "Connection closed";
			this.content.appendChild(this.statusBox);

			this.connectButton.disabled = false;
		};

		this.ws.onmessage = e=> {
			let json = JSON.parse(e.data);
			if (json.connected) {
				this.SetTitle(`Telnet - ${target}`);
				this.statusBox.style.display = "none";
				this.ws.onmessage = event=> this.HandleMessage(event.data);

				this.content.appendChild(this.cursorElement);
				this.content.focus();
			}
			else if (json.error) {
				setTimeout(()=>{ this.ConfirmBox(json.error, true, "mono/error.svg"); }, 200);
			}
		};
	}
}
class Terminal extends PtyHost {
	constructor(args) {
		super(args);

		this.SetTitle("Terminal");
		this.SetIcon("mono/terminal.svg");

		this.connectButton.disabled = true;

		this.Connect();
	}

	ConnectDialog() { //overrides
		this.Connect();
	}

	Connect() {
		this.statusBox.style.display = "initial";
		this.statusBox.style.backgroundImage = "url(mono/connect.svg)";
		this.statusBox.textContent = "Connecting...";
		this.content.appendChild(this.statusBox);

		let server = window.location.href.replace("https://", "").replace("http://", "");
		if (server.endsWith("/")) server = server.slice(0, -1);

		if (this.ws != null) {
			try {
				this.ws.close();
			}
			catch {}
		}

		try {
			this.ws = new WebSocket((KEEP.isSecure ? "wss://" : "ws://") + server + "/ws/terminal");
		}
		catch {}

		this.ws.onopen = ()=> {
			this.ws.send("");
		};

		this.ws.onclose = ()=> {
			this.statusBox.style.display = "initial";
			this.statusBox.style.backgroundImage = "url(mono/disconnect.svg)";
			this.statusBox.textContent = "Connection closed";
			this.content.appendChild(this.statusBox);
		};

		this.ws.onmessage = e=> {
			let json = JSON.parse(e.data);
			if (json.connected) {
				this.SetTitle("Terminal");
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

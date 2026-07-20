"use strict";
class RemoteShell extends PtyHost {
	constructor(args) {
		super(args);

		this.SetTitle("Remote shell");
		this.SetIcon("mono/remote.svg");

		if (this.args.host) {
			this.Connect(this.args.host);
		}
		else {
			this.ConnectDialog("", true);
		}
	}

	ConnectDialog(target="", isNew=false) { //overrides
		const dialog = this.DialogBox("108px");
		if (dialog === null) return;

		const {okButton, cancelButton, innerBox} = dialog;

		innerBox.parentElement.style.maxWidth = "400px";
		innerBox.parentElement.parentElement.onclick = event=> { event.stopPropagation(); };

		innerBox.style.margin = "20px 8px 0 8px";

		const hostLabel = document.createElement("div");
		hostLabel.style.display = "inline-block";
		hostLabel.style.minWidth = "88px";
		hostLabel.style.paddingLeft = "8px";
		hostLabel.textContent = "Host:";

		const hostInput = document.createElement("input");
		hostInput.type = "text";
		hostInput.style.width = "calc(100% - 120px)";
		hostInput.value = target;
		innerBox.append(hostLabel, hostInput);

		okButton.onclick = ()=> {
			dialog.Close();
			this.Connect(hostInput.value.trim());
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

		hostInput.onchange = hostInput.oninput = ()=> {
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

		if (this.ws != null) {
			try {
				this.ws.close();
			}
			catch {}
		}

		try {
			this.ws = new WebSocket(`${KEEP.isSecure ? "wss" : "ws"}://${window.location.host}/ws/winrm`);
		}
		catch {}

		this.ws.onopen = ()=> {
			this.connectButton.disabled = true;
			this.ws.send(target);
		};

		this.ws.onerror = err=> {
			console.log(err);
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
				this.SetTitle(`Remote shell - ${target}`);
				this.statusBox.style.display = "none";
				this.ws.onmessage = event=> this.HandleMessage(event.data);

				this.content.appendChild(this.cursorElement);
				this.content.focus();
			}
			else if (json.error) {
				setTimeout(()=>{
					this.ConfirmBox(json.error, true, "mono/error.svg").addEventListener("click", ()=> {
						setTimeout(()=>this.ConnectDialog(this.args.host, false), 200);
					});
				}, 200);
			}
		};
	}
}

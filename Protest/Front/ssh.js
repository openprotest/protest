class Ssh extends Terminal {
	constructor(params) {
		super(params);

		this.SetTitle("Secure shell");
		this.SetIcon("mono/ssh.svg");

		if (this.params.file) {
			this.ConnectViaFile(this.params.host, this.params.file);
		}
		else {
			this.ConnectDialog(this.params.host, true);
		}
	}

	ConnectDialog(target, isNew=false) { //overrides
		const dialog = this.DialogBox("208px");
		if (dialog === null) return;

		const okButton = dialog.okButton;
		const cancelButton = dialog.cancelButton;
		const innerBox = dialog.innerBox;

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

		const usernameLabel = document.createElement("div");
		usernameLabel.style.display = "inline-block";
		usernameLabel.style.minWidth = "88px";
		usernameLabel.style.paddingLeft = "8px";
		usernameLabel.textContent = "Username:";
		const usernameInput = document.createElement("input");
		usernameInput.type = "text";
		usernameInput.style.width = "calc(100% - 120px)";
		usernameInput.value = this.params.username ?? "";
		innerBox.append(usernameLabel, usernameInput);

		const passwordLabel = document.createElement("div");
		passwordLabel.style.display = "inline-block";
		passwordLabel.style.minWidth = "88px";
		passwordLabel.style.paddingLeft = "8px";
		passwordLabel.textContent = "Password:";
		const passwordInput = document.createElement("input");
		passwordInput.type = "password";
		passwordInput.style.width = "calc(100% - 120px)";
		innerBox.append(passwordLabel, passwordInput);

		const rememberPasswordCheckBox = document.createElement("input");
		rememberPasswordCheckBox.type = "checkbox";
		innerBox.appendChild(rememberPasswordCheckBox);
		this.AddCheckBoxLabel(innerBox, rememberPasswordCheckBox, "Remember password").style.margin = "8px 0px 0px 4px";

		if ("password" in this.params) {
			rememberPasswordCheckBox.checked = true;
			passwordInput.value = this.params.password;
		}

		okButton.onclick = ()=> {
			this.params.username = usernameInput.value.trim();

			if (rememberPasswordCheckBox.checked) {
				this.params.password = passwordInput.value;
			}
			else {
				delete this.params.password;
			}

			dialog.Close();
			this.ConnectViaCredentials(
				hostInput.value.trim(),
				usernameInput.value.trim(),
				passwordInput.value
			);
		};

		if (isNew) {
			cancelButton.value = "Close";
			cancelButton.onclick = ()=> {
				dialog.Close();
				this.Close();
			};
		}

		hostInput.onkeydown = usernameInput.onkeydown = passwordInput.onkeydown = event=> {
			if (dialog.okButton.disabled) return;
			if (event.key === "Enter") {
				dialog.okButton.click();
			}
		};

		hostInput.onchange = hostInput.oninput =
		usernameInput.onchange = usernameInput.oninput =
		passwordInput.onchange = passwordInput.oninput = ()=> {
			okButton.disabled =
				hostInput.value.trim().length === 0 ||
				usernameInput.value.trim().length === 0 ||
				passwordInput.value.length === 0;
		};

		hostInput.oninput();

		setTimeout(()=> hostInput.focus(), 200);
	}

	ConnectViaCredentials(target, username, password) {
		const connectionString = `target=${target}\nun=${username}\npw=${password}`;
		this.Connect(target, connectionString);
	}

	ConnectViaFile(target, file) {
		const connectionString = `target=${target}\nfile=${file}`;
		this.Connect(target, connectionString);
	}

	Connect(target, connectionString) {
		this.params.host = target;

		this.statusBox.style.display = "initial";
		this.statusBox.style.backgroundImage = "url(mono/connect.svg)";
		this.statusBox.textContent = "Connecting...";
		this.content.appendChild(this.statusBox);

		let server = window.location.href;
		server = server.replace("https://", "");
		server = server.replace("http://", "");
		if (server.indexOf("/") > 0) server = server.substring(0, server.indexOf("/"));

		if (this.ws != null) {
			try {
				this.ws.close();
			}
			catch {}
		}

		try {
			this.ws = new WebSocket((KEEP.isSecure ? "wss://" : "ws://") + server + "/ws/ssh");
		}
		catch {}

		this.ws.onopen = ()=> {
			this.connectButton.disabled = true;
			this.ws.send(connectionString);
		};

		this.ws.error = err=>{
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
				this.SetTitle(`Secure shell - ${target}`);
				this.statusBox.style.display = "none";
				this.ws.onmessage = event=> this.HandleMessage(event.data);

				this.content.appendChild(this.cursorElement);
				this.content.focus();
			}
			else if (json.error) {
				setTimeout(()=>{
					this.ConfirmBox(json.error, true, "mono/error.svg").addEventListener("click", ()=> {
						setTimeout(()=>this.ConnectDialog(this.params.host, false), 200);
					});
				}, 200);
			}
		};
	}
}
"use strict";
class Ssh extends PtyHost {
	constructor(args) {
		super(args);

		this.SetTitle("Secure shell");
		this.SetIcon("mono/ssh.svg");

		this.resizeAware = true;

		const isRestored = this.args.autoconnect === false;
		delete this.args.autoconnect;

		if (isRestored) {
			delete this.args.password;
			this.ConnectDialog(this.args.host, true);
		}
		else if (this.args.credential) {
			this.ConnectViaCredential(this.args.host, this.args.credential);
		}
		else if (this.args.file) {
			this.ConnectViaFile(this.args.host, this.args.file);
		}
		else {
			this.ConnectDialog(this.args.host, true);
		}
	}

	ConnectDialog(target, isNew=false) { //overrides
		const dialog = this.DialogBox("280px");
		if (dialog === null) return;

		const {okButton, cancelButton, innerBox, buttonBox} = dialog;

		const dialogBox = innerBox.parentElement;
		dialogBox.style.maxWidth = "440px";
		dialogBox.parentElement.onclick = event=> event.stopPropagation();

		innerBox.style.display = "grid";
		innerBox.style.gridTemplateColumns = "100px min(auto, 250px)";
		innerBox.style.alignItems = "center";
		innerBox.style.margin = "20px 20px 0 20px";

		const methodLabel = document.createElement("div");
		methodLabel.style.gridArea = "1 / 1";
		methodLabel.textContent = "Method:";
		const methodBox = new FewBox(["Manual", "Credentials", "SSH key"]);
		methodBox.Select(0);
		methodBox.container.style.gridArea = "1 / 2";
		innerBox.append(methodLabel, methodBox.container);

		const hostLabel = document.createElement("div");
		hostLabel.style.gridArea = "3 / 1";
		hostLabel.textContent = "Host:";
		const hostInput = document.createElement("input");
		hostInput.style.gridArea = "3 / 2";
		hostInput.type = "text";
		hostInput.value = target ?? "";
		innerBox.append(hostLabel, hostInput);

		const usernameLabel = document.createElement("div");
		usernameLabel.style.gridArea = "4 / 1";
		usernameLabel.textContent = "Username:";
		const usernameInput = document.createElement("input");
		usernameInput.style.gridArea = "4 / 2";
		usernameInput.type = "text";
		usernameInput.value = this.args.username ?? "";
		innerBox.append(usernameLabel, usernameInput);

		const credentialsLabel = document.createElement("div");
		credentialsLabel.style.gridArea = "4 / 1";
		credentialsLabel.textContent = "Credentials:";
		const credentialsInput = document.createElement("select");
		credentialsInput.style.gridArea = "4 / 2";
		innerBox.append(credentialsLabel, credentialsInput);

		const sshKeyLabel = document.createElement("div");
		sshKeyLabel.style.gridArea = "4 / 1";
		sshKeyLabel.textContent = "SSH key:";
		const sshKeyInput = document.createElement("select");
		sshKeyInput.style.gridArea = "4 / 2";
		innerBox.append(sshKeyLabel, sshKeyInput);

		const passwordLabel = document.createElement("div");
		passwordLabel.style.gridArea = "5 / 1";
		passwordLabel.textContent = "Password:";
		const passwordInput = document.createElement("input");
		passwordInput.style.gridArea = "5 / 2";
		passwordInput.type = "password";
		innerBox.append(passwordLabel, passwordInput);

		const rememberPasswordToggle = this.CreateToggle("Remember password", false, innerBox);
		rememberPasswordToggle.label.style.gridArea = "6 / 2 / 6 / 4";

		if ("password" in this.args) {
			rememberPasswordToggle.checkbox.checked = true;
			passwordInput.value = this.args.password;
		}

		dialogBox.style.transition = ".2s";

		const UpdateOkState = ()=> {
			const host = hostInput.value.trim().length > 0;

			switch (methodBox.index) {
			case 1:
				okButton.disabled = !host || !credentialsInput.value;
				break;

			case 2:
				okButton.disabled = !host || !sshKeyInput.value;
				break;

			default:
				okButton.disabled = !host || usernameInput.value.trim().length === 0 || passwordInput.value.length === 0;
				break;
			}
		};

		const UpdateSelection = () => {
			innerBox.style.gridTemplateRows = methodBox.index === 0 ? "36px 8px repeat(4, 36px)" : "36px 8px repeat(2, 36px)";
			dialogBox.style.maxHeight = methodBox.index === 0 ? "280px" : "200px";

			passwordLabel.style.display    = methodBox.index === 0 ? "initial" : "none";
			passwordInput.style.display    = methodBox.index === 0 ? "initial" : "none";

			usernameLabel.style.display    = methodBox.index === 0 ? "initial" : "none";
			usernameInput.style.display    = methodBox.index === 0 ? "initial" : "none";

			credentialsLabel.style.display = methodBox.index === 1 ? "initial" : "none";
			credentialsInput.style.display = methodBox.index === 1 ? "initial" : "none";

			sshKeyLabel.style.display      = methodBox.index === 2 ? "initial" : "none";
			sshKeyInput.style.display      = methodBox.index === 2 ? "initial" : "none";

			rememberPasswordToggle.label.style.opacity = methodBox.index === 0 ? 1 : 0;
			rememberPasswordToggle.label.style.display = methodBox.index === 0 ? "initial" : "none";

			UpdateOkState();
		};

		methodBox.container.onchange = UpdateSelection;

		const SelectVaultEntry = (format, guid)=> {
			const isSshKey = format === Window.DRAG_SSH_KEY;
			methodBox.Select(isSshKey ? 2 : 1);
			(isSshKey ? sshKeyInput : credentialsInput).value = guid;
			UpdateOkState();
		};

		const listsLoaded = (async ()=> {
			try {
				const [credResponse, keyResponse] = await Promise.all([
					fetch("vault/credential/list"),
					fetch("vault/sshkey/list")
				]);

				if (credResponse.status === 200) {
					const json = await credResponse.json();
					for (const item of json) {
						credentialsInput.append(new Option(item.name || item.username || item.guid, item.guid));
					}
				}

				if (keyResponse.status === 200) {
					const json = await keyResponse.json();
					for (const item of json) {
						sshKeyInput.append(new Option(item.name || item.username || item.guid, item.guid));
					}
				}
			}
			catch {}

			if (this.args.credential) {
				const isSshKey = [...sshKeyInput.options].some(o=> o.value === this.args.credential);
				SelectVaultEntry(isSshKey ? Window.DRAG_SSH_KEY : Window.DRAG_CREDENTIALS, this.args.credential);
			}

			UpdateOkState();
		})();

		this.AddDropTarget(dialogBox, {
			accept     : [Window.DRAG_CREDENTIALS, Window.DRAG_SSH_KEY],
			text       : "Drop credentials here...",
			labelParent: buttonBox,
			tip        : "Drop key to auto-fill",
			onDrop     : async (format, guid)=> {
				await listsLoaded;
				SelectVaultEntry(format, guid);
			}
		});

		if (isNew) {
			cancelButton.value = "Close";
			cancelButton.onclick = ()=> {
				dialog.Close();
				this.Close();
			};
		}

		okButton.onclick = ()=> {
			const host = hostInput.value.trim();

			if (methodBox.index === 0) {
				this.args.username = usernameInput.value.trim();

				if (rememberPasswordToggle.checkbox.checked) {
					this.args.password = passwordInput.value;
				}
				else {
					delete this.args.password;
				}

				delete this.args.credential;

				dialog.Close();
				this.ConnectViaCredentials(host, usernameInput.value.trim(), passwordInput.value);
			}
			else {
				const guid = methodBox.index === 1 ? credentialsInput.value : sshKeyInput.value;
				this.args.credential = guid;

				dialog.Close();
				this.ConnectViaCredential(host, guid);
			}
		};

		hostInput.onkeydown = usernameInput.onkeydown = passwordInput.onkeydown = event=> {
			if (okButton.disabled) return;
			if (event.key === "Enter") {
				okButton.click();
			}
		};

		hostInput.onchange = hostInput.oninput =
		usernameInput.onchange = usernameInput.oninput =
		passwordInput.onchange = passwordInput.oninput =
		credentialsInput.onchange =
		sshKeyInput.onchange = UpdateOkState;

		UpdateSelection();
		setTimeout(()=> methodBox.container.focus(), 200);
	}

	ConnectViaCredentials(target, username, password) {
		const connectionString = `target=${target}\nun=${username}\npw=${password}`;
		this.Connect(target, connectionString);
	}

	ConnectViaFile(target, file) {
		const connectionString = `target=${target}\nfile=${file}`;
		this.Connect(target, connectionString);
	}

	ConnectViaCredential(target, credential) {
		const connectionString = `target=${target}\ncredential=${credential}`;
		this.Connect(target, connectionString);
	}

	Connect(target, connectionString) {
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
			this.ws = new WebSocket(`${KEEP.isSecure ? "wss" : "ws"}://${window.location.host}/ws/ssh`);
		}
		catch {}

		this.ws.onopen = ()=> {
			this.connectButton.disabled = true;
			this.ws.send(connectionString);
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
				this.SetTitle(`Secure shell - ${target}`);
				this.statusBox.style.display = "none";
				this.ws.onmessage = event=> this.HandleMessage(event.data);

				this.content.focus();
				this.ShowToast("This session is being recorded");
			}
			else if (json.error) {
				setTimeout(()=> {
					this.ConfirmBox(json.error, true, "mono/error.svg").addEventListener("click", ()=> {
						setTimeout(()=>this.ConnectDialog(this.args.host, false), 200);
					});
				}, 200);
			}
		};
	}
}

"use strict";
class Sftp extends Window {
	constructor(args) {
		super(args);

		this.args = args;

		this.AddCssDependencies("files.css");

		this.SetTitle("SFTP");
		this.SetIcon("mono/shared.svg");

		this.SetupToolbar();
		this.connectButton = this.AddToolbarButton("Connect", "mono/connect.svg?light");
		//this.AddToolbarSeparator();

		this.path = document.createElement("div");
		this.path.className = "win-toolbar file-path";
		this.content.appendChild(this.path);

		this.view = document.createElement("div");
		this.view.className = "file-view";
		this.content.appendChild(this.view);

		if (this.args.file) {
			this.ConnectViaFile(this.args.host, this.args.file);
		}
		else {
			this.ConnectDialog(this.args.host, true);
		}
	}

	ConnectDialog(target, isNew=false) {
		const dialog = this.DialogBox("208px");
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

		const usernameLabel = document.createElement("div");
		usernameLabel.style.display = "inline-block";
		usernameLabel.style.minWidth = "88px";
		usernameLabel.style.paddingLeft = "8px";
		usernameLabel.textContent = "Username:";
		const usernameInput = document.createElement("input");
		usernameInput.type = "text";
		usernameInput.style.width = "calc(100% - 120px)";
		usernameInput.value = this.args.username ?? "";
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

		const rememberPasswordToggle = this.CreateToggle("Remember password", false, innerBox);
		rememberPasswordToggle.label.style.margin = "8px 0px 0px 4px";

		if ("password" in this.args) {
			rememberPasswordToggle.checkbox.checked = true;
			passwordInput.value = this.args.password;
		}

		okButton.onclick = ()=> {
			this.args.username = usernameInput.value.trim();

			if (rememberPasswordToggle.checkbox.checked) {
				this.args.password = passwordInput.value;
			}
			else {
				delete this.args.password;
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
		this.args.host = target;

		if (this.ws != null) {
			try {
				this.ws.close();
			}
			catch {}
		}

		try {
			this.ws = new WebSocket(`${KEEP.isSecure ? "wss" : "ws"}://${window.location.host}/ws/sftp`);
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
			this.connectButton.disabled = false;
		};

		this.ws.onmessage = e=> {
			let json = JSON.parse(e.data);
			if (json.connected) {
				this.SetTitle(`SFTP - ${target}`);

				this.content.focus();
			}
			else if (json.action) {
				this.ActionMux(json.action, json);
			}
			else if (json.error) {
				setTimeout(()=> {
					this.ConfirmBox(json.error, true, "mono/error.svg").addEventListener("click", ()=> {
						setTimeout(()=> this.ConnectDialog(this.args.host, false), 200);
					});
				}, 200);
			}
		};
	}

	ActionMux(action, json) {
		switch (action) {
		case "list":
			this.PlotPath(json.workingDirectory);
			this.ListFiles(json.data);
			break;
		}
	}

	PlotPath(workingDirectory) {
		this.path.textContent = "";

		const rootBox = document.createElement("div");
		rootBox.textContent = "/";
		this.path.appendChild(rootBox);

		const split = workingDirectory.split("/");
		for (let i=0; i<split.length; i++) {
			if (split[i].length === 0) continue;
			const box = document.createElement("div");
			box.textContent = split[i];
			this.path.appendChild(box);
		}
	}

	ListFiles(files) {
		this.view.textContent = "";

		for (let i=0; i<files.length; i++) {
			const container = document.createElement("div");
			container.className = files[i].isFile ? "file-file" : "file-dir";
			this.view.appendChild(container);

			const iconBox = document.createElement("div");
			iconBox.classList = "file-icon";

			const nameBox = document.createElement("div");
			nameBox.textContent = files[i].name;
			nameBox.classList = "file-name";

			if (files[i].name[0] === ".") {
				iconBox.style.opacity = ".65";
			}

			container.append(iconBox, nameBox);

			const dotIndex = files[i].name.indexOf(".", 1);

			if (dotIndex > 0 && files[i].isFile) {
				const extension = files[i].name.split(".").pop();
				const extensionBox = document.createElement("div");
				extensionBox.classList = "file-extension";
				extensionBox.textContent = extension.toUpperCase();
				container.appendChild(extensionBox);

				let r = (extension.charCodeAt(0) * 5) % 192 + 63;
				let g = (extension.charCodeAt(1 % extension.length) * 5) % 192 + 63;
				let b = (extension.charCodeAt(2 % extension.length) * 5) % 192 + 63;

				if (r*.3 + g*.59 + b*.11 < 112) extensionBox.style.color = "#ddd";
				extensionBox.style.backgroundColor = `rgb(${r},${g},${b})`;
			}

		}
	}
}
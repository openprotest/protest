"use strict";
class Sftp extends Window {

	static UPLOAD_QUEUE = {};
	
	constructor(args) {
		super(args);

		this.args = args;

		this.AddCssDependencies("files.css");

		this.SetTitle("SFTP");
		this.SetIcon("mono/shared.svg");

		this.status = "idle";
		this.gridView = true;
		this.selectedElement = null;
		this.workingDirectory;

		this.InitializeComponents();

		this.defaultElement = this.viewBox;

		if (this.args.file) {
			this.ConnectViaFile(this.args.host, this.args.file);
		}
		else {
			this.ConnectDialog(this.args.host, true);
		}
	}

	InitializeComponents() {
		this.SetupToolbar();
		this.connectButton = this.AddToolbarButton("Connect", "mono/connect.svg?light");
		//this.AddToolbarSeparator();

		this.pathBox = document.createElement("div");
		this.pathBox.className = "win-toolbar file-path";

		this.viewBox = document.createElement("div");
		this.viewBox.className = "file-view file-grid";
		this.viewBox.tabIndex = 0;

		this.counterBox = document.createElement("div");
		this.counterBox.className = "file-counter";
		this.counterBox.textContent = "0";

		this.statusBox = document.createElement("div");
		this.statusBox.className = "file-status-label";
		this.statusBox.textContent = "Connecting...";

		this.dropArea = document.createElement("div");
		this.dropArea.className = "file-drop-area";
		this.dropArea.textContent = "Drop files here to upload...";

		this.content.append(this.pathBox, this.viewBox, this.counterBox, this.statusBox, this.dropArea);

		this.viewBox.onkeydown   = event => this.View_onkeydown(event);
		this.viewBox.ondragover  = event => this.View_ondragover(event);
		this.viewBox.ondragleave = event => this.View_ondragleave(event);
		this.viewBox.ondrop      = event => this.View_ondrop(event);
	}

	ToggleView() {
		this.gridView = !this.gridView;
		this.viewBox.className = this.gridView ? "file-view file-grid" : "file-view file-list";
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
			this.ConnectViaCredentials(hostInput.value.trim(), usernameInput.value.trim(), passwordInput.value);

			this.viewBox.focus();
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
			okButton.disabled = hostInput.value.trim().length === 0 || usernameInput.value.trim().length === 0 || passwordInput.value.length === 0;
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
				this.ActionMux(json);
			}
			else if (json.error) {
				this.ConfirmBox(json.error, true, "mono/error.svg");
			}

			this.status = "idle";
			this.statusBox.style.visibility = "hidden";
		};
	}

	Close() { //overrides
		if (this.ws != null) this.ws.close();
		super.Close();
	}

	ActionMux(json) {
		switch (json.action) {
		case "list":
			this.workingDirectory = json.workingDirectory;
			this.UpdatePath(json.workingDirectory);
			this.ListFiles(json.data);
			break;

		case "download":
			const link = document.createElement("a");
			link.download = json.name;
			link.href = `sftp/download?token=${json.token}`;
			link.click();
			link.remove();
			break;
		
		case "upload":
			break;

		}
	}

	UpdatePath(workingDirectory) {
		this.pathBox.textContent = "";

		const split = workingDirectory.split("/");
		split.unshift("/");

		for (let i=0; i<split.length; i++) {
			if (split[i].length === 0) continue;

			const node = document.createElement("div");
			node.className = "file-path-node";
			node.textContent = split[i];
			this.pathBox.appendChild(node);

			if (i<split.length - 1) {
				const separator = document.createElement("div");
				separator.className = "file-separator-node";
				this.pathBox.appendChild(separator);
			}

			node.onclick = ()=> {
				this.status = "listing";
				this.statusBox.textContent = "Loading...";
				
				let path = "";
				for (let j=0; j<=i; j++) {
					path += split[j] + "/";
				}

				this.ws.send(`list:${path}`);
			};
		}
	}

	ListFiles(files) {
		this.selectedElement = null;
		this.viewBox.textContent = "";
		this.counterBox.textContent = files.length;

		for (let i=0; i<files.length; i++) {
			const element = this.CreateFileElement(files[i]);
			this.viewBox.appendChild(element);
		}

		if (this.workingDirectory in Sftp.UPLOAD_QUEUE) {
			const queue = Sftp.UPLOAD_QUEUE[this.workingDirectory];
			for (let i=0; i<queue.length; i++) {
				const element = this.CreateFileElement(queue[i], true);
				this.viewBox.appendChild(element);
			}
		}
	}

	CreateFileElement(file, inQueue=false) {
		const container = document.createElement("div");
		container.className = file.isDir ? "file-dir" : "file-file";

		const iconBox = document.createElement("div");
		iconBox.classList = "file-icon";

		const iconInnerBox = document.createElement("div");
		iconBox.appendChild(iconInnerBox);
 
		const nameBox = document.createElement("div");
		nameBox.textContent = file.name;
		nameBox.classList = "file-name";

		if (file.name[0] === ".") {
			container.classList.add("file-hidden");
		}

		container.append(iconBox, nameBox);

		const dotIndex = file.name.indexOf(".", 1);
		if (dotIndex > 0 && !file.isDir) {
			const extension = file.name.split(".").pop();
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

		if (file.isLink) {
			container.classList.add("file-link");
		}

		if (inQueue) {
			container.style.animation = "task-icon-open .4s ease-in-out";
			
			const loadingBox = document.createElement("div");
			loadingBox.className = "file-loading-bar";
			container.appendChild(loadingBox);
		}

		container.onclick = event => this.File_onclick(event, file, container);
		container.ondblclick = event => this.File_ondblclick(event, file);

		return container;
	}

	Select(element) {
		if (this.selectedElement) {
			this.selectedElement.classList.remove("file-selected");
		}

		this.selectedElement = element;
		this.selectedElement.classList.add("file-selected");
	}

	NavigateUp() {
		if (this.ws === null) return;
		if (this.status !== "idle") return;
		if (this.workingDirectory === "/") return;

		this.statusBox.style.visibility = "visible";

		this.status = "listing";
		this.statusBox.textContent = "Loading...";
		this.ws.send(`list:${this.workingDirectory}/..`);
	}

	File_onclick(event, file, element) {
		this.Select(element);
	}

	File_ondblclick(event, file) {
		if (this.ws === null) return;
		if (this.status !== "idle") return;

		if (file.isDir) {
			this.statusBox.style.visibility = "visible";
			this.status = "listing";
			this.statusBox.textContent = "Loading...";
			this.ws.send(`list:${file.fullname}`);
		}
		else {
			this.ws.send(`download:${file.fullname}`);
		}
	}

	View_onkeydown(event) {
		switch(event.key) {
		case "Backspace":
			this.NavigateUp();
			break;

		case "Enter":
			if (this.selectedElement === null) return;
			this.selectedElement.ondblclick();
			break;

		case "ArrowLeft":
		case "ArrowRight":
		case "ArrowUp":
		case "ArrowDown":
			this.ViewArrowNavigation(event);
			break;
		}
	}

	ViewArrowNavigation(event) {
		event.preventDefault();

		const elements = Array.from(this.viewBox.childNodes);
		if (elements.length === 0) return;

		if (this.selectedElement === null) {
			elements[0].onclick();
			return;
		}

		const lastIndex = elements.indexOf(this.selectedElement);

		let index, row;
		switch(event.key) {
		case "ArrowLeft":
			index = Math.max(lastIndex - 1, 0);
			break;

		case "ArrowRight":
			index = Math.min(lastIndex + 1, elements.length - 1);
			break;

		case "ArrowUp":
			row = Math.max(Math.floor(this.viewBox.clientWidth / (this.selectedElement.clientWidth + 8)), 1);
			index = Math.max(lastIndex - row, 0);
			break;

		case "ArrowDown":
			row = Math.max(Math.floor(this.viewBox.clientWidth / (this.selectedElement.clientWidth + 8)), 1);
			index = Math.min(lastIndex + row, elements.length - 1);
			break;
		}

		if (index !== lastIndex && elements[index]) {
			this.Select(elements[index]);
			this.selectedElement.scrollIntoView({block: "nearest"});
		}
	}

	View_ondragover(event) {
		this.dropArea.style.visibility = "visible";
		this.dropArea.style.opacity = "1";
		this.dropArea.style.transform = "none";
		return false;
	}

	View_ondragleave(event) {
		this.dropArea.style.visibility = "hidden";
		this.dropArea.style.opacity = "0";
		this.dropArea.style.transform = "scale(.96)";
	}

	async View_ondrop(event) {
		event.preventDefault();

		this.dropArea.style.visibility = "hidden";
		this.dropArea.style.opacity = "0";
		this.dropArea.style.transform = "scale(.96)";

		const files = event.dataTransfer.files;
		for (let i=0; i<files.length; i++) {
			if (!(this.workingDirectory in Sftp.UPLOAD_QUEUE)) {
				Sftp.UPLOAD_QUEUE[this.workingDirectory] = [];
			}

			Sftp.UPLOAD_QUEUE[this.workingDirectory].push(files[i]);

			const element = this.CreateFileElement({
				name     : files[i].name,
				fullname : `${this.workingDirectory}/${files[i].name}`,
				size     : files[i].size,
				isFile   : true,
				isDir    : false,
				isLink   : false,
				modified : files[i].lastModified
			}, true);

			this.viewBox.appendChild(element);
		}
	}
}
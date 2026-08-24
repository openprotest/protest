"use strict";
class Sftp extends Window {

	constructor(args) {
		super(args);

		this.args = args;
		this.queue = Object.create(null);

		this.AddCssDependencies("files.css");

		this.SetTitle("SFTP");
		this.SetIcon("mono/shared.svg");

		this.status = "idle";
		this.selectedElement = null;

		this.InitializeComponents();

		this.defaultElement = this.viewBox;

		if (this.args.listView) {
			this.viewBox.className = "file-view file-list";
		}

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
		this.refreshButton = this.AddToolbarButton("Refresh", "mono/update.svg?light");
		this.AddToolbarSeparator();
		this.deleteButton = this.AddToolbarButton("Delete", "mono/delete.svg?light");
		this.toggleButton = this.AddToolbarButton("Toggle view", "mono/grid.svg?light");

		this.pathBox = document.createElement("div");
		this.pathBox.className = "win-toolbar file-path";

		this.viewBox = document.createElement("div");
		this.viewBox.className = "file-view file-grid";
		this.viewBox.tabIndex = 0;

		this.counterBox = document.createElement("div");
		this.counterBox.className = "file-counter";
		this.counterBox.textContent = "0";

		this.uploadStats = document.createElement("div");
		this.uploadStats.className = "file-upload-stats";
		this.uploadStats.textContent = "Uploading";
		this.uploadStats.style.opacity = "0";

		this.dropArea = document.createElement("div");
		this.dropArea.className = "file-drop-area";
		this.dropArea.textContent = "Drop files here to upload...";

		this.content.append(this.pathBox, this.viewBox, this.counterBox, this.uploadStats, this.dropArea);

		this.spinnerBox = document.createElement("div");
		this.spinnerBox.style.height = "0";
		this.spinnerBox.style.animation = "delayed-fade-in .66s ease-in 1";
		this.content.appendChild(this.spinnerBox);

		const spinner = document.createElement("div");
		spinner.className = "spinner";
		spinner.style.textAlign = "left";
		spinner.style.marginTop = "48px";
		spinner.style.marginBottom = "8px";
		spinner.appendChild(document.createElement("div"));

		this.statusBox = document.createElement("div");
		this.statusBox.style.position = "relative";
		this.statusBox.style.textAlign = "center";
		this.statusBox.style.fontWeight = "bold";
		this.statusBox.textContent = "Connecting...";

		this.spinnerBox.append(spinner, this.statusBox );

		this.connectButton.onclick = ()=> this.ConnectDialog(this.args.host, false);
		this.refreshButton.onclick = ()=> this.Refresh();
		this.toggleButton.onclick  = ()=> this.ToggleView();
		this.deleteButton.onclick  = ()=> this.DeleteSelected();

		this.viewBox.onkeydown   = event => this.View_onkeydown(event);
		this.content.ondragover  = event => this.Content_ondragover(event);
		this.content.ondragleave = event => this.Content_ondragleave(event);
		this.content.ondrop      = event => this.Content_ondrop(event);
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
			if (this.args.workingDirectory) {
				connectionString += `\nwd=${this.args.workingDirectory}`
			}
			this.ws.send(connectionString);
		};

		this.ws.onerror = err=> {
			console.log(err);
		};

		this.ws.onclose = ()=> {
			this.connectButton.disabled = false;
			//this.ConnectDialog(this.args.host, false);
		};

		this.ws.onmessage = async event=> {
			let json = JSON.parse(event.data);
			if (json.connected) {
				this.SetTitle(`SFTP - ${target}`);

				this.content.focus();
			}
			else if (json.action) {
				await this.ActionMux(json);
			}
			else if (json.error) {
				this.ConfirmBox(json.error, true, "mono/error.svg");
			}

			this.status = "idle";
			this.spinnerBox.style.display = "none";
		};
	}

	Close() { //overrides
		if (this.ws != null) this.ws.close();
		super.Close();
	}

	async ActionMux(json) {
		switch (json.action) {
		case "list":
			this.args.workingDirectory = json.workingDirectory;
			this.UpdatePath(json.workingDirectory);
			this.ListFiles(json.data);
			break;

		case "download": {
			const link = document.createElement("a");
			link.download = json.name;
			link.href = `sftp/download?token=${json.token}`;
			link.click();
			link.remove();
			break;
		}

		case "upload": {
			const entry = this.queue[json.directory][json.name];
			if (!entry) break;

			const file = entry.file;

			const formData = new FormData();
			formData.append("file", file);

			try {
				const uploadResponse = await fetch(`sftp/upload?token=${json.token}`, {
					method: "POST",
					body: formData
				});

				if (uploadResponse.status !== 200) LOADER.HttpErrorHandler(uploadResponse.status);

				const uploadJson = await uploadResponse.json();

				if (uploadJson.error) {
					this.viewBox.removeChild(entry.element);
					delete this.queue[json.directory][json.name]
					throw(uploadJson.error);
				}
			}
			catch (ex) {
				this.ConfirmBox(ex, true, "mono/error.svg");
			}
			break;
		}

		case "upload-status": {
			const entry = this.queue[json.dir][json.name];
			if (!entry) break;

			if (json.progress === 100) {
				entry.element.removeChild(entry.progress);
				delete this.queue[json.dir][json.name];
				this.UpdateUploadStatus();
				break;
			}

			entry.progress.style.background = `linear-gradient(to right, var(--clr-accent) ${json.progress}%, transparent ${json.progress}%)`
			break;
		}

		case "rm": {
			const name = json.path.split("/").pop();
			const elements = [...this.viewBox.childNodes];
			const element = elements.find(o=> o.getAttribute("name") === name);
			if (!element) break;
			this.viewBox.removeChild(element);
			this.selectedElement = null;
			this.args.filename = null;
			break;
		}

		case "mkdir": {
			const name = json.path.split("/").pop();
			const dir = json.path.substring(0, json.path.length - name.length - 1);
			if (this.args.workingDirectory !== dir) break;

			const element = this.CreateFileElement({
				name     : name,
				fullname : json.path,
				size     : 0,
				isFile   : false,
				isDir    : true,
				isLink   : false,
				modified : new Date(),
			}, false);

			this.viewBox.appendChild(element);
			break;
		}
		}
	}

	ToggleView() {
		this.args.listView = !this.args.listView;
		this.viewBox.className = this.args.listView ? "file-view file-list" : "file-view file-grid";

		if (this.selectedElement) {
			this.selectedElement.scrollIntoView({block: "nearest"});
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

	UpdateUploadStatus() {
		let count = 0;
		for (const dir in this.queue) {
			for (const file in (this.queue[dir])) {
				count++;
			}
		}

		this.uploadStats.textContent = `Uploading: ${count}`
		this.uploadStats.style.opacity = count === 0 ? "0" : "1";
	}

	ListFiles(files) {
		this.selectedElement = null;
		this.viewBox.textContent = "";
		this.counterBox.textContent = files.length;

		if (files.length > 2000) {
			this.args.listView = true;
			this.viewBox.className = "file-view file-list";
		}

		for (let i=0; i<files.length; i++) {
			const element = this.CreateFileElement(files[i]);
			this.viewBox.appendChild(element);

			if (this.args.filename && files[i].name === this.args.filename) {
				this.Select(element);
				element.scrollIntoView({block: "nearest"});
			}
		}

		if (this.args.workingDirectory && (this.args.workingDirectory in this.queue)) {
			const queue = this.queue[this.args.workingDirectory];
			for (const key in queue) {
				this.viewBox.appendChild(queue[key].element);
			}
		}
	}

	CreateFileElement(file, isQueued=false) {
		const container = document.createElement("div");
		container.setAttribute("name", file.name);
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

		const detailsBox = document.createElement("div");
		detailsBox.className = "file-details";

		const size = document.createElement("div");
		if (!file.isDir) {
			size.textContent = UI.SizeToString(file.size);
		}

		const date = document.createElement("div");
		const d = new Date(file.modified*1000);
		date.textContent = d.toLocaleDateString(UI.regionalFormat) + " " + d.toLocaleTimeString(UI.regionalFormat);

		detailsBox.append(size, date);

		container.append(iconBox, nameBox, detailsBox);

		const dotIndex = file.name.indexOf(".", 1);
		if (dotIndex > 0 && !file.isDir) {
			const extension = file.name.split(".").pop().toLowerCase();
			const extensionBox = document.createElement("div");
			extensionBox.classList = "file-extension";
			extensionBox.textContent = extension;
			container.appendChild(extensionBox);

			let r = 63 + (extension.charCodeAt(0) * 5) % 192;
			let g = 63 + (extension.charCodeAt(1 % extension.length) * 5) % 192;
			let b = 63 + (extension.charCodeAt(2 % extension.length) * 5) % 192;

			if (r*.3 + g*.59 + b*.11 < 112) extensionBox.style.color = "#ddd";
			extensionBox.style.backgroundColor = `rgb(${r},${g},${b})`;
		}

		if (file.isLink) {
			container.classList.add("file-link");
		}

		if (isQueued) {
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

		this.args.filename = element.getAttribute("name");
	}

	Refresh() {
		if (this.ws === null) return;
		if (this.status !== "idle") return;
		if (!this.args.workingDirectory) return;

		this.viewBox.textContent = "";
		this.spinnerBox.style.display = "initial";

		this.status = "listing";
		this.statusBox.textContent = "Loading...";
		this.ws.send(`list:${this.args.workingDirectory}`);
	}

	NavigateUp() {
		if (this.ws === null) return;
		if (this.status !== "idle") return;
		if (this.args.workingDirectory === "/") return;
		if (!this.args.workingDirectory) return;

		this.args.filename = this.args.workingDirectory.split("/").pop();

		this.viewBox.textContent = "";
		this.spinnerBox.style.display = "initial";

		this.status = "listing";
		this.statusBox.textContent = "Loading...";
		this.ws.send(`list:${this.args.workingDirectory}/..`);
	}

	DeleteSelected() {
		if (!this.args.filename) return;

		this.ConfirmBox(`Are you sure you want to delete "${this.args.filename}"`, false, "/mono/delete.svg").addEventListener("click", ()=> {
			if (this.ws === null) return;
			if (this.status !== "idle") return;
			if (!this.args.workingDirectory) return;

			this.ws.send(`rm:${this.args.workingDirectory}/${this.args.filename}`);

			this.viewBox.focus();
		});
	}

	Upload(entry, directory) {
		if (entry.isFile) {
			entry.file(file => this.UploadFile(file, directory));
			return;
		}

		if (entry.isDirectory) {
			const path = `${directory}/${entry.name}`;
			this.ws.send(`mkdir:${path}`);

			const reader = entry.createReader();
			const readEntries = ()=> {
				reader.readEntries(entries => {
					if (entries.length === 0) return;

					for (const child of entries) {
						this.Upload(child, path);
					}

					readEntries();
				});
			};

			readEntries();
		}
	}

	UploadFile(file, directory) {
		this.ws.send(`upload:${directory}/${file.name}`);

		const element = this.CreateFileElement({
			name: file.name,
			fullname: `${directory}/${file.name}`,
			size: file.size,
			isFile: true,
			isDir: false,
			isLink: false,
			modified: file.lastModified,
		}, true);

		if (!(directory in this.queue)) {
			this.queue[directory] = Object.create(null);
		}

		this.queue[directory][file.name] = {
			file: file,
			element: element,
			progress: element.getElementsByClassName("file-loading-bar")[0]
		};

		if (this.args.workingDirectory === directory) {
			this.viewBox.appendChild(element);
		}

		this.UpdateUploadStatus();
	}

	File_onclick(event, file, element) {
		this.Select(element);
	}

	File_ondblclick(event, file) {
		if (this.ws === null) return;
		if (this.status !== "idle") return;

		if (file.isDir) {
			this.viewBox.textContent = "";
			this.spinnerBox.style.display = "initial";

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
			if (this.selectedElement === null) break;
			this.selectedElement.ondblclick();
			break;

		case "Delete":
			this.DeleteSelected();
			break;

		case "ArrowLeft":
		case "ArrowRight":
		case "ArrowUp":
		case "ArrowDown":
			this.ArrowNavigation(event);
			break;

		default:
			if (event.key.length !== 1) break;
			const key = event.key.toLowerCase();
			const candidates = [...this.viewBox.children].filter(o=> o.getAttribute("name")?.toLowerCase().startsWith(key));

			if (candidates.length === 0) break;
			const index = (candidates.indexOf(this.selectedElement) + 1) % candidates.length;
			const element = candidates[index];
			element.onclick();
			element.scrollIntoView({block: "nearest"});
			break;
		}
	}

	ArrowNavigation(event) {
		event.preventDefault();

		const elements = [...this.viewBox.childNodes];
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

	Content_ondragover(event) {
		this.dropArea.style.transition = ".2s";
		this.dropArea.style.visibility = "visible";
		this.dropArea.style.opacity = "1";
		this.dropArea.style.transform = "none";
		return false;
	}

	Content_ondragleave(event) {
		this.dropArea.style.visibility = "hidden";
		this.dropArea.style.opacity = "0";
		this.dropArea.style.transform = "scale(.96)";
	}

	Content_ondrop(event) {
		event.preventDefault();

		this.dropArea.style.visibility = "hidden";
		this.dropArea.style.opacity = "0";
		this.dropArea.style.transform = "scale(.96)";

		if (this.ws === null) return;
		if (this.status !== "idle") return;

		const items = event.dataTransfer.items;
		for (let i=0; i<items.length; i++) {
			const entry = items[i].webkitGetAsEntry();
			if (!entry) continue;
			this.Upload(entry, this.args.workingDirectory);
		}
	}
}
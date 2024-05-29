class UserView extends View {
	static USERS_GROUP_SCHEMA = [
		"type", "title", "department", "division", "company",

		["mono/user.svg", "general"],
		"first name", "middle name", "last name", "display name", "employee id",

		["mono/credential.svg", "authentication"],
		"domain", "username", "password",

		["mono/contact.svg", "contact information"],
		"e-mail", "secondary e-mail", "telephone number", "office number", "mobile number", "internal extension", "mobile extension", "fax",

		["mono/directory.svg", "Domain information"],
		"guid", "distinguished name",

		["mono/sim.svg", "sim information"],
		"sim", "puk", "voicemail"
	];

	constructor(args) {
		super();
		this.args = args ?? { file: null };

		this.SetIcon("mono/user.svg");

		this.liveStatsWebSockets = null;
		this.link = LOADER.users.data[this.args.file];
		this.order = "group";
		this.groupSchema = UserView.USERS_GROUP_SCHEMA;
		this.dbTarget = "user";

		if (args.file && !this.link) {
			this.SetTitle("not found");
			this.ConfirmBox("User no longer exists", true).addEventListener("click", ()=> this.Close());
			return;
		}

		if (args.file) {
			this.SetTitle(this.link.title ? this.link.title.v : "");
			this.InitializePreview();
		}
		else if (args.copy) {
			const origin = LOADER.users.data[args.copy];
			this.SetTitle(origin.title ? `Copy of ${origin.title.v}` : "Copy");
			this.Edit(true);

			for (const key in origin) {
				this.attributes.appendChild(
					this.CreateAttribute(key, origin[key].v, null, null, true)
				);
			}
		}
		else {
			this.SetTitle("New user");
			this.Edit(true);

			let origin = KEEP.username;
			let date = new Date();

			this.attributes.appendChild(this.CreateAttribute("type", "", origin, date, true));

			this.attributes.appendChild(this.CreateAttribute("title",         "", origin, date, true));
			this.attributes.appendChild(this.CreateAttribute("department",    "", origin, date, true));
			this.attributes.appendChild(this.CreateAttribute("first name",    "", origin, date, true));
			this.attributes.appendChild(this.CreateAttribute("last name",     "", origin, date, true));
			this.attributes.appendChild(this.CreateAttribute("username",      "", origin, date, true));
			this.attributes.appendChild(this.CreateAttribute("e-mail",        "", origin, date, true));
			this.attributes.appendChild(this.CreateAttribute("office number", "", origin, date, true));
			this.attributes.appendChild(this.CreateAttribute("mobile number", "", origin, date, true));
		}
	}

	InitializePreview() { //overrides
		let type = this.link.type ? this.link.type.v.toLowerCase() : "";

		this.SetTitle(this.link.title ? this.link.title.v : "untitled");
		this.SetIcon(type in LOADER.userIcons ? LOADER.userIcons[type] : "mono/user.svg");
		super.InitializePreview();
		this.InitializeLiveStats();
	}

	InitializeSideTools() { //overrides
		super.InitializeSideTools();
		this.sideTools.textContent = "";

		if (this.link.username && this.link.username.v.length > 0) {
			const unlockButton = this.CreateSideButton("mono/lock.svg", "Unlock");
			unlockButton.onclick = async ()=>{
				if (unlockButton.hasAttribute("busy")) return;
				try {
					unlockButton.setAttribute("busy", true);
					const response = await fetch(`manage/user/unlock?file=${this.args.file}`);
					const json = await response.json();
					if (json.error) throw(json.error);

					if (this.lockedUserWarning) {
						this.lockedUserWarning.style.display = "none";
					}
				}
				catch (ex) { this.ConfirmBox(ex, true, "mono/lock.svg"); }
				unlockButton.removeAttribute("busy");
			};

			const enableButton = this.CreateSideButton("mono/enable.svg", "Enable");
			enableButton.onclick = async ()=>{
				if (enableButton.hasAttribute("busy")) return;
				try {
					enableButton.setAttribute("busy", true);
					const response = await fetch(`manage/user/enable?file=${this.args.file}`);
					const json = await response.json();
					if (json.error) throw(json.error);
				}
				catch (ex) { this.ConfirmBox(ex, true, "mono/enable.svg"); }
				enableButton.removeAttribute("busy");
			};

			const disableButton = this.CreateSideButton("mono/disable.svg", "Disable");
			disableButton.onclick = async ()=>{
				if (disableButton.hasAttribute("busy")) return;
				try {
					disableButton.setAttribute("busy", true);
					const response = await fetch(`manage/user/disable?file=${this.args.file}`);
					const json = await response.json();
					if (json.error) throw(json.error);
				}
				catch (ex) { this.ConfirmBox(ex, true, "mono/disable.svg"); }
				disableButton.removeAttribute("busy");
			};

		}
	}

	async InitializeLiveStats() {
		if (this.liveStatsWebSockets !== null) return;

		let server = window.location.href.replace("https://", "").replace("http://", "");
		if (server.indexOf("/") > 0) server = server.substring(0, server.indexOf("/"));

		this.liveStatsWebSockets = new WebSocket((KEEP.isSecure ? "wss://" : "ws://") + server + "/ws/livestats/user");

		this.liveStatsWebSockets.onopen = ()=> {
			this.AfterResize();
			this.liveA.textContent = "";
			this.liveB.textContent = "";
			this.liveD.textContent = "";

			this.liveStatsWebSockets.send(this.args.file);
		};

		this.liveStatsWebSockets.onmessage = event=> {
			const json = JSON.parse(event.data);

			if (json.info) {
				this.CreateInfo(json.info);
			}
			else if (json.warning) {
				this.CreateWarning(json.warning);
			}
			else if (json.lockedOut) {
				this.lockedUserWarning = this.CreateWarning(`User is locked out (${json.lockedOut})`);
			}
		};

		this.liveStatsWebSockets.onclose = event=> {
			this.liveStatsWebSockets = null;
		};

		//this.liveStatsWebSockets.onerror = error=> {};
	}

	Edit(isNew = false) { //overrides
		const fetchButton = document.createElement("button");
		if (isNew && !this.args.copy) {
			fetchButton.className = "view-fetch-floating-button";
			fetchButton.setAttribute("tip-below", "Fetch");
			this.content.appendChild(fetchButton);

			fetchButton.onclick = ()=> {
				const dialog = this.DialogBox("108px");
				if (dialog === null) return;

				dialog.innerBox.parentElement.style.maxWidth = "400px";
				dialog.innerBox.style.textAlign = "center";

				const fetchHostInput = document.createElement("input");
				fetchHostInput.type = "text";
				fetchHostInput.placeholder = "username or email";
				fetchHostInput.style.marginTop = "20px";
				fetchHostInput.style.width = "min(calc(100% - 8px), 200px)";
				dialog.innerBox.appendChild(fetchHostInput);

				fetchHostInput.focus();

				dialog.okButton.onclick = ()=> {
					if (fetchHostInput.value.length === 0) return;
					dialog.cancelButton.onclick();
					setTimeout(()=> this.Fetch(true, fetchHostInput.value), 250);
				};

				fetchHostInput.onkeydown = event=> {
					if (event.key === "Enter") {
						dialog.okButton.click();
					}
				}
			};
		}

		const saveButton = super.Edit(isNew);
		saveButton.addEventListener("click", async ()=> {
			let obj = {};
			for (let i = 0; i < this.attributes.childNodes.length; i++) {
				if (this.attributes.childNodes[i].childNodes.length < 2) continue;
				let name = this.attributes.childNodes[i].childNodes[0].value.toLowerCase();
				let value = this.attributes.childNodes[i].childNodes[1].firstChild.value;
				obj[name] = { v: value };
			}

			try {
				const response = await fetch(this.args.file ? `db/user/save?file=${this.args.file}` : "db/user/save", {
					method: "POST",
					body: JSON.stringify(obj)
				});

				if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

				const json = await response.json();
				if (json.error) throw (json.error);

				this.args.file = json.filename;
				this.link = obj;
				LOADER.users.data[json.filename] = obj;

				this.InitializePreview();
			}
			catch (ex) {
				this.ConfirmBox(ex, true, "mono/error.svg").addEventListener("click", ()=>{
					this.Close();
				});
			}
			finally {
				if (isNew) this.content.removeChild(fetchButton);
			}
		});
	}

	Fetch(isNew = false, forceTarget = null) { //overrides
		let target = null;
		if (isNew) {
			target = forceTarget;
		}
		else if (this.link.username && this.link.username.v.length > 0) {
			target = this.link.username.v;
		}
		else if (this.link.email && this.link.email.v.length > 0) {
			target = this.link.email.v;
		}

		if (target === null) {
			this.ConfirmBox("No username or email found", true);
			return;
		}

		const dialog = this.DialogBox("200px");
		if (dialog === null) return;

		dialog.okButton.onclick = async ()=> {
			dialog.innerBox.textContent = "";
			dialog.okButton.style.display = "none";

			const spinner = document.createElement("div");
			spinner.className = "spinner";
			spinner.style.textAlign = "left";
			spinner.style.marginTop = "32px";
			spinner.style.marginBottom = "16px";
			spinner.appendChild(document.createElement("div"));
			dialog.innerBox.appendChild(spinner);

			const status = document.createElement("div");
			status.textContent = "Fetching...";
			status.style.textAlign = "center";
			status.style.fontWeight = "bold";
			status.style.animation = "delayed-fade-in 1.5s ease-in 1";
			dialog.innerBox.appendChild(status);

			dialog.innerBox.parentElement.style.transition = ".4s";
			dialog.innerBox.parentElement.style.height = "180px";

			let isCanceled = false;
			dialog.cancelButton.addEventListener("click", ()=> {
				isCanceled = true;
			});

			try {
				let url = `fetch/singleuser?target=${target}`;
				const response = await fetch(url);

				if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

				const json = await response.json();
				if (json.error) {
					throw new Error(json.error);
				}

				dialog.cancelButton.onclick();

				if (isCanceled) return;

				if (isNew) {
					this.attributes.textContent = "";
				}
				else {
					this.Edit(false);
				}

				let attrElements = Array.from(this.attributes.childNodes).filter(o=> o.className != "view-attributes-group");
				let hasType = !!attrElements.find(o=> o.firstChild.value === "type" && o.childNodes[1].firstChild.value.length > 0);

				for (let attr in json) {
					if (hasType && attr === "type") continue;

					let element = attrElements.find(o=> o.firstChild.value === attr);

					if (element) {
						element.setAttribute("source", json[attr][1]);

						if (element.childNodes[1].firstChild.value === json[attr][0]) {
							if (!isNew) {
								element.childNodes[1].firstChild.style.backgroundImage = "url(mono/checked.svg)";
								element.childNodes[1].firstChild.style.paddingLeft = "32px";
							}
						}
						else {
							if (element.childNodes[1].firstChild.value.length > 0) {
								element.childNodes[1].setAttribute("previous", element.childNodes[1].firstChild.value);
							}
							if (!isNew) {
								element.childNodes[1].firstChild.style.backgroundImage = "url(mono/edit.svg)";
								element.childNodes[1].firstChild.style.paddingLeft = "32px";
							}
							element.childNodes[1].firstChild.value = json[attr][0];
						}
					}
					else {
						const newElement = this.attributes.appendChild(this.CreateAttribute(attr, json[attr][0], KEEP.username, new Date(), true));
						newElement.setAttribute("source", json[attr][1]);
						if (!isNew) {
							newElement.childNodes[1].firstChild.style.backgroundImage = "url(mono/add.svg)";
							newElement.childNodes[1].firstChild.style.paddingLeft = "32px";
						}
					}
				}
			}
			catch (ex) {
				dialog.innerBox.parentElement.style.transition = ".4s";
				dialog.innerBox.parentElement.style.height = "120px";
				dialog.innerBox.textContent = "";
				dialog.cancelButton.value = "Close";

				const errorBox = document.createElement("div");
				errorBox.textContent = ex;
				errorBox.style.textAlign = "center";
				errorBox.style.fontWeight = "600";
				errorBox.style.padding = "20px";
				dialog.innerBox.appendChild(errorBox);
			}
		};

		//dialog.okButton.focus();
		dialog.okButton.onclick();
	}

	Copy() { //overrides
		new UserView({ copy: this.args.file });
	}

	Delete() { //overrides
		this.ConfirmBox("Are you sure you want to delete this user?", false, "mono/delete.svg").addEventListener("click", async ()=> {
			try {
				const response = await fetch(`db/user/delete?file=${this.args.file}`);

				if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

				const json = await response.json();
				if (json.error) throw (json.error);

				delete LOADER.users.data[this.args.file];
				LOADER.users.length--;

				for (let i = 0; i < WIN.array.length; i++) {
					if (WIN.array[i] instanceof UsersList) {
						let element = Array.from(WIN.array[i].list.childNodes).filter(o=> o.getAttribute("id") === this.args.file);
						element.forEach(o=> WIN.array[i].list.removeChild(o));

						WIN.array[i].UpdateViewport(true);
					}
				}

				this.Close();
			}
			catch (ex) {
				console.error(ex);
			}
		});
	}
}
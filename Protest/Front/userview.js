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

	constructor(params) {
		super();
		this.params = params ?? { file: null };

		this.SetIcon("mono/user.svg");

		this.liveStatsWebSockets = null;
		this.link = LOADER.users.data[this.params.file];
		this.order = "group";
		this.groupSchema = UserView.USERS_GROUP_SCHEMA;
		this.dbTarget = "user";

		if (params.file && !this.link) {
			this.SetTitle("not found");
			this.ConfirmBox("User no longer exists", true).addEventListener("click", ()=> this.Close());
			return;
		}

		if (params.file) {
			this.SetTitle(this.link.title ? this.link.title.v : "");
			this.InitializePreview();
		}
		else if (params.copy) {
			const origin = LOADER.users.data[params.copy];
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

	InitializePreview() { //override
		let type = this.link.type ? this.link.type.v.toLowerCase() : "";

		this.SetTitle(this.link.title ? this.link.title.v : "untitled");
		this.SetIcon(type in LOADER.userIcons ? LOADER.userIcons[type] : "mono/user.svg");
		super.InitializePreview();
		this.InitializeLiveStats();
	}

	InitializeSideTools() { //override
		super.InitializeSideTools();
		this.sideTools.textContent = "";

		if (this.link.username && this.link.username.v.length > 0) {
			const btnUnlock = this.CreateSideButton("mono/lock.svg", "Unlock");
			btnUnlock.onclick = async ()=>{
				if (btnUnlock.hasAttribute("busy")) return;
				try {
					btnUnlock.setAttribute("busy", true);
					const response = await fetch(`manage/user/unlock?file=${this.params.file}`);
					const json = await response.json();
					if (json.error) throw(json.error);

					if (this.lockedUserWarning) {
						this.lockedUserWarning.style.display = "none";
					}
				}
				catch (ex) { this.ConfirmBox(ex, true, "mono/lock.svg"); }
				btnUnlock.removeAttribute("busy");
			};

			const btnEnable = this.CreateSideButton("mono/enable.svg", "Enable");
			btnEnable.onclick = async ()=>{
				if (btnEnable.hasAttribute("busy")) return;
				try {
					btnEnable.setAttribute("busy", true);
					const response = await fetch(`manage/user/enable?file=${this.params.file}`);
					const json = await response.json();
					if (json.error) throw(json.error);
				}
				catch (ex) { this.ConfirmBox(ex, true, "mono/enable.svg"); }
				btnEnable.removeAttribute("busy");
			};

			const btnDisable = this.CreateSideButton("mono/disable.svg", "Disable");
			btnDisable.onclick = async ()=>{
				if (btnDisable.hasAttribute("busy")) return;
				try {
					btnDisable.setAttribute("busy", true);
					const response = await fetch(`manage/user/disable?file=${this.params.file}`);
					const json = await response.json();
					if (json.error) throw(json.error);
				}
				catch (ex) { this.ConfirmBox(ex, true, "mono/disable.svg"); }
				btnDisable.removeAttribute("busy");
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

			this.liveStatsWebSockets.send(this.params.file);
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

	Edit(isNew = false) { //override
		const btnFetch = document.createElement("button");
		if (isNew && !this.params.copy) {
			btnFetch.className = "view-fetch-floating-button";
			btnFetch.setAttribute("tip-below", "Fetch");
			this.content.appendChild(btnFetch);

			btnFetch.onclick = ()=> {
				const dialog = this.DialogBox("108px");
				if (dialog === null) return;

				dialog.innerBox.parentElement.style.maxWidth = "400px";
				dialog.innerBox.style.textAlign = "center";

				const txtFetchHost = document.createElement("input");
				txtFetchHost.type = "text";
				txtFetchHost.placeholder = "username or email";
				txtFetchHost.style.marginTop = "20px";
				txtFetchHost.style.width = "min(calc(100% - 8px), 200px)";
				dialog.innerBox.appendChild(txtFetchHost);

				txtFetchHost.focus();

				dialog.btnOK.onclick = ()=> {
					if (txtFetchHost.value.length === 0) return;
					dialog.btnCancel.onclick();
					setTimeout(()=> this.Fetch(true, txtFetchHost.value), 250);
				};

				txtFetchHost.onkeydown = event=> {
					if (event.key === "Enter") {
						dialog.btnOK.click();
					}
				}
			};
		}

		const btnSave = super.Edit(isNew);
		btnSave.addEventListener("click", async ()=> {
			let obj = {};
			for (let i = 0; i < this.attributes.childNodes.length; i++) {
				if (this.attributes.childNodes[i].childNodes.length < 2) continue;
				let name = this.attributes.childNodes[i].childNodes[0].value;
				let value = this.attributes.childNodes[i].childNodes[1].firstChild.value;
				obj[name] = { v: value };
			}

			try {
				const response = await fetch(this.params.file ? `db/user/save?file=${this.params.file}` : "db/user/save", {
					method: "POST",
					body: JSON.stringify(obj)
				});

				if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

				const json = await response.json();
				if (json.error) throw (json.error);

				this.params.file = json.filename;
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
				if (isNew) this.content.removeChild(btnFetch);
			}
		});
	}

	Fetch(isNew = false, forceTarget = null) { //override
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

		dialog.btnOK.onclick = async ()=> {
			dialog.innerBox.textContent = "";
			dialog.btnOK.style.display = "none";

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
			dialog.btnCancel.addEventListener("click", ()=> {
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

				dialog.btnCancel.onclick();

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
				dialog.btnCancel.value = "Close";

				const errorBox = document.createElement("div");
				errorBox.textContent = ex;
				errorBox.style.textAlign = "center";
				errorBox.style.fontWeight = "600";
				errorBox.style.padding = "20px";
				dialog.innerBox.appendChild(errorBox);
			}
		};

		//dialog.btnOK.focus();
		dialog.btnOK.onclick();
	}

	Copy() { //override
		new UserView({ copy: this.params.file });
	}

	Delete() { //override
		this.ConfirmBox("Are you sure you want to delete this user?", false, "mono/delete.svg").addEventListener("click", async ()=> {
			try {
				const response = await fetch(`db/user/delete?file=${this.params.file}`);

				if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

				const json = await response.json();
				if (json.error) throw (json.error);

				delete LOADER.users.data[this.params.file];
				LOADER.users.length--;

				for (let i = 0; i < WIN.array.length; i++) {
					if (WIN.array[i] instanceof UsersList) {
						let element = Array.from(WIN.array[i].list.childNodes).filter(o=> o.getAttribute("id") === this.params.file);
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
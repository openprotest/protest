class Acl extends Tabs {
	constructor(params) {
		super(null);

		this.params = params ?? "";

		this.AddCssDependencies("list.css");

		this.SetTitle("Access control list");
		this.SetIcon("mono/acl.svg");

		this.tabsPanel.style.padding = "20px";

		this.tabAcl      = this.AddTab("ACL", "mono/acl.svg");
		this.tabSessions = this.AddTab("Open sessions", "mono/hourglass.svg");

		this.tabAcl.onclick      = ()=> this.ShowAcl();
		this.tabSessions.onclick = ()=> this.ShowSessions();

		switch (this.params) {
		case "sessions":
			this.tabSessions.className = "v-tab-selected";
			this.ShowSessions();
			break;

		default:
			this.tabAcl.className = "v-tab-selected";
			this.ShowAcl();
		}

		setTimeout(()=> { this.AfterResize(); }, 250);
	} 

	AfterResize() { //override
		super.AfterResize();
		if (this.options) {
			if (this.options.getBoundingClientRect().width < 300) {
				for (let i=0; i<this.options.childNodes.length; i++) {
					this.options.childNodes[i].style.color = "transparent";
					this.options.childNodes[i].style.width = "30px";
					this.options.childNodes[i].style.minWidth = "30px";
					this.options.childNodes[i].style.paddingLeft = "0";
				}
			}
			else {
				for (let i=0; i<this.options.childNodes.length; i++) {
					this.options.childNodes[i].style.color = "";
					this.options.childNodes[i].style.width = "";
					this.options.childNodes[i].style.minWidth = "";
					this.options.childNodes[i].style.paddingLeft = "";
				}
			}
		}
	}

	ShowAcl() {
		this.params = "acl";
		this.tabsPanel.textContent = "";

		this.usersList = document.createElement("div");
		this.usersList.className = "no-results";
		this.usersList.style.position = "absolute";
		this.usersList.style.backgroundColor = "var(--clr-control)";
		this.usersList.style.paddingTop = "2px";
		this.usersList.style.borderRadius = "4px";
		this.usersList.style.left = "8px";
		this.usersList.style.width = "250px";
		this.usersList.style.top = "8px";
		this.usersList.style.bottom = "8px";

		this.options = document.createElement("div");
		this.options.className = "acl-options";
		this.options.style.position = "absolute";
		this.options.style.left = "266px";
		this.options.style.right = "8px";
		this.options.style.top = "8px";
		this.options.style.overflow = "hidden";
		this.options.style.whiteSpace = "nowrap";
		this.tabsPanel.appendChild(this.options);

		this.newButton = document.createElement("input");
		this.newButton.type = "button";
		this.newButton.value = "New";
		this.newButton.className = "with-icon";
		this.newButton.style.backgroundImage = "url(mono/add.svg?light)";

		this.saveButton = document.createElement("input");
		this.saveButton.type = "button";
		this.saveButton.value = "Save";
		this.saveButton.className = "with-icon";
		this.saveButton.style.backgroundImage = "url(mono/floppy.svg?light)";

		this.removeButton = document.createElement("input");
		this.removeButton.type = "button";
		this.removeButton.value = "Remove";
		this.removeButton.className = "with-icon";
		this.removeButton.disabled = true;
		this.removeButton.style.backgroundImage = "url(mono/delete.svg?light)";

		this.options.append(this.newButton, this.saveButton, this.removeButton);

		const userDetails = document.createElement("div");
		userDetails.style.position = "absolute";
		userDetails.style.display = "grid";
		userDetails.style.gridTemplateColumns = "minmax(80px, 120px) minmax(60px, 250px) minmax(60px, 160px)";
		userDetails.style.gridTemplateRows = "repeat(3, 36px)";
		userDetails.style.alignItems = "center";
		userDetails.style.left = "266px";
		userDetails.style.right = "8px";
		userDetails.style.top = "48px";
		userDetails.style.minWidth = "200px";
		userDetails.style.maxWidth = "600px";
		userDetails.style.height = "142px";
		userDetails.style.margin = "4px 8px";

		const usernameLabel = document.createElement("div");
		usernameLabel.textContent = "Username:";
		usernameLabel.style.gridRow = "1";
		usernameLabel.style.gridColumn = "1";
		this.username = document.createElement("input");
		this.username.type = "text";
		this.username.style.gridRow = "1";
		this.username.style.gridColumn = "2";
		userDetails.append(usernameLabel, this.username);

		this.chkDomainUser = document.createElement("input");
		this.chkDomainUser.type = "checkbox";
		this.chkDomainUser.checked = false;
		userDetails.appendChild(this.chkDomainUser);
		const domainUser = this.AddCheckBoxLabel(userDetails, this.chkDomainUser, "Domain user");
		domainUser.style.marginLeft = "8px";
		domainUser.style.whiteSpace = "nowrap";
		domainUser.style.gridRow = "1";
		domainUser.style.gridColumn = "3";

		const domainLabel = document.createElement("div");
		domainLabel.textContent = "Domain:";
		domainLabel.style.gridRow = "2";
		domainLabel.style.gridColumn = "1";
		this.domain = document.createElement("input");
		this.domain.type = "text";
		this.domain.disabled = true;
		this.domain.style.gridRow = "2";
		this.domain.style.gridColumn = "2";
		userDetails.append(domainLabel, this.domain);

		const passwordLabel = document.createElement("div");
		passwordLabel.textContent = "Password:";
		passwordLabel.style.gridRow = "3";
		passwordLabel.style.gridColumn = "1";
		this.password = document.createElement("input");
		this.password.type = "password";
		this.password.style.gridRow = "3";
		this.password.style.gridColumn = "2";
		userDetails.append(passwordLabel, this.password);

		const aliasLabel = document.createElement("div");
		aliasLabel.textContent = "Alias:";
		aliasLabel.style.gridRow = "4";
		aliasLabel.style.gridColumn = "1";
		this.alias = document.createElement("input");
		this.alias.type = "text";
		this.alias.style.gridRow = "4";
		this.alias.style.gridColumn = "2";
		userDetails.append(aliasLabel, this.alias);

		this.accessList = document.createElement("div");
		this.accessList.style.position = "absolute";
		this.accessList.style.left = "266px";
		this.accessList.style.right = "8px";
		this.accessList.style.top = "200px";
		this.accessList.style.bottom = "8px";
		this.accessList.style.paddingLeft = "8px";
		this.accessList.style.paddingTop = "20px";
		this.accessList.style.outline = "0";
		this.accessList.style.overflowY = "scroll";

		this.tabsPanel.append(this.usersList, userDetails, this.accessList);

		this.InitializePermissionList();

		this.username.onchange = ()=>{
			this.alias.placeholder = this.username.value;
		};
		
		this.chkDomainUser.onchange = ()=> {
			if (this.chkDomainUser.checked) {
				this.password.disabled = true;
				this.domain.disabled = false;
			}
			else {
				this.password.disabled = false;
				this.domain.disabled = true;
			}
		};

		this.newButton.onclick = ()=> {
			for (let i = 0; i < this.usersList.childNodes.length; i++) {
				this.usersList.childNodes[i].style.backgroundColor = "transparent";
			}

			this.username.value = "";
			this.domain.value = "";
			this.password.value = "";
			this.alias.value = "";

			this.password.placeholder = "";
			this.alias.placeholder = "";

			this.newButton.disabled = true;
			this.removeButton.disabled = true;
			this.username.removeAttribute("readonly");
			this.username.focus();
		};

		this.saveButton.onclick = async ()=> {
			this.username.value = this.username.value.trim();
			this.domain.value   = this.domain.value.trim();
			this.password.value = this.password.value.trim();
			this.alias.value    = this.alias.value.trim();

			if (this.username.value.length === 0) {
				this.ConfirmBox("Please enter username.", true).addEventListener("click", ()=>setTimeout(this.username.focus(), 150));
				return;
			}

			if (this.chkDomainUser.checked) {
				if (this.domain.value.length === 0) {
					this.ConfirmBox("Please enter domain.", true).addEventListener("click", ()=>setTimeout(this.domain.focus(), 150));
					return;
				}
			}

			this.username.setAttribute("readonly", true);

			try {
				let url = `acl/create?username=${encodeURIComponent(this.username.value)}&domain=${encodeURIComponent(this.domain.value)}&password=${encodeURIComponent(this.password.value)}&alias=${encodeURIComponent(this.alias.value)}&isdomain=${this.chkDomainUser.checked}`;
				let authorization = [];
				
				for (let i=0; i<this.permissionsList.length; i++) {
					if (this.permissionsList[i].read.checked) {
						authorization.push(`${this.permissionsList[i].name.toLowerCase()}:read`);
					}
					if (this.permissionsList[i].write.checked) {
						authorization.push(`${this.permissionsList[i].name.toLowerCase()}:write`);
					}
				}

				const response = await fetch(url, {
					method: "POST",
					body: JSON.stringify(authorization)
				});
	
				if (response.status !== 200) LOADER.HttpErrorHandler(response.status);
				
				const json = await response.json();
				if (json.error) throw(json.error);

				for (let i=0; i<this.usersList.childNodes.length; i++) {
					if (this.usersList.childNodes[i].textContent === this.username.value) {
						this.usersList.removeChild(this.usersList.childNodes[i]);
						break;
					}
				}
	
				let newUser = this.AddUser(this.username.value, this.domain.value, this.password.value, this.alias.value, this.chkDomainUser.checked, authorization);
				newUser.onclick();
			}
			catch (ex) {
				this.ConfirmBox(ex, true, "mono/error.svg");
			}
		};

		this.removeButton.onclick = ()=> {
			this.ConfirmBox("Are you sure you want to remove this user?").addEventListener("click", async()=>{
				try {
					const response = await fetch(`acl/delete?username=${encodeURIComponent(this.username.value)}`);
					
					if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

					const json = await response.json();
					if (json.error) throw(json.error);

					if (json.status === "ok") {
						for (let i = 0; i < this.usersList.childNodes.length; i++) {
							if (this.usersList.childNodes[i].textContent === this.username.value) {
								this.usersList.removeChild(this.usersList.childNodes[i]);
								break;
							}
						}
						this.newButton.onclick();
					}
				}
				catch (ex) {
					this.ConfirmBox(ex, true, "mono/error.svg");
				}
			});
		};

		this.GetUsers();
	}

	InitializePermissionList() {
		this.permissionsList = [];

		const inventoryGroup = this.AddPermissionGroup("Inventory", "url(mono/database.svg)");
		this.permissionsList.push(this.AddPermissionObject("Devices", "url(mono/devices.svg)", inventoryGroup, true, true, true));
		this.permissionsList.push(this.AddPermissionObject("Users", "url(mono/users.svg)", inventoryGroup, true, true, true));
		this.permissionsList.push(this.AddPermissionObject("Passwords", "url(mono/credential.svg)", inventoryGroup, true, false, false));
		this.permissionsList.push(this.AddPermissionObject("Manage hosts", "url(mono/workstation.svg)", inventoryGroup, false, true, false));
		this.permissionsList.push(this.AddPermissionObject("Manage users", "url(mono/user.svg)", inventoryGroup, false, true, false));
		this.permissionsList.push(this.AddPermissionObject("Fetch", "url(mono/fetch.svg)", inventoryGroup, false, true, false));

		const documentationGroup = this.AddPermissionGroup("Documentation", "url(mono/documentation.svg)");
		this.permissionsList.push(this.AddPermissionObject("Chat", "url(mono/chat.svg)", documentationGroup, true, true, true));
		this.permissionsList.push(this.AddPermissionObject("Documentation", "url(mono/documentation.svg)", documentationGroup, true, true, true));
		this.permissionsList.push(this.AddPermissionObject("Debit notes", "url(mono/notes.svg)", documentationGroup, true, true, true));
		this.permissionsList.push(this.AddPermissionObject("Watchdog", "url(mono/watchdog.svg)", documentationGroup, true, true, true));

		const toolsGroup = this.AddPermissionGroup("Tools and utilities", "url(mono/hammer.svg)");
		this.permissionsList.push(this.AddPermissionObject("Network utilities", "url(mono/portscan.svg)", toolsGroup, false, true, false));
		this.permissionsList.push(this.AddPermissionObject("Telnet", "url(mono/telnet.svg)", toolsGroup, false, true, false));
		this.permissionsList.push(this.AddPermissionObject("Secure shell", "url(mono/ssh.svg)", toolsGroup, false, true, false));
		this.permissionsList.push(this.AddPermissionObject("WMI", "url(mono/wmi.svg)", toolsGroup, false, true, false));
		this.permissionsList.push(this.AddPermissionObject("SNMP pooling", "url(mono/snmp.svg)", toolsGroup, false, true, false));
		this.permissionsList.push(this.AddPermissionObject("SNMP traps", "url(mono/trap.svg)", toolsGroup, false, true, false));
		this.permissionsList.push(this.AddPermissionObject("Scripts", "url(mono/scripts.svg)", toolsGroup, false, true, false));
		this.permissionsList.push(this.AddPermissionObject("Automation", "url(mono/automation.svg)", toolsGroup, false, true, false));

		const manageGroup = this.AddPermissionGroup("Manage", "url(mono/logo.svg)");
		this.permissionsList.push(this.AddPermissionObject("Settings", "url(mono/wrench.svg)", manageGroup, false, true, false));
		this.permissionsList.push(this.AddPermissionObject("Access control lists", "url(mono/acl.svg)", manageGroup, false, true, false));
		this.permissionsList.push(this.AddPermissionObject("Log", "url(mono/log.svg)", manageGroup, false, true, false));
		this.permissionsList.push(this.AddPermissionObject("Backup", "url(mono/backup.svg)", manageGroup, false, true, false));
		this.permissionsList.push(this.AddPermissionObject("Update", "url(mono/update.svg)", manageGroup, false, true, false));

		this.accessList.append(inventoryGroup, documentationGroup, toolsGroup, manageGroup);
	}

	AddPermissionGroup(name, icon) {
		const group = document.createElement("div");
		group.style.padding = "8px";
		group.style.margin = "8px";
		group.style.border = "2px solid var(--clr-control)";
		group.style.maxWidth = "640px";
		group.style.borderRadius = "4px";

		const titleBox = document.createElement("div");
		titleBox.style.textAlign = "center";
		group.appendChild(titleBox);

		const title = document.createElement("div");
		title.textContent = name;
		title.style.display = "inline-block";
		title.style.fontWeight = "600";
		title.style.height = "32px";
		title.style.lineHeight = "32px";
		title.style.paddingLeft = "32px";
		title.style.backgroundImage = icon;
		title.style.backgroundSize = "24px 24px";
		title.style.backgroundPosition = "2px center";
		title.style.backgroundRepeat = "no-repeat";
		titleBox.appendChild(title);

		return group;
	}

	AddPermissionObject(name, icon, parent, read, write, linked) {
		const container = document.createElement("div");
		parent.appendChild(container);

		const divName = document.createElement("div");
		divName.textContent = name;
		divName.style.display = "inline-block";
		divName.style.height = "32px";
		divName.style.lineHeight = "32px";
		divName.style.width = "150px";
		divName.style.paddingLeft = "32px";
		divName.style.backgroundImage = icon;
		divName.style.backgroundSize = "24px 24px";
		divName.style.backgroundPosition = "2px center";
		divName.style.backgroundRepeat = "no-repeat";
		container.appendChild(divName);

		const divRead = document.createElement("div");
		divRead.style.color = read ? "var(--clr-dark)" : "var(--clr-control)";
		divRead.style.gridArea = "4 / 2";
		divRead.style.paddingLeft = "4px";
		divRead.style.display = "inline-block";
		const chkRead = document.createElement("input");
		chkRead.type = "checkbox";
		chkRead.checked = true;
		divRead.appendChild(chkRead);
		this.AddCheckBoxLabel(divRead, chkRead, "Read");

		const divWrite = document.createElement("div");
		divWrite.style.color = write ? "var(--clr-dark)" : "var(--clr-control)";
		divWrite.style.gridArea = "4 / 2";
		divWrite.style.paddingLeft = "4px";
		divWrite.style.display = "inline-block";
		const chkWrite = document.createElement("input");
		chkWrite.type = "checkbox";
		chkWrite.checked = true;
		divWrite.appendChild(chkWrite);
		this.AddCheckBoxLabel(divWrite, chkWrite, !read && write ? "Allow access" : "Write");

		chkRead.checked = read;
		chkRead.disabled = !read;
		
		chkWrite.checked = write;
		chkWrite.disabled = !write;

		if (!read && write) {
			container.appendChild(divWrite);
		}
		else {
			container.appendChild(divRead);
			container.appendChild(divWrite);
		}

		if (linked) {
			chkRead.onchange = ()=>{
				if (!chkRead.checked) chkWrite.checked = false;
			};
			chkWrite.onchange = ()=>{
				if (chkWrite.checked) chkRead.checked = true;
			};
		}

		return {
			name: name,
			read: chkRead,
			write: chkWrite,
		};
	}

	async GetUsers() {
		try {
			const response = await fetch("acl/list");

			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);
			
			const json = await response.json();
			if (json.error) throw(json.error);

			for (let i = 0; i < json.length; i++) {
				this.AddUser(json[i].username, json[i].domain, "", json[i].alias, json[i].isDomain, json[i].authorization);
			}
		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/error.svg");
		}
	}

	AddUser(username, domain, password, alias, isDomain, authorization) {
		const lblUsername = document.createElement("div");
		lblUsername.textContent = username;
		lblUsername.style.fontWeight = "600";
		lblUsername.style.height = "28px";
		lblUsername.style.lineHeight = "28px";
		lblUsername.style.paddingLeft = "28px";
		lblUsername.style.margin = "0 2px";
		lblUsername.style.borderRadius = "4px";
		lblUsername.style.whiteSpace = "nowrap";
		lblUsername.style.overflow = "hidden";
		lblUsername.style.textOverflow = "ellipsis";
		lblUsername.style.backgroundImage = "url(mono/user.svg)";
		lblUsername.style.backgroundPosition = "2px 50%";
		lblUsername.style.backgroundSize = "24px 24px";
		lblUsername.style.backgroundRepeat = "no-repeat";
		this.usersList.appendChild(lblUsername);

		lblUsername.onclick = ()=> {
			this.newButton.disabled = false;
			this.removeButton.disabled = false;
			this.username.setAttribute("readonly", true);

			for (let i = 0; i < this.usersList.childNodes.length; i++) {
				this.usersList.childNodes[i].style.backgroundColor = "transparent";
			}
			lblUsername.style.backgroundColor = "var(--clr-select)";

			this.password.placeholder = "unchanged";
			this.alias.placeholder = username;

			this.username.value = username;
			this.domain.value = domain;
			this.password.value = "";
			this.alias.value = alias;
			this.chkDomainUser.checked = isDomain;

			this.chkDomainUser.onchange();

			for (let i=0; i<this.permissionsList.length; i++) {
				this.permissionsList[i].read.checked = false;
				this.permissionsList[i].write.checked = false;
			}
			
			for (let i=0; i<authorization.length; i++) {
				let split = authorization[i].split(":");
				
				let permission = this.permissionsList.find(o=>o.name.toLowerCase() === split[0]);
				if (split[1] === "read") {
					permission.read.checked = true;
				}
				else if (split[1] === "write") {
					permission.write.checked = true;
				}
			}
		};

		return lblUsername;
	}

	async ShowSessions() {
		this.params = "sessions";
		this.tabsPanel.textContent = "";

		const titleBar = document.createElement("div");
		titleBar.style.height = "25px";
		titleBar.style.borderRadius = "4px 4px 0 0";
		titleBar.style.background = "var(--grd-toolbar)";
		titleBar.style.color = "var(--clr-light)";
		this.tabsPanel.appendChild(titleBar);

		let labels = [];

		const lblUsername = document.createElement("div");
		lblUsername.textContent = "Username";
		labels.push(lblUsername);

		const lblIp = document.createElement("div");
		lblIp.textContent = "IP";
		labels.push(lblIp);

		const lblTime = document.createElement("div");
		lblTime.textContent = "Login date";
		labels.push(lblTime);

		const lblTtl = document.createElement("div");
		lblTtl.textContent = "Expiration date";
		labels.push(lblTtl);

		for (let i = 0; i < labels.length; i++) {
			labels[i].style.display = "inline-block";
			labels[i].style.textAlign = "left";
			labels[i].style.width = "25%";
			labels[i].style.lineHeight = "24px";
			labels[i].style.whiteSpace = "nowrap";
			labels[i].style.overflow = "hidden";
			labels[i].style.textOverflow = "ellipsis";
			labels[i].style.boxSizing = "border-box";
			labels[i].style.paddingLeft = "4px";
		}
		
		titleBar.append(lblUsername, lblIp, lblTime, lblTtl);

		const sessionsList = document.createElement("div");
		sessionsList.style.position = "absolute";
		sessionsList.style.overflowY = "auto";
		sessionsList.style.left = "20px";
		sessionsList.style.right = "20px";
		sessionsList.style.top = "45px";
		sessionsList.style.bottom = "20px";
		this.tabsPanel.appendChild(sessionsList);

		try {
			const response = await fetch("acl/sessions");

			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);
			
			const json = await response.json();
			if (json.error) throw(json.error);

			for (let i=0; i<json.length; i++) {
				const element = document.createElement("div");
				element.className = "list-element";
				sessionsList.appendChild(element);

				let attr = [];

				const username = document.createElement("div");
				username.textContent = json[i].username;
				attr.push(username);

				const ip = document.createElement("div");
				ip.textContent = json[i].ip;
				attr.push(ip);
		
				let loginDate = new Date(UI.TicksToUnixDate(json[i].logindate));
				let timeoutDate = new Date(UI.TicksToUnixDate(json[i].logindate + json[i].ttl));
				
				const login = document.createElement("div");
				login.textContent = `${loginDate.toLocaleDateString(UI.regionalFormat, {})} ${loginDate.toLocaleTimeString(UI.regionalFormat, {})}`;
				attr.push(login);

				const timeout = document.createElement("div");
				timeout.textContent = `${timeoutDate.toLocaleDateString(UI.regionalFormat, {})} ${timeoutDate.toLocaleTimeString(UI.regionalFormat, {})}`;
				attr.push(timeout);

				for (let i = 0; i < attr.length; i++) {
					attr[i].style.width = i < attr.length-1 ? "25%" : "calc(25% - 32px)";
					attr[i].style.height = "30px";
					attr[i].style.lineHeight = "30px";
					attr[i].style.left = `${i*100/attr.length}%`;
					attr[i].style.top = "0px";

					if (i === 0) {
						attr[i].style.width = "calc(25% - 28px)";
						attr[i].style.paddingLeft = "28px";
						attr[i].style.backgroundImage = "url(/mono/hourglass.svg)";
						attr[i].style.backgroundSize = "24px 24px";
						attr[i].style.backgroundPosition = "0px center";
						attr[i].style.backgroundRepeat = "no-repeat";
					}
				}

				const kickButton = document.createElement("input");
				kickButton.type = "button";
				kickButton.style.unset = "all";
				kickButton.style.top = "2px";
				kickButton.style.right = "4px";
				kickButton.style.width = "24px";
				kickButton.style.minWidth = "24px";
				kickButton.style.height = "24px";
				kickButton.style.margin = "2px";
				kickButton.style.borderRadius = "12px";
				kickButton.style.backgroundColor = "transparent";
				kickButton.style.backgroundImage = "url(/mono/delete.svg)";
				kickButton.style.backgroundSize = "20px 20px";
				kickButton.style.backgroundPosition = "center";
				kickButton.style.backgroundRepeat = "no-repeat";

				kickButton.onclick = ()=> {
					this.ConfirmBox(`Are you sure you want to kick ${json[i].username}?`).addEventListener("click", async ()=>{
						try {
							const response = await fetch(`acl/kickuser?username=${encodeURIComponent(json[i].username)}&ip=${json[i].ip}&id=${json[i].id}`);
				
							if (response.status !== 200) LOADER.HttpErrorHandler(response.status);
							
							const kickJson = await response.json();
							if (kickJson.error) throw(kickJson.error);
			
							sessionsList.removeChild(element);
						}
						catch (ex) {
							this.ConfirmBox(ex, true, "mono/error.svg");
						}
					});
				};

				element.append(username, ip, login, timeout, kickButton);
			}
			
		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/error.svg", "mono/error.svg");
		}
	}
}
"use strict";
class Vault extends Tabs {
	constructor(args) {
		super();

		this.args = args ?? "";

		Window.AddCssDependencies("list.css");

		this.SetTitle("Vault");
		this.SetIcon("mono/vault.svg");

		this.credentials = [];
		this.sshKeys = [];
		this.orphans = [];
		this.selectedOrphans = new Set();
		this.duplicates = [];
		this.selectedDuplicates = new Set();

		this.tabsPanel.style.padding = "20px";

		this.credentialsTab = this.AddTab("Credentials", "mono/lock.svg");
		this.sshKeysTab     = this.AddTab("SSH keys", "mono/key.svg");
		this.maintenanceTab = this.AddTab("Maintenance", "mono/wrench.svg");

		this.credentialsTab.onclick = ()=> this.ShowCredentials();
		this.sshKeysTab.onclick     = ()=> this.ShowSshKeys();
		this.maintenanceTab.onclick = ()=> this.ShowMaintenance();

		this.activeColumnsListBoxes = [];
		this.win.addEventListener("mouseup",   event=> this.activeColumnsListBoxes.forEach(o=> o.HandleMouseUp(event)));
		this.win.addEventListener("mousemove", event=> this.activeColumnsListBoxes.forEach(o=> o.HandleMouseMove(event)));

		switch (this.args) {
		case "sshkeys":
			this.sshKeysTab.className = "v-tab-selected";
			this.ShowSshKeys();
			break;

		case "maintenance":
			this.maintenanceTab.className = "v-tab-selected";
			this.ShowMaintenance();
			break;

		default:
			this.credentialsTab.className = "v-tab-selected";
			this.ShowCredentials();
			break;
		}
	}

	AfterResize() { //overrides
		super.AfterResize();
		this.activeColumnsListBoxes.forEach(o=> o.FinalizeColumns());
	}

	RenderStrength(strength, hasPassword) {
		const box = document.createElement("div");
		box.style.display = "flex";
		box.style.alignItems = "center";

		const bar = document.createElement("div");
		bar.style.display = "inline-block";
		bar.style.width = "40px";
		bar.style.height = "14px";
		bar.style.flexShrink = "0";
		bar.style.border = "1px solid rgb(64,64,64)";
		bar.style.borderRadius = "2px";
		box.appendChild(bar);

		const label = document.createElement("div");
		label.style.marginLeft = "8px";
		box.appendChild(label);

		if (hasPassword) {
			const [color, fill, comment] = PassGen.StrengthBar(strength);
			bar.style.boxShadow = `${color} ${Math.round(fill)}px 0 0 inset`;
			label.textContent = comment;
		}
		else {
			label.textContent = "—";
			label.style.color = "var(--clr-control)";
		}

		return box;
	}

	CreatePermissionsPanel(innerBox, gridColumn, gridRow, object, onModeChange) {
		const permissionsPanel = document.createElement("div");
		permissionsPanel.style.gridColumn = gridColumn;
		permissionsPanel.style.gridRow = gridRow;
		permissionsPanel.style.height = "100%";
		permissionsPanel.style.paddingLeft = "8px";
		permissionsPanel.style.marginLeft = "8px";
		permissionsPanel.style.borderLeft = "2px solid var(--clr-control)";
		permissionsPanel.style.display = "flex";
		permissionsPanel.style.flexDirection = "column";
		innerBox.appendChild(permissionsPanel);

		const PERMISSION_MODES = ["none", "whitelist", "blacklist"];
		const permissionModeBox = new FewBox(["Everyone", "Whitelist", "Blacklist"]);
		permissionModeBox.Select(Math.max(PERMISSION_MODES.indexOf(object?.permissionMode), 0));
		permissionModeBox.container.style.margin = "0";
		permissionModeBox.container.style.maxWidth = "none";
		permissionModeBox.container.inert = true;
		permissionModeBox.container.style.opacity = ".5";
		permissionsPanel.appendChild(permissionModeBox.container);

		const GetPermissionMode = ()=> PERMISSION_MODES[permissionModeBox.index] ?? "none";

		const permissionUsersContainer = document.createElement("div");
		permissionUsersContainer.style.position = "relative";
		permissionUsersContainer.style.flex = "1";
		permissionUsersContainer.style.marginTop = "8px";
		permissionUsersContainer.style.display = GetPermissionMode() === "none" ? "none" : "block";
		permissionsPanel.appendChild(permissionUsersContainer);

		let selectedUsers = new Set(object?.permissionList ?? []);
		let previousPermissionMode = GetPermissionMode();

		const permissionsListBox = new ListBox({firstColumnOffset: "48px"});
		permissionsListBox.SetupTitleBar();
		permissionsListBox.SetupBuiltInSort();
		permissionsListBox.list.style.border = "rgb(82,82,82) solid 2px";
		permissionsListBox.list.addEventListener("keydown", event=> permissionsListBox.Keydown(event));
		permissionUsersContainer.append(permissionsListBox.listTitleOuter, permissionsListBox.list);

		const RenderPermissionCheckbox = username=> {
			const box = document.createElement("div");
			box.style.left = "4px";
			box.style.height = "22px";

			const toggle = this.CreateToggle("", selectedUsers.has(username), box);
			toggle.label.style.transform = "translateY(-14px)";

			toggle.checkbox.onchange = ()=> {
				if (toggle.checkbox.checked) {
					selectedUsers.add(username);
				}
				else {
					selectedUsers.delete(username);
				}
			};

			return box;
		};

		permissionsListBox.inflate = (element, entry, type)=> {
			element.appendChild(RenderPermissionCheckbox(entry.username));
			permissionsListBox.InflateElement(element, entry, type);
		};

		permissionsListBox.SetupColumns([
			{label:"Username", value:d=> d.username}
		]);

		permissionModeBox.container.onchange = ()=> {
			const newMode = GetPermissionMode();

			const isSwitchBetweenLists = (previousPermissionMode === "whitelist" && newMode === "blacklist")
				|| (previousPermissionMode === "blacklist" && newMode === "whitelist");

			if (isSwitchBetweenLists) {
				const inverted = new Set();
				for (const user of permissionsListBox.items) {
					if (!selectedUsers.has(user.username)) inverted.add(user.username);
				}
				selectedUsers = inverted;

				for (const checkbox of permissionsListBox.list.querySelectorAll('input[type="checkbox"]')) {
					checkbox.checked = !checkbox.checked;
				}
			}

			previousPermissionMode = newMode;
			permissionUsersContainer.style.display = newMode === "none" ? "none" : "block";

			onModeChange?.(newMode);
		};

		(async ()=> {
			try {
				const response = await fetch("vault/users");
				if (response.status !== 200) return;

				const json = await response.json();
				if (json.error) return;

				permissionsListBox.SetItems(json);
			}
			catch (ex) {}
			finally {
				permissionModeBox.container.inert = false;
				permissionModeBox.container.style.opacity = "";
			}
		})();

		onModeChange?.(GetPermissionMode());

		return {
			getMode: GetPermissionMode,
			getList: ()=> [...selectedUsers]
		};
	}

	FindUsages(guid) {
		const devices = [];
		for (const file in LOADER.devices.data) {
			const entry = LOADER.devices.data[file];
			for (const key in entry) {
				if (!key.toLowerCase().includes("credentials")) continue;
				const value = entry[key].v;
				if (!value) continue;
				if (value.split(";").map(o=> o.trim()).includes(guid)) {
					devices.push({file, entry});
					break;
				}
			}
		}

		const users = [];
		for (const file in LOADER.users.data) {
			const entry = LOADER.users.data[file];
			for (const key in entry) {
				if (!key.toLowerCase().includes("credentials")) continue;
				const value = entry[key].v;
				if (!value) continue;
				if (value.split(";").map(o=> o.trim()).includes(guid)) {
					users.push({file, entry});
					break;
				}
			}
		}

		return {devices, users};
	}

	ShowUsage(guid, dialog, usageButton) {
		const {okButton, cancelButton, innerBox} = dialog;

		const dialogBox = innerBox.parentElement;
		dialogBox.style.transition = ".4s";
		dialogBox.style.maxHeight = "calc(100% - 2px)";

		innerBox.textContent = "";
		innerBox.style.display = "block";
		innerBox.style.padding = "16px 32px";

		okButton.style.display = "none";
		cancelButton.value = "Close";
		usageButton.style.display = "none";

		const {devices, users} = this.FindUsages(guid);

		if (devices.length === 0 && users.length === 0) {
			const noneBox = document.createElement("div");
			noneBox.textContent = "Not used by any device or user.";
			innerBox.appendChild(noneBox);
			return;
		}

		const CreateSection = (label, items, ListWindow, resolveColumns, resolveIcon, onOpen)=> {
			const title = document.createElement("div");
			title.textContent = `${label} (${items.length})`;
			title.style.position = "relative";
			title.style.display = "inline-block";
			title.style.fontWeight = "600";
			title.style.margin = innerBox.childElementCount > 0 ? "16px 0 4px 0" : "0 0 4px 0";
			title.style.cursor = "pointer";
			title.style.textDecoration = "underline";
			title.style.padding = "2px 0 2px 32px";
			title.style.backgroundImage = {
				"Devices": "url(mono/devices.svg)",
				"Users": "url(mono/users.svg)"
			}[label];
			title.style.backgroundSize = "24px 24px";
			title.style.backgroundPosition = "0 50%";
			title.style.backgroundRepeat = "no-repeat";
			title.setAttribute("tip-below", `Show all in ${label.toLowerCase()}`);
			title.onclick = ()=> new ListWindow({find: guid});
			innerBox.appendChild(title);

			const container = document.createElement("div");
			container.style.position = "relative";
			container.style.height = "calc(100% - 28px)";
			innerBox.appendChild(container);

			const listBox = new ListBox({
				onDoubleClick: data=> onOpen(data.file)
			});
			listBox.SetupTitleBar();
			listBox.SetupBuiltInSort();
			listBox.list.style.border = "rgb(82,82,82) solid 2px";
			listBox.list.addEventListener("keydown", event=> listBox.Keydown(event));
			container.append(listBox.listTitleOuter, listBox.list);

			listBox.inflate = (element, entry, type)=> {
				const icon = document.createElement("div");
				icon.className = "list-element-icon";
				icon.style.backgroundImage = `url(${resolveIcon(entry)})`;
				element.appendChild(icon);
				listBox.InflateElement(element, entry, type);
			};

			listBox.SetupColumns(resolveColumns);
			listBox.SetItems(items);
		};

		if (devices.length > 0) {
			CreateSection("Devices", devices, DevicesList, [
				{label:"Name", value:d=> d.entry.name?.v || d.entry.hostname?.v || d.entry.ip?.v || d.file},
				{label:"Type", value:d=> d.entry.type?.v || ""}
			], d=> {
				const type = d.entry.type?.v.toLowerCase() || "";
				return LOADER.deviceIcons[type] ? LOADER.deviceIcons[type] : "mono/gear.svg";
			}, file=> LOADER.OpenDeviceByFile(file));
		}

		if (users.length > 0) {
			CreateSection("Users", users, UsersList, [
				{label:"Name",     value:d=> d.entry["display name"]?.v || d.entry.username?.v || d.file},
				{label:"Username", value:d=> d.entry.username?.v || ""}
			], d=> {
				const type = d.entry.type?.v.toLowerCase() || "";
				return LOADER.userIcons[type] ? LOADER.userIcons[type] : "mono/user.svg";
			}, file=> LOADER.OpenUserByFile(file));
		}
	}

	async ShowCredentials() {
		this.args = "credentials";
		this.tabsPanel.textContent = "";
		this.content.style.overflowY = "initial";
		this.tabsPanel.style.overflowY = "hidden";

		this.options = document.createElement("div");
		this.options.className = "rbac-options";
		this.options.style.position = "absolute";
		this.options.style.left = "20px";
		this.options.style.right = "8px";
		this.options.style.top = "8px";
		this.options.style.overflow = "hidden";
		this.options.style.whiteSpace = "nowrap";
		this.tabsPanel.appendChild(this.options);

		this.credentialsNewButton = document.createElement("input");
		this.credentialsNewButton.type = "button";
		this.credentialsNewButton.value = "New";
		this.credentialsNewButton.className = "with-icon";
		this.credentialsNewButton.style.backgroundImage = "url(mono/add.svg?light)";

		this.credentialsRemoveButton = document.createElement("input");
		this.credentialsRemoveButton.type = "button";
		this.credentialsRemoveButton.value = "Remove";
		this.credentialsRemoveButton.className = "with-icon";
		this.credentialsRemoveButton.style.backgroundImage = "url(mono/delete.svg?light)";

		this.credentialsFindInput = document.createElement("input");
		this.credentialsFindInput.type = "text";
		this.credentialsFindInput.placeholder = "Find...";
		this.credentialsFindInput.style.backgroundImage = "url(mono/search.svg)";
		this.credentialsFindInput.style.backgroundSize = "24px 24px";
		this.credentialsFindInput.style.backgroundPosition = "4px center";
		this.credentialsFindInput.style.backgroundRepeat = "no-repeat";
		this.credentialsFindInput.style.paddingLeft = "32px";
		this.credentialsFindInput.style.width = "200px";
		this.credentialsFindInput.style.marginLeft = "8px";

		this.options.append(this.credentialsNewButton, this.credentialsRemoveButton, this.credentialsFindInput);

		this.credentialsListBox = new ListBox({
			firstColumnOffset: "4px",
			onSelect: (id, element)=> {
				this.selectedCredential = element._data;
				this.selectedCredentialElement?.classList.remove("list-element-selected");
				this.selectedCredentialElement = element;
				element.classList.add("list-element-selected");
			},
			onDoubleClick: data=> this.CredentialDialog(data)
		});
		this.credentialsListBox.SetupTitleBar();
		this.credentialsListBox.SetupBuiltInSort();
		this.activeColumnsListBoxes = [this.credentialsListBox];

		this.credentialsListBox.inflate = (element, entry, type)=> {
			this.credentialsListBox.InflateElement(element, entry, type);

			const dragElement = document.createElement("div");
			dragElement.className = "list-element-drag";
			dragElement.draggable = true;
			dragElement.ondragstart = event=> Window.SetDragPayload(event, Window.DRAG_CREDENTIALS, entry.guid);
			element.appendChild(dragElement);
		};

		this.credentialsListBox.listTitleOuter.style.left = "20px";
		this.credentialsListBox.listTitleOuter.style.right = "20px";
		this.credentialsListBox.listTitleOuter.style.top = "50px";
		this.tabsPanel.appendChild(this.credentialsListBox.listTitleOuter);

		this.credentialsList = this.credentialsListBox.list;
		this.credentialsList.style.overflowY = "auto";
		this.credentialsList.style.left = "20px";
		this.credentialsList.style.right = "20px";
		this.credentialsList.style.top = "80px";
		this.credentialsList.style.bottom = "20px";
		this.credentialsList.style.border = "rgb(82,82,82) solid 2px";
		this.credentialsList.addEventListener("keydown", event=> this.credentialsListBox.Keydown(event));
		this.tabsPanel.appendChild(this.credentialsList);

		this.credentialsListBox.SetupColumns([
			{label:"Name",     value:d=> d.name},
			{label:"Username", value:d=> d.username},
			{label:"Strength", sortValue:d=> d.strength, render:d=> this.RenderStrength(d.strength, d.hasPassword)},
			{label:"Usage",    value:d=> d.uses}
		]);

		this.credentialsFindInput.oninput = ()=> this.FilterCredentials();

		this.credentialsFindInput.onkeydown = event=> {
			if (event.key === "Escape") {
				this.credentialsFindInput.value = "";
				this.FilterCredentials();
			}
		};

		this.credentialsNewButton.onclick = ()=> this.CredentialDialog(null);

		this.credentialsRemoveButton.onclick = ()=> {
			if (!this.selectedCredential) return;

			this.ConfirmBox(`Are you sure you want to remove "${this.selectedCredential.name || this.selectedCredential.username}"?`, false, "mono/delete.svg").addEventListener("click", async ()=>{
				try {
					const response = await fetch(`vault/credential/delete?guid=${this.selectedCredential.guid}`);
					if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

					const json = await response.json();
					if (json.error) throw json.error;

					this.selectedCredential = null;
					this.GetCredentials();
				}
				catch (ex) {
					this.ConfirmBox(ex, true, "mono/error.svg");
				}
			});
		};

		await this.GetCredentials();
		this.AfterResize();
	}

	async GetCredentials() {
		try {
			const response = await fetch("vault/credential/list");
			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const json = await response.json();
			if (json.error) throw json.error;
			this.credentials = json;
			this.FilterCredentials();
		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/error.svg");
		}
	}

	FilterCredentials() {
		const query = (this.credentialsFindInput?.value ?? "").trim().toLowerCase();

		if (query.length === 0) {
			this.credentialsListBox.SetItems(this.credentials);
			return;
		}

		const filtered = this.credentials.filter(d=>
			(d.name && d.name.toLowerCase().includes(query)) ||
			(d.username && d.username.toLowerCase().includes(query)) ||
			(d.guid && d.guid.toLowerCase().includes(query))
		);

		this.credentialsListBox.SetItems(filtered);
	}

	CredentialDialog(object=null) {
		const dialog = this.DialogBox("280px");
		if (dialog === null) return;

		const {okButton, innerBox, buttonBox} = dialog;

		okButton.value = "Save";

		innerBox.style.padding = "16px 32px";
		innerBox.style.display = "grid";
		innerBox.style.gridTemplateRows = "repeat(4, 38px)";
		innerBox.style.alignItems = "center";
		innerBox.style.transition = ".4s";

		const nameLabel = document.createElement("div");
		nameLabel.style.gridArea = "1 / 1";
		nameLabel.textContent = "Name:";
		const nameInput = document.createElement("input");
		nameInput.style.gridArea = "1 / 2 / 1 / 4";
		nameInput.style.maxWidth = "350px";
		nameInput.type = "text";
		innerBox.append(nameLabel, nameInput);

		const usernameLabel = document.createElement("div");
		usernameLabel.style.gridArea = "2 / 1";
		usernameLabel.textContent = "Username:";
		const usernameInput = document.createElement("input");
		usernameInput.style.gridArea = "2 / 2 / 2 / 4";
		usernameInput.style.maxWidth = "350px";
		usernameInput.type = "text";
		innerBox.append(usernameLabel, usernameInput);

		const passwordLabel = document.createElement("div");
		passwordLabel.style.gridArea = "3 / 1";
		passwordLabel.textContent = "Password:";
		const passwordInput = document.createElement("input");
		passwordInput.style.gridArea = "3 / 2";
		passwordInput.style.maxWidth = "350px";
		passwordInput.type = "password";
		passwordInput.placeholder = object ? "unchanged" : "";
		innerBox.append(passwordLabel, passwordInput);

		const showButton = document.createElement("input");
		showButton.type = "button";
		showButton.value = "Show";
		showButton.style.gridArea = "3 / 3";
		showButton.style.minWidth = "64px";
		showButton.disabled = !object;
		innerBox.appendChild(showButton);

		const guidLabel = document.createElement("div");
		guidLabel.style.gridArea = "4 / 1";
		guidLabel.textContent = "GUID:";
		const guidInput = document.createElement("input");
		guidInput.type = "text";
		guidInput.value = object ? object.guid : "";
		guidInput.style.all = "unset";
		guidInput.style.padding = "0 8px";
		guidInput.style.gridArea = "4 / 2 / 4 / 4";
		innerBox.append(guidLabel, guidInput);

		const draggable = document.createElement("div");
		if (object) {
			draggable.draggable = true;
			draggable.className = "win-draggable-key";
			buttonBox.appendChild(draggable);

			draggable.ondragstart = event=> Window.SetDragPayload(event, Window.DRAG_CREDENTIALS, object.guid);
		}

		const permissions = this.CreatePermissionsPanel(innerBox, "4", "1 / 6", object, newMode=> {
			innerBox.style.gridTemplateColumns = newMode === "none"
				? "100px minmax(140px, 1fr) 72px minmax(160px, .8fr)"
				: "100px minmax(140px, 1fr) 72px minmax(200px, 1fr)";
		});

		showButton.onclick = async ()=> {
			if (showButton.value === "Show") {
				showButton.disabled = true;

				let statusCode = 0;
				try {
					const response = await fetch(`vault/credential/get?guid=${object.guid}`);
					statusCode = response.status;
					if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

					const json = await response.json();
					if (json.error) throw json.error;

					passwordInput.value = json.password;
				}
				catch (ex) {
					dialog.Close();
					setTimeout(()=> {
						const message = `${ex}\nstatus code: ${statusCode}`;
						this.ConfirmBox(message, true, "mono/error.svg");
					}, WIN.ANIME_DURATION);
				}
				finally {
					passwordInput.type = "text";
					showButton.value = "Hide";
					showButton.disabled = false;
				}
			}
			else {
				showButton.value = "Show";
				passwordInput.type = "password";
			}
		};

		if (object) {
			nameInput.value = object.name;
			usernameInput.value = object.username;
		}

		if (object && object.uses > 0) {
			const usageButton = document.createElement("input");
			usageButton.type = "button";
			usageButton.value = "Usage";
			usageButton.style.position = "absolute";
			usageButton.style.left = "8px";
			buttonBox.appendChild(usageButton);

			usageButton.onclick = ()=> {
				this.ShowUsage(object.guid, dialog, usageButton);
				draggable.style.display = "none";
			};
		}

		okButton.onclick = async ()=> {
			try {
				const payload = {
					guid: object ? object.guid : "00000000-0000-0000-0000-000000000000",
					name: nameInput.value,
					username: usernameInput.value,
					password: passwordInput.value,
					permissionMode: permissions.getMode(),
					permissionList: permissions.getList()
				};

				if (usernameInput.value.trim().length === 0 && passwordInput.value.trim().length === 0 && !object) {
					this.ConfirmBox("Enter a username, a password, or both.", true, "mono/warning.svg");
					return;
				}

				const response = await fetch("vault/credential/save", {
					method: "POST",
					body: JSON.stringify(payload)
				});

				if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

				const json = await response.json();
				if (json.error) throw json.error;

				dialog.Close();
				this.GetCredentials();
			}
			catch (ex) {
				this.ConfirmBox(ex, true, "mono/error.svg");
			}
		};

		setTimeout(()=> { nameInput.focus() }, 200);
	}

	ShowSshKeys() {
		this.args = "sshkeys";
		this.tabsPanel.textContent = "";
		this.content.style.overflowY = "initial";
		this.tabsPanel.style.overflowY = "hidden";

		this.options = document.createElement("div");
		this.options.className = "rbac-options";
		this.options.style.position = "absolute";
		this.options.style.left = "20px";
		this.options.style.right = "8px";
		this.options.style.top = "8px";
		this.options.style.overflow = "hidden";
		this.options.style.whiteSpace = "nowrap";
		this.tabsPanel.appendChild(this.options);

		this.sshKeysNewButton = document.createElement("input");
		this.sshKeysNewButton.type = "button";
		this.sshKeysNewButton.value = "New";
		this.sshKeysNewButton.className = "with-icon";
		this.sshKeysNewButton.style.backgroundImage = "url(mono/add.svg?light)";

		this.sshKeysRemoveButton = document.createElement("input");
		this.sshKeysRemoveButton.type = "button";
		this.sshKeysRemoveButton.value = "Remove";
		this.sshKeysRemoveButton.className = "with-icon";
		this.sshKeysRemoveButton.style.backgroundImage = "url(mono/delete.svg?light)";

		this.sshKeysFindInput = document.createElement("input");
		this.sshKeysFindInput.type = "text";
		this.sshKeysFindInput.placeholder = "Find...";
		this.sshKeysFindInput.style.backgroundImage = "url(mono/search.svg)";
		this.sshKeysFindInput.style.backgroundSize = "24px 24px";
		this.sshKeysFindInput.style.backgroundPosition = "4px center";
		this.sshKeysFindInput.style.backgroundRepeat = "no-repeat";
		this.sshKeysFindInput.style.paddingLeft = "32px";
		this.sshKeysFindInput.style.width = "200px";
		this.sshKeysFindInput.style.marginLeft = "8px";

		this.options.append(this.sshKeysNewButton, this.sshKeysRemoveButton, this.sshKeysFindInput);

		this.sshKeysListBox = new ListBox({
			firstColumnOffset: "4px",
			onSelect: (id, element)=> {
				this.selectedSshKey = element._data;
				this.selectedSshKeyElement?.classList.remove("list-element-selected");
				this.selectedSshKeyElement = element;
				element.classList.add("list-element-selected");
			},
			onDoubleClick: data=> this.SshKeyDialog(data)
		});
		this.sshKeysListBox.SetupTitleBar();
		this.sshKeysListBox.SetupBuiltInSort();
		this.activeColumnsListBoxes = [this.sshKeysListBox];

		this.sshKeysListBox.inflate = (element, entry, type)=> {
			this.sshKeysListBox.InflateElement(element, entry, type);

			const dragElement = document.createElement("div");
			dragElement.className = "list-element-drag";
			dragElement.draggable = true;
			dragElement.ondragstart = event=> Window.SetDragPayload(event, Window.DRAG_SSH_KEY, entry.guid);
			element.appendChild(dragElement);
		};

		this.sshKeysListBox.listTitleOuter.style.left = "20px";
		this.sshKeysListBox.listTitleOuter.style.right = "20px";
		this.sshKeysListBox.listTitleOuter.style.top = "50px";
		this.tabsPanel.appendChild(this.sshKeysListBox.listTitleOuter);

		this.sshKeysList = this.sshKeysListBox.list;
		this.sshKeysList.style.overflowY = "auto";
		this.sshKeysList.style.left = "20px";
		this.sshKeysList.style.right = "20px";
		this.sshKeysList.style.top = "80px";
		this.sshKeysList.style.bottom = "20px";
		this.sshKeysList.style.border = "rgb(82,82,82) solid 2px";
		this.sshKeysList.addEventListener("keydown", event=> this.sshKeysListBox.Keydown(event));
		this.tabsPanel.appendChild(this.sshKeysList);

		this.sshKeysListBox.SetupColumns([
			{label:"Name",       value:d=> d.name},
			{label:"Username",   value:d=> d.username},
			{label:"Passphrase", value:d=> d.hasPassphrase ? "Yes" : "No"},
			{label:"Usage",      value:d=> d.uses}
		]);

		this.sshKeysFindInput.oninput = ()=> this.FilterSshKeys();

		this.sshKeysFindInput.onkeydown = event=> {
			if (event.key === "Escape") {
				this.sshKeysFindInput.value = "";
				this.FilterSshKeys();
			}
		};

		this.sshKeysNewButton.onclick = ()=> this.SshKeyDialog(null);

		this.sshKeysRemoveButton.onclick = ()=> {
			if (!this.selectedSshKey) return;

			this.ConfirmBox(`Are you sure you want to remove "${this.selectedSshKey.name || this.selectedSshKey.username}"?`, false, "mono/delete.svg").addEventListener("click", async ()=>{
				try {
					const response = await fetch(`vault/sshkey/delete?guid=${this.selectedSshKey.guid}`);
					if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

					const json = await response.json();
					if (json.error) throw json.error;

					this.selectedSshKey = null;
					this.GetSshKeys();
				}
				catch (ex) {
					this.ConfirmBox(ex, true, "mono/error.svg");
				}
			});
		};

		this.GetSshKeys();
		this.AfterResize();
	}

	async GetSshKeys() {
		try {
			const response = await fetch("vault/sshkey/list");
			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const json = await response.json();
			if (json.error) throw json.error;

			this.sshKeys = json;
			this.FilterSshKeys();
		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/error.svg");
		}
	}

	FilterSshKeys() {
		const query = (this.sshKeysFindInput?.value ?? "").trim().toLowerCase();

		if (query.length === 0) {
			this.sshKeysListBox.SetItems(this.sshKeys);
			return;
		}

		const filtered = this.sshKeys.filter(d=>
			(d.name && d.name.toLowerCase().includes(query)) ||
			(d.username && d.username.toLowerCase().includes(query)) ||
			(d.guid && d.guid.toLowerCase().includes(query))
		);

		this.sshKeysListBox.SetItems(filtered);
	}

	SshKeyDialog(object=null) {
		const dialog = this.DialogBox("340px");
		if (dialog === null) return;

		const {okButton, innerBox, buttonBox} = dialog;

		okButton.value = "Save";

		innerBox.style.padding = "16px 32px";
		innerBox.style.display = "grid";
		innerBox.style.gridTemplateRows = "repeat(2, 38px) 64px 38px 64px";
		innerBox.style.alignItems = "center";
		innerBox.style.transition = ".4s";

		const nameLabel = document.createElement("div");
		nameLabel.style.gridArea = "1 / 1";
		nameLabel.textContent = "Name:";
		const nameInput = document.createElement("input");
		nameInput.style.gridArea = "1 / 2 / 1 / 4";
		nameInput.type = "text";
		innerBox.append(nameLabel, nameInput);

		const usernameLabel = document.createElement("div");
		usernameLabel.style.gridArea = "2 / 1";
		usernameLabel.textContent = "Username:";
		const usernameInput = document.createElement("input");
		usernameInput.style.gridArea = "2 / 2 / 2 / 4";
		usernameInput.type = "text";
		innerBox.append(usernameLabel, usernameInput);

		const keyLabel = document.createElement("div");
		keyLabel.style.gridArea = "3 / 1";
		keyLabel.style.alignSelf = "start";
		keyLabel.style.marginTop = "8px";
		keyLabel.textContent = "Private key:";
		const keyInput = document.createElement("textarea");
		keyInput.style.gridArea = "3 / 2 / 3 / 4";
		keyInput.style.resize = "none";
		keyInput.style.fontFamily = "monospace";
		keyInput.placeholder = object ? "unchanged" : "-----BEGIN PRIVATE KEY-----";
		innerBox.append(keyLabel, keyInput);

		const passphraseLabel = document.createElement("div");
		passphraseLabel.style.gridArea = "4 / 1";
		passphraseLabel.textContent = "Passphrase:";
		const passphraseInput = document.createElement("input");
		passphraseInput.style.gridArea = "4 / 2";
		passphraseInput.type = "password";
		passphraseInput.placeholder = object ? "unchanged" : "optional";
		innerBox.append(passphraseLabel, passphraseInput);

		const showButton = document.createElement("input");
		showButton.type = "button";
		showButton.value = "Show";
		showButton.style.gridArea = "4 / 3";
		showButton.style.minWidth = "64px";
		showButton.disabled = !object;
		innerBox.appendChild(showButton);

		const publicKeyLabel = document.createElement("div");
		publicKeyLabel.style.gridArea = "5 / 1";
		publicKeyLabel.style.alignSelf = "start";
		publicKeyLabel.style.marginTop = "8px";
		publicKeyLabel.textContent = "Public key:";
		const publicKeyInput = document.createElement("textarea");
		publicKeyInput.style.gridArea = "5 / 2 / 5 / 4";
		publicKeyInput.style.resize = "none";
		publicKeyInput.style.fontFamily = "monospace";
		publicKeyInput.placeholder = "optional";
		innerBox.append(publicKeyLabel, publicKeyInput);

		const permissions = this.CreatePermissionsPanel(innerBox, "4", "1 / 6", object, newMode=> {
			innerBox.style.gridTemplateColumns = newMode === "none"
				? "100px minmax(140px, 1fr) 72px minmax(160px, .8fr)"
				: "100px minmax(140px, 1fr) 72px minmax(200px, 1fr)";
		});

		const draggable = document.createElement("div");
		if (object) {
			draggable.draggable = true;
			draggable.className = "win-draggable-key";
			buttonBox.appendChild(draggable);

			draggable.ondragstart = event=> Window.SetDragPayload(event, Window.DRAG_SSH_KEY, object.guid);
		}

		showButton.onclick = async ()=> {
			if (showButton.value === "Show") {
				showButton.disabled = true;

				try {
					const response = await fetch(`vault/sshkey/get?guid=${object.guid}`);
					if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

					const json = await response.json();
					if (json.error) throw json.error;

					keyInput.value = json.privateKey;
					passphraseInput.value = json.passphrase;
				}
				catch (ex) {
					this.ConfirmBox(ex, true, "mono/error.svg");
				}
				finally {
					passphraseInput.type = "text";
					showButton.value = "Hide";
					showButton.disabled = false;
				}
			}
			else {
				showButton.value = "Show";
				passphraseInput.type = "password";
			}
		};

		if (object) {
			nameInput.value = object.name;
			usernameInput.value = object.username;
			publicKeyInput.value = object.publicKey;
		}

		okButton.onclick = async ()=> {
			try {
				if (keyInput.value.trim().length === 0 && !object) {
					this.ConfirmBox("A private key is required.", true, "mono/warning.svg");
					return;
				}

				const payload = {
					guid: object ? object.guid : "00000000-0000-0000-0000-000000000000",
					name: nameInput.value,
					username: usernameInput.value,
					privateKey: keyInput.value,
					passphrase: passphraseInput.value,
					publicKey: publicKeyInput.value,
					permissionMode: permissions.getMode(),
					permissionList: permissions.getList()
				};

				const response = await fetch("vault/sshkey/save", {
					method: "POST",
					body: JSON.stringify(payload)
				});

				if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

				const json = await response.json();
				if (json.error) throw json.error;

				dialog.Close();
				this.GetSshKeys();
			}
			catch (ex) {
				this.ConfirmBox(ex, true, "mono/error.svg");
			}
		};

		if (object && object.uses > 0) {
			const usageButton = document.createElement("input");
			usageButton.type = "button";
			usageButton.value = "Usage";
			usageButton.style.position = "absolute";
			usageButton.style.left = "8px";
			buttonBox.appendChild(usageButton);

			usageButton.onclick = ()=> {
				this.ShowUsage(object.guid, dialog, usageButton);
				draggable.style.display = "none";
			};
		}

		setTimeout(()=> nameInput.focus(), 200);
	}

	ShowMaintenance() {
		this.args = "maintenance";
		this.tabsPanel.textContent = "";
		this.content.style.overflowY = "auto";
		this.tabsPanel.style.overflowY = "auto";

		//--- scan and consolidate ---

		const consolidateSection = document.createElement("div");
		this.tabsPanel.appendChild(consolidateSection);

		const consolidateTitle = document.createElement("div");
		consolidateTitle.textContent = "Scan and consolidate";
		consolidateTitle.style.fontWeight = "600";
		consolidateTitle.style.marginBottom = "4px";
		consolidateSection.appendChild(consolidateTitle);

		const intro = document.createElement("div");
		intro.textContent = "Scan devices and users for legacy \"password\" attributes, pair each with its matching username, and move them into the Vault as credentials. Identical username/password pairs are consolidated into a single shared credential. The original attributes are deleted once migrated.";
		intro.style.maxWidth = "800px";
		consolidateSection.appendChild(intro);

		const scanButton = document.createElement("input");
		scanButton.type = "button";
		scanButton.value = "Consolidate";
		scanButton.className = "with-icon";
		scanButton.style.backgroundImage = "url(mono/consolidate.svg?light)";
		scanButton.style.margin = "8px 0 0 0";
		consolidateSection.appendChild(scanButton);

		const result = document.createElement("span");
		result.style.marginLeft = "12px";
		consolidateSection.appendChild(result);

		scanButton.onclick = ()=> {
			this.ConfirmBox("This will create Vault entries for every legacy credential found, and delete the original plaintext attributes from the device/user entries. Continue?", false, "mono/consolidate.svg").addEventListener("click", async ()=>{
				scanButton.disabled = true;
				result.textContent = "Scanning...";

				try {
					const response = await fetch("vault/scan");
					if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

					const json = await response.json();
					if (json.error) throw json.error;

					result.textContent = `Created ${json.created} new credential(s), reused ${json.reused} existing one(s), skipped ${json.skipped} already-migrated attribute(s).`;
				}
				catch (ex) {
					result.textContent = "";
					this.ConfirmBox(ex, true, "mono/error.svg");
				}
				finally {
					scanButton.disabled = false;
				}
			});
		};

		const divider = document.createElement("hr");
		divider.style.margin = "20px 0";
		this.tabsPanel.appendChild(divider);

		//--- deduplication ---

		const duplicatesTitle = document.createElement("div");
		duplicatesTitle.textContent = "Deduplication";
		duplicatesTitle.style.fontWeight = "600";
		duplicatesTitle.style.marginBottom = "4px";
		this.tabsPanel.appendChild(duplicatesTitle);

		const duplicatesIntro = document.createElement("div");
		duplicatesIntro.textContent = "Credentials that share the same username and password, and SSH keys that share the same username, private key and passphrase. Each group is merged into the kept entry: every device and user referencing a duplicate is pointed to it, then the duplicates are deleted. The kept entry's name and permissions remain, double-click a group to choose a different one. Groups with different permissions are not selected by default.";
		duplicatesIntro.style.maxWidth = "800px";
		this.tabsPanel.appendChild(duplicatesIntro);

		const duplicatesOptions = document.createElement("div");
		duplicatesOptions.className = "rbac-options";
		duplicatesOptions.style.margin = "8px 0";
		this.tabsPanel.appendChild(duplicatesOptions);

		const duplicateSelectNoneButton = document.createElement("input");
		duplicateSelectNoneButton.type = "button";
		duplicateSelectNoneButton.value = "Select none";
		duplicateSelectNoneButton.classList = "with-icon";
		duplicateSelectNoneButton.style.backgroundImage = "url(mono/selectnone.svg?light)";

		const duplicateSelectAllButton = document.createElement("input");
		duplicateSelectAllButton.type = "button";
		duplicateSelectAllButton.value = "Select all";
		duplicateSelectAllButton.classList = "with-icon";
		duplicateSelectAllButton.style.backgroundImage = "url(mono/selectall.svg?light)";

		duplicatesOptions.append(duplicateSelectNoneButton, duplicateSelectAllButton);

		const duplicatesListContainer = document.createElement("div");
		duplicatesListContainer.style.position = "relative";
		duplicatesListContainer.style.maxWidth = "720px";
		duplicatesListContainer.style.height = "240px";
		this.tabsPanel.appendChild(duplicatesListContainer);

		this.duplicatesListBox = new ListBox({
			firstColumnOffset: "48px",
			onDoubleClick: data=> this.ChooseDuplicateKeeper(data)
		});
		this.duplicatesListBox.SetupTitleBar();
		this.duplicatesListBox.SetupBuiltInSort();

		this.duplicatesList = this.duplicatesListBox.list;
		this.duplicatesList.style.overflowY = "auto";
		this.duplicatesList.style.border = "rgb(82,82,82) solid 2px";
		this.duplicatesList.addEventListener("keydown", event=> this.duplicatesListBox.Keydown(event));

		duplicatesListContainer.append(this.duplicatesListBox.listTitleOuter, this.duplicatesList);

		this.duplicatesListBox.inflate = (element, entry, type)=> {
			element.appendChild(this.RenderDuplicateCheckbox(entry));
			this.duplicatesListBox.InflateElement(element, entry, type);
		};

		const Keeper = group=> group.entries.find(o=> o.guid === group.keep);

		this.duplicatesListBox.SetupColumns([
			{label:"Type",        value:d=> d.type === "sshkey" ? "SSH key" : "Credential"},
			{label:"Keep",        value:d=> Keeper(d).name},
			{label:"Username",    value:d=> Keeper(d).username},
			{label:"Duplicates",  value:d=> d.entries.filter(o=> o.guid !== d.keep).map(o=> o.name).join(", ")},
			{label:"Usage",       sortValue:d=> d.entries.reduce((sum, o)=> sum + o.uses, 0), value:d=> d.entries.reduce((sum, o)=> sum + o.uses, 0)},
			{label:"Permissions", value:d=> d.permissionsDiffer ? "Differ" : "Same"}
		]);

		this.duplicatesMergeButton = document.createElement("input");
		this.duplicatesMergeButton.type = "button";
		this.duplicatesMergeButton.value = "Merge selected";
		this.duplicatesMergeButton.className = "with-icon";
		this.duplicatesMergeButton.style.backgroundImage = "url(mono/consolidate.svg?light)";
		this.duplicatesMergeButton.disabled = true;
		this.tabsPanel.appendChild(this.duplicatesMergeButton);

		this.duplicatesResult = document.createElement("span");
		this.duplicatesResult.style.marginLeft = "12px";
		this.tabsPanel.appendChild(this.duplicatesResult);

		duplicateSelectNoneButton.onclick = ()=> {
			this.selectedDuplicates.clear();

			for (const checkbox of this.duplicatesList.querySelectorAll('input[type="checkbox"]')) {
				checkbox.checked = false;
			}

			this.duplicatesMergeButton.disabled = true;
		};

		duplicateSelectAllButton.onclick = ()=> {
			this.selectedDuplicates = new Set(this.duplicates.map(d=> d.keep));

			for (const checkbox of this.duplicatesList.querySelectorAll('input[type="checkbox"]')) {
				checkbox.checked = true;
			}

			this.duplicatesMergeButton.disabled = this.selectedDuplicates.size === 0;
		};

		this.duplicatesMergeButton.onclick = ()=> this.MergeSelectedDuplicates();

		const divider2 = document.createElement("hr");
		divider2.style.margin = "20px 0";
		this.tabsPanel.appendChild(divider2);

		//--- orphaned entries ---

		const orphansTitle = document.createElement("div");
		orphansTitle.textContent = "Orphaned entries";
		orphansTitle.style.fontWeight = "600";
		orphansTitle.style.marginBottom = "4px";
		this.tabsPanel.appendChild(orphansTitle);

		const orphansIntro = document.createElement("div");
		orphansIntro.textContent = "Vault entries no longer referenced by any device or user. Select the ones you want to delete.";
		this.tabsPanel.appendChild(orphansIntro);

		this.orphansOptions = document.createElement("div");
		this.orphansOptions.className = "rbac-options";
		this.orphansOptions.style.margin = "8px 0";
		this.tabsPanel.appendChild(this.orphansOptions);

		const orphanSelectNoneButton = document.createElement("input");
		orphanSelectNoneButton.type = "button";
		orphanSelectNoneButton.value = "Select none";
		orphanSelectNoneButton.classList = "with-icon";
		orphanSelectNoneButton.style.backgroundImage = "url(mono/selectnone.svg?light)";

		const orphanSelectAllButton = document.createElement("input");
		orphanSelectAllButton.type = "button";
		orphanSelectAllButton.value = "Select all";
		orphanSelectAllButton.classList = "with-icon";
		orphanSelectAllButton.style.backgroundImage = "url(mono/selectall.svg?light)";

		this.orphansOptions.append(orphanSelectNoneButton, orphanSelectAllButton);

		const orphansListContainer = document.createElement("div");
		orphansListContainer.style.position = "relative";
		orphansListContainer.style.maxWidth = "720px";
		orphansListContainer.style.height = "360px";
		this.tabsPanel.appendChild(orphansListContainer);

		this.orphansListBox = new ListBox({firstColumnOffset: "48px"});
		this.orphansListBox.SetupTitleBar();
		this.orphansListBox.SetupBuiltInSort();
		this.activeColumnsListBoxes = [this.duplicatesListBox, this.orphansListBox];

		this.orphansList = this.orphansListBox.list;
		this.orphansList.style.overflowY = "auto";
		this.orphansList.style.border = "rgb(82,82,82) solid 2px";
		this.orphansList.addEventListener("keydown", event=> this.orphansListBox.Keydown(event));

		orphansListContainer.append(this.orphansListBox.listTitleOuter, this.orphansList);

		this.orphansListBox.inflate = (element, entry, type)=> {
			element.appendChild(this.RenderOrphanCheckbox(entry));
			this.orphansListBox.InflateElement(element, entry, type);
		};

		this.orphansListBox.SetupColumns([
			{label:"Type", value:d=> d.type === "sshkey" ? "SSH key" : "Credential"},
			{label:"Name", value:d=> d.name},
			{label:"Username", value:d=> d.username}
		]);

		this.orphansRemoveButton = document.createElement("input");
		this.orphansRemoveButton.type = "button";
		this.orphansRemoveButton.value = "Remove selected";
		this.orphansRemoveButton.className = "with-icon";
		this.orphansRemoveButton.style.backgroundImage = "url(mono/delete.svg?light)";
		this.orphansRemoveButton.disabled = true;
		this.tabsPanel.appendChild(this.orphansRemoveButton);

		orphanSelectNoneButton.onclick = ()=> {
			this.selectedOrphans.clear();

			for (const checkbox of this.orphansList.querySelectorAll('input[type="checkbox"]')) {
				checkbox.checked = false;
			}

			this.orphansRemoveButton.disabled = true;
		};

		orphanSelectAllButton.onclick = ()=> {
			this.selectedOrphans = new Set(this.orphans.map(d=> `${d.type}:${d.guid}`));

			for (const checkbox of this.orphansList.querySelectorAll('input[type="checkbox"]')) {
				checkbox.checked = true;
			}

			this.orphansRemoveButton.disabled = this.selectedOrphans.size === 0;
		};

		this.orphansRemoveButton.onclick = ()=> this.RemoveSelectedOrphans();

		this.GetDuplicates();
		this.GetOrphans();
		this.AfterResize();
	}

	RenderDuplicateCheckbox(data) {
		const box = document.createElement("div");
		box.style.left = "4px";
		box.style.height = "22px";

		const toggle = this.CreateToggle("", this.selectedDuplicates.has(data.keep), box);
		toggle.label.style.transform = "translateY(-14px)";

		toggle.checkbox.onchange = ()=> {
			if (toggle.checkbox.checked) {
				this.selectedDuplicates.add(data.keep);
			}
			else {
				this.selectedDuplicates.delete(data.keep);
			}

			this.duplicatesMergeButton.disabled = this.selectedDuplicates.size === 0;
		};

		return box;
	}

	async GetDuplicates() {
		try {
			const response = await fetch("vault/duplicates");
			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const json = await response.json();
			if (json.error) throw json.error;

			this.duplicates = json;

			this.selectedDuplicates = new Set(this.duplicates.filter(d=> !d.permissionsDiffer).map(d=> d.keep));
			this.duplicatesListBox.SetItems(this.duplicates);
			this.duplicatesMergeButton.disabled = this.selectedDuplicates.size === 0;
		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/error.svg");
		}
	}

	ChooseDuplicateKeeper(group) {
		const dialog = this.DialogBox("160px");
		if (dialog === null) return;

		const {okButton, innerBox} = dialog;

		innerBox.style.padding = "20px 32px";
		innerBox.style.overflow = "hidden";
		innerBox.parentElement.style.maxWidth = "480px";

		const label = document.createElement("div");
		label.textContent = "Keep this entry, the others are merged into it:";
		label.style.marginBottom = "12px";
		innerBox.appendChild(label);

		const select = document.createElement("select");
		select.style.width = "100%";
		for (const entry of group.entries) {
			select.append(new Option(`${entry.name || entry.username || entry.guid} (usage: ${entry.uses})`, entry.guid));
		}
		select.value = group.keep;
		innerBox.appendChild(select);

		okButton.onclick = ()=> {
			const wasSelected = this.selectedDuplicates.delete(group.keep);
			group.keep = select.value;
			if (wasSelected) this.selectedDuplicates.add(group.keep);

			this.duplicatesListBox.SetItems(this.duplicates);
			dialog.Close();
		};

		setTimeout(()=> select.focus(), 200);
	}

	MergeSelectedDuplicates() {
		const groups = this.duplicates.filter(d=> this.selectedDuplicates.has(d.keep));
		if (groups.length === 0) return;

		const count = groups.reduce((sum, d)=> sum + d.entries.length - 1, 0);
		const message = `Merge ${count} duplicate${count === 1 ? "" : "s"} into ${groups.length} entr${groups.length === 1 ? "y" : "ies"}? Devices and users that reference a duplicate will be updated, and the duplicates will be deleted.`;

		this.ConfirmBox(message, false, "mono/consolidate.svg").addEventListener("click", async ()=>{
			this.duplicatesMergeButton.disabled = true;
			this.duplicatesResult.textContent = "Merging...";

			const payload = groups.map(d=> ({
				keep  : d.keep,
				remove: d.entries.filter(o=> o.guid !== d.keep).map(o=> o.guid)
			}));

			try {
				const response = await fetch("vault/deduplicate", {
					method: "POST",
					body: JSON.stringify(payload)
				});
				if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

				const json = await response.json();
				if (json.error) throw json.error;

				this.duplicatesResult.textContent = `Merged ${json.merged} group(s), removed ${json.removed} duplicate(s), updated ${json.updated} device/user entr${json.updated === 1 ? "y" : "ies"}.`;
			}
			catch (ex) {
				this.duplicatesResult.textContent = "";
				this.ConfirmBox(ex, true, "mono/error.svg");
			}

			this.GetDuplicates();
			this.GetOrphans();
		});
	}

	RenderOrphanCheckbox(data) {
		const box = document.createElement("div");
		box.style.left = "4px";
		box.style.height = "22px";

		const key = `${data.type}:${data.guid}`;
		const toggle = this.CreateToggle("", this.selectedOrphans.has(key), box);
		toggle.label.style.transform = "translateY(-14px)";

		toggle.checkbox.onchange = ()=> {
			if (toggle.checkbox.checked) {
				this.selectedOrphans.add(key);
			}
			else {
				this.selectedOrphans.delete(key);
			}

			this.orphansRemoveButton.disabled = this.selectedOrphans.size === 0;
		};

		return box;
	}

	async GetOrphans() {
		try {
			const response = await fetch("vault/orphans");
			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const json = await response.json();
			if (json.error) throw json.error;

			this.orphans = json;
			this.selectedOrphans = new Set(this.orphans.map(d=> `${d.type}:${d.guid}`));
			this.orphansListBox.SetItems(this.orphans);
			this.orphansRemoveButton.disabled = this.selectedOrphans.size === 0;
		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/error.svg");
		}
	}

	RemoveSelectedOrphans() {
		if (this.selectedOrphans.size === 0) return;

		const count = this.selectedOrphans.size;
		this.ConfirmBox(`Are you sure you want to remove ${count} orphaned entry ${count === 1 ? "y" : "ies"}?`, false, "mono/delete.svg").addEventListener("click", async ()=>{
			this.orphansRemoveButton.disabled = true;

			for (const key of this.selectedOrphans) {
				const [type, guid] = key.split(":");
				const endpoint = type === "sshkey" ? "vault/sshkey/delete" : "vault/credential/delete";

				try {
					const response = await fetch(`${endpoint}?guid=${guid}`);
					if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

					const json = await response.json();
					if (json.error) throw json.error;
				}
				catch (ex) {
					this.ConfirmBox(ex, true, "mono/error.svg");
				}
			}

			this.selectedOrphans.clear();
			this.GetOrphans();
		});
	}
}

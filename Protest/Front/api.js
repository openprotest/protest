class Api extends List {
	constructor(args) {
		super();
		this.args = args ?? {filter:"", find:"", sort:"", select:null};

		this.AddCssDependencies("list.css");

		this.SetTitle("API links");
		this.SetIcon("mono/carabiner.svg");

		this.InitializeComponents();
		this.UpdateAuthorization();

		this.LoadLinks();
	}

	UpdateAuthorization() { //overrides
		this.canWrite = KEEP.authorization.includes("*") || KEEP.authorization.includes("api links:write");
		this.createButton.disabled = !this.canWrite;
		this.deleteButton.disabled = !this.canWrite;
		super.UpdateAuthorization();
	}

	InitializeComponents() {
		const columns = ["name", "key"];
		this.SetupColumns(columns);
		this.columnsOptions.style.display = "none";

		this.SetupToolbar();
		this.createButton = this.AddToolbarButton("Create API link", "mono/add.svg?light");
		this.deleteButton = this.AddToolbarButton("Delete", "mono/delete.svg?light");

		this.createButton.onclick = ()=> this.EditDialog();
		this.deleteButton.onclick = ()=> this.Delete();
	}

	ListLinks() {
		this.list.textContent = "";

		for (let key in this.link.data) {
			const element = document.createElement("div");
			element.id = key;
			element.className = "list-element";
			this.list.appendChild(element);

			this.InflateElement(element, this.link.data[key]);

			if (this.args.select && this.args.select === key) {
				this.selected = element;
				element.style.backgroundColor = "var(--clr-select)";
			}
		}
	}

	async LoadLinks() {
		try {
			const response = await fetch("api/list");

			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const json = await response.json();
			if (json.error) throw(json.error);

			this.link = json;
			this.list.textContent = "";
		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/error.svg");
		}

		this.ListLinks();
	}

	async SaveLinks() {
		const array = [];
		for (let key in this.link.data) {
			array.push({
				key:         this.link.data[key].key.v,
				name:        this.link.data[key].name.v,
				readonly:    true,
				permissions: this.link.data[key].permissions.v,
			});
		}
		
		try {
			const response = await fetch("api/save", {
				method: "POST",
				body: JSON.stringify(array)
			});

			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const json = await response.json();
			if (json.error) throw(json.error);
		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/error.svg");
		}
	}

	GenerateKey() {
		const array = new Uint8Array(48);
		crypto.getRandomValues(array);
		return Array.from(array, byte => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
	}

	EditDialog(object=null) {
		const dialog = this.DialogBox("360px");
		if (dialog === null) return;

		const {okButton, innerBox} = dialog;

		okButton.value = object === null ? "Create" : "Save";

		innerBox.parentElement.style.maxWidth = "680px";

		innerBox.style.padding = "16px 32px";
		innerBox.style.display = "grid";
		innerBox.style.gridTemplateColumns = "auto 160px 275px 44px 72px auto";
		innerBox.style.gridTemplateRows = "repeat(3, 38px) 12px repeat(4, 32px)";
		innerBox.style.alignItems = "center";

		let counter = 0;
		const AddParameter = (name, tag, type, properties) => {
			counter++;

			const label = document.createElement("div");
			label.style.gridArea = `${counter} / 2`;
			label.textContent = name;

			let input;
			if (tag === "input" && type === "toggle") {
				const box = document.createElement("div");
				box.style.gridArea = `${counter} / 3 / ${counter+1} / 4`;

				const toggle = this.CreateToggle(".", false, box);
				toggle.label.style.minWidth = "0px";
				toggle.label.style.color = "transparent";
				input = toggle.checkbox;

				innerBox.append(label, box);
			}
			else {
				input = document.createElement(tag);
				input.style.gridArea = `${counter} / 3`;
				if (type) { input.type = type; }

				innerBox.append(label, input);
			}

			for (let param in properties) {
				input[param] = properties[param];
			}

			return [label, input];
		};

		const [nameLabel, nameInput] = AddParameter("Name:", "input", "text");

		const [keyLabel, keyInput] = AddParameter("API key:", "input", "text");
		keyInput.setAttribute("readonly", "true");

		const copyButton = document.createElement("button");
		copyButton.style.gridArea = "2 / 4";
		copyButton.style.minWidth = copyButton.style.width = "36px";
		copyButton.style.height = "34px";
		copyButton.style.backgroundImage = "url(mono/copy.svg?light)";
		copyButton.style.backgroundSize = "28px";
		copyButton.style.backgroundPosition = "50% 50%";
		copyButton.style.backgroundRepeat = "no-repeat";
		innerBox.append(copyButton);

		const renewButton = document.createElement("button");
		renewButton.textContent = "Renew";
		renewButton.style.minWidth = renewButton.style.width = "64px";
		renewButton.style.gridArea = " 2 / 5";
		innerBox.append(renewButton);

		const [readOnlyLabel, readOnlyInput] = AddParameter("Read-only:", "input", "toggle");
		readOnlyInput.checked = true;
		readOnlyInput.disabled = true;

		counter++;

		const labelPermissions = document.createElement("div");
		labelPermissions.textContent = "Permissions:";
		labelPermissions.style.gridArea = `${++counter} / 2`;
		innerBox.append(labelPermissions);

		const [usersLabel, usersInput] = AddParameter("Users", "input", "toggle");
		usersLabel.style.paddingLeft = "24px";
		usersLabel.style.backgroundImage = "url(mono/users.svg)";
		usersLabel.style.backgroundSize = "20px";
		usersLabel.style.backgroundRepeat = "no-repeat";

		const [devicesLabel, devicesInput] = AddParameter("Devices", "input", "toggle");
		devicesLabel.style.paddingLeft = "24px";
		devicesLabel.style.backgroundImage = "url(mono/devices.svg)";
		devicesLabel.style.backgroundSize = "20px";
		devicesLabel.style.backgroundRepeat = "no-repeat";

		const [lifelineLabel, lifelineInput] = AddParameter("Lifeline", "input", "toggle");
		lifelineLabel.style.paddingLeft = "24px";
		lifelineLabel.style.backgroundImage = "url(mono/lifeline.svg)";
		lifelineLabel.style.backgroundSize = "20px";
		lifelineLabel.style.backgroundRepeat = "no-repeat";
		lifelineInput.disabled = true;

		setTimeout(()=>nameInput.focus(), 200);

		copyButton.onclick = ()=> {
			try {
				navigator.clipboard.writeText(keyInput.value);

				if (copyButton.style.animation === "") {
					copyButton.style.animation = "bg-roll-up .6s linear";
					setTimeout(()=>copyButton.style.animation = "", 600);
				}
			}
			catch (ex) {
				this.ConfirmBox(ex, true, "mono/error.svg");
			}
		};

		renewButton.onclick = ()=> {
			keyInput.value = this.GenerateKey();
		};

		if (object === null) {
			devicesInput.checked = true;
			usersInput.checked = true;
			renewButton.onclick();
		}
		else {
			nameInput.value = object.name.v;
			keyInput.value = object.key.v;

			const permissions = object.permissions.v & 0xff;
			usersInput.checked = permissions & 0x01;
			devicesInput.checked = permissions & 0x02;
			lifelineInput.checked = permissions & 0x04;
		}

		okButton.onclick = async ()=> {
			let requiredFieldMissing = false;
			let requiredFields = [nameInput];

			for (let i=0; i<requiredFields.length; i++) {
				if (requiredFields[i].value.length === 0) {
					if (!requiredFieldMissing) requiredFields[i].focus();
					requiredFields[i].required = true;
					requiredFieldMissing = true;
					requiredFields[i].style.animationDuration = `${(i+1)*.1}s`;
				}
				else {
					requiredFields[i].required = false;
				}
			}

			if (requiredFieldMissing) return;

			let permissions = 0;
			if (usersInput.checked)    permissions |= 0x01;
			if (devicesInput.checked)  permissions |= 0x02;
			if (lifelineInput.checked) permissions |= 0x04;

			if (object === null) {
				const newKey = this.GenerateKey();
				this.link.data[newKey] ={
					key: {v:newKey},
					name: {v:nameInput.value},
					readonly: {v:true},
					permissions: {v:permissions}
				};
			}
			else {
				const lastKey = object.key.v;

				delete this.link.data[lastKey];

				if (this.selected) {
					this.list.removeChild(this.selected);
				}

				this.link.data[keyInput.value] = {
					name: {v:nameInput.value},
					key: {v:keyInput.value},
					readonly: {v:true},
					permissions: {v:permissions}
				};
			}

			await this.SaveLinks();
			dialog.Close();
			this.ListLinks();
		};
	}

	async Delete() {
		if (this.args.select === null) return;
		
		if (this.args.select in this.link.data) {
			this.ConfirmBox("Are you sure you want delete this API link?").addEventListener("click", async()=> {
				delete this.link.data[this.args.select];
				this.SaveLinks();

				if (this.selected) {
					this.list.removeChild(this.selected);
				}

				this.args.select = null;
				this.selected = null;
			});
		}
	}

	InflateElement(element, entry) { //overrides
		for (let i = 0; i < this.columnsElements.length; i++) {
			if (!(this.columnsElements[i].textContent in entry)) continue;

			const newAttr = document.createElement("div");
			
			element.appendChild(newAttr);

			switch (this.columnsElements[i].textContent) {
			case "key":
				newAttr.textContent = entry["key"].v.substring(0, 6);
				break;

			default:
				newAttr.textContent = entry[this.columnsElements[i].textContent].v;
				break;
			}

			if (i === 0) {
				newAttr.style.top = "5px";
				newAttr.style.left = "4px";
				newAttr.style.width = `calc(${this.columnsElements[0].style.width} - 4px)`;
				newAttr.style.whiteSpace = "nowrap";
				newAttr.style.overflow = "hidden";
				newAttr.style.textOverflow = "ellipsis";
			}
			else {
				newAttr.style.left = this.columnsElements[i].style.left;
				newAttr.style.width = this.columnsElements[i].style.width;
			}
		}

		element.onclick = ()=> {
			if (this.selected) this.selected.style.backgroundColor = "";

			this.args.select = entry.key.v;

			this.selected = element;
			element.style.backgroundColor = "var(--clr-select)";
		};

		element.ondblclick = ()=> {
			this.EditDialog(entry);
		};
	}
}
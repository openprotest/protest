class Api extends List {
	constructor(args) {
		super();
		this.args = args ?? {filter:"", find:"", sort:"", select:null};

		this.AddCssDependencies("list.css");

		this.SetTitle("API links");
		this.SetIcon("mono/carabiner.svg");

		this.InitializeComponents();
		this.UpdateAuthorization();
	}

	UpdateAuthorization() { //overrides
		this.canWrite = KEEP.authorization.includes("*") || KEEP.authorization.includes("api:write");
		this.createButton.disabled = !this.canWrite;
		this.deleteButton.disabled = !this.canWrite;
		super.UpdateAuthorization();
	}

	InitializeComponents() {
		const columns = ["name", "calls", "data"];
		this.SetupColumns(columns);
		this.columnsOptions.style.display = "none";

		this.SetupToolbar();
		this.createButton = this.AddToolbarButton("Create API link", "mono/add.svg?light");
		this.deleteButton = this.AddToolbarButton("Delete", "mono/delete.svg?light");

		this.createButton.onclick = ()=> this.EditDialog();
		this.deleteButton.onclick = ()=> this.Delete();

		this.list.style.right = "unset";
		this.list.style.width = "min(50%, 640px)";
		this.list.style.overflowY = "auto";

		this.list.style.right = "unset";
		this.list.style.width = "min(50%, 640px)";
		this.list.style.overflowY = "auto";

		this.listTitle.style.right = "unset";
		this.listTitle.style.width = "min(50%, 640px)";

		this.stats = document.createElement("div");
		this.stats.style.position = "absolute";
		this.stats.style.left = "calc(min(50%, 640px) + 8px)";
		this.stats.style.right = "4px";
		this.stats.style.top = "0";
		this.stats.style.bottom = "28px";
		this.stats.style.overflowY = "auto";
		this.content.appendChild(this.stats);

		const graph = document.createElement("div");
		graph.style.position = "absolute";
		graph.style.left = "0";
		graph.style.right = "0";
		graph.style.top = "0";
		graph.style.maxWidth = `${ReverseProxy.CANVAS_W+4}px`;
		graph.style.height = `${ReverseProxy.CANVAS_H+8}px`;
		graph.style.borderRadius = "4px";
		graph.style.backgroundColor = "color-mix(in hsl shorter hue, var(--clr-dark) 50%, transparent 50%)";
		this.stats.appendChild(graph);

		this.canvas = document.createElement("canvas");
		this.canvas.width = ReverseProxy.CANVAS_W;
		this.canvas.height = ReverseProxy.CANVAS_H+4;
		this.canvas.style.position = "absolute";
		this.canvas.style.right = "2px";
		this.canvas.style.top = "0";
		this.canvas.style.width = `${ReverseProxy.CANVAS_W}px`;
		this.canvas.style.height = `${ReverseProxy.CANVAS_H+4}px`;
		graph.appendChild(this.canvas);

		this.ctx = this.canvas.getContext("2d");

	}

	EditDialog(object=null) {
		const dialog = this.DialogBox("400px");
		if (dialog === null) return;

		const {okButton, innerBox} = dialog;

		okButton.value = "Create";

		innerBox.parentElement.style.maxWidth = "680px";

		innerBox.style.padding = "16px 32px";
		innerBox.style.display = "grid";
		innerBox.style.gridTemplateColumns = "auto 160px 275px 44px 72px auto";
		innerBox.style.gridTemplateRows = "repeat(3, 38px) 12px repeat(5, 32px)";
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

		const [utilitiesLabel, utilitiesInput] = AddParameter("Network utilities", "input", "toggle");
		utilitiesLabel.style.paddingLeft = "24px";
		utilitiesLabel.style.backgroundImage = "url(mono/portscan.svg)";
		utilitiesLabel.style.backgroundSize = "20px";
		utilitiesLabel.style.backgroundRepeat = "no-repeat";

		if (object === null) {
			devicesInput.checked = true;
			usersInput.checked = true;
		}
		else {
			nameInput.value = object.name;
			keyInput.value = object.key;
			devicesInput.checked = object.devices;
			usersInput.checked = object.users;
			utilitiesInput.checked = object.utilities;
			issuesInput.checked = object.issues;
		}

		setTimeout(()=>nameInput.focus(), 200);

		copyButton.onclick = async ()=> {
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

		okButton.onclick =  async ()=> {
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

			let body = `name=${nameInput.value}\n`;
			body += `guid=00000000-0000-0000-0000-000000000000\n`;

			try {
				const response = await fetch("api/create", {
					method: "POST",
					body: body
				});

				if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

				const json = await response.json();
				if (json.error) throw (json.error);

				this.link = json;
				this.ListCerts();
			}
			catch (ex) {
				this.ConfirmBox(ex, true, "mono/error.svg");
			}

			dialog.Close();
		};
	}

	async Delete() {
		if (this.args.select === null) return;

		this.ConfirmBox("Are you sure you want delete this link?").addEventListener("click", async()=> {
			try {
				const response = await fetch(`api/delete?name=${encodeURIComponent(this.args.select)}`);
				if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

				const json = await response.json();
				if (json.error) throw(json.error);

				this.selected = null;
				this.args.select = null;

				this.link = json;
				this.ListCerts();
			}
			catch (ex) {
				this.ConfirmBox(ex, true, "mono/error.svg")
			}
		});
	}
}
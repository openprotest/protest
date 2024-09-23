class Api extends List {
	constructor(args) {
		super();

		this.args = args ?? {filter:"", find:"", sort:"", select:null};

		this.AddCssDependencies("list.css");

		this.SetTitle("API links");
		this.SetIcon("mono/carabiner.svg");

		this.defaultColumns = ["name", "calls", "data"];
		this.SetupColumns(this.defaultColumns);
		this.columnsOptions.style.display = "none";

		this.SetupToolbar();
		this.createButton = this.AddToolbarButton("Create API link", "mono/add.svg?light");
		this.deleteButton = this.AddToolbarButton("Delete", "mono/delete.svg?light");

		this.createButton.onclick = ()=> this.CreateDialog();
		this.deleteButton.onclick = ()=> this.Delete();

		this.UpdateAuthorization();
	}

	UpdateAuthorization() { //overrides
		this.canWrite = KEEP.authorization.includes("*") || KEEP.authorization.includes("api:write");
		this.createButton.disabled = !this.canWrite;
		this.deleteButton.disabled = !this.canWrite;
		super.UpdateAuthorization();
	}

	CreateDialog() {
		const dialog = this.DialogBox("420px");
		if (dialog === null) return;

		const {okButton, innerBox} = dialog;

		okButton.value = "Create";

		innerBox.parentElement.style.maxWidth = "640px";

		innerBox.style.padding = "16px 32px";
		innerBox.style.display = "grid";
		innerBox.style.gridTemplateColumns = "auto 150px 275px auto";
		innerBox.style.gridTemplateRows = "repeat(6, 38px) 72px";
		innerBox.style.alignItems = "center";

		let counter = 0;
		const AddParameter = (name, tag, type, properties) => {
			counter++;

			const label = document.createElement("div");
			label.style.gridArea = `${counter} / 2`;
			label.textContent = `${name}:`;

			const input = document.createElement(tag);
			input.style.gridArea = `${counter} / 3`;
			if (type) {
				input.type = type;
			}

			for (let param in properties) {
				input[param] = properties[param];
			}

			innerBox.append(label, input);

			return input;
		};

		const nameInput = AddParameter("Name", "input", "text");

		setTimeout(()=>nameInput.focus(), 200);

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
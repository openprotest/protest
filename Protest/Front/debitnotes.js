class DebitNotes extends Window {
	static TEMPLATES = [];
	static BANNERS = [];
	static MODELS = {};
	static SERIAL_NUMBERS = {};

	constructor(params) {
		super();

		this.params = params ?? { keywords:"", upto:4, short:true, long:true, returned:false, selected:null };
		this.selectedDebit = null;
		this.selectedElement = null;

		this.AddCssDependencies("debitnotes.css");
		this.AddCssDependencies("list.css");

		this.SetTitle("Debit notes");
		this.SetIcon("mono/notes.svg");

		this.content.style.overflow = "auto";

		this.descriptionDatalist = document.createElement("datalist");
		this.descriptionDatalist.id = "DESCRIPTION_DATALIST";
		this.descriptionDatalist.style.display = "none";
		this.content.appendChild(this.descriptionDatalist);

		const listBox = document.createElement("div");
		listBox.style.display = "grid";
		listBox.style.gridTemplateColumns = "72px 200px auto";
		listBox.style.gridTemplateRows = "repeat(2, 36px) 8px repeat(3, 28px) 8px auto 8px";
		listBox.className = "debit-list-pane";
		this.content.appendChild(listBox);

		const searchLabel = document.createElement("div");
		searchLabel.style.gridArea = "1 / 1";
		searchLabel.textContent = "Search:";
		listBox.appendChild(searchLabel);

		this.searchInput = document.createElement("input");
		this.searchInput.style.gridArea = "1 / 2";
		this.searchInput.type = "search";
		this.searchInput.value = this.params.keywords;
		listBox.appendChild(this.searchInput);

		const upToLabel = document.createElement("div");
		upToLabel.style.gridArea = "2 / 1";
		upToLabel.textContent = "Up to:";
		listBox.appendChild(upToLabel);

		this.upToInput = document.createElement("select");
		this.upToInput.value = this.params.upto;
		this.upToInput.style.gridArea = "2 / 2";
		listBox.appendChild(this.upToInput);

		for (let i = 2; i < 11; i += 2) {
			const upToOption = document.createElement("option");
			upToOption.value = i;
			upToOption.text = `${i} ${i === 1 ? "year" : "years"}`;
			this.upToInput.appendChild(upToOption);
		}

		this.upToInput.value = this.params.upto;

		const allOption = document.createElement("option");
		allOption.value = "all";
		allOption.text = "All";
		this.upToInput.appendChild(allOption);

		const filterLabel = document.createElement("div");
		filterLabel.style.gridArea = "4 / 1";
		filterLabel.textContent = "Filters:";
		listBox.appendChild(filterLabel);

		const shortBox = document.createElement("div");
		shortBox.style.gridArea = "4 / 2";
		shortBox.style.paddingLeft = "4px";
		listBox.appendChild(shortBox);
		this.shortCheckbox = document.createElement("input");
		this.shortCheckbox.type = "checkbox";
		this.shortCheckbox.checked = this.params.short;
		shortBox.appendChild(this.shortCheckbox);
		this.AddCheckBoxLabel(shortBox, this.shortCheckbox, "Short-term");

		const longBox = document.createElement("div");
		longBox.style.gridArea = "5 / 2";
		longBox.style.paddingLeft = "4px";
		listBox.appendChild(longBox);
		this.longCheckbox = document.createElement("input");
		this.longCheckbox.type = "checkbox";
		this.longCheckbox.checked = this.params.long;
		longBox.appendChild(this.longCheckbox);
		this.AddCheckBoxLabel(longBox, this.longCheckbox, "Long-term");

		const returnedBox = document.createElement("div");
		returnedBox.style.gridArea = "6 / 2";
		returnedBox.style.paddingLeft = "4px";
		listBox.appendChild(returnedBox);
		this.returnedCheckbox = document.createElement("input");
		this.returnedCheckbox.type = "checkbox";
		this.returnedCheckbox.checked = this.params.returned;
		returnedBox.appendChild(this.returnedCheckbox);
		this.AddCheckBoxLabel(returnedBox, this.returnedCheckbox, "Returned");

		this.list = document.createElement("div");
		this.list.className = "no-results";
		this.list.style.backgroundColor = "var(--clr-pane)";
		this.list.style.gridArea = "8 / 1 / 9 / 3";
		this.list.style.width = "100%";
		this.list.style.height = "100%";
		this.list.style.borderRadius = "4px";
		this.list.style.overflowY = "auto";
		listBox.appendChild(this.list);

		this.options = document.createElement("div");
		this.options.className = "debit-options";
		this.content.append(this.options);

		this.newButton = document.createElement("input");
		this.newButton.style.backgroundImage = "url(mono/add.svg?light)";
		this.newButton.classList.add("with-icon");
		this.newButton.type = "button";
		this.newButton.value = "New";

		this.duplicateButton = document.createElement("input");
		this.duplicateButton.style.backgroundImage = "url(mono/copy.svg?light)";
		this.duplicateButton.classList.add("with-icon");
		this.duplicateButton.type = "button";
		this.duplicateButton.value = "Duplicate";

		this.returnedButton = document.createElement("input");
		this.returnedButton.style.backgroundImage = "url(mono/return.svg?light)";
		this.returnedButton.classList.add("with-icon");
		this.returnedButton.type = "button";
		this.returnedButton.value = "Mark as returned";

		this.deleteButton = document.createElement("input");
		this.deleteButton.style.backgroundImage = "url(mono/delete.svg?light)";
		this.deleteButton.classList.add("with-icon");
		this.deleteButton.type = "button";
		this.deleteButton.value = "Delete";

		this.printButton = document.createElement("input");
		this.printButton.style.backgroundImage = "url(mono/printer.svg?light)";
		this.printButton.classList.add("with-icon");
		this.printButton.type = "button";
		this.printButton.value = "Print";

		this.options.append(this.newButton, this.duplicateButton, this.returnedButton, this.deleteButton, this.printButton);

		this.preview = document.createElement("div");
		this.preview.className = "debit-preview-outer";
		this.content.append(this.preview);

		this.searchInput.onchange = ()=> this.ListDebitNotes();
		this.upToInput.onchange = ()=> this.ListDebitNotes();
		this.shortCheckbox.onchange = ()=> this.ListDebitNotes();
		this.longCheckbox.onchange = ()=> this.ListDebitNotes();
		this.returnedCheckbox.onchange = ()=> this.ListDebitNotes();

		this.newButton.onclick = ()=> this.New();
		this.printButton.onclick = ()=> this.Print();
		this.duplicateButton.onclick = ()=> this.Duplicate();
		this.returnedButton.onclick = ()=> this.Return();
		this.deleteButton.onclick = ()=> this.Delete();

		this.ListDebitNotes();
		this.GetTemplates();
		this.GetBanners();

		this.OnUiReady();

		setTimeout(()=> this.AfterResize(), 250);
	}

	OnUiReady(count = 0) {
		if (this.content.clientWidth === 0 && count < 200) {
			setTimeout(()=> this.OnUiReady(++count), 50);
		}
		else {
			this.UpdateAuthorization();
		}
	}

	AfterResize() { //overrides
		super.AfterResize();
		if (this.options.getBoundingClientRect().width < 550) {
			this.options.classList.add("debit-options-collapsed");
		}
		else {
			this.options.classList.remove("debit-options-collapsed");
		}
	}

	UpdateAuthorization() { //overrides
		//super.UpdateAuthorization();

		if (!KEEP.authorization.includes("*") && !KEEP.authorization.includes("debit notes:write")) {
			this.newButton.disabled = true;
			this.duplicateButton.disabled = true;
			this.returnedButton.disabled = true;
			this.deleteButton.disabled = true;
			this.printButton.disabled = true;
			return;
		}

		this.duplicateButton.disabled = false;
		this.returnedButton.disabled = false;
		this.deleteButton.disabled = false;
		this.printButton.disabled = false;

		if (this.params.selected === null) {
			this.duplicateButton.disabled = true;
			this.returnedButton.disabled = true;
			this.deleteButton.disabled = true;
			this.printButton.disabled = true;
		}
		else if (this.selectedDebit !== null && this.selectedDebit.status === "returned") {
			this.returnedButton.disabled = true;
			this.deleteButton.disabled = true;
		}
	}

	async ListDebitNotes() {
		this.params.keywords = this.searchInput.value.trim().toLocaleLowerCase();
		this.params.upto = this.upToInput.value;
		this.params.short = this.shortCheckbox.checked;
		this.params.long = this.longCheckbox.checked;
		this.params.returned = this.returnedCheckbox.checked;

		try {
			let uri = this.params.keywords.length === 0 ?
				`debit/list?upto=${this.params.upto}&short=${this.params.short}&long=${this.params.long}&returned=${this.params.returned}` :
				`debit/list?upto=${this.params.upto}&short=${this.params.short}&long=${this.params.long}&returned=${this.params.returned}&keywords=${encodeURIComponent(this.params.keywords)}`;

			const response = await fetch(uri);

			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const json = await response.json();
			if (json.error) throw (json.error);

			this.preview.textContent = "";
			this.UpdateList(json);
		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/error.svg");
		}
	}

	async GetTemplates() {
		if (DebitNotes.TEMPLATES.length != 0) return;

		try {
			const response = await fetch("debit/templates");
			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const json = await response.json();
			if (json.error) throw (json.error);

			for (let i = 0; i < json.length; i++) {
				DebitNotes.TEMPLATES.push(json[i]);
			}
		}
		catch (ex) {}
	}

	async GetBanners() {
		if (DebitNotes.BANNERS.length != 0) return;

		try {
			const response = await fetch("debit/banners");
			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const json = await response.json();
			if (json.error) throw (json.error);

			for (let i = 0; i < json.length; i++) {
				DebitNotes.BANNERS.push(json[i]);
			}
		}
		catch (ex) {}
	}

	GenerateEquipAutoComplete(force = false) {
		if (Object.keys(DebitNotes.MODELS) > 0 && !force) return;

		for (let file in LOADER.devices.data) {
			if (!LOADER.devices.data[file].type) continue;
			let type = LOADER.devices.data[file]["type"].v;
			if (type.length == 0) continue;

			let manufacturer = LOADER.devices.data[file]["manufacturer"] ? LOADER.devices.data[file]["manufacturer"].v : "";
			let model = LOADER.devices.data[file]["model"] ? LOADER.devices.data[file]["model"].v : "";
			if (manufacturer.length == 0 && model.length == 0) continue;

			let description = (manufacturer + " " + type).trim();
			let serial = LOADER.devices.data[file]["serial number"] ? LOADER.devices.data[file]["serial number"].v : "";

			if (description && !(description in DebitNotes.MODELS)) {
				DebitNotes.MODELS[description] = [];
				const option = document.createElement("option");
				option.value = description;
				this.descriptionDatalist.appendChild(option);
			}
			if (description && model && !DebitNotes.MODELS[description].includes(model)) {
				DebitNotes.MODELS[description].push(model);
			}

			if (model && !(model in DebitNotes.MODELS)) {
				DebitNotes.SERIAL_NUMBERS[model] = [];
			}
			if (model && serial && !DebitNotes.SERIAL_NUMBERS[model].includes(serial)) {
				DebitNotes.SERIAL_NUMBERS[model].push(serial);
			}
		}
	}

	UpdateList(array, append = false) {
		if (!append) {
			this.list.textContent = "";
		}

		for (let i=0; i<array.length; i++) {
			this.AddToList(array[i]);
		}
	}

	AddToList(debit) {
		const element = document.createElement("div");
		element.className = "debit-entry";
		this.list.appendChild(element);

		const label = document.createElement("div");
		label.textContent = debit.name;
		element.appendChild(label);

		if (debit.status === "returned") {
			const returnedLabel = document.createElement("div");
			returnedLabel.textContent = "Re";
			element.appendChild(returnedLabel);
		}

		element.onclick = ()=> {
			if (this.selectedElement)
				this.selectedElement.style.backgroundColor = "";

			element.style.backgroundColor = "var(--clr-select)";
			this.params.selected = debit.file;
			this.selectedDebit = debit;
			this.selectedElement = element;

			this.Preview(debit);
			this.UpdateAuthorization();
		};

		if (this.params.selected && this.params.selected === debit.file)
			element.onclick();

		return element;
	}

	async Preview(debit) {
		let content;
		try {
			const response = await fetch(`debit/view?status=${debit.status}&file=${debit.file}`);
			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const json = await response.json();
			if (json.error) throw (json.error);
			content = json;

			this.selectedDebit = json;
		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/error.svg");
			return;
		}

		this.preview.textContent = "";

		const page = document.createElement("div");
		page.style.backgroundColor = "var(--clr-light)";
		page.style.color = "var(--clr-dark)";
		page.style.maxWidth = "800px";
		page.style.minHeight = "500px";
		page.style.padding = "8px 24px";
		page.style.fontFamily = "var(--global-font-family)";
		this.preview.appendChild(page);

		const underline_style = "var(--clr-dark) solid 2px";

		const codeContainer = document.createElement("div");
		codeContainer.style.height = "40px";
		codeContainer.style.textAlign = "right";
		codeContainer.style.overflow = "hidden";
		page.appendChild(codeContainer);

		const barcode = document.createElement("img");
		barcode.src = `barcode128?code=${debit.file}&withlabel=true`;
		barcode.style.textAlign = "right";
		codeContainer.appendChild(barcode);

		if (content.status == "returned") {
			const stampContainer = document.createElement("div");
			stampContainer.style.position = "absolute";
			stampContainer.style.left = "128px";
			stampContainer.style.top = "96px";
			stampContainer.style.color = "red";
			stampContainer.style.mixBlendMode = "multiply";
			stampContainer.style.transform = "rotate(-20deg) scale(3)";
			stampContainer.style.animation = "stamped .2s 1";
			page.appendChild(stampContainer);

			const returnedBox = document.createElement("div");
			returnedBox.textContent = "Returned";
			returnedBox.style.fontSize = "14px";
			returnedBox.style.fontWeight = "700";
			returnedBox.style.padding = "2px";
			returnedBox.style.border = "2px solid red";
			returnedBox.style.borderRadius = "4px";
			stampContainer.appendChild(returnedBox);

			const returnedDateBox = document.createElement("div");
			returnedDateBox.textContent = new Date(UI.TicksToUnixDate(content.returned)).toLocaleDateString(regionalFormat);
			returnedDateBox.style.textAlign = "center";
			returnedDateBox.style.fontSize = "6px";
			returnedDateBox.style.fontWeight = "700";
			stampContainer.appendChild(returnedDateBox);
		}

		const grid = document.createElement("div");
		grid.style.margin = "12px 20px 20px 20px";
		grid.style.display = "grid";
		grid.style.gridTemplateColumns = "120px auto 120px auto";
		grid.style.gridTemplateRows = "96px 64px repeat(3, 40px)";
		grid.style.alignItems = "center";
		page.appendChild(grid);

		const logoBox = document.createElement("div");
		logoBox.style.gridArea = "1 / 1 / span 1 / span 4";
		logoBox.style.textAlign = "center";
		logoBox.style.maxHeight = "100px";
		logoBox.style.userSelect = "none";
		logoBox.style.webkitUserDrag = "none";
		grid.appendChild(logoBox);

		const imgLogo = document.createElement("img");
		imgLogo.src = content.banner ? `custom/${content.banner}` : "custom/default.svg";
		logoBox.appendChild(imgLogo);

		const debitNoteTitleLabel = document.createElement("div");
		debitNoteTitleLabel.textContent = "Debit note";
		debitNoteTitleLabel.style.textAlign = "center";
		debitNoteTitleLabel.style.fontWeight = "bold";
		debitNoteTitleLabel.style.fontSize = "larger";
		debitNoteTitleLabel.style.gridArea = "2 / 1 / span 1 / span 4";
		grid.appendChild(debitNoteTitleLabel);

		const dateLabel = document.createElement("div");
		dateLabel.textContent = "Issued date:";
		dateLabel.style.gridArea = "3 / 1";
		dateLabel.style.fontWeight = "bold";
		grid.append(dateLabel);

		const dateValueLabel = document.createElement("div");
		dateValueLabel.textContent = new Date(UI.TicksToUnixDate(content.date)).toLocaleDateString(regionalFormat);
		dateValueLabel.style.gridArea = "3 / 2";
		dateValueLabel.style.borderBottom = underline_style;
		dateValueLabel.style.marginRight = "20px";
		grid.append(dateValueLabel);

		const fnLabel = document.createElement("div");
		fnLabel.textContent = "First name:";
		fnLabel.style.gridArea = "4 / 1";
		fnLabel.style.fontWeight = "bold";
		grid.append(fnLabel);
		const fnValueLabel = document.createElement("div");
		fnValueLabel.textContent = content.firstname;
		fnValueLabel.style.gridArea = "4 / 2";
		fnValueLabel.style.borderBottom = underline_style;
		fnValueLabel.style.marginRight = "20px";
		grid.append(fnValueLabel);

		const lnLabel = document.createElement("div");
		lnLabel.textContent = "Last name:";
		lnLabel.style.gridArea = "4 / 3";
		lnLabel.style.fontWeight = "bold";
		grid.append(lnLabel);
		const lnValueLabel = document.createElement("div");
		lnValueLabel.textContent = content.lastname;
		lnValueLabel.style.gridArea = "4 / 4";
		lnValueLabel.style.borderBottom = underline_style;
		lnValueLabel.style.marginRight = "20px";
		grid.append(lnValueLabel);

		const titleLabel = document.createElement("div");
		titleLabel.textContent = "Title:";
		titleLabel.style.gridArea = "5 / 1";
		titleLabel.style.fontWeight = "bold";
		grid.append(titleLabel);
		const titleValueLabel = document.createElement("div");
		titleValueLabel.textContent = content.title;
		titleValueLabel.style.gridArea = "5 / 2";
		titleValueLabel.style.borderBottom = underline_style;
		titleValueLabel.style.marginRight = "20px";
		grid.append(titleValueLabel);

		const depLabel = document.createElement("div");
		depLabel.textContent = "Department:";
		depLabel.style.gridArea = "5 / 3";
		depLabel.style.fontWeight = "bold";
		grid.append(depLabel);
		const depValueLabel = document.createElement("div");
		depValueLabel.textContent = content.department;
		depValueLabel.style.gridArea = "5 / 4";
		depValueLabel.style.borderBottom = underline_style;
		depValueLabel.style.marginRight = "20px";
		grid.append(depValueLabel);

		for (let i = 1; i < grid.childNodes.length; i++) {
			grid.childNodes[i].style.padding = "0 8px";
			grid.childNodes[i].style.maxHeight = "44px";
			grid.childNodes[i].style.overflow = "hidden";
			grid.childNodes[i].style.textOverflow = "ellipsis";
		}

		const tableEquip = document.createElement("table");
		tableEquip.style.margin = "40px 20px";
		tableEquip.style.paddingRight = "40px";
		tableEquip.style.width = "calc(100% - 40px)";
		tableEquip.style.color = "var(--clr-dark)";
		tableEquip.style.border = "2px solid var(--clr-dark)";
		tableEquip.style.borderCollapse = "collapse";
		page.append(tableEquip);

		const heading = document.createElement("tr");
		tableEquip.appendChild(heading);

		const descHeading = document.createElement("th");
		descHeading.style.minWidth = "40px";
		descHeading.style.border = "1px solid black";
		descHeading.textContent = "Description";

		const modelHeading = document.createElement("th");
		modelHeading.style.minWidth = "40px";
		modelHeading.style.border = "1px solid black";
		modelHeading.textContent = "Model";

		const serialHeading = document.createElement("th");
		serialHeading.style.minWidth = "40px";
		serialHeading.style.border = "1px solid black";
		serialHeading.textContent = "Serial number";

		const quantityHeading = document.createElement("th");
		quantityHeading.style.minWidth = "40px";
		quantityHeading.style.border = "1px solid black";
		quantityHeading.textContent = "Quantity";

		heading.append(descHeading, modelHeading, serialHeading, quantityHeading);

		for (let i = 0; i < content.devices.length; i++) {
			const row = document.createElement("tr");
			tableEquip.appendChild(row);

			const deviceDesc = document.createElement("td");
			deviceDesc.style.padding = "2px";
			deviceDesc.style.border = "1px solid black";
			deviceDesc.textContent = content.devices[i].description;

			const deviceModel = document.createElement("td");
			deviceModel.style.padding = "2px";
			deviceModel.style.border = "1px solid black";
			deviceModel.textContent = content.devices[i].model;

			const deviceSerial = document.createElement("td");
			deviceSerial.style.padding = "2px";
			deviceSerial.style.border = "1px solid black";
			deviceSerial.textContent = content.devices[i].serial;

			const deviceQuantity = document.createElement("td");
			deviceQuantity.style.padding = "2px";
			deviceQuantity.style.border = "1px solid black";
			deviceQuantity.textContent = content.devices[i].quantity;

			row.append(deviceDesc, deviceModel, deviceSerial, deviceQuantity);
		}

		const templateBox = document.createElement("div");
		templateBox.style.margin = "40px 20px";
		templateBox.style.whiteSpace = "pre-line";
		templateBox.innerHTML = content.template;
		page.append(templateBox);

		const signatureBox = document.createElement("div");
		signatureBox.style.margin = "20px";
		signatureBox.style.display = "grid";
		signatureBox.style.gridAutoColumns = "240px auto 240px";
		signatureBox.style.gridTemplateRows = "28px 28px 80px";
		signatureBox.style.textAlign = "center";
		signatureBox.style.padding = "40px";
		page.appendChild(signatureBox);

		const behalfOfItLabel = document.createElement("div");
		behalfOfItLabel.textContent = "Issued by";
		behalfOfItLabel.gridArea = "1 / 1";
		signatureBox.appendChild(behalfOfItLabel);

		const behalfOfEmployeeLabel = document.createElement("div");
		behalfOfEmployeeLabel.textContent = "Employee (or behalf of)";
		behalfOfEmployeeLabel.style.gridArea = "1 / 3";
		signatureBox.appendChild(behalfOfEmployeeLabel);

		const itNameLabel = document.createElement("div");
		itNameLabel.textContent = content.issuer;
		itNameLabel.style.gridArea = "2 / 1";
		signatureBox.appendChild(itNameLabel);

		const employeeNameLabel = document.createElement("div");
		employeeNameLabel.textContent = content.firstname + " " + content.lastname;
		employeeNameLabel.style.gridArea = "2 / 3";
		signatureBox.appendChild(employeeNameLabel);

		const itSignLabel = document.createElement("div");
		itSignLabel.style.gridArea = "3 / 1";
		itSignLabel.style.borderBottom = "black solid 2px";
		signatureBox.appendChild(itSignLabel);

		const employeeSignLabel = document.createElement("div");
		employeeSignLabel.style.gridArea = "3 / 3";
		employeeSignLabel.style.borderBottom = "black solid 2px";
		signatureBox.appendChild(employeeSignLabel);
	}

	New() {
		const dialog = this.DialogBox("100%");
		if (dialog === null) return;

		const createButton = dialog.okButton;
		const innerBox  = dialog.innerBox;

		this.GenerateEquipAutoComplete();

		innerBox.parentNode.style.left = "2px";
		innerBox.parentNode.style.right = "2px";
		innerBox.parentNode.style.borderRadius = "0";

		const grid = document.createElement("div");
		grid.className = "debit-create-dialog";
		innerBox.appendChild(grid);

		createButton.value = "Create";
		innerBox.parentElement.style.width = "calc(100% - 4px)";
		innerBox.parentElement.style.maxWidth = "calc(100% - 4px)";

		const firstNameLabel = document.createElement("div");
		firstNameLabel.textContent = "First name:";
		firstNameLabel.style.gridArea = "1 / 1";
		grid.appendChild(firstNameLabel);
		const firstNameInput = document.createElement("input");
		firstNameInput.type = "text";
		firstNameInput.style.gridArea = "1 / 2";
		grid.appendChild(firstNameInput);

		const lastNameLabel = document.createElement("div");
		lastNameLabel.textContent = "Last name:";
		lastNameLabel.style.gridArea = "2 / 1";
		grid.appendChild(lastNameLabel);
		const lastNameInput = document.createElement("input");
		lastNameInput.type = "text";
		lastNameInput.style.gridArea = "2 / 2";
		grid.appendChild(lastNameInput);

		const titleLabel = document.createElement("div");
		titleLabel.textContent = "Title:";
		titleLabel.style.gridArea = "3 / 1";
		grid.appendChild(titleLabel);
		const titleInput = document.createElement("input");
		titleInput.type = "text";
		titleInput.style.gridArea = "3 / 2";
		grid.appendChild(titleInput);

		const depLabel = document.createElement("div");
		depLabel.textContent = "Department:";
		depLabel.style.gridArea = "4 / 1";
		grid.appendChild(depLabel);
		const depInput = document.createElement("input");
		depInput.type = "text";
		depInput.style.gridArea = "4 / 2";
		grid.appendChild(depInput);

		const findUserButton = document.createElement("input");
		findUserButton.type = "button";
		findUserButton.value = "Find...";
		findUserButton.style.gridArea = "4 / 3";
		findUserButton.style.maxWidth = "72px";
		grid.appendChild(findUserButton);

		const dateLabel = document.createElement("div");
		dateLabel.textContent = "Issued date:";
		dateLabel.style.gridArea = "1 / 4";
		grid.appendChild(dateLabel);
		let now = new Date();
		const dateInput = document.createElement("input");
		dateInput.type = "text";
		dateInput.value = now.toLocaleDateString(regionalFormat);
		dateInput.readOnly = true;
		dateInput.style.gridArea = "1 / 5";
		grid.appendChild(dateInput);

		const behalfOfItLabel = document.createElement("div");
		behalfOfItLabel.textContent = "Issued by:";
		behalfOfItLabel.style.gridArea = "2 / 4";
		grid.appendChild(behalfOfItLabel);
		const issuerInput = document.createElement("input");
		issuerInput.type = "text";
		issuerInput.style.gridArea = "2 / 5";
		grid.appendChild(issuerInput);

		const templateLabel = document.createElement("div");
		templateLabel.textContent = "Template:";
		templateLabel.style.gridArea = "3 / 4";
		grid.appendChild(templateLabel);
		const templateInput = document.createElement("select");
		templateInput.style.gridArea = "3 / 5";
		grid.appendChild(templateInput);

		const bannerLabel = document.createElement("div");
		bannerLabel.textContent = "Banner:";
		bannerLabel.style.gridArea = "4 / 4";
		grid.appendChild(bannerLabel);
		const bannerInput = document.createElement("select");
		bannerInput.style.gridArea = "4 / 5";
		grid.appendChild(bannerInput);

		for (let i=0; i<DebitNotes.TEMPLATES.length; i++) {
			const option = document.createElement("option");
			option.value = DebitNotes.TEMPLATES[i].content;
			option.text = DebitNotes.TEMPLATES[i].name;
			templateInput.appendChild(option);
		}

		for (let i=0; i<DebitNotes.BANNERS.length; i++) {
			const option = document.createElement("option");
			option.value = DebitNotes.BANNERS[i];
			option.text = DebitNotes.BANNERS[i];
			bannerInput.appendChild(option);
		}

		const statusBox = document.createElement("div");
		statusBox.style.gridArea = "5 / 5";
		grid.appendChild(statusBox);
		const statusCheckbox = document.createElement("input");
		statusCheckbox.type = "checkbox";
		statusBox.appendChild(statusCheckbox);
		this.AddCheckBoxLabel(statusBox, statusCheckbox, "Short-term");

		const addEquipButton = document.createElement("input");
		addEquipButton.type = "button";
		addEquipButton.value = "Add";
		addEquipButton.style.maxWidth = "72px";
		addEquipButton.style.margin = "0 40px";
		innerBox.appendChild(addEquipButton);

		const lstEquip = document.createElement("div");
		lstEquip.className = "debit-equip-list";
		innerBox.appendChild(lstEquip);

		const AddEquip = ()=> {
			const newEntry = document.createElement("div");
			newEntry.className = "debit-equip-entry";
			lstEquip.appendChild(newEntry);

			const descriptionInput = document.createElement("input");
			descriptionInput.type = "text";
			descriptionInput.placeholder = "Description";
			descriptionInput.setAttribute("list", "DESCRIPTION_DATALIST");

			const modelInput = document.createElement("input");
			modelInput.type = "text";
			modelInput.placeholder = "Model";

			const serialNoInput = document.createElement("input");
			serialNoInput.type = "text";
			serialNoInput.placeholder = "Serial number";

			const quantityInput = document.createElement("input");
			quantityInput.type = "number";
			quantityInput.min = 1;
			quantityInput.max = 1000;
			quantityInput.value = 1;

			newEntry.append(descriptionInput, modelInput, serialNoInput, quantityInput);

			const removeButton = document.createElement("input");
			removeButton.type = "button";
			removeButton.value = " ";
			newEntry.appendChild(removeButton);

			let modelId = "m" + new Date().getTime();
			const modelsDatalist = document.createElement("datalist");
			modelsDatalist.id = modelId;
			newEntry.appendChild(modelsDatalist);
			modelInput.setAttribute("list", modelId);

			let serialId = "s" + new Date().getTime();
			const serialDatalist = document.createElement("datalist");
			serialDatalist.id = serialId;
			newEntry.appendChild(serialDatalist);
			serialNoInput.setAttribute("list", serialId);

			descriptionInput.onchange = descriptionInput.oninput = ()=> {
				if (!(descriptionInput.value in DebitNotes.MODELS)) return;

				if (DebitNotes.MODELS[descriptionInput.value].length == 1) {
					modelInput.value = DebitNotes.MODELS[descriptionInput.value][0];
					modelInput.onchange();
				}
				else {
					if (!DebitNotes.MODELS[descriptionInput.value].includes(modelInput.value)) modelInput.value = "";

					while (modelsDatalist.firstChild != null) modelsDatalist.removeChild(modelsDatalist.firstChild);
					for (let i = 0; i < DebitNotes.MODELS[descriptionInput.value].length; i++) {
						const option = document.createElement("option");
						option.value = DebitNotes.MODELS[descriptionInput.value][i];
						modelsDatalist.appendChild(option);
					}
				}
			};

			modelInput.onchange = modelInput.oninput = ()=> {
				if (!(modelInput.value in DebitNotes.SERIAL_NUMBERS)) return;

				if (DebitNotes.SERIAL_NUMBERS[modelInput.value].length == 1) {
					serialNoInput.value = DebitNotes.SERIAL_NUMBERS[modelInput.value][0];
				}
				else {
					if (!DebitNotes.SERIAL_NUMBERS[modelInput.value].includes(modelInput.value)) serialNoInput.value = "";

					while (serialDatalist.firstChild != null) serialDatalist.removeChild(serialDatalist.firstChild);
					for (let i = 0; i < DebitNotes.SERIAL_NUMBERS[modelInput.value].length; i++) {
						const option = document.createElement("option");
						option.value = DebitNotes.SERIAL_NUMBERS[modelInput.value][i];
						serialDatalist.appendChild(option);
					}
				}
			};

			removeButton.onclick = ()=> lstEquip.removeChild(newEntry);

			return {
				descriptionBox : descriptionInput,
				modelBox       : modelInput,
				serialBox      : serialNoInput,
				quantityBox    : quantityInput}
		};

		findUserButton.onclick = ()=> {
			innerBox.style.filter = "blur(2px)";

			const container = document.createElement("div");
			container.style.position = "absolute";
			container.style.left = "0";
			container.style.right = "0";
			container.style.top = "0";
			container.style.bottom = "0";
			container.style.zIndex = "4";
			container.style.backgroundColor = "rgba(32,32,32,.6)";
			innerBox.parentElement.appendChild(container);

			const dialog = document.createElement("div");
			dialog.style.backgroundColor = "var(--clr-pane)";
			dialog.style.position = "absolute";
			dialog.style.top = dialog.style.bottom = "32px";
			dialog.style.left = dialog.style.right = "96px";
			dialog.style.borderRadius = "8px";
			dialog.style.padding = "8px";
			dialog.style.boxShadow = "rgba(0,0,0,.4) 0 12px 16px";
			dialog.style.overflow = "hidden";
			container.appendChild(dialog);

			const findInput = document.createElement("input");
			findInput.type = "text";
			findInput.placeholder = "Search";
			dialog.appendChild(findInput);

			const usersList = document.createElement("div");
			usersList.className = "no-results";
			usersList.style.position = "absolute";
			usersList.style.left = usersList.style.right = "0";
			usersList.style.top = usersList.style.bottom = "48px";
			usersList.style.overflowY = "auto";
			dialog.appendChild(usersList);

			const pnlButtons = document.createElement("div");
			pnlButtons.style.bottom = "8px";
			pnlButtons.style.width = "100%";
			pnlButtons.style.height = "40px";
			pnlButtons.style.position = "absolute";
			pnlButtons.style.textAlign = "center";
			dialog.appendChild(pnlButtons);

			const cancelButton = document.createElement("input");
			cancelButton.type = "button";
			cancelButton.value = "Cancel";
			cancelButton.style.bottom = "8px";
			pnlButtons.appendChild(cancelButton);

			findInput.onchange = findInput.oninput = ()=> {
				usersList.textContent = "";

				let keywords = [];
				if (findInput.value.trim().length > 0)
					keywords = findInput.value.trim().toLowerCase().split(" ");

				let usersColumns;
				if (localStorage.getItem("userslist_columns")) {
					usersColumns = JSON.parse(localStorage.getItem("userslist_columns"));
				}
				else {
					usersColumns = ["title", "department", "first name", "last name", "username", "email"];
				}

				for (let file in LOADER.users.data) {
					let match = true;

					for (let i = 0; i < keywords.length; i++) {
						let flag = false;
						for (let attr in LOADER.users.data[file]) {
							if (LOADER.users.data[file][attr].v.toLowerCase().indexOf(keywords[i]) > -1)
								flag = true;
						}
						if (!flag) {
							match = false;
							continue;
						}
					}

					if (!match) continue;

					let type = LOADER.users.data[file]["type"]?.v ?? "";
					if (type === "hidden" || type === "credentials") continue;

					let iconUrl = `url(${LOADER.userIcons[type] ?? "mono/user.svg"})`;

					let firstname = LOADER.users.data[file]["first name"]?.v ?? "";
					let lastname = LOADER.users.data[file]["last name"]?.v ?? "";
					if (firstname.length == 0 || lastname.length == 0) continue;

					let title = LOADER.users.data[file]["title"]?.v ?? "";
					let department = LOADER.users.data[file]["department"]?.v ?? "";

					const element = document.createElement("div");
					element.className = "list-element";
					this.content.appendChild(element);

					const icon = document.createElement("div");
					icon.className = "list-element-icon";
					icon.style.backgroundImage = iconUrl;
					element.appendChild(icon);

					for (let i=0; i<usersColumns.length; i++) {
						if (!(usersColumns[i] in LOADER.users.data[file])) continue;
						const newLabel = document.createElement("div");
						newLabel.textContent = LOADER.users.data[file][usersColumns[i]].v;
						newLabel.style.left = i===0 ? `calc(28px + ${i * 100 / usersColumns.length}%)` : `${i * 100 / usersColumns.length}%`;
						newLabel.style.width = i===0 ? `calc(${100 / usersColumns.length}% - 28px)` : `${100 / usersColumns.length}%`;
						element.appendChild(newLabel);
					}

					element.ondblclick = ()=> {
						firstNameInput.value = firstname;
						lastNameInput.value = lastname;
						titleInput.value = title;
						depInput.value = department;

						cancelButton.onclick();
					};

					usersList.appendChild(element);
				}
			};

			cancelButton.onclick = ()=> {
				innerBox.style.filter = "none";
				innerBox.parentElement.removeChild(container);
			};

			findInput.focus();
			findInput.onchange();
		};

		addEquipButton.onclick = ()=> AddEquip();

		createButton.addEventListener("click", async ()=>{
			let body = {
				date       : UI.UnixDateToTicks(new Date().getTime()),
				status     : statusCheckbox.checked ? "short" : "long",
				template   : templateInput.value,
				banner     : bannerInput.value,
				firstname  : firstNameInput.value,
				lastname   : lastNameInput.value,
				title      : titleInput.value,
				department : depInput.value,
				issuer     : issuerInput.value,
				devices    : []
			};

			for (let i = 0; i < lstEquip.childNodes.length; i++) {
				body.devices.push({
					description : lstEquip.childNodes[i].childNodes[0].value,
					model       : lstEquip.childNodes[i].childNodes[1].value,
					serial      : lstEquip.childNodes[i].childNodes[2].value,
					quantity    : parseInt(lstEquip.childNodes[i].childNodes[3].value)
				});
			}

			try {
				const response = await fetch("debit/create", {
					method: "POST",
					body: JSON.stringify(body)
				});

				if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

				const json = await response.json();
				if (json.error) throw (json.error);

				body.file = json.file;
				body.name = `${body.firstname} ${body.lastname}`;
				const newElement = this.AddToList(body);

				this.list.prepend(newElement);
				newElement.click();
			}
			catch (ex) {
				this.ConfirmBox(ex, true, "mono/error.svg");
			}
		});

		return {
			statusCheckbox     : statusCheckbox,
			firstNameInput  : firstNameInput,
			lastNameInput   : lastNameInput,
			titleInput    : titleInput,
			depInput        : depInput,
			issuerInput     : issuerInput,
			templateInput   : templateInput,
			lstEquip      : lstEquip,
			AddEquip      : AddEquip
		};
	}

	Duplicate() {
		if (this.selectedDebit === null) {
			this.UpdateAuthorization();
			return;
		}

		const obj = this.New();
		const firstNameInput = obj.firstNameInput;
		const lastNameInput  = obj.lastNameInput;
		const titleInput   = obj.titleInput;
		const depInput       = obj.depInput;
		const issuerInput    = obj.issuerInput;
		const templateInput  = obj.templateInput;
		const statusCheckbox    = obj.statusCheckbox;
		const lstEquip     = obj.lstEquip;
		const AddEquip     = obj.AddEquip;

		firstNameInput.value = this.selectedDebit.firstname;
		lastNameInput.value = this.selectedDebit.lastname;
		titleInput.value = this.selectedDebit.title;
		depInput.value = this.selectedDebit.department;
		issuerInput.value = this.selectedDebit.issuer;
		statusCheckbox.checked = this.selectedDebit.status === "short";

		const equip = this.selectedDebit.devices;
		for (let i = 0; i < this.selectedDebit.devices.length; i++) {
			const device = AddEquip();
			device.descriptionBox.value = this.selectedDebit.devices[i].description;
			device.modelBox.value = this.selectedDebit.devices[i].model;
			device.serialBox.value = this.selectedDebit.devices[i].serial;
			device.quantityBox.value = this.selectedDebit.devices[i].quantity;
		}
	}

	Return() {
		if (this.selectedDebit === null) {
			this.UpdateAuthorization();
			return;
		}

		this.ConfirmBox("Are you sure you want to mark this debit note as returned?").addEventListener("click", async()=> {
			try {
				const response = await fetch(`debit/return?status=${this.selectedDebit.status}&file=${this.params.selected}`);

				if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

				const json = await response.json();
				if (json.error) throw (json.error);

				let debit = {
					file: this.params.selected,
					status: "returned",
					name: `${this.selectedDebit.firstname} ${this.selectedDebit.lastname}`
				};

				this.list.removeChild(this.selectedElement);

				const newElement = this.AddToList(debit);
				this.list.prepend(newElement);

			}
			catch (ex) {
				this.ConfirmBox(ex, true, "mono/error.svg");
			}
		});
	}

	Delete() {
		if (this.selectedDebit === null) {
			this.UpdateAuthorization();
			return;
		}

		this.ConfirmBox("Are you sure you want to delete this debit note?").addEventListener("click", async ()=> {
			try {
				const response = await fetch(`debit/delete?status=${this.selectedDebit.status}&file=${this.params.selected}`);

				if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

				const json = await response.json();
				if (json.error) throw (json.error);

				this.list.removeChild(this.selectedElement);
				this.preview.textContent = "";

				this.params.selected = null;
				this.selectedElement = null;
				this.selectedDebit = null;

				this.UpdateAuthorization();
			}
			catch (ex) {
				this.ConfirmBox(ex, true, "mono/error.svg");
			}
		});
	}

	Print() {
		if (this.selectedDebit === null) {
			this.UpdateAuthorization();
			return;
		}

		const newPrint = window.open();
		newPrint.document.write("<html><body>" + this.preview.innerHTML + "</body></html>");
		newPrint.document.title = "Debit note";
		newPrint.document.body.childNodes[0].style.backgroundColor = "white";
		newPrint.onload = ()=> newPrint.print();
		newPrint.document.close();
		setTimeout(()=> newPrint.close(), 99);
	}
}
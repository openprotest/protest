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

		const lblSearch = document.createElement("div");
		lblSearch.style.gridArea = "1 / 1";
		lblSearch.textContent = "Search:";
		listBox.appendChild(lblSearch);

		this.txtSearch = document.createElement("input");
		this.txtSearch.style.gridArea = "1 / 2";
		this.txtSearch.type = "search";
		this.txtSearch.value = this.params.keywords;
		listBox.appendChild(this.txtSearch);

		const lblUpTo = document.createElement("div");
		lblUpTo.style.gridArea = "2 / 1";
		lblUpTo.textContent = "Up to:";
		listBox.appendChild(lblUpTo);

		this.txtUpTo = document.createElement("select");
		this.txtUpTo.value = this.params.upto;
		this.txtUpTo.style.gridArea = "2 / 2";
		listBox.appendChild(this.txtUpTo);

		for (let i = 2; i < 11; i += 2) {
			const optUpTo = document.createElement("option");
			optUpTo.value = i;
			optUpTo.text = `${i} ${i === 1 ? "year" : "years"}`;
			this.txtUpTo.appendChild(optUpTo);
		}

		this.txtUpTo.value = this.params.upto;

		const optAll = document.createElement("option");
		optAll.value = "all";
		optAll.text = "All";
		this.txtUpTo.appendChild(optAll);

		const lblFilter = document.createElement("div");
		lblFilter.style.gridArea = "4 / 1";
		lblFilter.textContent = "Filters:";
		listBox.appendChild(lblFilter);

		const divShort = document.createElement("div");
		divShort.style.gridArea = "4 / 2";
		divShort.style.paddingLeft = "4px";
		listBox.appendChild(divShort);
		this.chkShort = document.createElement("input");
		this.chkShort.type = "checkbox";
		this.chkShort.checked = this.params.short;
		divShort.appendChild(this.chkShort);
		this.AddCheckBoxLabel(divShort, this.chkShort, "Short-term");

		const divLong = document.createElement("div");
		divLong.style.gridArea = "5 / 2";
		divLong.style.paddingLeft = "4px";
		listBox.appendChild(divLong);
		this.chkLong = document.createElement("input");
		this.chkLong.type = "checkbox";
		this.chkLong.checked = this.params.long;
		divLong.appendChild(this.chkLong);
		this.AddCheckBoxLabel(divLong, this.chkLong, "Long-term");

		const divReturned = document.createElement("div");
		divReturned.style.gridArea = "6 / 2";
		divReturned.style.paddingLeft = "4px";
		listBox.appendChild(divReturned);
		this.chkReturned = document.createElement("input");
		this.chkReturned.type = "checkbox";
		this.chkReturned.checked = this.params.returned;
		divReturned.appendChild(this.chkReturned);
		this.AddCheckBoxLabel(divReturned, this.chkReturned, "Returned");

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

		this.btnNew = document.createElement("input");
		this.btnNew.style.backgroundImage = "url(mono/add.svg?light)";
		this.btnNew.classList.add("with-icon");
		this.btnNew.type = "button";
		this.btnNew.value = "New";

		this.btnDuplicate = document.createElement("input");
		this.btnDuplicate.style.backgroundImage = "url(mono/copy.svg?light)";
		this.btnDuplicate.classList.add("with-icon");
		this.btnDuplicate.type = "button";
		this.btnDuplicate.value = "Duplicate";

		this.btnReturned = document.createElement("input");
		this.btnReturned.style.backgroundImage = "url(mono/return.svg?light)";
		this.btnReturned.classList.add("with-icon");
		this.btnReturned.type = "button";
		this.btnReturned.value = "Mark as returned";

		this.btnDelete = document.createElement("input");
		this.btnDelete.style.backgroundImage = "url(mono/delete.svg?light)";
		this.btnDelete.classList.add("with-icon");
		this.btnDelete.type = "button";
		this.btnDelete.value = "Delete";

		this.btnPrint = document.createElement("input");
		this.btnPrint.style.backgroundImage = "url(mono/printer.svg?light)";
		this.btnPrint.classList.add("with-icon");
		this.btnPrint.type = "button";
		this.btnPrint.value = "Print";

		this.options.append(this.btnNew, this.btnDuplicate, this.btnReturned, this.btnDelete, this.btnPrint);

		this.preview = document.createElement("div");
		this.preview.className = "debit-preview-outer";
		this.content.append(this.preview);

		this.txtSearch.onchange = ()=> this.ListDebitNotes();
		this.txtUpTo.onchange = ()=> this.ListDebitNotes();
		this.chkShort.onchange = ()=> this.ListDebitNotes();
		this.chkLong.onchange = ()=> this.ListDebitNotes();
		this.chkReturned.onchange = ()=> this.ListDebitNotes();

		this.btnNew.onclick = ()=> this.New();
		this.btnPrint.onclick = ()=> this.Print();
		this.btnDuplicate.onclick = ()=> this.Duplicate();
		this.btnReturned.onclick = ()=> this.Return();
		this.btnDelete.onclick = ()=> this.Delete();

		this.ListDebitNotes();
		this.GetTemplates();
		this.GetBanners();
		
		this.OnUiReady();
		
		setTimeout(()=> { this.AfterResize(); }, 250);
	}

	OnUiReady(count = 0) {
		if (this.content.clientWidth === 0 && count < 200)
			setTimeout(()=> this.OnUiReady(++count), 50);
		else
			this.UpdateAuthorization();
	}

	AfterResize() { //override
		super.AfterResize();
		if (this.options.getBoundingClientRect().width < 550)
			this.options.classList.add("debit-options-collapsed");
		else
			this.options.classList.remove("debit-options-collapsed");
	}

	UpdateAuthorization() { //override
		//super.UpdateAuthorization();
		
		if (!KEEP.authorization.includes("*") && !KEEP.authorization.includes("debit notes:write")) {
			this.btnNew.disabled = true;
			this.btnDuplicate.disabled = true;
			this.btnReturned.disabled = true;
			this.btnDelete.disabled = true;
			this.btnPrint.disabled = true;
			return;
		}

		this.btnDuplicate.disabled = false;
		this.btnReturned.disabled = false;
		this.btnDelete.disabled = false;
		this.btnPrint.disabled = false;

		if (this.params.selected === null) {
			this.btnDuplicate.disabled = true;
			this.btnReturned.disabled = true;
			this.btnDelete.disabled = true;
			this.btnPrint.disabled = true;
		}
		else if (this.selectedDebit !== null && this.selectedDebit.status === "returned") {
			this.btnReturned.disabled = true;
			this.btnDelete.disabled = true;
		}
	}

	async ListDebitNotes() {
		this.params.keywords = this.txtSearch.value.trim().toLocaleLowerCase();
		this.params.upto = this.txtUpTo.value;
		this.params.short = this.chkShort.checked;
		this.params.long = this.chkLong.checked;
		this.params.returned = this.chkReturned.checked;

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
			const lblReturned = document.createElement("div");
			lblReturned.textContent = "Re";
			element.appendChild(lblReturned);
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

			const divReturned = document.createElement("div");
			divReturned.textContent = "Returned";
			divReturned.style.fontSize = "14px";
			divReturned.style.fontWeight = "700";
			divReturned.style.padding = "2px";
			divReturned.style.border = "2px solid red";
			divReturned.style.borderRadius = "4px";
			stampContainer.appendChild(divReturned);

			const divReturnedDate = document.createElement("div");
			divReturnedDate.textContent = new Date(UI.TicksToUnixDate(content.returned)).toLocaleDateString(regionalFormat);
			divReturnedDate.style.textAlign = "center";
			divReturnedDate.style.fontSize = "6px";
			divReturnedDate.style.fontWeight = "700";
			stampContainer.appendChild(divReturnedDate);
		}

		const grid = document.createElement("div");
		grid.style.margin = "12px 20px 20px 20px";
		grid.style.display = "grid";
		grid.style.gridTemplateColumns = "120px auto 120px auto";
		grid.style.gridTemplateRows = "96px 64px repeat(3, 40px)";
		grid.style.alignItems = "center";
		page.appendChild(grid);

		const divLogo = document.createElement("div");
		divLogo.style.gridArea = "1 / 1 / span 1 / span 4";
		divLogo.style.textAlign = "center";
		divLogo.style.maxHeight = "100px";
		divLogo.style.userSelect = "none";
		divLogo.style.webkitUserDrag = "none";
		grid.appendChild(divLogo);

		const imgLogo = document.createElement("img");
		imgLogo.src = content.banner ? `custom/${content.banner}` : "custom/default.svg";
		divLogo.appendChild(imgLogo);

		const lblDebitNoteTitle = document.createElement("div");
		lblDebitNoteTitle.textContent = "Debit note";
		lblDebitNoteTitle.style.textAlign = "center";
		lblDebitNoteTitle.style.fontWeight = "bold";
		lblDebitNoteTitle.style.fontSize = "larger";
		lblDebitNoteTitle.style.gridArea = "2 / 1 / span 1 / span 4";
		grid.appendChild(lblDebitNoteTitle);

		const lblDateLabel = document.createElement("div");
		lblDateLabel.textContent = "Issued date:";
		lblDateLabel.style.gridArea = "3 / 1";
		lblDateLabel.style.fontWeight = "bold";
		grid.append(lblDateLabel);
		const lblDate = document.createElement("div");
		
		lblDate.textContent = new Date(UI.TicksToUnixDate(content.date)).toLocaleDateString(regionalFormat);
		lblDate.style.gridArea = "3 / 2";
		lblDate.style.borderBottom = underline_style;
		lblDate.style.marginRight = "20px";
		grid.append(lblDate);

		const lblFnLabel = document.createElement("div");
		lblFnLabel.textContent = "First name:";
		lblFnLabel.style.gridArea = "4 / 1";
		lblFnLabel.style.fontWeight = "bold";
		grid.append(lblFnLabel);
		const lblFn = document.createElement("div");
		lblFn.textContent = content.firstname;
		lblFn.style.gridArea = "4 / 2";
		lblFn.style.borderBottom = underline_style;
		lblFn.style.marginRight = "20px";
		grid.append(lblFn);

		const lblLnLabel = document.createElement("div");
		lblLnLabel.textContent = "Last name:";
		lblLnLabel.style.gridArea = "4 / 3";
		lblLnLabel.style.fontWeight = "bold";
		grid.append(lblLnLabel);
		const lblLn = document.createElement("div");
		lblLn.textContent = content.lastname;
		lblLn.style.gridArea = "4 / 4";
		lblLn.style.borderBottom = underline_style;
		lblLn.style.marginRight = "20px";
		grid.append(lblLn);

		const lblTitleLabel = document.createElement("div");
		lblTitleLabel.textContent = "Title:";
		lblTitleLabel.style.gridArea = "5 / 1";
		lblTitleLabel.style.fontWeight = "bold";
		grid.append(lblTitleLabel);
		const lblTitle = document.createElement("div");
		lblTitle.textContent = content.title;
		lblTitle.style.gridArea = "5 / 2";
		lblTitle.style.borderBottom = underline_style;
		lblTitle.style.marginRight = "20px";
		grid.append(lblTitle);

		const lblDepLabel = document.createElement("div");
		lblDepLabel.textContent = "Department:";
		lblDepLabel.style.gridArea = "5 / 3";
		lblDepLabel.style.fontWeight = "bold";
		grid.append(lblDepLabel);
		const lblDep = document.createElement("div");
		lblDep.textContent = content.department;
		lblDep.style.gridArea = "5 / 4";
		lblDep.style.borderBottom = underline_style;
		lblDep.style.marginRight = "20px";
		grid.append(lblDep);

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

		const divTemplate = document.createElement("div");
		divTemplate.style.margin = "40px 20px";
		divTemplate.style.whiteSpace = "pre-line";
		divTemplate.innerHTML = content.template;
		page.append(divTemplate);

		const divSignature = document.createElement("div");
		divSignature.style.margin = "20px";
		divSignature.style.display = "grid";
		divSignature.style.gridAutoColumns = "240px auto 240px";
		divSignature.style.gridTemplateRows = "28px 28px 80px";
		divSignature.style.textAlign = "center";
		divSignature.style.padding = "40px";
		page.appendChild(divSignature);

		const lblBehalfOfIt = document.createElement("div");
		lblBehalfOfIt.textContent = "Issued by";
		lblBehalfOfIt.gridArea = "1 / 1";
		divSignature.appendChild(lblBehalfOfIt);

		const lblBehalfOfEmployee = document.createElement("div");
		lblBehalfOfEmployee.textContent = "Employee (or behalf of)";
		lblBehalfOfEmployee.style.gridArea = "1 / 3";
		divSignature.appendChild(lblBehalfOfEmployee);

		const lblItName = document.createElement("div");
		lblItName.textContent = content.issuer;
		lblItName.style.gridArea = "2 / 1";
		divSignature.appendChild(lblItName);

		const lblEmployeeName = document.createElement("div");
		lblEmployeeName.textContent = content.firstname + " " + content.lastname;
		lblEmployeeName.style.gridArea = "2 / 3";
		divSignature.appendChild(lblEmployeeName);

		const lblItSign = document.createElement("div");
		lblItSign.style.gridArea = "3 / 1";
		lblItSign.style.borderBottom = "black solid 2px";
		divSignature.appendChild(lblItSign);

		const lblEmployeeSign = document.createElement("div");
		lblEmployeeSign.style.gridArea = "3 / 3";
		lblEmployeeSign.style.borderBottom = "black solid 2px";
		divSignature.appendChild(lblEmployeeSign);
	}

	New() {
		const dialog = this.DialogBox("100%");
		if (dialog === null) return;

		const btnCreate = dialog.btnOK;
		const innerBox  = dialog.innerBox;

		this.GenerateEquipAutoComplete();

		innerBox.parentNode.style.left = "2px";
		innerBox.parentNode.style.right = "2px";
		innerBox.parentNode.style.borderRadius = "0";

		const grid = document.createElement("div");
		grid.className = "debit-create-dialog";
		innerBox.appendChild(grid);

		btnCreate.value = "Create";
		innerBox.parentElement.style.width = "calc(100% - 4px)";
		innerBox.parentElement.style.maxWidth = "calc(100% - 4px)";

		const lblFirstName = document.createElement("div");
		lblFirstName.textContent = "First name:";
		lblFirstName.style.gridArea = "1 / 1";
		grid.appendChild(lblFirstName);
		const txtFirstName = document.createElement("input");
		txtFirstName.type = "text";
		txtFirstName.style.gridArea = "1 / 2";
		grid.appendChild(txtFirstName);

		const lblLastName = document.createElement("div");
		lblLastName.textContent = "Last name:";
		lblLastName.style.gridArea = "2 / 1";
		grid.appendChild(lblLastName);
		const txtLastName = document.createElement("input");
		txtLastName.type = "text";
		txtLastName.style.gridArea = "2 / 2";
		grid.appendChild(txtLastName);

		const lblTitle = document.createElement("div");
		lblTitle.textContent = "Title:";
		lblTitle.style.gridArea = "3 / 1";
		grid.appendChild(lblTitle);
		const txtTitle = document.createElement("input");
		txtTitle.type = "text";
		txtTitle.style.gridArea = "3 / 2";
		grid.appendChild(txtTitle);

		const lblDep = document.createElement("div");
		lblDep.textContent = "Department:";
		lblDep.style.gridArea = "4 / 1";
		grid.appendChild(lblDep);
		const txtDep = document.createElement("input");
		txtDep.type = "text";
		txtDep.style.gridArea = "4 / 2";
		grid.appendChild(txtDep);

		const btnFindUser = document.createElement("input");
		btnFindUser.type = "button";
		btnFindUser.value = "Find...";
		btnFindUser.style.gridArea = "4 / 3";
		btnFindUser.style.maxWidth = "72px";
		grid.appendChild(btnFindUser);

		const lblDate = document.createElement("div");
		lblDate.textContent = "Issued date:";
		lblDate.style.gridArea = "1 / 4";
		grid.appendChild(lblDate);
		let now = new Date();
		const txtDate = document.createElement("input");
		txtDate.type = "text";
		txtDate.value = now.toLocaleDateString(regionalFormat);
		txtDate.readOnly = true;
		txtDate.style.gridArea = "1 / 5";
		grid.appendChild(txtDate);

		const lblBehalfOfIt = document.createElement("div");
		lblBehalfOfIt.textContent = "Issued by:";
		lblBehalfOfIt.style.gridArea = "2 / 4";
		grid.appendChild(lblBehalfOfIt);
		const txtIssuer = document.createElement("input");
		txtIssuer.type = "text";
		txtIssuer.style.gridArea = "2 / 5";
		grid.appendChild(txtIssuer);

		const lblTemplate = document.createElement("div");
		lblTemplate.textContent = "Template:";
		lblTemplate.style.gridArea = "3 / 4";
		grid.appendChild(lblTemplate);
		const txtTemplate = document.createElement("select");
		txtTemplate.style.gridArea = "3 / 5";
		grid.appendChild(txtTemplate);
		
		const lblBanner = document.createElement("div");
		lblBanner.textContent = "Banner:";
		lblBanner.style.gridArea = "4 / 4";
		grid.appendChild(lblBanner);
		const txtBanner = document.createElement("select");
		txtBanner.style.gridArea = "4 / 5";
		grid.appendChild(txtBanner);

		for (let i=0; i<DebitNotes.TEMPLATES.length; i++) {
			const option = document.createElement("option");
			option.value = DebitNotes.TEMPLATES[i].content;
			option.text = DebitNotes.TEMPLATES[i].name;
			txtTemplate.appendChild(option);
		}

		for (let i=0; i<DebitNotes.BANNERS.length; i++) {
			const option = document.createElement("option");
			option.value = DebitNotes.BANNERS[i];
			option.text = DebitNotes.BANNERS[i];
			txtBanner.appendChild(option);
		}

		const divStatus = document.createElement("div");
		divStatus.style.gridArea = "5 / 5";
		grid.appendChild(divStatus);
		const chkStatus = document.createElement("input");
		chkStatus.type = "checkbox";
		divStatus.appendChild(chkStatus);
		this.AddCheckBoxLabel(divStatus, chkStatus, "Short-term");

		const btnAddEquip = document.createElement("input");
		btnAddEquip.type = "button";
		btnAddEquip.value = "Add";
		btnAddEquip.style.maxWidth = "72px";
		btnAddEquip.style.margin = "0 40px";
		innerBox.appendChild(btnAddEquip);

		const lstEquip = document.createElement("div");
		lstEquip.className = "debit-equip-list";
		innerBox.appendChild(lstEquip);

		const AddEquip = ()=> {
			const newEntry = document.createElement("div");
			newEntry.className = "debit-equip-entry";
			lstEquip.appendChild(newEntry);

			const txtDescription = document.createElement("input");
			txtDescription.type = "text";
			txtDescription.placeholder = "Description";
			txtDescription.setAttribute("list", "DESCRIPTION_DATALIST");

			const txtModel = document.createElement("input");
			txtModel.type = "text";
			txtModel.placeholder = "Model";

			const txtSerialNo = document.createElement("input");
			txtSerialNo.type = "text";
			txtSerialNo.placeholder = "Serial number";

			const txtQuantity = document.createElement("input");
			txtQuantity.type = "number";
			txtQuantity.min = 1;
			txtQuantity.max = 1000;
			txtQuantity.value = 1;

			newEntry.append(txtDescription, txtModel, txtSerialNo, txtQuantity);

			const btnRemove = document.createElement("input");
			btnRemove.type = "button";
			btnRemove.value = " ";
			newEntry.appendChild(btnRemove);

			let modelId = "m" + new Date().getTime();
			const modelsDatalist = document.createElement("datalist");
			modelsDatalist.id = modelId;
			newEntry.appendChild(modelsDatalist);
			txtModel.setAttribute("list", modelId);

			let serialId = "s" + new Date().getTime();
			const serialDatalist = document.createElement("datalist");
			serialDatalist.id = serialId;
			newEntry.appendChild(serialDatalist);
			txtSerialNo.setAttribute("list", serialId);

			txtDescription.onchange = txtDescription.oninput = ()=> {
				if (!(txtDescription.value in DebitNotes.MODELS)) return;

				if (DebitNotes.MODELS[txtDescription.value].length == 1) {
					txtModel.value = DebitNotes.MODELS[txtDescription.value][0];
					txtModel.onchange();
				}
				else {
					if (!DebitNotes.MODELS[txtDescription.value].includes(txtModel.value)) txtModel.value = "";

					while (modelsDatalist.firstChild != null) modelsDatalist.removeChild(modelsDatalist.firstChild);
					for (let i = 0; i < DebitNotes.MODELS[txtDescription.value].length; i++) {
						const option = document.createElement("option");
						option.value = DebitNotes.MODELS[txtDescription.value][i];
						modelsDatalist.appendChild(option);
					}
				}
			};

			txtModel.onchange = txtModel.oninput = ()=> {
				if (!(txtModel.value in DebitNotes.SERIAL_NUMBERS)) return;

				if (DebitNotes.SERIAL_NUMBERS[txtModel.value].length == 1) {
					txtSerialNo.value = DebitNotes.SERIAL_NUMBERS[txtModel.value][0];
				}
				else {
					if (!DebitNotes.SERIAL_NUMBERS[txtModel.value].includes(txtModel.value)) txtSerialNo.value = "";

					while (serialDatalist.firstChild != null) serialDatalist.removeChild(serialDatalist.firstChild);
					for (let i = 0; i < DebitNotes.SERIAL_NUMBERS[txtModel.value].length; i++) {
						const option = document.createElement("option");
						option.value = DebitNotes.SERIAL_NUMBERS[txtModel.value][i];
						serialDatalist.appendChild(option);
					}
				}
			};

			btnRemove.onclick = ()=> lstEquip.removeChild(newEntry);

			return {
				descriptionBox : txtDescription,
				modelBox       : txtModel,
				serialBox      : txtSerialNo,
				quantityBox    : txtQuantity}
		};

		btnFindUser.onclick = ()=> {
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

			const txtFind = document.createElement("input");
			txtFind.type = "text";
			txtFind.placeholder = "Search";
			dialog.appendChild(txtFind);

			const divUsers = document.createElement("div");
			divUsers.className = "no-results";
			divUsers.style.position = "absolute";
			divUsers.style.left = divUsers.style.right = "0";
			divUsers.style.top = divUsers.style.bottom = "48px";
			divUsers.style.overflowY = "auto";
			dialog.appendChild(divUsers);

			const pnlButtons = document.createElement("div");
			pnlButtons.style.bottom = "8px";
			pnlButtons.style.width = "100%";
			pnlButtons.style.height = "40px";
			pnlButtons.style.position = "absolute";
			pnlButtons.style.textAlign = "center";
			dialog.appendChild(pnlButtons);

			const btnCancel = document.createElement("input");
			btnCancel.type = "button";
			btnCancel.value = "Cancel";
			btnCancel.style.bottom = "8px";
			pnlButtons.appendChild(btnCancel);

			txtFind.onchange = txtFind.oninput = ()=> {
				divUsers.textContent = "";

				let keywords = [];
				if (txtFind.value.trim().length > 0)
					keywords = txtFind.value.trim().toLowerCase().split(" ");

				let usersColumns;
				if (localStorage.getItem("userslist_columns"))
					usersColumns = JSON.parse(localStorage.getItem("userslist_columns"));
				else
					usersColumns = ["title", "department", "first name", "last name", "username", "email"];

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
						txtFirstName.value = firstname;
						txtLastName.value = lastname;
						txtTitle.value = title;
						txtDep.value = department;

						btnCancel.onclick();
					};

					divUsers.appendChild(element);
				}
			};

			btnCancel.onclick = ()=> {
				innerBox.style.filter = "none";
				innerBox.parentElement.removeChild(container);
			};

			txtFind.focus();
			txtFind.onchange();
		};

		btnAddEquip.onclick = ()=> AddEquip();

		btnCreate.addEventListener("click", async ()=>{
			let body = {
				date       : UI.UnixDateToTicks(new Date().getTime()),
				status     : chkStatus.checked ? "short" : "long",
				template   : txtTemplate.value,
				banner     : txtBanner.value,
				firstname  : txtFirstName.value,
				lastname   : txtLastName.value,
				title      : txtTitle.value,
				department : txtDep.value,
				issuer     : txtIssuer.value,
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
			chkStatus     : chkStatus,
			txtFirstName  : txtFirstName,
			txtLastName   : txtLastName,
			txtTitle      : txtTitle,
			txtDep        : txtDep,
			txtIssuer     : txtIssuer,
			txtTemplate   : txtTemplate,
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
		const txtFirstName = obj.txtFirstName;
		const txtLastName = obj.txtLastName;
		const txtTitle = obj.txtTitle;
		const txtDep = obj.txtDep;
		const txtIssuer = obj.txtIssuer;
		const txtTemplate = obj.txtTemplate;
		const chkStatus = obj.chkStatus;
		const lstEquip = obj.lstEquip;
		const AddEquip = obj.AddEquip;

		txtFirstName.value = this.selectedDebit.firstname;
		txtLastName.value = this.selectedDebit.lastname;
		txtTitle.value = this.selectedDebit.title;
		txtDep.value = this.selectedDebit.department;
		txtIssuer.value = this.selectedDebit.issuer;
		chkStatus.checked = this.selectedDebit.status === "short";

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
		newPrint.onload = ()=> { newPrint.print(); };
		newPrint.document.close();
		setTimeout(()=> { newPrint.close(); }, 99);
	}
}
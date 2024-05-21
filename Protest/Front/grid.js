class Grid extends Window {
	constructor(data) {
		super();
		this.data = data;
		this.sort = null;
		this.filters = {};
		this.hideNull = [];
		this.mods = {};

		this.AddCssDependencies("grid.css");

		this.content.style.overflow = "hidden";

		this.SetupToolbar();
		const reloadButton = this.AddToolbarButton("Reload", "/mono/restart.svg?light");
		const saveButton = this.AddToolbarButton("Save modifications", "/mono/floppy.svg?light");
		const removeFilterButton = this.AddToolbarButton("Remove all filters", "/mono/nofilter.svg?light");

		this.findAttributeInput = document.createElement("input");
		this.findAttributeInput.className = "grid-find-box";
		this.findAttributeInput.type = "text";
		this.findAttributeInput.placeholder = "Find attribute";

		const noneButton = document.createElement("button");
		noneButton.setAttribute("tip-below", "Select none");
		noneButton.classList = "grid-none-button";

		const allButton = document.createElement("button");
		allButton.setAttribute("tip-below", "Select all");
		allButton.classList = "grid-all-button";

		this.sideList = document.createElement("div");
		this.sideList.className = "grid-side-list";

		this.table = document.createElement("div");
		this.table.className = "grid-table";

		this.heading = document.createElement("div");
		this.heading.className = "grid-heading";
		this.table.appendChild(this.heading);

		const toggleButton = document.createElement("input");
		toggleButton.type = "button";
		toggleButton.className = "grid-toggle-button";

		this.content.append(this.findAttributeInput, noneButton, allButton, toggleButton, this.sideList, this.table);

		this.SetupFloatingMenu();
		this.floating.tabIndex = 0;
		this.floating.style.top = "32px";
		this.floating.style.width = "150px";
		this.floating.style.maxHeight = "fit-content";
		this.floating.style.zIndex = "5";
		this.floating.style.transformOrigin = "0 0";
		this.floating.style.transitionDelay = "0s";
		this.floating.style.transition = "transform .2s, opacity .2s, visibility .2s";

		this.floating.onblur = event=>this.ColumnOptions_onblur(event);

		this.sortOption = document.createElement("div");
		this.sortOption.className = "grid-menu-option";
		this.sortOption.textContent = "Sort";
		this.sortOption.style.backgroundImage = "url(/mono/sort.svg)";
		this.sortOption.onclick = ()=> this.ColumnOptions_Sort();

		this.filterOption = document.createElement("div");
		this.filterOption.className = "grid-menu-option";
		this.filterOption.textContent = "Filter";
		this.filterOption.style.backgroundImage = "url(/mono/filter.svg)";
		this.filterOption.onclick = ()=> this.ColumnOptions_Filter();

		this.hideNullOption = document.createElement("div");
		this.hideNullOption.className = "grid-menu-option";
		this.hideNullOption.textContent = "Hide null";
		this.hideNullOption.style.backgroundImage = "url(/mono/clear.svg)";
		this.hideNullOption.onclick = ()=> this.ColumnOptions_HideNull();

		this.renameOption = document.createElement("div");
		this.renameOption.className = "grid-menu-option";
		this.renameOption.textContent = "Rename column";
		this.renameOption.style.backgroundImage = "url(/mono/rename.svg)";
		this.renameOption.onclick = ()=> this.ColumnOptions_Rename();

		this.editAllOption = document.createElement("div");
		this.editAllOption.className = "grid-menu-option";
		this.editAllOption.textContent = "Edit all";
		this.editAllOption.style.backgroundImage = "url(/mono/edit.svg)";
		this.editAllOption.onclick = ()=> this.ColumnOptions_EditAll();

		this.removeAllOption = document.createElement("div");
		this.removeAllOption.className = "grid-menu-option";
		this.removeAllOption.textContent = "Remove all";
		this.removeAllOption.style.backgroundImage = "url(/mono/delete.svg)";
		this.removeAllOption.onclick = ()=> this.ColumnOptions_RemoveAll();

		this.revertOption = document.createElement("div");
		this.revertOption.className = "grid-menu-option";
		this.revertOption.textContent = "Revert";
		this.revertOption.style.backgroundImage = "url(/mono/restart.svg)";
		this.revertOption.onclick = ()=> this.ColumnOptions_RevertAll();

		this.floating.append(this.sortOption, this.filterOption, this.hideNullOption, this.renameOption, this.editAllOption, this.removeAllOption, this.revertOption);

		let attributes = new Set();
		for (const key in data) {
			for (const attr in data[key]) {
				attributes.add(attr);
			}
		}
		attributes = Array.from(attributes).sort();

		const defaultColumns = (this instanceof DevicesGrid) ?
			["name", "type", "ip", "hostname", "mac address", "serial number"] :
			["first name", "last name", "username", "e-mail"];

		this.attributeElements = [];
		for (let i=0; i < attributes.length; i++) {
			this.CreateAttribute(attributes[i], defaultColumns.includes(attributes[i]));
		}

		this.table.onscroll = ()=> {
			this.UpdateViewport();
			this.ColumnOptions_onblur();
		};

		saveButton.onclick = ()=> {this.Save_onclick()};
		removeFilterButton.onclick = ()=> this.RemoveFilters_onclick();
		reloadButton.onclick = ()=> this.Reload_onclick();

		noneButton.onclick = ()=> {
			for (let i=0; i<this.attributeElements.length; i++) {
				if (this.attributeElements[i].element.style.display === "none") continue;
				this.attributeElements[i].element.childNodes[0].checked = false;
			}
			this.UpdateHeading();
			this.UpdateTable();
		};

		allButton.onclick = ()=> {
			for (let i=0; i<this.attributeElements.length; i++) {
				if (this.attributeElements[i].element.style.display === "none") continue;
				this.attributeElements[i].element.childNodes[0].checked = true;
			}
			this.UpdateHeading();
			this.UpdateTable();
		};

		this.findAttributeInput.oninput =
		this.findAttributeInput.onchange = ()=> {
			for (let i = 0; i<this.attributeElements.length; i++) {
				if (this.attributeElements[i].name.includes(this.findAttributeInput.value)) {
					this.attributeElements[i].element.style.display = "block";
				}
				else {
					this.attributeElements[i].element.style.display = "none";
				}
			}
		};

		toggleButton.onclick =()=> {
			if (this.table.style.left === "0px") {
				toggleButton.style.left = "216px";
				toggleButton.style.top = "32px";
				toggleButton.style.backgroundImage = "url(/mono/guitarpick.svg?light)";
				toggleButton.style.transform = "rotate(90deg)";
				this.table.style.left = "258px";

				this.findAttributeInput.style.opacity = "1";
				this.sideList.style.opacity = "1";
				noneButton.style.opacity = allButton.style.opacity = "1";

				this.findAttributeInput.style.visibility = "visible";
				this.sideList.style.visibility = "visible";
				noneButton.style.visibility = allButton.style.visibility = "visible";
			}
			else {
				toggleButton.style.left = "2px";
				toggleButton.style.top = "2px";
				toggleButton.style.backgroundImage = "url(/mono/guitarpick.svg)";
				toggleButton.style.transform = "rotate(-90deg)";
				this.table.style.left = "0px";

				this.findAttributeInput.style.opacity = "0";
				this.sideList.style.opacity = "0";
				noneButton.style.opacity = allButton.style.opacity = "0";

				this.findAttributeInput.style.visibility = "hidden";
				this.sideList.style.visibility = "hidden";
				noneButton.style.visibility = allButton.style.visibility = "hidden";
			}
		};

		this.UpdateHeading();
		setTimeout(()=> this.UpdateTable(), 50);
	}

	CreateAttribute(attributesName, checked) {
		const element = document.createElement("div");
		this.sideList.appendChild(element);

		const toggle = this.CreateToggle(attributesName, checked, element);
		toggle.label.style.width = "calc(100% - 48px)";

		this.attributeElements.push({
			name: attributesName,
			element: element,
			checkbox: toggle.checkbox
		});

		toggle.checkbox.onchange = ()=> {
			this.UpdateHeading();
			this.UpdateTable();
		};

		return element;
	}

	PopOut() { //overrides
		super.PopOut();
		setTimeout(()=> this.UpdateViewport(), 200);
	}

	AfterResize() { //overrides
		this.UpdateViewport();
	}

	Save_onclick() {
		let modsCount = Object.keys(this.mods).length;
		if (modsCount === 0) {
			this.ConfirmBox("No modifications has been made", true);
			return;
		}

		this.ConfirmBox("Are you sure you want to save all modifications?").addEventListener("click", ()=>{
			modsCount = 0;
			for (let file in this.mods) {
				modsCount += Object.keys(this.mods[file]).length;
			}

			setTimeout(()=>{
				this.Save();
			}, 250);
		});
	}

	async Save() {
		const dialog = this.DialogBox("200px");
		if (dialog === null) return;

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
		status.textContent = "Saving...";
		status.style.textAlign = "center";
		status.style.fontWeight = "bold";
		status.style.animation = "delayed-fade-in 1.5s ease-in 1";
		dialog.innerBox.appendChild(status);

		dialog.innerBox.parentElement.style.transition = ".4s";
		dialog.innerBox.parentElement.style.height = "180px";

		dialog.cancelButton.disabled = true;

		try {
			let url = (this instanceof DevicesGrid) ? `db/device/grid` : `db/user/grid`;

			const response = await fetch(url, {
				method: "POST",
				body : JSON.stringify(this.mods)
			});

			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const json = await response.json();
			if (json.error) {
				throw new Error(json.error);
			}

			dialog.cancelButton.onclick();
		}
		catch (ex) {
			dialog.innerBox.parentElement.style.transition = ".4s";
			dialog.innerBox.parentElement.style.height = "120px";
			dialog.innerBox.textContent = "";
			dialog.cancelButton.value = "Close";
			dialog.cancelButton.disabled = false;

			const errorBox = document.createElement("div");
			errorBox.textContent = ex;
			errorBox.style.textAlign = "center";
			errorBox.style.fontWeight = "600";
			errorBox.style.padding = "20px";
			dialog.innerBox.appendChild(errorBox);
		}
	}

	RemoveFilters_onclick() {
		let filtersCount = Object.keys(this.filters).length;
		if (filtersCount === 0 && this.hideNull.length === 0) {
			this.ConfirmBox("No filters applied", true);
			return;
		}

		this.filters = {};
		this.hideNull = [];

		this.UpdateHeading();
		this.UpdateTable();
	}

	Reload_onclick() {
		let modsCount = Object.keys(this.mods).length;
		if (modsCount === 0) {
			this.ConfirmBox("No modifications has been made", true);
			return;
		}

		this.ConfirmBox("Are you sure you want to undo all modifications?").addEventListener("click", ()=>{
			modsCount = 0;
			for (let file in this.mods) {
				modsCount += Object.keys(this.mods[file]).length;
			}

			this.ConfirmBox(`${modsCount} ${modsCount===1?"modification has":"modifications have"} been undone`, true);

			this.mods = {};
			this.UpdateTable();
		});
	}

	ColumnOptions_onclick(event) {
		this.floating.style.display = "initial";
		this.floating.style.visibility = "visible";
		this.floating.style.opacity = "1";
		this.floating.style.transform = "none";

		let left = this.table.offsetLeft + 50 + event.target.parentElement.offsetLeft + event.target.offsetLeft - this.table.scrollLeft - 65;
		if (left > this.content.clientWidth - 158) left = this.content.clientWidth - 158;
		this.floating.style.left = `${left}px`;

		this.selectedColumn = event.target.parentElement.textContent;

		if (this.sort === this.selectedColumn) {
			this.sortOption.setAttribute("checked", "");
		}
		else {
			this.sortOption.removeAttribute("checked");
		}

		if (this.filters[this.selectedColumn]) {
			this.filterOption.setAttribute("checked", "");
		}
		else {
			this.filterOption.removeAttribute("checked");
		}

		let indexHideNull = this.hideNull.indexOf(this.selectedColumn);
		if (indexHideNull > -1) {
			this.hideNullOption.setAttribute("checked", "");
		}
		else {
			this.hideNullOption.removeAttribute("checked");
		}

		window.requestAnimationFrame(()=>{
			this.floating.focus();
			setTimeout(()=> this.floating.focus(), 50);
		});
	}

	ColumnOptions_onblur(event) {
		//this.floating.style.display = "none";
		this.floating.style.visibility = "hidden";
		this.floating.style.opacity = "0";
		this.floating.style.transform = "scaleY(.2)";
	}

	ColumnOptions_Sort() {
		if (!this.selectedColumn) return;

		if (this.sort === this.selectedColumn) {
			this.sort = null;
			this.sortOption.removeAttribute("checked");
		}
		else {
			this.sort = this.selectedColumn;
			this.sortOption.setAttribute("checked", "");
		}

		this.UpdateHeading();
		this.UpdateTable();
	}

	ColumnOptions_Filter() {
		if (!this.selectedColumn) return;

		const dialog = this.DialogBox("108px");
		if (dialog === null) return;

		dialog.innerBox.parentElement.style.maxWidth = "400px";
		dialog.innerBox.style.textAlign = "center";

		const filterInput = document.createElement("input");
		filterInput.type = "text";
		filterInput.value = this.filters[this.selectedColumn] ?? "";
		filterInput.placeholder = "filter";
		filterInput.style.marginTop = "20px";
		filterInput.style.width = "min(calc(100% - 8px), 200px)";
		dialog.innerBox.appendChild(filterInput);

		filterInput.focus();
		filterInput.select();

		dialog.okButton.onclick = ()=> {
			dialog.cancelButton.onclick();
			if (filterInput.value.length > 0) {
				this.filters[this.selectedColumn] = filterInput.value.toLocaleLowerCase();
				this.filterOption.setAttribute("checked", "");
			}
			else {
				delete this.filters[this.selectedColumn];
				this.filterOption.removeAttribute("checked");
			}

			this.UpdateHeading();
			this.UpdateTable();
		};

		filterInput.onkeydown = event=> {
			if (event.key === "Enter") {
				dialog.okButton.click();
			}
		}
	}

	ColumnOptions_HideNull() {
		if (!this.selectedColumn) return;

		let index = this.hideNull.indexOf(this.selectedColumn);
		if (index > -1) {
			this.hideNull.splice(index, 1);
			this.hideNullOption.removeAttribute("checked");
		}
		else {
			this.hideNull.push(this.selectedColumn);
			this.hideNullOption.setAttribute("checked", "");
		}

		this.UpdateHeading();
		this.UpdateTable();
	}

	ColumnOptions_Rename() {
		if (!this.selectedColumn) return;

		const dialog = this.DialogBox("108px");
		if (dialog === null) return;

		dialog.innerBox.parentElement.style.maxWidth = "400px";
		dialog.innerBox.style.textAlign = "center";

		const nameInput = document.createElement("input");
		nameInput.type = "text";
		nameInput.value = this.selectedColumn;
		nameInput.placeholder = "column name";
		nameInput.style.marginTop = "20px";
		nameInput.style.width = "min(calc(100% - 8px), 200px)";
		dialog.innerBox.appendChild(nameInput);

		nameInput.focus();
		nameInput.select();

		dialog.okButton.onclick = ()=> {
			let newName = nameInput.value.trim().toLocaleLowerCase();
			if (newName.length === 0) return;
			dialog.cancelButton.onclick();

			for (let element of this.table.childNodes) {
				let id = element.getAttribute("id");
				if (!id) continue;

				if (!(this.selectedColumn in this.data[id])) continue;

				let value = this.data[id][this.selectedColumn].v;

				if (!(id in this.mods)) this.mods[id] = {};
				this.mods[id][this.selectedColumn] = "";
				this.mods[id][newName] = value;
			}

			let attributeListItem = this.attributeElements.find(o=>o.name === newName);
			if (attributeListItem) {
				attributeListItem.checkbox.checked = true;
			}
			else {
				let element = this.CreateAttribute(newName, true);
				element.scrollIntoView({ behavior: "smooth"});
				setTimeout(()=>{element.style.animation = "highlight .8s 1"}, 500);
			}

			this.UpdateHeading();
			this.UpdateTable();
		};

		nameInput.onkeydown = event=> {
			if (event.key === "Enter") {
				dialog.okButton.click();
			}
		}
	}

	ColumnOptions_EditAll() {
		if (!this.selectedColumn) return;

		const dialog = this.DialogBox("108px");
		if (dialog === null) return;

		dialog.innerBox.parentElement.style.maxWidth = "400px";
		dialog.innerBox.style.textAlign = "center";

		const newValueInput = document.createElement("input");
		newValueInput.type = "text";
		newValueInput.placeholder = "value";
		newValueInput.style.marginTop = "20px";
		newValueInput.style.width = "min(calc(100% - 8px), 200px)";
		dialog.innerBox.appendChild(newValueInput);

		newValueInput.focus();

		dialog.okButton.onclick = ()=> {
			if (newValueInput.value.length === 0) return;
			dialog.cancelButton.onclick();

			for (let element of this.table.childNodes) {
				let id = element.getAttribute("id");
				if (!id) continue;

				if (!(id in this.mods)) this.mods[id] = {};
				this.mods[id][this.selectedColumn] = newValueInput.value;
			}
			this.UpdateTable();
		};

		newValueInput.onkeydown = event=> {
			if (event.key === "Enter") {
				dialog.okButton.click();
			}
		}
	}

	ColumnOptions_RemoveAll() {
		if (!this.selectedColumn) return;

		for (let element of this.table.childNodes) {
			let id = element.getAttribute("id");
			if (!id) continue;

			if (!(id in this.mods)) this.mods[id] = {};
			this.mods[id][this.selectedColumn] = "";
		}

		this.UpdateTable();
	}

	ColumnOptions_RevertAll() {
		if (!this.selectedColumn) return;

		for (let file in this.mods) {
			if (this.selectedColumn in this.mods[file]) {
				delete this.mods[file][this.selectedColumn];

				if (Object.keys(this.mods[file]).length === 0) {
					delete this.mods[file];
				}
			}
		}

		this.UpdateTable();
	}

	UpdateHeading() {
		this.heading.textContent = "";

		for (let i=0; i < this.attributeElements.length; i++) {
			if (!this.attributeElements[i].checkbox.checked) continue;
			const columnHeading = document.createElement("div");
			columnHeading.textContent = this.attributeElements[i].name;
			this.heading.appendChild(columnHeading);

			const columnOptions = document.createElement("div");
			columnOptions.className = "grid-heading-overflow";
			columnOptions.onclick = event=>this.ColumnOptions_onclick(event);
			columnHeading.appendChild(columnOptions);

			const filters = document.createElement("div");
			filters.className = "grid-heading-filters";
			columnHeading.appendChild(filters);

			if (this.sort === this.attributeElements[i].name) {
				const icon = document.createElement("div");
				icon.style.backgroundImage = "url(/mono/sort.svg?light)";
				filters.appendChild(icon);
			}
			if (this.attributeElements[i].name in this.filters) {
				const icon = document.createElement("div");
				icon.style.backgroundImage = "url(/mono/filter.svg?light)";
				filters.appendChild(icon);
			}
			if (this.hideNull.includes(this.attributeElements[i].name)) {
				const icon = document.createElement("div");
				icon.style.backgroundImage = "url(/mono/clear.svg?light)";
				filters.appendChild(icon);
			}
		}
	}

	UpdateTable() {
		this.table.textContent = "";
		this.table.append(this.heading);

		let filtered = [];

		for (let key in this.data) {
			let skip = false;

			for (let i = 0; i < this.hideNull.length; i++) {
				if (!(this.hideNull[i] in this.data[key])) {
					skip = true;
					break;
				}
			}
			if (skip) continue;

			for (let filter in this.filters) {
				if (!(filter in this.data[key])) {
					skip = true;
					break;
				}
				if (this.data[key][filter].v.toLocaleLowerCase().indexOf(this.filters[filter]) === -1) {
					skip = true;
					break;
				}
			}
			if (skip) continue;

			filtered.push(key);
		}

		if (this.sort) {
			const attr = this.sort;

			filtered = filtered.sort((a, b)=> {
				if (this.data[a][attr] == undefined && this.data[b][attr] == undefined) return 0;
				if (this.data[a][attr] == undefined) return 1;
				if (this.data[b][attr] == undefined) return -1;
				if (this.data[a][attr].v < this.data[b][attr].v) return -1;
				if (this.data[a][attr].v > this.data[b][attr].v) return 1;
				return 0;
			});
		}

		for (let i = 0; i < filtered.length; i++) {
			const element = document.createElement("div");
			element.id = filtered[i];
			element.className = "grid-entry";
			this.table.appendChild(element);
		}

		this.UpdateViewport();
	}

	UpdateViewport() {
		let columns = [];
		for (let i=0; i<this.attributeElements.length; i++) {
			if (!this.attributeElements[i].checkbox.checked) continue;
			columns.push(this.attributeElements[i].name);
		}

		for (let i = 0; i < this.table.childNodes.length; i++) {
			const key = this.table.childNodes[i].getAttribute("id");
			if (key === null) continue;

			if (this.table.childNodes[i].offsetTop - this.table.scrollTop < 4 ||
				this.table.childNodes[i].offsetTop - this.table.scrollTop > this.table.clientHeight) {
				this.table.childNodes[i].textContent = "";
			}
			else {
				if (this.table.childNodes[i].childNodes.length > 0) continue;
				this.InflateElement(key, columns, this.table.childNodes[i], this.data[key]);
			}
		}
	}

	InflateElement(file, columns, element, entry) {
		for (let i=0; i<columns.length; i++) {
			const input = document.createElement("input");
			input.type = "text";
			input.onchange = event=> this.Cell_onchange(event);

			if (file in this.mods && columns[i] in this.mods[file]) {
 				input.value = this.mods[file][columns[i]];
			}
			else if (columns[i] in entry){
				input.value = entry[columns[i]].v;
			}

			element.appendChild(input);
			this.UpdateCellIcon(input, file, columns[i]);
		}
	}

	Cell_onchange(event) {
		const file = event.target.parentElement.getAttribute("id");
		const index = Array.from(event.target.parentElement.childNodes).findIndex(o=>o === event.target);
		const attribute = this.heading.childNodes[index].textContent;
		const oldValue = this.data[file][attribute]?.v;
		const newValue = event.target.value.trim();

		if (oldValue === undefined && newValue.length === 0) { //null
			if (this.mods[file]) {
				delete this.mods[file][attribute];
				if (Object.keys(this.mods[file]).length === 0) {
					delete this.mods[file];
				}
			}
		}
		else if (newValue !== oldValue) { //edit
			if (!(file in this.mods)) {
				this.mods[file] = {};
			}
			this.mods[file][attribute] = newValue;
		}
		else { //same
			if (this.mods[file]) {
				delete this.mods[file][attribute];
				if (Object.keys(this.mods[file]).length === 0) {
					delete this.mods[file];
				}
			}
		}

		this.UpdateCellIcon(event.target, file, attribute);
	}

	UpdateCellIcon(input, file, attribute) {
		const oldValue = this.data[file][attribute]?.v;
		const newValue = input.value;

		if (oldValue === undefined && newValue.length === 0) {
			input.style.backgroundImage = "url(/mono/clear.svg)";
			input.style.backgroundPosition = "center";
		}
		else if (newValue !== oldValue) {
			if (oldValue === undefined) {
				input.style.backgroundImage = "url(/mono/add.svg)";
				input.style.backgroundPosition = "calc(100% - 4px)";
			}
			else if (newValue.length === 0) {
				input.style.backgroundImage = "url(/mono/delete.svg)";
				input.style.backgroundPosition = "calc(100% - 4px)";
			}
			else {
				input.style.backgroundImage = "url(/mono/edit.svg)";
				input.style.backgroundPosition = "calc(100% - 4px)";
			}
		}
		else if (attribute.includes("password")) {
			input.style.backgroundImage = "url(/mono/lock.svg)";
			input.style.backgroundPosition = "center";
		}
		else {
			input.style.backgroundImage = "none";
		}
	}

}
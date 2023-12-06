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
		const btnReload = this.AddToolbarButton("Reload", "/mono/restart.svg?light");
		const btnSave = this.AddToolbarButton("Save modifications", "/mono/floppy.svg?light");
		const btnRemoveFilter = this.AddToolbarButton("Remove all filters", "/mono/nofilter.svg?light");
		
		this.txtFindAttribute = document.createElement("input");
		this.txtFindAttribute.className = "grid-find-box";
		this.txtFindAttribute.type = "text";
		this.txtFindAttribute.placeholder = "Find attribute";

		const btnNone = document.createElement("button");
		btnNone.setAttribute("tip-below", "Select none");
		btnNone.classList = "grid-none-button";

		const btnAll = document.createElement("button");
		btnAll.setAttribute("tip-below", "Select all");
		btnAll.classList = "grid-all-button";

		this.sideList = document.createElement("div");
		this.sideList.className = "grid-side-list";

		this.table = document.createElement("div");
		this.table.className = "grid-table";

		this.heading = document.createElement("div");
		this.heading.className = "grid-heading";
		this.table.appendChild(this.heading);

		const btnToggle = document.createElement("input");
		btnToggle.type = "button";
		btnToggle.className = "grid-toggle-button";
	
		this.content.append(this.txtFindAttribute, btnNone, btnAll, btnToggle, this.sideList, this.table);

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

		this.optSort = document.createElement("div");
		this.optSort.className = "grid-menu-option";
		this.optSort.textContent = "Sort";
		this.optSort.style.backgroundImage = "url(/mono/sort.svg)";
		this.optSort.onclick = ()=> { this.ColumnOptions_Sort() };

		this.optFilter = document.createElement("div");
		this.optFilter.className = "grid-menu-option";
		this.optFilter.textContent = "Filter";
		this.optFilter.style.backgroundImage = "url(/mono/filter.svg)";
		this.optFilter.onclick = ()=> { this.ColumnOptions_Filter() };

		this.optHideNull = document.createElement("div");
		this.optHideNull.className = "grid-menu-option";
		this.optHideNull.textContent = "Hide null";
		this.optHideNull.style.backgroundImage = "url(/mono/clear.svg)";
		this.optHideNull.onclick = ()=> { this.ColumnOptions_HideNull() };

		this.optRename = document.createElement("div");
		this.optRename.className = "grid-menu-option";
		this.optRename.textContent = "Rename column";
		this.optRename.style.backgroundImage = "url(/mono/rename.svg)";
		this.optRename.onclick = ()=> { this.ColumnOptions_Rename() };

		this.optEditAll = document.createElement("div");
		this.optEditAll.className = "grid-menu-option";
		this.optEditAll.textContent = "Edit all";
		this.optEditAll.style.backgroundImage = "url(/mono/edit.svg)";
		this.optEditAll.onclick = ()=> { this.ColumnOptions_EditAll() };

		this.optRemoveAll = document.createElement("div");
		this.optRemoveAll.className = "grid-menu-option";
		this.optRemoveAll.textContent = "Remove all";
		this.optRemoveAll.style.backgroundImage = "url(/mono/delete.svg)";
		this.optRemoveAll.onclick = ()=> { this.ColumnOptions_RemoveAll() };

		this.optRevert = document.createElement("div");
		this.optRevert.className = "grid-menu-option";
		this.optRevert.textContent = "Revert";
		this.optRevert.style.backgroundImage = "url(/mono/restart.svg)";
		this.optRevert.onclick = ()=> { this.ColumnOptions_RevertAll() };

		this.floating.append(this.optSort, this.optFilter, this.optHideNull, this.optRename, this.optEditAll, this.optRemoveAll, this.optRevert);

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

		btnSave.onclick = ()=> {this.Save_onclick()};
		btnRemoveFilter.onclick = ()=> {this.RemoveFilters_onclick()};
		btnReload.onclick = ()=> {this.Reload_onclick()};

		btnNone.onclick = ()=> {
			for (let i=0; i<this.attributeElements.length; i++) {
				if (this.attributeElements[i].element.style.display === "none") continue;
				this.attributeElements[i].element.childNodes[0].checked = false;
			}
			this.UpdateHeading();
			this.UpdateTable();
		};

		btnAll.onclick = ()=> {
			for (let i=0; i<this.attributeElements.length; i++) {
				if (this.attributeElements[i].element.style.display === "none") continue;
				this.attributeElements[i].element.childNodes[0].checked = true;
			}
			this.UpdateHeading();
			this.UpdateTable();
		};

		this.txtFindAttribute.oninput =
		this.txtFindAttribute.onchange = ()=> {
			for (let i = 0; i<this.attributeElements.length; i++) {
				if (this.attributeElements[i].name.includes(this.txtFindAttribute.value)) {
					this.attributeElements[i].element.style.display = "block";
				}
				else {
					this.attributeElements[i].element.style.display = "none";
				}
			}
		};

		btnToggle.onclick =()=> {
			if (this.table.style.left === "0px") {
				btnToggle.style.left = "216px";
				btnToggle.style.top = "32px";
				btnToggle.style.backgroundImage = "url(/mono/guitarpick.svg?light)";
				btnToggle.style.transform = "rotate(90deg)";
				this.table.style.left = "258px";
				
				this.txtFindAttribute.style.opacity = "1";
				this.sideList.style.opacity = "1";
				btnNone.style.opacity = btnAll.style.opacity = "1";

				this.txtFindAttribute.style.visibility = "visible";
				this.sideList.style.visibility = "visible";
				btnNone.style.visibility = btnAll.style.visibility = "visible";
			}
			else {
				btnToggle.style.left = "2px";
				btnToggle.style.top = "2px";
				btnToggle.style.backgroundImage = "url(/mono/guitarpick.svg)";
				btnToggle.style.transform = "rotate(-90deg)";
				this.table.style.left = "0px";

				this.txtFindAttribute.style.opacity = "0";
				this.sideList.style.opacity = "0";
				btnNone.style.opacity = btnAll.style.opacity = "0";

				this.txtFindAttribute.style.visibility = "hidden";
				this.sideList.style.visibility = "hidden";
				btnNone.style.visibility = btnAll.style.visibility = "hidden";
			}
		};

		this.UpdateHeading();
		setTimeout(()=> this.UpdateTable(), 50);
	}

	CreateAttribute(attributesName, checked) {
		const element = document.createElement("div");
		this.sideList.appendChild(element);

		const chkAttr = document.createElement("input");
		chkAttr.type = "checkbox";
		chkAttr.checked = checked;
		element.appendChild(chkAttr);

		const label = this.AddCheckBoxLabel(element, chkAttr, attributesName);
		label.style.width = "calc(100% - 48px)";

		this.attributeElements.push({
			name: attributesName,
			element: element,
			checkbox: chkAttr
		});

		chkAttr.onchange = ()=> {
			this.UpdateHeading();
			this.UpdateTable();
		};

		return element;
	}

	PopOut() { //override
		super.PopOut();
		setTimeout(()=> this.UpdateViewport(), 200);
	}

	AfterResize() { //override
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
		status.textContent = "Saving...";
		status.style.textAlign = "center";
		status.style.fontWeight = "bold";
		status.style.animation = "delayed-fade-in 1.5s ease-in 1";
		dialog.innerBox.appendChild(status);

		dialog.innerBox.parentElement.style.transition = ".4s";
		dialog.innerBox.parentElement.style.height = "180px";

		dialog.btnCancel.disabled = true;

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
	
			dialog.btnCancel.onclick();
		}
		catch (ex) {
			dialog.innerBox.parentElement.style.transition = ".4s";
			dialog.innerBox.parentElement.style.height = "120px";
			dialog.innerBox.textContent = "";
			dialog.btnCancel.value = "Close";
			dialog.btnCancel.disabled = false;

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
			this.optSort.setAttribute("checked", "");
		}
		else {
			this.optSort.removeAttribute("checked");
		}

		if (this.filters[this.selectedColumn]) {
			this.optFilter.setAttribute("checked", "");
		}
		else {
			this.optFilter.removeAttribute("checked");
		}

		let indexHideNull = this.hideNull.indexOf(this.selectedColumn);
		if (indexHideNull > -1) {
			this.optHideNull.setAttribute("checked", "");
		}
		else {
			this.optHideNull.removeAttribute("checked");
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
			this.optSort.removeAttribute("checked");
		}
		else {
			this.sort = this.selectedColumn;
			this.optSort.setAttribute("checked", "");
		}

		this.UpdateHeading();
		this.UpdateTable();
	}

	ColumnOptions_Filter() {
		if (!this.selectedColumn) return;

		const dialog = this.DialogBox("108px");
		dialog.innerBox.parentElement.style.maxWidth = "400px";
		dialog.innerBox.style.textAlign = "center";

		const txtFilter = document.createElement("input");
		txtFilter.type = "text";
		txtFilter.value = this.filters[this.selectedColumn] ?? "";
		txtFilter.placeholder = "filter";
		txtFilter.style.marginTop = "20px";
		txtFilter.style.width = "min(calc(100% - 8px), 200px)";
		dialog.innerBox.appendChild(txtFilter);

		txtFilter.focus();
		txtFilter.select();

		dialog.btnOK.onclick = ()=> {
			dialog.btnCancel.onclick();
			if (txtFilter.value.length > 0) {
				this.filters[this.selectedColumn] = txtFilter.value.toLocaleLowerCase();
				this.optFilter.setAttribute("checked", "");
			}
			else {
				delete this.filters[this.selectedColumn];
				this.optFilter.removeAttribute("checked");
			}

			this.UpdateHeading();
			this.UpdateTable();
		};

		txtFilter.onkeydown = event=> {
			if (event.key === "Enter") {
				dialog.btnOK.click();
			}
		}
	}

	ColumnOptions_HideNull() {
		if (!this.selectedColumn) return;

		let index = this.hideNull.indexOf(this.selectedColumn);
		if (index > -1) {
			this.hideNull.splice(index, 1);
			this.optHideNull.removeAttribute("checked");
		}
		else {
			this.hideNull.push(this.selectedColumn);
			this.optHideNull.setAttribute("checked", "");
		}

		this.UpdateHeading();
		this.UpdateTable();
	}

	ColumnOptions_Rename() {
		if (!this.selectedColumn) return;

		const dialog = this.DialogBox("108px");
		dialog.innerBox.parentElement.style.maxWidth = "400px";
		dialog.innerBox.style.textAlign = "center";

		const txtName = document.createElement("input");
		txtName.type = "text";
		txtName.value = this.selectedColumn;
		txtName.placeholder = "column name";
		txtName.style.marginTop = "20px";
		txtName.style.width = "min(calc(100% - 8px), 200px)";
		dialog.innerBox.appendChild(txtName);

		txtName.focus();
		txtName.select();

		dialog.btnOK.onclick = ()=> {
			let newName = txtName.value.trim().toLocaleLowerCase();
			if (newName.length === 0) return;
			dialog.btnCancel.onclick();

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

		txtName.onkeydown = event=> {
			if (event.key === "Enter") {
				dialog.btnOK.click();
			}
		}
	}

	ColumnOptions_EditAll() {
		if (!this.selectedColumn) return;

		const dialog = this.DialogBox("108px");
		dialog.innerBox.parentElement.style.maxWidth = "400px";
		dialog.innerBox.style.textAlign = "center";

		const txtNewValue = document.createElement("input");
		txtNewValue.type = "text";
		txtNewValue.placeholder = "value";
		txtNewValue.style.marginTop = "20px";
		txtNewValue.style.width = "min(calc(100% - 8px), 200px)";
		dialog.innerBox.appendChild(txtNewValue);

		txtNewValue.focus();

		dialog.btnOK.onclick = ()=> {
			if (txtNewValue.value.length === 0) return;
			dialog.btnCancel.onclick();

			for (let element of this.table.childNodes) {
				let id = element.getAttribute("id");
				if (!id) continue;
	
				if (!(id in this.mods)) this.mods[id] = {};
				this.mods[id][this.selectedColumn] = txtNewValue.value;
			}
			this.UpdateTable();
		};

		txtNewValue.onkeydown = event=> {
			if (event.key === "Enter") {
				dialog.btnOK.click();
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
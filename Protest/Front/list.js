"use strict";
class List extends Window {
	constructor(args) {
		super();

		this.args = args ?? { select: null, sort: "", filter: "", find: "" };
		this.AddCssDependencies("list.css");

		this.link = null;

		this.listBox = new ListBox({
			titleBar: true,
			columnsOptionsEnable: true,
			counter: true,
			defaultColumns: [],
			resolveEntry:   id => this.link?.data ? this.link.data[id] : null,
			resolveType:    (id, entry) => entry?.type?.v?.toLowerCase() || null,
			computeCounter: n => this.link ? (n === this.link.length ? this.link.length : `${n} / ${this.link.length}`) : "0",
			onSelect:       id => { if (id) this.args.select = id; },
			onColumnsOptions: () => this.CustomizeColumns(),
			onSort:         text => { this.args.sort = text; this.RefreshList(); },
			getSort:        () => this.args.sort,
		});
		this.listBox.inflate = (element, entry, type) => this.InflateElement(element, entry, type);
		this.listBox.Attach(this.content);

		this.defaultElement = this.listBox.list;

		this.content.addEventListener("keydown", event=> this.List_keydown(event));
		this.win.addEventListener("mouseup", event=> this.List_mouseup(event));
		this.win.addEventListener("mousemove", event=> this.List_mousemove(event));

		requestAnimationFrame(()=> {
			this.list.focus();
			this.FinalizeColumns();
		});
	}

	get list()           { return this.listBox.list; }
	get listTitle()      { return this.listBox.listTitle; }
	get listTitleOuter() { return this.listBox.listTitleOuter; }
	get columnsOptions() { return this.listBox.columnsOptions; }
	get counter()        { return this.listBox.counter; }

	get selected()  { return this.listBox.selected; }
	set selected(v) { this.listBox.selected = v; }

	get columnsElements()  { return this.listBox.columnsElements; }
	set columnsElements(v) { this.listBox.columnsElements = v; }

	get defaultColumns()  { return this.listBox.defaultColumns; }
	set defaultColumns(v) { this.listBox.defaultColumns = v; }

	get sortDescend()  { return this.listBox.sortDescend; }
	set sortDescend(v) { this.listBox.sortDescend = v; }

	List_keydown(event) {
		if (event.code === "KeyF" && event.ctrlKey) {
			if (this.findInput) {
				event.preventDefault();
				this.findInput.focus();
			}
			return;
		}

		this.listBox.Keydown(event);
	}

	List_mouseup(event) {
		this.listBox.HandleMouseUp(event);
	}

	List_mousemove(event) {
		this.listBox.HandleMouseMove(event);
	}

	SetupColumns(columns) {
		this.listBox.SetupColumns(columns);
	}

	SetupFilter() {
		if (!this.toolbar) return null;

		const filterButton = this.AddToolbarButton(null, "mono/filter.svg?light");

		const filterMenu = document.createElement("div");
		filterMenu.className = "win-toolbar-submenu";
		filterButton.appendChild(filterMenu);

		const filterInput = document.createElement("input");
		filterInput.type = "text";
		filterInput.placeholder = "Find";
		filterMenu.appendChild(filterInput);

		const filtersList = document.createElement("div");
		filtersList.className = "no-results-small";

		filterMenu.appendChild(filtersList);

		let index = -1;

		const ClearSelection = ()=> filtersList.childNodes.forEach(o=> o.style.backgroundColor = "");

		const Refresh = ()=> {
			filterInput.value = filterInput.value.toLowerCase();

			let types = [];
			for (const key in this.link.data) {
				if (!this.link.data[key].type) continue;
				if (types.includes(this.link.data[key].type.v.toLowerCase())) continue;
				if (!this.link.data[key].type.v.toLowerCase().includes(filterInput.value)) continue;
				if (this.link.data[key].type.v.length === 0) continue;
				types.push(this.link.data[key].type.v.toLowerCase());
			}
			types = types.sort();

			filtersList.textContent = "";
			filterMenu.style.height = `${32 + types.length * 33}px`;

			for (let i=0; i<types.length; i++) {
				const newType = document.createElement("div");
				newType.textContent = types[i];
				newType.style.textTransform =  LOADER.alwaysUppercase.includes(types[i]) ? "uppercase" : "capitalize";
				filtersList.appendChild(newType);

				if (this instanceof DevicesList) {
					newType.style.backgroundImage = `url(${types[i] in LOADER.deviceIcons ? LOADER.deviceIcons[types[i]] : "mono/gear.svg"})`;
				}
				else if (this instanceof UsersList) {
					newType.style.backgroundImage = `url(${types[i] in LOADER.userIcons ? LOADER.userIcons[types[i]] : "mono/user.svg"})`;
				}

				if (types[i] === this.args.filter) {
					newType.style.backgroundColor = "var(--clr-select)";
					filterButton.style.borderBottom = "#c0c0c0 solid 3px";
				}

				newType.onclick = ()=> {
					ClearSelection();

					if (this.args.filter === types[i]) {
						this.args.filter = "";
						filterButton.style.borderBottom = "";
					}
					else {
						this.args.filter = types[i];
						filterButton.style.borderBottom = "#c0c0c0 solid 3px";
						newType.style.backgroundColor = "var(--clr-select)";
					}
					this.RefreshList();
				};
			}
		};

		filterMenu.onclick = ()=> filterInput.focus();

		filterInput.onchange = filterInput.oninput = ()=> Refresh();

		filterInput.onkeydown = event=> {
			if (event.key === "Escape") {
				if (filterInput.value === "") {
					this.list.focus();
				}
				else {
					filterInput.value = "";
					filterInput.onchange();
				}
			}
			else if (event.key === "Enter") {
				const types = Array.from(filtersList.childNodes);
				if (index > -1) {
					types[index].onclick();
				}
			}
			else if (event.key === "ArrowUp") {
				const types = Array.from(filtersList.childNodes);
				if (index > -1) {
					types[index].style.backgroundColor = "";
				}

				index--;
				index = Math.max(index, 0);
				types[index].style.backgroundColor = "var(--clr-select)";
				types[index].scrollIntoView({block:"nearest"});

			}
			else if (event.key === "ArrowDown") {
				const types = Array.from(filtersList.childNodes);
				if (index > -1) {
					types[index].style.backgroundColor = "";
				}

				index++;
				index = Math.min(index, types.length - 1);
				types[index].style.backgroundColor = "var(--clr-select)";
				types[index].scrollIntoView({block:"nearest"});
			}
		};

		filterButton.onclick = ()=> setTimeout(filterInput.focus(), 200);

		filterButton.ondblclick = ()=> {
			this.args.filter = "";
			filterButton.style.borderBottom = "";
			ClearSelection();
			this.RefreshList();
		};

		filterButton.onfocus = ()=> {
			if (this.popOutWindow) {
				filterButton.firstChild.style.maxHeight = this.content.clientHeight - 32 + "px";
			}
			else {
				filterButton.firstChild.style.maxHeight = container.clientHeight - this.win.offsetTop - 96 + "px";
			}
		};

		filterMenu.onclick = filterMenu.ondblclick = event=> event.stopPropagation();

		Refresh();

		return filterButton;
	}

	SetupFind() {
		if (!this.toolbar) return null;

		const findButton = this.AddToolbarButton(null, "mono/search.svg?light");
		findButton.tabIndex = "-1";
		findButton.style.overflow = "hidden";
		findButton.style.backgroundPosition = "2px center";

		const findInput = document.createElement("input");
		findInput.type = "text";
		findButton.appendChild(findInput);

		this.findInput = findInput;

		findButton.onfocus = ()=> {
			findInput.focus();
		};
		findInput.onfocus = ()=> {
			findButton.style.width = "200px";
		};

		findInput.onblur = ()=> {
			if (findInput.value.length === 0) findButton.style.width = "36px";
		};

		findInput.onchange = ()=> {
			findInput.parentElement.style.borderBottom = findInput.value.length === 0 ? "none" : "#c0c0c0 solid 2px";
			this.args.find = findInput.value;
			this.RefreshList();
		};

		findInput.ondblclick = event=> {
			if (event.layerX > 36) return;
			findInput.value = "";
			findInput.onchange();
		};

		findInput.onkeydown = event=> {
			if (event.key === "Escape") {
				findInput.value = "";
				findInput.onchange();
			}
			else if (event.code === "KeyF" && event.ctrlKey) {
				event.preventDefault();
			}
		};

		return findInput;
	}

	SetupPrint() {
		if (!this.toolbar) return null;

		const printButton = this.AddToolbarButton("Print", "mono/printer.svg?light");

		printButton.onclick = ()=> {
			const newPrint = window.open();
			newPrint.document.title = this.header.textContent;
			newPrint.document.write("<html><body></body></html>");

			const table = document.createElement("table");
			table.style.borderCollapse = "collapse";
			newPrint.document.body.appendChild(table);

			for (let i=0; i<this.columnsElements.length; i++) {
				const th = document.createElement("th");
				th.style.textTransform = "uppercase";
				th.textContent = this.columnsElements[i].textContent;
				table.appendChild(th);
			}

			for (let i=0; i<this.list.childNodes.length; i++) {
				const entry = this.link.data[this.list.childNodes[i].getAttribute("id")];

				const tr = document.createElement("tr");

				for (let j=0; j<this.columnsElements.length; j++) {
					const td = document.createElement("td");
					td.style.padding = "1px 2px";
					td.style.border = "1px solid #c0c0c0";
					const key = this.columnsElements[j].textContent;
					if (key in entry) {
						td.textContent = entry[key].v;
					}
					tr.appendChild(td);
				}
				table.appendChild(tr);
			}

			newPrint.onload = ()=> newPrint.print();
			newPrint.document.close();
			setTimeout(()=> newPrint.close(), 99);
		};
	}

	PopOut() { //overrides
		super.PopOut();
		this.UpdateViewport(true);

		this.popOutWindow.addEventListener("mouseup", event=> this.List_mouseup(event));
		this.popOutWindow.addEventListener("mousemove", event=> this.List_mousemove(event));
	}

	AfterResize() { //overrides
		this.UpdateViewport();
	}

	LinkData(data) {
		this.link = data;
	}

	FinalizeColumns() {
		this.listBox.FinalizeColumns();
	}

	MatchFilters(entry) {
		if (this.args.filter.length > 0) {
			if (!entry.type) return false;
			if (entry.type.v !== this.args.filter) return false;
		}

		if (this.args.find.length > 0) {
			const keywords = this.args.find.toLowerCase().split(" ");

			for (let i = 0; i < keywords.length; i++) {
				if (keywords[i].length === 0) continue;

				let flag = false;
				for (const key in entry) {
					if (typeof entry[key].v === "string" && entry[key].v.toLowerCase().includes(keywords[i])) {
						flag = true;
						break;
					}
				}
				if (!flag) return false;
			}
		}

		return true;
	}

	RefreshList() {
		this.list.textContent = "";

		if (this.link === null || this.link.data === null) { return; }

		let filtered = [];
		if (this.args.filter.length === 0) {
			for (const key in this.link.data) {
				filtered.push(key);
			}
		}
		else {
			for (const key in this.link.data) {
				if (!this.link.data[key].type) continue;
				if (this.link.data[key].type.v.toLowerCase() !== this.args.filter.toLowerCase()) continue;
				filtered.push(key);
			}
		}

		let found;
		if (this.args.find.length === 0) {
			found = filtered;
		}
		else {
			found = [];
			const keywords = this.args.find.toLowerCase().split(" ").filter(o=> o.length > 0);

			for (let i=0; i<filtered.length; i++) {
				let matched = true;

				for (let j=0; j<keywords.length; j++) {
					let wordIncluded = false;
					for (const key in this.link.data[filtered[i]]) {
						const value = this.link.data[filtered[i]][key].v;
						if (typeof value === "string" && value.toLowerCase().includes(keywords[j])) {
							wordIncluded = true;
							break;
						}
					}

					if (!wordIncluded) {
						matched = false;
						break;
					}
				}

				if (matched) {
					found.push(filtered[i]);
				}
			}
		}

		if (this.args.sort.length > 0) {
			const attr = this.args.sort;

			if (this.sortDescend) {
				found = found.sort((a, b)=> {
					if (this.link.data[a][attr] == undefined && this.link.data[b][attr] == undefined) return 0;
					if (this.link.data[a][attr] == undefined) return -1;
					if (this.link.data[b][attr] == undefined) return 1;
					if (this.link.data[a][attr].v < this.link.data[b][attr].v) return 1;
					if (this.link.data[a][attr].v > this.link.data[b][attr].v) return -1;
					return 0;
				});
			}
			else {
				found = found.sort((a, b)=> {
					if (this.link.data[a][attr] == undefined && this.link.data[b][attr] == undefined) return 0;
					if (this.link.data[a][attr] == undefined) return 1;
					if (this.link.data[b][attr] == undefined) return -1;
					if (this.link.data[a][attr].v < this.link.data[b][attr].v) return -1;
					if (this.link.data[a][attr].v > this.link.data[b][attr].v) return 1;
					return 0;
				});
			}
		}

		for (let i = 0; i < found.length; i++) {
			const newElement = document.createElement("div");
			newElement.id = found[i];
			newElement.className = "list-element";
			this.list.appendChild(newElement);

			if (found[i] === this.args.select) {
				this.selected = newElement;
			}
		}

		if (this.selected) {
			this.selected.style.backgroundColor = "var(--clr-select)";
			const selected = this.selected;
			requestAnimationFrame(() => selected.scrollIntoView({behavior:"smooth", block:"center"}));
		}

		this.OnUiReady();
	}

	OnUiReady(count = 0) {
		if (this.list.clientHeight === 0 && count < 200) {
			setTimeout(()=> this.OnUiReady(++count), 50);
		}
		else {
			this.UpdateViewport();
		}
	}

	UpdateViewport(force = false) {
		this.listBox.UpdateViewport(force);
	}

	InflateElement(element, entry, c_type) { //overridable
		ListBox.prototype.InflateElement.call(this.listBox, element, entry, c_type);
	}

	CustomizeColumns() {
		const dialog = this.DialogBox("500px");
		if (dialog === null) return;

		const {okButton, cancelButton, innerBox, buttonBox} = dialog;

		innerBox.style.display = "grid";
		innerBox.style.padding = "8px";
		innerBox.style.gridGap = "4px";
		innerBox.style.gridTemplateColumns = "auto min(400px, 76%) min(108px, 16%) auto";
		innerBox.style.gridTemplateRows = "32px auto";

		const filterInput = document.createElement("input");
		filterInput.type = "text";
		filterInput.placeholder = "Find";
		filterInput.style.gridColumn = "2";
		filterInput.style.gridRow = "1";
		innerBox.appendChild(filterInput);

		const listbox = document.createElement("div");
		listbox.className = "check-list";
		listbox.style.margin = "0 4px";
		listbox.style.gridColumn = "2";
		listbox.style.gridRow = "2";
		innerBox.appendChild(listbox);

		const buttons = document.createElement("div");
		buttons.style.gridColumn = "3";
		buttons.style.gridRow = "2";
		buttons.style.overflow = "hidden";
		innerBox.appendChild(buttons);

		const moveUpButton = document.createElement("input");
		moveUpButton.disabled = true;
		moveUpButton.type = "button";
		moveUpButton.value = "Move up";
		moveUpButton.style.width = "calc(100% - 8px)";
		moveUpButton.style.minWidth = "20px";
		buttons.appendChild(moveUpButton);

		const moveDownButton = document.createElement("input");
		moveDownButton.disabled = true;
		moveDownButton.type = "button";
		moveDownButton.value = "Move down";
		moveDownButton.style.width = "calc(100% - 8px)";
		moveDownButton.style.minWidth = "20px";
		buttons.appendChild(moveDownButton);

		const revertButton = document.createElement("input");
		revertButton.type = "button";
		revertButton.value = "Revert";
		revertButton.style.width = "calc(100% - 8px)";
		revertButton.style.minWidth = "20px";
		revertButton.style.marginTop = "16px";
		buttons.appendChild(revertButton);

		const resetButton = document.createElement("input");
		resetButton.type = "button";
		resetButton.value = "Reset";
		resetButton.style.width = "calc(100% - 8px)";
		resetButton.style.minWidth = "20px";
		buttons.appendChild(resetButton);


		let checkList = {};
		const CreateListItem = (attr, value)=> {
			const newAttr = document.createElement("div");
			const newToggle = this.CreateToggle(attr, attr in checkList ? checkList[attr] : value, newAttr);

			listbox.appendChild(newAttr);
			checkList[attr] = newToggle.checkbox.checked;

			newToggle.label.onmousedown = event=> event.stopPropagation();

			newAttr.onmousedown = ()=> {
				newToggle.checkbox.checked = !newToggle.checkbox.checked;
				checkList[attr] = newToggle.checkbox.checked;
			};

			newToggle.checkbox.onchange = ()=> {
				checkList[attr] = newToggle.checkbox.checked;
			};
		};

		const Refresh = ()=> {
			let attributes = [];
			listbox.textContent = "";
			let keyword = filterInput.value.toLowerCase();
			for (let i = 0; i < this.columnsElements.length; i++) { //selected
				let attr = this.columnsElements[i].textContent;
				if (attributes.includes(attr)) continue;
				if (!attr.includes(keyword)) continue;
				CreateListItem(attr, true);
				attributes.push(attr);
			}

			for (let i = 0; i < this.defaultColumns.length; i++) { //default
				let attr = this.defaultColumns[i];
				if (attributes.includes(attr)) continue;
				if (!attr.includes(keyword)) continue;
				CreateListItem(attr, false);
				attributes.push(attr);
			}

			for (const key in this.link.data) { //all attributes
				for (const attr in this.link.data[key]) {
					if (attributes.includes(attr)) continue;
					if (!attr.includes(keyword)) continue;
					CreateListItem(attr, false);
					attributes.push(attr);
				}
			}
		};

		const Apply = ()=> {
			this.listTitle.textContent = "";
			this.columnsElements = [];

			let columns = [];
			for (let key in checkList) {
				if (!checkList[key]) continue;
				columns.push(key);
			}

			this.SetupColumns(columns);
			this.UpdateViewport(true);

			this.args.columns = columns;
		};

		filterInput.onchange = ()=> Refresh();

		revertButton.onclick = ()=> {
			checkList = {};
			Refresh();
		};

		resetButton.onclick = ()=> {
			checkList = {};
			this.defaultColumns.forEach(o=> checkList[o] = true);
			Refresh();
		};

		const applyAllButton = document.createElement("input");
		applyAllButton.type = "button";
		applyAllButton.value = "Apply to all";
		applyAllButton.style.width = "100px";

		okButton.value = "Apply";

		buttonBox.appendChild(applyAllButton);
		buttonBox.appendChild(okButton);
		buttonBox.appendChild(cancelButton);

		applyAllButton.addEventListener("click", ()=> {
			Apply();
			cancelButton.onclick();
			localStorage.setItem(`${this.constructor.name.toLowerCase()}_columns`, JSON.stringify(this.columnsElements.map(o=> o.textContent)));
		});

		okButton.addEventListener("click", ()=>Apply());

		Refresh();

		setTimeout(()=>filterInput.focus(), 200);
	}
}
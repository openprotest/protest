class List extends Window {
	constructor(args) {
		super();
		this.MIN_CELL_SIZE = 40;

		this.args = args ?? { select: null, sort: "", filter: "", find: "" };
		this.AddCssDependencies("list.css");

		this.link = null;

		this.defaultColumns = [];
		this.columnsElements = [];
		this.sortDescend = false;
		this.resizingColumnElement = null;
		this.movingColumnElement = null;
		this.mouseX0 = 0;
		this.width0 = 0;
		this.left0 = 0;
		this.columnsWidth0 = [];

		this.list = document.createElement("div");
		this.list.className = "list-listbox no-results";
		this.list.onscroll = ()=> this.UpdateViewport();
		this.content.appendChild(this.list);

		this.listTitle = document.createElement("div");
		this.listTitle.className = "list-title";
		this.content.appendChild(this.listTitle);

		this.columnsOptions = document.createElement("div");
		this.columnsOptions.className = "list-columns-options";
		this.columnsOptions.onclick = ()=> this.CustomizeColumns();
		this.listTitle.appendChild(this.columnsOptions);

		this.counter = document.createElement("div");
		this.counter.className = "list-counter";
		this.content.appendChild(this.counter);

		this.list.tabIndex = 0;
		this.defaultElement = this.list;

		this.content.addEventListener("keydown", event=> this.List_keydown(event));
		this.win.addEventListener("mouseup", event=> this.List_mouseup(event));
		this.win.addEventListener("mousemove", event=> this.List_mousemove(event));

		requestAnimationFrame(()=> this.list.focus());
	}

	List_keydown(event) {
		if (event.code === "KeyF" && event.ctrlKey) {
			if (this.findInput) {
				event.preventDefault();
				this.findInput.focus();
			}
		}
		else if (event.code === "ArrowUp" && this.selected) {
			const previousElement = this.selected.previousElementSibling;
			if (previousElement) {
				event.preventDefault();
				const selectedIcon = this.selected.querySelector(".list-element-icon");
				if (selectedIcon) {
					selectedIcon.style.backgroundColor = "";
				}

				this.selected.style.backgroundColor = "";
				this.selected = previousElement;
				this.selected.style.backgroundColor = "var(--clr-select)";
				this.selected.scrollIntoView({block:"nearest"});

				const id = this.selected.getAttribute("id");
				if (id) this.args.select = id;
			}
		}
		else if (event.code === "ArrowDown") {
			const nextElement = this.selected
				? this.selected.nextElementSibling
				: this.list.firstChild;

			if (nextElement) {
				event.preventDefault();
				if (this.selected) {
					const selectedIcon = this.selected.querySelector(".list-element-icon");
					if (selectedIcon) {
						selectedIcon.style.backgroundColor = "";
					}
					this.selected.style.backgroundColor = "";
				}

				this.selected = nextElement;
				this.selected.style.backgroundColor = "var(--clr-select)";
				this.selected.scrollIntoView({block:"nearest"});

				const id = this.selected.getAttribute("id");
				if (id) this.args.select = id;
			}
		}
		else if (event.code === "PageUp" && this.selected) {
			const elements = Array.from(this.list.childNodes);
			if (elements.length === 0) return;

			const index    = elements.indexOf(this.selected);
			const jump     = Math.floor(this.list.clientHeight / this.selected.clientHeight);
			const previous = Math.max(index - jump + 1, 0);

			event.preventDefault();
			this.selected.style.backgroundColor = "";
			this.selected = elements[previous];
			this.selected.style.backgroundColor = "var(--clr-select)";
			this.selected.scrollIntoView({block:"nearest"});
		}
		else if (event.code === "PageDown" && this.selected) {
			const elements = Array.from(this.list.childNodes);
			if (elements.length === 0) return;

			const index    = elements.indexOf(this.selected);
			const jump     = Math.floor(this.list.clientHeight / this.selected.clientHeight);
			const next     = Math.min(index + jump - 1, elements.length - 1);

			event.preventDefault();
			this.selected.style.backgroundColor = "";
			this.selected = elements[next];
			this.selected.style.backgroundColor = "var(--clr-select)";
			this.selected.scrollIntoView({block:"nearest"});
		}

		else if (event.code === "Home" && this.selected) {
			event.preventDefault();
			const element = Array.from(this.list.childNodes)[0];

			this.selected.style.backgroundColor = "";
			this.selected = element;
			this.selected.style.backgroundColor = "var(--clr-select)";
			this.selected.scrollIntoView({block:"nearest"});
		}
		else if (event.code === "End" && this.selected) {
			event.preventDefault();
			const elements = Array.from(this.list.childNodes);

			this.selected.style.backgroundColor = "";
			this.selected = elements[elements.length - 1];
			this.selected.style.backgroundColor = "var(--clr-select)";
			this.selected.scrollIntoView({block:"nearest"});
		}
		else if (event.code === "Enter" || event.code === "NumpadEnter" && this.selected) {
			this.selected?.ondblclick(event);
		}
	}

	List_mouseup(event) {
		if (this.resizingColumnElement || this.movingColumnElement) this.FinalizeColumns();
	}

	List_mousemove(event) {
		if (event.buttons !== 1) {
			if (this.resizingColumnElement || this.movingColumnElement) this.FinalizeColumns();
			return;
		}

		if (this.resizingColumnElement) {
			const index = this.columnsElements.indexOf(this.resizingColumnElement);
			const totalWidth = this.columnsWidth0.slice(index + 1).reduce((accu, current)=> accu + current);

			let targetWidth = Math.max(this.width0 + event.x - this.mouseX0, this.MIN_CELL_SIZE);

			const availableWidth = this.listTitle.offsetWidth - (this.resizingColumnElement.offsetLeft + targetWidth);

			let minWidth = 2160;
			for (let i = index + 1; i < this.columnsElements.length; i++) {
				let w = availableWidth * this.columnsWidth0[i] / totalWidth;
				if (w < minWidth) minWidth = w;
			}

			if (minWidth < this.MIN_CELL_SIZE) return;

			this.resizingColumnElement.style.width = `${100 * targetWidth / this.listTitle.offsetWidth}%`;

			for (let i = index + 1; i < this.columnsElements.length; i++) {
				let l = this.columnsElements[i - 1].offsetLeft + this.columnsElements[i - 1].offsetWidth;
				let w = availableWidth * this.columnsWidth0[i] / totalWidth;
				this.columnsElements[i].style.left = `${100 * l / this.listTitle.offsetWidth}%`;
				this.columnsElements[i].style.width = `${100 * w / this.listTitle.offsetWidth}%`;
			}
		}

		if (this.movingColumnElement) {
			let targetX = this.left0 + event.x - this.mouseX0;
			this.movingColumnElement.style.left = `${100 * targetX / this.listTitle.offsetWidth}%`;

			this.columnsElements = this.columnsElements.sort((a, b)=> a.offsetLeft - b.offsetLeft);

			for (let i = 0; i < this.columnsElements.length; i++) {
				if (this.columnsElements[i] === this.movingColumnElement) continue;

				let x = 0;
				for (let j = 0; j < i; j++) {
					x += this.columnsElements[j].offsetWidth;
				}
				this.columnsElements[i].style.left = `${100 * x / this.listTitle.offsetWidth}%`;
			}
		}
	}

	SetupColumns(columns) {
		this.columnsElements = [];
		while (this.listTitle.firstChild) this.listTitle.removeChild(this.listTitle.firstChild);

		let isLastMouseActionMeaningful = false;

		const Column_onmousedown = event=> {
			let index = this.columnsElements.indexOf(event.target);
			this.mouseX0 = event.x;

			isLastMouseActionMeaningful = false;

			if (event.layerX > event.target.offsetWidth - 8) {
				if (index >= this.columnsElements.length - 1) return;
				this.columnsElements.forEach(o=> o.style.transition = "0s");
				this.width0 = event.target.offsetWidth;
				this.columnsWidth0 = this.columnsElements.map(o=> o.offsetWidth);
				this.resizingColumnElement = event.target;
			}
			else {
				event.target.style.zIndex = "1";
				event.target.style.opacity = ".8";
				event.target.style.transition = "0s";
				this.left0 = event.target.offsetLeft;
				this.movingColumnElement = event.target;
			}
		};

		const Column_onmousemove = event=> {
			let index = this.columnsElements.indexOf(event.target);

			if (index < this.columnsElements.length - 1) {
				event.target.style.cursor = event.layerX > event.target.offsetWidth - 8 ? "ew-resize" : "inherit";
			}

			if (index >= this.columnsElements.length) return;

			if (event.buttons !== 1) return;
			let delta = this.mouseX0 - event.x;

			if (Math.abs(delta) !== 0) {
				isLastMouseActionMeaningful = true;
			}
		};

		const Column_onmouseup = event=> {
			if (isLastMouseActionMeaningful) return;
			if (event.button !== 0) return;

			const isAscend = event.target.className === "list-sort-ascend";

			this.columnsElements.forEach(o=> o.className = "");
			if (isAscend) {
				event.target.className = "list-sort-descend";
				this.sortDescend = true;
			}
			else {
				event.target.className = "list-sort-ascend";
				this.sortDescend = false;
			}

			this.args.sort = event.target.textContent;
			this.RefreshList();
		};

		for (let i = 0; i < columns.length; i++) {
			const newColumn = document.createElement("div");
			newColumn.style.left = `${100 * i / columns.length}%`;
			newColumn.style.width = `${100 / columns.length}%`;
			newColumn.style.textTransform = LOADER.alwaysUppercase.includes(columns[i]) ? "uppercase" : "capitalize";

			if (this.args.sort === columns[i]) {
				newColumn.className = "list-sort-ascend";
			}

			newColumn.onmousedown = event=> Column_onmousedown(event);
			newColumn.onmousemove = event=> Column_onmousemove(event);
			newColumn.onmouseup = event=> Column_onmouseup(event);

			newColumn.textContent = columns[i];
			this.columnsElements.push(newColumn);
			this.listTitle.appendChild(newColumn);
		}

		this.listTitle.appendChild(this.columnsOptions);

		setTimeout(()=> this.FinalizeColumns(), 400);

		this.UpdateViewport();
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
		this.resizingColumnElement = null;
		this.movingColumnElement = null;

		this.columnsElements = this.columnsElements.sort((a, b)=> a.offsetLeft - b.offsetLeft);

		//remove elements and append them in the correct order
		this.listTitle.textContent = "";
		for (let i = 0; i < this.columnsElements.length; i++) {
			this.listTitle.appendChild(this.columnsElements[i]);
		}
		this.listTitle.appendChild(this.columnsOptions);

		for (let i = 0; i < this.columnsElements.length; i++) {
			this.columnsElements[i].style.transition = ".2s";
			this.columnsElements[i].style.opacity = "1";
			this.columnsElements[i].style.zIndex = "0";
			this.columnsElements[i].style.cursor = "inherit";

			let x = 0;
			for (let j = 0; j < i; j++) {
				x += this.columnsElements[j].offsetWidth;
			}

			this.columnsElements[i].style.left = `${100 * x / this.listTitle.offsetWidth}%`;
			this.columnsElements[i].style.width = `${100 * this.columnsElements[i].offsetWidth / this.listTitle.offsetWidth}%`;
		}

		this.UpdateViewport(true);
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
		const childNodes = this.list.childNodes;

		for (let i=0; i<childNodes.length; i++) {
			const node = childNodes[i];
			if (force) node.textContent = "";

			const nodeOffsetTop = node.offsetTop - this.list.scrollTop;
			if (nodeOffsetTop < -32 || nodeOffsetTop > this.list.clientHeight) {
				node.textContent = "";
			}
			else if (node.childNodes.length === 0) {
				const key = node.getAttribute("id");
				const type = this.link.data[key].type?.v?.toLowerCase() || null;
				this.InflateElement(node, this.link.data[key], type);
			}
		}

		if (this.link) {
			this.counter.textContent = childNodes.length === this.link.length
				? this.link.length
				: `${childNodes.length} / ${this.link.length}`;
		}
		else {
			this.counter.textContent = "0";
		}
	}

	InflateElement(element, entry, c_type) { //overridable
		for (let i=0; i<this.columnsElements.length; i++) {
			if (!(this.columnsElements[i].textContent in entry)) continue;

			const value = entry[this.columnsElements[i].textContent].v;
			if (value.length === 0) continue;

			const newAttr = document.createElement("div");
			newAttr.textContent = value;
			element.appendChild(newAttr);

			if (i === 0) {
				newAttr.style.left = "36px";
				newAttr.style.width = `calc(${this.columnsElements[0].style.width} - 36px)`;
			}
			else {
				newAttr.style.left = this.columnsElements[i].style.left;
				newAttr.style.width = this.columnsElements[i].style.width;
			}
		}

		element.onclick = ()=> {
			if (this.selected) this.selected.style.backgroundColor = "";
			this.args.select = element.getAttribute("id");
			this.selected = element;
			element.style.backgroundColor = "var(--clr-select)";
		};
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
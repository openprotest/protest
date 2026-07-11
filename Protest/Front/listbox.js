"use strict";
class ListBox {
	static MIN_CELL_SIZE = 40;

	constructor(args) {
		this.args = {
			titleBar            : true,
			columnsOptionsEnable: true,
			counter             : true,
			virtualize          : true,
			builtInSort         : false,
			firstColumnOffset   : "36px",
			defaultColumns      : [],
			resolveEntry        : null,
			resolveType         : null,
			computeCounter      : null,
			onSelect            : null,
			onColumnsOptions    : null,
			onSort              : null,
			getSort             : null,
			onDoubleClick       : null,
			inflate             : null,
			...args
		};

		this.items = [];
		this.selected = null;
		this.defaultColumns = this.args.defaultColumns;
		this.columnsElements = [];
		this.sortColumnElement = null;
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
		this.list.tabIndex = 0;

		this.listTitleOuter = null;
		this.listTitle = null;
		this.columnsOptions = null;
		this.counter = null;

		if (this.args.titleBar) {
			this.listTitleOuter = document.createElement("div");
			this.listTitleOuter.className = "list-title-outer";

			this.listTitle = document.createElement("div");
			this.listTitle.className = "list-title";
			this.listTitleOuter.appendChild(this.listTitle);

			if (this.args.columnsOptionsEnable) {
				this.columnsOptions = document.createElement("div");
				this.columnsOptions.className = "list-columns-options";
				this.columnsOptions.onclick = ()=> this.args.onColumnsOptions?.();
				this.listTitleOuter.appendChild(this.columnsOptions);
			}
		}

		if (this.args.counter) {
			this.counter = document.createElement("div");
			this.counter.className = "list-counter";
		}
	}

	Attach(container) {
		container.appendChild(this.list);
		if (this.listTitleOuter) container.appendChild(this.listTitleOuter);
		if (this.counter) container.appendChild(this.counter);
	}

	Select(element) {
		if (!element) return;

		if (this.selected) {
			const selectedIcon = this.selected.querySelector(".list-element-icon");
			if (selectedIcon) {
				selectedIcon.style.backgroundColor = "";
			}
			this.selected.style.backgroundColor = "";
		}

		this.selected = element;
		element.style.backgroundColor = "var(--clr-select)";
		element.scrollIntoView({block:"nearest"});

		this.args.onSelect?.(element.getAttribute("id"), element);
	}

	Keydown(event) {
		if (event.code === "ArrowUp" && this.selected) {
			const previous = this.selected.previousElementSibling;
			if (!previous) return;

			event.preventDefault();
			this.Select(previous);
		}
		else if (event.code === "ArrowDown") {
			const next = this.selected
				? this.selected.nextElementSibling
				: this.list.firstChild;
			if (!next) return;

			event.preventDefault();
			this.Select(next);
		}
		else if ((event.code === "PageUp" || event.code === "PageDown") && this.selected) {
			const elements = Array.from(this.list.childNodes);
			if (elements.length === 0) return;

			const index = elements.indexOf(this.selected);
			const jump  = Math.floor(this.list.clientHeight / this.selected.clientHeight);
			const target = event.code === "PageUp"
				? Math.max(index - jump + 1, 0)
				: Math.min(index + jump - 1, elements.length - 1);

			event.preventDefault();
			this.Select(elements[target]);
		}
		else if (event.code === "Home" && this.selected) {
			event.preventDefault();
			this.Select(this.list.firstChild);
		}
		else if (event.code === "End" && this.selected) {
			event.preventDefault();
			this.Select(this.list.lastChild);
		}
		else if (event.code === "Enter" || event.code === "NumpadEnter") {
			if (this.selected && this.selected.ondblclick) {
				this.selected.ondblclick(event);
			}
		}
	}

	HandleMouseUp(event) {
		if (this.resizingColumnElement || this.movingColumnElement) this.FinalizeColumns();
	}

	HandleMouseMove(event) {
		if (event.buttons !== 1) {
			if (this.resizingColumnElement || this.movingColumnElement) this.FinalizeColumns();
			return;
		}

		if (this.resizingColumnElement) {
			const index = this.columnsElements.indexOf(this.resizingColumnElement);
			const totalWidth = this.columnsWidth0.slice(index + 1).reduce((accu, current)=> accu + current);

			let targetWidth = Math.max(this.width0 + event.x - this.mouseX0, ListBox.MIN_CELL_SIZE);

			const availableWidth = this.listTitle.offsetWidth - (this.resizingColumnElement.offsetLeft + targetWidth);

			let minWidth = 2160;
			for (let i = index + 1; i < this.columnsElements.length; i++) {
				let w = availableWidth * this.columnsWidth0[i] / totalWidth;
				if (w < minWidth) minWidth = w;
			}

			if (minWidth < ListBox.MIN_CELL_SIZE) return;

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

			for (let i=0; i<this.columnsElements.length; i++) {
				if (this.columnsElements[i] === this.movingColumnElement) continue;

				let x = 0;
				for (let j=0; j<i; j++) {
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

			if (this.args.builtInSort) {
				this.sortColumnElement = event.target;
				this.ApplySort();
				this.UpdateViewport(true);
			}

			this.args.onSort?.(event.target.textContent, this.sortDescend);
		};

		for (let i=0; i<columns.length; i++) {
			const def = typeof columns[i] === "string" ? {label:columns[i]} : columns[i];

			const newColumn = document.createElement("div");
			newColumn._def = def;
			newColumn.style.left = `${100 * i / columns.length}%`;
			newColumn.style.width = `${100 / columns.length}%`;

			if (this.args.getSort?.() === def.label) {
				newColumn.className = "list-sort-ascend";
			}

			newColumn.onmousedown = event=> Column_onmousedown(event);
			newColumn.onmousemove = event=> Column_onmousemove(event);
			newColumn.onmouseup = event=> Column_onmouseup(event);

			newColumn.textContent = def.label;
			this.columnsElements.push(newColumn);
			this.listTitle.appendChild(newColumn);
		}

		if (this.columnsOptions) {
			this.listTitleOuter.appendChild(this.columnsOptions);
		}

		setTimeout(()=> this.FinalizeColumns(), 400);

		this.UpdateViewport();
	}

	FinalizeColumns() {
		this.resizingColumnElement = null;
		this.movingColumnElement = null;

		const scrollBarWidth = this.list.offsetWidth - this.list.clientWidth;
		this.listTitle.style.right = `${scrollBarWidth}px`;

		this.columnsElements = this.columnsElements.sort((a, b)=> a.offsetLeft - b.offsetLeft);

		this.listTitle.replaceChildren(...this.columnsElements);

		for (let i=0; i<this.columnsElements.length; i++) {
			this.columnsElements[i].style.transition = ".2s";
			this.columnsElements[i].style.opacity = "1";
			this.columnsElements[i].style.zIndex = "0";
			this.columnsElements[i].style.cursor = "inherit";

			let x = 0;
			for (let j=0; j<i; j++) {
				x += this.columnsElements[j].offsetWidth;
			}

			this.columnsElements[i].style.left = `${100 * x / this.listTitle.offsetWidth}%`;
			this.columnsElements[i].style.width = `${100 * this.columnsElements[i].offsetWidth / this.listTitle.offsetWidth}%`;
		}

		requestAnimationFrame(()=> {
			for (let i=0; i<this.columnsElements.length; i++) {
				const text = this.columnsElements[i].textContent.trim();
				this.columnsElements[i].style.textTransform = LOADER.alwaysUppercase.includes(text)
					? "uppercase"
					: "capitalize";
			}
		});

		this.UpdateViewport(true);
	}

	UpdateViewport(force = false) {
		if (!this.args.virtualize) {
			if (this.counter) {
				this.counter.textContent = this.args.computeCounter?.(this.list.childNodes.length) ?? this.list.childNodes.length;
			}
			return;
		}

		const childNodes = this.list.childNodes;

		for (let i=0; i<childNodes.length; i++) {
			const node = childNodes[i];
			if (force) node.textContent = "";

			const nodeOffsetTop = node.offsetTop - this.list.scrollTop;
			if (nodeOffsetTop < -32 || nodeOffsetTop > this.list.clientHeight) {
				node.textContent = "";
			}
			else if (node.childNodes.length === 0) {
				let entry, type;
				if (node._data !== undefined) {
					entry = node._data;
					type = this.args.resolveType?.(null, entry) ?? null;
				}
				else {
					const key = node.getAttribute("id");
					entry = this.args.resolveEntry?.(key) ?? null;
					if (entry === null) continue;
					type = this.args.resolveType?.(key, entry) ?? null;
				}

				if (this.args.inflate) {
					this.args.inflate(node, entry, type);
				}
				else {
					this.InflateElement(node, entry, type);
				}
			}
		}

		if (this.counter) {
			this.counter.textContent = this.args.computeCounter?.(childNodes.length) ?? childNodes.length;
		}
	}

	InflateElement(element, entry, type) { //overridable
		for (let i=0; i<this.columnsElements.length; i++) {
			const column = this.columnsElements[i];
			const def = column._def ?? {label:column.textContent};

			let cell;
			if (typeof def.render === "function") {
				cell = def.render(entry, element);
				if (!cell) continue;
			}
			else if (typeof def.value === "function") {
				const value = def.value(entry);
				if (value === undefined || value === null || String(value).length === 0) continue;
				cell = document.createElement("div");
				cell.textContent = value;
			}
			else {
				if (!(def.label in entry)) continue;
				const value = entry[def.label].v;
				if (value.length === 0) continue;
				cell = document.createElement("div");
				cell.textContent = value;
			}

			element.appendChild(cell);

			if (i === 0) {
				cell.style.left = this.args.firstColumnOffset;
				cell.style.width = `calc(${column.style.width} - ${this.args.firstColumnOffset})`;
			}
			else {
				cell.style.left = column.style.left;
				cell.style.width = column.style.width;
			}
		}

		element.onclick = ()=> this.Select(element);

		if (this.args.onDoubleClick) {
			element.ondblclick = ()=> this.args.onDoubleClick(entry, element);
		}
	}

	SetItems(items) {
		this.items = items ?? [];
		this.selected = null;
		this.list.textContent = "";

		for (let i=0; i<this.items.length; i++) {
			const element = document.createElement("div");
			element.className = "list-element";
			element._data = this.items[i];
			this.list.appendChild(element);
		}

		this.ApplySort();
		this.UpdateViewport(true);
	}

	ApplySort() {
		if (!this.args.builtInSort || !this.sortColumnElement) return;

		const def = this.sortColumnElement._def ?? {label:this.sortColumnElement.textContent};
		const ValueOf = data=> {
			if (data == null) return undefined;
			if (typeof def.sortValue === "function") return def.sortValue(data);
			if (typeof def.value === "function") return def.value(data);
			return data[def.label]?.v ?? data[def.label];
		};

		const direction = this.sortDescend ? -1 : 1;
		const nodes = Array.from(this.list.childNodes).sort((a, b)=> {
			const va = ValueOf(a._data);
			const vb = ValueOf(b._data);
			if (va == null && vb == null) return 0;
			if (va == null) return 1;
			if (vb == null) return -1;
			if (va < vb) return -1 * direction;
			if (va > vb) return 1 * direction;
			return 0;
		});

		this.list.replaceChildren(...nodes);
	}
}

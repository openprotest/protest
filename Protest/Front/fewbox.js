"use strict";
class FewBox {
	constructor(options) {
		this.options = options;
		this.index = -1;
		this.selected = null;
		this.itemElements = [];
		this.isCollapsed = false;

		Window.AddCssDependencies("fewbox.css");

		this.container = document.createElement("div");
		this.container.tabIndex = 0;
		this.container.className = "few-box";
		this.container.value = null;
		this.container.selectedIndex = -1;
		this.container.onchange = null;

		this.Initialize(options);

		this.resizeObserver = new ResizeObserver(()=> this.CheckOverflow());
		this.resizeObserver.observe(this.container);

		this.container.addEventListener("keydown", event=> this.Container_onkeydown(event));

		return this.container;
	}

	Initialize(options) {
		this.itemsRow = document.createElement("div");
		this.itemsRow.className = "few-box-items";

		for (let i=0; i<options.length; i++) {
			const option = document.createElement("div");
			option.textContent = options[i];

			option.onclick = event=> {
				event.stopPropagation();
				this.Select(i);
				this.container.focus();
			};

			this.itemsRow.appendChild(option);
			this.itemElements.push(option);
		}

		this.select = document.createElement("select");
		this.select.className = "few-box-select";
		for (let i=0; i<options.length; i++) {
			this.select.appendChild(new Option(options[i], i));
		}
		this.select.selectedIndex = -1;
		this.select.onchange = ()=> this.Select(this.select.selectedIndex);

		this.container.append(this.itemsRow, this.select);
	}

	CheckOverflow() {
		const overflows = this.itemsRow.scrollWidth > this.container.clientWidth + 1;
		if (overflows === this.isCollapsed) return;

		this.isCollapsed = overflows;
		this.container.classList.toggle("collapsed", this.isCollapsed);
		this.container.tabIndex = this.isCollapsed ? -1 : 0;
	}

	Select(index) {
		if (index < 0 || index >= this.options.length || index === this.index) return;

		if (this.index >= 0) this.itemElements[this.index].classList.remove("selected");
		this.index = index;
		this.selected = this.options[index];
		this.itemElements[this.index].classList.add("selected");
		this.select.selectedIndex = this.index;

		this.container.value = this.selected;
		this.container.selectedIndex = this.index;

		if (this.container.onchange) this.container.onchange();
	}

	Container_onkeydown(event) {
		if (this.isCollapsed) return;

		if (event.key === "ArrowRight") { event.preventDefault(); this.Select(Math.min((this.index < 0 ? -1 : this.index) + 1, this.options.length - 1)); }
		else if (event.key === "ArrowLeft") { event.preventDefault(); this.Select(Math.max(this.index - 1, 0)); }
	}
}

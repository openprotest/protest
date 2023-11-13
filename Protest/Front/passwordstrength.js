class PasswordStrength extends List {
	constructor(params) {
		super(params);

		this.params = params ?? {find:"", filter:"", sort:"", select:null};

		this.SetTitle("Password strength");
		this.SetIcon("mono/strength.svg");

		this.AddCssDependencies("passwordstrength.css");

		this.defaultColumns = ["name", "strength", "modified", "time to crack"];
		this.SetupColumns(this.defaultColumns);
		this.columnsOptions.style.display = "none";

		this.SetupToolbar();
		const btnGandalf = this.AddToolbarButton("Gandalf", "mono/gandalf.svg?light");
		this.toolbar.appendChild(this.AddToolbarSeparator());
		this.filterButton = this.SetupFilter();
		this.findInput = this.SetupFind();

		if (this.params.find && this.params.find.length > 0) {
			this.findInput.value = this.params.find;
			this.findInput.parentElement.style.borderBottom = this.findInput.value.length === 0 ? "none" : "var(--clr-light) solid 2px";
			this.findInput.parentElement.style.width = "200px";
		}

		btnGandalf.onclick = ()=> { new Gandalf(); };
		
		this.GetEntropy();
	}

	SetupFilter() { //override
		if (!this.toolbar) return null;

		const filterButton = this.AddToolbarButton(null, "mono/filter.svg?light");

		const filterMenu = document.createElement("div");
		filterMenu.className = "win-toolbar-submenu";
		filterButton.appendChild(filterMenu);

		const findFilter = document.createElement("input");
		findFilter.type = "text";
		findFilter.placeholder = "Find";
		filterMenu.appendChild(findFilter);

		const filtersList = document.createElement("div");
		filtersList.className = "no-results-small";

		filterMenu.appendChild(filtersList);

		const ClearSelection = ()=> filtersList.childNodes.forEach(o=> o.style.backgroundColor = "");

		const Refresh = ()=> {
			let types = ["device", "user"];

			filtersList.textContent = "";
			filterMenu.style.height = `${32 + types.length * 26}px`;

			for (let i = 0; i < types.length; i++) {
				const newType = document.createElement("div");
				newType.textContent = types[i];
				filtersList.appendChild(newType);

				if (types[i] === this.params.filter) {
					newType.style.backgroundColor = "var(--clr-select)";
					filterButton.style.borderBottom = "var(--clr-light) solid 3px";
				}

				newType.onclick = ()=> {
					ClearSelection();

					if (this.params.filter === types[i]) {
						this.params.filter = "";
						filterButton.style.borderBottom = "";
					}
					else {
						this.params.filter = types[i];
						filterButton.style.borderBottom = "var(--clr-light) solid 3px";
						newType.style.backgroundColor = "var(--clr-select)";
					}

					this.RefreshList();
				};
			}
		};

		findFilter.onchange = ()=> Refresh();

		findFilter.onkeydown = event=> {
			if (event.key === "Escape") {
				findFilter.value = "";
				findFilter.onchange();
			}
		};

		filterButton.ondblclick = ()=> {
			this.params.filter = "";
			filterButton.style.borderBottom = "";
			ClearSelection();
			this.RefreshList();

		};

		filterButton.onfocus = ()=> {
			if (this.popOutWindow)
				filterButton.firstChild.style.maxHeight = this.content.clientHeight - 32 + "px";
			else
				filterButton.firstChild.style.maxHeight = container.clientHeight - this.win.offsetTop - 96 + "px";
		};

		filterMenu.onclick = filterMenu.ondblclick = event=> {
			event.stopPropagation();
		};

		Refresh();

		return filterButton;
	}

	async GetEntropy(callback) {
		try {
			const response = await fetch("db/getentropy");
			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);
			const json = await response.json();
			if (json.error) throw(json.error);

			this.link = json;

			this.RefreshList();
		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/error.svg").addEventListener("click", ()=> this.Close());
		}
	}

	RefreshList() {
		this.list.textContent = "";

		let filtered = [];
		if (this.params.filter.length === 0) {
			for (let i = 0; i < this.link.length; i++) {
				filtered.push(i);
			}
		}
		else {
			for (let i = 0; i < this.link.length; i++) {
				if (!this.link[i].type) continue;
				if (this.link[i].type !== this.params.filter) continue;
				filtered.push(i);
			}
		}

		let found;
		if (this.params.find && this.params.find.length === 0) {
			found = filtered;
		}
		else {
			found = [];
			const keywords = this.params.find.toLowerCase().split(" ").filter(o=> o.length > 0);
			
			for (let i = 0; i < filtered.length; i++) {
				let name = this.link[filtered[i]].name.toLowerCase();
				let matched = true;

				for (let j = 0; j < keywords.length; j++) {
					let wordIncluded = false;
					if (name.includes(keywords[j])) {
						wordIncluded = true;
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

		this.found = found;

		if (this.params.sort && this.params.sort.length > 0) {
			let attr;
			switch (this.params.sort) {
			case "name":
				attr = "name";
				break;
			case "strength":
				attr = "entropy";
				break;
			case "modified":
				attr = "date";
				break;
			case "time to crack":
				attr = "entropy";
				break;
			}

			if (this.sortDescend) {
				found = found.sort((a, b)=> {
					if (this.link[a][attr] < this.link[b][attr]) return 1;
					if (this.link[a][attr] > this.link[b][attr]) return -1;
					return 0;
				});
			}
			else {
				found = found.sort((a, b)=> {
					if (this.link[a][attr] < this.link[b][attr]) return -1;
					if (this.link[a][attr] > this.link[b][attr]) return 1;
					return 0;
				});
			}
		}

		this.list.style.display = "none";
		for (let i = 0; i < found.length; i++) { //display
			const element = document.createElement("div");
			element.id = found[i];
			element.className = "lst-strength-ele";
			this.list.appendChild(element);
		}
		this.list.style.display = "block";

		this.OnUiReady();
	}

	UpdateViewport(force = false) {
		if (!this.link) return;

		for (let i = 0; i < this.list.childNodes.length; i++) {
			if (force) this.list.childNodes[i].textContent = "";

			if (this.list.childNodes[i].offsetTop - this.list.scrollTop < -32 ||
				this.list.childNodes[i].offsetTop - this.list.scrollTop > this.list.clientHeight) {
				this.list.childNodes[i].textContent = "";
			}
			else {
				if (this.list.childNodes[i].childNodes.length > 0) continue;
				const id = this.list.childNodes[i].getAttribute("id");
				this.InflateElement(this.list.childNodes[i], this.link[id], this.link[id].type);
			}
		}

		if (this.link) {
			this.counter.textContent = this.list.childNodes.length === this.link.length ?
				this.link.length :
				`${this.list.childNodes.length} / ${this.link.length}`;
		}
	}

	InflateElement(element, entry) {
		super.InflateElement(element, entry);

		const icon = document.createElement("div");
		icon.className = "lst-strength-ico";
		icon.style.backgroundImage = entry.type == "user" ? "url(mono/user.svg)" : "url(mono/gear.svg)";
		element.appendChild(icon);

		let columns = [];
		columns.push(this.columnsElements.find(o=>o.textContent === "name"));
		columns.push(this.columnsElements.find(o=>o.textContent === "strength"));
		columns.push(this.columnsElements.find(o=>o.textContent === "modified"));
		columns.push(this.columnsElements.find(o=>o.textContent === "time to crack"));

		const lblName = document.createElement("div");
		lblName.textContent = entry.name;
		lblName.className = "lst-strength-lbl-1";
		lblName.style.left = columns[0].style.left === "0%" ? "36px" : columns[0].style.left;
		lblName.style.width = columns[0].style.left === "0%" ? `calc(${columns[0].style.width} - 36px)` : columns[0].style.width;
		element.appendChild(lblName);

		const bar = PassGen.StrengthBar(entry.entropy);

		const divBar = document.createElement("div");
		divBar.className = "lst-strength-bar";
		divBar.style.boxShadow = `${bar[0]} ${Math.round(bar[1])}px 0 0 inset`;
		divBar.style.left = columns[1].style.left === "0%" ? "36px" : columns[1].style.left;
		divBar.style.width = `40px`;
		element.appendChild(divBar);

		const lblStrength = document.createElement("div");
		lblStrength.textContent = `${entry.entropy}-bits ${bar[2]}`;
		lblStrength.className = "lst-strength-lbl-2";
		lblStrength.style.left = columns[1].style.left === "0%" ? "84px" : `calc(${columns[1].style.left} + 48px)`;
		lblStrength.style.width = columns[1].style.left === "0%" ? `calc(${columns[1].style.width} - 84px)` : `calc(${columns[1].style.width} - 48px)`;
		element.appendChild(lblStrength);

		const lblModified = document.createElement("div");
		let date = new Date(UI.TicksToUnixDate(entry.date));
		lblModified.textContent = `${date.toLocaleDateString(UI.regionalFormat, {})} ${date.toLocaleTimeString(UI.regionalFormat, {})}`;;
		lblModified.className = "lst-strength-lbl-3";
		lblModified.style.left = columns[2].style.left === "0%" ? "36px" : columns[2].style.left;
		lblModified.style.width = columns[2].style.left === "0%" ? `calc(${columns[2].style.width} - 36px)` : columns[2].style.width;
		element.appendChild(lblModified);

		const lblTtc = document.createElement("div");
		lblTtc.textContent = entry.ttc;
		lblTtc.className = "lst-strength-lbl-4";
		lblTtc.style.left = columns[3].style.left === "0%" ? "36px" : columns[3].style.left;
		lblTtc.style.width = columns[3].style.left === "0px" ? `calc(${columns[3].style.left} - 36px)` : columns[3].style.width;
		element.appendChild(lblTtc);


		element.ondblclick = event=> {
			if (entry.type === "device") {
				for (let k = 0; k < WIN.array.length; k++)
					if (WIN.array[k] instanceof DeviceView && WIN.array[k].filename == entry.file) {
						WIN.array[k].Minimize(); //minimize/restore
						return;
					}
				new DeviceView({ file: entry.file });
			}
			else { //user
				for (let k = 0; k < WIN.array.length; k++)
					if (WIN.array[k] instanceof UserView && WIN.array[k].filename == entry.file) {
						WIN.array[k].Minimize(); //minimize/restore
						return;
					}
				new UserView({ file: entry.file });
			}
		};

	}
}
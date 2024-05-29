class Backup extends List {
	constructor(args) {
		super(args);

		this.args = args ?? {filter:"", find:"", sort:"", select:null};

		this.SetTitle("Backup");
		this.SetIcon("mono/backup.svg");

		this.defaultColumns = ["name", "date", "size"];
		this.SetupColumns(this.defaultColumns);
		this.columnsOptions.style.display = "none";

		this.SetupToolbar();
		const createButton = this.AddToolbarButton("Create", "mono/add.svg?light");
		const deleteButton = this.AddToolbarButton("Delete", "mono/delete.svg?light");

		createButton.onclick = ()=> this.Create();
		deleteButton.onclick = ()=> this.Delete();

		this.GetBackupFiles();
	}

	async GetBackupFiles() {
		/*try*/ {
			const response = await fetch("config/backup/list");
			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const json = await response.json();
			if (json.error) throw(json.error);

			this.link = json;
			this.RefreshList();
		}
		/*catch (ex) {
			this.ConfirmBox(ex, true, "mono/error.svg")
		}*/
	}

	Create() {
		const dialog = this.DialogBox("108px");
		if (dialog === null) return;

		dialog.innerBox.parentElement.style.maxWidth = "400px";
		dialog.innerBox.style.textAlign = "center";

		let now = new Date();

		const nameLabel = document.createElement("div");
		nameLabel.textContent = "Name:";
		nameLabel.style.display = "inline-block";
		nameLabel.style.height = "32px";
		nameLabel.style.lineHeight = "32px";
		nameLabel.style.paddingRight = "8px";

		const nameInput = document.createElement("input");
		nameInput.type = "text";
		nameInput.placeholder = `backup-${now.getFullYear()}${(now.getMonth()+1).toString().padStart(2,"0")}${now.getDate().toString().padStart(2,"0")}`;
		nameInput.style.marginTop = "20px";
		nameInput.style.width = "min(calc(100% - 8px), 200px)";

		dialog.innerBox.append(nameLabel, nameInput);

		nameInput.focus();

		dialog.okButton.onclick = async ()=> {
			dialog.cancelButton.onclick();

			try {
				const response = await fetch(`config/backup/create?name=${encodeURIComponent(nameInput.value)}`);
				if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

				const json = await response.json();
				if (json.error) throw(json.error);

				this.link = json;
				this.RefreshList();
			}
			catch (ex) {
				this.ConfirmBox(ex, true, "mono/error.svg")
			}
		};

		nameInput.onkeydown = event=> {
			if (event.key === "Enter") {
				dialog.okButton.click();
			}
		};
	}

	async Delete() {
		if (this.args.select === null) return;

		try {
			const response = await fetch(`config/backup/delete?name=${encodeURIComponent(this.args.select)}`);
			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const json = await response.json();
			if (json.error) throw(json.error);

			this.args.select = null

			this.link = json;
			this.RefreshList();
		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/error.svg")
		}
	}

	RefreshList() { //overrides
		this.list.textContent = "";

		let filtered = [];
		if (this.args.filter.length === 0) {
			for (let i = 0; i < this.link.length; i++) {
				filtered.push(i);
			}
		}
		else {
			for (let i = 0; i < this.link.length; i++) {
				if (!this.link[i].type) continue;
				if (this.link[i].type !== this.args.filter) continue;
				filtered.push(i);
			}
		}

		let found;
		if (this.args.find && this.args.find.length === 0) {
			found = filtered;
		}
		else {
			found = [];
			const keywords = this.args.find.toLowerCase().split(" ").filter(o=> o.length > 0);

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

		if (this.args.sort && this.args.sort.length > 0) {
			let attr = this.args.sort;
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
			element.className = "list-element";
			this.list.appendChild(element);
		}
		this.list.style.display = "block";

		this.OnUiReady();
	}

	UpdateViewport(force = false) { //overrides
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
				this.InflateElement(this.list.childNodes[i], this.link[id]);
			}
		}

		if (this.link) {
			this.counter.textContent = this.list.childNodes.length === this.link.length ?
				this.link.length :
				`${this.list.childNodes.length} / ${this.link.length}`;
		}
	}

	InflateElement(element, entry) { //overrides
		element.style.backgroundImage = "url(mono/backup.svg)";
		element.style.backgroundSize = "24px 24px";
		element.style.backgroundPosition = "4px 4px";
		element.style.backgroundRepeat = "no-repeat";

		for (let i = 0; i < this.columnsElements.length; i++) {
			if (!(this.columnsElements[i].textContent in entry)) continue;

			const newAttr = document.createElement("div");
			element.appendChild(newAttr);

			switch (i) {
				case 0: newAttr.textContent = entry[this.columnsElements[i].textContent]; break;
				case 1: newAttr.textContent = new Date(UI.TicksToUnixDate(entry[this.columnsElements[i].textContent])).toLocaleDateString(regionalFormat); break;
				case 2: newAttr.textContent = UI.SizeToString(entry[this.columnsElements[i].textContent]); break;
			}

			if (i === 0) {
				newAttr.style.top = "5px";
				newAttr.style.left = "36px";
				newAttr.style.width = `calc(${this.columnsElements[0].style.width} - 36px)`;
				newAttr.style.whiteSpace = "nowrap";
				newAttr.style.overflow = "hidden";
				newAttr.style.textOverflow = "ellipsis";
			}
			else {
				newAttr.style.left = this.columnsElements[i].style.left;
				newAttr.style.width = this.columnsElements[i].style.width;
			}
		}

		element.onclick = ()=> {
			if (this.selected) this.selected.style.backgroundColor = "";

			this.args.select = entry.name;

			this.selected = element;
			element.style.backgroundColor = "var(--clr-select)";
		};
	}
}
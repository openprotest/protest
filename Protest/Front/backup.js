class Backup extends List {
	constructor(args) {
		super(args);

		this.args = args ?? {filter:"", find:"", sort:"", select:null};

		this.AddCssDependencies("list.css");

		this.SetTitle("Backup");
		this.SetIcon("mono/backup.svg");

		this.defaultColumns = ["name", "date", "size"];
		this.SetupColumns(this.defaultColumns);
		this.columnsOptions.style.display = "none";

		this.SetupToolbar();
		this.createButton = this.AddToolbarButton("Create", "mono/add.svg?light");
		this.deleteButton = this.AddToolbarButton("Delete", "mono/delete.svg?light");
		this.AddToolbarSeparator();
		this.downloadButton = this.AddToolbarButton("Download", "mono/download.svg?light");

		this.createButton.onclick = ()=> this.Create();
		this.deleteButton.onclick = ()=> this.Delete();
		this.downloadButton.onclick = ()=> this.Download();

		this.UpdateAuthorization();
		this.GetBackupFiles();
	}

	UpdateAuthorization() { //overrides
		this.canWrite = KEEP.authorization.includes("*") || KEEP.authorization.includes("backup:write");
		this.createButton.disabled = !this.canWrite;
		this.deleteButton.disabled = !this.canWrite;
		this.downloadButton.disabled = !this.canWrite;
		super.UpdateAuthorization();
	}

	async GetBackupFiles() {
		try {
			const response = await fetch("config/backup/list");
			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const json = await response.json();
			if (json.error) throw(json.error);

			this.link = json;

			this.ListBackup();
		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/error.svg")
		}
	}

	ListBackup() {
		this.list.textContent = "";

		for (let key in this.link.data) {
			const element =  document.createElement("div");
			element.id = key;
			element.className = "list-element";
			this.list.appendChild(element);

			this.InflateElement(element, this.link.data[key]);

			if (this.args.select && this.args.select === key) {
				this.selected = element;
				element.style.backgroundColor = "var(--clr-select)";
			}
		}
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
				this.ListBackup();
			}
			catch (ex) {
				setTimeout(()=>this.ConfirmBox(ex, true, "mono/error.svg"), 250);
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

		this.ConfirmBox("Are you sure you want delete this backup?").addEventListener("click", async()=> {
			try {
				const response = await fetch(`config/backup/delete?name=${encodeURIComponent(this.args.select)}`);
				if (response.status !== 200) LOADER.HttpErrorHandler(response.status);
	
				const json = await response.json();
				if (json.error) throw(json.error);
	
				this.selected = null;
				this.args.select = null;
	
				this.link = json;
				this.ListBackup();
			}
			catch (ex) {
				this.ConfirmBox(ex, true, "mono/error.svg")
			}
		});
	}

	Download() {
		if (this.args.select === null) return;

		let link = document.createElement("a");
		link.download = "name";
		link.href = `config/backup/download?name=${encodeURIComponent(this.args.select)}`;
		link.click();
		link.remove();
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
			
			switch (this.columnsElements[i].textContent) {
				case "name": newAttr.textContent = entry["name"].v; break;
				case "date": newAttr.textContent = new Date(UI.TicksToUnixDate(entry["date"].v)).toLocaleDateString(regionalFormat);break;
				case "size": newAttr.textContent = UI.SizeToString(entry["size"].v); break;
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

			this.args.select = entry.name.v;

			this.selected = element;
			element.style.backgroundColor = "var(--clr-select)";
		};
	}
}
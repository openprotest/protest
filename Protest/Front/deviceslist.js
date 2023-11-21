class DevicesList extends List {
	constructor(params) {
		super(params);

		this.SetTitle("Devices");
		this.SetIcon("mono/devices.svg");

		this.defaultColumns = ["name", "type", "ip", "hostname", "mac address", "serial number"];

		const columns = localStorage.getItem(`${this.constructor.name.toLowerCase()}_columns`) ?
			JSON.parse(localStorage.getItem(`${this.constructor.name.toLowerCase()}_columns`)) :
			this.defaultColumns;

		this.SetupColumns(columns);
		this.SetupToolbar();
		this.LinkData(LOADER.devices);

		this.addButton     = this.AddToolbarButton("Add", "mono/add.svg?light");
		this.deleteButton  = this.AddToolbarButton("Delete", "mono/delete.svg?light");
		const filterButton = this.SetupFilter();
		const findInput    = this.SetupFind();
		this.toolbar.appendChild(this.AddToolbarSeparator());
		this.sentChatButton = this.AddSendToChatButton();

		if (this.params.find && this.params.find.length > 0) {
			findInput.value = this.params.find;
			findInput.parentElement.style.borderBottom = findInput.value.length === 0 ? "none" : "#c0c0c0 solid 2px";
			findInput.parentElement.style.width = "200px";
		}

		this.RefreshList();

		this.addButton.onclick = ()=> this.Add();
		this.deleteButton.onclick = ()=> this.Delete();

		this.UpdateAuthorization();
	}

	UpdateAuthorization() { //override
		super.UpdateAuthorization();
		this.addButton.disabled = !KEEP.authorization.includes("*") && !KEEP.authorization.includes("devices:write");
		this.deleteButton.disabled = !KEEP.authorization.includes("*") && !KEEP.authorization.includes("devices:write");
	}

	InflateElement(element, entry, type) { //override
		const icon = document.createElement("div");
		icon.className = "list-element-icon";
		icon.style.backgroundImage = `url(${LOADER.deviceIcons.hasOwnProperty(type) ? LOADER.deviceIcons[type] : "mono/gear.svg"})`;
		element.appendChild(icon);

		super.InflateElement(element, entry, type);

		if (!element.ondblclick) {
			element.ondblclick = event=> {
				event.stopPropagation();
				
				const file = element.getAttribute("id");
				for (let i = 0; i < WIN.array.length; i++)
					if (WIN.array[i] instanceof DeviceView && WIN.array[i].params.file === file) {
						WIN.array[i].Minimize(); //minimize/restore
						return;
					}

				new DeviceView({ file: file });
			};
		}
	}

	Add() {
		new DeviceView({file: null});
	}

	Delete() {
		this.ConfirmBox("Are you sure you want to delete this device?", false, "mono/delete.svg").addEventListener("click", async ()=> {
			if (this.params.select === null) return;
			
			let file = this.params.select;

			try {
				const response = await fetch(`db/device/delete?file=${file}`);

				if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

				const json = await response.json();
				if (json.error) throw(json.error);

				delete LOADER.devices.data[file];
				LOADER.devices.length--;

				for (let i = 0; i < WIN.array.length; i++) {
					if (WIN.array[i] instanceof DevicesList) {
						let element = Array.from(WIN.array[i].list.childNodes).filter(o=>o.getAttribute("id") === file);
						element.forEach(o=> WIN.array[i].list.removeChild(o));
						WIN.array[i].UpdateViewport(true);

					}
					else if (WIN.array[i] instanceof DeviceView && WIN.array[i].params.file === file) {
						WIN.array[i].Close();
					}
				}

				this.params.select = null;
			}
			catch (ex) {
				console.error(ex);
			}
		});
	}
}
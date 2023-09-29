class UsersList extends List {
	constructor(params) {
		super(params);

		this.SetTitle("Users");
		this.SetIcon("mono/users.svg");

		this.defaultColumns = ["first name", "last name", "username", "e-mail"];

		const columns = localStorage.getItem(`${this.constructor.name.toLowerCase()}_columns`) ?
			JSON.parse(localStorage.getItem(`${this.constructor.name.toLowerCase()}_columns`)) :
			this.defaultColumns;

		this.SetupColumns(columns);
		this.SetupToolbar();
		this.LinkData(LOADER.users);

		const addButton	   = this.AddToolbarButton("Add", "mono/add.svg?light");
		const removeButton = this.AddToolbarButton("Delete", "mono/delete.svg?light");
		const filterButton = this.SetupFilter();
		const findTextBox  = this.SetupFind();

		if (this.params.find && this.params.find.length > 0) {
			findTextBox.value = this.params.find;
			findTextBox.parentElement.style.borderBottom = findTextBox.value.length === 0 ? "none" : "var(--clr-light) solid 2px";
			findTextBox.parentElement.style.width = "200px";
		}

		this.RefreshList();

		addButton.onclick = ()=> this.Add();
		removeButton.onclick = ()=> this.Delete();
	}

	InflateElement(element, entry, type) { //override
		const icon = document.createElement("div");
		icon.className = "list-element-icon";
		icon.style.backgroundImage = `url(${LOADER.userIcons.hasOwnProperty(type) ? LOADER.userIcons[type] : "mono/user.svg"})`;
		element.appendChild(icon);
		
		super.InflateElement(element, entry, type);

		if (!element.ondblclick) {
			element.ondblclick = (event)=> {
				event.stopPropagation();
				
				const file = element.getAttribute("id");
				for (let i = 0; i < WIN.array.length; i++)
					if (WIN.array[i] instanceof UserView && WIN.array[i].params.file === file) {
						WIN.array[i].Minimize(); //minimize/restore
						return;
					}

				new UserView({ file: file });
			};
		}
	}

	Add() {
		new UserView({file: null});
	}

	Delete() {
		this.ConfirmBox("Are you sure you want to delete this user?").addEventListener("click", async()=> {
			if (this.params.select === null) return;
			
			let file = this.params.select;

			try {
				const response = await fetch(`db/user/delete?file=${file}`);

				if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

				const json = await response.json();
				if (json.error) throw(json.error);

				delete LOADER.users.data[file];
				LOADER.users.length--;

				for (let i = 0; i < WIN.array.length; i++) {
					if (WIN.array[i] instanceof UsersList) {
						let element = Array.from(WIN.array[i].list.childNodes).filter(o=>o.getAttribute("id") === file);
						element.forEach(o=> WIN.array[i].list.removeChild(o));
						WIN.array[i].UpdateViewport(true);
					}
					else if (WIN.array[i] instanceof UserView && WIN.array[i].params.file === file) {
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
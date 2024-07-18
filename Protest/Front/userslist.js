class UsersList extends List {
	constructor(args) {
		super(args);

		this.SetTitle("Users");
		this.SetIcon("mono/users.svg");

		this.defaultColumns = ["first name", "last name", "username", "e-mail"];

		const columns = localStorage.getItem(`${this.constructor.name.toLowerCase()}_columns`) ?
			JSON.parse(localStorage.getItem(`${this.constructor.name.toLowerCase()}_columns`)) :
			this.defaultColumns;

		this.SetupColumns(columns);
		this.SetupToolbar();
		this.LinkData(LOADER.users);

		this.addButton	   = this.AddToolbarButton("Add", "mono/add.svg?light");
		this.deleteButton  = this.AddToolbarButton("Delete", "mono/delete.svg?light");
		const filterButton = this.SetupFilter();
		const findInput    = this.SetupFind();
		this.toolbar.appendChild(this.AddToolbarSeparator());
		this.sentChatButton = this.AddSendToChatButton();

		if (this.args.find && this.args.find.length > 0) {
			findInput.value = this.args.find;
			findInput.parentElement.style.borderBottom = findInput.value.length === 0 ? "none" : "#c0c0c0 solid 2px";
			findInput.parentElement.style.width = "200px";
		}

		this.RefreshList();

		this.addButton.onclick = ()=> this.Add();
		this.deleteButton.onclick = ()=> this.Delete();

		this.UpdateAuthorization();

		this.content.addEventListener("keydown", event=>{
			if (event.key === "Delete") {
				this.Delete();
			}
			else if (event.key === "Insert") {
				this.Add();
			}
		});
	}

	UpdateAuthorization() { //overrides
		super.UpdateAuthorization();
		this.addButton.disabled = !KEEP.authorization.includes("*") && !KEEP.authorization.includes("users:write");
		this.deleteButton.disabled = !KEEP.authorization.includes("*") && !KEEP.authorization.includes("users:write");
	}

	InflateElement(element, entry, type) { //overrides
		const icon = document.createElement("div");
		icon.className = "list-element-icon";
		icon.style.backgroundImage = `url(${type in LOADER.userIcons ? LOADER.userIcons[type] : "mono/user.svg"})`;
		element.appendChild(icon);

		super.InflateElement(element, entry, type);

		if (!element.ondblclick) {
			element.ondblclick = event=> {
				event.stopPropagation();
				const file = element.getAttribute("id");
				LOADER.OpenUserByFile(file);
			};
		}
	}

	Add() {
		new UserView({file: null});
	}

	Delete() {
		this.ConfirmBox("Are you sure you want to delete this user?", false, "mono/delete.svg").addEventListener("click", async()=> {
			if (this.args.select === null) return;

			let file = this.args.select;

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
					else if (WIN.array[i] instanceof UserView && WIN.array[i].args.file === file) {
						WIN.array[i].Close();
					}
				}

				this.args.select = null;
			}
			catch (ex) {
				console.error(ex);
			}
		});
	}
}
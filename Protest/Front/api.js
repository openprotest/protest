class Api extends List {
	constructor(args) {
		super();

		this.args = args ?? {filter:"", find:"", sort:"", select:null};

		this.AddCssDependencies("list.css");

		this.SetTitle("API links");
		this.SetIcon("mono/carabiner.svg");

		this.defaultColumns = ["name", "url"];
		this.SetupColumns(this.defaultColumns);
		this.columnsOptions.style.display = "none";

		this.SetupToolbar();
		this.createButton = this.AddToolbarButton("Create API", "mono/add.svg?light");
		this.deleteButton = this.AddToolbarButton("Delete", "mono/delete.svg?light");

		this.createButton.onclick = ()=> this.Create();
		this.deleteButton.onclick = ()=> this.Delete();

		this.UpdateAuthorization();
	}

	UpdateAuthorization() { //overrides
		this.canWrite = KEEP.authorization.includes("*") || KEEP.authorization.includes("api:write");
		this.createButton.disabled = !this.canWrite;
		this.deleteButton.disabled = !this.canWrite;
		super.UpdateAuthorization();
	}

	Create() {

	}

	async Delete() {

	}
}
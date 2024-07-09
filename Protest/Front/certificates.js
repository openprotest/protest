class Certificates extends List {
	constructor() {
		super();

		this.AddCssDependencies("list.css");

		const columns = ["name", "status", "start", "task"];
		this.SetupColumns(columns);

		this.columnsOptions.style.display = "none";

		this.SetTitle("Certificates");
		this.SetIcon("mono/certificate.svg");

		this.SetupToolbar();
		this.createButton = this.AddToolbarButton("Create task", "mono/add.svg?light");
		this.deleteButton = this.AddToolbarButton("Delete", "mono/delete.svg?light");
		this.downloadButton = this.AddToolbarButton("Delete", "mono/download.svg?light");

		this.createButton.disabled = true;
		this.deleteButton.disabled = true;
		this.downloadButton.disabled = true;
	}
}
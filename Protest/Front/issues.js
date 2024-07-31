class Issues extends List {
	constructor() {
		super();

		this.AddCssDependencies("list.css");

		const columns = ["Host", "Category", "Issue", "Last Update"];
		this.SetupColumns(columns);

		this.columnsOptions.style.display = "none";

		this.SetTitle("Issues");
		this.SetIcon("mono/issues.svg");

		this.LinkData({data:[], length:0 });

		this.SetupToolbar();
		this.reloadButton = this.AddToolbarButton("Reload", "mono/restart.svg?light");
		this.scanButton = this.AddToolbarButton("Scan network", "mono/scannet.svg?light");
		this.toolbar.appendChild(this.AddToolbarSeparator());
		const filterButton = this.SetupFilter();
		this.SetupFind();

	}
}
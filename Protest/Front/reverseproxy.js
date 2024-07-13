class ReverseProxy extends List {
	constructor(args) {
		super(null);

		this.args = args ?? "";

		this.AddCssDependencies("list.css");

		this.SetTitle("Reverse proxy");
		this.SetIcon("mono/reverseproxy.svg");

		const columns = ["name", "traffic"];
		this.SetupColumns(columns);
		this.columnsOptions.style.display = "none";

		this.SetupToolbar();
		this.createButton = this.AddToolbarButton("Create task", "mono/add.svg?light");
		this.deleteButton = this.AddToolbarButton("Delete", "mono/delete.svg?light");
		this.AddToolbarSeparator();
		this.startButton = this.AddToolbarButton("Start", "mono/play.svg?light");
		this.pauseButton = this.AddToolbarButton("Pause", "mono/pause.svg?light");
		this.stopButton  = this.AddToolbarButton("Stop", "mono/stop.svg?light");

		this.list.style.right = "unset";
		this.list.style.width = "min(40%, 480px)";

		this.listTitle.style.right = "unset";
		this.listTitle.style.width = "min(40%, 480px)";

		this.stats = document.createElement("div");
		this.stats.style.position = "absolute";
		this.stats.style.left = "calc(min(40%, 480px) + 8px)";
		this.stats.style.right = "0";
		this.stats.style.top = "0";
		this.stats.style.bottom = "28px";
		this.stats.style.overflowY = "auto";
		this.content.appendChild(this.stats);

	}

}
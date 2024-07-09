class Automation extends List {
	constructor() {
		super();

		this.AddCssDependencies("list.css");

		const columns = ["name", "status", "start", "task"];
		this.SetupColumns(columns);

		this.columnsOptions.style.display = "none";

		this.SetTitle("Automation");
		this.SetIcon("mono/automation.svg");

		this.SetupToolbar();
		this.createButton = this.AddToolbarButton("Create task", "mono/add.svg?light");
		this.deleteButton = this.AddToolbarButton("Delete", "mono/delete.svg?light");
		this.toolbar.appendChild(this.AddToolbarSeparator());
		this.startButton = this.AddToolbarButton("Start", "mono/play.svg?light");
		this.pauseButton = this.AddToolbarButton("Pause", "mono/pause.svg?light");
		this.stopButton  = this.AddToolbarButton("Stop", "mono/stop.svg?light");

		this.createButton.disabled = true;
		this.deleteButton.disabled = true;
		this.startButton.disabled = true;
		this.pauseButton.disabled = true;
		this.stopButton.disabled = true;
	}
}
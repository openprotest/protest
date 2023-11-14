class Automation extends List {
	constructor() {
		super();

		this.AddCssDependencies("list.css");
		//this.AddCssDependencies("automation.css");

		const columns = ["name", "status", "progress"]
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

		this.ListTasks();
	}

	async ListTasks() {
		try {
			const response = await fetch("automation/list");
			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);
			
			const json = await response.json();
			if (json.error) throw (json.error);
			
			this.link = json;

			for (let task in this.link.data) {
				const element =  document.createElement("div");
				element.id = task;
				element.className = "list-element";
				this.list.appendChild(element);
	
				this.InflateElement(element, this.link.data[task]);
			}
		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/error.svg");
		}
	}

	InflateElement(element, entry) { //override
		let icon;
		switch (entry.name.v.toLowerCase()) {
		case "lifeline": icon = "mono/lifeline.svg"; break;
		case "lastseen": icon = "mono/lastseen.svg"; break;
		case "watchdog": icon = "mono/watchdog.svg"; break;
		case "fetch"   : icon = "mono/fetch.svg"   ; break;
		default        : icon = "mono/task.svg"    ; break;
		}

		const iconBox = document.createElement("div");
		iconBox.className = "list-element-icon";
		iconBox.style.backgroundImage = `url(${icon})`;
		element.appendChild(iconBox);

		super.InflateElement(element, entry, null);

		if (!element.ondblclick) {
			element.ondblclick = event=> {
				event.stopPropagation();
			};
		}
	}


}
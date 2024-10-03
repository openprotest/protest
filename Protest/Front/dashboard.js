class Dashboard extends Window {
	constructor(args) {
		super(args);

		this.args = args ?? {filter:"", find:"", sort:"", select:null};

		this.SetTitle("Dashboard");
		this.SetIcon("mono/dashboard.svg");

		//this.AddCssDependencies("dashboard.css");
	}
}
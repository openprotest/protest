"use strict";
class Dashboard extends Window {
	constructor(args) {
		super(args);

		this.args = args ?? Object.create(null);

		this.SetTitle("Dashboard");
		this.SetIcon("mono/dashboard.svg");

		//this.AddCssDependencies("dashboard.css");
	}
}
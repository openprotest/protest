"use strict";
class Ares extends Window {
	constructor(args) {
		super();
		this.args = args ?? {filter:"", find:"", sort:"", select:null};

		Window.AddCssDependencies("ares.css");

		this.SetTitle("A.R.E.S.");
		this.SetIcon("mono/ares.svg");
		//this.SetIcon("mono/ares-breathing.svg");
	}
}
"use strict";
class Packages extends Window {

	constructor(args) {
		super(args);

		this.args = args;

		this.SetTitle("Software deployment");
		this.SetIcon("mono/package.svg");

		this.InitializeComponents();
	}

	InitializeComponents() {
		this.SetupToolbar();
		this.refreshButton = this.AddToolbarButton("Refresh", "mono/update.svg?light");
		this.deleteButton = this.AddToolbarButton("Delete", "mono/delete.svg?light");

		this.refreshButton.onclick = ()=> {};
		this.deleteButton.onclick = ()=> {};
	}

}
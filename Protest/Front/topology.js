class Topology extends Window{
	constructor(args) {
		super();
		this.args = args ?? {};

		this.AddCssDependencies("topology.css");

		this.SetTitle("Topology");
		this.SetIcon("mono/topology.svg");

	}
}
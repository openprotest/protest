class Topology extends Window {
    constructor(args) {
        super([64,64,64]);

        this.args = args ? args : "";

        this.SetTitle("Topology");
        this.SetIcon("res/topology.svgz");

    }
}
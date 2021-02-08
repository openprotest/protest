class Topology extends Window {
    constructor(args) {
        super([64,64,64]);

        this.args = args ? args : "";

        this.setTitle("Topology");
        this.setIcon("res/topology.svgz");

    }
}
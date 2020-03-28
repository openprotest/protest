class Fetch extends Tabs {
    constructor() {
        super();
        this.setTitle("Fetch");
        this.setIcon("res/fetch.svgz");

        this.AddTab("Equipment from IP range", "res/gear.svgz");
        this.AddTab("Equipment from Domain Controller", "res/gear.svgz");
        this.AddTab("Users from Domain Controller", "res/gear.svgz");
        this.AddTab("Equipment from other Protest", "res/gear.svgz");
        this.AddTab("User from other Protest", "res/gear.svgz");
    }
}
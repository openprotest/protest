class Fetch extends Tabs {
    constructor() {
        super();
        this.setTitle("Fetch");
        this.setIcon("res/fetch.svgz");

        let tabEquipIp = this.AddTab("Equipment", "res/gear.svgz", "from IP range");
        let tabEquipDc = this.AddTab("Equipment", "res/gear.svgz", "from DC");
        let tabUsersDc = this.AddTab("Users",     "res/user.svgz", "from DC");
        let tabProtest = this.AddTab("Database",  "res/logo.svgz", "from other Pro-test");

        tabEquipIp.style.height = "40px";
        tabEquipDc.style.height = "40px";
        tabUsersDc.style.height = "40px";
        tabProtest.style.height = "40px";
    }
}
class Log extends Tabs {
    constructor() {
        super();

        this.setTitle("Log");
        this.setIcon("res/log.svgz");

        this.tabsContainer.style.width = "125px";
        this.subContent.style.left = "150px";

        this.tabActions = this.AddTab("Actions");
        this.tabError   = this.AddTab("Errors");
        this.tabStatistics = this.AddTab("Statistics");

        this.tabActions.onclick = () => this.ShowActions();
        this.tabError.onclick = () => this.ShowErrors();
        this.tabStatistics.onclick = () => this.ShowtabStatistics();

        this.tabActions.className = "v-tab-selected";
        this.ShowActions();
    }

    ShowActions() {

    }

    ShowErrors() {

    }

    ShowtabStatistics() {

    }
}
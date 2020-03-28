class Tabs extends Window {
    constructor() {
        if (document.head.querySelectorAll("link[href$='tabs.css']").length == 0) {
            let csslink = document.createElement("link");
            csslink.rel = "stylesheet";
            csslink.href = "tabs.css";
            document.head.appendChild(csslink);
        }

        super();
        //this.setTitle("");
        //this.setIcon("");

        this.tabsList = [];
        this.content.style.overflow = "hidden";

        this.subContent = document.createElement("div");
        this.subContent.className = "v-tab-body";
        this.content.appendChild(this.subContent);

        this.tabsContainer = document.createElement("div");
        this.tabsContainer.className = "v-tabs";
        this.content.appendChild(this.tabsContainer);
    }

    AddTab(name, icon) {
        let newTab = document.createElement("div");
        newTab.innerHTML = name;
        this.tabsContainer.appendChild(newTab);
        this.tabsList.push(newTab);

        newTab.addEventListener("click", event => {
            for (let i = 0; i < this.tabsList.length; i++)
                this.tabsList[i].style.backgroundColor = "rgb(72,72,72)";

            newTab.style.backgroundColor = "rgb(96,96,96)";
        });

        return newTab;
    }

    RemoveTab() { }

}
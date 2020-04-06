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

    AddTab(text, icon, subtext) {
        let newTab = document.createElement("div");
        this.tabsContainer.appendChild(newTab);
        this.tabsList.push(newTab);

        let divIcon = document.createElement("div");
        if (icon) divIcon.style.backgroundImage = "url(" + icon + ")";
        newTab.appendChild(divIcon);

        let divText = document.createElement("div");
        divText.innerHTML = text;
        newTab.appendChild(divText);

        if (subtext) {
            let divSubtext = document.createElement("div");
            divSubtext.innerHTML = subtext;
            newTab.appendChild(divSubtext);
        }

        newTab.addEventListener("click", event => {
            for (let i = 0; i < this.tabsList.length; i++)
                this.tabsList[i].className = "";

            newTab.className = "v-tab-selected";
        });

        return newTab;
    }

    RemoveTab() { }

}
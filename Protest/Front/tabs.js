class Tabs extends Window {
	constructor(themeColor = [64,64,64]) {
		super();

		this.AddCssDependencies("tabs.css");

		this.tabsList = [];
		this.content.classList.add("tabs-content");
		this.content.style.overflow = "hidden";

		this.tabsBox = document.createElement("div");
		this.tabsBox.tabIndex = -1;
		this.tabsBox.className = "tabs-box";
		this.content.appendChild(this.tabsBox);

		this.tabsPanel = document.createElement("div");
		this.tabsPanel.tabIndex = -1;
		this.tabsPanel.className = "tabs-panel";
		this.tabsPanel.setAttribute("role", "tabpanel");
		this.content.appendChild(this.tabsPanel);
	}

	AddTab(text, icon) {
		const newTab = document.createElement("button");
		newTab.tabIndex = 0;
		newTab.setAttribute("role", "tab");
		newTab.setAttribute("aria-label", text);
		this.tabsBox.appendChild(newTab);
		this.tabsList.push(newTab);

		const divIcon = document.createElement("div");
		if (icon) divIcon.style.backgroundImage = "url(" + icon + ")";
		newTab.appendChild(divIcon);

		const divText = document.createElement("div");
		divText.textContent = text;
		newTab.appendChild(divText);

		newTab.addEventListener("click", ()=> {
			this.DeselectAllTabs();
			newTab.className = "v-tab-selected";
		});

		return newTab;
	}

	DeselectAllTabs() {
		for (let i = 0; i < this.tabsList.length; i++)
			this.tabsList[i].className = "";
	}

	RemoveTab() { }
}
class Log extends Window {
    constructor() {
        super([64,64,64]);

        this.setTitle("Log");
        this.setIcon("res/log.svgz");

        this.isLoading = true;

        this.content.style.display = "grid";
        this.content.style.gridTemplateColumns = "auto minmax(50px, 1200px) auto";
        this.content.style.gridTemplateRows = "auto";

        this.list = document.createElement("div");
        this.list.className = "no-results";
        this.list.style.gridArea = "1 / 2";
        this.list.style.backgroundColor = "var(--pane-color)";
        this.list.style.color = "#202020";
        this.list.style.margin = "0 8px 8px 8px";
        this.list.style.borderRadius = "4px";
        this.list.style.overflowY = "auto";
        this.content.appendChild(this.list);

        this.GetLog();
    }

    GetLog() {
        const xhr = new XMLHttpRequest();
        xhr.onreadystatechange = () => {
            if (xhr.readyState == 4 && xhr.status == 200) {
                let split = xhr.responseText.split("\n");
                for (let i = 0; i < split.length-1; i++)
                    this.Add(split[i]);

                this.isLoading = false;
            }
        };

        xhr.open("GET", "getlog", true);
        xhr.send();
    }

    Add(text) {
        while (text.indexOf("\t") > -1)
            text = text.replace("\t", "&emsp;&emsp;");

        const element = document.createElement("div");
        element.className = "generic-list-element";
        element.innerHTML = text;
        this.list.appendChild(element);
    }
}
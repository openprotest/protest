class Scripts extends Window {
    constructor() {
        if (document.head.querySelectorAll("link[href$='scripts.css']").length == 0) {
            let csslink = document.createElement("link");
            csslink.rel = "stylesheet";
            csslink.href = "scripts.css";
            document.head.appendChild(csslink);
        }

        super();
        this.setTitle("Scripts");
        this.setIcon("res/scripts.svgz");

        this.payload = null;

        this.content.style.overflow = "hidden";

        this.btnNew = document.createElement("div");
        this.btnNew.style.backgroundImage = "url(res/l_new.svgz)";
        this.btnNew.setAttribute("tip-below", "New");
        this.toolbox.appendChild(this.btnNew);

        this.btnReload = document.createElement("div");
        this.btnReload.style.backgroundImage = "url(res/l_reload.svgz)";
        this.btnReload.setAttribute("tip-below", "Reload");
        this.toolbox.appendChild(this.btnReload);

        this.lblTitle.style.left = TOOLBAR_GAP + this.toolbox.childNodes.length * 22 + "px";

        let tabsContainer = document.createElement("div");
        tabsContainer.className = "v-tabs";
        this.content.appendChild(tabsContainer);

        this.btnScripts = document.createElement("div");
        this.btnScripts.innerHTML = "Scripts";
        this.btnScripts.className = "";
        tabsContainer.appendChild(this.btnScripts);

        this.btnReports = document.createElement("div");
        this.btnReports.innerHTML = "Reports";
        this.btnReports.className = "";
        tabsContainer.appendChild(this.btnReports);

        this.btnOngoing = document.createElement("div");
        this.btnOngoing.innerHTML = "Ongoing scripts";
        this.btnOngoing.className = "";
        tabsContainer.appendChild(this.btnOngoing);
        
        this.btnReload.onclick = () => this.ListScripts();

        this.body = document.createElement("div");
        this.body.className = "v-tab-body";
        this.content.appendChild(this.body);

        this.btnScripts.onclick = () => this.ShowScripts();
        this.btnReports.onclick = () => this.ShowReports();
        this.btnOngoing.onclick = () => this.ShowOngoing();

        this.ListScripts();
    }

    ShowScripts() {
        this.btnScripts.style.backgroundColor = "rgb(96,96,96)";
        this.btnReports.style.backgroundColor = "rgb(72,72,72)";
        this.btnOngoing.style.backgroundColor = "rgb(72,72,72)";
        this.body.innerHTML = "";

        for (let i = 0; i < this.payload.length; i++) {
            let script = document.createElement("div");
            script.innerHTML = this.payload[i];
            this.body.appendChild(script);

            script.ondblclick = () => {
                new ScriptEditor(this.payload[i]);
            };
        }
    }

    ShowReports() {
        this.btnScripts.style.backgroundColor = "rgb(72,72,72)";
        this.btnReports.style.backgroundColor = "rgb(96,96,96)";
        this.btnOngoing.style.backgroundColor = "rgb(72,72,72)";
        this.body.innerHTML = "";
    }

    ShowOngoing() {
        this.btnScripts.style.backgroundColor = "rgb(72,72,72)";
        this.btnReports.style.backgroundColor = "rgb(72,72,72)";
        this.btnOngoing.style.backgroundColor = "rgb(96,96,96)";
        this.body.innerHTML = "";
    }

    ListScripts() {
        let xhr = new XMLHttpRequest();
        xhr.onreadystatechange = () => {
            if (xhr.readyState == 4 && xhr.status == 200) {
                let split = xhr.responseText.split(String.fromCharCode(127));
                if (split.length < 1) return;
                this.payload = split;
                this.ShowScripts();

            } else if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                this.ConfirmBox("Server is unavailable.", true);
                
        };
        xhr.open("GET", "listscripts", true);
        xhr.send();
    }
}

new Scripts();
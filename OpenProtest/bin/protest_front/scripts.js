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
        this.selectedTab = 0;

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
        tabsContainer.appendChild(this.btnScripts);

        this.btnReports = document.createElement("div");
        this.btnReports.innerHTML = "Reports";
        tabsContainer.appendChild(this.btnReports);

        this.btnOngoing = document.createElement("div");
        this.btnOngoing.innerHTML = "Ongoing scripts";
        tabsContainer.appendChild(this.btnOngoing);

        this.btnNew.onclick = () => this.AddNew();
        this.btnReload.onclick = () => this.ListScripts();

        this.body = document.createElement("div");
        this.body.className = "v-tab-body";
        this.content.appendChild(this.body);

        this.txtFilter = document.createElement("input");
        this.txtFilter.type = "text";
        this.txtFilter.placeholder = "Find";
        this.txtFilter.style.position = "absolute";
        this.txtFilter.style.right = "4px";
        this.txtFilter.style.top = "4px";
        this.txtFilter.style.width = "50%";
        this.txtFilter.style.maxWidth = "200px";
        this.body.appendChild(this.txtFilter);

        this.list = document.createElement("div");
        this.list.className = "script-list no-results";
        this.body.appendChild(this.list);

        this.btnScripts.onclick = () => this.ShowScripts();
        this.btnReports.onclick = () => this.ShowReports();
        this.btnOngoing.onclick = () => this.ShowOngoing();

        this.txtFilter.oninput = () => {
            switch (this.selectedTab) {
                case 0: this.ShowScripts(); break;
                case 1: this.ShowReports(); break;
                case 2: this.ShowOngoing(); break;
            }
        };

        this.ListScripts();
    }

    ShowScripts() {
        this.selectedTab = 0;
        this.btnScripts.style.backgroundColor = "rgb(96,96,96)";
        this.btnReports.style.backgroundColor = "rgb(72,72,72)";
        this.btnOngoing.style.backgroundColor = "rgb(72,72,72)";
        this.list.innerHTML = "";

        let filter = this.txtFilter.value.toLocaleLowerCase();

        for (let i = 0; i < this.payload.length; i+=4) {
            if (this.payload[i] != "s") continue;
            if (this.payload[i+1].toLocaleLowerCase().indexOf(filter, 0) == -1) continue;

            let name = this.payload[i+1];
            let date = this.payload[i+2];
            let size = this.payload[i+3];

            let script = document.createElement("div");
            script.className = "script-list-item";
            this.list.appendChild(script);

            let icon = document.createElement("div");
            icon.style.backgroundImage = "url(res/scriptfile.svgz)";
            script.appendChild(icon);

            let lblName = document.createElement("div");
            lblName.innerHTML = name;
            script.appendChild(lblName);

            let lblDate = document.createElement("div");
            lblDate.innerHTML = date;
            script.appendChild(lblDate);

            let lblSize = document.createElement("div");
            lblSize.innerHTML = size;
            script.appendChild(lblSize);

            let remove = document.createElement("div");
            script.appendChild(remove);

            script.ondblclick = () => { new ScriptEditor(name); };

            remove.onclick = event => {
                event.stopPropagation();
                this.ConfirmBox("Are you sure you want to delete " + name).addEventListener("click", ()=> {
                    let xhr = new XMLHttpRequest();
                    xhr.onreadystatechange = () => {
                        if (xhr.readyState == 4 && xhr.status == 200) {
                            if (xhr.responseText == "ok")
                                this.ListScripts();
                            else
                                this.ConfirmBox(xhr.responseText, true);

                        } else if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                            this.ConfirmBox("Server is unavailable.", true);
                    };
                    xhr.open("GET", "delscript&filename=" + name, true);
                    xhr.send();
                });
            };
        }
    }

    ShowReports() {
        this.selectedTab = 1;
        this.btnScripts.style.backgroundColor = "rgb(72,72,72)";
        this.btnReports.style.backgroundColor = "rgb(96,96,96)";
        this.btnOngoing.style.backgroundColor = "rgb(72,72,72)";
        this.list.innerHTML = "";

        let filter = this.txtFilter.value.toLocaleLowerCase();

        for (let i = 0; i < this.payload.length; i+=4) {
            if (this.payload[i] != "r") continue;
            if (this.payload[i+1].toLocaleLowerCase().indexOf(filter, 0) == -1) continue;

            let name = this.payload[i+1];
            let date = this.payload[i+2];
            let size = this.payload[i+3];

            let script = document.createElement("div");
            script.className = "script-list-item";
            this.list.appendChild(script);

            let icon = document.createElement("div");
            icon.style.backgroundImage = "url(res/reportfile.svgz)";
            script.appendChild(icon);

            let lblName = document.createElement("div");
            lblName.innerHTML = name;
            script.appendChild(lblName);

            let lblDate = document.createElement("div");
            lblDate.innerHTML = date;
            script.appendChild(lblDate);

            let lblSize = document.createElement("div");
            lblSize.innerHTML = size;
            script.appendChild(lblSize);

            let remove = document.createElement("div");
            script.appendChild(remove);

            script.ondblclick = () => { new ScriptReport(name); };

            remove.onclick = event => {
                event.stopPropagation();
                this.ConfirmBox("Are you sure you want to delete " + name).addEventListener("click", () => {
                    let xhr = new XMLHttpRequest();
                    xhr.onreadystatechange =() => {
                        if (xhr.readyState == 4 && xhr.status == 200) {
                            if (xhr.responseText == "ok")
                                this.ListScripts();
                            else
                                this.ConfirmBox(xhr.responseText, true);

                        } else if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                            this.ConfirmBox("Server is unavailable.", true);
                    };
                    xhr.open("GET", "delreport&filename=" + name, true);
                    xhr.send();
                });
            };
        }
    }

    ShowOngoing() {
        this.selectedTab = 2;
        this.btnScripts.style.backgroundColor = "rgb(72,72,72)";
        this.btnReports.style.backgroundColor = "rgb(72,72,72)";
        this.btnOngoing.style.backgroundColor = "rgb(96,96,96)";
        this.list.innerHTML = "";

        let filter = this.txtFilter.value.toLocaleLowerCase();

        for (let i = 0; i < this.payload.length; i += 4) {
            if (this.payload[i] != "o") continue;
            if (this.payload[i + 1].toLocaleLowerCase().indexOf(filter, 0) == -1) continue;

            let name = this.payload[i+1];
            let date = this.payload[i+2];
            let size = this.payload[i+3];

            let script = document.createElement("div");
            script.className = "script-list-item";
            this.list.appendChild(script);

            let icon = document.createElement("div");
            icon.style.backgroundImage = "url(res/l_run.svgz)";
            script.appendChild(icon);

            let lblName = document.createElement("div");
            lblName.innerHTML = name;
            script.appendChild(lblName);

            let lblDate = document.createElement("div");
            lblDate.innerHTML = date;
            script.appendChild(lblDate);

            let lblSize = document.createElement("div");
            lblSize.innerHTML = size;
            script.appendChild(lblSize);

            script.ondblclick = () => { new ScriptReport(name); };
        }
    }

    AddNew() {
        let obj = this.DialogBox("128px");
        let btnOK = obj[0];
        let innerBox = obj[1];

        innerBox.parentNode.style.maxWidth = "480px";
        innerBox.style.padding = "16px";
        innerBox.style.textAlign = "center";

        let txtFilename = document.createElement("input");
        txtFilename.type = "text";
        txtFilename.placeholder = "File name";
        innerBox.appendChild(txtFilename);

        const create = () => {
            let xhr = new XMLHttpRequest();
            xhr.onreadystatechange = () => {
                if (xhr.readyState == 4 && xhr.status == 200) {
                    if (xhr.responseText == "ok")
                        this.ListScripts();
                    else 
                        this.ConfirmBox(xhr.responseText, true);                    

                } else if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                    this.ConfirmBox("Server is unavailable.", true);
            };
            xhr.open("GET", "newscript&filename=" + txtFilename.value, true);
            xhr.send();
        };

        txtFilename.onkeyup = event => {
            if (event.keyCode == 13) { //enter
                btnOK.parentNode.childNodes[1].onclick();
                create();
            }

            if (event.keyCode == 27) //esc
                btnOK.parentNode.childNodes[1].onclick();
        };
        
        btnOK.addEventListener("click", () => { create(); });

        txtFilename.focus();
    }

    ListScripts() {
        let xhr = new XMLHttpRequest();
        xhr.onreadystatechange = () => {
            if (xhr.readyState == 4 && xhr.status == 200) {
                let split = xhr.responseText.split(String.fromCharCode(127));
                if (split.length < 1) return;
                this.payload = split;

                switch (this.selectedTab) {
                    case 0: this.ShowScripts(); break;
                    case 1: this.ShowReports(); break;
                    case 2: this.ShowOngoing(); break;
                }

            } else if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                this.ConfirmBox("Server is unavailable.", true);
        };
        xhr.open("GET", "listscripts", true);
        xhr.send();
    }
}

class ScriptReport extends Window {
    constructor(filename) {
        super();
        this.setTitle("Report - " + filename);
        this.setIcon("res/reportfile.svgz");

        this.content.style.padding = "12px";
        this.content.style.fontFamily = "monospace";
        this.content.style.overflow = "auto";
        this.content.style.userSelect = "text";
        this.content.style.webkitUserSelect = "text";

        let text = "";

        let xhr = new XMLHttpRequest();
        xhr.onreadystatechange = () => {
            if (xhr.readyState == 4 && xhr.status == 200) {
                text = xhr.responseText;
                let report = xhr.responseText;

                while (report.indexOf("\n") > -1)
                    report = report.replace("\n", "<br>");

                while (report.indexOf("\t") > -1)
                    report = report.replace("\t", "&emsp;");

                this.content.innerHTML = report;

            } else if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                this.ConfirmBox("Server is unavailable.", true).addEventListener("click", () => { this.Close(); });
        };
        xhr.open("GET", "getreport&filename=" + filename, true);
        xhr.send();

        this.btnDownload = document.createElement("div");
        this.btnDownload.style.backgroundImage = "url(res/l_download.svgz)";
        this.btnDownload.setAttribute("tip-below", "Download");
        this.toolbox.appendChild(this.btnDownload);

        this.lblTitle.style.left = TOOLBAR_GAP + this.toolbox.childNodes.length * 22 + "px";

        this.btnDownload.addEventListener("click", event => {
            if (text.length == 0) return;

            let psudo = document.createElement("a");
            psudo.style.display = "none";
            this.win.appendChild(psudo);

            psudo.setAttribute("href", "data:text/plain;base64," + btoa(text));
            psudo.setAttribute("download", filename);

            psudo.click(null);
        });
    }    
}

new Scripts();
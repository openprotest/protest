class Scripts extends Tabs {
    constructor(args) {
        super();

        this.args = args ? args : "";

        this.AddCssDependencies("scripts.css");

        this.SetTitle("Scripts");
        this.SetIcon("res/scripts.svgz");

        this.tabsContainer.style.width = "150px";
        this.subContent.style.left = "175px";

        this.payload = null;
        this.selectedTab = 0;

        this.btnNew = document.createElement("div");
        this.btnNew.style.backgroundImage = "url(res/l_new.svgz)";
        this.btnNew.setAttribute("tip-below", "New");
        this.toolbox.appendChild(this.btnNew);

        this.btnReload = document.createElement("div");
        this.btnReload.style.backgroundImage = "url(res/l_reload.svgz)";
        this.btnReload.setAttribute("tip-below", "Reload");
        this.toolbox.appendChild(this.btnReload);

        this.lblTitle.style.left = TOOLBAR_GAP + this.toolbox.childNodes.length * 29 + "px";

        this.tabScripts = this.AddTab("Scripts");
        this.tabReports = this.AddTab("Reports");
        this.tabOngoing = this.AddTab("Ongoing scripts");

        this.btnNew.onclick = () => this.AddNew();
        this.btnReload.onclick = () => this.ListScripts();

        this.txtFilter = document.createElement("input");
        this.txtFilter.type = "text";
        this.txtFilter.placeholder = "Find";
        this.txtFilter.style.position = "absolute";
        this.txtFilter.style.right = "4px";
        this.txtFilter.style.top = "4px";
        this.txtFilter.style.width = "50%";
        this.txtFilter.style.maxWidth = "200px";
        this.subContent.appendChild(this.txtFilter);

        this.list = document.createElement("div");
        this.list.className = "script-list no-results";
        this.subContent.appendChild(this.list);

        this.tabScripts.onclick = ()=> this.ShowScripts();
        this.tabReports.onclick = ()=> this.ShowReports();
        this.tabOngoing.onclick = ()=> this.ShowOngoing();

        this.txtFilter.oninput = () => {
            switch (this.selectedTab) {
                case 0: this.ShowScripts(); break;
                case 1: this.ShowReports(); break;
                case 2: this.ShowOngoing(); break;
            }
        };

        switch (this.args) {
            case "reports": this.selectedTab = 1; break;
            case "ongoing": this.selectedTab = 2; break;
            default: this.selectedTab = 0;
        }

        this.ListScripts();        
    }

    ShowScripts() {
        this.selectedTab = 0;
        this.args = "scripts";
        this.list.innerHTML = "";

        let filter = this.txtFilter.value.toLocaleLowerCase();

        for (let i = 0; i < this.payload.length; i += 4) {
            if (this.payload[i] != "s") continue;
            if (this.payload[i + 1].toLocaleLowerCase().indexOf(filter, 0) == -1) continue;

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
            lblName.style.fontWeight = "500";
            script.appendChild(lblName);

            let lblDate = document.createElement("div");
            lblDate.innerHTML = date;
            script.appendChild(lblDate);

            let lblSize = document.createElement("div");
            lblSize.innerHTML = size;
            script.appendChild(lblSize);

            let remove = document.createElement("div");
            script.appendChild(remove);

            script.ondblclick = () => { new ScriptEditor({file: name}); };

            remove.onclick = event => {
                event.stopPropagation();
                const btnOK = this.ConfirmBox("Are you sure you want to delete " + name);
                if (btnOK) btnOK.addEventListener("click", () => {
                    const xhr = new XMLHttpRequest();
                    xhr.onreadystatechange = () => {
                        if (xhr.status == 403) location.reload(); //authorization

                        if (xhr.readyState == 4 && xhr.status == 200) {
                            if (xhr.responseText == "ok")
                                this.ListScripts();
                            else
                                this.ConfirmBox(xhr.responseText, true);

                        } else if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                            this.ConfirmBox("Server is unavailable.", true);
                    };
                    xhr.open("GET", "scripts/delete&filename=" + name, true);
                    xhr.send();
                });
            };
        }
    }

    ShowReports() {
        this.selectedTab = 1;
        this.args = "reports";
        this.list.innerHTML = "";

        let filter = this.txtFilter.value.toLocaleLowerCase();

        for (let i = 0; i < this.payload.length; i += 4) {
            if (this.payload[i] != "r") continue;
            if (this.payload[i + 1].toLocaleLowerCase().indexOf(filter, 0) == -1) continue;

            let name = this.payload[i + 1];
            let date = this.payload[i + 2];
            let size = this.payload[i + 3];

            let script = document.createElement("div");
            script.className = "script-list-item";
            this.list.appendChild(script);

            let icon = document.createElement("div");
            icon.style.backgroundImage = "url(res/reportfile.svgz)";
            script.appendChild(icon);

            let lblName = document.createElement("div");
            lblName.innerHTML = name;
            lblName.style.fontWeight = "500";
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
                const btnOK = this.ConfirmBox("Are you sure you want to delete " + name);
                if (btnOK) btnOK.addEventListener("click", () => {
                    const xhr = new XMLHttpRequest();
                    xhr.onreadystatechange = () => {
                        if (xhr.status == 403) location.reload(); //authorization

                        if (xhr.readyState == 4 && xhr.status == 200) {
                            if (xhr.responseText == "ok")
                                this.ListScripts();
                            else
                                this.ConfirmBox(xhr.responseText, true);

                        } else if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                            this.ConfirmBox("Server is unavailable.", true);
                    };
                    xhr.open("GET", "scripts/delreport&filename=" + name, true);
                    xhr.send();
                });
            };
        }
    }

    ShowOngoing() {
        this.selectedTab = 2;
        this.args = "ongoing";
        this.list.innerHTML = "";

        let filter = this.txtFilter.value.toLocaleLowerCase();

        for (let i = 0; i < this.payload.length; i += 4) {
            if (this.payload[i] != "o") continue;
            if (this.payload[i + 1].toLocaleLowerCase().indexOf(filter, 0) == -1) continue;

            let name = this.payload[i + 1];
            let date = this.payload[i + 2];
            let size = this.payload[i + 3];

            let script = document.createElement("div");
            script.className = "script-list-item";
            this.list.appendChild(script);

            let icon = document.createElement("div");
            icon.style.backgroundImage = "url(res/l_run.svgz)";
            script.appendChild(icon);

            let lblName = document.createElement("div");
            lblName.innerHTML = name;
            lblName.style.fontWeight = "500";
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
        const dialog = this.DialogBox("128px");
        if (dialog === null) return;
        const btnOK = dialog.btnOK;
        const innerBox = dialog.innerBox;

        innerBox.parentNode.style.maxWidth = "480px";
        innerBox.style.padding = "16px";
        innerBox.style.textAlign = "center";

        const txtFilename = document.createElement("input");
        txtFilename.type = "text";
        txtFilename.placeholder = "File name";
        innerBox.appendChild(txtFilename);

        const create = () => {
            if (txtFilename.value.length == 0) return;
            const xhr = new XMLHttpRequest();
            xhr.onreadystatechange = () => {
                if (xhr.status == 403) location.reload(); //authorization

                if (xhr.readyState == 4 && xhr.status == 200) {
                    if (xhr.responseText == "ok")
                        this.ListScripts();
                    else
                        this.ConfirmBox(xhr.responseText, true);

                } else if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                    this.ConfirmBox("Server is unavailable.", true);
            };
            xhr.open("GET", "scripts/create&filename=" + txtFilename.value, true);
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
        const xhr = new XMLHttpRequest();
        xhr.onreadystatechange = () => {
            if (xhr.status == 403) location.reload(); //authorization

            if (xhr.readyState == 4 && xhr.status == 200) {
                let split = xhr.responseText.split(String.fromCharCode(127));
                if (split.length < 1) return;
                this.payload = split;

                this.tabScripts.className = "";
                this.tabReports.className = "";
                this.tabOngoing.className = "";

                switch (this.selectedTab) {
                    case 0:
                        this.ShowScripts();
                        this.tabScripts.className = "v-tab-selected";
                        break;

                    case 1:
                        this.ShowReports();
                        this.tabReports.className = "v-tab-selected";
                        break;

                    case 2:
                        this.ShowOngoing();
                        this.tabOngoing.className = "v-tab-selected";
                        break;
                }

            } else if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                this.ConfirmBox("Server is unavailable.", true);
        };
        xhr.open("GET", "scripts/list", true);
        xhr.send();
    }
}

class ScriptReport extends Window {
    constructor(filename) {
        super();
        this.SetTitle("Report - " + filename);
        this.SetIcon("res/reportfile.svgz");

        this.args = filename;

        let divReport = document.createElement("div");
        divReport.style.overflowX = "scroll";
        divReport.style.overflowY = "scroll";
        divReport.style.whiteSpace = "nowrap";
        divReport.style.fontFamily = "monospace";
        divReport.style.userSelect = "text";
        divReport.style.position = "absolute";
        divReport.style.padding = "16px";
        divReport.style.left = "0";
        divReport.style.right = "0";
        divReport.style.top = "0";
        divReport.style.bottom = "32px";
        divReport.style.transition = "font-size .2s";
        this.content.appendChild(divReport);

        let text = "";

        const xhr = new XMLHttpRequest();
        xhr.onreadystatechange = () => {
            if (xhr.status == 403) location.reload(); //authorization

            if (xhr.readyState == 4 && xhr.status == 200) {
                text = xhr.responseText;

                let split = xhr.responseText.split("\n");
                let report = "";
                for (let i = 0; i < split.length; i++) {
                    split[i] = split[i].replaceAll("\t", "&emsp;");
                    split[i] = split[i].replaceAll(" ", "&nbsp;");
                    report += "<br>" + split[i];
                }

                divReport.innerHTML = report;

            } else if (xhr.readyState == 4 && xhr.status == 0) { //disconnected
                const btnOK = this.ConfirmBox("Server is unavailable.", true);
                if (btnOK) btnOK.addEventListener("click", () => { this.Close(); });
            }
        };
        xhr.open("GET", "scripts/getreport&filename=" + filename, true);
        xhr.send();

        this.btnDownload = document.createElement("div");
        this.btnDownload.style.backgroundImage = "url(res/l_download.svgz)";
        this.btnDownload.setAttribute("tip-below", "Download");
        this.toolbox.appendChild(this.btnDownload);

        this.lblTitle.style.left = TOOLBAR_GAP + this.toolbox.childNodes.length * 29 + "px";

        this.btnDownload.addEventListener("click", event => {
            if (text.length == 0) return;

            const pseudo = document.createElement("a");
            pseudo.style.display = "none";
            this.win.appendChild(pseudo);

            pseudo.setAttribute("href", "data:text/plain;base64," + btoa(text));
            pseudo.setAttribute("download", filename);

            pseudo.click(null);
        });

        let zoom = document.createElement("input");
        zoom.type = "range";
        zoom.min = 8;
        zoom.max = 24;
        zoom.value = 16;
        zoom.style.position = "absolute";
        zoom.style.opacity = ".8";
        zoom.style.right = "32px";
        zoom.style.bottom = "8px";
        this.content.appendChild(zoom);        

        zoom.onmousedown = event => event.stopPropagation();
        zoom.onchange = () => { divReport.style.fontSize = zoom.value + "px"; };
    }
}

class ScriptPreview extends Window {
    constructor(id) {
        super();
        this.SetTitle("Preview");
        this.SetIcon("res/reportfile.svgz");

        this.AddCssDependencies("wmi.css");

        this.previewId = id;

        this.content.style.overflow = "hidden";

        this.preview = document.createElement("div");
        this.preview.style.overflowX = "scroll";
        this.preview.style.overflowY = "scroll";
        this.preview.style.whiteSpace = "nowrap";
        this.preview.style.fontFamily = "monospace";
        this.preview.style.userSelect = "text";
        this.preview.style.position = "absolute";
        this.preview.style.padding = "16px";
        this.preview.style.left = "0";
        this.preview.style.right = "0";
        this.preview.style.top = "0";
        this.preview.style.bottom = "32px";
        this.preview.style.transition = "font-size .2s";
        //this.content.appendChild(this.preview);

        const waitbox = document.createElement("span");
        waitbox.className = "waitbox";
        waitbox.style.top = "0";
        this.content.appendChild(waitbox);

        waitbox.appendChild(document.createElement("div"));

        const waitLabel = document.createElement("span");
        waitLabel.innerHTML = "Processing stuff. Please wait.";
        waitLabel.className = "wait-label";
        waitLabel.style.top = "0";
        this.content.appendChild(waitLabel);
    }

    Load() {
        const xhr = new XMLHttpRequest();
        xhr.onreadystatechange = () => {
            if (xhr.status == 403) location.reload(); //authorization

            if (xhr.readyState == 4 && xhr.status == 200) {
                let split = xhr.responseText.split(String.fromCharCode(127));
                this.Plot(split);

            } else if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                this.ConfirmBox("Server is unavailable.", true);
        };
        xhr.open("GET", "scripts/getpreview&id=" + this.previewId, true);
        xhr.send();
    }

    Plot(split) {
        this.content.innerHTML = "";
        this.content.style.overflow = "auto";
        this.content.style.transition = ".8s";
        this.content.style.backgroundColor = "var(--pane-color)";

        const table = document.createElement("table");
        table.className = "wmi-table";
        this.content.appendChild(table);

        let length = parseInt(split[0]);

        for (let i = 1; i < split.length - 1; i += length) {
            const tr = document.createElement("tr");
            table.appendChild(tr);

            const tdn = document.createElement("td");
            tr.appendChild(tdn);

            for (let j = 0; j < length; j++) {
                let td = document.createElement("td");
                td.innerHTML = split[i+j];
                tr.appendChild(td);
            }
        }

    }
}
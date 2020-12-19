class Wmi extends Window {
    constructor(args) {
        super();

        this.AddCssDependencies("wmi.css");

        this.args = args ? args : {
            target: "",
            query: ""
        };

        this.setTitle("WMI console");
        this.setIcon("res/wmi.svgz");

        this.wmi_classes = {};
        this.GetWmiClasses();

        this.btnDownload = document.createElement("div");
        this.btnDownload.style.backgroundImage = "url(res/l_download.svgz)";
        this.btnDownload.setAttribute("tip-below", "Download");
        this.toolbox.appendChild(this.btnDownload);

        this.lblTitle.style.left = TOOLBAR_GAP + this.toolbox.childNodes.length * 29 + "px";

        this.content.style.overflow = "hidden";

        let divInput = document.createElement("div");
        divInput.style.position = "absolute";
        divInput.style.left = "8px";
        divInput.style.right = "40px";
        divInput.style.maxWidth = "720px";
        divInput.style.top = "8px";
        divInput.style.height = "100px";
        divInput.style.display = "grid";
        divInput.style.gridTemplateColumns = "72px auto 80px";
        divInput.style.gridTemplateRows = "32px 32px 56px auto";
        divInput.style.transition = ".2s";
        this.content.appendChild(divInput);

        let lblTarger = document.createElement("div");
        lblTarger.style.gridArea = "1 / 1";
        lblTarger.innerHTML = "Target: ";
        divInput.appendChild(lblTarger);

        this.txtTarget = document.createElement("input");
        this.txtTarget.type = "text";
        this.txtTarget.placeholder = "hostname or ip";
        this.txtTarget.style.gridArea = "1 / 2";
        if (this.args.target != null) this.txtTarget.value = this.args.target;
        divInput.appendChild(this.txtTarget);

        let btnTarget = document.createElement("input");
        btnTarget.type = "button";
        btnTarget.value = "...";
        btnTarget.style.gridArea = "2 / 3";
        divInput.appendChild(btnTarget);

        let lblQuery = document.createElement("div");
        lblQuery.innerHTML = "Query: ";
        lblQuery.style.gridArea = "2 / 1";
        divInput.appendChild(lblQuery);

        this.txtQuery = document.createElement("textarea");
        this.txtQuery.placeholder = "e.g.: SELECT * FROM Win32_BIOS WHERE Status = \"OK\"";
        this.txtQuery.style.gridArea = "2 / 2 / 2 span / auto";
        //this.txtQuery.style.fontFamily = "monospace";
        this.txtQuery.style.resize = "none";
        if (this.args.query != null) this.txtQuery.value = this.args.query;
        divInput.appendChild(this.txtQuery);

        this.btnExecute = document.createElement("input");
        this.btnExecute.type = "button";
        this.btnExecute.value = "Execute";
        this.btnExecute.style.height = "auto";
        this.btnExecute.style.gridArea = "3 / 3";
        divInput.appendChild(this.btnExecute);

        let btnShow = document.createElement("div");
        btnShow.style.position = "absolute";
        btnShow.style.right = "8px";
        btnShow.style.top = "112px";
        btnShow.style.width = "0";
        btnShow.style.height = "0";
        btnShow.style.borderStyle = "solid";
        btnShow.style.borderWidth = "14px 12px 0px 12px";
        btnShow.style.borderColor = "var(--control-color) transparent transparent transparent";
        btnShow.style.transform = "rotate(-180deg)";
        btnShow.style.transition = ".4s";

        this.content.appendChild(btnShow);

        this.divPlot = document.createElement("div");
        this.divPlot.className = "no-results";
        this.divPlot.style.backgroundColor = "var(--pane-color)";
        this.divPlot.style.borderRadius = "2px";
        this.divPlot.style.overflow = "auto";
        this.divPlot.style.position = "absolute";
        this.divPlot.style.left = "4px";
        this.divPlot.style.right = "4px";
        this.divPlot.style.top = "136px";
        this.divPlot.style.bottom = "4px";
        this.divPlot.style.transition = ".4s";
        this.content.appendChild(this.divPlot);

        this.txtTarget.oninput = () => { this.args.target = this.txtTarget.value };
        this.txtQuery.oninput = () => { this.args.query = this.txtQuery.value };

        btnTarget.onclick = () => { this.SequelAssistant(); };

        this.btnExecute.onclick = () => { this.Query(); };

        btnShow.onclick = () => {
            if (divInput.style.visibility == "hidden") {
                btnShow.style.top = "112px";
                btnShow.style.transform = "rotate(-180deg)";
                divInput.style.visibility = "visible";
                divInput.style.opacity = "1";
                divInput.style.transform = "none";
                this.divPlot.style.top = "136px";

            } else {
                btnShow.style.top = "6px";
                btnShow.style.transform = "rotate(0deg)";
                divInput.style.visibility = "hidden";
                divInput.style.opacity = "0";
                divInput.style.transform = "translateY(-64px)";
                this.divPlot.style.top = "28px";
            }
        };

        if (this.args.target.length > 0 && this.args.query.length > 0) {
            this.btnExecute.onclick();
            btnShow.onclick();
        }

        this.btnDownload.addEventListener("click", event => {
            const NL = String.fromCharCode(13) + String.fromCharCode(10);
            const TB = String.fromCharCode(9);

            let text = "";

            let array = this.divPlot.firstChild;
            if (array) {
                for (let i = 0; i < array.childNodes.length; i++) {
                    for (let j = 0; j < array.childNodes[i].childNodes.length; j++) {
                        text += array.childNodes[i].childNodes[j].innerHTML;
                        text += TB;
                    }
                    text += NL;
                }
            }

            if (text.length == 0) return;

            const pseudo = document.createElement("a");
            pseudo.style.display = "none";
            this.win.appendChild(pseudo);

            const NOW = new Date();
            pseudo.setAttribute("href", "data:text/plain;base64," + btoa(text));
            pseudo.setAttribute("download", "wmi_" +
                NOW.getFullYear() +
                ((NOW.getMonth() < 10) ? "0" + NOW.getMonth() : NOW.getMonth()) +
                ((NOW.getDate() < 10) ? "0" + NOW.getDate() : NOW.getDate()) + "_" +
                ((NOW.getHours() < 10) ? "0" + NOW.getHours() : NOW.getHours()) +
                ((NOW.getMinutes() < 10) ? "0" + NOW.getMinutes() : NOW.getMinutes()) +
                ((NOW.getSeconds() < 10) ? "0" + NOW.getSeconds() : NOW.getSeconds()) +
                ".txt");

            pseudo.click(null);
        });
    }

    GetWmiClasses() {
        const xhr = new XMLHttpRequest();
        xhr.onreadystatechange = () => {
            if (xhr.status == 403) location.reload(); //authorization
            if (xhr.readyState == 4 && xhr.status == 200)
                this.wmi_classes = JSON.parse(xhr.responseText);
        };
        xhr.open("GET", "wmi_classes.json", true);
        xhr.send();
    }

    SequelAssistant() {
        let lastQuery = this.txtQuery.value.toLowerCase();

        let words = lastQuery.split(" ");
        let className = null;
        if (this.wmi_classes.hasOwnProperty("classes"))
            for (let i = 0; i < words.length; i++)
                if (words[i].startsWith("win32_")) {
                    className = words[i];
                    break;
                }

        let select_index = lastQuery.indexOf("select");
        let from_index = lastQuery.indexOf("from");
        let lastProperties = lastQuery.substring(select_index + 6, from_index).trim();
        let lastPropertiesArray = lastProperties.split(",").map(o=>o.trim());

        const dialog = this.DialogBox("640px");
        if (dialog === null) return;
        const btnOK = dialog.btnOK;
        const innerBox = dialog.innerBox;

        innerBox.style.margin = "16px";
        innerBox.style.display = "grid";
        innerBox.style.gridTemplateColumns = "50% 16px auto";
        innerBox.style.gridTemplateRows = "32px 8px auto 8px 64px";

        let txtClassFilter = document.createElement("input");
        txtClassFilter.type = "text";
        txtClassFilter.placeholder = "Find..";
        txtClassFilter.style.gridArea = "1 / 1";
        innerBox.appendChild(txtClassFilter);

        let lstClasses = document.createElement("div");
        lstClasses.className = "wmi-classes-list";
        lstClasses.style.backgroundColor = "rgb(180,180,180)";
        lstClasses.style.gridArea = "3 / 1";
        lstClasses.style.overflowY = "scroll";
        innerBox.appendChild(lstClasses);

        let lstProperties = document.createElement("div");
        lstProperties.className = "wmi-properties-list";
        lstProperties.style.backgroundColor = "rgb(180,180,180)";
        lstProperties.style.gridArea = "3 / 3";
        lstProperties.style.overflowY = "scroll";
        innerBox.appendChild(lstProperties);

        let txtPreview = document.createElement("textarea");
        txtPreview.setAttribute("readonly", true);
        txtPreview.style.resize = "none";
        txtPreview.style.gridArea = "5 / 1 / span 1 / span 3";
        innerBox.appendChild(txtPreview);

        if (!this.wmi_classes.hasOwnProperty("classes")) {
            this.ConfirmBox("Failed to load WMI classes.");
            btnOK.onclick();
            return;
        }

        let selected = null;

        btnOK.addEventListener("click", () => {
            this.txtQuery.value = txtPreview.value;
            this.args.query = this.txtQuery.value;
        });

        txtClassFilter.oninput = () => {
            if (!this.wmi_classes.hasOwnProperty("classes")) return;
            let filter = txtClassFilter.value.toLowerCase();

            lstClasses.innerHTML = "";
            lstProperties.innerHTML = "";

            for (let i = 0; i < this.wmi_classes.classes.length; i++) {
                let matched = false;

                if (this.wmi_classes.classes[i].class.toLowerCase().indexOf(filter) > -1)
                    matched = true;
                else
                    for (let j = 0; j < this.wmi_classes.classes[i].properties.length; j++)
                        if (this.wmi_classes.classes[i].properties[j].toLowerCase().indexOf(filter) > -1) {
                            matched = true;
                            break;
                        }

                let check_list = [];

                if (matched) {
                    let newClass = document.createElement("div");
                    newClass.innerHTML = this.wmi_classes.classes[i].class;
                    lstClasses.appendChild(newClass);

                    newClass.onclick = () => {
                        if (selected != null) selected.style.backgroundColor = "";                        

                        check_list = [];

                        lstProperties.innerHTML = "";
                        for (let j = 0; j < this.wmi_classes.classes[i].properties.length; j++) {
                            let value = lastProperties == "*" || className == null ||
                                className.toLowerCase() == this.wmi_classes.classes[i].class.toLowerCase() &&
                                lastPropertiesArray.includes(this.wmi_classes.classes[i].properties[j].toLowerCase());

                            let divProp = document.createElement("div");
                            let chkProp = document.createElement("input");
                            chkProp.type = "checkbox";
                            chkProp.checked = value;
                            divProp.appendChild(chkProp);

                            check_list.push(value);

                            chkProp.onchange = () => {
                                check_list[j] = chkProp.checked;
                                let count = 0;
                                for (let k = 0; k < check_list.length; k++) if (check_list[k]) count++;

                                if (count == 0 || count == check_list.length)
                                    txtPreview.value = "SELECT * FROM " + this.wmi_classes.classes[i].class;
                                else {
                                    let sel = "";
                                    for (let k = 0; k < check_list.length; k++) if (check_list[k]) sel += (sel.length == 0) ? this.wmi_classes.classes[i].properties[k] : ", " + this.wmi_classes.classes[i].properties[k];
                                    txtPreview.value = "SELECT " + sel + " FROM " + this.wmi_classes.classes[i].class;
                                }
                            };

                            this.AddCheckBoxLabel(divProp, chkProp, this.wmi_classes.classes[i].properties[j]);
                            lstProperties.appendChild(divProp);

                            selected = newClass;
                            selected.style.backgroundColor = "var(--select-color)";
                        }
                        txtPreview.value = "SELECT * FROM " + this.wmi_classes.classes[i].class;
                    };

                    newClass.ondblclick = () => {
                        this.txtQuery.value = txtPreview.value;
                        btnOK.onclick();
                    };

                    if (className && className == this.wmi_classes.classes[i].class.toLowerCase()) {
                        newClass.onclick();
                        newClass.scrollIntoView();
                        className = null;
                    }
                }
            }

        };
        txtClassFilter.oninput();
    }

    CallMethodDialog() {
        const dialog = this.DialogBox("640px");
        if (dialog === null) return;
        const btnOK = dialog.btnOK;

        btnOK.addEventListener("click", () => {

        });
    }

    Query() {
        if (this.txtTarget.value.length == 0 || this.txtQuery.value.length == 0) {
            this.ConfirmBox("Incomplete query.", true);
            return;
        }

        this.setIcon("res/wmi.svgz");
        this.setTitle("WMI console");

        let waitbox = document.createElement("div");
        waitbox.appendChild(document.createElement("div"));
        waitbox.className = "waitbox";
        waitbox.style.marginTop = "100px";

        const xhr = new XMLHttpRequest();
        xhr.onreadystatechange = () => {
            if (xhr.status == 403) location.reload(); //authorization

            if (xhr.readyState == 4 && xhr.status == 200) {
                this.divPlot.innerHTML = "";

                let split = xhr.responseText.split(String.fromCharCode(127));
                if (split.length > 1) this.Plot(split);

            } else if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                this.ConfirmBox("Server is unavailable.", true);

            if (xhr.readyState == 4) {
                this.btnExecute.removeAttribute("disabled", true);
                this.divPlot.style.display = "block";
                this.content.removeChild(waitbox);
            }
        };

        this.txtTarget.value = this.txtTarget.value.trim();

        let q = this.txtQuery.value.trim();
        q = q.replaceAll("\n", " ");

        this.divPlot.style.display = "none";

        this.btnExecute.setAttribute("disabled", true);

        this.divPlot.innerHTML = "";
        this.content.appendChild(waitbox);

        xhr.open("POST", "wmi/wmiquery&target=" + this.txtTarget.value, true);
        xhr.send(q);
    }

    Plot(split) {
        let words = this.txtQuery.value.split(" ").map(v => v.toLowerCase());
        let className = "";
        let hasMethods = false;
        let targetHost = this.txtTarget.value;

        if (this.wmi_classes.hasOwnProperty("classes")) {
            for (let i = 0; i < words.length; i++)
                if (words[i].startsWith("win32_")) {
                    className = words[i];
                    break;
                }

            for (let i = 0; i < this.wmi_classes.classes.length; i++)
                if (this.wmi_classes.classes[i].class.toLowerCase().indexOf(className) > -1) {
                    hasMethods = this.wmi_classes.classes[i].hasOwnProperty("methods");
                    break;
                }
        }

        const table = document.createElement("table");
        table.className = "wmi-table";

        let length = parseInt(split[0]);
        let unique = -1; //unique id possition
        for (let i = 1; i < length + 1; i++)
            if (className == "win32_process" && split[i] == "ProcessId") {
                unique = i - 1;
                break;
            } /*else if (className == "win32_service" && split[i] == "Name") {
                unique = i - 1;
                break;
            }*/

        for (let i = 1; i < split.length - 1; i += length) {
            const tr = document.createElement("tr");
            table.appendChild(tr);

            const tdn = document.createElement("td");
            tr.appendChild(tdn);

            for (let j = 0; j < length; j++) {
                let td = document.createElement("td");
                td.innerHTML = split[i + j];
                tr.appendChild(td);
            }

            if (hasMethods && unique > -1) {
                let td = document.createElement("td");
                tr.appendChild(td);

                if (i > length) {
                    switch (className) {
                        case "win32_process":
                            const btnTerminate = document.createElement("input");
                            btnTerminate.type = "button";
                            btnTerminate.value = "Terminate";
                            btnTerminate.setAttribute("pid", split[i + unique]);
                            td.appendChild(btnTerminate);

                            btnTerminate.onclick = event => {
                                btnTerminate.disabled = true;
                                let pid = event.srcElement.getAttribute("pid");
                                const xhr = new XMLHttpRequest();
                                xhr.onreadystatechange = () => {
                                    if (xhr.status == 403) location.reload(); //authorization

                                    if (xhr.readyState == 4 && xhr.status == 200)
                                        if (xhr.responseText == "ok")
                                            table.removeChild(tr);
                                        else {
                                            td.removeChild(btnTerminate);
                                            td.innerHTML = xhr.responseText;
                                        }
                                };
                                xhr.open("GET", "wmi/killprocess&target=" + targetHost + "&pid=" + pid, true);
                                xhr.send();
                            };
                            break;

                        default:
                        /*let btnMethod = document.createElement("input");
                        btnMethod.type  = "button";
                        btnMethod.value = "Method";
                        td.appendChild(btnMethod);
                        btnMethod.onclick = () => {
                            this.CallMethodDialog();
                        };*/
                    }

                }
            }
        }

        this.divPlot.appendChild(table);
    }
}
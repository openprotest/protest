class Clients extends Tabs {

    constructor(args) {
        super();

        this.args = args ? args : "";

        this.AddCssDependencies("clients.css");

        this.setTitle("Clients");
        this.setIcon("res/ptclients.svgz");

        this.selected = null;

        this.tabsContainer.style.width = "160px";
        this.subContent.style.left = "185px";

        this.tabClients = this.AddTab("Clients", "res/ptclients.svgz");
        this.tabAcl     = this.AddTab("Access control", "res/unlock.svgz");

        this.btnReload = document.createElement("div");
        this.btnReload.style.backgroundImage = "url(res/l_reload.svgz)";
        this.btnReload.setAttribute("tip-below", "Reload");
        this.toolbox.appendChild(this.btnReload);

        this.lblTitle.style.left = TOOLBAR_GAP + this.toolbox.childNodes.length * 29 + "px";

        this.tabClients.onclick = () => this.GetClients();
        this.tabAcl.onclick = () => this.GetAcl();

        const reload = () => {
            switch (this.args) {
                case "clients":
                    this.tabClients.className = "v-tab-selected";
                    this.selectedTab = 0;
                    this.GetClients();
                    break;

                case "acl":
                    this.tabAcl.className = "v-tab-selected";
                    this.selectedTab = 1;
                    this.GetAcl();
                    break;

                default:
                    this.tabClients.className = "v-tab-selected";
                    this.selectedTab = 0;
                    this.GetClients();
            }
        };

        this.btnReload.onclick = () => reload();
        reload();
    }

    GetClients() {
        this.args = "clients";
        this.subContent.innerHTML = "";

        this.list = document.createElement("div");
        this.list.className = "no-results";
        this.list.style.margin = "0 8px 8px 8px";
        this.list.style.borderRadius = "4px";
        this.list.style.overflowY = "auto";
        this.subContent.appendChild(this.list);

        const xhr = new XMLHttpRequest();
        xhr.onreadystatechange = () => {
            if (xhr.readyState == 4 && xhr.status == 200) {
                let split = xhr.responseText.split(String.fromCharCode(127));
                if (split < 2) return;

                for (let i = 0; i < split.length - 2; i += 4) {
                    const element = document.createElement("div");
                    element.className = "generic-list-element";
                    element.style.backgroundImage = "url(res/cookie.svgz)";
                    this.list.appendChild(element);

                    const label = document.createElement("div");
                    label.className = "generic-label1";
                    label.innerHTML = split[i + 2] + "@" + split[i];
                    element.appendChild(label);

                    const time = document.createElement("div");
                    time.className = "generic-label2";
                    time.innerHTML = split[i + 1];
                    element.appendChild(time);

                    const btnKick = document.createElement("input");
                    btnKick.type = "button";
                    btnKick.value = "Kick";
                    btnKick.className = "generic-action";
                    btnKick.style.color = "rgb(224,224,224)";
                    element.appendChild(btnKick);

                    btnKick.onclick = () => {
                        const xhrk = new XMLHttpRequest();
                        xhrk.onreadystatechange = () => {
                            if (xhrk.readyState == 4 && xhrk.status == 200 && xhrk.responseText == "ok")
                                this.list.removeChild(element);
                        };
                        xhrk.open("GET", "clients/kick&ip=" + split[i] + "&hash=" + split[i+3], true);
                        xhrk.send();
                    };
                }
            }
        };

        xhr.open("GET", "clients/get", true);
        xhr.send();
    }

    GetAcl() {
        this.args = "acl";
        this.subContent.innerHTML = "";
        this.selected = null;

        const options = document.createElement("div");
        options.style.position = "absolute";
        options.style.left = "4px";
        options.style.width = "250px";
        options.style.top = "4px";
        options.style.height = "36px";
        options.style.backgroundColor = "rgb(180,180,180)";
        options.style.borderRadius = "4px 4px 0 0";
        this.subContent.appendChild(options);

        const btnAdd = document.createElement("input");
        btnAdd.type = "button";
        btnAdd.value = "Add";
        btnAdd.className = "light-button light-button-withicon";
        btnAdd.style.backgroundImage = "url(res/new_user.svgz)";
        options.appendChild(btnAdd);

        const userslist = document.createElement("div");
        userslist.style.position = "absolute";
        userslist.style.left = "4px";
        userslist.style.width = "250px";
        userslist.style.top = "40px";
        userslist.style.bottom = "4px";
        userslist.style.overflowY = "auto";
        userslist.style.backgroundColor = "rgb(180,180,180)";
        userslist.style.borderRadius = "0 0 4px 4px";
        this.subContent.appendChild(userslist);

        const accesslist = document.createElement("div");
        accesslist.style.position = "absolute";
        accesslist.style.left = "262px";
        accesslist.style.right = "4px";
        accesslist.style.top = "4px";
        accesslist.style.bottom = "4px";
        accesslist.style.overflowY = "auto";
        this.subContent.appendChild(accesslist);

        const db = this.AddAccessCategory(accesslist, "res/database.svgz", "Inventory database", 2);
        const pw = this.AddAccessCategory(accesslist, "res/passgen.svgz", "Read passwords", 1);
        const ra = this.AddAccessCategory(accesslist, "res/remote.svgz", "Remote agent commands", 1);
        const rh = this.AddAccessCategory(accesslist, "res/gear.svgz", "Manage remote hosts", 1);
        const du = this.AddAccessCategory(accesslist, "res/user.svgz", "Manage domain users", 1);

        const dc = this.AddAccessCategory(accesslist, "res/documentation.svgz", "Documentation", 2);
        const dn = this.AddAccessCategory(accesslist, "res/charges.svgz", "Debit notes", 2);
        const wd = this.AddAccessCategory(accesslist, "res/watchdog.svgz", "Watchdog", 2);

        this.AddAccessCategory(accesslist, "res/toolbox.svgz", "Utilities", 1, false);

        const sc = this.AddAccessCategory(accesslist, "res/scripts.svgz", "Scripts", 1);
        const mi = this.AddAccessCategory(accesslist, "res/wmi.svgz", "WMI console", 1);
        const tn = this.AddAccessCategory(accesslist, "res/telnet.svgz", "Telnet", 1);
        const bu = this.AddAccessCategory(accesslist, "res/backup.svgz", "Backup", 1);
        const mu = this.AddAccessCategory(accesslist, "res/ptclients.svgz", "Manage users", 1);
        const lg = this.AddAccessCategory(accesslist, "res/log.svgz", "View log", 1);

        this.accessvalue = [db, pw, ra, rh, du, dc, dn, wd, sc, mi, tn, bu, mu, lg];

        const buttons = document.createElement("div");
        buttons.style.textAlign = "center";
        buttons.style.maxWidth = "480px";
        buttons.style.marginTop = "16px";
        accesslist.appendChild(buttons);

        const btnApply = document.createElement("input");
        btnApply.type = "button";
        btnApply.value = "Apply";
        btnApply.style.height = "32px";
        buttons.appendChild(btnApply);

        for (let i = 0; i < this.accessvalue.length; i++)
            this.accessvalue[i].setAttribute("disabled", true);

        btnAdd.onclick = () => {
            const dialog = this.DialogBox("128px");
            if (dialog === null) return;
            const btnOK = dialog.btnOK;
            const innerBox = dialog.innerBox;

            innerBox.parentNode.style.maxWidth = "480px";
            innerBox.style.padding = "16px";
            innerBox.style.textAlign = "center";

            const txtUsername = document.createElement("input");
            txtUsername.type = "text";
            txtUsername.placeholder = "Username";
            innerBox.appendChild(txtUsername);

            const addRequest = () => {
                if (txtUsername.value.length == 0) return;
                const xhr = new XMLHttpRequest();
                xhr.onreadystatechange = () => {
                    if (xhr.readyState == 4 && xhr.status == 200) {
                        if (xhr.responseText == "ok")
                            this.AddUser(userslist, txtUsername.value);
                        else
                            this.ConfirmBox(xhr.responseText, true);

                    } else if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                        this.ConfirmBox("Server is unavailable.", true);
                };
                xhr.open("POST", "acl/save&username=" + txtUsername.value, true);
                xhr.send(null);
            };

            txtUsername.onkeyup = event => {
                if (event.keyCode == 13) { //enter
                    btnOK.parentNode.childNodes[1].onclick();
                    addRequest();
                }

                if (event.keyCode == 27) //esc
                    btnOK.parentNode.childNodes[1].onclick();
            };

            btnOK.addEventListener("click", () => { addRequest(); });

            txtUsername.focus();
        };

        btnApply.onclick = () => {
            if (this.selected == null) return;

            let payload = "";
            payload += "database:"      + this.accessvalue[0].value + ",";
            payload += "password:"      + this.accessvalue[1].value + ",";
            payload += "remoteagent:"   + this.accessvalue[2].value + ",";
            payload += "remotehosts:"   + this.accessvalue[3].value + ",";
            payload += "domainusers:"   + this.accessvalue[4].value + ",";
            payload += "documentation:" + this.accessvalue[5].value + ",";
            payload += "debitnotes:"    + this.accessvalue[6].value + ",";
            payload += "watchdog:"      + this.accessvalue[7].value + ",";
            payload += "scripts:"       + this.accessvalue[8].value + ",";
            payload += "wmi:"           + this.accessvalue[9].value + ",";
            payload += "telnet:"        + this.accessvalue[10].value + ",";
            payload += "backup:"        + this.accessvalue[11].value + ",";
            payload += "manageusers:"   + this.accessvalue[12].value + ",";
            payload += "log:"           + this.accessvalue[13].value;

            const xhr = new XMLHttpRequest();
            xhr.onreadystatechange = () => {
                if (xhr.readyState == 4 && xhr.status == 200) {
                    if (xhr.responseText == "ok") {
                        this.acl[this.selected]["database"]      = this.accessvalue[0].value;
                        this.acl[this.selected]["password"]      = this.accessvalue[1].value;
                        this.acl[this.selected]["remoteagent"]   = this.accessvalue[2].value;
                        this.acl[this.selected]["remotehosts"]   = this.accessvalue[3].value;
                        this.acl[this.selected]["domainusers"]   = this.accessvalue[4].value;
                        this.acl[this.selected]["documentation"] = this.accessvalue[5].value;
                        this.acl[this.selected]["debitnotes"]    = this.accessvalue[6].value;
                        this.acl[this.selected]["watchdog"]      = this.accessvalue[7].value;
                        this.acl[this.selected]["scripts"]       = this.accessvalue[8].value;
                        this.acl[this.selected]["wmi"]           = this.accessvalue[9].value;
                        this.acl[this.selected]["telnet"]        = this.accessvalue[10].value;
                        this.acl[this.selected]["backup"]        = this.accessvalue[11].value;
                        this.acl[this.selected]["manageusers"]   = this.accessvalue[12].value;
                        this.acl[this.selected]["log"]           = this.accessvalue[13].value;

                    } else {
                        this.ConfirmBox(xhr.responseText, true);
                    }

                } else if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                    this.ConfirmBox("Server is unavailable.", true);
            };
            xhr.open("POST", "acl/save&username=" + this.selected, true);
            xhr.send(payload);
        };

        const xhr = new XMLHttpRequest();
        xhr.onreadystatechange = () => {
            if (xhr.readyState == 4 && xhr.status == 200) {
                let json = JSON.parse(xhr.responseText);
                if (!Array.isArray(json)) return;

                this.acl = {};

                for (let i = 0; i < json.length; i++) {
                    this.AddUser(userslist, json[i].user);

                    let split = json[i].access.split(",");
                    this.acl[json[i].user] = {};

                    for (let j = 0; j < split.length; j++) {
                        let s = split[j].split(":");
                        if (s.length !== 2) continue;
                        let name = s[0];
                        let value = parseInt(s[1]);
                        this.acl[json[i].user][name] = value;
                    }
                }
            }
        };

        xhr.open("GET", "acl/get", true);
        xhr.send();
    }

    AddAccessCategory(parent, icon, name, higheraccess, enable = true) {
        const container = document.createElement("div");
        container.className = "clients-accessitem";

        const divIcon = document.createElement("div");
        divIcon.style.backgroundImage = `url(${icon})`;
        container.appendChild(divIcon);

        const divLabel = document.createElement("div");
        divLabel.innerHTML = name;
        container.appendChild(divLabel);

        const rngAccess = document.createElement("input");
        rngAccess.type = "range";
        rngAccess.min = 0;
        rngAccess.max = higheraccess;
        rngAccess.value = higheraccess;
        if (!enable) rngAccess.setAttribute("disabled", true);
        container.appendChild(rngAccess);

        const lblAccess = document.createElement("div");
        container.appendChild(lblAccess);

        rngAccess.oninput = rngAccess.onchange = event => {
            if (rngAccess.value == 0)
                lblAccess.innerHTML = "Deny";

            else if (rngAccess.value == 1)
                lblAccess.innerHTML = higheraccess == 1 ? "Allow" : "Read only";

            else
                lblAccess.innerHTML = "Full access";
        };

        rngAccess.onchange();

        parent.appendChild(container);

        return rngAccess;
    }

    AddUser(parent, username) {
        const user = document.createElement("div");
        user.className = "clients-useritem";
        parent.appendChild(user);

        const lblUsername = document.createElement("div");
        lblUsername.innerHTML = username;
        user.appendChild(lblUsername);

        const btnDelete = document.createElement("div");
        user.appendChild(btnDelete);

        user.onclick = () => {
            this.selected = username;

            for (let i = 0; i < parent.childNodes.length; i++)
                parent.childNodes[i].style.backgroundColor = "";            

            user.style.backgroundColor = "var(--select-color)";

            for (let i = 0; i < this.accessvalue.length; i++) {
                this.accessvalue[i].removeAttribute("disabled");
                this.accessvalue[i].value = 0;
            }

            if (this.acl[username]) 
                for (var p in this.acl[username]) {
                    switch (p) {
                        case "database"      : this.accessvalue[0].value  = this.acl[username][p]; break;
                        case "password"      : this.accessvalue[1].value  = this.acl[username][p]; break;
                        case "remoteagent"   : this.accessvalue[2].value  = this.acl[username][p]; break;
                        case "remotehosts"   : this.accessvalue[3].value  = this.acl[username][p]; break;
                        case "domainusers"   : this.accessvalue[4].value  = this.acl[username][p]; break;
                        case "documentation" : this.accessvalue[5].value  = this.acl[username][p]; break;
                        case "debitnotes"    : this.accessvalue[6].value  = this.acl[username][p]; break;
                        case "watchdog"      : this.accessvalue[7].value  = this.acl[username][p]; break;
                        case "scripts"       : this.accessvalue[8].value  = this.acl[username][p]; break;
                        case "wmi"           : this.accessvalue[9].value  = this.acl[username][p]; break;
                        case "telnet"        : this.accessvalue[10].value = this.acl[username][p]; break;
                        case "backup"        : this.accessvalue[11].value = this.acl[username][p]; break;
                        case "manageusers"   : this.accessvalue[12].value = this.acl[username][p]; break;
                        case "log"           : this.accessvalue[13].value = this.acl[username][p]; break;
                    }
                }
        };

        btnDelete.onclick = event => {
            event.stopPropagation();

            this.ConfirmBox("Are you sure you want to delete this access control?").addEventListener("click", () => {
                const xhr = new XMLHttpRequest();
                xhr.onreadystatechange = () => {
                    if (xhr.readyState == 4 && xhr.status == 200) {
                        if (xhr.responseText == "ok")
                            parent.removeChild(user);
                        else
                            this.ConfirmBox(xhr.responseText, true);

                    } else if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                        this.ConfirmBox("Server is unavailable.", true);
                };
                xhr.open("GET", "acl/delete&username=" + this.selected, true);
                xhr.send();
            });
        };
    }

}
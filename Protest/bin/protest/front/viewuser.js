const USER_ORDER = [
    "TITLE", "DEPARTMENT", "DIVISION", "COMPANY",

    ["res/user.svgz", "General"],
    "FIRST NAME", "MIDDLE NAME", "LAST NAME", "DISPLAY NAME", "EMPLOYEE ID",

    ["res/credencial.svgz", "Authentication"],
    "DOMAIN", "USERNAME", "PASSWORD",

    ["res/contact.svgz", "Contact Information"],
    "E-MAIL", "SECONDARY E-MAIL", "TELEPHONE NUMBER", "MOBILE NUMBER", "MOBILE EXTENTION", "FAX",

    ["res/sim.svgz", "SIM Information"],
    "SIM", "PUK", "VOICEMAIL"
];

class User extends Window {
    constructor(filename) {
        super([56,56,56]);

        this.args = filename;

        this.AddCssDependencies("dbview.css");

        if (this.args === null) {
            this.New();
            return;
        }

        this.setTitle("User");
        this.setIcon("res/user.svgz");
        
        this.entry = db_users.find(e => e[".FILENAME"][0] === filename);
        this.filename = filename;

        if (!this.entry) {
            this.btnPopout.style.visibility = "hidden";
            this.ConfirmBox("User do not exist.", true).addEventListener("click", () => this.Close());
            this.AfterResize = () => {};
            return;
        }

        if (this.entry["TITLE"] == undefined || this.entry["TITLE"][0].length === 0)
            this.setTitle("[untitled]");
        else
            this.setTitle(this.entry["TITLE"][0]);

        this.InitializeComponent();
        this.Plot();
        this.LiveInfo();
        setTimeout(() => { this.AfterResize(); }, 400);
    }

    InitializeComponent() {
        this.content.style.overflowY = "auto";

        this.buttons = document.createElement("div");
        this.buttons.className = "db-buttons";
        this.content.appendChild(this.buttons);

        const btnEdit = document.createElement("input");
        btnEdit.type = "button";
        btnEdit.value = "Edit";
        this.buttons.appendChild(btnEdit);
        btnEdit.onclick = () => this.Edit();

        const btnFetch = document.createElement("input");
        btnFetch.type = "button";
        btnFetch.value = "Fetch";
        this.buttons.appendChild(btnFetch);
        btnFetch.onclick = () => this.Fetch();

        const btnDelete = document.createElement("input");
        btnDelete.type = "button";
        btnDelete.value = "Delete";
        this.buttons.appendChild(btnDelete);
        btnDelete.onclick = () => this.Delete();

        this.sidetools = document.createElement("div");
        this.sidetools.className = "db-sidetools";
        this.content.appendChild(this.sidetools);

        this.scroll = document.createElement("div");
        this.scroll.className = "db-scroll";
        this.content.appendChild(this.scroll);

        /*const fade = document.createElement("div");
        fade.style.position = "sticky";
        fade.style.top = "0";
        fade.style.height = "16px";
        fade.style.background = "linear-gradient(rgb(56, 56, 56), transparent)";
        this.scroll.appendChild(fade);*/

        this.live = document.createElement("div");
        this.live.className = "db-live";
        this.scroll.appendChild(this.live);

        this.liveinfo = document.createElement("div");
        this.liveinfo.className = "db-liveinfo";
        this.scroll.appendChild(this.liveinfo);

        this.properties = document.createElement("div");
        this.properties.className = "db-proberties";
        this.scroll.appendChild(this.properties);

        this.rightside = document.createElement("div");
        this.rightside.className = "db-rightside";
        this.content.appendChild(this.rightside);
    }

    AfterResize() { //override
        if (this.content.getBoundingClientRect().width < 800) {
            this.sidetools.style.width = "36px";
            this.scroll.style.left = "56px";
            this.buttons.style.left = "56px";
        } else {
            this.sidetools.style.width = "";
            this.scroll.style.left = "";
            this.buttons.style.left = "";
        }

        if (this.content.getBoundingClientRect().width > 1440) {
            if (this.rightside.style.display === "block") return;
            this.rightside.style.display = "block";
            this.rightside.classList.add("db-rightside");

            this.rightside.appendChild(this.live);
            this.rightside.appendChild(this.liveinfo);
        } else {
            if (this.rightside.style.display === "none") return;
            this.rightside.style.display = "none";
            this.rightside.classList.remove("db-rightside");

            this.scroll.appendChild(this.live);
            this.scroll.appendChild(this.liveinfo);
            this.scroll.appendChild(this.properties);
        }
    } 

    Plot() {
        let done = [];
        this.properties.innerHTML = "";

        for (let i = 0; i < USER_ORDER.length; i++)
            if (Array.isArray(USER_ORDER[i])) {
                this.AddGroup(USER_ORDER[i][0], USER_ORDER[i][1]);
            } else {
                if (!this.entry.hasOwnProperty(USER_ORDER[i])) continue;
                const newProperty = this.AddProperty(USER_ORDER[i], this.entry[USER_ORDER[i]][0], this.entry[USER_ORDER[i]][1]);
                if (done != null) done.push(USER_ORDER[i]);
                this.properties.appendChild(newProperty);
            }

        this.AddGroup("res/other.svgz", "Other");
        let isGroupEmpty = true;
        for (let k in this.entry)
            if (!done.includes(k, 0) && !k.startsWith(".")) {
                if (!this.entry.hasOwnProperty(k)) continue;
                const newProperty = this.AddProperty(k, this.entry[k][0], this.entry[k][1]);
                if (done != null) done.push(k);
                this.properties.appendChild(newProperty);

                isGroupEmpty = false;
            }

        if (isGroupEmpty && this.properties.childNodes[this.properties.childNodes.length - 1].className == "db-property-group")
            this.properties.removeChild(this.properties.childNodes[this.properties.childNodes.length - 1]);

        this.btnUnlock = this.SideButton("res/unlock.svgz", "Unlock");
        this.sidetools.appendChild(this.btnUnlock);
        this.btnUnlock.onclick = () => {
            if (this.btnUnlock.hasAttribute("busy")) return;
            let xhr = new XMLHttpRequest();
            xhr.onreadystatechange = () => {
                if (xhr.readyState == 4) this.btnUnlock.removeAttribute("busy");

                if (xhr.readyState == 4 && xhr.status == 200 && xhr.responseText == "ok")
                    this.btnUnlock.style.backgroundColor = "";
                else if (xhr.readyState == 4 && xhr.status == 200)
                    this.ConfirmBox(xhr.responseText, true);    

                if (xhr.readyState == 4 && xhr.status == 0) this.ConfirmBox("Server is unavailable.", true);
            };
            this.btnUnlock.setAttribute("busy", true);
            xhr.open("GET", "unlockuser&file=" + this.filename, true);
            xhr.send();
        };

        const btnEnable = this.SideButton("res/enable.svgz", "Enable");
        this.sidetools.appendChild(btnEnable);
        btnEnable.onclick = () => {
            if (btnEnable.hasAttribute("busy")) return;
            let xhr = new XMLHttpRequest();
            xhr.onreadystatechange = () => {
                if (xhr.readyState == 4) btnEnable.removeAttribute("busy");
                if (xhr.readyState == 4 && xhr.status == 200 && xhr.responseText != "ok") this.ConfirmBox(xhr.responseText, true);
                if (xhr.readyState == 4 && xhr.status == 0) this.ConfirmBox("Server is unavailable.", true);
            };
            btnEnable.setAttribute("busy", true);
            xhr.open("GET", "enableuser&file=" + this.filename, true);
            xhr.send();
        };

        const btnDisable = this.SideButton("res/disable.svgz", "Disable");
        this.sidetools.appendChild(btnDisable);
        btnDisable.onclick = () => {
            if (btnDisable.hasAttribute("busy")) return;
            let xhr = new XMLHttpRequest();
            xhr.onreadystatechange = () => {
                if (xhr.readyState == 4) btnDisable.removeAttribute("busy");
                if (xhr.readyState == 4 && xhr.status == 200 && xhr.responseText != "ok") this.ConfirmBox(xhr.responseText, true);
                if (xhr.readyState == 4 && xhr.status == 0) this.ConfirmBox("Server is unavailable.", true);
            };
            btnDisable.setAttribute("busy", true);
            xhr.open("GET", "disableuser&file=" + this.filename, true);
            xhr.send();
        };


        if (this.entry.hasOwnProperty("E-MAIL"))
            this.LiveButton("res/email.svgz", "E-mail").div.onclick = () => {
                window.location.href = "mailto:" + this.entry["E-MAIL"][0];
            };

        if (this.entry.hasOwnProperty("TELEPHONE NUMBER"))
            this.LiveButton("res/phone.svgz", "Telephone").div.onclick = () => {
                window.location.href = "tel:" + this.entry["TELEPHONE NUMBER"][0];
            };       

        if (this.entry.hasOwnProperty("MOBILE NUMBER"))
            this.LiveButton("res/mobilephone.svgz", "Mobile phone").div.onclick = () => {
                window.location.href = "tel:" + this.entry["MOBILE NUMBER"][0];
            };

    }

    LiveInfo() {
        if (!this.entry.hasOwnProperty("USERNAME")) return;

        this.liveinfo.innerHTML = "";

        let server = window.location.href;
        server = server.replace("https://", "");
        server = server.replace("http://", "");
        if (server.indexOf("/") > 0) server = server.substring(0, server.indexOf("/"));

        const ws = new WebSocket((isSecure ? "wss://" : "ws://") + server + "/ws/liveinfo_user");

        ws.onopen = () => { ws.send(this.filename); };

        ws.onmessage = (event) => {
            let split = event.data.split(String.fromCharCode(127));

            if (split[0].startsWith(".")) return; //hidden property

            if (split[0] == "LOCKOUT TIME") {
                if (split[1] == "0") return;
                this.btnUnlock.backgroundColor = "red";
            }

            const newProperty = this.AddProperty(split[0], split[1], split[2]);
            this.liveinfo.appendChild(newProperty);
        };
    }

    LiveButton(icon, label) {
        const div = document.createElement("div");
        div.innerHTML = label;
        div.style.backgroundImage = `url(${icon})`;
        this.live.appendChild(div);

        const sub = document.createElement("div");
        sub.style.fontSize = "smaller";
        sub.style.height = "14px";
        sub.innerHTML = "&nbsp;";
        div.appendChild(sub);

        return {
            div: div,
            sub: sub
        };
    }

    SideButton(icon, label) {
        const button = document.createElement("div");

        const divLabel = document.createElement("div");
        divLabel.style.backgroundImage = "url(" + icon + ")";
        divLabel.innerHTML = label;
        button.appendChild(divLabel);

        return button;
    }

    AddGroup(icon, title) {
        const newGroup = document.createElement("div");
        newGroup.className = "db-property-group";

        const ico = document.createElement("div");
        if (icon.length > 0) ico.style.backgroundImage = "url(" + icon + ")";
        newGroup.appendChild(ico);

        const label = document.createElement("div");
        label.innerHTML = title;
        newGroup.appendChild(label);

        if (this.properties.childNodes.length > 0)
            if (this.properties.childNodes[this.properties.childNodes.length - 1].className == "db-property-group")
                this.properties.removeChild(this.properties.childNodes[this.properties.childNodes.length - 1]);

        this.properties.appendChild(newGroup);
    }

    AddProperty(n, v, m) {
        const newProperty = document.createElement("div");
        newProperty.className = "db-property";

        const label = document.createElement("div");
        label.innerHTML = n.toUpperCase();
        newProperty.appendChild(label);

        if (n.includes("PASSWORD")) { //password
            const value = document.createElement("div");
            newProperty.appendChild(value);

            const preview = document.createElement("span");
            value.appendChild(preview);

            const countdown = document.createElement("span");
            countdown.className = "password-countdown";
            countdown.style.display = "none";
            value.appendChild(countdown);

            const cd_left = document.createElement("div");
            cd_left.appendChild(document.createElement("div"));
            countdown.appendChild(cd_left);

            const cd_right = document.createElement("div");
            cd_right.appendChild(document.createElement("div"));
            countdown.appendChild(cd_right);

            const btnShow = document.createElement("input");
            btnShow.type = "button";
            btnShow.value = "Show";
            value.appendChild(btnShow);

            const btnStamp = document.createElement("input");
            btnStamp.type = "button";
            btnStamp.value = " ";
            btnStamp.style.minWidth = "40px";
            btnStamp.style.height = "32px";
            btnStamp.style.backgroundImage = "url(res/l_stamp.svg)";
            btnStamp.style.backgroundSize = "28px 28px";
            btnStamp.style.backgroundPosition = "center";
            btnStamp.style.backgroundRepeat = "no-repeat";
            value.appendChild(btnStamp);

            btnShow.onclick = () => {
                const xhr = new XMLHttpRequest();
                xhr.onreadystatechange = () => {
                    if (xhr.readyState == 4 && xhr.status == 200) { //OK
                        preview.innerHTML = xhr.responseText;
                        countdown.style.display = "inline-block";
                        btnShow.style.display = "none";

                        setTimeout(() => {
                            if (!this.isClosed) {
                                preview.innerHTML = "";
                                countdown.style.display = "none";
                                btnShow.style.display = "inline-block";
                            }
                        }, 20000);

                    } else if (xhr.readyState == 4 && xhr.status == 0) { //disconnected
                        this.ConfirmBox("Server is unavailable.", true);
                        value.innerHTML = "";
                        value.appendChild(btnShow);
                    }
                };

                xhr.open("GET", "getuserprop&file=" + this.filename + "&property=" + n, true);
                xhr.send();
            };

            btnStamp.onclick = () => {
                let xhr = new XMLHttpRequest();
                xhr.onreadystatechange = () => {
                    if (xhr.readyState == 4 && xhr.status == 200) { //OK                       
                        if (xhr.responseText != "ok")
                            this.ConfirmBox(xhr.responseText, true);
                    } else if (xhr.readyState == 4 && xhr.status == 0)  //disconnected
                        this.ConfirmBox("Server is unavailable.", true);
                };

                xhr.open("GET", "ra&stpu&" + this.filename + ":" + n, true);
                xhr.send();
            };

        } else if (v.includes(";")) {
            const value = document.createElement("div");

            let values = v.split(";");
            for (let i = 0; i < values.length; i++) {
                if (values[i].trim().length == 0) continue;
                const subvalue = document.createElement("div");
                subvalue.innerHTML = values[i] + "&thinsp;";
                value.appendChild(subvalue);
            }

            newProperty.appendChild(value);

        } else if (v.startsWith("bar:")) { //bar
            const value = document.createElement("div");

            let split = v.split(":");
            for (let i = 1; i < split.length - 3; i += 4) {
                let used = parseFloat(split[i+1]);
                let size = parseFloat(split[i+2]);

                const bar = document.createElement("div");
                bar.className = "db-progress-bar";

                const caption = document.createElement("div");
                caption.innerHTML = split[i] + "&thinsp;";

                const progress = document.createElement("div");
                progress.style.boxShadow = "rgb(64,64,64) " + 100 * used / size + "px 0 0 inset";

                const text = document.createElement("div");
                text.innerHTML = "&thinsp;" + split[i+1] + "/" + split[i+2] + " " + split[i+3];

                bar.appendChild(caption);
                bar.appendChild(progress);
                bar.appendChild(text);
                value.appendChild(bar);
            }

            newProperty.appendChild(value);

        } else {
            const value = document.createElement("div");

            const subvalue = document.createElement("div");
            subvalue.innerHTML = `${v}&nbsp;`;
            value.appendChild(subvalue);

            newProperty.appendChild(value);
        }

        if (m.length > 0) {
            const comme = document.createElement("div");
            comme.innerHTML = m;
            newProperty.appendChild(comme);
        }

        return newProperty;
    }

    EditProperty(name, value, readonly, container) {
        const newProperty = document.createElement("div");
        newProperty.className = "db-edit-property";
        container.appendChild(newProperty);

        const txtName = document.createElement("input");
        txtName.type = "text";
        txtName.value = name.toUpperCase();
        txtName.setAttribute("list", "ur_autofill");
        if (readonly) txtName.setAttribute("readonly", true);
        newProperty.appendChild(txtName);

        const txtValue = document.createElement("input");
        txtValue.type = "text";
        txtValue.value = (name == "") ? "" : value;
        if (readonly) txtValue.setAttribute("readonly", true);
        newProperty.appendChild(txtValue);

        let remove = document.createElement("div");
        if (!readonly) newProperty.appendChild(remove);
        remove.onclick = () => {
            if (newProperty.style.filter == "opacity(0)") return; //once
            newProperty.style.filter = "opacity(0)";
            newProperty.style.height = "0";

            for (let i = 0; i < newProperty.childNodes.length; i++) {
                newProperty.childNodes[i].style.height = "0";
                newProperty.childNodes[i].style.margin = "0";
                newProperty.childNodes[i].style.padding = "0";
            }

            setTimeout(() => {
                container.removeChild(newProperty);
            }, 150);
        };

        return {
            name: txtName,
            value: txtValue,
        };
    }

    New() {
        this.InitializeComponent();

        this.btnPopout.style.display = "none";

        this.setTitle("New user");
        this.setIcon("res/new_user.svgz");

        this.entry = {
            "TITLE": ["", ""],
            "DEPARTMENT": ["", ""],
            "FIRST NAME": ["", ""],
            "LAST NAME": ["", ""],
            "USERNAME": ["", ""],
            "E-MAIL": ["", ""],
            "TELEPHONE NUMBER": ["", ""],
            "MOBILE NUMBER": ["", ""]
        };

        const dialog = this.Edit();
        const btnOK = dialog.btnOK;
        const btnCancel = dialog.btnCancel;

        const btnFetch = document.createElement("div");
        btnFetch.setAttribute("tip-below", "Fetch");
        btnFetch.style.position = "absolute";
        btnFetch.style.left = "0px";
        btnFetch.style.top = "32px";
        btnFetch.style.width = "56px";
        btnFetch.style.height = "56px";
        btnFetch.style.paddingLeft = "4px";
        btnFetch.style.borderRadius = "0 8px 8px 0";
        btnFetch.style.backgroundColor = "rgb(208,208,208)";
        btnFetch.style.backgroundImage = "url(res/fetch.svgz)";
        btnFetch.style.backgroundPosition = "center";
        btnFetch.style.backgroundSize = "48px 48px";
        btnFetch.style.backgroundRepeat = "no-repeat";
        btnFetch.style.boxShadow = "rgba(0,0,0,.4) 0 0 8px";
        btnFetch.style.transition = ".2s";
        dialog.innerBox.parentNode.parentNode.appendChild(btnFetch);

        const divFetch = document.createElement("div");
        divFetch.style.position = "absolute";
        divFetch.style.visibility = "hidden";
        divFetch.style.left = "30%";
        divFetch.style.top = "28px";
        divFetch.style.width = "40%";
        divFetch.style.maxWidth = "400px";
        divFetch.style.minWidth = "220px";
        divFetch.style.borderRadius = "8px";
        divFetch.style.boxShadow = "rgba(0,0,0,.4) 0 0 8px";
        divFetch.style.backgroundColor = "rgb(208,208,208)";
        divFetch.style.padding = "16px 8px";
        divFetch.style.overflow = "hidden";
        divFetch.style.textAlign = "center";
        dialog.innerBox.parentElement.parentElement.appendChild(divFetch);

        const txtuser = document.createElement("input");
        txtuser.type = "text";
        txtuser.placeholder = "Username";
        divFetch.appendChild(txtuser);

        divFetch.appendChild(document.createElement("br"));
        divFetch.appendChild(document.createElement("br"));

        const btnFetchOk = document.createElement("input");
        btnFetchOk.type = "button";
        btnFetchOk.value = "Fetch";
        divFetch.appendChild(btnFetchOk);

        const btnFetchCancel = document.createElement("input");
        btnFetchCancel.type = "button";
        btnFetchCancel.value = "Cancel";
        divFetch.appendChild(btnFetchCancel);

        let fetchToogle = false;
        btnFetch.onclick = () => {
            dialog.innerBox.parentElement.style.transition = ".2s";
            dialog.innerBox.parentElement.style.transform = fetchToogle ? "none" : "translateY(-25%)";
            dialog.innerBox.parentElement.style.filter = fetchToogle ? "none" : "opacity(0)";
            dialog.innerBox.parentElement.style.visibility = fetchToogle ? "visible" : "hidden";

            divFetch.style.transition = ".2s";
            divFetch.style.filter = fetchToogle ? "opacity(0)" : "none";
            divFetch.style.transform = fetchToogle ? "translateY(-25%)" : "none";
            divFetch.style.visibility = fetchToogle ? "hidden" : "visible";

            btnFetch.style.backgroundImage = fetchToogle ? "url(res/fetch.svgz)" : "url(res/close.svgz)";
            btnFetch.setAttribute("tip-below", fetchToogle ? "Fetch" : "Cancel");

            fetchToogle = !fetchToogle;
        };

        btnFetchCancel.onclick = () => { btnFetch.onclick(); };

        btnFetchOk.onclick = () => {
            if (txtuser.value.length == 0) return;

            btnFetch.style.filter = "opacity(0)";
            btnFetch.style.visibility = "hidden";
            divFetch.style.filter = "opacity(0)";
            divFetch.style.transform = "translateY(-25%)";
            divFetch.style.visibility = "hidden";

            const waitbox = document.createElement("span");
            waitbox.className = "waitbox";
            waitbox.style.top = "0";
            dialog.innerBox.parentElement.parentElement.appendChild(waitbox);

            waitbox.appendChild(document.createElement("div"));

            const waitLabel = document.createElement("span");
            waitLabel.innerHTML = "Doing stuff. Please wait.";
            waitLabel.className = "wait-label";
            waitLabel.style.top = "0";
            dialog.innerBox.parentElement.parentElement.appendChild(waitLabel);

            const xhr = new XMLHttpRequest();
            xhr.onreadystatechange = () => {
                if (xhr.readyState == 4 && xhr.status == 200) { //OK
                    dialog.innerBox.innerHTML = "";

                    let split = xhr.responseText.split(String.fromCharCode(127));
                    for (let i = 0; i < split.length - 1; i += 3)
                        this.EditProperty(split[i], split[i + 1], false, dialog.innerBox);

                    btnFetch.onclick();
                    dialog.innerBox.parentElement.parentElement.removeChild(waitbox);
                    dialog.innerBox.parentElement.parentElement.removeChild(waitLabel);
                }

                if (xhr.readyState == 4 && xhr.status == 0) {//disconnected
                    dialog.Abort();
                    this.ConfirmBox("Server is unavailable.", true);
                }
            };

            xhr.open("GET", "fetchuser&username=" + txtuser.value, true);
            xhr.send();
        };

        txtuser.onkeyup = event => {
            if (event.keyCode == 13) //enter
                btnFetchOk.onclick();
        };

        btnOK.addEventListener("click", () => {
            this.Plot();
            this.LiveInfo();
        });

        btnCancel.addEventListener("click", () => {
            this.Close();
        });
    }

    Edit() {
        const dialog = this.DialogBox("100%");
        const innerBox = dialog.innerBox;
        const buttonBox = dialog.buttonBox;
        const btnOK = dialog.btnOK;

        innerBox.style.overflowY = "auto";
        innerBox.style.padding = "8px";
        btnOK.value = "Save";

        const autofill = document.createElement("datalist"); //autofill
        autofill.id = "ur_autofill";
        innerBox.appendChild(autofill);
        for (let i = 0; i < USER_ORDER.length; i++) {
            if (Array.isArray(USER_ORDER[i])) continue;
            const opt = document.createElement("option");
            opt.value = USER_ORDER[i];
            autofill.appendChild(opt);
        }

        for (let i = 0; i < USER_ORDER.length; i++)
            if (!Array.isArray(USER_ORDER[i])) {
                if (this.entry[USER_ORDER[i]] == undefined) continue;
                this.EditProperty(USER_ORDER[i], this.entry[USER_ORDER[i]][0], false, innerBox);
            }

        for (let k in this.entry)
            if (!USER_ORDER.includes(k, 0)) {
                if (this.entry[k] == undefined && k != "") continue;
                this.EditProperty(k, this.entry[k][0], (k == ".FILENAME"), innerBox);
            }

        const btnAdd = document.createElement("input");
        btnAdd.type = "button";
        btnAdd.value = "Add";
        btnAdd.style.position = "absolute";
        btnAdd.style.left = "0px";
        buttonBox.appendChild(btnAdd);

        btnAdd.onclick = () => {
            let property = this.EditProperty("", "", false, innerBox);
            property.name.focus();
        };

        btnOK.addEventListener("click", () => {
            let properties = innerBox.querySelectorAll(".db-edit-property");

            let payload = "";
            for (let i = 0; i < properties.length; i++) {
                let c = properties[i].childNodes;
                payload += `${c[0].value}${String.fromCharCode(127)}${c[1].value}${String.fromCharCode(127)}`;
            }

            const xhr = new XMLHttpRequest();
            xhr.onreadystatechange = () => {
                if (xhr.readyState == 4 && xhr.status == 0) this.ConfirmBox("Server is unavailable.", true);

                if (xhr.readyState == 4 && xhr.status == 200) {

                    if (xhr.responseText.startsWith("{")) {
                        let json = JSON.parse(xhr.responseText);
                        //this.Update(json.obj);

                        let filename = json.obj[".FILENAME"][0];
                        this.filename = filename;
                        this.args = filename;

                    } else {
                        this.ConfirmBox(xhr.responseText, true);
                    }
                }
            };

            if (this.filename)
                xhr.open("POST", "saveuser&" + this.filename, true);
            else 
                xhr.open("POST", "saveuser", true);

            xhr.send(payload);
        });

        return dialog;
    }

    Fetch() {
        const dialog = this.Edit();
        const innerBox = dialog.innerBox;
        const buttonBox = dialog.buttonBox;
        const btnOK = dialog.btnOK;
        const btnCancel = dialog.btnCancel;

        innerBox.parentNode.style.display = "none";
        innerBox.innerHTML = "";

        let waitbox = document.createElement("span");
        waitbox.className = "waitbox";
        waitbox.style.top = "0";
        innerBox.parentNode.parentNode.appendChild(waitbox);

        waitbox.appendChild(document.createElement("div"));

        let waitLabel = document.createElement("span");
        waitLabel.innerHTML = "Doing stuff. Please wait.";
        waitLabel.className = "wait-label";
        waitLabel.style.top = "0";
        innerBox.parentNode.parentNode.appendChild(waitLabel);

        const xhr = new XMLHttpRequest();
        xhr.onreadystatechange = () => {
            if (xhr.readyState == 4) {
                if (xhr.status == 0) {
                    dialog.Abort();
                    this.ConfirmBox("Server is unavailable.", true);
                    return;
                }

                if (xhr.status == 200) {
                    let split = xhr.responseText.split(String.fromCharCode(127));
                    if (split.length == 1) {
                        dialog.Abort();
                        this.ConfirmBox(xhr.responseText, true);
                        return;
                    }

                    let names = new Set(Object.keys(this.entry));
                    for (let i=0; i < split.length-1; i+=3) {
                        const entry = this.EditProperty(split[i], split[i+1], false, innerBox);
                        entry.value.style.paddingRight = "24px";

                        if (names.has(split[i])) { //exists
                            if (this.entry[split[i]][0].toLowerCase() == split[i+1].toLowerCase()) { //same
                                entry.value.style.backgroundImage = "url(res/check.svgz)";
                            } else { //modified
                                entry.value.style.backgroundImage = "url(res/change.svgz)";
                            }
                            names.delete(split[i]);
                        } else { //new
                            entry.value.style.backgroundImage = "url(res/newentry.svgz)";
                        }
                    }

                    for (let name of names) {
                        const entry = this.EditProperty(name, this.entry[name][0], name === ".FILENAME", innerBox);
                        //entry.value.style.paddingRight = "24px";
                    }

                    innerBox.parentNode.parentNode.removeChild(waitbox);
                    innerBox.parentNode.parentNode.removeChild(waitLabel);
                    innerBox.parentNode.style.display = "block";
                }
            }

        };
        xhr.open("GET", `fetchuser&filename=${this.filename}`, true);
        xhr.send();
    }

    Delete() {
        this.ConfirmBox("Are you sure you want to delete this entry?").addEventListener("click", () => {
            const xhr = new XMLHttpRequest();
            xhr.onreadystatechange = () => {
                if (xhr.readyState == 4 && xhr.status == 0) this.ConfirmBox("Server is unavailable.", true);

                if (xhr.readyState == 4 && xhr.status == 200)
                    if (xhr.responseText == "ok") {
                        this.Close();
                    } else {
                        this.ConfirmBox(xhr.responseText, true);
                    }
            };

            xhr.open("GET", "deluser&" + this.filename, true);
            xhr.send();
        });
    }

    Update(obj) {
        this.entry = obj;

        if (!this.entry.hasOwnProperty("TITLE") || this.entry["TITLE"][0].length == 0)
            this.setTitle("[untitled]");
        else
            this.setTitle(this.entry["TITLE"][0]);

        this.sidetools.innerHTML = "";
        this.live.innerHTML = "";
        this.Plot();
        this.LiveInfo();
    }
}
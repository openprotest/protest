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

        //this.setTitle("User");
        this.setIcon("res/user.svgz");

        this.args = filename;
        this.entry = db_users.find(e => e[".FILENAME"][0] === filename);
        this.filename = filename;

        if (!this.entry) {
            this.btnPopout.style.visibility = "hidden";
            this.ConfirmBox("User do not exist.", true).addEventListener("click", () => this.Close());
            return;
        }

        this.AddCssDependencies("dbview.css");

        if (this.entry["TITLE"] == undefined || this.entry["TITLE"][0].length === 0)
            this.setTitle("[untitled]");
        else
            this.setTitle(this.entry["TITLE"][0]);

        this.content.style.overflowY = "auto";

        this.buttons = document.createElement("div");
        this.buttons.className = "db-buttons";
        this.content.appendChild(this.buttons);

        const btnEdit = document.createElement("input");
        btnEdit.type = "button";
        btnEdit.value = "Edit";
        this.buttons.appendChild(btnEdit);

        const btnFetch = document.createElement("input");
        btnFetch.type = "button";
        btnFetch.value = "Fetch";
        this.buttons.appendChild(btnFetch);

        const btnDelete = document.createElement("input");
        btnDelete.type = "button";
        btnDelete.value = "Delete";
        this.buttons.appendChild(btnDelete);

        this.sidetools = document.createElement("div");
        this.sidetools.className = "db-sidetools";
        this.content.appendChild(this.sidetools);

        this.scroll = document.createElement("div");
        this.scroll.className = "db-scroll";
        this.content.appendChild(this.scroll);

        this.live = document.createElement("div");
        this.live.className = "db-live";
        this.scroll.appendChild(this.live);

        this.properties = document.createElement("div");
        this.properties.className = "db-proberties";
        this.scroll.appendChild(this.properties);

        this.InitializeComponent();
        setTimeout(() => { this.AfterResize(); }, 400);
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
    } 

    InitializeComponent() {
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

        //todo:
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
                subvalue.innerHTML = values[i] + "&thinsp;";;
                value.appendChild(subvalue);
            }

            newProperty.appendChild(value);

        } else if (v.startsWith("bar:")) { //bar
            const value = document.createElement("div");

            let split = v.split(":");
            for (let i = 1; i < split.length - 3; i += 4) {
                let used = parseFloat(split[i + 1]);
                let size = parseFloat(split[i + 2]);

                const bar = document.createElement("div");
                bar.className = "db-progress-bar";

                const caption = document.createElement("div");
                caption.innerHTML = split[i] + "&thinsp;";

                const progress = document.createElement("div");
                progress.style.boxShadow = "rgb(64,64,64) " + 100 * used / size + "px 0 0 inset";

                const text = document.createElement("div");
                text.innerHTML = "&thinsp;" + split[i + 1] + "/" + split[i + 2] + " " + split[i + 3];

                bar.appendChild(caption);
                bar.appendChild(progress);
                bar.appendChild(text);
                value.appendChild(bar);
            }

            newProperty.appendChild(value);

        } else {
            const value = document.createElement("div");
            value.innerHTML = v;
            newProperty.appendChild(value);
        }

        if (m.length > 0) {
            const comme = document.createElement("div");
            comme.innerHTML = m;
            newProperty.appendChild(comme);
        }

        return newProperty;
    }

    New() {

    }

    Edit() {

    }
}
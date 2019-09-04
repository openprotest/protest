class PasswordStrength extends Window {
    constructor() {
        if (document.head.querySelectorAll("link[href$='passwordstrength.css']").length == 0) {
            let csslink = document.createElement("link");
            csslink.rel = "stylesheet";
            csslink.href = "passwordstrength.css";
            document.head.appendChild(csslink);
        }

        super(); //super([48,72,112]);
        this.content.style.backgroundColor = "rgb(72,72,72)";

        this.setTitle("Password strength");
        this.setIcon("res/strength.svgz");

        let hat = document.createElement("div");
        hat.style.position = "absolute";
        hat.style.left = "20%";
        hat.style.top = "20%";
        hat.style.width = "60%";
        hat.style.height = "60%";
        hat.style.backgroundImage = "url(res/strength.svgz)";
        hat.style.backgroundSize = "contain";
        hat.style.backgroundRepeat = "no-repeat";
        hat.style.backgroundPosition = "center center";
        hat.style.filter = "invert(1)";
        this.content.appendChild(hat);

        this.GetEntropy();

        this.btnDownload = document.createElement("div");
        this.btnDownload.style.backgroundImage = "url(res/l_download.svgz)";
        this.btnDownload.setAttribute("tip-below", "Download");
        this.toolbox.appendChild(this.btnDownload);

        this.btnRefresh = document.createElement("div");
        this.btnRefresh.style.backgroundImage = "url(res/l_reload.svgz)";
        this.btnRefresh.setAttribute("tip-below", "Refresh");
        this.toolbox.appendChild(this.btnRefresh);

        this.lblTitle.style.left = TOOLBAR_GAP + this.toolbox.childNodes.length * 22 + "px";

        this.btnDownload.addEventListener("click", (event) => {
            const NL = String.fromCharCode(13) + String.fromCharCode(10);
            const TB = String.fromCharCode(9);

            let text = "";

            text += "ENTROPY" + TB + TB;
            text += "STRENGTH" + TB;
            text += "MAME" + NL;

            for (let i = 0; i < this.list.childNodes.length; i++) {
                let entropy  = this.list.childNodes[i].childNodes[1].innerHTML;
                let strength = this.list.childNodes[i].childNodes[3].innerHTML;

                text += entropy + ((entropy.length < 8) ? TB + TB : TB);
                text += strength + ((strength.length < 8)? TB + TB : TB);
                text += this.list.childNodes[i].childNodes[0].innerHTML + NL;
            }


            if (text.length == 0) return;

            let psudo = document.createElement("a");
            psudo.style.display = "none";
            this.win.appendChild(psudo);

            const NOW = new Date();
            psudo.setAttribute("href", "data:text/plain;charset=utf-8," + encodeURI(text));
            psudo.setAttribute("download", "password_strength_" +
                NOW.getFullYear() +
                ((NOW.getMonth() < 10) ? "0" + NOW.getMonth() : NOW.getMonth()) +
                ((NOW.getDate() < 10) ? "0" + NOW.getDate() : NOW.getDate()) + "_" +
                ((NOW.getHours() < 10) ? "0" + NOW.getHours() : NOW.getHours()) +
                ((NOW.getMinutes() < 10) ? "0" + NOW.getMinutes() : NOW.getMinutes()) +
                ((NOW.getSeconds() < 10) ? "0" + NOW.getSeconds() : NOW.getSeconds()) +
                ".txt");

            psudo.click(null);
        });

        this.btnRefresh.addEventListener("click", (event) => { this.GetEntropy(); });
    }

    GetEntropy() {
        let hat = document.createElement("div");
        hat.style.position = "absolute";
        hat.style.left = "20%";
        hat.style.top = "20%";
        hat.style.width = "60%";
        hat.style.height = "60%";
        hat.style.backgroundImage = "url(res/strength.svgz)";
        hat.style.backgroundSize = "contain";
        hat.style.backgroundRepeat = "no-repeat";
        hat.style.backgroundPosition = "center center";
        hat.style.filter = "invert(1)";
        this.content.appendChild(hat);

        let xhr = new XMLHttpRequest();
        xhr.onreadystatechange = () => {
            if (xhr.readyState == 4 && xhr.status == 200) { //OK
                let split = xhr.responseText.split(String.fromCharCode(127));
                let list = [];

                for (let i = 0; i < split.length - 2; i += 5) {
                    list.push({
                        type: split[i],
                        file: split[i+1],
                        name: split[i+2],
                        entropy: parseFloat(split[i+3]),
                        date: split[i+4]
                    });
                }

                this.Display(list);
            }

            if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                this.ConfirmBox("Server is unavailable.", true);

            if (xhr.readyState == 4) this.win.style.cursor = "inherit";
        };

        this.win.style.cursor = "progress";

        xhr.open("GET", "getentropy", true);
        xhr.send();
    }

    Display(list) {
        this.content.innerHTML = "";

        this.list = document.createElement("div");
        this.list.style.backgroundColor = "rgb(56,56,56)";
        this.list.style.overflowY = "scroll";
        this.list.style.position = "absolute";
        this.list.style.left = "0";
        this.list.style.right = "0";
        this.list.style.top = "24px";
        this.list.style.bottom = "0";
        this.content.appendChild(this.list);

        let sortBar = document.createElement("div");
        sortBar.className = "gandalf-item titleBar";
        sortBar.style.overflow = "hidden";
        this.content.appendChild(sortBar);

        let ttlName = document.createElement("div");
        ttlName.innerHTML = "Name";
        sortBar.appendChild(ttlName);

        let ttlEntropy = document.createElement("div");
        ttlEntropy.innerHTML = "Entropy";
        sortBar.appendChild(ttlEntropy);

        let ttlVisual = document.createElement("div");
        ttlVisual.style.visibility = "hidden";
        sortBar.appendChild(ttlVisual);

        let ttlComment = document.createElement("div");
        ttlComment.innerHTML = "Strength";
        sortBar.appendChild(ttlComment);

        let ttlModified = document.createElement("div");
        ttlModified.innerHTML = "Modified date";
        sortBar.appendChild(ttlModified);

        const plot = () => {
            for (let i = 0; i < list.length; i++) {
                let entropy = list[i].entropy;

                let strength = StrengthBar(entropy);
                let color = strength[0];
                let fill = strength[1];
                let comment = strength[2];

                let item = document.createElement("div");
                item.className = "gandalf-item";
                this.list.appendChild(item);

                let lblName = document.createElement("div");
                lblName.innerHTML = list[i].name;
                lblName.style.backgroundImage = (list[i].type == "e") ? "url(res/l_gear.svgz)" : "url(res/l_user.svgz)";
                item.appendChild(lblName);

                let lblEntropy = document.createElement("div");
                lblEntropy.innerHTML = list[i].entropy + "-bits";
                item.appendChild(lblEntropy);

                let divStrength = document.createElement("div");
                divStrength.style.boxShadow = color + " " + fill + "px 0 0 inset";
                divStrength.style.marginBottom = "3px";
                item.appendChild(divStrength);

                let lblComment = document.createElement("div");
                lblComment.innerHTML = comment;
                item.appendChild(lblComment);

                let lblModified = document.createElement("div");
                lblModified.innerHTML = list[i].date;
                item.appendChild(lblModified);

                item.ondblclick = () => {
                    if (list[i].type == "e") { //equip
                        for (let j = 0; j < db_equip.length; j++)
                            if (db_equip[j][".FILENAME"][0] == list[i].file) {
                                for (let k = 0; k < w_array.length; k++)
                                    if (w_array[k] instanceof Equip && w_array[k].filename == db_equip[j][".FILENAME"][0]) {
                                        w_array[k].Minimize(); //minimize/restore
                                        return;
                                    }
                                new Equip(db_equip[j]);
                                return;
                            }

                    } else if (list[i].type == "u") { //user
                        for (let j = 0; j < db_users.length; j++)
                            if (db_users[j][".FILENAME"][0] == list[i].file) {
                                for (let k = 0; k < w_array.length; k++)
                                    if (w_array[k] instanceof User && w_array[k].filename == db_users[j][".FILENAME"][0]) {
                                        w_array[k].Minimize(); //minimize/restore
                                        return;
                                    }
                                new User(db_users[j]);
                                return;
                            }
                    }

                };
            }
        };

        plot();

        ttlName.onclick = () => {
            list.sort((a, b) => {                
                if (a.type > b.type) return -1;
                if (a.type < b.type) return 1;
                if (a.name > b.name) return 1;
                if (a.name < b.name) return -1;
                return 0;
            });
            this.list.innerHTML = "";
            plot();
        };

        ttlEntropy.onclick = ttlComment.onclick = () => {
            list.sort((a, b) => {
                if (a.type > b.type) return -1;
                if (a.type < b.type) return 1;
                if (a.entropy > b.entropy) return 1;
                if (a.entropy < b.entropy) return -1;
                return 0;
            });
            this.list.innerHTML = "";
            plot();
        };

        ttlModified.onclick = () => {
            list.sort((a, b) => {
                if (a.type > b.type) return -1;
                if (a.type < b.type) return 1;
                if (a.date > b.date) return 1;
                if (a.date < b.date) return -1;
                return 0;
            });
            this.list.innerHTML = "";
            plot();
        };

    }
}

function StrengthBar(entropy) {
    let comment = "";
    let color = "";

    if (entropy < 19) {
        comment = "Forbidden";
        color = "#f00";

    } else if (entropy < 28) {
        comment = "Very weak";
        color = "#d00";

    } else if (entropy < 36) {
        comment = "Weak";
        color = "#d70";

    } else if (entropy < 60) {
        comment = "Reasonable";
        color = "#dc0";

    } else if (entropy < 128) {
        comment = "Strong";
        color = "#8c2";

    } else {
        comment = "Overkill";
        color = "#07d";
    }

    return [color, 32 * entropy / 96, comment];
}